-- Batch 1 (November 15): image uploads, deck images to slides (TC-2) and one image per step (TC-3).
--
-- 1. Images live in a private Storage bucket, `engagement-images`, one folder per engagement. The facilitator's browser puts
--    the bytes straight into Storage through a signed upload address (a 20 MB image can't pass through a Vercel function), and
--    the TV, phones and control surface read them through short-lived signed addresses made on the server after image_read
--    has checked the reader. There are no storage policies: only the service role touches the bucket.
-- 2. private.engagement_images records each image: its engagement, path, type, size and shape. image_begin records it before
--    the upload, image_finish checks the object really landed and records its width and height.
-- 3. Every step's options may carry `image` ({id, display: fill or place}) and `untitled` (the run of show shows an untyped
--    title greyed). session_options checks these for every kind, then hands the rest to the kind's own options function.
--    Fill is for content screens; interaction steps get In place only, because the live results need the screen.
-- 4. A deleted engagement's images are marked deleted with it. The files are removed by the operations job (image_purge_list).
begin;

create table private.engagement_images (
 id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 path text not null unique check (length(path) <= 200),
 mime text not null check (mime in ('image/png','image/jpeg','image/webp')),
 bytes integer not null check (bytes between 1 and 20971520),
 name text not null default '' check (length(name) <= 200),
 width integer check (width between 1 and 16384),
 height integer check (height between 1 and 16384),
 created_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 uploaded_at timestamptz,
 deleted boolean not null default false,
 purged_at timestamptz
);
create index engagement_images_engagement_idx on private.engagement_images(engagement_id) where not deleted;
alter table private.engagement_images enable row level security;
alter table private.engagement_images force row level security;
revoke all on private.engagement_images from public,anon,authenticated;
grant select,insert,update,delete on private.engagement_images to service_role;
create trigger touch_record before update on private.engagement_images for each row execute function private.touch_live_record('id');

create function private.engagement_images_setup() returns text
language plpgsql security definer set search_path='' as $$
begin
 if to_regclass('storage.buckets') is null then return 'storage not started'; end if;
 execute $sql$insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('engagement-images','engagement-images',false,20971520,array['image/png','image/jpeg','image/webp'])
  on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types$sql$;
 return 'ready';
end $$;
revoke all on function private.engagement_images_setup() from public,anon,authenticated;
grant execute on function private.engagement_images_setup() to service_role;
do $$ begin perform private.engagement_images_setup();
exception when others then raise notice 'Storage setup skipped: %',sqlerrm; end $$;

create function private.image_public(i private.engagement_images) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',i.id,'name',i.name,'mime',i.mime,'bytes',i.bytes,'width',i.width,'height',i.height,'created_at',i.created_at)
$$;

