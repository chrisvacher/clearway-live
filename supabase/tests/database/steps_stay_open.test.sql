-- November 16: steps stay open until they are ended, anyone can go back, Stop answers and Take answers, Start fresh,
-- Reopen workshop reopens what End closed, and a TV window whose workshop ended says so until it is paired again.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('86000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.state(n integer) returns text language sql security definer set search_path='' as $$ select state from public.sessions where id=tests.id(n) $$;
create function tests.why(n integer) returns text language sql security definer set search_path='' as $$ select closed_by from public.sessions where id=tests.id(n) $$;
create function tests.answers() returns integer language sql security definer set search_path='' as $$ select count(*)::integer from public.submissions where engagement_id=tests.id(100) and not deleted $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,case when action in ('refresh_phones','tv_on_phones','room_size','close_part') then p else jsonb_build_object('from',tests.live())||p end)
$$;
create function tests.send(n integer,session integer,answer text default 'Hope') returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),0,'submit',answer,now(),null,0)
$$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Church A','America/Toronto');
insert into engagements(id,church_id,title,type) values(tests.id(100),tests.id(200),'Workshop A','team_workshop');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n=1 then 'fac1@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,5)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,5)n;
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id=tests.id(1);
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values(tests.id(701),tests.id(1),'Chris Vacher','fac1@clearway.co',false,tests.id(801));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(503),tests.id(100),tests.id(3),'Priya Shah','person3@example.org',now(),'participant'),
 (tests.id(505),tests.id(100),tests.id(5),'Aidan Lee','person5@example.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003)),(tests.id(100),tests.id(505),tests.id(1005));
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'This laptop',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));
insert into sessions(id,engagement_id,part,position,segment,title,interaction,prompt,state,max_sends) values
 (tests.id(310),tests.id(100),'Day 1',0,'','Welcome','content','Welcome','ready',10),
 (tests.id(311),tests.id(100),'Day 1',1,'','Words','word_cloud','One word','ready',10),
 (tests.id(312),tests.id(100),'Day 1',2,'','Wall','wall','A sentence','ready',10),
 (tests.id(313),tests.id(100),'Day 1',3,'','More words','word_cloud','Another word','ready',10),
 (tests.id(314),tests.id(100),'Day 1',4,'','Not yet','wall','Later','ready',10);

select has_column('public','sessions','closed_by','A step records why it is closed');
select ok(not has_function_privilege('anon','public.start_fresh(uuid,uuid)','execute'),'No anonymous Start fresh');
select ok(not (select prosecdef from pg_proc where oid='public.start_fresh(uuid,uuid)'::regprocedure),'The public Start fresh wrapper is invoker');

set local role authenticated;
select tests.login(1);
-- Rule 1: Next never closes.
select is(tests.ctl(1,'next')->>'status','ok','Next to Welcome');
select is(tests.ctl(2,'next')->>'status','ok','Next to Words');
select is(tests.ctl(3,'next')->>'status','ok','Next to Wall');
select is(tests.ctl(4,'next')->>'status','ok','Next to More words');
select is(tests.state(311),'open','Words stays open after Next');
select is(tests.state(312),'open','Wall stays open after Next');
select is(tests.state(310),'open','A content step stays open too');
select is((select count(*)::integer from sessions where engagement_id=tests.id(100) and state='closed'),0,'Nothing closed on the way through');
-- A phone answers an earlier step.
select tests.login(3);
select is(tests.send(901,312,'Earlier thought')->>'status','accepted','A phone answers an earlier step still open');
select is(tests.send(902,313,'Live word')->>'status','accepted','And the live step');
select tests.login(5);
select is(tests.send(903,311,'Courage')->>'status','accepted','A second phone answers the first step');
select tests.login(1);
-- Rule 2: Back makes a step live and answering.
select is(tests.ctl(5,'back')->>'status','ok','Back');
select is(tests.ctl(6,'back')->>'status','ok','Back again');
select is(tests.live(),tests.id(311),'Words is on the TV');
select is(tests.state(311),'live','Going back makes it live and answering, not read-only');
select tests.login(3);
select is(tests.send(904,311,'Hope')->>'status','accepted','The step gone back to takes answers');
select tests.login(1);
-- Stop answers / Take answers.
select is(tests.ctl(7,'stop_answers')->>'status','ok','Stop answers');
select is(tests.state(311),'closed','The step is stopped');
select is(tests.why(311),'stop','Stopped by hand');
select tests.login(3);
select is(tests.send(905,311,'Too late')->>'status','closed','A stopped step takes no answers');
select tests.login(1);
select is(tests.ctl(8,'go_live',jsonb_build_object('session',tests.id(313)))->>'status','ok','Go live elsewhere');
select is(tests.ctl(9,'go_live',jsonb_build_object('session',tests.id(311)))->>'status','ok','Go back to the stopped step');
select is(tests.state(311),'closed','A stopped step stays stopped until Take answers');
select is(tests.ctl(10,'take_answers')->>'status','ok','Take answers');
select is(tests.state(311),'live','Taking answers makes it live and answering');
select is(tests.why(311),null,'Its reason clears');
select is(tests.ctl(11,'take_answers')->>'status','unchanged','Taking answers on an open step changes nothing');
select is(tests.ctl(12,'stop_answers',jsonb_build_object('session',tests.id(310)))->>'status','invalid_state','A content step has no answers to stop');
select is(tests.ctl(13,'stop_answers',jsonb_build_object('session',tests.id(312)))->>'status','ok','Stop an earlier step by name');
select is(tests.live(),tests.id(311),'Stopping an earlier step leaves the TV alone');
select ok((public.control_status(tests.id(100))->'step_answers'->>tests.id(312)::text)::integer=1,'The run of show counts each step''s answers');

