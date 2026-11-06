-- Milestone 6, step 1: Discover records, survey findings and SET-06 notes.
--
-- The congregational survey lives in Team Hub and the app never reads it (Decided November 5).
-- The facilitator adds the survey report's key findings by hand, the survey's total respondents once
-- per engagement, and the notes from leadership interviews and board or staff input conversations.
-- Every record is facilitator-only: the tables sit in `private` under forced row-level security with no
-- browser grant, and the lead, a co-facilitator and an admin reach them only through the security
-- definer functions below (each with a security invoker wrapper in `public`).
--
-- New:
--   public.engagements.survey_respondents   the survey's total respondents, set once per engagement
--   private.survey_findings                 title, figure as text, respondents it rests on
--   private.conversation_notes              interview or input conversation, person (record only), text
--   private.discover_themes                 source survey, four_lists or conversations; counts, quotes, status
--   private.discover_theme_sources          a theme to a finding, a note or a Four Helpful Lists card
--   private.signals                         records only (the signal job is step 5); no function reads or writes them yet
--   private.discover_state, discover_total_set, discover_finding_save, discover_finding_delete,
--   private.discover_note_add, discover_note_update, discover_note_delete, discover_note_read (and public wrappers)
-- Thin and strength are worked out in code from the counts (lib/discover/), never stored.
--
-- Shared objects touched, each a superset of its latest definition on main:
--   private.reset_practice_room   the acceptance fixes version (20261104190000) plus the five new tables and the survey total
--   private.rehearsal_control     the practice fixes version (20261105100000) plus test rows of the five new tables
--   private.control_status        the practice fixes version (20261105100000), only the rehearsal test_answers count widened
-- The ai_runs job check, ai_on, ai_claim and ai_apply are not touched. Nothing here touches Team Hub or
-- CORE, and nothing reaches the TV or phones.
begin;

-- ---------- The survey's total respondents ----------
-- Engagements are already readable by facilitators only (row-level security) and written through
-- the function below: the column is not in the update grant.
alter table public.engagements add column survey_respondents integer check(survey_respondents is null or survey_respondents between 1 and 1000000);

-- ---------- Survey findings ----------
create table private.survey_findings (
 id uuid primary key,                  -- made on the facilitator's browser, so a repeated save does nothing new
 engagement_id uuid not null references public.engagements(id),
 title text not null check(length(btrim(title)) between 1 and 120),
 figure text not null check(length(btrim(figure)) between 1 and 40 and figure ~ '[0-9]'),
 rests_on integer not null check(rests_on between 1 and 1000000),
 test boolean not null default false,
 seq bigint generated always as identity,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id)
);
create index survey_findings_engagement_idx on private.survey_findings(engagement_id,seq);

-- ---------- Conversation notes ----------
create table private.conversation_notes (
 id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 kind text not null check(kind in ('interview','input')),
 person text check(person is null or length(btrim(person)) between 1 and 200),   -- for the record only: never reaches AI, a theme or a quote
 title text not null check(length(btrim(title)) between 1 and 200),
 body text not null check(length(btrim(body)) between 1 and 60000),
 source_kind text not null check(source_kind in ('paste','docx','pdf','txt')),
 char_count integer generated always as (char_length(body)) stored,
 word_count integer not null check(word_count between 0 and 60000),
 test boolean not null default false,
 seq bigint generated always as identity,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id)
);
create index conversation_notes_engagement_idx on private.conversation_notes(engagement_id,seq);

-- ---------- Discover themes ----------
-- Step 1 writes only survey themes (one per finding). Step 3 drafts the others. Only accepted themes
-- count anywhere. rests_on and out_of are counts; thin and strength are worked out in code.
create table private.discover_themes (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 source text not null check(source in ('survey','four_lists','conversations')),
 label text not null check(length(btrim(label)) between 1 and 200),
 detail text not null default '' check(length(detail)<=1000),
 rests_on integer not null default 0 check(rests_on between 0 and 1000000),
 out_of integer check(out_of is null or out_of between 0 and 1000000),
 quotes jsonb not null default '[]' check(jsonb_typeof(quotes)='array' and jsonb_array_length(quotes)<=3 and pg_column_size(quotes)<=4096),
 status text not null default 'draft' check(status in ('draft','accepted','rejected')),
 merged_into uuid,
 ai_run uuid references private.ai_runs(id) on delete set null,
 test boolean not null default false,
 seq bigint generated always as identity,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id),
 check(merged_into is null or merged_into<>id),
 foreign key(merged_into,engagement_id) references private.discover_themes(id,engagement_id)
);
create index discover_themes_engagement_idx on private.discover_themes(engagement_id,source,seq);
create index discover_themes_merged_idx on private.discover_themes(merged_into,engagement_id) where merged_into is not null;
create index discover_themes_ai_run_idx on private.discover_themes(ai_run) where ai_run is not null;