-- Record an image before its bytes are put in Storage. The same id again is the same image (a retried upload).
create function public.image_begin(p_engagement uuid,p_id uuid,p_name text,p_mime text,p_bytes integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cur private.engagement_images; ext text;
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_mime is null or p_mime not in ('image/png','image/jpeg','image/webp') then return jsonb_build_object('status','invalid_type'); end if;
 if p_bytes is null or p_bytes<1 or p_bytes>20971520 then return jsonb_build_object('status','too_large'); end if;
 select * into cur from private.engagement_images where id=p_id;
 if found then
  if cur.engagement_id<>p_engagement or cur.deleted then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','ok','path',cur.path,'uploaded',cur.uploaded_at is not null);
 end if;
 if (select count(*) from private.engagement_images where engagement_id=p_engagement and not deleted)>=500 then return jsonb_build_object('status','full'); end if;
 ext:=case p_mime when 'image/png' then 'png' when 'image/jpeg' then 'jpg' else 'webp' end;
 insert into private.engagement_images(id,engagement_id,path,mime,bytes,name,created_by)
  values(p_id,p_engagement,p_engagement::text||'/'||p_id::text||'.'||ext,p_mime,p_bytes,left(btrim(coalesce(p_name,'')),200),private.clearway_user_id())
  returning * into cur;
 return jsonb_build_object('status','ok','path',cur.path,'uploaded',false);
end $$;

-- The upload has finished: the object must be in the bucket, no larger than the limit. The browser measured its shape.
create function public.image_finish(p_engagement uuid,p_id uuid,p_width integer,p_height integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cur private.engagement_images; size bigint;
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 select * into cur from private.engagement_images where id=p_id and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','missing'); end if;
 if p_width is null or p_height is null or p_width not between 1 and 16384 or p_height not between 1 and 16384 then return jsonb_build_object('status','invalid_request'); end if;
 if to_regclass('storage.objects') is null then return jsonb_build_object('status','unavailable'); end if;
 execute 'select coalesce((metadata->>''size'')::bigint,0) from storage.objects where bucket_id=''engagement-images'' and name=$1' into size using cur.path;
 if size is null then return jsonb_build_object('status','not_uploaded'); end if;
 if size>20971520 then return jsonb_build_object('status','too_large'); end if;
 update private.engagement_images set width=p_width,height=p_height,bytes=greatest(1,size::integer),uploaded_at=coalesce(uploaded_at,now())
  where id=p_id returning * into cur;
 return jsonb_build_object('status','ok','image',private.image_public(cur));
end $$;

-- The engagement's uploaded images, newest first, for the run of show.
create function public.image_list(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 return jsonb_build_object('status','ok','images',coalesce((select jsonb_agg(private.image_public(i) order by i.created_at desc)
  from private.engagement_images i where i.engagement_id=p_engagement and not i.deleted and i.uploaded_at is not null),'[]'::jsonb));
end $$;

-- Where an image is, for a reader of the room: its facilitators, its paired TV and its people. The server then signs the address.
create function public.image_read(p_engagement uuid,p_image uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cur private.engagement_images;
begin
 if not coalesce(private.show_allowed(p_engagement),false) and private.live_role(p_engagement) is null then return jsonb_build_object('status','denied'); end if;
 select * into cur from private.engagement_images where id=p_image and engagement_id=p_engagement and not deleted and uploaded_at is not null;
 if not found then return jsonb_build_object('status','missing'); end if;
 return jsonb_build_object('status','ok','path',cur.path,'mime',cur.mime);
end $$;

-- Images whose engagement is gone and whose files are still in Storage, for the operations job to remove.
create function private.image_purge_list(p_limit integer) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'path',path)),'[]'::jsonb) from (select id,path from private.engagement_images
  where deleted and purged_at is null order by updated_at limit greatest(1,least(coalesce(p_limit,100),500))) x
$$;
create function private.image_purged(p_ids uuid[]) returns integer
language sql security definer set search_path='' as $$
 with u as (update private.engagement_images set purged_at=now() where id=any(p_ids) and deleted and purged_at is null returning 1) select count(*)::integer from u
$$;

create function private.images_follow_engagement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.deleted and not old.deleted then update private.engagement_images set deleted=true where engagement_id=new.id and not deleted; end if;
 return new;
end $$;
create trigger images_follow_engagement after update of deleted on public.engagements for each row execute function private.images_follow_engagement();

revoke all on function private.image_public(private.engagement_images) from public,anon,authenticated;
revoke all on function public.image_begin(uuid,uuid,text,text,integer),public.image_finish(uuid,uuid,integer,integer),public.image_list(uuid),public.image_read(uuid,uuid) from public,anon;
grant execute on function public.image_begin(uuid,uuid,text,text,integer),public.image_finish(uuid,uuid,integer,integer),public.image_list(uuid),public.image_read(uuid,uuid) to authenticated;
revoke all on function private.image_purge_list(integer),private.image_purged(uuid[]),private.images_follow_engagement() from public,anon,authenticated;
grant execute on function private.image_purge_list(integer),private.image_purged(uuid[]) to service_role;
-- The operations sweep calls these with the service role, through the API.
create function public.image_purge_list(p_limit integer) returns jsonb language sql stable set search_path='' as $$ select private.image_purge_list(p_limit) $$;
create function public.image_purged(p_ids uuid[]) returns integer language sql set search_path='' as $$ select private.image_purged(p_ids) $$;
revoke all on function public.image_purge_list(integer),public.image_purged(uuid[]) from public,anon,authenticated;
grant execute on function public.image_purge_list(integer),public.image_purged(uuid[]) to service_role;

-- An image on a step, checked the same way for every kind. A content screen may fill the TV with it; anything else shows it in place.
create function private.step_image(p jsonb,p_kind text,p_screen text,p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare id uuid; display text;
begin
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p) k where k not in ('id','display'))>0 then return null; end if;
 if jsonb_typeof(p->'id') is distinct from 'string' or p->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
 select i.id into id from private.engagement_images i where i.id=(p->>'id')::uuid and i.engagement_id=p_engagement and not i.deleted and i.uploaded_at is not null;
 if id is null then return null; end if;
 display:=coalesce(p->>'display',case when p_kind='content' then 'fill' else 'place' end);
 if display not in ('fill','place') then return null; end if;
 -- The Image screen always fills; interaction steps only ever show it in place; a screen check has no image.
 if p_kind='content' and p_screen='image' then display:='fill'; end if;
 if p_kind<>'content' and display='fill' then return null; end if;
 if p_kind='content' and p_screen='screen_check' then return null; end if;
 return jsonb_build_object('id',id,'display',display);
