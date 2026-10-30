begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
create schema tests;
create function tests.uid(n integer) returns uuid language sql immutable as $$
  select ('40000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
create function tests.login(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.uid(n),
    'role','authenticated','session_id',tests.uid(100+n),
    'user_metadata',jsonb_build_object('is_admin',true,'email','allowed@clearway.co'),
    'app_metadata',jsonb_build_object('provider','google'))::text,true);
end
$$;
grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select tests.uid(n),case when n=3 then 'outsider@example.org' else 'auth'||n||'@clearway.co' end,
  case when n=5 then null else now() end,'{"is_admin":true}'::jsonb
from generate_series(1,9) n;
insert into auth.identities(user_id,provider,provider_id,identity_data)
select id,'google',id::text,jsonb_build_object('email',upper(email),'email_verified',true)
from auth.users where id <> tests.uid(4);
insert into auth.sessions(id,user_id,not_after)
select tests.uid(100+n),tests.uid(n),null from generate_series(1,9) n;
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method)
select gen_random_uuid(),tests.uid(100+n),now(),now(),case when n=6 then 'otp' else 'oauth' end
from generate_series(1,9) n;
insert into clearway_users(id,email,name,team_hub_team_member_id,deleted,auth_user_id)
select tests.uid(200+n),'auth'||n||'@clearway.co','Approved user '||n,tests.uid(300+n),n=7,
  case when n=8 then tests.uid(9) else null end
from unnest(array[1,4,5,6,7,8]) n;

select ok(not has_function_privilege('anon','public.claim_clearway_access()','execute'),'Anon cannot claim access');
select ok(not has_function_privilege('authenticated','private.google_clearway_email()','execute'),'Verified email lookup is private');
select ok(not (select prosecdef from pg_proc where oid='public.claim_clearway_access()'::regprocedure),'Public RPC uses invoker privileges');
select ok(has_function_privilege('authenticated','public.claim_clearway_access()','execute'),'Authenticated users can attempt their own claim');

set local role authenticated;
select tests.login(1);
select is((select count(*)::integer from clearway_users),0,'Pending allowlisted account cannot read directory before binding');
select is(public.claim_clearway_access(),true,'Verified current Google session claims its approved profile');
select is((select auth_user_id from clearway_users where email='auth1@clearway.co'),tests.uid(1),'Binding is to current Auth user');
select is((select is_admin from clearway_users where email='auth1@clearway.co'),false,'User metadata cannot grant admin access');
select is(public.claim_clearway_access(),true,'Returning Google sign-in is idempotent');
select is((select count(*)::integer from clearway_users where auth_user_id=tests.uid(1)),1,'Repeated claim creates no profiles');
select tests.login(2);
select is(public.claim_clearway_access(),false,'Unlisted Clearway Google account is refused');
select is((select count(*)::integer from clearway_users),0,'Unlisted account cannot read Clearway data');
select tests.login(3);
select is(public.claim_clearway_access(),false,'External domain is refused despite spoofed metadata');
select tests.login(4);
select is(public.claim_clearway_access(),false,'OAuth proof without verified Google identity is refused');
select tests.login(5);
select is(public.claim_clearway_access(),false,'Unconfirmed Auth email is refused');
select tests.login(6);
select is(public.claim_clearway_access(),false,'Email OTP cannot claim a Google-linked Clearway account');
select tests.login(7);
select is(public.claim_clearway_access(),false,'Deleted allowlist profile is refused');
select tests.login(8);
select is(public.claim_clearway_access(),false,'Cannot steal an approved profile bound to another Auth identity');
reset role;
select is((select auth_user_id from clearway_users where email='auth8@clearway.co'),tests.uid(9),'Original identity binding is preserved');
select is((select count(*)::integer from clearway_users),6,'Sign-in never creates Clearway membership');
update auth.identities set identity_data=jsonb_set(identity_data,'{email_verified}','false') where user_id=tests.uid(1);
set local role authenticated;
select tests.login(1);
select is(public.claim_clearway_access(),false,'Unverified Google email is refused on subsequent claim');
select is((select count(*)::integer from clearway_users),0,'Revoked Google verification immediately removes directory access');
reset role;
update auth.identities set identity_data=jsonb_set(identity_data,'{email_verified}','true') where user_id=tests.uid(1);
update auth.sessions set not_after=now()-interval '1 minute' where id=tests.uid(101);
set local role authenticated;
select is(public.claim_clearway_access(),false,'Expired session cannot claim access');
select is((select count(*)::integer from clearway_users),0,'Expired session cannot read facilitator data');
reset role;
update auth.sessions set not_after=null where id=tests.uid(101);
delete from auth.sessions where id=tests.uid(101);
set local role authenticated;
select is(public.claim_clearway_access(),false,'Revoked session cannot claim access');
reset role;
select * from finish();
rollback;
