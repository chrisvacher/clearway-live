begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n),'user_metadata','{}')::text,true); end $$;
create function tests.report(eng integer) returns jsonb language sql as $$ select public.latency_report(tests.id(eng),now()-interval '1 hour',now()+interval '1 minute') $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Church A','America/Toronto');
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Room A'),(tests.id(101),tests.id(200),'Room B');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n in(1,2) then 'fac'||n||'@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,5)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,5)n;
insert into auth.identities(user_id,provider,provider_id,identity_data,created_at,updated_at)
select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true),now(),now() from auth.users where id in(tests.id(1),tests.id(2));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) select gen_random_uuid(),tests.id(1000+n),now(),now(),'oauth' from unnest(array[1,2])n;
insert into clearway_users(id,auth_user_id,name,email,team_hub_team_member_id) select tests.id(700+n),tests.id(n),'Facilitator '||n,'fac'||n||'@clearway.co',tests.id(800+n) from unnest(array[1,2])n;
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead'),(tests.id(101),tests.id(702),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values(tests.id(503),tests.id(100),tests.id(3),'Ruth','person3@example.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003));
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004)),(tests.id(401),tests.id(100),tests.id(5),tests.id(1005));
insert into sessions(id,engagement_id,title,prompt,state) values(tests.id(300),tests.id(100),'Celebration','One word','live');

-- Ten answers. Answer n reaches TV 1 at n*100 ms and TV 2 at n*100+50 ms after the phone sent it,
-- so the slowest screen counts: 150 ms, 250 ms ... 1050 ms. Answer 11 was queued offline; answer 12 reached no TV.
insert into submissions(id,engagement_id,session_id,attendee_id,text,answers,phone_sent_at,queued_at,server_received_at)
select tests.id(900+n),tests.id(100),tests.id(300),tests.id(503),'w'||n,jsonb_build_array(jsonb_build_object('text','w'||n,'key','w'||n)),now()-interval '1 minute',
  case when n=11 then now()-interval '2 minutes' end,now()-interval '1 minute'+interval '20 ms' from generate_series(1,12)n;
insert into private.latency_logs(engagement_id,submission_id,revision,room_version,phone_sent_at,server_received_at,clock_uncertainty_ms)
select tests.id(100),tests.id(900+n),0,n,now()-interval '1 minute',now()-interval '1 minute'+interval '20 ms',5 from generate_series(1,12)n;
insert into private.latency_logs(engagement_id,submission_id,revision,room_version,phone_sent_at,server_received_at,tv_session_id,tv_received_at,clock_uncertainty_ms)
select tests.id(100),tests.id(900+n),0,n,now()-interval '1 minute',now()-interval '1 minute'+interval '20 ms',tv,
  now()-interval '1 minute'+(n*100+case when tv=tests.id(401) then 50 else 0 end)*interval '1 ms',5+case when tv=tests.id(401) then 30 else 10 end
from generate_series(1,11)n cross join unnest(array[tests.id(400),tests.id(401)]) tv;

select ok(not has_function_privilege('anon','public.latency_report(uuid,timestamptz,timestamptz)','execute'),'No anonymous report');
select ok(not (select prosecdef from pg_proc where oid='public.latency_report(uuid,timestamptz,timestamptz)'::regprocedure),'The public report is invoker; the private function checks the role');

set local role authenticated;
select tests.login(3);
select is(tests.report(100)->>'status','denied','A participant cannot read the latency log');
select tests.login(4);
select is(tests.report(100)->>'status','denied','A TV cannot read the latency log');
select tests.login(2);
select is(tests.report(100)->>'status','denied','A facilitator of another room cannot read it');
select tests.login(1);
select is(tests.report(101)->>'status','denied','Nor can this facilitator read another room');
select is(public.latency_report(tests.id(100),now()-interval '10 days',now())->>'status','invalid_request','A window is at most 7 days');
create temporary table r as select tests.report(100) as j;
select is((select j->>'status' from r),'ok','The room''s facilitator reads its report');
select is((select (j->>'sent')::integer from r),12,'Every accepted answer counts as sent');
select is((select (j->>'queued')::integer from r),1,'An answer saved offline is reported apart');
select is((select (j->>'missing_tv')::integer from r),1,'An answer no TV received is reported');
select is((select (j->>'measured')::integer from r),10,'Measured: live answers that reached the TVs');
select is((select (j->>'under_second')::integer from r),9,'The slowest TV decides: 1050 ms is over one second');
select is((select (j->'phone_tv'->>'max')::numeric from r),1050::numeric,'Slowest is the slowest screen''s time');
select is((select (j->'phone_tv'->>'p50')::numeric from r),600::numeric,'Median phone to TV');
select is((select (j->'phone_server'->>'p95')::numeric from r),20::numeric,'Phone to server');
select is((select (j->>'uncertainty_ms')::numeric from r),35::numeric,'Clock uncertainty is the widest receipt''s');
select is((select j->'sessions'->0->>'title' from r),'Celebration','Each session is reported');
select is((select (j->'sessions'->0->>'under_second')::integer from r),9,'Per session under one second');
reset role;
select * from finish();
rollback;
