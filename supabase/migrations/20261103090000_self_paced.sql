-- Milestone 3, step 6a: self-paced sessions, Clear test answers, the per-session export
-- and the results recap. Live only, after merge and Chris's approval. No session is
-- started and no data is seeded.
--
-- Self-paced sessions open and close on their times, worked out whenever a session is
-- read or answered (private.session_state). There is no scheduled job: a session's
-- stored state stays Draft or Ready, and the clock decides Open and Closed.
--
-- Test answers. A facilitator starts a rehearsal on an engagement; every answer, vote and
-- suggested option made while it runs is marked test (a trigger on insert, so every path
-- that stores one is covered). Clear test answers removes every test record, puts the
-- steps the rehearsal reached back to Ready, ends the rehearsal and is logged. It is
-- refused while a session is live.
--
-- Shared functions redefined here (the brief allows these three): private.live_submit,
-- private.phone_room and private.control_status. Each is the step 1 definition with only
-- the self-paced and rehearsal lines added.
begin;

-- ---------- Rehearsals and their log ----------
create table private.rehearsal_log (
 id uuid primary key,                  -- the press id, so a repeated press does nothing
 engagement_id uuid not null references public.engagements(id),
 actor_id uuid references public.clearway_users(id),
 action text not null check(action in ('start','end','clear')),
 answers integer not null default 0 check(answers>=0),
 votes integer not null default 0 check(votes>=0),
 suggestions integer not null default 0 check(suggestions>=0),
 sessions integer not null default 0 check(sessions>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false
);
create index rehearsal_log_room_idx on private.rehearsal_log(engagement_id,created_at desc);
create index rehearsal_log_actor_idx on private.rehearsal_log(actor_id);
alter table private.rehearsal_log enable row level security;
alter table private.rehearsal_log force row level security;
revoke all on private.rehearsal_log from public,anon,authenticated;
grant select,insert,update,delete on private.rehearsal_log to service_role;
create trigger touch_record before update on private.rehearsal_log for each row execute function private.touch_live_record('id');

-- Votes and suggested options carry the test flag too (submissions already have one).
alter table private.qa_votes add column test boolean not null default false;
alter table private.ranking_suggestions add column test boolean not null default false;
create index submissions_test_idx on public.submissions(engagement_id) where test and not deleted;

-- When the running rehearsal started, or null when none is running.
create function private.rehearsing(p_engagement uuid) returns timestamptz
language sql stable security definer set search_path='' as $$
 select case when l.action='start' then l.created_at end from private.rehearsal_log l
 where l.engagement_id=p_engagement and not l.deleted order by l.created_at desc,l.id limit 1
$$;
create function private.mark_test() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if private.rehearsing(new.engagement_id) is not null then new.test:=true; end if;
 return new;
end $$;
create trigger mark_test before insert on public.submissions for each row execute function private.mark_test();
create trigger mark_test before insert on private.qa_votes for each row execute function private.mark_test();
create trigger mark_test before insert on private.ranking_suggestions for each row execute function private.mark_test();

-- ---------- Self-paced: open and close on time ----------
-- A live session's state is its own. A self-paced one is Draft until it is Ready, then
-- Ready before it opens, Open between its times and Closed after.
create function private.session_state(p_session public.sessions,p_at timestamptz) returns text
language sql stable security invoker set search_path='' as $$
 select case when p_session.mode<>'self_paced' or p_session.state='draft' then p_session.state
  when p_at<p_session.opens_at then 'ready' when p_at<p_session.closes_at then 'open' else 'closed' end
$$;

-- ---------- Submitting (step 1's function, with self-paced acceptance) ----------
create or replace function private.live_submit(p_engagement uuid,p_id uuid,p_session uuid,p_revision integer,p_action text,p_text text,p_value jsonb,p_sent timestamptz,p_queued timestamptz,p_uncertainty double precision) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; k private.interaction_kinds; previous public.submissions; who uuid; parsed jsonb; fn text;
 answers jsonb:='[]'::jsonb; val jsonb; received timestamptz:=clock_timestamp(); accepting boolean; replaced uuid[]:=array[]::uuid[]; live boolean;
begin
  if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
  select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
  if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
  select id into who from public.attendees where engagement_id=p_engagement and id in(select private.room_attendee_ids());
  select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted;
  if found then k:=private.kind(s.interaction); end if;
  fn:=private.kind_function('parse',s.interaction,'public.sessions,text,jsonb');
  if s.id is null or k.kind is null or not k.input or fn is null then return jsonb_build_object('status','invalid_session'); end if;
  if p_action is null or p_action not in ('submit','change','withdraw') or p_revision is null or p_revision<0 or p_revision>1000000 or p_id is null
    or p_sent is null or not isfinite(p_sent) or (p_queued is not null and not isfinite(p_queued)) or p_uncertainty is null or p_uncertainty not between 0 and 60000 or p_uncertainty='NaN'::float8
    or p_sent>received+interval '1 minute' or p_queued>received+interval '1 minute' or (p_value is not null and pg_column_size(p_value)>16384) then return jsonb_build_object('status','invalid_request'); end if;
  select * into previous from public.submissions where id=p_id;
  if found then
    if previous.attendee_id<>who or previous.engagement_id<>p_engagement or previous.session_id<>p_session or previous.deleted then return jsonb_build_object('status','conflict'); end if;
    if p_revision<=previous.revision then return jsonb_build_object('status','duplicate','id',p_id,'revision',previous.revision,'version',r.version); end if;
    if p_revision<>previous.revision+1 or p_action='submit' then return jsonb_build_object('status','conflict'); end if;
  elsif p_revision<>0 or p_action<>'submit' then return jsonb_build_object('status','conflict');
  end if;
  -- A self-paced session takes answers between its open and close times, outside the live room.
  accepting:=case
    when s.mode='self_paced' then private.session_state(s,received)='open'
    when r.live_session_id=p_session then s.state='live' and not r.phones_down and (r.burst_ends_at is null or r.burst_ends_at>received)
    else s.state='open' and s.mode='live' end;
  if not accepting and not (p_action='submit' and p_queued is not null and (
      (s.mode='live' and s.state='closed' and s.closed_at is not null and p_queued<=s.closed_at and p_sent<=s.closed_at and received<=s.closed_at+interval '2 minutes')
      or (s.mode='self_paced' and s.state<>'draft' and private.session_state(s,received)='closed' and p_queued>=s.opens_at and p_queued<=s.closes_at
        and p_sent<=s.closes_at and received<=s.closes_at+interval '2 minutes'))) then return jsonb_build_object('status','closed'); end if;
  if p_action='withdraw' then answers:=previous.answers; p_text:=previous.text; val:=previous.value;
  else
    execute format('select %s($1,$2,$3)',fn) into parsed using s,p_text,p_value;
    if parsed is null or parsed->>'status' is distinct from 'ok' then return jsonb_build_object('status',coalesce(parsed->>'status','invalid_answer')); end if;
    p_text:=parsed->>'text'; answers:=coalesce(parsed->'answers','[]'::jsonb); val:=parsed->'value';
    if p_text is null or length(p_text) not between 1 and 1404 or jsonb_typeof(answers)<>'array' then return jsonb_build_object('status','invalid_answer'); end if;
    if p_action='submit' and not k.one_per_person and (select count(*) from public.submissions where session_id=p_session and attendee_id=who and not deleted)>=s.max_sends then return jsonb_build_object('status','limit'); end if;
  end if;
  insert into public.submissions(id,engagement_id,session_id,attendee_id,text,answers,value,revision,phone_sent_at,queued_at,clock_uncertainty_ms,server_received_at)
    values(p_id,p_engagement,p_session,who,p_text,answers,val,p_revision,p_sent,p_queued,p_uncertainty,received)
    on conflict(id) do update set text=excluded.text,answers=excluded.answers,value=excluded.value,revision=excluded.revision,withdrawn=(p_action='withdraw'),replaced_by=null;
  -- One answer per person: the latest answer replaces the person's earlier ones.
  if k.one_per_person and p_action<>'withdraw' then
    with gone as (update public.submissions set withdrawn=true,replaced_by=p_id
      where session_id=p_session and attendee_id=who and id<>p_id and not deleted and not withdrawn returning id)
    select coalesce(array_agg(id order by id),array[]::uuid[]) into replaced from gone;
  end if;
  live:=p_action<>'withdraw' and not coalesce(previous.hidden,false) and p_session=r.live_session_id;
  perform set_config('clearway.live_answer',jsonb_build_object('id',p_id,'session_id',p_session,'revision',p_revision,
    'withdrawn',p_action='withdraw','hidden',coalesce(previous.hidden,false),'replaced',to_jsonb(replaced),
    'text',case when live then p_text end,'answers',case when live then answers else '[]'::jsonb end,'value',case when live then val end)::text,true);
  update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
  perform set_config('clearway.live_answer','',true);
  insert into private.latency_logs(engagement_id,submission_id,revision,room_version,phone_sent_at,server_received_at,clock_uncertainty_ms)
    values(p_engagement,p_id,p_revision,r.version,p_sent,received,p_uncertainty);
  return jsonb_build_object('status','accepted','id',p_id,'revision',p_revision,'version',r.version,'server_received_at',received,'replaced',to_jsonb(replaced));
end $$;

-- ---------- The phone's own view (step 1's function, plus self-paced and rehearsal) ----------
-- Self-paced sessions travel separately from the steps the room has reached, so a phone
-- never runs ahead of the room. One that has not opened yet carries its title and times
-- only: no prompt, depth or options until it opens.
create or replace function private.phone_room(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare who uuid; base integer; v_settings jsonb; v_zone text; at_now timestamptz:=clock_timestamp();
begin
 if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 select id into who from public.attendees where engagement_id=p_engagement and id in(select private.room_attendee_ids());
 if who is null then return jsonb_build_object('status','denied'); end if;
 select e.base_year,e.settings,c.timezone into base,v_settings,v_zone from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_engagement;
 return jsonb_build_object('status','ok','server_time',at_now,'timezone',v_zone,'rehearsal',private.rehearsing(p_engagement) is not null,
  'name',(select split_part(btrim(name),' ',1) from public.attendees where id=who),
  'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'part',s.part,'segment',s.segment,'interaction',s.interaction,'state',s.state,
    'prompt',private.fill_years(s.prompt,base),'phone_depth',private.fill_years(s.phone_depth,base),'options',private.public_options(s,v_settings),'kind',private.kind_public(s.interaction),
    'max_sends',s.max_sends,'max_characters',s.max_characters,'max_words',s.max_words,'closed_at',s.closed_at)
    order by private.part_order(s.part),s.position,s.id)
   from (select * from public.sessions where engagement_id=p_engagement and not deleted and mode='live' and shown_at is not null
     order by private.part_order(part),position,id limit 500) s),'[]'::jsonb),
  'self_paced',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'part',s.part,'segment','','interaction',s.interaction,'mode','self_paced',
    'state',s.st,'opens_at',s.opens_at,'closes_at',s.closes_at,
    'prompt',case when s.st<>'ready' then private.fill_years(s.prompt,base) else '' end,
    'phone_depth',case when s.st<>'ready' then private.fill_years(s.phone_depth,base) else '' end,
    'options',case when s.st<>'ready' then private.public_options(s.sess,v_settings) else '{}'::jsonb end,'kind',private.kind_public(s.interaction),
    'settings',jsonb_build_object('anonymous',s.settings->'anonymous'),
    'max_sends',s.max_sends,'max_characters',s.max_characters,'max_words',s.max_words,'closed_at',case when s.st='closed' then s.closes_at end)
    order by s.opens_at,private.part_order(s.part),s.position,s.id)
   from (select x.*,private.session_state(x,at_now) as st,x as sess from public.sessions x where x.engagement_id=p_engagement and not x.deleted and x.mode='self_paced' and x.state<>'draft'
     order by x.opens_at,x.id limit 200) s),'[]'::jsonb),
  'answers',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'session_id',x.session_id,'text',x.text,'value',x.value,'revision',x.revision,'withdrawn',x.withdrawn,'replaced',x.replaced_by is not null,'created_at',x.created_at)
    order by x.created_at,x.id)
   from (select * from public.submissions where engagement_id=p_engagement and attendee_id=who and not deleted order by created_at,id limit 2000) x),'[]'::jsonb));
