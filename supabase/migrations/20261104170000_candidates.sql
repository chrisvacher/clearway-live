-- Milestone 4, step 3: cluster and rename to the provisional Vision Outcomes (INT-13, D1-07 to D1-10).
-- Live only, after merge and Chris's approval. No session is started and no data is seeded.
--
-- One new kind, `candidates`, with one session and four phases:
--   review  AI (or the facilitator, by hand) lists 6 to 10 candidate priorities drawn from all Five
--           Lenses, each with the lens sentences behind it. They stay on the control surface.
--   sent    The facilitator sends them to the TV. The TV shows a number and a title for each. Phones
--           rename, merge or suggest; the facilitator accepts each with one tap.
--   points  100 points (INT-07's rules) over the standing candidates, with a cut line set between
--           four and six. Counts show where the room is. They never decide.
--   marked  The facilitator marks the provisional Vision Outcomes: private.vision_outcomes rows with
--           status 'provisional', and one decision (subject 'cut_line') with the reasons.
-- The 100 points are answers to this kind, parsed by private.bar_parse_points over the candidates as
-- its options, and drawn by the same TV bars and phone faders as INT-07.
--
-- Tables: private.candidate_boards, private.candidates, private.candidate_sources and
-- private.candidate_suggestions, each under forced row-level security and reachable only through the
-- functions below. Names of who suggested what never leave the facilitator's own read.
--
-- AI: job propose_candidates, prompt propose-candidates@1. It runs only when the facilitator asks
-- (Draft candidates), reads the lens sentences and clusters of every opened lens, and writes
-- candidates into the review phase, where only the control surface sees them. AI is never in the
-- path from a phone to the TV: a suggestion is stored and shown to the facilitator first.
--
-- Shared objects touched (each a superset of its latest definition on main, per the milestone 4 brief):
--   private.ai_runs (ai_runs_job_check)   gains 'propose_candidates'
--   private.ai_on                          also true for a candidates session
--   private.ai_claim, private.ai_apply     now wrappers: a candidates session is handled here, every other kind
--                                          goes to the unchanged function, renamed ai_claim_base3 and ai_apply_base3
--   private.reset_practice_room            same as step 1's, plus the four new tables
-- ai_status, ai_fail, ai_due and the merge limits of the other jobs are untouched.
begin;

insert into private.interaction_kinds(kind,label,input,one_per_person,counts,structured,shares_answers,spotlight,named,position) values
 ('candidates','Candidate priorities',true,true,'people',true,true,'none','never',120);

alter table private.ai_runs drop constraint ai_runs_job_check;
alter table private.ai_runs add constraint ai_runs_job_check check(job in ('combine_words','group_wall','summarize_wall','fold_questions','merge_reasons','group_lens','overnight_draft','propose_candidates'));

-- ---------- Tables ----------
create table private.candidate_boards (
 session_id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 phase text not null default 'review' check(phase in ('review','sent','points','marked')),
 cut integer check(cut is null or cut between 4 and 6),
 ai_requested_at timestamptz,
 ai_drafted_at timestamptz,
 ai_note text check(ai_note is null or ai_note in ('no_sentences','short','empty')),
 marked_at timestamptz,
 decision_id uuid references private.decisions(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create index candidate_boards_engagement_idx on private.candidate_boards(engagement_id);
create index candidate_boards_decision_idx on private.candidate_boards(decision_id);

create table private.candidates (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 120),
 position integer not null default 0 check(position>=0),
 status text not null default 'standing' check(status in ('standing','merged','removed')),
 merged_into uuid references private.candidates(id),
 origin text not null check(origin in ('ai','facilitator','phone')),
 edited boolean not null default false,
 run_id uuid references private.ai_runs(id),
 outcome_id uuid references private.vision_outcomes(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id),
 check((status='merged')=(merged_into is not null))
);
create index candidates_session_idx on private.candidates(session_id,engagement_id,position) where not deleted;
create index candidates_engagement_idx on private.candidates(engagement_id);
create index candidates_merged_idx on private.candidates(merged_into);
create index candidates_run_idx on private.candidates(run_id);
create index candidates_outcome_idx on private.candidates(outcome_id);

create table private.candidate_sources (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 candidate_id uuid not null references private.candidates(id),
 sentence_id uuid not null references private.lens_sentences(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false
);
create unique index candidate_sources_unique on private.candidate_sources(candidate_id,sentence_id) where not deleted;
create index candidate_sources_engagement_idx on private.candidate_sources(engagement_id);
create index candidate_sources_sentence_idx on private.candidate_sources(sentence_id);

create table private.candidate_suggestions (
 id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 attendee_id uuid not null references public.attendees(id),
 kind text not null check(kind in ('rename','merge','add')),
 candidate_id uuid references private.candidates(id),
 into_id uuid references private.candidates(id),
 text text not null default '' check(length(text)<=120),
 status text not null default 'pending' check(status in ('pending','accepted','dismissed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id),
 check((kind='add' and candidate_id is null and into_id is null and length(btrim(text))>0)
  or (kind='rename' and candidate_id is not null and into_id is null and length(btrim(text))>0)
  or (kind='merge' and candidate_id is not null and into_id is not null and candidate_id<>into_id))
);
create index candidate_suggestions_session_idx on private.candidate_suggestions(session_id,engagement_id) where not deleted;
create index candidate_suggestions_engagement_idx on private.candidate_suggestions(engagement_id);
create index candidate_suggestions_attendee_idx on private.candidate_suggestions(attendee_id);
create index candidate_suggestions_candidate_idx on private.candidate_suggestions(candidate_id);
create index candidate_suggestions_into_idx on private.candidate_suggestions(into_id);

alter table private.candidate_boards enable row level security;
alter table private.candidate_boards force row level security;
revoke all on private.candidate_boards from public,anon,authenticated;
grant select,insert,update,delete on private.candidate_boards to service_role;
create trigger touch_record before update on private.candidate_boards for each row execute function private.touch_live_record('session_id');
alter table private.candidates enable row level security;
alter table private.candidates force row level security;
revoke all on private.candidates from public,anon,authenticated;
grant select,insert,update,delete on private.candidates to service_role;
create trigger touch_record before update on private.candidates for each row execute function private.touch_live_record('id');
alter table private.candidate_sources enable row level security;
alter table private.candidate_sources force row level security;
revoke all on private.candidate_sources from public,anon,authenticated;
grant select,insert,update,delete on private.candidate_sources to service_role;
create trigger touch_record before update on private.candidate_sources for each row execute function private.touch_live_record('id');
alter table private.candidate_suggestions enable row level security;
alter table private.candidate_suggestions force row level security;
revoke all on private.candidate_suggestions from public,anon,authenticated;
grant select,insert,update,delete on private.candidate_suggestions to service_role;
create trigger touch_record before update on private.candidate_suggestions for each row execute function private.touch_live_record('id');

comment on table private.candidates is 'Candidate priorities for the provisional Vision Outcomes. Proposed by AI or written by hand, renamed and merged by the room, accepted by the facilitator.';
comment on table private.candidate_suggestions is 'What a phone suggested: a rename, a merge or a new candidate. Private to the facilitator until accepted.';

-- ---------- Switches ----------
-- As step 5's: word cloud, wall and Q&A, the pre-mortem grid, a lens wall (not the seeding step), and now a candidates step.
create or replace function private.ai_on(p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select coalesce(e.settings->>'ai_enabled','false')='true'
   and (s.interaction in ('word_cloud','wall','qa','candidates') or (s.interaction='grid' and s.options->>'preset'='pre_mortem') or (s.interaction='lens' and coalesce(s.options->>'seed','false')<>'true'))
   and coalesce(a.ai,case when jsonb_typeof(s.options->'ai')='boolean' then (s.options->>'ai')::boolean end,true)
  from public.sessions s join public.engagements e on e.id=s.engagement_id and not e.deleted
  left join private.ai_sessions a on a.session_id=s.id and not a.deleted
  where s.id=p_session and not s.deleted),false)
$$;

-- ---------- Options ----------
-- ai: whether AI may draft candidates (default on). cut: where the cut line starts, four to six (default five).
create function private.options_candidates(p jsonb,p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when jsonb_typeof(p)='object' and not exists(select 1 from jsonb_object_keys(p) k where k not in ('ai','cut'))
  and coalesce(jsonb_typeof(p->'ai'),'boolean')='boolean' and (not p ? 'cut' or p->>'cut' ~ '^[456]$' and jsonb_typeof(p->'cut')='number')
  then jsonb_strip_nulls(jsonb_build_object('ai',case when p ? 'ai' then (p->>'ai')::boolean end,'cut',case when p ? 'cut' then (p->>'cut')::integer end)) end
$$;

-- ---------- Small helpers ----------
-- A candidate's name: one line, up to 80 characters and ten words, no quotation, through the word filter.
create function private.candidate_name(p_text text) returns text
language sql stable security definer set search_path='' as $$
 select case when t is not null and length(t) between 1 and 80 and cardinality(regexp_split_to_array(t,'\s+'))<=10 and not private.ai_quoted(t) and not private.screen_text(t) then t end
 from (select nullif(btrim(regexp_replace(coalesce(p_text,''),'\s+',' ','g')),'') as t) x
$$;
-- The board of a candidates session, made on first use.
create function private.candidate_board(p_session uuid) returns private.candidate_boards
language plpgsql security definer set search_path='' as $$
declare b private.candidate_boards; s public.sessions;
begin
 select * into s from public.sessions where id=p_session and not deleted;
 if s.id is null then return null; end if;
 insert into private.candidate_boards(session_id,engagement_id) values(s.id,s.engagement_id) on conflict(session_id) do nothing;
 select * into b from private.candidate_boards where session_id=s.id;
 return b;
end $$;
-- Pending suggestions about a candidate that is no longer standing are dismissed.
create function private.candidate_tidy(p_session uuid) returns void
language sql security definer set search_path='' as $$
 update private.candidate_suggestions s set status='dismissed'
 where s.session_id=p_session and s.status='pending' and not s.deleted
  and ((s.candidate_id is not null and not exists(select 1 from private.candidates c where c.id=s.candidate_id and c.status='standing' and not c.deleted))
   or (s.into_id is not null and not exists(select 1 from private.candidates c where c.id=s.into_id and c.status='standing' and not c.deleted)))
$$;
-- Whether the words of a lens sentence may be read now: a live sentence, or one whose lens has opened.
create function private.candidate_sentence_open(p_sentence uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.lens_sentences l join public.submissions x on x.id=l.submission_id
  where l.id=p_sentence and not l.deleted and not l.withdrawn and not x.deleted and not x.withdrawn and not x.hidden
   and (l.source='live' or private.lens_is_open(l.engagement_id,l.lens) or x.test))
$$;

-- ---------- What the model reads ----------
-- Every standing sentence of every opened lens wall (the 80 newest per lens), with the cluster it sits
-- in, under short refs. Seeded sentences appear only once their lens has opened. Null when there are none.
create function private.candidate_inputs(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.sessions; e public.engagements; out jsonb;
begin
 select * into s from public.sessions where id=p_session and not deleted;
 select * into e from public.engagements where id=s.engagement_id;
 with walls as (select w.id,(w.options->>'lens')::integer as lens from public.sessions w
   where w.engagement_id=s.engagement_id and not w.deleted and w.interaction='lens' and w.options->>'lens' ~ '^[1-5]$' and coalesce(w.options->>'seed','false')<>'true'),
 open as (select w.lens,w.id as wall,l.id as sub,l.text,l.received,ls.id as sid,row_number() over(partition by w.lens order by l.received desc,l.id) as recent
   from walls w cross join lateral private.lens_open_sentences(w.id) l join private.lens_sentences ls on ls.submission_id=l.id and not ls.deleted),
 kept as (select *,row_number() over(order by lens,received,sub) as n from open where recent<=80),
 cl as (select g.id as gid,g.label,min(k.lens) as lens,count(*)::integer as cnt,row_number() over(order by min(k.lens),min(k.received),g.id) as m
   from private.ai_groups g join private.ai_group_members gm on gm.group_id=g.id and gm.removed_at is null and not gm.deleted
   join kept k on k.sub=gm.submission_id and k.wall=g.session_id
   where g.undone_at is null and not g.deleted group by g.id,g.label having count(*)>=2)
 select case when (select count(*) from kept)=0 then null else jsonb_build_object('lens_names',to_jsonb(e.lens_names),'base_year',e.base_year,'min',6,'max',10,
   'sentences',(select jsonb_agg(jsonb_build_object('ref','s'||k.n,'id',k.sid,'lens',k.lens,'text',k.text,
      'cluster',(select 'c'||cl.m from private.ai_group_members gm join cl on cl.gid=gm.group_id where gm.submission_id=k.sub and gm.removed_at is null and not gm.deleted limit 1)) order by k.n) from kept k),
   'clusters',coalesce((select jsonb_agg(jsonb_build_object('ref','c'||cl.m,'lens',cl.lens,'label',cl.label,'count',cl.cnt) order by cl.m) from cl),'[]'::jsonb)) end into out;
 return out;
end $$;

-- ---------- The worker: claim and apply, as a wrapper ----------
alter function private.ai_claim(uuid,uuid,text,jsonb) rename to ai_claim_base3;
alter function private.ai_apply(uuid,uuid,jsonb,jsonb) rename to ai_apply_base3;

-- A candidates session is due only when the facilitator asked for a draft and the board is still in review.
create function private.ai_claim(p_session uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; a private.ai_sessions; b private.candidate_boards; t timestamptz:=clock_timestamp(); v_inputs jsonb; v_run uuid;
begin
 select * into s from public.sessions where id=p_session and not deleted;
 if s.id is null or s.interaction<>'candidates' then return private.ai_claim_base3(p_session,p_lease,p_model,p_versions); end if;
 if p_lease is null or p_model is null or length(p_model) not between 1 and 100 or jsonb_typeof(p_versions) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 if not private.ai_on(s.id) or s.state not in ('live','phones_down','open') then return jsonb_build_object('status','off'); end if;
 insert into private.ai_sessions(session_id,engagement_id) values(s.id,s.engagement_id) on conflict(session_id) do nothing;
 select * into a from private.ai_sessions where session_id=s.id for update;
 if a.lease_id is not null and a.lease_until>t then return jsonb_build_object('status','busy'); end if;
 if a.last_failed_at is not null and a.last_failed_at>t-interval '10 seconds' and (a.last_ok_at is null or a.last_failed_at>a.last_ok_at) then
  return jsonb_build_object('status','cooling','ms',(extract(epoch from a.last_failed_at+interval '10 seconds'-t)*1000)::integer); end if;
 if a.lease_run is not null then update private.ai_runs set status='stale',finished_at=t where id=a.lease_run and status='running'; end if;
 b:=private.candidate_board(s.id);
 if b.ai_requested_at is null or b.phase<>'review' then return jsonb_build_object('status','idle'); end if;
 if coalesce(p_versions->>'propose_candidates','') !~ '^[a-z0-9_.@-]{1,60}$' then return jsonb_build_object('status','invalid_request'); end if;
 v_inputs:=private.candidate_inputs(s.id);
 if v_inputs is null then
  update private.candidate_boards set ai_requested_at=null,ai_note='no_sentences' where session_id=s.id;
  perform private.fac_notice(s.engagement_id,jsonb_build_object('kind','control','action','candidates_draft','changed',false));
  return jsonb_build_object('status','idle');
 end if;
 insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,created_at) values(s.engagement_id,s.id,'propose_candidates',p_model,p_versions->>'propose_candidates',v_inputs,t) returning id into v_run;
 update private.ai_sessions set lease_id=p_lease,lease_run=v_run,lease_until=t+interval '45 seconds' where session_id=s.id;
 update private.candidate_boards set ai_requested_at=null,ai_note=null where session_id=s.id;
 return jsonb_build_object('status','claimed','run',v_run,'job','propose_candidates','prompt_version',p_versions->>'propose_candidates','inputs',v_inputs);
end $$;

-- The model's candidates under the limits in code: a name through the filter (80 characters, ten words, no quote),
-- at least one known source sentence, no name twice, ten at most, twelve standing at most, only while the board is in
-- review. A redraft replaces the AI's untouched candidates and keeps everything the facilitator or a phone made.
create function private.ai_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; a private.ai_sessions; r public.room_states; s public.sessions; b private.candidate_boards; t timestamptz:=clock_timestamp(); v_ms integer;
 applied jsonb:='[]'::jsonb; refused jsonb:='[]'::jsonb; v_changed boolean:=false; refs jsonb; item jsonb; v_name text; v_reason text; v_sources text[]; v_id uuid; v_pos integer; v_standing integer; v_made integer:=0; ref text; names text[];
begin
 select * into run from private.ai_runs where id=p_run;
 if run.id is null or run.job<>'propose_candidates' then return private.ai_apply_base3(p_run,p_lease,p_output,p_usage); end if;
 if p_lease is null then return jsonb_build_object('status','invalid_request'); end if;
 if run.engagement_id='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(run.engagement_id::text,7)); end if;
 select * into r from public.room_states where engagement_id=run.engagement_id and not deleted for update;
 select * into a from private.ai_sessions where session_id=run.session_id for update;
 select * into run from private.ai_runs where id=p_run;
 if run.status<>'running' or a.lease_id is distinct from p_lease or a.lease_run is distinct from p_run then return jsonb_build_object('status','stale'); end if;
 v_ms:=private.ai_usage(p_usage,'ms',600000)::integer;
 select * into s from public.sessions where id=run.session_id;
 update private.ai_sessions set lease_id=null,lease_run=null,lease_until=null,last_ok_at=t,last_ms=v_ms where session_id=run.session_id;
 if not private.ai_on(run.session_id) or s.deleted then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms,input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,
   output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
  return jsonb_build_object('status','discarded');
 end if;
 if jsonb_typeof(p_output) is distinct from 'object' or pg_column_size(p_output)>131072 then p_output:='{}'::jsonb; end if;
 b:=private.candidate_board(run.session_id);
 select coalesce(jsonb_object_agg(x->>'ref',x),'{}'::jsonb) into refs from jsonb_array_elements(run.inputs->'sentences') x;
 if b.phase='review' then
  -- A redraft replaces the AI's own candidates that nobody has touched.
  update private.candidates set status='removed' where session_id=run.session_id and status='standing' and not deleted and origin='ai' and not edited;
  select coalesce(array_agg(lower(name)),array[]::text[]) into names from private.candidates where session_id=run.session_id and status='standing' and not deleted;
  select count(*) into v_standing from private.candidates where session_id=run.session_id and status='standing' and not deleted;
  v_pos:=coalesce((select max(position)+1 from private.candidates where session_id=run.session_id and not deleted),0);
  for item in select v from jsonb_array_elements(case when jsonb_typeof(p_output->'candidates')='array' then p_output->'candidates' else '[]'::jsonb end) v limit 30 loop
   v_reason:=null; v_name:=private.candidate_name(item->>'name');
   v_sources:=array(select distinct x from jsonb_array_elements_text(case when jsonb_typeof(item->'sources')='array' then item->'sources' else '[]'::jsonb end) x where refs ? x);
   if jsonb_typeof(item) is distinct from 'object' or v_name is null then v_reason:='name';
   elsif cardinality(v_sources)=0 then v_reason:='no_sources';
   elsif lower(v_name)=any(names) then v_reason:='duplicate';
   elsif v_made>=10 then v_reason:='too_many';
   elsif v_standing>=12 then v_reason:='full';
   end if;
   if v_reason is null then
    insert into private.candidates(engagement_id,session_id,name,position,origin,run_id) values(run.engagement_id,run.session_id,v_name,v_pos,'ai',run.id) returning id into v_id;
    foreach ref in array v_sources loop
     insert into private.candidate_sources(engagement_id,candidate_id,sentence_id) values(run.engagement_id,v_id,(refs->ref->>'id')::uuid) on conflict do nothing;
    end loop;
    v_pos:=v_pos+1; v_made:=v_made+1; v_standing:=v_standing+1; names:=names||lower(v_name); v_changed:=true;
    applied:=applied||jsonb_build_array(jsonb_build_object('candidate',v_id,'name',v_name,'sources',cardinality(v_sources)));
   else refused:=refused||jsonb_build_array(jsonb_build_object('candidate',item,'reason',v_reason)); end if;
  end loop;
 else
  refused:=jsonb_build_array(jsonb_build_object('reason','moved'));
 end if;
 update private.ai_runs set status='ok',changed=v_changed,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'applied',applied,'refused',refused),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,
  cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 if b.phase='review' then
  update private.candidate_boards set ai_drafted_at=t,ai_note=case when v_made=0 then 'empty' when v_made<6 then 'short' end where session_id=run.session_id;
 end if;
 -- Nothing public changes in review, so the room keeps its version; the control surface is told to look.
 perform private.fac_notice(run.engagement_id,jsonb_build_object('kind','control','action','candidates_draft','version',r.version,'changed',false));
 return jsonb_build_object('status','ok','changed',v_changed,'applied',jsonb_array_length(applied),'refused',jsonb_array_length(refused));
end $$;

-- ---------- Parsing a person's 100 points ----------
-- Only in the points phase, and only a full budget over the standing candidates (INT-07's rule, by private.bar_parse_points).
create function private.parse_candidates(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s2 public.sessions:=p_session; b private.candidate_boards;
begin
 select * into b from private.candidate_boards where session_id=p_session.id and not deleted;
 if b.session_id is null or b.phase<>'points' then return jsonb_build_object('status','invalid_answer'); end if;
 s2.options:=jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('key',c.id::text,'text',c.name) order by c.position,c.created_at,c.id)
   from private.candidates c where c.session_id=p_session.id and c.status='standing' and not c.deleted),'[]'::jsonb));
 if jsonb_array_length(s2.options->'items')<2 then return jsonb_build_object('status','invalid_answer'); end if;
 return private.bar_parse_points(s2,p_value);
end $$;

-- ---------- What every screen shows ----------
-- review: nothing but the phase (the TV waits, phones wait). sent: each standing candidate with its number, title and how many
-- sentences it came from (phones show the count, the TV shows number and title only), and the merges so the TV can glide one
-- into the other. points: the same bars INT-07 draws, and the cut line. marked: only the provisional Vision Outcomes.
create function private.results_candidates(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.sessions; b private.candidate_boards; ph text; v_cut integer; base jsonb; v_bars jsonb:='[]'::jsonb; n integer;
begin
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted and interaction='candidates';
 if s.id is null then return jsonb_build_object('total',0,'people',0,'words','[]'::jsonb); end if;
 select * into b from private.candidate_boards where session_id=p_session and not deleted;
 ph:=coalesce(b.phase,'review');
 v_cut:=coalesce(b.cut,case when s.options->>'cut' ~ '^[456]$' then (s.options->>'cut')::integer end,5);
 select count(*) into n from private.candidates where session_id=p_session and status='standing' and not deleted;
 if ph in ('points','marked') then
  with c as (select c.id,c.name,c.position,row_number() over(order by c.position,c.created_at,c.id) as num from private.candidates c where c.session_id=p_session and c.status='standing' and not c.deleted),
  ans as (select * from private.bar_answers(p_engagement,p_session)),
  summed as (select c.id,c.name,c.num,coalesce((select sum(coalesce((a.value->'points'->>(c.id::text))::integer,0)) from ans a),0)::integer as pts from c),
  ranked as (select *,row_number() over(order by pts desc,num) as place,max(pts) over() as top,sum(pts) over() as everything from summed)
  select coalesce(jsonb_agg(jsonb_build_object('key',id::text,'text',name,'place',place,'points',pts,
    'share',case when everything>0 then round(pts*100.0/everything)::integer else 0 end,
    'fraction',case when top>0 then round(pts::numeric/top,4) else 0 end,'leader',top>0 and pts=top) order by place),'[]'::jsonb) into v_bars from ranked;
 end if;
 base:=jsonb_build_object('phase',ph,'words','[]'::jsonb,
  'total',case when ph in ('points','marked') then (select count(*) from private.bar_answers(p_engagement,p_session)) else 0 end,
  'people',case when ph in ('points','marked') then (select count(distinct attendee_id) from private.bar_answers(p_engagement,p_session)) else 0 end);
 if ph in ('sent','points') then
  base:=base||jsonb_build_object('candidates',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'num',x.num,'name',x.name,
     'from',(select count(*) from private.candidate_sources cs where cs.candidate_id=x.id and not cs.deleted)) order by x.num)
    from (select c.id,c.name,row_number() over(order by c.position,c.created_at,c.id) as num from private.candidates c where c.session_id=p_session and c.status='standing' and not c.deleted) x),'[]'::jsonb),
   'merges',coalesce((select jsonb_agg(jsonb_build_object('from',m.id,'into',m.merged_into) order by m.updated_at,m.id)
    from (select * from private.candidates where session_id=p_session and status='merged' and not deleted order by updated_at desc,id limit 20) m),'[]'::jsonb));
 elsif ph='marked' then
  base:=base||jsonb_build_object('candidates',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'num',x.num,'name',x.name,'provisional',true,
     'from',(select count(*) from private.candidate_sources cs where cs.candidate_id=x.id and not cs.deleted)) order by x.num)
    from (select c.id,c.name,row_number() over(order by (select o.position from private.vision_outcomes o where o.id=c.outcome_id),c.created_at,c.id) as num
      from private.candidates c join private.vision_outcomes o on o.id=c.outcome_id and not o.deleted where c.session_id=p_session and c.status='standing' and not c.deleted) x),'[]'::jsonb),
   'merges','[]'::jsonb);
 else
  base:=base||jsonb_build_object('candidates','[]'::jsonb,'merges','[]'::jsonb);
 end if;
 if ph in ('points','marked') then
  base:=base||jsonb_build_object('bars',v_bars,'cut',case when v_cut<n then v_cut else 0 end,'cut_label',case when v_cut<n then private.bar_cut_label(v_cut) end);
 end if;
 return base;