create table private.discover_theme_sources (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 theme_id uuid not null,
 finding_id uuid,
 note_id uuid,
 card_id uuid,                          -- a Four Helpful Lists card (step 2); no foreign key, the cards belong to its tables
 quote text check(quote is null or length(btrim(quote)) between 1 and 500),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 check(num_nonnulls(finding_id,note_id,card_id)=1),
 foreign key(theme_id,engagement_id) references private.discover_themes(id,engagement_id),
 foreign key(finding_id,engagement_id) references private.survey_findings(id,engagement_id),
 foreign key(note_id,engagement_id) references private.conversation_notes(id,engagement_id)
);
create index discover_theme_sources_theme_idx on private.discover_theme_sources(theme_id,engagement_id);
create index discover_theme_sources_finding_idx on private.discover_theme_sources(finding_id,engagement_id) where finding_id is not null;
create index discover_theme_sources_note_idx on private.discover_theme_sources(note_id,engagement_id) where note_id is not null;
create index discover_theme_sources_engagement_idx on private.discover_theme_sources(engagement_id);
-- A finding is the source of exactly one theme.
create unique index discover_theme_sources_one_theme on private.discover_theme_sources(finding_id) where finding_id is not null and not deleted;

-- ---------- Signals (records only) ----------
-- The signal job, its cards and their functions are step 5. This is the record they will use.
create table private.signals (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 kind text not null check(kind in ('aligned','divergent','silent','thin')),
 theme_id uuid,
 evidence jsonb not null default '{}' check(jsonb_typeof(evidence)='object' and pg_column_size(evidence)<=16384),
 dismissed_at timestamptz,
 saved_as_citation_at timestamptz,
 neutral_question_sent_at timestamptz,
 ai_run uuid references private.ai_runs(id) on delete set null,
 test boolean not null default false,
 seq bigint generated always as identity,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 check(saved_as_citation_at is null or kind='aligned'),
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id),
 foreign key(theme_id,engagement_id) references private.discover_themes(id,engagement_id)
);
create index signals_session_idx on private.signals(session_id,engagement_id,seq);
create index signals_engagement_idx on private.signals(engagement_id);
create index signals_theme_idx on private.signals(theme_id,engagement_id) where theme_id is not null;
create index signals_ai_run_idx on private.signals(ai_run) where ai_run is not null;
-- The same kind and theme in the same session replaces its card, never doubles it.
create unique index signals_one_per_theme on private.signals(session_id,kind,theme_id) where theme_id is not null and not deleted;

-- ---------- Row-level security: enabled and forced on each table, no browser grant ----------
alter table private.survey_findings enable row level security;
alter table private.survey_findings force row level security;
revoke all on private.survey_findings from public,anon,authenticated;
grant select,insert,update,delete on private.survey_findings to service_role;
create trigger touch_record before update on private.survey_findings for each row execute function private.touch_live_record('id');
create trigger mark_test before insert on private.survey_findings for each row execute function private.mark_test();

alter table private.conversation_notes enable row level security;
alter table private.conversation_notes force row level security;
revoke all on private.conversation_notes from public,anon,authenticated;
grant select,insert,update,delete on private.conversation_notes to service_role;
create trigger touch_record before update on private.conversation_notes for each row execute function private.touch_live_record('id');
create trigger mark_test before insert on private.conversation_notes for each row execute function private.mark_test();

alter table private.discover_themes enable row level security;
alter table private.discover_themes force row level security;
revoke all on private.discover_themes from public,anon,authenticated;
grant select,insert,update,delete on private.discover_themes to service_role;
create trigger touch_record before update on private.discover_themes for each row execute function private.touch_live_record('id');
create trigger mark_test before insert on private.discover_themes for each row execute function private.mark_test();

alter table private.discover_theme_sources enable row level security;
alter table private.discover_theme_sources force row level security;
revoke all on private.discover_theme_sources from public,anon,authenticated;
grant select,insert,update,delete on private.discover_theme_sources to service_role;
create trigger touch_record before update on private.discover_theme_sources for each row execute function private.touch_live_record('id');

