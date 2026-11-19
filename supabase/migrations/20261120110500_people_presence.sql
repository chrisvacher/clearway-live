begin;

alter table private.room_auth_devices add column signed_in_by_hand boolean not null default false;

create or replace function private.sign_in_room_device(p_engagement uuid,p_attendee uuid,p_code text) returns boolean
language plpgsql security definer set search_path='' as $$
declare person public.attendees%rowtype;
begin
  if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) or not private.room_is_open(p_engagement) then return false; end if;
  select * into person from public.attendees where id=p_attendee and engagement_id=p_engagement and not deleted;
  if not found then return false; end if;
  update private.room_auth_devices set signed_in_by_hand=true,attendee_id=person.id,verified_email=person.email,granted_at=now(),claim_id=null,claim_started_at=null
    where engagement_id=p_engagement and device_code=upper(replace(p_code,' ','')) and not deleted and revoked_at is null;
  if not found then return false; end if;
  update public.join_requests j set status=case when j.email=person.email then 'approved'::public.join_request_status else 'declined'::public.join_request_status end,
    decided_at=now(),decided_by=private.clearway_user_id(),attendee_id=case when j.email=person.email then person.id else null end
    where j.engagement_id=p_engagement and j.device_id in(select id from private.room_auth_devices where engagement_id=p_engagement and device_code=upper(replace(p_code,' ','')))
      and j.status='pending' and not j.deleted;
  return true;
end $$;

-- Facilitators receive attendance facts only; OTP proofs and Auth identifiers stay private.
create function private.attendee_roster_presence(p_engagement uuid)
returns table(attendee_id uuid, present boolean, last_seen_at timestamptz, invited boolean, manual boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) then raise insufficient_privilege; end if;
  return query
  with activity as (
    select d.attendee_id,max(d.last_seen_at) as latest from public.device_sessions d
      where d.engagement_id=p_engagement and not d.deleted group by d.attendee_id
  ), sent as (
    select distinct (entry.person->>'id')::uuid as id from private.invitation_batches b
      cross join lateral jsonb_array_elements(b.payload->'people') as entry(person)
      where b.engagement_id=p_engagement and b.status='sent' and not b.deleted
  ), by_hand as (
    select distinct d.attendee_id from private.room_auth_devices d
      where d.engagement_id=p_engagement and not d.deleted and d.signed_in_by_hand
  )
  select p.id,coalesce(r.present,false),a.latest,s.id is not null,h.attendee_id is not null
    from public.attendees p left join private.room_presence(p_engagement) r on r.attendee_id=p.id
    left join activity a on a.attendee_id=p.id left join sent s on s.id=p.id left join by_hand h on h.attendee_id=p.id
    where p.engagement_id=p_engagement and not p.deleted;
end $$;

create function public.attendee_roster_presence(p_engagement uuid)
returns table(attendee_id uuid, present boolean, last_seen_at timestamptz, invited boolean, manual boolean)
language sql stable security invoker set search_path='' as $$ select * from private.attendee_roster_presence(p_engagement) $$;
revoke all on function private.attendee_roster_presence(uuid),public.attendee_roster_presence(uuid) from public,anon,authenticated;
grant execute on function private.attendee_roster_presence(uuid),public.attendee_roster_presence(uuid) to authenticated;

-- Undo is scoped to the actor and exact removal revision. It never revives old device sessions or merged rows.
create table private.attendee_removal_undo (
  attendee_id uuid primary key references public.attendees(id) on delete cascade,
  actor_id uuid not null references public.clearway_users(id) on delete cascade,
  removed_at timestamptz not null
);
alter table private.attendee_removal_undo enable row level security;
alter table private.attendee_removal_undo force row level security;
revoke all on private.attendee_removal_undo from public,anon,authenticated;
create index attendee_removal_undo_actor_idx on private.attendee_removal_undo(actor_id);

