-- Milestone 6, step 4: What We Heard drafted from the accepted themes (PRE-08).
--
-- On the Discover setup page the facilitator presses Draft What We Heard. One deeper-model call reads the accepted themes and survey
-- findings (through private.discover_accepted_themes, step 3, which stands on step 1's records) and drafts one headline with depth for each
-- of the engagement's What We Heard content steps in the run of show: a number, one line, the detail and up to three quotes for phones.
-- The steps already exist in both Wayfinding templates (20261104180000): content steps whose options.source is "Congregational survey",
-- "Four Helpful Lists", "Board and staff input conversations" or "Leadership interviews". Steps are matched by that source.
-- The facilitator edits each draft and presses Apply, which writes the step's headline, number, source and phone depth through the run
-- of show's own save (show_write, with its permission checks and revision check). The draft is never the room's: nothing reaches the TV
-- or a phone until that step goes live as usual.
--
-- The job is engagement-level (like the overnight draft and the themes draft): its own round, claim, apply and fail, every run logged
-- in private.ai_runs. The model sees accepted theme labels, details, figures and quotes under short refs (t1, q1): never a note's person,
-- a title, an id, an attendee or a name. The number on a headline is the figure of the theme the model names as its lead; the model
-- never writes it. Quotes are chosen by ref and copied from the inputs, so they are the room's own words, word for word.
--
-- New:
--   private.heard_rounds             one drafting round per engagement: pending, drafting, ready, failed, idle
--   private.heard_drafts             one draft per engagement and source (survey, four_lists, input, interviews), with its test flag
--   private.heard_source_key, heard_steps, heard_themes, heard_inputs
--   private.discover_heard_state, discover_heard_start, discover_heard_edit, discover_heard_discard, discover_heard_applied   (facilitators)
--   private.discover_heard_due, discover_heard_claim, discover_heard_apply, discover_heard_fail                              (the worker, service role)
--   public wrappers (security invoker) for each
--
-- Shared objects touched, each a superset of its latest definition:
--   private.ai_runs ai_runs_job_check      step 3's list (candidates, fold_four_lists, draft_discover_themes) plus draft_what_we_heard
--   private.ai_runs ai_runs_session_check  step 3's (overnight_draft, draft_discover_themes) plus draft_what_we_heard (engagement-level)
--   private.reset_practice_room            the newest definition (step 2's wrapper over step 3's base), renamed to _base4 and wrapped; also clears the new tables
--   private.rehearsal_control              the newest definition (step 2's wrapper over step 1's), renamed to _base4 and wrapped; Clear test answers also clears test drafts
-- Not touched, on purpose: ai_on, ai_claim, ai_apply (the job has no session), and the run of show's own functions (Apply uses show_write as it is).
begin;

-- ---------- The AI job check ----------
alter table private.ai_runs drop constraint ai_runs_job_check;
alter table private.ai_runs add constraint ai_runs_job_check check(job in ('combine_words','group_wall','summarize_wall','fold_questions','merge_reasons','group_lens','overnight_draft','draft_lens_summary','fold_lens_summary','propose_candidates','fold_four_lists','draft_discover_themes','draft_what_we_heard'));
alter table private.ai_runs drop constraint ai_runs_session_check;
alter table private.ai_runs add constraint ai_runs_session_check check(session_id is not null or job in ('overnight_draft','draft_discover_themes','draft_what_we_heard'));

-- ---------- Records ----------
-- One drafting round per engagement. The facilitator's press makes it pending; the worker claims it with a lease.
create table private.heard_rounds (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 status text not null default 'pending' check(status in ('pending','drafting','ready','failed','idle')),
 request_id uuid,
 requested_at timestamptz not null default clock_timestamp(),
 requested_by uuid references public.clearway_users(id),
 attempts integer not null default 0 check(attempts between 0 and 100),
 lease_id uuid,
 lease_run uuid references private.ai_runs(id) on delete set null,
 lease_until timestamptz,
 last_failed_at timestamptz,
 last_error text check(last_error is null or length(last_error)<=200),
 last_ok_at timestamptz,
 last_offered integer check(last_offered is null or last_offered between 0 and 100),
 last_refused integer check(last_refused is null or last_refused between 0 and 100),
 last_kept integer check(last_kept is null or last_kept between 0 and 100),
 inputs jsonb not null default '{}' check(jsonb_typeof(inputs)='object' and pg_column_size(inputs)<=4096),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false
);
create unique index heard_rounds_engagement_idx on private.heard_rounds(engagement_id) where not deleted;
create index heard_rounds_requested_by_idx on private.heard_rounds(requested_by) where requested_by is not null;
create index heard_rounds_lease_run_idx on private.heard_rounds(lease_run) where lease_run is not null;

alter table private.heard_rounds enable row level security;
alter table private.heard_rounds force row level security;
revoke all on private.heard_rounds from public,anon,authenticated;
grant select,insert,update,delete on private.heard_rounds to service_role;
create trigger touch_record before update on private.heard_rounds for each row execute function private.touch_live_record('id');

-- A draft is what the facilitator edits and applies: the number, the one line, the detail and quotes for phones, and what it rests on.
-- thin is worked out in code from the lead theme's counts when the draft is made; the page adds the words "thin data" to the line.
create table private.heard_drafts (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 source_key text not null check(source_key in ('survey','four_lists','input','interviews')),
 number text not null default '' check(length(number)<=12),
 line text not null default '' check(length(line)<=200),
 detail text not null default '' check(length(detail)<=1000),
 quotes jsonb not null default '[]' check(jsonb_typeof(quotes)='array' and jsonb_array_length(quotes)<=3 and pg_column_size(quotes)<=4096),
 rests jsonb not null default '[]' check(jsonb_typeof(rests)='array' and jsonb_array_length(rests)<=6 and pg_column_size(rests)<=4096),
 thin boolean not null default false,
 thin_reason text check(thin_reason is null or length(thin_reason)<=80),
 basis text check(basis is null or length(basis)<=120),
 theme_ids uuid[] not null default array[]::uuid[],
 by_hand boolean not null default false,
 edited boolean not null default false,
 ai_run uuid references private.ai_runs(id) on delete set null,
 drafted_at timestamptz,
 applied_at timestamptz,
 applied_session uuid,
 test boolean not null default false,
 seq bigint generated always as identity,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(applied_session,engagement_id) references public.sessions(id,engagement_id)
);
create unique index heard_drafts_source_idx on private.heard_drafts(engagement_id,source_key) where not deleted;
create index heard_drafts_ai_run_idx on private.heard_drafts(ai_run) where ai_run is not null;
create index heard_drafts_applied_session_idx on private.heard_drafts(applied_session,engagement_id) where applied_session is not null;

alter table private.heard_drafts enable row level security;
alter table private.heard_drafts force row level security;
revoke all on private.heard_drafts from public,anon,authenticated;
grant select,insert,update,delete on private.heard_drafts to service_role;
create trigger touch_record before update on private.heard_drafts for each row execute function private.touch_live_record('id');
-- A draft made during a rehearsal is a test row, so Clear test answers puts it away.
create trigger mark_test before insert on private.heard_drafts for each row execute function private.mark_test();

-- ---------- Matching the run of show's steps ----------
-- A step's source reads "Congregational survey" and, once a headline is applied, "Congregational survey · 87 respondents": the words before
-- the first " · " name the source.
create function private.heard_source_key(p_source text) returns text
language sql immutable security invoker set search_path='' as $$
 select case lower(btrim(split_part(coalesce(p_source,''),' · ',1)))
  when 'congregational survey' then 'survey' when 'four helpful lists' then 'four_lists'
  when 'board and staff input conversations' then 'input' when 'leadership interviews' then 'interviews' end
$$;

-- The engagement's What We Heard content steps, the first of each source in the run of show's order.
create function private.heard_steps(p_engagement uuid) returns table(source_key text,session_id uuid,title text,part text,state text,source_name text)
language sql stable security definer set search_path='' as $$
 select distinct on (x.k) x.k,x.id,x.title,x.part,x.state,btrim(split_part(x.options->>'source',' · ',1))
 from (select s.id,s.title,s.part,s.state,s.options,s.position,private.heard_source_key(s.options->>'source') as k from public.sessions s
  where s.engagement_id=p_engagement and not s.deleted and s.interaction='content' and coalesce(s.options->>'screen','headline')='headline') x
 where x.k is not null
 order by x.k,array_position(array['Discover','Pre-call','Day 1','Day 2','Follow-up'],x.part),x.position,x.id
$$;

-- ---------- The accepted themes, by What We Heard source ----------
-- Only accepted themes (step 3's function). A survey theme and a Four Helpful Lists theme keep their own counts. A conversation theme is
-- counted again for each kind of note it rests on: its input conversations for "Board and staff input conversations" and its interviews for
-- "Leadership interviews", out of the notes of that kind. The figure is the number the headline carries: a survey finding's own figure when
-- it is short, and otherwise "4 of 5". Quotes are the room's own words from that kind of source, with no name in them. `named` marks a theme
-- whose label or detail carries a name; the model is never given one.
create function private.heard_themes(p_engagement uuid)
returns table(source_key text,seq bigint,theme_id uuid,label text,detail text,figure text,count_text text,n integer,o integer,thin boolean,strong boolean,named boolean,quotes jsonb)
language sql stable security definer set search_path='' as $$
 with names as materialized (select private.discover_names(p_engagement) as v),
 acc as materialized (select a.theme_id,a.source,a.label,a.detail,a.rests_on,a.out_of,a.quotes,t.seq as tseq
   from private.discover_accepted_themes(p_engagement) a join private.discover_themes t on t.id=a.theme_id and t.engagement_id=p_engagement),
 notes as materialized (select n.id,n.kind from private.conversation_notes n where n.engagement_id=p_engagement and not n.deleted),
 totals as (select (count(*) filter (where nn.kind='input'))::integer as inp,(count(*) filter (where nn.kind='interview'))::integer as iv from notes nn),
 rests as (select a.theme_id,nn.kind,count(distinct nn.id)::integer as c
   from acc a join private.discover_theme_sources s on s.engagement_id=p_engagement and not s.deleted and s.note_id is not null
     and (s.theme_id=a.theme_id or s.theme_id in (select m.id from private.discover_themes m where m.merged_into=a.theme_id and m.engagement_id=p_engagement and not m.deleted))
   join notes nn on nn.id=s.note_id
   where a.source='conversations' group by a.theme_id,nn.kind),
 base as (
  select 'survey'::text as k,'survey'::text as src,a.theme_id,a.tseq,a.label,a.detail,a.rests_on as n,a.out_of as o,a.quotes from acc a where a.source='survey'
  union all select 'four_lists','four_lists',a.theme_id,a.tseq,a.label,a.detail,a.rests_on,a.out_of,a.quotes from acc a where a.source='four_lists'
  union all select case r.kind when 'input' then 'input' else 'interviews' end,'conversations',a.theme_id,a.tseq,a.label,a.detail,r.c,case r.kind when 'input' then t.inp else t.iv end,a.quotes
   from acc a join rests r on r.theme_id=a.theme_id cross join totals t where a.source='conversations')
 select b.k,b.tseq,b.theme_id,b.label,b.detail,
  case when b.k='survey' and length(btrim(b.detail)) between 1 and 12 then btrim(b.detail)
   when b.k='survey' and b.o is null then b.n::text else b.n::text||' of '||coalesce(b.o,b.n)::text end,
  case b.k when 'survey' then b.n::text||case when b.o is not null then ' of '||b.o::text else '' end||' respondents'
   when 'four_lists' then b.n::text||' of '||coalesce(b.o,b.n)::text||' people'
   when 'input' then b.n::text||' of '||coalesce(b.o,b.n)::text||' conversations'
   else b.n::text||' of '||coalesce(b.o,b.n)::text||' interviews' end,
  b.n,b.o,private.discover_is_thin(b.src,b.n,b.o),private.discover_is_strong(b.src,b.n,b.o),
  private.discover_has_name(b.label||' '||b.detail,(select v from names)),
  coalesce((select jsonb_agg(jsonb_build_object('text',x.t,'label',x.lbl) order by x.ord) from (
    select e.ord,e.q->>'quote' as t,case when b.k='four_lists' then 'Four Helpful Lists card' when b.k='input' then 'Board or staff conversation' else 'Leadership interview' end as lbl
    from jsonb_array_elements(b.quotes) with ordinality e(q,ord)
    where e.q->>'quote' is not null and not private.discover_has_name(e.q->>'quote',(select v from names))
     and ((b.k='four_lists' and e.q->>'kind'='card')
      or (b.k in ('input','interviews') and e.q->>'kind'='note' and exists(select 1 from notes nn where nn.id=(e.q->>'id')::uuid and nn.kind=case b.k when 'input' then 'input' else 'interview' end)))) x),'[]'::jsonb)
 from base b
$$;

-- What the model reads: for each source that has a step and at least one accepted theme, the themes under refs (t1..) with their figure, count,
-- thin mark and quotes under refs (q1..). At most 12 themes a source, the strongest first. Never a note's person, a title, an id of a
-- person, an attendee or a name. The ids are kept in the run's inputs so the apply can map refs back; the prompt prints refs only.
create function private.heard_inputs(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare k record; th record; q record; srcs jsonb:='[]'::jsonb; ths jsonb; qs jsonb; tn integer:=0; qn integer:=0; basis text; v_total integer; v_max integer;
begin
 for k in select s.source_key from private.heard_steps(p_engagement) s order by array_position(array['survey','four_lists','input','interviews'],s.source_key) loop
  ths:='[]'::jsonb; v_max:=0;
  for th in select t.* from private.heard_themes(p_engagement) t where t.source_key=k.source_key and not t.named order by t.strong desc,t.n desc,t.seq limit 12 loop
   tn:=tn+1; qs:='[]'::jsonb;
   for q in select e.value as j from jsonb_array_elements(th.quotes) e loop
    qn:=qn+1; qs:=qs||jsonb_build_array(jsonb_build_object('ref','q'||qn,'text',q.j->>'text','label',q.j->>'label'));
   end loop;
   v_max:=greatest(v_max,coalesce(th.o,0));
   ths:=ths||jsonb_build_array(jsonb_build_object('ref','t'||tn,'id',th.theme_id,'label',th.label,'detail',th.detail,'figure',th.figure,'count',th.count_text,'thin',th.thin,'quotes',qs));
  end loop;
  if jsonb_array_length(ths)=0 then continue; end if;
  if k.source_key='survey' then select e.survey_respondents into v_total from public.engagements e where e.id=p_engagement; basis:=case when v_total is not null then v_total||' respondents' end;
  elsif k.source_key='four_lists' then basis:=case when v_max>0 then v_max||' people' end;
  else select count(*)::integer into v_total from private.conversation_notes n where n.engagement_id=p_engagement and not n.deleted and n.kind=case k.source_key when 'input' then 'input' else 'interview' end;
   basis:=case when v_total>0 then v_total||case k.source_key when 'input' then ' conversations' else ' interviews' end end;
  end if;
  srcs:=srcs||jsonb_build_array(jsonb_build_object('key',k.source_key,'name',case k.source_key when 'survey' then 'Congregational survey' when 'four_lists' then 'Four Helpful Lists'
   when 'input' then 'Board and staff input conversations' else 'Leadership interviews' end,'basis',basis,'themes',ths));
 end loop;
 return jsonb_build_object('sources',srcs);
end $$;

-- ---------- The page's state ----------
-- For each of the four sources: its step in the run of show (or none), how many accepted themes it has and how many are thin, and its draft.
create function private.discover_heard_state(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,false); r private.heard_rounds; ai boolean; out jsonb;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 select * into r from private.heard_rounds where engagement_id=p_engagement and not deleted;
 select coalesce(e.settings->>'ai_enabled','false')='true' into ai from public.engagements e where e.id=p_engagement;
 with th as materialized (select * from private.heard_themes(p_engagement)),
 st as materialized (select * from private.heard_steps(p_engagement))
 select jsonb_build_object('status','ok','server_time',clock_timestamp(),'ai',coalesce(ai,false),
  'round',case when r.id is not null then jsonb_build_object('status',r.status,'requested_at',r.requested_at,'attempts',r.attempts,'error',r.last_error,'ok_at',r.last_ok_at,
     'offered',r.last_offered,'refused',r.last_refused,'kept',r.last_kept) end,
  'sources',coalesce((select jsonb_agg(jsonb_build_object('key',v.k,'name',v.name,
     'step',(select jsonb_build_object('id',s.session_id,'title',s.title,'part',s.part,'state',s.state) from st s where s.source_key=v.k),
     'themes',(select count(*) from th t where t.source_key=v.k),
     'thin_themes',(select count(*) from th t where t.source_key=v.k and t.thin),
     'draft',(select jsonb_build_object('id',d.id,'number',d.number,'line',d.line,'detail',d.detail,'quotes',d.quotes,'rests',d.rests,'thin',d.thin,'thin_reason',d.thin_reason,
        'basis',d.basis,'by_hand',d.by_hand,'edited',d.edited,'ai',d.ai_run is not null,'applied_at',d.applied_at,
        'stale',not d.by_hand and exists(select 1 from private.discover_themes x where x.engagement_id=p_engagement and not x.deleted and x.updated_at>d.drafted_at
           and x.source=case v.k when 'survey' then 'survey' when 'four_lists' then 'four_lists' else 'conversations' end))
       from private.heard_drafts d where d.engagement_id=p_engagement and d.source_key=v.k and not d.deleted)) order by v.ord)
    from (values (1,'survey','Congregational survey'),(2,'four_lists','Four Helpful Lists'),(3,'input','Board and staff input conversations'),(4,'interviews','Leadership interviews')) v(ord,k,name)),'[]'::jsonb))
 into out;
 return out;
end $$;

-- ---------- Draft What We Heard, pressed by the facilitator ----------
create function private.discover_heard_start(p_engagement uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true); r private.heard_rounds; t timestamptz:=clock_timestamp(); has_round boolean;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_id is null then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 if coalesce((select e.settings->>'ai_enabled' from public.engagements e where e.id=p_engagement),'false')<>'true' then return jsonb_build_object('status','ai_off'); end if;
 if not exists(select 1 from private.heard_steps(p_engagement) s join private.heard_themes(p_engagement) h on h.source_key=s.source_key and not h.named) then return jsonb_build_object('status','nothing'); end if;
 select * into r from private.heard_rounds where engagement_id=p_engagement and not deleted for update;
 has_round:=found;
 if has_round and r.request_id=p_id then return jsonb_build_object('status','duplicate','round',r.status); end if;
 -- One at a time. A round that has run three minutes without finishing may be started over.
 if has_round and r.status in ('pending','drafting') and r.requested_at>t-interval '3 minutes' then return jsonb_build_object('status','busy'); end if;
 if has_round then
  if r.lease_run is not null then update private.ai_runs set status='stale',finished_at=t where id=r.lease_run and status='running'; end if;
  update private.heard_rounds set status='pending',request_id=p_id,requested_at=t,requested_by=private.clearway_user_id(),attempts=0,
   lease_id=null,lease_run=null,lease_until=null,last_failed_at=null,last_error=null where id=r.id;
 else
  insert into private.heard_rounds(engagement_id,status,request_id,requested_at,requested_by) values(p_engagement,'pending',p_id,t,private.clearway_user_id());
 end if;
 return jsonb_build_object('status','ok');
end $$;

-- ---------- Edit, discard and apply a draft ----------
-- p: number (12 characters at most), line (140, with at most one **bold phrase**), detail (600) and keep (the positions of the quotes to keep,
-- counted from 0). A source with no draft gets a hand-written one, so the facilitator is never waiting on AI.
create function private.discover_heard_edit(p_engagement uuid,p_source text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true); d private.heard_drafts; v_number text; v_line text; v_detail text; keep integer[]; v_quotes jsonb;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_source is null or p_source not in ('survey','four_lists','input','interviews') or p is null or jsonb_typeof(p)<>'object' then return jsonb_build_object('status','invalid_request'); end if;
 v_number:=btrim(regexp_replace(coalesce(p->>'number',''),'\s+',' ','g'));
 v_line:=btrim(regexp_replace(coalesce(p->>'line',''),'\s+',' ','g'));
 v_detail:=btrim(regexp_replace(coalesce(p->>'detail',''),E'[ \\t]+',' ','g'));
 if length(v_number)>12 or length(v_line) not between 1 and 140 or length(v_detail)>600
  or (v_line ~ '\*' and v_line !~ '^[^*]*\*\*[^*]+\*\*[^*]*$') or (jsonb_typeof(p->'keep') is not null and jsonb_typeof(p->'keep')<>'array')
  then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 if not exists(select 1 from private.heard_steps(p_engagement) s where s.source_key=p_source) then return jsonb_build_object('status','no_step'); end if;
 select * into d from private.heard_drafts where engagement_id=p_engagement and source_key=p_source and not deleted for update;
 if not found then
  insert into private.heard_drafts(engagement_id,source_key,number,line,detail,by_hand,edited) values(p_engagement,p_source,v_number,v_line,v_detail,true,true);
  return jsonb_build_object('status','ok');
 end if;
 v_quotes:=d.quotes;
 if jsonb_typeof(p->'keep')='array' then
  select coalesce(array_agg(x::integer),array[]::integer[]) into keep from jsonb_array_elements_text(p->'keep') x where x ~ '^[0-9]$';
  select coalesce(jsonb_agg(e.q order by e.ord),'[]'::jsonb) into v_quotes from jsonb_array_elements(d.quotes) with ordinality e(q,ord) where (e.ord-1)::integer=any(keep);
 end if;
 update private.heard_drafts set number=v_number,line=v_line,detail=v_detail,quotes=v_quotes,edited=true,applied_at=null,applied_session=null where id=d.id;
 return jsonb_build_object('status','ok');
end $$;

create function private.discover_heard_discard(p_engagement uuid,p_source text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true);
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_source is null or p_source not in ('survey','four_lists','input','interviews') then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 update private.heard_drafts set deleted=true where engagement_id=p_engagement and source_key=p_source and not deleted;
 if not found then return jsonb_build_object('status','unchanged'); end if;
 return jsonb_build_object('status','ok');
end $$;

-- The app calls this after the run of show's save has written the step, so the page can say Applied. The step must be this source's own.
create function private.discover_heard_applied(p_engagement uuid,p_source text,p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true);
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_source is null or p_source not in ('survey','four_lists','input','interviews') or p_session is null then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 if not exists(select 1 from public.sessions s where s.id=p_session and s.engagement_id=p_engagement and not s.deleted and private.heard_source_key(s.options->>'source')=p_source) then return jsonb_build_object('status','not_found'); end if;
 update private.heard_drafts set applied_at=clock_timestamp(),applied_session=p_session where engagement_id=p_engagement and source_key=p_source and not deleted;
 if not found then return jsonb_build_object('status','not_found'); end if;
 return jsonb_build_object('status','ok');
end $$;

-- ---------- The worker: due, claim, apply, fail ----------
create function private.discover_heard_due(p_engagement uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.heard_rounds r where r.engagement_id=p_engagement and not r.deleted
  and ((r.status='pending' and (r.last_failed_at is null or r.last_failed_at<=clock_timestamp()-make_interval(secs=>15*greatest(r.attempts,1))))
   or (r.status='drafting' and r.lease_until<clock_timestamp())))
$$;

create function private.discover_heard_claim(p_engagement uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.heard_rounds; t timestamptz:=clock_timestamp(); v_inputs jsonb; v_run uuid;
begin
 if p_engagement is null or p_lease is null or p_model is null or length(p_model) not between 1 and 100 or jsonb_typeof(p_versions) is distinct from 'object'
  or coalesce(p_versions->>'draft_what_we_heard','') !~ '^[a-z0-9_.@-]{1,60}$' then return jsonb_build_object('status','invalid_request'); end if;
 select * into r from private.heard_rounds where engagement_id=p_engagement and not deleted for update;
 if not found or r.status not in ('pending','drafting') then return jsonb_build_object('status','idle'); end if;
 if r.status='drafting' and r.lease_until>t then return jsonb_build_object('status','busy'); end if;
 if r.status='pending' and r.last_failed_at is not null and r.last_failed_at>t-make_interval(secs=>15*greatest(r.attempts,1)) then
  return jsonb_build_object('status','cooling','ms',(extract(epoch from r.last_failed_at+make_interval(secs=>15*greatest(r.attempts,1))-t)*1000)::integer); end if;
 if coalesce((select e.settings->>'ai_enabled' from public.engagements e where e.id=p_engagement and not e.deleted),'false')<>'true' then
  update private.heard_rounds set status='idle',lease_id=null,lease_run=null,lease_until=null where id=r.id;
  return jsonb_build_object('status','off');
 end if;
 if r.lease_run is not null then update private.ai_runs set status='stale',finished_at=t where id=r.lease_run and status='running'; end if;
 v_inputs:=private.heard_inputs(p_engagement);
 if jsonb_array_length(v_inputs->'sources')=0 then
  update private.heard_rounds set status='idle',lease_id=null,lease_run=null,lease_until=null where id=r.id;
  return jsonb_build_object('status','idle');
 end if;
 insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,created_at) values(p_engagement,null,'draft_what_we_heard',p_model,p_versions->>'draft_what_we_heard',v_inputs,t) returning id into v_run;
 update private.heard_rounds set status='drafting',lease_id=p_lease,lease_run=v_run,lease_until=t+interval '6 minutes',
  inputs=jsonb_build_object('sources',jsonb_array_length(v_inputs->'sources')) where id=r.id;
 return jsonb_build_object('status','claimed','run',v_run,'job','draft_what_we_heard','prompt_version',p_versions->>'draft_what_we_heard','inputs',v_inputs);
end $$;

-- Keep a headline only under the rules that are code, never prompt: it names a lead theme and rests on themes of its own source; the number
-- is the lead theme's own figure (the model never writes one); a number in the line or detail must be in what it rests on; nothing quoted or
-- filtered; at most one bold phrase; no name anywhere; quotes are chosen by ref and copied from the inputs, so they are word for word. A draft the
-- facilitator has edited and not applied is kept as it is.
create function private.discover_heard_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; r private.heard_rounds; t timestamptz:=clock_timestamp(); in_ jsonb; v_ms integer; h jsonb; key text; src jsonb; lead jsonb; lead_ref text; refs text[]; qrefs text[]; inc jsonb;
 v_line text; v_detail text; need text[]; have text[]; have_text text; qs jsonb; chips jsonb; names text[]; done text[]:=array[]::text[]; offered integer:=0; kept integer:=0; refused jsonb:='[]'::jsonb;
 prev private.heard_drafts; v_thin boolean; ids uuid[];
begin
 if p_run is null or p_lease is null or jsonb_typeof(p_output) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into run from private.ai_runs where id=p_run and job='draft_what_we_heard';
 if not found then return jsonb_build_object('status','missing'); end if;
 in_:=run.inputs; v_ms:=private.ai_usage(p_usage,'ms',600000)::integer;
 perform private.discover_lock(run.engagement_id);
 select * into r from private.heard_rounds where engagement_id=run.engagement_id and not deleted for update;
 if not found or run.status<>'running' or r.lease_id is distinct from p_lease or r.lease_run is distinct from p_run or r.lease_until<t then return jsonb_build_object('status','stale'); end if;
 if coalesce((select e.settings->>'ai_enabled' from public.engagements e where e.id=run.engagement_id),'false')<>'true' then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms where id=run.id;
  update private.heard_rounds set status='idle',lease_id=null,lease_run=null,lease_until=null where id=r.id;
  return jsonb_build_object('status','discarded');
 end if;
 names:=private.discover_names(run.engagement_id);
 for h in select e.value from jsonb_array_elements(case when jsonb_typeof(p_output->'headlines')='array' then p_output->'headlines' else '[]'::jsonb end) e loop
  exit when cardinality(done)>=4;
  if jsonb_typeof(h)<>'object' then continue; end if;
  key:=h->>'source';
  if key is null or key=any(done) then continue; end if;
  select x.value into src from jsonb_array_elements(in_->'sources') x where x.value->>'key'=key;
  if src is null then continue; end if;
  -- Its lead theme and the themes it rests on, each from this source of this run's own inputs.
  lead_ref:=lower(btrim(coalesce(h->>'lead','')));
  select x.value into lead from jsonb_array_elements(src->'themes') x where lower(x.value->>'ref')=lead_ref;
  if lead is null then refused:=refused||jsonb_build_array(jsonb_build_object('source',key,'reason','unsourced')); continue; end if;
  select coalesce(array_agg(distinct lower(btrim(s#>>'{}'))),array[]::text[]) into refs from jsonb_array_elements(case when jsonb_typeof(h->'themes')='array' then h->'themes' else '[]'::jsonb end) s where jsonb_typeof(s)='string';
  refs:=(array[lead_ref]||array(select z from unnest(refs) z where z<>lead_ref))[1:6];
  select jsonb_agg(x.value order by x.ord) into inc from jsonb_array_elements(src->'themes') with ordinality x(value,ord) where lower(x.value->>'ref')=any(refs);
  -- Its words.
  v_line:=btrim(regexp_replace(coalesce(h->>'line',''),'\s+',' ','g'));
  v_detail:=btrim(regexp_replace(coalesce(h->>'detail',''),'\s+',' ','g'));
  if length(v_line) not between 1 and 140 or length(v_detail) not between 1 and 400 or private.ai_quoted(v_line) or private.ai_quoted(v_detail)
   or (v_line ~ '\*' and v_line !~ '^[^*]*\*\*[^*]+\*\*[^*]*$') or v_detail ~ '\*' or private.screen_text(v_line||' '||v_detail) then
   refused:=refused||jsonb_build_array(jsonb_build_object('source',key,'reason','text')); continue; end if;
  if private.discover_has_name(v_line||' '||v_detail,names) then refused:=refused||jsonb_build_array(jsonb_build_object('source',key,'reason','name')); continue; end if;
  select coalesce(array_agg(n),array[]::text[]) into need from unnest(private.ai_numbers(v_line||' '||v_detail)) n;
  select string_agg((x.value->>'label')||' '||(x.value->>'detail')||' '||(x.value->>'figure')||' '||(x.value->>'count'),E'\n') into have_text from jsonb_array_elements(inc) x;
  have:=private.ai_numbers(coalesce(have_text,'')||' '||coalesce(src->>'basis',''));
  if not need<@have then refused:=refused||jsonb_build_array(jsonb_build_object('source',key,'reason','number')); continue; end if;
  -- Up to three quotes, chosen by ref from the themes it rests on; with none chosen, the lead theme's own first two.
  select coalesce(array_agg(distinct lower(btrim(s#>>'{}'))),array[]::text[]) into qrefs from jsonb_array_elements(case when jsonb_typeof(h->'quotes')='array' then h->'quotes' else '[]'::jsonb end) s where jsonb_typeof(s)='string';
  select coalesce(jsonb_agg(w.j order by w.pos),'[]'::jsonb) into qs from (
   select z.pos,jsonb_build_object('text',z.t,'label',z.l) as j from (
    select distinct on (lower(q.value->>'ref')) array_position(qrefs,lower(q.value->>'ref')) as pos,q.value->>'text' as t,q.value->>'label' as l
    from jsonb_array_elements(inc) th cross join jsonb_array_elements(th.value->'quotes') q where lower(q.value->>'ref')=any(qrefs) order by lower(q.value->>'ref')) z
   order by z.pos limit 3) w;
  if jsonb_array_length(qs)=0 then
   select coalesce(jsonb_agg(jsonb_build_object('text',q.value->>'text','label',q.value->>'label') order by q.ord),'[]'::jsonb) into qs from jsonb_array_elements(lead->'quotes') with ordinality q(value,ord) where q.ord<=2;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('label',left(x.value->>'label',120),'count',x.value->>'count','thin',(x.value->>'thin')::boolean) order by x.ord),'[]'::jsonb) into chips from jsonb_array_elements(inc) with ordinality x(value,ord);
  select coalesce(array_agg((x.value->>'id')::uuid order by x.ord),array[]::uuid[]) into ids from jsonb_array_elements(inc) with ordinality x(value,ord);
  v_thin:=coalesce((lead->>'thin')::boolean,false);
  -- A draft the facilitator edited and has not applied stays as it is.
  select * into prev from private.heard_drafts where engagement_id=run.engagement_id and source_key=key and not deleted for update;
  if found then
   if prev.edited and prev.applied_at is null then kept:=kept+1; done:=done||key; continue; end if;
   update private.heard_drafts set deleted=true where id=prev.id;
  end if;
  insert into private.heard_drafts(engagement_id,source_key,number,line,detail,quotes,rests,thin,thin_reason,basis,theme_ids,ai_run,drafted_at)
   values(run.engagement_id,key,left(lead->>'figure',12),v_line,v_detail,qs,chips,v_thin,case when v_thin then left(lead->>'count',80) end,left(src->>'basis',120),ids,run.id,t);
  offered:=offered+1; done:=done||key;
 end loop;
 update private.ai_runs set status='ok',changed=offered>0,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'offered',offered,'kept',kept,'refused',refused),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 update private.heard_rounds set status='ready',last_ok_at=t,last_offered=offered,last_refused=jsonb_array_length(refused),last_kept=kept,lease_id=null,lease_run=null,lease_until=null,last_error=null where id=r.id;
 return jsonb_build_object('status','ok','offered',offered,'kept',kept,'refused',jsonb_array_length(refused));
end $$;

-- One more try after a pause, then the page says so and the facilitator writes the headlines by hand.
create function private.discover_heard_fail(p_run uuid,p_lease uuid,p_error text,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; r private.heard_rounds; t timestamptz:=clock_timestamp(); v_ms integer:=private.ai_usage(p_usage,'ms',600000)::integer; gave_up boolean;
begin
 select * into run from private.ai_runs where id=p_run and job='draft_what_we_heard';
 if not found or p_lease is null then return jsonb_build_object('status','missing'); end if;
 select * into r from private.heard_rounds where engagement_id=run.engagement_id and not deleted for update;
 if not found or run.status<>'running' or r.lease_id is distinct from p_lease or r.lease_run is distinct from p_run then return jsonb_build_object('status','stale'); end if;
 update private.ai_runs set status='failed',finished_at=t,ms=v_ms,error=left(coalesce(p_error,'failed'),200),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 gave_up:=r.attempts+1>=2;
 update private.heard_rounds set status=case when gave_up then 'failed' else 'pending' end,attempts=attempts+1,lease_id=null,lease_run=null,lease_until=null,
  last_failed_at=t,last_error=left(coalesce(p_error,'failed'),200) where id=r.id;
 return jsonb_build_object('status','ok','gave_up',gave_up);
end $$;

-- ---------- Public entry points (invokers; every check is in the private functions) ----------
create function public.discover_heard_state(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.discover_heard_state(p_engagement) $$;
create function public.discover_heard_start(p_engagement uuid,p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_heard_start(p_engagement,p_id) $$;
create function public.discover_heard_edit(p_engagement uuid,p_source text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_heard_edit(p_engagement,p_source,p) $$;
create function public.discover_heard_discard(p_engagement uuid,p_source text) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_heard_discard(p_engagement,p_source) $$;
create function public.discover_heard_applied(p_engagement uuid,p_source text,p_session uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_heard_applied(p_engagement,p_source,p_session) $$;
create function public.discover_heard_due(p_engagement uuid) returns boolean
language sql stable security invoker set search_path='' as $$ select private.discover_heard_due(p_engagement) $$;
create function public.discover_heard_claim(p_engagement uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_heard_claim(p_engagement,p_lease,p_model,p_versions) $$;
create function public.discover_heard_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_heard_apply(p_run,p_lease,p_output,p_usage) $$;
create function public.discover_heard_fail(p_run uuid,p_lease uuid,p_error text,p_usage jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_heard_fail(p_run,p_lease,p_error,p_usage) $$;

revoke all on function private.heard_source_key(text),private.heard_steps(uuid),private.heard_themes(uuid),private.heard_inputs(uuid),
 private.discover_heard_state(uuid),private.discover_heard_start(uuid,uuid),private.discover_heard_edit(uuid,text,jsonb),private.discover_heard_discard(uuid,text),private.discover_heard_applied(uuid,text,uuid),
 private.discover_heard_due(uuid),private.discover_heard_claim(uuid,uuid,text,jsonb),private.discover_heard_apply(uuid,uuid,jsonb,jsonb),private.discover_heard_fail(uuid,uuid,text,jsonb),
 public.discover_heard_state(uuid),public.discover_heard_start(uuid,uuid),public.discover_heard_edit(uuid,text,jsonb),public.discover_heard_discard(uuid,text),public.discover_heard_applied(uuid,text,uuid),
 public.discover_heard_due(uuid),public.discover_heard_claim(uuid,uuid,text,jsonb),public.discover_heard_apply(uuid,uuid,jsonb,jsonb),public.discover_heard_fail(uuid,uuid,text,jsonb)
 from public,anon,authenticated;
grant execute on function private.discover_heard_state(uuid),private.discover_heard_start(uuid,uuid),private.discover_heard_edit(uuid,text,jsonb),private.discover_heard_discard(uuid,text),private.discover_heard_applied(uuid,text,uuid),
 public.discover_heard_state(uuid),public.discover_heard_start(uuid,uuid),public.discover_heard_edit(uuid,text,jsonb),public.discover_heard_discard(uuid,text),public.discover_heard_applied(uuid,text,uuid) to authenticated;
grant execute on function private.heard_source_key(text),private.heard_steps(uuid),private.heard_themes(uuid),private.heard_inputs(uuid),
 private.discover_heard_due(uuid),private.discover_heard_claim(uuid,uuid,text,jsonb),private.discover_heard_apply(uuid,uuid,jsonb,jsonb),private.discover_heard_fail(uuid,uuid,text,jsonb),
 public.discover_heard_due(uuid),public.discover_heard_claim(uuid,uuid,text,jsonb),public.discover_heard_apply(uuid,uuid,jsonb,jsonb),public.discover_heard_fail(uuid,uuid,text,jsonb) to service_role;

-- ---------- The practice room's reset and Clear test answers ----------
-- Each is the newest definition renamed to _base4 and wrapped, so every earlier step's clearing stays in place whichever step merges first.
-- The practice reset puts away every draft and the round. Clear test answers puts away the drafts a rehearsal made (the test rows); the
-- round goes quiet when no draft is left. What a facilitator applied to the run of show is setup data and stays.
alter function private.reset_practice_room() rename to reset_practice_room_base4;
alter function private.rehearsal_control(uuid,uuid,text) rename to rehearsal_control_base4;

create function private.reset_practice_room() returns boolean
language plpgsql security definer set search_path='' as $$
declare eng uuid:='90000000-0000-4000-8000-000000000010'::uuid; ok boolean;
begin
 ok:=private.reset_practice_room_base4();
 if ok then
  update private.heard_drafts set deleted=true where engagement_id=eng and not deleted;
  update private.heard_rounds set deleted=true where engagement_id=eng and not deleted;
 end if;
 return ok;
end $$;

create function private.rehearsal_control(p_engagement uuid,p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb;
begin
 out:=private.rehearsal_control_base4(p_engagement,p_id,p_action);
 if p_action='clear' and p_engagement is not null and out->>'status'='ok' then
  update private.heard_drafts set deleted=true where engagement_id=p_engagement and test and not deleted;
  update private.heard_rounds set status='idle' where engagement_id=p_engagement and not deleted and status='ready'
   and not exists(select 1 from private.heard_drafts d where d.engagement_id=p_engagement and not d.deleted);
 end if;
 return out;
end $$;

revoke all on function private.reset_practice_room_base4(),private.reset_practice_room(),private.rehearsal_control_base4(uuid,uuid,text),private.rehearsal_control(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.reset_practice_room(),private.rehearsal_control(uuid,uuid,text) to authenticated;

commit;
