begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

create schema tests;
create function tests.id(n integer) returns uuid language sql immutable as $$
  select ('b1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function tests.sign_in(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'session_id',tests.id(100+n),'role','authenticated')::text,true);
end $$;
grant usage on schema tests to authenticated,service_role;
grant execute on all functions in schema tests to authenticated,service_role;

insert into churches(id,name,timezone,team_hub_client_id)
values(tests.id(20),'Riverside Church','America/Toronto',tests.id(21));

insert into engagements(id,church_id,title,type,status,link_name)
values(tests.id(10),tests.id(20),'Workshop A','team_workshop','setup','riversideworkshop'),
      (tests.id(11),tests.id(20),'Workshop B','team_workshop','setup',null),
      (tests.id(12),tests.id(20),'Practice','practice','setup',null);

insert into auth.users(id,email,email_confirmed_at)
values(tests.id(1),'lead@clearway.co',now()),(tests.id(2),'co@clearway.co',now()),
      (tests.id(3),'other@clearway.co',now()),(tests.id(4),'admin@clearway.co',now());
insert into auth.identities(user_id,provider,provider_id,identity_data)
select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true)
from auth.users where id in (tests.id(1),tests.id(2),tests.id(3),tests.id(4));
insert into auth.sessions(id,user_id)
select tests.id(100+n),tests.id(n) from generate_series(1,4) n;
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method)
select gen_random_uuid(),tests.id(100+n),now(),now(),'oauth' from generate_series(1,4) n;
insert into clearway_users(id,auth_user_id,name,email,team_hub_team_member_id,is_admin)
select tests.id(200+n),id,'Facilitator '||n,email,tests.id(300+n),n=4
from generate_series(1,4) n join auth.users on id=tests.id(n);
insert into engagement_facilitators(engagement_id,clearway_user_id,role)
values(tests.id(10),tests.id(201),'lead'),(tests.id(10),tests.id(202),'co_facilitator'),(tests.id(11),tests.id(203),'lead');
insert into attendees(id,engagement_id,name,email) values(tests.id(30),tests.id(10),'Ruth','ruth@example.org');
insert into sessions(id,engagement_id,title,section,state) values(tests.id(31),tests.id(10),'Opening step','Welcome','ready');
insert into submissions(id,engagement_id,session_id,attendee_id,text,answers,phone_sent_at)
values(tests.id(32),tests.id(10),tests.id(31),tests.id(30),'Kept answer','[]',now());

select ok(not has_function_privilege('anon','public.engagement_hide_from_list(uuid)','execute'),'Anonymous callers cannot archive');
select ok(not has_function_privilege('anon','public.engagement_restore(uuid)','execute'),'Anonymous callers cannot restore');
select ok(not has_column_privilege('authenticated','public.engagements','archived_at','update'),'Archiving uses the scoped function');

set local role authenticated;
select tests.sign_in(3);
select is(public.engagement_hide_from_list(tests.id(10))->>'status','denied','Another event facilitator cannot archive');
select is(public.engagement_restore(tests.id(10))->>'status','denied','Another event facilitator cannot restore');

select tests.sign_in(1);
select is(public.engagement_hide_from_list(tests.id(10))->>'status','ok','The lead can archive');
select isnt((select archived_at from engagements where id=tests.id(10)),null,'Archive stamps the list field');
select is((select status::text from engagements where id=tests.id(10)),'setup','The room stays open');
select is((select link_name from engagements where id=tests.id(10)),'riversideworkshop','The room keeps its link');
select is(public.engagement_archive(tests.id(10))->>'status','ok','The full JSON export keeps working');

select tests.sign_in(2);
select is(public.engagement_restore(tests.id(10))->>'status','ok','A co-facilitator can restore');
select is((select archived_at from engagements where id=tests.id(10)),null,'Restore clears the timestamp');
select is(public.engagement_hide_from_list(tests.id(10))->>'status','ok','A co-facilitator can archive');
select is(public.event_link(tests.id(10),'create')->>'status','ok','A real facilitator can prepare an event link');
reset role;

