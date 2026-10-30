begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Test-only helpers and data all roll back. No production data or credentials.
create schema tests;
grant usage on schema tests to authenticated, anon, service_role;
create function tests.uid(n integer) returns uuid language sql immutable as $$
  select ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function tests.id(n integer) returns uuid language sql immutable as $$
  select ('20000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function tests.sid(n integer) returns uuid language sql immutable as $$
  select ('30000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function tests.login(n integer, provider text default 'email', session_n integer default null,
  claimed_role text default 'participant') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', tests.uid(n), 'role', 'authenticated',
    'session_id', tests.sid(coalesce(session_n,n)),
    'app_metadata', jsonb_build_object('provider', provider),
    'user_metadata', jsonb_build_object('role', claimed_role, 'is_admin', true)
  )::text, true);
end
$$;

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select tests.uid(n), case when n = 9 then 'outsider@example.org' else 'person' || n || '@clearway.co' end,
  case when n = 14 then null else now() end,
  jsonb_build_object('provider', case when n in (5,6,7,12) then 'email' else 'google' end),
  '{"is_admin":true,"role":"lead"}'::jsonb
from generate_series(1,14) n;
insert into auth.identities(user_id, provider, provider_id, identity_data)
select id, 'google', id::text, jsonb_build_object('email',email,'email_verified',true)
from auth.users where id in (select tests.uid(n) from unnest(array[1,2,3,4,8,9,10,11,13,14]) n);
insert into auth.sessions(id,user_id,not_after)
select tests.sid(n), tests.uid(n), null from generate_series(1,14) n;
insert into auth.sessions(id,user_id,not_after) values
  (tests.sid(55),tests.uid(5),null), (tests.sid(105),tests.uid(5),null),
  (tests.sid(205),tests.uid(5),null), (tests.sid(305),tests.uid(5),null),
  (tests.sid(405),tests.uid(5),null), (tests.sid(505),tests.uid(5),null),
  (tests.sid(605),tests.uid(5),null), (tests.sid(16),tests.uid(2),null),
  (tests.sid(17),tests.uid(2),null), (tests.sid(18),tests.uid(2),null);
-- Actual login proof is server-owned Auth data, independent of account provider metadata.
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method)
select gen_random_uuid(),s.id,now(),now(),case
  when s.id=tests.sid(17) then 'otp'
  when s.user_id in (select tests.uid(n) from unnest(array[1,2,3,4,8,9,10,11,14]) n) then 'oauth'
  else 'otp' end
from auth.sessions s where s.id <> tests.sid(18);

insert into churches(id,name,timezone,team_hub_client_id) values
  (tests.id(101),'Church A','America/Toronto',tests.id(1001)),
  (tests.id(102),'Church B','America/Chicago',tests.id(1002)),
  (tests.id(103),'Deleted church','America/Toronto',tests.id(1003));
update churches set deleted = true where id = tests.id(103);
insert into engagements(id,church_id,title,status,team_hub_engagement_id) values
  (tests.id(201),tests.id(101),'Engagement A','setup',tests.id(2001)),
  (tests.id(202),tests.id(102),'Engagement B','setup',tests.id(2002)),
  (tests.id(203),tests.id(101),'Closed engagement','closed',tests.id(2003)),
  (tests.id(204),tests.id(101),'Deleted engagement','setup',tests.id(2004)),
  (tests.id(205),tests.id(103),'Engagement at deleted church','setup',tests.id(2005));
update engagements set deleted = true where id = tests.id(204);
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id)
select tests.id(300+n),tests.uid(n),'Clearway user '||n,'person'||n||'@clearway.co',
  n in (1,9), tests.id(3000+n)
from unnest(array[1,2,3,4,9,10,11,13,14]) n;
update clearway_users set deleted=true where id = tests.id(311);
insert into engagement_facilitators(id,engagement_id,clearway_user_id,role) values
  (tests.id(701),tests.id(201),tests.id(302),'lead'),
  (tests.id(702),tests.id(201),tests.id(303),'co_facilitator'),
  (tests.id(703),tests.id(202),tests.id(304),'lead'),
  (tests.id(704),tests.id(203),tests.id(302),'lead'),
  (tests.id(705),tests.id(204),tests.id(302),'lead'),
  (tests.id(706),tests.id(201),tests.id(310),'co_facilitator'),
  (tests.id(707),tests.id(201),tests.id(311),'co_facilitator');
update engagement_facilitators set deleted=true where id = tests.id(706);
insert into attendees(id,engagement_id,auth_user_id,name,email,room_role,verified_at) values
  (tests.id(401),tests.id(201),tests.uid(5),'Participant A','participant@example.org','participant',now()),
  (tests.id(402),tests.id(201),tests.uid(6),'Scribe A','scribe@example.org','scribe',now()),
  (tests.id(404),tests.id(202),tests.uid(7),'Participant B','other@example.org','participant',now()),
  (tests.id(405),tests.id(203),tests.uid(5),'Participant closed','closed@example.org','participant',now()),
  (tests.id(406),tests.id(201),tests.uid(12),'Deleted attendee','deleted@example.org','participant',now()),
  (tests.id(407),tests.id(201),tests.uid(8),'Unverified attendee','unverified@example.org','participant',null),
  (tests.id(409),tests.id(205),tests.uid(5),'Deleted church attendee','deleted-church@example.org','participant',now()),
  (tests.id(410),tests.id(202),tests.uid(5),'Second engagement attendee','second-room@example.org','participant',now()),
  (tests.id(411),tests.id(204),tests.uid(5),'Deleted engagement attendee','deleted-engagement@example.org','participant',now());
