-- The TV shows the chosen link name (Chris, November 16). When a facilitator has chosen a link name
-- (live.novetera.co/ppc), the join screen, the join strip, the corner link and every QR code use it in place of the
-- generated room code. The generated code keeps working beside it, and is still shown when no name is chosen.
-- tv_room_info feeds live_public_state (the snapshot and its broadcast) and tv_manage, so adding link_name to its
-- display reaches the TV, the control surface's TV preview and phones in one place.
begin;

create or replace function private.tv_room_info(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when r is null then null
  else jsonb_set(jsonb_set(r,'{display,skin}',to_jsonb(e.skin),true),'{display,link_name}',coalesce(to_jsonb(e.link_name),'null'::jsonb),true) end
 from (select private.tv_room_info_pre_skin(p_engagement) r) x
 left join public.engagements e on e.id=p_engagement
$$;
revoke all on function private.tv_room_info(uuid) from public,anon,authenticated;

-- A change of link name (or of the code it falls back to) reaches a TV and phones already in the room, as a skin change does.
create function private.tv_link_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.link_name is distinct from old.link_name or new.room_code is distinct from old.room_code) and not new.deleted and new.status<>'closed' then
  update public.room_states set results=private.live_results(new.id) where engagement_id=new.id and not deleted;
 end if;return new;
end $$;
revoke all on function private.tv_link_changed() from public,anon,authenticated;
create trigger tv_link_changed after update of link_name,room_code on public.engagements for each row execute function private.tv_link_changed();

commit;
