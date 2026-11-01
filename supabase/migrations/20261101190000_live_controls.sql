-- Milestone 2, PR 4: facilitator live controls (FAC-01, FAC-03).
-- Live only, after merge. No session is started and no data is seeded here.
--
-- Decided November 1, 2026 (Chris):
-- * Moving between steps needs no confirmation. Steps in the same segment (for
--   example Five Lenses) stay open while the room is in that segment, so phones
--   that look back can still answer them for the report. Moving to a step outside
--   the segment closes it. A step with no segment closes as soon as the room moves on.
-- * Close a part (Pre-call, Day 1, Day 2, Follow-up) to stop answers on its steps.
-- * Phones down and bursts lock only the step that is live.
-- * A TV silent for 12 seconds drops out of the remote's confirmation.
begin;

-- Spotlight and hide address an item key: a wall answer id or a word-cloud word key.
alter table public.sessions
 add column segment text not null default '' check(length(segment)<=100 and segment=btrim(segment)),
 add column hidden_keys text[] not null default array[]::text[] check(cardinality(hidden_keys)<=500),
 add column shown_at timestamptz;
alter table public.room_states
 add column spotlight_key text check(length(spotlight_key)<=200),
 add column hidden_keys text[] not null default array[]::text[] check(cardinality(hidden_keys)<=500);

-- Every press is logged once by its client-made id. Actors stay facilitator-only.
create table private.room_controls (
 id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 actor_id uuid references public.clearway_users(id),
 action text not null check(length(action) between 1 and 40),
 session_id uuid,
 room_version bigint not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false
);
create index room_controls_room_idx on private.room_controls(engagement_id,created_at desc);
create index room_controls_actor_idx on private.room_controls(actor_id);
alter table private.room_controls enable row level security;
alter table private.room_controls force row level security;
revoke all on private.room_controls from public,anon,authenticated;
grant select,insert,update,delete on private.room_controls to service_role;
create trigger touch_record before update on private.room_controls for each row execute function private.touch_live_record('id');

create function private.part_order(p_part text) returns integer language sql immutable security invoker set search_path='' as $$
 select array_position(array['Pre-call','Day 1','Day 2','Follow-up'],p_part)
$$;

-- Practice reset returns sessions to Ready: forget where the room was and what it hid.
create function private.session_reset() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.state='ready' and old.state in ('live','phones_down','open','closed') then new.hidden_keys:=array[]::text[]; new.shown_at:=null; end if;
 return new;
end $$;
create trigger session_reset before update of state on public.sessions for each row execute function private.session_reset();

-- Whatever path changes the shown step (controls, closing, practice reset), the
-- spotlight clears and the step's own hidden set comes with it.
create function private.room_shown() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.live_session_id is distinct from old.live_session_id then
  new.spotlight_key:=null;
  new.hidden_keys:=coalesce((select s.hidden_keys from public.sessions s where s.id=new.live_session_id),array[]::text[]);
  new.hidden_ids:=coalesce((select array_agg(x.id order by x.id) from public.submissions x where x.session_id=new.live_session_id and x.hidden and not x.deleted),array[]::uuid[]);
 end if;
 return new;
end $$;
create trigger room_shown before update on public.room_states for each row execute function private.room_shown();

