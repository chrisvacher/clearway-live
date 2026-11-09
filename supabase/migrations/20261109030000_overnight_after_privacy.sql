-- Overnight acceptance fixes, batch c (privacy and permissions in the database).
--
-- F1. Add a source: a theme's summary and its quote share a kind and a ref, so the picker's quote came back as the summary. The excerpt picked now decides,
--     for adding and for taking off.
-- F2. The neutral question may not name any accepted theme of the engagement, not only the card's own: private.signal_neutral gains an engagement argument.
-- F3. check_in_state no longer sends an owner's email to the browser. The page needs the name and the practice flag only.
-- F4. The pages that print a date from a moment (the signed-off day, the day a check-in went out) need the church's time zone: the read-only view, the check-in
--     phone page and the check-in results now carry it.
-- F10. The overnight draft's easel photo captions (file names) pass the name check the report, plan and Discover inputs use.

begin;

-- ---------- F2 ----------
-- The two-argument function stays (the model's suggested question is checked with it at apply). This one adds every accepted theme's label in the engagement,
-- with the same four-letter floor the own-label check uses.
create function private.signal_neutral(p_text text,p_label text,p_engagement uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.signal_neutral(p_text,p_label)
  and not exists(select 1 from private.discover_themes t
   where t.engagement_id=p_engagement and not t.deleted and t.merged_into is null and t.status='accepted'
    and length(btrim(t.label))>=4
    and extensions.unaccent('extensions.unaccent'::regdictionary,p_text) ~* ('(?<![[:alpha:]])'||regexp_replace(extensions.unaccent('extensions.unaccent'::regdictionary,btrim(t.label)),'([.^$*+?()\[\]{}|\\])','\\\1','g')||'(?![[:alpha:]])'))
$$;
revoke all on function private.signal_neutral(text,text,uuid) from public,anon,authenticated;

create or replace function private.check_in_state(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,false); e public.engagements; closed date; out jsonb;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 select * into e from public.engagements where id=p_engagement and not deleted;
 closed:=private.retreat_closed_on(p_engagement);
 select jsonb_build_object('status','ok','server_time',clock_timestamp(),'type',e.type,'engagement_status',e.status,'eligible',private.check_in_eligible(p_engagement),
  'practice',e.type='practice','retreat_closed_on',closed,'timezone',coalesce(nullif((select c.timezone from public.churches c where c.id=e.church_id),''),'America/Toronto'),
  'can_switch_on',exists(select 1 from private.check_in_rounds o where o.engagement_id=p_engagement and o.status='off' and not private.check_in_superseded(o.id)),
  'owners',(select count(distinct o.email) from private.check_in_owned(p_engagement) o),
  'rounds',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'day',d.day,'due_on',d.due_on,'status',d.status,'sent_at',d.sent_at,'sent_by',d.sent_by,'superseded',d.status in('scheduled','off') and private.check_in_superseded(d.id),
     'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',case when lower(btrim(r.name))=lower(btrim(r.email)) or r.name like '%@%' then 'Unnamed owner '||r.rn else r.name end,'send_result',r.send_result,'sent_at',r.sent_at,'opened_at',r.opened_at,
        'answered_at',r.answered_at,'help',r.help,'practice',r.send_result='practice_address' or r.email ~* '[.](example|invalid|test)$',
        'steps',coalesce((select jsonb_agg(jsonb_build_object('id',x->>'id','text',x->>'text','due',x->>'due','answer',an.answer,'note',an.note,'answer_id',an.id,
            'followed_up_at',an.followed_up_at,'answered_at',an.updated_at) order by t.ord)
           from jsonb_array_elements(r.items->'steps') with ordinality t(x,ord) left join private.check_in_answers an on an.recipient_id=r.id and an.first_step_id=(x->>'id')::uuid),'[]'::jsonb),
        'goals',coalesce((select jsonb_agg(jsonb_build_object('id',x->>'id','title',x->>'text','end',x->>'due','answer',an.answer,'note',an.note,'answer_id',an.id,
            'followed_up_at',an.followed_up_at,'answered_at',an.updated_at) order by t.ord)
           from jsonb_array_elements(r.items->'goals') with ordinality t(x,ord) left join private.check_in_answers an on an.recipient_id=r.id and an.goal_id=(x->>'id')::uuid),'[]'::jsonb)
        ) order by r.name,r.id) from (select z.*,row_number() over(order by z.name,z.id) as rn from private.check_in_recipients z where z.round_id=d.id) r),'[]'::jsonb)
    ) order by d.day) from private.check_in_rounds d where d.engagement_id=p_engagement),'[]'::jsonb))
  into out;
 return out;
end $$;

