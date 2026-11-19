-- The join banner (Chris, November 17): a strip along the bottom of the TV with the room link and its QR code, for people
-- who arrive late. It stays over whatever is on the TV (any step, Home or Blackout aside) until it is turned off, so the
-- live step never leaves the screen the way it does for the Join screen.
--
-- 1. room_states.join_banner: on or off for the room. Updating it bumps the room version and broadcasts, like every
--    room_states change.
-- 2. join_banner_control, for the facilitators (the control surface and the phone remote), like timer_control.
-- 3. The room state carries it: live_public_state from 20261116130000_timers, with one more field read from the same row.
begin;

alter table public.room_states add column join_banner boolean not null default false;

create function private.join_banner_control(p_engagement uuid,p_on boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states;
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if p_on is null then return jsonb_build_object('status','invalid_request'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if r.join_banner=p_on then return jsonb_build_object('status','unchanged','on',p_on,'version',r.version); end if;
 update public.room_states set join_banner=p_on where engagement_id=p_engagement returning * into r;
 return jsonb_build_object('status','ok','on',p_on,'version',r.version);
end $$;
revoke all on function private.join_banner_control(uuid,boolean) from public,anon;
grant execute on function private.join_banner_control(uuid,boolean) to authenticated;
create function public.join_banner_control(p_engagement uuid,p_on boolean) returns jsonb
language sql security invoker set search_path='' as $$ select private.join_banner_control(p_engagement,p_on) $$;
revoke all on function public.join_banner_control(uuid,boolean) from public,anon;
grant execute on function public.join_banner_control(uuid,boolean) to authenticated;

create or replace function private.live_public_state(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare b jsonb; r public.room_states; h jsonb;
begin
 b:=private.live_public_state_pre_images(p_engagement);
 if b is null or not (b ? 'state') then return b; end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 h:=private.home_loop(p_engagement);
 b:=jsonb_set(b,'{state,preload}',private.image_preload(p_engagement));
 b:=jsonb_set(b,'{state,screen_started_at}',coalesce(to_jsonb(r.screen_started_at),'null'::jsonb));
 b:=jsonb_set(b,'{state,home}',case when jsonb_array_length(coalesce(h->'images','[]'::jsonb))>0 then h-'title' else 'null'::jsonb end);
 b:=jsonb_set(b,'{state,join_banner}',to_jsonb(coalesce(r.join_banner,false)));
 return jsonb_set(b,'{state,timer}',coalesce(r.timer,'null'::jsonb));
end $$;
revoke all on function private.live_public_state(uuid) from public,anon,authenticated;

commit;
