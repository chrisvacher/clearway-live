begin;

create function private.duplicate_show_summary(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',e.id,'title',e.title,'church',c.name,'date',coalesce(e.retreat_start_date,e.start_date),
   'steps',(select count(*) from public.sessions s where s.engagement_id=e.id and not s.deleted),
   'sections',(select count(distinct (s.part,s.section)) from public.sessions s where s.engagement_id=e.id and not s.deleted),
   'has_answers',exists(select 1 from public.submissions a join public.sessions s on s.id=a.session_id and not s.deleted where a.engagement_id=e.id),
   'live',exists(select 1 from public.room_states r where r.engagement_id=e.id and r.live_session_id is not null and not r.deleted))
 from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_id and not e.deleted
$$;

create function private.duplicate_show_options(p_source uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(private.show_allowed(p_source),false) then return jsonb_build_object('status','denied'); end if;
 return jsonb_build_object('status','ok','source',private.duplicate_show_summary(p_source),
  'targets',coalesce((select jsonb_agg(private.duplicate_show_summary(e.id) order by coalesce(e.retreat_start_date,e.start_date) desc nulls last,e.title,e.id)
   from public.engagements e where e.id<>p_source and e.type<>'practice' and not e.deleted and e.archived_at is null and e.status<>'closed'
    and private.show_allowed(e.id)),'[]'::jsonb));
end $$;

create function private.duplicate_show_guard(p_source uuid,p_target uuid,p_replace boolean) returns text
language plpgsql stable security definer set search_path='' as $$
begin
 if p_source=p_target or not coalesce(private.show_allowed(p_source),false) or not coalesce(private.show_allowed(p_target),false) then return 'denied'; end if;
 if not exists(select 1 from public.engagements where id=p_target and type<>'practice' and not deleted and status<>'closed' and archived_at is null) then return 'unavailable_target'; end if;
 if exists(select 1 from public.room_states where engagement_id=p_target and live_session_id is not null and not deleted) then return 'live'; end if;
 if not exists(select 1 from public.sessions where engagement_id=p_source and not deleted) then return 'empty'; end if;
 if p_replace and exists(select 1 from public.submissions a join public.sessions s on s.id=a.session_id and not s.deleted where a.engagement_id=p_target) then return 'has_answers'; end if;
 return 'ok';
end $$;

-- A plan carries only object paths already checked as belonging to the source engagement.
-- The server copies the bytes before the database transaction records and links them.
create function private.duplicate_show_files(p_source uuid)
returns table(id uuid,path text,bucket text)
language sql stable security definer set search_path='' as $$
 select i.id,i.path,'engagement-images' from private.engagement_images i
 where not i.deleted and i.uploaded_at is not null and i.engagement_id=p_source and exists(
  select 1 from public.sessions s where s.engagement_id=p_source and not s.deleted and i.id=any(private.step_image_ids(s.options)))
 union all
 select v.id,v.path,'engagement-videos' from private.engagement_videos v
 where not v.deleted and v.uploaded_at is not null and v.engagement_id=p_source and exists(
  select 1 from public.sessions s where s.engagement_id=p_source and not s.deleted and s.options#>>'{video,id}'=v.id::text)
$$;

create function private.duplicate_show_plan(p_source uuid,p_target uuid,p_replace boolean,p_media boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare allowed text;
begin
 allowed:=private.duplicate_show_guard(p_source,p_target,p_replace);
 if allowed<>'ok' then return jsonb_build_object('status',allowed); end if;
 return jsonb_build_object('status','ok','version',private.show_version(p_source),'target_version',private.show_version(p_target),
  'files',case when p_media then coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'path',f.path,'bucket',f.bucket)) from private.duplicate_show_files(p_source) f),'[]'::jsonb) else '[]'::jsonb end);
end $$;

create function private.duplicate_show_time(p_value timestamptz,p_source_date date,p_target_date date,p_source_zone text,p_target_zone text) returns timestamptz
language sql stable set search_path='' as $$
 select case when p_value is null or p_target_date is null then p_value else
  ((p_target_date+((p_value at time zone p_source_zone)::date-coalesce(p_source_date,(p_value at time zone p_source_zone)::date)))
     +(p_value at time zone p_source_zone)::time) at time zone p_target_zone end
