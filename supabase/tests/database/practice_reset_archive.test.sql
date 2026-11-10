begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('8a000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
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


-- The named practice room is the only scheduled-reset target.
insert into engagements(id,church_id,title,type) values('90000000-0000-4000-8000-000000000010',tests.id(20),'Permanent practice','practice');
insert into sessions(id,engagement_id,title) values(tests.id(310),tests.id(10),'Archive session');
insert into private.session_notes(session_id,engagement_id,notes) values(tests.id(310),tests.id(10),'PRIVATE-FACILITATOR-NOTES');
insert into private.vision_outcomes(engagement_id,title) values(tests.id(10),'One outcome'),(tests.id(11),'OTHER-ENGAGEMENT-OUTCOME');
insert into private.lens_sentences(engagement_id,lens,source,text) values(tests.id(10),1,'seeded','HIDDEN-LENS-SENTENCE');
-- A future private field must not become part of an existing archive version.
alter table public.attendees add column archive_future_secret text default 'FUTURE-SECRET';
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='private.practice_reset_runs'::regclass),'Nightly ledger forces RLS');
select ok(not has_function_privilege('authenticated','public.nightly_practice_reset()','execute'),'Browser cannot call nightly reset');
select ok(not has_function_privilege('anon','public.nightly_practice_reset()','execute'),'Anonymous cannot call nightly reset');
select ok(not has_function_privilege('anon','public.engagement_archive(uuid)','execute'),'Anonymous cannot call archive RPC');
set local role authenticated;
select tests.login(1);
select is(public.engagement_archive(tests.id(10))->>'status','denied','Participant cannot archive');
select is(public.reset_practice_room(),false,'Participant still cannot reset practice');
-- User-editable claims cannot make the browser a scheduled service.
select set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(1),'role','service_role','user_metadata',jsonb_build_object('is_admin',true))::text,true);
select is(public.reset_practice_room(),false,'Forged service claims cannot reset');
select tests.login(3);
select is(public.engagement_archive(tests.id(10))->>'status','denied','Other engagement facilitator cannot archive');
select tests.login(4);
select is(public.engagement_archive(tests.id(10))->>'status','denied','Unassigned Clearway user cannot archive');
select tests.login(2);
select is(public.engagement_archive(tests.id(10))->>'status','ok','Lead can archive');
select is(public.engagement_archive(tests.id(10))->>'version','1','Archive has a stable version');
select is(jsonb_array_length(public.engagement_archive(tests.id(10))#>'{records,vision_outcomes}'),1,'Exactly this engagement outcomes');
select is(public.engagement_archive(tests.id(10))#>>'{records,attendees,0,name}','Ann Lee','Full archive includes authorship');
select matches(public.engagement_archive(tests.id(10))::text,'PRIVATE-FACILITATOR-NOTES','Full archive includes private notes');
select doesnt_match(public.engagement_archive(tests.id(10))::text,'OTHER-ENGAGEMENT-OUTCOME','No other engagement records');
select doesnt_match(public.engagement_archive(tests.id(10))::text,'FUTURE-SECRET','Column allowlist excludes future private fields');
select doesnt_match(public.engagement_archive(tests.id(10))::text,'auth_user_id','No auth identity column');
select doesnt_match(public.engagement_archive(tests.id(10))::text,'token_hash','No bearer-token hash columns');
select doesnt_match(public.engagement_archive(tests.id(10))::text,'HIDDEN-LENS-SENTENCE','Archive cannot reveal unopened seeded lens text');
reset role;
insert into private.lens_openings(engagement_id,lens,session_id) values(tests.id(10),1,tests.id(310));
set local role authenticated;
select tests.login(2);
select matches(public.engagement_archive(tests.id(10))::text,'HIDDEN-LENS-SENTENCE','Opened lens sentences can be archived');
reset role;
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(10),tests.id(303),'co_facilitator');
set local role authenticated;
select tests.login(3);
select is(public.engagement_archive(tests.id(10))->>'status','ok','Assigned co-facilitator can archive');
reset role;
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at) values(tests.id(50),'90000000-0000-4000-8000-000000000010',tests.id(1),'Practice participant','ann@example.org',now());
insert into device_sessions(engagement_id,attendee_id,auth_session_id) values('90000000-0000-4000-8000-000000000010',tests.id(50),tests.id(201));
-- Scheduled skips are safe to retry and do not consume the daily reset.
set local role service_role;
select is(public.nightly_practice_reset()->>'status','active','A recently edited practice room is skipped');
reset role;
select is((select count(*)::integer from private.practice_reset_runs),0,'Skipped run is not recorded as reset');
-- Age only test fixture timestamps, bypassing timestamp touch triggers.
set local session_replication_role=replica;
update engagements set updated_at=now()-interval '1 day' where type='practice';
set local session_replication_role=origin;
set local role service_role;
select is(public.nightly_practice_reset()->>'status','active','A signed-in phone prevents a scheduled reset');
reset role;
set local session_replication_role=replica;
update device_sessions set last_seen_at=now()-interval '1 day' where attendee_id=tests.id(50);
set local session_replication_role=origin;
set local role service_role;
select is(public.nightly_practice_reset()->>'status','reset','Service resets the fixed idle practice room');
select is(public.nightly_practice_reset()->>'status','already_reset','Repeated scheduled delivery is harmless');
reset role;
select ok((select deleted from attendees where id=tests.id(50)),'Scheduled reset removes practice attendees');
select ok((select revoked_at is not null from device_sessions where attendee_id=tests.id(50)),'Scheduled reset revokes practice devices and retains audit rows');
select is((select count(*)::integer from auth.sessions where id=tests.id(201)),0,'Scheduled reset invalidates the bound auth session');
select is((select count(*)::integer from private.practice_reset_runs),1,'One successful reset per UTC date');
select is((select count(*)::integer from attendees where engagement_id=tests.id(10) and not deleted),1,'Other engagement attendees remain intact');
select is((select notes from private.session_notes where session_id=tests.id(310)),'PRIVATE-FACILITATOR-NOTES','Other engagement notes remain intact');
select * from finish();
rollback;
