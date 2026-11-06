-- Milestone 6, step 3: Discover themes drafted from conversation notes and Four Helpful Lists cards (SET-06 themes).
--
-- AI drafts themes across the notes and the cards when the facilitator presses Draft themes (and again on Redraft). The
-- facilitator accepts, renames, merges or rejects each one, or writes one by hand. Only accepted themes count anywhere:
-- private.discover_accepted_themes is the one place later steps (What We Heard, the signal) read them from.
--
-- The job is engagement-level (like the overnight draft): its own round record, claim, apply and fail, with every run in
-- private.ai_runs. It never reaches the room: nothing here is on the TV, a phone, the scribe or the room state.
--
-- New:
--   private.discover_theme_rounds           one drafting round per engagement: pending, drafting, ready, failed
--   private.discover_themes.original_label  the label a theme had before the facilitator renamed it
--   private.four_lists_cards_for_themes     a stub (seven columns, people included) that returns no rows, only if step 2 has not made the real one
--   private.discover_card_counts            the distinct people behind a card theme, read live from the contract
--   private.discover_is_thin, discover_is_strong, discover_recount, discover_names, discover_has_name, discover_notes_recount
--   private.discover_themes_state, discover_theme_act, discover_theme_add, discover_draft_start       (facilitators)
--   private.discover_theme_due, discover_theme_claim, discover_theme_apply, discover_theme_fail       (the worker, service role)
--   private.discover_accepted_themes        the accepted themes with counts, thin, strong and quotes, for steps 4 and 5
--   public wrappers (security invoker) for each callable one
--
-- Shared objects touched, each a superset of its latest definition:
--   private.ai_runs ai_runs_job_check      candidates (20261104170000) plus fold_four_lists (step 2) plus draft_discover_themes
--   private.ai_runs ai_runs_session_check  overnight_draft plus draft_discover_themes (an engagement-level job has no session)
--   private.reset_practice_room            step 1's (20261106010000) plus the practice room's drafting round; if step 2 has wrapped it
--                                          as reset_practice_room_base, the base is redefined instead
-- Not touched, on purpose: ai_on, ai_claim, ai_apply (the job has no session) and rehearsal_control (step 1 already clears drafted
-- test themes and their sources; the round holds no room data and the page ignores it once the notes and cards are gone).
begin;

-- ---------- The cards contract with step 2 ----------
-- Step 2's migration (20261106020000) creates the real function. If this migration runs first, this stub (the same signature and
-- columns, no rows) stands in for it. `people` is the distinct people who wrote or agreed with the card and the cards folded into it. Postgres has no create function if not exists, so the stub is made
-- only when the function is missing.
do $stub$
begin
 if to_regprocedure('private.four_lists_cards_for_themes(uuid)') is null then
  create function private.four_lists_cards_for_themes(p_engagement uuid) returns table(card_id uuid,session_id uuid,"column" text,"text" text,agree integer,folded_ids uuid[],people uuid[])
  language sql stable security definer set search_path='' as $f$
   select null::uuid,null::uuid,null::text,null::text,null::integer,null::uuid[],null::uuid[] where false
  $f$;
 end if;
end $stub$;
revoke all on function private.four_lists_cards_for_themes(uuid) from public,anon,authenticated;

-- ---------- The AI job check ----------
alter table private.ai_runs drop constraint ai_runs_job_check;
alter table private.ai_runs add constraint ai_runs_job_check check(job in ('combine_words','group_wall','summarize_wall','fold_questions','merge_reasons','group_lens','overnight_draft','draft_lens_summary','fold_lens_summary','propose_candidates','fold_four_lists','draft_discover_themes'));
alter table private.ai_runs drop constraint ai_runs_session_check;
alter table private.ai_runs add constraint ai_runs_session_check check(session_id is not null or job in ('overnight_draft','draft_discover_themes'));

-- ---------- Records ----------
alter table private.discover_themes add column original_label text check(original_label is null or length(btrim(original_label)) between 1 and 200);

-- One round of drafting per engagement. The facilitator's press makes it pending; the worker claims it with a lease.
create table private.discover_theme_rounds (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 status text not null default 'pending' check(status in ('pending','drafting','ready','failed','idle')),
 request_id uuid,
 redraft boolean not null default false,
 requested_at timestamptz not null default clock_timestamp(),
 requested_by uuid references public.clearway_users(id),
 attempts integer not null default 0 check(attempts between 0 and 100),
 lease_id uuid,
 lease_run uuid references private.ai_runs(id) on delete set null,
 lease_until timestamptz,
 last_failed_at timestamptz,
 last_error text check(last_error is null or length(last_error)<=200),
 last_ok_at timestamptz,
 last_offered integer check(last_offered is null or last_offered between 0 and 1000),
 last_refused integer check(last_refused is null or last_refused between 0 and 1000),
 inputs jsonb not null default '{}' check(jsonb_typeof(inputs)='object' and pg_column_size(inputs)<=4096),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false
);
create unique index discover_theme_rounds_engagement_idx on private.discover_theme_rounds(engagement_id) where not deleted;
create index discover_theme_rounds_requested_by_idx on private.discover_theme_rounds(requested_by) where requested_by is not null;
create index discover_theme_rounds_lease_run_idx on private.discover_theme_rounds(lease_run) where lease_run is not null;

alter table private.discover_theme_rounds enable row level security;
alter table private.discover_theme_rounds force row level security;
revoke all on private.discover_theme_rounds from public,anon,authenticated;
grant select,insert,update,delete on private.discover_theme_rounds to service_role;
create trigger touch_record before update on private.discover_theme_rounds for each row execute function private.touch_live_record('id');

