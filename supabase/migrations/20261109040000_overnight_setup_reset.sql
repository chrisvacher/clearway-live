begin;

-- Overnight acceptance fixes, part 3: removing a person, the practice room's reset and the overnight version note.
--
--   public.attendees removal        a lead or co-facilitator who is not an admin could not remove a person: the update that sets deleted=true is checked against
--                                   the read rule (not deleted), which hides the new row. Removal is now a security definer function, as other soft deletes are.
--   private.reset_practice_room     the newest definition (20261108040000_read_only.sql) renamed to reset_practice_room_pre_setup_reset and wrapped: the reset also puts
--                                   away every AI record (word combines, groups, memberships, summaries, grid merges, runs) and takes the applied What We Heard words
--                                   off their steps, so the next run starts from nothing.
--   private.rehearsal_control       the newest definition (20261108040000_read_only.sql) renamed to rehearsal_control_pre_setup_reset and wrapped: Clear test answers also
--                                   puts away the grid merges the AI made in the sessions the cleared answers touched.
--   private.overnight_apply         the original definition renamed to overnight_apply_pre_setup_reset and rewritten as a superset: the version note says "1 bullet", "1 scribe card"
--                                   and "1 easel photo" in the singular.

-- ---------- Removing a person ----------
create function private.remove_attendee(p_engagement uuid,p_attendee uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.attendees;
begin
 if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) then raise insufficient_privilege; end if;
 select * into a from public.attendees where id=p_attendee and engagement_id=p_engagement for update;
 if not found then return jsonb_build_object('status','missing'); end if;
 if not a.deleted then update public.attendees set deleted=true where id=a.id; end if;
 return jsonb_build_object('status','ok');
