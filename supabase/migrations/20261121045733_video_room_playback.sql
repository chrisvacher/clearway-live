begin;
alter table public.room_states add column media jsonb, add column media_preview_session uuid;

create function private.media_position(media jsonb, at_time timestamptz) returns double precision
language sql immutable set search_path='' as $$
 select coalesce((media->>'position')::double precision,0)+
   case when media->>'playing'='true' then greatest(0,extract(epoch from at_time-(media->>'at')::timestamptz)) else 0 end
$$;

create function private.video_follows_live_step() returns trigger
language plpgsql security definer set search_path='' as $$
declare clip jsonb;
begin
 if new.live_session_id is distinct from old.live_session_id then
  select options->'video' into clip from public.sessions
   where id=new.live_session_id and engagement_id=new.engagement_id and interaction='video' and not deleted;
  new.media:=case when clip is not null then jsonb_build_object('session',new.live_session_id,'playing',true,'position',(clip->>'start')::double precision,'at',clock_timestamp()) else null end;
  if new.media_preview_session=new.live_session_id then new.media_preview_session:=null; end if;
 end if;
 if new.deleted or exists(select 1 from public.engagements e where e.id=new.engagement_id and e.status='closed') then
  new.media:=null; new.media_preview_session:=null;
 end if;
 return new;
end $$;
create trigger video_follows_live_step before update of live_session_id,deleted on public.room_states
 for each row execute function private.video_follows_live_step();

