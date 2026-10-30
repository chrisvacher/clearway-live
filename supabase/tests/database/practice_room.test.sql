begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('82000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
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

insert into engagements(id,church_id,title,type) values('90000000-0000-4000-8000-000000000010',tests.id(20),'Permanent practice','practice');
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values('90000000-0000-4000-8000-000000000010',tests.id(302),'lead');
create function tests.practice_payload() returns jsonb language sql as $$ select tests.payload(1)||jsonb_build_object('engagement','90000000-0000-4000-8000-000000000010','name','Practice guest') $$;
grant execute on function tests.practice_payload() to authenticated,service_role,anon;
select ok(not has_function_privilege('authenticated','public.practice_guest(jsonb)','execute'),'Browser cannot grant its own practice membership');
select ok(not has_function_privilege('anon','public.practice_guest(jsonb)','execute'),'Unsigned phone must use the server proof workflow');
set local role service_role;
select is(public.room_auth('init',tests.practice_payload())->>'status','ready','Practice device initializes');
select is(public.practice_guest(tests.payload(1)||jsonb_build_object('name','Injected guest'))->>'status','invalid_request','No-email join is limited to the permanent practice room');
select is(public.practice_guest(tests.practice_payload()||jsonb_build_object('proof',repeat('b',64)))->>'status','device_missing','Practice still requires its own device secret');
select is(public.practice_guest(tests.practice_payload())->>'status','approved','Name-only guest obtains a practice grant');
select is((select email from attendees where engagement_id='90000000-0000-4000-8000-000000000010'),tests.id(101)::text||'@practice.clearway.invalid','Practice identity is generated per device');
select is((select count(*)::integer from device_sessions),0,'A guest grant alone creates no signed-in device');
select set_config('tests.practice_claim',public.room_auth('prepare_claim',tests.practice_payload())->>'claim',true);
reset role;
select is((select count(*)::integer from attendees where engagement_id=tests.id(11)),1,'Joining practice does not alter another engagement');
set local role authenticated;
select tests.login(1);
select is(public.reset_practice_room(),false,'Participant cannot reset practice');
select tests.login(3);
select is(public.reset_practice_room(),false,'Facilitator assigned elsewhere cannot reset practice');
select tests.login(4);
select is(public.reset_practice_room(),false,'Unassigned Clearway user cannot reset practice');
select tests.login(2);
select is(public.reset_practice_room(),true,'Assigned Google facilitator can reset practice');
reset role;
select is((select count(*)::integer from attendees where engagement_id='90000000-0000-4000-8000-000000000010' and not deleted),0,'Reset soft-deletes all practice guests');
select is((select count(*)::integer from attendees where engagement_id='90000000-0000-4000-8000-000000000010' and deleted),1,'Reset preserves guest audit history');
select is((select count(*)::integer from attendees where engagement_id=tests.id(11) and not deleted),1,'Reset preserves other engagement attendees');
set local role service_role;
select is(public.room_auth('bind',tests.practice_payload()||jsonb_build_object('claim',current_setting('tests.practice_claim'),'user',tests.id(1),'session',tests.id(201)))->>'status','device_missing','A claim prepared before reset cannot resurrect the guest');
select is(public.practice_guest(tests.practice_payload())->>'status','device_missing','Old device secret cannot rejoin after reset');
reset role;
select is((select count(*)::integer from auth.sessions),5,'Reset leaves unrelated Auth sessions intact');
select * from finish();
rollback;
