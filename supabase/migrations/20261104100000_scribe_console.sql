-- Milestone 5, step 1: the scribe console (SCR-01, SCR-02), the scribe feed on the control
-- surface (FAC-01) and offline capture (FAIL-03).
--
-- * Scribe cards (quote, decision, tension, action, question, mitigation) attach to the session
--   the scribe saw live when the card was written, and sync in order with no duplicates: the
--   card id is made on the scribe's laptop, so a replay is a duplicate and does nothing.
-- * Easel photos and files go to Supabase Storage (bucket `scribe`, private). The database row
--   is made first and decides who may write the object; reads follow the same roles.
-- * The speaker is kept for the record. It is never in a column any browser can read: the scribe
--   console, the control surface's feed, the TV, phones and the read-back never carry it. Only
--   `scribe_speakers` (facilitators of the engagement) returns it, for the review screens.
-- * Each run-of-show step gets a team-led flag. The scribe console is off while a team-led step
--   is live (PRD "Scribe console": off for the team-led block).
-- Nothing here touches Team Hub or CORE, and nothing reaches the TV or phones.
begin;

alter table public.sessions add column team_led boolean not null default false;

-- ---------- Tables ----------
create table private.scribe_cards (
 id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 kind text not null check(kind in ('quote','decision','tension','action','question','mitigation')),
 text text not null check(length(btrim(text)) between 1 and 2000),
 detail jsonb not null default '{}' check(jsonb_typeof(detail)='object' and pg_column_size(detail)<=4096),
 speaker text check(speaker is null or length(btrim(speaker)) between 1 and 200),
 attendee_id uuid not null,
 captured_at timestamptz not null,
 queued_at timestamptz,
 received_at timestamptz not null default clock_timestamp(),
 seq bigint generated always as identity,
 revision integer not null default 0 check(revision between 0 and 1000000),
 refiled_from uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id),
 foreign key(attendee_id,engagement_id) references public.attendees(id,engagement_id)
);
create index scribe_cards_session_idx on private.scribe_cards(session_id,engagement_id);
create index scribe_cards_engagement_idx on private.scribe_cards(engagement_id,seq);
create index scribe_cards_attendee_idx on private.scribe_cards(attendee_id,engagement_id);

create table private.scribe_files (
 id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 kind text not null check(kind in ('photo','file')),
 name text not null check(length(btrim(name)) between 1 and 200),
 content_type text not null check(length(content_type) between 3 and 120),
 bytes bigint not null check(bytes between 1 and 15728640),
 storage_path text not null unique check(length(storage_path) between 40 and 300),
 uploaded_at timestamptz,
 attendee_id uuid not null,
 captured_at timestamptz not null,
 queued_at timestamptz,
 received_at timestamptz not null default clock_timestamp(),
 seq bigint generated always as identity,
 refiled_from uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id),
 foreign key(attendee_id,engagement_id) references public.attendees(id,engagement_id)
);
create index scribe_files_session_idx on private.scribe_files(session_id,engagement_id);
create index scribe_files_engagement_idx on private.scribe_files(engagement_id,seq);
create index scribe_files_attendee_idx on private.scribe_files(attendee_id,engagement_id);

alter table private.scribe_cards enable row level security;
alter table private.scribe_cards force row level security;
revoke all on private.scribe_cards from public,anon,authenticated;
grant select,insert,update,delete on private.scribe_cards to service_role;
create trigger touch_record before update on private.scribe_cards for each row execute function private.touch_live_record('id');

alter table private.scribe_files enable row level security;
alter table private.scribe_files force row level security;
revoke all on private.scribe_files from public,anon,authenticated;
grant select,insert,update,delete on private.scribe_files to service_role;
create trigger touch_record before update on private.scribe_files for each row execute function private.touch_live_record('id');

