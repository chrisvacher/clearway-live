-- REVIEWED TEAM HUB INSTALLER. CHRIS REVIEWS AND RUNS THIS HIMSELF.
-- Never run this file via the Live migrations or against CORE.
-- Target: Team Hub (tilmrkgiwlpuflbtueen), PostgreSQL 17.
-- Creates only two dedicated roles, eight views and eight role-specific SELECT
-- policies. Existing source data, RLS enable/force flags and PUBLIC grants remain
-- unchanged. All operations roll back if a preflight or final assertion fails.
-- No password is embedded. After review/install, set the reader password privately
-- and store its read-only DSN as TEAM_HUB_DATABASE_URL in Live's Vercel settings.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

do $$
begin
  if current_setting('server_version_num')::integer<170000 then raise exception 'PostgreSQL 17 or later is required'; end if;
  if not exists(select 1 from pg_roles where rolname='clearway_live_view_owner') then
    create role clearway_live_view_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='clearway_live_reader') then
    create role clearway_live_reader login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if exists(select 1 from pg_roles where rolname in('clearway_live_view_owner','clearway_live_reader')
    and (rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication)) then
    raise exception 'Existing Live roles have unexpected privileges. Review them before installation.';
  end if;
  if exists(select 1 from pg_auth_members m where
    m.member in(select oid from pg_roles where rolname in('clearway_live_view_owner','clearway_live_reader'))
    or (m.roleid in(select oid from pg_roles where rolname in('clearway_live_view_owner','clearway_live_reader'))
      and m.member<>(select oid from pg_roles where rolname=current_user))) then
    raise exception 'Live roles must not inherit other roles or be granted beyond the installing administrator.';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname<>'live_read' and c.relowner in(select oid from pg_roles where rolname in('clearway_live_view_owner','clearway_live_reader'))) then
    raise exception 'A Live role owns objects outside live_read. Review before installation.';
  end if;
end $$;
alter role clearway_live_view_owner nologin noinherit;
alter role clearway_live_reader login noinherit connection limit 5;
alter role clearway_live_reader set default_transaction_read_only=on;
alter role clearway_live_reader set statement_timeout='5s';
alter role clearway_live_reader set lock_timeout='1s';
alter role clearway_live_reader set idle_in_transaction_session_timeout='10s';
alter role clearway_live_reader set search_path=live_read,pg_catalog;

create schema if not exists live_read;
revoke all on schema live_read from public,anon,authenticated;
grant usage,create on schema live_read to clearway_live_view_owner;
-- PostgreSQL 17's role creator normally receives ADMIN without SET/INHERIT.
-- Permit ownership transfer/replacement inside this transaction, then restore
-- administrative-only membership before committing. No app role gains membership.
do $$ begin
  execute format('grant clearway_live_view_owner to %I with inherit true, set true',current_user);
end $$;
grant usage on schema live_read to clearway_live_reader;
grant usage on schema public to clearway_live_view_owner;
revoke all on all tables in schema live_read from public,anon,authenticated,clearway_live_reader;

-- Default-owner views intentionally use this restricted non-table-owner role.
-- It cannot log in, bypass RLS, read disallowed source columns, or write anything.
-- security_invoker=true would require giving the login direct source access,
-- allowing it to bypass these soft-delete-filtered projections.

revoke all on public.clients from clearway_live_reader,clearway_live_view_owner;
-- Remove stale direct column grants too; table REVOKE does not remove them.
do $$ declare cols text; begin
  select string_agg(quote_ident(attname),', ') into cols from pg_attribute
    where attrelid='public.clients'::regclass and attnum>0 and not attisdropped;
  execute 'revoke all privileges ('||cols||') on public.clients from clearway_live_reader,clearway_live_view_owner';
end $$;
grant select (id, name, logo, timezone, address_line1, address_line2, city, state_province, postal_code, country, website, status, deleted) on public.clients to clearway_live_view_owner;
drop policy if exists clearway_live_view_read on public.clients;
create policy clearway_live_view_read on public.clients for select to clearway_live_view_owner using (deleted is not true);
create or replace view live_read.clients with (security_barrier=true,security_invoker=false) as
  select id, name, logo, timezone, address_line1, address_line2, city, state_province, postal_code, country, website, status from public.clients where deleted is not true;
alter view live_read.clients owner to clearway_live_view_owner;
revoke all on live_read.clients from clearway_live_reader;
grant select on live_read.clients to clearway_live_reader;

revoke all on public.engagements from clearway_live_reader,clearway_live_view_owner;
-- Remove stale direct column grants too; table REVOKE does not remove them.
do $$ declare cols text; begin
  select string_agg(quote_ident(attname),', ') into cols from pg_attribute
    where attrelid='public.engagements'::regclass and attnum>0 and not attisdropped;
  execute 'revoke all privileges ('||cols||') on public.engagements from clearway_live_reader,clearway_live_view_owner';