end $$;

-- ---------- Controls (step 1's status, plus self-paced sessions and the rehearsal) ----------
create or replace function private.control_status(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.room_states; s public.sessions; at_now timestamptz:=clock_timestamp(); last_clear private.rehearsal_log;
begin
 if not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','missing'); end if;
 select * into s from public.sessions where id=r.live_session_id and not deleted;
 select * into last_clear from private.rehearsal_log where engagement_id=p_engagement and action='clear' and not deleted order by created_at desc,id limit 1;
 return jsonb_build_object('status','ok','server_time',at_now,'version',r.version,'fac_topic',private.fac_topic(p_engagement),
  'screens',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'label',d.label,'confirmed_version',coalesce(t.confirmed_version,0),'last_seen_at',t.last_seen_at,
    'connected',coalesce(t.last_seen_at>clock_timestamp()-interval '12 seconds',false)) order by d.paired_at,d.id)
   from private.tv_devices d left join private.live_tv_sessions t on t.device_id=d.id and t.revoked_at is null and not t.deleted
   where d.engagement_id=p_engagement and not d.deleted),'[]'::jsonb),
  'counts',jsonb_build_object('signed_in',coalesce((private.tv_room_info(p_engagement)->'presence'->>'count')::integer,0),
   'answered',(select count(distinct attendee_id) from public.submissions where session_id=s.id and not deleted and not withdrawn),
   'answers',coalesce((r.results->>'total')::integer,0),
   'hidden',cardinality(r.hidden_keys)+cardinality(r.hidden_ids),
   'latency_p95_ms',(select round(percentile_cont(0.95) within group (order by extract(epoch from l.tv_received_at-l.phone_sent_at)*1000))::integer
     from (select l.* from private.latency_logs l join public.submissions x on x.id=l.submission_id
       where l.engagement_id=p_engagement and l.tv_received_at is not null and not l.deleted and x.queued_at is null order by l.tv_received_at desc limit 200) l)),
  'items',private.session_items(s.interaction,s.id,r.hidden_keys),
  'controls',coalesce((select jsonb_agg(c order by c->>'at' desc) from (select jsonb_build_object('id',x.id,'action',x.action,'version',x.room_version,'at',x.created_at,
    'by',split_part(btrim(coalesce(u.name,'')),' ',1)) c from private.room_controls x left join public.clearway_users u on u.id=x.actor_id
    where x.engagement_id=p_engagement and not x.deleted order by x.created_at desc limit 10) recent),'[]'::jsonb),
  'self_paced',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'part',x.part,'interaction',x.interaction,'state',private.session_state(x,at_now),
    'opens_at',x.opens_at,'closes_at',x.closes_at,
    'answered',(select count(distinct y.attendee_id) from public.submissions y where y.session_id=x.id and not y.deleted and not y.withdrawn))
    order by x.opens_at,x.id) from public.sessions x where x.engagement_id=p_engagement and not x.deleted and x.mode='self_paced'),'[]'::jsonb),
  'rehearsal',jsonb_build_object('since',private.rehearsing(p_engagement),
   'test_answers',(select count(*) from public.submissions y where y.engagement_id=p_engagement and y.test and not y.deleted),
   'last_clear',case when last_clear.id is not null then jsonb_build_object('at',last_clear.created_at,'answers',last_clear.answers,'sessions',last_clear.sessions,
     'by',(select split_part(btrim(u.name),' ',1) from public.clearway_users u where u.id=last_clear.actor_id)) end));
