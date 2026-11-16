begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('84100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.version() returns bigint language sql security definer set search_path='' as $$ select version from public.room_states where engagement_id=tests.id(100) $$;
create function tests.state(n integer) returns text language sql security definer set search_path='' as $$ select state from public.sessions where id=tests.id(n) $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,case when action in ('refresh_phones','tv_on_phones','room_size','close_part') then p else jsonb_build_object('from',tests.live())||p end)
$$;
create function tests.send(n integer,session integer,answer text default 'Hope',queued timestamptz default null) returns jsonb language sql as $$
 select public.live_submit(tests.id(100),tests.id(n),tests.id(session),0,'submit',answer,coalesce(queued,now()),queued,0)
$$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Church A','America/Toronto'),(tests.id(201),'Church B','America/Toronto');
insert into engagements(id,church_id,title) values(tests.id(100),tests.id(200),'Live A'),(tests.id(101),tests.id(201),'Live B');
insert into auth.users(id,email,email_confirmed_at)
select tests.id(n),case when n in(1,2,6) then 'fac'||n||'@clearway.co' else 'person'||n||'@example.org' end,now() from generate_series(1,6)n;
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,6)n;
insert into auth.identities(user_id,provider,provider_id,identity_data)
select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(1),tests.id(2),tests.id(6));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method)
select gen_random_uuid(),tests.id(1000+n),now(),now(),'oauth' from unnest(array[1,2,6])n;
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id)
select tests.id(700+n),tests.id(n),case n when 1 then 'Chris Vacher' when 2 then 'Jaisy Tam' else 'Other Facilitator' end,'fac'||n||'@clearway.co',false,tests.id(800+n) from unnest(array[1,2,6])n;
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead'),(tests.id(100),tests.id(702),'co_facilitator'),(tests.id(101),tests.id(706),'lead');
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values(tests.id(503),tests.id(100),tests.id(3),'Priya Shah','person3@example.org',now(),'participant');
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values(tests.id(100),tests.id(503),tests.id(1003));
insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values(tests.id(450),repeat('a',64),tests.id(100),'Front TV',now());
insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id,device_id) values(tests.id(400),tests.id(100),tests.id(4),tests.id(1004),tests.id(450));
insert into sessions(id,engagement_id,part,position,segment,title,interaction,prompt,state,max_sends) values
 (tests.id(310),tests.id(100),'Day 1',0,'','Welcome','content','Welcome','ready',10),
 (tests.id(311),tests.id(100),'Day 1',1,'Five Lenses','Five Lenses: Congregation','word_cloud','Congregation','ready',10),
 (tests.id(312),tests.id(100),'Day 1',2,'Five Lenses','Five Lenses: Community','wall','Community','ready',10),
 (tests.id(313),tests.id(100),'Day 1',3,'','Break','content','Break','draft',10),
 (tests.id(314),tests.id(100),'Day 1',4,'','Celebration','word_cloud','Celebrate','ready',10),
 (tests.id(315),tests.id(100),'Day 2',0,'','Day two','wall','Again','ready',10),
 (tests.id(316),tests.id(101),'Day 1',0,'','Other room','wall','Private','ready',10);
insert into private.session_notes(session_id,engagement_id,notes) values(tests.id(311),tests.id(100),'PRESENTER-SECRET');


select ok(not has_function_privilege('anon','public.session_preview(uuid,uuid)','execute'),'No anonymous previews');
select ok(not (select prosecdef from pg_proc where oid='public.session_preview(uuid,uuid)'::regprocedure),'Public preview wrapper is invoker');

set local role authenticated;
-- Only the engagement's facilitators press the screens or read a preview.
select tests.login(3);
select is(tests.ctl(1,'tv_screen','{"screen":"blackout"}')->>'status','denied','Participant cannot black out the TV');
select is(public.session_preview(tests.id(100),tests.id(311))->>'status','denied','Participant cannot read a preview');
select tests.login(6);
select is(public.session_preview(tests.id(100),tests.id(311))->>'status','denied','Unassigned facilitator cannot read a preview');
select tests.login(1);
select is(public.session_preview(tests.id(100),tests.id(316))->>'status','missing','A step from another engagement is not previewed');