end $$;

-- The control surface keeps its own panel for candidates, so there are no general items.
create function private.items_candidates(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$ select '[]'::jsonb $$;

-- ---------- A phone suggests: rename, merge or a new candidate ----------
-- Only while the candidates are on the TV, from a live (or still open) step, the word filter on, six suggestions a person.
-- The id is made on the phone, so a resend is a duplicate. Nothing here reaches the TV: the facilitator accepts each.
create function private.candidate_suggest(p_engagement uuid,p_id uuid,p_session uuid,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; b private.candidate_boards; who uuid; done private.candidate_suggestions; v_kind text; t text; c1 private.candidates; c2 private.candidates;
begin
 if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 select id into who from public.attendees where engagement_id=p_engagement and not deleted and id in(select private.room_attendee_ids());
 if who is null or p_id is null or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','denied'); end if;
 select * into done from private.candidate_suggestions where id=p_id;
 if found then return jsonb_build_object('status',case when done.attendee_id=who and done.session_id=p_session then 'duplicate' else 'conflict' end,'id',p_id); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted;
 if s.id is null or s.interaction<>'candidates' then return jsonb_build_object('status','invalid_session'); end if;
 if not ((r.live_session_id=s.id and s.state='live' and not r.phones_down and (r.burst_ends_at is null or r.burst_ends_at>clock_timestamp())) or (r.live_session_id is distinct from s.id and s.state='open')) then return jsonb_build_object('status','closed'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 select * into b from private.candidate_boards where session_id=s.id and not deleted;
 if b.session_id is null or b.phase<>'sent' then return jsonb_build_object('status','closed'); end if;
 v_kind:=p->>'kind';
 if v_kind not in ('rename','merge','add') or exists(select 1 from jsonb_object_keys(p) k where k not in ('kind','candidate','into','text')) then return jsonb_build_object('status','invalid_answer'); end if;
 t:=btrim(regexp_replace(coalesce(p->>'text',''),'\s+',' ','g'));
 if length(t)>120 or (v_kind<>'merge' and length(t)=0) then return jsonb_build_object('status','invalid_answer'); end if;
 if length(t)>0 and private.screen_text(t) then return jsonb_build_object('status','filtered'); end if;
 if (select count(*) from private.candidate_suggestions where session_id=s.id and attendee_id=who and not deleted and status<>'dismissed')>=6 then return jsonb_build_object('status','limit'); end if;
 if v_kind in ('rename','merge') then
  if p->>'candidate' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_answer'); end if;
  select * into c1 from private.candidates where id=(p->>'candidate')::uuid and session_id=s.id and status='standing' and not deleted;
  if c1.id is null then return jsonb_build_object('status','missing'); end if;
 end if;
 if v_kind='rename' and lower(t)=lower(c1.name) then return jsonb_build_object('status','unchanged'); end if;
 if v_kind='merge' then
  if p->>'into' is null or p->>'into' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or p->>'into'=p->>'candidate' then return jsonb_build_object('status','invalid_answer'); end if;
  select * into c2 from private.candidates where id=(p->>'into')::uuid and session_id=s.id and status='standing' and not deleted;
  if c2.id is null then return jsonb_build_object('status','missing'); end if;
 end if;
 if v_kind='add' and exists(select 1 from private.candidates where session_id=s.id and status='standing' and not deleted and lower(name)=lower(t)) then return jsonb_build_object('status','exists'); end if;
 if exists(select 1 from private.candidate_suggestions where session_id=s.id and attendee_id=who and not deleted and status='pending' and kind=v_kind
   and candidate_id is not distinct from c1.id and into_id is not distinct from c2.id and lower(text)=lower(t)) then return jsonb_build_object('status','exists'); end if;
 insert into private.candidate_suggestions(id,engagement_id,session_id,attendee_id,kind,candidate_id,into_id,text) values(p_id,p_engagement,s.id,who,v_kind,c1.id,c2.id,t);
 -- The control surface refreshes on this private notice. No name travels with it.
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','action','candidate_suggest','version',r.version,'changed',false));
 return jsonb_build_object('status','accepted','id',p_id);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_answer');
end $$;

-- ---------- The facilitator's read ----------
-- Candidates with their source sentences, the suggestions waiting (grouped when the same thing was suggested, with first
-- names, never on the TV), the AI's state, and the lens wall for writing candidates by hand.
create function private.candidates_state(p_engagement uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; b private.candidate_boards; a private.ai_sessions; e public.engagements; run private.ai_runs; t timestamptz:=clock_timestamp(); out jsonb; v_standing integer;
begin
 if not coalesce(private.wf_facilitates(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 select * into s from public.sessions where id=r.live_session_id and not deleted and interaction='candidates';
 if s.id is null then return jsonb_build_object('status','missing'); end if;
 select * into e from public.engagements where id=p_engagement;
 b:=private.candidate_board(s.id);
 select * into a from private.ai_sessions where session_id=s.id and not deleted;
 if a.lease_run is not null and a.lease_until>t then select * into run from private.ai_runs where id=a.lease_run; end if;
 select count(*) into v_standing from private.candidates where session_id=s.id and status='standing' and not deleted;
 out:=jsonb_build_object('status','ok','session',s.id,'phase',b.phase,'cut',coalesce(b.cut,case when s.options->>'cut' ~ '^[456]$' then (s.options->>'cut')::integer end,5),
  'standing',v_standing,
  'ai',jsonb_build_object('engagement_on',coalesce(e.settings->>'ai_enabled','false')='true','on',private.ai_on(s.id),'requested',b.ai_requested_at is not null,
    'running',run.id is not null,'running_ms',case when run.id is not null then (extract(epoch from t-run.created_at)*1000)::integer end,
    'failing',a.last_failed_at is not null and (a.last_ok_at is null or a.last_failed_at>a.last_ok_at),'last_ms',a.last_ms,
    'drafted_at',b.ai_drafted_at,'note',b.ai_note),
  'candidates',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'num',x.num,'name',x.name,'origin',x.origin,'edited',x.edited,
     'sources',coalesce((select jsonb_agg(jsonb_build_object('id',ls.id,'lens',ls.lens,'text',ls.text) order by ls.lens,ls.created_at,ls.id)
       from private.candidate_sources cs join private.lens_sentences ls on ls.id=cs.sentence_id
       where cs.candidate_id=x.id and not cs.deleted and private.candidate_sentence_open(ls.id)),'[]'::jsonb),
     'from',(select count(*) from private.candidate_sources cs where cs.candidate_id=x.id and not cs.deleted),
     'marked',x.outcome_id is not null and exists(select 1 from private.vision_outcomes o where o.id=x.outcome_id and not o.deleted)) order by x.num)
    from (select c.*,row_number() over(order by c.position,c.created_at,c.id)::integer as num from private.candidates c where c.session_id=s.id and c.status='standing' and not c.deleted) x),'[]'::jsonb),
  'suggestions',coalesce((select jsonb_agg(jsonb_build_object('ids',g.ids,'kind',g.kind,'candidate',g.candidate_id,'candidate_name',g.cname,'into',g.into_id,'into_name',g.iname,'text',g.text,
     'count',cardinality(g.ids),'by',g.by) order by g.first_at)
    from (select q.kind,q.candidate_id,q.into_id,min(q.text) as text,array_agg(q.id order by q.created_at,q.id) as ids,min(q.created_at) as first_at,
       (select name from private.candidates where id=q.candidate_id) as cname,(select name from private.candidates where id=q.into_id) as iname,
       array_agg(distinct split_part(btrim(att.name),' ',1)) as by
      from private.candidate_suggestions q join public.attendees att on att.id=q.attendee_id and not att.deleted
      where q.session_id=s.id and q.status='pending' and not q.deleted group by q.kind,q.candidate_id,q.into_id,lower(q.text)) g),'[]'::jsonb),
  'wall',jsonb_build_object('lenses',(select jsonb_agg(jsonb_build_object('lens',n,'name',e.lens_names[n],'open',private.lens_is_open(p_engagement,n::smallint),
     'clusters',coalesce((select jsonb_agg(cl order by cl->>'label') from (
        select jsonb_build_object('label',g.label,'count',count(*),'sentences',jsonb_agg(jsonb_build_object('id',ls.id,'text',ls.text) order by l.received,l.id)) as cl
        from public.sessions w cross join lateral private.lens_open_sentences(w.id) l join private.lens_sentences ls on ls.submission_id=l.id and not ls.deleted
         join private.ai_group_members gm on gm.submission_id=l.id and gm.removed_at is null and not gm.deleted
         join private.ai_groups g on g.id=gm.group_id and g.session_id=w.id and g.undone_at is null and not g.deleted
        where w.engagement_id=p_engagement and not w.deleted and w.interaction='lens' and w.options->>'lens'=n::text and coalesce(w.options->>'seed','false')<>'true'
        group by g.id,g.label having count(*)>=2 limit 12) z),'[]'::jsonb),
     'loose',(select count(*) from public.sessions w cross join lateral private.lens_open_sentences(w.id) l
        where w.engagement_id=p_engagement and not w.deleted and w.interaction='lens' and w.options->>'lens'=n::text and coalesce(w.options->>'seed','false')<>'true'
         and not exists(select 1 from private.ai_group_members gm join private.ai_groups g on g.id=gm.group_id and g.undone_at is null and not g.deleted where gm.submission_id=l.id and gm.removed_at is null and not gm.deleted))
     ) order by n) from generate_series(1,5) n));
 return out;
end $$;

-- ---------- The facilitator's control ----------
-- draft, add, rename, remove, merge (a direct one), accept and dismiss (suggestions, by the ids of one group), send, hold,
-- open_points, back, cut and mark. One press by a client-made id, as the other controls: room lock, facilitator check,
-- the id for idempotency, one version raise, logged in plain words.
create function private.candidates_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; cur public.sessions; b private.candidate_boards; me uuid:=private.clearway_user_id(); who text;
 c1 private.candidates; c2 private.candidates; sg private.candidate_suggestions; ids uuid[]; v_name text; v_sources uuid[]; n integer; v_cut integer; v_pos integer;
 v_marked uuid[]; v_old uuid[]; v_dec text; v_new uuid; rec record; i integer:=0;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or jsonb_typeof(p) is distinct from 'object'
  or p_action not in ('draft','add','rename','remove','merge','accept','dismiss','send','hold','open_points','back','cut','mark') then return jsonb_build_object('status','invalid_request'); end if;
 if exists(select 1 from private.room_controls where id=p_id) then
  if exists(select 1 from private.room_controls where id=p_id and engagement_id=p_engagement and action='candidates_'||p_action) then return jsonb_build_object('status','duplicate','version',r.version); end if;
  return jsonb_build_object('status','conflict');
 end if;
 if not (p ? 'from') or (p->>'from' is not null and p->>'from' !~ '^[0-9a-f-]{36}$') then return jsonb_build_object('status','invalid_request'); end if;
 if (p->>'from')::uuid is distinct from r.live_session_id then return jsonb_build_object('status','moved','version',r.version,'live_session_id',r.live_session_id); end if;
 select * into cur from public.sessions where id=r.live_session_id and not deleted for update;
 if cur.id is null or cur.interaction<>'candidates' then return jsonb_build_object('status','invalid_state'); end if;
 b:=private.candidate_board(cur.id);
 select * into b from private.candidate_boards where session_id=cur.id for update;
 select count(*) into n from private.candidates where session_id=cur.id and status='standing' and not deleted;
 v_pos:=coalesce((select max(position)+1 from private.candidates where session_id=cur.id and not deleted),0);

 if p_action='draft' then
  if b.phase<>'review' then return jsonb_build_object('status','invalid_state'); end if;
  if not private.ai_on(cur.id) then return jsonb_build_object('status','ai_off'); end if;
  update private.candidate_boards set ai_requested_at=clock_timestamp(),ai_note=null where session_id=cur.id;

 elsif p_action='add' then
  if b.phase not in ('review','sent') then return jsonb_build_object('status','invalid_state'); end if;
  v_name:=btrim(regexp_replace(coalesce(p->>'name',''),'\s+',' ','g'));
  if length(v_name) not between 1 and 120 then return jsonb_build_object('status','invalid_request'); end if;
  if n>=12 then return jsonb_build_object('status','full'); end if;
  if exists(select 1 from private.candidates where session_id=cur.id and status='standing' and not deleted and lower(name)=lower(v_name)) then return jsonb_build_object('status','exists'); end if;
  if p ? 'sources' then
   if jsonb_typeof(p->'sources') is distinct from 'array' or jsonb_array_length(p->'sources')>60
    or exists(select 1 from jsonb_array_elements(p->'sources') v where jsonb_typeof(v)<>'string' or v#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return jsonb_build_object('status','invalid_request'); end if;
   select coalesce(array_agg(distinct (v#>>'{}')::uuid),array[]::uuid[]) into v_sources from jsonb_array_elements(p->'sources') v;
   if exists(select 1 from unnest(v_sources) x where not exists(select 1 from private.lens_sentences l where l.id=x and l.engagement_id=p_engagement) or not private.candidate_sentence_open(x)) then return jsonb_build_object('status','invalid_request'); end if;
  else v_sources:=array[]::uuid[];
  end if;
  insert into private.candidates(id,engagement_id,session_id,name,position,origin) values(p_id,p_engagement,cur.id,v_name,v_pos,'facilitator');
  insert into private.candidate_sources(engagement_id,candidate_id,sentence_id) select p_engagement,p_id,x from unnest(v_sources) x;

 elsif p_action in ('rename','remove','merge') then
  if b.phase not in ('review','sent') then return jsonb_build_object('status','invalid_state'); end if;
  if p->>'candidate' is null or p->>'candidate' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
  select * into c1 from private.candidates where id=(p->>'candidate')::uuid and session_id=cur.id and status='standing' and not deleted;
  if c1.id is null then return jsonb_build_object('status','missing'); end if;
  if p_action='rename' then
   v_name:=btrim(regexp_replace(coalesce(p->>'name',''),'\s+',' ','g'));
   if length(v_name) not between 1 and 120 then return jsonb_build_object('status','invalid_request'); end if;
   if lower(v_name)=lower(c1.name) then return jsonb_build_object('status','unchanged','version',r.version); end if;
   if exists(select 1 from private.candidates where session_id=cur.id and status='standing' and not deleted and lower(name)=lower(v_name) and id<>c1.id) then return jsonb_build_object('status','exists'); end if;
   update private.candidates set name=v_name,edited=true where id=c1.id;
  elsif p_action='remove' then
   update private.candidates set status='removed' where id=c1.id;
  else
   if p->>'into' is null or p->>'into' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or p->>'into'=p->>'candidate' then return jsonb_build_object('status','invalid_request'); end if;
   select * into c2 from private.candidates where id=(p->>'into')::uuid and session_id=cur.id and status='standing' and not deleted;
   if c2.id is null then return jsonb_build_object('status','missing'); end if;
   v_name:=btrim(regexp_replace(coalesce(p->>'name',''),'\s+',' ','g'));
   if length(v_name)>120 then return jsonb_build_object('status','invalid_request'); end if;
   if v_name<>'' and lower(v_name)<>lower(c2.name) and exists(select 1 from private.candidates where session_id=cur.id and status='standing' and not deleted and lower(name)=lower(v_name) and id<>c2.id and id<>c1.id) then return jsonb_build_object('status','exists'); end if;
   perform private.candidate_merge(c1.id,c2.id,nullif(v_name,''));
  end if;
  perform private.candidate_tidy(cur.id);

 elsif p_action in ('accept','dismiss') then
  if b.phase<>'sent' then return jsonb_build_object('status','invalid_state'); end if;
  if jsonb_typeof(p->'ids') is distinct from 'array' or jsonb_array_length(p->'ids') not between 1 and 100
   or exists(select 1 from jsonb_array_elements(p->'ids') v where jsonb_typeof(v)<>'string' or v#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return jsonb_build_object('status','invalid_request'); end if;
  select array_agg(distinct (v#>>'{}')::uuid) into ids from jsonb_array_elements(p->'ids') v;
  if (select count(*) from private.candidate_suggestions where id=any(ids) and session_id=cur.id and status='pending' and not deleted)<>cardinality(ids) then return jsonb_build_object('status','missing'); end if;
  if p_action='dismiss' then
   update private.candidate_suggestions set status='dismissed' where id=any(ids);
  else
   select * into sg from private.candidate_suggestions where id=any(ids) order by created_at,id limit 1;
   if sg.kind='add' then
    if n>=12 then return jsonb_build_object('status','full'); end if;
    if exists(select 1 from private.candidates where session_id=cur.id and status='standing' and not deleted and lower(name)=lower(sg.text)) then return jsonb_build_object('status','exists'); end if;
    insert into private.candidates(engagement_id,session_id,name,position,origin) values(p_engagement,cur.id,sg.text,v_pos,'phone');
   elsif sg.kind='rename' then
    select * into c1 from private.candidates where id=sg.candidate_id and session_id=cur.id and status='standing' and not deleted;
    if c1.id is null then return jsonb_build_object('status','missing'); end if;
    if exists(select 1 from private.candidates where session_id=cur.id and status='standing' and not deleted and lower(name)=lower(sg.text) and id<>c1.id) then return jsonb_build_object('status','exists'); end if;
    update private.candidates set name=sg.text,edited=true where id=c1.id;
   else
    select * into c1 from private.candidates where id=sg.candidate_id and session_id=cur.id and status='standing' and not deleted;
    select * into c2 from private.candidates where id=sg.into_id and session_id=cur.id and status='standing' and not deleted;
    if c1.id is null or c2.id is null then return jsonb_build_object('status','missing'); end if;
    if sg.text<>'' and lower(sg.text)<>lower(c2.name) and exists(select 1 from private.candidates where session_id=cur.id and status='standing' and not deleted and lower(name)=lower(sg.text) and id<>c2.id and id<>c1.id) then return jsonb_build_object('status','exists'); end if;
    perform private.candidate_merge(c1.id,c2.id,nullif(sg.text,''));
   end if;
   update private.candidate_suggestions set status='accepted' where id=any(ids);
  end if;
  perform private.candidate_tidy(cur.id);

 elsif p_action='send' then
  if b.phase<>'review' then return jsonb_build_object('status','invalid_state'); end if;
  if n<2 then return jsonb_build_object('status','too_few','n',n); end if;
  update private.candidate_boards set phase='sent' where session_id=cur.id;
 elsif p_action='hold' then
  if b.phase<>'sent' then return jsonb_build_object('status','invalid_state'); end if;
  update private.candidate_boards set phase='review' where session_id=cur.id;
 elsif p_action='open_points' then
  if b.phase<>'sent' then return jsonb_build_object('status','invalid_state'); end if;
  if n<2 then return jsonb_build_object('status','too_few','n',n); end if;
  if n>8 then return jsonb_build_object('status','too_many','n',n); end if;
  update private.candidate_suggestions set status='dismissed' where session_id=cur.id and status='pending' and not deleted;
  update private.candidate_boards set phase='points',cut=coalesce(cut,case when cur.options->>'cut' ~ '^[456]$' then (cur.options->>'cut')::integer end,5) where session_id=cur.id;
 elsif p_action='back' then
  if b.phase<>'points' then return jsonb_build_object('status','invalid_state'); end if;
  if exists(select 1 from private.bar_answers(p_engagement,cur.id)) then return jsonb_build_object('status','has_points'); end if;
  update private.candidate_boards set phase='sent' where session_id=cur.id;
 elsif p_action='cut' then
  if b.phase not in ('sent','points') then return jsonb_build_object('status','invalid_state'); end if;
  if jsonb_typeof(p->'cut') is distinct from 'number' or p->>'cut' !~ '^[456]$' then return jsonb_build_object('status','invalid_request'); end if;
  v_cut:=(p->>'cut')::integer;
  if v_cut is not distinct from b.cut then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.candidate_boards set cut=v_cut where session_id=cur.id;

 else -- mark
  if b.phase not in ('points','marked') then return jsonb_build_object('status','invalid_state'); end if;
  if p ? 'ids' then
   if jsonb_typeof(p->'ids') is distinct from 'array' or jsonb_array_length(p->'ids') not between 1 and 8
    or exists(select 1 from jsonb_array_elements(p->'ids') v where jsonb_typeof(v)<>'string' or v#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return jsonb_build_object('status','invalid_request'); end if;
   select array_agg(x order by o) into v_marked from (select (v#>>'{}')::uuid as x,min(ord) as o from jsonb_array_elements(p->'ids') with ordinality t(v,ord) group by 1) z;
   if (select count(*) from private.candidates where id=any(v_marked) and session_id=cur.id and status='standing' and not deleted)<>cardinality(v_marked) then return jsonb_build_object('status','missing'); end if;
  else
   -- With no choice named, the candidates above the cut line, in the order the points put them.
   if not exists(select 1 from private.bar_answers(p_engagement,cur.id)) then return jsonb_build_object('status','no_points'); end if;
   select array_agg((x->>'key')::uuid order by (x->>'place')::integer) into v_marked
    from (select x from jsonb_array_elements(private.results_candidates(p_engagement,cur.id,array[]::text[])->'bars') x order by (x->>'place')::integer limit coalesce(b.cut,5)) z;
  end if;
  v_dec:=btrim(coalesce(p->>'reasons',''));
  if length(v_dec)>1000 then return jsonb_build_object('status','invalid_request'); end if;
  -- Marking again replaces the earlier marks, until an outcome has been confirmed or has bullets.
  select coalesce(array_agg(c.outcome_id),array[]::uuid[]) into v_old from private.candidates c where c.session_id=cur.id and c.outcome_id is not null;
  if exists(select 1 from private.vision_outcomes o where o.id=any(v_old) and not o.deleted and (o.status<>'provisional'
    or exists(select 1 from private.outcome_indicators i where i.outcome_id=o.id and not i.deleted))) then return jsonb_build_object('status','locked'); end if;
  update private.vision_outcomes set deleted=true,decision_id=null where id=any(v_old);
  update private.candidates set outcome_id=null where session_id=cur.id and outcome_id is not null;
  insert into private.decisions(id,engagement_id,session_id,subject,subject_id,subject_label,decision,reasons,counts,marked_by)
   values(p_id,p_engagement,cur.id,'cut_line',cur.id,'Provisional Vision Outcomes','Marked '||cardinality(v_marked)||' provisional Vision Outcomes: '||left((select string_agg(c.name,'; ' order by array_position(v_marked,c.id)) from private.candidates c where c.id=any(v_marked)),300),
    v_dec,jsonb_build_object('total',coalesce((r.results->>'total')::integer,0),'people',coalesce((r.results->>'people')::integer,0),'cut',coalesce(b.cut,5)),me);
  for rec in select c.id,c.name from private.candidates c where c.id=any(v_marked) order by array_position(v_marked,c.id) loop
   insert into private.vision_outcomes(engagement_id,title,status,position,decision_id) values(p_engagement,left(rec.name,200),'provisional',i,p_id) returning id into v_new;
   update private.candidates set outcome_id=v_new where id=rec.id;
   i:=i+1;
  end loop;
  update private.candidate_boards set phase='marked',marked_at=clock_timestamp(),decision_id=p_id where session_id=cur.id;
 end if;

 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,me,'candidates_'||p_action,cur.id,r.version,clock_timestamp());
 select split_part(btrim(name),' ',1) into who from public.clearway_users where id=me;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action','candidates_'||p_action,'by',who,'version',r.version,'changed',true));
 return jsonb_build_object('status','ok','version',r.version);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

-- A merge: the first candidate joins the second. Its source sentences go with it, and the second takes a new name if given.
create function private.candidate_merge(p_from uuid,p_into uuid,p_name text) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into private.candidate_sources(engagement_id,candidate_id,sentence_id)
  select cs.engagement_id,p_into,cs.sentence_id from private.candidate_sources cs where cs.candidate_id=p_from and not cs.deleted
  on conflict do nothing;
 update private.candidates set status='merged',merged_into=p_into where id=p_from;
 update private.candidates set edited=true,name=coalesce(p_name,name) where id=p_into;
end $$;

-- ---------- Practice reset also clears the candidates ----------
-- Step 1's function with the candidate tables added.
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

-- ---------- Public wrappers, as the other kinds ----------
create function public.candidate_suggest(p_engagement uuid,p_id uuid,p_session uuid,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.candidate_suggest(p_engagement,p_id,p_session,p) $$;
create function public.candidates_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.candidates_control(p_engagement,p_id,p_action,p) $$;
create function public.candidates_state(p_engagement uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.candidates_state(p_engagement) $$;

revoke all on function private.ai_on(uuid),private.options_candidates(jsonb,uuid),private.candidate_name(text),private.candidate_board(uuid),private.candidate_tidy(uuid),
 private.candidate_sentence_open(uuid),private.candidate_inputs(uuid),private.candidate_merge(uuid,uuid,text),
 private.ai_claim_base3(uuid,uuid,text,jsonb),private.ai_apply_base3(uuid,uuid,jsonb,jsonb),private.ai_claim(uuid,uuid,text,jsonb),private.ai_apply(uuid,uuid,jsonb,jsonb),
 private.parse_candidates(public.sessions,text,jsonb),private.results_candidates(uuid,uuid,text[]),private.items_candidates(uuid,text[]),
 private.candidate_suggest(uuid,uuid,uuid,jsonb),private.candidates_state(uuid),private.candidates_control(uuid,uuid,text,jsonb),private.reset_practice_room(),
 public.candidate_suggest(uuid,uuid,uuid,jsonb),public.candidates_control(uuid,uuid,text,jsonb),public.candidates_state(uuid)
 from public,anon,authenticated;
-- The engine finds options, parse, results and items by name; the wrappers call the private functions as the signed-in caller.
grant execute on function private.candidate_suggest(uuid,uuid,uuid,jsonb),private.candidates_state(uuid),private.candidates_control(uuid,uuid,text,jsonb),private.reset_practice_room(),
 public.candidate_suggest(uuid,uuid,uuid,jsonb),public.candidates_control(uuid,uuid,text,jsonb),public.candidates_state(uuid) to authenticated;
-- The worker's claim and apply keep their grants (service role); the renamed originals are for the wrappers.
grant execute on function private.ai_claim(uuid,uuid,text,jsonb),private.ai_apply(uuid,uuid,jsonb,jsonb),private.ai_claim_base3(uuid,uuid,text,jsonb),private.ai_apply_base3(uuid,uuid,jsonb,jsonb) to service_role;
commit;
