-- Milestone 3, step 5: AI, live (INT-01, INT-02 and INT-03's AI states, FAIL-09).
-- Live only, after merge and Chris's approval. No session is started and no data is seeded.
--
-- AI is never in the path from phone to TV. Answers are stored and broadcast by
-- live_submit exactly as before; AI work runs afterwards on the server, as its own
-- path, and its results arrive as merges, groups and a summary that rearrange what is
-- already on screen. The server's worker (lib/ai) uses the service role only:
--   private.ai_claim(session, lease, model, versions) -> the job that is due, its inputs, a lease
--   private.ai_apply(run, lease, output, usage)        -> applies the output under the merge limits
--   private.ai_fail(run, lease, error, usage)          -> records a failed or timed-out call
-- One lease per session, so a second trigger never runs the same work twice, and an apply
-- whose lease has gone (applied already, expired, or AI switched off meanwhile) changes nothing.
-- The merge limits are enforced here, in code, never by the prompt: never more than four
-- items into one in a single step, at least 60 percent of items left standing, never a
-- number dropped, never a quote merged, never items of different kinds (every merge is
-- within one session). AI never receives attendee identity fields: inputs carry answer
-- text and counts only.
--
-- Shared functions redefined (step 5 only, as the wave 2 brief allows):
--  * private.results_word_cloud: AI combines applied while AI is on (survivor marked ai, merged keys).
--  * private.results_wall: adds ai (on or off), the AI groups and the summary shown after Show summary.
--  * private.qa_board and private.qa_root: AI folds (made_by 'ai') apply only while AI is on,
--    so AI off shows the questions as matching words left them. Every other rule is step 4's.
--  * private.options_qa: also takes ai (on by default). New: options_word_cloud, options_wall.
begin;

-- ---------- Tables ----------
-- Per session: the live AI switch (null follows the run of show), Show summary, and the
-- worker's lease and watermarks.
create table private.ai_sessions (
 session_id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 ai boolean,
 summary_shown boolean not null default false,
 lease_id uuid,
 lease_run uuid,
 lease_until timestamptz,
 combine_seen integer not null default 0 check(combine_seen>=0),
 group_seen_at timestamptz,
 fold_seen_at timestamptz,
 last_ok_at timestamptz,
 last_failed_at timestamptz,
 last_error text check(last_error is null or length(last_error)<=200),
 last_ms integer check(last_ms is null or last_ms between 0 and 600000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create index ai_sessions_engagement_idx on private.ai_sessions(engagement_id);

-- AI run (PRD data model): job, model, prompt version, inputs, output, cost, time.
create table private.ai_runs (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 job text not null check(job in ('combine_words','group_wall','summarize_wall','fold_questions')),
 model text not null check(length(model) between 1 and 100),
 prompt_version text not null check(length(prompt_version) between 1 and 60),
 inputs jsonb not null check(jsonb_typeof(inputs)='object' and pg_column_size(inputs)<=262144),
 output jsonb check(output is null or (jsonb_typeof(output)='object' and pg_column_size(output)<=262144)),
 status text not null default 'running' check(status in ('running','ok','failed','stale','discarded')),
 changed boolean not null default false,
 input_tokens integer check(input_tokens is null or input_tokens between 0 and 10000000),
 output_tokens integer check(output_tokens is null or output_tokens between 0 and 10000000),
 cost_usd numeric(12,6) check(cost_usd is null or cost_usd between 0 and 1000),
 ms integer check(ms is null or ms between 0 and 600000),
 error text check(error is null or length(error)<=200),
 finished_at timestamptz,
 undone_at timestamptz,
 undone_by uuid references public.clearway_users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create index ai_runs_session_idx on private.ai_runs(session_id,engagement_id,created_at desc);
create index ai_runs_engagement_idx on private.ai_runs(engagement_id);
create index ai_runs_undone_idx on private.ai_runs(undone_by);

-- Word cloud combines (PRD "Merge"): a member word shown with its survivor, and undo.
create table private.ai_word_merges (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 survivor_key text not null check(length(survivor_key) between 1 and 300),
 member_key text not null check(length(member_key) between 1 and 300),
 run_id uuid not null references private.ai_runs(id),
 undone_at timestamptz,
 undone_by uuid references public.clearway_users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 check(survivor_key<>member_key),
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create unique index ai_word_merges_member_idx on private.ai_word_merges(session_id,member_key) where undone_at is null and not deleted;
create index ai_word_merges_session_idx on private.ai_word_merges(session_id,engagement_id);
create index ai_word_merges_engagement_idx on private.ai_word_merges(engagement_id);
create index ai_word_merges_run_idx on private.ai_word_merges(run_id);
create index ai_word_merges_undone_idx on private.ai_word_merges(undone_by);

-- Cluster (PRD data model): label, members, pinned flag, AI version (its run).
create table private.ai_groups (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 label text not null check(length(label) between 1 and 40),
 ai_label text not null check(length(ai_label) between 1 and 40),
 renamed_by uuid references public.clearway_users(id),
 renamed_at timestamptz,
 pinned boolean not null default false,
 run_id uuid not null references private.ai_runs(id),
 undone_at timestamptz,
 undone_by uuid references public.clearway_users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create index ai_groups_session_idx on private.ai_groups(session_id,engagement_id);
create index ai_groups_engagement_idx on private.ai_groups(engagement_id);
create index ai_groups_run_idx on private.ai_groups(run_id);
create index ai_groups_renamed_idx on private.ai_groups(renamed_by);
create index ai_groups_undone_idx on private.ai_groups(undone_by);

-- One row per answer in a group. An answer is in at most one group; once its group is
-- undone or it is taken out, AI never groups it again (it stays in arrival order).
create table private.ai_group_members (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references private.ai_groups(id),
 submission_id uuid not null references public.submissions(id),
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 run_id uuid not null references private.ai_runs(id),
 removed_at timestamptz,
 removed_by uuid references public.clearway_users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create unique index ai_group_members_answer_idx on private.ai_group_members(submission_id) where removed_at is null and not deleted;
create index ai_group_members_group_idx on private.ai_group_members(group_id);
create index ai_group_members_session_idx on private.ai_group_members(session_id,engagement_id);
create index ai_group_members_engagement_idx on private.ai_group_members(engagement_id);
create index ai_group_members_run_idx on private.ai_group_members(run_id);
create index ai_group_members_removed_idx on private.ai_group_members(removed_by);
create index ai_group_members_submission_all_idx on private.ai_group_members(submission_id);

-- The open text wall's AI summary: a short read of the room, kept with what it read.
create table private.ai_summaries (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 text text not null check(length(text) between 1 and 600),
 answers integer not null check(answers>=0),
 cut_at timestamptz not null,
 run_id uuid not null references private.ai_runs(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create index ai_summaries_session_idx on private.ai_summaries(session_id,engagement_id,created_at desc);
create index ai_summaries_engagement_idx on private.ai_summaries(engagement_id);
create index ai_summaries_run_idx on private.ai_summaries(run_id);

alter table private.ai_sessions enable row level security;
alter table private.ai_sessions force row level security;
alter table private.ai_runs enable row level security;
alter table private.ai_runs force row level security;
alter table private.ai_word_merges enable row level security;
alter table private.ai_word_merges force row level security;
alter table private.ai_groups enable row level security;
alter table private.ai_groups force row level security;
alter table private.ai_group_members enable row level security;
alter table private.ai_group_members force row level security;
alter table private.ai_summaries enable row level security;
alter table private.ai_summaries force row level security;
revoke all on private.ai_sessions,private.ai_runs,private.ai_word_merges,private.ai_groups,private.ai_group_members,private.ai_summaries from public,anon,authenticated;
grant select,insert,update,delete on private.ai_sessions,private.ai_runs,private.ai_word_merges,private.ai_groups,private.ai_group_members,private.ai_summaries to service_role;
create trigger touch_record before update on private.ai_sessions for each row execute function private.touch_live_record('session_id');
create trigger touch_record before update on private.ai_runs for each row execute function private.touch_live_record('id');
create trigger touch_record before update on private.ai_word_merges for each row execute function private.touch_live_record('id');
create trigger touch_record before update on private.ai_groups for each row execute function private.touch_live_record('id');
create trigger touch_record before update on private.ai_group_members for each row execute function private.touch_live_record('id');
create trigger touch_record before update on private.ai_summaries for each row execute function private.touch_live_record('id');

-- ---------- Switches ----------
-- AI is on for a session when the engagement has it on, the kind can use it, and the
-- session's own switch (the live control, else the run of show's setting) is on.
create function private.ai_on(p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select coalesce(e.settings->>'ai_enabled','false')='true' and s.interaction in ('word_cloud','wall','qa')
   and coalesce(a.ai,case when jsonb_typeof(s.options->'ai')='boolean' then (s.options->>'ai')::boolean end,true)
  from public.sessions s join public.engagements e on e.id=s.engagement_id and not e.deleted
  left join private.ai_sessions a on a.session_id=s.id and not a.deleted
  where s.id=p_session and not s.deleted),false)
$$;
-- The open text wall's summary is available unless the run of show turned it off.
create function private.ai_summary_on(p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.ai_on(p_session) and coalesce((select s.interaction='wall' and coalesce(case when jsonb_typeof(s.options->'summary')='boolean' then (s.options->>'summary')::boolean end,true)
  from public.sessions s where s.id=p_session),false)
$$;

-- ---------- Rules that are code, not prompt ----------
-- A quote: any double quotation mark, or text wrapped in single quotes.
create function private.ai_quoted(p_text text) returns boolean
language sql immutable security invoker set search_path='' as $$
 select coalesce(p_text ~ '["“”«»„]' or p_text ~ '^\s*[''‘].*[''’]\s*$',false)
$$;
-- The numbers written in a text, so a merge can never drop one.
create function private.ai_numbers(p_text text) returns text[]
language sql immutable security invoker set search_path='' as $$
 select coalesce(array_agg(distinct (m)[1] order by (m)[1]),array[]::text[]) from regexp_matches(coalesce(p_text,''),'([0-9]+)','g') m
$$;
-- A short group label: up to 40 characters and six words, one line, no quotes, through the word filter.
create function private.ai_label(p_text text) returns text
language sql stable security invoker set search_path='' as $$
 select case when t is not null and length(t) between 1 and 40 and cardinality(regexp_split_to_array(t,'\s+'))<=6 and not private.ai_quoted(t) and not private.screen_text(t) then t end
 from (select nullif(btrim(regexp_replace(coalesce(p_text,''),'\s+',' ','g')),'') as t) x
$$;

-- ---------- Options ----------
create function private.options_word_cloud(p jsonb,p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when jsonb_typeof(p)='object' and not exists(select 1 from jsonb_object_keys(p) k where k<>'ai') and coalesce(jsonb_typeof(p->'ai'),'boolean')='boolean'
  then case when p ? 'ai' then jsonb_build_object('ai',(p->>'ai')::boolean) else '{}'::jsonb end end
$$;
create function private.options_wall(p jsonb,p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when jsonb_typeof(p)='object' and not exists(select 1 from jsonb_object_keys(p) k where k not in ('ai','summary'))
  and coalesce(jsonb_typeof(p->'ai'),'boolean')='boolean' and coalesce(jsonb_typeof(p->'summary'),'boolean')='boolean'
  then (case when p ? 'ai' then jsonb_build_object('ai',(p->>'ai')::boolean) else '{}'::jsonb end)||(case when p ? 'summary' then jsonb_build_object('summary',(p->>'summary')::boolean) else '{}'::jsonb end) end
$$;
-- Step 4's one setting, plus ai.
create or replace function private.options_qa(p jsonb,p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when jsonb_typeof(p)='object' and not exists(select 1 from jsonb_object_keys(p) k where k not in ('any_time','ai'))
  and coalesce(jsonb_typeof(p->'any_time'),'boolean')='boolean' and coalesce(jsonb_typeof(p->'ai'),'boolean')='boolean'
  then jsonb_build_object('any_time',coalesce((p->>'any_time')::boolean,false))||case when p ? 'ai' then jsonb_build_object('ai',(p->>'ai')::boolean) else '{}'::jsonb end end
$$;

-- ---------- Results ----------
-- Step 1's word cloud, plus AI combines while AI is on: a member word counts with its
-- survivor, which carries ai and the keys it absorbed. Hiding a combined word hides it all.
create or replace function private.results_word_cloud(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
  with active as (
    select s.* from public.submissions s
    where s.engagement_id=p_engagement and s.session_id=p_session and not s.deleted and not s.withdrawn and not s.hidden
  ), items as (
    select active.attendee_id,coalesce(active.server_received_at,active.created_at) as arrived,a->>'key' as key,a->>'text' as text from active cross join lateral jsonb_array_elements(active.answers) a
    where not (a->>'key'=any(coalesce(p_hidden,array[]::text[])))
  ), m as (
    select w.member_key,w.survivor_key from private.ai_word_merges w
    where w.session_id=p_session and w.undone_at is null and not w.deleted and private.ai_on(p_session)
  ), mapped as (
    select i.*,case when m.survivor_key is not null and exists(select 1 from items x where x.key=m.survivor_key) then m.survivor_key else i.key end as root
    from items i left join m on m.member_key=i.key
    where m.survivor_key is null or not (m.survivor_key=any(coalesce(p_hidden,array[]::text[])))
  ), words as (
    select root as key,coalesce(min(text) filter (where key=root),min(text)) as label,count(*)::integer as count,min(arrived) as first,
     coalesce(jsonb_agg(distinct key) filter (where key<>root),'[]'::jsonb) as merged
    from mapped group by root
  ), sized as (select *,max(count) over() as maximum,row_number() over(order by first,key) as arrival from words)
  select jsonb_build_object('total',(select count(*) from mapped),'people',(select count(distinct attendee_id) from mapped),'words',coalesce((select jsonb_agg(jsonb_build_object(
      'key',key,'text',label,'count',count,'size',case when maximum<=1 then 56 else 56+112*(sqrt(count)-1)/(sqrt(maximum)-1) end,
      'level',case when count=maximum and count>1 then 'leader' when count>1 then 'repeated' else 'single' end,'order',arrival)
      ||case when jsonb_array_length(merged)>0 then jsonb_build_object('ai',true,'merged',merged) else '{}'::jsonb end order by key) from sized),'[]'::jsonb))
$$;

-- Step 1's wall counts, plus ai, the AI groups (two or more standing answers each, at most
-- twelve, largest first) and the summary once the facilitator has tapped Show summary.
create or replace function private.results_wall(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with base as (
  select jsonb_build_object('total',count(*),'people',count(distinct s.attendee_id),'words','[]'::jsonb) as r
  from public.submissions s cross join lateral jsonb_array_elements(s.answers) a
  where s.engagement_id=p_engagement and s.session_id=p_session and not s.deleted and not s.withdrawn and not s.hidden
    and not (a->>'key'=any(coalesce(p_hidden,array[]::text[])))
 ), o as (select private.ai_on(p_session) as ai,private.ai_summary_on(p_session) and coalesce((select a.summary_shown from private.ai_sessions a where a.session_id=p_session and not a.deleted),false) as summary
 ), groups as (
  select g.id,g.label,g.pinned,g.created_at,jsonb_agg(x.id order by x.server_received_at,x.id) as ids,count(*)::integer as n
  from private.ai_groups g join private.ai_group_members gm on gm.group_id=g.id and gm.removed_at is null and not gm.deleted
  join public.submissions x on x.id=gm.submission_id and not x.deleted and not x.withdrawn and not x.hidden
  where g.session_id=p_session and g.undone_at is null and not g.deleted and (select ai from o)
  group by g.id having count(*)>=2
 )
 select b.r||jsonb_build_object('ai',o.ai)
  ||case when o.ai then jsonb_build_object('groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'label',g.label,'count',g.n,'ids',g.ids,'pinned',g.pinned) order by g.n desc,g.created_at,g.id)
     from (select * from groups order by n desc,created_at,id limit 12) g),'[]'::jsonb)) else '{}'::jsonb end
  ||case when o.summary then coalesce((select jsonb_build_object('summary',jsonb_build_object('id',m.id,'text',m.text,'answers',m.answers,'at',(extract(epoch from m.created_at)*1000)::bigint))
     from private.ai_summaries m where m.session_id=p_session and not m.deleted order by m.created_at desc limit 1),'{}'::jsonb) else '{}'::jsonb end
 from base b,o
$$;

-- Step 4's group root: an AI fold counts only while AI is on.
create or replace function private.qa_root(p_question uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select coalesce((select m.survivor_id from private.qa_merges m join public.submissions s on s.id=m.survivor_id
   where m.member_id=p_question and m.undone_at is null and not m.deleted and not s.deleted and not s.withdrawn and not s.hidden
    and (m.made_by<>'ai' or private.ai_on(m.session_id))),p_question)
$$;

-- Step 4's board, unchanged except that AI folds count only while AI is on.
create or replace function private.qa_board(p_session uuid,p_all boolean) returns jsonb
language sql stable security definer set search_path='' as $$
 with o as (select private.ai_on(p_session) as ai
 ), q as (
  select x.id,x.attendee_id,x.text,x.hidden,coalesce(x.server_received_at,x.created_at) as at,qq.edited_text,qq.answered_at,
   m.id as merge_id,m.survivor_id,m.made_by
  from public.submissions x join private.qa_questions qq on qq.submission_id=x.id and not qq.deleted
  left join private.qa_merges m on m.member_id=x.id and m.undone_at is null and not m.deleted and (m.made_by<>'ai' or (select ai from o))
  where x.session_id=p_session and not x.deleted and not x.withdrawn
 ), standing as (select * from q where not hidden
 ), rooted as (
  select s.*,case when s.survivor_id is not null and exists(select 1 from standing r where r.id=s.survivor_id) then s.survivor_id else s.id end as root from standing s
 ), grouped as (
  select r.root,count(distinct r.attendee_id)::integer as askers,count(*)::integer-1 as folded,max(r.at) as asked_at,bool_or(r.made_by='ai' and r.id<>r.root) as ai,
   jsonb_agg(r.id order by r.at,r.id) as ids,
   jsonb_agg(jsonb_build_object('id',r.id,'text',r.text,'merge',r.merge_id,'by',r.made_by) order by r.at,r.id) filter (where r.id<>r.root) as members
  from rooted r group by r.root
 ), voters as (
  select r.root,v.attendee_id,max(v.server_received_at) as at from private.qa_votes v join rooted r on r.id=v.question_id
  where v.voted and not v.deleted and not exists(select 1 from rooted a where a.root=r.root and a.attendee_id=v.attendee_id)
  group by r.root,v.attendee_id
 ), scored as (
  select g.*,coalesce(v.n,0)::integer as votes,greatest(g.asked_at,v.at) as active_at,root.text,root.edited_text,root.answered_at
  from grouped g join standing root on root.id=g.root
  left join (select root,count(*) as n,max(at) as at from voters group by root) v on v.root=g.root
 ), ranked as (
  select s.*,2*s.askers+s.votes as score,case when s.answered_at is null then row_number() over(partition by s.answered_at is null order by 2*s.askers+s.votes desc,s.active_at desc,s.root) end as rank
  from scored s
 ), listed as (
  select * from ranked where answered_at is null and rank<=200
  union all select * from (select * from ranked where answered_at is not null order by answered_at desc limit 50) a
 )
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',l.root,'text',coalesce(l.edited_text,l.text),'askers',l.askers,'votes',l.votes,'people',l.askers+l.votes,'score',l.score,
   'rank',l.rank,'folded',l.folded,'ai',case when l.ai then true end,'ids',l.ids,'answered',l.answered_at is not null,'edited',l.edited_text is not null,
   'at',(extract(epoch from l.active_at)*1000)::bigint,
   'original',case when p_all and l.edited_text is not null then l.text end,'members',case when p_all then coalesce(l.members,'[]'::jsonb) end))
   order by l.answered_at is not null,l.rank,l.answered_at desc,l.root),'[]'::jsonb)
  ||case when p_all then coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'text',coalesce(h.edited_text,h.text),'askers',1,'votes',0,'people',1,'score',2,'folded',0,
     'ids',jsonb_build_array(h.id),'answered',h.answered_at is not null,'edited',h.edited_text is not null,'hidden',true,'members','[]'::jsonb,
     'at',(extract(epoch from h.at)*1000)::bigint) order by h.at desc,h.id) from (select * from q where hidden and survivor_id is null order by at desc limit 100) h),'[]'::jsonb)
   else '[]'::jsonb end
 from listed l
$$;

-- ---------- What AI may work from ----------
-- Wall answers AI may still group: standing, never in a group (an answer taken out or
-- whose group was undone stays apart), oldest first.
create function private.ai_wall_open(p_session uuid) returns table(id uuid,text text,received timestamptz)
language sql stable security definer set search_path='' as $$
 select x.id,x.text,coalesce(x.server_received_at,x.created_at) from public.submissions x
 where x.session_id=p_session and not x.deleted and not x.withdrawn and not x.hidden
  and not exists(select 1 from private.ai_group_members gm where gm.submission_id=x.id and not gm.deleted)
 order by coalesce(x.server_received_at,x.created_at),x.id
$$;
-- Standing groups with their standing answers.
create function private.ai_wall_groups(p_session uuid) returns table(id uuid,label text,pinned boolean,renamed boolean,n integer,texts text[],created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select g.id,g.label,g.pinned,g.renamed_by is not null,count(x.id)::integer,(array_agg(x.text order by x.server_received_at,x.id) filter (where x.id is not null))[1:4],g.created_at
 from private.ai_groups g left join private.ai_group_members gm on gm.group_id=g.id and gm.removed_at is null and not gm.deleted
 left join public.submissions x on x.id=gm.submission_id and not x.deleted and not x.withdrawn and not x.hidden
 where g.session_id=p_session and g.undone_at is null and not g.deleted
 group by g.id order by g.created_at,g.id
$$;

-- ---------- The worker's claim ----------
-- The job due for a session, if any, with its inputs and a lease. One lease at a time per
-- session: a second trigger while one runs gets busy, and the running worker claims again
-- when it finishes, so nothing that arrived meanwhile is missed. Inputs carry only answer
-- text and counts, each under a short ref (w1, a1, g1, q1), never an attendee field.
create function private.ai_claim(p_session uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; a private.ai_sessions; v_job text; v_inputs jsonb; v_run uuid; n integer; t timestamptz:=clock_timestamp(); last_sum private.ai_summaries; fresh integer; standing integer;
begin
 if p_session is null or p_lease is null or p_model is null or length(p_model) not between 1 and 100 or jsonb_typeof(p_versions) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into s from public.sessions where id=p_session and not deleted;
 if s.id is null then return jsonb_build_object('status','missing'); end if;
 if not private.ai_on(s.id) or s.state not in ('live','phones_down','open') then return jsonb_build_object('status','off'); end if;
 insert into private.ai_sessions(session_id,engagement_id) values(s.id,s.engagement_id) on conflict(session_id) do nothing;
 select * into a from private.ai_sessions where session_id=s.id for update;
 if a.lease_id is not null and a.lease_until>t then return jsonb_build_object('status','busy'); end if;
 -- A failed call cools down for ten seconds, so an outage never hammers the API.
 if a.last_failed_at is not null and a.last_failed_at>t-interval '10 seconds' and (a.last_ok_at is null or a.last_failed_at>a.last_ok_at) then
  return jsonb_build_object('status','cooling','ms',(extract(epoch from a.last_failed_at+interval '10 seconds'-t)*1000)::integer); end if;
 if a.lease_run is not null then update private.ai_runs set status='stale',finished_at=t where id=a.lease_run and status='running'; end if;

 if s.interaction='word_cloud' then
  -- Combining starts at about 30 different answers (Default) and runs when new words arrive.
  select count(distinct x.key) into n from (select a2->>'key' as key from public.submissions y cross join lateral jsonb_array_elements(y.answers) a2
   where y.session_id=s.id and not y.deleted and not y.withdrawn and not y.hidden) x where not (x.key=any(s.hidden_keys));
  if n>=30 and n>a.combine_seen then
   v_job:='combine_words';
   select jsonb_build_object('raw',n,'threshold',30,'words',coalesce(jsonb_agg(jsonb_build_object('ref','w'||ord,'key',w->>'key','text',w->>'text','count',(w->>'count')::integer) order by ord),'[]'::jsonb))
    into v_inputs from (select w,row_number() over(order by (w->>'count')::integer desc,w->>'text',w->>'key') as ord
     from jsonb_array_elements(private.results_word_cloud(s.engagement_id,s.id,s.hidden_keys)->'words') w
     where not exists(select 1 from private.ai_word_merges m where m.session_id=s.id and m.member_key=w->>'key' and m.undone_at is not null and not m.deleted)
     order by (w->>'count')::integer desc,w->>'text' limit 200) z;
   update private.ai_sessions set combine_seen=n where session_id=s.id;
  end if;
 elsif s.interaction='wall' then
  -- The summary first, once shown: after 8 new answers or 75 seconds (Default).
  if private.ai_summary_on(s.id) and a.summary_shown then
   select * into last_sum from private.ai_summaries where session_id=s.id and not deleted order by created_at desc limit 1;
   select count(*)::integer,count(*) filter (where last_sum.id is null or coalesce(x.server_received_at,x.created_at)>last_sum.cut_at)::integer into standing,fresh
    from public.submissions x where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden;
   if standing>0 and (last_sum.id is null or fresh>=8 or (fresh>=1 and last_sum.created_at<=t-interval '75 seconds') or (standing<>last_sum.answers and last_sum.created_at<=t-interval '75 seconds')) then
    v_job:='summarize_wall';
    select jsonb_build_object('question',private.fill_years(s.prompt,(select e.base_year from public.engagements e where e.id=s.engagement_id)),'count',standing,'cut_at',t,
     'answers',coalesce((select jsonb_agg(z.text order by z.at,z.id) from (select x.id,x.text,coalesce(x.server_received_at,x.created_at) as at from public.submissions x
       where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden order by coalesce(x.server_received_at,x.created_at) desc,x.id limit 120) z),'[]'::jsonb),
     'groups',coalesce((select jsonb_agg(jsonb_build_object('label',g.label,'count',g.n) order by g.n desc) from private.ai_wall_groups(s.id) g where g.n>=2),'[]'::jsonb)) into v_inputs;
   end if;
  end if;
  if v_job is null and exists(select 1 from private.ai_wall_open(s.id) o where o.received>coalesce(a.group_seen_at,'-infinity'::timestamptz))
    and ((select count(*) from private.ai_wall_open(s.id))>=2 or exists(select 1 from private.ai_wall_groups(s.id) g where not g.pinned)) then
   v_job:='group_wall';
   select jsonb_build_object(
    'answers',coalesce((select jsonb_agg(jsonb_build_object('ref','a'||ord,'id',id,'text',text) order by ord) from (select o.*,row_number() over(order by o.received,o.id) as ord from (select * from private.ai_wall_open(s.id) limit 60) o) z),'[]'::jsonb),
    'groups',coalesce((select jsonb_agg(jsonb_build_object('ref','g'||ord,'id',id,'label',label,'pinned',pinned,'renamed',z.renamed,'count',z.n,'examples',to_jsonb(coalesce(z.texts,array[]::text[]))) order by ord)
      from (select g.*,row_number() over(order by g.created_at,g.id) as ord from private.ai_wall_groups(s.id) g) z),'[]'::jsonb)) into v_inputs;
   update private.ai_sessions set group_seen_at=t where session_id=s.id;
  end if;
 elsif s.interaction='qa' then
  select count(*) into n from jsonb_array_elements(private.qa_board(s.id,false)) e where not (e->>'answered')::boolean and not (e->>'edited')::boolean;
  if n>=2 and exists(select 1 from public.submissions x where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden
    and coalesce(x.server_received_at,x.created_at)>coalesce(a.fold_seen_at,'-infinity'::timestamptz)) then
   v_job:='fold_questions';
   select jsonb_build_object('questions',coalesce(jsonb_agg(jsonb_build_object('ref','q'||ord,'id',e->>'id','text',e->>'text','asked',(e->>'askers')::integer) order by ord),'[]'::jsonb)) into v_inputs
    from (select e,row_number() over(order by (e->>'at')::bigint,e->>'id') as ord from jsonb_array_elements(private.qa_board(s.id,false)) e
     where not (e->>'answered')::boolean and not (e->>'edited')::boolean order by (e->>'at')::bigint desc limit 80) z;
   update private.ai_sessions set fold_seen_at=t where session_id=s.id;
  end if;
 end if;
 if v_job is null then return jsonb_build_object('status','idle'); end if;
 if coalesce(p_versions->>v_job,'') !~ '^[a-z0-9_.@-]{1,60}$' then return jsonb_build_object('status','invalid_request'); end if;
 insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,created_at) values(s.engagement_id,s.id,v_job,p_model,p_versions->>v_job,v_inputs,t) returning id into v_run;
 update private.ai_sessions set lease_id=p_lease,lease_run=v_run,lease_until=t+interval '45 seconds' where session_id=s.id;
 return jsonb_build_object('status','claimed','run',v_run,'job',v_job,'prompt_version',p_versions->>v_job,'inputs',v_inputs);
end $$;

-- ---------- Applying a run under the merge limits ----------
create function private.ai_usage(p jsonb,p_key text,p_max numeric) returns numeric
language sql immutable security invoker set search_path='' as $$
 select case when jsonb_typeof(p->p_key)='number' and (p->>p_key)::numeric between 0 and p_max then (p->>p_key)::numeric end
$$;

create function private.ai_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; a private.ai_sessions; r public.room_states; s public.sessions; t timestamptz:=clock_timestamp();
 applied jsonb:='[]'::jsonb; refused jsonb:='[]'::jsonb; v_changed boolean:=false; g jsonb; refs jsonb; cur jsonb; reason text;
 survivor jsonb; members jsonb; member jsonb; before integer; standing integer; raw integer; used text[]:=array[]::text[];
 v_group uuid; v_label text; picks jsonb; groups_now integer; txt text; v_ms integer;
begin
 if p_run is null or p_lease is null then return jsonb_build_object('status','invalid_request'); end if;
 select * into run from private.ai_runs where id=p_run;
 if run.id is null then return jsonb_build_object('status','missing'); end if;
 if run.engagement_id='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(run.engagement_id::text,7)); end if;
 -- The room row first, as every writer takes it, then the session's lease.
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

 if run.job='combine_words' then
  -- Refs to words as the run saw them; the cloud as it stands now.
  select coalesce(jsonb_object_agg(w->>'ref',w),'{}'::jsonb) into refs from jsonb_array_elements(run.inputs->'words') w;
  select coalesce(jsonb_object_agg(w->>'key',w),'{}'::jsonb) into cur from jsonb_array_elements(private.results_word_cloud(run.engagement_id,run.session_id,s.hidden_keys)->'words') w;
  select count(*) into before from jsonb_object_keys(cur);
  select count(distinct x.key) into raw from (select a2->>'key' as key from public.submissions y cross join lateral jsonb_array_elements(y.answers) a2
   where y.session_id=run.session_id and not y.deleted and not y.withdrawn and not y.hidden) x where not (x.key=any(s.hidden_keys));
  standing:=before;
  for g in select v from jsonb_array_elements(case when jsonb_typeof(p_output->'groups')='array' then p_output->'groups' else '[]'::jsonb end) v limit 100 loop
   reason:=null; survivor:=refs->(g->>'survivor');
   members:=case when jsonb_typeof(g->'members')='array' then g->'members' else '[]'::jsonb end;
   if survivor is null or jsonb_array_length(members)=0 or exists(select 1 from jsonb_array_elements(members) x where jsonb_typeof(x)<>'string' or not refs ? (x#>>'{}') or x#>>'{}'=g->>'survivor')
     or (select count(distinct x#>>'{}') from jsonb_array_elements(members) x)<>jsonb_array_length(members)
     or g->>'survivor'=any(used) or exists(select 1 from jsonb_array_elements_text(members) x where x=any(used)) then reason:='unknown';
   elsif 1+jsonb_array_length(members)>4 then reason:='too_many';
   elsif not cur ? (survivor->>'key') then reason:='gone';
   elsif private.ai_quoted(survivor->>'text') then reason:='quote';
   else
    for member in select refs->x from jsonb_array_elements_text(members) x loop
     if not cur ? (member->>'key') or cur->(member->>'key') ? 'merged' then reason:='gone';
     elsif exists(select 1 from private.ai_word_merges m where m.session_id=run.session_id and m.member_key=member->>'key' and not m.deleted) then reason:='kept_apart';
     elsif private.ai_quoted(member->>'text') then reason:='quote';
     elsif not private.ai_numbers(member->>'text')<@private.ai_numbers(survivor->>'text') then reason:='number';
     end if;
     exit when reason is not null;
    end loop;
    if reason is null and (standing-jsonb_array_length(members)<0.6*before or standing-jsonb_array_length(members)<0.6*raw) then reason:='standing'; end if;
   end if;
   if reason is null then
    insert into private.ai_word_merges(engagement_id,session_id,survivor_key,member_key,run_id,created_at)
     select run.engagement_id,run.session_id,survivor->>'key',refs->x->>'key',run.id,t from jsonb_array_elements_text(members) x;
    standing:=standing-jsonb_array_length(members); v_changed:=true;
    used:=used||(g->>'survivor')||array(select jsonb_array_elements_text(members));
    applied:=applied||jsonb_build_array(jsonb_build_object('survivor',survivor->>'key','members',(select jsonb_agg(refs->x->>'key') from jsonb_array_elements_text(members) x)));
   else refused:=refused||jsonb_build_array(jsonb_build_object('group',g,'reason',reason)); end if;
  end loop;

 elsif run.job='fold_questions' then
  select coalesce(jsonb_object_agg(q->>'ref',q),'{}'::jsonb) into refs from jsonb_array_elements(run.inputs->'questions') q;
  select coalesce(jsonb_object_agg(e->>'id',e),'{}'::jsonb) into cur from jsonb_array_elements(private.qa_board(run.session_id,false)) e where not (e->>'answered')::boolean;
  select count(*) into before from jsonb_object_keys(cur);
  standing:=before;
  for g in select v from jsonb_array_elements(case when jsonb_typeof(p_output->'groups')='array' then p_output->'groups' else '[]'::jsonb end) v limit 100 loop
   reason:=null; survivor:=refs->(g->>'survivor');
   members:=case when jsonb_typeof(g->'members')='array' then g->'members' else '[]'::jsonb end;
   if survivor is null or jsonb_array_length(members)=0 or exists(select 1 from jsonb_array_elements(members) x where jsonb_typeof(x)<>'string' or not refs ? (x#>>'{}') or x#>>'{}'=g->>'survivor')
     or (select count(distinct x#>>'{}') from jsonb_array_elements(members) x)<>jsonb_array_length(members)
     or g->>'survivor'=any(used) or exists(select 1 from jsonb_array_elements_text(members) x where x=any(used)) then reason:='unknown';
   elsif 1+jsonb_array_length(members)>4 then reason:='too_many';
   elsif not cur ? (survivor->>'id') then reason:='gone';
   elsif private.ai_quoted(cur->(survivor->>'id')->>'text') then reason:='quote';
   else
    for member in select refs->x from jsonb_array_elements_text(members) x loop
     if not cur ? (member->>'id') or (cur->(member->>'id')->>'folded')::integer>0 then reason:='gone';
     elsif (cur->(member->>'id')->>'edited')::boolean then reason:='edited';
     elsif exists(select 1 from private.qa_merges m where m.member_id=(member->>'id')::uuid and not m.deleted) then reason:='kept_apart';
     elsif private.ai_quoted(cur->(member->>'id')->>'text') then reason:='quote';
     elsif not private.ai_numbers(cur->(member->>'id')->>'text')<@private.ai_numbers(cur->(survivor->>'id')->>'text') then reason:='number';
     end if;
     exit when reason is not null;
    end loop;
    if reason is null and standing-jsonb_array_length(members)<0.6*before then reason:='standing'; end if;
   end if;
   if reason is null then
    insert into private.qa_merges(engagement_id,session_id,survivor_id,member_id,made_by,detail,created_at)
     select run.engagement_id,run.session_id,(survivor->>'id')::uuid,(refs->x->>'id')::uuid,'ai',jsonb_build_object('run',run.id,'model',run.model,'prompt_version',run.prompt_version),t
     from jsonb_array_elements_text(members) x;
    standing:=standing-jsonb_array_length(members); v_changed:=true;
    used:=used||(g->>'survivor')||array(select jsonb_array_elements_text(members));
    applied:=applied||jsonb_build_array(jsonb_build_object('survivor',survivor->>'id','members',(select jsonb_agg(refs->x->>'id') from jsonb_array_elements_text(members) x)));
   else refused:=refused||jsonb_build_array(jsonb_build_object('group',g,'reason',reason)); end if;
  end loop;

 elsif run.job='group_wall' then
  select coalesce(jsonb_object_agg(x->>'ref',x),'{}'::jsonb) into refs from (select jsonb_array_elements(run.inputs->'answers') x union all select jsonb_array_elements(run.inputs->'groups') x) z;
  select count(*) into groups_now from private.ai_wall_groups(run.session_id);
  for g in select v from jsonb_array_elements(case when jsonb_typeof(p_output->'groups')='array' then p_output->'groups' else '[]'::jsonb end) v limit 40 loop
   reason:=null; v_group:=null;
   -- The answers it names that are still open, each used once, at most four per group per step.
   select coalesce(jsonb_agg(refs->x order by ord),'[]'::jsonb) into picks from jsonb_array_elements_text(case when jsonb_typeof(g->'answers')='array' then g->'answers' else '[]'::jsonb end) with ordinality y(x,ord)
    where refs ? x and refs->x ? 'text' and not x=any(used)
     and exists(select 1 from private.ai_wall_open(run.session_id) o where o.id=(refs->x->>'id')::uuid);
   if jsonb_array_length(picks)>4 then
    refused:=refused||jsonb_build_array(jsonb_build_object('group',g->>'group','answers',(select jsonb_agg(p->>'ref') from jsonb_array_elements(picks) with ordinality q(p,o) where o>4),'reason','too_many'));
    picks:=(select jsonb_agg(p order by o) from jsonb_array_elements(picks) with ordinality q(p,o) where o<=4);
   end if;
   v_label:=private.ai_label(g->>'label');
   if refs ? (g->>'group') and refs->(g->>'group') ? 'label' then
    select x.id into v_group from private.ai_groups x where x.id=(refs->(g->>'group')->>'id')::uuid and x.session_id=run.session_id and x.undone_at is null and not x.deleted;
    if v_group is null then reason:='gone';
    elsif (select pinned from private.ai_groups where id=v_group) then reason:='pinned';
    end if;
    if reason is null then
     if v_label is not null and (select renamed_by is null and label<>v_label from private.ai_groups where id=v_group) then
      update private.ai_groups set label=v_label,ai_label=v_label where id=v_group; v_changed:=true;
     end if;
    end if;
   elsif g->>'group' is not null and g->>'group' ~ '^n[0-9]{1,3}$' then
    if v_label is null then reason:='label';
    elsif jsonb_array_length(picks)<2 then reason:='too_few';
    elsif groups_now>=12 then reason:='too_many_groups';
    else
     insert into private.ai_groups(engagement_id,session_id,label,ai_label,run_id,created_at) values(run.engagement_id,run.session_id,v_label,v_label,run.id,t) returning id into v_group;
     groups_now:=groups_now+1;
    end if;
   else reason:='unknown';
   end if;
   if reason is null and jsonb_array_length(picks)>0 then
    insert into private.ai_group_members(group_id,submission_id,engagement_id,session_id,run_id,created_at)
     select v_group,(p->>'id')::uuid,run.engagement_id,run.session_id,run.id,t from jsonb_array_elements(picks) p;
    used:=used||array(select p->>'ref' from jsonb_array_elements(picks) p); v_changed:=true;
    applied:=applied||jsonb_build_array(jsonb_build_object('group',v_group,'answers',(select jsonb_agg(p->>'id') from jsonb_array_elements(picks) p)));
   elsif reason is not null then refused:=refused||jsonb_build_array(jsonb_build_object('group',g->>'group','reason',reason)); end if;
  end loop;

 elsif run.job='summarize_wall' then
  txt:=nullif(btrim(regexp_replace(coalesce(p_output->>'summary',''),'\s+',' ','g')),'');
  -- A short read of the room: it sits at the floor size beside the answers, so it stays short.
  if txt is null or length(txt)>320 then refused:=jsonb_build_array(jsonb_build_object('reason','length'));
  elsif private.screen_text(txt) then refused:=jsonb_build_array(jsonb_build_object('reason','filtered'));
  else
   insert into private.ai_summaries(engagement_id,session_id,text,answers,cut_at,run_id,created_at) values(run.engagement_id,run.session_id,txt,(run.inputs->>'count')::integer,(run.inputs->>'cut_at')::timestamptz,run.id,t);
   applied:=jsonb_build_array(jsonb_build_object('summary',length(txt)));
   v_changed:=coalesce((select summary_shown from private.ai_sessions where session_id=run.session_id),false);
  end if;
 end if;

 update private.ai_runs set status='ok',changed=v_changed,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'applied',applied,'refused',refused),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,
  cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 -- One version raise: the merge or group reaches every screen as its own event.
 if v_changed and (r.live_session_id=run.session_id or s.interaction='qa') then
  update public.room_states set results=private.live_results(run.engagement_id) where engagement_id=run.engagement_id;
 end if;
 return jsonb_build_object('status','ok','changed',v_changed,'applied',jsonb_array_length(applied),'refused',jsonb_array_length(refused));
end $$;

-- A call that failed or timed out: the room keeps working in arrival order.
create function private.ai_fail(p_run uuid,p_lease uuid,p_error text,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; a private.ai_sessions; t timestamptz:=clock_timestamp(); v_ms integer:=private.ai_usage(p_usage,'ms',600000)::integer;
begin
 select * into run from private.ai_runs where id=p_run;
 if run.id is null or p_lease is null then return jsonb_build_object('status','missing'); end if;
 select * into a from private.ai_sessions where session_id=run.session_id for update;
 if run.status<>'running' or a.lease_id is distinct from p_lease or a.lease_run is distinct from p_run then return jsonb_build_object('status','stale'); end if;
 update private.ai_runs set status='failed',finished_at=t,ms=v_ms,error=left(coalesce(p_error,'failed'),200),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,
  cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 -- The watermark goes back, so the work is tried again after the cool-down.
 update private.ai_sessions set lease_id=null,lease_run=null,lease_until=null,last_failed_at=t,last_error=left(coalesce(p_error,'failed'),200),last_ms=v_ms,
  combine_seen=case when run.job='combine_words' then 0 else combine_seen end,
  group_seen_at=case when run.job='group_wall' then null else group_seen_at end,
  fold_seen_at=case when run.job='fold_questions' then null else fold_seen_at end where session_id=run.session_id;
 return jsonb_build_object('status','ok');
end $$;

-- Sessions where AI may have work: the live one, and the Questions any time pool.
create function private.ai_due(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(distinct x),'[]'::jsonb) from (
  select r.live_session_id as x from public.room_states r where r.engagement_id=p_engagement and not r.deleted and r.live_session_id is not null and private.ai_on(r.live_session_id)
  union all select p.id from private.qa_pool(p_engagement) p where p.id is not null and private.ai_on(p.id)) z where x is not null
$$;

-- ---------- The facilitator's AI panel ----------
create function private.ai_status(p_engagement uuid,p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.room_states; s public.sessions; a private.ai_sessions; e public.engagements; t timestamptz:=clock_timestamp(); running private.ai_runs; last_change private.ai_runs; last_group private.ai_runs; out jsonb;
begin
 if not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 select * into e from public.engagements where id=p_engagement;
 if r.engagement_id is null then return jsonb_build_object('status','missing'); end if;
 if p_session is not null then select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted; end if;
 if s.id is null then select * into s from public.sessions where id=r.live_session_id and not deleted; end if;
 out:=jsonb_build_object('status','ok','version',r.version,'engagement_ai',coalesce(e.settings->>'ai_enabled','false')='true',
  'cost',(select jsonb_build_object('usd',coalesce(sum(cost_usd),0),'runs',count(*),'input_tokens',coalesce(sum(input_tokens),0),'output_tokens',coalesce(sum(output_tokens),0))
    from private.ai_runs where engagement_id=p_engagement and not deleted));
 if s.id is null or s.interaction not in ('word_cloud','wall','qa') then return out||jsonb_build_object('session',null); end if;
 select * into a from private.ai_sessions where session_id=s.id and not deleted;
 if a.lease_run is not null and a.lease_until>t then select * into running from private.ai_runs where id=a.lease_run; end if;
 select * into last_change from private.ai_runs where session_id=s.id and status='ok' and changed and undone_at is null and job<>'summarize_wall' and not deleted order by created_at desc limit 1;
 select * into last_group from private.ai_runs where session_id=s.id and job='group_wall' and status='ok' and not deleted order by created_at desc limit 1;
 out:=out||jsonb_build_object('session',jsonb_build_object('id',s.id,'title',s.title,'interaction',s.interaction,'live',s.id=r.live_session_id,'ai',private.ai_on(s.id),
   'option',case when jsonb_typeof(s.options->'ai')='boolean' then (s.options->>'ai')::boolean else true end,'override',a.ai,
   'summary_available',private.ai_summary_on(s.id),'summary_shown',coalesce(a.summary_shown,false)),
  'state',jsonb_build_object('running',running.id is not null,'job',running.job,'running_ms',case when running.id is not null then (extract(epoch from t-running.created_at)*1000)::integer end,
   'last_ms',a.last_ms,'last_ok_at',a.last_ok_at,'last_failed_at',a.last_failed_at,
   'failing',a.last_failed_at is not null and (a.last_ok_at is null or a.last_failed_at>a.last_ok_at),
   'slow',(running.id is not null and t-running.created_at>interval '6 seconds') or (coalesce(a.last_ms,0)>6000 and a.last_ok_at>t-interval '2 minutes')),
  'last_change',case when last_change.id is not null then jsonb_build_object('run',last_change.id,'job',last_change.job,'at',last_change.created_at,'count',jsonb_array_length(coalesce(last_change.output->'applied','[]'::jsonb))) end);
 if s.interaction='word_cloud' then
  out:=out||jsonb_build_object('combines',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'survivor',m.survivor_key,'member',m.member_key,
    'survivor_text',coalesce((select min(x->>'text') from public.submissions y cross join lateral jsonb_array_elements(y.answers) x where y.session_id=s.id and not y.deleted and x->>'key'=m.survivor_key),m.survivor_key),
    'member_text',coalesce((select min(x->>'text') from public.submissions y cross join lateral jsonb_array_elements(y.answers) x where y.session_id=s.id and not y.deleted and x->>'key'=m.member_key),m.member_key),
    'member_count',(select count(*) from public.submissions y cross join lateral jsonb_array_elements(y.answers) x where y.session_id=s.id and not y.deleted and not y.withdrawn and not y.hidden and x->>'key'=m.member_key),
    'survivor_count',(select count(*) from public.submissions y cross join lateral jsonb_array_elements(y.answers) x where y.session_id=s.id and not y.deleted and not y.withdrawn and not y.hidden and x->>'key'=m.survivor_key),
    'at',m.created_at,'undone',m.undone_at is not null) order by m.undone_at is not null,m.created_at desc,m.id)
   from (select * from private.ai_word_merges where session_id=s.id and not deleted order by created_at desc limit 100) m),'[]'::jsonb),
   'different',(select count(distinct x->>'key') from public.submissions y cross join lateral jsonb_array_elements(y.answers) x where y.session_id=s.id and not y.deleted and not y.withdrawn and not y.hidden),
   'threshold',30);
 elsif s.interaction='wall' then
  out:=out||jsonb_build_object('groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'label',g.label,'ai_label',g.ai_label,'pinned',g.pinned,'renamed',g.renamed_by is not null,
     'undone',g.undone_at is not null,'at',g.created_at,
     'members',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'text',x.text) order by x.server_received_at,x.id) from private.ai_group_members gm join public.submissions x on x.id=gm.submission_id
       where gm.group_id=g.id and gm.removed_at is null and not gm.deleted and not x.deleted and not x.withdrawn and not x.hidden),'[]'::jsonb))
     order by g.undone_at is not null,g.created_at,g.id) from (select * from private.ai_groups where session_id=s.id and not deleted order by created_at desc limit 60) g),'[]'::jsonb),
   'answers',(select count(*) from public.submissions x where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden),
   'grouped',(select count(*) from private.ai_group_members gm join private.ai_groups g on g.id=gm.group_id and g.undone_at is null and not g.deleted
     join public.submissions x on x.id=gm.submission_id and not x.deleted and not x.withdrawn and not x.hidden where gm.session_id=s.id and gm.removed_at is null and not gm.deleted),
   'waiting',(select count(*) from private.ai_wall_open(s.id) o where last_group.id is null or o.received>last_group.created_at),
   'summary',(select jsonb_build_object('text',m.text,'answers',m.answers,'at',m.created_at) from private.ai_summaries m where m.session_id=s.id and not m.deleted order by m.created_at desc limit 1));
 else
  out:=out||jsonb_build_object('folds',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'survivor',m.survivor_id,'member',m.member_id,
     'survivor_text',(select coalesce(q.edited_text,x.text) from public.submissions x join private.qa_questions q on q.submission_id=x.id where x.id=m.survivor_id),
     'member_text',(select x.text from public.submissions x where x.id=m.member_id),'at',m.created_at,'undone',m.undone_at is not null) order by m.undone_at is not null,m.created_at desc,m.id)
    from (select * from private.qa_merges where session_id=s.id and made_by='ai' and not deleted order by created_at desc limit 100) m),'[]'::jsonb));
 end if;
 return out;
