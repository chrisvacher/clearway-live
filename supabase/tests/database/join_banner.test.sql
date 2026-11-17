begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('8e000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
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

create function tests.banner() returns boolean language sql security definer set search_path='' as $$ select join_banner from public.room_states where engagement_id='8e000000-0000-4000-8000-000000000100' $$;
create function tests.jb(p_on boolean) returns jsonb language sql as $$ select public.join_banner_control('8e000000-0000-4000-8000-000000000100',p_on) $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;
-- November 17: the join banner, a toggle over whatever is live.
select is(tests.banner(),false,'The banner starts off');
set local role authenticated; select tests.login(1);
select is(tests.ctl(1,'go_live',jsonb_build_object('session',tests.id(311)))->>'status','ok','A step goes live');
select is(tests.jb(true)->>'status','ok','The facilitator turns the banner on');
select is(tests.banner(),true,'It is on');
select is(public.live_snapshot(tests.id(100))->'state'->'join_banner','true'::jsonb,'The room state carries it');
select is(tests.live(),tests.id(311),'The live step stays on the TV');
select is(tests.jb(true)->>'status','unchanged','Turning it on again changes nothing');
select is(tests.jb(null)->>'status','invalid_request','On or off, nothing else');
select tests.login(3);
select is(tests.jb(false)->>'status','denied','A participant can''t');
select tests.login(4);
select is(tests.jb(false)->>'status','denied','nor a TV');
select tests.login(6);
select is(tests.jb(false)->>'status','denied','nor another engagement''s facilitator');
select tests.login(2);
select is(tests.jb(false)->>'status','ok','The co-facilitator turns it off');
select is(tests.banner(),false,'It is off');
select is(public.live_snapshot(tests.id(100))->'state'->'join_banner','false'::jsonb,'and the room state says so');
reset role;
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='join_banner_control' and p.prosecdef),0,'The public banner control is an invoker wrapper');
select ok(not has_function_privilege('anon','public.join_banner_control(uuid,boolean)','execute'),'Anonymous callers cannot press it');
select * from finish();
rollback;
