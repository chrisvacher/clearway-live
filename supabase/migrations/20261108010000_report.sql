-- Milestone 7, step 1: the report draft (AFT-01). Report records, the draft_report AI job, the editor and sign-off.
--
-- The report follows Clearway's order: Overview, The Church Today, The Process, What We Heard, Leadership Interviews, Strategic Tensions, the 10-year Future,
-- the 3-year Vision, Risks and Roadblocks, the 1-year Outlook, Commander's Intent, Decisions, Make the Vision Visible, Closing. Seven sections are prose that AI
-- drafts from the engagement's records (Overview and Closing last, from the other sections). Seven are record blocks that code builds from the records, each
-- with a short AI lead. Every sentence carries its sources (the records it rests on), including an aligned signal the facilitator saved as a citation.
-- The facilitator edits any sentence, swaps AI wording for the room's exact words, adds their own read, marks each section reviewed and signs off.
-- Sign-off (the lead only) saves a snapshot, which is what the read-only copy and the clean export read.
--
-- The model sees records under short refs (t1, s2, o3), never a name, an email, a role, a speaker or an id. What it may keep is code, not prompt:
-- every sentence must cite at least one ref it was given, text in quotation marks must appear word for word in a cited source, a number must appear in a
-- cited source, no attendee name may appear, dashes and semicolons are rewritten and the horizon terms must be exact. A sentence that fails is dropped and
-- its section is marked Needs attention. Owners are added back by code in the blocks.
--
-- New, in private (facilitators only, through security definer functions with security invoker wrappers in public):
--   report_drafts, report_sections, report_sentences, report_sources, report_rounds, report_sign_offs
--   report_state, report_start, report_refresh, report_edit, report_add, report_remove, report_room_words, report_undo_room_words, report_source_set,
--   report_candidates, report_mark_reviewed, report_sign_off                                                                (facilitators)
--   report_due, report_claim, report_apply, report_fail                                                                      (the worker, service role)
--   report_signed_for_view(p_engagement) and visibility_plan_for_report(p_engagement)                                         (contracts between steps, service role)
-- Shared objects touched, each a superset of its newest definition:
--   private.ai_runs ai_runs_job_check      read_back's list plus draft_report and draft_visibility_plan (step 3 will not need to touch it)
--   private.ai_runs ai_runs_session_check  What We Heard's list plus draft_report and draft_visibility_plan (both engagement-level)
--   private.reset_practice_room            the newest definition (read_back's wrapper), renamed to _pre_report and wrapped
--   private.rehearsal_control              the newest definition (m6 fixes b's wrapper), renamed to _pre_report and wrapped
begin;

-- ---------- The AI job check ----------
alter table private.ai_runs drop constraint ai_runs_job_check;
alter table private.ai_runs add constraint ai_runs_job_check check(job in ('combine_words','group_wall','summarize_wall','fold_questions','merge_reasons','group_lens','overnight_draft','draft_lens_summary','fold_lens_summary','propose_candidates','fold_four_lists','draft_discover_themes','draft_what_we_heard','alignment_signal','fold_read_back','draft_report','draft_visibility_plan'));
alter table private.ai_runs drop constraint ai_runs_session_check;
alter table private.ai_runs add constraint ai_runs_session_check check(session_id is not null or job in ('overnight_draft','draft_discover_themes','draft_what_we_heard','draft_report','draft_visibility_plan'));

-- ---------- Records ----------
create table private.report_drafts (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 created_by uuid references public.clearway_users(id),
 test boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false
);
create unique index report_drafts_engagement_idx on private.report_drafts(engagement_id) where not deleted;
create unique index report_drafts_id_engagement_idx on private.report_drafts(id,engagement_id);
create index report_drafts_created_by_idx on private.report_drafts(created_by) where created_by is not null;
alter table private.report_drafts enable row level security;
alter table private.report_drafts force row level security;
revoke all on private.report_drafts from public,anon,authenticated;
grant select,insert,update,delete on private.report_drafts to service_role;
create trigger touch_record before update on private.report_drafts for each row execute function private.touch_live_record('id');
create trigger mark_test before insert on private.report_drafts for each row execute function private.mark_test();

-- One row for each of the 14 sections. Record sections keep their structured rows in blocks: {kind, columns, rows:[{title, cells, parts:[{role, sentence_id, owner, due}]}]}.
create table private.report_sections (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 draft_id uuid not null,
 key text not null check(key in ('overview','church_today','process','heard','interviews','tensions','future','vision','risks','outlook','intent','decisions','visibility','closing')),
 position smallint not null check(position between 1 and 14),
 heading text not null check(length(heading) between 1 and 80),
 kind text not null check(kind in ('prose','record')),
 status text not null default 'empty' check(status in ('empty','drafting','drafted','edited','reviewed','needs_attention','thin')),
 blocks jsonb check(blocks is null or (jsonb_typeof(blocks)='object' and pg_column_size(blocks)<=262144)),
 ai_run uuid references private.ai_runs(id) on delete set null,
 error text check(error is null or length(error)<=200),
 dropped integer not null default 0 check(dropped between 0 and 100),
 drafted_at timestamptz,
 reviewed_by uuid references public.clearway_users(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(draft_id,engagement_id) references private.report_drafts(id,engagement_id),
 check((status='reviewed')=(reviewed_at is not null))
);
create unique index report_sections_key_idx on private.report_sections(draft_id,key) where not deleted;
create unique index report_sections_id_engagement_idx on private.report_sections(id,engagement_id);
create index report_sections_engagement_idx on private.report_sections(engagement_id);
create index report_sections_ai_run_idx on private.report_sections(ai_run) where ai_run is not null;
create index report_sections_reviewed_by_idx on private.report_sections(reviewed_by) where reviewed_by is not null;
alter table private.report_sections enable row level security;
alter table private.report_sections force row level security;
revoke all on private.report_sections from public,anon,authenticated;
grant select,insert,update,delete on private.report_sections to service_role;
create trigger touch_record before update on private.report_sections for each row execute function private.touch_live_record('id');

-- A sentence of origin ai, room or record must have at least one source (checked on apply and on sign-off).
create table private.report_sentences (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 section_id uuid not null,
 position integer not null check(position>=0),
 text text not null check(length(btrim(text)) between 1 and 1200),
 origin text not null check(origin in ('ai','facilitator','room','record')),
 ai_text text check(ai_text is null or length(ai_text)<=1200),
 quote boolean not null default false,
 thin_label text check(thin_label is null or length(thin_label)<=80),
 touched boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(section_id,engagement_id) references private.report_sections(id,engagement_id)
);
create unique index report_sentences_id_engagement_idx on private.report_sentences(id,engagement_id);
create index report_sentences_section_idx on private.report_sentences(section_id,position) where not deleted;
create index report_sentences_engagement_idx on private.report_sentences(engagement_id);
alter table private.report_sentences enable row level security;
alter table private.report_sentences force row level security;
revoke all on private.report_sentences from public,anon,authenticated;
grant select,insert,update,delete on private.report_sentences to service_role;
create trigger touch_record before update on private.report_sentences for each row execute function private.touch_live_record('id');

-- A source is a record a sentence rests on, with the words it used (280 characters at most). room is true when those words are the room's own.
create table private.report_sources (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 sentence_id uuid not null,
 kind text not null check(kind in ('finding','theme','four_lists_card','scribe_card','photo','lens_summary_sentence','outcome','indicator','risk','mitigation','goal','intent_card','first_step','key_metric','celebration','decision','signal','submission','record')),
 ref_id uuid,
 excerpt text not null check(length(btrim(excerpt)) between 1 and 280),
 room_words boolean not null default false,
 position integer not null default 0 check(position>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(sentence_id,engagement_id) references private.report_sentences(id,engagement_id),
 check(kind='record' or ref_id is not null)
);
create index report_sources_sentence_idx on private.report_sources(sentence_id) where not deleted;
create index report_sources_engagement_idx on private.report_sources(engagement_id);
alter table private.report_sources enable row level security;
alter table private.report_sources force row level security;
revoke all on private.report_sources from public,anon,authenticated;
grant select,insert,update,delete on private.report_sources to service_role;
create trigger touch_record before update on private.report_sources for each row execute function private.touch_live_record('id');

-- A signal is a source only when it is aligned and the facilitator saved it as a citation. The database checks it, whoever writes the row.
create function private.report_sources_check() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.kind='signal' and not new.deleted and not exists(select 1 from private.signals s where s.id=new.ref_id and s.engagement_id=new.engagement_id and not s.deleted
   and s.kind='aligned' and s.saved_as_citation_at is not null) then
  raise exception 'A signal is a source only when it is aligned and saved as a citation' using errcode='23514';
 end if;
 return new;
end $$;
create trigger report_sources_check before insert or update on private.report_sources for each row execute function private.report_sources_check();

-- The engagement-level drafting round, as for the overnight draft and Discover: the facilitator's press makes it pending with a queue of sections, the
-- worker claims it with a lease, one run for each section on the deeper model.
create table private.report_rounds (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 status text not null default 'pending' check(status in ('pending','drafting','ready','failed','idle')),
 request_id uuid,
 requested_at timestamptz not null default clock_timestamp(),
 requested_by uuid references public.clearway_users(id),
 queue text[] not null default array[]::text[],
 current text,
 attempts integer not null default 0 check(attempts between 0 and 100),
 lease_id uuid,
 lease_run uuid references private.ai_runs(id) on delete set null,
 lease_until timestamptz,
 last_failed_at timestamptz,
 last_error text check(last_error is null or length(last_error)<=200),
 last_ok_at timestamptz,
 last_kept integer check(last_kept is null or last_kept between 0 and 1000),
 last_dropped integer check(last_dropped is null or last_dropped between 0 and 1000),
 test boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false
);
create unique index report_rounds_engagement_idx on private.report_rounds(engagement_id) where not deleted;
create index report_rounds_requested_by_idx on private.report_rounds(requested_by) where requested_by is not null;
create index report_rounds_lease_run_idx on private.report_rounds(lease_run) where lease_run is not null;
alter table private.report_rounds enable row level security;
alter table private.report_rounds force row level security;
revoke all on private.report_rounds from public,anon,authenticated;
grant select,insert,update,delete on private.report_rounds to service_role;
create trigger touch_record before update on private.report_rounds for each row execute function private.touch_live_record('id');
create trigger mark_test before insert on private.report_rounds for each row execute function private.mark_test();

-- Sign-off: n counts up from 1. The snapshot holds every section's heading, sentences (origin, quote, thin label), blocks and sources, all as text, so later
-- edits cannot change it.
create table private.report_sign_offs (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 n integer not null check(n>=1),
 request_id uuid,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and pg_column_size(snapshot)<=4194304),
 signed_by uuid references public.clearway_users(id),
 signed_at timestamptz not null default clock_timestamp(),
 test boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false
);
create unique index report_sign_offs_n_idx on private.report_sign_offs(engagement_id,n);
create index report_sign_offs_signed_by_idx on private.report_sign_offs(signed_by) where signed_by is not null;
alter table private.report_sign_offs enable row level security;
alter table private.report_sign_offs force row level security;
revoke all on private.report_sign_offs from public,anon,authenticated;
grant select,insert,update,delete on private.report_sign_offs to service_role;
create trigger touch_record before update on private.report_sign_offs for each row execute function private.touch_live_record('id');
create trigger mark_test before insert on private.report_sign_offs for each row execute function private.mark_test();

-- ---------- Small helpers ----------
create function private.report_defs() returns table(key text,pos integer,heading text,kind text)
language sql immutable security invoker set search_path='' as $$
 select v.k,v.p,v.h,v.t from (values ('overview',1,'Overview','prose'),('church_today',2,'The Church Today','prose'),('process',3,'The Process','prose'),
  ('heard',4,'What We Heard','prose'),('interviews',5,'Leadership Interviews','prose'),('tensions',6,'Strategic Tensions','prose'),('future',7,'The 10-year Future','record'),
  ('vision',8,'The 3-year Vision','record'),('risks',9,'Risks and Roadblocks','record'),('outlook',10,'The 1-year Outlook','record'),('intent',11,'Commander''s Intent','record'),
  ('decisions',12,'Decisions','record'),('visibility',13,'Make the Vision Visible','record'),('closing',14,'Closing','prose')) v(k,p,h,t)
$$;

-- Dashes and semicolons are rewritten as commas; spaces collapse.
create function private.rp_clean(p text) returns text
language sql immutable security invoker set search_path='' as $$
 select btrim(regexp_replace(regexp_replace(regexp_replace(coalesce(p,''),'\s*[—–]\s*',', ','g'),'\s*;\s*',', ','g'),'\s+',' ','g'))
$$;
-- Lower case, one kind of quotation mark, collapsed spaces: how a quotation is compared with its source.
create function private.rp_norm(p text) returns text
language sql immutable security invoker set search_path='' as $$
 select btrim(regexp_replace(lower(translate(coalesce(p,''),'’‘“”',E'\'\'""')),'\s+',' ','g'))
$$;
create function private.rp_date(p date) returns text
language sql immutable security invoker set search_path='' as $$ select case when p is null then null else to_char(p,'FMMon FMDD, YYYY') end $$;
create function private.rp_level(p numeric) returns text
language sql immutable security invoker set search_path='' as $$ select case when p is null then 'Not rated' when p>=0.66 then 'High' when p>=0.33 then 'Medium' else 'Low' end $$;
create function private.rp_lens_name(p_engagement uuid,p_lens integer) returns text
language sql stable security definer set search_path='' as $$
 select coalesce((select e.lens_names[p_lens] from public.engagements e where e.id=p_engagement),(array['Congregation','Community','Leadership','Operations','Learning'])[p_lens])
$$;
-- The name of whoever owns a goal or a first step, added by code (never given to AI).
create function private.rp_owner(p_engagement uuid,p_attendee uuid,p_name text) returns text
language sql stable security definer set search_path='' as $$
 select coalesce((select a.name from public.attendees a where a.id=p_attendee and a.engagement_id=p_engagement),nullif(btrim(coalesce(p_name,'')),''))
$$;

-- Add one ref to a list of refs the model reads. Each ref has a short key (prefix and number), a group name for the prompt, the words, whether its data is
-- thin, and the sources a sentence that cites it will carry. The ids stay in the run's inputs and are never printed in the prompt.
create function private.rp_add(p_refs jsonb,p_prefix text,p_group text,p_text text,p_kind text,p_ref uuid,p_excerpt text,p_thin boolean,p_thin_text text,p_room boolean) returns jsonb
language sql immutable security invoker set search_path='' as $$
 select p_refs||jsonb_build_array(jsonb_build_object('ref',p_prefix||(1+(select count(*) from jsonb_array_elements(p_refs) e where e.value->>'ref' ~ ('^'||p_prefix||'[0-9]')))::text,
  'group',p_group,'text',left(btrim(p_text),700),'thin',coalesce(p_thin,false),'thin_text',p_thin_text,
  'sources',jsonb_build_array(jsonb_build_object('kind',p_kind,'ref_id',p_ref,'excerpt',left(btrim(coalesce(nullif(p_excerpt,''),p_text)),280),'room',coalesce(p_room,false) and length(btrim(coalesce(nullif(p_excerpt,''),p_text)))<=280))))
$$;

-- ---------- Who may: the lead and co-facilitators read and edit; only the lead signs off ----------
create function private.report_guard(p_engagement uuid,p_write boolean) returns text
language plpgsql stable security definer set search_path='' as $$
begin
 if p_engagement is null or not coalesce(private.show_allowed(p_engagement),false) then return 'denied'; end if;
 if p_write and exists(select 1 from public.engagements where id=p_engagement and status='closed') then return 'closed'; end if;
 return null;
end $$;

-- ---------- Sentences and sources ----------
-- A sentence with its sources. p_sources is [{kind, ref_id, excerpt, room}]. A position of null goes last.
create function private.rp_put(p_engagement uuid,p_section uuid,p_text text,p_origin text,p_quote boolean,p_thin text,p_ai_text text,p_sources jsonb,p_pos integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid:=gen_random_uuid(); s jsonb; n integer:=0;
begin
 insert into private.report_sentences(id,engagement_id,section_id,position,text,origin,ai_text,quote,thin_label,touched)
  values(v_id,p_engagement,p_section,coalesce(p_pos,(select coalesce(max(x.position),0)+1 from private.report_sentences x where x.section_id=p_section and not x.deleted)),
   btrim(p_text),p_origin,p_ai_text,coalesce(p_quote,false),p_thin,p_origin in ('facilitator','room'));
 for s in select e.value from jsonb_array_elements(coalesce(p_sources,'[]'::jsonb)) e loop
  continue when s->>'excerpt' is null or length(btrim(s->>'excerpt'))=0 or n>=8;
  continue when exists(select 1 from private.report_sources r where r.sentence_id=v_id and not r.deleted and r.kind=s->>'kind' and r.ref_id is not distinct from nullif(s->>'ref_id','')::uuid and r.excerpt=left(btrim(s->>'excerpt'),280));
  insert into private.report_sources(engagement_id,sentence_id,kind,ref_id,excerpt,room_words,position)
   values(p_engagement,v_id,s->>'kind',nullif(s->>'ref_id','')::uuid,left(btrim(s->>'excerpt'),280),coalesce((s->>'room')::boolean,false),n);
  n:=n+1;
 end loop;
 return v_id;
end $$;

-- A sentence's live sources as [{kind, ref_id, excerpt, room}].
create function private.rp_sources(p_sentence uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('kind',r.kind,'ref_id',r.ref_id,'excerpt',r.excerpt,'room',r.room_words) order by r.position,r.id),'[]'::jsonb)
 from private.report_sources r where r.sentence_id=p_sentence and not r.deleted
$$;

-- Put a sentence away with its sources.
create function private.rp_drop(p_sentence uuid) returns void
language sql security definer set search_path='' as $$
 update private.report_sources set deleted=true where sentence_id=p_sentence and not deleted;
 update private.report_sentences set deleted=true where id=p_sentence and not deleted
$$;

-- What a source is, in words, for the sources panel: its label, its full text and, for a scribe card, who said it (facilitators only).
create function private.rp_source_info(p_engagement uuid,p_kind text,p_ref uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v jsonb;
begin
 if p_kind='finding' then select jsonb_build_object('label','Survey finding','text',f.title||': '||f.figure) into v from private.survey_findings f where f.id=p_ref and f.engagement_id=p_engagement;
 elsif p_kind='theme' then select jsonb_build_object('label',case t.source when 'survey' then 'Survey theme' when 'four_lists' then 'Four Helpful Lists theme' else 'Conversation theme' end,
   'text',t.label||case when t.detail<>'' then '. '||t.detail else '' end||coalesce((select ' '||string_agg(q.value->>'quote',' ') from jsonb_array_elements(t.quotes) q where q.value->>'quote' is not null),'')) into v from private.discover_themes t where t.id=p_ref and t.engagement_id=p_engagement;
 elsif p_kind='four_lists_card' then select jsonb_build_object('label','Four Helpful Lists card, '||c."column",'text',c.text) into v from private.four_lists_cards_for_themes(p_engagement) c where c.card_id=p_ref limit 1;
 elsif p_kind='scribe_card' then select jsonb_build_object('label','Scribe '||c.kind||' card','text',c.text,'speaker',nullif(btrim(coalesce(c.speaker,'')),'')) into v from private.scribe_cards c where c.id=p_ref and c.engagement_id=p_engagement;
 elsif p_kind='lens_summary_sentence' then select jsonb_build_object('label','Signed off lens summary, '||private.rp_lens_name(p_engagement,l.lens::integer),'text',s.text) into v
   from private.lens_summary_sentences s join private.lens_summary_versions ver on ver.id=s.version_id join private.lens_summaries l on l.id=ver.summary_id where s.id=p_ref and s.engagement_id=p_engagement;
 elsif p_kind='outcome' then select jsonb_build_object('label','Vision Outcome','text',o.title||'. '||o.description) into v from private.vision_outcomes o where o.id=p_ref and o.engagement_id=p_engagement;
 elsif p_kind='indicator' then select jsonb_build_object('label','Indicator','text',i.text) into v from private.outcome_indicators i where i.id=p_ref and i.engagement_id=p_engagement;
 elsif p_kind='risk' then select jsonb_build_object('label','Risk from the pre-mortem','text',r.text) into v from private.risks r where r.id=p_ref and r.engagement_id=p_engagement;
 elsif p_kind='mitigation' then select jsonb_build_object('label','Mitigation','text',m.text) into v from private.risk_mitigations m where m.id=p_ref and m.engagement_id=p_engagement;
 elsif p_kind='goal' then select jsonb_build_object('label','1-year goal','text',g.title||case when g.result<>'' then ': '||g.result else '' end) into v from private.goals g where g.id=p_ref and g.engagement_id=p_engagement;
 elsif p_kind='intent_card' then select jsonb_build_object('label','Commander''s Intent card','text',c.intent||' '||c.must_do||' '||c.what_we_stop) into v from private.intent_cards c where c.id=p_ref and c.engagement_id=p_engagement;
 elsif p_kind='first_step' then select jsonb_build_object('label','First step','text',f.text) into v from private.first_steps f where f.id=p_ref and f.engagement_id=p_engagement;
 elsif p_kind='key_metric' then select jsonb_build_object('label','Success measure the team ranked','text',k.text) into v from private.key_metrics k where k.id=p_ref and k.engagement_id=p_engagement;
 elsif p_kind='celebration' then select jsonb_build_object('label','Celebration','text',c.text) into v from private.celebrations c where c.id=p_ref and c.engagement_id=p_engagement;
 elsif p_kind='decision' then select jsonb_build_object('label','Decision','text',d.subject_label||': '||d.decision||case when d.reasons<>'' then '. '||d.reasons else '' end) into v from private.decisions d where d.id=p_ref and d.engagement_id=p_engagement;
 elsif p_kind='signal' then select jsonb_build_object('label','Aligned signal saved as a citation','text',s.title||'. '||s.line) into v from private.signals s where s.id=p_ref and s.engagement_id=p_engagement;
 elsif p_kind='submission' then select jsonb_build_object('label','Phone answer, anonymous','text',coalesce(x.text,'')) into v from public.submissions x where x.id=p_ref and x.engagement_id=p_engagement;
 elsif p_kind='photo' then select jsonb_build_object('label','Easel photo','text',f.name) into v from private.scribe_files f where f.id=p_ref and f.engagement_id=p_engagement;
 end if;
 return coalesce(v,jsonb_build_object('label','Record','text',''));
end $$;


-- Every word of every name the report must never carry to the model or print back: the engagement's attendees, facilitators and interviewees, the scribe's speakers
-- and the owners typed onto goals and first steps.
create function private.report_names(p_engagement uuid) returns text[]
language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(distinct z.w),array[]::text[]) from (
  select unnest(private.discover_names(p_engagement)) as w
  union
  select y.w from (
   select unnest(regexp_split_to_array(x.t,'[^[:alpha:]]+')) as w from (
    select c.speaker as t from private.scribe_cards c where c.engagement_id=p_engagement and not c.deleted and c.speaker is not null
    union all select g.owner_name from private.goals g where g.engagement_id=p_engagement and not g.deleted and g.owner_name is not null
    union all select f.owner_name from private.first_steps f where f.engagement_id=p_engagement and not f.deleted and f.owner_name is not null
    union all select a.name from public.attendees a where a.engagement_id=p_engagement and not a.deleted) x) y
   where length(y.w)>=3 and lower(y.w)<>all(array['the','and','for','with','team','staff','board','elders','elder','pastor','pastors','rev','reverend','senior','lead','associate','executive',
    'director','chair','deacon','deacons','church','youth','children','kids','worship','group','council','committee','leader','leaders','interview','input','conversation','mrs','miss','pastoral']) ) z
$$;

-- Is the record a source points at still there? A signal counts only while it is aligned and saved as a citation; a lens summary line only while it is in the
-- version the room signed off; a theme only while it is accepted. The record kind has no record behind it and always stands.
create function private.rp_source_live(p_engagement uuid,p_kind text,p_ref uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if p_kind='record' then return true; end if;
 if p_ref is null then return false; end if;
 return coalesce(case p_kind
  when 'finding' then exists(select 1 from private.survey_findings f where f.id=p_ref and f.engagement_id=p_engagement and not f.deleted)
  when 'theme' then exists(select 1 from private.discover_themes t where t.id=p_ref and t.engagement_id=p_engagement and not t.deleted and t.merged_into is null and t.status='accepted')
  when 'four_lists_card' then exists(select 1 from private.four_lists_cards_for_themes(p_engagement) c where c.card_id=p_ref)
  when 'scribe_card' then exists(select 1 from private.scribe_cards c where c.id=p_ref and c.engagement_id=p_engagement and not c.deleted)
  when 'photo' then exists(select 1 from private.scribe_files f where f.id=p_ref and f.engagement_id=p_engagement and not f.deleted)
  when 'lens_summary_sentence' then exists(select 1 from private.lens_summary_sentences x join private.lens_summaries l on l.signed_off_version_id=x.version_id and l.engagement_id=x.engagement_id and not l.deleted and l.state='signed_off'
    where x.id=p_ref and x.engagement_id=p_engagement and not x.deleted)
  when 'outcome' then exists(select 1 from private.vision_outcomes o where o.id=p_ref and o.engagement_id=p_engagement and not o.deleted)
  when 'indicator' then exists(select 1 from private.outcome_indicators i where i.id=p_ref and i.engagement_id=p_engagement and not i.deleted)
  when 'risk' then exists(select 1 from private.risks r where r.id=p_ref and r.engagement_id=p_engagement and not r.deleted and r.merged_into is null)
  when 'mitigation' then exists(select 1 from private.risk_mitigations m where m.id=p_ref and m.engagement_id=p_engagement and not m.deleted)
  when 'goal' then exists(select 1 from private.goals g where g.id=p_ref and g.engagement_id=p_engagement and not g.deleted)
  when 'intent_card' then exists(select 1 from private.intent_cards c where c.id=p_ref and c.engagement_id=p_engagement and not c.deleted)
  when 'first_step' then exists(select 1 from private.first_steps f where f.id=p_ref and f.engagement_id=p_engagement and not f.deleted)
  when 'key_metric' then exists(select 1 from private.key_metrics k where k.id=p_ref and k.engagement_id=p_engagement and not k.deleted)
  when 'celebration' then exists(select 1 from private.celebrations c where c.id=p_ref and c.engagement_id=p_engagement and not c.deleted)
  when 'decision' then exists(select 1 from private.decisions d where d.id=p_ref and d.engagement_id=p_engagement and not d.deleted)
  when 'signal' then exists(select 1 from private.signals g where g.id=p_ref and g.engagement_id=p_engagement and not g.deleted and g.kind='aligned' and g.saved_as_citation_at is not null)
  when 'submission' then exists(select 1 from public.submissions x where x.id=p_ref and x.engagement_id=p_engagement and not x.deleted)
 end,false);
end $$;

-- A section in Drafting that no live round holds (the round is over, or it never had the section) can never finish. The report treats it as Needs attention.
create function private.rp_stranded(p_engagement uuid) returns text[]
language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(s.key),array[]::text[]) from private.report_sections s join private.report_drafts d on d.id=s.draft_id and d.engagement_id=s.engagement_id and not d.deleted
 where s.engagement_id=p_engagement and not s.deleted and s.status='drafting'
  and not exists(select 1 from private.report_rounds r where r.engagement_id=p_engagement and not r.deleted and r.status in ('pending','drafting') and s.key=any(array[r.current]||r.queue))
$$;
create function private.rp_heal(p_engagement uuid) returns void
language sql security definer set search_path='' as $$
 update private.report_sections set status='needs_attention',error='AI could not draft this section',reviewed_by=null,reviewed_at=null
 where engagement_id=p_engagement and not deleted and status='drafting' and key=any(private.rp_stranded(p_engagement))
$$;

-- Quotation: one kind of quotation mark, spaces collapsed, case kept (a quotation must match its source letter for letter).
create function private.rp_qnorm(p text) returns text
language sql immutable security invoker set search_path='' as $$
 select btrim(regexp_replace(translate(coalesce(p,''),'’‘“”',E'\'\'""'),'\s+',' ','g'))
$$;
-- The words a sentence puts in quotation marks, double or single, straight or curly. A single quote counts only at the edge of a word, so an apostrophe is not one.
create function private.rp_quoted(p_text text) returns text[]
language sql immutable security invoker set search_path='' as $$
 with n as (select translate(coalesce(p_text,''),'“”‘’',E'""\'\'') as t),
  d as (select m.a[1] as q from n,regexp_matches(n.t,'"([^"]+)"','g') m(a)),
  r as (select regexp_replace(n.t,'"[^"]*"',' ','g') as t from n),
  s as (select m.a[2] as q from r,regexp_matches(r.t,'(^|[\s(])''(.+?)''(?=[\s.,;:!?)]|$)','g') m(a))
 select coalesce(array_agg(z.q),array[]::text[]) from (select q from d union all select q from s) z
$$;
-- The excerpts of the cited refs' sources that are the room's own words (a phone answer, a scribe card, a Four Helpful Lists card, a theme's quote, a lens summary
-- line), as one normalised text. A theme's label or detail, a count or a "Mission:" line is not the room's words, and a quotation can rest only on these.
create function private.rp_room_text(p_cited jsonb) returns text
language sql immutable security invoker set search_path='' as $$
 select coalesce(string_agg(private.rp_qnorm(s.value->>'excerpt'),E'\n'),'')
 from jsonb_array_elements(case when jsonb_typeof(p_cited)='array' then p_cited else '[]'::jsonb end) y cross join lateral jsonb_array_elements(coalesce(y.value->'sources','[]'::jsonb)) s
 where coalesce((s.value->>'room')::boolean,false) or s.value->>'kind' in ('scribe_card','four_lists_card','submission','lens_summary_sentence')
$$;

-- The 10-year Future is the room's signed off lens summaries, word for word. True while the report's block says exactly that.
create function private.rp_future_ok(p_engagement uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select array_agg(s.text order by g.lens,s.position,s.id) from generate_series(1,5) g(lens)
   join private.lens_summaries l on l.engagement_id=p_engagement and l.lens=g.lens and not l.deleted and l.state='signed_off' and l.signed_off_version_id is not null
   join private.lens_summary_sentences s on s.version_id=l.signed_off_version_id and s.engagement_id=l.engagement_id and not s.deleted),array[]::text[])
  = coalesce((select array_agg(x.text order by r.ord,p.ord) from private.report_sections sc join private.report_drafts d on d.id=sc.draft_id and d.engagement_id=sc.engagement_id and not d.deleted
   cross join lateral jsonb_array_elements(coalesce(sc.blocks->'rows','[]'::jsonb)) with ordinality r(value,ord) cross join lateral jsonb_array_elements(coalesce(r.value->'parts','[]'::jsonb)) with ordinality p(value,ord)
   join private.report_sentences x on x.id=(p.value->>'sentence_id')::uuid and not x.deleted where sc.engagement_id=p_engagement and sc.key='future' and not sc.deleted),array[]::text[])
$$;

-- The record lines of the 10-year Future are not the report's to change: they are what the room signed off.
create function private.rp_locked(p_section uuid,p_origin text) returns boolean
language sql stable security definer set search_path='' as $$
 select p_origin='record' and exists(select 1 from private.report_sections sc where sc.id=p_section and sc.key='future')
$$;

-- A table's cells point at the live sentences: a cell is {"t": words} (a plain value from the record) or {"s": [sentence ids]} (those sentences' current wording, one a line).
-- The snapshot resolves them to text and leaves out a row whose own sentence is gone, so it holds only the wording that stands.
create function private.rp_block_resolved(p_blocks jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when p_blocks is null or jsonb_typeof(p_blocks->'rows')<>'array' then p_blocks else p_blocks||jsonb_build_object('rows',coalesce((
  select jsonb_agg(
    (r.value-'title'-'cells'-'parts')||jsonb_build_object('title',case when jsonb_array_length(coalesce(r.value->'cells','[]'::jsonb))>0 then '' else coalesce(r.value->>'title','') end,
     'cells',coalesce((select jsonb_agg(case when c.value ? 's' then to_jsonb(coalesce((select string_agg(x.text,E'\n' order by q.ord) from jsonb_array_elements_text(c.value->'s') with ordinality q(id,ord)
        join private.report_sentences x on x.id=q.id::uuid and not x.deleted),'')) else to_jsonb(coalesce(c.value->>'t','')) end order by c.ord)
       from jsonb_array_elements(coalesce(r.value->'cells','[]'::jsonb)) with ordinality c(value,ord)),'[]'::jsonb),
     'parts',coalesce((select jsonb_agg(p.value order by p.ord) from jsonb_array_elements(coalesce(r.value->'parts','[]'::jsonb)) with ordinality p(value,ord)
       where exists(select 1 from private.report_sentences x where x.id=(p.value->>'sentence_id')::uuid and not x.deleted)),'[]'::jsonb)) order by r.ord)
  from jsonb_array_elements(p_blocks->'rows') with ordinality r(value,ord)
  where jsonb_array_length(coalesce(r.value->'parts','[]'::jsonb))=0
   or (jsonb_array_length(coalesce(r.value->'cells','[]'::jsonb))>0 and exists(select 1 from private.report_sentences x where x.id=((r.value->'parts'->0)->>'sentence_id')::uuid and not x.deleted))
   or (jsonb_array_length(coalesce(r.value->'cells','[]'::jsonb))=0 and exists(select 1 from jsonb_array_elements(r.value->'parts') p2 join private.report_sentences x on x.id=(p2.value->>'sentence_id')::uuid and not x.deleted))),'[]'::jsonb)) end
$$;

-- ---------- The contract with the visibility plan (step 3 replaces this fixture) ----------
-- Rows of the visibility plan for the report's Make the Vision Visible section. sources is [{kind, ref_id, excerpt, room}]. Step 1 has none.
create function private.visibility_plan_for_report(p_engagement uuid)
returns table(row_id uuid,"position" integer,who text,when_text text,by_whom text,what_they_hear text,risk text,reviewed boolean,sources jsonb)
language sql stable security definer set search_path='' as $$
 select null::uuid,null::integer,null::text,null::text,null::text,null::text,null::text,null::boolean,null::jsonb where false
$$;

-- ---------- Record blocks, built by code ----------
-- Rebuilds one record section's structured rows from the records and the record sentences behind them (each sourced). The sentences the old rows pointed to
-- are put away first. Returns the blocks; the caller stores them.
create function private.report_build_block(p_engagement uuid,p_section uuid,p_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old jsonb; x record; y record; rows jsonb:='[]'::jsonb; parts jsonb; sid uuid; sid2 uuid; v_text text; v_owner text; mids jsonb; v_cols jsonb:='[]'::jsonb; v_kind text:=p_key;
 pt record;
begin
 select s.blocks into old from private.report_sections s where s.id=p_section;
 if old is not null then
  for pt in select (p.value->>'sentence_id')::uuid as id from jsonb_array_elements(coalesce(old->'rows','[]'::jsonb)) r cross join lateral jsonb_array_elements(coalesce(r.value->'parts','[]'::jsonb)) p loop
   perform private.rp_drop(pt.id);
  end loop;
 end if;
 if p_key='future' then
  -- The five lens summaries the room signed off on Day 1, word for word.
  for x in select g.lens from generate_series(1,5) g(lens) loop
   parts:='[]'::jsonb;
   for y in select s.id,s.text from private.lens_summaries l join private.lens_summary_sentences s on s.version_id=l.signed_off_version_id and s.engagement_id=l.engagement_id and not s.deleted
     where l.engagement_id=p_engagement and l.lens=x.lens and not l.deleted and l.state='signed_off' and l.signed_off_version_id is not null order by s.position,s.id loop
    sid:=private.rp_put(p_engagement,p_section,y.text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','lens_summary_sentence','ref_id',y.id,'excerpt',y.text,'room',false)));
    parts:=parts||jsonb_build_array(jsonb_build_object('role','line','sentence_id',sid));
   end loop;
   rows:=rows||jsonb_build_array(jsonb_build_object('title',private.rp_lens_name(p_engagement,x.lens),'lens',x.lens,'empty',jsonb_array_length(parts)=0,'cells','[]'::jsonb,'parts',parts));
  end loop;
 elsif p_key='vision' then
  for x in select o.id,o.title,o.description,o.what_we_stop from private.vision_outcomes o where o.engagement_id=p_engagement and not o.deleted and o.status='confirmed' order by o.position,o.id loop
   parts:='[]'::jsonb;
   if btrim(x.description)<>'' then
    sid:=private.rp_put(p_engagement,p_section,x.description,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','outcome','ref_id',x.id,'excerpt',x.description,'room',false)));
    parts:=parts||jsonb_build_array(jsonb_build_object('role','description','sentence_id',sid));
   end if;
   for y in select i.id,i.text from private.outcome_indicators i where i.outcome_id=x.id and i.engagement_id=p_engagement and not i.deleted order by i.position,i.id loop
    sid:=private.rp_put(p_engagement,p_section,y.text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','indicator','ref_id',y.id,'excerpt',y.text,'room',false)));
    parts:=parts||jsonb_build_array(jsonb_build_object('role','indicator','sentence_id',sid));
   end loop;
   if btrim(x.what_we_stop)<>'' then
    sid:=private.rp_put(p_engagement,p_section,x.what_we_stop,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','outcome','ref_id',x.id,'excerpt',x.what_we_stop,'room',false)));
    parts:=parts||jsonb_build_array(jsonb_build_object('role','stop','sentence_id',sid));
   end if;
   rows:=rows||jsonb_build_array(jsonb_build_object('title',x.title,'cells','[]'::jsonb,'parts',parts));
  end loop;
  parts:='[]'::jsonb;
  for y in select k.id,k.text from private.key_metrics k where k.engagement_id=p_engagement and not k.deleted and k.rank is not null order by k.rank,k.id loop
   sid:=private.rp_put(p_engagement,p_section,y.text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','key_metric','ref_id',y.id,'excerpt',y.text,'room',false)));
   parts:=parts||jsonb_build_array(jsonb_build_object('role','metric','sentence_id',sid));
  end loop;
  if jsonb_array_length(parts)>0 then rows:=rows||jsonb_build_array(jsonb_build_object('title','What the team will measure','group','metrics','cells','[]'::jsonb,'parts',parts)); end if;
 elsif p_key='risks' then
  v_cols:='["Risk","Likelihood","Impact","What we will do"]'::jsonb;
  for x in select r.id,r.text,r.likelihood,r.impact from private.risks r where r.engagement_id=p_engagement and not r.deleted and r.merged_into is null
    order by coalesce(r.likelihood,0)*coalesce(r.impact,0) desc,r.created_at,r.id loop
   sid:=private.rp_put(p_engagement,p_section,x.text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','risk','ref_id',x.id,'excerpt',x.text,'room',false)));
   parts:=jsonb_build_array(jsonb_build_object('role','risk','sentence_id',sid)); mids:='[]'::jsonb;
   for y in select m.id,m.text from private.risk_mitigations m where m.risk_id=x.id and m.engagement_id=p_engagement and not m.deleted order by m.created_at,m.id loop
    sid2:=private.rp_put(p_engagement,p_section,y.text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','mitigation','ref_id',y.id,'excerpt',y.text,'room',false)));
    parts:=parts||jsonb_build_array(jsonb_build_object('role','mitigation','sentence_id',sid2));
    mids:=mids||to_jsonb(sid2);
   end loop;
   rows:=rows||jsonb_build_array(jsonb_build_object('title','','cells',jsonb_build_array(jsonb_build_object('s',jsonb_build_array(sid)),jsonb_build_object('t',private.rp_level(x.likelihood)),
    jsonb_build_object('t',private.rp_level(x.impact)),jsonb_build_object('s',mids)),'parts',parts));
  end loop;
 elsif p_key='outlook' then
  v_cols:='["Vision Outcome","Goal","Owner","Ends","Season"]'::jsonb;
  for x in select g.id,g.title,g.result,g.owner_attendee_id,g.owner_name,g.end_date,g.season,coalesce(o.title,'') as otitle
    from private.goals g left join private.vision_outcomes o on o.id=g.outcome_id and o.engagement_id=g.engagement_id where g.engagement_id=p_engagement and not g.deleted
    order by o.position nulls last,g.position,g.id loop
   v_owner:=private.rp_owner(p_engagement,x.owner_attendee_id,x.owner_name);
   v_text:=x.title||case when btrim(x.result)<>'' then ': '||x.result else '' end;
   sid:=private.rp_put(p_engagement,p_section,v_text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','goal','ref_id',x.id,'excerpt',v_text,'room',false)));
   rows:=rows||jsonb_build_array(jsonb_build_object('title','','cells',jsonb_build_array(jsonb_build_object('t',x.otitle),jsonb_build_object('s',jsonb_build_array(sid)),jsonb_build_object('t',coalesce(v_owner,'Not set yet')),
    jsonb_build_object('t',coalesce(private.rp_date(x.end_date),'Not set yet')),jsonb_build_object('t',coalesce(nullif(btrim(coalesce(x.season,'')),''),'Not set yet'))),
    'parts',jsonb_build_array(jsonb_build_object('role','goal','sentence_id',sid,'owner',v_owner,'due',private.rp_date(x.end_date)))));
  end loop;
 elsif p_key='intent' then
  for x in select c.id,c.intent,c.must_do,c.what_we_stop,o.title as otitle from private.intent_cards c join private.vision_outcomes o on o.id=c.outcome_id and o.engagement_id=c.engagement_id and not o.deleted
    where c.engagement_id=p_engagement and not c.deleted order by o.position,c.created_at,c.id loop
   parts:='[]'::jsonb;
   for y in select r.role,r.text from (values ('intent',x.intent,1),('must_do',x.must_do,2),('stop',x.what_we_stop,3)) r(role,text,o) where btrim(r.text)<>'' order by r.o loop
    sid:=private.rp_put(p_engagement,p_section,y.text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','intent_card','ref_id',x.id,'excerpt',y.text,'room',false)));
    parts:=parts||jsonb_build_array(jsonb_build_object('role',y.role,'sentence_id',sid));
   end loop;
   for y in select f.id,f.text,f.owner_attendee_id,f.owner_name,f.due_date from private.first_steps f where f.card_id=x.id and f.engagement_id=p_engagement and not f.deleted order by f.position,f.id loop
    sid:=private.rp_put(p_engagement,p_section,y.text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','first_step','ref_id',y.id,'excerpt',y.text,'room',false)));
    parts:=parts||jsonb_build_array(jsonb_build_object('role','step','sentence_id',sid,'owner',private.rp_owner(p_engagement,y.owner_attendee_id,y.owner_name),'due',private.rp_date(y.due_date)));
   end loop;
   rows:=rows||jsonb_build_array(jsonb_build_object('title',x.otitle,'cells','[]'::jsonb,'parts',parts));
  end loop;
 elsif p_key='decisions' then
  v_cols:='["Decision","Why"]'::jsonb;
  for x in select d.id,d.subject_label,d.decision,d.reasons from private.decisions d where d.engagement_id=p_engagement and not d.deleted order by d.marked_at,d.id loop
   v_text:=case when btrim(x.subject_label)<>'' then x.subject_label||': ' else '' end||x.decision;
   sid:=private.rp_put(p_engagement,p_section,v_text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','decision','ref_id',x.id,'excerpt',v_text,'room',false)));
   rows:=rows||jsonb_build_array(jsonb_build_object('title','','cells',jsonb_build_array(jsonb_build_object('s',jsonb_build_array(sid)),jsonb_build_object('t',x.reasons)),'parts',jsonb_build_array(jsonb_build_object('role','decision','sentence_id',sid))));
  end loop;
  for x in select c.id,c.text,c.detail from private.scribe_cards c where c.engagement_id=p_engagement and not c.deleted and c.kind='decision' order by c.captured_at,c.seq loop
   sid:=private.rp_put(p_engagement,p_section,x.text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','scribe_card','ref_id',x.id,'excerpt',x.text,'room',false)));
   rows:=rows||jsonb_build_array(jsonb_build_object('title','','cells',jsonb_build_array(jsonb_build_object('s',jsonb_build_array(sid)),jsonb_build_object('t',coalesce(x.detail->>'why',''))),'parts',jsonb_build_array(jsonb_build_object('role','decision','sentence_id',sid))));
  end loop;
 elsif p_key='visibility' then
  v_cols:='["Who","When","Who tells them","What they hear","The risk it answers"]'::jsonb;
  for x in select v.* from private.visibility_plan_for_report(p_engagement) v order by v.position,v.row_id loop
   v_text:=coalesce(nullif(btrim(coalesce(x.what_they_hear,'')),''),coalesce(x.who,'The visibility plan'));
   sid:=private.rp_put(p_engagement,p_section,v_text,'record',false,null,null,
    case when jsonb_typeof(x.sources)='array' and jsonb_array_length(x.sources)>0 then x.sources else jsonb_build_array(jsonb_build_object('kind','record','excerpt','Visibility plan row')) end);
   rows:=rows||jsonb_build_array(jsonb_build_object('title','','cells',jsonb_build_array(case when btrim(coalesce(x.what_they_hear,''))='' then jsonb_build_object('s',jsonb_build_array(sid)) else jsonb_build_object('t',coalesce(x.who,'')) end,
    jsonb_build_object('t',coalesce(x.when_text,'')),jsonb_build_object('t',coalesce(x.by_whom,'')),case when btrim(coalesce(x.what_they_hear,''))='' then jsonb_build_object('t','') else jsonb_build_object('s',jsonb_build_array(sid)) end,jsonb_build_object('t',coalesce(x.risk,''))),
    'reviewed',coalesce(x.reviewed,false),'parts',jsonb_build_array(jsonb_build_object('role','plan','sentence_id',sid))));
  end loop;
  for x in select c.id,c.text from private.scribe_cards c where c.engagement_id=p_engagement and not c.deleted and c.kind='action' order by c.captured_at,c.seq loop
   sid:=private.rp_put(p_engagement,p_section,x.text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','scribe_card','ref_id',x.id,'excerpt',x.text,'room',false)));
   rows:=rows||jsonb_build_array(jsonb_build_object('title','','cells',jsonb_build_array(jsonb_build_object('t',''),jsonb_build_object('t',''),jsonb_build_object('t',''),jsonb_build_object('s',jsonb_build_array(sid)),jsonb_build_object('t','')),'group','actions','parts',jsonb_build_array(jsonb_build_object('role','action','sentence_id',sid))));
  end loop;
 end if;
 return jsonb_build_object('kind',v_kind,'columns',v_cols,'rows',rows);
end $$;

-- ---------- What the model reads for a section ----------
-- {section, heading, refs:[{ref, group, text, thin, thin_text, sources}]}. Prose sections read the records. A record section's lead reads the record
-- sentences of its block. Overview and Closing read the other sections' sentences, and a sentence that cites one carries that sentence's own sources.
-- Free text that names someone (a card, a quote) is left out. The ids stay in the run's inputs, never in the prompt.
create function private.report_section_inputs(p_engagement uuid,p_section uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sec private.report_sections; refs jsonb:='[]'::jsonb; e public.engagements; ch public.churches; names text[]; x record; v text; resp integer; keys text[]; q record;
begin
 select * into sec from private.report_sections where id=p_section and engagement_id=p_engagement and not deleted;
 if not found then return jsonb_build_object('refs','[]'::jsonb); end if;
 select * into e from public.engagements where id=p_engagement;
 select * into ch from public.churches where id=e.church_id;
 names:=private.report_names(p_engagement); resp:=e.survey_respondents;
 if sec.kind='record' then
  -- The record sentences the block holds, in order, with their own sources.
  for x in select s.id,s.text,s.thin_label,r.title,private.rp_sources(s.id) as sources from private.report_sentences s
    left join lateral (select coalesce(rw.value->>'title','') as title from private.report_sections sc cross join lateral jsonb_array_elements(coalesce(sc.blocks->'rows','[]'::jsonb)) rw
      cross join lateral jsonb_array_elements(coalesce(rw.value->'parts','[]'::jsonb)) pt where sc.id=sec.id and (pt.value->>'sentence_id')::uuid=s.id limit 1) r on true
    where s.section_id=sec.id and not s.deleted and s.origin='record' order by s.position,s.id limit 40 loop
   refs:=refs||jsonb_build_array(jsonb_build_object('ref','b'||(jsonb_array_length(refs)+1),'group',case when btrim(coalesce(x.title,''))='' or private.discover_has_name(x.title,names) then sec.heading else x.title end,'text',left(x.text,700),'thin',x.thin_label is not null,'thin_text',x.thin_label,'sources',x.sources));
  end loop;
 elsif sec.key in ('overview','closing') then
  for x in select s.id,s.text,s.thin_label,sc.heading,private.rp_sources(s.id) as sources from private.report_sentences s join private.report_sections sc on sc.id=s.section_id
    where sc.engagement_id=p_engagement and sc.draft_id=sec.draft_id and not sc.deleted and not s.deleted and sc.key<>sec.key and not (sec.key='overview' and sc.key='closing')
     and s.origin in ('ai','facilitator','room') and (sc.kind='prose' or s.origin<>'record') and jsonb_array_length(private.rp_sources(s.id))>0
    order by sc.position,s.position,s.id limit 60 loop
   refs:=refs||jsonb_build_array(jsonb_build_object('ref','z'||(jsonb_array_length(refs)+1),'group',x.heading,'text',left(x.text,700),'thin',x.thin_label is not null,'thin_text',x.thin_label,'sources',x.sources));
  end loop;
 elsif sec.key='church_today' then
  if btrim(coalesce(ch.mission,''))<>'' then refs:=private.rp_add(refs,'h','Church record','Mission: '||ch.mission,'record',null,'Mission: '||ch.mission,false,null,false); end if;
  if btrim(coalesce(ch.purpose,''))<>'' then refs:=private.rp_add(refs,'h','Church record','Purpose: '||ch.purpose,'record',null,'Purpose: '||ch.purpose,false,null,false); end if;
  if jsonb_typeof(ch.values)='array' and jsonb_array_length(ch.values)>0 then
   select string_agg(case jsonb_typeof(w.value) when 'string' then w.value#>>'{}' when 'object' then coalesce(w.value->>'name',w.value->>'label',w.value->>'title') end,', ' order by w.ord) into v from jsonb_array_elements(ch.values) with ordinality w(value,ord);
   if v is not null then refs:=private.rp_add(refs,'h','Church record','Values: '||v,'record',null,'Values: '||v,false,null,false); end if;
  end if;
  if btrim(coalesce(ch.strategy,''))<>'' then refs:=private.rp_add(refs,'h','Church record','Strategy: '||ch.strategy,'record',null,'Strategy: '||ch.strategy,false,null,false); end if;
  for x in select f.id,f.title,f.figure,f.rests_on from private.survey_findings f where f.engagement_id=p_engagement and not f.deleted order by f.seq loop
   refs:=private.rp_add(refs,'f','Survey finding',x.title||': '||x.figure,'finding',x.id,x.title||': '||x.figure,private.discover_is_thin('survey',x.rests_on,resp),
    'Thin data: '||x.rests_on||case when resp is not null then ' of '||resp else '' end||' respondents',false);
  end loop;
  for x in select t.* from private.heard_themes(p_engagement) t where t.source_key='survey' and not t.named order by t.strong desc,t.n desc,t.seq limit 8 loop
   refs:=private.rp_add(refs,'t','Accepted survey theme',x.label||case when btrim(x.detail)<>'' then '. '||x.detail else '' end||' ('||x.count_text||')','theme',x.theme_id,x.label||case when btrim(x.detail)<>'' then '. '||x.detail else '' end,x.thin,'Thin data: '||x.count_text,false);
  end loop;
 elsif sec.key='process' then
  select count(*) into resp from public.attendees a where a.engagement_id=p_engagement and not a.deleted and a.room_role='participant';
  if resp>0 then refs:=private.rp_add(refs,'h','Engagement record','Retreat participants: '||resp,'record',null,'Participants: '||resp,false,null,false); end if;
  if e.retreat_start_date is not null then
   v:=private.rp_date(e.retreat_start_date)||case when e.retreat_end_date is not null and e.retreat_end_date<>e.retreat_start_date then ' to '||private.rp_date(e.retreat_end_date) else '' end;
   refs:=private.rp_add(refs,'h','Engagement record','Retreat dates: '||v,'record',null,'Retreat dates: '||v,false,null,false);
  end if;
  for x in select s.part,count(*)::integer as n from public.sessions s where s.engagement_id=p_engagement and not s.deleted and s.part in ('Pre-call','Day 1','Day 2')
    group by s.part order by array_position(array['Pre-call','Day 1','Day 2'],s.part) loop
   refs:=private.rp_add(refs,'h','Run of show',x.part||' had '||x.n||(case when x.n=1 then ' step' else ' steps' end),'record',null,'Run of show: '||x.part||', '||x.n||(case when x.n=1 then ' step' else ' steps' end),false,null,false);
  end loop;
  if btrim(coalesce(e.how_the_room_decides,''))<>'' then refs:=private.rp_add(refs,'h','Engagement record','How the room decides: '||e.how_the_room_decides,'record',null,'How the room decides: '||e.how_the_room_decides,false,null,false); end if;
  for x in select c.id,c.text from private.celebrations c where c.engagement_id=p_engagement and not c.deleted order by c.created_at,c.id limit 12 loop
   if private.discover_has_name(x.text,names) then continue; end if;
   refs:=private.rp_add(refs,'e','Celebration',x.text,'celebration',x.id,x.text,false,null,false);
  end loop;
  for x in select c.id,c.kind,c.text from private.scribe_cards c join public.sessions s on s.id=c.session_id
    where c.engagement_id=p_engagement and not c.deleted and c.kind in ('quote','decision') and s.title ~* '(open|prayer|welcome|discern|scripture|reflect)' order by c.captured_at,c.seq limit 12 loop
   if private.discover_has_name(x.text,names) then continue; end if;
   refs:=private.rp_add(refs,'s','Scribe '||x.kind||' card from the opening',x.text,'scribe_card',x.id,x.text,false,null,x.kind='quote');
  end loop;
 elsif sec.key in ('heard','interviews') then
  keys:=case when sec.key='interviews' then array['interviews'] else array['four_lists','input'] end;
  if sec.key='heard' then
   for x in select f.id,f.title,f.figure,f.rests_on from private.survey_findings f where f.engagement_id=p_engagement and not f.deleted order by f.seq loop
    refs:=private.rp_add(refs,'f','Survey finding',x.title||': '||x.figure,'finding',x.id,x.title||': '||x.figure,private.discover_is_thin('survey',x.rests_on,resp),
     'Thin data: '||x.rests_on||case when resp is not null then ' of '||resp else '' end||' respondents',false);
   end loop;
  end if;
  for x in select t.* from private.heard_themes(p_engagement) t where t.source_key=any(keys) and not t.named order by array_position(keys,t.source_key),t.strong desc,t.n desc,t.seq limit 16 loop
   refs:=private.rp_add(refs,'t',case x.source_key when 'four_lists' then 'Accepted Four Helpful Lists theme' when 'input' then 'Accepted board and staff input theme' else 'Accepted leadership interview theme' end,
    x.label||case when btrim(x.detail)<>'' then '. '||x.detail else '' end||' ('||x.count_text||')','theme',x.theme_id,x.label||case when btrim(x.detail)<>'' then '. '||x.detail else '' end,x.thin,'Thin data: '||x.count_text,false);
   for q in select z.value->>'text' as t from jsonb_array_elements(x.quotes) z where length(btrim(coalesce(z.value->>'text','')))>0 loop
    refs:=private.rp_add(refs,'q','Quote from '||case x.source_key when 'four_lists' then 'a Four Helpful Lists card' when 'input' then 'a board or staff conversation' else 'a leadership interview' end,q.t,'theme',x.theme_id,q.t,x.thin,'Thin data: '||x.count_text,true);
   end loop;
  end loop;
  if sec.key='heard' then
   for x in select c.card_id,c."column" as col,c.text,c.agree from private.four_lists_cards_for_themes(p_engagement) c order by c.agree desc,c.card_id limit 12 loop
    if private.discover_has_name(x.text,names) then continue; end if;
    refs:=private.rp_add(refs,'c','Four Helpful Lists card in what is '||x.col||', '||x.agree||' people agree',x.text,'four_lists_card',x.card_id,x.text,false,null,true);
   end loop;
   for x in select g.id,g.title,g.line from private.signals g where g.engagement_id=p_engagement and not g.deleted and g.kind='aligned' and g.saved_as_citation_at is not null order by g.saved_as_citation_at,g.id loop
    refs:=private.rp_add(refs,'g','Aligned signal the facilitator saved as a citation',x.title||'. '||x.line,'signal',x.id,x.line,false,null,false);
   end loop;
  end if;
 elsif sec.key='tensions' then
  for x in select c.id,c.text from private.scribe_cards c where c.engagement_id=p_engagement and not c.deleted and c.kind='tension' order by c.captured_at,c.seq limit 20 loop
   if private.discover_has_name(x.text,names) then continue; end if;
   refs:=private.rp_add(refs,'s','Scribe tension card',x.text,'scribe_card',x.id,x.text,false,null,false);
  end loop;
  for x in select o.id as oid,o.title,c.wording,c.reason from private.read_back_corrections c join private.read_back_items i on i.id=c.item_id and i.engagement_id=c.engagement_id and i.kind='outcome'
    join private.vision_outcomes o on o.id=i.outcome_id and o.engagement_id=c.engagement_id where c.engagement_id=p_engagement and not c.deleted and c.state not in ('dismissed','failed') order by c.created_at,c.id limit 12 loop
   v:='The room asked to change a Vision Outcome: '||x.wording||case when btrim(coalesce(x.reason,''))<>'' then ' Reason: '||x.reason else '' end;
   if private.discover_has_name(v,names) then continue; end if;
   refs:=private.rp_add(refs,'o','Challenged outcome (read-back correction)',v,'outcome',x.oid,x.wording,false,null,false);
  end loop;
  for x in select d.id,d.subject_label,d.decision,d.reasons from private.decisions d where d.engagement_id=p_engagement and not d.deleted
    and (d.subject='read_back' or (d.subject='outcome' and lower(btrim(d.decision))<>'confirmed')) order by d.marked_at,d.id limit 12 loop
   v:=x.subject_label||': '||x.decision||case when btrim(x.reasons)<>'' then '. '||x.reasons else '' end;
   if private.discover_has_name(v,names) then continue; end if;
   refs:=private.rp_add(refs,'d','Decision about an outcome the room challenged',v,'decision',x.id,x.decision,false,null,false);
  end loop;
 end if;
 -- Nothing that carries a name goes to the model, whatever its section: every ref and every source's words pass the same check.
 select coalesce(jsonb_agg(r.value order by r.ord),'[]'::jsonb) into refs from jsonb_array_elements(refs) with ordinality r(value,ord)
  where not private.discover_has_name(r.value->>'text',names)
   and not exists(select 1 from jsonb_array_elements(coalesce(r.value->'sources','[]'::jsonb)) z where private.discover_has_name(z.value->>'excerpt',names));
 return jsonb_build_object('section',sec.key,'heading',sec.heading,'refs',refs);
end $$;

-- The records a facilitator can add as a source to a sentence in a section: the section's own refs' sources, and for Overview and Closing every source in the report.
create function private.report_candidates(p_engagement uuid,p_section uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v jsonb;
begin
 perform 1 from private.report_sections where id=p_section and engagement_id=p_engagement and not deleted;
 if not found then return '[]'::jsonb; end if;
 select coalesce(jsonb_agg(jsonb_build_object('kind',z.kind,'ref_id',z.ref_id,'excerpt',z.excerpt,'room',z.room,'label',z.grp) order by z.ord),'[]'::jsonb) into v from (
  select distinct on (s.value->>'kind',s.value->>'ref_id',s.value->>'excerpt') s.value->>'kind' as kind,s.value->>'ref_id' as ref_id,s.value->>'excerpt' as excerpt,(s.value->>'room')::boolean as room,r.value->>'group' as grp,r.ord*10+s.ord as ord
  from jsonb_array_elements(private.report_section_inputs(p_engagement,p_section)->'refs') with ordinality r(value,ord) cross join lateral jsonb_array_elements(r.value->'sources') with ordinality s(value,ord)
  order by s.value->>'kind',s.value->>'ref_id',s.value->>'excerpt',r.ord) z;
 return v;
end $$;

-- ---------- The code checks on every reply ----------
-- A spelled-out number from two to twenty must be one the cited records carry as a word, or as the same number in digits ("two" is allowed when they say 2).
create function private.rp_words_ok(p_text text,p_have_text text,p_have text[]) returns boolean
language sql immutable security invoker set search_path='' as $$
 select not exists(
  select 1 from regexp_matches(lower(coalesce(p_text,'')),'\m(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\M','g') m(a)
  where not (lower(coalesce(p_have_text,'')) ~ ('\m'||m.a[1]||'\M')
   or array_position(array['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'],m.a[1])::text=any(p_have)))
$$;

-- A sentence's dashes and semicolons are already rewritten. This says why a sentence must be dropped, or null when it may stay.
-- p_cited is the refs the sentence cites; p_names the words of every name in the engagement.
create function private.report_check(p_text text,p_cited jsonb,p_names text[]) returns text
language plpgsql immutable security invoker set search_path='' as $$
declare v_have text; v_digits text[]; v_marks integer; seg text; stripped text; v_room text;
begin
 if length(p_text) not between 1 and 600 then return 'text'; end if;
 if p_cited is null or jsonb_typeof(p_cited)<>'array' or jsonb_array_length(p_cited)=0 then return 'unsourced'; end if;
 if private.screen_text(p_text) then return 'text'; end if;
 if private.discover_has_name(p_text,p_names) then return 'name'; end if;
 select string_agg(x.value->>'text',E'\n')||E'\n'||coalesce((select string_agg(s.value->>'excerpt',E'\n') from jsonb_array_elements(p_cited) y cross join lateral jsonb_array_elements(coalesce(y.value->'sources','[]'::jsonb)) s),'')
  into v_have from jsonb_array_elements(p_cited) x;
 -- The three horizon terms (and "1-year goals", the PRD's own words) are exact wording, not numbers: they are taken out before the numbers are read and the terms checked.
 stripped:=regexp_replace(p_text,'10-year Future|3-year Vision|1-year Outlook|1-year goals?','','g');
 v_digits:=private.ai_numbers(v_have);
 if not private.ai_numbers(stripped)<@v_digits or not private.rp_words_ok(stripped,v_have,v_digits) then return 'number'; end if;
 if stripped ~* '\m(10|ten|3|three|1|one)[ -]year\M' or p_text ~* 'communications? plan' then return 'term'; end if;
 v_marks:=length(translate(p_text,'“”','""'))-length(replace(translate(p_text,'“”','""'),'"',''));
 if v_marks%2<>0 then return 'quote'; end if;
 -- Words in quotation marks must be word for word, letter for letter, in the room's own words among the cited sources.
 v_room:=private.rp_room_text(p_cited);
 foreach seg in array private.rp_quoted(p_text) loop
  if length(btrim(seg))>280 or length(btrim(regexp_replace(seg,'[.,!?…]+$','')))=0
   or position(private.rp_qnorm(regexp_replace(seg,'[.,!?…]+$','')) in v_room)=0 then return 'quote'; end if;
 end loop;
 return null;
end $$;

-- ---------- Draft the report: the facilitator's press ----------
-- p_scope all drafts every section that has no draft yet (and builds the record blocks); section redrafts one (a record section's lead). A redraft keeps the
-- sentences the facilitator touched and asks first (status confirm) when there are any.
create function private.report_start(p_engagement uuid,p_id uuid,p_scope text,p_section text,p_confirm boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,true); d private.report_drafts; r private.report_rounds; t timestamptz:=clock_timestamp(); ai boolean; x record; sec private.report_sections;
 q text[]:=array[]::text[]; v_touched integer; v_blocks jsonb; has_round boolean; active boolean; nq text[]; k text;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_id is null or p_scope is null or p_scope not in ('all','section') or (p_scope='section' and (p_section is null or p_section not in (select f.key from private.report_defs() f)))
  then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 ai:=coalesce((select e.settings->>'ai_enabled' from public.engagements e where e.id=p_engagement),'false')='true';
 select * into r from private.report_rounds where engagement_id=p_engagement and not deleted for update;
 has_round:=found;
 if has_round and r.request_id=p_id then return jsonb_build_object('status','duplicate','round',r.status); end if;
 select * into d from private.report_drafts where engagement_id=p_engagement and not deleted;
 if not found then insert into private.report_drafts(engagement_id,created_by) values(p_engagement,private.clearway_user_id()) returning * into d; end if;
 -- Every section exists; a record section's blocks are built the first time.
 for x in select f.key,f.pos,f.heading,f.kind from private.report_defs() f order by f.pos loop
  if not exists(select 1 from private.report_sections s where s.draft_id=d.id and s.key=x.key and not s.deleted) then
   insert into private.report_sections(engagement_id,draft_id,key,position,heading,kind) values(p_engagement,d.id,x.key,x.pos,x.heading,x.kind) returning * into sec;
   if x.kind='record' then
    v_blocks:=private.report_build_block(p_engagement,sec.id,x.key);
    update private.report_sections set blocks=v_blocks where id=sec.id;
   end if;
  end if;
 end loop;
 -- A section left in Drafting by a round that is over can never finish: it becomes Needs attention, and Draft what is missing picks it up.
 perform private.rp_heal(p_engagement);
 if p_scope='section' then
  select * into sec from private.report_sections s where s.draft_id=d.id and s.key=p_section and not s.deleted for update;
  if sec.status='drafting' then return jsonb_build_object('status','busy'); end if;
  select count(*)::integer into v_touched from private.report_sentences s where s.section_id=sec.id and not s.deleted and s.origin in ('ai','room','facilitator') and (s.touched or s.origin<>'ai');
  if v_touched>0 and not coalesce(p_confirm,false) then return jsonb_build_object('status','confirm','kept',v_touched); end if;
  if not ai then return jsonb_build_object('status','ai_off'); end if;
  q:=array[p_section];
 else
  -- What is missing: an empty section, one that needs attention, and a record section that has its table but no lead yet (built while AI was off).
  for x in select s.key from private.report_sections s where s.draft_id=d.id and not s.deleted and (s.status in ('empty','needs_attention')
    or (s.kind='record' and s.status='drafted' and not exists(select 1 from private.report_sentences z where z.section_id=s.id and not z.deleted and z.origin<>'record')))
    order by (case when s.key in ('overview','closing') then 1 else 0 end),(case s.key when 'closing' then 1 else 0 end),s.position loop
   q:=q||x.key;
  end loop;
  if not ai then
   -- With AI off the record blocks still stand: they are the records themselves.
   update private.report_sections set status='drafted',drafted_at=t where draft_id=d.id and not deleted and kind='record' and status='empty';
   return jsonb_build_object('status','ai_off');
  end if;
  if cardinality(q)=0 then return jsonb_build_object('status','nothing'); end if;
 end if;
 active:=has_round and r.status in ('pending','drafting');
 update private.report_sections set status='drafting',error=null,reviewed_by=null,reviewed_at=null where draft_id=d.id and not deleted and key=any(q) and (not active or key is distinct from r.current);
 if active then
  -- A round is running or waiting, however long ago it began: the section joins its queue. The section being drafted, its lease and its run are left alone.
  nq:=r.queue;
  foreach k in array q loop
   if k is distinct from r.current and not k=any(nq) then nq:=nq||k; end if;
  end loop;
  select coalesce(array_agg(f.key order by (case when f.key in ('overview','closing') then 1 else 0 end),(case f.key when 'closing' then 1 else 0 end),f.pos),array[]::text[]) into nq
   from private.report_defs() f where f.key=any(nq);
  update private.report_rounds set request_id=p_id,queue=nq where id=r.id;
 elsif has_round then
  update private.report_rounds set status='pending',request_id=p_id,requested_at=t,requested_by=private.clearway_user_id(),queue=q,current=null,attempts=0,
   lease_id=null,lease_run=null,lease_until=null,last_failed_at=null,last_error=null,last_kept=0,last_dropped=0 where id=r.id;
 else
  insert into private.report_rounds(engagement_id,status,request_id,requested_at,requested_by,queue,last_kept,last_dropped) values(p_engagement,'pending',p_id,t,private.clearway_user_id(),q,0,0);
 end if;
 return jsonb_build_object('status','ok','queued',cardinality(q));
end $$;

-- Refresh a record section from the records. The record sentences the facilitator edited are lost to it, so it asks first (status confirm).
create function private.report_refresh(p_engagement uuid,p_section text,p_confirm boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,true); sec private.report_sections; v_edited integer; v_blocks jsonb;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_section is null or p_section not in (select f.key from private.report_defs() f where f.kind='record') then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 perform private.rp_heal(p_engagement);
 select s.* into sec from private.report_sections s join private.report_drafts d on d.id=s.draft_id and d.engagement_id=s.engagement_id and not d.deleted
  where s.engagement_id=p_engagement and s.key=p_section and not s.deleted;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if sec.status='drafting' then return jsonb_build_object('status','busy'); end if;
 select count(*)::integer into v_edited from private.report_sentences s where s.section_id=sec.id and not s.deleted and s.origin<>'ai'
  and (s.origin<>'record' or s.touched) and s.id in (select (p.value->>'sentence_id')::uuid from jsonb_array_elements(coalesce(sec.blocks->'rows','[]'::jsonb)) r cross join lateral jsonb_array_elements(coalesce(r.value->'parts','[]'::jsonb)) p);
 if v_edited>0 and not coalesce(p_confirm,false) then return jsonb_build_object('status','confirm','edited',v_edited); end if;
 v_blocks:=private.report_build_block(p_engagement,sec.id,p_section);
 update private.report_sections set blocks=v_blocks,status=case when status in ('reviewed','empty','thin') then (case when status='empty' then 'drafted' else 'edited' end) else status end,
  reviewed_by=null,reviewed_at=null where id=sec.id;
 return jsonb_build_object('status','ok');
end $$;

-- ---------- The worker: due, claim, apply, fail ----------
create function private.report_due(p_engagement uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.report_rounds r where r.engagement_id=p_engagement and not r.deleted
  and ((r.status='pending' and cardinality(r.queue)>0 and (r.last_failed_at is null or r.last_failed_at<=clock_timestamp()-make_interval(secs=>10*greatest(r.attempts,1))))
   or (r.status='drafting' and r.lease_until<clock_timestamp())))
$$;

create function private.report_claim(p_engagement uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.report_rounds; t timestamptz:=clock_timestamp(); v_inputs jsonb; v_run uuid; sec private.report_sections; q text[]; k text; v_has boolean;
begin
 if p_engagement is null or p_lease is null or p_model is null or length(p_model) not between 1 and 100 or jsonb_typeof(p_versions) is distinct from 'object'
  or coalesce(p_versions->>'draft_report','') !~ '^[a-z0-9_.@-]{1,60}$' then return jsonb_build_object('status','invalid_request'); end if;
 select * into r from private.report_rounds where engagement_id=p_engagement and not deleted for update;
 if not found or r.status not in ('pending','drafting') then return jsonb_build_object('status','idle'); end if;
 if r.status='drafting' and r.lease_until>t then return jsonb_build_object('status','busy'); end if;
 if r.status='pending' and r.last_failed_at is not null and r.last_failed_at>t-make_interval(secs=>10*greatest(r.attempts,1)) then
  return jsonb_build_object('status','cooling','ms',(extract(epoch from r.last_failed_at+make_interval(secs=>10*greatest(r.attempts,1))-t)*1000)::integer); end if;
 if coalesce((select e.settings->>'ai_enabled' from public.engagements e where e.id=p_engagement and not e.deleted),'false')<>'true' then
  update private.report_sections set status=case when exists(select 1 from private.report_sentences s where s.section_id=report_sections.id and not s.deleted) then 'edited' else 'empty' end
   where engagement_id=p_engagement and not deleted and status='drafting';
  update private.report_rounds set status='idle',queue=array[]::text[],current=null,lease_id=null,lease_run=null,lease_until=null where id=r.id;
  return jsonb_build_object('status','off');
 end if;
 if r.lease_run is not null then update private.ai_runs set status='stale',finished_at=t where id=r.lease_run and status='running'; end if;
 q:=case when r.status='drafting' and r.current is not null then array[r.current]||r.queue else r.queue end;
 loop
  k:=q[1];
  if k is null then
   update private.report_rounds set status='ready',queue=array[]::text[],current=null,lease_id=null,lease_run=null,lease_until=null,last_ok_at=t where id=r.id;
   return jsonb_build_object('status','idle');
  end if;
  select s.* into sec from private.report_sections s join private.report_drafts d on d.id=s.draft_id and d.engagement_id=s.engagement_id and not d.deleted
   where s.engagement_id=p_engagement and s.key=k and not s.deleted;
  if not found then q:=q[2:]; continue; end if;
  v_inputs:=private.report_section_inputs(p_engagement,sec.id);
  exit when jsonb_array_length(v_inputs->'refs')>0;
  -- Nothing to draft from: the section is marked Thin data, or keeps what it has.
  select exists(select 1 from private.report_sentences s where s.section_id=sec.id and not s.deleted) into v_has;
  update private.report_sections set status=case when v_has then (case when exists(select 1 from private.report_sentences s where s.section_id=sec.id and not s.deleted and (s.touched or s.origin in ('facilitator','room'))) then 'edited' else 'drafted' end) else 'thin' end,
   error=null,drafted_at=t where id=sec.id;
  q:=q[2:];
 end loop;
 q:=q[2:];
 v_inputs:=v_inputs||jsonb_build_object('section_id',sec.id);
 insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,created_at) values(p_engagement,null,'draft_report',p_model,p_versions->>'draft_report',v_inputs,t) returning id into v_run;
 update private.report_rounds set status='drafting',queue=q,current=k,lease_id=p_lease,lease_run=v_run,lease_until=t+interval '6 minutes' where id=r.id;
 return jsonb_build_object('status','claimed','run',v_run,'job','draft_report','prompt_version',p_versions->>'draft_report','section',k,'inputs',v_inputs);
end $$;

-- Keep a reply only under the rules that are code: see report_check. A sentence that fails is dropped and the section is marked Needs attention.
-- A sentence rests on the sources of every ref it cites. A quoted sentence keeps the quoted words as its source's excerpt. Sentences the facilitator
-- touched stay; the untouched AI sentences of the section are replaced when at least one new sentence is kept.
create function private.report_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; r private.report_rounds; sec private.report_sections; t timestamptz:=clock_timestamp(); in_ jsonb; v_ms integer; sn record; v_text text; v_refs text[]; cited jsonb;
 names text[]; n_kept integer:=0; n_dropped integer:=0; reasons jsonb:='[]'::jsonb; why text; good jsonb:='[]'::jsonb; g record; v_norm text; v_quote boolean; v_thin text; srcs jsonb; seg text;
 v_live integer; v_touched integer; v_status text; v_all_thin boolean;
begin
 if p_run is null or p_lease is null or jsonb_typeof(p_output) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into run from private.ai_runs where id=p_run and job='draft_report';
 if not found then return jsonb_build_object('status','missing'); end if;
 in_:=run.inputs; v_ms:=private.ai_usage(p_usage,'ms',600000)::integer;
 perform private.discover_lock(run.engagement_id);
 select * into r from private.report_rounds where engagement_id=run.engagement_id and not deleted for update;
 if not found or run.status<>'running' or r.lease_id is distinct from p_lease or r.lease_run is distinct from p_run or r.lease_until<t then return jsonb_build_object('status','stale'); end if;
 select * into sec from private.report_sections where id=(in_->>'section_id')::uuid and engagement_id=run.engagement_id and not deleted;
 if not found then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms where id=run.id;
  update private.report_rounds set status=case when cardinality(queue)>0 then 'pending' else 'ready' end,current=null,lease_id=null,lease_run=null,lease_until=null where id=r.id;
  return jsonb_build_object('status','discarded');
 end if;
 if coalesce((select e.settings->>'ai_enabled' from public.engagements e where e.id=run.engagement_id),'false')<>'true' then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms where id=run.id;
  update private.report_sections set status=case when exists(select 1 from private.report_sentences s where s.section_id=report_sections.id and not s.deleted) then 'edited' else 'empty' end where engagement_id=run.engagement_id and not deleted and status='drafting';
  update private.report_rounds set status='idle',queue=array[]::text[],current=null,lease_id=null,lease_run=null,lease_until=null where id=r.id;
  return jsonb_build_object('status','discarded');
 end if;
 names:=private.report_names(run.engagement_id);
 for sn in select e.value as v,e.ord from jsonb_array_elements(case when jsonb_typeof(p_output->'sentences')='array' then p_output->'sentences' else '[]'::jsonb end) with ordinality e(value,ord) where e.ord<=12 loop
  if jsonb_typeof(sn.v)<>'object' then continue; end if;
  v_text:=private.rp_clean(sn.v->>'text');
  select coalesce(array_agg(distinct lower(btrim(s#>>'{}'))),array[]::text[]) into v_refs from jsonb_array_elements(case when jsonb_typeof(sn.v->'refs')='array' then sn.v->'refs' else '[]'::jsonb end) s where jsonb_typeof(s)='string';
  select jsonb_agg(x.value order by x.ord) into cited from jsonb_array_elements(in_->'refs') with ordinality x(value,ord) where lower(x.value->>'ref')=any(v_refs);
  why:=private.report_check(v_text,cited,names);
  if why is not null then n_dropped:=n_dropped+1; reasons:=reasons||jsonb_build_array(jsonb_build_object('reason',why)); continue; end if;
  -- The sentence rests on every cited ref's sources, up to eight. A quotation becomes the excerpt of the source that holds it.
  select coalesce(jsonb_agg(s.value order by x.ord,s.ord),'[]'::jsonb) into srcs from jsonb_array_elements(cited) with ordinality x(value,ord) cross join lateral jsonb_array_elements(x.value->'sources') with ordinality s(value,ord);
  v_norm:=private.rp_norm(translate(v_text,'“”','""'));
  v_quote:=v_norm ~ '^"[^"]+"[.!?]?$';
  if cardinality(private.rp_quoted(v_text))>0 then
   seg:=regexp_replace((private.rp_quoted(v_text))[1],'[.,!?…]+$','');
   select coalesce(jsonb_agg(case when (coalesce((s.value->>'room')::boolean,false) or s.value->>'kind' in ('scribe_card','four_lists_card','submission','lens_summary_sentence'))
      and position(private.rp_qnorm(seg) in private.rp_qnorm(s.value->>'excerpt'))>0 then jsonb_set(s.value,'{excerpt}',to_jsonb(left(seg,280))) else s.value end order by x.ord,s.ord),'[]'::jsonb) into srcs
    from jsonb_array_elements(cited) with ordinality x(value,ord) cross join lateral jsonb_array_elements(x.value->'sources') with ordinality s(value,ord);
  end if;
  select x.value->>'thin_text' into v_thin from jsonb_array_elements(cited) x where coalesce((x.value->>'thin')::boolean,false) limit 1;
  good:=good||jsonb_build_array(jsonb_build_object('text',v_text,'quote',v_quote,'thin',left(v_thin,80),'sources',srcs));
  n_kept:=n_kept+1;
 end loop;
 if n_kept>0 then
  for g in select s.id from private.report_sentences s where s.section_id=sec.id and not s.deleted and s.origin='ai' and not s.touched loop perform private.rp_drop(g.id); end loop;
  for g in select e.value as v from jsonb_array_elements(good) e loop
   perform private.rp_put(run.engagement_id,sec.id,g.v->>'text','ai',(g.v->>'quote')::boolean,g.v->>'thin',g.v->>'text',g.v->'sources');
  end loop;
 end if;
 select count(*)::integer,count(*) filter (where s.touched or s.origin in ('facilitator','room'))::integer into v_live,v_touched from private.report_sentences s where s.section_id=sec.id and not s.deleted;
 v_all_thin:=n_kept>0 and not exists(select 1 from jsonb_array_elements(good) e where e.value->>'thin' is null);
 v_status:=case when n_dropped>0 then 'needs_attention' when v_live=0 then 'thin' when v_all_thin then 'thin' when v_touched>0 then 'edited' else 'drafted' end;
 update private.report_sections set status=v_status,error=null,dropped=n_dropped,ai_run=run.id,drafted_at=t,reviewed_by=null,reviewed_at=null where id=sec.id;
 update private.ai_runs set status='ok',changed=n_kept>0,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'section',sec.key,'kept',n_kept,'dropped',n_dropped,'refused',reasons),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 update private.report_rounds set status=case when cardinality(queue)>0 then 'pending' else 'ready' end,current=null,attempts=0,lease_id=null,lease_run=null,lease_until=null,last_failed_at=null,last_error=null,
  last_ok_at=t,last_kept=coalesce(last_kept,0)+n_kept,last_dropped=coalesce(last_dropped,0)+n_dropped where id=r.id;
 return jsonb_build_object('status','ok','section',sec.key,'kept',n_kept,'dropped',n_dropped);
end $$;

-- One more try after a pause, then the section is marked Needs attention and the round moves on. The facilitator retries it with Redraft section.
create function private.report_fail(p_run uuid,p_lease uuid,p_error text,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; r private.report_rounds; t timestamptz:=clock_timestamp(); v_ms integer:=private.ai_usage(p_usage,'ms',600000)::integer; gave_up boolean; k text;
begin
 select * into run from private.ai_runs where id=p_run and job='draft_report';
 if not found or p_lease is null then return jsonb_build_object('status','missing'); end if;
 select * into r from private.report_rounds where engagement_id=run.engagement_id and not deleted for update;
 if not found or run.status<>'running' or r.lease_id is distinct from p_lease or r.lease_run is distinct from p_run then return jsonb_build_object('status','stale'); end if;
 update private.ai_runs set status='failed',finished_at=t,ms=v_ms,error=left(coalesce(p_error,'failed'),200),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 gave_up:=r.attempts+1>=2; k:=r.current;
 if gave_up then
  update private.report_sections set status='needs_attention',error='AI could not draft this section',reviewed_by=null,reviewed_at=null where engagement_id=run.engagement_id and key=k and not deleted;
  update private.report_rounds set status=case when cardinality(queue)>0 then 'pending' else 'ready' end,current=null,attempts=0,lease_id=null,lease_run=null,lease_until=null,
   last_failed_at=null,last_error=left(coalesce(p_error,'failed'),200) where id=r.id;
 else
  update private.report_rounds set status='pending',queue=array[k]||queue,current=null,attempts=attempts+1,lease_id=null,lease_run=null,lease_until=null,
   last_failed_at=t,last_error=left(coalesce(p_error,'failed'),200) where id=r.id;
 end if;
 return jsonb_build_object('status','ok','gave_up',gave_up);
end $$;

-- ---------- The editor ----------
-- A section that changed is Edited and needs reviewing again. A section being drafted is left alone.
create function private.rp_touch_section(p_section uuid) returns void
language sql security definer set search_path='' as $$
 update private.report_sections set status=case when status='drafting' then status else 'edited' end,reviewed_by=null,reviewed_at=null where id=p_section
$$;

-- Does a sentence rest on a source that still stands? It needs at least one, and every record it points at must still be there and not put away (a signal
-- still aligned and saved as a citation). A source whose record is gone has to be taken off, or the sentence rewritten, before sign-off.
create function private.rp_sentence_sourced(p_sentence uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.report_sources r where r.sentence_id=p_sentence and not r.deleted)
  and not exists(select 1 from private.report_sources r where r.sentence_id=p_sentence and not r.deleted and not private.rp_source_live(r.engagement_id,r.kind,r.ref_id))
$$;

create function private.report_edit(p_engagement uuid,p_sentence uuid,p_text text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,true); s private.report_sentences; v_text text:=private.rp_clean(p_text); v_origin text;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_sentence is null or length(v_text) not between 1 and 1200 then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 select * into s from private.report_sentences where id=p_sentence and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if private.rp_locked(s.section_id,s.origin) then return jsonb_build_object('status','locked'); end if;
 if s.text=v_text then return jsonb_build_object('status','unchanged'); end if;
 -- Edited AI wording still rests on its sources. A room's words or a record line, once changed, are the facilitator's own.
 v_origin:=case when s.origin in ('room','record') then 'facilitator' else s.origin end;
 update private.report_sentences set text=v_text,origin=v_origin,quote=false,touched=true where id=s.id;
 perform private.rp_touch_section(s.section_id);
 return jsonb_build_object('status','ok');
end $$;

create function private.report_add(p_engagement uuid,p_section uuid,p_text text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,true); v_text text:=private.rp_clean(p_text); sid uuid;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_section is null or length(v_text) not between 1 and 1200 then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 if not exists(select 1 from private.report_sections where id=p_section and engagement_id=p_engagement and not deleted) then return jsonb_build_object('status','not_found'); end if;
 sid:=private.rp_put(p_engagement,p_section,v_text,'facilitator',false,null,null,'[]'::jsonb);
 perform private.rp_touch_section(p_section);
 return jsonb_build_object('status','ok','id',sid);
end $$;

create function private.report_remove(p_engagement uuid,p_sentence uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,true); s private.report_sentences; sec private.report_sections; w record;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_sentence is null then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 select * into s from private.report_sentences where id=p_sentence and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if private.rp_locked(s.section_id,s.origin) then return jsonb_build_object('status','locked'); end if;
 -- A table row stands on its first sentence: take that away and what hung from it (a risk's answers) goes too.
 select * into sec from private.report_sections where id=s.section_id;
 for w in select r.value as rw from jsonb_array_elements(coalesce(sec.blocks->'rows','[]'::jsonb)) r
   where jsonb_array_length(coalesce(r.value->'cells','[]'::jsonb))>0 and (r.value->'parts'->0)->>'sentence_id'=s.id::text loop
  perform private.rp_drop((p.value->>'sentence_id')::uuid) from jsonb_array_elements(w.rw->'parts') p where (p.value->>'sentence_id')::uuid<>s.id;
 end loop;
 perform private.rp_drop(s.id);
 perform private.rp_touch_section(s.section_id);
 return jsonb_build_object('status','ok');
end $$;

-- Use the room's words: the sentence becomes the room's exact words from the first source that holds them. The AI wording is kept for undo.
create function private.report_room_words(p_engagement uuid,p_sentence uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,true); s private.report_sentences; src private.report_sources; v_words text;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_sentence is null then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 select * into s from private.report_sentences where id=p_sentence and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if private.rp_locked(s.section_id,s.origin) then return jsonb_build_object('status','locked'); end if;
 select * into src from private.report_sources where sentence_id=s.id and not deleted and room_words order by position,id limit 1;
 if not found then return jsonb_build_object('status','no_room_words'); end if;
 v_words:=case when src.excerpt ~ '[.!?…]$' then src.excerpt else src.excerpt||'.' end;
 if s.text=v_words and s.origin='room' then return jsonb_build_object('status','unchanged'); end if;
 update private.report_sentences set ai_text=coalesce(ai_text,case when origin='ai' then text end),text=v_words,origin='room',quote=true,touched=true where id=s.id;
 perform private.rp_touch_section(s.section_id);
 return jsonb_build_object('status','ok');
end $$;

create function private.report_undo_room_words(p_engagement uuid,p_sentence uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,true); s private.report_sentences;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_sentence is null then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 select * into s from private.report_sentences where id=p_sentence and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if s.origin<>'room' or s.ai_text is null then return jsonb_build_object('status','unchanged'); end if;
 update private.report_sentences set text=s.ai_text,origin='ai',quote=false,touched=false where id=s.id;
 perform private.rp_touch_section(s.section_id);
 return jsonb_build_object('status','ok');
end $$;

-- Add or remove a source. A source to add must be one of the section's own candidates (the records the section reads), and a signal only if the
-- database accepts it. Taking a source off an AI sentence leaves it unsourced, which blocks sign-off until it has one again.
create function private.report_source_set(p_engagement uuid,p_sentence uuid,p_kind text,p_ref uuid,p_excerpt text,p_add boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,true); s private.report_sentences; c jsonb; n integer; v_excerpt text;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_sentence is null or p_kind is null or p_add is null or (p_kind<>'record' and p_ref is null) then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 select * into s from private.report_sentences where id=p_sentence and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if p_add then
  select e.value into c from jsonb_array_elements(private.report_candidates(p_engagement,s.section_id)) e
   where e.value->>'kind'=p_kind and nullif(e.value->>'ref_id','')::uuid is not distinct from p_ref and (p_kind<>'record' or e.value->>'excerpt'=p_excerpt) limit 1;
  if c is null then return jsonb_build_object('status','not_a_source'); end if;
  v_excerpt:=c->>'excerpt';
  select count(*)::integer into n from private.report_sources where sentence_id=s.id and not deleted;
  if exists(select 1 from private.report_sources r where r.sentence_id=s.id and not r.deleted and r.kind=p_kind and r.ref_id is not distinct from p_ref and r.excerpt=v_excerpt) then return jsonb_build_object('status','unchanged'); end if;
  if n>=8 then return jsonb_build_object('status','too_many'); end if;
  insert into private.report_sources(engagement_id,sentence_id,kind,ref_id,excerpt,room_words,position) values(p_engagement,s.id,p_kind,p_ref,v_excerpt,coalesce((c->>'room')::boolean,false),n);
 else
  update private.report_sources set deleted=true where sentence_id=s.id and not deleted and kind=p_kind and ref_id is not distinct from p_ref and (p_kind<>'record' or excerpt=p_excerpt);
  if not found then return jsonb_build_object('status','not_found'); end if;
 end if;
 update private.report_sentences set touched=true where id=s.id;
 perform private.rp_touch_section(s.section_id);
 return jsonb_build_object('status','ok');
end $$;

create function private.report_mark_reviewed(p_engagement uuid,p_section uuid,p_reviewed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,true); sec private.report_sections; v_live integer;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_section is null or p_reviewed is null then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 perform private.rp_heal(p_engagement);
 select * into sec from private.report_sections where id=p_section and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if not p_reviewed then
  if sec.status<>'reviewed' then return jsonb_build_object('status','unchanged'); end if;
  update private.report_sections set status='edited',reviewed_by=null,reviewed_at=null where id=sec.id;
  return jsonb_build_object('status','ok');
 end if;
 if sec.status='reviewed' then return jsonb_build_object('status','unchanged'); end if;
 if sec.status='drafting' then return jsonb_build_object('status','busy'); end if;
 select count(*)::integer into v_live from private.report_sentences where section_id=sec.id and not deleted;
 if sec.status='empty' or (sec.status='needs_attention' and v_live=0) then return jsonb_build_object('status','not_ready'); end if;
 update private.report_sections set status='reviewed',reviewed_by=private.clearway_user_id(),reviewed_at=clock_timestamp() where id=sec.id;
 return jsonb_build_object('status','ok');
end $$;

-- ---------- Snapshot and sign-off ----------
-- Every section's heading, sentences (origin, quote, thin label), blocks and sources, all as text, so later edits cannot change what was signed off.
create function private.report_snapshot(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('sections',coalesce(jsonb_agg(jsonb_build_object('key',s.key,'position',s.position,'heading',s.heading,'kind',s.kind,'blocks',private.rp_block_resolved(s.blocks),
  'sentences',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'position',x.position,'text',x.text,'origin',x.origin,'quote',x.quote,'thin_label',x.thin_label,
    'sources',coalesce((select jsonb_agg(jsonb_build_object('kind',r.kind,'ref_id',r.ref_id,'excerpt',r.excerpt) order by r.position,r.id) from private.report_sources r where r.sentence_id=x.id and not r.deleted),'[]'::jsonb)) order by x.position,x.id)
   from private.report_sentences x where x.section_id=s.id and not x.deleted),'[]'::jsonb)) order by s.position),'[]'::jsonb))
 from private.report_sections s join private.report_drafts d on d.id=s.draft_id and d.engagement_id=s.engagement_id and not d.deleted where s.engagement_id=p_engagement and not s.deleted
$$;

create function private.report_sign_off(p_engagement uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,true); last private.report_sign_offs; snap jsonb; n integer; v_unrev integer; v_unsrc integer; v_sections integer; v_heads text[];
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_id is null then return jsonb_build_object('status','invalid_request'); end if;
 if not coalesce(private.is_lead(p_engagement),false) then return jsonb_build_object('status','lead_only'); end if;
 perform private.discover_lock(p_engagement);
 select * into last from private.report_sign_offs where engagement_id=p_engagement and not deleted order by n desc limit 1;
 if last.id is not null and last.request_id=p_id then return jsonb_build_object('status','duplicate','n',last.n); end if;
 select count(*)::integer,count(*) filter (where s.status<>'reviewed')::integer into v_sections,v_unrev from private.report_sections s join private.report_drafts d on d.id=s.draft_id and d.engagement_id=s.engagement_id and not d.deleted
  where s.engagement_id=p_engagement and not s.deleted;
 if v_sections<14 then return jsonb_build_object('status','no_draft'); end if;
 if v_unrev>0 then return jsonb_build_object('status','not_reviewed','count',v_unrev); end if;
 -- The 10-year Future is what the room signed off, word for word: it is checked against the signed off lens summaries again here.
 if not private.rp_future_ok(p_engagement) then return jsonb_build_object('status','future_changed'); end if;
 select count(*)::integer,coalesce(array_agg(distinct s.heading),array[]::text[]) into v_unsrc,v_heads from private.report_sentences x join private.report_sections s on s.id=x.section_id and not s.deleted
  where x.engagement_id=p_engagement and not x.deleted and x.origin<>'facilitator' and not private.rp_sentence_sourced(x.id);
 if v_unsrc>0 then return jsonb_build_object('status','unsourced','count',v_unsrc,'sections',to_jsonb(v_heads)); end if;
 snap:=private.report_snapshot(p_engagement);
 if last.id is not null and last.snapshot=snap then return jsonb_build_object('status','unchanged','n',last.n); end if;
 select coalesce(max(o.n),0)+1 into n from private.report_sign_offs o where o.engagement_id=p_engagement;
 insert into private.report_sign_offs(engagement_id,n,request_id,snapshot,signed_by) values(p_engagement,n,p_id,snap,private.clearway_user_id());
 return jsonb_build_object('status','ok','n',n);
end $$;

-- The newest sign-off for the read-only copy and the clean export, with the sources stripped, or null. Service role only (step 4 and step 5 read it).
create function private.report_signed_for_view(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('n',o.n,'signed_at',o.signed_at,'sections',(
  select coalesce(jsonb_agg(jsonb_set(q.value,'{sentences}',coalesce((select jsonb_agg(z.value-'sources' order by z.ord) from jsonb_array_elements(q.value->'sentences') with ordinality z(value,ord)),'[]'::jsonb)) order by q.ord),'[]'::jsonb)
  from jsonb_array_elements(o.snapshot->'sections') with ordinality q(value,ord)))
 from private.report_sign_offs o where o.engagement_id=p_engagement and not o.deleted order by o.n desc limit 1
$$;

-- ---------- The page's state ----------
create function private.report_state(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,false); d private.report_drafts; rd private.report_rounds; so private.report_sign_offs; snap jsonb; ai boolean; out jsonb; strand text[]:=private.rp_stranded(p_engagement);
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 select * into d from private.report_drafts where engagement_id=p_engagement and not deleted;
 select * into rd from private.report_rounds where engagement_id=p_engagement and not deleted;
 select * into so from private.report_sign_offs where engagement_id=p_engagement and not deleted order by n desc limit 1;
 select coalesce(e.settings->>'ai_enabled','false')='true' into ai from public.engagements e where e.id=p_engagement;
 if d.id is not null then snap:=private.report_snapshot(p_engagement); end if;
 select jsonb_build_object('status','ok','server_time',clock_timestamp(),'ai',coalesce(ai,false),'lead',coalesce(private.is_lead(p_engagement),false),'draft',d.id is not null,'stamp',private.report_pulse(p_engagement)->>'stamp','future_ok',case when d.id is not null then private.rp_future_ok(p_engagement) end,
  'round',case when rd.id is not null then jsonb_build_object('status',rd.status,'requested_at',rd.requested_at,'queue',to_jsonb(rd.queue),'current',rd.current,'attempts',rd.attempts,'error',rd.last_error,'ok_at',rd.last_ok_at,'kept',rd.last_kept,'dropped',rd.last_dropped) end,
  'signed',case when so.id is not null then jsonb_build_object('n',so.n,'signed_at',so.signed_at,'by',(select u.name from public.clearway_users u where u.id=so.signed_by),'stale',snap is distinct from so.snapshot) end,
  'sections',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'key',s.key,'position',s.position,'heading',s.heading,'kind',s.kind,'status',case when s.key=any(strand) then 'needs_attention' else s.status end,'error',case when s.key=any(strand) then 'AI could not draft this section' else s.error end,'dropped',s.dropped,
    'reviewed',case when s.reviewed_at is not null then jsonb_build_object('at',s.reviewed_at,'by',(select u.name from public.clearway_users u where u.id=s.reviewed_by)) end,'blocks',s.blocks,
    'sentences',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'position',x.position,'text',x.text,'origin',x.origin,'quote',x.quote,'thin_label',x.thin_label,'touched',x.touched,'can_undo',x.origin='room' and x.ai_text is not null,
      'needs_source',x.origin<>'facilitator' and not private.rp_sentence_sourced(x.id),
      'sources',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'ref_id',r.ref_id,'excerpt',r.excerpt,'room',r.room_words,'broken',not private.rp_source_live(p_engagement,r.kind,r.ref_id),'info',
        case when r.kind='record' then jsonb_build_object('label','Record','text',r.excerpt) else private.rp_source_info(p_engagement,r.kind,r.ref_id) end) order by r.position,r.id)
        from private.report_sources r where r.sentence_id=x.id and not r.deleted),'[]'::jsonb)) order by x.position,x.id)
     from private.report_sentences x where x.section_id=s.id and not x.deleted),'[]'::jsonb)) order by s.position)
    from private.report_sections s where s.draft_id=d.id and not s.deleted),'[]'::jsonb)) into out;
 return out;
end $$;


-- A light look at the report for the page's polling and the control surface's link: whether it is here, whether a round is working, and a stamp that changes whenever
-- anything in the report does. The page loads the whole state only when the stamp moves.
create function private.report_pulse(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,false); v_stamp text; v_round text;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 select coalesce(max(z.u)::text,'')||'/'||coalesce(sum(z.n),0)::text into v_stamp from (
  select max(updated_at) u,count(*) n from private.report_drafts where engagement_id=p_engagement
  union all select max(updated_at),count(*) from private.report_sections where engagement_id=p_engagement
  union all select max(updated_at),count(*) from private.report_sentences where engagement_id=p_engagement
  union all select max(updated_at),count(*) from private.report_sources where engagement_id=p_engagement
  union all select max(updated_at),count(*) from private.report_rounds where engagement_id=p_engagement
  union all select max(updated_at),count(*) from private.report_sign_offs where engagement_id=p_engagement) z;
 select r.status into v_round from private.report_rounds r where r.engagement_id=p_engagement and not r.deleted;
 return jsonb_build_object('status','ok','stamp',v_stamp,'working',coalesce(v_round in ('pending','drafting'),false));
end $$;

-- The records a sentence's section can cite, for the Add a source picker.
create function private.report_candidates_for(p_engagement uuid,p_section uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,false);
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 return jsonb_build_object('status','ok','candidates',private.report_candidates(p_engagement,p_section));
end $$;

-- ---------- Public entry points (invokers; every check is in the private functions) ----------
create function public.report_state(p_engagement uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.report_state(p_engagement) $$;
create function public.report_pulse(p_engagement uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.report_pulse(p_engagement) $$;
create function public.report_candidates(p_engagement uuid,p_section uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.report_candidates_for(p_engagement,p_section) $$;
create function public.report_start(p_engagement uuid,p_id uuid,p_scope text,p_section text,p_confirm boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.report_start(p_engagement,p_id,p_scope,p_section,p_confirm) $$;
create function public.report_refresh(p_engagement uuid,p_section text,p_confirm boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.report_refresh(p_engagement,p_section,p_confirm) $$;
create function public.report_edit(p_engagement uuid,p_sentence uuid,p_text text) returns jsonb language sql security invoker set search_path='' as $$ select private.report_edit(p_engagement,p_sentence,p_text) $$;
create function public.report_add(p_engagement uuid,p_section uuid,p_text text) returns jsonb language sql security invoker set search_path='' as $$ select private.report_add(p_engagement,p_section,p_text) $$;
create function public.report_remove(p_engagement uuid,p_sentence uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.report_remove(p_engagement,p_sentence) $$;
create function public.report_room_words(p_engagement uuid,p_sentence uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.report_room_words(p_engagement,p_sentence) $$;
create function public.report_undo_room_words(p_engagement uuid,p_sentence uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.report_undo_room_words(p_engagement,p_sentence) $$;
create function public.report_source_set(p_engagement uuid,p_sentence uuid,p_kind text,p_ref uuid,p_excerpt text,p_add boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.report_source_set(p_engagement,p_sentence,p_kind,p_ref,p_excerpt,p_add) $$;
create function public.report_mark_reviewed(p_engagement uuid,p_section uuid,p_reviewed boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.report_mark_reviewed(p_engagement,p_section,p_reviewed) $$;
create function public.report_sign_off(p_engagement uuid,p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.report_sign_off(p_engagement,p_id) $$;
create function public.report_due(p_engagement uuid) returns boolean language sql stable security invoker set search_path='' as $$ select private.report_due(p_engagement) $$;
create function public.report_claim(p_engagement uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.report_claim(p_engagement,p_lease,p_model,p_versions) $$;
create function public.report_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.report_apply(p_run,p_lease,p_output,p_usage) $$;
create function public.report_fail(p_run uuid,p_lease uuid,p_error text,p_usage jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.report_fail(p_run,p_lease,p_error,p_usage) $$;

-- ---------- Grants ----------
-- Nothing is callable by a browser or an anonymous caller unless it is listed below: every function this file made starts with its execute taken away.
do $grants$
declare f record;
begin
 for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where (n.nspname='private' and (p.proname like 'rp\_%' or p.proname like 'report\_%' or p.proname='visibility_plan_for_report'))
      or (n.nspname='public' and p.proname like 'report\_%') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 end loop;
end $grants$;
grant execute on function private.report_state(uuid),private.report_start(uuid,uuid,text,text,boolean),private.report_refresh(uuid,text,boolean),private.report_edit(uuid,uuid,text),private.report_add(uuid,uuid,text),
 private.report_remove(uuid,uuid),private.report_room_words(uuid,uuid),private.report_undo_room_words(uuid,uuid),private.report_source_set(uuid,uuid,text,uuid,text,boolean),
 private.report_mark_reviewed(uuid,uuid,boolean),private.report_sign_off(uuid,uuid),private.report_candidates_for(uuid,uuid),private.report_pulse(uuid),
 public.report_state(uuid),public.report_pulse(uuid),public.report_candidates(uuid,uuid),public.report_start(uuid,uuid,text,text,boolean),public.report_refresh(uuid,text,boolean),public.report_edit(uuid,uuid,text),public.report_add(uuid,uuid,text),
 public.report_remove(uuid,uuid),public.report_room_words(uuid,uuid),public.report_undo_room_words(uuid,uuid),public.report_source_set(uuid,uuid,text,uuid,text,boolean),
 public.report_mark_reviewed(uuid,uuid,boolean),public.report_sign_off(uuid,uuid) to authenticated;
grant execute on function private.report_due(uuid),private.report_claim(uuid,uuid,text,jsonb),private.report_apply(uuid,uuid,jsonb,jsonb),private.report_fail(uuid,uuid,text,jsonb),
 public.report_due(uuid),public.report_claim(uuid,uuid,text,jsonb),public.report_apply(uuid,uuid,jsonb,jsonb),public.report_fail(uuid,uuid,text,jsonb),
 private.report_signed_for_view(uuid),private.visibility_plan_for_report(uuid),private.report_section_inputs(uuid,uuid) to service_role;

-- ---------- The practice room's reset and Clear test answers ----------
-- Each is the newest definition renamed to _pre_report and wrapped, so every earlier step's clearing stays in place whichever step merges first.
-- The practice reset puts away every report record. Clear test answers puts away what a rehearsal made (the test rows) and what hangs from it.
create function private.rp_clear(p_engagement uuid,p_only_test boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 update private.report_sources set deleted=true where engagement_id=p_engagement and not deleted and sentence_id in (
  select x.id from private.report_sentences x join private.report_sections s on s.id=x.section_id join private.report_drafts d on d.id=s.draft_id where x.engagement_id=p_engagement and (not p_only_test or d.test));
 update private.report_sentences set deleted=true where engagement_id=p_engagement and not deleted and section_id in (
  select s.id from private.report_sections s join private.report_drafts d on d.id=s.draft_id where s.engagement_id=p_engagement and (not p_only_test or d.test));
 update private.report_sections set deleted=true,status='empty',reviewed_by=null,reviewed_at=null where engagement_id=p_engagement and not deleted and draft_id in (
  select d.id from private.report_drafts d where d.engagement_id=p_engagement and (not p_only_test or d.test));
 update private.report_drafts set deleted=true where engagement_id=p_engagement and not deleted and (not p_only_test or test);
 update private.report_sign_offs set deleted=true where engagement_id=p_engagement and not deleted and (not p_only_test or test);
 update private.report_rounds set deleted=true where engagement_id=p_engagement and not deleted and (not p_only_test or test);
end $$;

alter function private.reset_practice_room() rename to reset_practice_room_pre_report;
alter function private.rehearsal_control(uuid,uuid,text) rename to rehearsal_control_pre_report;

create function private.reset_practice_room() returns boolean
language plpgsql security definer set search_path='' as $$
declare eng uuid:='90000000-0000-4000-8000-000000000010'::uuid; ok boolean;
begin
 ok:=private.reset_practice_room_pre_report();
 if ok then perform private.rp_clear(eng,false); end if;
 return ok;
end $$;

create function private.rehearsal_control(p_engagement uuid,p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb;
begin
 out:=private.rehearsal_control_pre_report(p_engagement,p_id,p_action);
 if p_action='clear' and p_engagement is not null and out->>'status'='ok' then perform private.rp_clear(p_engagement,true); end if;
 return out;
end $$;

revoke all on function private.rp_clear(uuid,boolean),private.reset_practice_room_pre_report(),private.reset_practice_room(),private.rehearsal_control_pre_report(uuid,uuid,text),private.rehearsal_control(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.reset_practice_room(),private.rehearsal_control(uuid,uuid,text) to authenticated;

commit;
