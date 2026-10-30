begin;
-- Facilitators can edit church details, but cannot repoint external links.
revoke update on public.churches from authenticated;
grant update(name,timezone,logo_url,mission,purpose,"values",strategy,leadership_rhythms,governance_body_name,deleted) on public.churches to authenticated;
revoke update(team_hub_engagement_id) on public.engagements from authenticated;

-- Atomic save keeps church, engagement and facilitator assignments together.
create function private.save_engagement(p_id uuid,p_church jsonb,p_engagement jsonb,p_lead uuid,p_co uuid,p_client uuid,p_hub_engagement uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare e public.engagements; church uuid; target uuid:=coalesce(p_id,gen_random_uuid());
begin
  if p_id is null then
    if not (select private.is_admin()) then raise insufficient_privilege; end if;
    if p_client is null or p_hub_engagement is null then raise check_violation using message='Choose a linked Team Hub engagement.'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_client::text,0));
    select id into church from public.churches where team_hub_client_id=p_client and not deleted;
    if church is null then insert into public.churches(name,timezone,team_hub_client_id) values(p_church->>'name',p_church->>'timezone',p_client) returning id into church; end if;
    insert into public.engagements(id,church_id,title,team_hub_client_id,team_hub_engagement_id) values(target,church,p_engagement->>'title',p_client,p_hub_engagement);
  else
    if not ((select private.is_admin()) or private.can_facilitate(p_id)) then raise insufficient_privilege; end if;
    select * into e from public.engagements where id=p_id and not deleted for update;
    if not found then raise no_data_found; end if; church:=e.church_id;
    if p_client is not null and p_client is distinct from e.team_hub_client_id then raise insufficient_privilege; end if;
    if p_hub_engagement is not null and p_hub_engagement is distinct from e.team_hub_engagement_id then raise insufficient_privilege; end if;
    if (p_engagement->>'type'='practice') is distinct from (e.type='practice') then raise check_violation using message='Keep the practice room separate.'; end if;
  end if;
  if p_id is null and p_engagement->>'type'='practice' then raise check_violation; end if;
  if jsonb_typeof(p_church->'values')<>'array' or jsonb_typeof(p_church->'leadership_rhythms')<>'array' then raise check_violation; end if;
  if length(btrim(p_engagement->>'how_the_room_decides')) not between 1 and 4000 then raise check_violation; end if;
  update public.churches set name=p_church->>'name',timezone=p_church->>'timezone',logo_url=p_church->>'logo_url',mission=coalesce(p_church->>'mission',''),purpose=coalesce(p_church->>'purpose',''),"values"=p_church->'values',strategy=coalesce(p_church->>'strategy',''),leadership_rhythms=p_church->'leadership_rhythms',governance_body_name=coalesce(p_church->>'governance_body_name','') where id=church;
  update public.engagements set title=p_engagement->>'title',type=(p_engagement->>'type')::public.engagement_type,status=(p_engagement->>'status')::public.engagement_status,start_date=(p_engagement->>'start_date')::date,end_date=(p_engagement->>'end_date')::date,retreat_start_date=(p_engagement->>'retreat_start_date')::date,retreat_end_date=(p_engagement->>'retreat_end_date')::date,pre_call_at=(p_engagement->>'pre_call_at')::timestamptz,base_year=(p_engagement->>'base_year')::smallint,lens_names=array(select jsonb_array_elements_text(p_engagement->'lens_names')),how_the_room_decides=p_engagement->>'how_the_room_decides',settings=settings||coalesce(p_engagement->'settings','{}'::jsonb) where id=target;
  if p_lead is not null then
    if not exists(select 1 from public.clearway_users where id=p_lead and not deleted) then raise check_violation; end if;
    if (select private.is_admin()) then
      update public.engagement_facilitators set deleted=true where engagement_id=target and role='lead' and not deleted;
      insert into public.engagement_facilitators(engagement_id,clearway_user_id,role) values(target,p_lead,'lead') on conflict(engagement_id,clearway_user_id) where not deleted do update set role='lead';
    elsif not exists(select 1 from public.engagement_facilitators where engagement_id=target and clearway_user_id=p_lead and role='lead' and not deleted) then raise insufficient_privilege; end if;
  elsif p_id is null then raise check_violation using message='Choose a lead facilitator.';
  end if;
  if p_co is not null and (p_co=p_lead or not exists(select 1 from public.clearway_users where id=p_co and not deleted)) then raise check_violation; end if;
  update public.engagement_facilitators set deleted=true where engagement_id=target and role='co_facilitator' and not deleted;
  if p_co is not null then insert into public.engagement_facilitators(engagement_id,clearway_user_id,role) values(target,p_co,'co_facilitator'); end if;
  return target;
