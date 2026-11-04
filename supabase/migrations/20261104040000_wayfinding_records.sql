-- Milestone 4, step 1: the Wayfinding records, "Seeded from", Mark a decision, lens names and
-- the Scripture size. Live only, after merge and Chris's approval. No session is started and
-- nothing is seeded here (the Riverside records are in supabase/seed.sql, local only).
--
-- Every record hangs off the engagement and sits in the private schema under forced row-level
-- security. Browsers never write them: each kind writes through its own function (later steps).
-- Who reads what directly:
--   facilitators (and admins)   every record of their engagement, except seeded lens sentences
--                               until the sentence's lens opens (they get only a count)
--   room participants           lens openings, Vision Outcomes and their indicators, the lens
--                               summary versions already put on the TV, and their own responses
--   everyone else               nothing
-- Seeded lens sentences are readable by no role (the author's own phone included) before their
-- lens opens. Trusted server code (service_role) can write them, and the private functions of
-- later steps are the only readers, so a step that reads them must check lens_is_open first.
begin;

-- ---------- Policy helpers ----------
create function private.wf_facilitates(p_engagement uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and (private.is_admin() or private.can_facilitate(p_engagement))
  and exists(select 1 from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_engagement and not e.deleted and not c.deleted)
$$;

-- ---------- Decisions: what the room decided by consensus, and why ----------
-- Counts and votes show where the room is. The facilitator marks the decision, so a count never
-- appears here as the decision itself, only as the numbers on screen when it was marked.
create table private.decisions (
 id uuid primary key,                  -- the press id, so a repeated press does nothing
 engagement_id uuid not null references public.engagements(id),
 session_id uuid,
 subject text not null default 'step' check(subject in ('step','lens_summary','outcome','candidate','cut_line','goal','intent','other')),
 subject_id uuid,
 subject_label text not null default '' check(length(subject_label)<=200),
 decision text not null check(length(btrim(decision)) between 1 and 400),
 reasons text not null default '' check(length(reasons)<=1000),
 counts jsonb not null default '{}' check(jsonb_typeof(counts)='object' and pg_column_size(counts)<=2048),
 marked_by uuid references public.clearway_users(id),
 marked_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id),
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create index decisions_room_idx on private.decisions(engagement_id,marked_at desc);
create index decisions_session_idx on private.decisions(session_id,engagement_id);
create index decisions_subject_idx on private.decisions(subject,subject_id) where subject_id is not null;
create index decisions_marked_by_idx on private.decisions(marked_by);

-- ---------- Lens sentences ----------
create table private.lens_openings (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 lens smallint not null check(lens between 1 and 5),    -- the lens's place in the engagement's lens names
 session_id uuid,
 opened_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create unique index lens_openings_unique on private.lens_openings(engagement_id,lens) where not deleted;
create index lens_openings_session_idx on private.lens_openings(session_id,engagement_id);

create function private.lens_is_open(p_engagement uuid,p_lens smallint) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.lens_openings o where o.engagement_id=p_engagement and o.lens=p_lens and not o.deleted)
$$;

create table private.lens_sentences (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 lens smallint not null check(lens between 1 and 5),
 source text not null check(source in ('seeded','live')),
 text text not null check(length(btrim(text)) between 1 and 400),
 session_id uuid,
 submission_id uuid references public.submissions(id),
 attendee_id uuid,
 withdrawn boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id),
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id),
 foreign key(attendee_id,engagement_id) references public.attendees(id,engagement_id)
);
create index lens_sentences_lens_idx on private.lens_sentences(engagement_id,lens,source) where not deleted and not withdrawn;
create index lens_sentences_session_idx on private.lens_sentences(session_id,engagement_id);
create index lens_sentences_attendee_idx on private.lens_sentences(attendee_id,engagement_id);
create unique index lens_sentences_submission_unique on private.lens_sentences(submission_id) where submission_id is not null;

-- A sentence never moves to another lens, room or source, so a seeded sentence cannot be
-- relabeled live to slip past the rule above.
create function private.wf_sentence_identity() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.engagement_id is distinct from old.engagement_id or new.lens is distinct from old.lens or new.source is distinct from old.source then
  raise exception 'A lens sentence keeps its room, lens and source.' using errcode='23514';
 end if;
 return new;
end $$;
create trigger wf_sentence_identity before update on private.lens_sentences for each row execute function private.wf_sentence_identity();

-- ---------- Vision Outcomes ----------
create table private.vision_outcomes (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 title text not null check(length(btrim(title)) between 1 and 200),
 description text not null default '' check(length(description)<=200),   -- one line, drafted by the facilitator
 status text not null default 'provisional' check(status in ('provisional','confirmed')),
 what_we_stop text not null default '' check(length(what_we_stop)<=400),
 position integer not null default 0 check(position>=0),
 decision_id uuid references private.decisions(id),
 confirmed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id),
 check((status='confirmed')=(confirmed_at is not null))
);
create index vision_outcomes_room_idx on private.vision_outcomes(engagement_id,position) where not deleted;
create index vision_outcomes_decision_idx on private.vision_outcomes(decision_id);

-- The outcome's success indicators: the 3-year Vision bullets.
create table private.outcome_indicators (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 outcome_id uuid not null,
 text text not null check(length(btrim(text)) between 1 and 280),
 position integer not null default 0 check(position>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(outcome_id,engagement_id) references private.vision_outcomes(id,engagement_id)
);
create index outcome_indicators_outcome_idx on private.outcome_indicators(outcome_id,engagement_id,position) where not deleted;

-- ---------- Risks and mitigations ----------
create table private.risks (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 text text not null check(length(btrim(text)) between 1 and 200),
 likelihood numeric(4,3) check(likelihood between 0 and 1),
 impact numeric(4,3) check(impact between 0 and 1),
 merged_into uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id),
 foreign key(merged_into,engagement_id) references private.risks(id,engagement_id),
 check(merged_into is null or merged_into<>id)
);
create index risks_room_idx on private.risks(engagement_id) where not deleted;
create index risks_merged_idx on private.risks(merged_into,engagement_id);

