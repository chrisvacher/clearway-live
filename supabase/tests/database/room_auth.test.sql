begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('60000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
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

select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relkind='r' and relname like 'room_auth_%'),'Every private sign-in table forces RLS');
select ok(not has_table_privilege('authenticated','private.room_auth_challenges','select'),'Authenticated callers cannot read code hashes');
select ok(not has_table_privilege('anon','private.room_auth_devices','select'),'Anonymous callers cannot enumerate devices');
select ok(not has_function_privilege('authenticated','public.room_auth(text,jsonb)','execute'),'Browsers cannot call the server proof workflow');
select ok(not has_function_privilege('anon','public.room_auth(text,jsonb)','execute'),'Anonymous callers cannot claim access directly');
select ok(not has_function_privilege('authenticated','private.room_auth_identity(uuid,uuid,text)','execute'),'Auth-owned session validation is server-only');
select ok(not (select prosecdef from pg_proc where oid='public.room_auth(text,jsonb)'::regprocedure),'Exposed server RPC uses invoker privileges');
select ok(not (select prosecdef from pg_proc where oid='public.decide_room_join(uuid,boolean)'::regprocedure),'Exposed approval RPC uses invoker privileges');

set local role service_role;
select is(public.room_auth('init',tests.payload(n))->>'status','ready','Device '||n||' initializes without signing in') from generate_series(1,7)n;
select is(public.room_auth('init',tests.payload(8,11))->>'status','ready','Separate room device initializes');
select is((select count(*)::integer from device_sessions),0,'Page initialization never creates a signed-in device');
select is(public.room_auth('status',tests.payload(1)||jsonb_build_object('proof',repeat('b',64)))->>'status','device_missing','Device id without its secret proves nothing');
select is(public.room_auth('status',tests.payload(1,11))->>'status','device_missing','Device cannot move into a different engagement');
select is(public.room_auth('send',tests.payload(1)||jsonb_build_object('email','ann@example.org','challenge',tests.id(501),'code_hash',repeat('1',64),'link_hash',repeat('2',64)))->>'status','sent','Listed attendee can request a code');
select is(public.room_auth('send',tests.payload(3)||jsonb_build_object('email','missing@example.org','challenge',tests.id(502),'code_hash',repeat('1',64),'link_hash',repeat('2',64)))->>'status','not_listed','Unlisted email receives no challenge');
select is((select count(*)::integer from private.room_auth_challenges),1,'Unlisted request creates no email proof');
select is(public.room_auth('verify',tests.payload(2)||jsonb_build_object('email','ann@example.org','code_hash',repeat('1',64)))->>'status','approved','Code works on a different device');
select is(public.room_auth('verify',tests.payload(3)||jsonb_build_object('email','ann@example.org','code_hash',repeat('1',64)))->>'status','invalid_code','A consumed code cannot be replayed');
select is((select count(*)::integer from device_sessions),0,'Verified proof alone is not a device session');
select set_config('tests.claim',(public.room_auth('prepare_claim',tests.payload(2))->>'claim'),true);
select is(public.room_auth('bind',tests.payload(2)||jsonb_build_object('claim',current_setting('tests.claim'),'user',tests.id(2),'session',tests.id(202)))->>'status','waiting','Google session or wrong email cannot be bound as the attendee');
select is(public.room_auth('bind',tests.payload(2)||jsonb_build_object('claim',current_setting('tests.claim'),'user',tests.id(1),'session',tests.id(201)))->>'status','signed_in','Verified OTP Auth session binds the intended attendee');
select is(public.room_auth('bind',tests.payload(2)||jsonb_build_object('claim',current_setting('tests.claim'),'user',tests.id(1),'session',tests.id(201)))->>'status','waiting','Claim cannot bind twice');
select is((select count(*)::integer from device_sessions),1,'Exactly one binding is created');
select is(public.room_auth('prepare_claim',tests.payload(3))->>'status','waiting','Unverified device cannot request an Auth session');

select is(public.room_auth('send',tests.payload(4)||jsonb_build_object('email','ann@example.org','challenge',tests.id(503),'code_hash',repeat('3',64),'link_hash',repeat('4',64)))->>'status','sent','Another challenge is issued');
select is(public.room_auth('verify',tests.payload(4)||jsonb_build_object('email','ann@example.org','code_hash',repeat('0',64)))->>'status','invalid_code','Wrong attempt '||n||' is rejected') from generate_series(1,5)n;
select is(public.room_auth('verify',tests.payload(5)||jsonb_build_object('email','ann@example.org','code_hash',repeat('3',64)))->>'status','invalid_code','Sixth attempt is refused even from a different device');
select is((select attempts::integer from private.room_auth_challenges where id=tests.id(503)),5,'Attempt count stops at five');
select is(public.room_auth('send',tests.payload(5)||jsonb_build_object('email','ann@example.org','challenge',tests.id(504),'code_hash',repeat('5',64),'link_hash',repeat('6',64)))->>'status','sent','Fresh challenge has its own attempts');
update private.room_auth_challenges set expires_at=now()-interval '1 second' where id=tests.id(504);
select is(public.room_auth('verify',tests.payload(5)||jsonb_build_object('email','ann@example.org','code_hash',repeat('5',64)))->>'status','invalid_code','Expired code is rejected');
select is(public.room_auth('send',tests.payload(6)||jsonb_build_object('email','ann@example.org','challenge',tests.id(505),'code_hash',repeat('7',64),'link_hash',repeat('8',64)))->>'status','sent','Link challenge is issued');
select is((select attempts::integer from private.room_auth_challenges where id=tests.id(505)),0,'Issuing a confirmation link does not consume it');
select is(public.room_auth('verify',tests.payload(6)||jsonb_build_object('challenge',tests.id(505),'link_hash',repeat('8',64)))->>'status','approved','Explicit link confirmation approves that device');
select is(public.room_auth('verify',tests.payload(7)||jsonb_build_object('challenge',tests.id(505),'link_hash',repeat('8',64)))->>'status','invalid_code','Link is single-use');
select set_config('tests.claim',(public.room_auth('prepare_claim',tests.payload(6))->>'claim'),true);
select is(public.room_auth('bind',tests.payload(6)||jsonb_build_object('claim',current_setting('tests.claim'),'user',tests.id(1),'session',tests.id(211)))->>'status','signed_in','Second device signs in without replacing the first');
select is((select count(*)::integer from device_sessions where revoked_at is null),2,'Both devices remain signed in');