create temporary table generated_link as
select code, guest_user_id, (select email from clearway_users where id=guest_user_id) as email from private.event_links where engagement_id=tests.id(10);
grant select on generated_link to authenticated,service_role;
insert into auth.users(id,email,email_confirmed_at) select tests.id(5),email,now() from generated_link;
insert into auth.sessions(id,user_id) values(tests.id(105),tests.id(5));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method)
values(gen_random_uuid(),tests.id(105),now(),now(),'otp');
set local role service_role;
select is(public.event_link_open('prepare',jsonb_build_object('code',(select code from generated_link)))->>'status','ok','The event link still works');
select is(public.event_link_open('bind',jsonb_build_object('code',(select code from generated_link),'user',tests.id(5),'session',tests.id(105)))->>'status','ok','Bind the event-link session');
reset role;
set local role authenticated;
select tests.sign_in(5);
select ok(private.can_facilitate(tests.id(10)),'Event-link access still facilitates its own engagement');
select is(public.engagement_hide_from_list(tests.id(10))->>'status','denied','Event-link access cannot archive');
select is(public.engagement_restore(tests.id(10))->>'status','denied','Event-link access cannot restore');

select tests.sign_in(4);
select is(public.engagement_restore(tests.id(10))->>'status','ok','An admin can restore');
select is(public.engagement_hide_from_list(tests.id(12))->>'status','missing','Practice stays available');
reset role;
select is((select text from submissions where id=tests.id(32)),'Kept answer','Archive and restore preserve answers');

create function tests.create_named(name text) returns uuid language sql as $$
  select public.save_engagement(null,jsonb_build_object('name','Riverside Church','timezone','America/Toronto','logo_url','',
    'values','[]'::jsonb,'leadership_rhythms','[]'::jsonb),
    jsonb_build_object('title','New workshop','type','team_workshop','status','setup','base_year',2026,
    'lens_names',jsonb_build_array('Congregation','Community','Leadership','Operations','Learning'),
    'how_the_room_decides','Discuss what you heard.','link_name',name),tests.id(204),null,tests.id(21),tests.id(40))
$$;
grant execute on function tests.create_named(text) to authenticated;

set local role authenticated;
select tests.sign_in(1);
select is(public.engagement_link_name_status('riversideworkshop',null),'denied','Only admins check names for new events');
select is(public.engagement_link_name_status('riversideworkshop',tests.id(10)),'available','An event may keep its own name');
select is(public.engagement_link_name_status('riversideworkshop',tests.id(11)),'denied','Only the event facilitator checks its name');
select is(public.engagement_duplicate(tests.id(10))->>'status','denied','Only admins duplicate into a new event');
select tests.sign_in(4);
select is(public.engagement_link_name_status('riversideworkshop',null),'taken_name','An existing name is taken');
select is(public.engagement_link_name_status('admin',null),'reserved_name','App paths are reserved');
select throws_ok($$select tests.create_named('riversideworkshop')$$,'23505',null,'A taken name refuses creation');
select is((select count(*)::integer from engagements where team_hub_engagement_id=tests.id(40)),0,'A failed name leaves no engagement');
select lives_ok($$select tests.create_named('newworkshop')$$,'Create and reserve a name in one transaction');
select is((select link_name from engagements where team_hub_engagement_id=tests.id(40)),'newworkshop','The created engagement has its requested name');
create temporary table copied_id as select (public.engagement_duplicate(tests.id(10))->>'id')::uuid as id;
select isnt((select id from copied_id),null,'An admin can duplicate an event');
select is((select section from sessions where engagement_id=(select id from copied_id)),'Welcome','Duplicate carries run-of-show sections');
select is((select count(*)::integer from attendees where engagement_id=(select id from copied_id)),0,'Duplicate carries no people');
select is((select link_name from engagements where id=(select id from copied_id)),null,'Duplicate gets a fresh room code without the old name');
reset role;

select * from finish();
rollback;