end $$;

-- AI on and off, Undo the combine, the group's Undo, Redo, Pin, Unpin and Rename, Undo last
-- AI change, Show and Hide summary. Room lock first, facilitator check, the press id for
-- idempotency, one version raise, logged in Recent presses in plain words.
create function private.ai_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; done private.room_controls; me uuid:=private.clearway_user_id(); s public.sessions; g private.ai_groups; m private.ai_word_merges; run private.ai_runs;
 logged text; v_label text; before boolean; t timestamptz:=clock_timestamp(); who text;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if r.engagement_id is null or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or jsonb_typeof(p) is distinct from 'object' or p_action not in ('ai_on','ai_off','undo_combine','undo_group','redo_group','pin_group','unpin_group','rename_group','undo_last','show_summary','hide_summary') then
  return jsonb_build_object('status','invalid_request'); end if;
 logged:=case p_action when 'ai_on' then 'turn_ai_on' when 'ai_off' then 'turn_ai_off' when 'undo_combine' then 'undo_ai_combine' when 'undo_group' then 'undo_ai_group'
  when 'redo_group' then 'redo_ai_group' when 'pin_group' then 'pin_group' when 'unpin_group' then 'unpin_group' when 'rename_group' then 'rename_group'
  when 'undo_last' then 'undo_last_ai_change' when 'show_summary' then 'show_summary' else 'hide_summary' end;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>logged then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','version',r.version);
 end if;
 if p_action in ('ai_on','ai_off','undo_last','show_summary','hide_summary') then
  if p->>'session' is null or p->>'session' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
  select * into s from public.sessions where id=(p->>'session')::uuid and engagement_id=p_engagement and not deleted and interaction in ('word_cloud','wall','qa');
  if s.id is null then return jsonb_build_object('status','missing'); end if;
  insert into private.ai_sessions(session_id,engagement_id) values(s.id,s.engagement_id) on conflict(session_id) do nothing;
  perform 1 from private.ai_sessions where session_id=s.id for update;
  if p_action in ('ai_on','ai_off') then
   if p_action='ai_on' and not exists(select 1 from public.engagements where id=p_engagement and settings->>'ai_enabled'='true') then return jsonb_build_object('status','engagement_off'); end if;
   before:=private.ai_on(s.id);
   update private.ai_sessions set ai=(p_action='ai_on') where session_id=s.id;
   if before=private.ai_on(s.id) then return jsonb_build_object('status','unchanged','version',r.version); end if;
  elsif p_action in ('show_summary','hide_summary') then
   if p_action='show_summary' and not private.ai_summary_on(s.id) then return jsonb_build_object('status','invalid_state'); end if;
   if (select summary_shown from private.ai_sessions where session_id=s.id)=(p_action='show_summary') then return jsonb_build_object('status','unchanged','version',r.version); end if;
   update private.ai_sessions set summary_shown=(p_action='show_summary') where session_id=s.id;
  else
   -- Undo last AI change: everything the latest AI run in this session did, at once.
   select * into run from private.ai_runs where session_id=s.id and status='ok' and changed and undone_at is null and job<>'summarize_wall' and not deleted order by created_at desc limit 1;
   if run.id is null then return jsonb_build_object('status','unchanged','version',r.version); end if;
   update private.ai_word_merges set undone_at=t,undone_by=me where run_id=run.id and undone_at is null;
   update private.qa_merges set undone_at=t,undone_by=me where made_by='ai' and detail->>'run'=run.id::text and undone_at is null;
   update private.ai_groups set undone_at=t,undone_by=me where run_id=run.id and undone_at is null;
   update private.ai_group_members gm set removed_at=t,removed_by=me where gm.run_id=run.id and gm.removed_at is null
    and not exists(select 1 from private.ai_groups x where x.id=gm.group_id and x.run_id=run.id);
   update private.ai_runs set undone_at=t,undone_by=me where id=run.id;
  end if;
 elsif p_action='undo_combine' then
  if p->>'merge' is null or p->>'merge' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
  select * into m from private.ai_word_merges where id=(p->>'merge')::uuid and engagement_id=p_engagement and not deleted;
  if m.id is null then return jsonb_build_object('status','missing'); end if;
  if m.undone_at is not null then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.ai_word_merges set undone_at=t,undone_by=me where id=m.id;
 else
  if p->>'group' is null or p->>'group' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
  select * into g from private.ai_groups where id=(p->>'group')::uuid and engagement_id=p_engagement and not deleted for update;
  if g.id is null then return jsonb_build_object('status','missing'); end if;
  if p_action='undo_group' then
   if g.undone_at is not null then return jsonb_build_object('status','unchanged','version',r.version); end if;
   update private.ai_groups set undone_at=t,undone_by=me where id=g.id;
  elsif p_action='redo_group' then
   if g.undone_at is null then return jsonb_build_object('status','unchanged','version',r.version); end if;
   update private.ai_groups set undone_at=null,undone_by=null where id=g.id;
  elsif p_action in ('pin_group','unpin_group') then
   if g.undone_at is not null then return jsonb_build_object('status','invalid_state'); end if;
   if g.pinned=(p_action='pin_group') then return jsonb_build_object('status','unchanged','version',r.version); end if;
   update private.ai_groups set pinned=(p_action='pin_group') where id=g.id;
  else
   if g.undone_at is not null then return jsonb_build_object('status','invalid_state'); end if;
   if private.screen_text(coalesce(p->>'label','')) then return jsonb_build_object('status','filtered'); end if;
   v_label:=private.ai_label(p->>'label');
   if v_label is null then return jsonb_build_object('status','invalid_request'); end if;
   if v_label=g.label then return jsonb_build_object('status','unchanged','version',r.version); end if;
   update private.ai_groups set label=v_label,renamed_by=me,renamed_at=t where id=g.id;
  end if;
 end if;
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,me,logged,r.live_session_id,r.version,t);
 select split_part(btrim(name),' ',1) into who from public.clearway_users where id=me;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action',logged,'by',who,'version',r.version,'changed',true));
 return jsonb_build_object('status','ok','version',r.version);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