alter table private.signals enable row level security;
alter table private.signals force row level security;
revoke all on private.signals from public,anon,authenticated;
grant select,insert,update,delete on private.signals to service_role;
create trigger touch_record before update on private.signals for each row execute function private.touch_live_record('id');
create trigger mark_test before insert on private.signals for each row execute function private.mark_test();

-- ---------- Who may use Discover ----------
-- A facilitator of the engagement (lead or co-facilitator) or an admin. Writes stop once the engagement is closed.
create function private.discover_guard(p_engagement uuid,p_write boolean) returns text
language plpgsql stable security definer set search_path='' as $$
begin
 if p_engagement is null or not coalesce(private.show_allowed(p_engagement),false) then return 'denied'; end if;
 if p_write and exists(select 1 from public.engagements where id=p_engagement and status='closed') then return 'closed'; end if;
 return null;
end $$;

-- A write to the practice room waits for a reset in progress, as the other record functions do.
create function private.discover_lock(p_engagement uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 perform 1 from public.engagements where id=p_engagement for update;
end $$;

-- ---------- The Discover page's state ----------
-- One read: the survey total, the findings, the notes (without their text) and the themes. The person on a
-- note is here for the facilitator's SET-06 screen only.
create function private.discover_state(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,false); total integer;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 select survey_respondents into total from public.engagements where id=p_engagement;
 return jsonb_build_object('status','ok','server_time',clock_timestamp(),'survey_respondents',total,
  'findings',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'title',f.title,'figure',f.figure,'rests_on',f.rests_on,
     'theme_id',(select s.theme_id from private.discover_theme_sources s where s.finding_id=f.id and s.engagement_id=f.engagement_id and not s.deleted limit 1)) order by f.seq)
    from private.survey_findings f where f.engagement_id=p_engagement and not f.deleted),'[]'::jsonb),
  'notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'kind',n.kind,'person',n.person,'title',n.title,'source_kind',n.source_kind,'char_count',n.char_count,'word_count',n.word_count,'created_at',n.created_at) order by n.seq)
    from private.conversation_notes n where n.engagement_id=p_engagement and not n.deleted),'[]'::jsonb),
  'themes',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'source',t.source,'label',t.label,'detail',t.detail,'rests_on',t.rests_on,'out_of',t.out_of,'quotes',t.quotes,
     'status',t.status,'merged_into',t.merged_into,'ai',t.ai_run is not null,
     'sources',(select count(*) from private.discover_theme_sources s where s.theme_id=t.id and s.engagement_id=t.engagement_id and not s.deleted)) order by t.seq)
    from private.discover_themes t where t.engagement_id=p_engagement and not t.deleted),'[]'::jsonb));
end $$;

-- ---------- The survey's total respondents ----------
create function private.discover_total_set(p_engagement uuid,p_total integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true); most integer;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_total is not null and p_total not between 1 and 1000000 then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 select max(rests_on) into most from private.survey_findings where engagement_id=p_engagement and not deleted;
 if p_total is not null and most is not null and p_total<most then return jsonb_build_object('status','below_findings','most',most); end if;
 update public.engagements set survey_respondents=p_total where id=p_engagement;
 update private.discover_themes set out_of=p_total where engagement_id=p_engagement and source='survey' and not deleted;
 return jsonb_build_object('status','ok','survey_respondents',p_total);
end $$;

