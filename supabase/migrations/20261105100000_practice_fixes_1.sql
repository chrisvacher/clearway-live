-- Milestone 4, practice-room fixes, batch 1.
--
--   1. Rehearsal scribe cards and files now carry a test flag (the same mark_test trigger submissions use, set while
--      the engagement is rehearsing), and Clear test answers puts them away. The app removes the stored bytes of the
--      test files after the clear, reading their paths first through private.rehearsal_scribe_paths.
--   2. A lens summary draft or fold may run past 420 characters (the 8 line cap and per line limits stay). The TV
--      shows what fits and phones show the rest, as the results already compute (fit and more). Before, the whole AI
--      version was refused as too_long and the suggestions never folded.
--   3. The Seeding the Five Lenses presenter note in both Wayfinding templates now says when it really opens.
--
-- Shared objects touched, each a superset of its latest definition on main:
--   private.rehearsal_control     the acceptance fixes version (20261104190000) plus scribe cards and files
--   private.ai_apply_base3        the lens summary step's ai_apply (renamed by 20261104170000), without the 420 refusals;
--                                 the delegation to ai_apply_base2 and every other branch are unchanged
--   private.templates (data)      the two Wayfinding templates' Seeding note
-- New: private.scribe_cards.test, private.scribe_files.test, their mark_test triggers, private.rehearsal_scribe_paths and
-- its public wrapper. Nothing here touches Team Hub or CORE, and nothing reaches the TV or phones.
begin;

alter table private.scribe_cards add column test boolean not null default false;
alter table private.scribe_files add column test boolean not null default false;
create trigger mark_test before insert on private.scribe_cards for each row execute function private.mark_test();
create trigger mark_test before insert on private.scribe_files for each row execute function private.mark_test();