end $$;
grant select (id, client_id, title, engagement_type, status, start_date, end_date, assigned_consultant_id, coordinator_id, deleted) on public.engagements to clearway_live_view_owner;
drop policy if exists clearway_live_view_read on public.engagements;
create policy clearway_live_view_read on public.engagements for select to clearway_live_view_owner using (deleted is not true);
create or replace view live_read.engagements with (security_barrier=true,security_invoker=false) as
  select id, client_id, title, engagement_type, status, start_date, end_date, assigned_consultant_id, coordinator_id from public.engagements where deleted is not true;
alter view live_read.engagements owner to clearway_live_view_owner;
revoke all on live_read.engagements from clearway_live_reader;
grant select on live_read.engagements to clearway_live_reader;

revoke all on public.engagement_elements from clearway_live_reader,clearway_live_view_owner;
-- Remove stale direct column grants too; table REVOKE does not remove them.
do $$ declare cols text; begin
  select string_agg(quote_ident(attname),', ') into cols from pg_attribute
    where attrelid='public.engagement_elements'::regclass and attnum>0 and not attisdropped;
  execute 'revoke all privileges ('||cols||') on public.engagement_elements from clearway_live_reader,clearway_live_view_owner';
end $$;
grant select (id, engagement_id, title, type, status, scheduled_date, duration_minutes, order_index, deleted) on public.engagement_elements to clearway_live_view_owner;
drop policy if exists clearway_live_view_read on public.engagement_elements;
create policy clearway_live_view_read on public.engagement_elements for select to clearway_live_view_owner using (deleted is not true);
create or replace view live_read.engagement_elements with (security_barrier=true,security_invoker=false) as
  select id, engagement_id, title, type, status, scheduled_date, duration_minutes, order_index from public.engagement_elements where deleted is not true;
alter view live_read.engagement_elements owner to clearway_live_view_owner;
revoke all on live_read.engagement_elements from clearway_live_reader;
grant select on live_read.engagement_elements to clearway_live_reader;

revoke all on public.events from clearway_live_reader,clearway_live_view_owner;
-- Remove stale direct column grants too; table REVOKE does not remove them.
do $$ declare cols text; begin
  select string_agg(quote_ident(attname),', ') into cols from pg_attribute
    where attrelid='public.events'::regclass and attnum>0 and not attisdropped;
  execute 'revoke all privileges ('||cols||') on public.events from clearway_live_reader,clearway_live_view_owner';
end $$;
grant select (id, engagement_id, engagement_element_id, client_id, event_name, start_date_time, end_date_time, location, location_type, status, deleted) on public.events to clearway_live_view_owner;
drop policy if exists clearway_live_view_read on public.events;
create policy clearway_live_view_read on public.events for select to clearway_live_view_owner using (deleted is not true);
create or replace view live_read.events with (security_barrier=true,security_invoker=false) as
  select id, engagement_id, engagement_element_id, client_id, event_name, start_date_time, end_date_time, location, location_type, status from public.events where deleted is not true;
alter view live_read.events owner to clearway_live_view_owner;
revoke all on live_read.events from clearway_live_reader;
grant select on live_read.events to clearway_live_reader;

revoke all on public.people from clearway_live_reader,clearway_live_view_owner;
-- Remove stale direct column grants too; table REVOKE does not remove them.
do $$ declare cols text; begin
  select string_agg(quote_ident(attname),', ') into cols from pg_attribute
    where attrelid='public.people'::regclass and attnum>0 and not attisdropped;
  execute 'revoke all privileges ('||cols||') on public.people from clearway_live_reader,clearway_live_view_owner';
end $$;
grant select (id, first_name, last_name, email, role, avatar, deleted) on public.people to clearway_live_view_owner;
drop policy if exists clearway_live_view_read on public.people;
create policy clearway_live_view_read on public.people for select to clearway_live_view_owner using (deleted is not true);
create or replace view live_read.people with (security_barrier=true,security_invoker=false) as
  select id, first_name, last_name, email, role, avatar from public.people where deleted is not true;
alter view live_read.people owner to clearway_live_view_owner;
revoke all on live_read.people from clearway_live_reader;
grant select on live_read.people to clearway_live_reader;

revoke all on public.person_emails from clearway_live_reader,clearway_live_view_owner;
-- Remove stale direct column grants too; table REVOKE does not remove them.
do $$ declare cols text; begin
  select string_agg(quote_ident(attname),', ') into cols from pg_attribute
    where attrelid='public.person_emails'::regclass and attnum>0 and not attisdropped;
  execute 'revoke all privileges ('||cols||') on public.person_emails from clearway_live_reader,clearway_live_view_owner';
