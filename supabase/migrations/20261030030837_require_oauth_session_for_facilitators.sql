-- app_metadata.provider describes linked account providers, not the current login.
-- Require the real Auth session's OAuth proof and a verified Clearway Google identity.
-- Google is the only external provider enabled for facilitator sign-in in PR 3.
begin;

create or replace function private.clearway_user_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.clearway_users c join auth.users u on u.id = c.auth_user_id
  where (select auth.uid()) is not null and (select private.has_auth_session())
    and exists (select 1 from auth.mfa_amr_claims amr
      where amr.session_id = (select private.auth_session_id()) and amr.authentication_method = 'oauth')
    and c.auth_user_id = (select auth.uid()) and not c.deleted
    and lower(u.email) = c.email and u.email_confirmed_at is not null
    and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google'
      and lower(i.identity_data->>'email') = c.email and i.identity_data->>'email_verified' = 'true')
$$;

create or replace function private.invalidate_changed_attendee() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Normalize before comparing: BEFORE triggers run alphabetically.
  new.email := lower(btrim(new.email));
  if new.email is distinct from old.email then
    new.auth_user_id := null;
    new.verified_at := null;
  end if;
  -- ON DELETE SET NULL from auth.users must also clear verification.
  if new.auth_user_id is null then
    new.verified_at := null;
  end if;
  if new.email is distinct from old.email or (new.deleted and not old.deleted)
    or new.auth_user_id is distinct from old.auth_user_id or new.verified_at is null then
    update public.device_sessions set revoked_at = coalesce(revoked_at, now()) where attendee_id = old.id;
  end if;
  return new;
end
$$;
commit;