-- ---------- Who is who ----------
-- The scribe is a verified attendee on this device whose room role is scribe.
create function private.scribe_attendee(p_engagement uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select a.id from public.attendees a
 where a.engagement_id=p_engagement and a.room_role='scribe' and a.id in (select private.room_attendee_ids())
 order by a.id limit 1
$$;
create function private.scribe_role(p_engagement uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when private.scribe_attendee(p_engagement) is not null then 'scribe'
  when private.live_role(p_engagement)='facilitator' then 'facilitator' end
$$;

-- ---------- Card details, checked by kind ----------
-- Tension: both views. Action: owner and date if named. Decision: why. Mitigation: the risk it answers.
-- Returns the cleaned object, or null when the detail is not allowed.
create function private.scribe_detail(p_kind text,p_detail jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare d jsonb:=coalesce(p_detail,'{}'::jsonb); out jsonb:='{}'::jsonb; v text; a text; b text;
begin
 if jsonb_typeof(d)<>'object' then return null; end if;
 if exists(select 1 from jsonb_object_keys(d) k where k not in ('views','owner','date','why','risk')) then return null; end if;
 if d ? 'views' then
  if p_kind<>'tension' or jsonb_typeof(d->'views')<>'array' or jsonb_array_length(d->'views')<>2
   or jsonb_typeof(d->'views'->0)<>'string' or jsonb_typeof(d->'views'->1)<>'string' then return null; end if;
  a:=btrim(d->'views'->>0); b:=btrim(d->'views'->>1);
  if length(a)>500 or length(b)>500 then return null; end if;
  if a<>'' or b<>'' then out:=out||jsonb_build_object('views',jsonb_build_array(a,b)); end if;
 end if;
 if d ? 'owner' then
  if p_kind<>'action' or jsonb_typeof(d->'owner')<>'string' then return null; end if;
  v:=btrim(d->>'owner'); if length(v)>200 then return null; end if;
  if v<>'' then out:=out||jsonb_build_object('owner',v); end if;
 end if;
 if d ? 'date' then
  if p_kind<>'action' or jsonb_typeof(d->'date')<>'string' then return null; end if;
  v:=btrim(d->>'date'); if length(v)>40 then return null; end if;
  if v<>'' then out:=out||jsonb_build_object('date',v); end if;
 end if;
 if d ? 'why' then
  if p_kind<>'decision' or jsonb_typeof(d->'why')<>'string' then return null; end if;
  v:=btrim(d->>'why'); if length(v)>1000 then return null; end if;
  if v<>'' then out:=out||jsonb_build_object('why',v); end if;
 end if;
 if d ? 'risk' then
  if p_kind<>'mitigation' or jsonb_typeof(d->'risk')<>'string' then return null; end if;
  v:=btrim(d->>'risk'); if length(v)>300 then return null; end if;
  if v<>'' then out:=out||jsonb_build_object('risk',v); end if;
 end if;
 return out;
end $$;

-- ---------- The console's state ----------
-- One read for the scribe console and the control surface's feed. Never carries a speaker, only
-- whether one was kept. The live step comes from the room; team_led says whether the console is off.
create function private.scribe_state(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare role text:=private.scribe_role(p_engagement); r public.room_states; s public.sessions;
begin
 if role is null then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','missing'); end if;
 select * into s from public.sessions where id=r.live_session_id and not deleted;
 return jsonb_build_object('status','ok','role',role,'server_time',clock_timestamp(),'version',r.version,
  'live',case when s.id is null then null else jsonb_build_object('id',s.id,'title',s.title,'part',s.part,'state',s.state,'team_led',s.team_led) end,
  'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'part',x.part,'team_led',x.team_led) order by private.part_order(x.part),x.position,x.id)
    from public.sessions x where x.engagement_id=p_engagement and not x.deleted and x.mode='live'),'[]'::jsonb),
  'cards',coalesce((select jsonb_agg(c order by c->>'seq' desc) from (
    select jsonb_build_object('id',k.id,'session_id',k.session_id,'kind',k.kind,'text',k.text,'detail',k.detail,'has_speaker',k.speaker is not null,
     'captured_at',k.captured_at,'received_at',k.received_at,'seq',lpad(k.seq::text,12,'0'),'revision',k.revision,'refiled',k.refiled_from is not null) c
    from private.scribe_cards k where k.engagement_id=p_engagement and not k.deleted order by k.seq desc limit 500) q),'[]'::jsonb),
  'files',coalesce((select jsonb_agg(f order by f->>'seq' desc) from (
    select jsonb_build_object('id',k.id,'session_id',k.session_id,'kind',k.kind,'name',k.name,'content_type',k.content_type,'bytes',k.bytes,
     'uploaded',k.uploaded_at is not null,'captured_at',k.captured_at,'received_at',k.received_at,'seq',lpad(k.seq::text,12,'0'),'refiled',k.refiled_from is not null) f
    from private.scribe_files k where k.engagement_id=p_engagement and not k.deleted order by k.seq desc limit 200) q),'[]'::jsonb));
end $$;

-- ---------- Capture ----------
-- A card is written once, by its id. A replay (the scribe's laptop sent it, the answer was lost,
-- it sends again) is a duplicate and changes nothing.
create function private.scribe_capture(p_engagement uuid,p_id uuid,p_session uuid,p_kind text,p_text text,p_detail jsonb,p_speaker text,p_captured timestamptz,p_queued timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=private.scribe_attendee(p_engagement); s public.sessions; v_detail jsonb; v_speaker text:=nullif(btrim(coalesce(p_speaker,'')),''); v_text text:=btrim(coalesce(p_text,''));
begin
 if who is null then return jsonb_build_object('status','denied'); end if;
 if p_id is null or p_session is null or p_captured is null or not isfinite(p_captured) or (p_queued is not null and not isfinite(p_queued)) then return jsonb_build_object('status','invalid_request'); end if;
 if exists(select 1 from private.scribe_cards where id=p_id) then
  if exists(select 1 from private.scribe_cards where id=p_id and engagement_id=p_engagement) then return jsonb_build_object('status','duplicate'); end if;
  return jsonb_build_object('status','conflict');
 end if;
 if p_kind is null or p_kind not in ('quote','decision','tension','action','question','mitigation') or length(v_text) not between 1 and 2000 or length(coalesce(v_speaker,''))>200 then return jsonb_build_object('status','invalid_request'); end if;
 v_detail:=private.scribe_detail(p_kind,p_detail);
 if v_detail is null then return jsonb_build_object('status','invalid_request'); end if;
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','invalid_session'); end if;
 if s.team_led then return jsonb_build_object('status','team_led'); end if;
 insert into private.scribe_cards(id,engagement_id,session_id,kind,text,detail,speaker,attendee_id,captured_at,queued_at)
 values(p_id,p_engagement,p_session,p_kind,v_text,v_detail,v_speaker,who,least(p_captured,clock_timestamp()),p_queued);
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','scribe','what','card'));
 return jsonb_build_object('status','accepted');
end $$;

create function private.scribe_edit(p_engagement uuid,p_id uuid,p_text text,p_detail jsonb,p_speaker text,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare k private.scribe_cards; v_detail jsonb; v_speaker text:=nullif(btrim(coalesce(p_speaker,'')),''); v_text text:=btrim(coalesce(p_text,''));
begin
 if private.scribe_attendee(p_engagement) is null then return jsonb_build_object('status','denied'); end if;
 select * into k from private.scribe_cards where id=p_id and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if length(v_text) not between 1 and 2000 or length(coalesce(v_speaker,''))>200 then return jsonb_build_object('status','invalid_request'); end if;
 v_detail:=private.scribe_detail(k.kind,p_detail);
 if v_detail is null then return jsonb_build_object('status','invalid_request'); end if;
 if p_revision is distinct from k.revision then return jsonb_build_object('status','conflict'); end if;
 update private.scribe_cards set text=v_text,detail=v_detail,speaker=coalesce(v_speaker,speaker),revision=revision+1 where id=p_id;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','scribe','what','edit'));
 return jsonb_build_object('status','ok','revision',k.revision+1);
end $$;

-- Re-file a card or a file to another session. The target must be a step of this engagement and not team-led.
create function private.scribe_refile(p_engagement uuid,p_id uuid,p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; n integer;
begin
 if private.scribe_attendee(p_engagement) is null then return jsonb_build_object('status','denied'); end if;
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','invalid_session'); end if;
 if s.team_led then return jsonb_build_object('status','team_led'); end if;
 update private.scribe_cards set session_id=p_session,refiled_from=coalesce(refiled_from,session_id),revision=revision+1 where id=p_id and engagement_id=p_engagement and not deleted and session_id<>p_session;
 get diagnostics n=row_count;
 if n=0 then
  update private.scribe_files set session_id=p_session,refiled_from=coalesce(refiled_from,session_id) where id=p_id and engagement_id=p_engagement and not deleted and session_id<>p_session;
  get diagnostics n=row_count;
 end if;
 if n=0 then
  if exists(select 1 from private.scribe_cards where id=p_id and engagement_id=p_engagement and not deleted and session_id=p_session)
   or exists(select 1 from private.scribe_files where id=p_id and engagement_id=p_engagement and not deleted and session_id=p_session) then return jsonb_build_object('status','unchanged'); end if;
  return jsonb_build_object('status','not_found');
 end if;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','scribe','what','refile'));
 return jsonb_build_object('status','ok');
end $$;

-- ---------- Photos and files ----------
-- The row comes first: it names the object's path and decides who may write it. The browser then
-- sends the bytes to Storage under the scribe's own session and the row is marked uploaded.
create function private.scribe_file_ext(p_name text,p_type text) returns text
language sql immutable set search_path='' as $$
 select coalesce(
  (select e from (values ('image/jpeg','jpg'),('image/png','png'),('image/webp','webp'),('image/heic','heic'),('application/pdf','pdf'),('text/plain','txt'),('text/csv','csv'),
    ('application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx'),('application/vnd.openxmlformats-officedocument.presentationml.presentation','pptx'),
    ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','xlsx')) t(m,e) where m=lower(p_type)),null)
$$;
create function private.scribe_file_begin(p_engagement uuid,p_id uuid,p_session uuid,p_kind text,p_name text,p_type text,p_bytes bigint,p_captured timestamptz,p_queued timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=private.scribe_attendee(p_engagement); s public.sessions; f private.scribe_files; ext text; path text; name_ text:=btrim(coalesce(p_name,''));
begin
 if who is null then return jsonb_build_object('status','denied'); end if;
 if p_id is null or p_session is null or p_captured is null or not isfinite(p_captured) or (p_queued is not null and not isfinite(p_queued)) then return jsonb_build_object('status','invalid_request'); end if;
 select * into f from private.scribe_files where id=p_id;
 if found then
  if f.engagement_id<>p_engagement then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','path',f.storage_path,'uploaded',f.uploaded_at is not null);
 end if;
 ext:=private.scribe_file_ext(name_,p_type);
 if p_kind is null or p_kind not in ('photo','file') or length(name_) not between 1 and 200 or ext is null or p_bytes is null or p_bytes not between 1 and 15728640
  or (p_kind='photo' and ext not in ('jpg','png','webp','heic')) then return jsonb_build_object('status','invalid_request'); end if;
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','invalid_session'); end if;
 if s.team_led then return jsonb_build_object('status','team_led'); end if;
 path:=p_engagement::text||'/'||p_session::text||'/'||p_id::text||'.'||ext;
 insert into private.scribe_files(id,engagement_id,session_id,kind,name,content_type,bytes,storage_path,attendee_id,captured_at,queued_at)
 values(p_id,p_engagement,p_session,p_kind,name_,lower(p_type),p_bytes,path,who,least(p_captured,clock_timestamp()),p_queued);
 return jsonb_build_object('status','accepted','path',path,'uploaded',false);
end $$;

create function private.scribe_file_done(p_engagement uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f private.scribe_files; present boolean:=true;
begin
 if private.scribe_attendee(p_engagement) is null then return jsonb_build_object('status','denied'); end if;
 select * into f from private.scribe_files where id=p_id and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if f.uploaded_at is not null then return jsonb_build_object('status','duplicate'); end if;
 if to_regclass('storage.objects') is not null then
  execute 'select exists(select 1 from storage.objects where bucket_id=$1 and name=$2)' into present using 'scribe',f.storage_path;
 end if;
 if not present then return jsonb_build_object('status','missing'); end if;
 update private.scribe_files set uploaded_at=clock_timestamp() where id=p_id;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','scribe','what','file'));
 return jsonb_build_object('status','ok');
end $$;

-- Where a file lives, for the console and the feed to show it. Scribes and facilitators of this engagement only.
create function private.scribe_file_read(p_engagement uuid,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare f private.scribe_files;
begin
 if private.scribe_role(p_engagement) is null then return jsonb_build_object('status','denied'); end if;
 select * into f from private.scribe_files where id=p_id and engagement_id=p_engagement and not deleted and uploaded_at is not null;
 if not found then return jsonb_build_object('status','not_found'); end if;
 return jsonb_build_object('status','ok','path',f.storage_path,'name',f.name,'content_type',f.content_type);
end $$;

-- ---------- The speaker, for review only ----------
create function private.scribe_speakers(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 return jsonb_build_object('status','ok','speakers',coalesce((select jsonb_object_agg(k.id::text,k.speaker) from private.scribe_cards k
   where k.engagement_id=p_engagement and not k.deleted and k.speaker is not null),'{}'::jsonb));
end $$;

-- ---------- The team-led flag on a run-of-show step ----------
create function private.session_team_led(p_engagement uuid,p_session uuid,p_value boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions;
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if p_value is null then return jsonb_build_object('status','invalid_request'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if s.team_led is distinct from p_value then update public.sessions set team_led=p_value where id=p_session returning * into s; end if;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','scribe','what','team_led'));
 return jsonb_build_object('status','ok','revision',s.revision,'team_led',s.team_led);
end $$;

-- The run of show carries the flag (one more column; the rest of the read is unchanged).
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
     s.prompt,s.phone_depth,s.segment,s.shown_at,s.closed_at,s.settings,s.options,s.lands_in,s.state,s.max_sends,s.max_characters,s.max_words,s.revision,s.team_led,coalesce(n.notes,'') as notes
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

-- ---------- Public entry points (invokers; the checks are in the private functions) ----------
create function public.scribe_state(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.scribe_state(p_engagement) $$;
create function public.scribe_capture(p_engagement uuid,p_id uuid,p_session uuid,p_kind text,p_text text,p_detail jsonb,p_speaker text,p_captured timestamptz,p_queued timestamptz default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.scribe_capture(p_engagement,p_id,p_session,p_kind,p_text,p_detail,p_speaker,p_captured,p_queued) $$;
create function public.scribe_edit(p_engagement uuid,p_id uuid,p_text text,p_detail jsonb,p_speaker text,p_revision integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.scribe_edit(p_engagement,p_id,p_text,p_detail,p_speaker,p_revision) $$;
create function public.scribe_refile(p_engagement uuid,p_id uuid,p_session uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.scribe_refile(p_engagement,p_id,p_session) $$;
create function public.scribe_file_begin(p_engagement uuid,p_id uuid,p_session uuid,p_kind text,p_name text,p_type text,p_bytes bigint,p_captured timestamptz,p_queued timestamptz default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.scribe_file_begin(p_engagement,p_id,p_session,p_kind,p_name,p_type,p_bytes,p_captured,p_queued) $$;
create function public.scribe_file_done(p_engagement uuid,p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.scribe_file_done(p_engagement,p_id) $$;
create function public.scribe_file_read(p_engagement uuid,p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.scribe_file_read(p_engagement,p_id) $$;
create function public.scribe_speakers(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.scribe_speakers(p_engagement) $$;
create function public.session_team_led(p_engagement uuid,p_session uuid,p_value boolean) returns jsonb
language sql security invoker set search_path='' as $$ select private.session_team_led(p_engagement,p_session,p_value) $$;

revoke all on function private.scribe_attendee(uuid),private.scribe_role(uuid),private.scribe_detail(text,jsonb),private.scribe_state(uuid),
 private.scribe_capture(uuid,uuid,uuid,text,text,jsonb,text,timestamptz,timestamptz),private.scribe_edit(uuid,uuid,text,jsonb,text,integer),private.scribe_refile(uuid,uuid,uuid),
 private.scribe_file_ext(text,text),private.scribe_file_begin(uuid,uuid,uuid,text,text,text,bigint,timestamptz,timestamptz),private.scribe_file_done(uuid,uuid),private.scribe_file_read(uuid,uuid),
 private.scribe_speakers(uuid),private.session_team_led(uuid,uuid,boolean),
 public.scribe_state(uuid),public.scribe_capture(uuid,uuid,uuid,text,text,jsonb,text,timestamptz,timestamptz),public.scribe_edit(uuid,uuid,text,jsonb,text,integer),public.scribe_refile(uuid,uuid,uuid),
 public.scribe_file_begin(uuid,uuid,uuid,text,text,text,bigint,timestamptz,timestamptz),public.scribe_file_done(uuid,uuid),public.scribe_file_read(uuid,uuid),public.scribe_speakers(uuid),
 public.session_team_led(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function private.scribe_attendee(uuid),private.scribe_role(uuid),private.scribe_state(uuid),
 private.scribe_capture(uuid,uuid,uuid,text,text,jsonb,text,timestamptz,timestamptz),private.scribe_edit(uuid,uuid,text,jsonb,text,integer),private.scribe_refile(uuid,uuid,uuid),
 private.scribe_file_begin(uuid,uuid,uuid,text,text,text,bigint,timestamptz,timestamptz),private.scribe_file_done(uuid,uuid),private.scribe_file_read(uuid,uuid),
 private.scribe_speakers(uuid),private.session_team_led(uuid,uuid,boolean),private.scribe_detail(text,jsonb),private.scribe_file_ext(text,text),
 public.scribe_state(uuid),public.scribe_capture(uuid,uuid,uuid,text,text,jsonb,text,timestamptz,timestamptz),public.scribe_edit(uuid,uuid,text,jsonb,text,integer),public.scribe_refile(uuid,uuid,uuid),
 public.scribe_file_begin(uuid,uuid,uuid,text,text,text,bigint,timestamptz,timestamptz),public.scribe_file_done(uuid,uuid),public.scribe_file_read(uuid,uuid),public.scribe_speakers(uuid),
 public.session_team_led(uuid,uuid,boolean) to authenticated;

-- ---------- Storage: the private bucket and who may write and read it ----------
-- The Storage tables belong to Supabase's storage service, which may not exist yet when a fresh
-- database replays migrations. This function is safe to run again; the migration runs it now and
-- the local seed runs it after Storage has started.
create function private.scribe_object_access(p_name text,p_write boolean) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.scribe_files f where f.storage_path=p_name and not f.deleted and (
  case when p_write then private.scribe_attendee(f.engagement_id) is not null and f.uploaded_at is null
   else private.scribe_role(f.engagement_id) is not null end))
$$;
revoke all on function private.scribe_object_access(text,boolean) from public,anon,authenticated;
grant execute on function private.scribe_object_access(text,boolean) to authenticated;

create function private.scribe_storage_setup() returns text
language plpgsql security definer set search_path='' as $$
begin
 if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then return 'storage not started'; end if;
 execute $sql$insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('scribe','scribe',false,15728640,
  array['image/jpeg','image/png','image/webp','image/heic','application/pdf','text/plain','text/csv',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
  on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types$sql$;
 execute 'drop policy if exists scribe_objects_insert on storage.objects';
 execute 'drop policy if exists scribe_objects_update on storage.objects';
 execute 'drop policy if exists scribe_objects_select on storage.objects';
 execute $sql$create policy scribe_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id='scribe' and (select private.scribe_object_access(name,true)))$sql$;
 execute $sql$create policy scribe_objects_update on storage.objects for update to authenticated
  using (bucket_id='scribe' and (select private.scribe_object_access(name,true)))
  with check (bucket_id='scribe' and (select private.scribe_object_access(name,true)))$sql$;
 execute $sql$create policy scribe_objects_select on storage.objects for select to authenticated
  using (bucket_id='scribe' and (select private.scribe_object_access(name,false)))$sql$;
 return 'ready';
end $$;
revoke all on function private.scribe_storage_setup() from public,anon,authenticated;
grant execute on function private.scribe_storage_setup() to service_role;
do $$ begin perform private.scribe_storage_setup();
exception when others then raise notice 'Storage setup skipped: %',sqlerrm; end $$;

commit;
