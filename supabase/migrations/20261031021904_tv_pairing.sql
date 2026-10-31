-- Milestone 2, PR 3: a separate, persistent and revocable TV surface.
-- Live only, after merge. No pairing, Auth user or live session is created here.
begin;
alter table public.engagements add column room_code text not null default upper(left(replace(gen_random_uuid()::text,'-',''),8)) check(room_code ~ '^[A-F0-9]{8}$');
create unique index engagements_room_code_unique on public.engagements(room_code);
alter table private.room_transport add column presence_hash text not null default '';

create table private.tv_devices (
 id uuid primary key, proof text not null check(proof ~ '^[a-f0-9]{64}$'),
 code_hash text check(code_hash ~ '^[a-f0-9]{64}$'), code_expires_at timestamptz,
 engagement_id uuid references public.engagements(id), label text not null default 'TV' check(length(label) between 1 and 80),
 browser text not null default '' check(length(browser)<=80), paired_at timestamptz,
 claim_id uuid, claim_started_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted boolean not null default false
);
create unique index tv_devices_code_idx on private.tv_devices(code_hash) where code_hash is not null and not deleted;
create index tv_devices_engagement_idx on private.tv_devices(engagement_id);
alter table private.live_tv_sessions add column device_id uuid references private.tv_devices(id);
create index live_tv_sessions_device_idx on private.live_tv_sessions(device_id);
create unique index live_tv_sessions_device_active on private.live_tv_sessions(device_id) where device_id is not null and revoked_at is null and not deleted;
create table private.tv_limits (
 key text primary key check(length(key)<=160), window_at timestamptz not null default now(), hits integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted boolean not null default false
);
alter table private.tv_devices enable row level security;
alter table private.tv_devices force row level security;
alter table private.tv_limits enable row level security;
alter table private.tv_limits force row level security;
revoke all on private.tv_devices,private.tv_limits from public,anon,authenticated;
grant select,insert,update,delete on private.tv_devices,private.tv_limits to service_role;
create trigger touch_tv_device before update on private.tv_devices for each row execute function private.touch_live_record('id');
create trigger touch_tv_limit before update on private.tv_limits for each row execute function private.touch_live_record('key');