end $$;
create function public.remove_attendee(p_engagement uuid,p_attendee uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.remove_attendee(p_engagement,p_attendee) $$;
revoke all on function private.remove_attendee(uuid,uuid),public.remove_attendee(uuid,uuid) from public,anon,authenticated;
grant execute on function private.remove_attendee(uuid,uuid),public.remove_attendee(uuid,uuid) to authenticated;

-- ---------- Every AI record of the practice room ----------
-- Soft deletes only, so the history stays. A run still going is marked stale so a late answer is refused. The cost log keeps its rows.
create function private.ai_reset_room(p_engagement uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update private.ai_word_merges set deleted=true where engagement_id=p_engagement and not deleted;
 update private.ai_group_members set deleted=true where engagement_id=p_engagement and not deleted;
 update private.ai_groups set deleted=true where engagement_id=p_engagement and not deleted;
 update private.ai_summaries set deleted=true where engagement_id=p_engagement and not deleted;
 update private.grid_merges set deleted=true where engagement_id=p_engagement and not deleted;
 update private.ai_runs set deleted=true,status=case when status='running' then 'stale' else status end where engagement_id=p_engagement and session_id is not null and not deleted;
 update private.ai_sessions set summary_shown=false,lease_id=null,lease_run=null,lease_until=null,combine_seen=0,group_seen_at=null,fold_seen_at=null,
  group_seen_ids=array[]::uuid[],fold_seen_ids=array[]::uuid[],reasons_seen=0,last_ok_at=null,last_failed_at=null,last_error=null,last_ms=null where engagement_id=p_engagement;
end $$;

-- What We Heard words applied to a step go back to the template's step: no headline, no number, the source's plain name and the template's phone line.
create function private.heard_unapply(p_engagement uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.sessions s set prompt='',phone_depth='The detail under this headline.',
   options=(s.options-'number')||jsonb_build_object('source',btrim(split_part(coalesce(s.options->>'source',''),' · ',1))),
   state=case when s.state='ready' then 'draft' else s.state end
  where s.engagement_id=p_engagement and not s.deleted and s.interaction='content' and coalesce(s.options->>'screen','headline')='headline'
   and private.heard_source_key(s.options->>'source') is not null and s.state not in ('open','live','phones_down')
   and (s.prompt<>'' or s.options ? 'number' or s.options->>'source' like '% · %' or s.phone_depth<>'The detail under this headline.');
end $$;

alter function private.reset_practice_room() rename to reset_practice_room_pre_setup_reset;
alter function private.rehearsal_control(uuid,uuid,text) rename to rehearsal_control_pre_setup_reset;

create function private.reset_practice_room() returns boolean
language plpgsql security definer set search_path='' as $$
declare eng uuid:='90000000-0000-4000-8000-000000000010'::uuid; ok boolean;
begin
 ok:=private.reset_practice_room_pre_setup_reset();
 if ok then
  perform private.ai_reset_room(eng);
  perform private.heard_unapply(eng);
  update public.room_states set results=private.live_results(eng) where engagement_id=eng;
 end if;
 return ok;
end $$;

create function private.rehearsal_control(p_engagement uuid,p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb; touched uuid[]; n integer:=0; sid uuid;
begin
 if p_action='clear' and p_engagement is not null then
  select array_agg(distinct x.session_id) into touched from public.submissions x where x.engagement_id=p_engagement and x.test and not x.deleted;
 end if;
 out:=private.rehearsal_control_pre_setup_reset(p_engagement,p_id,p_action);
 if p_action='clear' and p_engagement is not null and out->>'status'='ok' and touched is not null then
  update private.grid_merges set deleted=true where engagement_id=p_engagement and session_id=any(touched) and made_by='ai' and not deleted;
  get diagnostics n=row_count;
  if n>0 then
   foreach sid in array touched loop perform private.reasons_sync(p_engagement,sid); end loop;
   update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement;
  end if;
 end if;
 return out;
end $$;

-- ---------- The overnight version note, in the singular for one ----------
-- A version of a draft is kept as written, so the note is right when it is made: step 5's private.overnight_apply, renamed and rewritten as a superset
-- (every line as it was) with the one note built by private.ov_count.
create function private.ov_count(p_n text,p_noun text) returns text
language sql immutable security invoker set search_path='' as $$
 select coalesce(nullif(p_n,''),'0')||' '||p_noun||case when coalesce(nullif(p_n,''),'0')='1' then '' else 's' end
$$;

alter function private.overnight_apply(uuid,uuid,jsonb,jsonb) rename to overnight_apply_pre_setup_reset;

create function private.overnight_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; r private.overnight_rounds; t timestamptz:=clock_timestamp(); o jsonb; b jsonb; s jsonb; did uuid; oref text; pos integer; txt text; kind text; have text[]; need text[];
 sources jsonb; rooms integer; room_row jsonb; excerpt text; refused jsonb:='[]'::jsonb; applied integer:=0; used text[]:=array[]::text[]; bid uuid; stext text; year text; seen text[];
 ref jsonb; p jsonb; v_ms integer; note_text text; nd record; in_ jsonb;
begin
 if p_run is null or p_lease is null or jsonb_typeof(p_output) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into run from private.ai_runs where id=p_run and job='overnight_draft';
 if not found then return jsonb_build_object('status','missing'); end if;
 in_:=run.inputs; v_ms:=private.ai_usage(p_usage,'ms',600000)::integer;
 select * into r from private.overnight_rounds where engagement_id=run.engagement_id and not deleted for update;
 if not found or run.status<>'running' or r.lease_id is distinct from p_lease or r.lease_run is distinct from p_run or r.lease_until<t then
  return jsonb_build_object('status','stale'); end if;
 if coalesce((select e.settings->>'ai_enabled' from public.engagements e where e.id=run.engagement_id),'false')<>'true' then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms where id=run.id;
  update private.overnight_rounds set status='ai_off',lease_id=null,lease_run=null,lease_until=null where id=r.id;
  update private.draft_outcomes set tidy='by_hand' where round_id=r.id and tidy='waiting';
  return jsonb_build_object('status','discarded');
 end if;
 year:=(in_->>'year');
 for o in select value from jsonb_array_elements(case when jsonb_typeof(p_output->'outcomes')='array' then p_output->'outcomes' else '[]'::jsonb end) loop
  oref:=o->>'outcome';
  select (x->>'id')::uuid into did from jsonb_array_elements(in_->'outcomes') x where x->>'ref'=oref;
  if did is null or oref=any(used) then continue; end if;
  used:=used||oref;
  if not exists(select 1 from private.draft_outcomes d where d.id=did and d.round_id=r.id and not d.deleted and d.tidy='waiting') then continue; end if;
  if exists(select 1 from private.draft_bullets x where x.draft_outcome_id=did and not x.deleted) then continue; end if;
  pos:=0; seen:=array[]::text[];
  for b in select value from jsonb_array_elements(case when jsonb_typeof(o->'bullets')='array' then o->'bullets' else '[]'::jsonb end) loop
   exit when pos>=12;
   txt:=btrim(regexp_replace(coalesce(b->>'text',''),'\s+',' ','g'));
   if length(txt) not between 1 and 280 or private.ai_quoted(txt) or private.screen_text(txt) then refused:=refused||jsonb_build_array(jsonb_build_object('outcome',oref,'reason','text')); continue; end if;
   if private.ov_norm(txt)=any(seen) then continue; end if;
   -- Its sources, each one from this run's own in_.
   sources:='[]'::jsonb; rooms:=0; room_row:=null; have:=array[]::text[];
   for s in select value from jsonb_array_elements(case when jsonb_typeof(b->'sources')='array' then b->'sources' else '[]'::jsonb end) loop
    ref:=private.ov_ref(in_,case when jsonb_typeof(s)='object' then s->>'ref' when jsonb_typeof(s)='string' then s#>>'{}' end);
    if ref is null then continue; end if;
    if ref->>'kind'='bullet' and ref->>'outcome'<>oref then continue; end if;
    if exists(select 1 from jsonb_array_elements(sources) x where x->>'id'=ref->>'id' and x->>'kind'=ref->>'kind') then continue; end if;
    stext:=ref->>'text';
    excerpt:=btrim(regexp_replace(case when jsonb_typeof(s)='object' then coalesce(s->>'excerpt','') else '' end,'\s+',' ','g'));
    if ref->>'kind' in ('bullet','card') then
     if excerpt<>'' and position(private.ov_norm(excerpt) in private.ov_norm(stext))=0 then excerpt:=''; end if;
    elsif ref->>'kind'='photo' then
     if private.ai_quoted(excerpt) or private.screen_text(excerpt) then excerpt:=''; end if;
    end if;
    excerpt:=left(excerpt,280);
    sources:=sources||jsonb_build_array(jsonb_build_object('kind',ref->>'kind','id',ref->>'id','excerpt',excerpt));
    if ref->>'kind' in ('card','photo') then have:=have||private.ai_numbers(stext||' '||case when ref->>'kind'='photo' then excerpt else '' end); end if;
    if ref->>'kind'='bullet' then rooms:=rooms+1; room_row:=ref; end if;
   end loop;
   if jsonb_array_length(sources)=0 then refused:=refused||jsonb_build_array(jsonb_build_object('outcome',oref,'reason','unsourced')); continue; end if;
   select coalesce(array_agg(n),array[]::text[]) into need from unnest(private.ai_numbers(txt)) n where n is distinct from year;
   kind:=case when rooms=1 and private.ov_norm(txt)=private.ov_norm(room_row->>'text') then 'room' else 'ai' end;
   if kind<>'room' and not need<@have then refused:=refused||jsonb_build_array(jsonb_build_object('outcome',oref,'reason','number')); continue; end if;
   insert into private.draft_bullets(engagement_id,draft_outcome_id,position,text,ai_text,room_text,origin)
    values(run.engagement_id,did,pos,txt,case when kind='ai' then txt end,case when rooms=1 then left(room_row->>'text',280) end,kind) returning id into bid;
   insert into private.draft_sources(engagement_id,draft_outcome_id,bullet_id,kind,ref_id,excerpt,position)
    select run.engagement_id,did,bid,x->>'kind',(x->>'id')::uuid,x->>'excerpt',(row_number() over())::integer-1 from jsonb_array_elements(sources) x;
   seen:=seen||private.ov_norm(txt); pos:=pos+1; applied:=applied+1;
  end loop;
  -- The voices not to lose and the tensions the room named: the room's own words, word for word, kept apart.
  for nd in select 'voice' as k, value as v from jsonb_array_elements(case when jsonb_typeof(o->'voices')='array' then o->'voices' else '[]'::jsonb end)
   union all select 'tension', value from jsonb_array_elements(case when jsonb_typeof(o->'tensions')='array' then o->'tensions' else '[]'::jsonb end) loop
   exit when (select count(*) from private.draft_notes n where n.draft_outcome_id=did and n.kind=nd.k and not n.deleted)>=3;
   if jsonb_typeof(nd.v) is distinct from 'object' then continue; end if;
   note_text:=btrim(regexp_replace(coalesce(nd.v->>'text',''),'\s+',' ','g'));
   ref:=private.ov_ref(in_,nd.v->>'source');
   if ref is null or ref->>'kind'='photo' or length(note_text) not between 1 and 400 or private.screen_text(note_text) then continue; end if;
   if ref->>'kind'='bullet' and ref->>'outcome'<>oref then continue; end if;
   if nd.k='voice' and ref->>'kind'='card' and ref->>'card_kind' not in ('quote','decision') then continue; end if;
   if nd.k='tension' and ref->>'kind'='card' and ref->>'card_kind' not in ('tension','question') then continue; end if;
   if nd.k='tension' and ref->>'kind'='bullet' then continue; end if;
   if position(private.ov_norm(note_text) in private.ov_norm(ref->>'text'))=0 then continue; end if;
   if exists(select 1 from private.draft_notes n where n.draft_outcome_id=did and n.kind=nd.k and not n.deleted and private.ov_norm(n.text)=private.ov_norm(note_text)) then continue; end if;
   insert into private.draft_notes(engagement_id,draft_outcome_id,kind,text,source_kind,source_id,position)
    values(run.engagement_id,did,nd.k,note_text,ref->>'kind',(ref->>'id')::uuid,(select count(*)::integer from private.draft_notes n where n.draft_outcome_id=did and n.kind=nd.k and not n.deleted));
  end loop;
  -- A photo the model could not read, for the outcome it belongs to.
  for p in select value from jsonb_array_elements(case when jsonb_typeof(p_output->'unreadable')='array' then p_output->'unreadable' else '[]'::jsonb end) loop
   if jsonb_typeof(p)='object' and p->>'outcome'=oref then
    ref:=private.ov_ref(in_,p->>'photo');
    if ref->>'kind'='photo' and not coalesce((select (ref->>'id')::uuid = any(d.unreadable) from private.draft_outcomes d where d.id=did),false) then
     update private.draft_outcomes set unreadable=unreadable||(ref->>'id')::uuid where id=did;
    end if;
   end if;
  end loop;
 end loop;
 -- A photo no one could read (a format the model does not take, or one it named with no outcome) is flagged for the whole review.
 update private.overnight_rounds set unreadable=coalesce((select array_agg(distinct (x->>'id')::uuid) from jsonb_array_elements(in_->'photos') x
   where (x->>'readable')::boolean is not true and not exists(select 1 from private.draft_photo_texts t where t.file_id=(x->>'id')::uuid and not t.deleted)
    or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(p_output->'unreadable')='array' then p_output->'unreadable' else '[]'::jsonb end) u
      where jsonb_typeof(u)='object' and u->>'photo'=x->>'ref' and coalesce(u->>'outcome','')='' and not exists(select 1 from private.draft_photo_texts t where t.file_id=(x->>'id')::uuid and not t.deleted))),array[]::uuid[]) where id=r.id;
 for nd in select d.id from private.draft_outcomes d where d.round_id=r.id and not d.deleted and d.tidy='waiting' loop
  update private.draft_outcomes set tidy='tidied',revision=revision+1 where id=nd.id;
  perform private.ov_version(nd.id,'ai','Tidied from '||private.ov_count(r.inputs->>'bullets','bullet')||', '||private.ov_count(r.inputs->>'cards','scribe card')||' and '||private.ov_count(r.inputs->>'photos','easel photo'),null);
 end loop;
 update private.ai_runs set status='ok',changed=applied>0,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'applied',applied,'refused',refused),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 update private.overnight_rounds set status='ready',ready_at=t,lease_id=null,lease_run=null,lease_until=null,last_error=null where id=r.id;
 perform private.fac_notice(run.engagement_id,jsonb_build_object('kind','overnight','what','ready'));
 return jsonb_build_object('status','ok','changed',applied>0,'applied',applied,'refused',jsonb_array_length(refused));
end $$;

revoke all on function private.ai_reset_room(uuid),private.heard_unapply(uuid),private.reset_practice_room_pre_setup_reset(),private.reset_practice_room(),
 private.rehearsal_control_pre_setup_reset(uuid,uuid,text),private.rehearsal_control(uuid,uuid,text),private.overnight_apply_pre_setup_reset(uuid,uuid,jsonb,jsonb),private.overnight_apply(uuid,uuid,jsonb,jsonb),private.ov_count(text,text) from public,anon,authenticated;
grant execute on function private.reset_practice_room(),private.rehearsal_control(uuid,uuid,text) to authenticated;
grant execute on function private.overnight_apply(uuid,uuid,jsonb,jsonb) to service_role;

commit;
