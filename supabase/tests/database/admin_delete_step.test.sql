-- November 20: an admin can always delete a step from the run of show. An open step stops answering first; the live step
-- goes off the TV first, as Home does. A facilitator who is not an admin keeps the rule as it was.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('87000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(1000+n))::text,true); end $$;
create function tests.live() returns uuid language sql security definer set search_path='' as $$ select live_session_id from public.room_states where engagement_id=tests.id(100) $$;
create function tests.content() returns text language sql security definer set search_path='' as $$ select tv_content from public.room_states where engagement_id=tests.id(100) $$;
create function tests.gone(n integer) returns boolean language sql security definer set search_path='' as $$ select deleted from public.sessions where id=tests.id(n) $$;
create function tests.rev(n integer) returns integer language sql security definer set search_path='' as $$ select revision from public.sessions where id=tests.id(n) $$;
create function tests.ctl(n integer,action text,p jsonb default '{}') returns jsonb language sql as $$
 select public.room_control(tests.id(100),tests.id(n),action,jsonb_build_object('from',tests.live())||p)
$$;
create function tests.remove(n integer) returns jsonb language sql as $$
 select public.show_write(tests.id(100),'remove',jsonb_build_object('id',tests.id(n),'revision',tests.rev(n)))
$$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Church A','America/Toronto');
insert into engagements(id,church_id,title,type) values(tests.id(100),tests.id(200),'Workshop A','team_workshop');
insert into auth.users(id,email,email_confirmed_at) values(tests.id(1),'admin@clearway.co',now()),(tests.id(2),'fac@clearway.co',now());
insert into auth.sessions(id,user_id) values(tests.id(1001),tests.id(1)),(tests.id(1002),tests.id(2));
insert into auth.identities(user_id,provider,provider_id,identity_data) select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(1),tests.id(2));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(1001),now(),now(),'oauth'),(gen_random_uuid(),tests.id(1002),now(),now(),'oauth');
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id) values
 (tests.id(701),tests.id(1),'Chris Vacher','admin@clearway.co',true,tests.id(801)),
 (tests.id(702),tests.id(2),'Co Facilitator','fac@clearway.co',false,tests.id(802));
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(100),tests.id(701),'lead'),(tests.id(100),tests.id(702),'co_facilitator');
insert into sessions(id,engagement_id,part,position,segment,title,interaction,prompt,state,max_sends) values
 (tests.id(310),tests.id(100),'Day 1',0,'','Welcome','content','Welcome','ready',10),
 (tests.id(311),tests.id(100),'Day 1',1,'','Ranking','word_cloud','Rank these','ready',10),
 (tests.id(312),tests.id(100),'Day 1',2,'','Points','word_cloud','Share points','ready',10),
 (tests.id(313),tests.id(100),'Day 1',3,'','Words','word_cloud','One word','ready',10),
 (tests.id(314),tests.id(100),'Day 1',4,'','Draft step','word_cloud','Not yet','ready',10);

set local role authenticated;
-- Rehearse: go live on Ranking, then Points, then Words. Ranking and Points stay open; Words is live.
select tests.login(1);
select is(tests.ctl(1,'go_live',jsonb_build_object('session',tests.id(311)))->>'status','ok','Ranking goes live');
select is(tests.ctl(2,'go_live',jsonb_build_object('session',tests.id(312)))->>'status','ok','Points goes live');
select is(tests.ctl(3,'go_live',jsonb_build_object('session',tests.id(313)))->>'status','ok','Words goes live');
reset role;
select is((select state from sessions where id=tests.id(311)),'open','Ranking stays open after the room moves on');
set local role authenticated;

-- A facilitator who is not an admin: refused, as before.
select tests.login(2);
select is(tests.remove(311)->>'status','running','A facilitator cannot delete an open step');
select is(tests.remove(313)->>'status','running','nor the live step');
reset role;
select ok(not tests.gone(311) and not tests.gone(313),'Both steps are still there');
set local role authenticated;

-- The admin: an open step stops answering, then leaves the run of show; the TV is untouched.
select tests.login(1);
select is(tests.remove(311)->>'status','ok','An admin deletes an open step');
reset role;
select ok(tests.gone(311),'The open step is gone');
select is((select closed_by from sessions where id=tests.id(311)),'stop','Its answers were stopped first');
select is(tests.live(),tests.id(313),'The TV still shows the live step');
set local role authenticated;

-- The admin deletes the live step: off the TV first, as Home does, then gone.
select tests.login(1);
select is(tests.remove(313)->>'status','ok','An admin deletes the step on the TV');
reset role;
select ok(tests.gone(313),'The live step is gone');
select is(tests.live(),null,'Nothing is live on the TV');
select is(tests.content(),'holding','The TV shows Home');
set local role authenticated;

-- A stale revision is still a conflict for the admin, and a ready step still deletes as before.
select tests.login(1);
select is(public.show_write(tests.id(100),'remove',jsonb_build_object('id',tests.id(312),'revision',tests.rev(312)-1))->>'status','conflict','A stale revision is refused, even for an admin');
reset role;
select ok(not tests.gone(312),'and nothing changes');
set local role authenticated;
select tests.login(1);
select is(tests.remove(314)->>'status','ok','A ready step deletes as it always has');
select tests.login(2);
select is(tests.remove(312)->>'status','running','The facilitator still cannot delete the open step that is left');

select * from finish();
rollback;
