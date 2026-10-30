-- Milestone 1 only. No Team Hub/CORE DDL or remote connections.
-- Identity/device bindings are server-issued; no browser can grant itself access.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
revoke create on schema public from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public;

create type public.engagement_type as enum ('wayfinding', 'day_and_a_half', 'team_workshop', 'practice');
create type public.engagement_status as enum ('setup', 'discover', 'pre_call', 'retreat', 'follow_up', 'closed');
create type public.facilitator_role as enum ('lead', 'co_facilitator');
create type public.room_role as enum ('participant', 'scribe');
create type public.join_request_status as enum ('pending', 'approved', 'declined');

create table public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  timezone text not null,
  logo_url text,
  mission text not null default '',
  purpose text not null default '',
  "values" jsonb not null default '[]' check (jsonb_typeof("values") = 'array'),
  strategy text not null default '',
  leadership_rhythms jsonb not null default '[]' check (jsonb_typeof(leadership_rhythms) = 'array'),
  governance_body_name text not null default '',
  team_hub_client_id uuid,
  core_organization_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  unique (id, team_hub_client_id)
);
create unique index churches_team_hub_client_unique on public.churches(team_hub_client_id) where not deleted;
create unique index churches_core_organization_unique on public.churches(core_organization_id) where not deleted;

create table public.engagements (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id),
  title text not null check (length(btrim(title)) > 0),
  type public.engagement_type not null default 'wayfinding',
  status public.engagement_status not null default 'setup',
  start_date date,
  end_date date,
  base_year smallint not null default extract(year from current_date),
  lens_names text[] not null default array['Congregation', 'Community', 'Leadership', 'Operations', 'Learning'],
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  how_the_room_decides text not null default '',
  team_hub_client_id uuid,
  team_hub_engagement_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  foreign key (church_id, team_hub_client_id) references public.churches(id, team_hub_client_id) on update cascade,
  check (end_date is null or start_date is null or end_date >= start_date),
  check (base_year between 1900 and 9990),
  check (array_ndims(lens_names) = 1 and cardinality(lens_names) = 5
    and array_position(lens_names, null) is null and not ('' = any(lens_names)))
);
create index engagements_church_id_idx on public.engagements(church_id, team_hub_client_id);
create unique index engagements_team_hub_unique on public.engagements(team_hub_engagement_id) where not deleted;

create table public.clearway_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null check (length(btrim(name)) > 0),
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@clearway[.]co$'),
  is_admin boolean not null default false,
  team_hub_team_member_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create unique index clearway_users_email_unique on public.clearway_users(lower(email)) where not deleted;
create unique index clearway_users_team_member_unique on public.clearway_users(team_hub_team_member_id) where not deleted;

create table public.engagement_facilitators (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id),
  clearway_user_id uuid not null references public.clearway_users(id),
  role public.facilitator_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create unique index engagement_facilitators_member_unique
  on public.engagement_facilitators(engagement_id, clearway_user_id) where not deleted;
create unique index engagement_facilitators_lead_unique
  on public.engagement_facilitators(engagement_id) where role = 'lead' and not deleted;
create index engagement_facilitators_engagement_idx on public.engagement_facilitators(engagement_id);
create index engagement_facilitators_user_idx on public.engagement_facilitators(clearway_user_id);

create table public.attendees (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id),
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null check (length(btrim(name)) > 0),
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  room_role public.room_role not null default 'participant',
  role_at_church text not null default '',
  verified_at timestamptz,
  team_hub_person_id uuid,
  extra_fields jsonb not null default '{}' check (jsonb_typeof(extra_fields) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  unique (id, engagement_id),
  check (verified_at is null or auth_user_id is not null)
);
create unique index attendees_email_unique on public.attendees(engagement_id, lower(email)) where not deleted;
create unique index attendees_auth_user_unique on public.attendees(engagement_id, auth_user_id) where not deleted;
create index attendees_engagement_idx on public.attendees(engagement_id);
create index attendees_auth_user_idx on public.attendees(auth_user_id);
create index attendees_team_hub_person_idx on public.attendees(team_hub_person_id) where team_hub_person_id is not null;

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id),
  name text not null check (length(btrim(name)) > 0),
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  device_id uuid not null,
  status public.join_request_status not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.clearway_users(id),
  attendee_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  foreign key (attendee_id, engagement_id) references public.attendees(id, engagement_id),
  check ((status = 'pending' and decided_at is null and decided_by is null and attendee_id is null)
    or (status = 'approved' and decided_at is not null and decided_by is not null and attendee_id is not null)
    or (status = 'declined' and decided_at is not null and decided_by is not null and attendee_id is null))
);
create index join_requests_engagement_idx on public.join_requests(engagement_id);
create index join_requests_decided_by_idx on public.join_requests(decided_by);
create index join_requests_attendee_idx on public.join_requests(attendee_id, engagement_id);
create unique index join_requests_pending_device_unique on public.join_requests(engagement_id, device_id)
  where status = 'pending' and not deleted;

