-- Fictional, idempotent foundation seeds. Run only against Clearway Live.
-- Existing edits and soft-deleted history are preserved on repeated runs.
begin;
insert into public.churches(id,name,timezone,governance_body_name) values
 ('90000000-0000-4000-8000-000000000001','Clearway practice','America/Toronto','Team'),
 ('90000000-0000-4000-8000-000000000002','Riverside Church','America/Toronto','Elders') on conflict(id) do nothing;
insert into public.engagements(id,church_id,title,type,how_the_room_decides,settings) values('90000000-0000-4000-8000-000000000010','90000000-0000-4000-8000-000000000001','Practice room','practice','The room makes each decision by consensus. Votes and points show where the room is. We listen to each other and make space for concerns before agreeing on what we’ll do next.','{"seed":true,"fictional":true,"room_size":"very_small","tv_theme":"dark","texture":true,"ai_enabled":false}') on conflict(id) do nothing;
insert into public.engagements(id,church_id,title,type,how_the_room_decides,settings) values('90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000002','Riverside Church Wayfinding','wayfinding','The room makes each decision by consensus. Votes and points show where the room is. We listen to each other and make space for concerns before agreeing on what we’ll do next.','{"seed":true,"fictional":true,"room_size":"very_small","tv_theme":"dark","texture":true,"ai_enabled":false}') on conflict(id) do nothing;
insert into public.attendees(id,engagement_id,name,email,room_role,role_at_church) values('90000000-0000-4000-8000-000000000101','90000000-0000-4000-8000-000000000011','Sarah Ellis','sarah.ellis@riverside.example','participant','Lead pastor') on conflict(id) do nothing;
insert into public.attendees(id,engagement_id,name,email,room_role,role_at_church) values('90000000-0000-4000-8000-000000000102','90000000-0000-4000-8000-000000000011','Daniel Brooks','daniel.brooks@riverside.example','participant','Executive pastor') on conflict(id) do nothing;
insert into public.attendees(id,engagement_id,name,email,room_role,role_at_church) values('90000000-0000-4000-8000-000000000103','90000000-0000-4000-8000-000000000011','Priya Shah','priya.shah@riverside.example','participant','Elder') on conflict(id) do nothing;
insert into public.attendees(id,engagement_id,name,email,room_role,role_at_church) values('90000000-0000-4000-8000-000000000104','90000000-0000-4000-8000-000000000011','Michael Reed','michael.reed@riverside.example','participant','Worship pastor') on conflict(id) do nothing;
insert into public.attendees(id,engagement_id,name,email,room_role,role_at_church) values('90000000-0000-4000-8000-000000000105','90000000-0000-4000-8000-000000000011','Elena Cruz','elena.cruz@riverside.example','participant','Children’s ministry leader') on conflict(id) do nothing;
insert into public.attendees(id,engagement_id,name,email,room_role,role_at_church) values('90000000-0000-4000-8000-000000000106','90000000-0000-4000-8000-000000000011','Jordan Parker','jordan.parker@riverside.example','participant','Youth pastor') on conflict(id) do nothing;
insert into public.attendees(id,engagement_id,name,email,room_role,role_at_church) values('90000000-0000-4000-8000-000000000107','90000000-0000-4000-8000-000000000011','Grace Chen','grace.chen@riverside.example','participant','Community care leader') on conflict(id) do nothing;
insert into public.attendees(id,engagement_id,name,email,room_role,role_at_church) values('90000000-0000-4000-8000-000000000108','90000000-0000-4000-8000-000000000011','Thomas Bennett','thomas.bennett@riverside.example','scribe','Scribe') on conflict(id) do nothing;
insert into public.engagement_facilitators(engagement_id,clearway_user_id,role)
 select e.id,admin.id,'lead'::public.facilitator_role from public.engagements e cross join lateral
   (select id from public.clearway_users where is_admin and not deleted order by created_at,id limit 1) admin
 where e.id in('90000000-0000-4000-8000-000000000010','90000000-0000-4000-8000-000000000011')
   and not exists(select 1 from public.engagement_facilitators f where f.engagement_id=e.id and f.role='lead' and not f.deleted)
 on conflict do nothing;
commit;