create function private.tv_limit(p_key text,p_max integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare count integer;
begin
 insert into private.tv_limits(key) values(p_key) on conflict(key) do update set
  hits=case when private.tv_limits.window_at<now()-make_interval(secs=>p_seconds) then 1 else least(private.tv_limits.hits+1,p_max+1) end,
  window_at=case when private.tv_limits.window_at<now()-make_interval(secs=>p_seconds) then now() else private.tv_limits.window_at end
 returning hits into count;
 return count<=p_max;
end $$;
revoke all on function private.tv_limit(text,integer,integer) from public,anon,authenticated;

-- Only public identity, presentation preferences and first names. No roster email,
-- attendee id, proof, pairing secret, planned time, depth or presenter notes.
create function private.tv_room_info(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with present as (
  select a.id,split_part(btrim(a.name),' ',1) as name,min(d.created_at) as arrived
  from public.attendees a join public.device_sessions d on d.attendee_id=a.id and d.engagement_id=a.engagement_id
  where a.engagement_id=p_engagement and not a.deleted and a.verified_at is not null and not d.deleted and d.revoked_at is null
  group by a.id,a.name
 )
 select jsonb_build_object('display',jsonb_build_object('church',c.name,'title',e.title,'logo_url',c.logo_url,'room_code',e.room_code,
  'theme',case when e.settings->>'tv_theme'='light' then 'light' else 'dark' end,'texture',coalesce((e.settings->>'texture')::boolean,true),
  'room_size',case when e.settings->>'room_size' in ('very_small','small','medium','large','very_large') then e.settings->>'room_size' else 'very_small' end,
  'reduced_motion',coalesce((e.settings->>'reduced_motion')::boolean,false)),
  'presence',jsonb_build_object('count',(select count(*) from present),'names',coalesce((select jsonb_agg(jsonb_build_object('key',md5(p.id::text||e.id::text),'name',p.name) order by p.arrived,p.id) from (select * from present order by arrived,id limit 14)p),'[]'::jsonb)))
 from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_engagement and not e.deleted and not c.deleted
$$;
revoke all on function private.tv_room_info(uuid) from public,anon,authenticated;

create function private.tv_presence_sync(p_engagement uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare fingerprint text; previous text;
begin
 -- Called after participant transactions commit, never while holding a device row.
 perform 1 from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found then return false; end if;
 fingerprint:=md5(coalesce((private.tv_room_info(p_engagement)->'presence')::text,''));
 select presence_hash into previous from private.room_transport where engagement_id=p_engagement;
 if fingerprint=previous then return false; end if;
 update private.room_transport set presence_hash=fingerprint where engagement_id=p_engagement;
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement;
 return true;
end $$;
create function public.tv_presence_sync(p_engagement uuid) returns boolean language sql security invoker set search_path='' as $$ select private.tv_presence_sync(p_engagement) $$;
revoke all on function private.tv_presence_sync(uuid),public.tv_presence_sync(uuid) from public,anon,authenticated;
grant execute on function private.tv_presence_sync(uuid),public.tv_presence_sync(uuid) to service_role;

-- A device proof can only resume the engagement explicitly paired by a current
-- Clearway facilitator. Auth tokens are exchanged on the server and bound here.
create function private.tv_device(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.tv_devices; eng uuid; native_session uuid; native_user uuid; binding uuid;
begin
 if p_action not in ('sync','prepare','release','bind') or p->>'proof' is null or p->>'proof' !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','invalid_request'); end if;
 if p_action='bind' then
  select engagement_id into eng from private.tv_devices where id=(p->>'device')::uuid and proof=p->>'proof' and not deleted;
  if eng is null then return jsonb_build_object('status','denied'); end if;
  perform 1 from public.engagements where id=eng and not deleted and status<>'closed' for key share;
  if not found then return jsonb_build_object('status','denied'); end if;
  perform 1 from public.room_states where engagement_id=eng and not deleted for update;
 end if;
 select * into d from private.tv_devices where id=(p->>'device')::uuid for update;
 if not found then
  if p_action<>'sync' or p->>'code_hash' is null or p->>'code_hash' !~ '^[a-f0-9]{64}$' or p->>'rate' is null or p->>'rate' !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','denied'); end if;
  if not private.tv_limit('init:'||(p->>'rate'),30,600) then return jsonb_build_object('status','limited'); end if;
  insert into private.tv_devices(id,proof,code_hash,code_expires_at,browser) values((p->>'device')::uuid,p->>'proof',p->>'code_hash',now()+interval '5 minutes',left(coalesce(p->>'browser',''),80)) returning * into d;
 end if;
 if d.deleted or d.proof<>p->>'proof' then return jsonb_build_object('status','denied'); end if;
 if p_action='release' then
  if d.claim_id=(p->>'claim')::uuid then update private.tv_devices set claim_id=null,claim_started_at=null where id=d.id; end if;
  return jsonb_build_object('status','released');
 end if;
 if d.engagement_id is null then
  if p_action<>'sync' then return jsonb_build_object('status','denied'); end if;
  if d.code_hash is null or d.code_expires_at<=now() then
   if p->>'code_hash' is null or p->>'code_hash' !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','invalid_request'); end if;
   if not private.tv_limit('renew:'||d.id::text,5,600) then return jsonb_build_object('status','limited'); end if;
   update private.tv_devices set code_hash=p->>'code_hash',code_expires_at=now()+interval '5 minutes' where id=d.id returning * into d;
  end if;
  return jsonb_build_object('status','pair','expires_at',d.code_expires_at,'code_hash',d.code_hash);
 end if;
 if not exists(select 1 from public.engagements e join public.churches c on c.id=e.church_id where e.id=d.engagement_id and not e.deleted and e.status<>'closed' and not c.deleted) then return jsonb_build_object('status','closed'); end if;
 if p_action='prepare' then
  if d.claim_id is not null and d.claim_started_at>now()-interval '45 seconds' then return jsonb_build_object('status','waiting'); end if;
  binding:=gen_random_uuid();
  update private.tv_devices set claim_id=binding,claim_started_at=now() where id=d.id;
  return jsonb_build_object('status','claim','claim',binding,'engagement',d.engagement_id,'email',d.id::text||'@tv.clearway.invalid');
 elsif p_action='bind' then
  if d.engagement_id is distinct from eng or d.claim_id is null or d.claim_id is distinct from (p->>'claim')::uuid or d.claim_started_at<now()-interval '45 seconds' then return jsonb_build_object('status','denied'); end if;
  native_user:=(p->>'user')::uuid;native_session:=(p->>'session')::uuid;
  if not exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=native_session and s.user_id=native_user
    and lower(u.email)=d.id::text||'@tv.clearway.invalid' and u.email_confirmed_at is not null and u.deleted_at is null
    and (s.not_after is null or s.not_after>now()) and (u.banned_until is null or u.banned_until<=now())) then return jsonb_build_object('status','denied'); end if;
  -- Remove earlier native sessions for this device before granting its replacement.
  delete from auth.sessions where id in(select auth_session_id from private.live_tv_sessions where device_id=d.id and revoked_at is null and not deleted);
  update private.live_tv_sessions set revoked_at=coalesce(revoked_at,now()) where device_id=d.id and revoked_at is null;
  insert into private.live_tv_sessions(engagement_id,auth_user_id,auth_session_id,device_id) values(eng,native_user,native_session,d.id) returning id into binding;
  update private.tv_devices set claim_id=null,claim_started_at=null where id=d.id;
  update public.room_states set results=private.live_results(eng) where engagement_id=eng;
  return jsonb_build_object('status','paired','engagement',eng,'tv',binding);
 end if;
 return jsonb_build_object('status','approved','engagement',d.engagement_id);
exception when invalid_text_representation or unique_violation then return jsonb_build_object('status','invalid_request');
end $$;
create function public.tv_device(p_action text,p jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.tv_device(p_action,p) $$;
revoke all on function private.tv_device(text,jsonb),public.tv_device(text,jsonb) from public,anon,authenticated;
grant execute on function private.tv_device(text,jsonb),public.tv_device(text,jsonb) to service_role;

create function private.tv_current() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('status','paired','engagement',t.engagement_id,'tv',t.id)
 from private.live_tv_sessions t join private.tv_devices d on d.id=t.device_id
 where t.auth_user_id=(select auth.uid()) and t.auth_session_id=private.auth_session_id() and private.live_role(t.engagement_id)='tv'
  and not t.deleted and t.revoked_at is null and not d.deleted and d.engagement_id=t.engagement_id
$$;
create function public.tv_current() returns jsonb language sql stable security invoker set search_path='' as $$ select private.tv_current() $$;
create function private.tv_heartbeat(p_engagement uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.room_states where engagement_id=p_engagement and not deleted for update;
 if private.live_role(p_engagement) is distinct from 'tv' then return false; end if;
 update private.live_tv_sessions set last_seen_at=clock_timestamp() where engagement_id=p_engagement and auth_session_id=private.auth_session_id() and not deleted and revoked_at is null;
 perform private.tv_presence_sync(p_engagement);return true;
end $$;
create function public.tv_heartbeat(p_engagement uuid) returns boolean language sql security invoker set search_path='' as $$ select private.tv_heartbeat(p_engagement) $$;
revoke all on function private.tv_current(),public.tv_current(),private.tv_heartbeat(uuid),public.tv_heartbeat(uuid) from public,anon,authenticated;
grant execute on function private.tv_current(),public.tv_current(),private.tv_heartbeat(uuid),public.tv_heartbeat(uuid) to authenticated;

create function private.tv_manage(p_engagement uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.engagements; d private.tv_devices; r public.room_states; out jsonb;
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if p_action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',screen.id,'label',screen.label,'browser',screen.browser,'paired_at',screen.paired_at,'last_seen_at',t.last_seen_at,'confirmed_version',coalesce(t.confirmed_version,0)) order by screen.paired_at),'[]'::jsonb) into out
  from private.tv_devices screen left join private.live_tv_sessions t on t.device_id=screen.id and t.revoked_at is null and not t.deleted
  where screen.engagement_id=p_engagement and not screen.deleted;
  return jsonb_build_object('status','ok','server_time',clock_timestamp(),'screens',out,'display',private.tv_room_info(p_engagement)->'display',
    'tv_content',(select tv_content from public.room_states where engagement_id=p_engagement),'closed',(select status='closed' from public.engagements where id=p_engagement));
 end if;
 select * into e from public.engagements where id=p_engagement and not deleted for update;
 perform 1 from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if e.status='closed' then return jsonb_build_object('status','closed'); end if;
 if p_action='pair' then
  if not private.tv_limit('pair:'||private.clearway_user_id()::text,20,300) then return jsonb_build_object('status','limited'); end if;
  if p->>'code_hash' is null or p->>'code_hash' !~ '^[a-f0-9]{64}$' or length(btrim(coalesce(p->>'label','TV'))) not between 1 and 80 then return jsonb_build_object('status','invalid_request'); end if;
  select * into d from private.tv_devices where code_hash=p->>'code_hash' and engagement_id is null and code_expires_at>now() and not deleted for update;
  if not found then return jsonb_build_object('status','invalid_code'); end if;
  update private.tv_devices set engagement_id=p_engagement,label=btrim(coalesce(p->>'label','TV')),paired_at=now(),code_hash=null,code_expires_at=null,claim_id=null,claim_started_at=null where id=d.id;
 elsif p_action='unpair' then
  select * into d from private.tv_devices where id=(p->>'device')::uuid and engagement_id=p_engagement and not deleted for update;
  if not found then return jsonb_build_object('status','missing'); end if;
  delete from auth.sessions where id in(select auth_session_id from private.live_tv_sessions where device_id=d.id and revoked_at is null and not deleted);
  update private.live_tv_sessions set revoked_at=coalesce(revoked_at,now()) where device_id=d.id and revoked_at is null;
  update private.tv_devices set engagement_id=null,paired_at=null,claim_id=null,claim_started_at=null,code_hash=null,code_expires_at=null where id=d.id;
 elsif p_action='display' then
  if p->>'room_size' is null or p->>'room_size' not in ('very_small','small','medium','large','very_large') or p->>'theme' is null or p->>'theme' not in ('dark','light')
    or jsonb_typeof(p->'texture') is distinct from 'boolean' or jsonb_typeof(p->'reduced_motion') is distinct from 'boolean' then return jsonb_build_object('status','invalid_request'); end if;
  update public.engagements set settings=settings||jsonb_build_object('tv_theme',p->>'theme','room_size',p->>'room_size','texture',p->'texture','reduced_motion',p->'reduced_motion') where id=p_engagement;
  -- The appearance trigger broadcasts this saved edit.
  return jsonb_build_object('status','ok');
 elsif p_action='screen' then
  select * into r from public.room_states where engagement_id=p_engagement;
  if r.live_session_id is not null or p->>'content' is null or p->>'content' not in ('holding','join','screen_check') then return jsonb_build_object('status','running'); end if;
  update public.room_states set tv_content=p->>'content' where engagement_id=p_engagement;
  return jsonb_build_object('status','ok');
 else return jsonb_build_object('status','invalid_request'); end if;
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement;
 return jsonb_build_object('status','ok');
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;
create function public.tv_manage(p_engagement uuid,p_action text,p jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.tv_manage(p_engagement,p_action,p) $$;
revoke all on function private.tv_manage(uuid,text,jsonb),public.tv_manage(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.tv_manage(uuid,text,jsonb),public.tv_manage(uuid,text,jsonb) to authenticated;

create function private.tv_room_link(p_code text) returns uuid language sql stable security definer set search_path='' as $$
 select e.id from public.engagements e join public.churches c on c.id=e.church_id where e.room_code=upper(p_code) and not e.deleted and not c.deleted
$$;
create function public.tv_room_link(p_code text) returns uuid language sql stable security invoker set search_path='' as $$ select private.tv_room_link(p_code) $$;
revoke all on function private.tv_room_link(text),public.tv_room_link(text) from public,anon,authenticated;
grant execute on function private.tv_room_link(text),public.tv_room_link(text) to service_role;

create or replace function private.live_public_state(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('state',jsonb_build_object('engagement_id',r.engagement_id,'live_session_id',r.live_session_id,'tv_content',r.tv_content,'phones_down',r.phones_down,'burst_ends_at',r.burst_ends_at,'spotlight_id',r.spotlight_id,'hidden_ids',r.hidden_ids,'remote_holder_id',r.remote_holder_id,'team_led_block_id',r.team_led_block_id,'show_tv_on_phones',r.show_tv_on_phones,'phone_refresh_version',r.phone_refresh_version,'results',r.results,'version',r.version),'session',case when s.id is not null then jsonb_build_object(
 'id',s.id,'title',s.title,'interaction',s.interaction,'prompt',private.fill_years(s.prompt,e.base_year),'state',s.state,'revision',s.revision,'base_year',e.base_year,
 'max_sends',s.max_sends,'max_characters',s.max_characters,'max_words',s.max_words,'settings',jsonb_build_object('anonymous',true,'burst_minutes',s.settings->'burst_minutes','join_strip',s.settings->'join_strip')) end)||private.tv_room_info(p_engagement)
 from public.room_states r join public.engagements e on e.id=r.engagement_id left join public.sessions s on s.id=r.live_session_id and not s.deleted
 where r.engagement_id=p_engagement and not r.deleted
$$;

create or replace function private.close_live_engagement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.status='closed' and old.status<>'closed') or (new.deleted and not old.deleted) then
    -- Match the editor: room before sessions, so closing cannot deadlock a Save.
    perform 1 from public.room_states where engagement_id=new.id for update;
    delete from auth.sessions where id in(select auth_session_id from private.live_tv_sessions where engagement_id=new.id and revoked_at is null and not deleted);
    update private.tv_devices set engagement_id=null,paired_at=null,code_hash=null,code_expires_at=null,claim_id=null,claim_started_at=null where engagement_id=new.id;
    update private.live_tv_sessions set revoked_at=coalesce(revoked_at,clock_timestamp()) where engagement_id=new.id;
    update public.sessions set state='closed',closed_at=coalesce(closed_at,clock_timestamp()) where engagement_id=new.id and state in ('live','phones_down','open');
    update public.room_states set live_session_id=null,tv_content='holding',phones_down=false,burst_ends_at=null,spotlight_id=null,
      hidden_ids=array[]::uuid[],remote_holder_id=null,team_led_block_id=null,show_tv_on_phones=false,
      results='{"total":0,"people":0,"words":[]}',deleted=new.deleted where engagement_id=new.id;
  end if;
  return new;
end $$;

create function private.tv_appearance_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.settings,new.title) is distinct from (old.settings,old.title) and not new.deleted and new.status<>'closed' then
  update public.room_states set results=private.live_results(new.id) where engagement_id=new.id and not deleted;
 end if;return new;
end $$;
create trigger tv_appearance_changed after update of settings,title on public.engagements for each row execute function private.tv_appearance_changed();
create function private.tv_church_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare eng uuid;
begin
 if (new.name,new.logo_url) is distinct from (old.name,old.logo_url) then
  for eng in select id from public.engagements where church_id=new.id and not deleted order by id loop
   update public.room_states set results=private.live_results(eng) where engagement_id=eng and not deleted;
  end loop;
 end if;return new;
end $$;
create trigger tv_church_changed after update of name,logo_url on public.churches for each row execute function private.tv_church_changed();
revoke all on function private.tv_appearance_changed(),private.tv_church_changed() from public,anon,authenticated;
create or replace function private.live_ack(p_engagement uuid,p_version bigint,p_received timestamptz,p_uncertainty double precision,p_answers jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare tv private.live_tv_sessions; current_version bigint; item jsonb;
begin
  if private.live_role(p_engagement) is distinct from 'tv' or p_received is null or p_received not between clock_timestamp()-interval '5 minutes' and clock_timestamp()+interval '1 minute'
    or p_uncertainty is null or p_uncertainty not between 0 and 60000 or p_uncertainty='NaN'::float8
    or jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers)>500 then return false; end if;
  for item in select value from jsonb_array_elements(p_answers) loop
    if jsonb_typeof(item) is distinct from 'object' or item->>'id' is null or item->>'id' !~ '^[a-f0-9-]{36}$' or item->>'revision' is null or item->>'revision' !~ '^[0-9]{1,7}$'
      or (item ? 'received_at' and (jsonb_typeof(item->'received_at') is distinct from 'string' or (item->>'received_at')::timestamptz not between clock_timestamp()-interval '5 minutes' and clock_timestamp()+interval '1 minute'))
      or (item ? 'uncertainty_ms' and (jsonb_typeof(item->'uncertainty_ms') is distinct from 'number' or (item->>'uncertainty_ms')::float8 not between 0 and 60000)) then return false; end if;
  end loop;
  select version into current_version from public.room_states where engagement_id=p_engagement;
  if p_version is null or p_version<0 or p_version>current_version then return false; end if;
  select * into tv from private.live_tv_sessions where engagement_id=p_engagement and auth_session_id=private.auth_session_id() and not deleted and revoked_at is null for update;
  update private.live_tv_sessions set confirmed_version=greatest(confirmed_version,p_version),last_seen_at=clock_timestamp() where id=tv.id;
  insert into private.latency_logs(engagement_id,submission_id,revision,room_version,phone_sent_at,server_received_at,server_accepted_at,tv_session_id,tv_received_at,clock_uncertainty_ms)
    select l.engagement_id,l.submission_id,l.revision,l.room_version,l.phone_sent_at,l.server_received_at,l.server_accepted_at,tv.id,coalesce((a->>'received_at')::timestamptz,p_received),l.clock_uncertainty_ms+coalesce((a->>'uncertainty_ms')::float8,p_uncertainty)
    from private.latency_logs l join jsonb_array_elements(p_answers) a on a->>'id'=l.submission_id::text and a->>'revision'=l.revision::text
    where l.engagement_id=p_engagement and l.tv_session_id is null and l.room_version<=p_version and not l.deleted
    on conflict(submission_id,revision,tv_session_id) do nothing;
  return true;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then return false;
end $$;

commit;
