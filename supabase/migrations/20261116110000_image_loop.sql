-- Batch 1 (November 15): the image loop (LP-1), and a loop as the engagement's Home screen.
--
-- 1. A loop is a content step with screen 'loop': its images in order (ids of the engagement's uploaded images, up to 30),
--    the seconds each one shows (3 to 60, default 8) and a transition (fade, slide or cut, default fade). A loop with no
--    images yet saves as a draft; the TV shows nothing new for it until it has one.
-- 2. The room records when the screen last changed (screen_started_at): a new live step or a new TV screen. Every surface
--    works out which image is up from that moment and the server clock, so the TV, the Preview and phones agree.
-- 3. The engagement's Home is a setting, home_session, naming one of its loop steps (or none: the usual holding screen).
--    The room state carries the Home loop while one is set. Choosing Home, or editing the Home loop, resends the room.
-- 4. Phones that have not joined yet show the Home image above the join form. home_join (service role only) gives the
--    Home loop while Home is on the TV, and home_image_path lets the image route serve only those images to them.
begin;

-- ---------- 2. When the screen changed ----------
alter table public.room_states add column screen_started_at timestamptz not null default now();
create function private.screen_started() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.live_session_id is distinct from old.live_session_id or new.tv_content is distinct from old.tv_content then new.screen_started_at:=now(); end if;
 return new;
end $$;
revoke all on function private.screen_started() from public,anon,authenticated;
create trigger screen_started before update on public.room_states for each row execute function private.screen_started();

-- ---------- 1. Loop options ----------
create function private.loop_images(p jsonb,p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare out jsonb;
begin
 if p is null or jsonb_typeof(p)='null' then return '[]'::jsonb; end if;
 if jsonb_typeof(p)<>'array' or jsonb_array_length(p)>30 then return null; end if;
 if exists(select 1 from jsonb_array_elements(p) v where jsonb_typeof(v)<>'string' or v#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return null; end if;
 select coalesce(jsonb_agg(v order by n),'[]'::jsonb) into out from jsonb_array_elements(p) with ordinality t(v,n)
  join private.engagement_images i on i.id=(v#>>'{}')::uuid and i.engagement_id=p_engagement and not i.deleted and i.uploaded_at is not null;
 if jsonb_array_length(out)<>jsonb_array_length(p) then return null; end if;
 return out;
end $$;
revoke all on function private.loop_images(jsonb,uuid) from public,anon,authenticated;

alter function private.options_content(jsonb,uuid) rename to options_content_pre_loop;
create function private.options_content(p jsonb,p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare imgs jsonb; secs integer; how text;
begin
 if jsonb_typeof(p) is distinct from 'object' or coalesce(p->>'screen','')<>'loop' then return private.options_content_pre_loop(p,p_engagement); end if;
 if (select count(*) from jsonb_object_keys(p) k where k not in ('screen','images','seconds','transition'))>0 then return null; end if;
 imgs:=private.loop_images(p->'images',p_engagement);
 if imgs is null then return null; end if;
 if p ? 'seconds' and jsonb_typeof(p->'seconds')<>'null' then
  if jsonb_typeof(p->'seconds')<>'number' or (p->>'seconds')::numeric<>trunc((p->>'seconds')::numeric) or (p->>'seconds')::numeric not between 3 and 60 then return null; end if;
  secs:=(p->>'seconds')::integer;
 end if;
 how:=coalesce(p->>'transition','fade');
 if how not in ('fade','slide','cut') then return null; end if;
 return jsonb_build_object('screen','loop','images',imgs,'seconds',coalesce(secs,8),'transition',how);
end $$;
revoke all on function private.options_content(jsonb,uuid),private.options_content_pre_loop(jsonb,uuid) from public,anon,authenticated;

-- ---------- 3. Home ----------
-- The engagement's Home loop, if it names one of its own loop steps: the step, its title, its uploaded images in order,
-- its timing and transition.
create function private.home_loop(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('session',s.id,'title',s.title,
   'images',coalesce((select jsonb_agg(v order by n) from jsonb_array_elements(case when jsonb_typeof(s.options->'images')='array' then s.options->'images' else '[]'::jsonb end) with ordinality t(v,n)
     join private.engagement_images i on i.id::text=v#>>'{}' and i.engagement_id=p_engagement and not i.deleted and i.uploaded_at is not null),'[]'::jsonb),
   'seconds',coalesce((s.options->>'seconds')::integer,8),'transition',coalesce(s.options->>'transition','fade'))
  from public.engagements e join public.sessions s on s.id::text=e.settings->>'home_session' and s.engagement_id=e.id and not s.deleted
   and s.interaction='content' and s.options->>'screen'='loop'
  where e.id=p_engagement and not e.deleted
$$;
revoke all on function private.home_loop(uuid) from public,anon,authenticated;

-- The Screens page and the run of show: which loop is Home, and the loops it could be.
create function private.home_list(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 return jsonb_build_object('status','ok','home',private.home_loop(p_engagement)->'session',
  'loops',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'images',coalesce(s.options->'images','[]'::jsonb),
    'seconds',coalesce((s.options->>'seconds')::integer,8),'transition',coalesce(s.options->>'transition','fade')) order by private.part_order(s.part),s.position,s.id)
   from public.sessions s where s.engagement_id=p_engagement and not s.deleted and s.interaction='content' and s.options->>'screen'='loop'),'[]'::jsonb));
end $$;

-- Choose the Home loop, or none. The room state is resent so a TV showing Home changes at once.
create function private.home_choose(p_engagement uuid,p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.engagements;
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 select * into e from public.engagements where id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','denied'); end if;
 if e.status='closed' then return jsonb_build_object('status','closed'); end if;
 if p_session is not null and not exists(select 1 from public.sessions s where s.id=p_session and s.engagement_id=p_engagement and not s.deleted
   and s.interaction='content' and s.options->>'screen'='loop') then return jsonb_build_object('status','missing'); end if;
 if (e.settings->>'home_session') is not distinct from p_session::text then return jsonb_build_object('status','ok','home',p_session); end if;
 update public.engagements set settings=case when p_session is null then settings-'home_session' else settings||jsonb_build_object('home_session',p_session) end where id=p_engagement;
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement and not deleted;
 return jsonb_build_object('status','ok','home',p_session);
end $$;
revoke all on function private.home_list(uuid),private.home_choose(uuid,uuid) from public,anon;
grant execute on function private.home_list(uuid),private.home_choose(uuid,uuid) to authenticated,service_role;
create function public.home_list(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.home_list(p_engagement) $$;
create function public.home_choose(p_engagement uuid,p_session uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.home_choose(p_engagement,p_session) $$;
revoke all on function public.home_list(uuid),public.home_choose(uuid,uuid) from public,anon;
grant execute on function public.home_list(uuid),public.home_choose(uuid,uuid) to authenticated,service_role;

-- Editing the Home loop (its images, timing, title) or removing it resends the room, as choosing it does.
create function private.home_edited() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.engagements e where e.id=new.engagement_id and e.settings->>'home_session'=new.id::text) then
  update public.room_states set results=private.live_results(new.engagement_id) where engagement_id=new.engagement_id and not deleted and live_session_id is null and tv_content='holding';
 end if;
 return null;
end $$;
revoke all on function private.home_edited() from public,anon,authenticated;
create trigger home_edited after update of options,title,deleted,interaction on public.sessions for each row
 when (old.options is distinct from new.options or old.title is distinct from new.title or old.deleted is distinct from new.deleted or old.interaction is distinct from new.interaction)
 execute function private.home_edited();

-- ---------- 4. Phones that haven't joined ----------
-- The Home loop while Home is on the TV (nothing live, the holding screen up) and the engagement is open; null otherwise.
create function private.home_join(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('status','ok','home',case when r.live_session_id is null and r.tv_content='holding' and e.status<>'closed' and jsonb_array_length(h->'images')>0
   then h||jsonb_build_object('started_at',r.screen_started_at) end,'server_time',clock_timestamp())
  from public.engagements e join public.room_states r on r.engagement_id=e.id and not r.deleted left join lateral (select private.home_loop(e.id) h) x on true
  where e.id=p_engagement and not e.deleted
$$;
create function private.home_image_path(p_engagement uuid,p_image uuid) returns text
language sql stable security definer set search_path='' as $$
 select i.path from private.engagement_images i
  where i.id=p_image and i.engagement_id=p_engagement and not i.deleted and i.uploaded_at is not null
   and private.home_join(p_engagement)->'home'->'images' ? p_image::text
$$;
revoke all on function private.home_join(uuid),private.home_image_path(uuid,uuid) from public,anon,authenticated;
grant execute on function private.home_join(uuid),private.home_image_path(uuid,uuid) to service_role;
create function public.home_join(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.home_join(p_engagement) $$;
create function public.home_image_path(p_engagement uuid,p_image uuid) returns text
language sql stable security invoker set search_path='' as $$ select private.home_image_path(p_engagement,p_image) $$;
revoke all on function public.home_join(uuid),public.home_image_path(uuid,uuid) from public,anon,authenticated;
grant execute on function public.home_join(uuid),public.home_image_path(uuid,uuid) to service_role;

-- ---------- The room state ----------
-- The TV preloads the Home images while nothing is live, so Home never waits on a download.
create or replace function private.image_preload(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with anchor as (
  select s.* from public.room_states r join public.sessions s on s.id=r.live_session_id where r.engagement_id=p_engagement and not s.deleted
  union all select s.* from public.sessions s where s.engagement_id=p_engagement and not s.deleted and s.shown_at is not null
   and not exists(select 1 from public.room_states r where r.engagement_id=p_engagement and r.live_session_id is not null)
  order by shown_at desc nulls first limit 1),
 near as (
  select s.options from anchor a join public.sessions s on s.id=a.id
  union all (select s.options from public.sessions s left join anchor a on true where s.engagement_id=p_engagement and not s.deleted and s.mode='live'
   and (a.id is null or (private.part_order(s.part),s.position,s.id)>(private.part_order(a.part),a.position,a.id))
   order by private.part_order(s.part),s.position,s.id limit 3)
  union all select jsonb_build_object('images',private.home_loop(p_engagement)->'images')
   where exists(select 1 from public.room_states r where r.engagement_id=p_engagement and r.live_session_id is null))
 select coalesce(jsonb_agg(distinct i.id),'[]'::jsonb) from near n cross join lateral unnest(private.step_image_ids(n.options)) u(id)
  join private.engagement_images i on i.id=u.id and i.engagement_id=p_engagement and not i.deleted and i.uploaded_at is not null
$$;

alter function private.live_public_state(uuid) rename to live_public_state_pre_loop;
create function private.live_public_state(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when b ? 'state' then jsonb_set(jsonb_set(b,'{state,screen_started_at}',to_jsonb(r.screen_started_at)),'{state,home}',
   case when jsonb_array_length(coalesce(h->'images','[]'::jsonb))>0 then h-'title' else 'null'::jsonb end) else b end
  from (select private.live_public_state_pre_loop(p_engagement) b) x
  left join public.room_states r on r.engagement_id=p_engagement and not r.deleted
  left join lateral (select private.home_loop(p_engagement) h) y on true
$$;
revoke all on function private.live_public_state(uuid),private.live_public_state_pre_loop(uuid) from public,anon,authenticated;

commit;
