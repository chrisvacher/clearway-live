begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('8e000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer,sid integer default null) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'session_id',tests.id(coalesce(sid,200+n)),'role','authenticated')::text,true);
end $$;
grant usage on schema tests to service_role,authenticated,anon;
grant execute on all functions in schema tests to service_role,authenticated,anon;
insert into churches(id,name,timezone) values(tests.id(20),'Room A church','America/Toronto'),(tests.id(21),'Room B church','America/Toronto');
insert into engagements(id,church_id,title,status) values(tests.id(10),tests.id(20),'Room A','pre_call'),(tests.id(11),tests.id(21),'Room B','retreat');
insert into auth.users(id,email,email_confirmed_at) values(tests.id(2),'fac@clearway.co',now()),(tests.id(3),'other@clearway.co',now()),(tests.id(4),'admin@clearway.co',now());
insert into auth.identities(user_id,provider,provider_id,identity_data)
select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(2),tests.id(3),tests.id(4));
insert into auth.sessions(id,user_id) values(tests.id(202),tests.id(2)),(tests.id(203),tests.id(3)),(tests.id(204),tests.id(4));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method)
select gen_random_uuid(),id,now(),now(),'oauth' from auth.sessions where id in(tests.id(202),tests.id(203),tests.id(204));
insert into clearway_users(id,auth_user_id,name,email,team_hub_team_member_id)
select tests.id(300+n),tests.id(n),'Facilitator '||n,case n when 2 then 'fac@clearway.co' when 3 then 'other@clearway.co' else 'admin@clearway.co' end,tests.id(400+n) from generate_series(2,4)n;
insert into engagement_facilitators(engagement_id,clearway_user_id,role) values(tests.id(10),tests.id(302),'lead'),(tests.id(11),tests.id(303),'lead');
update clearway_users set is_admin=true where id=tests.id(304);

-- The table's rules for a link guest
select throws_ok($$insert into clearway_users(name,email,kind,team_hub_team_member_id) values('X','link-'||repeat('a',32)||'@link.clearway.invalid','person',gen_random_uuid())$$,'23514',null,'A person needs a clearway.co address');
select throws_ok($$insert into clearway_users(name,email,kind) values('X','someone@clearway.co','link_guest')$$,'23514',null,'A link guest can never have a clearway.co address');
select throws_ok($$insert into clearway_users(name,email,kind,is_admin) values('X','link-'||repeat('b',32)||'@link.clearway.invalid','link_guest',true)$$,'23514',null,'A link guest is never an admin');
select throws_ok($$insert into clearway_users(name,email) values('X','nomember@clearway.co')$$,'23514',null,'A person still needs a Team Hub member');

-- Who may read and make the link
select ok(not has_function_privilege('anon','public.event_link(uuid,text)','execute'),'Anon cannot reach the link');
select ok(not has_function_privilege('authenticated','public.event_link_open(text,jsonb)','execute'),'Only the server opens a link');
set local role authenticated;
select tests.login(3);
select is(public.event_link(tests.id(10),'create')->>'status','denied','A facilitator of another event cannot make this event''s link');
select tests.login(2);
select is(public.event_link(tests.id(10),'read')->>'code',null,'No link until one is made');
select matches(public.event_link(tests.id(10),'create')->>'code','^[a-z2-9]{12}$','The event''s facilitator makes a 12-character link');
select is(public.event_link(tests.id(10),'create')->>'code',public.event_link(tests.id(10),'read')->>'code','Asking again keeps the same link');
select tests.login(4);
select is(public.event_link(tests.id(10),'read')->>'status','ok','An admin can read any event''s link');
reset role;
select is((select count(*)::int from private.event_links where engagement_id=tests.id(10) and retired_at is null),1,'One live link per event');
select is((select kind||'/'||is_admin from clearway_users where id=(select guest_user_id from private.event_links where engagement_id=tests.id(10) limit 1)),'link_guest/false','The guest is a link guest and not an admin');
select is((select role::text from engagement_facilitators where engagement_id=tests.id(10) and clearway_user_id=(select guest_user_id from private.event_links where engagement_id=tests.id(10) limit 1)),'co_facilitator','The guest co-facilitates this event');

-- Opening the link: the server prepares, Auth makes the user and session, the server binds them
create temporary table t_link as select code, guest_user_id, (select email from clearway_users where id=guest_user_id) email from private.event_links where engagement_id=tests.id(10) and retired_at is null;
grant select on t_link to service_role, authenticated;
set local role service_role;
select is(public.event_link_open('prepare',jsonb_build_object('code',(select code from t_link)))->>'email',(select email from t_link),'Prepare names the guest''s sign-in address');
select is(public.event_link_open('prepare',jsonb_build_object('code','aaaaaaaaaaaa'))->>'status','missing','An unknown code opens nothing');
reset role;
insert into auth.users(id,email,email_confirmed_at) select tests.id(5),email,now() from t_link;
insert into auth.sessions(id,user_id) values(tests.id(205),tests.id(5)),(tests.id(215),tests.id(5));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),tests.id(205),now(),now(),'otp'),(gen_random_uuid(),tests.id(215),now(),now(),'otp');
set local role service_role;
select is(public.event_link_open('bind',jsonb_build_object('code',(select code from t_link),'user',tests.id(5),'session',tests.id(205)))->>'status','ok','The server binds the new session to the code');
select is(public.event_link_open('bind',jsonb_build_object('code',(select code from t_link),'user',tests.id(2),'session',tests.id(202)))->>'status','denied','A session of another user cannot be bound to the guest');
reset role;

-- What the guest can do
set local role authenticated;
select tests.login(5);
select is(private.clearway_user_id(),(select guest_user_id from t_link),'A bound session is the event''s guest');
select ok(private.can_facilitate(tests.id(10)),'The guest facilitates its event');
select ok(not private.can_facilitate(tests.id(11)),'The guest cannot facilitate another event');
select ok(not private.is_admin(),'The guest is not an admin');
select ok(not private.is_person(),'The guest is not a person');
select is((select count(*)::int from engagements),1,'The guest sees only its event');
select is((select count(*)::int from clearway_users),1,'The guest reads only its own Clearway record, not the team''s');
select is(public.event_link(tests.id(10),'read')->>'status','denied','The guest cannot see the link');
select is(public.event_link(tests.id(10),'cycle')->>'status','denied','The guest cannot replace the link');
select tests.login(5,215);
select is(private.clearway_user_id(),null,'A session of the guest user that never came in by the link is nobody');

-- Make a new link: the old code stops working for every browser that used it
select tests.login(2);
select isnt(public.event_link(tests.id(10),'cycle')->>'code',(select code from t_link),'Make a new link gives a new code');
select tests.login(5);
select is(private.clearway_user_id(),null,'A browser that came in by the old code loses access on its next read');
select ok(not private.can_facilitate(tests.id(10)),'and can no longer facilitate the event');
reset role;
set local role service_role;
select is(public.event_link_open('prepare',jsonb_build_object('code',(select code from t_link)))->>'status','replaced','The old code says it has been replaced');
reset role;
select is((select count(distinct guest_user_id)::int from private.event_links where engagement_id=tests.id(10)),1,'The new code keeps the same guest');

-- A person's sign-in is unchanged
set local role authenticated;
select tests.login(2);
select is(private.clearway_user_id(),tests.id(302),'A facilitator''s Google sign-in still resolves to them');
select ok(private.is_person(),'and they are a person');
select is((select count(*)::int from clearway_users where kind='person'),3,'A person still reads the team');

select * from finish();
rollback;
