-- Case/whitespace corrections must not sign a verified attendee out.
begin;

create or replace function private.invalidate_changed_attendee() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Normalize before comparing: BEFORE triggers run alphabetically.
  new.email := lower(btrim(new.email));
  if new.email is distinct from old.email then
    new.auth_user_id := null;
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
