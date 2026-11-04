-- Close the day closes self-paced steps still open in that part (fix, November 3).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87420000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.version() returns bigint language sql security definer set search_path='' as $$ select version from public.room_states where engagement_id=tests.id(100) $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.rehearse(n integer,action text) returns jsonb language sql as $$ select public.rehearsal_control(tests.id(100),tests.id(n),action) $$;
create function tests.send(n integer,session integer,text_ text,value jsonb default null,action text default 'submit',revision integer default 0,queued timestamptz default null,sent timestamptz default now()) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),revision,action,text_,sent,queued,0,value) $$;
create function tests.save(n integer,kind text,part text,mode text default 'live',opens timestamptz default null,closes timestamptz default null,state text default 'ready') returns jsonb language sql as $$
 select public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(n),'revision',null,'title','Step '||n,'part',part,'mode',mode,'opens_at',opens,'closes_at',closes,'interaction',kind,
  'prompt','Prompt '||n||' for {base year + 3}','phone_depth','Depth '||n,'notes','Private note '||n,'lands_in','','segment','','state',state,'planned_minutes',5,'max_sends',3,'max_characters',140,'max_words',3,
  'settings',jsonb_build_object('anonymous',true,'burst_minutes',4,'join_strip',false),'options','{}'::jsonb)) $$;
create function tests.rev(n integer) returns integer language sql security definer set search_path='' as $$ select revision from public.sessions where id=tests.id(n) $$;
create function tests.self(n integer) returns jsonb language sql as $$ select s from jsonb_array_elements(public.phone_room(tests.id(100))->'self_paced') s where s->>'id'=tests.id(n)::text $$;
create function tests.sub(n integer) returns public.submissions language sql security definer set search_path='' as $$ select * from public.submissions where id=tests.id(n) $$;
create function tests.recap(n integer) returns jsonb language sql as $$ select s from jsonb_array_elements(public.results_recap(tests.id(100))->'sessions') s where s->'session'->>'id'=tests.id(n)::text $$;
create function tests.event(n integer) returns jsonb language sql security definer set search_path='' as $$
 select payload from realtime.messages where topic like 'live:'||tests.id(100)||':%' and event='room' and payload->'answer'->>'id'=tests.id(n)::text order by (payload->'state'->>'version')::bigint desc limit 1 $$;
create function tests.results_for(n integer) returns jsonb language sql security definer set search_path='' as $$ select private.live_results_for(tests.id(100),tests.id(n),array[]::text[]) $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title,base_year) values(tests.id(100),tests.id(200),'Close the day room',2026);
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n=1 then 'fac1@clearway.co' when n=2 then 'fac2@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,7)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,7)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in (tests.id(1),tests.id(2));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth'),(gen_random_uuid(),tests.id(1002),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values
 (tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801)),(tests.id(702),tests.id(2),'Jaisy Tam','fac2@clearway.co',false,tests.id(802));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Priya Shah','person3@example.org',now(),'participant'),
 (tests.id(505),tests.id(100),tests.id(5),'Ben Ortiz','person5@example.org',now(),'participant'),
 (tests.id(506),tests.id(100),tests.id(6),'Ruth Morrison','person6@example.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(505),tests.id(1005)),(tests.id(100),tests.id(506),tests.id(1006));
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));

create function tests.closes(n integer) returns timestamptz language sql security definer set search_path='' as $$ select closes_at from public.sessions where id=tests.id(n) $$;
create function tests.state(n integer) returns text language sql security definer set search_path='' as $$ select private.session_state(s,clock_timestamp()) from public.sessions s where id=tests.id(n) $$;
create function tests.logged(n integer) returns text language sql security definer set search_path='' as $$ select action from private.room_controls where id=tests.id(n) $$;
create function tests.status_self(n integer) returns jsonb language sql as $$ select s from jsonb_array_elements(public.control_status(tests.id(100))->'self_paced') s where s->>'id'=tests.id(n)::text $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

