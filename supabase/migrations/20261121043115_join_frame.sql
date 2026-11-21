begin;
alter table public.room_states add column join_frame boolean not null default false;

alter function private.live_public_state(uuid) rename to live_public_state_pre_join_frame;
create function private.live_public_state(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare payload jsonb; enabled boolean;
begin
 payload:=private.live_public_state_pre_join_frame(p_engagement);
 if payload is null or not (payload ? 'state') then return payload; end if;
 select join_frame into enabled from public.room_states where engagement_id=p_engagement and not deleted;
 return jsonb_set(payload,'{state,join_frame}',to_jsonb(coalesce(enabled,false)));
end $$;

alter function private.room_control(uuid,uuid,text,jsonb) rename to room_control_pre_join_frame;
create function private.room_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; done private.room_controls; enabled boolean; actor_name text;
begin
 if p_action is distinct from 'join_frame' then return private.room_control_pre_join_frame(p_engagement,p_id,p_action,p); end if;
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or private.remote_actor(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or jsonb_typeof(p) is distinct from 'object' or p-'on'<>'{}'::jsonb or jsonb_typeof(p->'on') is distinct from 'boolean'
 then return jsonb_build_object('status','invalid_request'); end if;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>p_action then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','version',r.version);
 end if;
 enabled:=(p->>'on')::boolean;
 if r.join_frame is not distinct from enabled then return jsonb_build_object('status','unchanged','version',r.version); end if;
 update public.room_states set join_frame=enabled where engagement_id=p_engagement returning * into r;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at)
 values(p_id,p_engagement,private.clearway_user_id(),p_action,r.live_session_id,r.version,clock_timestamp());
 select split_part(btrim(name),' ',1) into actor_name from public.clearway_users where id=private.clearway_user_id();
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action',p_action,'by',actor_name,'version',r.version,'changed',true));
 return jsonb_build_object('status','ok','version',r.version);
end $$;

-- Closing a workshop writes the closed engagement first, then resets the room in the same transaction.
create function private.clear_join_frame_on_close() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.join_frame and (new.deleted or exists(select 1 from public.engagements where id=new.engagement_id and status='closed')) then
  new.join_frame:=false;
 end if;
 return new;
end $$;
create trigger clear_join_frame_on_close before update on public.room_states for each row
 when (new.join_frame) execute function private.clear_join_frame_on_close();

revoke all on function private.live_public_state(uuid),private.live_public_state_pre_join_frame(uuid),
 private.room_control(uuid,uuid,text,jsonb),private.room_control_pre_join_frame(uuid,uuid,text,jsonb),private.clear_join_frame_on_close()
 from public,anon,authenticated;
grant execute on function private.room_control(uuid,uuid,text,jsonb) to authenticated;
commit;
