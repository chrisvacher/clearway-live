-- Milestone 4, step 4: Outcome bullets (D1-11, D1-12) and Outcome confirm (D2-05, D2-06).
-- Live only, after merge and Chris's approval. No session is started and nothing is seeded.
--
-- Two kinds join the interaction registry, each with its own parse_, results_, options_ and items_
-- functions (the milestone 3 engine contract):
--   bullets  One Vision Outcome at a time: "In {base year + 3}, what's true?" A sent bullet is an
--            answer (the wall's text answers, filed under an outcome) and also the outcome's
--            indicator, written by a trigger so the empty-outcome flag is code. While someone
--            types, the text reaches the TV letter by letter through bullet_type: one field
--            lock per bullet (the typist holds it three seconds after the last keystroke) and
--            batching (the room is told at most once every 120 ms, whoever typed).
--   confirm  One answer per person for the whole list: confirm, rename or challenge each
--            provisional outcome, with an optional reason. The TV gets counts only. The
--            facilitator records the room's consensus decision with Mark a decision; a count
--            never decides.
begin;

-- ---------- Records this step adds to ----------
-- A rename keeps the old name for the struck-through line on the TV.
alter table private.vision_outcomes add column renamed_from text check(renamed_from is null or length(btrim(renamed_from)) between 1 and 200);
-- A sent bullet is an indicator. The link lets a change, withdrawal, hide or cleared test answer follow it.
alter table private.outcome_indicators add column submission_id uuid references public.submissions(id) on delete cascade;
create unique index outcome_indicators_submission_idx on private.outcome_indicators(submission_id);

-- ---------- Typed text in progress, field locks, batching and the outcome on the TV ----------
create table private.bullet_drafts (
 id uuid primary key,                       -- the bullet's own id: the future (or existing) answer id
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 attendee_id uuid not null references public.attendees(id),
 outcome_id uuid not null,
 text text not null check(length(text) between 1 and 600),
 seq integer not null check(seq between 0 and 1000000),
 typed_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id),
 foreign key(outcome_id,engagement_id) references private.vision_outcomes(id,engagement_id)
);
create index bullet_drafts_session_idx on private.bullet_drafts(session_id,engagement_id);
create index bullet_drafts_engagement_idx on private.bullet_drafts(engagement_id);
create index bullet_drafts_attendee_idx on private.bullet_drafts(attendee_id);
create index bullet_drafts_outcome_idx on private.bullet_drafts(outcome_id,engagement_id);
create index bullet_drafts_typed_idx on private.bullet_drafts(session_id,typed_at);

-- One holder per bullet at a time. A phone holds its bullet three seconds after its last
-- keystroke (cwl-dur-field-lock); the facilitator's edit holds it the same way.
create table private.bullet_locks (
 bullet_id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 holder uuid not null,
 holder_kind text not null check(holder_kind in ('attendee','facilitator')),
 locked_until timestamptz not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false
);
create index bullet_locks_engagement_idx on private.bullet_locks(engagement_id);

-- When the room was last told about typed text, so it is told at most once every 120 ms.
create table private.bullet_flush (
 session_id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 flushed_at timestamptz not null default 'epoch',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create index bullet_flush_engagement_idx on private.bullet_flush(engagement_id);

-- Which Vision Outcome the TV shows for a bullets session.
create table private.outcome_focus (
 session_id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 outcome_id uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id),
 foreign key(outcome_id,engagement_id) references private.vision_outcomes(id,engagement_id)
);
create index outcome_focus_engagement_idx on private.outcome_focus(engagement_id);
create index outcome_focus_outcome_idx on private.outcome_focus(outcome_id,engagement_id);

alter table private.bullet_drafts enable row level security;
alter table private.bullet_drafts force row level security;
revoke all on private.bullet_drafts from public,anon,authenticated;
grant select,insert,update,delete on private.bullet_drafts to service_role;
create trigger touch_record before update on private.bullet_drafts for each row execute function private.touch_live_record('id');

alter table private.bullet_locks enable row level security;
alter table private.bullet_locks force row level security;
revoke all on private.bullet_locks from public,anon,authenticated;
grant select,insert,update,delete on private.bullet_locks to service_role;
create trigger touch_record before update on private.bullet_locks for each row execute function private.touch_live_record('bullet_id');

alter table private.bullet_flush enable row level security;
alter table private.bullet_flush force row level security;
revoke all on private.bullet_flush from public,anon,authenticated;
grant select,insert,update,delete on private.bullet_flush to service_role;
create trigger touch_record before update on private.bullet_flush for each row execute function private.touch_live_record('session_id');

