begin;

create table private.engagement_videos (
 id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 path text not null unique check (length(path) <= 200),
 mime text not null check (mime in ('video/mp4','video/quicktime')),
 bytes integer not null check (bytes between 1 and 524288000),
 name text not null default '' check (length(name) <= 200),
 duration double precision check (duration between 0.01 and 86400),
 width integer check (width between 1 and 16384),
 height integer check (height between 1 and 16384),
 created_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 uploaded_at timestamptz,
 deleted boolean not null default false,
 purged_at timestamptz
);
create index engagement_videos_engagement_idx on private.engagement_videos(engagement_id) where not deleted;
alter table private.engagement_videos enable row level security;
alter table private.engagement_videos force row level security;
revoke all on private.engagement_videos from public,anon,authenticated;
grant select,insert,update,delete on private.engagement_videos to service_role;
create trigger touch_record before update on private.engagement_videos for each row execute function private.touch_live_record('id');

create function private.engagement_videos_setup() returns text
language plpgsql security definer set search_path='' as $$
begin
 if to_regclass('storage.buckets') is null then return 'storage not started'; end if;
 execute $sql$insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('engagement-videos','engagement-videos',false,524288000,array['video/mp4','video/quicktime'])
  on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types$sql$;
 return 'ready';
end $$;
revoke all on function private.engagement_videos_setup() from public,anon,authenticated;
grant execute on function private.engagement_videos_setup() to service_role;
do $$ begin perform private.engagement_videos_setup();
exception when others then raise notice 'Storage setup skipped: %',sqlerrm; end $$;

create function private.video_public(i private.engagement_videos) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',i.id,'name',i.name,'mime',i.mime,'bytes',i.bytes,'width',i.width,'height',i.height,'duration',i.duration,'created_at',i.created_at)
$$;

-- Record an video before its bytes are put in Storage. The same id again is the same video (a retried upload).
create function private.video_begin(p_engagement uuid,p_id uuid,p_name text,p_mime text,p_bytes integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cur private.engagement_videos; ext text;
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_mime is null or p_mime not in ('video/mp4','video/quicktime') then return jsonb_build_object('status','invalid_type'); end if;
 if p_bytes is null or p_bytes<1 or p_bytes>524288000 then return jsonb_build_object('status','too_large'); end if;
 select * into cur from private.engagement_videos where id=p_id;
 if found then
  if cur.engagement_id<>p_engagement or cur.deleted then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','ok','path',cur.path,'uploaded',cur.uploaded_at is not null);
 end if;
 if (select count(*) from private.engagement_videos where engagement_id=p_engagement and not deleted)>=500 then return jsonb_build_object('status','full'); end if;
 ext:=case p_mime when 'video/mp4' then 'mp4' else 'mov' end;
 insert into private.engagement_videos(id,engagement_id,path,mime,bytes,name,created_by)
  values(p_id,p_engagement,p_engagement::text||'/'||p_id::text||'.'||ext,p_mime,p_bytes,left(btrim(coalesce(p_name,'')),200),private.clearway_user_id())
  returning * into cur;
 return jsonb_build_object('status','ok','path',cur.path,'uploaded',false);
end $$;

-- The upload has finished: the object must be in the bucket, no larger than the limit. The browser measured its shape.
create function private.video_finish(p_engagement uuid,p_id uuid,p_width integer,p_height integer,p_duration double precision) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cur private.engagement_videos; size bigint;
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 select * into cur from private.engagement_videos where id=p_id and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','missing'); end if;
 if p_duration is null or p_duration='NaN'::double precision or p_duration not between 0.01 and 86400 then return jsonb_build_object('status','invalid_request'); end if;
 if p_width is null or p_height is null or p_width not between 1 and 16384 or p_height not between 1 and 16384 then return jsonb_build_object('status','invalid_request'); end if;
 if to_regclass('storage.objects') is null then return jsonb_build_object('status','unavailable'); end if;
 execute 'select coalesce((metadata->>''size'')::bigint,0) from storage.objects where bucket_id=''engagement-videos'' and name=$1' into size using cur.path;
 if size is null then return jsonb_build_object('status','not_uploaded'); end if;
 if size<>cur.bytes then return jsonb_build_object('status','invalid_size'); end if;
 if size>524288000 then return jsonb_build_object('status','too_large'); end if;
 update private.engagement_videos set width=p_width,height=p_height,duration=p_duration,bytes=greatest(1,size::integer),uploaded_at=coalesce(uploaded_at,now())
  where id=p_id returning * into cur;
 return jsonb_build_object('status','ok','video',private.video_public(cur));
end $$;

-- The engagement's uploaded videos, newest first, for the run of show.
create function private.video_list(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 return jsonb_build_object('status','ok','videos',coalesce((select jsonb_agg(private.video_public(i) order by i.created_at desc)
  from private.engagement_videos i where i.engagement_id=p_engagement and not i.deleted and i.uploaded_at is not null),'[]'::jsonb));
end $$;

-- Where an video is, for a reader of the room: its facilitators, its paired TV and its people. The server then signs the address.
create function private.video_read(p_engagement uuid,p_video uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cur private.engagement_videos;
begin
 if not coalesce(private.show_allowed(p_engagement),false) and private.live_role(p_engagement) is distinct from 'tv' then return jsonb_build_object('status','denied'); end if;
 select * into cur from private.engagement_videos where id=p_video and engagement_id=p_engagement and not deleted and uploaded_at is not null;
 if not found then return jsonb_build_object('status','missing'); end if;
 return jsonb_build_object('status','ok','path',cur.path,'mime',cur.mime);
end $$;

-- Images whose engagement is gone and whose files are still in Storage, for the operations job to remove.
create function private.video_purge_list(p_limit integer) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'path',path)),'[]'::jsonb) from (select id,path from private.engagement_videos
  where deleted and purged_at is null order by updated_at limit greatest(1,least(coalesce(p_limit,100),500))) x