create or replace function private.signal_act(p_engagement uuid,p_id uuid,p_signal uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; me uuid:=private.clearway_user_id(); sg private.signals; done private.room_controls; t timestamptz:=clock_timestamp(); logged text; who text; v_text text; v_version bigint;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if r.engagement_id is null or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or p_action not in ('dismiss','save_citation','ask','back') or jsonb_typeof(coalesce(p,'{}'::jsonb)) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 p:=coalesce(p,'{}'::jsonb);
 logged:=case p_action when 'dismiss' then 'dismiss_signal' when 'save_citation' then 'save_signal_citation' when 'ask' then 'ask_the_room' else 'back_to_session' end;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>logged then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','version',r.version);
 end if;
 if p_action<>'back' then
  if p_signal is null then return jsonb_build_object('status','invalid_request'); end if;
  select * into sg from private.signals where id=p_signal and engagement_id=p_engagement and not deleted for update;
  if sg.id is null then return jsonb_build_object('status','missing'); end if;
 end if;
 if p_action='dismiss' then
  if sg.dismissed_at is not null then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.signals set dismissed_at=t where id=sg.id;
 elsif p_action='save_citation' then
  if sg.kind<>'aligned' then return jsonb_build_object('status','invalid_state'); end if;
  if sg.dismissed_at is not null then return jsonb_build_object('status','invalid_state'); end if;
  if sg.saved_as_citation_at is not null then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.signals set saved_as_citation_at=t where id=sg.id;
 elsif p_action='ask' then
  -- The facilitator's edit if there is one, else the suggestion as it stands. Whatever goes up passes the word filter and the neutral check.
  v_text:=nullif(btrim(regexp_replace(coalesce(p->>'text',sg.ask,''),'\s+',' ','g')),'');
  if v_text is null or length(v_text)>200 then return jsonb_build_object('status','invalid_request'); end if;
  if private.screen_text(v_text) then return jsonb_build_object('status','filtered'); end if;
  if not private.signal_neutral(v_text,sg.evidence->'theme'->>'label',p_engagement) then return jsonb_build_object('status','names_signal'); end if;
  if r.live_session_id is distinct from sg.session_id or r.tv_content<>'session' then return jsonb_build_object('status','invalid_state'); end if;
  -- The question has the screen to itself: a spotlight put up before it comes down with it.
  update public.room_states set neutral_question=v_text,spotlight_id=null,spotlight_key=null where engagement_id=p_engagement;
  update private.signals set on_tv=(id=sg.id),neutral_question_sent_at=case when id=sg.id then t else neutral_question_sent_at end,ask_sent=case when id=sg.id then v_text else ask_sent end
   where engagement_id=p_engagement and (on_tv or id=sg.id);
 else
  if r.neutral_question is null then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update public.room_states set neutral_question=null where engagement_id=p_engagement;
 end if;
 select version into v_version from public.room_states where engagement_id=p_engagement;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,me,logged,r.live_session_id,v_version,t);
 select split_part(btrim(name),' ',1) into who from public.clearway_users where id=me;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action',logged,'by',who,'version',v_version,'changed',true));
 return jsonb_build_object('status','ok','version',v_version);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

create or replace function private.report_source_set(p_engagement uuid,p_sentence uuid,p_kind text,p_ref uuid,p_excerpt text,p_add boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,true); s private.report_sentences; c jsonb; n integer; v_excerpt text;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_sentence is null or p_kind is null or p_add is null or (p_kind<>'record' and p_ref is null) then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 select * into s from private.report_sentences where id=p_sentence and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if p_add then
  -- A theme's summary and its quote share a kind and a ref: the excerpt the facilitator picked says which. A record needs its excerpt; any other kind
  -- falls back to the first candidate of that record when the excerpt sent matches none, as before.
  select e.value into c from jsonb_array_elements(private.report_candidates(p_engagement,s.section_id)) e
   where e.value->>'kind'=p_kind and nullif(e.value->>'ref_id','')::uuid is not distinct from p_ref and btrim(e.value->>'excerpt')=btrim(p_excerpt) limit 1;
  if c is null and p_kind<>'record' then
   select e.value into c from jsonb_array_elements(private.report_candidates(p_engagement,s.section_id)) e
    where e.value->>'kind'=p_kind and nullif(e.value->>'ref_id','')::uuid is not distinct from p_ref limit 1;
  end if;
  if c is null then return jsonb_build_object('status','not_a_source'); end if;
  v_excerpt:=c->>'excerpt';
  select count(*)::integer into n from private.report_sources where sentence_id=s.id and not deleted;
  if exists(select 1 from private.report_sources r where r.sentence_id=s.id and not r.deleted and r.kind=p_kind and r.ref_id is not distinct from p_ref and r.excerpt=v_excerpt) then return jsonb_build_object('status','unchanged'); end if;
  if n>=8 then return jsonb_build_object('status','too_many'); end if;
  insert into private.report_sources(engagement_id,sentence_id,kind,ref_id,excerpt,room_words,position) values(p_engagement,s.id,p_kind,p_ref,v_excerpt,coalesce((c->>'room')::boolean,false),n);
 else
  -- Take off the source whose excerpt was sent. A theme can rest on its summary and its quote at once, so the excerpt picks one; with none sent (or
  -- none matching) every source of that record comes off, as before.
  update private.report_sources set deleted=true where sentence_id=s.id and not deleted and kind=p_kind and ref_id is not distinct from p_ref
   and (btrim(excerpt)=btrim(p_excerpt) or (p_kind<>'record' and not exists(select 1 from private.report_sources z where z.sentence_id=s.id and not z.deleted and z.kind=p_kind and z.ref_id is not distinct from p_ref and btrim(z.excerpt)=btrim(p_excerpt))));
  if not found then return jsonb_build_object('status','not_found'); end if;
 end if;
 update private.report_sentences set touched=true where id=s.id;
 perform private.rp_touch_section(s.section_id);
 return jsonb_build_object('status','ok');