alter table private.outcome_focus enable row level security;
alter table private.outcome_focus force row level security;
revoke all on private.outcome_focus from public,anon,authenticated;
grant select,insert,update,delete on private.outcome_focus to service_role;
create trigger touch_record before update on private.outcome_focus for each row execute function private.touch_live_record('session_id');

-- ---------- The kinds ----------
insert into private.interaction_kinds(kind,label,input,one_per_person,counts,structured,shares_answers,spotlight,named,position) values
 ('bullets','Outcome bullets',true,false,'answers',true,true,'id','never',180),
 ('confirm','Outcome confirm',true,true,'people',true,false,'none','never',190);

-- ---------- Options: neither kind has settings ----------
create function private.options_bullets(p jsonb,p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$ select case when p='{}'::jsonb then '{}'::jsonb end $$;
create function private.options_confirm(p jsonb,p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$ select case when p='{}'::jsonb then '{}'::jsonb end $$;

-- ---------- Outcome bullets: one answer ----------
-- The answer is the bullet's wording and the outcome it is filed under: value {"outcome": id}.
create function private.parse_bullets(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t text:=btrim(regexp_replace(coalesce(p_text,''),'\s+',' ','g')); oid uuid; k text;
begin
 if jsonb_typeof(p_value) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_value))<>1 or p_value->>'outcome' is null
  or p_value->>'outcome' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_answer'); end if;
 select id into oid from private.vision_outcomes where id=(p_value->>'outcome')::uuid and engagement_id=p_session.engagement_id and not deleted;
 if oid is null or length(t)=0 then return jsonb_build_object('status','invalid_answer'); end if;
 if length(t)>least(p_session.max_characters,280) then return jsonb_build_object('status','limit'); end if;
 if private.screen_text(t) then return jsonb_build_object('status','filtered'); end if;
 k:=btrim(regexp_replace(lower(t),'[^[:alnum:][:space:]]','','g'));
 if length(k)=0 then return jsonb_build_object('status','invalid_answer'); end if;
 return jsonb_build_object('status','ok','text',t,'answers',jsonb_build_array(jsonb_build_object('text',t,'key',k)),'value',jsonb_build_object('outcome',oid));
end $$;

-- A sent bullet is the outcome's indicator. A change rewrites it; a withdrawal, a hide or a
-- cleared test answer retires it. Sending also ends the typed draft. The bullet keeps the slot
-- where its first keystroke landed, so nothing hops when it is sent.
create function private.bullets_sync() returns trigger
language plpgsql security definer set search_path='' as $$
declare kind text; oid uuid; started timestamptz;
begin
 select interaction into kind from public.sessions where id=new.session_id;
 if kind is distinct from 'bullets' then return new; end if;
 oid:=nullif(new.value->>'outcome','')::uuid;
 if oid is not null and not new.deleted and not new.withdrawn and not new.hidden then
  select created_at into started from private.bullet_drafts where id=new.id;
  insert into private.outcome_indicators(engagement_id,outcome_id,text,position,submission_id,created_at)
   values(new.engagement_id,oid,left(new.text,280),coalesce((select max(i.position)+1 from private.outcome_indicators i where i.outcome_id=oid and not i.deleted),0),new.id,coalesce(started,now()))
   on conflict(submission_id) do update set text=excluded.text,outcome_id=excluded.outcome_id,deleted=false;
 else
  update private.outcome_indicators set deleted=true where submission_id=new.id and not deleted;
 end if;
 delete from private.bullet_drafts where id=new.id;
 return new;
end $$;
create trigger bullets_sync after insert or update of text,value,withdrawn,hidden,deleted on public.submissions for each row execute function private.bullets_sync();

-- ---------- Outcome bullets: what every screen shows ----------
-- The outcomes with their counts, and the one the TV shows: its newest six bullets, typed ones
-- included (typing: true, until they are sent). A draft older than a minute is dropped.
create function private.results_bullets(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare base integer; focus uuid; cur uuid; outcomes jsonb; shown jsonb; n integer; sent integer; total integer; people integer; num integer; title text;
begin
 select e.base_year into base from public.engagements e where e.id=p_engagement;
 select f.outcome_id into focus from private.outcome_focus f join private.vision_outcomes v on v.id=f.outcome_id and not v.deleted where f.session_id=p_session and not f.deleted;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'number',o.n,'title',o.title,'count',o.c,'empty',o.c=0) order by o.n),'[]'::jsonb) into outcomes
 from (select v.id,v.title,row_number() over(order by v.position,v.created_at,v.id)::integer as n,
   (select count(*) from private.outcome_indicators i where i.outcome_id=v.id and not i.deleted and length(btrim(i.text))>0)::integer as c
  from private.vision_outcomes v where v.engagement_id=p_engagement and not v.deleted) o;
 cur:=coalesce(focus,(outcomes->0->>'id')::uuid);
 select count(*)::integer,count(distinct s.attendee_id)::integer into total,people from public.submissions s
  where s.engagement_id=p_engagement and s.session_id=p_session and not s.deleted and not s.withdrawn and not s.hidden;
 if cur is null then
  return jsonb_build_object('total',total,'people',people,'words','[]'::jsonb,'year',base+3,'outcomes',outcomes,'current',null);
 end if;
 select (x->>'number')::integer,x->>'title',(x->>'count')::integer into num,title,sent from jsonb_array_elements(outcomes) x where (x->>'id')::uuid=cur;
 with sentb as (
   select coalesce(i.submission_id,i.id) as id,i.created_at,coalesce(d.text,i.text) as text,d.id is not null as typing
   from private.outcome_indicators i
   left join private.bullet_drafts d on d.id=i.submission_id and not d.deleted and d.typed_at>clock_timestamp()-interval '1 minute'
   where i.outcome_id=cur and not i.deleted and length(btrim(i.text))>0
 ), drafts as (
   select d.id,d.created_at,d.text,true as typing from private.bullet_drafts d
   where d.engagement_id=p_engagement and d.session_id=p_session and d.outcome_id=cur and not d.deleted and d.typed_at>clock_timestamp()-interval '1 minute'
    and not exists(select 1 from public.submissions x where x.id=d.id)
 ), every as (select * from sentb union all select * from drafts), ranked as (
   select *,row_number() over(order by created_at,id) as at,count(*) over() as c from every
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'text',text,'typing',typing,'order',at) order by at) filter (where at>c-6),'[]'::jsonb),coalesce(max(c),0)::integer
  into shown,n from ranked;
 return jsonb_build_object('total',total,'people',people,'words','[]'::jsonb,'year',base+3,'outcomes',outcomes,
  'current',jsonb_build_object('id',cur,'number',num,'title',title,'count',sent,'empty',sent=0,'earlier',greatest(0,n-jsonb_array_length(shown)),'bullets',shown));
