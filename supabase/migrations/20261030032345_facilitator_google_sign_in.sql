begin;

-- Auth owns the email, identity verification and current session's login proof.
-- Neither JWT user_metadata nor the requested Google hosted-domain hint grants access.
create function private.google_clearway_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u
  where u.id = (select auth.uid()) and (select private.has_auth_session())
    and u.email_confirmed_at is not null and lower(u.email) ~ '^[^@[:space:]]+@clearway\.co$'
    and exists (select 1 from auth.mfa_amr_claims amr
      where amr.session_id = (select private.auth_session_id()) and amr.authentication_method = 'oauth')
    and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google'
      and lower(i.identity_data->>'email') = lower(u.email) and i.identity_data->>'email_verified' = 'true')
$$;

create or replace function private.clearway_user_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.clearway_users c
  where c.auth_user_id = (select auth.uid()) and not c.deleted
    and c.email = (select private.google_clearway_email())
$$;

-- Bind a pre-approved, unclaimed profile on first Google sign-in. No profile is
-- created, reassigned from another identity, or promoted. The update is atomic.
create function private.claim_clearway_access() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  verified_email text := private.google_clearway_email();
  claimed_id uuid;
begin
  if verified_email is null then return false; end if;
  update public.clearway_users set auth_user_id = (select auth.uid())
  where email = verified_email and not deleted
    and (auth_user_id is null or auth_user_id = (select auth.uid()))
  returning id into claimed_id;
  return claimed_id is not null;
end
$$;

-- Only a narrow, argument-free invoker wrapper is exposed to PostgREST.
create function public.claim_clearway_access() returns boolean
language sql security invoker set search_path = '' as $$
  select private.claim_clearway_access()
$$;
revoke all on function private.google_clearway_email() from public, anon, authenticated;
revoke all on function private.claim_clearway_access() from public, anon, authenticated;
revoke all on function public.claim_clearway_access() from public, anon, authenticated;
grant execute on function private.claim_clearway_access() to authenticated;
grant execute on function public.claim_clearway_access() to authenticated;

comment on function public.claim_clearway_access() is
  'Binds only the current verified Google OAuth identity to its pre-approved Clearway user. Does not grant new membership.';
commit;
