-- An admin link for one event (Chris, November 19). A signed-in Clearway facilitator copies a link, live.clearway.co/a/<code>,
-- and sends it to anyone. Opening it signs that browser in, with no Google sign-in, as the event's link guest: a co-facilitator
-- of that one event and nothing else (never an admin, never another event). Every existing check (can_facilitate, is_admin,
-- the row-level security on every table) applies to the guest unchanged, because the guest is a Clearway user record of its
-- own kind. Make a new link retires the code: every browser signed in through it loses access on its next read.
begin;

-- 1. Clearway user records gain a kind. A link guest has no Team Hub member, an address that can never receive mail or sign
--    in with Google, and is never an admin.
alter table public.clearway_users add column kind text not null default 'person';
alter table public.clearway_users add constraint clearway_users_kind_check check (kind in ('person', 'link_guest'));
alter table public.clearway_users alter column team_hub_team_member_id drop not null;
alter table public.clearway_users drop constraint clearway_users_email_check;
alter table public.clearway_users add constraint clearway_users_email_check check (email = lower(btrim(email)) and (
  (kind = 'person' and email ~ '^[^@[:space:]]+@clearway[.]co$')
  or (kind = 'link_guest' and email ~ '^link-[0-9a-f]{32}@link[.]clearway[.]invalid$')));
alter table public.clearway_users add constraint clearway_users_member_check check (kind = 'link_guest' or team_hub_team_member_id is not null);
alter table public.clearway_users add constraint clearway_users_guest_not_admin check (kind = 'person' or not is_admin);

-- 2. The links. One live code per event; retired codes are kept so an old link says it has been replaced.
create table private.event_links (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id),
  code text not null unique check (code ~ '^[a-z2-9]{12}$'),
  guest_user_id uuid not null references public.clearway_users(id),
  created_by uuid not null references public.clearway_users(id),
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  retired_by uuid references public.clearway_users(id)
);
create unique index event_links_one_live on private.event_links(engagement_id) where retired_at is null;
create index event_links_guest on private.event_links(guest_user_id);
-- Each browser that opened a link: its own Auth session, bound to the code it came in by.
create table private.event_link_sessions (
  session_id uuid primary key,
  link_id uuid not null references private.event_links(id),
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index event_link_sessions_link on private.event_link_sessions(link_id);
alter table private.event_links enable row level security;
alter table private.event_links force row level security;
alter table private.event_link_sessions enable row level security;
alter table private.event_link_sessions force row level security;
revoke all on private.event_links, private.event_link_sessions from public, anon, authenticated;

-- 3. Who the current session is. A person: the verified Google sign-in, exactly as before. A link guest: a real, unexpired
--    Auth session that was opened through a code still live for that guest's event.
create or replace function private.clearway_user_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.clearway_users c
  where c.auth_user_id = (select auth.uid()) and not c.deleted and (
    (c.kind = 'person' and c.email = (select private.google_clearway_email()))
    or (c.kind = 'link_guest' and (select private.has_auth_session()) and exists (
      select 1 from private.event_link_sessions s join private.event_links l on l.id = s.link_id
        join public.engagements e on e.id = l.engagement_id
      where s.session_id = (select private.auth_session_id()) and s.user_id = (select auth.uid())
        and l.guest_user_id = c.id and l.retired_at is null and not e.deleted)))
$$;

-- A real person (not a link guest) is signed in.
create function private.is_person() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clearway_users c where c.id = (select private.clearway_user_id()) and c.kind = 'person')
$$;
revoke all on function private.is_person() from public, anon;
grant execute on function private.is_person() to authenticated;

-- A link guest reads only its own record, never the Clearway team's names and addresses.
drop policy clearway_users_read on public.clearway_users;
create policy clearway_users_read on public.clearway_users for select to authenticated
  using ((select private.is_admin()) or (not deleted and (select private.clearway_user_id()) is not null
    and ((select private.is_person()) or id = (select private.clearway_user_id()))));

-- 4. A code: 12 characters from 32 letters and digits that are never confused (no 0, 1, i, l, o), about 60 bits.
create function private.event_link_code() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  raw bytea := decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex');
  picks int[] := array[0, 1, 2, 3, 4, 5, 16, 17, 18, 19, 20, 21];
  out text := '';
  i int;
begin
  -- Bytes 6 and 8 of a v4 uuid carry its version and variant; these bytes are fully random.
  foreach i in array picks loop
    out := out || substr(alphabet, (get_byte(raw, i) % 31) + 1, 1);
  end loop;
  return out;
end
$$;
revoke all on function private.event_link_code() from public, anon, authenticated;

