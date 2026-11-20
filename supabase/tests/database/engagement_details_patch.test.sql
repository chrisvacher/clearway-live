begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

create schema tests;
create function tests.id(n integer) returns uuid language sql immutable as $$
  select ('6d000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
create function tests.login(n integer) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub',tests.id(n),'session_id',tests.id(200+n),'role','authenticated')::text,true);
end $$;
grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;

insert into churches(id,name,timezone) values (tests.id(20),'Church','America/Toronto');
insert into engagements(id,church_id,title,type,settings) values
  (tests.id(10),tests.id(20),'Original','team_workshop','{"room_size":"small","open_join":false}');
insert into auth.users(id,email,email_confirmed_at) values
  (tests.id(1),'details-admin@clearway.co',now()),(tests.id(2),'details-co@clearway.co',now()),(tests.id(3),'details-other@clearway.co',now());
insert into auth.identities(user_id,provider,provider_id,identity_data)
select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true)
from auth.users where id in(tests.id(1),tests.id(2),tests.id(3));
insert into auth.sessions(id,user_id) values (tests.id(201),tests.id(1)),(tests.id(202),tests.id(2)),(tests.id(203),tests.id(3));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method)
select gen_random_uuid(),id,now(),now(),'oauth' from auth.sessions where id in(tests.id(201),tests.id(202),tests.id(203));
insert into public.clearway_users(id,auth_user_id,name,email,team_hub_team_member_id,is_admin)
select tests.id(300+n),tests.id(n),'Facilitator '||n,email,tests.id(400+n),n=1
from generate_series(1,3) n join auth.users on id=tests.id(n);
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values
  (tests.id(10),tests.id(301),'lead'),(tests.id(10),tests.id(302),'co_facilitator');

select ok(not has_function_privilege('anon','public.engagement_details_patch(uuid,jsonb)','execute'),'Anonymous callers cannot change Details');
set local role authenticated;
select tests.login(3);
select is(public.engagement_details_patch(tests.id(10),'{"event":{"title":"Unassigned"}}'),'denied','Unassigned person cannot edit another event');
select tests.login(2);
select is(public.engagement_details_patch(tests.id(10),'{"event":{"skin":"novetera"}}'),'denied','Non-admin cannot change brand');
select is(public.engagement_details_patch(tests.id(10),jsonb_build_object('assignments',jsonb_build_object('lead',tests.id(303)))),'denied','Non-admin cannot change lead');
select is(public.engagement_details_patch(tests.id(10),'{"event":{"title":"Revised"},"church":{"name":"Room name"}}'),'ok','Assigned facilitator can save church and Details together');
select is(public.engagement_details_patch(tests.id(10),'{"event":{"status":"closed"}}'),'invalid','Details patch cannot change stage');
select tests.login(1);
select is(public.event_link(tests.id(10),'create')->>'status','ok','Creating an event link adds a separate guest co-facilitator');
select is(public.engagement_details_patch(tests.id(10),'{"event":{"skin":"novetera"},"settings":{"ai_enabled":true}}'),'ok','Admin can switch brand and AI');
select is((select title from public.engagements where id=tests.id(10)),'Revised','Immediate changes preserve the title');
select is((select settings->>'room_size' from public.engagements where id=tests.id(10)),'small','AI change preserves display settings');
select is((select count(*)::integer from engagement_facilitators where engagement_id=tests.id(10) and role='co_facilitator' and not deleted),2,'Immediate changes preserve both co-facilitators');
select is(public.engagement_details_patch(tests.id(10),'{"event":{"title":""},"church":{"name":"Partial name"}}'),'invalid','Invalid event aborts all changed fields');
select is((select name from churches where id=tests.id(20)),'Room name','No partial name from a rejected save');
select is(public.engagement_details_patch(tests.id(10),'{"assignments":{"co":null}}'),'ok','A facilitator can clear the human co-facilitator');
select is((select count(*)::integer from engagement_facilitators f join clearway_users u on u.id=f.clearway_user_id
  where f.engagement_id=tests.id(10) and f.role='co_facilitator' and not f.deleted and u.kind='link_guest'),1,'Changing the co-facilitator leaves the link guest in place');
select is((select count(*)::integer from engagement_facilitators where engagement_id=tests.id(10) and role='co_facilitator' and not deleted),1,'Only the human assignment was removed');
select * from finish();
rollback;