set local role authenticated;
select tests.login(1);
select is(tests.save(310,'word_cloud','Day 1')->>'status','ok','A live Day 1 step');
select is(tests.save(330,'wall','Day 1','self_paced',now()-interval '1 hour',now()+interval '1 day')->>'status','ok','A self-paced Day 1 step that is open');
select is(tests.save(331,'wall','Day 1','self_paced',now()+interval '1 hour',now()+interval '1 day')->>'status','ok','One that opens later');
select is(tests.save(333,'wall','Day 1','self_paced',now()-interval '2 days',now()-interval '1 day')->>'status','ok','One that has already closed');
select is(tests.save(334,'wall','Day 1','self_paced',now()-interval '1 hour',now()+interval '1 day','draft')->>'status','ok','A draft');
select is(tests.save(332,'wall','Day 2','self_paced',now()-interval '1 hour',now()+interval '1 day')->>'status','ok','An open self-paced Day 2 step');
select is(tests.state(330),'open','The Day 1 self-paced step is open');

select tests.login(3);
select is(tests.send(901,330,'Before the close')->>'status','accepted','Priya answers the self-paced step');
select tests.login(1);
select is(tests.ctl(902,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Day 1 goes live');
reset role;
create temp table before_close as select tests.version() as v,tests.closes(331) as c331,tests.closes(333) as c333,tests.closes(334) as c334,tests.closes(332) as c332;
grant select on before_close to authenticated;
set local role authenticated;

-- Close Day 1: the backstop for anything still open in the day.
select is(tests.ctl(903,'close_part','{"part":"Day 1"}')->>'status','ok','Close Day 1');
select is(tests.live(),null,'The TV goes to its holding screen, as before');
select is((select state from sessions where id=tests.id(310)),'closed','The live step closes, as before');
select is(tests.state(330),'closed','The open self-paced step in Day 1 closes too');
select ok(tests.closes(330)<=clock_timestamp() and tests.closes(330)>now(),'Its close time is the moment of the press');
select is((select closed_at from sessions where id=tests.id(330)),tests.closes(330),'and the close is recorded');
select is(tests.closes(331),(select c331 from before_close),'A self-paced step that has not opened keeps its times');
select is(tests.state(331),'ready','and still opens later');
select is(tests.closes(333),(select c333 from before_close),'One already closed is untouched');
select is(tests.closes(334),(select c334 from before_close),'A draft is untouched');
select is(tests.closes(332),(select c332 from before_close),'Another day''s self-paced step is untouched');
select is(tests.state(332),'open','and stays open');
select ok(tests.version()>(select v from before_close),'The room version rises, so every surface reads the closed steps');
select is(tests.logged(903),'close_part','The press is logged in the room''s control trail');
select is(tests.status_self(330)->>'state','closed','The control surface lists it as closed');

-- Phones: the step is closed, with the usual grace for answers queued before the close.
select tests.login(3);
select is(tests.self(330)->>'state','closed','The phone shows the self-paced step as closed');
select is(tests.send(904,330,'After the close')->>'status','closed','A new answer is refused');
select is(tests.send(905,330,'Queued before the close',null,'submit',0,now())->>'status','accepted','An answer queued on the phone before the close is still accepted');
select is(tests.send(906,330,'Queued after the close',null,'submit',0,now()+interval '1 minute')->>'status','closed','One queued after the close is not');
select is((tests.sub(901)).text,'Before the close','Earlier answers are kept');

-- Closing a day with only a self-paced step open closes it, instead of changing nothing.
select tests.login(1);
select is(tests.ctl(907,'close_part','{"part":"Day 2"}')->>'status','ok','Close Day 2 with only a self-paced step open');
select is(tests.state(332),'closed','The Day 2 self-paced step closes');
select is(tests.ctl(908,'close_part','{"part":"Day 2"}')->>'status','unchanged','Closing twice changes nothing');
select is(tests.ctl(909,'close_part','{"part":"Day 1"}')->>'status','unchanged','Day 1 is already closed');
select is(tests.state(331),'ready','and the step that opens later is still waiting');
reset role;
select * from finish();
rollback;