create or replace function private.rehearsal_control(p_engagement uuid,p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; done private.rehearsal_log; since timestamptz; began timestamptz; cleared uuid[]; n_votes integer:=0; n_suggestions integer:=0; n_sessions integer:=0;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or p_action not in ('start','end','clear') then return jsonb_build_object('status','invalid_request'); end if;
 select * into done from private.rehearsal_log where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>p_action then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','answers',done.answers,'votes',done.votes,'suggestions',done.suggestions,'sessions',done.sessions,'version',r.version);
 end if;
 since:=private.rehearsing(p_engagement);
 if p_action='start' then
  if since is not null then return jsonb_build_object('status','unchanged','since',since); end if;
  insert into private.rehearsal_log(id,engagement_id,actor_id,action,created_at) values(p_id,p_engagement,private.clearway_user_id(),'start',clock_timestamp());
  return jsonb_build_object('status','ok','since',private.rehearsing(p_engagement));
 elsif p_action='end' then
  if since is null then return jsonb_build_object('status','unchanged'); end if;
  insert into private.rehearsal_log(id,engagement_id,actor_id,action,created_at) values(p_id,p_engagement,private.clearway_user_id(),'end',clock_timestamp());
  return jsonb_build_object('status','ok');
 end if;
 -- Clear test answers: never while a session is on the TV and phones.
 if r.live_session_id is not null then
  return jsonb_build_object('status','live','title',(select title from public.sessions where id=r.live_session_id));
 end if;
 -- The steps a rehearsal reached since the last clear.
 select min(l.created_at) into began from private.rehearsal_log l where l.engagement_id=p_engagement and l.action='start' and not l.deleted
  and l.created_at>coalesce((select max(c.created_at) from private.rehearsal_log c where c.engagement_id=p_engagement and c.action='clear' and not c.deleted),'-infinity'::timestamptz);
 perform 1 from public.sessions where engagement_id=p_engagement and not deleted order by id for update;
 select coalesce(array_agg(id order by id),array[]::uuid[]) into cleared from public.submissions where engagement_id=p_engagement and test and not deleted;
 update public.submissions set deleted=true where id=any(cleared);
 update private.latency_logs set deleted=true where submission_id=any(cleared) and not deleted;
 update private.qa_questions set deleted=true where submission_id=any(cleared) and not deleted;
 update private.qa_merges set deleted=true where engagement_id=p_engagement and (survivor_id=any(cleared) or member_id=any(cleared)) and not deleted;
 update private.qa_votes set deleted=true where engagement_id=p_engagement and (test or question_id=any(cleared)) and not deleted;
 get diagnostics n_votes=row_count;
 update private.ranking_suggestions set deleted=true where engagement_id=p_engagement and test and not deleted;
 get diagnostics n_suggestions=row_count;
 -- Candidate suggestions a rehearsal made go with it (step 8: the one gap the candidates step listed).
 update private.candidate_suggestions set deleted=true where engagement_id=p_engagement and test and not deleted;
 -- Scribe cards and files a rehearsal made go with it; the app removes the stored bytes (private.rehearsal_scribe_paths, read first).
 update private.scribe_cards set deleted=true where engagement_id=p_engagement and test and not deleted;
 update private.scribe_files set deleted=true where engagement_id=p_engagement and test and not deleted;
 -- Step 5: nothing AI made from test answers survives into the real session.
 perform private.ai_clear(p_engagement,cleared);
 -- A real answer that a test answer replaced stands again.
 update public.submissions set withdrawn=false,replaced_by=null where engagement_id=p_engagement and replaced_by=any(cleared) and not deleted and not test;
 -- Steps the rehearsal reached go back to Ready, unless real answers live in them.
 if began is not null then
  update public.sessions x set state='ready',closed_at=null
   where x.engagement_id=p_engagement and not x.deleted and x.mode='live' and x.state in ('open','closed') and x.shown_at>=began
    and not exists(select 1 from public.submissions y where y.session_id=x.id and not y.deleted);
  get diagnostics n_sessions=row_count;
 end if;
 insert into private.rehearsal_log(id,engagement_id,actor_id,action,answers,votes,suggestions,sessions,created_at)
  values(p_id,p_engagement,private.clearway_user_id(),'clear',cardinality(cleared),n_votes,n_suggestions,n_sessions,clock_timestamp());
 -- One version for every surface: a spotlit test question clears, counts recompute.
 update public.room_states set spotlight_id=case when spotlight_id=any(cleared) then null else spotlight_id end,results=private.live_results(p_engagement)
  where engagement_id=p_engagement returning * into r;
 return jsonb_build_object('status','ok','answers',cardinality(cleared),'votes',n_votes,'suggestions',n_suggestions,'sessions',n_sessions,'version',r.version);
end $$;

-- The lens summary apply, kept as the base the candidates wrapper delegates to.
create or replace function private.ai_apply_base3(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; a private.ai_sessions; r public.room_states; s public.sessions; sm private.lens_summaries; cv private.lens_summary_versions; lk private.lens_summary_locks;
 t timestamptz:=clock_timestamp(); v_ms integer; v_lens smallint; ids jsonb; item jsonb; txt text; prob text; allowed text; srcs jsonb; ref text; pidv uuid; sug integer; i integer; show boolean;
 year integer; vid uuid; note text; applied jsonb:='[]'::jsonb; refused jsonb:='[]'::jsonb; entries jsonb:='[]'::jsonb; acc uuid[]:=array[]::uuid[]; pid uuid[]; ptxt text[]; pkey integer[]; q integer; base integer; total integer; cnt integer;
 rt text[]; rf uuid[]; rs jsonb; seen text[]:=array[]::text[]; removed integer:=0; discard boolean:=false; did boolean:=false;
begin
 select * into run from private.ai_runs where id=p_run;
 if run.id is null or run.job not in ('draft_lens_summary','fold_lens_summary') then return private.ai_apply_base2(p_run,p_lease,p_output,p_usage); end if;
 if p_lease is null then return jsonb_build_object('status','invalid_request'); end if;
 if run.engagement_id='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(run.engagement_id::text,7)); end if;
 select * into r from public.room_states where engagement_id=run.engagement_id and not deleted for update;
 select * into a from private.ai_sessions where session_id=run.session_id for update;
 select * into run from private.ai_runs where id=p_run;
 if run.status<>'running' or a.lease_id is distinct from p_lease or a.lease_run is distinct from p_run then return jsonb_build_object('status','stale'); end if;
 v_ms:=private.ai_usage(p_usage,'ms',600000)::integer;
 select * into s from public.sessions where id=run.session_id;
 update private.ai_sessions set lease_id=null,lease_run=null,lease_until=null,last_ok_at=t,last_ms=v_ms where session_id=run.session_id;
 if jsonb_typeof(p_output) is distinct from 'object' or pg_column_size(p_output)>131072 then p_output:='{}'::jsonb; end if;
 v_lens:=(run.inputs->>'lens')::smallint;
 ids:=run.inputs->'ids';
 year:=coalesce((run.inputs->>'year')::integer,0);
 select * into sm from private.lens_summaries where id=(run.inputs->>'summary_id')::uuid and engagement_id=run.engagement_id and not deleted for update;
 select * into cv from private.lens_summary_versions where id=sm.current_version_id and not deleted and undone_at is null;
 select * into lk from private.lens_summary_locks where summary_id=sm.id and not deleted;
 -- The work is dropped when it is no longer wanted or no longer fits what is on the screen.
 if not private.ai_on(run.session_id) or s.deleted or sm.id is null or sm.state='signed_off' then discard:=true;
 elsif run.job='draft_lens_summary' and (cv.id is not null or sm.draft_held) then discard:=true;
 elsif run.job='fold_lens_summary' and (cv.id is null or cv.id::text is distinct from run.inputs->>'version' or sm.fold_held or (lk.summary_id is not null and lk.seen_at>t-interval '40 seconds')) then discard:=true;
 end if;
 if discard then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms,input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,
   output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
  if r.live_session_id=run.session_id then update public.room_states set results=private.live_results(run.engagement_id) where engagement_id=run.engagement_id; end if;
  return jsonb_build_object('status','discarded');
 end if;
 show:=r.live_session_id=run.session_id and v_lens=private.ls_lens(s.options);
 note:=btrim(regexp_replace(coalesce(case when jsonb_typeof(p_output->'note')='string' then p_output->>'note' end,''),'\s+',' ','g'));
 if length(note)>300 or private.ai_quoted(note) or private.screen_text(note) then note:=''; end if;
 allowed:=coalesce((select string_agg(x->>'text',' ') from jsonb_array_elements(run.inputs->'sentences') x),'');

 if run.job='draft_lens_summary' then
  -- Each line needs a source, and stays in the present tense. The TV shows the lines that fit one screen and phones show the rest (the 8 line cap and the per line limits stay).
  total:=0; cnt:=0;
  for item in select x from jsonb_array_elements(case when jsonb_typeof(p_output->'sentences')='array' then p_output->'sentences' else '[]'::jsonb end) x limit 16 loop
   txt:=btrim(regexp_replace(coalesce(case when jsonb_typeof(item)='object' and jsonb_typeof(item->'text')='string' then item->>'text' end,''),'\s+',' ','g'));
   srcs:=(select coalesce(jsonb_agg(distinct (ids->'a'->>(x#>>'{}'))),'[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(item->'sources')='array' then item->'sources' else '[]'::jsonb end) x
     where jsonb_typeof(x)='string' and ids->'a' ? (x#>>'{}'));
   prob:=null;
   if jsonb_typeof(item) is distinct from 'object' then prob:='shape';
   elsif jsonb_array_length(srcs)=0 then prob:='no_source';
   elsif lower(txt)=any(seen) then prob:='duplicate';
   else prob:=private.ls_line_problem(txt,allowed,year); end if;
   if prob is null and cnt>=8 then prob:='too_many'; end if;
   if prob is null then
    total:=total+length(txt)+case when cnt>0 then 1 else 0 end; cnt:=cnt+1; seen:=seen||lower(txt);
    entries:=entries||jsonb_build_array(jsonb_build_object('text',txt,'src',srcs));
   else refused:=refused||jsonb_build_array(jsonb_build_object('text',left(coalesce(txt,''),120),'reason',prob)); end if;
  end loop;
  if cnt=0 then
   update private.lens_summaries set draft_held=true where id=sm.id;
   update private.ai_runs set status='ok',changed=false,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'applied','[]'::jsonb,'refused',refused),
    input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
   if r.live_session_id=run.session_id then update public.room_states set results=private.live_results(run.engagement_id) where engagement_id=run.engagement_id; end if;
   return jsonb_build_object('status','ok','changed',false,'applied',0,'refused',jsonb_array_length(refused));
  end if;
  select array_agg(e->>'text' order by n),array_agg(null::uuid order by n),jsonb_agg(e->'src' order by n) into rt,rf,rs from jsonb_array_elements(entries) with ordinality w2(e,n);
  vid:=private.ls_new_version(sm.id,'ai',run.id,note,rt,rf,rs,false,null,show);
  did:=true;
  applied:=jsonb_build_array(jsonb_build_object('version',vid,'sentences',cnt));
 else
  -- Fold: the prior lines are kept word for word unless a suggestion is named for the change.
  select array_agg(ss.id order by ss.position),array_agg(ss.text order by ss.position) into pid,ptxt from private.lens_summary_sentences ss where ss.version_id=cv.id and not ss.deleted;
  pkey:=array_fill(null::integer,array[coalesce(cardinality(pid),0)]);
  i:=0;
  for item in select x from jsonb_array_elements(case when jsonb_typeof(p_output->'sentences')='array' then p_output->'sentences' else '[]'::jsonb end) x limit 16 loop
   i:=i+1; pidv:=null; prob:=null; txt:=null;
   if jsonb_typeof(item) is distinct from 'object' then refused:=refused||jsonb_build_array(jsonb_build_object('item',i,'reason','shape')); continue; end if;
   ref:=coalesce(item->>'keep',item->>'edit');
   if ref is not null then
    pidv:=case when ids->'s' ? ref then (ids->'s'->>ref)::uuid end;
    if pidv is null or not pidv=any(pid) or pidv=any(acc) then refused:=refused||jsonb_build_array(jsonb_build_object('item',i,'reason','unknown')); continue; end if;
    q:=array_position(pid,pidv);
   end if;
   -- The suggestions named for this change, and the text that may supply its numbers.
   sug:=(select count(*) from jsonb_array_elements_text(case when jsonb_typeof(item->'suggestions')='array' then item->'suggestions' else '[]'::jsonb end) g where ids->'g' ? g);
   srcs:=(select coalesce(jsonb_agg(distinct (ids->'a'->>(x#>>'{}'))),'[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(item->'sources')='array' then item->'sources' else '[]'::jsonb end) x
     where jsonb_typeof(x)='string' and ids->'a' ? (x#>>'{}'));
   if item ? 'keep' then
    acc:=acc||pidv; pkey[q]:=i*100; seen:=seen||lower(ptxt[q]);
    entries:=entries||jsonb_build_array(jsonb_build_object('key',i*100,'text',ptxt[q],'from',pidv,'src',coalesce((select jsonb_agg(src.lens_sentence_id) from private.lens_summary_sources src where src.summary_sentence_id=pidv and not src.deleted),'[]'::jsonb)));
    continue;
   end if;
   txt:=btrim(regexp_replace(coalesce(case when jsonb_typeof(item->'text')='string' then item->>'text' end,''),'\s+',' ','g'));
   allowed:=coalesce((select string_agg(x->>'text',' ') from jsonb_array_elements(run.inputs->'suggestions') x
      where x->>'ref' in (select g from jsonb_array_elements_text(case when jsonb_typeof(item->'suggestions')='array' then item->'suggestions' else '[]'::jsonb end) g)),'')
     ||' '||coalesce((select string_agg(x->>'text',' ') from jsonb_array_elements(run.inputs->'summary') x),'')
     ||' '||coalesce((select string_agg(x->>'text',' ') from jsonb_array_elements(run.inputs->'sentences') x
        where exists(select 1 from jsonb_array_elements_text(srcs) z where z=ids->'a'->>(x->>'ref'))),'');
   prob:=case when sug=0 then 'no_suggestion' else private.ls_line_problem(txt,allowed,year) end;
   if lower(coalesce(txt,''))=any(seen) then prob:=coalesce(prob,'duplicate'); end if;
   if prob is not null then
    refused:=refused||jsonb_build_array(jsonb_build_object('text',left(coalesce(txt,''),120),'reason',prob));
    -- A refused edit leaves the line as it was.
    if pidv is not null then
     acc:=acc||pidv; pkey[q]:=i*100;
     entries:=entries||jsonb_build_array(jsonb_build_object('key',i*100,'text',ptxt[q],'from',pidv,'src',coalesce((select jsonb_agg(src.lens_sentence_id) from private.lens_summary_sources src where src.summary_sentence_id=pidv and not src.deleted),'[]'::jsonb)));
    end if;
    continue;
   end if;
   seen:=seen||lower(txt);
   if pidv is not null then
    acc:=acc||pidv; pkey[q]:=i*100;
    if txt<>ptxt[q] then did:=true; end if;
    entries:=entries||jsonb_build_array(jsonb_build_object('key',i*100,'text',txt,'from',pidv,'src',
      coalesce((select jsonb_agg(distinct u) from (select src.lens_sentence_id::text as u from private.lens_summary_sources src where src.summary_sentence_id=pidv and not src.deleted
         union all select x#>>'{}' from jsonb_array_elements(srcs) x) z(u)),'[]'::jsonb)));
   else
    did:=true;
    entries:=entries||jsonb_build_array(jsonb_build_object('key',i*100,'text',txt,'from',null,'src',srcs));
   end if;
  end loop;
  -- A removal needs a suggestion named for it.
  for item in select x from jsonb_array_elements(case when jsonb_typeof(p_output->'remove')='array' then p_output->'remove' else '[]'::jsonb end) x limit 8 loop
   ref:=case when jsonb_typeof(item)='object' then item->>'ref' end;
   pidv:=case when ref is not null and ids->'s' ? ref then (ids->'s'->>ref)::uuid end;
   sug:=(select count(*) from jsonb_array_elements_text(case when jsonb_typeof(item->'suggestions')='array' then item->'suggestions' else '[]'::jsonb end) g where ids->'g' ? g);
   if pidv is null or not pidv=any(pid) or pidv=any(acc) or sug=0 then refused:=refused||jsonb_build_array(jsonb_build_object('ref',ref,'reason','removal'));
   else acc:=acc||pidv; removed:=removed+1; did:=true; end if;
  end loop;
  -- A prior line the reply did not account for stays, where it was.
  for j in 1..coalesce(cardinality(pid),0) loop
   if pid[j]=any(acc) then continue; end if;
   base:=null;
   for qq in reverse (j-1)..1 loop if pkey[qq] is not null then base:=pkey[qq]; exit; end if; end loop;
   pkey[j]:=coalesce(base,-1000)+j;
   entries:=entries||jsonb_build_array(jsonb_build_object('key',pkey[j],'text',ptxt[j],'from',pid[j],'src',coalesce((select jsonb_agg(src.lens_sentence_id) from private.lens_summary_sources src where src.summary_sentence_id=pid[j] and not src.deleted),'[]'::jsonb)));
  end loop;
  select count(*),sum(length(e->>'text'))+count(*)-1 into cnt,total from jsonb_array_elements(entries) e;
  if cnt>8 then did:=false; refused:=refused||jsonb_build_array(jsonb_build_object('reason','too_many'));
  end if;
  if did then
   select array_agg(e->>'text' order by (e->>'key')::integer),array_agg(nullif(e->>'from','')::uuid order by (e->>'key')::integer),jsonb_agg(e->'src' order by (e->>'key')::integer)
    into rt,rf,rs from jsonb_array_elements(entries) e;
   vid:=private.ls_new_version(sm.id,'ai',run.id,note,rt,rf,rs,true,cv.id,show);
   applied:=jsonb_build_array(jsonb_build_object('version',vid,'sentences',cnt,'removed',removed));
  end if;
 end if;

 update private.ai_runs set status='ok',changed=did,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'applied',applied,'refused',refused),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,
  cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 if r.live_session_id=run.session_id then update public.room_states set results=private.live_results(run.engagement_id) where engagement_id=run.engagement_id; end if;
 return jsonb_build_object('status','ok','changed',did,'applied',jsonb_array_length(applied),'refused',jsonb_array_length(refused));
end $$;

-- The stored bytes behind the test files, for the app to remove after Clear test answers. Read before the clear.
create function private.rehearsal_scribe_paths(p_engagement uuid) returns text[]
language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return array[]::text[]; end if;
 return coalesce((select array_agg(storage_path) from private.scribe_files where engagement_id=p_engagement and test and not deleted),array[]::text[]);
end $$;
create function public.rehearsal_scribe_paths(p_engagement uuid) returns text[]
language sql stable security invoker set search_path='' as $$ select private.rehearsal_scribe_paths(p_engagement) $$;
revoke all on function private.rehearsal_scribe_paths(uuid),public.rehearsal_scribe_paths(uuid) from public,anon,authenticated;
grant execute on function private.rehearsal_scribe_paths(uuid),public.rehearsal_scribe_paths(uuid) to authenticated;

-- The Seeding note says when it opens: at its scheduled time, not when the holding screen goes up.
update private.templates set sessions=replace(sessions::text,
 'It opens when the Seed the Five Lenses screen goes up and stays open until Day 1 begins.',
 'It opens at the Seed the Five Lenses screen''s planned time and stays open until Day 1 begins. If the call runs early or late, move its Opens time in the run of show.')::jsonb
 where id in ('c1ea0000-0000-4000-8000-000000000002','c1ea0000-0000-4000-8000-000000000003');

commit;