create function private.attendee_roster_change(p_engagement uuid,p_action text,p_people jsonb,p_role public.room_role) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=(select private.clearway_user_id());
  people uuid[];
  affected jsonb;
begin
  if actor is null or not ((select private.is_admin()) or private.can_facilitate(p_engagement)) then raise insufficient_privilege; end if;
  if p_action not in ('remove','restore','role') or p_people is null or jsonb_typeof(p_people)<>'array' then
    return jsonb_build_object('status','invalid');
  end if;
  if jsonb_array_length(p_people) not between 1 and 500 or (p_action='role' and p_role is null) then
    return jsonb_build_object('status','invalid');
  end if;
  select array_agg((item->>'id')::uuid) into people from jsonb_array_elements(p_people) item;
  if cardinality(people)<>(select count(distinct id) from unnest(people) id) then
    return jsonb_build_object('status','invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7));
  if not exists(select 1 from public.engagements where id=p_engagement and not deleted) then return jsonb_build_object('status','missing'); end if;
  perform 1 from public.attendees where engagement_id=p_engagement and id=any(people) order by id for update;
  if cardinality(people)<>(select count(*) from public.attendees
      where engagement_id=p_engagement and id=any(people) and deleted=(p_action='restore')) then
    return jsonb_build_object('status','invalid');
  end if;

  if p_action='remove' then
    with removed as (
      update public.attendees set deleted=true where engagement_id=p_engagement and id=any(people)
        returning id,updated_at
    ), undo as (
      insert into private.attendee_removal_undo(attendee_id,actor_id,removed_at) select r.id,actor,r.updated_at from removed r
      on conflict(attendee_id) do update set actor_id=excluded.actor_id,removed_at=excluded.removed_at
      returning attendee_id
    )
    select jsonb_agg(jsonb_build_object('id',r.id,'updated_at',r.updated_at)) into affected from removed r join undo u on u.attendee_id=r.id;
  elsif p_action='restore' then
    if cardinality(people)<>(select count(*) from jsonb_array_elements(p_people) i
        join public.attendees a on a.id=(i->>'id')::uuid
        join private.attendee_removal_undo u on u.attendee_id=a.id and u.actor_id=actor
        where a.engagement_id=p_engagement and a.updated_at=u.removed_at
          and u.removed_at=(i->>'updated_at')::timestamptz and u.removed_at>clock_timestamp()-interval '1 minute') then
      return jsonb_build_object('status','invalid');
    end if;
    update public.attendees set deleted=false where engagement_id=p_engagement and id=any(people);
    delete from private.attendee_removal_undo where attendee_id=any(people);
  else
    if p_role='scribe' and exists(
      select 1 from public.attendees a where a.id=any(people) and
        (a.email ~ '@(?:guest|practice)\.clearway\.invalid$' or exists(
          select 1 from private.merged_guest_devices g join public.device_sessions d on d.id=g.device_session_id
            where d.attendee_id=a.id and not d.deleted and d.revoked_at is null))) then
      return jsonb_build_object('status','invalid');
    end if;
    update public.attendees set room_role=p_role where engagement_id=p_engagement and id=any(people);
  end if;
  return jsonb_build_object('status','ok','removed',affected);
exception when invalid_text_representation or invalid_datetime_format or unique_violation then
  return jsonb_build_object('status','invalid');
end $$;

create function public.attendee_roster_change(p_engagement uuid,p_action text,p_people jsonb,p_role public.room_role) returns jsonb
language sql security invoker set search_path='' as $$ select private.attendee_roster_change(p_engagement,p_action,p_people,p_role) $$;
revoke all on function private.attendee_roster_change(uuid,text,jsonb,public.room_role),public.attendee_roster_change(uuid,text,jsonb,public.room_role) from public,anon,authenticated;
grant execute on function private.attendee_roster_change(uuid,text,jsonb,public.room_role),public.attendee_roster_change(uuid,text,jsonb,public.room_role) to authenticated;

commit;