end $$;

-- The control surface's item list: every bullet, newest first, with Spotlight and Hide by id.
create function private.items_bullets(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',x.id,'text',x.text,'count',1,'hidden',x.hidden) order by x.hidden,x.server_received_at desc,x.id),'[]'::jsonb)
 from (select s.id,s.text,s.hidden,s.server_received_at from public.submissions s where s.session_id=p_session and not s.deleted and not s.withdrawn order by s.server_received_at desc,s.id limit 500) x
$$;

-- ---------- Outcome confirm: one answer ----------
-- One answer per person for the whole list: {"outcomes": {"<outcome id>": {"c": "confirm"|"rename"|"challenge", "name": ..., "reason": ...}}}.
-- A later answer replaces the earlier one, so the phone sends the whole list each time. An outcome
-- that is gone is dropped; a rename needs a name; reasons are optional.
create function private.parse_confirm(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e record; item jsonb; kept jsonb:='{}'::jsonb; c text; nm text; why text; nc integer:=0; nr integer:=0; nx integer:=0;
begin
 if jsonb_typeof(p_value) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_value))<>1 or jsonb_typeof(p_value->'outcomes') is distinct from 'object'
  or (select count(*) from jsonb_object_keys(p_value->'outcomes')) not between 1 and 12 then return jsonb_build_object('status','invalid_answer'); end if;
 for e in select k.key as id,k.value as v from jsonb_each(p_value->'outcomes') k loop
  if e.id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or jsonb_typeof(e.v) is distinct from 'object'
   or exists(select 1 from jsonb_object_keys(e.v) k where k not in ('c','name','reason')) then return jsonb_build_object('status','invalid_answer'); end if;
  c:=e.v->>'c';
  if c is null or c not in ('confirm','rename','challenge') then return jsonb_build_object('status','invalid_answer'); end if;
  if jsonb_typeof(coalesce(e.v->'name','null'::jsonb)) not in ('string','null') or jsonb_typeof(coalesce(e.v->'reason','null'::jsonb)) not in ('string','null') then return jsonb_build_object('status','invalid_answer'); end if;
  nm:=btrim(regexp_replace(coalesce(e.v->>'name',''),'\s+',' ','g')); why:=btrim(regexp_replace(coalesce(e.v->>'reason',''),'\s+',' ','g'));
  if length(nm)>120 or length(why)>280 or (c='rename' and length(nm)=0) then return jsonb_build_object('status','invalid_answer'); end if;
  if (length(nm)>0 and private.screen_text(nm)) or (length(why)>0 and private.screen_text(why)) then return jsonb_build_object('status','filtered'); end if;
  -- An outcome that has gone from the list is dropped, not an error: the answer still stands for the rest.
  if not exists(select 1 from private.vision_outcomes o where o.id=e.id::uuid and o.engagement_id=p_session.engagement_id and not o.deleted) then continue; end if;
  item:=jsonb_build_object('c',c);
  if c='rename' then item:=item||jsonb_build_object('name',nm); end if;
  if length(why)>0 then item:=item||jsonb_build_object('reason',why); end if;
  kept:=kept||jsonb_build_object(e.id,item);
  if c='confirm' then nc:=nc+1; elsif c='rename' then nr:=nr+1; else nx:=nx+1; end if;
 end loop;
 if nc+nr+nx=0 then return jsonb_build_object('status','invalid_answer'); end if;
 return jsonb_build_object('status','ok','text',nc||' confirm, '||nr||' rename, '||nx||' challenge','answers','[]'::jsonb,'value',jsonb_build_object('outcomes',kept));
