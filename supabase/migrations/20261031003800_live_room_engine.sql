-- Milestone 2, PR 1: transactional room state, submissions and private broadcast.
-- No Team Hub/CORE access. No live session is started by this migration.
begin;

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id),
  title text not null check (length(btrim(title)) between 1 and 200),
  part text not null default 'Pre-call' check (length(part) between 1 and 100),
  position integer not null default 0 check (position >= 0),
  planned_start timestamptz,
  planned_minutes integer not null default 5 check (planned_minutes between 1 and 1440),
  mode text not null default 'live' check (mode in ('live','self_paced')),
  interaction text not null default 'word_cloud' check (interaction in ('word_cloud','wall','content')),
  prompt text not null default '' check (length(prompt) <= 4000),
  phone_depth text not null default '' check (length(phone_depth) <= 20000),
  state text not null default 'draft' check (state in ('draft','ready','open','live','phones_down','closed')),
  max_sends integer not null default 3 check (max_sends between 1 and 100),
  max_characters integer not null default 28 check (max_characters between 1 and 280),
  max_words integer not null default 3 check (max_words between 1 and 50),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  unique(id,engagement_id)
);
create index sessions_engagement_order_idx on public.sessions(engagement_id,position,id);
create unique index sessions_one_live_idx on public.sessions(engagement_id) where state in ('live','phones_down') and not deleted;