update attendees set deleted=true where id = tests.id(406);
insert into device_sessions(id,engagement_id,attendee_id,auth_session_id,revoked_at,deleted) values
  (tests.id(501),tests.id(201),tests.id(401),tests.sid(5),null,false),
  (tests.id(502),tests.id(201),tests.id(402),tests.sid(6),null,false),
  (tests.id(503),tests.id(202),tests.id(404),tests.sid(7),null,false),
  (tests.id(504),tests.id(203),tests.id(405),tests.sid(55),null,false),
  (tests.id(505),tests.id(201),tests.id(401),tests.sid(105),now(),false),
  (tests.id(506),tests.id(201),tests.id(401),tests.sid(205),null,true),
  (tests.id(507),tests.id(201),tests.id(401),tests.sid(305),null,false),
  (tests.id(508),tests.id(201),tests.id(407),tests.sid(8),null,false),
  (tests.id(509),tests.id(202),tests.id(410),tests.sid(405),null,false),
  (tests.id(510),tests.id(204),tests.id(411),tests.sid(505),null,false),
  (tests.id(511),tests.id(205),tests.id(409),tests.sid(605),null,false),
  (tests.id(512),tests.id(201),tests.id(406),tests.sid(12),null,false);
insert into join_requests(id,engagement_id,name,email,device_id,status,decided_at,decided_by,attendee_id) values
  (tests.id(601),tests.id(201),'Waiting A','waiting@example.org',tests.id(8001),'pending',null,null,null),
  (tests.id(602),tests.id(201),'Approved A','approved@example.org',tests.id(8002),'approved',now(),tests.id(302),tests.id(401)),
  (tests.id(603),tests.id(202),'Waiting B','waitingb@example.org',tests.id(8003),'pending',null,null,null),
  (tests.id(604),tests.id(203),'Waiting closed','waitingclosed@example.org',tests.id(8004),'pending',null,null,null),
  (tests.id(605),tests.id(201),'Deleted request','deletedrequest@example.org',tests.id(8005),'pending',null,null,null);
update join_requests set deleted=true where id=tests.id(605);

select tables_are('public', array['churches','engagements','clearway_users','engagement_facilitators','attendees','join_requests','device_sessions'], 'Only the seven milestone 1 tables are created');

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.churches'::regclass), 'churches: RLS enabled and forced');
select col_not_null('public','churches','created_at','churches: created time is mandatory');
select col_not_null('public','churches','updated_at','churches: updated time is mandatory');
select col_not_null('public','churches','deleted','churches: soft delete flag is mandatory');
select ok(not has_table_privilege('authenticated','public.churches','DELETE'), 'churches: browser cannot hard delete');
select ok(not has_table_privilege('anon','public.churches','SELECT'), 'churches: unsigned browser cannot read');

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.engagements'::regclass), 'engagements: RLS enabled and forced');
select col_not_null('public','engagements','created_at','engagements: created time is mandatory');
select col_not_null('public','engagements','updated_at','engagements: updated time is mandatory');
select col_not_null('public','engagements','deleted','engagements: soft delete flag is mandatory');
select ok(not has_table_privilege('authenticated','public.engagements','DELETE'), 'engagements: browser cannot hard delete');
select ok(not has_table_privilege('anon','public.engagements','SELECT'), 'engagements: unsigned browser cannot read');

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.clearway_users'::regclass), 'clearway_users: RLS enabled and forced');
select col_not_null('public','clearway_users','created_at','clearway_users: created time is mandatory');
select col_not_null('public','clearway_users','updated_at','clearway_users: updated time is mandatory');
select col_not_null('public','clearway_users','deleted','clearway_users: soft delete flag is mandatory');
select ok(not has_table_privilege('authenticated','public.clearway_users','DELETE'), 'clearway_users: browser cannot hard delete');
select ok(not has_table_privilege('anon','public.clearway_users','SELECT'), 'clearway_users: unsigned browser cannot read');

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.engagement_facilitators'::regclass), 'engagement_facilitators: RLS enabled and forced');
select col_not_null('public','engagement_facilitators','created_at','engagement_facilitators: created time is mandatory');
select col_not_null('public','engagement_facilitators','updated_at','engagement_facilitators: updated time is mandatory');
select col_not_null('public','engagement_facilitators','deleted','engagement_facilitators: soft delete flag is mandatory');
select ok(not has_table_privilege('authenticated','public.engagement_facilitators','DELETE'), 'engagement_facilitators: browser cannot hard delete');
select ok(not has_table_privilege('anon','public.engagement_facilitators','SELECT'), 'engagement_facilitators: unsigned browser cannot read');

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.attendees'::regclass), 'attendees: RLS enabled and forced');
select col_not_null('public','attendees','created_at','attendees: created time is mandatory');
select col_not_null('public','attendees','updated_at','attendees: updated time is mandatory');
select col_not_null('public','attendees','deleted','attendees: soft delete flag is mandatory');
select ok(not has_table_privilege('authenticated','public.attendees','DELETE'), 'attendees: browser cannot hard delete');
select ok(not has_table_privilege('anon','public.attendees','SELECT'), 'attendees: unsigned browser cannot read');

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.join_requests'::regclass), 'join_requests: RLS enabled and forced');
select col_not_null('public','join_requests','created_at','join_requests: created time is mandatory');
select col_not_null('public','join_requests','updated_at','join_requests: updated time is mandatory');
select col_not_null('public','join_requests','deleted','join_requests: soft delete flag is mandatory');
select ok(not has_table_privilege('authenticated','public.join_requests','DELETE'), 'join_requests: browser cannot hard delete');
select ok(not has_table_privilege('anon','public.join_requests','SELECT'), 'join_requests: unsigned browser cannot read');

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.device_sessions'::regclass), 'device_sessions: RLS enabled and forced');
select col_not_null('public','device_sessions','created_at','device_sessions: created time is mandatory');
select col_not_null('public','device_sessions','updated_at','device_sessions: updated time is mandatory');
select col_not_null('public','device_sessions','deleted','device_sessions: soft delete flag is mandatory');
select ok(not has_table_privilege('authenticated','public.device_sessions','DELETE'), 'device_sessions: browser cannot hard delete');
select ok(not has_table_privilege('anon','public.device_sessions','SELECT'), 'device_sessions: unsigned browser cannot read');