-- Start fresh: refused while a step is live; then everything answered goes, the TV and phones stay.
select is((select public.start_fresh(tests.id(100),tests.id(60))->>'status'),'live','Start fresh is refused while a step is live');
select is(tests.ctl(14,'nothing_live')->>'status','ok','Home');
select is((public.control_status(tests.id(100))->>'answers_total')::integer,4,'Every answer counted before Start fresh');
select is((select public.start_fresh(tests.id(100),tests.id(61))->>'status'),'ok','Start fresh');
select is(tests.answers(),0,'Every answer is deleted');
select is((select count(*)::integer from sessions where engagement_id=tests.id(100) and state='ready' and shown_at is null and closed_at is null),5,'Every step is back to Ready');
select ok((select timer is null and live_session_id is null and phone_refresh_version>=1 from room_states where engagement_id=tests.id(100)),'The timer clears and phones reload');
reset role;
select is((select count(*)::integer from device_sessions where engagement_id=tests.id(100) and revoked_at is null),2,'Phones stay signed in');
select is((select engagement_id from private.tv_devices where id=tests.id(450)),tests.id(100),'The TV stays paired');
select is((select revoked_at from private.live_tv_sessions where id=tests.id(400)),null,'The TV session stays live');
set local role authenticated;
select tests.login(1);
select is((select public.start_fresh(tests.id(100),tests.id(61))->>'status'),'duplicate','A repeated press does nothing more');
select ok((public.control_status(tests.id(100))->'rehearsal'->'last_clear'->>'fresh')::boolean,'Start fresh is logged');
select tests.login(3);
select is(public.start_fresh(tests.id(100),tests.id(62))->>'status','denied','A participant cannot start fresh');
select tests.login(1);
select is(public.start_fresh('90000000-0000-4000-8000-000000000010'::uuid,tests.id(63))->>'status','denied','Another engagement is refused');

-- End workshop, then Reopen: the steps End closed reopen; a stopped step stays stopped.
select is(tests.ctl(15,'go_live',jsonb_build_object('session',tests.id(311)))->>'status','ok','Run Words again');
select is(tests.ctl(16,'next')->>'status','ok','Next to Wall');
select is(tests.ctl(17,'stop_answers')->>'status','ok','Stop Wall');
reset role;
update engagements set status='closed' where id=tests.id(100);
select is(tests.state(311),'closed','End closes the open steps');
select is(tests.why(311),'end','Closed by End');
select is(tests.why(312),'stop','A stopped step keeps its own reason');
select is(tests.state(314),'ready','A step never shown is left alone');
select is((select engagement_id from private.tv_devices where id=tests.id(450)),null,'End still unpairs the TV');
select is((select ended_engagement_id from private.tv_devices where id=tests.id(450)),tests.id(100),'The TV window remembers which workshop ended');
select is(private.tv_device('sync',jsonb_build_object('device',tests.id(450),'proof',repeat('a',64)))->>'status','ended','The TV window says the workshop ended instead of showing a code');
update engagements set status='setup' where id=tests.id(100);
select is(tests.state(311),'open','Reopen workshop reopens the steps End closed');
select is(tests.state(312),'closed','A step stopped by hand stays stopped');
select is(tests.state(314),'ready','A step never shown stays Ready');
select is(private.tv_device('sync',jsonb_build_object('device',tests.id(450),'proof',repeat('a',64)))->>'status','ended','Reopening does not pair the old TV');
update private.tv_devices set engagement_id=tests.id(100),paired_at=now() where id=tests.id(450);
select is((select ended_engagement_id from private.tv_devices where id=tests.id(450)),null,'Pairing the window again clears Workshop ended');
select is(private.tv_device('sync',jsonb_build_object('device',tests.id(450),'proof',repeat('a',64)))->>'status','approved','The window is paired again');

-- The team facilitator presses Stop answers and Take answers too (inside their block, checked in handover_intent).
select ok(position('''stop_answers'',''take_answers''' in pg_get_functiondef('private.room_control(uuid,uuid,text,jsonb)'::regprocedure))>0,'Stop and Take answers are on the team''s list');
select ok(position('anchor.segment' in pg_get_functiondef('private.room_control(uuid,uuid,text,jsonb)'::regprocedure))=0,'Navigation has no segment closing left');

select * from finish();
rollback;