$$;

create function private.duplicate_run_of_show(p_source uuid,p_target uuid,p_version text,p_target_version text,p_replace boolean,
 p_media boolean,p_times boolean,p_visibility boolean,p_files jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare allowed text; source_date date; target_date date; source_zone text; target_zone text; target_title text;
 prev int; n int:=0; s public.sessions; new_id uuid; steps jsonb; opts jsonb; old_id text; new_media uuid;
 file record; object_id uuid; dest text; loop_ids jsonb; before_id text; after_id text; seed_id uuid;
begin
 if p_source is null or p_target is null or p_replace is null or p_media is null or p_times is null or p_visibility is null
  or jsonb_typeof(p_files) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 -- All edits to either run of show take its room row before its sessions.
 perform 1 from public.room_states where engagement_id in (p_source,p_target) and not deleted order by engagement_id for update;
 allowed:=private.duplicate_show_guard(p_source,p_target,p_replace);
 if allowed<>'ok' then return jsonb_build_object('status',allowed); end if;
 if p_version is distinct from private.show_version(p_source) or p_target_version is distinct from private.show_version(p_target) then return jsonb_build_object('status','conflict'); end if;
 select coalesce(e.retreat_start_date,e.start_date),c.timezone into source_date,source_zone from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_source;
 select coalesce(e.retreat_start_date,e.start_date),c.timezone,e.title into target_date,target_zone,target_title from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_target;
 select coalesce(jsonb_object_agg(id,gen_random_uuid()),'{}'::jsonb) into steps from public.sessions where engagement_id=p_source and not deleted;

 if p_media then
  for file in select * from private.duplicate_show_files(p_source) loop
   object_id:=(p_files->>file.id::text)::uuid;
   if object_id is null then raise check_violation using message='A referenced file did not copy.'; end if;
   dest:=p_target::text||'/'||object_id::text||substring(file.path from '\.[A-Za-z0-9]+$');
   if not exists(select 1 from storage.objects where bucket_id=file.bucket and name=dest) then raise check_violation using message='The copied file was not found.'; end if;
   if file.bucket='engagement-images' then
    insert into private.engagement_images(id,engagement_id,path,mime,bytes,name,width,height,created_by,uploaded_at)
     select object_id,p_target,dest,i.mime,i.bytes,i.name,i.width,i.height,private.clearway_user_id(),clock_timestamp() from private.engagement_images i where i.id=file.id;
   else
    insert into private.engagement_videos(id,engagement_id,path,mime,bytes,name,width,height,duration,created_by,uploaded_at)
     select object_id,p_target,dest,v.mime,v.bytes,v.name,v.width,v.height,v.duration,private.clearway_user_id(),clock_timestamp() from private.engagement_videos v where v.id=file.id;
   end if;
  end loop;
 end if;
 if p_replace then
  update private.session_notes set deleted=true where engagement_id=p_target and not deleted;
  update public.sessions set deleted=true where engagement_id=p_target and not deleted;
 end if;
 select coalesce(max(position)+1,0) into prev from public.sessions where engagement_id=p_target and not deleted;
 for s in select * from public.sessions where engagement_id=p_source and not deleted order by private.part_order(part),position,id loop
  new_id:=(steps->>s.id::text)::uuid;
  opts:=s.options-'media'; new_media:=null;
  if not p_visibility then opts:=opts-'visibility'; end if;
  if s.interaction='form' then opts:=opts||'{"visibility":"private"}'::jsonb; end if;
  if not p_times then opts:=opts-'timer'; end if;
  if (opts#>>'{timer,through}') is not null then
   old_id:=opts#>>'{timer,through}';
   opts:=case when steps?old_id then jsonb_set(opts,'{timer,through}',steps->old_id) else opts#-'{timer,through}' end;
  end if;
  if not p_media then opts:=opts-'image'-'images'-'video';
  else
   if opts?'image' then
    old_id:=opts#>>'{image,id}';
    opts:=case when p_files?old_id then jsonb_set(opts,'{image,id}',p_files->old_id) else opts-'image' end;
   end if;
   if jsonb_typeof(opts->'images')='array' then
    select coalesce(jsonb_agg(p_files->ids.id order by ids.ordinality),'[]'::jsonb) into loop_ids
     from jsonb_array_elements_text(opts->'images') with ordinality ids(id,ordinality) where p_files?ids.id;
    opts:=jsonb_set(opts,'{images}',loop_ids);
   end if;
   if opts#>>'{video,source}'='upload' then
    old_id:=opts#>>'{video,id}';
    opts:=case when p_files?old_id then jsonb_set(opts,'{video,id}',p_files->old_id) else opts-'video' end;
   end if;
  end if;
  if s.interaction='before_after' and opts->>'mode'='steps' then
   before_id:=steps->>(opts->>'before_session'); after_id:=steps->>(opts->>'after_session');
   if before_id is null or after_id is null then opts:=(opts-'before_session'-'after_session')||'{"mode":"paired"}'::jsonb;
   else opts:=opts||jsonb_build_object('before_session',before_id,'after_session',after_id); end if;
  end if;
  -- Seed references are restored after all of the new steps exist, including forward references.
  insert into public.sessions(id,engagement_id,title,part,position,section,segment,planned_start,planned_minutes,
    mode,opens_at,closes_at,interaction,prompt,phone_depth,state,max_sends,max_characters,max_words,settings,options,lands_in,team_led)
  values(new_id,p_target,s.title,s.part,prev+n,s.section,s.segment,
    case when p_times then private.duplicate_show_time(s.planned_start,source_date,target_date,source_zone,target_zone) end,s.planned_minutes,
    s.mode,private.duplicate_show_time(s.opens_at,source_date,target_date,source_zone,target_zone),private.duplicate_show_time(s.closes_at,source_date,target_date,source_zone,target_zone),
    s.interaction,s.prompt,s.phone_depth,'draft',s.max_sends,s.max_characters,s.max_words,s.settings,opts,s.lands_in,s.team_led);
  insert into private.session_notes(session_id,engagement_id,notes) select new_id,p_target,notes from private.session_notes where session_id=s.id and not deleted;
  if p_media and s.options?'media' then
   insert into private.session_media(engagement_id,session_id,mime,width,height,data)
    select p_target,new_id,mime,width,height,data from private.session_media where id::text=s.options->>'media' and session_id=s.id and not deleted returning id into new_media;
   if new_media is not null then update public.sessions set options=options||jsonb_build_object('media',new_media) where id=new_id; end if;
  end if;
  n:=n+1;
 end loop;
 for s in select * from public.sessions where engagement_id=p_source and not deleted and seeded_from is not null loop
  seed_id:=(steps->>s.seeded_from::text)::uuid;
  if seed_id is not null then update public.sessions set seeded_from=seed_id where id=(steps->>s.id::text)::uuid; end if;
 end loop;
 return jsonb_build_object('status','ok','id',p_target,'title',target_title,'copied',n);
exception when check_violation or unique_violation or invalid_text_representation then
 return jsonb_build_object('status','invalid_request');
end $$;

-- The new event's ID is reserved by the caller before Storage copies its files.
-- Its shell and the run of show then commit together.
create function private.duplicate_event_plan(p_source uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_admin() then return jsonb_build_object('status','denied'); end if;
 if not exists(select 1 from public.engagements where id=p_source and not deleted and type<>'practice') then
  return jsonb_build_object('status','missing');
 end if;
 return jsonb_build_object('status','ok','version',private.show_version(p_source),'files',
  coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'path',f.path,'bucket',f.bucket))
   from private.duplicate_show_files(p_source) f),'[]'::jsonb));