-- ---------- Survey findings ----------
-- Saving a finding makes or updates its survey theme in the same call, and that theme is accepted:
-- each finding is its own theme. The id comes from the browser, so a repeated save is the same save.
create function private.discover_finding_save(p_engagement uuid,p_id uuid,p_title text,p_figure text,p_rests_on integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true); v_title text:=btrim(regexp_replace(coalesce(p_title,''),'\s+',' ','g')); v_figure text:=btrim(regexp_replace(coalesce(p_figure,''),'\s+',' ','g'));
 total integer; f private.survey_findings; t uuid; created boolean:=false;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_id is null or length(v_title) not between 1 and 120 or length(v_figure) not between 1 and 40 or v_figure !~ '[0-9]' or p_rests_on is null or p_rests_on not between 1 and 1000000
  then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 select survey_respondents into total from public.engagements where id=p_engagement;
 if total is not null and p_rests_on>total then return jsonb_build_object('status','exceeds_total','total',total); end if;
 select * into f from private.survey_findings where id=p_id for update;
 if found then
  if f.engagement_id<>p_engagement then return jsonb_build_object('status','conflict'); end if;
  if f.deleted then return jsonb_build_object('status','not_found'); end if;
  update private.survey_findings set title=v_title,figure=v_figure,rests_on=p_rests_on where id=p_id;
 else
  if (select count(*) from private.survey_findings where engagement_id=p_engagement and not deleted)>=100 then return jsonb_build_object('status','limit'); end if;
  insert into private.survey_findings(id,engagement_id,title,figure,rests_on) values(p_id,p_engagement,v_title,v_figure,p_rests_on);
  created:=true;
 end if;
 select s.theme_id into t from private.discover_theme_sources s where s.finding_id=p_id and s.engagement_id=p_engagement and not s.deleted;
 if t is null then
  insert into private.discover_themes(engagement_id,source,label,detail,rests_on,out_of,status)
   values(p_engagement,'survey',v_title,v_figure,p_rests_on,total,'accepted') returning id into t;
  insert into private.discover_theme_sources(engagement_id,theme_id,finding_id) values(p_engagement,t,p_id);
 else
  update private.discover_themes set label=case when f.title is distinct from v_title then v_title else label end,detail=v_figure,rests_on=p_rests_on,out_of=total,
   status='accepted',merged_into=null where id=t and engagement_id=p_engagement;
 end if;
 return jsonb_build_object('status','ok','created',created,'id',p_id,'theme_id',t);
end $$;

create function private.discover_finding_delete(p_engagement uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true);
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 perform private.discover_lock(p_engagement);
 update private.survey_findings set deleted=true where id=p_id and engagement_id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','not_found'); end if;
 update private.discover_themes set deleted=true where engagement_id=p_engagement and not deleted
  and id in (select theme_id from private.discover_theme_sources where finding_id=p_id and engagement_id=p_engagement);
 update private.discover_theme_sources set deleted=true where finding_id=p_id and engagement_id=p_engagement and not deleted;
 return jsonb_build_object('status','ok');
end $$;

-- ---------- Conversation notes ----------
-- The text was pasted or read from a file on the server; the file itself is never kept. The person is for the record only.
create function private.discover_note_add(p_engagement uuid,p_id uuid,p_kind text,p_person text,p_title text,p_body text,p_source text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true); v_title text:=btrim(regexp_replace(coalesce(p_title,''),'\s+',' ','g'));
 v_person text:=nullif(btrim(regexp_replace(coalesce(p_person,''),'\s+',' ','g')),''); v_body text:=btrim(coalesce(p_body,''));
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_id is null or p_kind is null or p_kind not in ('interview','input') or p_source is null or p_source not in ('paste','docx','pdf','txt')
  or length(v_title) not between 1 and 200 or length(coalesce(v_person,''))>200 then return jsonb_build_object('status','invalid_request'); end if;
 if length(v_body)=0 then return jsonb_build_object('status','empty'); end if;
 if length(v_body)>60000 then return jsonb_build_object('status','too_long'); end if;
 perform private.discover_lock(p_engagement);
 if exists(select 1 from private.conversation_notes where id=p_id) then
  if exists(select 1 from private.conversation_notes where id=p_id and engagement_id=p_engagement) then return jsonb_build_object('status','duplicate'); end if;
  return jsonb_build_object('status','conflict');
 end if;
 if (select count(*) from private.conversation_notes where engagement_id=p_engagement and not deleted)>=200 then return jsonb_build_object('status','limit'); end if;
 insert into private.conversation_notes(id,engagement_id,kind,person,title,body,source_kind,word_count)
  values(p_id,p_engagement,p_kind,v_person,v_title,v_body,p_source,coalesce(array_length(regexp_split_to_array(v_body,'\s+'),1),0));
 return jsonb_build_object('status','ok','id',p_id,'char_count',length(v_body));
end $$;

create function private.discover_note_update(p_engagement uuid,p_id uuid,p_kind text,p_person text,p_title text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true); v_title text:=btrim(regexp_replace(coalesce(p_title,''),'\s+',' ','g'));
 v_person text:=nullif(btrim(regexp_replace(coalesce(p_person,''),'\s+',' ','g')),'');
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_kind is null or p_kind not in ('interview','input') or length(v_title) not between 1 and 200 or length(coalesce(v_person,''))>200 then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 update private.conversation_notes set kind=p_kind,person=v_person,title=v_title where id=p_id and engagement_id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','not_found'); end if;
 return jsonb_build_object('status','ok');