end $$;
grant select (id, person_id, email, is_primary, deleted) on public.person_emails to clearway_live_view_owner;
drop policy if exists clearway_live_view_read on public.person_emails;
create policy clearway_live_view_read on public.person_emails for select to clearway_live_view_owner using (deleted is not true);
create or replace view live_read.person_emails with (security_barrier=true,security_invoker=false) as
  select id, person_id, email, is_primary from public.person_emails where deleted is not true;
alter view live_read.person_emails owner to clearway_live_view_owner;
revoke all on live_read.person_emails from clearway_live_reader;
grant select on live_read.person_emails to clearway_live_reader;

revoke all on public.person_organizations from clearway_live_reader,clearway_live_view_owner;
-- Remove stale direct column grants too; table REVOKE does not remove them.
do $$ declare cols text; begin
  select string_agg(quote_ident(attname),', ') into cols from pg_attribute
    where attrelid='public.person_organizations'::regclass and attnum>0 and not attisdropped;
  execute 'revoke all privileges ('||cols||') on public.person_organizations from clearway_live_reader,clearway_live_view_owner';
end $$;
grant select (id, person_id, organization_id, role, is_primary, end_date, deleted) on public.person_organizations to clearway_live_view_owner;
drop policy if exists clearway_live_view_read on public.person_organizations;
create policy clearway_live_view_read on public.person_organizations for select to clearway_live_view_owner using (deleted is not true);
create or replace view live_read.person_organizations with (security_barrier=true,security_invoker=false) as
  select id, person_id, organization_id, role, is_primary, end_date from public.person_organizations where deleted is not true;
alter view live_read.person_organizations owner to clearway_live_view_owner;
revoke all on live_read.person_organizations from clearway_live_reader;
grant select on live_read.person_organizations to clearway_live_reader;

revoke all on public.team_members from clearway_live_reader,clearway_live_view_owner;
-- Remove stale direct column grants too; table REVOKE does not remove them.
do $$ declare cols text; begin
  select string_agg(quote_ident(attname),', ') into cols from pg_attribute
    where attrelid='public.team_members'::regclass and attnum>0 and not attisdropped;
  execute 'revoke all privileges ('||cols||') on public.team_members from clearway_live_reader,clearway_live_view_owner';
end $$;
grant select (id, name, email, deleted) on public.team_members to clearway_live_view_owner;
drop policy if exists clearway_live_view_read on public.team_members;
create policy clearway_live_view_read on public.team_members for select to clearway_live_view_owner using (deleted is not true);
create or replace view live_read.team_members with (security_barrier=true,security_invoker=false) as
  select id, name, email from public.team_members where deleted is not true;
alter view live_read.team_members owner to clearway_live_view_owner;
revoke all on live_read.team_members from clearway_live_reader;
grant select on live_read.team_members to clearway_live_reader;

revoke create on schema live_read from clearway_live_view_owner;
do $$ begin
  execute format('grant clearway_live_view_owner to %I with inherit false, set false',current_user);
end $$;
revoke all on all tables in schema live_read from public,anon,authenticated;

-- PUBLIC is inherited even by a NOINHERIT login. Fail closed if existing PUBLIC
-- grants or privileged functions would offer an escape from the projections.
-- This installer never revokes Team Hub's existing PUBLIC rights automatically.
do $$ declare t text; unsafe text; begin
  foreach t in array array['clients','engagements','engagement_elements','events','people','person_emails','person_organizations','team_members'] loop
    if has_any_column_privilege('clearway_live_reader','public.'||t,'SELECT')
      or has_table_privilege('clearway_live_reader','public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') then
      raise exception 'Reader has unexpected source rights on public.%. Review existing PUBLIC grants.',t;
    end if;
    if not has_table_privilege('clearway_live_reader','live_read.'||t,'SELECT')
      or has_table_privilege('clearway_live_reader','live_read.'||t,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') then
      raise exception 'Incorrect projection privileges on live_read.%',t;
    end if;
  end loop;
  select string_agg(p.oid::regprocedure::text,', ') into unsafe
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.prosecdef and n.nspname not in('pg_catalog','information_schema')
      and has_schema_privilege('clearway_live_reader',n.oid,'USAGE')
      and has_function_privilege('clearway_live_reader',p.oid,'EXECUTE');
  if unsafe is not null then
    raise exception 'Reader can execute existing privileged functions. Review their PUBLIC grants before installing: %',unsafe;
  end if;
end $$;

-- Do not add live_read to Supabase's Data API exposed schemas. The Live server
-- connects with this login only. No service/admin key or ordinary user reads it.
commit;