$$;
create function private.video_purged(p_ids uuid[]) returns integer
language sql security definer set search_path='' as $$
 with u as (update private.engagement_videos set purged_at=now() where id=any(p_ids) and deleted and purged_at is null returning 1) select count(*)::integer from u
$$;

create function private.videos_follow_engagement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.deleted and not old.deleted then update private.engagement_videos set deleted=true where engagement_id=new.id and not deleted; end if;
 return new;
end $$;
create trigger videos_follow_engagement after update of deleted on public.engagements for each row execute function private.videos_follow_engagement();

revoke all on function private.video_public(private.engagement_videos) from public,anon,authenticated;
revoke all on function private.video_purge_list(integer),private.video_purged(uuid[]),private.videos_follow_engagement() from public,anon,authenticated;
grant execute on function private.video_purge_list(integer),private.video_purged(uuid[]) to service_role;
-- The operations sweep calls these with the service role, through the API.
create function public.video_purge_list(p_limit integer) returns jsonb language sql stable set search_path='' as $$ select private.video_purge_list(p_limit) $$;
create function public.video_purged(p_ids uuid[]) returns integer language sql set search_path='' as $$ select private.video_purged(p_ids) $$;
revoke all on function public.video_purge_list(integer),public.video_purged(uuid[]) from public,anon,authenticated;
grant execute on function public.video_purge_list(integer),public.video_purged(uuid[]) to service_role;