end $$;

create function private.duplicate_event_with_media(p_source uuid,p_target uuid,p_version text,p_files jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare source public.engagements; outcome jsonb;
begin
 if auth.uid() is null or not private.is_admin() then return jsonb_build_object('status','denied'); end if;
 select * into source from public.engagements where id=p_source and not deleted and type<>'practice';
 if not found then return jsonb_build_object('status','missing'); end if;
 perform 1 from public.room_states where engagement_id=p_source and not deleted for update;
 if p_version is distinct from private.show_version(p_source) then return jsonb_build_object('status','conflict'); end if;
 insert into public.engagements(id,church_id,team_hub_client_id,title,type,base_year,lens_names,settings,how_the_room_decides,skin)
 values(p_target,source.church_id,source.team_hub_client_id,left(source.title,193)||' (copy)',source.type,source.base_year,source.lens_names,
  source.settings,source.how_the_room_decides,source.skin);
 insert into public.engagement_facilitators(engagement_id,clearway_user_id,role) values(p_target,private.clearway_user_id(),'lead');
 if not exists(select 1 from public.sessions where engagement_id=p_source and not deleted) then
  return jsonb_build_object('status','ok','id',p_target,'copied',0);
 end if;
 outcome:=private.duplicate_run_of_show(p_source,p_target,p_version,private.show_version(p_target),false,true,true,true,p_files);
 if outcome->>'status'='ok' then return outcome; end if;
 raise check_violation using message=coalesce(outcome->>'status','invalid_request');
exception when check_violation or unique_violation then
 return jsonb_build_object('status',coalesce(outcome->>'status','invalid_request'));
end $$;

create function public.duplicate_show_options(p_source uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.duplicate_show_options(p_source) $$;
create function public.duplicate_show_plan(p_source uuid,p_target uuid,p_replace boolean,p_media boolean) returns jsonb language sql stable security invoker set search_path='' as $$ select private.duplicate_show_plan(p_source,p_target,p_replace,p_media) $$;
create function public.duplicate_run_of_show(p_source uuid,p_target uuid,p_version text,p_target_version text,p_replace boolean,p_media boolean,p_times boolean,p_visibility boolean,p_files jsonb)
 returns jsonb language sql security invoker set search_path='' as $$ select private.duplicate_run_of_show(p_source,p_target,p_version,p_target_version,p_replace,p_media,p_times,p_visibility,p_files) $$;
create function public.duplicate_event_plan(p_source uuid) returns jsonb
 language sql stable security invoker set search_path='' as $$ select private.duplicate_event_plan(p_source) $$;
create function public.duplicate_event_with_media(p_source uuid,p_target uuid,p_version text,p_files jsonb) returns jsonb
 language sql security invoker set search_path='' as $$ select private.duplicate_event_with_media(p_source,p_target,p_version,p_files) $$;

revoke all on function private.duplicate_show_summary(uuid),private.duplicate_show_options(uuid),private.duplicate_show_guard(uuid,uuid,boolean),private.duplicate_show_files(uuid),
 private.duplicate_show_plan(uuid,uuid,boolean,boolean),private.duplicate_show_time(timestamptz,date,date,text,text),
 private.duplicate_run_of_show(uuid,uuid,text,text,boolean,boolean,boolean,boolean,jsonb),public.duplicate_show_options(uuid),
 public.duplicate_show_plan(uuid,uuid,boolean,boolean),public.duplicate_run_of_show(uuid,uuid,text,text,boolean,boolean,boolean,boolean,jsonb),
 private.duplicate_event_plan(uuid),public.duplicate_event_plan(uuid),
 private.duplicate_event_with_media(uuid,uuid,text,jsonb),public.duplicate_event_with_media(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.duplicate_show_options(uuid),private.duplicate_show_plan(uuid,uuid,boolean,boolean),
 private.duplicate_run_of_show(uuid,uuid,text,text,boolean,boolean,boolean,boolean,jsonb),public.duplicate_show_options(uuid),
 public.duplicate_show_plan(uuid,uuid,boolean,boolean),public.duplicate_run_of_show(uuid,uuid,text,text,boolean,boolean,boolean,boolean,jsonb),
 private.duplicate_event_plan(uuid),public.duplicate_event_plan(uuid),
 private.duplicate_event_with_media(uuid,uuid,text,jsonb),public.duplicate_event_with_media(uuid,uuid,text,jsonb) to authenticated;
commit;