-- 5. Read, create, or replace an event's link. People only: a link guest can neither see nor change the link.
create function private.event_link(p_engagement uuid, p_action text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := (select private.clearway_user_id());
  live private.event_links;
  guest uuid;
  token text;
begin
  if me is null or not (select private.is_person()) or p_engagement is null
     or not ((select private.can_facilitate(p_engagement)) or (select private.is_admin())) then
    return jsonb_build_object('status', 'denied');
  end if;
  if not exists (select 1 from public.engagements e where e.id = p_engagement and not e.deleted) then
    return jsonb_build_object('status', 'missing');
  end if;
  if p_action not in ('read', 'create', 'cycle') then return jsonb_build_object('status', 'invalid_request'); end if;
  perform pg_advisory_xact_lock(hashtextextended('event_link:' || p_engagement::text, 0));
  select * into live from private.event_links l where l.engagement_id = p_engagement and l.retired_at is null;
  if p_action = 'read' or (p_action = 'create' and live.id is not null) then
    return jsonb_build_object('status', 'ok', 'code', live.code, 'created_at', live.created_at);
  end if;
  -- The event's guest: one per event, kept across new codes.
  select l.guest_user_id into guest from private.event_links l where l.engagement_id = p_engagement order by l.created_at desc limit 1;
  if guest is null then
    token := replace(gen_random_uuid()::text, '-', '');
    insert into public.clearway_users(name, email, kind, is_admin, team_hub_team_member_id)
    values ('Event link', 'link-' || token || '@link.clearway.invalid', 'link_guest', false, null)
    returning id into guest;
  end if;
  if not exists (select 1 from public.engagement_facilitators f where f.engagement_id = p_engagement and f.clearway_user_id = guest and not f.deleted) then
    insert into public.engagement_facilitators(engagement_id, clearway_user_id, role) values (p_engagement, guest, 'co_facilitator');
  end if;
  if live.id is not null then
    update private.event_links set retired_at = now(), retired_by = me where id = live.id;
  end if;
  loop
    token := (select private.event_link_code());
    exit when not exists (select 1 from private.event_links l where l.code = token);
  end loop;
  insert into private.event_links(engagement_id, code, guest_user_id, created_by)
  values (p_engagement, token, guest, me) returning * into live;
  return jsonb_build_object('status', 'ok', 'code', live.code, 'created_at', live.created_at, 'replaced', p_action = 'cycle');
end
$$;
revoke all on function private.event_link(uuid, text) from public, anon, authenticated;
grant execute on function private.event_link(uuid, text) to authenticated;
create function public.event_link(p_engagement uuid, p_action text) returns jsonb
language sql volatile security invoker set search_path = '' as $$ select private.event_link(p_engagement, p_action) $$;
revoke all on function public.event_link(uuid, text) from public, anon;
grant execute on function public.event_link(uuid, text) to authenticated;

-- 6. Opening a link (the server only, with the service key). 'prepare' names the guest's sign-in address for a live code;
--    'bind' ties the new Auth session to that code once the server has exchanged it.
create function private.event_link_open(p_action text, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  link private.event_links;
  guest public.clearway_users;
  v_code text := lower(btrim(coalesce(p->>'code', '')));
  v_user uuid;
  v_session uuid;
begin
  if v_code !~ '^[a-z2-9]{12}$' then return jsonb_build_object('status', 'missing'); end if;
  select * into link from private.event_links l where l.code = v_code;
  if link.id is null then return jsonb_build_object('status', 'missing'); end if;
  if link.retired_at is not null then return jsonb_build_object('status', 'replaced'); end if;
  if not exists (select 1 from public.engagements e where e.id = link.engagement_id and not e.deleted) then
    return jsonb_build_object('status', 'missing');
  end if;
  select * into guest from public.clearway_users c where c.id = link.guest_user_id and c.kind = 'link_guest' and not c.deleted;
  if guest.id is null then return jsonb_build_object('status', 'missing'); end if;
  if p_action = 'prepare' then
    return jsonb_build_object('status', 'ok', 'email', guest.email, 'engagement', link.engagement_id);
  elsif p_action = 'bind' then
    v_user := case when coalesce(p->>'user', '') ~* '^[0-9a-f-]{36}$' then (p->>'user')::uuid end;
    v_session := case when coalesce(p->>'session', '') ~* '^[0-9a-f-]{36}$' then (p->>'session')::uuid end;
    if v_user is null or v_session is null then return jsonb_build_object('status', 'invalid_request'); end if;
    if not exists (select 1 from auth.users u where u.id = v_user and lower(u.email) = guest.email and u.email_confirmed_at is not null and u.deleted_at is null) then
      return jsonb_build_object('status', 'denied');
    end if;
    if guest.auth_user_id is null then
      update public.clearway_users set auth_user_id = v_user, updated_at = now() where id = guest.id;
    elsif guest.auth_user_id <> v_user then
      return jsonb_build_object('status', 'denied');
    end if;
    insert into private.event_link_sessions(session_id, link_id, user_id) values (v_session, link.id, v_user)
    on conflict (session_id) do update set link_id = excluded.link_id, user_id = excluded.user_id;
    return jsonb_build_object('status', 'ok', 'engagement', link.engagement_id);
  end if;
  return jsonb_build_object('status', 'invalid_request');
end
$$;
revoke all on function private.event_link_open(text, jsonb) from public, anon, authenticated;
grant execute on function private.event_link_open(text, jsonb) to service_role;
create function public.event_link_open(p_action text, p jsonb) returns jsonb
language sql volatile security invoker set search_path = '' as $$ select private.event_link_open(p_action, p) $$;
revoke all on function public.event_link_open(text, jsonb) from public, anon, authenticated;
grant execute on function public.event_link_open(text, jsonb) to service_role;
grant usage on schema private to service_role;

comment on table private.event_links is 'Admin links for one event. A live code signs a browser in as that event''s link guest (a co-facilitator of it only).';
commit;
