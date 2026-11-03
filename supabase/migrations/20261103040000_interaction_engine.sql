-- Milestone 3, step 1: the room engine for every interaction, and content screens.
-- Live only, after merge and Chris's approval. No session is started and no data is seeded.
--
-- Each interaction kind registers itself in private.interaction_kinds and supplies its
-- own functions, named by kind, so later steps add a kind without redefining a shared one:
--   private.results_<kind>(engagement, session, hidden keys) -> jsonb  (total and people always)
--   private.parse_<kind>(session, text, value)                -> jsonb  ({status,text,answers,value})
--   private.options_<kind>(options, engagement)                -> jsonb  (normalized, or null if invalid)
--   private.items_<kind>(session, hidden keys)                 -> jsonb  (control surface item list)
-- The dispatchers below find them by name. A kind without a function gets the default.
begin;

create table private.interaction_kinds (
 kind text primary key check(kind ~ '^[a-z][a-z_]{1,29}$'),
 label text not null check(length(label) between 1 and 60),
 input boolean not null,              -- takes answers on phones
 one_per_person boolean not null,     -- a person's latest answer replaces their earlier one
 counts text not null check(counts in ('people','answers','none')), -- "8 answering" or "23 answers"
 structured boolean not null,         -- shows its empty structure before anyone answers
 shares_answers boolean not null,     -- false: answers never reach the TV or other phones (INT-09)
 spotlight text not null check(spotlight in ('none','id','key')), -- what Spotlight and Hide address
 named text not null check(named in ('never','always','setting')),
 position integer not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false
);
alter table private.interaction_kinds enable row level security;
alter table private.interaction_kinds force row level security;
revoke all on private.interaction_kinds from public,anon,authenticated;
grant select,insert,update,delete on private.interaction_kinds to service_role;
create trigger touch_record before update on private.interaction_kinds for each row execute function private.touch_live_record('kind');
insert into private.interaction_kinds(kind,label,input,one_per_person,counts,structured,shares_answers,spotlight,named,position) values
 ('word_cloud','Word cloud',true,false,'answers',false,true,'key','never',10),
 ('wall','Open text',true,false,'answers',false,true,'id','never',20),
 ('content','Content screen',false,false,'none',false,true,'none','never',1000);

alter table public.sessions drop constraint sessions_interaction_check;
alter table public.sessions add constraint sessions_interaction_kind foreign key(interaction) references private.interaction_kinds(kind);
create index sessions_interaction_idx on public.sessions(interaction);
-- Per-interaction settings: choices, scale ends, statements, grid axes, content screen fields.
alter table public.sessions add column options jsonb not null default '{}'
 check(jsonb_typeof(options)='object' and pg_column_size(options)<=65536);
-- Named answers are a per-kind rule now (sign together is named by design).
alter table public.sessions drop constraint sessions_settings_check;
alter table public.sessions add constraint sessions_settings_check check(jsonb_typeof(settings)='object' and settings ?& array['anonymous','burst_minutes','join_strip']
 and jsonb_typeof(settings->'anonymous')='boolean' and settings->'burst_minutes' in ('3'::jsonb,'4'::jsonb,'5'::jsonb) and jsonb_typeof(settings->'join_strip')='boolean');

-- Structured answers (a choice, a scale value, a ranking, points, a placement) ride in value.
-- A replaced answer is withdrawn and names the answer that replaced it.
alter table public.submissions add column value jsonb check(value is null or pg_column_size(value)<=16384);
alter table public.submissions add column replaced_by uuid;
create index submissions_person_idx on public.submissions(session_id,attendee_id) where not deleted and not withdrawn;

