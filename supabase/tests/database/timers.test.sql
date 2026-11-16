begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('8f000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
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

create function tests.timer() returns jsonb language sql security definer set search_path='' as $$ select timer from public.room_states where engagement_id='8f000000-0000-4000-8000-000000000100' $$;
create function tests.tc(action text,p jsonb default '{}') returns jsonb language sql as $$ select public.timer_control('8f000000-0000-4000-8000-000000000100',action,p) $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;
-- Batch 1 (November 15): timers (TM-1 to TM-3).
-- Step settings
select is(private.session_options('wall',jsonb_build_object('timer',jsonb_build_object('kind','down','seconds',300)),tests.id(100))->'timer',
 '{"kind":"down","seconds":300,"tv":true,"phones":false,"start":"live"}'::jsonb,'A step timer counts down, on the TV, not on phones, from Go live by default');
select is(private.session_options('content',jsonb_build_object('screen','headline','timer',jsonb_build_object('kind','to','at','10:30','phones',true,'start','hand')),tests.id(100))->'timer'->>'at','10:30','Any screen can count to a clock time, started by hand');
select is(private.session_options('wall','{"timer":{"kind":"down","seconds":5}}',tests.id(100)),null,'Under 10 seconds is refused');
select is(private.session_options('wall','{"timer":{"kind":"to","at":"25:00"}}',tests.id(100)),null,'A clock time must be a real one');
select is(private.session_options('wall',jsonb_build_object('timer',jsonb_build_object('kind','up','through',tests.id(316))),tests.id(100)),null,'Runs through only a step of the same engagement');
select is(private.session_options('wall','{"timer":null}',tests.id(100)),'{}'::jsonb,'No timer is no timer');
update sessions set options=jsonb_build_object('timer',jsonb_build_object('kind','down','seconds',600,'tv',true,'phones',true,'start','live','through',tests.id(312))) where id=tests.id(311);

-- A step's timer starts on Go live, runs through the steps it spans, and stops past them
set local role authenticated; select tests.login(1);
select is(tests.ctl(1,'go_live',jsonb_build_object('session',tests.id(310)))->>'status','ok','Welcome goes live');
select is(tests.timer(),null,'No timer on a step without one');
select is(tests.ctl(2,'next')->>'status','ok','Next: Congregation, which has a 10-minute timer');
select is(tests.timer()->>'kind','down','The step''s timer starts on Go live');
select is((tests.timer()->>'seconds')::integer,600,'ten minutes');
select ok((extract(epoch from (tests.timer()->>'ends_at')::timestamptz-(tests.timer()->>'started_at')::timestamptz))::integer=600,'ending ten minutes after it started');
select is(public.live_snapshot(tests.id(100))->'state'->'timer'->>'id',tests.timer()->>'id','The room state carries it');
select is(tests.ctl(3,'next')->>'status','ok','Next: Community, the step it runs through');
select is((tests.timer()->>'from')::uuid,tests.id(311),'It keeps running through the next step');
select is(tests.ctl(4,'nothing_live')->>'status','ok','A break');
select ok(tests.timer() is not null,'A break keeps it running');
select is(tests.ctl(5,'go_live',jsonb_build_object('session',tests.id(314)))->>'status','ok','A step past the span');
select is(tests.timer(),null,'and it stops');

-- The controls
select is(tests.tc('start','{"kind":"down","seconds":300,"tv":true,"phones":false}')->>'status','ok','Start a 5-minute timer by hand');
select is(tests.tc('start','{"kind":"up"}')->>'status','running','Starting another asks before it replaces the running one');
select is(tests.tc('pause')->>'status','ok','Pause');
select ok(tests.timer() ? 'paused_at','held');
select is(tests.tc('resume')->>'status','ok','Resume');
select ok(not (tests.timer() ? 'paused_at'),'running again');
create temporary table before_end as select (tests.timer()->>'ends_at')::timestamptz e;
select is(tests.tc('add','{"seconds":60}')->>'status','ok','Add a minute');
select ok((tests.timer()->>'ends_at')::timestamptz=(select e from before_end)+interval '60 seconds','the end moves a minute later');
select is(tests.tc('add','{"seconds":300}')->>'status','ok','Add five minutes');
select is(tests.tc('add','{"seconds":-60}')->>'status','ok','Take off a minute');
select is((tests.timer()->>'seconds')::integer,600,'5 + 1 + 5 - 1 is ten minutes');
select is(tests.tc('add','{"seconds":120}')->>'status','invalid_request','Only one, five or minus one minute');
select is(tests.tc('reset')->>'status','ok','Reset');
select ok(tests.timer() ? 'paused_at' and (extract(epoch from (tests.timer()->>'ends_at')::timestamptz-(tests.timer()->>'started_at')::timestamptz))::integer=300,'back to the five minutes it was set to, held');
select is(tests.ctl(6,'go_live',jsonb_build_object('session',tests.id(312)))->>'status','ok','A step goes live');
select ok(tests.timer()->>'source'='manual','A timer started by hand keeps running through any step');
select is(tests.tc('start','{"kind":"up","replace":true}')->>'status','ok','Replace it');
select is(tests.timer()->>'kind','up','with a count up');
select is(tests.tc('add','{"seconds":60}')->>'status','ok','Add a minute to a count up');
select ok((tests.timer()->>'started_at')::timestamptz<now()-interval '59 seconds','the start moves back, so it shows a minute more');
select is(tests.tc('stop')->>'status','ok','Stop');
select is(tests.timer(),null,'and it is gone');
select is(tests.tc('pause')->>'status','missing','Nothing to pause');
select is(tests.ctl(7,'go_live',jsonb_build_object('session',tests.id(311)))->>'status','ok','Back to Congregation');
select is(tests.tc('start_step','{"replace":true}')->>'status','ok','Start the live step''s own timer by hand');
select is((tests.timer()->>'from')::uuid,tests.id(311),'from that step');

-- Only the facilitators
select tests.login(3);
select is(tests.tc('stop')->>'status','denied','A participant can''t');
select tests.login(4);
select is(tests.tc('stop')->>'status','denied','nor a TV');
select tests.login(6);
select is(tests.tc('stop')->>'status','denied','nor another engagement''s facilitator');
select tests.login(2);
select is(tests.tc('pause')->>'status','ok','The co-facilitator can');
reset role;
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='timer_control' and p.prosecdef),0,'The public timer control is an invoker wrapper');

select ok((select pg_get_functiondef('private.reset_practice_room()'::regprocedure) like '%set timer=null%'),'Resetting the practice room clears its timer');
select * from finish();
rollback;