alter function private.live_public_state(uuid) rename to live_public_state_pre_video;
create function private.live_public_state(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare payload jsonb; r public.room_states; preload jsonb;
begin
 payload:=private.live_public_state_pre_video(p_engagement);
 if payload is null or not (payload?'state') then return payload; end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 select jsonb_build_object('session',id,'video',options->'video') into preload from public.sessions
 where id=r.media_preview_session and engagement_id=p_engagement and interaction='video' and options?'video' and not deleted;
 return jsonb_set(payload,'{state}',(payload->'state')||jsonb_build_object('media',r.media,'media_preload',preload));
end $$;

alter function private.room_control(uuid,uuid,text,jsonb) rename to room_control_pre_video;
create function private.room_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; done private.room_controls; clip jsonb; playback jsonb; sid uuid; moment timestamptz; pos double precision;
 start_at double precision; stop_at double precision; playing boolean; actor_name text;
begin
 if coalesce(p_action,'') not in ('media_play','media_pause','media_seek','media_restart','media_preview') then
  return private.room_control_pre_video(p_engagement,p_id,p_action,p);
 end if;
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or private.remote_actor(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 if p_id is null or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>p_action then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','version',r.version);
 end if;
 if p_action='media_preview' then
  if not (p?'session') or p-'session'<>'{}'::jsonb then return jsonb_build_object('status','invalid_request'); end if;
  sid:=(p->>'session')::uuid;
  if sid is not null and not exists(select 1 from public.sessions where id=sid and engagement_id=p_engagement and interaction='video' and options?'video' and not deleted) then
   return jsonb_build_object('status','missing');
  end if;
  if sid is not distinct from r.media_preview_session then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update public.room_states set media_preview_session=sid where engagement_id=p_engagement returning * into r;
 else
  if not (p?'from') or (p->>'from')::uuid is distinct from r.live_session_id then return jsonb_build_object('status','moved','version',r.version); end if;
  if r.media is null or r.tv_content<>'session' then return jsonb_build_object('status','invalid_state'); end if;
  select options->'video' into clip from public.sessions where id=r.live_session_id and interaction='video' and not deleted;
  if clip is null then return jsonb_build_object('status','invalid_state'); end if;
  moment:=clock_timestamp(); start_at:=(clip->>'start')::double precision;
  stop_at:=least((clip->>'end')::double precision,(r.media->>'duration')::double precision);
  pos:=least(private.media_position(r.media,moment),stop_at); playing:=r.media->>'playing'='true';
  if p_action='media_seek' then
   if jsonb_typeof(p->'position') is distinct from 'number' or p-'from'-'position'<>'{}'::jsonb or (p->>'position')::double precision not between 0 and 86400 then
    return jsonb_build_object('status','invalid_request');
   end if;
   pos:=greatest(start_at,least((p->>'position')::double precision,stop_at));
  elsif p-'from'<>'{}'::jsonb then return jsonb_build_object('status','invalid_request');
  elsif p_action='media_restart' then pos:=start_at; playing:=true;
  elsif p_action='media_play' then
   if playing then return jsonb_build_object('status','unchanged','version',r.version); end if;
   if stop_at is not null and pos>=stop_at then pos:=start_at; end if;
   playing:=true;
  elsif p_action='media_pause' then
   if not playing then return jsonb_build_object('status','unchanged','version',r.version); end if;
   playing:=false;
  end if;
  playback:=r.media||jsonb_build_object('position',pos,'playing',playing,'at',moment);
  update public.room_states set media=playback where engagement_id=p_engagement returning * into r;
 end if;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at)
 values(p_id,p_engagement,private.clearway_user_id(),p_action,r.live_session_id,r.version,clock_timestamp());
 select split_part(btrim(name),' ',1) into actor_name from public.clearway_users where id=private.clearway_user_id();
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action',p_action,'by',actor_name,'version',r.version,'changed',true));
 return jsonb_build_object('status','ok','version',r.version);
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('status','invalid_request');
end $$;

create function private.video_tick(p_engagement uuid,p_session uuid,p_at timestamptz,p_duration double precision,p_sound_blocked boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; step public.sessions; target public.sessions; clip jsonb; playback jsonb; stop_at double precision;
 keys text[]; hidden uuid[]; moment timestamptz:=clock_timestamp();
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.live_role(p_engagement) in ('tv','facilitator'),false) then return jsonb_build_object('status','denied'); end if;
 if r.live_session_id is distinct from p_session or r.media is null or (r.media->>'at')::timestamptz is distinct from p_at then
  return jsonb_build_object('status','unchanged','version',r.version);
 end if;
 if p_duration is not null and (p_duration='NaN'::double precision or p_duration not between 0.01 and 86400) then return jsonb_build_object('status','invalid_request'); end if;
 select * into step from public.sessions where id=p_session and interaction='video' and not deleted for update;
 clip:=step.options->'video'; if clip is null then return jsonb_build_object('status','invalid_state'); end if;
 playback:=r.media;
 if p_duration is not null then playback:=playback||jsonb_build_object('duration',p_duration); end if;
 if p_sound_blocked is not null and clip->>'sound'='true' then playback:=playback||jsonb_build_object('sound_blocked',p_sound_blocked); end if;
 stop_at:=least((clip->>'end')::double precision,(playback->>'duration')::double precision);
 if playback->>'playing'='true' and stop_at is not null and private.media_position(playback,moment)>=stop_at then
  -- Same ordering and eligibility as Next. Only a paired screen with the current expired media state reaches this branch.
  if clip->>'ends'='next' then
   select * into target from public.sessions s where s.engagement_id=p_engagement and not s.deleted and s.mode='live' and s.state<>'draft'
    and (private.part_order(s.part),s.position,s.id)>(private.part_order(step.part),step.position,step.id)
   order by private.part_order(s.part),s.position,s.id limit 1 for update;
  end if;
  if target.id is not null then
   update public.sessions set state='open' where id=step.id and state in ('live','phones_down');
   update public.sessions set state=case when state='closed' then 'closed' else 'live' end,shown_at=moment where id=target.id;
   keys:=coalesce(target.hidden_keys,array[]::text[]);
   select coalesce(array_agg(x.id order by x.id),array[]::uuid[]) into hidden from public.submissions x where x.session_id=target.id and x.hidden and not x.deleted;
   update public.room_states set live_session_id=target.id,tv_content='session',phones_down=false,burst_ends_at=null,
     spotlight_key=null,hidden_keys=keys,hidden_ids=hidden,results=private.live_results_for(p_engagement,target.id,keys)
    where engagement_id=p_engagement returning * into r;
   insert into private.room_controls(id,engagement_id,action,session_id,room_version,created_at)
    values(gen_random_uuid(),p_engagement,'media_ended',target.id,r.version,moment);
   return jsonb_build_object('status','ok','version',r.version);
  end if;
  playback:=playback||jsonb_build_object('playing',false,'position',stop_at,'at',moment);
 end if;
 if playback=r.media then return jsonb_build_object('status','unchanged','version',r.version); end if;
 update public.room_states set media=playback where engagement_id=p_engagement returning * into r;
 return jsonb_build_object('status','ok','version',r.version);
end $$;
create function public.video_tick(p_engagement uuid,p_session uuid,p_at timestamptz,p_duration double precision,p_sound_blocked boolean) returns jsonb
language sql security invoker set search_path='' as $$ select private.video_tick(p_engagement,p_session,p_at,p_duration,p_sound_blocked) $$;

revoke all on function private.media_position(jsonb,timestamptz),private.video_follows_live_step(),private.live_public_state(uuid),private.live_public_state_pre_video(uuid),
 private.room_control(uuid,uuid,text,jsonb),private.room_control_pre_video(uuid,uuid,text,jsonb),private.video_tick(uuid,uuid,timestamptz,double precision,boolean),
 public.video_tick(uuid,uuid,timestamptz,double precision,boolean) from public,anon,authenticated;
grant execute on function private.room_control(uuid,uuid,text,jsonb),private.video_tick(uuid,uuid,timestamptz,double precision,boolean),
 public.video_tick(uuid,uuid,timestamptz,double precision,boolean) to authenticated;
commit;