create function private.live_results_for(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
  with active as (
    select s.* from public.submissions s
    where s.engagement_id=p_engagement and s.session_id=p_session and not s.deleted and not s.withdrawn and not s.hidden
  ), items as (
    select active.attendee_id,a->>'key' as key,a->>'text' as text from active cross join lateral jsonb_array_elements(active.answers) a
    where not (a->>'key'=any(coalesce(p_hidden,array[]::text[])))
  ), words as (
    select key,min(text) as label,count(*)::integer as count from items
    where exists(select 1 from public.sessions x where x.id=p_session and x.interaction='word_cloud') group by key
  ), sized as (select *,max(count) over() as maximum from words)
  select jsonb_build_object('total',(select count(*) from items),'people',(select count(distinct attendee_id) from items),'words',coalesce((select jsonb_agg(jsonb_build_object(
      'key',key,'text',label,'count',count,'size',case when maximum<=1 then 56 else 56+112*(sqrt(count)-1)/(sqrt(maximum)-1) end,
      'level',case when count=maximum and count>1 then 'leader' when count>1 then 'repeated' else 'single' end) order by key) from sized),'[]'::jsonb))
$$;
create or replace function private.live_results(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.live_results_for(r.engagement_id,r.live_session_id,r.hidden_keys) from public.room_states r where r.engagement_id=p_engagement
$$;

-- Shared state now carries the item-key spotlight and hidden words. Still no
-- planning fields, notes, depth, actors or identities.
create or replace function private.live_public_state(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('state',jsonb_build_object('engagement_id',r.engagement_id,'live_session_id',r.live_session_id,'tv_content',r.tv_content,'phones_down',r.phones_down,'burst_ends_at',r.burst_ends_at,'spotlight_id',r.spotlight_id,'spotlight_key',r.spotlight_key,'hidden_ids',r.hidden_ids,'hidden_keys',r.hidden_keys,'remote_holder_id',r.remote_holder_id,'team_led_block_id',r.team_led_block_id,'show_tv_on_phones',r.show_tv_on_phones,'phone_refresh_version',r.phone_refresh_version,'results',r.results,'version',r.version),'session',case when s.id is not null then jsonb_build_object(
 'id',s.id,'title',s.title,'interaction',s.interaction,'prompt',private.fill_years(s.prompt,e.base_year),'state',s.state,'revision',s.revision,'base_year',e.base_year,
 'max_sends',s.max_sends,'max_characters',s.max_characters,'max_words',s.max_words,'settings',jsonb_build_object('anonymous',true,'burst_minutes',s.settings->'burst_minutes','join_strip',s.settings->'join_strip')) end)||private.tv_room_info(p_engagement)
 from public.room_states r join public.engagements e on e.id=r.engagement_id left join public.sessions s on s.id=r.live_session_id and not s.deleted
 where r.engagement_id=p_engagement and not r.deleted
$$;

create function private.visible_answers(p_answers jsonb,p_hidden text[]) returns jsonb language sql immutable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(a order by n),'[]'::jsonb) from jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) with ordinality t(a,n)
 where not (a->>'key'=any(coalesce(p_hidden,array[]::text[])))
$$;

create or replace function private.live_snapshot(p_engagement uuid,p_after uuid,p_version bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare role text:=private.live_role(p_engagement); r public.room_states; page jsonb; next_id uuid;
begin
  if role is null then return jsonb_build_object('status','denied'); end if;
  select * into r from public.room_states where engagement_id=p_engagement and not deleted;
  if not found then return jsonb_build_object('status','missing'); end if;
  if p_version is not null and p_version<>r.version then return jsonb_build_object('status','changed','version',r.version); end if;
  if p_after is not null and p_version is null then return jsonb_build_object('status','invalid_request'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'session_id',session_id,'text',text,'answers',private.visible_answers(answers,r.hidden_keys),'revision',revision,'created_at',created_at) order by id),'[]'::jsonb)
    into page from (select s.* from public.submissions s where s.engagement_id=p_engagement and s.session_id=r.live_session_id
      and not s.deleted and not s.withdrawn and not s.hidden and (p_after is null or s.id>p_after) order by s.id limit 501) page_rows;
  if jsonb_array_length(page)>500 then next_id:=(page->499->>'id')::uuid; page:=page-500; end if;
  return private.live_public_state(p_engagement)||jsonb_build_object('status','ok','role',role,'topic',private.live_topic(p_engagement),'version',r.version,'answers',page,'next',next_id,
    'phone_depth',case when role='participant' then (select private.fill_years(s.phone_depth,e.base_year) from public.sessions s join public.engagements e on e.id=s.engagement_id where s.id=r.live_session_id and not s.deleted) else null end,
    'server_time',clock_timestamp());
end $$;

-- Hidden words never travel in an answer patch.
create or replace function private.live_broadcast() returns trigger
language plpgsql security definer set search_path='' as $$
declare t private.room_transport; fingerprint text; topic text; patch jsonb;
begin
  select * into t from private.room_transport where engagement_id=new.engagement_id for update;
  fingerprint:=private.live_fingerprint(new.engagement_id);
  if t.access_fingerprint<>fingerprint or new.deleted then
    perform private.live_send('live:'||new.engagement_id||':'||t.channel_id,'rekey',jsonb_build_object('engagement',new.engagement_id,'version',new.version));
    update private.room_transport set channel_id=gen_random_uuid(),access_fingerprint=fingerprint where engagement_id=new.engagement_id returning * into t;
  end if;
  if new.deleted then return new; end if;
  topic:='live:'||new.engagement_id||':'||t.channel_id;
  patch:=nullif(current_setting('clearway.live_answer',true),'')::jsonb;
  if patch is not null and jsonb_typeof(patch->'answers')='array' then patch:=jsonb_set(patch,'{answers}',private.visible_answers(patch->'answers',new.hidden_keys)); end if;
  perform private.live_send(topic,'room',private.live_public_state(new.engagement_id)||jsonb_build_object('answer',patch));
  return new;
end $$;

-- Facilitator-only notices share the room's rotating channel generation.
create function private.fac_topic(p_engagement uuid) returns text
language sql stable security definer set search_path='' as $$
  select 'fac:'||t.engagement_id||':'||t.channel_id from private.room_transport t
  where t.engagement_id=p_engagement and not t.deleted and private.live_role(p_engagement)='facilitator'