create table private.risk_mitigations (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 risk_id uuid not null,
 text text not null check(length(btrim(text)) between 1 and 300),
 recorded_by text not null default 'facilitator' check(recorded_by in ('facilitator','scribe')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(risk_id,engagement_id) references private.risks(id,engagement_id)
);
create index risk_mitigations_risk_idx on private.risk_mitigations(risk_id,engagement_id) where not deleted;

-- ---------- Goals (the 1-year Outlook) ----------
create table private.goals (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 outcome_id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 200),
 result text not null default '' check(length(result)<=400),
 result_clear boolean not null default false,        -- the facilitator confirms the result is clear
 owner_attendee_id uuid,
 owner_name text,
 owner_email text,
 end_date date,
 season text check(season in ('SEP_DEC','JAN_APR','MAY_AUG')),
 position integer not null default 0 check(position>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id),
 foreign key(outcome_id,engagement_id) references private.vision_outcomes(id,engagement_id),
 foreign key(owner_attendee_id,engagement_id) references public.attendees(id,engagement_id),
 -- One person: an attendee, or a name and email, never both and never a team.
 check((owner_attendee_id is null and owner_name is null and owner_email is null)
  or (owner_attendee_id is not null and owner_name is null and owner_email is null)
  or (owner_attendee_id is null and owner_name is not null and owner_email is not null)),
 check(owner_name is null or length(btrim(owner_name)) between 1 and 200),
 check(owner_email is null or (owner_email=lower(btrim(owner_email)) and owner_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'))
);
create index goals_outcome_idx on private.goals(outcome_id,engagement_id,position) where not deleted;
create index goals_owner_idx on private.goals(owner_attendee_id,engagement_id);

create table private.goal_risks (
 goal_id uuid not null,
 risk_id uuid not null,
 engagement_id uuid not null references public.engagements(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 primary key(goal_id,risk_id),
 foreign key(goal_id,engagement_id) references private.goals(id,engagement_id),
 foreign key(risk_id,engagement_id) references private.risks(id,engagement_id)
);
create index goal_risks_risk_idx on private.goal_risks(risk_id,engagement_id);
create index goal_risks_room_idx on private.goal_risks(engagement_id);

-- ---------- Commander's intent cards and first steps ----------
create table private.intent_cards (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 outcome_id uuid not null,
 intent text not null default '' check(length(intent)<=400),
 must_do text not null default '' check(length(must_do)<=400),
 what_we_stop text not null default '' check(length(what_we_stop)<=400),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id),
 foreign key(outcome_id,engagement_id) references private.vision_outcomes(id,engagement_id)
);
create unique index intent_cards_outcome_unique on private.intent_cards(outcome_id) where not deleted;
create index intent_cards_room_idx on private.intent_cards(engagement_id);

create table private.intent_card_people (
 card_id uuid not null,
 attendee_id uuid not null,
 engagement_id uuid not null references public.engagements(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 primary key(card_id,attendee_id),
 foreign key(card_id,engagement_id) references private.intent_cards(id,engagement_id),
 foreign key(attendee_id,engagement_id) references public.attendees(id,engagement_id)
);
create index intent_card_people_attendee_idx on private.intent_card_people(attendee_id,engagement_id);
create index intent_card_people_room_idx on private.intent_card_people(engagement_id);

create table private.first_steps (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 card_id uuid not null,
 text text not null check(length(btrim(text)) between 1 and 280),
 owner_attendee_id uuid,
 owner_name text,
 owner_email text,
 due_date date,
 position integer not null default 0 check(position>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id),
 foreign key(card_id,engagement_id) references private.intent_cards(id,engagement_id),
 foreign key(owner_attendee_id,engagement_id) references public.attendees(id,engagement_id),
 check((owner_attendee_id is null and owner_name is null and owner_email is null)
  or (owner_attendee_id is not null and owner_name is null and owner_email is null)
  or (owner_attendee_id is null and owner_name is not null and owner_email is not null)),
 check(owner_name is null or length(btrim(owner_name)) between 1 and 200),
 check(owner_email is null or (owner_email=lower(btrim(owner_email)) and owner_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'))
);
create index first_steps_card_idx on private.first_steps(card_id,engagement_id,position) where not deleted;
create index first_steps_owner_idx on private.first_steps(owner_attendee_id,engagement_id);

-- ---------- Key metrics, celebrations and the Map draft ----------
create table private.key_metrics (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 text text not null check(length(btrim(text)) between 1 and 120),
 rank integer check(rank>=1),                           -- the place the team ranked it, when ranked
 session_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create index key_metrics_room_idx on private.key_metrics(engagement_id,rank) where not deleted;
create index key_metrics_session_idx on private.key_metrics(session_id,engagement_id);

create table private.celebrations (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 text text not null check(length(btrim(text)) between 1 and 280),
 theme text not null default '' check(length(theme)<=60),
 session_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create index celebrations_room_idx on private.celebrations(engagement_id) where not deleted;
create index celebrations_session_idx on private.celebrations(session_id,engagement_id);

-- The assembled two pages. One draft per engagement, rebuilt as the records change.
create table private.map_drafts (
 engagement_id uuid primary key references public.engagements(id),
 pages jsonb not null default '{}' check(jsonb_typeof(pages)='object' and pg_column_size(pages)<=262144),
 version integer not null default 1 check(version>=1),
 assembled_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false
);

-- ---------- Lens summaries: one per lens per engagement ----------
-- AI drafts a one-screen 10-year Future summary of a lens in the present tense, straight to the
-- TV. Phones approve or suggest a change, AI folds suggestions into a new version, and the
-- facilitator marks the room's decision. Every version is kept.
create table private.lens_summaries (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 lens smallint not null check(lens between 1 and 5),
 state text not null default 'empty' check(state in ('empty','drafting','on_screen','signed_off')),
 current_version_id uuid,
 signed_off_version_id uuid,
 decision_id uuid references private.decisions(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id)
);
create unique index lens_summaries_unique on private.lens_summaries(engagement_id,lens) where not deleted;
create index lens_summaries_decision_idx on private.lens_summaries(decision_id);

create table private.lens_summary_versions (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 summary_id uuid not null,
 version integer not null check(version>=1),
 author text not null check(author in ('ai','facilitator')),
 ai_run_id uuid references private.ai_runs(id),
 note text not null default '' check(length(note)<=300),
 changes jsonb not null default '[]' check(jsonb_typeof(changes)='array' and pg_column_size(changes)<=65536),  -- tracked changes against the version before
 shown_at timestamptz,                                  -- when it went to the TV
 undone_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id),
 foreign key(summary_id,engagement_id) references private.lens_summaries(id,engagement_id)
);
create unique index lens_summary_versions_unique on private.lens_summary_versions(summary_id,version) where not deleted;
create index lens_summary_versions_run_idx on private.lens_summary_versions(ai_run_id);
alter table private.lens_summaries
 add foreign key(current_version_id,engagement_id) references private.lens_summary_versions(id,engagement_id),
 add foreign key(signed_off_version_id,engagement_id) references private.lens_summary_versions(id,engagement_id);
create index lens_summaries_current_idx on private.lens_summaries(current_version_id,engagement_id);
create index lens_summaries_signed_idx on private.lens_summaries(signed_off_version_id,engagement_id);

create table private.lens_summary_sentences (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 version_id uuid not null,
 position integer not null check(position>=0),
 text text not null check(length(btrim(text)) between 1 and 400),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id),
 foreign key(version_id,engagement_id) references private.lens_summary_versions(id,engagement_id)
);
create unique index lens_summary_sentences_unique on private.lens_summary_sentences(version_id,position) where not deleted;

-- Each summary sentence links to the lens sentences it came from.
create table private.lens_summary_sources (
 summary_sentence_id uuid not null,
 lens_sentence_id uuid not null,
 engagement_id uuid not null references public.engagements(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 primary key(summary_sentence_id,lens_sentence_id),
 foreign key(summary_sentence_id,engagement_id) references private.lens_summary_sentences(id,engagement_id),
 foreign key(lens_sentence_id,engagement_id) references private.lens_sentences(id,engagement_id)
);
create index lens_summary_sources_sentence_idx on private.lens_summary_sources(lens_sentence_id,engagement_id);
create index lens_summary_sources_room_idx on private.lens_summary_sources(engagement_id);

-- A person's answer to one version: Approve, or Suggest a change. A later answer replaces it.
create table private.lens_summary_responses (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 version_id uuid not null,
 attendee_id uuid not null,
 response text not null check(response in ('approve','suggest')),
 suggestion text not null default '' check(length(suggestion)<=280),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(version_id,engagement_id) references private.lens_summary_versions(id,engagement_id),
 foreign key(attendee_id,engagement_id) references public.attendees(id,engagement_id),
 check((response='approve' and suggestion='') or (response='suggest' and length(btrim(suggestion))>0))
);
create unique index lens_summary_responses_unique on private.lens_summary_responses(version_id,attendee_id) where not deleted;
create index lens_summary_responses_attendee_idx on private.lens_summary_responses(attendee_id,engagement_id);
create index lens_summary_responses_room_idx on private.lens_summary_responses(engagement_id);

create function private.wf_version_shown(p_version uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.lens_summary_versions v where v.id=p_version and v.shown_at is not null and not v.deleted)
$$;

-- An added owner's email is stored the way the roster stores one.
create function private.wf_owner_email() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 new.owner_email:=lower(btrim(new.owner_email));
 return new;
end $$;
create trigger wf_owner_email before insert or update of owner_email on private.goals for each row execute function private.wf_owner_email();
create trigger wf_owner_email before insert or update of owner_email on private.first_steps for each row execute function private.wf_owner_email();

-- ---------- The checks that follow a rule, in code ----------
-- Seasons, never quarters: Sep to Dec, Jan to Apr, May to Aug.
create function private.season_of(p_day date) returns text
language sql immutable security invoker set search_path='' as $$
 select case when p_day is null then null when extract(month from p_day) >= 9 then 'SEP_DEC' when extract(month from p_day) <= 4 then 'JAN_APR' else 'MAY_AUG' end
$$;
create function private.season_end(p_day date) returns date
language sql immutable security invoker set search_path='' as $$
 select case private.season_of(p_day) when 'SEP_DEC' then make_date(extract(year from p_day)::integer,12,31)
  when 'JAN_APR' then make_date(extract(year from p_day)::integer,4,30) when 'MAY_AUG' then make_date(extract(year from p_day)::integer,8,31) end
$$;
-- A goal always carries the season its end date falls in.
create function private.wf_goal_season() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 new.season:=private.season_of(new.end_date);
 return new;
end $$;
create trigger wf_goal_season before insert or update of end_date on private.goals for each row execute function private.wf_goal_season();

-- The four CORE letters. Connected: linked to a live Vision Outcome. Owned: exactly one person.
-- Result: written, and the facilitator confirms it is clear. End date: set.
create function private.goal_core(p_goal uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('connected',x.c,'owned',x.o,'result',x.r,'end_date',x.d,'met',x.c and x.o and x.r and x.d,
  'missing',to_jsonb(array_remove(array[case when not x.c then 'connected' end,case when not x.o then 'owned' end,case when not x.r then 'result' end,case when not x.d then 'end_date' end],null)))
 from (select v.id is not null as c,
   (g.owner_attendee_id is not null and exists(select 1 from public.attendees a where a.id=g.owner_attendee_id and not a.deleted)) or (g.owner_name is not null and g.owner_email is not null) as o,
   length(btrim(g.result))>0 and g.result_clear as r,g.end_date is not null as d
  from private.goals g left join private.vision_outcomes v on v.id=g.outcome_id and v.engagement_id=g.engagement_id and not v.deleted
  where g.id=p_goal and not g.deleted) x
$$;
-- A first step needs one owner and a date.
create function private.first_step_flags(p_step uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('owner',x.o,'date',x.d,'flagged',not (x.o and x.d),
  'missing',to_jsonb(array_remove(array[case when not x.o then 'owner' end,case when not x.d then 'date' end],null)))
 from (select (s.owner_attendee_id is not null and exists(select 1 from public.attendees a where a.id=s.owner_attendee_id and not a.deleted)) or (s.owner_name is not null and s.owner_email is not null) as o,
   s.due_date is not null as d from private.first_steps s where s.id=p_step and not s.deleted) x
$$;
-- An outcome with no indicator stays outlined until it has one.
create function private.outcome_is_empty(p_outcome uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.outcome_indicators i where i.outcome_id=p_outcome and not i.deleted and length(btrim(i.text))>0)
$$;
-- Four to six confirmed outcomes. The app warns, and never blocks.
create function private.outcome_range(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('confirmed',n,'note',case when n<4 then 'fewer' when n>6 then 'more' end)
 from (select count(*)::integer as n from private.vision_outcomes o where o.engagement_id=p_engagement and o.status='confirmed' and not o.deleted) x
$$;

-- ---------- Opening a lens, and the count the facilitator gets before it ----------
-- Opening is final for the session: the lens's seeded sentences become readable and arrive first.
create function private.lens_open(p_engagement uuid,p_lens integer,p_session uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare opened boolean:=false;
begin
 if not coalesce(private.wf_facilitates(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_lens is null or p_lens not between 1 and 5 then return jsonb_build_object('status','invalid_request'); end if;
 if p_session is not null and not exists(select 1 from public.sessions where id=p_session and engagement_id=p_engagement and not deleted) then return jsonb_build_object('status','missing'); end if;
 if not private.lens_is_open(p_engagement,p_lens::smallint) then
  insert into private.lens_openings(engagement_id,lens,session_id) values(p_engagement,p_lens::smallint,p_session);
  opened:=true;
 end if;
 return jsonb_build_object('status','ok','lens',p_lens,'opened',opened);
end $$;

-- How many sentences each lens has been seeded with, and by how many people. Numbers only.
create function private.lens_seed_counts(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(private.wf_facilitates(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 return jsonb_build_object('status','ok','lenses',(select jsonb_agg(jsonb_build_object('lens',g.lens,'seeded',coalesce(c.sentences,0),'people',coalesce(c.people,0),
   'open',private.lens_is_open(p_engagement,g.lens::smallint)) order by g.lens)
  from generate_series(1,5) g(lens) left join lateral (select count(*)::integer as sentences,count(distinct s.attendee_id)::integer as people from private.lens_sentences s
   where s.engagement_id=p_engagement and s.lens=g.lens and s.source='seeded' and not s.deleted and not s.withdrawn) c on true));
end $$;

-- ---------- Mark a decision (control surface and remote) ----------
-- Records what the room decided by consensus and why, as one press by a client-made id. Later
-- steps reuse it for an outcome, a lens summary, a goal or an intent card by naming the subject.
create function private.decision_mark(p_engagement uuid,p_id uuid,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; sid uuid; subj text; subj_id uuid; label text; what text; why text; counts jsonb:='{}'::jsonb; ok boolean:=true;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 if exists(select 1 from private.room_controls where id=p_id) then
  if exists(select 1 from private.decisions where id=p_id and engagement_id=p_engagement) then return jsonb_build_object('status','duplicate','id',p_id,'version',r.version); end if;
  return jsonb_build_object('status','conflict');
 end if;
 what:=btrim(regexp_replace(coalesce(p->>'decision',''),'\s+',' ','g'));
 why:=btrim(coalesce(p->>'reasons',''));
 label:=btrim(coalesce(p->>'label',''));
 subj:=coalesce(nullif(p->>'subject',''),'step');
 if length(what) not between 1 and 400 or length(why)>1000 or length(label)>200
  or subj not in ('step','lens_summary','outcome','candidate','cut_line','goal','intent','other')
  or (p ? 'subject_id' and p->>'subject_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  or (p ? 'session' and p->>'session' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return jsonb_build_object('status','invalid_request'); end if;
 sid:=coalesce((p->>'session')::uuid,r.live_session_id);
 subj_id:=case when p ? 'subject_id' then (p->>'subject_id')::uuid when subj='step' then sid end;
 if sid is not null and not exists(select 1 from public.sessions where id=sid and engagement_id=p_engagement and not deleted) then return jsonb_build_object('status','missing'); end if;
 if subj_id is not null then
  ok:=case subj
   when 'step' then exists(select 1 from public.sessions where id=subj_id and engagement_id=p_engagement and not deleted)
   when 'lens_summary' then exists(select 1 from private.lens_summaries where id=subj_id and engagement_id=p_engagement and not deleted)
   when 'outcome' then exists(select 1 from private.vision_outcomes where id=subj_id and engagement_id=p_engagement and not deleted)
   when 'goal' then exists(select 1 from private.goals where id=subj_id and engagement_id=p_engagement and not deleted)
   when 'intent' then exists(select 1 from private.intent_cards where id=subj_id and engagement_id=p_engagement and not deleted)
   else true end;
  if not ok then return jsonb_build_object('status','missing'); end if;
 end if;
 -- The numbers on screen when it was marked, kept as a record and never as the decision.
 if r.live_session_id is not null then counts:=jsonb_build_object('total',coalesce((r.results->>'total')::integer,0),'people',coalesce((r.results->>'people')::integer,0)); end if;
 insert into private.decisions(id,engagement_id,session_id,subject,subject_id,subject_label,decision,reasons,counts,marked_by)
  values(p_id,p_engagement,sid,subj,subj_id,label,what,why,counts,private.clearway_user_id());
 if subj='lens_summary' and subj_id is not null then update private.lens_summaries set decision_id=p_id where id=subj_id; end if;
 if subj='outcome' and subj_id is not null then update private.vision_outcomes set decision_id=p_id where id=subj_id; end if;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at)
  values(p_id,p_engagement,private.clearway_user_id(),'mark_decision',sid,r.version,clock_timestamp());
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action','mark_decision',
  'by',(select split_part(btrim(u.name),' ',1) from public.clearway_users u where u.id=private.clearway_user_id()),'version',r.version,'changed',false));
 return jsonb_build_object('status','ok','id',p_id,'version',r.version);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

-- The facilitator's list of decisions already marked, newest first, and the step on the TV.
create function private.decisions_for(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.room_states;
begin
 if not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 return jsonb_build_object('status','ok',
  'session',(select jsonb_build_object('id',s.id,'title',s.title) from public.sessions s where s.id=r.live_session_id and not s.deleted),
  'decisions',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'session_id',d.session_id,'session_title',s.title,'subject',d.subject,'subject_id',d.subject_id,'label',d.subject_label,
    'decision',d.decision,'reasons',d.reasons,'counts',d.counts,'by',split_part(btrim(u.name),' ',1),'marked_at',d.marked_at) order by d.marked_at desc,d.id)
   from (select * from private.decisions x where x.engagement_id=p_engagement and not x.deleted order by x.marked_at desc,x.id limit 30) d
   left join public.sessions s on s.id=d.session_id left join public.clearway_users u on u.id=d.marked_by),'[]'::jsonb));
end $$;

-- ---------- "Seeded from" on the run of show ----------
-- A step that starts from what an earlier step collected: the Day 1 lens from the pre-call
-- seeding, the Day 1 celebration from the pre-call wall. Same kind, same engagement.
alter table public.sessions add column seeded_from uuid;
alter table public.sessions add constraint sessions_seeded_from_fk foreign key(seeded_from,engagement_id) references public.sessions(id,engagement_id);
alter table public.sessions add constraint sessions_seeded_from_self check(seeded_from is null or seeded_from<>id);
create index sessions_seeded_from_idx on public.sessions(seeded_from,engagement_id) where seeded_from is not null;
-- Removing a step frees the steps seeded from it.
create function private.wf_seed_cleanup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.deleted and not old.deleted then update public.sessions set seeded_from=null where seeded_from=new.id and engagement_id=new.engagement_id; end if;
 return new;
end $$;
create trigger wf_seed_cleanup after update of deleted on public.sessions for each row execute function private.wf_seed_cleanup();

create function private.show_seed_from(p_engagement uuid,p_session uuid,p_from uuid,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; f public.sessions;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 perform 1 from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','missing'); end if;
 if p_revision is not null and p_revision<>s.revision then return jsonb_build_object('status','conflict'); end if;
 if p_from is not null then
  select * into f from public.sessions where id=p_from and engagement_id=p_engagement and not deleted;
  if not found then return jsonb_build_object('status','missing'); end if;
  if f.id=s.id or f.interaction<>s.interaction or f.seeded_from=s.id then return jsonb_build_object('status','invalid_request'); end if;
 end if;
 if s.seeded_from is distinct from p_from then update public.sessions set seeded_from=p_from where id=s.id returning * into s; end if;
 return jsonb_build_object('status','ok','id',s.id,'revision',s.revision,'seeded_from',s.seeded_from);
end $$;

-- A save carries "Seeded from" in the same call, so a bad choice undoes the whole save.
create or replace function public.show_write(p_engagement uuid,p_action text,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare out jsonb; seeded jsonb;
begin
 out:=private.show_write(p_engagement,p_action,p_input);
 if p_action='save' and out->>'status'='ok' and jsonb_typeof(p_input)='object' and p_input ? 'seeded_from' then
  seeded:=private.show_seed_from(p_engagement,(out->>'id')::uuid,case when jsonb_typeof(p_input->'seeded_from')='string' and p_input->>'seeded_from'<>'' then (p_input->>'seeded_from')::uuid end,null);
  if seeded->>'status'<>'ok' then raise exception 'Seeded from is not valid' using errcode='P0004'; end if;
 end if;
 return out;
exception when sqlstate 'P0004' or invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

-- The run of show reads "Seeded from" (when its step still exists) and the lens names.
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
     s.prompt,s.phone_depth,s.segment,s.shown_at,s.closed_at,s.settings,s.options,s.lands_in,s.state,s.max_sends,s.max_characters,s.max_words,s.revision,coalesce(n.notes,'') as notes,
     (select f.id from public.sessions f where f.id=s.seeded_from and f.engagement_id=s.engagement_id and not f.deleted) as seeded_from
   from public.sessions s left join private.session_notes n on n.session_id=s.id and not n.deleted
   where s.engagement_id=p_engagement and not s.deleted and (p_after is null or s.id>p_after) order by s.id limit 501
 ) rows;
 if jsonb_array_length(page)>500 then next_id:=(page->499->>'id')::uuid; page:=page-500; end if;
 return jsonb_build_object('status','ok','version',version,'sessions',page,'next',next_id,'context',(
  select jsonb_build_object('id',e.id,'title',e.title,'church',c.name,'timezone',c.timezone,'base_year',e.base_year,'closed',e.status='closed',
   'lens_names',to_jsonb(e.lens_names),
   'scripture_translation',coalesce(e.settings->>'scripture_translation',''),
   'kinds',(select coalesce(jsonb_agg(private.kind_public(k.kind)||jsonb_build_object('named',k.named) order by k.position),'[]'::jsonb) from private.interaction_kinds k where not k.deleted))
  from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_engagement));
end $$;

-- ---------- Lens names on the TV and phones ----------
create or replace function private.tv_room_info(p_engagement uuid) returns jsonb
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
  'reduced_motion',coalesce((e.settings->>'reduced_motion')::boolean,false),'lens_names',to_jsonb(e.lens_names)),
  'presence',jsonb_build_object('count',(select count(*) from present),'names',coalesce((select jsonb_agg(jsonb_build_object('key',md5(p.id::text||e.id::text),'name',p.name) order by p.arrived,p.id) from (select * from present order by arrived,id limit 14)p),'[]'::jsonb)))
 from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_engagement and not e.deleted and not c.deleted
$$;
create or replace function private.tv_appearance_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.settings,new.title,new.lens_names) is distinct from (old.settings,old.title,old.lens_names) and not new.deleted and new.status<>'closed' then
  update public.room_states set results=private.live_results(new.id) where engagement_id=new.id and not deleted;
 end if;return new;
end $$;
drop trigger tv_appearance_changed on public.engagements;
create trigger tv_appearance_changed after update of settings,title,lens_names on public.engagements for each row execute function private.tv_appearance_changed();

-- ---------- Scripture at body size (PRE-06 sits beside the join link) ----------
create or replace function private.options_content(p jsonb,p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare screen text:=coalesce(p->>'screen','headline'); media uuid; size text:=coalesce(p->>'size','');
begin
 if jsonb_typeof(p) is distinct from 'object' or screen not in ('headline','scripture','prayer','image','holding','screen_check') then return null; end if;
 if (select count(*) from jsonb_object_keys(p) k where k not in ('screen','number','source','reference','translation','media','outline','line','size'))>0 then return null; end if;
 if length(coalesce(p->>'number',''))>12 or length(coalesce(p->>'source',''))>200 or length(coalesce(p->>'reference',''))>100
  or length(coalesce(p->>'translation',''))>100 or length(coalesce(p->>'line',''))>200 or length(coalesce(p->>'outline',''))>1000 then return null; end if;
 if (select bool_or(jsonb_typeof(v) not in ('string','null')) from jsonb_each(p-'media') t(k,v)) then return null; end if;
 if size not in ('','headline','body') or (size<>'' and screen<>'scripture') then return null; end if;
 if p->>'media' is not null then
  if p->>'media' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  select id into media from private.session_media where id=(p->>'media')::uuid and engagement_id=p_engagement and not deleted;
  if media is null then return null; end if;
 end if;
 return jsonb_strip_nulls(jsonb_build_object('screen',screen,
  'number',nullif(btrim(coalesce(p->>'number','')),''),'source',nullif(btrim(coalesce(p->>'source','')),''),
  'reference',nullif(btrim(coalesce(p->>'reference','')),''),'translation',nullif(btrim(coalesce(p->>'translation','')),''),
  'line',nullif(btrim(coalesce(p->>'line','')),''),'media',media,'outline',nullif(btrim(coalesce(p->>'outline','')),''),
  'size',case when size='body' then 'body' end));
end $$;

-- ---------- Practice reset also clears the Wayfinding records ----------
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
 update private.lens_summary_responses set deleted=true where engagement_id=eng and not deleted;
 update private.lens_summary_sources set deleted=true where engagement_id=eng and not deleted;
 update private.lens_summary_sentences set deleted=true where engagement_id=eng and not deleted;
 update private.lens_summaries set deleted=true,current_version_id=null,signed_off_version_id=null,decision_id=null where engagement_id=eng and not deleted;
 update private.lens_summary_versions set deleted=true where engagement_id=eng and not deleted;
 update private.lens_sentences set deleted=true where engagement_id=eng and not deleted;
 update private.lens_openings set deleted=true where engagement_id=eng and not deleted;
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
 update public.engagements set status='setup' where id=eng;
 update public.room_states set live_session_id=null,tv_content='holding',phones_down=false,burst_ends_at=null,spotlight_id=null,
   hidden_ids=array[]::uuid[],remote_holder_id=null,team_led_block_id=null,show_tv_on_phones=false,
   results='{"total":0,"people":0,"words":[]}' where engagement_id=eng;
 return true;
end $$;

-- ---------- Public wrappers ----------
create function public.lens_open(p_engagement uuid,p_lens integer,p_session uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.lens_open(p_engagement,p_lens,p_session) $$;
create function public.lens_seed_counts(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.lens_seed_counts(p_engagement) $$;
create function public.decision_mark(p_engagement uuid,p_id uuid,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.decision_mark(p_engagement,p_id,p) $$;
create function public.decisions_for(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.decisions_for(p_engagement) $$;
create function public.show_seed_from(p_engagement uuid,p_session uuid,p_from uuid,p_revision integer default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.show_seed_from(p_engagement,p_session,p_from,p_revision) $$;

revoke all on function private.wf_facilitates(uuid),private.lens_is_open(uuid,smallint),private.wf_version_shown(uuid),private.wf_sentence_identity(),private.wf_owner_email(),private.wf_goal_season(),
 private.season_of(date),private.season_end(date),private.goal_core(uuid),private.first_step_flags(uuid),private.outcome_is_empty(uuid),private.outcome_range(uuid),
 private.lens_open(uuid,integer,uuid),private.lens_seed_counts(uuid),private.decision_mark(uuid,uuid,jsonb),private.decisions_for(uuid),
 private.wf_seed_cleanup(),private.show_seed_from(uuid,uuid,uuid,integer),
 public.lens_open(uuid,integer,uuid),public.lens_seed_counts(uuid),public.decision_mark(uuid,uuid,jsonb),public.decisions_for(uuid),public.show_seed_from(uuid,uuid,uuid,integer)
 from public,anon,authenticated;
-- Policies call the first three. The wrappers call the private functions as the signed-in caller.
grant execute on function private.wf_facilitates(uuid),private.lens_is_open(uuid,smallint),private.wf_version_shown(uuid),
 private.lens_open(uuid,integer,uuid),private.lens_seed_counts(uuid),private.decision_mark(uuid,uuid,jsonb),private.decisions_for(uuid),private.show_seed_from(uuid,uuid,uuid,integer),
 public.lens_open(uuid,integer,uuid),public.lens_seed_counts(uuid),public.decision_mark(uuid,uuid,jsonb),public.decisions_for(uuid),public.show_seed_from(uuid,uuid,uuid,integer)
 to authenticated;

-- ---------- Row-level security, one table at a time ----------
-- Browsers read through these policies and never write: each kind writes through its own function.

alter table private.decisions enable row level security;
alter table private.decisions force row level security;
revoke all on private.decisions from public,anon,authenticated;
grant select on private.decisions to authenticated;
grant select,insert,update,delete on private.decisions to service_role;
create trigger touch_record before update on private.decisions for each row execute function private.touch_live_record('id');
create policy decisions_facilitator on private.decisions for select to authenticated using (not deleted and (select private.wf_facilitates(engagement_id)));

alter table private.lens_openings enable row level security;
alter table private.lens_openings force row level security;
revoke all on private.lens_openings from public,anon,authenticated;
grant select on private.lens_openings to authenticated;
grant select,insert,update,delete on private.lens_openings to service_role;
create trigger touch_record before update on private.lens_openings for each row execute function private.touch_live_record('id');
create policy lens_openings_room on private.lens_openings for select to authenticated using (not deleted and (select private.live_role(engagement_id)) is not null);

alter table private.lens_sentences enable row level security;
alter table private.lens_sentences force row level security;
revoke all on private.lens_sentences from public,anon,authenticated;
grant select on private.lens_sentences to authenticated;
grant select,insert,update,delete on private.lens_sentences to service_role;
create trigger touch_record before update on private.lens_sentences for each row execute function private.touch_live_record('id');
create policy lens_sentences_facilitator on private.lens_sentences for select to authenticated using (not deleted and not withdrawn and (select private.wf_facilitates(engagement_id)) and (source='live' or private.lens_is_open(engagement_id,lens)));

alter table private.vision_outcomes enable row level security;
alter table private.vision_outcomes force row level security;
revoke all on private.vision_outcomes from public,anon,authenticated;
grant select on private.vision_outcomes to authenticated;
grant select,insert,update,delete on private.vision_outcomes to service_role;
create trigger touch_record before update on private.vision_outcomes for each row execute function private.touch_live_record('id');
create policy vision_outcomes_read on private.vision_outcomes for select to authenticated using (not deleted and ((select private.wf_facilitates(engagement_id)) or (select private.live_role(engagement_id))='participant'));

alter table private.outcome_indicators enable row level security;
alter table private.outcome_indicators force row level security;
revoke all on private.outcome_indicators from public,anon,authenticated;
grant select on private.outcome_indicators to authenticated;
grant select,insert,update,delete on private.outcome_indicators to service_role;
create trigger touch_record before update on private.outcome_indicators for each row execute function private.touch_live_record('id');
create policy outcome_indicators_read on private.outcome_indicators for select to authenticated using (not deleted and ((select private.wf_facilitates(engagement_id)) or (select private.live_role(engagement_id))='participant'));

alter table private.risks enable row level security;
alter table private.risks force row level security;
revoke all on private.risks from public,anon,authenticated;
grant select on private.risks to authenticated;
grant select,insert,update,delete on private.risks to service_role;
create trigger touch_record before update on private.risks for each row execute function private.touch_live_record('id');
create policy risks_facilitator on private.risks for select to authenticated using (not deleted and (select private.wf_facilitates(engagement_id)));

alter table private.risk_mitigations enable row level security;
alter table private.risk_mitigations force row level security;
revoke all on private.risk_mitigations from public,anon,authenticated;
grant select on private.risk_mitigations to authenticated;
grant select,insert,update,delete on private.risk_mitigations to service_role;
create trigger touch_record before update on private.risk_mitigations for each row execute function private.touch_live_record('id');
create policy risk_mitigations_facilitator on private.risk_mitigations for select to authenticated using (not deleted and (select private.wf_facilitates(engagement_id)));

alter table private.goals enable row level security;
alter table private.goals force row level security;
revoke all on private.goals from public,anon,authenticated;
grant select on private.goals to authenticated;
grant select,insert,update,delete on private.goals to service_role;
create trigger touch_record before update on private.goals for each row execute function private.touch_live_record('id');
create policy goals_facilitator on private.goals for select to authenticated using (not deleted and (select private.wf_facilitates(engagement_id)));

alter table private.goal_risks enable row level security;
alter table private.goal_risks force row level security;
revoke all on private.goal_risks from public,anon,authenticated;
grant select on private.goal_risks to authenticated;
grant select,insert,update,delete on private.goal_risks to service_role;
create trigger touch_record before update on private.goal_risks for each row execute function private.touch_live_record('goal_id');
create policy goal_risks_facilitator on private.goal_risks for select to authenticated using (not deleted and (select private.wf_facilitates(engagement_id)));

alter table private.intent_cards enable row level security;
alter table private.intent_cards force row level security;
revoke all on private.intent_cards from public,anon,authenticated;
grant select on private.intent_cards to authenticated;
grant select,insert,update,delete on private.intent_cards to service_role;
create trigger touch_record before update on private.intent_cards for each row execute function private.touch_live_record('id');
create policy intent_cards_facilitator on private.intent_cards for select to authenticated using (not deleted and (select private.wf_facilitates(engagement_id)));

alter table private.intent_card_people enable row level security;
alter table private.intent_card_people force row level security;
revoke all on private.intent_card_people from public,anon,authenticated;
grant select on private.intent_card_people to authenticated;
grant select,insert,update,delete on private.intent_card_people to service_role;
create trigger touch_record before update on private.intent_card_people for each row execute function private.touch_live_record('card_id');
create policy intent_card_people_facilitator on private.intent_card_people for select to authenticated using (not deleted and (select private.wf_facilitates(engagement_id)));

alter table private.first_steps enable row level security;
alter table private.first_steps force row level security;
revoke all on private.first_steps from public,anon,authenticated;
grant select on private.first_steps to authenticated;
grant select,insert,update,delete on private.first_steps to service_role;
create trigger touch_record before update on private.first_steps for each row execute function private.touch_live_record('id');
create policy first_steps_facilitator on private.first_steps for select to authenticated using (not deleted and (select private.wf_facilitates(engagement_id)));

alter table private.key_metrics enable row level security;
alter table private.key_metrics force row level security;
revoke all on private.key_metrics from public,anon,authenticated;
grant select on private.key_metrics to authenticated;
grant select,insert,update,delete on private.key_metrics to service_role;
create trigger touch_record before update on private.key_metrics for each row execute function private.touch_live_record('id');
create policy key_metrics_facilitator on private.key_metrics for select to authenticated using (not deleted and (select private.wf_facilitates(engagement_id)));

alter table private.celebrations enable row level security;
alter table private.celebrations force row level security;
revoke all on private.celebrations from public,anon,authenticated;
grant select on private.celebrations to authenticated;
grant select,insert,update,delete on private.celebrations to service_role;
create trigger touch_record before update on private.celebrations for each row execute function private.touch_live_record('id');
create policy celebrations_facilitator on private.celebrations for select to authenticated using (not deleted and (select private.wf_facilitates(engagement_id)));

alter table private.map_drafts enable row level security;
alter table private.map_drafts force row level security;
revoke all on private.map_drafts from public,anon,authenticated;
grant select on private.map_drafts to authenticated;
grant select,insert,update,delete on private.map_drafts to service_role;
create trigger touch_record before update on private.map_drafts for each row execute function private.touch_live_record('engagement_id');
create policy map_drafts_facilitator on private.map_drafts for select to authenticated using (not deleted and (select private.wf_facilitates(engagement_id)));

alter table private.lens_summaries enable row level security;
alter table private.lens_summaries force row level security;
revoke all on private.lens_summaries from public,anon,authenticated;
grant select on private.lens_summaries to authenticated;
grant select,insert,update,delete on private.lens_summaries to service_role;
create trigger touch_record before update on private.lens_summaries for each row execute function private.touch_live_record('id');
create policy lens_summaries_facilitator on private.lens_summaries for select to authenticated using (not deleted and (select private.wf_facilitates(engagement_id)));

alter table private.lens_summary_versions enable row level security;
alter table private.lens_summary_versions force row level security;
revoke all on private.lens_summary_versions from public,anon,authenticated;
grant select on private.lens_summary_versions to authenticated;
grant select,insert,update,delete on private.lens_summary_versions to service_role;
create trigger touch_record before update on private.lens_summary_versions for each row execute function private.touch_live_record('id');
create policy lens_summary_versions_facilitator on private.lens_summary_versions for select to authenticated using (not deleted and (select private.wf_facilitates(engagement_id)));
create policy lens_summary_versions_room on private.lens_summary_versions for select to authenticated using (not deleted and shown_at is not null and (select private.live_role(engagement_id))='participant');

alter table private.lens_summary_sentences enable row level security;
alter table private.lens_summary_sentences force row level security;
revoke all on private.lens_summary_sentences from public,anon,authenticated;
grant select on private.lens_summary_sentences to authenticated;
grant select,insert,update,delete on private.lens_summary_sentences to service_role;
create trigger touch_record before update on private.lens_summary_sentences for each row execute function private.touch_live_record('id');
create policy lens_summary_sentences_facilitator on private.lens_summary_sentences for select to authenticated using (not deleted and (select private.wf_facilitates(engagement_id)));
create policy lens_summary_sentences_room on private.lens_summary_sentences for select to authenticated using (not deleted and (select private.live_role(engagement_id))='participant' and (select private.wf_version_shown(version_id)));

alter table private.lens_summary_sources enable row level security;
alter table private.lens_summary_sources force row level security;
revoke all on private.lens_summary_sources from public,anon,authenticated;
grant select on private.lens_summary_sources to authenticated;
grant select,insert,update,delete on private.lens_summary_sources to service_role;
create trigger touch_record before update on private.lens_summary_sources for each row execute function private.touch_live_record('summary_sentence_id');
create policy lens_summary_sources_facilitator on private.lens_summary_sources for select to authenticated using (not deleted and (select private.wf_facilitates(engagement_id)));

alter table private.lens_summary_responses enable row level security;
alter table private.lens_summary_responses force row level security;
revoke all on private.lens_summary_responses from public,anon,authenticated;
grant select on private.lens_summary_responses to authenticated;
grant select,insert,update,delete on private.lens_summary_responses to service_role;
create trigger touch_record before update on private.lens_summary_responses for each row execute function private.touch_live_record('id');
create policy lens_summary_responses_facilitator on private.lens_summary_responses for select to authenticated using (not deleted and (select private.wf_facilitates(engagement_id)));
create policy lens_summary_responses_own on private.lens_summary_responses for select to authenticated using (not deleted and attendee_id in (select private.room_attendee_ids()));

comment on table private.lens_sentences is 'Seeded sentences are readable by no role before their lens opens. Facilitators get only private.lens_seed_counts until then.';
comment on table private.decisions is 'What the room decided by consensus and why. Counts show where the room was and never decide.';

commit;
