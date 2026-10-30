begin;

-- Login proofs never enter an exposed schema. A page load is not a device session.
create table private.room_auth_devices (
  id uuid primary key,
  engagement_id uuid not null references public.engagements(id),
  proof_hash text not null check (proof_hash ~ '^[0-9a-f]{64}$'),
  device_code text not null unique check (device_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  attendee_id uuid,
  verified_email text,
  granted_at timestamptz,
  claim_id uuid,
  claim_started_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  foreign key (attendee_id,engagement_id) references public.attendees(id,engagement_id)
);
create index room_auth_devices_engagement_idx on private.room_auth_devices(engagement_id);
create index room_auth_devices_attendee_idx on private.room_auth_devices(attendee_id,engagement_id);
create table private.room_auth_challenges (
  id uuid primary key,
  engagement_id uuid not null references public.engagements(id),
  attendee_id uuid not null,
  email text not null,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  link_hash text not null check (link_hash ~ '^[0-9a-f]{64}$'),
  attempts smallint not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null default now()+interval '10 minutes',
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  foreign key (attendee_id,engagement_id) references public.attendees(id,engagement_id)
);
create index room_auth_challenges_email_idx on private.room_auth_challenges(engagement_id,email,created_at desc);
create index room_auth_challenges_attendee_idx on private.room_auth_challenges(attendee_id,engagement_id);
create table private.room_auth_limits (
  id uuid primary key default gen_random_uuid(),
  bucket text not null unique check (bucket ~ '^[0-9a-f]{64}$'),
  hits integer not null default 1 check (hits>0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
do $$ declare t text; begin
  foreach t in array array['room_auth_devices','room_auth_challenges','room_auth_limits'] loop
    execute format('alter table private.%I enable row level security',t);
    execute format('alter table private.%I force row level security',t);
    execute format('revoke all on private.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update on private.%I to service_role',t);
    execute format('create trigger touch_record before update on private.%I for each row execute function private.touch_record()',t);
  end loop;
end $$;
grant usage on schema private to service_role;

create function private.room_is_open(p_engagement uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.engagements e join public.churches c on c.id=e.church_id
    where e.id=p_engagement and not e.deleted and not c.deleted and e.status<>'closed')
$$;
create function private.room_rate_limit(p_bucket text,p_max integer,p_seconds integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare total integer;
begin
  insert into private.room_auth_limits(bucket,expires_at) values(p_bucket,now()+make_interval(secs=>p_seconds))
  on conflict(bucket) do update set
    hits=case when room_auth_limits.expires_at<=now() then 1 else room_auth_limits.hits+1 end,
    expires_at=case when room_auth_limits.expires_at<=now() then now()+make_interval(secs=>p_seconds) else room_auth_limits.expires_at end,
    deleted=false
  returning hits into total;
  return total<=p_max;
end $$;

-- This narrow internal check reads Auth-owned tables without granting the service
-- role general SQL access to them. Only the trusted server workflow can execute it.
create function private.room_auth_identity(p_user uuid,p_session uuid,p_email text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
    where s.id=p_session and u.id=p_user and lower(u.email)=p_email
      and u.email_confirmed_at is not null and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<now()) and (s.not_after is null or s.not_after>now())
      and exists(select 1 from auth.mfa_amr_claims a where a.session_id=s.id and a.authentication_method='otp'))
$$;

create function private.room_auth(p_action text,p jsonb) returns jsonb
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
      update private.room_auth_devices set attendee_id=a.id,verified_email=a.email,granted_at=now(),claim_id=null,claim_started_at=null where id=dev;
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
    insert into public.device_sessions(engagement_id,attendee_id,auth_session_id) values(eng,a.id,(p->>'session')::uuid)
      on conflict(attendee_id,auth_session_id) where not deleted do update set last_seen_at=now();
    update private.room_auth_devices set granted_at=null,claim_id=null,claim_started_at=null where id=dev;
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
create function public.room_auth(p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.room_auth(p_action,p) $$;

-- Facilitators approve one device with their own, current Google session.
create function private.decide_room_join(p_request uuid,p_approve boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.join_requests%rowtype; person uuid;
begin
  select * into r from public.join_requests where id=p_request and not deleted;
  if not found or not private.can_facilitate(r.engagement_id) or not private.room_is_open(r.engagement_id) then return false; end if;
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
    update private.room_auth_devices set attendee_id=person,verified_email=r.email,granted_at=now(),claim_id=null,claim_started_at=null
      where id=r.device_id and engagement_id=r.engagement_id and not deleted and revoked_at is null;
    if not found then return false; end if;
  else
    update private.room_auth_devices set granted_at=null,claim_id=null,claim_started_at=null where id=r.device_id;
  end if;
  update public.join_requests set status=case when p_approve then 'approved'::public.join_request_status else 'declined'::public.join_request_status end,
    decided_at=now(),decided_by=private.clearway_user_id(),attendee_id=person where id=r.id;
  return true;
end $$;
create function public.decide_room_join(p_request uuid,p_approve boolean) returns boolean
language sql security invoker set search_path='' as $$ select private.decide_room_join(p_request,p_approve) $$;
create function private.sign_in_room_device(p_engagement uuid,p_attendee uuid,p_code text) returns boolean
language plpgsql security definer set search_path='' as $$
declare person public.attendees%rowtype;
begin
  if not private.can_facilitate(p_engagement) or not private.room_is_open(p_engagement) then return false; end if;
  select * into person from public.attendees where id=p_attendee and engagement_id=p_engagement and not deleted;
  if not found then return false; end if;
  update private.room_auth_devices set attendee_id=person.id,verified_email=person.email,granted_at=now(),claim_id=null,claim_started_at=null
    where engagement_id=p_engagement and device_code=upper(replace(p_code,' ','')) and not deleted and revoked_at is null;
  if not found then return false; end if;
  update public.join_requests j set status=case when j.email=person.email then 'approved'::public.join_request_status else 'declined'::public.join_request_status end,
    decided_at=now(),decided_by=private.clearway_user_id(),attendee_id=case when j.email=person.email then person.id else null end
    where j.engagement_id=p_engagement and j.device_id in(select id from private.room_auth_devices where engagement_id=p_engagement and device_code=upper(replace(p_code,' ','')))
      and j.status='pending' and not j.deleted;
  return true;
end $$;
create function public.sign_in_room_device(p_engagement uuid,p_attendee uuid,p_code text) returns boolean
language sql security invoker set search_path='' as $$ select private.sign_in_room_device(p_engagement,p_attendee,p_code) $$;

create function private.revoke_room_login_grants() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.status='closed' or new.deleted) then
    update private.room_auth_devices set revoked_at=coalesce(revoked_at,now()),granted_at=null,claim_id=null where engagement_id=new.id;
    update private.room_auth_challenges set consumed_at=coalesce(consumed_at,now()) where engagement_id=new.id;
  end if;
  return new;
end $$;
create trigger revoke_room_login_grants after update of status,deleted on public.engagements
  for each row execute function private.revoke_room_login_grants();

revoke all on function private.room_is_open(uuid),private.room_rate_limit(text,integer,integer),
  private.room_auth_identity(uuid,uuid,text),private.room_auth(text,jsonb),public.room_auth(text,jsonb),
  private.decide_room_join(uuid,boolean),public.decide_room_join(uuid,boolean),
  private.sign_in_room_device(uuid,uuid,text),public.sign_in_room_device(uuid,uuid,text),private.revoke_room_login_grants()
  from public,anon,authenticated;
grant execute on function private.room_is_open(uuid),private.room_rate_limit(text,integer,integer),
  private.room_auth_identity(uuid,uuid,text),private.room_auth(text,jsonb),public.room_auth(text,jsonb) to service_role;
grant execute on function private.decide_room_join(uuid,boolean),public.decide_room_join(uuid,boolean),
  private.sign_in_room_device(uuid,uuid,text),public.sign_in_room_device(uuid,uuid,text) to authenticated;

create function private.room_presence(p_engagement uuid)
returns table(attendee_id uuid,device_count bigint,present boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.can_facilitate(p_engagement) or not private.room_is_open(p_engagement) then return; end if;
  return query select d.attendee_id,count(*),bool_or(d.last_seen_at>now()-interval '45 seconds')
    from public.device_sessions d join public.attendees a on a.id=d.attendee_id
    join auth.sessions s on s.id=d.auth_session_id and s.user_id=a.auth_user_id
    join auth.users u on u.id=s.user_id
    where d.engagement_id=p_engagement and not d.deleted and d.revoked_at is null and not a.deleted
      and a.verified_at is not null and lower(u.email)=a.email and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<now()) and (s.not_after is null or s.not_after>now())
    group by d.attendee_id;
end $$;
create function public.room_presence(p_engagement uuid)
returns table(attendee_id uuid,device_count bigint,present boolean)
language sql security invoker set search_path='' as $$ select * from private.room_presence(p_engagement) $$;
revoke all on function private.room_presence(uuid),public.room_presence(uuid) from public,anon,authenticated;
grant execute on function private.room_presence(uuid),public.room_presence(uuid) to authenticated;

create function private.revoke_changed_room_proofs() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.email is distinct from old.email or (new.deleted and not old.deleted)
    or (old.auth_user_id is not null and new.auth_user_id is distinct from old.auth_user_id)
    or (old.verified_at is not null and new.verified_at is null) then
    update private.room_auth_devices set granted_at=null,claim_id=null,revoked_at=coalesce(revoked_at,now()) where attendee_id=new.id;
    update private.room_auth_challenges set consumed_at=coalesce(consumed_at,now()) where attendee_id=new.id;
  end if;
  return new;
end $$;
create trigger revoke_changed_room_proofs after update on public.attendees
  for each row execute function private.revoke_changed_room_proofs();
revoke all on function private.revoke_changed_room_proofs() from public,anon,authenticated;


create function private.room_public_info(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',e.id,'title',e.title,'type',e.type,'church',c.name,
    'closed',e.status='closed','howTheRoomDecides',e.how_the_room_decides,
    'neutral',coalesce((e.settings->>'neutral_join_message')='true',false))
  from public.engagements e join public.churches c on c.id=e.church_id
  where e.id=p_engagement and not e.deleted and not c.deleted
$$;
create function public.room_public_info(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.room_public_info(p_engagement) $$;
revoke all on function private.room_public_info(uuid),public.room_public_info(uuid) from public,anon,authenticated;
grant execute on function private.room_public_info(uuid),public.room_public_info(uuid) to service_role;

commit;