-- Images for the image or document page, under the same access rules as the room.
create table private.session_media (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 mime text not null check(mime in ('image/png','image/jpeg','image/webp')),
 width integer not null check(width between 1 and 8192),
 height integer not null check(height between 1 and 8192),
 data bytea not null check(octet_length(data) between 1 and 4194304),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create index session_media_session_idx on private.session_media(session_id,engagement_id);
create index session_media_engagement_idx on private.session_media(engagement_id);
alter table private.session_media enable row level security;
alter table private.session_media force row level security;
revoke all on private.session_media from public,anon,authenticated;
grant select,insert,update,delete on private.session_media to service_role;
create trigger touch_record before update on private.session_media for each row execute function private.touch_live_record('id');

create function private.kind(p_kind text) returns private.interaction_kinds
language sql stable security definer set search_path='' as $$ select * from private.interaction_kinds where kind=p_kind and not deleted $$;

create function private.kind_function(p_prefix text,p_kind text,p_args text) returns text
language sql stable security definer set search_path='' as $$
 select case when p_kind ~ '^[a-z][a-z_]{1,29}$' and to_regprocedure('private.'||p_prefix||'_'||p_kind||'('||p_args||')') is not null then 'private.'||p_prefix||'_'||p_kind end
$$;

-- ---------- Results, one function per kind ----------
create function private.results_word_cloud(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
  with active as (
    select s.* from public.submissions s
    where s.engagement_id=p_engagement and s.session_id=p_session and not s.deleted and not s.withdrawn and not s.hidden
  ), items as (
    select active.attendee_id,coalesce(active.server_received_at,active.created_at) as arrived,a->>'key' as key,a->>'text' as text from active cross join lateral jsonb_array_elements(active.answers) a
    where not (a->>'key'=any(coalesce(p_hidden,array[]::text[])))
  ), words as (select key,min(text) as label,count(*)::integer as count,min(arrived) as first from items group by key
  ), sized as (select *,max(count) over() as maximum,row_number() over(order by first,key) as arrival from words)
  select jsonb_build_object('total',(select count(*) from items),'people',(select count(distinct attendee_id) from items),'words',coalesce((select jsonb_agg(jsonb_build_object(
      'key',key,'text',label,'count',count,'size',case when maximum<=1 then 56 else 56+112*(sqrt(count)-1)/(sqrt(maximum)-1) end,
      'level',case when count=maximum and count>1 then 'leader' when count>1 then 'repeated' else 'single' end,'order',arrival) order by key) from sized),'[]'::jsonb))
$$;
create function private.results_wall(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('total',count(*),'people',count(distinct s.attendee_id),'words','[]'::jsonb)
  from public.submissions s cross join lateral jsonb_array_elements(s.answers) a
  where s.engagement_id=p_engagement and s.session_id=p_session and not s.deleted and not s.withdrawn and not s.hidden
    and not (a->>'key'=any(coalesce(p_hidden,array[]::text[])))
$$;

-- The dispatcher. Every result carries total and people, counted once on the server.
create or replace function private.live_results_for(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare k text; fn text; out jsonb;
begin
 select interaction into k from public.sessions where id=p_session and engagement_id=p_engagement and not deleted;
 fn:=private.kind_function('results',k,'uuid,uuid,text[]');
 if fn is null then return '{"total":0,"people":0,"words":[]}'::jsonb; end if;
 execute format('select %s($1,$2,$3)',fn) into out using p_engagement,p_session,coalesce(p_hidden,array[]::text[]);
 return jsonb_build_object('total',0,'people',0,'words','[]'::jsonb)||coalesce(out,'{}'::jsonb);
end $$;

-- ---------- Parsing answers, one function per kind ----------
-- Word cloud and wall keep milestone 2's limits and matching exactly.
create function private.parse_text_answers(p_session public.sessions,p_text text,p_cloud boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare parts text[]; item text; key text; words text[]; answers jsonb:='[]'::jsonb;
begin
 if p_text is null or length(btrim(p_text))=0 or length(p_text)>1404 then return jsonb_build_object('status','invalid_answer'); end if;
 parts:=case when p_cloud then string_to_array(p_text,',') else array[p_text] end;
 if cardinality(parts)>5 then return jsonb_build_object('status','limit'); end if;
 foreach item in array parts loop
  item:=btrim(item);
  if length(item)=0 or length(item)>p_session.max_characters then return jsonb_build_object('status','limit'); end if;
  if private.screen_text(item) then return jsonb_build_object('status','filtered'); end if;
  key:=btrim(regexp_replace(lower(item),'[^[:alnum:][:space:]]','','g'));
  words:=regexp_split_to_array(key,'\s+');
  if p_cloud then
   if cardinality(words)>p_session.max_words then return jsonb_build_object('status','limit'); end if;
   while cardinality(words)>1 and words[1]=any(array['a','an','the','in','my','our','of','to','for','on','at','with']) loop words:=words[2:]; end loop;
   for i in 1..cardinality(words) loop if length(words[i])>3 and right(words[i],1)='s' then words[i]:=left(words[i],-1); end if; end loop;
  end if;
  key:=array_to_string(words,' ');
  if length(key)=0 then return jsonb_build_object('status','invalid_answer'); end if;
  answers:=answers||jsonb_build_array(jsonb_build_object('text',item,'key',key));
 end loop;
 return jsonb_build_object('status','ok','text',btrim(p_text),'answers',answers);
end $$;
create function private.parse_word_cloud(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language sql stable security definer set search_path='' as $$ select private.parse_text_answers(p_session,p_text,true) $$;
create function private.parse_wall(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language sql stable security definer set search_path='' as $$ select private.parse_text_answers(p_session,p_text,false) $$;

-- ---------- Options, one function per kind ----------
-- Content screens: which screen, and its fields. Scripture is three pieces: the passage
-- (the prompt), the reference and the translation, which defaults from the engagement.
-- A holding screen's outline is text the facilitator writes, one line per item, so no
-- planning time ever reaches the room by itself.
create function private.options_content(p jsonb,p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare screen text:=coalesce(p->>'screen','headline'); media uuid;
begin
 if jsonb_typeof(p) is distinct from 'object' or screen not in ('headline','scripture','prayer','image','holding','screen_check') then return null; end if;
 if (select count(*) from jsonb_object_keys(p) k where k not in ('screen','number','source','reference','translation','media','outline','line'))>0 then return null; end if;
 if length(coalesce(p->>'number',''))>12 or length(coalesce(p->>'source',''))>200 or length(coalesce(p->>'reference',''))>100
  or length(coalesce(p->>'translation',''))>100 or length(coalesce(p->>'line',''))>200 or length(coalesce(p->>'outline',''))>1000 then return null; end if;
 if (select bool_or(jsonb_typeof(v) not in ('string','null')) from jsonb_each(p-'media') t(k,v)) then return null; end if;
 if p->>'media' is not null then
  if p->>'media' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  select id into media from private.session_media where id=(p->>'media')::uuid and engagement_id=p_engagement and not deleted;
  if media is null then return null; end if;
 end if;
 return jsonb_strip_nulls(jsonb_build_object('screen',screen,
  'number',nullif(btrim(coalesce(p->>'number','')),''),'source',nullif(btrim(coalesce(p->>'source','')),''),
  'reference',nullif(btrim(coalesce(p->>'reference','')),''),'translation',nullif(btrim(coalesce(p->>'translation','')),''),
  'line',nullif(btrim(coalesce(p->>'line','')),''),'media',media,'outline',nullif(btrim(coalesce(p->>'outline','')),'')));
end $$;

create function private.session_options(p_kind text,p jsonb,p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare fn text:=private.kind_function('options',p_kind,'jsonb,uuid'); out jsonb;
begin
 if fn is null then return case when p='{}'::jsonb then '{}'::jsonb end; end if;
 execute format('select %s($1,$2)',fn) into out using coalesce(p,'{}'::jsonb),p_engagement;
 return out;
end $$;

-- ---------- Control surface items, one function per kind ----------
create function private.items_word_cloud(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'text',label,'count',n,'hidden',key=any(p_hidden)) order by key=any(p_hidden),n desc,label),'[]'::jsonb)
 from (select a->>'key' as key,min(a->>'text') as label,count(*)::integer as n from public.submissions x cross join lateral jsonb_array_elements(x.answers) a
  where x.session_id=p_session and not x.deleted and not x.withdrawn and not x.hidden group by a->>'key' limit 500) w
$$;
create function private.items_wall(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',id,'text',text,'count',1,'hidden',hidden) order by hidden,server_received_at desc,id),'[]'::jsonb)
 from (select id,text,hidden,server_received_at from public.submissions where session_id=p_session and not deleted and not withdrawn order by server_received_at desc,id limit 500) w
$$;
create function private.session_items(p_kind text,p_session uuid,p_hidden text[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare fn text:=private.kind_function('items',p_kind,'uuid,text[]'); out jsonb;
begin
 if fn is null or p_session is null then return '[]'::jsonb; end if;
 execute format('select %s($1,$2)',fn) into out using p_session,coalesce(p_hidden,array[]::text[]);
 return coalesce(out,'[]'::jsonb);
end $$;

-- What every surface needs to know about a kind. Public metadata only.
create function private.kind_public(p_kind text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('kind',k.kind,'label',k.label,'input',k.input,'one_per_person',k.one_per_person,'counts',k.counts,'structured',k.structured,'shares_answers',k.shares_answers,'spotlight',k.spotlight)
 from private.interaction_kinds k where k.kind=p_kind
$$;
-- Options with the engagement's defaults filled (the Scripture translation).
create function private.public_options(p_session public.sessions,p_settings jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$
 select case when p_session.interaction='content' and p_session.options->>'screen'='scripture' and coalesce(p_session.options->>'translation','')=''
  and coalesce(p_settings->>'scripture_translation','')<>'' then p_session.options||jsonb_build_object('translation',p_settings->>'scripture_translation')
  else p_session.options end
$$;

-- Shared state carries the session's options and kind. Still no planning fields, notes,
-- depth, actors or identities.
create or replace function private.live_public_state(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('state',jsonb_build_object('engagement_id',r.engagement_id,'live_session_id',r.live_session_id,'tv_content',r.tv_content,'phones_down',r.phones_down,'burst_ends_at',r.burst_ends_at,'spotlight_id',r.spotlight_id,'spotlight_key',r.spotlight_key,'hidden_ids',r.hidden_ids,'hidden_keys',r.hidden_keys,'remote_holder_id',r.remote_holder_id,'team_led_block_id',r.team_led_block_id,'show_tv_on_phones',r.show_tv_on_phones,'phone_refresh_version',r.phone_refresh_version,'results',r.results,'version',r.version),'session',case when s.id is not null then jsonb_build_object(
 'id',s.id,'title',s.title,'interaction',s.interaction,'prompt',private.fill_years(s.prompt,e.base_year),'state',s.state,'revision',s.revision,'base_year',e.base_year,
 'max_sends',s.max_sends,'max_characters',s.max_characters,'max_words',s.max_words,'options',private.public_options(s,e.settings),'kind',private.kind_public(s.interaction),
 'settings',jsonb_build_object('anonymous',s.settings->'anonymous','burst_minutes',s.settings->'burst_minutes','join_strip',s.settings->'join_strip')) end)||private.tv_room_info(p_engagement)
 from public.room_states r join public.engagements e on e.id=r.engagement_id left join public.sessions s on s.id=r.live_session_id and not s.deleted
 where r.engagement_id=p_engagement and not r.deleted
$$;

-- Answers of a kind that does not share them (INT-09) never leave the database in a
-- shared snapshot or event: only the count does.
create or replace function private.live_snapshot(p_engagement uuid,p_after uuid,p_version bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare role text:=private.live_role(p_engagement); r public.room_states; page jsonb; next_id uuid; shares boolean;
begin
  if role is null then return jsonb_build_object('status','denied'); end if;
  select * into r from public.room_states where engagement_id=p_engagement and not deleted;
  if not found then return jsonb_build_object('status','missing'); end if;
  if p_version is not null and p_version<>r.version then return jsonb_build_object('status','changed','version',r.version); end if;
  if p_after is not null and p_version is null then return jsonb_build_object('status','invalid_request'); end if;
  select coalesce(k.shares_answers,true) into shares from public.sessions s join private.interaction_kinds k on k.kind=s.interaction where s.id=r.live_session_id;
  if coalesce(shares,true) then
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'session_id',session_id,'text',text,'answers',private.visible_answers(answers,r.hidden_keys),'value',value,'revision',revision,'created_at',created_at) order by id),'[]'::jsonb)
     into page from (select s.* from public.submissions s where s.engagement_id=p_engagement and s.session_id=r.live_session_id
       and not s.deleted and not s.withdrawn and not s.hidden and (p_after is null or s.id>p_after) order by s.id limit 501) page_rows;
  else page:='[]'::jsonb; end if;
  if jsonb_array_length(page)>500 then next_id:=(page->499->>'id')::uuid; page:=page-500; end if;
  return private.live_public_state(p_engagement)||jsonb_build_object('status','ok','role',role,'topic',private.live_topic(p_engagement),'version',r.version,'answers',page,'next',next_id,
    'phone_depth',case when role='participant' then (select private.fill_years(s.phone_depth,e.base_year) from public.sessions s join public.engagements e on e.id=s.engagement_id where s.id=r.live_session_id and not s.deleted) else null end,
    'server_time',clock_timestamp());
end $$;

create or replace function private.live_broadcast() returns trigger
language plpgsql security definer set search_path='' as $$
declare t private.room_transport; fingerprint text; topic text; patch jsonb; shares boolean;
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
  if patch is not null then
   select coalesce(k.shares_answers,true) into shares from public.sessions s join private.interaction_kinds k on k.kind=s.interaction where s.id=(patch->>'session_id')::uuid;
   if not coalesce(shares,true) then patch:=patch||jsonb_build_object('text',null,'answers','[]'::jsonb,'value',null); end if;
   if jsonb_typeof(patch->'answers')='array' then patch:=jsonb_set(patch,'{answers}',private.visible_answers(patch->'answers',new.hidden_keys)); end if;
  end if;
  perform private.live_send(topic,'room',private.live_public_state(new.engagement_id)||jsonb_build_object('answer',patch));
  return new;
end $$;

-- ---------- Submitting ----------
drop function public.live_submit(uuid,uuid,uuid,integer,text,text,timestamptz,timestamptz,double precision);
drop function private.live_submit(uuid,uuid,uuid,integer,text,text,timestamptz,timestamptz,double precision);
create function private.live_submit(p_engagement uuid,p_id uuid,p_session uuid,p_revision integer,p_action text,p_text text,p_value jsonb,p_sent timestamptz,p_queued timestamptz,p_uncertainty double precision) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; k private.interaction_kinds; previous public.submissions; who uuid; parsed jsonb; fn text;
 answers jsonb:='[]'::jsonb; val jsonb; received timestamptz:=clock_timestamp(); accepting boolean; replaced uuid[]:=array[]::uuid[]; live boolean;
begin
  if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
  select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
  if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
  select id into who from public.attendees where engagement_id=p_engagement and id in(select private.room_attendee_ids());
  select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted;
  if found then k:=private.kind(s.interaction); end if;
  fn:=private.kind_function('parse',s.interaction,'public.sessions,text,jsonb');
  if s.id is null or k.kind is null or not k.input or fn is null then return jsonb_build_object('status','invalid_session'); end if;
  if p_action is null or p_action not in ('submit','change','withdraw') or p_revision is null or p_revision<0 or p_revision>1000000 or p_id is null
    or p_sent is null or not isfinite(p_sent) or (p_queued is not null and not isfinite(p_queued)) or p_uncertainty is null or p_uncertainty not between 0 and 60000 or p_uncertainty='NaN'::float8
    or p_sent>received+interval '1 minute' or p_queued>received+interval '1 minute' or (p_value is not null and pg_column_size(p_value)>16384) then return jsonb_build_object('status','invalid_request'); end if;
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
  if p_action='withdraw' then answers:=previous.answers; p_text:=previous.text; val:=previous.value;
  else
    execute format('select %s($1,$2,$3)',fn) into parsed using s,p_text,p_value;
    if parsed is null or parsed->>'status' is distinct from 'ok' then return jsonb_build_object('status',coalesce(parsed->>'status','invalid_answer')); end if;
    p_text:=parsed->>'text'; answers:=coalesce(parsed->'answers','[]'::jsonb); val:=parsed->'value';
    if p_text is null or length(p_text) not between 1 and 1404 or jsonb_typeof(answers)<>'array' then return jsonb_build_object('status','invalid_answer'); end if;
    if p_action='submit' and not k.one_per_person and (select count(*) from public.submissions where session_id=p_session and attendee_id=who and not deleted)>=s.max_sends then return jsonb_build_object('status','limit'); end if;
  end if;
  insert into public.submissions(id,engagement_id,session_id,attendee_id,text,answers,value,revision,phone_sent_at,queued_at,clock_uncertainty_ms,server_received_at)
    values(p_id,p_engagement,p_session,who,p_text,answers,val,p_revision,p_sent,p_queued,p_uncertainty,received)
    on conflict(id) do update set text=excluded.text,answers=excluded.answers,value=excluded.value,revision=excluded.revision,withdrawn=(p_action='withdraw'),replaced_by=null;
  -- One answer per person: the latest answer replaces the person's earlier ones.
  if k.one_per_person and p_action<>'withdraw' then
    with gone as (update public.submissions set withdrawn=true,replaced_by=p_id
      where session_id=p_session and attendee_id=who and id<>p_id and not deleted and not withdrawn returning id)
    select coalesce(array_agg(id order by id),array[]::uuid[]) into replaced from gone;
  end if;
  live:=p_action<>'withdraw' and not coalesce(previous.hidden,false) and p_session=r.live_session_id;
  perform set_config('clearway.live_answer',jsonb_build_object('id',p_id,'session_id',p_session,'revision',p_revision,
    'withdrawn',p_action='withdraw','hidden',coalesce(previous.hidden,false),'replaced',to_jsonb(replaced),
    'text',case when live then p_text end,'answers',case when live then answers else '[]'::jsonb end,'value',case when live then val end)::text,true);
  update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
  perform set_config('clearway.live_answer','',true);
  insert into private.latency_logs(engagement_id,submission_id,revision,room_version,phone_sent_at,server_received_at,clock_uncertainty_ms)
    values(p_engagement,p_id,p_revision,r.version,p_sent,received,p_uncertainty);
  return jsonb_build_object('status','accepted','id',p_id,'revision',p_revision,'version',r.version,'server_received_at',received,'replaced',to_jsonb(replaced));
end $$;
create function public.live_submit(p_engagement uuid,p_id uuid,p_session uuid,p_revision integer,p_action text,p_text text,p_sent timestamptz,p_queued timestamptz default null,p_uncertainty double precision default 0,p_value jsonb default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.live_submit(p_engagement,p_id,p_session,p_revision,p_action,p_text,p_value,p_sent,p_queued,p_uncertainty) $$;

-- ---------- The phone's own view ----------
create or replace function private.phone_room(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare who uuid; base integer; v_settings jsonb;
begin
 if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 select id into who from public.attendees where engagement_id=p_engagement and id in(select private.room_attendee_ids());
 if who is null then return jsonb_build_object('status','denied'); end if;
 select e.base_year,e.settings into base,v_settings from public.engagements e where e.id=p_engagement;
 return jsonb_build_object('status','ok','server_time',clock_timestamp(),
  'name',(select split_part(btrim(name),' ',1) from public.attendees where id=who),
  'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'part',s.part,'segment',s.segment,'interaction',s.interaction,'state',s.state,
    'prompt',private.fill_years(s.prompt,base),'phone_depth',private.fill_years(s.phone_depth,base),'options',private.public_options(s,v_settings),'kind',private.kind_public(s.interaction),
    'max_sends',s.max_sends,'max_characters',s.max_characters,'max_words',s.max_words,'closed_at',s.closed_at)
    order by private.part_order(s.part),s.position,s.id)
   from (select * from public.sessions where engagement_id=p_engagement and not deleted and mode='live' and shown_at is not null
     order by private.part_order(part),position,id limit 500) s),'[]'::jsonb),
  'answers',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'session_id',x.session_id,'text',x.text,'value',x.value,'revision',x.revision,'withdrawn',x.withdrawn,'replaced',x.replaced_by is not null,'created_at',x.created_at)
    order by x.created_at,x.id)
   from (select * from public.submissions where engagement_id=p_engagement and attendee_id=who and not deleted order by created_at,id limit 2000) x),'[]'::jsonb));
end $$;

-- ---------- Run of show ----------
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
     s.prompt,s.phone_depth,s.segment,s.shown_at,s.closed_at,s.settings,s.options,s.lands_in,s.state,s.max_sends,s.max_characters,s.max_words,s.revision,coalesce(n.notes,'') as notes
   from public.sessions s left join private.session_notes n on n.session_id=s.id and not n.deleted
   where s.engagement_id=p_engagement and not s.deleted and (p_after is null or s.id>p_after) order by s.id limit 501
 ) rows;
 if jsonb_array_length(page)>500 then next_id:=(page->499->>'id')::uuid; page:=page-500; end if;
 return jsonb_build_object('status','ok','version',version,'sessions',page,'next',next_id,'context',(
  select jsonb_build_object('id',e.id,'title',e.title,'church',c.name,'timezone',c.timezone,'base_year',e.base_year,'closed',e.status='closed',
   'scripture_translation',coalesce(e.settings->>'scripture_translation',''),
   'kinds',(select coalesce(jsonb_agg(private.kind_public(k.kind)||jsonb_build_object('named',k.named) order by k.position),'[]'::jsonb) from private.interaction_kinds k where not k.deleted))
  from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_engagement));
end $$;

create or replace function private.show_write(p_engagement uuid,p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; saved public.sessions; requested public.sessions; k private.interaction_kinds; sid uuid; notes text; ids uuid[]; n integer; entry jsonb; opts jsonb; anon boolean;
begin
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
   requested:=jsonb_populate_record(null::public.sessions,p_input-'options');
   notes:=p_input->>'notes';
   k:=private.kind(requested.interaction);
   opts:=private.session_options(requested.interaction,coalesce(p_input->'options','{}'::jsonb),p_engagement);
   anon:=case when jsonb_typeof(requested.settings->'anonymous')='boolean' then (requested.settings->>'anonymous')::boolean end;
   if requested.title is null or length(btrim(requested.title)) not between 1 and 200 or requested.part is null or requested.part not in ('Pre-call','Day 1','Day 2','Follow-up')
    or requested.mode is null or requested.mode not in ('live','self_paced') or k.kind is null or opts is null
    or requested.state is null or requested.state not in ('draft','ready','open','live','phones_down','closed')
    or requested.prompt is null or length(requested.prompt)>4000 or requested.phone_depth is null or length(requested.phone_depth)>20000
    or notes is null or length(notes)>30000 or length(btrim(coalesce(requested.segment,'')))>100 or requested.lands_in is null or length(requested.lands_in)>200
    or requested.planned_minutes is null or requested.planned_minutes not between 1 and 1440
    or requested.max_sends is null or requested.max_sends not between 1 and 100
    or requested.max_characters is null or requested.max_characters not between 1 and 280
    or requested.max_words is null or requested.max_words not between 1 and 50
    or requested.settings is null or anon is null or (k.named='never' and not anon) or (k.named='always' and anon)
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
   if opts ? 'media' and not exists(select 1 from private.session_media where id=(opts->>'media')::uuid and session_id=sid and not deleted) then return jsonb_build_object('status','invalid_request'); end if;
   if s.id is null then
    insert into public.sessions(id,engagement_id,segment,title,part,position,planned_start,planned_minutes,mode,opens_at,closes_at,interaction,prompt,phone_depth,state,max_sends,max_characters,max_words,settings,options,lands_in)
    values(sid,p_engagement,btrim(coalesce(requested.segment,'')),btrim(requested.title),requested.part,coalesce((select max(position)+1 from public.sessions where engagement_id=p_engagement and not deleted),0),requested.planned_start,requested.planned_minutes,requested.mode,requested.opens_at,requested.closes_at,requested.interaction,requested.prompt,requested.phone_depth,requested.state,requested.max_sends,requested.max_characters,requested.max_words,
    jsonb_build_object('anonymous',anon,'burst_minutes',requested.settings->'burst_minutes','join_strip',requested.settings->'join_strip'),opts,requested.lands_in) returning * into saved;
   else
    update public.sessions set segment=btrim(coalesce(requested.segment,'')),title=btrim(requested.title),part=requested.part,planned_start=requested.planned_start,planned_minutes=requested.planned_minutes,mode=requested.mode,opens_at=requested.opens_at,closes_at=requested.closes_at,interaction=requested.interaction,prompt=requested.prompt,phone_depth=requested.phone_depth,state=requested.state,max_sends=requested.max_sends,max_characters=requested.max_characters,max_words=requested.max_words,
    settings=jsonb_build_object('anonymous',anon,'burst_minutes',requested.settings->'burst_minutes','join_strip',requested.settings->'join_strip'),options=opts,lands_in=requested.lands_in where id=sid returning * into saved;
   end if;
   insert into private.session_notes(session_id,engagement_id,notes) values(sid,p_engagement,notes)
    on conflict(session_id) do update set notes=excluded.notes,deleted=false;
  end if;
 else return jsonb_build_object('status','invalid_request'); end if;
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement;
 return jsonb_build_object('status','ok','id',sid,'revision',saved.revision);
exception when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation or foreign_key_violation then
 return jsonb_build_object('status','invalid_request');
end $$;

-- ---------- Media for the image or document page ----------
-- The facilitator stores an image for a session it is editing. The session must exist
-- (save it once first). Nothing changes on screen until the session is saved with it.
create function private.media_write(p_engagement uuid,p_session uuid,p_mime text,p_width integer,p_height integer,p_data text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bytes bytea; v_id uuid;
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if not exists(select 1 from public.sessions where id=p_session and engagement_id=p_engagement and not deleted and interaction='content') then return jsonb_build_object('status','missing'); end if;
 if p_mime is null or p_mime not in ('image/png','image/jpeg','image/webp') or p_width not between 1 and 8192 or p_height not between 1 and 8192 or p_data is null or length(p_data)>5600000 then return jsonb_build_object('status','invalid_request'); end if;
 bytes:=decode(p_data,'base64');
 if octet_length(bytes) not between 1 and 4194304 then return jsonb_build_object('status','too_large'); end if;
 -- The bytes must be the image type they claim.
 if not ((p_mime='image/png' and substring(bytes from 1 for 8)='\x89504e470d0a1a0a'::bytea)
   or (p_mime='image/jpeg' and substring(bytes from 1 for 3)='\xffd8ff'::bytea)
   or (p_mime='image/webp' and substring(bytes from 1 for 4)='RIFF'::bytea and substring(bytes from 9 for 4)='WEBP'::bytea)) then return jsonb_build_object('status','invalid_request'); end if;
 insert into private.session_media(engagement_id,session_id,mime,width,height,data) values(p_engagement,p_session,p_mime,p_width,p_height,bytes) returning session_media.id into v_id;
 return jsonb_build_object('status','ok','id',v_id,'width',p_width,'height',p_height);
exception when invalid_parameter_value then return jsonb_build_object('status','invalid_request');
end $$;
-- Anyone in the room may read the image of a step they can see: facilitators and TVs any
-- step, phones only a step the room has reached.
create function private.media_read(p_engagement uuid,p_media uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare role text:=private.live_role(p_engagement); m private.session_media;
begin
 if role is null and not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 select x.* into m from private.session_media x join public.sessions s on s.id=x.session_id and not s.deleted
  where x.id=p_media and x.engagement_id=p_engagement and not x.deleted and (role is distinct from 'participant' or s.shown_at is not null);
 if m.id is null then return jsonb_build_object('status','missing'); end if;
 return jsonb_build_object('status','ok','mime',m.mime,'width',m.width,'height',m.height,'data',encode(m.data,'base64'));
end $$;
create function public.media_write(p_engagement uuid,p_session uuid,p_mime text,p_width integer,p_height integer,p_data text) returns jsonb
language sql security invoker set search_path='' as $$ select private.media_write(p_engagement,p_session,p_mime,p_width,p_height,p_data) $$;
create function public.media_read(p_engagement uuid,p_media uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.media_read(p_engagement,p_media) $$;

-- ---------- Controls: by kind, not by name ----------
create or replace function private.control_status(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.room_states; s public.sessions;
begin
 if not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','missing'); end if;
 select * into s from public.sessions where id=r.live_session_id and not deleted;
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
  'items',private.session_items(s.interaction,s.id,r.hidden_keys),
  'controls',coalesce((select jsonb_agg(c order by c->>'at' desc) from (select jsonb_build_object('id',x.id,'action',x.action,'version',x.room_version,'at',x.created_at,
    'by',split_part(btrim(coalesce(u.name,'')),' ',1)) c from private.room_controls x left join public.clearway_users u on u.id=x.actor_id
    where x.engagement_id=p_engagement and not x.deleted order by x.created_at desc limit 10) recent),'[]'::jsonb));
end $$;

-- Bursts and phones down work for every kind that takes input. Spotlight and Hide address
-- an answer id or an item key, by the kind's rule; a structured kind's option keys count.
create or replace function private.room_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
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
  if cur.id is null or not coalesce((private.kind(cur.interaction)).input,false) or cur.state not in ('live','phones_down') then return jsonb_build_object('status','invalid_state'); end if;
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
  if cur.id is null or coalesce((private.kind(cur.interaction)).spotlight,'none')='none' then return jsonb_build_object('status','invalid_state'); end if;
  if p_action='clear_spotlight' then
   if v_spot is null then return jsonb_build_object('status','unchanged','version',r.version); end if;
   v_spot:=null;
  else
   item:=p->>'item';
   if item is null or length(item) not between 1 and 200 then return jsonb_build_object('status','invalid_request'); end if;
   if (private.kind(cur.interaction)).spotlight='id' then
    if item !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or not exists(select 1 from public.submissions where id=item::uuid and session_id=cur.id and not deleted and not withdrawn) then return jsonb_build_object('status','missing'); end if;
   elsif not exists(select 1 from public.submissions x cross join lateral jsonb_array_elements(x.answers) a
     where x.session_id=cur.id and not x.deleted and not x.withdrawn and a->>'key'=item)
     and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(cur.options->'items')='array' then cur.options->'items' else '[]'::jsonb end) o where o->>'key'=item) then return jsonb_build_object('status','missing'); end if;
   if p_action='spotlight' then
    if item=any(v_keys) or ((private.kind(cur.interaction)).spotlight='id' and item::uuid=any(v_ids)) then return jsonb_build_object('status','hidden'); end if;
    v_spot:=item;
   elsif (private.kind(cur.interaction)).spotlight='id' then
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

revoke all on function private.kind(text),private.kind_function(text,text,text),private.results_word_cloud(uuid,uuid,text[]),private.results_wall(uuid,uuid,text[]),
 private.parse_text_answers(public.sessions,text,boolean),private.parse_word_cloud(public.sessions,text,jsonb),private.parse_wall(public.sessions,text,jsonb),
 private.options_content(jsonb,uuid),private.session_options(text,jsonb,uuid),private.items_word_cloud(uuid,text[]),private.items_wall(uuid,text[]),private.session_items(text,uuid,text[]),
 private.kind_public(text),private.public_options(public.sessions,jsonb),
 private.live_submit(uuid,uuid,uuid,integer,text,text,jsonb,timestamptz,timestamptz,double precision),public.live_submit(uuid,uuid,uuid,integer,text,text,timestamptz,timestamptz,double precision,jsonb),
 private.media_write(uuid,uuid,text,integer,integer,text),private.media_read(uuid,uuid),public.media_write(uuid,uuid,text,integer,integer,text),public.media_read(uuid,uuid)
 from public,anon,authenticated;
grant execute on function private.live_submit(uuid,uuid,uuid,integer,text,text,jsonb,timestamptz,timestamptz,double precision),public.live_submit(uuid,uuid,uuid,integer,text,text,timestamptz,timestamptz,double precision,jsonb),
 private.media_write(uuid,uuid,text,integer,integer,text),private.media_read(uuid,uuid),public.media_write(uuid,uuid,text,integer,integer,text),public.media_read(uuid,uuid)
 to authenticated;
commit;
