begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('b1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.login(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.id(n),'role','authenticated','session_id',tests.id(100+n))::text,true);
end $$;
grant execute on all functions in schema tests to authenticated,anon;
insert into auth.users(id,email,email_confirmed_at) select tests.id(n),'template'||n||'@clearway.co',now() from generate_series(1,3)n;
insert into auth.sessions(id,user_id) select tests.id(100+n),tests.id(n) from generate_series(1,3)n;
insert into auth.identities(user_id,provider,provider_id,identity_data)
  select id,'google',id::text,jsonb_build_object('email',email,'email_verified',true) from auth.users where id in(tests.id(1),tests.id(2),tests.id(3));
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method)
  select gen_random_uuid(),tests.id(100+n),now(),now(),'oauth' from generate_series(1,3)n;
insert into clearway_users(id,auth_user_id,name,email,is_admin,team_hub_team_member_id)
  select tests.id(200+n),tests.id(n),'Template tester '||n,'template'||n||'@clearway.co',n=3,tests.id(300+n) from generate_series(1,3)n;
insert into private.templates(id,name,description,created_by,sessions,block)
  select tests.id(400),'Shared block','Original description',tests.id(201),sessions,true
  from private.templates where id='c1ea0000-0000-4000-8000-000000000001';
select ok(not has_function_privilege('anon','public.template_manage(text,uuid,text)','EXECUTE'),'Anonymous may not manage templates');
select ok(not (select prosecdef from pg_proc where oid='public.template_manage(text,uuid,text)'::regprocedure),'The public function uses invoker security');

set local role authenticated;
select tests.login(2);
select is(public.template_read()->>'can_manage','true','The library reports management availability for a Clearway person');
select is(public.template_manage('rename',tests.id(400),'Other name')->>'status','denied','A teammate cannot rename a shared block');
select is(public.template_manage('rename','c1ea0000-0000-4000-8000-000000000001','Other name')->>'status','denied','A shipped template cannot be renamed');
select is(public.template_manage('duplicate',tests.id(400),null)->>'status','ok','A teammate can copy a visible block');
select ok(public.template_read()->'templates' @> '[{"name":"Shared block (copy)","block":true,"mine":true,"shared":false,"count":11}]','Copy keeps steps and block kind and belongs privately to its new owner');
select is(public.template_manage('rename',(select (t->>'id')::uuid from jsonb_array_elements(public.template_read()->'templates') t where t->>'name'='Shared block (copy)'),'  My    block  ')->>'status','ok','The owner can rename their copy');
select ok(public.template_read()->'templates' @> '[{"name":"My block","block":true},{"name":"Shared block","block":true}]','Renaming changes only the copy and normalizes spacing');
select is(public.template_manage('rename',tests.id(400),'')->>'status','denied','Invalid rename cannot bypass ownership');

select tests.login(1);
select is(public.template_manage('rename',tests.id(400),'')->>'status','invalid_request','The owner must supply a name');
select ok(not (public.template_read()->'templates' @> '[{"name":"My block"}]'),'The duplicated copy stays private');
select tests.login(3);
select is(public.template_manage('rename',tests.id(400),'Admin name')->>'status','ok','An admin can rename a saved block');
select is(public.template_write('remove',jsonb_build_object('template',tests.id(400)))->>'status','ok','The existing removal path still works');
select is(public.template_manage('duplicate',tests.id(400),null)->>'status','missing','A deleted block cannot be copied');
select * from finish();
rollback;