end $$;

-- ---------- Outcome confirm: what every screen shows ----------
-- Counts only, per outcome, in the list's order. No name, reason or suggested name ever travels here.
create function private.results_confirm(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare rows jsonb; total integer; people integer; confirmed integer; provisional integer;
begin
 select count(*)::integer,count(distinct s.attendee_id)::integer into total,people from public.submissions s
  where s.engagement_id=p_engagement and s.session_id=p_session and not s.deleted and not s.withdrawn and not s.hidden;
 with act as (
   select s.value->'outcomes' as v from public.submissions s
   where s.engagement_id=p_engagement and s.session_id=p_session and not s.deleted and not s.withdrawn and not s.hidden
 ), oc as (
   select v.id,v.title,v.status,v.renamed_from,row_number() over(order by v.position,v.created_at,v.id)::integer as n
   from private.vision_outcomes v where v.engagement_id=p_engagement and not v.deleted
 ), cnt as (
   select oc.id,count(*) filter (where act.v->(oc.id::text)->>'c'='confirm')::integer as c,
     count(*) filter (where act.v->(oc.id::text)->>'c'='rename')::integer as r,
     count(*) filter (where act.v->(oc.id::text)->>'c'='challenge')::integer as x
   from oc left join act on true group by oc.id
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',oc.id,'number',oc.n,'title',oc.title,'was',oc.renamed_from,'c',cnt.c,'r',cnt.r,'x',cnt.x,
   'challenged',oc.status='provisional' and cnt.x>0,
   'decision',case when oc.status='confirmed' then case when oc.renamed_from is not null then 'renamed' else 'confirmed' end end) order by oc.n),'[]'::jsonb),
  count(*) filter (where oc.status='confirmed')::integer,count(*) filter (where oc.status='provisional')::integer
  into rows,confirmed,provisional from oc join cnt on cnt.id=oc.id;
 return jsonb_build_object('total',total,'people',people,'words','[]'::jsonb,'outcomes',rows,'confirmed',confirmed,'provisional',provisional);
end $$;

