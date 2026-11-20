begin;

-- Match the live room's room-state lock before moving attendance or answers.
-- A shared practice/room advisory lock comes first for proof and roster writes.
create function private.lock_room_roster(p_engagement uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7));
  perform 1 from public.room_states where engagement_id=p_engagement for update;
end $$;
revoke all on function private.lock_room_roster(uuid) from public,anon,authenticated;
grant execute on function private.lock_room_roster(uuid) to service_role;

alter table private.room_auth_devices add column approved_by_hand_at timestamptz;
alter table public.device_sessions add column signed_in_by_hand boolean not null default false;

-- Lock proof writers before they touch a device or attendee. Record how the guest
-- signed in only when the verified Auth claim creates a device session.
create or replace function private.room_auth(p_action text,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  d private.room_auth_devices%rowtype;
  c private.room_auth_challenges%rowtype;
  a public.attendees%rowtype;
  r public.join_requests%rowtype;
  eng uuid := (p->>'engagement')::uuid;
  dev uuid := (p->>'device')::uuid;
  email_address text := lower(btrim(p->>'email'));
  permitted boolean := true;
begin
  if p_action<>'status' then perform private.lock_room_roster(eng); end if;
  if not private.room_is_open(eng) then return jsonb_build_object('status','closed'); end if;
  if p_action='init' then
    if not private.room_rate_limit(p->>'rate_ip',120,600) then return jsonb_build_object('status','rate_limited'); end if;
    insert into private.room_auth_devices(id,engagement_id,proof_hash,device_code)
      values(dev,eng,p->>'proof',p->>'device_code') on conflict(id) do nothing;
  end if;
  select * into d from private.room_auth_devices where id=dev and engagement_id=eng
    and proof_hash=p->>'proof' and not deleted and revoked_at is null for update;
  if not found then return jsonb_build_object('status','device_missing'); end if;
  if p_action in ('init','status') then
    select * into r from public.join_requests where engagement_id=eng and device_id=dev and not deleted order by requested_at desc limit 1;
    return jsonb_build_object('status',coalesce(r.status::text,'ready'),'device_code',d.device_code,
      'can_claim',d.granted_at>now()-interval '10 minutes');
  end if;
  if p_action in ('send','join','verify') then
    permitted := private.room_rate_limit(p->>'rate_email',case when p_action='verify' then 20 else 3 end,600);
    permitted := private.room_rate_limit(p->>'rate_device',case when p_action='verify' then 50 else 6 end,600) and permitted;
    permitted := private.room_rate_limit(p->>'rate_ip',case when p_action='verify' then 1000 else 300 end,600) and permitted;
    if not permitted then return jsonb_build_object('status','rate_limited'); end if;
  end if;
  if p_action='send' then
    select * into a from public.attendees where engagement_id=eng and email=email_address and not deleted;
    if not found then return jsonb_build_object('status','not_listed'); end if;
    update private.room_auth_challenges set consumed_at=now() where engagement_id=eng and email=email_address and consumed_at is null;
    insert into private.room_auth_challenges(id,engagement_id,attendee_id,email,code_hash,link_hash)
      values((p->>'challenge')::uuid,eng,a.id,email_address,p->>'code_hash',p->>'link_hash');
    return jsonb_build_object('status','sent','name',a.name);
  elsif p_action='cancel_mail' then
    update private.room_auth_challenges set consumed_at=now() where id=(p->>'challenge')::uuid and engagement_id=eng;
    return jsonb_build_object('status','cancelled');
  elsif p_action='verify' then
    if p ? 'challenge' then
      select * into c from private.room_auth_challenges where id=(p->>'challenge')::uuid and engagement_id=eng for update;
    else
      select * into c from private.room_auth_challenges where engagement_id=eng and email=email_address
        order by created_at desc,id desc limit 1 for update;
    end if;
    if not found or c.deleted or c.consumed_at is not null or c.expires_at<=now() or c.attempts>=5 then
      return jsonb_build_object('status','invalid_code');
    end if;
    update private.room_auth_challenges set attempts=attempts+1 where id=c.id;
    if (p ? 'link_hash' and c.link_hash=p->>'link_hash') or (p ? 'code_hash' and c.code_hash=p->>'code_hash') then
      select * into a from public.attendees where id=c.attendee_id and engagement_id=eng and email=c.email and not deleted;
      if not found then return jsonb_build_object('status','invalid_code'); end if;
      update private.room_auth_challenges set consumed_at=now() where id=c.id;
      update private.room_auth_devices set attendee_id=a.id,verified_email=a.email,granted_at=now(),claim_id=null,claim_started_at=null,approved_by_hand_at=null where id=dev;
      return jsonb_build_object('status','approved');
    end if;
    return jsonb_build_object('status','invalid_code');
  elsif p_action='join' then
    if length(btrim(p->>'name')) not between 1 and 200 or email_address !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
      return jsonb_build_object('status','invalid_request');
    end if;
    insert into public.join_requests(engagement_id,name,email,device_id) values(eng,btrim(p->>'name'),email_address,dev)
      on conflict(engagement_id,device_id) where status='pending' and not deleted
      do update set name=excluded.name,email=excluded.email;
    return jsonb_build_object('status','pending');
  elsif p_action='prepare_claim' then
    if d.granted_at is null or d.granted_at<=now()-interval '10 minutes'
      or (d.claim_started_at is not null and d.claim_started_at>now()-interval '30 seconds') then
      return jsonb_build_object('status','waiting');
    end if;
    select * into a from public.attendees where id=d.attendee_id and engagement_id=eng and email=d.verified_email and not deleted;
    if not found then return jsonb_build_object('status','waiting'); end if;
    update private.room_auth_devices set claim_id=gen_random_uuid(),claim_started_at=now() where id=dev returning * into d;
    return jsonb_build_object('status','claim','claim',d.claim_id,'email',a.email,'attendee',a.id);
  elsif p_action='bind' then
    if d.claim_id is null or d.claim_id is distinct from (p->>'claim')::uuid or d.claim_started_at<now()-interval '2 minutes'
      or d.granted_at<now()-interval '10 minutes' then return jsonb_build_object('status','waiting'); end if;
    select * into a from public.attendees where id=d.attendee_id and engagement_id=eng and email=d.verified_email and not deleted;
    if not found or not private.room_auth_identity((p->>'user')::uuid,(p->>'session')::uuid,a.email) then
      return jsonb_build_object('status','waiting');
    end if;
    update public.attendees set auth_user_id=(p->>'user')::uuid,verified_at=now() where id=a.id;
    insert into public.device_sessions(engagement_id,attendee_id,auth_session_id,signed_in_by_hand)
      values(eng,a.id,(p->>'session')::uuid,coalesce(d.granted_at=d.approved_by_hand_at,false))
      on conflict(attendee_id,auth_session_id) where not deleted
      do update set last_seen_at=now(),signed_in_by_hand=excluded.signed_in_by_hand;
    update private.room_auth_devices set granted_at=null,claim_id=null,claim_started_at=null,approved_by_hand_at=null where id=dev;
    return jsonb_build_object('status','signed_in');
  elsif p_action='release_claim' then
    update private.room_auth_devices set claim_id=null,claim_started_at=null where id=dev and claim_id=(p->>'claim')::uuid;
    return jsonb_build_object('status','waiting');
  elsif p_action='revoke' then
    update private.room_auth_devices set revoked_at=now(),granted_at=null,claim_id=null where id=dev;
    update public.device_sessions set revoked_at=now() where engagement_id=eng and auth_session_id=(p->>'session')::uuid;
    return jsonb_build_object('status','signed_out');
  end if;
  return jsonb_build_object('status','invalid_request');
end $$;

create or replace function private.practice_guest(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare eng uuid:=(p->>'engagement')::uuid; d private.room_auth_devices; person uuid; guest_email text; practice boolean;
begin
 practice:=eng is not distinct from '90000000-0000-4000-8000-000000000010'::uuid;
 if eng is null then return jsonb_build_object('status','invalid_request'); end if;
 perform private.lock_room_roster(eng);
 if not private.room_is_open(eng) then return jsonb_build_object('status','closed'); end if;
 if practice and not exists(select 1 from public.engagements where id=eng and type='practice') then return jsonb_build_object('status','closed'); end if;
 if not practice and not exists(select 1 from public.engagements e where e.id=eng and not e.deleted and e.type='team_workshop' and coalesce((e.settings->>'open_join')='true',false)) then return jsonb_build_object('status','invalid_request'); end if;
 if length(btrim(p->>'name')) not between 1 and 200 or p->>'name' is null then return jsonb_build_object('status','invalid_request'); end if;
 select * into d from private.room_auth_devices where id=(p->>'device')::uuid and engagement_id=eng and proof_hash=p->>'proof' and not deleted and revoked_at is null for update;
 if not found then return jsonb_build_object('status','device_missing'); end if;
 if not private.room_rate_limit(p->>'rate_device',6,600) or not private.room_rate_limit(p->>'rate_ip',300,600) then return jsonb_build_object('status','rate_limited'); end if;
 guest_email:=d.id::text||case when practice then '@practice.clearway.invalid' else '@guest.clearway.invalid' end;
 insert into public.attendees(engagement_id,name,email) values(eng,btrim(p->>'name'),guest_email)
   on conflict(engagement_id,lower(email)) where not deleted do update set name=excluded.name returning id into person;
 update private.room_auth_devices set attendee_id=person,verified_email=guest_email,granted_at=now(),claim_id=null,claim_started_at=null,approved_by_hand_at=null where id=d.id;
 return jsonb_build_object('status','approved');
end $$;

create or replace function private.decide_room_join(p_request uuid,p_approve boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.join_requests%rowtype; person uuid;
begin
  select * into r from public.join_requests where id=p_request and not deleted;
  if not found or not ((select private.is_admin()) or private.can_facilitate(r.engagement_id)) or not private.room_is_open(r.engagement_id) then return false; end if;
  perform private.lock_room_roster(r.engagement_id);
  if not private.room_is_open(r.engagement_id) then return false; end if;
  -- Use the same device-then-request lock order as a phone submitting a request.
  perform 1 from private.room_auth_devices where id=r.device_id and engagement_id=r.engagement_id
    and not deleted and revoked_at is null for update;
  if not found then return false; end if;
  select * into r from public.join_requests where id=p_request and not deleted for update;
  if not found or r.status<>'pending' then return false; end if;
  if p_approve then
    insert into public.attendees(engagement_id,name,email) values(r.engagement_id,r.name,r.email)
      on conflict(engagement_id,lower(email)) where not deleted do update set name=attendees.name
      returning id into person;
    update private.room_auth_devices set attendee_id=person,verified_email=r.email,granted_at=now(),claim_id=null,claim_started_at=null,approved_by_hand_at=null
      where id=r.device_id and engagement_id=r.engagement_id and not deleted and revoked_at is null;
    if not found then return false; end if;
  else
    update private.room_auth_devices set granted_at=null,claim_id=null,claim_started_at=null where id=r.device_id;
  end if;
  update public.join_requests set status=case when p_approve then 'approved'::public.join_request_status else 'declined'::public.join_request_status end,
    decided_at=now(),decided_by=private.clearway_user_id(),attendee_id=person where id=r.id;
  return true;
end $$;
create or replace function private.sign_in_room_device(p_engagement uuid,p_attendee uuid,p_code text) returns boolean
language plpgsql security definer set search_path='' as $$
declare person public.attendees%rowtype; approval_time timestamptz;
begin
  if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) or not private.room_is_open(p_engagement) then return false; end if;
  perform private.lock_room_roster(p_engagement);
  if not private.room_is_open(p_engagement) then return false; end if;
  select * into person from public.attendees where id=p_attendee and engagement_id=p_engagement and not deleted;
  if not found then return false; end if;
  approval_time:=clock_timestamp();
  update private.room_auth_devices set attendee_id=person.id,verified_email=person.email,granted_at=approval_time,claim_id=null,claim_started_at=null,approved_by_hand_at=approval_time
    where engagement_id=p_engagement and device_code=upper(replace(p_code,' ','')) and not deleted and revoked_at is null;
  if not found then return false; end if;
  update public.join_requests j set status=case when j.email=person.email then 'approved'::public.join_request_status else 'declined'::public.join_request_status end,
    decided_at=now(),decided_by=private.clearway_user_id(),attendee_id=case when j.email=person.email then person.id else null end
    where j.engagement_id=p_engagement and j.device_id in(select id from private.room_auth_devices where engagement_id=p_engagement and device_code=upper(replace(p_code,' ','')))
      and j.status='pending' and not j.deleted;
  return true;
end $$;

create or replace function private.revoke_closed_engagement_devices() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.status = 'closed' and old.status <> 'closed') or (new.deleted and not old.deleted) then
    perform 1 from public.room_states where engagement_id=new.id for update;
    update public.device_sessions set revoked_at = coalesce(revoked_at, now()) where engagement_id = new.id;
  end if;
  return new;
end
$$;

create or replace function private.remove_attendee(p_engagement uuid,p_attendee uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.attendees;
begin
 if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) then raise insufficient_privilege; end if;
 perform private.lock_room_roster(p_engagement);
 select * into a from public.attendees where id=p_attendee and engagement_id=p_engagement for update;
 if not found then return jsonb_build_object('status','missing'); end if;
 if not a.deleted then update public.attendees set deleted=true where id=a.id; end if;
 return jsonb_build_object('status','ok');
end $$;

-- Two guests joined with different verified Auth identities. Keep both existing device sessions
-- bound to their original principals after consolidating their attendance and answers.
create table private.merged_guest_devices (
  device_session_id uuid primary key references public.device_sessions(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (email ~ '@(?:guest|practice)\.clearway\.invalid$')
);
alter table private.merged_guest_devices enable row level security;
alter table private.merged_guest_devices force row level security;
revoke all on private.merged_guest_devices from public,anon,authenticated;
create index merged_guest_devices_user_idx on private.merged_guest_devices(auth_user_id);

create function private.room_device_attests(p_device public.device_sessions, p_person public.attendees, p_user uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select coalesce((p_person).auth_user_id=p_user and (p_person).verified_at is not null,false)
    or exists(select 1 from private.merged_guest_devices identity
      where identity.device_session_id=(p_device).id and identity.auth_user_id=p_user
        and (p_person).room_role='participant' and (p_person).email ~ '@(?:guest|practice)\.clearway\.invalid$'
        and private.room_auth_identity(p_user,(p_device).auth_session_id,identity.email))
$$;
revoke all on function private.room_device_attests(public.device_sessions,public.attendees,uuid) from public,anon,authenticated;

create or replace function private.room_attendee_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select a.id from public.attendees a
    join public.device_sessions d on d.attendee_id = a.id and d.engagement_id = a.engagement_id
    join public.engagements e on e.id = a.engagement_id
    join public.churches c on c.id = e.church_id
  where (select auth.uid()) is not null and (select private.has_auth_session())
    and private.room_device_attests(d, a, (select auth.uid()))
    and d.auth_session_id = (select private.auth_session_id())
    and not a.deleted and not d.deleted and d.revoked_at is null
    and not e.deleted and e.status <> 'closed' and not c.deleted
$$;

create or replace function private.live_fingerprint(p_engagement uuid) returns text
language sql stable security definer set search_path='' as $$
  select md5(coalesce(string_agg(s.id::text,',' order by s.id),'')) from auth.sessions s join auth.users u on u.id=s.user_id
  where u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and (s.not_after is null or s.not_after>now()) and (
    exists(select 1 from public.device_sessions d join public.attendees a on a.id=d.attendee_id
      where d.engagement_id=p_engagement and d.auth_session_id=s.id and private.room_device_attests(d,a,s.user_id)
      and not a.deleted and not d.deleted and d.revoked_at is null)
    or exists(select 1 from private.live_tv_sessions t where t.engagement_id=p_engagement and t.auth_session_id=s.id
      and t.auth_user_id=s.user_id and not t.deleted and t.revoked_at is null)
    or exists(select 1 from public.clearway_users c where c.auth_user_id=s.user_id and not c.deleted and c.email=lower(u.email)
      and u.email_confirmed_at is not null and c.email ~ '^[^@[:space:]]+@clearway\.co$'
      and exists(select 1 from auth.mfa_amr_claims m where m.session_id=s.id and m.authentication_method='oauth')
      and exists(select 1 from auth.identities i where i.user_id=s.user_id and i.provider='google'
        and lower(i.identity_data->>'email')=c.email and i.identity_data->>'email_verified'='true')
      and (c.is_admin or exists(select 1 from public.engagement_facilitators f where f.engagement_id=p_engagement and f.clearway_user_id=c.id and not f.deleted)))
  )
$$;

create or replace function private.room_presence(p_engagement uuid)
returns table(attendee_id uuid,device_count bigint,present boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) or not private.room_is_open(p_engagement) then return; end if;
  return query select d.attendee_id,count(*),bool_or(d.last_seen_at>now()-interval '45 seconds')
    from public.device_sessions d join public.attendees a on a.id=d.attendee_id
    join auth.sessions s on s.id=d.auth_session_id
    join auth.users u on u.id=s.user_id
    where d.engagement_id=p_engagement and not d.deleted and d.revoked_at is null and not a.deleted
      and private.room_device_attests(d,a,s.user_id) and (s.user_id is distinct from a.auth_user_id or lower(u.email)=a.email) and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<now()) and (s.not_after is null or s.not_after>now())
    group by d.attendee_id;
end $$;

create or replace function private.tv_room_info_pre_skin(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with present as (
  select a.id,split_part(btrim(a.name),' ',1) as name,min(d.created_at) as arrived
  from public.attendees a join public.device_sessions d on d.attendee_id=a.id and d.engagement_id=a.engagement_id
  where a.engagement_id=p_engagement and not a.deleted and (a.verified_at is not null or exists(
    select 1 from private.merged_guest_devices g where g.device_session_id=d.id
      and private.room_device_attests(d,a,g.auth_user_id))) and not d.deleted and d.revoked_at is null
  group by a.id,a.name
 )
 select jsonb_build_object('display',jsonb_build_object('church',c.name,'title',e.title,'logo_url',c.logo_url,'room_code',e.room_code,
  'theme',case when e.settings->>'tv_theme'='light' then 'light' else 'dark' end,'texture',coalesce((e.settings->>'texture')::boolean,true),
  'room_size',case when e.settings->>'room_size' in ('very_small','small','medium','large','very_large') then e.settings->>'room_size' else 'very_small' end,
  'reduced_motion',coalesce((e.settings->>'reduced_motion')::boolean,false),'lens_names',to_jsonb(e.lens_names)),
  'presence',jsonb_build_object('count',(select count(*) from present),'names',coalesce((select jsonb_agg(jsonb_build_object('key',md5(p.id::text||e.id::text),'name',p.name) order by p.arrived,p.id) from (select * from present order by arrived,id limit 14)p),'[]'::jsonb)))
 from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_engagement and not e.deleted and not c.deleted
$$;

-- A guest still resolves their canonical row using the signed-in device, never by submitted user ID.
create function private.room_merged_attendee(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',a.id,'name',a.name,'room_role',a.room_role)
  from public.attendees a
  where a.engagement_id=p_engagement and not a.deleted and a.id in(select private.room_attendee_ids())
    and exists(select 1 from public.device_sessions d join private.merged_guest_devices g on g.device_session_id=d.id
      where d.attendee_id=a.id and d.engagement_id=p_engagement and not d.deleted and d.revoked_at is null
        and d.auth_session_id=(select private.auth_session_id()) and g.auth_user_id=(select auth.uid()))
  limit 1
$$;
create function public.room_merged_attendee(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.room_merged_attendee(p_engagement) $$;
revoke all on function private.room_merged_attendee(uuid),public.room_merged_attendee(uuid) from public,anon,authenticated;
grant execute on function private.room_merged_attendee(uuid),public.room_merged_attendee(uuid) to authenticated;

create function private.attendee_merge(p_engagement uuid,p_keep uuid,p_merge uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  person public.attendees;
  all_people uuid[];
  normalized_name text;
begin
  if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) then raise insufficient_privilege; end if;
  if p_keep is null or coalesce(cardinality(p_merge),0) not between 1 and 499
    or p_keep=any(p_merge) or cardinality(p_merge)<>(select count(distinct id) from unnest(p_merge) id) then
    return jsonb_build_object('status','invalid');
  end if;
  perform private.lock_room_roster(p_engagement);
  if not exists(select 1 from public.engagements where id=p_engagement and not deleted and type in ('team_workshop','practice')) then
    return jsonb_build_object('status','invalid');
  end if;
  all_people:=array_prepend(p_keep,p_merge);
  perform 1 from public.attendees where engagement_id=p_engagement and id=any(all_people) order by id for update;
  select * into person from public.attendees where engagement_id=p_engagement and id=any(all_people) and not deleted order by created_at,id limit 1;
  if person.id is distinct from p_keep then return jsonb_build_object('status','invalid'); end if;
  normalized_name:=lower(regexp_replace(btrim(person.name),'[[:space:]]+',' ','g'));
  if cardinality(all_people)<>(select count(*) from public.attendees
      where engagement_id=p_engagement and id=any(all_people) and not deleted
        and email ~ '@(?:guest|practice)\.clearway\.invalid$' and room_role='participant'
        and lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g'))=normalized_name)
    or exists(select 1 from private.team_blocks where engagement_id=p_engagement and attendee_id=any(all_people)
        and ended_at is null and not deleted)
    or exists(select 1 from public.room_states where engagement_id=p_engagement and remote_holder_id=any(all_people) and not deleted)
    or exists(select 1 from private.followup_access where engagement_id=p_engagement and attendee_id=any(all_people)
        and not deleted and revoked_at is null and closes_at>clock_timestamp()) then
    return jsonb_build_object('status','invalid');
  end if;

  insert into private.merged_guest_devices(device_session_id,auth_user_id,email)
    select d.id,a.auth_user_id,a.email from public.device_sessions d join public.attendees a on a.id=d.attendee_id
    where d.engagement_id=p_engagement and d.attendee_id=any(p_merge) and not d.deleted and d.revoked_at is null
      and a.verified_at is not null and private.room_auth_identity(a.auth_user_id,d.auth_session_id,a.email)
    on conflict(device_session_id) do nothing;
  -- A repeated Auth session can only assert one original identity. Prefer its verified binding.
  with copies as (
    select d.id,row_number() over(partition by d.auth_session_id order by
      (d.revoked_at is null and private.room_device_attests(d,a,s.user_id)) desc, (d.attendee_id=p_keep) desc,d.id) as rank
    from public.device_sessions d join public.attendees a on a.id=d.attendee_id
    left join auth.sessions s on s.id=d.auth_session_id
    where d.engagement_id=p_engagement and d.attendee_id=any(all_people) and not d.deleted
  )
  update public.device_sessions d set deleted=true,revoked_at=coalesce(d.revoked_at,now()) from copies c where c.id=d.id and c.rank>1;
  update public.device_sessions set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.room_auth_devices set attendee_id=p_keep,granted_at=null,claim_id=null,claim_started_at=null
    where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.room_auth_challenges set attendee_id=p_keep,consumed_at=coalesce(consumed_at,now())
    where engagement_id=p_engagement and attendee_id=any(p_merge);
  update public.join_requests set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);

  -- Answer rows stay intact. Distinct attendee aggregations now count the merged person once.
  update public.submissions set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.bullet_drafts set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.candidate_suggestions set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.ranking_suggestions set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.lens_sentences set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.scribe_cards set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.scribe_files set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.read_back_corrections set by_attendee=p_keep where engagement_id=p_engagement and by_attendee=any(p_merge);
  update private.goals set owner_attendee_id=p_keep where engagement_id=p_engagement and owner_attendee_id=any(p_merge);
  update private.goals set proposed_by=p_keep where engagement_id=p_engagement and proposed_by=any(p_merge);
  update private.first_steps set owner_attendee_id=p_keep where engagement_id=p_engagement and owner_attendee_id=any(p_merge);
  update private.risks set added_by=p_keep where engagement_id=p_engagement and added_by=any(p_merge);
  perform 1 from private.followup_access where engagement_id=p_engagement and attendee_id=any(p_merge) for update nowait;
  update private.followup_access set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.team_blocks set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.check_in_recipients set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update public.room_states set remote_holder_id=p_keep where engagement_id=p_engagement and remote_holder_id=any(p_merge);

  -- Deduplicate per-person votes according to the same uniqueness rules as a normal room.
  with copies as (
    select id,row_number() over(partition by question_id order by (attendee_id=p_keep) desc,id) as rank
    from private.qa_votes where engagement_id=p_engagement and attendee_id=any(all_people) and not deleted
  )
  update private.qa_votes v set deleted=true from copies c where c.id=v.id and c.rank>1;
  update private.qa_votes set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);

  with copies as (
    select id,row_number() over(partition by card_id,test order by (attendee_id=p_keep) desc,id) as rank
    from private.four_list_agrees where engagement_id=p_engagement and attendee_id=any(all_people) and not deleted
  )
  update private.four_list_agrees v set deleted=true from copies c where c.id=v.id and c.rank>1;
  update private.four_list_agrees set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);

  with copies as (
    select id,row_number() over(partition by version_id order by updated_at desc,id) as rank
    from private.lens_summary_responses where engagement_id=p_engagement and attendee_id=any(all_people) and not deleted
  )
  update private.lens_summary_responses v set deleted=true from copies c where c.id=v.id and c.rank>1;
  update private.lens_summary_responses set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);

  with copies as (
    select card_id,attendee_id,row_number() over(partition by card_id order by deleted,(attendee_id=p_keep) desc,attendee_id) as rank
    from private.intent_card_people where engagement_id=p_engagement and attendee_id=any(all_people)
  )
  delete from private.intent_card_people v using copies c where v.card_id=c.card_id and v.attendee_id=c.attendee_id and c.rank>1;
  update private.intent_card_people set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);

  update public.attendees set deleted=true where engagement_id=p_engagement and id=any(p_merge);
  return jsonb_build_object('status','ok');
exception when lock_not_available then
  return jsonb_build_object('status','busy');
end $$;

create function public.attendee_merge(p_engagement uuid,p_keep uuid,p_merge uuid[]) returns jsonb
language sql security invoker set search_path='' as $$ select private.attendee_merge(p_engagement,p_keep,p_merge) $$;
revoke all on function private.attendee_merge(uuid,uuid,uuid[]),public.attendee_merge(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function private.attendee_merge(uuid,uuid,uuid[]),public.attendee_merge(uuid,uuid,uuid[]) to authenticated;

commit;
