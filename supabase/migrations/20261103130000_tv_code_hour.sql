-- TV pairing codes last 60 minutes (Chris, November 3).
--
-- A TV's pairing code now lasts 60 minutes instead of five, so the code on the screen rarely
-- changes while someone is setting up the room. The TV still times the code by the server's
-- clock and asks for the next one as it ends (fix/tv-pairing-code-refresh), and a code is
-- still used up when the facilitator pairs with it.
--
-- Shared function redefined: private.tv_device only, copied from 20261031025813_tv_pairing
-- with the code's life changed from 5 to 60 minutes in its two places. Nothing else changes.
begin;

create or replace function private.tv_device(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.tv_devices; eng uuid; native_session uuid; native_user uuid; binding uuid;
begin
 if p_action not in ('sync','prepare','release','bind') or p->>'proof' is null or p->>'proof' !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','invalid_request'); end if;
 if p_action='bind' then
  select engagement_id into eng from private.tv_devices where id=(p->>'device')::uuid and proof=p->>'proof' and not deleted;
  if eng is null then return jsonb_build_object('status','denied'); end if;
  perform 1 from public.engagements where id=eng and not deleted and status<>'closed' for key share;
  if not found then return jsonb_build_object('status','denied'); end if;
  perform 1 from public.room_states where engagement_id=eng and not deleted for update;
 end if;
 select * into d from private.tv_devices where id=(p->>'device')::uuid for update;
 if not found then
  if p_action<>'sync' or p->>'code_hash' is null or p->>'code_hash' !~ '^[a-f0-9]{64}$' or p->>'rate' is null or p->>'rate' !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','denied'); end if;
  if not private.tv_limit('init:'||(p->>'rate'),30,600) then return jsonb_build_object('status','limited'); end if;
  insert into private.tv_devices(id,proof,code_hash,code_expires_at,browser) values((p->>'device')::uuid,p->>'proof',p->>'code_hash',now()+interval '60 minutes',left(coalesce(p->>'browser',''),80)) returning * into d;
 end if;
 if d.deleted or d.proof<>p->>'proof' then return jsonb_build_object('status','denied'); end if;
 if p_action='release' then
  if d.claim_id=(p->>'claim')::uuid then update private.tv_devices set claim_id=null,claim_started_at=null where id=d.id; end if;
  return jsonb_build_object('status','released');
 end if;
 if d.engagement_id is null then
  if p_action<>'sync' then return jsonb_build_object('status','denied'); end if;
  if d.code_hash is null or d.code_expires_at<=now() then
   if p->>'code_hash' is null or p->>'code_hash' !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','invalid_request'); end if;
   if not private.tv_limit('renew:'||d.id::text,5,600) then return jsonb_build_object('status','limited'); end if;
   update private.tv_devices set code_hash=p->>'code_hash',code_expires_at=now()+interval '60 minutes' where id=d.id returning * into d;
  end if;
  return jsonb_build_object('status','pair','expires_at',d.code_expires_at,'code_hash',d.code_hash);
 end if;
 if not exists(select 1 from public.engagements e join public.churches c on c.id=e.church_id where e.id=d.engagement_id and not e.deleted and e.status<>'closed' and not c.deleted) then return jsonb_build_object('status','closed'); end if;
 if p_action='prepare' then
  if d.claim_id is not null and d.claim_started_at>now()-interval '45 seconds' then return jsonb_build_object('status','waiting'); end if;
  binding:=gen_random_uuid();
  update private.tv_devices set claim_id=binding,claim_started_at=now() where id=d.id;
  return jsonb_build_object('status','claim','claim',binding,'engagement',d.engagement_id,'email',d.id::text||'@tv.clearway.invalid');
 elsif p_action='bind' then
  if d.engagement_id is distinct from eng or d.claim_id is null or d.claim_id is distinct from (p->>'claim')::uuid or d.claim_started_at<now()-interval '45 seconds' then return jsonb_build_object('status','denied'); end if;
  native_user:=(p->>'user')::uuid;native_session:=(p->>'session')::uuid;
  if not exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=native_session and s.user_id=native_user
    and lower(u.email)=d.id::text||'@tv.clearway.invalid' and u.email_confirmed_at is not null and u.deleted_at is null
    and (s.not_after is null or s.not_after>now()) and (u.banned_until is null or u.banned_until<=now())) then return jsonb_build_object('status','denied'); end if;
  -- Remove earlier native sessions for this device before granting its replacement.
  delete from auth.sessions where id in(select auth_session_id from private.live_tv_sessions where device_id=d.id and revoked_at is null and not deleted);
  update private.live_tv_sessions set revoked_at=coalesce(revoked_at,now()) where device_id=d.id and revoked_at is null;
  insert into private.live_tv_sessions(engagement_id,auth_user_id,auth_session_id,device_id) values(eng,native_user,native_session,d.id) returning id into binding;
  update private.tv_devices set claim_id=null,claim_started_at=null where id=d.id;
  update public.room_states set results=private.live_results(eng) where engagement_id=eng;
  return jsonb_build_object('status','paired','engagement',eng,'tv',binding);
 end if;
 return jsonb_build_object('status','approved','engagement',d.engagement_id);
exception when invalid_text_representation or unique_violation then return jsonb_build_object('status','invalid_request');
end $$;
commit;