end $$;

-- ---------- Rehearse, then Clear test answers ----------
-- start: answers from now on are test answers. end: they stop being marked. clear: removes
-- every test answer, vote and suggestion in the engagement, brings back any real answer a
-- test answer replaced, puts each step the rehearsal reached that holds no real answers
-- back to Ready, ends the rehearsal and logs what it removed. Never while a session is live.
create function private.rehearsal_control(p_engagement uuid,p_id uuid,p_action text) returns jsonb
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
create function public.rehearsal_control(p_engagement uuid,p_id uuid,p_action text) returns jsonb
language sql security invoker set search_path='' as $$ select private.rehearsal_control(p_engagement,p_id,p_action) $$;

-- ---------- Export: one session's input ----------
-- Facilitators only. Every standing answer, oldest first. Names travel only where the
-- session is named (sign together, or a session set to named) or private (the form, whose
-- answers go only to the facilitators, with names); an anonymous session exports without them.
-- Signatures export the name only, never the strokes.
create function private.session_export(p_engagement uuid,p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.sessions; k private.interaction_kinds; named boolean; base integer; v_zone text; v_church text; v_title text;
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','missing'); end if;
 k:=private.kind(s.interaction);
 if k.kind is null or not k.input then return jsonb_build_object('status','no_input'); end if;
 named:=k.named='always' or not k.shares_answers or (k.named='setting' and (s.settings->>'anonymous')='false');
 select e.base_year,c.timezone,c.name,e.title into base,v_zone,v_church,v_title from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_engagement;
 return jsonb_build_object('status','ok','named',named,'timezone',v_zone,'church',v_church,'engagement',v_title,
  'session',jsonb_build_object('id',s.id,'title',s.title,'part',s.part,'mode',s.mode,'interaction',s.interaction,'label',k.label,'prompt',private.fill_years(s.prompt,base),'options',s.options),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'at',x.server_received_at,'name',case when named then btrim(a.name) end,'text',x.text,
     'value',case when s.interaction='sign' then x.value-'strokes' else x.value end,'hidden',x.hidden,'test',x.test,
     'votes',case when s.interaction='qa' then (select count(*) from private.qa_votes v where v.question_id=x.id and v.voted and not v.deleted) end,
     'answered',case when s.interaction='qa' then (select q.answered_at is not null from private.qa_questions q where q.submission_id=x.id and not q.deleted) end,
     'folded_into',case when s.interaction='qa' then (select m.survivor_id from private.qa_merges m where m.member_id=x.id and m.undone_at is null and not m.deleted) end)
    order by x.server_received_at,x.id)
   from (select * from public.submissions where session_id=s.id and not deleted and not withdrawn order by server_received_at,id limit 20000) x
   join public.attendees a on a.id=x.attendee_id),'[]'::jsonb));