create table public.room_states (
  engagement_id uuid primary key references public.engagements(id),
  live_session_id uuid,
  tv_content text not null default 'holding' check (tv_content in ('holding','join','session','screen_check')),
  phones_down boolean not null default false,
  burst_ends_at timestamptz,
  spotlight_id uuid,
  hidden_ids uuid[] not null default array[]::uuid[],
  remote_holder_id uuid,
  team_led_block_id uuid,
  show_tv_on_phones boolean not null default false,
  phone_refresh_version bigint not null default 0 check (phone_refresh_version >= 0),
  results jsonb not null default '{"total":0,"people":0,"words":[]}' check (jsonb_typeof(results)='object'),
  version bigint not null default 0 check (version between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  foreign key(live_session_id,engagement_id) references public.sessions(id,engagement_id),
  foreign key(remote_holder_id,engagement_id) references public.attendees(id,engagement_id)
);

-- Authorship is visible only to its author. Shared snapshots/events project it out.
create table public.submissions (
  id uuid primary key,
  engagement_id uuid not null references public.engagements(id),
  session_id uuid not null,
  attendee_id uuid not null,
  text text not null check (length(text) between 1 and 1404),
  answers jsonb not null check (jsonb_typeof(answers)='array'),
  revision integer not null default 0 check (revision between 0 and 1000000),
  withdrawn boolean not null default false,
  hidden boolean not null default false,
  test boolean not null default false,
  phone_sent_at timestamptz not null,
  queued_at timestamptz,
  server_received_at timestamptz not null default clock_timestamp(),
  clock_uncertainty_ms double precision not null default 0 check (clock_uncertainty_ms between 0 and 60000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  foreign key(session_id,engagement_id) references public.sessions(id,engagement_id),
  foreign key(attendee_id,engagement_id) references public.attendees(id,engagement_id)
);
create index submissions_session_page_idx on public.submissions(engagement_id,session_id,id);
create index room_states_session_idx on public.room_states(live_session_id,engagement_id);
create index room_states_remote_idx on public.room_states(remote_holder_id,engagement_id);
create index submissions_session_fk_idx on public.submissions(session_id,engagement_id);
create index submissions_author_idx on public.submissions(attendee_id,session_id);

create table private.session_notes (
  session_id uuid primary key,
  engagement_id uuid not null references public.engagements(id),
  notes text not null default '' check(length(notes)<=30000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
-- Native Auth bindings, populated by the TV pairing workflow in PR 3.
create table private.live_tv_sessions (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id),
  auth_user_id uuid not null references auth.users(id),
  auth_session_id uuid not null unique,
  confirmed_version bigint not null default 0 check(confirmed_version>=0),
  last_seen_at timestamptz not null default now(), revoked_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index session_notes_engagement_idx on private.session_notes(engagement_id);
create index live_tv_sessions_user_idx on private.live_tv_sessions(auth_user_id);
create index live_tv_sessions_room_idx on private.live_tv_sessions(engagement_id) where not deleted and revoked_at is null;
create table private.room_transport (
  engagement_id uuid primary key references public.engagements(id),
  channel_id uuid not null default gen_random_uuid(),
  access_fingerprint text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create table private.latency_logs (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id),
  submission_id uuid not null references public.submissions(id),
  revision integer not null,
  room_version bigint not null,
  phone_sent_at timestamptz not null,
  server_received_at timestamptz not null,
  server_accepted_at timestamptz not null default clock_timestamp(),
  tv_session_id uuid references private.live_tv_sessions(id),
  tv_received_at timestamptz,
  clock_uncertainty_ms double precision not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  unique(submission_id,revision,tv_session_id)
);
create unique index latency_accept_unique on private.latency_logs(submission_id,revision) where tv_session_id is null;
create index latency_logs_tv_idx on private.latency_logs(tv_session_id) where tv_session_id is not null;
create index latency_logs_room_idx on private.latency_logs(engagement_id,room_version);

-- New tables use different primary-key column names, unlike the M1 tables.
create function private.touch_live_record() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  new:=jsonb_populate_record(new,jsonb_build_object(TG_ARGV[0],to_jsonb(old)->TG_ARGV[0],
    'created_at',old.created_at,'updated_at',clock_timestamp()));
  return new;
end $$;
revoke all on function private.touch_live_record() from public,anon,authenticated;

do $$ declare t text; pk text; begin
  foreach t in array array['public.sessions','public.room_states','public.submissions','private.session_notes','private.live_tv_sessions','private.room_transport','private.latency_logs'] loop
    execute format('alter table %s enable row level security',t);
    execute format('alter table %s force row level security',t);
    execute format('revoke all on %s from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on %s to service_role',t);
    pk:=case when t in ('public.room_states','private.room_transport') then 'engagement_id' when t='private.session_notes' then 'session_id' else 'id' end;
    execute format('create trigger touch_record before update on %s for each row execute function private.touch_live_record(%L)',t,pk);
  end loop;
end $$;
grant select on public.sessions,public.room_states,public.submissions to authenticated;
grant select on private.session_notes,private.latency_logs to authenticated;

create function private.live_role(p_engagement uuid) returns text
language sql stable security definer set search_path='' as $$
  select case
    when private.is_admin() or private.can_facilitate(p_engagement) then 'facilitator'
    when exists(select 1 from public.attendees a where a.engagement_id=p_engagement and a.id in(select private.room_attendee_ids())) then 'participant'
    when private.has_auth_session() and exists(select 1 from private.live_tv_sessions t where t.engagement_id=p_engagement
      and t.auth_user_id=(select auth.uid()) and t.auth_session_id=private.auth_session_id() and t.revoked_at is null and not t.deleted) then 'tv'
    end
  where (select auth.uid()) is not null and exists(select 1 from public.engagements e join public.churches c on c.id=e.church_id
    where e.id=p_engagement and not e.deleted and e.status<>'closed' and not c.deleted)
$$;
create policy live_sessions_read on public.sessions for select to authenticated
using (not deleted and ((select private.is_admin()) or (select private.can_facilitate(engagement_id))));
create policy live_states_read on public.room_states for select to authenticated
using (not deleted and (select private.live_role(engagement_id)) is not null);
create policy live_submissions_own on public.submissions for select to authenticated
using (not deleted and attendee_id in(select private.room_attendee_ids()));
create policy live_notes_facilitator on private.session_notes for select to authenticated
using (not deleted and ((select private.is_admin()) or (select private.can_facilitate(engagement_id))));
create policy live_latency_facilitator on private.latency_logs for select to authenticated
using (not deleted and ((select private.is_admin()) or (select private.can_facilitate(engagement_id))));

-- A shared room topic rotates before sending data if any authorized session changes.
-- Supabase authorizes private-channel joins, not every subsequent message. Rotation
-- prevents a revoked subscriber from continuing to receive data on its old socket.
create function private.live_fingerprint(p_engagement uuid) returns text
language sql stable security definer set search_path='' as $$
  select md5(coalesce(string_agg(s.id::text,',' order by s.id),'')) from auth.sessions s join auth.users u on u.id=s.user_id
  where u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and (s.not_after is null or s.not_after>now()) and (
    exists(select 1 from public.device_sessions d join public.attendees a on a.id=d.attendee_id
      where d.engagement_id=p_engagement and d.auth_session_id=s.id and a.auth_user_id=s.user_id and a.verified_at is not null
      and not a.deleted and not d.deleted and d.revoked_at is null)
    or exists(select 1 from private.live_tv_sessions t where t.engagement_id=p_engagement and t.auth_session_id=s.id
      and t.auth_user_id=s.user_id and not t.deleted and t.revoked_at is null)
    or exists(select 1 from public.clearway_users c where c.auth_user_id=s.user_id and not c.deleted and c.email=lower(u.email)
      and u.email_confirmed_at is not null and c.email ~ '^[^@[:space:]]+@clearway\.co$'
      and exists(select 1 from auth.mfa_amr_claims m where m.session_id=s.id and m.authentication_method='oauth')
      and exists(select 1 from auth.identities i where i.user_id=s.user_id and i.provider='google'
        and lower(i.identity_data->>'email')=c.email and i.identity_data->>'email_verified'='true')
      and (c.is_admin or exists(select 1 from public.engagement_facilitators f where f.engagement_id=p_engagement and f.clearway_user_id=c.id and not f.deleted)))
  )
$$;
create function private.live_topic(p_engagement uuid) returns text
language sql stable security definer set search_path='' as $$
  select 'live:'||t.engagement_id||':'||t.channel_id from private.room_transport t
  where t.engagement_id=p_engagement and not t.deleted and private.live_role(p_engagement) is not null
$$;
create function private.can_receive_live(p_topic text) returns boolean
language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(select 1 from private.room_transport t
    where not t.deleted and p_topic='live:'||t.engagement_id||':'||t.channel_id and private.live_role(t.engagement_id) is not null)
$$;
-- No browser INSERT policy: clients cannot spoof state/answer broadcasts.
create policy clearway_live_receive on realtime.messages for select to authenticated
using (extension='broadcast' and (select private.can_receive_live(realtime.topic())));

create function private.live_public_state(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('state',jsonb_build_object('engagement_id',r.engagement_id,'live_session_id',r.live_session_id,'tv_content',r.tv_content,'phones_down',r.phones_down,'burst_ends_at',r.burst_ends_at,'spotlight_id',r.spotlight_id,'hidden_ids',r.hidden_ids,'remote_holder_id',r.remote_holder_id,'team_led_block_id',r.team_led_block_id,'show_tv_on_phones',r.show_tv_on_phones,'phone_refresh_version',r.phone_refresh_version,'results',r.results,'version',r.version),'session',case when s.id is not null then jsonb_build_object(
    'id',s.id,'title',s.title,'interaction',s.interaction,'prompt',s.prompt,'state',s.state,
    'max_sends',s.max_sends,'max_characters',s.max_characters,'max_words',s.max_words) end)
  from public.room_states r left join public.sessions s on s.id=r.live_session_id and not s.deleted
  where r.engagement_id=p_engagement and not r.deleted
$$;
create function private.live_version() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  new.version:=old.version+1;
  return new;
end $$;
create trigger live_version before update on public.room_states for each row execute function private.live_version();

create function private.live_broadcast() returns trigger
language plpgsql security definer set search_path='' as $$
declare t private.room_transport; fingerprint text; topic text;
begin
  select * into t from private.room_transport where engagement_id=new.engagement_id for update;
  fingerprint:=private.live_fingerprint(new.engagement_id);
  if t.access_fingerprint<>fingerprint or new.deleted then
    perform realtime.send(jsonb_build_object('engagement',new.engagement_id,'version',new.version),'rekey','live:'||new.engagement_id||':'||t.channel_id,true);
    update private.room_transport set channel_id=gen_random_uuid(),access_fingerprint=fingerprint where engagement_id=new.engagement_id returning * into t;
  end if;
  topic:='live:'||new.engagement_id||':'||t.channel_id;
  perform realtime.send(private.live_public_state(new.engagement_id)||jsonb_build_object('answer',nullif(current_setting('clearway.live_answer',true),'')::jsonb),'room',topic,true);
  return new;
end $$;
create trigger live_broadcast after update on public.room_states for each row execute function private.live_broadcast();

create function private.init_live_room() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.room_states(engagement_id) values(new.id);
  insert into private.room_transport(engagement_id) values(new.id);
  return new;
end $$;
create trigger init_live_room after insert on public.engagements for each row execute function private.init_live_room();
insert into public.room_states(engagement_id) select id from public.engagements;
insert into private.room_transport(engagement_id) select id from public.engagements;

create function private.live_results(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  with active as (
    select s.* from public.submissions s join public.room_states r on r.engagement_id=s.engagement_id and r.live_session_id=s.session_id
    where s.engagement_id=p_engagement and not s.deleted and not s.withdrawn and not s.hidden
  ), words as (
    select a->>'key' as key,min(a->>'text') as label,count(*)::integer as count
    from active cross join lateral jsonb_array_elements(answers) a where exists(select 1 from public.sessions x where x.id=active.session_id and x.interaction='word_cloud') group by a->>'key'
  ), sized as (select *,max(count) over() as maximum from words)
  select jsonb_build_object('total',(select coalesce(sum(jsonb_array_length(answers)),0) from active),
    'people',(select count(distinct attendee_id) from active),'words',coalesce((select jsonb_agg(jsonb_build_object(
      'key',key,'text',label,'count',count,'size',case when maximum<=1 then 56 else 56+112*(sqrt(count)-1)/(sqrt(maximum)-1) end,
      'level',case when count=maximum and count>1 then 'leader' when count>1 then 'repeated' else 'single' end) order by key) from sized),'[]'::jsonb))
$$;

create function private.live_snapshot(p_engagement uuid,p_after uuid,p_version bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare role text:=private.live_role(p_engagement); r public.room_states; page jsonb; next_id uuid;
begin
  if role is null then return jsonb_build_object('status','denied'); end if;
  select * into r from public.room_states where engagement_id=p_engagement and not deleted;
  if not found then return jsonb_build_object('status','missing'); end if;
  if p_version is not null and p_version<>r.version then return jsonb_build_object('status','changed','version',r.version); end if;
  if p_after is not null and p_version is null then return jsonb_build_object('status','invalid_request'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'session_id',session_id,'text',text,'answers',answers,'revision',revision,'created_at',created_at) order by id),'[]'::jsonb)
    into page from (select s.* from public.submissions s where s.engagement_id=p_engagement and s.session_id=r.live_session_id
      and not s.deleted and not s.withdrawn and not s.hidden and (p_after is null or s.id>p_after) order by s.id limit 501) page_rows;
  if jsonb_array_length(page)>500 then next_id:=(page->499->>'id')::uuid; page:=page-500; end if;
  return private.live_public_state(p_engagement)||jsonb_build_object('status','ok','role',role,'topic',private.live_topic(p_engagement),'version',r.version,'answers',page,'next',next_id,
    'phone_depth',case when role='participant' then (select phone_depth from public.sessions where id=r.live_session_id and not deleted) else null end,
    'server_time',clock_timestamp());
end $$;

create function private.live_submit(p_engagement uuid,p_id uuid,p_session uuid,p_revision integer,p_action text,p_text text,p_sent timestamptz,p_queued timestamptz,p_uncertainty double precision) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; previous public.submissions; who uuid; parts text[]; item text; key text; words text[]; answers jsonb:='[]'::jsonb; received timestamptz:=clock_timestamp();
begin
  -- Same lock order as practice reset. Recheck access after waiting for the room.
  if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
  select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
  if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
  select id into who from public.attendees where engagement_id=p_engagement and id in(select private.room_attendee_ids());
  select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted;
  if not found or s.interaction not in ('word_cloud','wall') then return jsonb_build_object('status','invalid_session'); end if;
  if p_action is null or p_action not in ('submit','change','withdraw') or p_revision is null or p_revision<0 or p_revision>1000000 or p_id is null
    or p_sent is null or not isfinite(p_sent) or (p_queued is not null and not isfinite(p_queued)) or p_uncertainty is null or p_uncertainty not between 0 and 60000 or p_uncertainty='NaN'::float8
    or p_sent>received+interval '1 minute' or p_queued>received+interval '1 minute' then return jsonb_build_object('status','invalid_request'); end if;
  select * into previous from public.submissions where id=p_id;
  if found then
    if previous.attendee_id<>who or previous.engagement_id<>p_engagement or previous.session_id<>p_session or previous.deleted then return jsonb_build_object('status','conflict'); end if;
    if p_revision<=previous.revision then return jsonb_build_object('status','duplicate','id',p_id,'revision',previous.revision,'version',r.version); end if;
    if p_revision<>previous.revision+1 or p_action='submit' then return jsonb_build_object('status','conflict'); end if;
  elsif p_revision<>0 or p_action<>'submit' then return jsonb_build_object('status','conflict');
  end if;
  if (r.live_session_id is distinct from p_session or r.phones_down or s.state<>'live' or (r.burst_ends_at is not null and r.burst_ends_at<=received))
    and not (p_action='submit' and p_queued is not null and s.state='closed' and s.closed_at is not null
      and p_queued<=s.closed_at and p_sent<=s.closed_at and received<=s.closed_at+interval '2 minutes') then return jsonb_build_object('status','closed'); end if;
  if p_action='withdraw' then answers:=previous.answers; p_text:=previous.text;
  else
    if p_text is null or length(btrim(p_text))=0 or length(p_text)>1404 then return jsonb_build_object('status','invalid_answer'); end if;
    parts:=case when s.interaction='word_cloud' then string_to_array(p_text,',') else array[p_text] end;
    if cardinality(parts)>5 then return jsonb_build_object('status','limit'); end if;
    foreach item in array parts loop
      item:=btrim(item);
      if length(item)=0 or length(item)>s.max_characters then return jsonb_build_object('status','limit'); end if;
      -- Filter before publishing. Whole-word matching avoids innocent substrings.
      if lower(item) ~ '\m(fuck|fucking|shit|bullshit|bitch|cunt|motherfucker)\M' then return jsonb_build_object('status','filtered'); end if;
      key:=btrim(regexp_replace(lower(item),'[^[:alnum:][:space:]]','','g'));
      words:=regexp_split_to_array(key,'\s+');
      if s.interaction='word_cloud' then
        if cardinality(words)>s.max_words then return jsonb_build_object('status','limit'); end if;
        while cardinality(words)>1 and words[1]=any(array['a','an','the','in','my','our','of','to','for','on','at','with']) loop words:=words[2:]; end loop;
        for i in 1..cardinality(words) loop if length(words[i])>3 and right(words[i],1)='s' then words[i]:=left(words[i],-1); end if; end loop;
      end if;
      key:=array_to_string(words,' ');
      if length(key)=0 then return jsonb_build_object('status','invalid_answer'); end if;
      answers:=answers||jsonb_build_array(jsonb_build_object('text',item,'key',key));
    end loop;
    if p_action='submit' and (select count(*) from public.submissions where session_id=p_session and attendee_id=who and not deleted)>=s.max_sends then return jsonb_build_object('status','limit'); end if;
  end if;
  insert into public.submissions(id,engagement_id,session_id,attendee_id,text,answers,revision,phone_sent_at,queued_at,clock_uncertainty_ms,server_received_at)
    values(p_id,p_engagement,p_session,who,btrim(p_text),answers,p_revision,p_sent,p_queued,p_uncertainty,received)
    on conflict(id) do update set text=excluded.text,answers=excluded.answers,revision=excluded.revision,withdrawn=(p_action='withdraw');
  perform set_config('clearway.live_answer',jsonb_build_object('id',p_id,'session_id',p_session,'revision',p_revision,
    'withdrawn',p_action='withdraw','hidden',coalesce(previous.hidden,false),
    'text',case when p_action<>'withdraw' and not coalesce(previous.hidden,false) and p_session=r.live_session_id then btrim(p_text) end,
    'answers',case when p_action<>'withdraw' and not coalesce(previous.hidden,false) and p_session=r.live_session_id then answers else '[]'::jsonb end)::text,true);
  update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
  perform set_config('clearway.live_answer','',true);
  insert into private.latency_logs(engagement_id,submission_id,revision,room_version,phone_sent_at,server_received_at,clock_uncertainty_ms)
    values(p_engagement,p_id,p_revision,r.version,p_sent,received,p_uncertainty);
  return jsonb_build_object('status','accepted','id',p_id,'revision',p_revision,'version',r.version,'server_received_at',received);
end $$;

create function public.live_snapshot(p_engagement uuid,p_after uuid default null,p_version bigint default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.live_snapshot(p_engagement,p_after,p_version) $$;
create function public.live_submit(p_engagement uuid,p_id uuid,p_session uuid,p_revision integer,p_action text,p_text text,p_sent timestamptz,p_queued timestamptz default null,p_uncertainty double precision default 0) returns jsonb
language sql security invoker set search_path='' as $$ select private.live_submit(p_engagement,p_id,p_session,p_revision,p_action,p_text,p_sent,p_queued,p_uncertainty) $$;

-- Remove permissive function defaults; only identity-bound reads/writes are public.
revoke all on function private.live_role(uuid),private.live_fingerprint(uuid),private.live_topic(uuid),private.can_receive_live(text),private.live_public_state(uuid),private.live_version(),private.live_broadcast(),private.init_live_room(),private.live_results(uuid),private.live_snapshot(uuid,uuid,bigint),private.live_submit(uuid,uuid,uuid,integer,text,text,timestamptz,timestamptz,double precision) from public,anon,authenticated;
revoke all on function public.live_snapshot(uuid,uuid,bigint),public.live_submit(uuid,uuid,uuid,integer,text,text,timestamptz,timestamptz,double precision) from public,anon,authenticated;
grant execute on function private.live_role(uuid),private.can_receive_live(text),private.live_snapshot(uuid,uuid,bigint),private.live_submit(uuid,uuid,uuid,integer,text,text,timestamptz,timestamptz,double precision),public.live_snapshot(uuid,uuid,bigint),public.live_submit(uuid,uuid,uuid,integer,text,text,timestamptz,timestamptz,double precision) to authenticated;

-- A TV acknowledges only versions it could have received; latency stays private.
create function private.live_ack(p_engagement uuid,p_version bigint,p_received timestamptz,p_uncertainty double precision,p_answers jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare tv private.live_tv_sessions; current_version bigint;
begin
  if private.live_role(p_engagement) is distinct from 'tv' or p_received is null or p_received not between clock_timestamp()-interval '5 minutes' and clock_timestamp()+interval '1 minute'
    or p_uncertainty is null or p_uncertainty not between 0 and 60000 or p_uncertainty='NaN'::float8
    or jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers)>500 then return false; end if;
  select version into current_version from public.room_states where engagement_id=p_engagement;
  if p_version is null or p_version<0 or p_version>current_version then return false; end if;
  select * into tv from private.live_tv_sessions where engagement_id=p_engagement and auth_session_id=private.auth_session_id() and not deleted and revoked_at is null for update;
  update private.live_tv_sessions set confirmed_version=greatest(confirmed_version,p_version),last_seen_at=clock_timestamp() where id=tv.id;
  insert into private.latency_logs(engagement_id,submission_id,revision,room_version,phone_sent_at,server_received_at,server_accepted_at,tv_session_id,tv_received_at,clock_uncertainty_ms)
    select l.engagement_id,l.submission_id,l.revision,l.room_version,l.phone_sent_at,l.server_received_at,l.server_accepted_at,tv.id,p_received,l.clock_uncertainty_ms+p_uncertainty
    from private.latency_logs l join jsonb_array_elements(p_answers) a on a->>'id'=l.submission_id::text and a->>'revision'=l.revision::text
    where l.engagement_id=p_engagement and l.tv_session_id is null and l.room_version<=p_version and not l.deleted
    on conflict(submission_id,revision,tv_session_id) do nothing;
  return true;
end $$;
create function public.live_ack(p_engagement uuid,p_version bigint,p_received timestamptz,p_uncertainty double precision,p_answers jsonb default '[]') returns boolean
language sql security invoker set search_path='' as $$ select private.live_ack(p_engagement,p_version,p_received,p_uncertainty,p_answers) $$;
revoke all on function private.live_ack(uuid,bigint,timestamptz,double precision,jsonb),public.live_ack(uuid,bigint,timestamptz,double precision,jsonb) from public,anon,authenticated;
grant execute on function private.live_ack(uuid,bigint,timestamptz,double precision,jsonb),public.live_ack(uuid,bigint,timestamptz,double precision,jsonb) to authenticated;

create function private.close_live_engagement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.status='closed' and old.status<>'closed') or (new.deleted and not old.deleted) then
    update private.live_tv_sessions set revoked_at=coalesce(revoked_at,clock_timestamp()) where engagement_id=new.id;
    update public.sessions set state='closed',closed_at=coalesce(closed_at,clock_timestamp()) where engagement_id=new.id and state in ('live','phones_down','open');
    update public.room_states set live_session_id=null,tv_content='holding',phones_down=false,burst_ends_at=null,spotlight_id=null,
      hidden_ids=array[]::uuid[],remote_holder_id=null,team_led_block_id=null,show_tv_on_phones=false,
      results='{"total":0,"people":0,"words":[]}',deleted=new.deleted where engagement_id=new.id;
  end if;
  return new;
end $$;
revoke all on function private.close_live_engagement() from public,anon,authenticated;
create trigger live_engagement_closed after update of status,deleted on public.engagements for each row execute function private.close_live_engagement();

-- Keep reset atomic with the new submission worker and clear practice input.
create or replace function private.reset_practice_room() returns boolean
language plpgsql security definer set search_path='' as $$
declare eng uuid:='90000000-0000-4000-8000-000000000010'::uuid; target_sessions uuid[];
begin
 if not ((select private.is_admin()) or private.can_facilitate(eng)) then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(eng::text,7));
 if not exists(select 1 from public.engagements where id=eng and type='practice' and not deleted) then return false; end if;
 perform 1 from public.room_states where engagement_id=eng for update;
 update public.submissions set deleted=true where engagement_id=eng and not deleted;
 update private.latency_logs set deleted=true where engagement_id=eng and not deleted;
 update public.sessions set state='ready',closed_at=null where engagement_id=eng and not deleted and state in ('live','phones_down','closed','open');
 select array_agg(distinct auth_session_id) into target_sessions from public.device_sessions where engagement_id=eng;
 update public.device_sessions set revoked_at=coalesce(revoked_at,now()) where engagement_id=eng;
 update private.room_auth_devices set revoked_at=coalesce(revoked_at,now()),granted_at=null,claim_id=null,claim_started_at=null,deleted=true where engagement_id=eng;
 update private.room_auth_challenges set consumed_at=coalesce(consumed_at,now()),deleted=true where engagement_id=eng;
 update public.join_requests set deleted=true where engagement_id=eng;
 update public.attendees set deleted=true where engagement_id=eng;
 -- Preserve device audit rows, while invalidating JWT access and refresh immediately.
 delete from auth.sessions where id=any(coalesce(target_sessions,array[]::uuid[]));
 update public.engagements set status='setup' where id=eng;
 update public.room_states set live_session_id=null,tv_content='holding',phones_down=false,burst_ends_at=null,spotlight_id=null,
   hidden_ids=array[]::uuid[],remote_holder_id=null,team_led_block_id=null,show_tv_on_phones=false,
   results='{"total":0,"people":0,"words":[]}' where engagement_id=eng;
 return true;
end $$;

commit;