select is(private.room_rate_limit(repeat('b',64),3,600),true,'Rate limit permits request '||n) from generate_series(1,3)n;
select is(private.room_rate_limit(repeat('b',64),3,600),false,'Rate limit refuses request four');
update private.room_auth_limits set expires_at=now()-interval '1 second' where bucket=repeat('b',64);
select is(private.room_rate_limit(repeat('b',64),3,600),true,'Rate limit resets after its window');
select is(public.room_auth('join',tests.payload(7)||jsonb_build_object('name','New guest','email','guest@example.org'))->>'status','pending','Unlisted person can ask to join');
reset role;
select is((select count(*)::integer from attendees),2,'Join request does not add an attendee before approval');
select set_config('tests.join',(select id::text from join_requests where device_id=tests.id(107)),true);
set local role authenticated;
select tests.login(1);
select is((select count(*)::integer from attendees),1,'Participant sees only their own attendee record');
select is((select count(*)::integer from device_sessions),1,'Participant sees only the current device session');
select is((select count(*)::integer from churches),0,'Participant cannot read setup church data');
select is((select count(*)::integer from public.room_presence(tests.id(10))),0,'Participant cannot read presence or roster');
select is(public.decide_room_join(current_setting('tests.join')::uuid,true),false,'Participant cannot approve a join request');
select is(public.sign_in_room_device(tests.id(10),tests.id(30),'AAAAAAAG'),false,'Participant cannot sign in another phone');
select throws_ok($$select public.room_auth('prepare_claim',tests.payload(7))$$,'42501',null,'Participant cannot invoke the privileged sign-in workflow');
select tests.login(3);
select is(public.decide_room_join(current_setting('tests.join')::uuid,true),false,'Facilitator from a different engagement cannot approve');
select tests.login(4);
select is(public.decide_room_join(current_setting('tests.join')::uuid,true),false,'Unassigned Clearway user cannot approve');
select tests.login(2);
select is(public.sign_in_room_device(tests.id(10),tests.id(31),'AAAAAAAG'),false,'Facilitator cannot bind an attendee from another engagement');
select is(public.sign_in_room_device(tests.id(10),tests.id(30),'AAAAAAAH'),false,'Facilitator cannot claim a device in another engagement');
select is(public.decide_room_join(current_setting('tests.join')::uuid,true),true,'Assigned facilitator approves the waiting phone');
select is(public.decide_room_join(current_setting('tests.join')::uuid,true),false,'A decided request cannot be approved again');
select is((select count(*)::integer from attendees),2,'Approved guest is visible without revealing another engagement');
select is(public.sign_in_room_device(tests.id(10),tests.id(30),'AAAA AAAD'),true,'Facilitator can approve a listed person by device code');
select is((select device_count::integer from public.room_presence(tests.id(10)) where attendee_id=tests.id(30)),2,'Door list counts actual active Auth bindings');
reset role;
set local role service_role;
select is((public.room_auth('status',tests.payload(7))->>'can_claim')::boolean,true,'Approved phone can continue without another user step');
select is((public.room_auth('status',tests.payload(4))->>'can_claim')::boolean,true,'Manual phone approval can continue');
reset role;
delete from auth.sessions where id=tests.id(211);
set local role authenticated;
select tests.login(2);
select is((select device_count::integer from public.room_presence(tests.id(10)) where attendee_id=tests.id(30)),1,'Revoked Auth session no longer counts as signed in');
reset role;
update attendees set email='changed@example.org' where id=tests.id(30);
set local role service_role;
select is(public.room_auth('status',tests.payload(4))->>'status','device_missing','Changing attendee identity revokes outstanding manual approval');
reset role;
update engagements set status='closed' where id=tests.id(10);
set local role service_role;
select is(public.room_auth('prepare_claim',tests.payload(7))->>'status','closed','Closing engagement prevents a pending approval claim');
reset role;
update engagements set status='pre_call' where id=tests.id(10);
set local role service_role;
select is(public.room_auth('status',tests.payload(7))->>'status','device_missing','Reopening does not resurrect a previous room grant');
reset role;
select * from finish();
rollback;