-- ---------- Wrappers ----------
create function public.ai_status(p_engagement uuid,p_session uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.ai_status(p_engagement,p_session) $$;
create function public.ai_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.ai_control(p_engagement,p_id,p_action,p) $$;
-- The server's worker only (service role).
create function public.ai_claim(p_session uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.ai_claim(p_session,p_lease,p_model,p_versions) $$;
create function public.ai_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.ai_apply(p_run,p_lease,p_output,p_usage) $$;
create function public.ai_fail(p_run uuid,p_lease uuid,p_error text,p_usage jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.ai_fail(p_run,p_lease,p_error,p_usage) $$;
create function public.ai_due(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.ai_due(p_engagement) $$;

revoke all on function private.ai_on(uuid),private.ai_summary_on(uuid),private.ai_quoted(text),private.ai_numbers(text),private.ai_label(text),
 private.options_word_cloud(jsonb,uuid),private.options_wall(jsonb,uuid),private.ai_wall_open(uuid),private.ai_wall_groups(uuid),
 private.ai_claim(uuid,uuid,text,jsonb),private.ai_usage(jsonb,text,numeric),private.ai_apply(uuid,uuid,jsonb,jsonb),private.ai_fail(uuid,uuid,text,jsonb),private.ai_due(uuid),
 private.ai_status(uuid,uuid),private.ai_control(uuid,uuid,text,jsonb),
 public.ai_status(uuid,uuid),public.ai_control(uuid,uuid,text,jsonb),public.ai_claim(uuid,uuid,text,jsonb),public.ai_apply(uuid,uuid,jsonb,jsonb),public.ai_fail(uuid,uuid,text,jsonb),public.ai_due(uuid)
 from public,anon,authenticated;
grant execute on function private.ai_status(uuid,uuid),private.ai_control(uuid,uuid,text,jsonb),public.ai_status(uuid,uuid),public.ai_control(uuid,uuid,text,jsonb) to authenticated;
grant execute on function private.ai_claim(uuid,uuid,text,jsonb),private.ai_apply(uuid,uuid,jsonb,jsonb),private.ai_fail(uuid,uuid,text,jsonb),private.ai_due(uuid),
 public.ai_claim(uuid,uuid,text,jsonb),public.ai_apply(uuid,uuid,jsonb,jsonb),public.ai_fail(uuid,uuid,text,jsonb),public.ai_due(uuid) to service_role;
commit;