-- ---------- The rules that are code (mirrored in lib/discover/thin.ts and strength.ts, tested against each other) ----------
-- Thin: a survey theme rests on fewer than 10 respondents or under 10 percent of them; a theme from conversations or the
-- Four Helpful Lists rests on one source or fewer. Strong: 40 percent or more of its source and not thin.
create function private.discover_is_thin(p_source text,p_rests integer,p_out integer) returns boolean
language sql immutable security invoker set search_path='' as $$
 select case when p_source='survey' then coalesce(p_rests,0)<10 or (coalesce(p_out,0)>0 and coalesce(p_rests,0)::numeric/p_out<0.1)
  else coalesce(p_rests,0)<=1 end
$$;
create function private.discover_is_strong(p_source text,p_rests integer,p_out integer) returns boolean
language sql immutable security invoker set search_path='' as $$
 select not private.discover_is_thin(p_source,p_rests,p_out) and coalesce(p_out,0)>0 and coalesce(p_rests,0)::numeric/p_out>=0.4
$$;

-- The people behind a Four Helpful Lists theme, read from the contract each time: the distinct union of `people` over its cards (a card
-- folded into another counts through the card it sits beneath), out of the people in the room. It is never stored as the truth: the
-- cards change while the room works, so a card theme is read live, and recounted when it changes.
create function private.discover_card_counts(p_engagement uuid,p_theme uuid) returns table(n integer,o integer)
language sql stable security definer set search_path='' as $$
 with ids as (select distinct s.card_id from private.discover_theme_sources s
   where s.engagement_id=p_engagement and not s.deleted and s.card_id is not null
    and (s.theme_id=p_theme or s.theme_id in (select m.id from private.discover_themes m where m.merged_into=p_theme and m.engagement_id=p_engagement and not m.deleted))),
 cards as materialized (select c.card_id,c.folded_ids,coalesce(c.people,array[]::uuid[]) as people from private.four_lists_cards_for_themes(p_engagement) c),
 mine as (select distinct p from cards c cross join lateral unnest(c.people) p where exists(select 1 from ids i where i.card_id=c.card_id or i.card_id=any(coalesce(c.folded_ids,array[]::uuid[])))),
 everyone as (select distinct p from cards c cross join lateral unnest(c.people) p)
 select (select count(*) from mine)::integer,
  greatest((select count(*) from public.attendees a where a.engagement_id=p_engagement and not a.deleted and a.room_role='participant'),(select count(*) from everyone),(select count(*) from mine))::integer
$$;


-- ---------- Counts ----------
-- What a theme rests on, worked out from its sources and the themes merged beneath it. Conversations: distinct notes, out of
-- all notes. Four Helpful Lists: the distinct people who wrote or agreed with its cards (the contract's `people`, cards folded into
-- a card included); out of the people in the room. A survey theme is its finding's own and never recounted.
create function private.discover_recount(p_engagement uuid,p_theme uuid) returns void
language plpgsql security definer set search_path='' as $$
declare t private.discover_themes; n integer:=0; o integer:=0;
begin
 select * into t from private.discover_themes where id=p_theme and engagement_id=p_engagement and not deleted;
 if not found or t.source='survey' then return; end if;
 if t.source='conversations' then
  select count(distinct s.note_id)::integer into n from private.discover_theme_sources s
   join private.conversation_notes c on c.id=s.note_id and c.engagement_id=s.engagement_id and not c.deleted
   where s.engagement_id=p_engagement and not s.deleted and s.note_id is not null
    and (s.theme_id=p_theme or s.theme_id in (select m.id from private.discover_themes m where m.merged_into=p_theme and m.engagement_id=p_engagement and not m.deleted));
  select count(*)::integer into o from private.conversation_notes where engagement_id=p_engagement and not deleted;
 else
  select c.n,c.o into n,o from private.discover_card_counts(p_engagement,p_theme) c;
 end if;
 update private.discover_themes set rests_on=n,out_of=greatest(o,n),
  quotes=(select coalesce(jsonb_agg(q.quote order by q.rank),'[]'::jsonb) from (
    select s.quote,row_number() over(order by (s.theme_id<>p_theme),s.created_at,s.id) as rank from private.discover_theme_sources s
    where s.engagement_id=p_engagement and not s.deleted and s.quote is not null
     and (s.note_id is null or exists(select 1 from private.conversation_notes c where c.id=s.note_id and c.engagement_id=s.engagement_id and not c.deleted))
     and (s.card_id is null or exists(select 1 from private.four_lists_cards_for_themes(p_engagement) k where k.card_id=s.card_id or s.card_id=any(coalesce(k.folded_ids,array[]::uuid[]))))
     and (s.theme_id=p_theme or s.theme_id in (select m.id from private.discover_themes m where m.merged_into=p_theme and m.engagement_id=p_engagement and not m.deleted))) q where q.rank<=3)
 where id=p_theme;
end $$;

-- A note added or removed changes what every conversation theme rests on and is out of.
create function private.discover_notes_recount() returns trigger
language plpgsql security definer set search_path='' as $$
declare r record;
begin
 for r in select id from private.discover_themes where engagement_id=new.engagement_id and source='conversations' and not deleted and merged_into is null loop
  perform private.discover_recount(new.engagement_id,r.id);
 end loop;
 return new;
end $$;
create trigger notes_recount after insert or update of deleted on private.conversation_notes for each row execute function private.discover_notes_recount();