end $$;
revoke all on function private.save_engagement(uuid,jsonb,jsonb,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.save_engagement(uuid,jsonb,jsonb,uuid,uuid,uuid,uuid) to authenticated;
create function public.save_engagement(p_id uuid,p_church jsonb,p_engagement jsonb,p_lead uuid,p_co uuid,p_client uuid default null,p_hub_engagement uuid default null) returns uuid
language sql security invoker set search_path='' as $$ select private.save_engagement(p_id,p_church,p_engagement,p_lead,p_co,p_client,p_hub_engagement) $$;
revoke all on function public.save_engagement(uuid,jsonb,jsonb,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.save_engagement(uuid,jsonb,jsonb,uuid,uuid,uuid,uuid) to authenticated;

create function private.import_attendees(p_engagement uuid,p_people jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare person jsonb; count integer:=0;
begin
  if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) then raise insufficient_privilege; end if;
  if not exists(select 1 from public.engagements where id=p_engagement and not deleted and status<>'closed') then raise check_violation; end if;
  if jsonb_typeof(p_people)<>'array' or jsonb_array_length(p_people) not between 1 and 500 then raise check_violation; end if;
  for person in select value from jsonb_array_elements(p_people) loop
    if person ? 'auth_user_id' or person ? 'verified_at' or length(btrim(person->>'name')) not between 1 and 200 then raise check_violation; end if;
    insert into public.attendees(engagement_id,name,email,role_at_church,room_role,team_hub_person_id,extra_fields)
      values(p_engagement,btrim(person->>'name'),lower(btrim(person->>'email')),coalesce(person->>'role_at_church',''),coalesce(person->>'room_role','participant')::public.room_role,(person->>'team_hub_person_id')::uuid,coalesce(person->'extra_fields','{}'::jsonb))
      on conflict(engagement_id,lower(email)) where not deleted do update set name=excluded.name,role_at_church=excluded.role_at_church,
        room_role=case when person ? 'room_role' then excluded.room_role else public.attendees.room_role end,
        team_hub_person_id=coalesce(excluded.team_hub_person_id,public.attendees.team_hub_person_id),extra_fields=public.attendees.extra_fields||excluded.extra_fields;
    count:=count+1;
  end loop;return count;
end $$;
revoke all on function private.import_attendees(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.import_attendees(uuid,jsonb) to authenticated;
create function public.import_attendees(p_engagement uuid,p_people jsonb) returns integer
language sql security invoker set search_path='' as $$ select private.import_attendees(p_engagement,p_people) $$;
revoke all on function public.import_attendees(uuid,jsonb) from public,anon;
grant execute on function public.import_attendees(uuid,jsonb) to authenticated;

create table private.invitation_batches(
 id uuid primary key,engagement_id uuid not null references public.engagements(id),created_by uuid not null references public.clearway_users(id),
 payload jsonb not null,status text not null default 'pending' check(status in('pending','sent')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted boolean not null default false
);
alter table private.invitation_batches enable row level security;
alter table private.invitation_batches force row level security;
revoke all on private.invitation_batches from public,anon,authenticated;
grant select,update on private.invitation_batches to service_role;
create index invitation_batches_engagement_idx on private.invitation_batches(engagement_id,created_at);
create index invitation_batches_creator_idx on private.invitation_batches(created_by);
create trigger touch_record before update on private.invitation_batches for each row execute function private.touch_record();

create function private.queue_engagement_invites(p_engagement uuid,p_batch uuid,p_attendees uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare batch private.invitation_batches; snapshot jsonb; actor uuid:=(select private.clearway_user_id());
begin
 if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,1));
 select * into batch from private.invitation_batches where id=p_batch and not deleted;
 if found then
   if batch.engagement_id<>p_engagement or batch.created_at<now()-interval '23 hours' then raise check_violation; end if;
   if batch.status='pending' and (
      not exists(select 1 from public.engagements where id=p_engagement and not deleted and status<>'closed')
      or exists(select 1 from jsonb_array_elements(batch.payload->'people') person where not exists(
        select 1 from public.attendees a where a.id=(person->>'id')::uuid and a.engagement_id=p_engagement and a.email=person->>'email' and not a.deleted))) then raise check_violation using message='Review a new invite batch after changing the attendee list.'; end if;
   return jsonb_build_object('id',batch.id,'status',batch.status,'payload',batch.payload);
 end if;
 if cardinality(p_attendees) not between 1 and 50 or cardinality(p_attendees)<>(select count(distinct x) from unnest(p_attendees)x) then raise check_violation; end if;
 if (select count(*) from private.invitation_batches where engagement_id=p_engagement and created_at>now()-interval '5 minutes')>=3 then raise check_violation using message='Wait a few minutes before sending more invites.'; end if;
 select jsonb_build_object('title',e.title,'church',c.name,'timezone',c.timezone,'pre_call_at',e.pre_call_at,'retreat_start_date',e.retreat_start_date,'retreat_end_date',e.retreat_end_date,'consensus',e.how_the_room_decides,'people',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'email',a.email) order by a.id) from public.attendees a where a.engagement_id=e.id and a.id=any(p_attendees) and not a.deleted),'[]'::jsonb)) into snapshot
 from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_engagement and not e.deleted and e.status<>'closed' and not c.deleted and length(btrim(e.how_the_room_decides))>0;
 if snapshot is null or jsonb_array_length(snapshot->'people') is distinct from cardinality(p_attendees) then raise check_violation; end if;
 insert into private.invitation_batches(id,engagement_id,created_by,payload) values(p_batch,p_engagement,actor,snapshot) returning * into batch;
 return jsonb_build_object('id',batch.id,'status',batch.status,'payload',batch.payload);
end $$;
revoke all on function private.queue_engagement_invites(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function private.queue_engagement_invites(uuid,uuid,uuid[]) to authenticated;
create function public.queue_engagement_invites(p_engagement uuid,p_batch uuid,p_attendees uuid[]) returns jsonb
language sql security invoker set search_path='' as $$ select private.queue_engagement_invites(p_engagement,p_batch,p_attendees) $$;
revoke all on function public.queue_engagement_invites(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.queue_engagement_invites(uuid,uuid,uuid[]) to authenticated;
create function public.mark_invites_sent(p_batch uuid) returns void
language sql security invoker set search_path='' as $$ update private.invitation_batches set status='sent' where id=p_batch and not deleted $$;
revoke all on function public.mark_invites_sent(uuid) from public,anon,authenticated;
grant execute on function public.mark_invites_sent(uuid) to service_role;
commit;