end $$;
create function public.session_export(p_engagement uuid,p_session uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.session_export(p_engagement,p_session) $$;

-- ---------- The results recap ----------
-- Facilitators only. One entry per session that takes input and has been reached (shown in
-- the room, opened as self-paced, or answered), in run-of-show order, each with the same
-- public session the TV draws and its results from the same server results functions.
-- Answers ride along only for kinds that share them, as in the TV's snapshot.
create function private.results_recap(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare base integer; v_settings jsonb; at_now timestamptz:=clock_timestamp();
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 select e.base_year,e.settings into base,v_settings from public.engagements e where e.id=p_engagement;
 return jsonb_build_object('status','ok','server_time',at_now,'version',(select version from public.room_states where engagement_id=p_engagement),
  'display',private.tv_room_info(p_engagement)->'display',
  'sessions',coalesce((select jsonb_agg(jsonb_build_object('part',s.part,'mode',s.mode,'opens_at',s.opens_at,'closes_at',s.closes_at,
    'session',jsonb_build_object('id',s.id,'title',s.title,'interaction',s.interaction,'prompt',private.fill_years(s.prompt,base),'state',private.session_state(s.sess,at_now),'revision',s.revision,'base_year',base,
      'max_sends',s.max_sends,'max_characters',s.max_characters,'max_words',s.max_words,'options',private.public_options(s.sess,v_settings),'kind',private.kind_public(s.interaction),
      'settings',jsonb_build_object('anonymous',s.settings->'anonymous','burst_minutes',s.settings->'burst_minutes','join_strip',false)),
    'hidden_keys',to_jsonb(s.hidden_keys),
    'hidden_ids',coalesce((select jsonb_agg(x.id order by x.id) from public.submissions x where x.session_id=s.id and x.hidden and not x.deleted),'[]'::jsonb),
    'results',private.live_results_for(p_engagement,s.id,s.hidden_keys),
    'answers',case when s.shares then coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'session_id',x.session_id,'text',x.text,'answers',private.visible_answers(x.answers,s.hidden_keys),
       'value',x.value,'revision',x.revision,'created_at',x.created_at) order by x.created_at,x.id)
      from (select * from public.submissions y where y.session_id=s.id and not y.deleted and not y.withdrawn and not y.hidden order by y.created_at,y.id limit 500) x),'[]'::jsonb) else '[]'::jsonb end)
    order by private.part_order(s.part),s.position,s.id)
   from (select x.*,x as sess,k.shares_answers as shares from public.sessions x join private.interaction_kinds k on k.kind=x.interaction
     where x.engagement_id=p_engagement and not x.deleted and k.input and x.state<>'draft'
      and (x.shown_at is not null or (x.mode='self_paced' and x.opens_at<=at_now) or exists(select 1 from public.submissions y where y.session_id=x.id and not y.deleted))
     order by private.part_order(x.part),x.position,x.id limit 300) s),'[]'::jsonb));
end $$;
create function public.results_recap(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.results_recap(p_engagement) $$;

revoke all on function private.rehearsing(uuid),private.mark_test(),private.session_state(public.sessions,timestamptz),
 private.rehearsal_control(uuid,uuid,text),public.rehearsal_control(uuid,uuid,text),
 private.session_export(uuid,uuid),public.session_export(uuid,uuid),private.results_recap(uuid),public.results_recap(uuid)
 from public,anon,authenticated;
grant execute on function private.rehearsal_control(uuid,uuid,text),public.rehearsal_control(uuid,uuid,text),
 private.session_export(uuid,uuid),public.session_export(uuid,uuid),private.results_recap(uuid),public.results_recap(uuid)
 to authenticated;
commit;
