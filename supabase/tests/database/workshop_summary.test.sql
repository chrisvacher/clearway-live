begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('81000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.payload(n integer,eng integer default 10) returns jsonb language sql immutable as $$
  select jsonb_build_object('engagement',tests.id(eng),'device',tests.id(100+n),'proof',lpad(n::text,64,'a'),
    'device_code',repeat('A',7)||chr(64+n),'rate_email',lpad('e'||n,64,'a'),
    'rate_device',lpad('d'||n,64,'a'),'rate_ip',lpad('f'||n,64,'a'))
$$;
create function tests.login(n integer,sid integer default null) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'session_id',tests.id(coalesce(sid,200+n)),'role','authenticated','user_metadata',jsonb_build_object('is_admin',true))::text,true);
end $$;
grant usage on schema tests to service_role,authenticated,anon;
grant execute on all functions in schema tests to service_role,authenticated,anon;
insert into churches(id,name,timezone) values(tests.id(20),'Room A church','America/Toronto'),(tests.id(21),'Room B church','America/Toronto');
insert into engagements(id,church_id,title,status) values(tests.id(10),tests.id(20),'Room A','pre_call'),(tests.id(11),tests.id(21),'Room B','retreat');
insert into auth.users(id,email,email_confirmed_at) values(tests.id(1),'ann@example.org',now()),(tests.id(2),'fac@clearway.co',now()),(tests.id(3),'other@clearway.co',now()),(tests.id(4),'unassigned@clearway.co',now());
insert into auth.identities(user_id,provider,provider_id,identity_data)
select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(2),tests.id(3),tests.id(4));
insert into auth.sessions(id,user_id) values(tests.id(201),tests.id(1)),(tests.id(202),tests.id(2)),(tests.id(203),tests.id(3)),(tests.id(204),tests.id(4)),(tests.id(211),tests.id(1));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method)
select gen_random_uuid(),id,now(),now(),case when user_id=tests.id(1) then 'otp' else 'oauth' end from auth.sessions where id in(tests.id(201),tests.id(202),tests.id(203),tests.id(204),tests.id(211));
insert into clearway_users(id,auth_user_id,name,email,team_hub_team_member_id)
select tests.id(300+n),tests.id(n),'Facilitator '||n,case n when 2 then 'fac@clearway.co' when 3 then 'other@clearway.co' else 'unassigned@clearway.co' end,tests.id(400+n) from generate_series(2,4)n;
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(10),tests.id(302),'lead'),(tests.id(11),tests.id(303),'lead');
insert into attendees(id,engagement_id,name,email) values(tests.id(30),tests.id(10),'Ann Lee','ann@example.org'),(tests.id(31),tests.id(11),'Other person','other@example.org');
update clearway_users set is_admin=true where id=tests.id(304);
update engagements set type='team_workshop',settings=settings||'{"ai_enabled":true}' where id=tests.id(11);
select ok(not has_function_privilege('anon','public.workshop_summary_state(uuid)','execute'),'Anyone not signed in cannot read a workshop summary');
select ok(not has_function_privilege('anon','public.workshop_summary_save(uuid,jsonb)','execute'),'Anyone not signed in cannot save a workshop summary');
select ok(not has_function_privilege('anon','public.workshop_summary_clear(uuid)','execute'),'Anyone not signed in cannot clear a workshop summary');
select ok(not has_table_privilege('authenticated','private.workshop_summaries','select'),'A browser cannot read the summaries table');
set local role authenticated;
select tests.login(1);
select throws_ok($$select public.workshop_summary_state(tests.id(11))$$,'42501',null,'A participant cannot read the summary');
select throws_ok($$select public.workshop_summary_save(tests.id(11),'{"body":"Mine"}')$$,'42501',null,'A participant cannot save the summary');
select tests.login(2);
select throws_ok($$select public.workshop_summary_state(tests.id(11))$$,'42501',null,'A facilitator of another engagement cannot read the summary');
select throws_ok($$select public.workshop_summary_clear(tests.id(11))$$,'42501',null,'A facilitator of another engagement cannot clear the summary');
select tests.login(3);
select is(public.workshop_summary_state(tests.id(11))->'summary','null'::jsonb,'There is no summary to begin with');
select is(public.workshop_summary_state(tests.id(11))->>'ai','true','The state says AI is on for the engagement');
select is(public.workshop_summary_save(tests.id(11),'{"body":""}')->>'status','invalid_request','An empty summary is refused');
select is(public.workshop_summary_save(tests.id(11),'{"words":"x"}')->>'status','invalid_request','A summary with no body is refused');
select is(public.workshop_summary_save(tests.id(11),jsonb_build_object('body',repeat('a',6001)))->>'status','invalid_request','A summary over 6,000 characters is refused');
select is(public.workshop_summary_save(tests.id(11),'{"body":"x","ai":{"model":"m"}}')->>'status','invalid_request','An AI draft without its run details is refused');
select is(public.workshop_summary_save(tests.id(11),'{"body":"x","ai":{"model":"m","prompt_version":"v","inputs":{},"ms":"soon"}}')->>'status','invalid_request','An AI draft with a bad number is refused');
select is(public.workshop_summary_save(tests.id(11),'{"body":"  The room began unsure.  ","ai":{"model":"m","prompt_version":"workshop-summary@1","inputs":{"sessions":[]},"input_tokens":120,"output_tokens":40,"cost_usd":0.0003,"ms":900}}')->'summary'->>'body','The room began unsure.','An AI draft is kept, trimmed');
select is(public.workshop_summary_state(tests.id(11))->'summary'->>'source','ai','The draft is marked as written by AI');
select isnt(public.workshop_summary_state(tests.id(11))->'summary'->>'drafted_at',null,'The draft has its time');
select is(public.workshop_summary_save(tests.id(11),'{"body":"The room began unsure and ended ready."}')->'summary'->>'source','edited','An edit is marked as the facilitator''s');
select isnt(public.workshop_summary_state(tests.id(11))->'summary'->>'drafted_at',null,'An edit keeps the time of the draft it started from');
select tests.login(4);
select is(public.workshop_summary_state(tests.id(11))->'summary'->>'body','The room began unsure and ended ready.','An admin reads the summary');
select tests.login(2);
select is(public.workshop_summary_state(tests.id(10))->>'ai','false','The state says AI is off where it is off');
select is(public.workshop_summary_save(tests.id(10),'{"body":"x","ai":{"model":"m","prompt_version":"v","inputs":{}}}')->>'status','ai_off','An AI draft is refused where AI is off');
select is(public.workshop_summary_save(tests.id(10),'{"body":"Typed by hand."}')->'summary'->>'source','edited','A summary typed by hand is kept where AI is off');
select tests.login(3);
select is(public.workshop_summary_clear(tests.id(11))->'summary','null'::jsonb,'Clearing removes the summary');
reset role;
select is((select count(*)::integer from private.ai_runs where engagement_id=tests.id(11) and job='draft_workshop_summary' and status='ok' and session_id is null and cost_usd=0.0003),1,'The draft is in the AI run log with its cost');
select is((select count(*)::integer from private.workshop_summaries),1,'Only the other engagement''s summary remains');
update engagements set deleted=true where id=tests.id(10);
set local role authenticated;
select tests.login(4);
select is(public.workshop_summary_state(tests.id(10))->>'status','missing','A deleted engagement has no summary to read');
reset role;
select ok((select bool_and(pg_get_constraintdef(c.oid) like '%'||j||'%') from pg_constraint c, unnest(array['combine_words','fold_read_back','alignment_signal','draft_report','draft_visibility_plan','draft_what_we_heard','draft_workshop_summary']) j where c.conname='ai_runs_job_check'),'The job list gains the workshop summary and keeps every earlier job');
select ok((select bool_and(pg_get_constraintdef(c.oid) like '%'||j||'%') from pg_constraint c, unnest(array['overnight_draft','draft_discover_themes','draft_what_we_heard','draft_report','draft_visibility_plan','draft_workshop_summary']) j where c.conname='ai_runs_session_check'),'Every engagement-level job is still allowed without a session');
select * from finish();
rollback;
