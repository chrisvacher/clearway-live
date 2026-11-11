-- Flexible joining (Chris, November 11): the room link can be a name the facilitator chooses, such as the
-- church's (live.clearway.co/hopeoakville), or stay the generated room code. The generated code keeps working
-- beside a chosen name, since the TV shows it and people type it at live.clearway.co.
-- People and joining saves its own choices in one call: the link name, who can join, the message for emails not
-- on the list and How the room decides. Open joining stays a team workshop setting an admin changes (20261109080000).
begin;

-- Letters and digits only, 3 to 24, lower case: what the join box keeps of a typed link. Never shaped like a
-- generated room code, and never a word the app uses for its own pages.
alter table public.engagements add column link_name text
  check (link_name is null or (link_name ~ '^[a-z0-9]{3,24}$' and link_name !~ '^[a-f0-9]{8}$'));
create unique index engagements_link_name_unique on public.engagements(link_name) where link_name is not null and not deleted;

create function private.link_name_reserved(p_name text) returns boolean
language sql immutable set search_path='' as $$
  select p_name = any(array['practice','setup','control','remote','room','tv','api','auth','signin','signout','admin','join','live','clearway','help','about','privacy','terms','howweuseai','static','public','favicon','robots','sitemap','next'])
$$;
revoke all on function private.link_name_reserved(text) from public,anon,authenticated;

-- A superset of the definition in 20261031025813_tv_pairing: the generated code, or the chosen name.
create or replace function private.tv_room_link(p_code text) returns uuid language sql stable security definer set search_path='' as $$
 select e.id from public.engagements e join public.churches c on c.id=e.church_id
 where (e.room_code=upper(p_code) or e.link_name=lower(p_code)) and not e.deleted and not c.deleted
 order by (e.room_code=upper(p_code)) desc limit 1
$$;

create function private.joining_save(p_engagement uuid,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.engagements; name text; next_settings jsonb;
begin
 if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) then raise insufficient_privilege; end if;
 select * into e from public.engagements where id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','missing'); end if;
 if p ? 'link_name' then
  name:=nullif(lower(regexp_replace(coalesce(p->>'link_name',''),'[^A-Za-z0-9]','','g')),'');
  if name is not null then
   if name !~ '^[a-z0-9]{3,24}$' or name ~ '^[a-f0-9]{8}$' then return jsonb_build_object('status','invalid_name'); end if;
   if private.link_name_reserved(name) then return jsonb_build_object('status','reserved_name'); end if;
   if exists(select 1 from public.engagements x where x.link_name=name and x.id<>e.id and not x.deleted) then return jsonb_build_object('status','taken_name'); end if;
  end if;
 else name:=e.link_name; end if;
 next_settings:=e.settings;
 if p ? 'open_join' then
  if jsonb_typeof(p->'open_join')<>'boolean' then return jsonb_build_object('status','invalid_request'); end if;
  if (p->'open_join')::boolean and e.type<>'team_workshop' then return jsonb_build_object('status','workshop_only'); end if;
  next_settings:=jsonb_set(next_settings,'{open_join}',p->'open_join');
 end if;
 if p ? 'neutral_join_message' then
  if jsonb_typeof(p->'neutral_join_message')<>'boolean' then return jsonb_build_object('status','invalid_request'); end if;
  next_settings:=jsonb_set(next_settings,'{neutral_join_message}',p->'neutral_join_message');
 end if;
 if p ? 'how_the_room_decides' and length(coalesce(p->>'how_the_room_decides','')) not between 1 and 4000 then return jsonb_build_object('status','invalid_request'); end if;
 -- The open joining guard (engagements_guard_open_join) still refuses a change by anyone but an admin.
 update public.engagements set link_name=name,settings=next_settings,
   how_the_room_decides=case when p ? 'how_the_room_decides' then p->>'how_the_room_decides' else how_the_room_decides end
 where id=e.id;
 return jsonb_build_object('status','ok','link_name',name,'room_code',e.room_code);
end $$;
create function public.joining_save(p_engagement uuid,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.joining_save(p_engagement,p) $$;
revoke all on function private.joining_save(uuid,jsonb),public.joining_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.joining_save(uuid,jsonb),public.joining_save(uuid,jsonb) to authenticated;

-- Make a new code: the old link and any printed QR code stop working, so the page asks first.
create function private.room_code_renew(p_engagement uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare code text;
begin
 if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) then raise insufficient_privilege; end if;
 if not exists(select 1 from public.engagements where id=p_engagement and not deleted and type<>'practice') then return jsonb_build_object('status','missing'); end if;
 loop
  code:=upper(left(replace(gen_random_uuid()::text,'-',''),8));
  exit when not exists(select 1 from public.engagements where room_code=code);
 end loop;
 update public.engagements set room_code=code where id=p_engagement;
 return jsonb_build_object('status','ok','room_code',code);
end $$;
create function public.room_code_renew(p_engagement uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.room_code_renew(p_engagement) $$;
revoke all on function private.room_code_renew(uuid),public.room_code_renew(uuid) from public,anon,authenticated;
grant execute on function private.room_code_renew(uuid),public.room_code_renew(uuid) to authenticated;

commit;