select ok(not has_schema_privilege('anon','private','USAGE'),'Anonymous role cannot use the private schema');
select ok(not has_schema_privilege('authenticated','public','CREATE'),'Browser cannot shadow schema objects');
select ok(not has_function_privilege('anon','private.is_admin()','EXECUTE'),'Anonymous caller cannot invoke admin lookup');
select ok(not has_function_privilege('authenticated','private.revoke_closed_engagement_devices()','EXECUTE'),'Browser cannot directly run closure trigger');
select ok(not has_column_privilege('authenticated','public.attendees','auth_user_id','UPDATE'),'Browser cannot rebind attendee identity');
select ok(not has_column_privilege('authenticated','public.attendees','verified_at','UPDATE'),'Browser cannot mark itself verified');
select ok(not has_table_privilege('authenticated','public.device_sessions','INSERT'),'Browser cannot issue a device session');
select ok(not has_table_privilege('authenticated','public.join_requests','INSERT'),'Unsigned join submission must use the server');
select ok(not has_table_privilege('authenticated','public.join_requests','UPDATE'),'Join approval and binding must use one server transaction');
select is((select count(*) from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace
  and not exists (select 1 from pg_index i where i.indrelid=c.conrelid
    and i.indpred is null and (i.indkey::smallint[])[0] = c.conkey[1])), 0::bigint,
  'Every foreign key has an index beginning with its referencing column');

-- Clearway admin
reset role;
select tests.login(1, 'google', null, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'values (tests.id(101)),(tests.id(102)),(tests.id(103))', 'Clearway admin: exact visible churches');