create function public.video_begin(p_engagement uuid,p_id uuid,p_name text,p_mime text,p_bytes integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.video_begin(p_engagement,p_id,p_name,p_mime,p_bytes) $$;
create function public.video_finish(p_engagement uuid,p_id uuid,p_width integer,p_height integer,p_duration double precision) returns jsonb
language sql security invoker set search_path='' as $$ select private.video_finish(p_engagement,p_id,p_width,p_height,p_duration) $$;
create function public.video_list(p_engagement uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.video_list(p_engagement) $$;
create function public.video_read(p_engagement uuid,p_video uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.video_read(p_engagement,p_video) $$;
revoke all on function private.video_begin(uuid,uuid,text,text,integer),private.video_finish(uuid,uuid,integer,integer,double precision),private.video_list(uuid),private.video_read(uuid,uuid),
 public.video_begin(uuid,uuid,text,text,integer),public.video_finish(uuid,uuid,integer,integer,double precision),public.video_list(uuid),public.video_read(uuid,uuid) from public,anon,authenticated;
grant execute on function private.video_begin(uuid,uuid,text,text,integer),private.video_finish(uuid,uuid,integer,integer,double precision),private.video_list(uuid),private.video_read(uuid,uuid),
 public.video_begin(uuid,uuid,text,text,integer),public.video_finish(uuid,uuid,integer,integer,double precision),public.video_list(uuid),public.video_read(uuid,uuid) to authenticated;

insert into private.interaction_kinds(kind,label,input,one_per_person,counts,structured,shares_answers,spotlight,named,position,private_ok)
values('video','Video',false,false,'none',true,false,'none','never',25,false);

create function private.options_video(p jsonb,p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v jsonb; source text; video_id uuid; link text; start_at numeric; end_at numeric; video_duration double precision;
begin
 if jsonb_typeof(p) is distinct from 'object' or p-'video'<>'{}'::jsonb then return null; end if;
 if not (p?'video') then return '{}'::jsonb; end if;
 v:=p->'video'; source:=v->>'source';
 if jsonb_typeof(v) is distinct from 'object' or coalesce(source,'') not in ('upload','link')
    or v-'source'-'id'-'url'-'start'-'end'-'ends'-'sound'<>'{}'::jsonb then return null; end if;
 if (v?'start' and jsonb_typeof(v->'start') is distinct from 'number') or
    (v?'end' and jsonb_typeof(v->'end') not in ('number','null')) or
    coalesce(v->>'ends','hold') not in ('hold','next') or
    (v?'sound' and jsonb_typeof(v->'sound') is distinct from 'boolean') then return null; end if;
 start_at:=coalesce((v->>'start')::numeric,0); end_at:=(v->>'end')::numeric;
 if start_at not between 0 and 86400 or end_at>86400 or end_at<=start_at then return null; end if;
 if source='upload' then
  if v?'url' or v->>'id' is null then return null; end if;
  video_id:=(v->>'id')::uuid;
  select f.duration into video_duration from private.engagement_videos f where f.id=video_id and f.engagement_id=p_engagement and not f.deleted and f.uploaded_at is not null;
  if not found or start_at>=video_duration or end_at>video_duration then return null; end if;
 else
  link:=v->>'url';
  if v?'id' or link is null or length(link)>2048 or link !~ '^https://((www\.|m\.)?youtube\.com/(watch\?[^#]*v=[A-Za-z0-9_-]{11}([&#]|$)|(embed|shorts|live)/[A-Za-z0-9_-]{11}([?#/]|$))|youtu\.be/[A-Za-z0-9_-]{11}([?#/]|$)|((www\.|player\.)?vimeo\.com)/(video/)?[0-9]{1,16}([?#/]|$))' then return null; end if;
 end if;
 return jsonb_build_object('video',jsonb_build_object('source',source,'start',start_at,'end',end_at,'ends',coalesce(v->>'ends','hold'),'sound',coalesce((v->>'sound')::boolean,true))
  ||case when source='upload' then jsonb_build_object('id',video_id) else jsonb_build_object('url',link) end);
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end $$;
revoke all on function private.options_video(jsonb,uuid) from public,anon,authenticated;

create function private.video_needs_clip() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.interaction='video' and new.state='ready' and not (new.options?'video') then new.state:='draft'; end if;
 return new;
end $$;
create trigger video_needs_clip before insert or update of state,options on public.sessions
 for each row execute function private.video_needs_clip();
revoke all on function private.video_needs_clip() from public,anon,authenticated;
commit;