-- ---------- Names the draft must not carry ----------
-- The words of every note's person field, every attendee's name and the engagement's facilitators. AI is never sent them; a theme, a detail or a quote that
-- carries one is refused. Titles and roles are not names.
create function private.discover_names(p_engagement uuid) returns text[]
language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(distinct w),array[]::text[]) from (
  select unnest(regexp_split_to_array(x.t,'[^[:alpha:]]+')) as w from (
   select n.person as t from private.conversation_notes n where n.engagement_id=p_engagement and not n.deleted and n.person is not null
   union all select a.name from public.attendees a where a.engagement_id=p_engagement and not a.deleted
   union all select u.name from public.engagement_facilitators f join public.clearway_users u on u.id=f.clearway_user_id where f.engagement_id=p_engagement and not f.deleted) x) y
 where length(w)>=3 and lower(w)<>all(array['the','and','for','with','team','staff','board','elders','elder','pastor','pastors','rev','reverend','senior','lead','associate','executive',
  'director','chair','deacon','deacons','church','youth','children','kids','worship','group','council','committee','leader','leaders','interview','input','conversation','mrs','miss','pastoral'])
$$;
create function private.discover_has_name(p_text text,p_names text[]) returns boolean
language sql immutable security invoker set search_path='' as $$
 select coalesce(exists(select 1 from unnest(p_names) n where p_text ~* ('\m'||n||'\M')),false)
$$;

-- ---------- The themes page's state ----------
-- Themes with their sources (a note's title and kind, never its person), the round, and what a hand-made theme may rest on.
create function private.discover_themes_state(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,false); r private.discover_theme_rounds; ai boolean; n_notes integer; n_cards integer; out jsonb;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 select * into r from private.discover_theme_rounds where engagement_id=p_engagement and not deleted;
 select coalesce(e.settings->>'ai_enabled','false')='true' into ai from public.engagements e where e.id=p_engagement;
 select count(*)::integer into n_notes from private.conversation_notes where engagement_id=p_engagement and not deleted;
 select count(*)::integer into n_cards from private.four_lists_cards_for_themes(p_engagement);
 with cards as materialized (select * from private.four_lists_cards_for_themes(p_engagement)),
 top as (select t.* from private.discover_themes t where t.engagement_id=p_engagement and not t.deleted and t.merged_into is null)
 select jsonb_build_object('status','ok','server_time',clock_timestamp(),'ai',coalesce(ai,false),
  'inputs',jsonb_build_object('notes',n_notes,'cards',n_cards),
  'round',case when r.id is not null and (n_notes>0 or n_cards>0) then jsonb_build_object('status',r.status,'redraft',r.redraft,'requested_at',r.requested_at,'attempts',r.attempts,
     'error',r.last_error,'ok_at',r.last_ok_at,'offered',r.last_offered,'refused',r.last_refused,'left_out',coalesce((r.inputs->>'left_out')::integer,0),'cards_left_out',coalesce((r.inputs->>'cards_left_out')::integer,0),
     'stale_notes',case when r.last_ok_at is null then 0 else (select count(*) from private.conversation_notes c where c.engagement_id=p_engagement and not c.deleted and c.created_at>r.last_ok_at) end) end,
  'themes',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'source',t.source,'label',t.label,'detail',t.detail,'rests_on',case when t.source='four_lists' then (select k.n from private.discover_card_counts(p_engagement,t.id) k) else t.rests_on end,
     'out_of',case when t.source='four_lists' then (select k.o from private.discover_card_counts(p_engagement,t.id) k) else t.out_of end,'quotes',t.quotes,'status',t.status,
     'ai',t.ai_run is not null,'by_hand',t.ai_run is null and t.source<>'survey','renamed_from',case when t.original_label is distinct from t.label then t.original_label end,
     'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'label',m.label) order by m.seq) from private.discover_themes m where m.merged_into=t.id and m.engagement_id=t.engagement_id and not m.deleted),'[]'::jsonb),
     'sources',coalesce((select jsonb_agg(x.j order by x.created_at,x.sid) from (
        select distinct on (coalesce(s.finding_id,s.note_id,s.card_id)) s.created_at,s.id as sid,
         jsonb_build_object('kind',case when s.finding_id is not null then 'finding' when s.note_id is not null then 'note' else 'card' end,
          'id',coalesce(s.finding_id,s.note_id,s.card_id),'title',coalesce(f.title,n.title),'note_kind',n.kind,'text',cc."text",'column',cc."column",'agree',cc.agree,'quote',s.quote) as j
         from private.discover_theme_sources s
         left join private.survey_findings f on f.id=s.finding_id and f.engagement_id=s.engagement_id and not f.deleted
         left join private.conversation_notes n on n.id=s.note_id and n.engagement_id=s.engagement_id and not n.deleted
         left join cards cc on cc.card_id=s.card_id
         where s.engagement_id=t.engagement_id and not s.deleted and (s.theme_id=t.id or s.theme_id in (select m.id from private.discover_themes m where m.merged_into=t.id and m.engagement_id=t.engagement_id and not m.deleted))
          and (f.id is not null or n.id is not null or cc.card_id is not null)
         order by coalesce(s.finding_id,s.note_id,s.card_id),(s.theme_id<>t.id),s.created_at,s.id) x),'[]'::jsonb))
     order by (t.status='rejected'),(t.source<>'survey'),t.seq) from top t),'[]'::jsonb),
  'notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'title',n.title,'kind',n.kind) order by n.seq) from private.conversation_notes n where n.engagement_id=p_engagement and not n.deleted),'[]'::jsonb),
  'cards',coalesce((select jsonb_agg(jsonb_build_object('id',c.card_id,'column',c."column",'text',left(c."text",200),'agree',c.agree) order by c.agree desc,c.card_id) from (select * from cards order by agree desc,card_id limit 200) c),'[]'::jsonb))
 into out;
 return out;
end $$;