end $$;

-- ---------- F2, the other half ----------
-- A suggested question that signal_act would refuse is not shown. The newest signal_state (step 6 patched it) is patched in place, the way that step did.
do $patch$
declare def text; patched text;
begin
 def:=pg_get_functiondef('private.signal_state(uuid,uuid)'::regprocedure);
 patched:=replace(def,'''ask'',g.ask','''ask'',case when g.ask is null or private.signal_neutral(g.ask,g.evidence->''theme''->>''label'',p_engagement) then g.ask end');
 if patched=def then raise exception 'The suggested question in signal_state did not patch cleanly'; end if;
 execute patched;
end $patch$;

-- ---------- F4 ----------
-- The read-only copy and the check-in phone page print the day a moment fell on. Each now says the church's time zone, so the page can use the church's day
-- and not the UTC day. The earlier definitions are renamed and wrapped; what they return is untouched.
alter function private.read_only_view(text) rename to read_only_view_pre_tz;
create function private.read_only_view(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb:=private.read_only_view_pre_tz(p_hash);
begin
 if out->>'status'<>'ok' then return out; end if;
 return out||jsonb_build_object('timezone',coalesce((select nullif(c.timezone,'') from private.read_only_links l join public.engagements e on e.id=l.engagement_id join public.churches c on c.id=e.church_id where l.token_hash=p_hash),'America/Toronto'));
end $$;

alter function private.check_in_phone_read(text) rename to check_in_phone_read_pre_tz;
create function private.check_in_phone_read(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb:=private.check_in_phone_read_pre_tz(p_hash);
begin
 if out->>'status'<>'ok' then return out; end if;
 return out||jsonb_build_object('timezone',coalesce((select nullif(c.timezone,'') from private.check_in_recipients r join public.engagements e on e.id=r.engagement_id join public.churches c on c.id=e.church_id where r.token_hash=p_hash),'America/Toronto'));
end $$;

revoke all on function private.read_only_view(text),private.read_only_view_pre_tz(text),private.check_in_phone_read(text),private.check_in_phone_read_pre_tz(text) from public,anon,authenticated;
grant execute on function private.read_only_view(text),private.check_in_phone_read(text) to service_role;

-- ---------- F10 ----------
-- The photo's caption is the file name. One that carries a name is replaced by a plain word before it is stored on the run or sent to the model.
alter function private.overnight_claim(uuid,uuid,text,jsonb) rename to overnight_claim_pre_privacy;

create function private.overnight_claim(p_engagement uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb; names text[]; v_photos jsonb;
begin
 out:=private.overnight_claim_pre_privacy(p_engagement,p_lease,p_model,p_versions);
 if out->>'status'<>'claimed' then return out; end if;
 names:=private.report_names(p_engagement);
 select coalesce(jsonb_agg(case when private.discover_has_name(x.value->>'caption',names) then jsonb_set(x.value,'{caption}',to_jsonb('Easel photo'::text)) else x.value end order by x.ord),'[]'::jsonb)
  into v_photos from jsonb_array_elements(out->'inputs'->'photos') with ordinality x(value,ord);
 out:=jsonb_set(out,'{inputs,photos}',v_photos);
 update private.ai_runs set inputs=jsonb_set(inputs,'{photos}',v_photos) where id=(out->>'run')::uuid;
 return out;
end $$;

revoke all on function private.overnight_claim(uuid,uuid,text,jsonb),private.overnight_claim_pre_privacy(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.overnight_claim(uuid,uuid,text,jsonb) to service_role;

commit;
