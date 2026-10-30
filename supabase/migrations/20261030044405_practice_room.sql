begin;
-- Serialize practice grants and bindings with reset, including claims in flight.
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
  if eng='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(eng::text,7)); end if;
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

create function private.practice_guest(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare eng uuid:=(p->>'engagement')::uuid; d private.room_auth_devices; person uuid; guest_email text;
begin
 if eng is distinct from '90000000-0000-4000-8000-000000000010'::uuid then return jsonb_build_object('status','invalid_request'); end if;
 perform pg_advisory_xact_lock(hashtextextended(eng::text,7));
 if not private.room_is_open(eng) or not exists(select 1 from public.engagements where id=eng and type='practice') then return jsonb_build_object('status','closed'); end if;
 if length(btrim(p->>'name')) not between 1 and 200 or p->>'name' is null then return jsonb_build_object('status','invalid_request'); end if;
 select * into d from private.room_auth_devices where id=(p->>'device')::uuid and engagement_id=eng and proof_hash=p->>'proof' and not deleted and revoked_at is null for update;
 if not found then return jsonb_build_object('status','device_missing'); end if;
 if not private.room_rate_limit(p->>'rate_device',6,600) or not private.room_rate_limit(p->>'rate_ip',300,600) then return jsonb_build_object('status','rate_limited'); end if;
 guest_email:=d.id::text||'@practice.clearway.invalid';
 insert into public.attendees(engagement_id,name,email) values(eng,btrim(p->>'name'),guest_email)
   on conflict(engagement_id,lower(email)) where not deleted do update set name=excluded.name returning id into person;
 update private.room_auth_devices set attendee_id=person,verified_email=guest_email,granted_at=now(),claim_id=null,claim_started_at=null where id=d.id;
 return jsonb_build_object('status','approved');
end $$;
create function public.practice_guest(p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.practice_guest(p) $$;
revoke all on function private.practice_guest(jsonb),public.practice_guest(jsonb) from public,anon,authenticated;
grant execute on function private.practice_guest(jsonb),public.practice_guest(jsonb) to service_role;

create function private.reset_practice_room() returns boolean
language plpgsql security definer set search_path='' as $$
declare eng uuid:='90000000-0000-4000-8000-000000000010'::uuid; target_sessions uuid[];
begin
 if not ((select private.is_admin()) or private.can_facilitate(eng)) then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(eng::text,7));
 if not exists(select 1 from public.engagements where id=eng and type='practice' and not deleted) then return false; end if;
 select array_agg(distinct auth_session_id) into target_sessions from public.device_sessions where engagement_id=eng;
 update public.device_sessions set revoked_at=coalesce(revoked_at,now()) where engagement_id=eng;
 update private.room_auth_devices set revoked_at=coalesce(revoked_at,now()),granted_at=null,claim_id=null,claim_started_at=null,deleted=true where engagement_id=eng;
 update private.room_auth_challenges set consumed_at=coalesce(consumed_at,now()),deleted=true where engagement_id=eng;
 update public.join_requests set deleted=true where engagement_id=eng;
 update public.attendees set deleted=true where engagement_id=eng;
 -- Preserve device audit rows, while invalidating JWT access and refresh immediately.
 delete from auth.sessions where id=any(coalesce(target_sessions,array[]::uuid[]));
 update public.engagements set status='setup' where id=eng;
 return true;
end $$;
create function public.reset_practice_room() returns boolean
language sql security invoker set search_path='' as $$ select private.reset_practice_room() $$;
revoke all on function private.reset_practice_room(),public.reset_practice_room() from public,anon,authenticated;
grant execute on function private.reset_practice_room(),public.reset_practice_room() to authenticated;

-- Fictional addresses cannot accidentally receive real invitation email.
create function private.check_invite_recipients() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from jsonb_array_elements(new.payload->'people') person where person->>'email' ~* '[.](example|invalid|test)$') then
   raise check_violation using message='Replace fictional email addresses before sending invites.';
 end if;return new;
end $$;
revoke all on function private.check_invite_recipients() from public,anon,authenticated;
create trigger check_invite_recipients before insert on private.invitation_batches for each row execute function private.check_invite_recipients();

-- Clearway admins retain the PRD’s full door-list access without assignment.
create or replace function private.decide_room_join(p_request uuid,p_approve boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.join_requests%rowtype; person uuid;
begin
  select * into r from public.join_requests where id=p_request and not deleted;
  if not found or not ((select private.is_admin()) or private.can_facilitate(r.engagement_id)) or not private.room_is_open(r.engagement_id) then return false; end if;
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
create or replace function private.sign_in_room_device(p_engagement uuid,p_attendee uuid,p_code text) returns boolean
language plpgsql security definer set search_path='' as $$
declare person public.attendees%rowtype;
begin
  if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) or not private.room_is_open(p_engagement) then return false; end if;
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
create or replace function private.room_presence(p_engagement uuid)
returns table(attendee_id uuid,device_count bigint,present boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) or not private.room_is_open(p_engagement) then return; end if;
  return query select d.attendee_id,count(*),bool_or(d.last_seen_at>now()-interval '45 seconds')
    from public.device_sessions d join public.attendees a on a.id=d.attendee_id
    join auth.sessions s on s.id=d.auth_session_id and s.user_id=a.auth_user_id
    join auth.users u on u.id=s.user_id
    where d.engagement_id=p_engagement and not d.deleted and d.revoked_at is null and not a.deleted
      and a.verified_at is not null and lower(u.email)=a.email and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<now()) and (s.not_after is null or s.not_after>now())
    group by d.attendee_id;
end $$;
commit;
