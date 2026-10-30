-- Disposable database only. This is not Team Hub and contains no real records.
create table public.clients(id uuid primary key,name text,logo text,timezone text,address_line1 text,address_line2 text,city text,state_province text,postal_code text,country text,website text,status text,deleted boolean,notes text,wave_customer_id text);
create table public.engagements(id uuid primary key,client_id uuid,title text,engagement_type text,status text,start_date date,end_date date,assigned_consultant_id uuid,coordinator_id uuid,deleted boolean,notes text,financial_total numeric);
create table public.engagement_elements(id uuid primary key,engagement_id uuid,title text,type text,status text,scheduled_date date,duration_minutes integer,order_index integer,deleted boolean,notes text);
create table public.events(id uuid primary key,engagement_id uuid,engagement_element_id uuid,client_id uuid,event_name text,start_date_time timestamptz,end_date_time timestamptz,location text,location_type text,status text,deleted boolean,notes text);
create table public.people(id uuid primary key,first_name text,last_name text,email text,role text,avatar text,deleted boolean,notes text);
create table public.person_emails(id uuid primary key,person_id uuid,email text,is_primary boolean,deleted boolean,notes text);
create table public.person_organizations(id uuid primary key,person_id uuid,organization_id uuid,role text,is_primary boolean,end_date date,deleted boolean,notes text);
create table public.team_members(id uuid primary key,name text,email text,status text,deleted boolean,google_refresh_token text,wave_access_token text,notes text);
do $$ declare t text; begin
  foreach t in array array['clients','engagements','engagement_elements','events','people','person_emails','person_organizations','team_members'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
  end loop;
end $$;
insert into clients(id,name,timezone,deleted,notes,wave_customer_id) values
 ('70000000-0000-4000-8000-000000000001','Reader fixture church','America/Toronto',false,'private notes','private wave customer'),
 ('70000000-0000-4000-8000-000000000002','Deleted church','America/Toronto',true,'private notes','private wave customer');
insert into engagements(id,client_id,title,engagement_type,status,start_date,end_date,deleted,notes,financial_total) values
 ('70000000-0000-4000-8000-000000000010','70000000-0000-4000-8000-000000000001','Reader fixture engagement','wayfinding','active','2026-11-01','2026-11-30',false,'private notes',10000),
 ('70000000-0000-4000-8000-000000000011','70000000-0000-4000-8000-000000000001','Deleted engagement','wayfinding','active',null,null,true,'private notes',5000);
insert into engagement_elements(id,engagement_id,title,type,status,scheduled_date,duration_minutes,order_index,deleted,notes) values
 ('70000000-0000-4000-8000-000000000020','70000000-0000-4000-8000-000000000010','Pre-call','pre_call','planned','2026-11-01',90,1,false,'private notes'),
 ('70000000-0000-4000-8000-000000000021','70000000-0000-4000-8000-000000000010','Deleted element','retreat','planned',null,90,2,true,'private notes');
insert into events(id,engagement_id,client_id,event_name,start_date_time,end_date_time,location,location_type,status,deleted,notes) values
 ('70000000-0000-4000-8000-000000000030','70000000-0000-4000-8000-000000000010','70000000-0000-4000-8000-000000000001','Pre-call','2026-11-01 15:00Z','2026-11-01 16:30Z','Video call','online','planned',false,'private notes'),
 ('70000000-0000-4000-8000-000000000031','70000000-0000-4000-8000-000000000010','70000000-0000-4000-8000-000000000001','Deleted event',null,null,null,null,'cancelled',true,'private notes');
insert into people(id,first_name,last_name,email,role,deleted,notes)
select ('71000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Person',n::text,'person'||n||'@example.org','Elder',false,'private notes' from generate_series(1,1205)n;
insert into people values('71000000-0000-4000-8000-000000002000','Deleted','Person','deleted@example.org','Elder',null,true,'private notes');
insert into person_organizations(id,person_id,organization_id,role,is_primary,end_date,deleted,notes)
select ('72000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('71000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'70000000-0000-4000-8000-000000000001','Board member',true,null,false,'private notes' from generate_series(1,1205)n;
insert into person_organizations values('72000000-0000-4000-8000-000000002000','71000000-0000-4000-8000-000000002000','70000000-0000-4000-8000-000000000001','Elder',true,null,true,'private notes');
insert into person_emails values
 ('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','PRIMARY@EXAMPLE.ORG',true,false,'private notes'),
 ('73000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','deleted@example.org',true,true,'private notes');
insert into team_members values
 ('74000000-0000-4000-8000-000000000001','Reader test facilitator','FAC@CLEARWAY.CO','active',false,'private google token','private wave token','private notes'),
 ('74000000-0000-4000-8000-000000000002','Deleted facilitator','deleted@clearway.co','inactive',true,'private google token','private wave token','private notes');