end $$;

create function private.discover_note_delete(p_engagement uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true);
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 perform private.discover_lock(p_engagement);
 update private.conversation_notes set deleted=true where id=p_id and engagement_id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','not_found'); end if;
 update private.discover_theme_sources set deleted=true where note_id=p_id and engagement_id=p_engagement and not deleted;
 return jsonb_build_object('status','ok');
end $$;

-- A note's text, for the facilitator who reads it on SET-06 (and for the later steps' server code).
create function private.discover_note_read(p_engagement uuid,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,false); n private.conversation_notes;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 select * into n from private.conversation_notes where id=p_id and engagement_id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','not_found'); end if;
 return jsonb_build_object('status','ok','id',n.id,'kind',n.kind,'title',n.title,'person',n.person,'source_kind',n.source_kind,'char_count',n.char_count,'word_count',n.word_count,'body',n.body);
end $$;

-- ---------- Public entry points (invokers; every check is in the private functions) ----------
create function public.discover_state(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.discover_state(p_engagement) $$;
create function public.discover_total_set(p_engagement uuid,p_total integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_total_set(p_engagement,p_total) $$;
create function public.discover_finding_save(p_engagement uuid,p_id uuid,p_title text,p_figure text,p_rests_on integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_finding_save(p_engagement,p_id,p_title,p_figure,p_rests_on) $$;
create function public.discover_finding_delete(p_engagement uuid,p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_finding_delete(p_engagement,p_id) $$;
create function public.discover_note_add(p_engagement uuid,p_id uuid,p_kind text,p_person text,p_title text,p_body text,p_source text) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_note_add(p_engagement,p_id,p_kind,p_person,p_title,p_body,p_source) $$;
create function public.discover_note_update(p_engagement uuid,p_id uuid,p_kind text,p_person text,p_title text) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_note_update(p_engagement,p_id,p_kind,p_person,p_title) $$;
create function public.discover_note_delete(p_engagement uuid,p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_note_delete(p_engagement,p_id) $$;
create function public.discover_note_read(p_engagement uuid,p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.discover_note_read(p_engagement,p_id) $$;

revoke all on function private.discover_guard(uuid,boolean),private.discover_lock(uuid),private.discover_state(uuid),private.discover_total_set(uuid,integer),
 private.discover_finding_save(uuid,uuid,text,text,integer),private.discover_finding_delete(uuid,uuid),
 private.discover_note_add(uuid,uuid,text,text,text,text,text),private.discover_note_update(uuid,uuid,text,text,text),private.discover_note_delete(uuid,uuid),private.discover_note_read(uuid,uuid),
 public.discover_state(uuid),public.discover_total_set(uuid,integer),public.discover_finding_save(uuid,uuid,text,text,integer),public.discover_finding_delete(uuid,uuid),
 public.discover_note_add(uuid,uuid,text,text,text,text,text),public.discover_note_update(uuid,uuid,text,text,text),public.discover_note_delete(uuid,uuid),public.discover_note_read(uuid,uuid)
 from public,anon,authenticated;
grant execute on function private.discover_state(uuid),private.discover_total_set(uuid,integer),
 private.discover_finding_save(uuid,uuid,text,text,integer),private.discover_finding_delete(uuid,uuid),
 private.discover_note_add(uuid,uuid,text,text,text,text,text),private.discover_note_update(uuid,uuid,text,text,text),private.discover_note_delete(uuid,uuid),private.discover_note_read(uuid,uuid),
 public.discover_state(uuid),public.discover_total_set(uuid,integer),public.discover_finding_save(uuid,uuid,text,text,integer),public.discover_finding_delete(uuid,uuid),
 public.discover_note_add(uuid,uuid,text,text,text,text,text),public.discover_note_update(uuid,uuid,text,text,text),public.discover_note_delete(uuid,uuid),public.discover_note_read(uuid,uuid)
 to authenticated;

-- ---------- Shared objects, each a superset of its latest definition ----------
-- Clear test answers: the practice fixes version plus the Discover test rows.
create or replace function private.rehearsal_control(p_engagement uuid,p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; done private.rehearsal_log; since timestamptz; began timestamptz; cleared uuid[]; n_votes integer:=0; n_suggestions integer:=0; n_sessions integer:=0;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or p_action not in ('start','end','clear') then return jsonb_build_object('status','invalid_request'); end if;
 select * into done from private.rehearsal_log where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>p_action then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','answers',done.answers,'votes',done.votes,'suggestions',done.suggestions,'sessions',done.sessions,'version',r.version);
 end if;
 since:=private.rehearsing(p_engagement);
 if p_action='start' then
  if since is not null then return jsonb_build_object('status','unchanged','since',since); end if;
  insert into private.rehearsal_log(id,engagement_id,actor_id,action,created_at) values(p_id,p_engagement,private.clearway_user_id(),'start',clock_timestamp());
  return jsonb_build_object('status','ok','since',private.rehearsing(p_engagement));
 elsif p_action='end' then
  if since is null then return jsonb_build_object('status','unchanged'); end if;
  insert into private.rehearsal_log(id,engagement_id,actor_id,action,created_at) values(p_id,p_engagement,private.clearway_user_id(),'end',clock_timestamp());
  return jsonb_build_object('status','ok');
 end if;
 -- Clear test answers: never while a session is on the TV and phones.
 if r.live_session_id is not null then
  return jsonb_build_object('status','live','title',(select title from public.sessions where id=r.live_session_id));
 end if;
 -- The steps a rehearsal reached since the last clear.
 select min(l.created_at) into began from private.rehearsal_log l where l.engagement_id=p_engagement and l.action='start' and not l.deleted
  and l.created_at>coalesce((select max(c.created_at) from private.rehearsal_log c where c.engagement_id=p_engagement and c.action='clear' and not c.deleted),'-infinity'::timestamptz);
 perform 1 from public.sessions where engagement_id=p_engagement and not deleted order by id for update;
 select coalesce(array_agg(id order by id),array[]::uuid[]) into cleared from public.submissions where engagement_id=p_engagement and test and not deleted;
 update public.submissions set deleted=true where id=any(cleared);
 update private.latency_logs set deleted=true where submission_id=any(cleared) and not deleted;
 update private.qa_questions set deleted=true where submission_id=any(cleared) and not deleted;
 update private.qa_merges set deleted=true where engagement_id=p_engagement and (survivor_id=any(cleared) or member_id=any(cleared)) and not deleted;
 update private.qa_votes set deleted=true where engagement_id=p_engagement and (test or question_id=any(cleared)) and not deleted;
 get diagnostics n_votes=row_count;
 update private.ranking_suggestions set deleted=true where engagement_id=p_engagement and test and not deleted;
 get diagnostics n_suggestions=row_count;
 -- Candidate suggestions a rehearsal made go with it (step 8: the one gap the candidates step listed).
 update private.candidate_suggestions set deleted=true where engagement_id=p_engagement and test and not deleted;
 -- Scribe cards and files a rehearsal made go with it; the app removes the stored bytes (private.rehearsal_scribe_paths, read first).
 update private.scribe_cards set deleted=true where engagement_id=p_engagement and test and not deleted;
 update private.scribe_files set deleted=true where engagement_id=p_engagement and test and not deleted;
 -- Discover records a rehearsal made go with it: survey findings, notes, themes (and what they rest on) and signals.
 update private.signals set deleted=true where engagement_id=p_engagement and test and not deleted;
 update private.discover_theme_sources s set deleted=true where s.engagement_id=p_engagement and not s.deleted and (
   s.theme_id in (select t.id from private.discover_themes t where t.engagement_id=p_engagement and t.test)
   or s.finding_id in (select f.id from private.survey_findings f where f.engagement_id=p_engagement and f.test)
   or s.note_id in (select n.id from private.conversation_notes n where n.engagement_id=p_engagement and n.test));
 update private.discover_themes set deleted=true,merged_into=null where engagement_id=p_engagement and test and not deleted;
 update private.survey_findings set deleted=true where engagement_id=p_engagement and test and not deleted;
 update private.conversation_notes set deleted=true where engagement_id=p_engagement and test and not deleted;
 -- Step 5: nothing AI made from test answers survives into the real session.
 perform private.ai_clear(p_engagement,cleared);
 -- A real answer that a test answer replaced stands again.
 update public.submissions set withdrawn=false,replaced_by=null where engagement_id=p_engagement and replaced_by=any(cleared) and not deleted and not test;
 -- Steps the rehearsal reached go back to Ready, unless real answers live in them.
 if began is not null then
  update public.sessions x set state='ready',closed_at=null
   where x.engagement_id=p_engagement and not x.deleted and x.mode='live' and x.state in ('open','closed') and x.shown_at>=began
    and not exists(select 1 from public.submissions y where y.session_id=x.id and not y.deleted);
  get diagnostics n_sessions=row_count;
 end if;
 insert into private.rehearsal_log(id,engagement_id,actor_id,action,answers,votes,suggestions,sessions,created_at)
  values(p_id,p_engagement,private.clearway_user_id(),'clear',cardinality(cleared),n_votes,n_suggestions,n_sessions,clock_timestamp());
 -- One version for every surface: a spotlit test question clears, counts recompute.
 update public.room_states set spotlight_id=case when spotlight_id=any(cleared) then null else spotlight_id end,results=private.live_results(p_engagement)
  where engagement_id=p_engagement returning * into r;
 return jsonb_build_object('status','ok','answers',cardinality(cleared),'votes',n_votes,'suggestions',n_suggestions,'sessions',n_sessions,'version',r.version);
end $$;

-- The rehearsal count includes every test item Clear test answers removes. A survey theme is made by its finding, so only the other themes add to the count.
create or replace function private.control_status(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.room_states; s public.sessions; at_now timestamptz:=clock_timestamp(); last_clear private.rehearsal_log;
begin
 if not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','missing'); end if;
 select * into s from public.sessions where id=r.live_session_id and not deleted;
 select * into last_clear from private.rehearsal_log where engagement_id=p_engagement and action='clear' and not deleted order by created_at desc,id limit 1;
 return jsonb_build_object('status','ok','server_time',at_now,'version',r.version,'fac_topic',private.fac_topic(p_engagement),
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
    where x.engagement_id=p_engagement and not x.deleted order by x.created_at desc limit 10) recent),'[]'::jsonb),
  'self_paced',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'part',x.part,'interaction',x.interaction,'state',private.session_state(x,at_now),
    'opens_at',x.opens_at,'closes_at',x.closes_at,
    'answered',(select count(distinct y.attendee_id) from public.submissions y where y.session_id=x.id and not y.deleted and not y.withdrawn))
    order by x.opens_at,x.id) from public.sessions x where x.engagement_id=p_engagement and not x.deleted and x.mode='self_paced'),'[]'::jsonb),
  'rehearsal',jsonb_build_object('since',private.rehearsing(p_engagement),
   'test_answers',(select count(*) from public.submissions y where y.engagement_id=p_engagement and y.test and not y.deleted)
     +(select count(*) from private.qa_votes y where y.engagement_id=p_engagement and y.test and not y.deleted)
     +(select count(*) from private.ranking_suggestions y where y.engagement_id=p_engagement and y.test and not y.deleted)
     +(select count(*) from private.candidate_suggestions y where y.engagement_id=p_engagement and y.test and not y.deleted)
     +(select count(*) from private.scribe_cards y where y.engagement_id=p_engagement and y.test and not y.deleted)
     +(select count(*) from private.scribe_files y where y.engagement_id=p_engagement and y.test and not y.deleted)
     +(select count(*) from private.survey_findings y where y.engagement_id=p_engagement and y.test and not y.deleted)
     +(select count(*) from private.conversation_notes y where y.engagement_id=p_engagement and y.test and not y.deleted)
     +(select count(*) from private.discover_themes y where y.engagement_id=p_engagement and y.test and not y.deleted and y.source<>'survey')
     +(select count(*) from private.signals y where y.engagement_id=p_engagement and y.test and not y.deleted),
   'last_clear',case when last_clear.id is not null then jsonb_build_object('at',last_clear.created_at,'answers',last_clear.answers,'sessions',last_clear.sessions,
     'by',(select split_part(btrim(u.name),' ',1) from public.clearway_users u where u.id=last_clear.actor_id)) end));
end $$;

-- The practice reset: the acceptance fixes version plus the Discover tables and the survey total.
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
 delete from private.lens_summary_locks where engagement_id=eng;
 update private.scribe_cards set deleted=true where engagement_id=eng and not deleted;
 update private.scribe_files set deleted=true where engagement_id=eng and not deleted;
 update private.signals set deleted=true where engagement_id=eng and not deleted;
 update private.discover_theme_sources set deleted=true where engagement_id=eng and not deleted;
 update private.discover_themes set deleted=true,merged_into=null where engagement_id=eng and not deleted;
 update private.survey_findings set deleted=true where engagement_id=eng and not deleted;
 update private.conversation_notes set deleted=true where engagement_id=eng and not deleted;
 update private.candidate_suggestions set deleted=true where engagement_id=eng and not deleted;
 update private.candidate_sources set deleted=true where engagement_id=eng and not deleted;
 update private.candidates set deleted=true,outcome_id=null where engagement_id=eng and not deleted;
 update private.candidate_boards set deleted=true,decision_id=null where engagement_id=eng and not deleted;
 update private.lens_summary_responses set deleted=true where engagement_id=eng and not deleted;
 update private.lens_summary_sources set deleted=true where engagement_id=eng and not deleted;
 update private.lens_summary_sentences set deleted=true where engagement_id=eng and not deleted;
 update private.lens_summaries set deleted=true,current_version_id=null,signed_off_version_id=null,decision_id=null where engagement_id=eng and not deleted;
 update private.lens_summary_versions set deleted=true where engagement_id=eng and not deleted;
 update private.lens_sentences set deleted=true where engagement_id=eng and not deleted;
 update private.lens_openings set deleted=true where engagement_id=eng and not deleted;
 update private.overnight_publications set withdrawn_at=coalesce(withdrawn_at,clock_timestamp()) where engagement_id=eng and withdrawn_at is null;
 delete from private.review_presence where engagement_id=eng;
 update private.draft_photo_texts set deleted=true where engagement_id=eng and not deleted;
 update private.draft_notes set deleted=true where engagement_id=eng and not deleted;
 update private.draft_sources set deleted=true where engagement_id=eng and not deleted;
 update private.draft_bullets set deleted=true where engagement_id=eng and not deleted;
 update private.draft_outcomes set deleted=true where engagement_id=eng and not deleted;
 update private.overnight_rounds set deleted=true where engagement_id=eng and not deleted;
 update private.first_steps set deleted=true where engagement_id=eng and not deleted;
 update private.intent_card_people set deleted=true where engagement_id=eng and not deleted;
 update private.intent_cards set deleted=true where engagement_id=eng and not deleted;
 update private.goal_risks set deleted=true where engagement_id=eng and not deleted;
 update private.goals set deleted=true where engagement_id=eng and not deleted;
 update private.risk_mitigations set deleted=true where engagement_id=eng and not deleted;
 update private.risks set deleted=true where engagement_id=eng and not deleted;
 update private.outcome_indicators set deleted=true where engagement_id=eng and not deleted;
 update private.vision_outcomes set deleted=true,decision_id=null where engagement_id=eng and not deleted;
 update private.decisions set deleted=true where engagement_id=eng and not deleted;
 update private.key_metrics set deleted=true where engagement_id=eng and not deleted;
 update private.celebrations set deleted=true where engagement_id=eng and not deleted;
 update private.map_drafts set deleted=true where engagement_id=eng and not deleted;
 update public.sessions set state='ready',closed_at=null where engagement_id=eng and not deleted and state in ('live','phones_down','closed','open');
 select array_agg(distinct auth_session_id) into target_sessions from public.device_sessions where engagement_id=eng;
 update public.device_sessions set revoked_at=coalesce(revoked_at,now()) where engagement_id=eng;
 update private.room_auth_devices set revoked_at=coalesce(revoked_at,now()),granted_at=null,claim_id=null,claim_started_at=null,deleted=true where engagement_id=eng;
 update private.room_auth_challenges set consumed_at=coalesce(consumed_at,now()),deleted=true where engagement_id=eng;
 update public.join_requests set deleted=true where engagement_id=eng;
 update public.attendees set deleted=true where engagement_id=eng;
 -- Preserve device audit rows, while invalidating JWT access and refresh immediately.
 delete from auth.sessions where id=any(coalesce(target_sessions,array[]::uuid[]));
 update public.engagements set status='setup',survey_respondents=null where id=eng;
 update public.room_states set live_session_id=null,tv_content='holding',phones_down=false,burst_ends_at=null,spotlight_id=null,
   hidden_ids=array[]::uuid[],remote_holder_id=null,team_led_block_id=null,show_tv_on_phones=false,
   results='{"total":0,"people":0,"words":[]}' where engagement_id=eng;
 return true;
end $$;

commit;
