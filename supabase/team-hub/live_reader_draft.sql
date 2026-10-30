-- DRAFT. Do not run without Chris's approval.
-- Read-only access for the Clearway live app to Team Hub (Supabase project clearway-team-hub).
-- Column names checked against Team Hub's schema on October 29, 2026.
-- Every view hides soft-deleted rows. No view exposes tokens, notes, financial or sync columns.
-- The schema is not added to the Data API (PostgREST), so it is reachable only by the role below
-- through a direct or pooled database connection from the app's server.

create schema if not exists live_read;
revoke all on schema live_read from public, anon, authenticated;

create or replace view live_read.clients as
  select id, name, logo, timezone, address_line1, address_line2, city, state_province,
         postal_code, country, website, status
  from public.clients
  where deleted is not true;

create or replace view live_read.engagements as
  select id, client_id, title, engagement_type, status, start_date, end_date,
         assigned_consultant_id, coordinator_id
  from public.engagements
  where deleted is not true;

create or replace view live_read.engagement_elements as
  select id, engagement_id, title, type, status, scheduled_date, duration_minutes, order_index
  from public.engagement_elements
  where deleted is not true;

create or replace view live_read.events as
  select id, engagement_id, engagement_element_id, client_id, event_name,
         start_date_time, end_date_time, location, location_type, status
  from public.events
  where deleted is not true;

create or replace view live_read.people as
  select id, first_name, last_name, email, role, avatar
  from public.people
  where deleted is not true;

create or replace view live_read.person_emails as
  select id, person_id, email, is_primary
  from public.person_emails
  where deleted is not true;

create or replace view live_read.person_organizations as
  select id, person_id, organization_id, role, is_primary, end_date
  from public.person_organizations
  where deleted is not true;

create or replace view live_read.team_members as
  select id, name, email, status
  from public.team_members
  where deleted is not true;

-- The login role. Chris sets the password in the Supabase SQL editor and stores
-- the connection string only in the app's Vercel environment variables.
-- create role clearway_live_reader with login password '<set by Chris>' noinherit;

grant usage on schema live_read to clearway_live_reader;
grant select on all tables in schema live_read to clearway_live_reader;

-- Test (run as clearway_live_reader): each of these must fail.
--   select google_refresh_token from public.team_members limit 1;
--   select * from public.clients limit 1;
