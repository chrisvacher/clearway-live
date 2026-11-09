-- Open joining (Chris, November 9): an admin setting on a team workshop that lets anyone with the
-- room code join by name, with no email sign-in, the way the practice room already works.
-- Team workshops only: guests have no email, so Wayfinding's check-ins could never reach them.
-- Supersets of the newest definitions: private.practice_guest (20261030110953_practice_room)
-- and private.room_public_info (20261030041545_room_sign_in).
begin;

create or replace function private.practice_guest(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare eng uuid:=(p->>'engagement')::uuid; d private.room_auth_devices; person uuid; guest_email text; practice boolean;
begin
 practice:=eng is not distinct from '90000000-0000-4000-8000-000000000010'::uuid;
 if eng is null then return jsonb_build_object('status','invalid_request'); end if;
 perform pg_advisory_xact_lock(hashtextextended(eng::text,7));
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
 update private.room_auth_devices set attendee_id=person,verified_email=guest_email,granted_at=now(),claim_id=null,claim_started_at=null where id=d.id;
 return jsonb_build_object('status','approved');
end $$;

create or replace function private.room_public_info(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',e.id,'title',e.title,'type',e.type,'church',c.name,
    'closed',e.status='closed','howTheRoomDecides',e.how_the_room_decides,
    'neutral',coalesce((e.settings->>'neutral_join_message')='true',false),
    'openJoin',e.type='team_workshop' and coalesce((e.settings->>'open_join')='true',false))
  from public.engagements e join public.churches c on c.id=e.church_id
  where e.id=p_engagement and not e.deleted and not c.deleted
$$;

-- Only a Clearway admin may turn open joining on or off, whatever path the change takes: the setup
-- route, save_engagement (security definer, so the check reads the signed-in user, not the role) or
-- a direct update of settings. Calls with no signed-in user (the server's service role) pass.
create function private.guard_open_join() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if (case when tg_op='INSERT' then coalesce(new.settings->'open_join','false'::jsonb) is distinct from 'false'::jsonb
     else (new.settings->'open_join') is distinct from (old.settings->'open_join') end)
    and (select auth.uid()) is not null and not (select private.is_admin()) then
   raise exception 'Only an admin can change open joining' using errcode='insufficient_privilege';
 end if;
 return new;
end $$;
revoke all on function private.guard_open_join() from public,anon,authenticated;
create trigger engagements_guard_open_join before insert or update of settings on public.engagements
  for each row execute function private.guard_open_join();

commit;