end $$;
revoke all on function private.step_image(jsonb,text,text,uuid) from public,anon,authenticated;

alter function private.session_options(text,jsonb,uuid) rename to session_options_pre_image;
create function private.session_options(p_kind text,p jsonb,p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare rest jsonb:=coalesce(p,'{}'::jsonb); out jsonb; img jsonb;
begin
 if jsonb_typeof(rest)<>'object' then return private.session_options_pre_image(p_kind,p,p_engagement); end if;
 if rest ? 'untitled' and jsonb_typeof(rest->'untitled')<>'boolean' then return null; end if;
 out:=private.session_options_pre_image(p_kind,rest-'image'-'untitled',p_engagement);
 if out is null then return null; end if;
 if rest ? 'image' and jsonb_typeof(rest->'image')<>'null' then
  img:=private.step_image(rest->'image',p_kind,case when p_kind='content' then coalesce(out->>'screen','headline') end,p_engagement);
  if img is null then return null; end if;
  out:=out||jsonb_build_object('image',img);
 end if;
 if coalesce((rest->>'untitled')::boolean,false) then out:=out||'{"untitled":true}'::jsonb; end if;
 return out;
end $$;
revoke all on function private.session_options(text,jsonb,uuid) from public,anon,authenticated;
revoke all on function private.session_options_pre_image(text,jsonb,uuid) from public,anon,authenticated;

-- The TV loads the images it will soon need before they go live: those on the live step and the next three in run order
-- (or, with nothing live, the three after the step shown last). Ids only; each is read through image_read like any other.
create function private.step_image_ids(o jsonb) returns uuid[]
language sql immutable set search_path='' as $$
 select coalesce(array_agg(distinct x.id),array[]::uuid[]) from (
  select (o#>>'{image,id}')::uuid id where o#>>'{image,id}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union all select (v#>>'{}')::uuid from jsonb_array_elements(case when jsonb_typeof(o->'images')='array' then o->'images' else '[]'::jsonb end) v
   where v#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') x
$$;
create function private.image_preload(p_engagement uuid) returns jsonb
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
   order by private.part_order(s.part),s.position,s.id limit 3))
 select coalesce(jsonb_agg(distinct i.id),'[]'::jsonb) from near n cross join lateral unnest(private.step_image_ids(n.options)) u(id)
  join private.engagement_images i on i.id=u.id and i.engagement_id=p_engagement and not i.deleted and i.uploaded_at is not null
$$;
revoke all on function private.step_image_ids(jsonb),private.image_preload(uuid) from public,anon,authenticated;

alter function private.live_public_state(uuid) rename to live_public_state_pre_images;
create function private.live_public_state(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when b ? 'state' then jsonb_set(b,'{state,preload}',private.image_preload(p_engagement)) else b end
  from (select private.live_public_state_pre_images(p_engagement) b) x
$$;
revoke all on function private.live_public_state(uuid),private.live_public_state_pre_images(uuid) from public,anon,authenticated;

commit;