-- A preview of a step that has not been shown: its public fields, never its presenter notes.
select is(public.session_preview(tests.id(100),tests.id(311))->>'status','ok','Preview a ready step');
select is(public.session_preview(tests.id(100),tests.id(311))->'session'->>'title','Five Lenses: Congregation','The preview names the step');
select is(public.session_preview(tests.id(100),tests.id(311))->'session'->>'interaction','word_cloud','and its kind');
select ok(public.session_preview(tests.id(100),tests.id(311))->'results' ? 'total','It carries the TV results');
select ok(public.session_preview(tests.id(100),tests.id(311))::text not like '%PRESENTER-SECRET%','No presenter notes in a preview');
select is(public.session_preview(tests.id(100),tests.id(313))->'session'->>'state','draft','A draft can be previewed');
select is(tests.live(),null::uuid,'A preview changes nothing in the room');

-- Blackout, Join and Home from nothing live.
select is(tests.ctl(10,'tv_screen','{"screen":"elsewhere"}')->>'status','invalid_request','Only the three screens');
select is(tests.ctl(11,'tv_screen')->>'status','invalid_request','A screen must be named');
select is(tests.ctl(12,'tv_screen','{"screen":"holding"}')->>'status','unchanged','Home when Home is showing changes nothing');
select lives_ok($$ select set_config('tests.v',tests.version()::text,true) $$,'Record version');
select is(tests.ctl(13,'tv_screen','{"screen":"join"}')->>'status','ok','Join');
select ok((select live_session_id is null and tv_content='join' from room_states where engagement_id=tests.id(100)),'The TV shows the join screen');
select is(tests.version(),current_setting('tests.v')::bigint+1,'One press raises the version once');
select is(tests.ctl(14,'tv_screen','{"screen":"blackout"}')->>'status','ok','Blackout');
select ok((select tv_content='blackout' from room_states where engagement_id=tests.id(100)),'The TV goes black');
select is((public.live_snapshot(tests.id(100))->'state'->>'tv_content'),'blackout','Every screen hears it');

-- Blackout over a live step is a break: the segment stays open and Back returns to it.
select is(tests.ctl(15,'go_live',jsonb_build_object('session',tests.id(311)))->>'status','ok','Go live');
select is(tests.ctl(16,'start_burst','{"minutes":4}')->>'status','ok','Start a burst');
select is(tests.ctl(17,'tv_screen','{"screen":"blackout"}')->>'status','ok','Blackout over a live step');
select ok((select live_session_id is null and tv_content='blackout' and burst_ends_at is null and not phones_down from room_states where engagement_id=tests.id(100)),'The step leaves the TV and its burst ends');
select is(tests.state(311),'open','The step stays open for late answers');
select tests.login(3);
select is(tests.send(901,311,'Hope')->>'status','accepted','Phones can still answer it');
select tests.login(1);
select is(tests.ctl(18,'back')->>'status','ok','Back after a blackout');
select is(tests.live(),tests.id(311),'returns to the step');
select is(tests.ctl(19,'tv_screen','{"screen":"holding"}')->>'status','ok','Home over a live step');
select ok((select live_session_id is null and tv_content='holding' from room_states where engagement_id=tests.id(100)),'The TV goes home');
select is(tests.ctl(20,'next')->>'status','ok','Next after Home');
select is(tests.live(),tests.id(312),'moves on through the run of show');
select is(tests.state(311),'open','Moving within the segment keeps it open');

-- The preview of the step on the TV carries its answers.
select is(jsonb_array_length(public.session_preview(tests.id(100),tests.id(311))->'answers'),1,'A preview carries the step''s answers');
select is((public.session_preview(tests.id(100),tests.id(311))->'results'->>'total')::integer,1,'and its results');

-- A press against a moved room is refused, as every navigation press is.
select is(public.room_control(tests.id(100),tests.id(21),'tv_screen',jsonb_build_object('from',null,'screen','join'))->>'status','moved','A stale screen press is refused');
select is(tests.live(),tests.id(312),'and the room stays where it is');

-- The team facilitator's remote cannot change the screen.
-- Batch 1 (MD-1) takes hide and unhide off the team remote's list; only the facilitators hide.
select ok((select pg_get_functiondef('private.room_control(uuid,uuid,text,jsonb)'::regprocedure) like '%(''go_live'',''next'',''back'',''reopen'',''stop_answers'',''take_answers'',''phones_down'',''open_phones'',''spotlight'',''clear_spotlight'',''room_size'')%'),'The team remote''s list has no tv_screen, and no hide since batch 1 (Stop and Take answers since November 16)');

select * from finish();
rollback;