-- ---------- Accept, undo, reject, restore, rename, merge, split ----------
create function private.discover_theme_act(p_engagement uuid,p_theme uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true); t private.discover_themes; u private.discover_themes; v_label text; v_into uuid;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_theme is null or p_action is null or p_action not in ('accept','undo','reject','restore','rename','merge','split') or (p is not null and jsonb_typeof(p)<>'object')
  then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 select * into t from private.discover_themes where id=p_theme and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if t.source='survey' then return jsonb_build_object('status','survey_theme'); end if;
 if p_action='split' then
  if t.merged_into is null then return jsonb_build_object('status','unchanged'); end if;
  v_into:=t.merged_into;
  update private.discover_themes set merged_into=null where id=t.id;
  perform private.discover_recount(p_engagement,v_into);
  perform private.discover_recount(p_engagement,t.id);
  return jsonb_build_object('status','ok');
 end if;
 if t.merged_into is not null then return jsonb_build_object('status','merged'); end if;
 if p_action='accept' then
  if t.status='accepted' then return jsonb_build_object('status','unchanged'); end if;
  update private.discover_themes set status='accepted' where id=t.id;
  perform private.discover_recount(p_engagement,t.id);
 elsif p_action='undo' then
  if t.status<>'accepted' then return jsonb_build_object('status','unchanged'); end if;
  update private.discover_themes set status='draft' where id=t.id;
 elsif p_action='reject' then
  if t.status='rejected' then return jsonb_build_object('status','unchanged'); end if;
  update private.discover_themes set status='rejected' where id=t.id;
 elsif p_action='restore' then
  if t.status<>'rejected' then return jsonb_build_object('status','unchanged'); end if;
  update private.discover_themes set status='draft' where id=t.id;
 elsif p_action='rename' then
  v_label:=btrim(regexp_replace(coalesce(p->>'label',''),'\s+',' ','g'));
  if length(v_label) not between 1 and 200 then return jsonb_build_object('status','invalid_request'); end if;
  if v_label=t.label then return jsonb_build_object('status','unchanged'); end if;
  update private.discover_themes set label=v_label,original_label=case when coalesce(t.original_label,t.label)=v_label then null else coalesce(t.original_label,t.label) end where id=t.id;
 else
  if p is null or p->>'into' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
  select * into u from private.discover_themes where id=(p->>'into')::uuid and engagement_id=p_engagement and not deleted for update;
  if not found or u.id=t.id then return jsonb_build_object('status','not_found'); end if;
  if u.source<>t.source or u.merged_into is not null or u.status='rejected' or t.status='rejected' then return jsonb_build_object('status','cannot_merge'); end if;
  -- Themes already merged beneath this one go with it, so a survivor never sits beneath another.
  update private.discover_themes set merged_into=u.id where merged_into=t.id and engagement_id=p_engagement and not deleted;
  update private.discover_themes set merged_into=u.id where id=t.id;
  if t.status='accepted' and u.status='draft' then update private.discover_themes set status='accepted' where id=u.id; end if;
  perform private.discover_recount(p_engagement,u.id);
  return jsonb_build_object('status','ok','into',u.id);
 end if;
 return jsonb_build_object('status','ok');
end $$;

-- ---------- A theme by hand ----------
-- For when AI is slow, failed or off, or the facilitator has a theme AI missed. It is accepted at once (the facilitator wrote it)
-- and rests on whichever notes or cards they name, so it counts like any other.
create function private.discover_theme_add(p_engagement uuid,p_id uuid,p_source text,p_label text,p_detail text,p_sources uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true); v_label text:=btrim(regexp_replace(coalesce(p_label,''),'\s+',' ','g')); v_detail text:=btrim(regexp_replace(coalesce(p_detail,''),'\s+',' ','g'));
 ids uuid[]:=coalesce(p_sources,array[]::uuid[]); good uuid[]; tid uuid;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_id is null or p_source is null or p_source not in ('conversations','four_lists') or length(v_label) not between 1 and 200 or length(v_detail)>1000 or cardinality(ids)>60
  then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 if exists(select 1 from private.discover_themes where id=p_id) then
  if exists(select 1 from private.discover_themes where id=p_id and engagement_id=p_engagement) then return jsonb_build_object('status','duplicate'); end if;
  return jsonb_build_object('status','conflict');
 end if;
 if (select count(*) from private.discover_themes where engagement_id=p_engagement and not deleted)>=300 then return jsonb_build_object('status','limit'); end if;
 if p_source='conversations' then
  select coalesce(array_agg(n.id),array[]::uuid[]) into good from private.conversation_notes n where n.engagement_id=p_engagement and not n.deleted and n.id=any(ids);
 else
  select coalesce(array_agg(c.card_id),array[]::uuid[]) into good from private.four_lists_cards_for_themes(p_engagement) c where c.card_id=any(ids);
 end if;
 if cardinality(good)<>cardinality(array(select distinct x from unnest(ids) x)) then return jsonb_build_object('status','not_found'); end if;
 insert into private.discover_themes(id,engagement_id,source,label,detail,status) values(p_id,p_engagement,p_source,v_label,v_detail,'accepted') returning id into tid;
 if p_source='conversations' then
  insert into private.discover_theme_sources(engagement_id,theme_id,note_id) select p_engagement,tid,x from unnest(good) x;
 else
  insert into private.discover_theme_sources(engagement_id,theme_id,card_id) select p_engagement,tid,x from unnest(good) x;
 end if;
 perform private.discover_recount(p_engagement,tid);
 return jsonb_build_object('status','ok','id',tid);
end $$;

