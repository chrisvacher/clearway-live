begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('b2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(100+n))::text,true);
end $$;
grant execute on all functions in schema tests to authenticated,anon;
insert into auth.users(id,email,email_confirmed_at,last_sign_in_at)
  select tests.id(n),'access'||n||'@clearway.co',now(),'2026-11-03T12:00:00Z' from generate_series(1,2)n;
insert into auth.sessions(id,user_id) select tests.id(100+n),tests.id(n) from generate_series(1,2)n;
insert into auth.identities(user_id,provider,provider_id,identity_data)
  select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(1),tests.id(2));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method)
  select gen_random_uuid(),tests.id(100+n),now(),now(),'oauth' from generate_series(1,2)n;
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id)
  select tests.id(200+n),tests.id(n),'Access tester '||n,'access'||n||'@clearway.co',n=1,tests.id(300+n) from generate_series(1,2)n;
insert into clearway_users(id,name,email,kind) values(tests.id(204),'Event link','link-12345678901234567890123456789012@link.clearway.invalid','link_guest');

select ok(not has_function_privilege('anon','public.clearway_user_admin_list()','EXECUTE'),'Anonymous cannot read sign-in times');
select ok(not has_function_privilege('anon','public.clearway_user_admin_change(uuid,text)','EXECUTE'),'Anonymous cannot change access');
select ok(not (select prosecdef from pg_proc where oid='public.clearway_user_admin_change(uuid,text)'::regprocedure),'The public mutation is invoker');

set local role authenticated;
select tests.login(2);
select is(public.clearway_user_admin_list()->>'status','denied','Facilitators do not see sign-in history');
select is(public.clearway_user_admin_change(tests.id(202),'make_admin'),'denied','A facilitator cannot promote themselves');
select tests.login(1);
select is(public.clearway_user_admin_list()->>'status','ok','Admins see the directory');
select is((select (u->>'last_sign_in_at')::timestamptz from jsonb_array_elements(public.clearway_user_admin_list()->'users') u where u->>'id'=tests.id(202)::text),
  '2026-11-03T12:00:00Z'::timestamptz,'The last sign-in is from the bound auth user');
select ok(not public.clearway_user_admin_list()->'users' @> '[{"name":"Event link"}]','Event link profiles are not directory users');
select is(public.clearway_user_admin_change(tests.id(204),'remove'),'missing','User management preserves delegated event link profiles');
select is(public.clearway_user_admin_change(tests.id(201),'make_facilitator'),'last_admin','The last admin cannot be demoted');
select is(public.clearway_user_admin_change(tests.id(202),'make_admin'),'ok','An admin can grant admin access');
select tests.login(2);
select is(public.clearway_user_admin_change(tests.id(201),'make_facilitator'),'ok','A new admin can change roles');
select is(public.clearway_user_admin_change(tests.id(201),'remove'),'ok','An admin can revoke facilitator access');
select tests.login(1);
select is(public.clearway_user_admin_list()->>'status','denied','The removed profile immediately loses access');
reset role;
select ok(exists(select 1 from clearway_users where id=tests.id(201) and deleted and auth_user_id is null),'The historical profile is kept and its auth binding is available for later re-add');
select * from finish();
rollback;
