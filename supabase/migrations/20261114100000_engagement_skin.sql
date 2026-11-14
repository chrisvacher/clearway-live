-- The Novetera skin (Chris, November 13): one app and one database, and each engagement has a skin that decides the
-- brand the room sees and the address its links use. This step only stores the skin and lets it reach the people who
-- need it. It changes nothing a Clearway engagement shows.
--  * public.engagements.skin: 'clearway' (the default) or 'novetera'. No browser role can update the column directly;
--    it changes through save_engagement, and only an admin changes it (the practice room included).
--  * The existing functions are not rewritten. Each is renamed to ..._pre_skin and wrapped, the way the run of show
--    wrapped show_read (20261112200000): save_engagement keeps a skin sent with the Details save; tv_room_info (the
--    source of the live snapshot, its broadcast and the Screens list) adds the skin to the display; room_public_info
--    (the public join page) adds it; engagement_archive adds it to the engagement's record.
--  * tv_room_resolve is new: the id and skin behind a room code or link name, so a code at the wrong address can be
--    redirected to its engagement's address. It answers exactly what tv_room_link answers, plus the skin.
--  * A skin change reaches a TV and phones already in the room the way a title or TV setting does.
--  * Reset practice room and the nightly reset never touch the skin (they set status and survey_respondents only).
begin;

alter table public.engagements add column skin text not null default 'clearway' check (skin in ('clearway','novetera'));
comment on column public.engagements.skin is 'The brand the room sees (screens, phones, emails, summary) and the address its links use: clearway or novetera. Changed only through save_engagement, by an admin.';

-- ---------- Details save: an admin may change the skin ----------
alter function private.save_engagement(uuid,jsonb,jsonb,uuid,uuid,uuid,uuid) rename to save_engagement_pre_skin;
create function private.save_engagement(p_id uuid,p_church jsonb,p_engagement jsonb,p_lead uuid,p_co uuid,p_client uuid,p_hub_engagement uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_skin text; v_old text; target uuid;
begin
  if jsonb_typeof(p_engagement)='object' and p_engagement ? 'skin' then
    if jsonb_typeof(p_engagement->'skin')<>'string' or p_engagement->>'skin' not in ('clearway','novetera') then raise check_violation using message='Choose a brand.'; end if;
    v_skin:=p_engagement->>'skin';
    if p_id is not null then select skin into v_old from public.engagements where id=p_id and not deleted; end if;
  end if;
  target:=private.save_engagement_pre_skin(p_id,p_church,p_engagement-'skin',p_lead,p_co,p_client,p_hub_engagement);
  if v_skin is not null and v_skin is distinct from coalesce(v_old,'clearway') then
    if not (select private.is_admin()) then raise insufficient_privilege using message='Only an admin can change the brand'; end if;
    update public.engagements set skin=v_skin where id=target;
  end if;
  return target;
end $$;
revoke all on function private.save_engagement(uuid,jsonb,jsonb,uuid,uuid,uuid,uuid),private.save_engagement_pre_skin(uuid,jsonb,jsonb,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.save_engagement(uuid,jsonb,jsonb,uuid,uuid,uuid,uuid) to authenticated;

-- ---------- The TV, the phones and the Screens list ----------
-- private.tv_room_info feeds live_public_state (the snapshot and the broadcast) and tv_manage: add the skin to its display.
alter function private.tv_room_info(uuid) rename to tv_room_info_pre_skin;
create function private.tv_room_info(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when r is null then null
  else jsonb_set(r,'{display,skin}',to_jsonb((select e.skin from public.engagements e where e.id=p_engagement)),true) end
 from (select private.tv_room_info_pre_skin(p_engagement) r) x
$$;
revoke all on function private.tv_room_info(uuid),private.tv_room_info_pre_skin(uuid) from public,anon,authenticated;

-- A change of skin reaches a TV and phones already in the room, as a change of title or TV setting does.
create function private.tv_skin_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.skin is distinct from old.skin and not new.deleted and new.status<>'closed' then
  update public.room_states set results=private.live_results(new.id) where engagement_id=new.id and not deleted;
 end if;return new;
end $$;
revoke all on function private.tv_skin_changed() from public,anon,authenticated;
create trigger tv_skin_changed after update of skin on public.engagements for each row execute function private.tv_skin_changed();

-- ---------- The public join page ----------
alter function private.room_public_info(uuid) rename to room_public_info_pre_skin;
create function private.room_public_info(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select private.room_public_info_pre_skin(p_engagement)||jsonb_build_object('skin',e.skin)
 from public.engagements e where e.id=p_engagement and not e.deleted
$$;
revoke all on function private.room_public_info(uuid),private.room_public_info_pre_skin(uuid) from public,anon,authenticated;
grant execute on function private.room_public_info(uuid) to service_role;

-- ---------- A code or link name, and the skin of the engagement it opens ----------
create function private.tv_room_resolve(p_code text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',e.id,'skin',e.skin) from public.engagements e where e.id=private.tv_room_link(p_code)
$$;
create function public.tv_room_resolve(p_code text) returns jsonb language sql stable security invoker set search_path='' as $$ select private.tv_room_resolve(p_code) $$;
revoke all on function private.tv_room_resolve(text),public.tv_room_resolve(text) from public,anon,authenticated;
grant execute on function private.tv_room_resolve(text),public.tv_room_resolve(text) to service_role;

-- ---------- The engagement's JSON archive ----------
alter function private.engagement_archive(uuid) rename to engagement_archive_pre_skin;
create function private.engagement_archive(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 r:=private.engagement_archive_pre_skin(p_engagement);
 if r->>'status' is distinct from 'ok' then return r; end if;
 return jsonb_set(r,'{records,engagements}',coalesce((select jsonb_agg(v||jsonb_build_object('skin',e.skin) order by n)
  from jsonb_array_elements(r#>'{records,engagements}') with ordinality t(v,n) join public.engagements e on e.id=(v->>'id')::uuid),'[]'::jsonb));
end $$;
revoke all on function private.engagement_archive(uuid),private.engagement_archive_pre_skin(uuid) from public,anon,authenticated;
grant execute on function private.engagement_archive(uuid) to authenticated;

commit;