create function private.items_confirm(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',o.id,'text',o.title,'count',0,'hidden',false) order by o.position,o.created_at,o.id),'[]'::jsonb)
 from private.vision_outcomes o join public.sessions s on s.id=p_session and s.engagement_id=o.engagement_id where not o.deleted
$$;

-- ---------- The phone types: field lock, draft, and the room told at most every 120 ms ----------
-- Room row lock first, like every other press. The text is checked as it is typed (length and
-- the word filter), so nothing the filter would stop ever reaches the TV. A bullet already sent
-- can be re-typed by its author only against the revision they hold; a stale or out-of-order
-- update is ignored. Whoever types, the room's results are rebuilt and broadcast at most once
-- per 120 ms. A caller told "pending" asks again after wait_ms (bullet_nudge) so the last
-- keystrokes are never left waiting.
create function private.bullet_type(p_engagement uuid,p_id uuid,p_session uuid,p_outcome uuid,p_text text,p_seq integer,p_revision integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; who uuid; t text; sub public.submissions; d private.bullet_drafts; l private.bullet_locks; f private.bullet_flush; now_ts timestamptz:=clock_timestamp();
 gap constant interval:=interval '120 milliseconds'; fresh jsonb;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 select id into who from public.attendees where engagement_id=p_engagement and not deleted and id in(select private.room_attendee_ids());
 if who is null then return jsonb_build_object('status','denied'); end if;
 if p_id is null or p_session is null or p_outcome is null or p_text is null or length(p_text)>600 or p_seq is null or p_seq not between 0 and 1000000
  or (p_revision is not null and p_revision not between 0 and 1000000) then return jsonb_build_object('status','invalid_request'); end if;
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted;
 if s.id is null or s.interaction<>'bullets' then return jsonb_build_object('status','invalid_session'); end if;
 if not (r.live_session_id=s.id and s.state='live' and not r.phones_down and (r.burst_ends_at is null or r.burst_ends_at>now_ts)) then return jsonb_build_object('status','closed'); end if;
 if not exists(select 1 from private.vision_outcomes where id=p_outcome and engagement_id=p_engagement and not deleted) then return jsonb_build_object('status','missing'); end if;
 t:=ltrim(regexp_replace(p_text,'\s+',' ','g'));
 if length(btrim(t))>least(s.max_characters,280) then return jsonb_build_object('status','limit'); end if;
 if length(btrim(t))>0 and private.screen_text(btrim(t)) then return jsonb_build_object('status','filtered'); end if;
 select * into sub from public.submissions where id=p_id;
 if found then
  if sub.attendee_id<>who or sub.engagement_id<>p_engagement or sub.session_id<>p_session or sub.deleted or sub.withdrawn or sub.value->>'outcome' is distinct from p_outcome::text then return jsonb_build_object('status','conflict'); end if;
  if p_revision is distinct from sub.revision then return jsonb_build_object('status','stale'); end if;
 elsif p_revision is not null then return jsonb_build_object('status','stale');
 end if;
 select * into d from private.bullet_drafts where id=p_id;
 if found then
  if d.attendee_id<>who or d.session_id<>p_session then return jsonb_build_object('status','conflict'); end if;
  if p_seq<=d.seq then return jsonb_build_object('status','stale'); end if;
 end if;
 select * into l from private.bullet_locks where bullet_id=p_id and not deleted;
 if found and l.locked_until>now_ts and not (l.holder=who and l.holder_kind='attendee') then
  return jsonb_build_object('status','locked','wait_ms',ceil(extract(epoch from l.locked_until-now_ts)*1000)::integer);
 end if;
 insert into private.bullet_locks(bullet_id,engagement_id,holder,holder_kind,locked_until) values(p_id,p_engagement,who,'attendee',now_ts+interval '3 seconds')
  on conflict(bullet_id) do update set holder=excluded.holder,holder_kind='attendee',locked_until=excluded.locked_until,deleted=false;
 if length(btrim(t))=0 then delete from private.bullet_drafts where id=p_id;
 else
  insert into private.bullet_drafts(id,engagement_id,session_id,attendee_id,outcome_id,text,seq,typed_at) values(p_id,p_engagement,p_session,who,p_outcome,t,p_seq,now_ts)
   on conflict(id) do update set text=excluded.text,seq=excluded.seq,typed_at=excluded.typed_at,outcome_id=excluded.outcome_id;
 end if;
 insert into private.bullet_flush(session_id,engagement_id) values(p_session,p_engagement) on conflict(session_id) do nothing;
 select * into f from private.bullet_flush where session_id=p_session;
 -- Clearing a draft is told at once; typing waits for the window.
 if length(btrim(t))>0 and now_ts-f.flushed_at<gap then
  return jsonb_build_object('status','ok','pending',true,'wait_ms',greatest(10,ceil(extract(epoch from gap-(now_ts-f.flushed_at))*1000)::integer));
 end if;
 update private.bullet_flush set flushed_at=clock_timestamp() where session_id=p_session;
 delete from private.bullet_drafts where session_id=p_session and typed_at<now_ts-interval '10 minutes';
 fresh:=private.live_results(p_engagement);
 if fresh is distinct from r.results then update public.room_states set results=fresh where engagement_id=p_engagement returning * into r; end if;
 return jsonb_build_object('status','ok','pending',false,'version',r.version);
end $$;

-- The follow-up for a pending update: tell the room about any typed text the window held back.
-- Cheap when the room is already up to date, so every pending phone may ask.
create function private.bullet_nudge(p_engagement uuid,p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; f private.bullet_flush; now_ts timestamptz; gap constant interval:=interval '120 milliseconds'; fresh jsonb;
begin
 if private.live_role(p_engagement) is distinct from 'participant' or p_session is null then return jsonb_build_object('status','denied'); end if;
 select * into f from private.bullet_flush where session_id=p_session and engagement_id=p_engagement;
 if not found or not exists(select 1 from private.bullet_drafts d where d.session_id=p_session and d.engagement_id=p_engagement and d.typed_at>f.flushed_at) then return jsonb_build_object('status','ok','pending',false,'clean',true); end if;
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or r.live_session_id is distinct from p_session then return jsonb_build_object('status','closed'); end if;
 select * into f from private.bullet_flush where session_id=p_session;
 now_ts:=clock_timestamp();
 if now_ts-f.flushed_at<gap then return jsonb_build_object('status','ok','pending',true,'wait_ms',greatest(10,ceil(extract(epoch from gap-(now_ts-f.flushed_at))*1000)::integer)); end if;
 update private.bullet_flush set flushed_at=clock_timestamp() where session_id=p_session;
 fresh:=private.live_results(p_engagement);
 if fresh is distinct from r.results then update public.room_states set results=fresh where engagement_id=p_engagement returning * into r; end if;
 return jsonb_build_object('status','ok','pending',false,'version',r.version);
end $$;

-- ---------- Outcome bullets: the facilitator's presses ----------
-- show:  put one Vision Outcome on the TV (the TV changes in the same moment).
-- edit:  fix a bullet's wording (a number, a date, a name). It honors the field lock: while its
--        author is typing it, the press waits; and it holds the lock for three seconds itself.
create function private.bullet_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; me uuid:=private.clearway_user_id(); done private.room_controls; oid uuid; bid uuid; sub public.submissions; l private.bullet_locks; t text; k text; who text; now_ts timestamptz:=clock_timestamp(); logged text;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or p_action not in ('show','edit') or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 logged:='bullets_'||p_action;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id=p_engagement and done.action=logged then return jsonb_build_object('status','duplicate','version',r.version); end if;
  return jsonb_build_object('status','conflict');
 end if;
 select * into s from public.sessions where id=r.live_session_id and not deleted;
 if s.id is null or s.interaction<>'bullets' or s.state='closed' then return jsonb_build_object('status','invalid_state'); end if;
 if p_action='show' then
  if p->>'outcome' is null or p->>'outcome' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
  oid:=(p->>'outcome')::uuid;
  if not exists(select 1 from private.vision_outcomes where id=oid and engagement_id=p_engagement and not deleted) then return jsonb_build_object('status','missing'); end if;
  insert into private.outcome_focus(session_id,engagement_id,outcome_id) values(s.id,p_engagement,oid)
   on conflict(session_id) do update set outcome_id=excluded.outcome_id,deleted=false;
  bid:=oid;
 else
  if p->>'bullet' is null or p->>'bullet' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or jsonb_typeof(p->'text') is distinct from 'string' then return jsonb_build_object('status','invalid_request'); end if;
  bid:=(p->>'bullet')::uuid;
  t:=btrim(regexp_replace(p->>'text','\s+',' ','g'));
  if length(t) not between 1 and least(s.max_characters,280) then return jsonb_build_object('status','invalid_request'); end if;
  if private.screen_text(t) then return jsonb_build_object('status','filtered'); end if;
  select * into sub from public.submissions where id=bid and engagement_id=p_engagement and session_id=s.id and not deleted and not withdrawn;
  if sub.id is null then return jsonb_build_object('status','missing'); end if;
  select * into l from private.bullet_locks where bullet_id=bid and not deleted;
  if found and l.locked_until>now_ts and not (l.holder_kind='facilitator' and l.holder=me) then
   return jsonb_build_object('status','locked','wait_ms',ceil(extract(epoch from l.locked_until-now_ts)*1000)::integer);
  end if;
  if t=sub.text then return jsonb_build_object('status','unchanged','version',r.version); end if;
  k:=btrim(regexp_replace(lower(t),'[^[:alnum:][:space:]]','','g'));
  if length(k)=0 then return jsonb_build_object('status','invalid_request'); end if;
  update public.submissions set text=t,answers=jsonb_build_array(jsonb_build_object('text',t,'key',k)) where id=bid;
  insert into private.bullet_locks(bullet_id,engagement_id,holder,holder_kind,locked_until) values(bid,p_engagement,me,'facilitator',now_ts+interval '3 seconds')
   on conflict(bullet_id) do update set holder=excluded.holder,holder_kind='facilitator',locked_until=excluded.locked_until,deleted=false;
 end if;
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,me,logged,s.id,r.version,clock_timestamp());
 select split_part(btrim(name),' ',1) into who from public.clearway_users where id=me;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action',logged,'by',who,'version',r.version,'changed',true));
 return jsonb_build_object('status','ok','version',r.version,'id',bid);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

-- ---------- Outcome confirm: the facilitator's list and presses ----------
-- What the room said, for the facilitator only: the counts, the reasons and the names people
-- suggested (never who). A challenged outcome comes first until it is decided.
create function private.confirm_for(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.room_states; s public.sessions; out jsonb;
begin
 if not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 select * into s from public.sessions where id=r.live_session_id and not deleted;
 if s.id is null or s.interaction<>'confirm' then return jsonb_build_object('status','ok','session',null,'outcomes','[]'::jsonb,'range',private.outcome_range(p_engagement)); end if;
 with act as (
   select x.value->'outcomes' as v from public.submissions x where x.engagement_id=p_engagement and x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden
 ), oc as (
   select v.id,v.title,v.description,v.what_we_stop,v.status,v.renamed_from,v.decision_id,row_number() over(order by v.position,v.created_at,v.id)::integer as n
   from private.vision_outcomes v where v.engagement_id=p_engagement and not v.deleted
 ), per as (
   select oc.id,act.v->(oc.id::text)->>'c' as c,nullif(act.v->(oc.id::text)->>'name','') as name,nullif(act.v->(oc.id::text)->>'reason','') as reason from oc join act on act.v ? (oc.id::text)
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',oc.id,'number',oc.n,'title',oc.title,'was',oc.renamed_from,'description',oc.description,'stop',oc.what_we_stop,'status',oc.status,'decision_id',oc.decision_id,
   'c',(select count(*) from per where per.id=oc.id and per.c='confirm'),'r',(select count(*) from per where per.id=oc.id and per.c='rename'),'x',(select count(*) from per where per.id=oc.id and per.c='challenge'),
   'challenged',oc.status='provisional' and exists(select 1 from per where per.id=oc.id and per.c='challenge'),
   'reasons',coalesce((select jsonb_agg(jsonb_build_object('c',q.c,'text',q.reason) order by q.c desc,q.reason) from (select * from per where per.id=oc.id and per.reason is not null order by per.reason limit 30) q),'[]'::jsonb),
   'renames',coalesce((select jsonb_agg(jsonb_build_object('name',g.name,'count',g.n) order by g.n desc,g.name) from (select min(per.name) as name,count(*)::integer as n from per where per.id=oc.id and per.c='rename' and per.name is not null group by lower(per.name) order by count(*) desc limit 12) g),'[]'::jsonb))
   order by (oc.status='provisional' and exists(select 1 from per where per.id=oc.id and per.c='challenge')) desc,oc.n),'[]'::jsonb) into out from oc;
 return jsonb_build_object('status','ok','session',s.id,'outcomes',out,'range',private.outcome_range(p_engagement),
  'provisional',(select count(*) from private.vision_outcomes where engagement_id=p_engagement and status='provisional' and not deleted));
end $$;

-- decide:  the room's consensus on one provisional outcome: confirm, rename (confirm under a new
--          name) or remove. It is Mark a decision (subject: outcome) and the outcome's new state in
--          one press. A count never decides: nothing here reads one.
-- details: the outcome's one-line description and what the church will stop, any time.
create function private.confirm_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; me uuid:=private.clearway_user_id(); done private.room_controls; o private.vision_outcomes; kind text; nm text; why text; descr text; stp text; marked jsonb; word text; who text; logged text;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or p_action not in ('decide','details') or jsonb_typeof(p) is distinct from 'object'
  or p->>'outcome' is null or p->>'outcome' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
 logged:=case p_action when 'decide' then 'mark_decision' else 'outcome_details' end;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id=p_engagement and done.action=logged then return jsonb_build_object('status','duplicate','version',r.version); end if;
  return jsonb_build_object('status','conflict');
 end if;
 select * into o from private.vision_outcomes where id=(p->>'outcome')::uuid and engagement_id=p_engagement and not deleted for update;
 if o.id is null then return jsonb_build_object('status','missing'); end if;
 if (p ? 'description' and jsonb_typeof(p->'description') is distinct from 'string') or (p ? 'stop' and jsonb_typeof(p->'stop') is distinct from 'string') then return jsonb_build_object('status','invalid_request'); end if;
 descr:=case when p ? 'description' then btrim(regexp_replace(p->>'description','\s+',' ','g')) end;
 stp:=case when p ? 'stop' then btrim(regexp_replace(p->>'stop','\s+',' ','g')) end;
 if length(coalesce(descr,''))>200 or length(coalesce(stp,''))>400 then return jsonb_build_object('status','invalid_request'); end if;
 if (descr is not null and private.screen_text(descr)) or (stp is not null and private.screen_text(stp)) then return jsonb_build_object('status','filtered'); end if;
 if p_action='details' then
  if descr is null and stp is null then return jsonb_build_object('status','invalid_request'); end if;
  update private.vision_outcomes set description=coalesce(descr,description),what_we_stop=coalesce(stp,what_we_stop) where id=o.id;
 else
  select * into s from public.sessions where id=r.live_session_id and not deleted;
  if s.id is null or s.interaction<>'confirm' or s.state='closed' then return jsonb_build_object('status','invalid_state'); end if;
  if o.status<>'provisional' then return jsonb_build_object('status','decided'); end if;
  kind:=p->>'kind';
  if kind is null or kind not in ('confirm','rename','remove') or jsonb_typeof(coalesce(p->'reasons','""'::jsonb)) is distinct from 'string' then return jsonb_build_object('status','invalid_request'); end if;
  why:=btrim(coalesce(p->>'reasons',''));
  if length(why)>1000 then return jsonb_build_object('status','invalid_request'); end if;
  if kind='rename' then
   if jsonb_typeof(p->'name') is distinct from 'string' then return jsonb_build_object('status','invalid_request'); end if;
   nm:=btrim(regexp_replace(p->>'name','\s+',' ','g'));
   if length(nm) not between 1 and 120 then return jsonb_build_object('status','invalid_request'); end if;
   if private.screen_text(nm) then return jsonb_build_object('status','filtered'); end if;
   if lower(nm)=lower(o.title) then return jsonb_build_object('status','invalid_request'); end if;
  end if;
  word:=case kind when 'confirm' then 'Confirmed' when 'rename' then 'Renamed to '||nm else 'Removed' end;
  marked:=private.decision_mark(p_engagement,p_id,jsonb_build_object('decision',word,'reasons',why,'label',o.title,'subject','outcome','subject_id',o.id,'session',s.id));
  if marked->>'status' is distinct from 'ok' then return marked; end if;
  if kind='remove' then
   update private.vision_outcomes set deleted=true,decision_id=p_id,description=coalesce(descr,description),what_we_stop=coalesce(stp,what_we_stop) where id=o.id;
  else
   update private.vision_outcomes set status='confirmed',confirmed_at=clock_timestamp(),decision_id=p_id,
     title=case when kind='rename' then nm else title end,renamed_from=case when kind='rename' then title else renamed_from end,
     description=coalesce(descr,description),what_we_stop=coalesce(stp,what_we_stop) where id=o.id;
  end if;
 end if;
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 -- decision_mark logged the press for a decision; a details press logs its own.
 if p_action='details' then
  insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,me,logged,r.live_session_id,r.version,clock_timestamp());
  select split_part(btrim(name),' ',1) into who from public.clearway_users where id=me;
  perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action',logged,'by',who,'version',r.version,'changed',false));
 end if;
 return jsonb_build_object('status','ok','version',r.version,'outcome',o.id,'range',private.outcome_range(p_engagement));
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

