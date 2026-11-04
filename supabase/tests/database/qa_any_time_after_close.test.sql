-- Questions any time after the pool step has run (fix, November 3): the Ask button stays on
-- every session's phone screen and questions land in the engagement's one shared pool.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87410000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.state(n integer) returns text language sql security definer set search_path='' as $$ select state from public.sessions where id=tests.id(n) $$;
create function tests.stored(n integer) returns uuid language sql security definer set search_path='' as $$ select session_id from public.submissions where id=tests.id(n) $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p) $$;
create function tests.ask(n integer,text text) returns jsonb language sql as $$ select public.qa_ask(tests.id(100),tests.id(n),text,now()) $$;
create function tests.rev(n integer) returns integer language sql security definer set search_path='' as $$ select revision from public.sessions where id=tests.id(n) $$;
create function tests.save(n integer,kind text,options jsonb,part text default 'Day 1',state text default 'ready') returns jsonb language sql as $$
 select public.show_write(tests.id(100),'save',jsonb_build_object('id',tests.id(n),'revision',tests.rev(n),'title','Step '||n,'part',part,'mode','live','interaction',kind,
  'prompt','What do you want to ask?','phone_depth','','notes','','lands_in','','segment','','state',state,'planned_minutes',5,'max_sends',5,'max_characters',200,'max_words',50,
  'settings',jsonb_build_object('anonymous',true,'burst_minutes',4,'join_strip',false),'options',options)) $$;
create function tests.pool() returns uuid language sql as $$ select (public.live_snapshot(tests.id(100))->'qa'->'pool'->>'session_id')::uuid $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title,settings) values(tests.id(100),tests.id(200),'Questions any time room','{"scripture_translation":"NIV"}');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n=1 then 'fac1@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,6)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,6)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id=tests.id(1);
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values(tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Priya Shah','person3@example.org',now(),'participant'),
 (tests.id(506),tests.id(100),tests.id(6),'Ruth Ade','person6@example.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(506),tests.id(1006));
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));

set local role authenticated;
select tests.login(1);
select is(tests.save(310,'qa','{"any_time":true}')->>'status','ok','A Day 1 Q&A step takes questions any time');
select is(tests.save(311,'word_cloud','{}')->>'status','ok','A later Day 1 word cloud');
select is(tests.save(320,'word_cloud','{}','Day 2')->>'status','ok','A Day 2 word cloud');
select is(tests.save(321,'qa','{"any_time":true}','Day 2','draft')->>'status','ok','A Day 2 Q&A draft with the setting on');

-- The Q&A session runs, then the room moves on and it closes.
select is(tests.ctl(901,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Go live on the Q&A step');
select tests.login(3);
select is(public.live_submit(tests.id(100),tests.id(950),tests.id(310),0,'submit','Will we talk about the building?',now(),null,0)->>'status','accepted','Priya asks while it is live');
select tests.login(1);
select is(tests.ctl(902,'go_live',jsonb_build_object('session',tests.id(311)))->>'status','ok','Go live on the word cloud');
select is(tests.state(310),'closed','The Q&A step closed when the room moved on');

-- Ask stays on every phone: the pool outlives its step.
select tests.login(4);
select is(tests.pool(),tests.id(310),'The closed Q&A step is still the pool, so every surface keeps Ask');
select tests.login(6);
select is(tests.pool(),tests.id(310),'Phones get the pool too');
select is(tests.ask(951,'And the budget?')->>'status','accepted','Ruth asks from the word cloud after the Q&A session ran');
select is(tests.stored(951),tests.id(310),'Her question lands in the pool');
select ok(exists(select 1 from jsonb_array_elements(public.phone_room(tests.id(100))->'answers') a where a->>'id'=tests.id(951)::text),'Her phone holds its own pool question');
select tests.login(4);
select is((public.live_snapshot(tests.id(100))->'qa'->'pool'->>'waiting')::integer,2,'The pool counts both waiting questions');
select tests.login(1);
select is(public.qa_status(tests.id(100))->'session'->>'id',tests.id(310)::text,'The control surface lists the pool');
select is((public.qa_status(tests.id(100))->'counts'->>'questions')::integer,2,'with both questions');

-- Closing the day does not take Ask away from the next day.
select is(tests.ctl(903,'close_part','{"part":"Day 1"}')->>'status','ok','Close Day 1');
select is(tests.ctl(904,'go_live',jsonb_build_object('session',tests.id(320)))->>'status','ok','Go live on Day 2');
select tests.login(4);
select is(tests.pool(),tests.id(310),'On Day 2 the pool is still the same one list');
select tests.login(3);
select is(tests.ask(952,'What happens after the retreat?')->>'status','accepted','Priya asks on Day 2');
select is(tests.stored(952),tests.id(310),'It lands in the same pool');
select is(tests.ask(952,'What happens after the retreat?')->>'status','duplicate','A resend is still a duplicate');
select is(tests.ask(953,'Is this shit real?')->>'status','filtered','The word filter still screens it');

-- Existing rules hold: drafts are never the pool, an open pool step is preferred, and the
-- pool step's own rules apply while it is on the TV.
select tests.login(1);
select is(tests.save(321,'qa','{"any_time":true}','Day 2','ready')->>'status','ok','The Day 2 Q&A step becomes ready');
select tests.login(4);
select is(tests.pool(),tests.id(321),'An any-time Q&A step that is not closed is preferred, as before');
select tests.login(1);
select is(tests.save(321,'qa','{"any_time":false}','Day 2','ready')->>'status','ok','Turn the setting off on it');
select is(tests.ctl(905,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Go back to the closed pool step');
select is(tests.state(310),'closed','It is shown read-only');
select tests.login(6);
select is(tests.ask(954,'One more?')->>'status','closed','While the closed pool step is on the TV, Ask waits as before');
select tests.login(1);
select is(tests.ctl(906,'reopen')->>'status','ok','Reopen it');
select tests.login(6);
select is(tests.ask(955,'One more?')->>'status','accepted','and Ask works on the live pool step');
reset role;
select * from finish();
rollback;