$$;
create function private.can_receive_fac(p_topic text) returns boolean
language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(select 1 from private.room_transport t
    where not t.deleted and p_topic='fac:'||t.engagement_id||':'||t.channel_id and private.live_role(t.engagement_id)='facilitator')
$$;
create policy clearway_fac_receive on realtime.messages for select to authenticated
using (extension='broadcast' and (select private.can_receive_fac(realtime.topic())));
-- A notice is a hint. The status read is authoritative, so a failed notice never
-- rolls back the press or the TV's acknowledgement.
create function private.fac_notice(p_engagement uuid,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare topic text;
begin
  select 'fac:'||engagement_id||':'||channel_id into topic from private.room_transport where engagement_id=p_engagement and not deleted;
  if topic is null then return; end if;
  perform private.live_send(topic,'fac',p_payload||jsonb_build_object('at',clock_timestamp()));
exception when raise_exception then return;
end $$;

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
  if p_version>tv.confirmed_version then
    perform private.fac_notice(p_engagement,jsonb_build_object('kind','ack','screen',tv.device_id,'version',p_version));
  end if;
  return true;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then return false;
end $$;

-- Late answers: a live step that the room has moved past is 'open' until its part
-- closes. Phones down and bursts apply only to the step on the TV.
create or replace function private.live_submit(p_engagement uuid,p_id uuid,p_session uuid,p_revision integer,p_action text,p_text text,p_sent timestamptz,p_queued timestamptz,p_uncertainty double precision) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; previous public.submissions; who uuid; parts text[]; item text; key text; words text[]; answers jsonb:='[]'::jsonb; received timestamptz:=clock_timestamp(); accepting boolean;
begin
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
  accepting:=case
    when r.live_session_id=p_session then s.state='live' and not r.phones_down and (r.burst_ends_at is null or r.burst_ends_at>received)
    else s.state='open' and s.mode='live' end;
  if not accepting and not (p_action='submit' and p_queued is not null and s.state='closed' and s.closed_at is not null
      and p_queued<=s.closed_at and p_sent<=s.closed_at and received<=s.closed_at+interval '2 minutes') then return jsonb_build_object('status','closed'); end if;
  if p_action='withdraw' then answers:=previous.answers; p_text:=previous.text;
  else
    if p_text is null or length(btrim(p_text))=0 or length(p_text)>1404 then return jsonb_build_object('status','invalid_answer'); end if;
    parts:=case when s.interaction='word_cloud' then string_to_array(p_text,',') else array[p_text] end;
    if cardinality(parts)>5 then return jsonb_build_object('status','limit'); end if;
    foreach item in array parts loop
      item:=btrim(item);
      if length(item)=0 or length(item)>s.max_characters then return jsonb_build_object('status','limit'); end if;
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

-- The run of show carries each step's segment.
create or replace function private.show_read(p_engagement uuid,p_after uuid,p_version text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare version text; page jsonb; next_id uuid;
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 version:=private.show_version(p_engagement);
 if p_version is not null and version<>p_version then return jsonb_build_object('status','changed'); end if;
 if p_after is not null and p_version is null then return jsonb_build_object('status','invalid_request'); end if;
 select coalesce(jsonb_agg(to_jsonb(rows) order by id),'[]'::jsonb) into page from (
   select s.id,s.engagement_id,s.title,s.part,s.position,s.planned_start,s.planned_minutes,s.mode,s.opens_at,s.closes_at,s.interaction,
     s.prompt,s.phone_depth,s.segment,s.shown_at,s.closed_at,s.settings,s.lands_in,s.state,s.max_sends,s.max_characters,s.max_words,s.revision,coalesce(n.notes,'') as notes
   from public.sessions s left join private.session_notes n on n.session_id=s.id and not n.deleted
   where s.engagement_id=p_engagement and not s.deleted and (p_after is null or s.id>p_after) order by s.id limit 501
 ) rows;
 if jsonb_array_length(page)>500 then next_id:=(page->499->>'id')::uuid; page:=page-500; end if;
 return jsonb_build_object('status','ok','version',version,'sessions',page,'next',next_id,'context',(
  select jsonb_build_object('id',e.id,'title',e.title,'church',c.name,'timezone',c.timezone,'base_year',e.base_year,'closed',e.status='closed')
  from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_engagement));
end $$;

create or replace function private.show_write(p_engagement uuid,p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; saved public.sessions; requested public.sessions; sid uuid; notes text; ids uuid[]; n integer; entry jsonb;
begin
 -- All writers use reset -> room -> session lock order. Recheck native access after waiting.
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if jsonb_typeof(p_input) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 if p_action='reorder' then
  if p_input->>'part' not in ('Pre-call','Day 1','Day 2','Follow-up') or jsonb_typeof(p_input->'order') is distinct from 'array' then return jsonb_build_object('status','invalid_request'); end if;
  select array_agg((v->>'id')::uuid order by ord) into ids from jsonb_array_elements(p_input->'order') with ordinality t(v,ord);
  select count(*) into n from public.sessions where engagement_id=p_engagement and part=p_input->>'part' and not deleted;
  if coalesce(cardinality(ids),0)<>n or (select count(distinct v) from unnest(ids)v)<>n then return jsonb_build_object('status','conflict'); end if;
  for entry in select v from jsonb_array_elements(p_input->'order')v loop
   if not exists(select 1 from public.sessions where id=(entry->>'id')::uuid and engagement_id=p_engagement and part=p_input->>'part'
     and not deleted and revision=(entry->>'revision')::integer) then return jsonb_build_object('status','conflict'); end if;
  end loop;
  update public.sessions x set position=t.ord-1 from unnest(ids) with ordinality t(id,ord) where x.id=t.id;
 elsif p_action in ('save','remove') then
  sid:=(p_input->>'id')::uuid;
  if sid is null then return jsonb_build_object('status','invalid_request'); end if;
  select * into s from public.sessions where id=sid for update;
  if found then
   if s.engagement_id<>p_engagement or s.deleted or (p_input->>'revision')::integer is distinct from s.revision then return jsonb_build_object('status','conflict'); end if;
  elsif p_action='remove' or p_input->>'revision' is not null then return jsonb_build_object('status','conflict'); end if;
  if p_action='remove' then
   if s.id=r.live_session_id or s.state in ('live','phones_down','open') then return jsonb_build_object('status','running'); end if;
   update public.sessions set deleted=true where id=sid;
   update private.session_notes set deleted=true where session_id=sid;
  else
   -- Populate only known, validated columns. Client never supplies position, room, audit or closed_at.
   requested:=jsonb_populate_record(null::public.sessions,p_input);
   notes:=p_input->>'notes';
   if requested.title is null or length(btrim(requested.title)) not between 1 and 200 or requested.part is null or requested.part not in ('Pre-call','Day 1','Day 2','Follow-up')
    or requested.mode is null or requested.mode not in ('live','self_paced') or requested.interaction is null or requested.interaction not in ('word_cloud','wall','content')
    or requested.state is null or requested.state not in ('draft','ready','open','live','phones_down','closed')
    or requested.prompt is null or length(requested.prompt)>4000 or requested.phone_depth is null or length(requested.phone_depth)>20000
    or notes is null or length(notes)>30000 or length(btrim(coalesce(requested.segment,'')))>100 or requested.lands_in is null or length(requested.lands_in)>200
    or requested.planned_minutes is null or requested.planned_minutes not between 1 and 1440
    or requested.max_sends is null or requested.max_sends not between 1 and 100
    or requested.max_characters is null or requested.max_characters not between 1 and 280
    or requested.max_words is null or requested.max_words not between 1 and 50
    or requested.settings is null or requested.settings->'anonymous' is distinct from 'true'::jsonb
    or requested.settings->'burst_minutes' is null or requested.settings->'burst_minutes' not in ('3'::jsonb,'4'::jsonb,'5'::jsonb)
    or jsonb_typeof(requested.settings->'join_strip') is distinct from 'boolean'
    or (requested.planned_start is not null and not isfinite(requested.planned_start))
    or (requested.opens_at is not null and not isfinite(requested.opens_at)) or (requested.closes_at is not null and not isfinite(requested.closes_at))
    or (requested.mode='self_paced' and (requested.opens_at is null or requested.closes_at is null or requested.opens_at>=requested.closes_at))
   then return jsonb_build_object('status','invalid_request'); end if;
   if (s.id is null and requested.state not in ('draft','ready'))
     or (s.state in ('draft','ready') and requested.state not in ('draft','ready'))
     or (s.state not in ('draft','ready') and requested.state<>s.state) then return jsonb_build_object('status','invalid_state'); end if;
   if s.id is not null and (s.id=r.live_session_id or s.state in ('live','phones_down','open') or exists(select 1 from public.submissions where session_id=sid and not deleted))
    and (requested.interaction<>s.interaction or requested.mode<>s.mode) then return jsonb_build_object('status','running'); end if;
   if s.id is null then
    insert into public.sessions(id,engagement_id,segment,title,part,position,planned_start,planned_minutes,mode,opens_at,closes_at,interaction,prompt,phone_depth,state,max_sends,max_characters,max_words,settings,lands_in)
    values(sid,p_engagement,btrim(coalesce(requested.segment,'')),btrim(requested.title),requested.part,coalesce((select max(position)+1 from public.sessions where engagement_id=p_engagement and not deleted),0),requested.planned_start,requested.planned_minutes,requested.mode,requested.opens_at,requested.closes_at,requested.interaction,requested.prompt,requested.phone_depth,requested.state,requested.max_sends,requested.max_characters,requested.max_words,
    jsonb_build_object('anonymous',true,'burst_minutes',requested.settings->'burst_minutes','join_strip',requested.settings->'join_strip'),requested.lands_in) returning * into saved;
   else
    update public.sessions set segment=btrim(coalesce(requested.segment,'')),title=btrim(requested.title),part=requested.part,planned_start=requested.planned_start,planned_minutes=requested.planned_minutes,mode=requested.mode,opens_at=requested.opens_at,closes_at=requested.closes_at,interaction=requested.interaction,prompt=requested.prompt,phone_depth=requested.phone_depth,state=requested.state,max_sends=requested.max_sends,max_characters=requested.max_characters,max_words=requested.max_words,
    settings=jsonb_build_object('anonymous',true,'burst_minutes',requested.settings->'burst_minutes','join_strip',requested.settings->'join_strip'),lands_in=requested.lands_in where id=sid returning * into saved;
   end if;
   insert into private.session_notes(session_id,engagement_id,notes) values(sid,p_engagement,notes)
    on conflict(session_id) do update set notes=excluded.notes,deleted=false;
  end if;
 else return jsonb_build_object('status','invalid_request'); end if;
 -- One committed Save, one verified private broadcast, never per keystroke.
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement;
 return jsonb_build_object('status','ok','id',sid,'revision',saved.revision);
exception when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then
 return jsonb_build_object('status','invalid_request');
end $$;

-- The one writer for every live control. Room before sessions, as every writer.
create function private.room_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 r public.room_states; cur public.sessions; target public.sessions; anchor public.sessions; done private.room_controls;
 v_live uuid; v_content text; v_down boolean; v_burst timestamptz; v_spot text; v_keys text[]; v_ids uuid[]; v_refresh bigint; v_tv boolean;
 item text; minutes integer; who text; navigation boolean; touches boolean:=true; room_changed boolean:=true; size text; v_part text;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>p_action then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','version',r.version);
 end if;
 navigation:=p_action in ('go_live','next','back','nothing_live','reopen');
 -- A press made against a room that has already moved is refused, never replayed.
 if p_action not in ('refresh_phones','tv_on_phones','room_size','close_part') then
  if not (p ? 'from') or (p->>'from' is not null and p->>'from' !~ '^[0-9a-f-]{36}$') then return jsonb_build_object('status','invalid_request'); end if;
  if (p->>'from')::uuid is distinct from r.live_session_id then
   select c.name into who from private.room_controls x join public.clearway_users c on c.id=x.actor_id
    where x.engagement_id=p_engagement and x.room_version<=r.version order by x.created_at desc limit 1;
   return jsonb_build_object('status','moved','version',r.version,'live_session_id',r.live_session_id,
    'title',(select title from public.sessions where id=r.live_session_id),'by',split_part(btrim(coalesce(who,'')),' ',1));
  end if;
 end if;
 if r.live_session_id is not null then select * into cur from public.sessions where id=r.live_session_id and not deleted for update; end if;
 v_live:=r.live_session_id; v_content:=r.tv_content; v_down:=r.phones_down; v_burst:=r.burst_ends_at; v_spot:=r.spotlight_key;
 v_keys:=r.hidden_keys; v_ids:=r.hidden_ids; v_refresh:=r.phone_refresh_version; v_tv:=r.show_tv_on_phones;
 if v_burst is not null and v_burst<=clock_timestamp() then v_burst:=null; v_down:=v_live is not null; end if;

 if navigation then
  if p_action='go_live' then
   if p->>'session' is null or p->>'session' !~ '^[0-9a-f-]{36}$' then return jsonb_build_object('status','invalid_request'); end if;
   select * into target from public.sessions where id=(p->>'session')::uuid and engagement_id=p_engagement and not deleted for update;
   if not found or target.mode<>'live' then return jsonb_build_object('status','missing'); end if;
   if target.id=cur.id then return jsonb_build_object('status','unchanged','version',r.version); end if;
   if target.state='draft' then return jsonb_build_object('status','not_ready'); end if;
  elsif p_action in ('next','back') then
   if cur.id is not null then anchor:=cur;
   else select * into anchor from public.sessions where engagement_id=p_engagement and not deleted and shown_at is not null order by shown_at desc,id limit 1; end if;
   if p_action='back' and cur.id is null and anchor.id is not null then target:=anchor;
   elsif p_action='next' then
    select s.* into target from public.sessions s where s.engagement_id=p_engagement and not s.deleted and s.mode='live' and s.state<>'draft'
     and (anchor.id is null or (private.part_order(s.part),s.position,s.id)>(private.part_order(anchor.part),anchor.position,anchor.id))
     order by private.part_order(s.part),s.position,s.id limit 1;
   elsif anchor.id is not null then
    select s.* into target from public.sessions s where s.engagement_id=p_engagement and not s.deleted and s.mode='live' and s.state<>'draft'
     and (private.part_order(s.part),s.position,s.id)<(private.part_order(anchor.part),anchor.position,anchor.id)
     order by private.part_order(s.part) desc,s.position desc,s.id desc limit 1;
   end if;
   if target.id is null then return jsonb_build_object('status','no_session'); end if;
   perform 1 from public.sessions where id=target.id for update;
  elsif p_action='nothing_live' then
   if cur.id is null then return jsonb_build_object('status','unchanged','version',r.version); end if;
  elsif p_action='reopen' then
   if cur.id is null or cur.state<>'closed' then return jsonb_build_object('status','invalid_state'); end if;
  end if;
  if p_action<>'reopen' then
   -- The step left behind stays open for late answers while the room is in its segment.
   if cur.id is not null and cur.state in ('live','phones_down') then update public.sessions set state='open' where id=cur.id; end if;
   if cur.id is not null then anchor:=cur;
   else select * into anchor from public.sessions where engagement_id=p_engagement and not deleted and shown_at is not null order by shown_at desc,id limit 1; end if;
   -- Moving to a step outside that segment ends it. Nothing live (a break) does not.
   if anchor.id is not null and p_action<>'nothing_live' and target.id is distinct from anchor.id
     and (anchor.segment='' or target.segment is distinct from anchor.segment or target.part is distinct from anchor.part) then
    update public.sessions set state='closed',closed_at=clock_timestamp()
     where engagement_id=p_engagement and not deleted and mode='live' and state in ('open','live','phones_down')
      and (id=anchor.id or (anchor.segment<>'' and sessions.segment=anchor.segment and sessions.part=anchor.part));
   end if;
  end if;
  if p_action='reopen' then
   update public.sessions set state='live',closed_at=null,shown_at=clock_timestamp() where id=cur.id;
   v_down:=false; v_burst:=null;
  elsif p_action='nothing_live' then
   v_live:=null; v_content:='holding'; v_down:=false; v_burst:=null;
  else
   -- A closed part's step is shown read-only until Reopen.
   update public.sessions set state=case when state='closed' then 'closed' else 'live' end,shown_at=clock_timestamp() where id=target.id;
   v_live:=target.id; v_content:='session'; v_down:=false; v_burst:=null;
  end if;
  if v_live is distinct from r.live_session_id then
   v_spot:=null;
   v_keys:=coalesce((select hidden_keys from public.sessions where id=v_live),array[]::text[]);
   v_ids:=coalesce((select array_agg(x.id order by x.id) from public.submissions x where x.session_id=v_live and x.hidden and not x.deleted),array[]::uuid[]);
  end if;
 elsif p_action in ('start_burst','extend_burst','end_burst','phones_down','open_phones') then
  if cur.id is null or cur.interaction not in ('word_cloud','wall') or cur.state not in ('live','phones_down') then return jsonb_build_object('status','invalid_state'); end if;
  if p_action='start_burst' then
   minutes:=case when p->>'minutes' in ('3','4','5') then (p->>'minutes')::integer end;
   if minutes is null then return jsonb_build_object('status','invalid_request'); end if;
   if v_burst is not null then return jsonb_build_object('status','invalid_state'); end if;
   v_burst:=clock_timestamp()+make_interval(mins=>minutes); v_down:=false;
  elsif p_action='extend_burst' then
   if v_burst is null then return jsonb_build_object('status','invalid_state'); end if;
   v_burst:=least(v_burst+interval '1 minute',clock_timestamp()+interval '20 minutes');
  elsif p_action in ('end_burst','phones_down') then
   if (p_action='end_burst' and v_burst is null) or (p_action='phones_down' and v_down) then return jsonb_build_object('status','invalid_state'); end if;
   v_burst:=null; v_down:=true;
  else
   if not v_down then return jsonb_build_object('status','invalid_state'); end if;
   v_down:=false; v_burst:=null;
  end if;
  update public.sessions set state=case when v_down then 'phones_down' else 'live' end where id=cur.id and state is distinct from case when v_down then 'phones_down' else 'live' end;
 elsif p_action in ('spotlight','clear_spotlight','hide','unhide') then
  if cur.id is null or cur.interaction not in ('word_cloud','wall') then return jsonb_build_object('status','invalid_state'); end if;
  if p_action='clear_spotlight' then
   if v_spot is null then return jsonb_build_object('status','unchanged','version',r.version); end if;
   v_spot:=null;
  else
   item:=p->>'item';
   if item is null or length(item) not between 1 and 200 then return jsonb_build_object('status','invalid_request'); end if;
   if cur.interaction='wall' then
    if item !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or not exists(select 1 from public.submissions where id=item::uuid and session_id=cur.id and not deleted and not withdrawn) then return jsonb_build_object('status','missing'); end if;
   elsif not exists(select 1 from public.submissions x cross join lateral jsonb_array_elements(x.answers) a
     where x.session_id=cur.id and not x.deleted and not x.withdrawn and a->>'key'=item) then return jsonb_build_object('status','missing'); end if;
   if p_action='spotlight' then
    if item=any(v_keys) or (cur.interaction='wall' and item::uuid=any(v_ids)) then return jsonb_build_object('status','hidden'); end if;
    v_spot:=item;
   elsif cur.interaction='wall' then
    update public.submissions set hidden=(p_action='hide') where id=item::uuid and hidden is distinct from (p_action='hide');
    if not found then return jsonb_build_object('status','unchanged','version',r.version); end if;
    v_ids:=coalesce((select array_agg(x.id order by x.id) from public.submissions x where x.session_id=cur.id and x.hidden and not x.deleted),array[]::uuid[]);
    perform set_config('clearway.live_answer',(select jsonb_build_object('id',x.id,'session_id',x.session_id,'revision',x.revision,'withdrawn',false,'hidden',x.hidden,
     'text',case when not x.hidden then x.text end,'answers',case when not x.hidden then x.answers else '[]'::jsonb end) from public.submissions x where x.id=item::uuid)::text,true);
   else
    if (p_action='hide')=(item=any(v_keys)) then return jsonb_build_object('status','unchanged','version',r.version); end if;
    v_keys:=case when p_action='hide' then array_append(array_remove(v_keys,item),item) else array_remove(v_keys,item) end;
    update public.sessions set hidden_keys=v_keys where id=cur.id;
   end if;
   if p_action='hide' and v_spot=item then v_spot:=null; end if;
  end if;
 elsif p_action='refresh_phones' then v_refresh:=v_refresh+1;
 elsif p_action='tv_on_phones' then
  if jsonb_typeof(p->'on') is distinct from 'boolean' then return jsonb_build_object('status','invalid_request'); end if;
  v_tv:=(p->>'on')::boolean;
 elsif p_action='room_size' then
  size:=p->>'size';
  if size is null or size not in ('very_small','small','medium','large','very_large') then return jsonb_build_object('status','invalid_request'); end if;
  -- The appearance trigger raises the version and broadcasts this saved edit.
  update public.engagements set settings=settings||jsonb_build_object('room_size',size) where id=p_engagement and settings->>'room_size' is distinct from size;
  if not found then return jsonb_build_object('status','unchanged','version',r.version); end if;
  touches:=false;
 elsif p_action='close_part' then
  v_part:=p->>'part';
  if v_part is null or v_part not in ('Pre-call','Day 1','Day 2','Follow-up') then return jsonb_build_object('status','invalid_request'); end if;
  perform 1 from public.sessions where engagement_id=p_engagement and part=p->>'part' and not deleted and mode='live' order by id for update;
  update public.sessions set state='closed',closed_at=clock_timestamp()
   where engagement_id=p_engagement and part=p->>'part' and not deleted and mode='live' and state in ('live','phones_down','open');
  if not found then return jsonb_build_object('status','unchanged','version',r.version); end if;
  -- Ending the day while one of its steps is on the TV goes to the holding screen.
  if cur.part=v_part then v_live:=null; v_content:='holding'; v_down:=false; v_burst:=null; v_spot:=null; v_keys:=array[]::text[]; v_ids:=array[]::uuid[];
  else room_changed:=false; end if;
 else return jsonb_build_object('status','invalid_request');
 end if;

 if touches then
  -- One update, one version, one verified broadcast. close_part on an earlier
  -- day still raises a version so every surface reads the closed steps.
  update public.room_states set live_session_id=v_live,tv_content=v_content,phones_down=v_down,burst_ends_at=v_burst,spotlight_key=v_spot,
   hidden_keys=v_keys,hidden_ids=v_ids,phone_refresh_version=v_refresh,show_tv_on_phones=v_tv,
   results=private.live_results_for(p_engagement,v_live,v_keys) where engagement_id=p_engagement returning * into r;
 else select * into r from public.room_states where engagement_id=p_engagement;
 end if;
 perform set_config('clearway.live_answer','',true);
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,private.clearway_user_id(),p_action,v_live,r.version,clock_timestamp());
 select split_part(btrim(name),' ',1) into who from public.clearway_users where id=private.clearway_user_id();
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action',p_action,'by',who,'version',r.version,'changed',room_changed));
 return jsonb_build_object('status','ok','version',r.version);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

-- A burst ends on the server, whichever authorized client notices first. Any
-- room member may ask; the database decides from its own clock.
create function private.live_tick(p_engagement uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; now_at timestamptz;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or private.live_role(p_engagement) is null then return jsonb_build_object('status','denied'); end if;
 now_at:=clock_timestamp();
 if r.burst_ends_at is null then return jsonb_build_object('status','none','version',r.version); end if;
 if r.burst_ends_at>now_at then return jsonb_build_object('status','early','ms',ceil(extract(epoch from r.burst_ends_at-now_at)*1000)::integer); end if;
 update public.sessions set state='phones_down' where id=r.live_session_id and state='live';
 update public.room_states set phones_down=true,burst_ends_at=null where engagement_id=p_engagement returning * into r;
 insert into private.room_controls(id,engagement_id,action,session_id,room_version,created_at) values(gen_random_uuid(),p_engagement,'burst_ended',r.live_session_id,r.version,clock_timestamp());
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','action','burst_ended','version',r.version,'changed',true));
 return jsonb_build_object('status','ended','version',r.version);
end $$;

-- Everything private the control surface and remote need beside the room event.
create function private.control_status(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.room_states; s public.sessions; items jsonb;
begin
 if not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','missing'); end if;
 select * into s from public.sessions where id=r.live_session_id and not deleted;
 if s.interaction='word_cloud' then
  select coalesce(jsonb_agg(jsonb_build_object('key',key,'text',label,'count',n,'hidden',key=any(r.hidden_keys)) order by key=any(r.hidden_keys),n desc,label),'[]'::jsonb) into items
  from (select a->>'key' as key,min(a->>'text') as label,count(*)::integer as n from public.submissions x cross join lateral jsonb_array_elements(x.answers) a
   where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden group by a->>'key' limit 500) w;
 elsif s.interaction='wall' then
  select coalesce(jsonb_agg(jsonb_build_object('key',id,'text',text,'count',1,'hidden',hidden) order by hidden,server_received_at desc,id),'[]'::jsonb) into items
  from (select id,text,hidden,server_received_at from public.submissions where session_id=s.id and not deleted and not withdrawn order by server_received_at desc,id limit 500) w;
 end if;
 return jsonb_build_object('status','ok','server_time',clock_timestamp(),'version',r.version,'fac_topic',private.fac_topic(p_engagement),
  'screens',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'label',d.label,'confirmed_version',coalesce(t.confirmed_version,0),'last_seen_at',t.last_seen_at,
    'connected',coalesce(t.last_seen_at>clock_timestamp()-interval '12 seconds',false)) order by d.paired_at,d.id)
   from private.tv_devices d left join private.live_tv_sessions t on t.device_id=d.id and t.revoked_at is null and not t.deleted
   where d.engagement_id=p_engagement and not d.deleted),'[]'::jsonb),
  'counts',jsonb_build_object('signed_in',coalesce((private.tv_room_info(p_engagement)->'presence'->>'count')::integer,0),
   'answered',(select count(distinct attendee_id) from public.submissions where session_id=s.id and not deleted and not withdrawn),
   'answers',coalesce((r.results->>'total')::integer,0),
   'hidden',cardinality(r.hidden_keys)+cardinality(r.hidden_ids),
   'latency_p95_ms',(select round(percentile_cont(0.95) within group (order by extract(epoch from l.tv_received_at-l.phone_sent_at)*1000))::integer
     from (select l.* from private.latency_logs l join public.submissions x on x.id=l.submission_id
       where l.engagement_id=p_engagement and l.tv_received_at is not null and not l.deleted and x.queued_at is null order by l.tv_received_at desc limit 200) l)),
  'items',coalesce(items,'[]'::jsonb),
  'controls',coalesce((select jsonb_agg(c order by c->>'at' desc) from (select jsonb_build_object('id',x.id,'action',x.action,'version',x.room_version,'at',x.created_at,
    'by',split_part(btrim(coalesce(u.name,'')),' ',1)) c from private.room_controls x left join public.clearway_users u on u.id=x.actor_id
    where x.engagement_id=p_engagement and not x.deleted order by x.created_at desc limit 10) recent),'[]'::jsonb));
end $$;

create function public.room_control(p_engagement uuid,p_id uuid,p_action text,p jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select private.room_control(p_engagement,p_id,p_action,p) $$;
create function public.live_tick(p_engagement uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.live_tick(p_engagement) $$;
create function public.control_status(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.control_status(p_engagement) $$;
revoke all on function private.part_order(text),private.session_reset(),private.room_shown(),private.live_results_for(uuid,uuid,text[]),private.visible_answers(jsonb,text[]),
 private.fac_topic(uuid),private.can_receive_fac(text),private.fac_notice(uuid,jsonb),private.room_control(uuid,uuid,text,jsonb),private.live_tick(uuid),private.control_status(uuid),
 public.room_control(uuid,uuid,text,jsonb),public.live_tick(uuid),public.control_status(uuid) from public,anon,authenticated;
grant execute on function private.can_receive_fac(text),private.room_control(uuid,uuid,text,jsonb),private.live_tick(uuid),private.control_status(uuid),
 public.room_control(uuid,uuid,text,jsonb),public.live_tick(uuid),public.control_status(uuid) to authenticated;
commit;