-- ---------- Public wrappers: the caller's own session decides, as everywhere else ----------
create function public.bullet_type(p_engagement uuid,p_id uuid,p_session uuid,p_outcome uuid,p_text text,p_seq integer,p_revision integer default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.bullet_type(p_engagement,p_id,p_session,p_outcome,p_text,p_seq,p_revision) $$;
create function public.bullet_nudge(p_engagement uuid,p_session uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.bullet_nudge(p_engagement,p_session) $$;
create function public.bullet_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.bullet_control(p_engagement,p_id,p_action,p) $$;
create function public.confirm_for(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.confirm_for(p_engagement) $$;
create function public.confirm_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.confirm_control(p_engagement,p_id,p_action,p) $$;

revoke all on function private.options_bullets(jsonb,uuid),private.options_confirm(jsonb,uuid),private.parse_bullets(public.sessions,text,jsonb),private.bullets_sync(),
 private.results_bullets(uuid,uuid,text[]),private.items_bullets(uuid,text[]),private.parse_confirm(public.sessions,text,jsonb),private.results_confirm(uuid,uuid,text[]),private.items_confirm(uuid,text[]),
 private.bullet_type(uuid,uuid,uuid,uuid,text,integer,integer),private.bullet_nudge(uuid,uuid),private.bullet_control(uuid,uuid,text,jsonb),private.confirm_for(uuid),private.confirm_control(uuid,uuid,text,jsonb),
 public.bullet_type(uuid,uuid,uuid,uuid,text,integer,integer),public.bullet_nudge(uuid,uuid),public.bullet_control(uuid,uuid,text,jsonb),public.confirm_for(uuid),public.confirm_control(uuid,uuid,text,jsonb)
 from public,anon,authenticated;
grant execute on function private.bullet_type(uuid,uuid,uuid,uuid,text,integer,integer),private.bullet_nudge(uuid,uuid),private.bullet_control(uuid,uuid,text,jsonb),private.confirm_for(uuid),private.confirm_control(uuid,uuid,text,jsonb),
 public.bullet_type(uuid,uuid,uuid,uuid,text,integer,integer),public.bullet_nudge(uuid,uuid),public.bullet_control(uuid,uuid,text,jsonb),public.confirm_for(uuid),public.confirm_control(uuid,uuid,text,jsonb)
 to authenticated;
commit;