create table public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id),
  attendee_id uuid not null,
  -- Deliberately not a foreign key to auth.sessions: sign-out deletes that row.
  -- Preserve this audit record while the access helper immediately denies access.
  auth_session_id uuid not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  foreign key (attendee_id, engagement_id) references public.attendees(id, engagement_id)
);
create unique index device_sessions_binding_unique on public.device_sessions(attendee_id, auth_session_id) where not deleted;
create index device_sessions_attendee_idx on public.device_sessions(attendee_id, engagement_id);
create index device_sessions_engagement_idx on public.device_sessions(engagement_id);
create index device_sessions_auth_session_idx on public.device_sessions(auth_session_id);

-- Private policy helpers never accept a caller-supplied user id or role.
-- Definer access is restricted to these identity-bound lookups to avoid recursive RLS.
-- The schema is not exposed by PostgREST. Empty search_path prevents object shadowing.
create function private.auth_session_id() returns uuid
language sql stable security invoker set search_path = '' as $$
  select case when (select auth.jwt()->>'session_id') ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    then (select auth.jwt()->>'session_id')::uuid end
$$;

create function private.has_auth_session() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from auth.sessions s join auth.users u on u.id = s.user_id
    where s.id = (select private.auth_session_id()) and s.user_id = (select auth.uid())
      and (s.not_after is null or s.not_after > now())
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
  )
$$;

create function private.clearway_user_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.clearway_users c join auth.users u on u.id = c.auth_user_id
  where (select auth.uid()) is not null and (select private.has_auth_session())
    and (select auth.jwt()->'app_metadata'->>'provider') = 'google'
    and c.auth_user_id = (select auth.uid()) and not c.deleted
    and lower(u.email) = c.email and u.email_confirmed_at is not null
    and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google'
      and lower(i.identity_data->>'email') = c.email and i.identity_data->>'email_verified' = 'true')
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.clearway_users c where c.id = (select private.clearway_user_id()) and c.is_admin
  )
$$;

create function private.can_facilitate(target_engagement uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.engagement_facilitators f
      join public.engagements e on e.id = f.engagement_id
      join public.churches c on c.id = e.church_id
    where f.clearway_user_id = (select private.clearway_user_id())
      and f.engagement_id = target_engagement and not f.deleted and not e.deleted and not c.deleted
  )
$$;

create function private.can_setup_church(target_church uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.engagements e where e.church_id = target_church
      and private.can_facilitate(e.id)
  )
$$;

create function private.room_attendee_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select a.id from public.attendees a
    join public.device_sessions d on d.attendee_id = a.id and d.engagement_id = a.engagement_id
    join public.engagements e on e.id = a.engagement_id
    join public.churches c on c.id = e.church_id
  where (select auth.uid()) is not null and (select private.has_auth_session())
    and a.auth_user_id = (select auth.uid()) and a.verified_at is not null
    and d.auth_session_id = (select private.auth_session_id())
    and not a.deleted and not d.deleted and d.revoked_at is null
    and not e.deleted and e.status <> 'closed' and not c.deleted
$$;

create function private.touch_record() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := clock_timestamp();
  return new;
end
$$;

create function private.normalize_email() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end
$$;

create function private.link_engagement_client() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.team_hub_client_id is null then
    select team_hub_client_id into new.team_hub_client_id from public.churches where id = new.church_id;
  end if;
  return new;
end
$$;
create trigger engagements_link_client before insert on public.engagements
  for each row execute function private.link_engagement_client();

create function private.validate_timezone() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise check_violation using message = 'Use a valid IANA time zone.';
  end if;
  return new;
end
$$;
create trigger churches_timezone before insert or update of timezone on public.churches
  for each row execute function private.validate_timezone();

-- Closing an engagement permanently revokes devices, even if status is later changed.
create function private.revoke_closed_engagement_devices() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.status = 'closed' and old.status <> 'closed') or (new.deleted and not old.deleted) then
    update public.device_sessions set revoked_at = coalesce(revoked_at, now()) where engagement_id = new.id;
  end if;
  return new;
end
$$;
create trigger engagements_revoke_devices after update of status, deleted on public.engagements
  for each row execute function private.revoke_closed_engagement_devices();

-- A changed roster email requires a fresh device binding, not the old person's session.
create function private.invalidate_changed_attendee() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
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
create trigger attendees_invalidate before update on public.attendees
  for each row execute function private.invalidate_changed_attendee();

-- Revoke default browser/function grants; grant only the policy lookup functions.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.auth_session_id(), private.has_auth_session(), private.clearway_user_id(),
  private.is_admin(), private.can_facilitate(uuid), private.can_setup_church(uuid), private.room_attendee_ids()
  to authenticated;

