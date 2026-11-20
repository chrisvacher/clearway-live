begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon;
create function tests.id(n int) returns uuid language sql immutable as $$ select ('82500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n int) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true);
end $$;
create function tests.role(room int) returns text language sql security definer set search_path='' as $$ select private.live_role(tests.id(room)) $$;
grant execute on all functions in schema tests to authenticated,anon;

insert into public.churches(id,name,timezone) values(tests.id(80),'Test church','America/Toronto');
insert into public.engagements(id,church_id,title,type) values
  (tests.id(100),tests.id(80),'First workshop','team_workshop'),
  (tests.id(101),tests.id(80),'Second workshop','team_workshop');
insert into auth.users(id,email,email_confirmed_at) values
  (tests.id(1),'merge-lead@clearway.co',now()),(tests.id(2),'merge-outsider@clearway.co',now()),
  (tests.id(3),'first@guest.clearway.invalid',now()),(tests.id(4),'second@guest.clearway.invalid',now());
insert into auth.identities(user_id,provider,provider_id,identity_data)
  select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(1),tests.id(2));
insert into auth.sessions(id,user_id) select tests.id(1000+n),tests.id(n) from generate_series(1,4) n;
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method)
  select gen_random_uuid(),tests.id(1000+n),now(),now(),case when n<=2 then 'oauth' else 'otp' end from generate_series(1,4) n;
insert into public.clearway_users(id,auth_user_id,name,email,team_hub_team_member_id) values
  (tests.id(201),tests.id(1),'Lead','merge-lead@clearway.co',tests.id(301)),
  (tests.id(202),tests.id(2),'Other facilitator','merge-outsider@clearway.co',tests.id(302));
insert into public.engagement_facilitators(engagement_id,clearway_user_id,role) values
  (tests.id(100),tests.id(201),'lead'),(tests.id(101),tests.id(202),'lead');
insert into public.attendees(id,engagement_id,auth_user_id,verified_at,name,email,created_at) values
  (tests.id(501),tests.id(100),tests.id(3),now(),'Kit Dana','first@guest.clearway.invalid',now()-interval '1 hour'),
  (tests.id(502),tests.id(100),tests.id(4),now(),' kit  dana ','second@guest.clearway.invalid',now()),
  (tests.id(503),tests.id(101),null,null,'Kit Dana','third@guest.clearway.invalid',now()),
  (tests.id(504),tests.id(100),null,null,'Kit Dana','listed@example.org',now());
insert into public.device_sessions(id,engagement_id,attendee_id,auth_session_id) values
  (tests.id(701),tests.id(100),tests.id(501),tests.id(1003)),
  (tests.id(702),tests.id(100),tests.id(502),tests.id(1004));
insert into public.sessions(id,engagement_id,title,interaction) values(tests.id(601),tests.id(100),'Test question','wall');
insert into public.submissions(id,engagement_id,session_id,attendee_id,text,answers,phone_sent_at) values
  (tests.id(901),tests.id(100),tests.id(601),tests.id(501),'First answer','["First answer"]',now()),
  (tests.id(902),tests.id(100),tests.id(601),tests.id(502),'Second answer','["Second answer"]',now());

select ok(not has_table_privilege('authenticated','private.merged_guest_devices','select'),'Original guest identities stay private');
select ok(not has_function_privilege('anon','public.attendee_merge(uuid,uuid,uuid[])','execute'),'Anonymous clients cannot merge');
set local role authenticated;
select tests.login(4);
select throws_ok($$select public.attendee_roster_presence(tests.id(100))$$,
  '42501',null,'A guest cannot read the roster projection');
select throws_ok($$select public.attendee_merge(tests.id(100),tests.id(501),array[tests.id(502)])$$,
  '42501',null,'A participant cannot merge people');
select tests.login(2);
select throws_ok($$select public.attendee_merge(tests.id(100),tests.id(501),array[tests.id(502)])$$,
  '42501',null,'Another facilitator cannot merge people in the first workshop');