-- ---------- Draft themes, pressed by the facilitator ----------
create function private.discover_draft_start(p_engagement uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.discover_guard(p_engagement,true); r private.discover_theme_rounds; t timestamptz:=clock_timestamp(); n_notes integer; n_cards integer; again boolean; has_round boolean;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_id is null then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 if coalesce((select e.settings->>'ai_enabled' from public.engagements e where e.id=p_engagement),'false')<>'true' then return jsonb_build_object('status','ai_off'); end if;
 select count(*)::integer into n_notes from private.conversation_notes where engagement_id=p_engagement and not deleted;
 select count(*)::integer into n_cards from private.four_lists_cards_for_themes(p_engagement);
 if n_notes=0 and n_cards=0 then return jsonb_build_object('status','nothing'); end if;
 select * into r from private.discover_theme_rounds where engagement_id=p_engagement and not deleted for update;
 has_round:=found;
 if has_round and r.request_id=p_id then return jsonb_build_object('status','duplicate','round',r.status); end if;
 -- One at a time. A round that has run three minutes without finishing may be started over.
 if has_round and r.status in ('pending','drafting') and r.requested_at>t-interval '3 minutes' then return jsonb_build_object('status','busy'); end if;
 select exists(select 1 from private.discover_themes where engagement_id=p_engagement and not deleted and ai_run is not null) into again;
 if has_round then
  if r.lease_run is not null then update private.ai_runs set status='stale',finished_at=t where id=r.lease_run and status='running'; end if;
  update private.discover_theme_rounds set status='pending',request_id=p_id,redraft=again,requested_at=t,requested_by=private.clearway_user_id(),attempts=0,
   lease_id=null,lease_run=null,lease_until=null,last_failed_at=null,last_error=null where id=r.id;
 else
  insert into private.discover_theme_rounds(engagement_id,status,request_id,redraft,requested_at,requested_by) values(p_engagement,'pending',p_id,again,t,private.clearway_user_id());
 end if;
 return jsonb_build_object('status','ok','redraft',again);
end $$;

-- ---------- The worker: due, claim, apply, fail ----------
create function private.discover_theme_due(p_engagement uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.discover_theme_rounds r where r.engagement_id=p_engagement and not r.deleted
  and ((r.status='pending' and (r.last_failed_at is null or r.last_failed_at<=clock_timestamp()-make_interval(secs=>15*greatest(r.attempts,1))))
   or (r.status='drafting' and r.lease_until<clock_timestamp())))
$$;

-- The model is given the notes' text and kind and the cards' words under short refs (n1, f1, t1). Never a person, a title,
-- an id, a speaker or an attendee. A long note is cut at 30,000 characters and the notes together at 180,000; what does not fit
-- is counted, and the page says so.
create function private.discover_theme_claim(p_engagement uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.discover_theme_rounds; t timestamptz:=clock_timestamp(); v_inputs jsonb; v_run uuid; total integer; used integer; nc integer; names text[]; cut integer; ncards integer;
begin
 if p_engagement is null or p_lease is null or p_model is null or length(p_model) not between 1 and 100 or jsonb_typeof(p_versions) is distinct from 'object'
  or coalesce(p_versions->>'draft_discover_themes','') !~ '^[a-z0-9_.@-]{1,60}$' then return jsonb_build_object('status','invalid_request'); end if;
 select * into r from private.discover_theme_rounds where engagement_id=p_engagement and not deleted for update;
 if not found or r.status not in ('pending','drafting') then return jsonb_build_object('status','idle'); end if;
 if r.status='drafting' and r.lease_until>t then return jsonb_build_object('status','busy'); end if;
 if r.status='pending' and r.last_failed_at is not null and r.last_failed_at>t-make_interval(secs=>15*greatest(r.attempts,1)) then
  return jsonb_build_object('status','cooling','ms',(extract(epoch from r.last_failed_at+make_interval(secs=>15*greatest(r.attempts,1))-t)*1000)::integer); end if;
 if coalesce((select e.settings->>'ai_enabled' from public.engagements e where e.id=p_engagement and not e.deleted),'false')<>'true' then
  update private.discover_theme_rounds set status='idle',lease_id=null,lease_run=null,lease_until=null where id=r.id;
  return jsonb_build_object('status','off');
 end if;
 if r.lease_run is not null then update private.ai_runs set status='stale',finished_at=t where id=r.lease_run and status='running'; end if;
 select count(*)::integer into total from private.conversation_notes where engagement_id=p_engagement and not deleted;
 select count(*)::integer into ncards from private.four_lists_cards_for_themes(p_engagement);
 names:=private.discover_names(p_engagement);
 v_inputs:=jsonb_build_object('total_notes',total,
  'notes',coalesce((select jsonb_agg(jsonb_build_object('ref','n'||z.ord,'id',z.id,'kind',z.kind,'text',z.body) order by z.ord)
    from (select y.*,sum(char_length(y.body)) over(order by y.ord) as run from (select n.id,n.kind,left(n.body,30000) as body,row_number() over(order by n.seq) as ord
      from private.conversation_notes n where n.engagement_id=p_engagement and not n.deleted) y) z where z.run<=180000),'[]'::jsonb),
  'cards',coalesce((select jsonb_agg(jsonb_build_object('ref','f'||z.ord,'id',z.card_id,'column',z."column",'text',left(z."text",300),'agree',z.agree) order by z.ord)
    from (select c.*,row_number() over(order by c.agree desc,c.session_id,c.card_id) as ord from private.four_lists_cards_for_themes(p_engagement) c limit 300) z),'[]'::jsonb),
  'already',coalesce((select jsonb_agg(jsonb_build_object('ref','t'||z.ord,'source',z.source,'label',z.label) order by z.ord)
    from (select y.source,y.label,row_number() over(order by y.seq,y.o) as ord from (
      select x.source,x.label,x.seq,0 as o from private.discover_themes x where x.engagement_id=p_engagement and not x.deleted
       and x.merged_into is null and x.source in ('conversations','four_lists') and x.status in ('accepted','draft')
      union all select x.source,x.original_label,x.seq,1 from private.discover_themes x where x.engagement_id=p_engagement and not x.deleted
       and x.merged_into is null and x.source in ('conversations','four_lists') and x.status in ('accepted','draft') and x.original_label is not null and x.original_label<>x.label) y
      where not private.discover_has_name(y.label,names) limit 80) z),'[]'::jsonb),
  'rejected',coalesce((select jsonb_agg(z.label order by z.seq) from (select x.label,x.seq from private.discover_themes x where x.engagement_id=p_engagement and not x.deleted
      and x.source in ('conversations','four_lists') and x.status='rejected' and not private.discover_has_name(x.label,names) limit 80) z),'[]'::jsonb));
 used:=jsonb_array_length(v_inputs->'notes'); nc:=jsonb_array_length(v_inputs->'cards');
 select count(*)::integer into cut from (select n.id,char_length(n.body) as len,row_number() over(order by n.seq) as ord from private.conversation_notes n where n.engagement_id=p_engagement and not n.deleted) y where y.ord<=used and y.len>30000;
 v_inputs:=v_inputs||jsonb_build_object('left_out',total-used+cut,'cards_left_out',greatest(ncards-nc,0));
 if used=0 and nc=0 then
  update private.discover_theme_rounds set status='idle',lease_id=null,lease_run=null,lease_until=null where id=r.id;
  return jsonb_build_object('status','idle');
 end if;
 insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,created_at) values(p_engagement,null,'draft_discover_themes',p_model,p_versions->>'draft_discover_themes',v_inputs,t) returning id into v_run;
 update private.discover_theme_rounds set status='drafting',lease_id=p_lease,lease_run=v_run,lease_until=t+interval '6 minutes',
  inputs=jsonb_build_object('notes',used,'cards',nc,'left_out',total-used+cut,'cards_left_out',greatest(ncards-nc,0)) where id=r.id;
 return jsonb_build_object('status','claimed','run',v_run,'job','draft_discover_themes','prompt_version',p_versions->>'draft_discover_themes','inputs',v_inputs);
end $$;

-- Apply the model's themes under the rules that are code, never prompt: every theme needs a source from this run's own inputs; a
-- number in a label or detail must be in a source; nothing quoted or filtered; a quote must be word for word from its source (a
-- Four Helpful Lists theme falls back to its most agreed card's own words); no theme, detail or quote carries a name; a label already
-- on the page, rejected or not, is not offered again. Counts come from the sources, never from the model.
create function private.discover_theme_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; r private.discover_theme_rounds; t timestamptz:=clock_timestamp(); in_ jsonb; v_ms integer; th jsonb; kind text; key text; v_label text; v_detail text; qtext text; qref text;
 refs text[]; src_ids uuid[]; src_text text; qsrc text; qid uuid; names text[]; seen text[]; tid uuid; offered integer:=0; refused jsonb:='[]'::jsonb; need text[]; have text[]; best text;
 per_kind jsonb:='{"conversations":0,"four_lists":0}'::jsonb;
begin
 if p_run is null or p_lease is null or jsonb_typeof(p_output) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into run from private.ai_runs where id=p_run and job='draft_discover_themes';
 if not found then return jsonb_build_object('status','missing'); end if;
 in_:=run.inputs; v_ms:=private.ai_usage(p_usage,'ms',600000)::integer;
 perform private.discover_lock(run.engagement_id);
 select * into r from private.discover_theme_rounds where engagement_id=run.engagement_id and not deleted for update;
 if not found or run.status<>'running' or r.lease_id is distinct from p_lease or r.lease_run is distinct from p_run or r.lease_until<t then return jsonb_build_object('status','stale'); end if;
 if coalesce((select e.settings->>'ai_enabled' from public.engagements e where e.id=run.engagement_id),'false')<>'true' then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms where id=run.id;
  update private.discover_theme_rounds set status='idle',lease_id=null,lease_run=null,lease_until=null where id=r.id;
  return jsonb_build_object('status','discarded');
 end if;
 names:=private.discover_names(run.engagement_id);
 select coalesce(array_agg(private.ov_norm(l)),array[]::text[]) into seen from private.discover_themes x cross join lateral unnest(array[x.label,x.original_label]) l where x.engagement_id=run.engagement_id and not x.deleted and l is not null;
 for th in select value from jsonb_array_elements(case when jsonb_typeof(p_output->'themes')='array' then p_output->'themes' else '[]'::jsonb end) loop
  exit when offered>=16;
  if jsonb_typeof(th)<>'object' then continue; end if;
  kind:=th->>'source';
  if kind is null or kind not in ('conversations','four_lists') then continue; end if;
  if (per_kind->>kind)::integer>=8 then continue; end if;
  key:=case kind when 'conversations' then 'notes' else 'cards' end;
  v_label:=btrim(regexp_replace(coalesce(th->>'label',''),'\s+',' ','g'));
  v_detail:=btrim(regexp_replace(coalesce(th->>'detail',''),'\s+',' ','g'));
  if length(v_label) not between 1 and 120 or length(v_detail)>400 or private.ai_quoted(v_label) or private.ai_quoted(v_detail) or private.screen_text(v_label||' '||v_detail) then
   refused:=refused||jsonb_build_array(jsonb_build_object('label',left(v_label,60),'reason','text')); continue; end if;
  if private.discover_has_name(v_label||' '||v_detail,names) then refused:=refused||jsonb_build_array(jsonb_build_object('label',left(v_label,60),'reason','name')); continue; end if;
  if private.ov_norm(v_label)=any(seen) then continue; end if;
  -- Its sources, each one from this run's own inputs and of this theme's kind.
  qref:=lower(btrim(coalesce(th#>>'{quote,source}','')));
  select coalesce(array_agg(distinct lower(btrim(s#>>'{}'))),array[]::text[]) into refs from jsonb_array_elements(case when jsonb_typeof(th->'sources')='array' then th->'sources' else '[]'::jsonb end) s where jsonb_typeof(s)='string';
  select array_agg(distinct (x->>'id')::uuid),string_agg(x->>'text',E'\n') into src_ids,src_text from jsonb_array_elements(in_->key) x where lower(x->>'ref')=any(refs);
  if src_ids is null then refused:=refused||jsonb_build_array(jsonb_build_object('label',left(v_label,60),'reason','unsourced')); continue; end if;
  select array_agg(distinct (x->>'id')::uuid) into src_ids from jsonb_array_elements(in_->key) x where lower(x->>'ref')=any(refs||qref);
  select coalesce(array_agg(n),array[]::text[]) into need from unnest(private.ai_numbers(v_label||' '||v_detail)) n;
  select string_agg(x->>'text',E'\n') into src_text from jsonb_array_elements(in_->key) x where (x->>'id')::uuid=any(src_ids);
  have:=private.ai_numbers(src_text);
  if not need<@have then refused:=refused||jsonb_build_array(jsonb_build_object('label',left(v_label,60),'reason','number')); continue; end if;
  -- One quote, word for word from a source of this kind, with no name in it.
  qtext:=btrim(regexp_replace(coalesce(th#>>'{quote,text}',''),'\s+',' ','g')); qid:=null;
  select (x->>'id')::uuid,x->>'text' into qid,qsrc from jsonb_array_elements(in_->key) x where lower(x->>'ref')=qref limit 1;
  if qid is null or length(qtext) not between 8 and 300 or position(private.ov_norm(qtext) in private.ov_norm(qsrc))=0 or private.screen_text(qtext) or private.discover_has_name(qtext,names) then qtext:=null; qid:=null; end if;
  if qtext is null and kind='four_lists' then
   select x->>'text',(x->>'id')::uuid into best,qid from jsonb_array_elements(in_->'cards') x where (x->>'id')::uuid=any(src_ids) order by (x->>'agree')::integer desc,x->>'ref' limit 1;
   if best is not null and length(best) between 1 and 300 and not private.screen_text(best) and not private.discover_has_name(best,names) then qtext:=best; else qtext:=null; qid:=null; end if;
  end if;
  insert into private.discover_themes(engagement_id,source,label,detail,status,ai_run,original_label) values(run.engagement_id,kind,v_label,v_detail,'draft',run.id,null) returning id into tid;
  if kind='conversations' then
   insert into private.discover_theme_sources(engagement_id,theme_id,note_id,quote) select run.engagement_id,tid,x,case when x=qid then qtext end from unnest(src_ids) x;
  else
   insert into private.discover_theme_sources(engagement_id,theme_id,card_id,quote) select run.engagement_id,tid,x,case when x=qid then qtext end from unnest(src_ids) x;
  end if;
  perform private.discover_recount(run.engagement_id,tid);
  seen:=seen||private.ov_norm(v_label); offered:=offered+1; per_kind:=jsonb_set(per_kind,array[kind],to_jsonb((per_kind->>kind)::integer+1));
 end loop;
 update private.ai_runs set status='ok',changed=offered>0,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'offered',offered,'refused',refused),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 update private.discover_theme_rounds set status='ready',last_ok_at=t,last_offered=offered,last_refused=jsonb_array_length(refused),lease_id=null,lease_run=null,lease_until=null,last_error=null where id=r.id;
 return jsonb_build_object('status','ok','offered',offered,'refused',jsonb_array_length(refused));
end $$;

-- One more try after a pause, then the page says so and the facilitator writes themes by hand.
create function private.discover_theme_fail(p_run uuid,p_lease uuid,p_error text,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; r private.discover_theme_rounds; t timestamptz:=clock_timestamp(); v_ms integer:=private.ai_usage(p_usage,'ms',600000)::integer; gave_up boolean;
begin
 select * into run from private.ai_runs where id=p_run and job='draft_discover_themes';
 if not found or p_lease is null then return jsonb_build_object('status','missing'); end if;
 select * into r from private.discover_theme_rounds where engagement_id=run.engagement_id and not deleted for update;
 if not found or run.status<>'running' or r.lease_id is distinct from p_lease or r.lease_run is distinct from p_run then return jsonb_build_object('status','stale'); end if;
 update private.ai_runs set status='failed',finished_at=t,ms=v_ms,error=left(coalesce(p_error,'failed'),200),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 gave_up:=r.attempts+1>=2;
 update private.discover_theme_rounds set status=case when gave_up then 'failed' else 'pending' end,attempts=attempts+1,lease_id=null,lease_run=null,lease_until=null,
  last_failed_at=t,last_error=left(coalesce(p_error,'failed'),200) where id=r.id;
 return jsonb_build_object('status','ok','gave_up',gave_up);
end $$;

-- ---------- What steps 4 and 5 read ----------
-- Only accepted themes count anywhere. A theme merged beneath another is counted in its survivor; a rejected or draft theme, a
-- deleted one and one whose finding was removed are not here. Thin and strong follow the Default rules above. Quotes are the
-- room's own words, each with the kind and id of what it came from; no person is ever in one.
create function private.discover_accepted_themes(p_engagement uuid)
returns table(theme_id uuid,source text,label text,detail text,rests_on integer,out_of integer,thin boolean,strong boolean,quotes jsonb)
language sql stable security definer set search_path='' as $$
 with cards as materialized (select k.card_id,coalesce(k.folded_ids,array[]::uuid[]) as folded_ids from private.four_lists_cards_for_themes(p_engagement) k),
 th as (select t.*,case when t.source='four_lists' then (select c.n from private.discover_card_counts(p_engagement,t.id) c) else t.rests_on end as n,
   case when t.source='four_lists' then (select c.o from private.discover_card_counts(p_engagement,t.id) c) else t.out_of end as o
  from private.discover_themes t where t.engagement_id=p_engagement and not t.deleted and t.status='accepted' and t.merged_into is null)
 select t.id,t.source,t.label,t.detail,t.n,t.o,private.discover_is_thin(t.source,t.n,t.o),private.discover_is_strong(t.source,t.n,t.o),
  coalesce((select jsonb_agg(q.j order by q.rank) from (
    select jsonb_build_object('kind',case when s.finding_id is not null then 'finding' when s.note_id is not null then 'note' else 'card' end,'id',coalesce(s.finding_id,s.note_id,s.card_id),'quote',s.quote) as j,
     row_number() over(order by (s.theme_id<>t.id),s.created_at,s.id) as rank
    from private.discover_theme_sources s where s.engagement_id=t.engagement_id and not s.deleted and s.quote is not null
     and (s.theme_id=t.id or s.theme_id in (select m.id from private.discover_themes m where m.merged_into=t.id and m.engagement_id=t.engagement_id and not m.deleted))
     and (s.note_id is null or exists(select 1 from private.conversation_notes c where c.id=s.note_id and c.engagement_id=s.engagement_id and not c.deleted))
     and (s.card_id is null or exists(select 1 from cards k where k.card_id=s.card_id or s.card_id=any(k.folded_ids)))) q where q.rank<=3),'[]'::jsonb)
 from th t
 order by (t.source<>'survey'),t.seq
$$;

-- ---------- Public entry points (invokers; every check is in the private functions) ----------
create function public.discover_themes_state(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.discover_themes_state(p_engagement) $$;
create function public.discover_theme_act(p_engagement uuid,p_theme uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_theme_act(p_engagement,p_theme,p_action,p) $$;
create function public.discover_theme_add(p_engagement uuid,p_id uuid,p_source text,p_label text,p_detail text,p_sources uuid[]) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_theme_add(p_engagement,p_id,p_source,p_label,p_detail,p_sources) $$;
create function public.discover_draft_start(p_engagement uuid,p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_draft_start(p_engagement,p_id) $$;
create function public.discover_theme_due(p_engagement uuid) returns boolean
language sql stable security invoker set search_path='' as $$ select private.discover_theme_due(p_engagement) $$;
create function public.discover_theme_claim(p_engagement uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_theme_claim(p_engagement,p_lease,p_model,p_versions) $$;
create function public.discover_theme_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_theme_apply(p_run,p_lease,p_output,p_usage) $$;
create function public.discover_theme_fail(p_run uuid,p_lease uuid,p_error text,p_usage jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.discover_theme_fail(p_run,p_lease,p_error,p_usage) $$;

revoke all on function private.discover_is_thin(text,integer,integer),private.discover_is_strong(text,integer,integer),private.discover_recount(uuid,uuid),private.discover_notes_recount(),
 private.discover_names(uuid),private.discover_has_name(text,text[]),private.discover_card_counts(uuid,uuid),
 private.discover_themes_state(uuid),private.discover_theme_act(uuid,uuid,text,jsonb),private.discover_theme_add(uuid,uuid,text,text,text,uuid[]),private.discover_draft_start(uuid,uuid),
 private.discover_theme_due(uuid),private.discover_theme_claim(uuid,uuid,text,jsonb),private.discover_theme_apply(uuid,uuid,jsonb,jsonb),private.discover_theme_fail(uuid,uuid,text,jsonb),
 private.discover_accepted_themes(uuid),
 public.discover_themes_state(uuid),public.discover_theme_act(uuid,uuid,text,jsonb),public.discover_theme_add(uuid,uuid,text,text,text,uuid[]),public.discover_draft_start(uuid,uuid),
 public.discover_theme_due(uuid),public.discover_theme_claim(uuid,uuid,text,jsonb),public.discover_theme_apply(uuid,uuid,jsonb,jsonb),public.discover_theme_fail(uuid,uuid,text,jsonb)
 from public,anon,authenticated;
grant execute on function private.discover_themes_state(uuid),private.discover_theme_act(uuid,uuid,text,jsonb),private.discover_theme_add(uuid,uuid,text,text,text,uuid[]),private.discover_draft_start(uuid,uuid),
 public.discover_themes_state(uuid),public.discover_theme_act(uuid,uuid,text,jsonb),public.discover_theme_add(uuid,uuid,text,text,text,uuid[]),public.discover_draft_start(uuid,uuid) to authenticated;
grant execute on function private.discover_theme_due(uuid),private.discover_theme_claim(uuid,uuid,text,jsonb),private.discover_theme_apply(uuid,uuid,jsonb,jsonb),private.discover_theme_fail(uuid,uuid,text,jsonb),
 private.discover_accepted_themes(uuid),
 public.discover_theme_due(uuid),public.discover_theme_claim(uuid,uuid,text,jsonb),public.discover_theme_apply(uuid,uuid,jsonb,jsonb),public.discover_theme_fail(uuid,uuid,text,jsonb) to service_role;

-- ---------- The practice reset clears the drafting round too ----------
-- A superset of the newest definition on main (step 1, 20261106010000): the same text plus the practice room's drafting round.
-- If step 2 has already wrapped it (renamed to reset_practice_room_base and a wrapper that calls it), the base is the one that is
-- redefined, so the wrapper and its Four Helpful Lists clearing stay in place whichever of the two steps merges first.
do $reset$
declare target text:=case when to_regprocedure('private.reset_practice_room_base()') is not null then 'reset_practice_room_base' else 'reset_practice_room' end;
begin
 execute format('create or replace function private.%I() returns boolean language plpgsql security definer set search_path=%L as %L',target,'',$body$
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
 update private.discover_theme_rounds set deleted=true where engagement_id=eng and not deleted;
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
end $body$);
end $reset$;

commit;