select results_eq('select id from public.engagements order by id', 'values (tests.id(201)),(tests.id(202)),(tests.id(203)),(tests.id(204)),(tests.id(205))', 'Clearway admin: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'values (tests.id(301)),(tests.id(302)),(tests.id(303)),(tests.id(304)),(tests.id(309)),(tests.id(310)),(tests.id(311)),(tests.id(313)),(tests.id(314))', 'Clearway admin: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'values (tests.id(701)),(tests.id(702)),(tests.id(703)),(tests.id(704)),(tests.id(705)),(tests.id(706)),(tests.id(707))', 'Clearway admin: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'values (tests.id(401)),(tests.id(402)),(tests.id(404)),(tests.id(405)),(tests.id(406)),(tests.id(407)),(tests.id(409)),(tests.id(410)),(tests.id(411))', 'Clearway admin: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'values (tests.id(601)),(tests.id(602)),(tests.id(603)),(tests.id(604)),(tests.id(605))', 'Clearway admin: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'values (tests.id(501)),(tests.id(502)),(tests.id(503)),(tests.id(504)),(tests.id(505)),(tests.id(506)),(tests.id(507)),(tests.id(508)),(tests.id(509)),(tests.id(510)),(tests.id(511)),(tests.id(512))', 'Clearway admin: exact visible device_sessions');

-- Lead A
reset role;
select tests.login(2, 'google', null, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'values (tests.id(101))', 'Lead A: exact visible churches');

select results_eq('select id from public.engagements order by id', 'values (tests.id(201)),(tests.id(203))', 'Lead A: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'values (tests.id(301)),(tests.id(302)),(tests.id(303)),(tests.id(304)),(tests.id(309)),(tests.id(310)),(tests.id(313)),(tests.id(314))', 'Lead A: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'values (tests.id(701)),(tests.id(702)),(tests.id(704)),(tests.id(707))', 'Lead A: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'values (tests.id(401)),(tests.id(402)),(tests.id(405)),(tests.id(407))', 'Lead A: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'values (tests.id(601)),(tests.id(602)),(tests.id(604))', 'Lead A: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'values (tests.id(501)),(tests.id(502)),(tests.id(504)),(tests.id(505)),(tests.id(507)),(tests.id(508)),(tests.id(512))', 'Lead A: exact visible device_sessions');

-- Co-facilitator A
reset role;
select tests.login(3, 'google', null, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'values (tests.id(101))', 'Co-facilitator A: exact visible churches');

select results_eq('select id from public.engagements order by id', 'values (tests.id(201))', 'Co-facilitator A: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'values (tests.id(301)),(tests.id(302)),(tests.id(303)),(tests.id(304)),(tests.id(309)),(tests.id(310)),(tests.id(313)),(tests.id(314))', 'Co-facilitator A: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'values (tests.id(701)),(tests.id(702)),(tests.id(707))', 'Co-facilitator A: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'values (tests.id(401)),(tests.id(402)),(tests.id(407))', 'Co-facilitator A: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'values (tests.id(601)),(tests.id(602))', 'Co-facilitator A: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'values (tests.id(501)),(tests.id(502)),(tests.id(505)),(tests.id(507)),(tests.id(508)),(tests.id(512))', 'Co-facilitator A: exact visible device_sessions');

-- Lead B
reset role;
select tests.login(4, 'google', null, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'values (tests.id(102))', 'Lead B: exact visible churches');

select results_eq('select id from public.engagements order by id', 'values (tests.id(202))', 'Lead B: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'values (tests.id(301)),(tests.id(302)),(tests.id(303)),(tests.id(304)),(tests.id(309)),(tests.id(310)),(tests.id(313)),(tests.id(314))', 'Lead B: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'values (tests.id(703))', 'Lead B: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'values (tests.id(404)),(tests.id(410))', 'Lead B: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'values (tests.id(603))', 'Lead B: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'values (tests.id(503)),(tests.id(509))', 'Lead B: exact visible device_sessions');

-- Participant A
reset role;
select tests.login(5, 'email', null, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Participant A: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Participant A: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Participant A: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Participant A: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'values (tests.id(401))', 'Participant A: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Participant A: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'values (tests.id(501))', 'Participant A: exact visible device_sessions');

-- Scribe A
reset role;
select tests.login(6, 'email', null, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Scribe A: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Scribe A: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Scribe A: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Scribe A: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'values (tests.id(402))', 'Scribe A: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Scribe A: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'values (tests.id(502))', 'Scribe A: exact visible device_sessions');

-- Participant B
reset role;
select tests.login(7, 'email', null, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Participant B: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Participant B: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Participant B: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Participant B: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'values (tests.id(404))', 'Participant B: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Participant B: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'values (tests.id(503))', 'Participant B: exact visible device_sessions');

-- Unlisted Clearway Google account
reset role;
select tests.login(8, 'google', null, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Unlisted Clearway Google account: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Unlisted Clearway Google account: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Unlisted Clearway Google account: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Unlisted Clearway Google account: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'select null::uuid where false', 'Unlisted Clearway Google account: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Unlisted Clearway Google account: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'select null::uuid where false', 'Unlisted Clearway Google account: exact visible device_sessions');

-- Non-Clearway identity linked to an admin row
reset role;
select tests.login(9, 'google', null, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Non-Clearway identity linked to an admin row: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Non-Clearway identity linked to an admin row: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Non-Clearway identity linked to an admin row: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Non-Clearway identity linked to an admin row: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'select null::uuid where false', 'Non-Clearway identity linked to an admin row: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Non-Clearway identity linked to an admin row: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'select null::uuid where false', 'Non-Clearway identity linked to an admin row: exact visible device_sessions');

-- Unassigned facilitator with deleted assignment
reset role;
select tests.login(10, 'google', null, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Unassigned facilitator with deleted assignment: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Unassigned facilitator with deleted assignment: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'values (tests.id(301)),(tests.id(302)),(tests.id(303)),(tests.id(304)),(tests.id(309)),(tests.id(310)),(tests.id(313)),(tests.id(314))', 'Unassigned facilitator with deleted assignment: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Unassigned facilitator with deleted assignment: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'select null::uuid where false', 'Unassigned facilitator with deleted assignment: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Unassigned facilitator with deleted assignment: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'select null::uuid where false', 'Unassigned facilitator with deleted assignment: exact visible device_sessions');

-- Deleted Clearway user
reset role;
select tests.login(11, 'google', null, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Deleted Clearway user: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Deleted Clearway user: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Deleted Clearway user: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Deleted Clearway user: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'select null::uuid where false', 'Deleted Clearway user: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Deleted Clearway user: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'select null::uuid where false', 'Deleted Clearway user: exact visible device_sessions');

-- TV identity
reset role;
select tests.login(12, 'email', null, 'tv');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'TV identity: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'TV identity: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'TV identity: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'TV identity: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'select null::uuid where false', 'TV identity: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'TV identity: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'select null::uuid where false', 'TV identity: exact visible device_sessions');

-- Elder shared-link identity
reset role;
select tests.login(12, 'email', null, 'board');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Elder shared-link identity: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Elder shared-link identity: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Elder shared-link identity: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Elder shared-link identity: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'select null::uuid where false', 'Elder shared-link identity: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Elder shared-link identity: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'select null::uuid where false', 'Elder shared-link identity: exact visible device_sessions');

-- Congregation identity
reset role;
select tests.login(12, 'email', null, 'congregation');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Congregation identity: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Congregation identity: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Congregation identity: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Congregation identity: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'select null::uuid where false', 'Congregation identity: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Congregation identity: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'select null::uuid where false', 'Congregation identity: exact visible device_sessions');

-- Google-linked account using email sign-in
reset role;
select tests.login(13, 'email', null, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Google-linked account using email sign-in: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Google-linked account using email sign-in: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Google-linked account using email sign-in: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Google-linked account using email sign-in: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'select null::uuid where false', 'Google-linked account using email sign-in: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Google-linked account using email sign-in: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'select null::uuid where false', 'Google-linked account using email sign-in: exact visible device_sessions');

-- Unconfirmed Google account
reset role;
select tests.login(14, 'google', null, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Unconfirmed Google account: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Unconfirmed Google account: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Unconfirmed Google account: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Unconfirmed Google account: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'select null::uuid where false', 'Unconfirmed Google account: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Unconfirmed Google account: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'select null::uuid where false', 'Unconfirmed Google account: exact visible device_sessions');

-- Forged admin user_metadata
reset role;
select tests.login(5, 'email', null, 'admin');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Forged admin user_metadata: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Forged admin user_metadata: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Forged admin user_metadata: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Forged admin user_metadata: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'values (tests.id(401))', 'Forged admin user_metadata: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Forged admin user_metadata: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'values (tests.id(501))', 'Forged admin user_metadata: exact visible device_sessions');

-- Team facilitator claim
reset role;
select tests.login(5, 'email', null, 'team_facilitator');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Team facilitator claim: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Team facilitator claim: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Team facilitator claim: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Team facilitator claim: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'values (tests.id(401))', 'Team facilitator claim: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Team facilitator claim: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'values (tests.id(501))', 'Team facilitator claim: exact visible device_sessions');

-- Closed room session
reset role;
select tests.login(5, 'email', 55, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Closed room session: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Closed room session: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Closed room session: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Closed room session: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'select null::uuid where false', 'Closed room session: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Closed room session: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'select null::uuid where false', 'Closed room session: exact visible device_sessions');

-- Revoked room device
reset role;
select tests.login(5, 'email', 105, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Revoked room device: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Revoked room device: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Revoked room device: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Revoked room device: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'select null::uuid where false', 'Revoked room device: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Revoked room device: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'select null::uuid where false', 'Revoked room device: exact visible device_sessions');

-- Deleted room device
reset role;
select tests.login(5, 'email', 205, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Deleted room device: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Deleted room device: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Deleted room device: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Deleted room device: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'select null::uuid where false', 'Deleted room device: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Deleted room device: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'select null::uuid where false', 'Deleted room device: exact visible device_sessions');

-- Second signed-in phone
reset role;
select tests.login(5, 'email', 305, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Second signed-in phone: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Second signed-in phone: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Second signed-in phone: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Second signed-in phone: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'values (tests.id(401))', 'Second signed-in phone: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Second signed-in phone: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'values (tests.id(507))', 'Second signed-in phone: exact visible device_sessions');

-- Other engagement on another device
reset role;
select tests.login(5, 'email', 405, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Other engagement on another device: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Other engagement on another device: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Other engagement on another device: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Other engagement on another device: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'values (tests.id(410))', 'Other engagement on another device: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Other engagement on another device: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'values (tests.id(509))', 'Other engagement on another device: exact visible device_sessions');

-- Deleted engagement
reset role;
select tests.login(5, 'email', 505, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Deleted engagement: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Deleted engagement: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Deleted engagement: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Deleted engagement: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'select null::uuid where false', 'Deleted engagement: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Deleted engagement: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'select null::uuid where false', 'Deleted engagement: exact visible device_sessions');

-- Unregistered device
reset role;
select tests.login(5, 'email', 999, 'participant');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Unregistered device: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Unregistered device: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Unregistered device: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Unregistered device: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'select null::uuid where false', 'Unregistered device: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Unregistered device: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'select null::uuid where false', 'Unregistered device: exact visible device_sessions');

-- Session id owned by someone else
reset role;
select tests.login(5, 'google', 2, 'admin');
set local role authenticated;

select results_eq('select id from public.churches order by id', 'select null::uuid where false', 'Session id owned by someone else: exact visible churches');

select results_eq('select id from public.engagements order by id', 'select null::uuid where false', 'Session id owned by someone else: exact visible engagements');

select results_eq('select id from public.clearway_users order by id', 'select null::uuid where false', 'Session id owned by someone else: exact visible clearway_users');

select results_eq('select id from public.engagement_facilitators order by id', 'select null::uuid where false', 'Session id owned by someone else: exact visible engagement_facilitators');

select results_eq('select id from public.attendees order by id', 'select null::uuid where false', 'Session id owned by someone else: exact visible attendees');

select results_eq('select id from public.join_requests order by id', 'select null::uuid where false', 'Session id owned by someone else: exact visible join_requests');

select results_eq('select id from public.device_sessions order by id', 'select null::uuid where false', 'Session id owned by someone else: exact visible device_sessions');

reset role; select tests.login(5,'email',605); set local role authenticated;
select is((select count(*) from churches),0::bigint,'Deleted church device: no churches');
select is((select count(*) from engagements),0::bigint,'Deleted church device: no engagements');
select is((select count(*) from clearway_users),0::bigint,'Deleted church device: no clearway_users');
select is((select count(*) from engagement_facilitators),0::bigint,'Deleted church device: no engagement_facilitators');
select is((select count(*) from attendees),0::bigint,'Deleted church device: no attendees');
select is((select count(*) from join_requests),0::bigint,'Deleted church device: no join_requests');
select is((select count(*) from device_sessions),0::bigint,'Deleted church device: no device_sessions');
reset role; select tests.login(2,'email',16); set local role authenticated;
select results_eq('select id from churches order by id','values (tests.id(101))','Google OAuth with an original email provider: exact churches');
select results_eq('select id from engagements order by id','values (tests.id(201)),(tests.id(203))','Google OAuth with an original email provider: exact engagements');
select results_eq('select id from clearway_users order by id','values (tests.id(301)),(tests.id(302)),(tests.id(303)),(tests.id(304)),(tests.id(309)),(tests.id(310)),(tests.id(313)),(tests.id(314))','Google OAuth with an original email provider: exact clearway_users');
select results_eq('select id from engagement_facilitators order by id','values (tests.id(701)),(tests.id(702)),(tests.id(704)),(tests.id(707))','Google OAuth with an original email provider: exact engagement_facilitators');
select results_eq('select id from attendees order by id','values (tests.id(401)),(tests.id(402)),(tests.id(405)),(tests.id(407))','Google OAuth with an original email provider: exact attendees');
select results_eq('select id from join_requests order by id','values (tests.id(601)),(tests.id(602)),(tests.id(604))','Google OAuth with an original email provider: exact join_requests');
select results_eq('select id from device_sessions order by id','values (tests.id(501)),(tests.id(502)),(tests.id(504)),(tests.id(505)),(tests.id(507)),(tests.id(508)),(tests.id(512))','Google OAuth with an original email provider: exact device_sessions');
reset role; select tests.login(2,'google',17); set local role authenticated;
select results_eq('select id from churches order by id','select null::uuid where false','Email OTP with Google account metadata: exact churches');
select results_eq('select id from engagements order by id','select null::uuid where false','Email OTP with Google account metadata: exact engagements');
select results_eq('select id from clearway_users order by id','select null::uuid where false','Email OTP with Google account metadata: exact clearway_users');
select results_eq('select id from engagement_facilitators order by id','select null::uuid where false','Email OTP with Google account metadata: exact engagement_facilitators');
select results_eq('select id from attendees order by id','select null::uuid where false','Email OTP with Google account metadata: exact attendees');
select results_eq('select id from join_requests order by id','select null::uuid where false','Email OTP with Google account metadata: exact join_requests');
select results_eq('select id from device_sessions order by id','select null::uuid where false','Email OTP with Google account metadata: exact device_sessions');
reset role; select tests.login(2,'google',18); set local role authenticated;
select results_eq('select id from churches order by id','select null::uuid where false','Session without OAuth login proof: exact churches');
select results_eq('select id from engagements order by id','select null::uuid where false','Session without OAuth login proof: exact engagements');
select results_eq('select id from clearway_users order by id','select null::uuid where false','Session without OAuth login proof: exact clearway_users');
select results_eq('select id from engagement_facilitators order by id','select null::uuid where false','Session without OAuth login proof: exact engagement_facilitators');
select results_eq('select id from attendees order by id','select null::uuid where false','Session without OAuth login proof: exact attendees');
select results_eq('select id from join_requests order by id','select null::uuid where false','Session without OAuth login proof: exact join_requests');
select results_eq('select id from device_sessions order by id','select null::uuid where false','Session without OAuth login proof: exact device_sessions');
reset role; set local role anon;

select throws_ok('select * from public.churches', '42501', null, 'Anonymous cannot read churches');

select throws_ok('select * from public.engagements', '42501', null, 'Anonymous cannot read engagements');

select throws_ok('select * from public.clearway_users', '42501', null, 'Anonymous cannot read clearway_users');

select throws_ok('select * from public.engagement_facilitators', '42501', null, 'Anonymous cannot read engagement_facilitators');

select throws_ok('select * from public.attendees', '42501', null, 'Anonymous cannot read attendees');

select throws_ok('select * from public.join_requests', '42501', null, 'Anonymous cannot read join_requests');

select throws_ok('select * from public.device_sessions', '42501', null, 'Anonymous cannot read device_sessions');

reset role; select tests.login(12); set local role service_role;

select is((select count(*) from public.churches), 3::bigint, 'Trusted server can read churches for authorized workflows');

select is((select count(*) from public.engagements), 5::bigint, 'Trusted server can read engagements for authorized workflows');

select is((select count(*) from public.clearway_users), 9::bigint, 'Trusted server can read clearway_users for authorized workflows');

select is((select count(*) from public.engagement_facilitators), 7::bigint, 'Trusted server can read engagement_facilitators for authorized workflows');

select is((select count(*) from public.attendees), 9::bigint, 'Trusted server can read attendees for authorized workflows');

select is((select count(*) from public.join_requests), 5::bigint, 'Trusted server can read join_requests for authorized workflows');

select is((select count(*) from public.device_sessions), 12::bigint, 'Trusted server can read device_sessions for authorized workflows');

-- Row-level write denials and privilege-escalation attempts.
reset role; select tests.login(5); set local role authenticated;
select throws_ok($$insert into churches(name,timezone) values ('Stolen church','UTC')$$, '42501', null, 'Participant cannot create church');
select throws_ok($$insert into engagements(church_id,title) values (tests.id(101),'Stolen engagement')$$, '42501', null, 'Participant cannot create engagement');
with changed as (update attendees set room_role='scribe' where id=tests.id(401) returning id) select is((select count(*) from changed),0::bigint,'Participant cannot change own room role');
select throws_ok($$update attendees set auth_user_id=tests.uid(12) where id=tests.id(401)$$, '42501', null, 'Participant cannot reassign its auth identity');
select throws_ok($$insert into engagement_facilitators(engagement_id,clearway_user_id,role) values (tests.id(201),tests.id(310),'lead')$$, '42501', null, 'Participant cannot assign itself a facilitator');
select throws_ok($$insert into device_sessions(engagement_id,attendee_id,auth_session_id) values (tests.id(202),tests.id(410),tests.sid(5))$$, '42501', null, 'Participant cannot register another device binding');
with changed as (update device_sessions set revoked_at=null where id=tests.id(505) returning id) select is((select count(*) from changed),0::bigint,'Participant cannot un-revoke a device');

reset role; select tests.login(2,'google'); set local role authenticated;
with changed as (update clearway_users set is_admin=true where id=tests.id(302) returning id) select is((select count(*) from changed),0::bigint,'Lead cannot grant itself admin');
with changed as (update clearway_users set name='Changed' where id=tests.id(304) returning id) select is((select count(*) from changed),0::bigint,'Lead cannot edit Clearway accounts');
with changed as (update engagements set title='Changed' where id=tests.id(202) returning id) select is((select count(*) from changed),0::bigint,'Lead cannot edit another engagement');
select lives_ok($$update engagements set title='Updated engagement A' where id=tests.id(201)$$,'Lead can update own engagement settings');
select throws_ok($$update engagements set church_id=tests.id(102) where id=tests.id(201)$$, '42501', null, 'Browser cannot move engagement to another church');
select throws_ok($$update attendees set verified_at=now() where id=tests.id(407)$$, '42501', null, 'Lead must use server sign-in flow to verify an attendee');
select lives_ok($$insert into attendees(id,engagement_id,name,email) values (tests.id(420),tests.id(201),'Roster addition','  MIXED@Example.org  ')$$,'Lead can add a roster attendee with normalized email');
select is((select email from attendees where id=tests.id(420)), 'mixed@example.org','Roster emails normalize case and whitespace');
select throws_ok($$insert into attendees(engagement_id,name,email) values (tests.id(201),'Duplicate','MIXED@EXAMPLE.ORG')$$, '23505', null, 'Attendee emails deduplicate per engagement ignoring case');
select throws_ok($$insert into attendees(engagement_id,name,email) values (tests.id(202),'Other room','someone@example.org')$$, '42501', null, 'Lead cannot add attendees to another engagement');
select lives_ok($$update churches set mission='Updated identity' where id=tests.id(101)$$,'Lead can update own church identity');
with changed as (update churches set mission='Stolen identity' where id=tests.id(102) returning id) select is((select count(*) from changed),0::bigint,'Lead cannot edit another church');

reset role; select tests.login(3,'google'); set local role authenticated;
select throws_ok($$update engagement_facilitators set role='lead' where id=tests.id(702)$$, '42501', null, 'Co-facilitator cannot promote itself to lead');
with changed as (update engagement_facilitators set deleted=true where id=tests.id(701) returning id) select is((select count(*) from changed),0::bigint,'Co-facilitator cannot remove the lead assignment');
select lives_ok($$update attendees set role_at_church='Pastor' where id=tests.id(401)$$,'Co-facilitator can update own engagement roster');

reset role; select tests.login(1,'google'); set local role authenticated;
select lives_ok($$insert into churches(id,name,timezone) values (tests.id(110),'New church','UTC')$$,'Admin can create a church');
select lives_ok($$insert into engagements(id,church_id,title) values (tests.id(210),tests.id(110),'New engagement')$$,'Admin can create an engagement');
select lives_ok($$update clearway_users set name='Updated directory name' where id=tests.id(304)$$,'Admin can edit Clearway accounts');
select is((select core_organization_id from churches where id=tests.id(110)),null::uuid,'CORE link is empty until linked');
select is((select cardinality(lens_names) from engagements where id=tests.id(210)),5,'Engagement starts with five lens names');
select throws_ok($$insert into churches(name,timezone) values ('Invalid timezone','No/Such_Zone')$$, '23514', null, 'Invalid time zone is rejected');
select throws_ok($$insert into clearway_users(name,email,team_hub_team_member_id) values ('Outside','outside@example.org',tests.id(9999))$$, '23514', null, 'Allowlist cannot contain a non-Clearway email');
with added as (insert into engagements(church_id,title,start_date,retreat_start_date) values (tests.id(110),'Future retreat','2026-11-01','2032-02-01') returning base_year)
select is((select base_year::integer from added),2032,'Horizon base year defaults to the retreat year, not engagement creation or start');
with added as (insert into engagements(church_id,title,retreat_start_date,base_year) values (tests.id(110),'Explicit horizon year','2032-02-01',2029) returning base_year)
select is((select base_year::integer from added),2029,'An explicit horizon year overrides the retreat-year default');
select throws_ok($$update engagements set base_year=9999 where id=tests.id(201)$$, '23514', null, 'Base year leaves room for the 10-year Future');
select throws_ok($$update engagements set lens_names=array['Only one'] where id=tests.id(201)$$, '23514', null, 'Engagement must have five lens names');
select throws_ok($$update engagements set start_date='2026-11-05',end_date='2026-11-04' where id=tests.id(201)$$, '23514', null, 'End date cannot precede start date');
select throws_ok($$delete from attendees where id=tests.id(401)$$, '42501', null, 'Even an app admin uses soft delete through a browser');

select is((select team_hub_client_id from engagements where id=tests.id(201)),tests.id(1001),'Engagement stores the linked Team Hub client id');

-- Cross-engagement relationships are rejected even for the trusted server.
reset role;
select throws_ok($$insert into engagements(church_id,title,team_hub_client_id) values (tests.id(101),'Wrong client',tests.id(1002))$$, '23503', null, 'Engagement Team Hub client must match its church');
select throws_ok($$insert into device_sessions(engagement_id,attendee_id,auth_session_id) values (tests.id(202),tests.id(401),tests.sid(999))$$, '23503', null, 'Device cannot be attached to another engagement attendee');
select throws_ok($$insert into join_requests(engagement_id,name,email,device_id,status,decided_at,decided_by,attendee_id) values (tests.id(202),'Wrong room','wrong@example.org',tests.id(8800),'approved',now(),tests.id(302),tests.id(401))$$, '23503', null, 'Join approval cannot attach an attendee from another engagement');
select throws_ok($$insert into join_requests(engagement_id,name,email,device_id,status) values (tests.id(201),'Invalid approval','invalid@example.org',tests.id(8801),'approved')$$, '23514', null, 'Approval requires a decision and attendee binding');
select throws_ok($$insert into engagement_facilitators(engagement_id,clearway_user_id,role) values (tests.id(201),tests.id(310),'lead')$$, '23505', null, 'An engagement has only one active lead');
select throws_ok($$insert into attendees(engagement_id,auth_user_id,name,email) values (tests.id(201),tests.uid(5),'Duplicate identity','different@example.org')$$, '23505', null, 'One auth identity cannot become two active attendees in one room');

-- Harmless roster email formatting keeps the same verified identity and devices.
reset role; select tests.login(3,'google'); set local role authenticated;
select lives_ok($$update attendees set email='  PARTICIPANT@EXAMPLE.ORG  ' where id=tests.id(401)$$,'Formatting-only email correction succeeds');
select ok((select verified_at is not null from attendees where id=tests.id(401)),'Formatting-only email correction keeps verification');
reset role; select tests.login(5); set local role authenticated;
select results_eq('select id from attendees','values (tests.id(401))','Formatting-only correction keeps the phone signed in');
reset role;

-- Stale JWTs must lose access when the database identity/session is revoked.
update auth.sessions set not_after=now()-interval '1 second' where id=tests.sid(5);
select tests.login(5); set local role authenticated;
select is((select count(*) from attendees),0::bigint,'Expired Auth session blocks room reads');
reset role;
update auth.sessions set not_after=null where id=tests.sid(5);
delete from auth.sessions where id=tests.sid(305);
select tests.login(5,'email',305); set local role authenticated;
select is((select count(*) from attendees),0::bigint,'Signed-out session blocks room reads before JWT expiry');
reset role;
select is((select count(*) from device_sessions where id=tests.id(507)),1::bigint,'Auth sign-out preserves device audit history');
update auth.users set banned_until=now()+interval '1 day' where id=tests.uid(5);
select tests.login(5); set local role authenticated;
select is((select count(*) from attendees),0::bigint,'Banned user cannot use an existing room token');
reset role;
update auth.users set banned_until=null where id=tests.uid(5);
update clearway_users set deleted=true where id=tests.id(302);
select tests.login(2,'google'); set local role authenticated;
select is((select count(*) from engagements),0::bigint,'Removing a Clearway account immediately blocks stale facilitator JWT');
reset role;
update clearway_users set deleted=false where id=tests.id(302);
delete from auth.identities where user_id=tests.uid(2) and provider='google';
select tests.login(2,'google'); set local role authenticated;
select is((select count(*) from engagements),0::bigint,'Removing Google identity immediately blocks stale facilitator JWT');
reset role;

-- A roster email change must invalidate identity and devices without client privileges.
select tests.login(3,'google'); set local role authenticated;
select lives_ok($$update attendees set email='replacement@example.org' where id=tests.id(401)$$,'Facilitator can correct a roster email');
reset role;
select is((select auth_user_id from attendees where id=tests.id(401)),null::uuid,'Changed email clears old identity binding');
select is((select verified_at from attendees where id=tests.id(401)),null::timestamptz,'Changed email clears verification');
select ok((select bool_and(revoked_at is not null) from device_sessions where attendee_id=tests.id(401)),'Changed email revokes every old device');
select tests.login(5); set local role authenticated;
select is((select count(*) from attendees),0::bigint,'Old phone cannot read replacement attendee');
reset role;

-- Closure lasts until a new sign-in; changing status back cannot resurrect old tokens.
select tests.login(1,'google'); set local role authenticated;
select lives_ok($$update engagements set status='closed' where id=tests.id(201)$$,'Admin can close an engagement');
reset role;
select ok((select bool_and(revoked_at is not null) from device_sessions where engagement_id=tests.id(201)),'Closure revokes all devices in that engagement');
select ok((select revoked_at is null from device_sessions where id=tests.id(503)),'Closure leaves another engagement device active');
select tests.login(6); set local role authenticated;
select is((select count(*) from attendees),0::bigint,'Closure immediately blocks scribe room reads');
select is((select count(*) from device_sessions),0::bigint,'Closure immediately blocks own device reads');
reset role;
update engagements set status='setup' where id=tests.id(201);
select tests.login(6); set local role authenticated;
select is((select count(*) from attendees),0::bigint,'Reopening does not resurrect old device tokens');
reset role;

-- Trigger-managed timestamps and logical deletion remain auditable.
select ok((select updated_at > created_at from engagements where id=tests.id(201)),'Update trigger advances timestamp');
select ok((select deleted from attendees where id=tests.id(406)),'Soft-deleted attendee row is preserved');

select * from finish();
rollback;