select tests.login(1);
select is(public.attendee_merge(tests.id(100),tests.id(501),array[tests.id(503)])->>'status','invalid','A cross-room merge is refused');
select is(public.attendee_merge(tests.id(100),tests.id(501),array[tests.id(504)])->>'status','invalid','An attendee on the email list cannot merge');
select is(public.attendee_merge(tests.id(100),tests.id(502),array[tests.id(501)])->>'status','invalid','The earliest entry is retained');
reset role;
insert into private.followup_access(engagement_id,attendee_id,email,session_ids,token_hash,code_hash,opens_at,closes_at)
values(tests.id(100),tests.id(502),'second@guest.clearway.invalid',array[tests.id(601)],repeat('a',64),repeat('b',64),now(),now()+interval '1 hour');
set local role authenticated;
select tests.login(1);
select is(public.attendee_merge(tests.id(100),tests.id(501),array[tests.id(502)])->>'status','invalid','A merge cannot move an active follow-up credential');
reset role;
update private.followup_access set revoked_at=now() where attendee_id=tests.id(502);
set local role authenticated;
select tests.login(1);
select is(public.attendee_merge(tests.id(100),tests.id(501),array[tests.id(502)])->>'status','ok','The assigned facilitator merges same-name guests');
select is((select count(*)::integer from public.room_presence(tests.id(100))),1,'Presence counts one person');
select is((select device_count::integer from public.room_presence(tests.id(100)) where attendee_id=tests.id(501)),2,'Both originally verified devices stay signed in');
select is((select count(*)::integer from public.attendee_roster_presence(tests.id(100)) where present),1,'Roster marks one present person');
select is(public.attendee_roster_change(tests.id(100),'role',jsonb_build_array(jsonb_build_object('id',tests.id(501))),'scribe')->>'status',
  'invalid','Merged guests cannot gain the scribe role via the roster');
select throws_ok($$select public.attendee_roster_edit(tests.id(100),tests.id(501),
  '{"name":"Kit Dana","email":"first@guest.clearway.invalid","room_role":"scribe"}')$$,
  '23514',null,'A row edit cannot make a no-email guest a scribe');
select is(public.attendee_roster_edit(tests.id(100),tests.id(504),
  '{"name":"Kit Dana","email":"listed@example.org","room_role":"scribe"}'),true,'A listed person can still be assigned as scribe');
select tests.login(3);
select is(tests.role(100),'participant','The original retained device still participates');
select is((select id from public.attendees where id=tests.id(501)),tests.id(501),'Retained account still sees the retained attendee');
select tests.login(4);
select is(tests.role(100),'participant','The merged device still participates');
select is(tests.role(101),null,'The merged device does not gain access to another engagement');
select is(public.room_merged_attendee(tests.id(100))->>'id',tests.id(501)::text,'The merged phone resolves the retained attendee');
select is(public.room_merged_attendee(tests.id(101)),null,'The same phone cannot resolve a person in another room');
select is((select count(*)::integer from public.submissions where engagement_id=tests.id(100)),2,'Both answers are available to the merged identity');
select is((select count(distinct attendee_id)::integer from public.submissions where engagement_id=tests.id(100)),1,'Answer participation counts once');
reset role;
select is((select count(*)::integer from public.attendees where engagement_id=tests.id(100) and deleted),1,'The old roster entry is soft-deleted');
select is((private.tv_room_info(tests.id(100))->'presence'->>'count')::integer,1,'TV presence counts the merged person once');

set local role authenticated;
select tests.login(1);
select set_config('tests.removed',public.attendee_roster_change(tests.id(100),'remove',jsonb_build_array(jsonb_build_object('id',tests.id(501))),null)->>'removed',true);
select is(public.attendee_roster_change(tests.id(100),'restore',current_setting('tests.removed')::jsonb,null)->>'status','ok','The removing facilitator can restore the roster entry');
select is((select count(*)::integer from public.room_presence(tests.id(100))),0,'Undo does not revive device sessions');
select is(public.attendee_roster_change(tests.id(100),'restore',current_setting('tests.removed')::jsonb,null)->>'status','invalid','An Undo receipt works only once');
reset role;
select * from finish();
rollback;
