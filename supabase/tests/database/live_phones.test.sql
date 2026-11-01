begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('85000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Church A','America/Toronto');
insert into engagements(id,church_id,title,base_year) values(tests.id(100),tests.id(200),'Live A',2026),(tests.id(101),tests.id(200),'Live B',2026);
insert into auth.users(id,email,email_confirmed_at) select tests.id(n),'person'||n||'@example.org',now() from generate_series(1,4)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,4)n;
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at) values
 (tests.id(501),tests.id(100),tests.id(1),'Priya Shah','person1@example.org',now()),
 (tests.id(502),tests.id(100),tests.id(2),'Daniel Ito','person2@example.org',now()),
 (tests.id(503),tests.id(101),tests.id(3),'Other Room','person3@example.org',now());
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(501),tests.id(1001)),(tests.id(100),tests.id(502),tests.id(1002)),(tests.id(101),tests.id(503),tests.id(1003));
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004));
insert into sessions(id,engagement_id,part,position,segment,title,interaction,prompt,phone_depth,state,shown_at,max_sends) values
 (tests.id(310),tests.id(100),'Day 1',0,'Five Lenses','Congregation','wall','It is {base year + 10}.','Depth {base year + 3}','open',now(),5),
 (tests.id(311),tests.id(100),'Day 1',1,'Five Lenses','Community','wall','Community','','live',now(),5),
 (tests.id(312),tests.id(100),'Day 1',2,'','Ahead','word_cloud','Not yet','','ready',null,5);
insert into private.session_notes(session_id,engagement_id,notes) values(tests.id(310),tests.id(100),'PHONE-NOTES-SECRET');
update room_states set live_session_id=tests.id(311),tv_content='session' where engagement_id=tests.id(100);
insert into submissions(id,engagement_id,session_id,attendee_id,text,answers,phone_sent_at) values
 (tests.id(901),tests.id(100),tests.id(310),tests.id(501),'Mine','[{"text":"Mine","key":"mine"}]',now()),
 (tests.id(902),tests.id(100),tests.id(310),tests.id(502),'Theirs','[{"text":"Theirs","key":"theirs"}]',now());

select ok(not has_function_privilege('anon','public.phone_room(uuid)','execute'),'No anonymous phone room');
select ok(not (select prosecdef from pg_proc where oid='public.phone_room(uuid)'::regprocedure),'Public phone room is invoker');
set local role authenticated;
select tests.login(1);
select is(public.phone_room(tests.id(100))->>'status','ok','A signed-in phone reads its room');
select is(public.phone_room(tests.id(100))->>'name','Priya','It knows the person by first name');
select is(jsonb_array_length(public.phone_room(tests.id(100))->'sessions'),2,'Only steps the room has reached, never ahead');
select is(public.phone_room(tests.id(100))->'sessions'->0->>'prompt','It is 2036.','Prompts fill the horizon years');
select is(public.phone_room(tests.id(100))->'sessions'->0->>'phone_depth','Depth 2029','Phone depth fills the horizon years');
select is(public.phone_room(tests.id(100))->'sessions'->0->>'state','open','An earlier step in the segment shows as open');
select is(jsonb_array_length(public.phone_room(tests.id(100))->'answers'),1,'Only the person''s own answers');
select is(public.phone_room(tests.id(100))->'answers'->0->>'text','Mine','Its own answer text');
select ok(public.phone_room(tests.id(100))::text not like '%PHONE-NOTES-SECRET%' and public.phone_room(tests.id(100))::text not like '%Theirs%' and public.phone_room(tests.id(100))::text not like '%Daniel%','No notes, others'' answers or names');
select is(public.phone_room(tests.id(101))->>'status','denied','A phone cannot read another room');
select tests.login(4);
select is(public.phone_room(tests.id(100))->>'status','denied','The TV has no phone view');
select tests.login(3);
select is(public.phone_room(tests.id(100))->>'status','denied','A person in another room is denied');
reset role;
select * from finish();
rollback;