do $$
declare t text;
begin
  foreach t in array array['churches','engagements','clearway_users','engagement_facilitators','attendees','join_requests','device_sessions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('create trigger touch_record before update on public.%I for each row execute function private.touch_record()', t);
  end loop;
end
$$;
create trigger normalize_email before insert or update of email on public.clearway_users
  for each row execute function private.normalize_email();
create trigger normalize_email before insert or update of email on public.attendees
  for each row execute function private.normalize_email();
create trigger normalize_email before insert or update of email on public.join_requests
  for each row execute function private.normalize_email();

create policy churches_read on public.churches for select to authenticated
  using ((select private.is_admin()) or (not deleted and private.can_setup_church(id)));
create policy churches_insert on public.churches for insert to authenticated
  with check ((select private.is_admin()));
create policy churches_update on public.churches for update to authenticated
  using ((select private.is_admin()) or (not deleted and private.can_setup_church(id)))
  with check ((select private.is_admin()) or private.can_setup_church(id));
grant insert, update on public.churches to authenticated;

create policy engagements_read on public.engagements for select to authenticated
  using ((select private.is_admin()) or (not deleted and private.can_facilitate(id)));
create policy engagements_insert on public.engagements for insert to authenticated
  with check ((select private.is_admin()));
create policy engagements_update on public.engagements for update to authenticated
  using ((select private.is_admin()) or (not deleted and private.can_facilitate(id)))
  with check ((select private.is_admin()) or private.can_facilitate(id));
-- No browser can move an engagement to another church after it is created.
grant insert on public.engagements to authenticated;
grant update (title, type, status, start_date, end_date, base_year, lens_names, settings,
  how_the_room_decides, team_hub_engagement_id, deleted) on public.engagements to authenticated;

create policy clearway_users_read on public.clearway_users for select to authenticated
  using ((select private.is_admin()) or (not deleted and (select private.clearway_user_id()) is not null));
create policy clearway_users_insert on public.clearway_users for insert to authenticated
  with check ((select private.is_admin()));
create policy clearway_users_update on public.clearway_users for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
grant insert, update on public.clearway_users to authenticated;

create policy engagement_facilitators_read on public.engagement_facilitators for select to authenticated
  using ((select private.is_admin()) or (not deleted and private.can_facilitate(engagement_id)));
create policy engagement_facilitators_insert on public.engagement_facilitators for insert to authenticated
  with check ((select private.is_admin()) or (role = 'co_facilitator' and private.can_facilitate(engagement_id)));
create policy engagement_facilitators_update on public.engagement_facilitators for update to authenticated
  using ((select private.is_admin()) or (not deleted and role = 'co_facilitator' and private.can_facilitate(engagement_id)))
  with check ((select private.is_admin()) or (role = 'co_facilitator' and private.can_facilitate(engagement_id)));
grant insert, update on public.engagement_facilitators to authenticated;

create policy attendees_read on public.attendees for select to authenticated
  using ((select private.is_admin()) or (not deleted and private.can_facilitate(engagement_id))
    or id in (select private.room_attendee_ids()));
create policy attendees_insert on public.attendees for insert to authenticated
  with check ((select private.is_admin()) or private.can_facilitate(engagement_id));
create policy attendees_update on public.attendees for update to authenticated
  using ((select private.is_admin()) or (not deleted and private.can_facilitate(engagement_id)))
  with check ((select private.is_admin()) or private.can_facilitate(engagement_id));
-- Only trusted server code can bind Auth identities and mark a room attendee verified.
grant insert (id, engagement_id, name, email, room_role, role_at_church, team_hub_person_id, extra_fields)
  on public.attendees to authenticated;
grant update (name, email, room_role, role_at_church, team_hub_person_id, extra_fields, deleted)
  on public.attendees to authenticated;

create policy join_requests_read on public.join_requests for select to authenticated
  using ((select private.is_admin()) or (not deleted and private.can_facilitate(engagement_id)));
-- Join submission/approval and device binding will be one server transaction in PR 4.
-- No browser can issue or approve its own membership via a direct table write.

create policy device_sessions_read on public.device_sessions for select to authenticated
  using ((select private.is_admin()) or (not deleted and private.can_facilitate(engagement_id))
    or (not deleted and revoked_at is null and auth_session_id = (select private.auth_session_id())
      and attendee_id in (select private.room_attendee_ids())));
create policy device_sessions_revoke on public.device_sessions for update to authenticated
  using ((select private.is_admin()) or (not deleted and private.can_facilitate(engagement_id)))
  with check ((select private.is_admin()) or private.can_facilitate(engagement_id));
grant update (revoked_at, deleted) on public.device_sessions to authenticated;

comment on table public.join_requests is 'Private door list. Server mediates submission and approval; never expose the roster to unsigned phones.';
comment on table public.device_sessions is 'Server-issued room membership bound to a real Supabase Auth session; valid until engagement closure or explicit revocation.';
comment on function private.room_attendee_ids() is 'Identity-bound lookup, not an API. Never trust client user_metadata for room roles or facilitator privileges.';

commit;
