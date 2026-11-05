-- Milestone 4, step 2b: Live lens summaries and sign-off (INT-18). Live only, after merge and Chris's approval.
-- No session is started and nothing is seeded.
--
-- One new kind joins the interaction registry: lens_summary. After the Learning lens, AI drafts each
-- lens's one-screen 10-year Future summary in the present tense from that lens's sentences and
-- clusters, each summary sentence linked to its source sentences. It goes straight to the TV, marked
-- AI, with undo. The facilitator can edit it on the control surface while it is live. Phones tap
-- Approve or Suggest a change (a short box). AI folds the suggestions into a new version, shown on
-- the TV in tracked-change style. The facilitator marks the room's decision for each lens with Mark
-- a decision. Every version is kept. AI is never in the path from a phone to the TV: an answer is
-- stored and broadcast first, and a draft or a fold arrives later as its own room event.
--
-- It uses the milestone 4 step 1 records (lens_summaries, lens_summary_versions, lens_summary_sentences,
-- lens_summary_sources, lens_summary_responses, decisions) and adds a few columns to them.
--
-- Shared objects this migration touches, each as a superset of what is on main:
--   private.ai_runs ai_runs_job_check   keeps every job and adds draft_lens_summary and fold_lens_summary
--                                       (and keeps ai_runs_session_check from the overnight migration)
--   private.ai_on                       keeps every branch and adds the lens_summary kind
--   private.ai_claim, private.ai_apply  now wrappers: a lens_summary session (or one of its two jobs) is
--                                       handled here, everything else goes to the unchanged function,
--                                       renamed ai_claim_base2 and ai_apply_base2
--   private.ai_fail                     now a wrapper over ai_fail_base2: the same, plus the room is
--                                       told when a lens summary job failed
--   private.reset_practice_room         keeps every statement of the wayfinding records version, and
--                                       also clears the overnight review tables and this step's tables
begin;

-- ---------- The kind ----------
-- One answer per person for the version on the screen: {"version": id, "response": "approve"|"suggest"},
-- with the suggestion in the text. Answers never reach the TV or other phones as answers (the results
-- carry anonymous suggestion cards and a tally).
insert into private.interaction_kinds(kind,label,input,one_per_person,counts,structured,shares_answers,spotlight,named,position) values
 ('lens_summary','Lens summary',true,true,'people',true,false,'none','never',28);

-- ---------- Records this step adds to ----------
alter table private.lens_summaries
 add column draft_held boolean not null default false,        -- AI does not draft until the facilitator asks again
 add column fold_held boolean not null default false,         -- Hold: AI does not fold suggestions in
 add column fold_now_at timestamptz,                          -- Fold in now
 add column fold_tried text,                                  -- the version and suggestions AI last tried to fold
 add column fold_tried_at timestamptz;
alter table private.lens_summary_versions
 add column tracked boolean not null default false,           -- shown as tracked changes against based_on
 add column based_on uuid;                                    -- the version it grew from
alter table private.lens_summary_sentences
 add column from_sentence_id uuid;                            -- the sentence it grew from, in the version before
alter table private.lens_summary_responses
 add column submission_id uuid references public.submissions(id) on delete cascade;
create index lens_summary_responses_submission_idx on private.lens_summary_responses(submission_id);

-- Who is editing a summary, and which line. A lock is an editing presence seen in the last 40 seconds
-- (the screen sends a beat every 12). typed_at is the last keystroke batch, for the TV's caret.
create table private.lens_summary_locks (
 summary_id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 user_id uuid not null references public.clearway_users(id),
 sentence_id uuid,
 seen_at timestamptz not null default clock_timestamp(),
 typed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(summary_id,engagement_id) references private.lens_summaries(id,engagement_id)
);
create index lens_summary_locks_engagement_idx on private.lens_summary_locks(engagement_id);
create index lens_summary_locks_user_idx on private.lens_summary_locks(user_id);
alter table private.lens_summary_locks enable row level security;
alter table private.lens_summary_locks force row level security;
revoke all on private.lens_summary_locks from public,anon,authenticated;
grant select,insert,update,delete on private.lens_summary_locks to service_role;
create trigger touch_record before update on private.lens_summary_locks for each row execute function private.touch_live_record('summary_id');
comment on table private.lens_summary_locks is 'Who is editing a lens summary. No role reads it directly; the facilitator functions and the AI claim do.';

-- ---------- AI jobs and the switch ----------
alter table private.ai_runs drop constraint ai_runs_job_check;
alter table private.ai_runs add constraint ai_runs_job_check check(job in ('combine_words','group_wall','summarize_wall','fold_questions','merge_reasons','group_lens','overnight_draft','draft_lens_summary','fold_lens_summary'));

create or replace function private.ai_on(p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select coalesce(e.settings->>'ai_enabled','false')='true'
   and (s.interaction in ('word_cloud','wall','qa','lens_summary') or (s.interaction='grid' and s.options->>'preset'='pre_mortem') or (s.interaction='lens' and coalesce(s.options->>'seed','false')<>'true'))
   and coalesce(a.ai,case when jsonb_typeof(s.options->'ai')='boolean' then (s.options->>'ai')::boolean end,true)
  from public.sessions s join public.engagements e on e.id=s.engagement_id and not e.deleted
  left join private.ai_sessions a on a.session_id=s.id and not a.deleted
  where s.id=p_session and not s.deleted),false)
$$;

-- ---------- Small helpers ----------
-- The lens a summary step is on: its option (1 to 5), the first lens until the facilitator moves on.
create function private.ls_lens(p_options jsonb) returns smallint
language sql immutable security invoker set search_path='' as $$
 select case when p_options->>'lens' ~ '^[1-5]$' then (p_options->>'lens')::smallint else 1::smallint end
$$;

-- One summary row per lens per engagement, made when first needed.
create function private.ls_ensure(p_engagement uuid,p_lens smallint) returns private.lens_summaries
language plpgsql security definer set search_path='' as $$
declare sm private.lens_summaries;
begin
 select * into sm from private.lens_summaries where engagement_id=p_engagement and lens=p_lens and not deleted;
 if sm.id is null then
  insert into private.lens_summaries(engagement_id,lens) values(p_engagement,p_lens) on conflict(engagement_id,lens) where not deleted do nothing;
  select * into sm from private.lens_summaries where engagement_id=p_engagement and lens=p_lens and not deleted;
 end if;
 return sm;
end $$;

-- A word-level difference between two wordings: the words they share at the start, what went, what came
-- in, and the words they share at the end. Parts: keep, del, ins.
create function private.ls_diff(p_old text,p_new text) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare a text[]:=case when btrim(coalesce(p_old,''))='' then array[]::text[] else regexp_split_to_array(btrim(p_old),'\s+') end;
 b text[]:=case when btrim(coalesce(p_new,''))='' then array[]::text[] else regexp_split_to_array(btrim(p_new),'\s+') end;
 la integer:=coalesce(cardinality(a),0); lb integer:=coalesce(cardinality(b),0); i integer:=0; j integer:=0; out jsonb:='[]'::jsonb;
begin
 while i<la and i<lb and a[i+1]=b[i+1] loop i:=i+1; end loop;
 while j<la-i and j<lb-i and a[la-j]=b[lb-j] loop j:=j+1; end loop;
 if i>0 then out:=out||jsonb_build_array(jsonb_build_object('k','keep','t',array_to_string(a[1:i],' '))); end if;
 if la-i-j>0 then out:=out||jsonb_build_array(jsonb_build_object('k','del','t',array_to_string(a[i+1:la-j],' '))); end if;
 if lb-i-j>0 then out:=out||jsonb_build_array(jsonb_build_object('k','ins','t',array_to_string(b[i+1:lb-j],' '))); end if;
 if j>0 then out:=out||jsonb_build_array(jsonb_build_object('k','keep','t',array_to_string(a[la-j+1:la],' '))); end if;
 return out;
end $$;

-- What changed from one version to the next: an edit (with the word-level parts), an added sentence, a
-- removed one. Lines are matched by lineage (from_sentence_id), never by position. "at" is the line's
-- place in the new version, or for a removal the place after which it used to sit.
create function private.ls_changes(p_prev uuid,p_new uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with n as (select id,text,from_sentence_id,row_number() over(order by position)::integer as pos from private.lens_summary_sentences where version_id=p_new and not deleted),
 o as (select id,text,row_number() over(order by position)::integer as pos from private.lens_summary_sentences where version_id=p_prev and not deleted),
 ch as (
  select n.pos as place,n.id,case when o.id is null then 'add' else 'edit' end as kind,
   case when o.id is null then jsonb_build_array(jsonb_build_object('k','ins','t',n.text)) else private.ls_diff(o.text,n.text) end as parts
  from n left join o on o.id=n.from_sentence_id where o.id is null or o.text<>n.text
  union all
  select coalesce((select max(n2.pos) from n n2 join o o2 on o2.id=n2.from_sentence_id where o2.pos<o.pos),0),o.id,'remove',
   jsonb_build_array(jsonb_build_object('k','del','t',o.text))
  from o where not exists(select 1 from n where n.from_sentence_id=o.id)
 )
 select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',id,'at',place,'parts',parts) order by place,kind),'[]'::jsonb) from ch
$$;

-- A new version of a summary, made current. Sentences and their sources are written with it. shown_at is
-- set only when the version goes straight onto the TV.
create function private.ls_new_version(p_summary uuid,p_author text,p_run uuid,p_note text,p_texts text[],p_froms uuid[],p_sources jsonb,p_tracked boolean,p_prev uuid,p_show boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare sm private.lens_summaries; vid uuid:=gen_random_uuid(); n integer; sid uuid;
begin
 select * into sm from private.lens_summaries where id=p_summary;
 select coalesce(max(version),0)+1 into n from private.lens_summary_versions where summary_id=p_summary;
 insert into private.lens_summary_versions(id,engagement_id,summary_id,version,author,ai_run_id,note,tracked,based_on,shown_at)
  values(vid,sm.engagement_id,sm.id,n,p_author,p_run,left(coalesce(p_note,''),300),p_tracked,p_prev,case when p_show then clock_timestamp() end);
 for i in 1..coalesce(cardinality(p_texts),0) loop
  sid:=gen_random_uuid();
  insert into private.lens_summary_sentences(id,engagement_id,version_id,position,text,from_sentence_id) values(sid,sm.engagement_id,vid,i-1,p_texts[i],p_froms[i]);
  insert into private.lens_summary_sources(summary_sentence_id,lens_sentence_id,engagement_id)
   select sid,x::uuid,sm.engagement_id from jsonb_array_elements_text(case when jsonb_typeof(p_sources->(i-1))='array' then p_sources->(i-1) else '[]'::jsonb end) x on conflict do nothing;
 end loop;
 if p_prev is not null then update private.lens_summary_versions set changes=private.ls_changes(p_prev,vid) where id=vid; end if;
 update private.lens_summaries set current_version_id=vid,state='on_screen' where id=sm.id;
 return vid;
end $$;

-- A copy of a version to edit: the same words and sources, each line remembering where it came from.
create function private.ls_copy(p_summary uuid,p_from uuid,p_author text,p_show boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare texts text[]; froms uuid[]; srcs jsonb;
begin
 select array_agg(ss.text order by ss.position),array_agg(ss.id order by ss.position),
   jsonb_agg(coalesce((select jsonb_agg(x.lens_sentence_id) from private.lens_summary_sources x where x.summary_sentence_id=ss.id and not x.deleted),'[]'::jsonb) order by ss.position)
  into texts,froms,srcs from private.lens_summary_sentences ss where ss.version_id=p_from and not ss.deleted;
 return private.ls_new_version(p_summary,p_author,null,'',texts,froms,srcs,false,p_from,p_show);
end $$;

-- The lens's standing sentences and clusters under short refs, for the AI jobs. No names, no ids except
-- under "ids", which the prompt never prints. Sentences: a1.. Clusters: c1..
create function private.ls_inputs(p_engagement uuid,p_lens smallint) returns jsonb
language sql stable security definer set search_path='' as $$
 with e as (select * from public.engagements where id=p_engagement),
 sent as (
  select q.id,q.text,q.submission_id,row_number() over(order by q.created_at,q.id) as n
  from (select l.id,l.text,l.submission_id,l.created_at from private.lens_sentences l left join public.submissions x on x.id=l.submission_id
   where l.engagement_id=p_engagement and l.lens=p_lens and not l.deleted and not l.withdrawn
    and (l.submission_id is null or (not x.deleted and not x.withdrawn and not x.hidden))
    and (private.lens_is_open(p_engagement,p_lens) or coalesce(x.test,false))
   order by l.created_at,l.id limit 200) q),
 grp as (
  select g.id,g.label,g.created_at,array_agg(s.n order by s.n) as members
  from private.ai_groups g join private.ai_group_members gm on gm.group_id=g.id and gm.removed_at is null and not gm.deleted
  join sent s on s.submission_id=gm.submission_id
  join public.sessions ss on ss.id=g.session_id and ss.interaction='lens' and ss.options->>'lens'=p_lens::text
  where g.engagement_id=p_engagement and g.undone_at is null and not g.deleted
  group by g.id having count(*)>=2),
 gn as (select grp.*,row_number() over(order by cardinality(members) desc,created_at,id) as c from grp)
 select jsonb_build_object('lens',p_lens,'lens_name',e.lens_names[p_lens],'lens_names',to_jsonb(e.lens_names),'base_year',e.base_year,'year',e.base_year+10,
  'max_chars',420,'max_sentences',8,
  'sentences',(select coalesce(jsonb_agg(jsonb_build_object('ref','a'||n,'text',text) order by n),'[]'::jsonb) from sent),
  'clusters',(select coalesce(jsonb_agg(jsonb_build_object('ref','c'||c,'label',label,'members',(select jsonb_agg('a'||m order by m) from unnest(members) m)) order by c),'[]'::jsonb) from gn where c<=12),
  'ids',jsonb_build_object('a',(select coalesce(jsonb_object_agg('a'||n,id),'{}'::jsonb) from sent)))
 from e
$$;

-- ---------- Options: the lens the step is on ----------
create function private.options_lens_summary(p jsonb,p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when jsonb_typeof(p)='object' and not exists(select 1 from jsonb_object_keys(p) k where k not in ('lens','ai'))
  and (not p ? 'lens' or p->>'lens' is null or p->>'lens' ~ '^[1-5]$') and coalesce(jsonb_typeof(p->'ai'),'boolean')='boolean'
  then jsonb_strip_nulls(jsonb_build_object('lens',case when p->>'lens' ~ '^[1-5]$' then (p->>'lens')::integer end,'ai',case when p ? 'ai' then (p->>'ai')::boolean end)) end
$$;

-- ---------- A phone's answer: Approve, or Suggest a change ----------
-- The version must be the one on the screen now. A phone that is a version behind gets "stale", reads the
-- new version and answers that one. The suggestion goes through the word filter and is at most 140 characters.
create function private.parse_lens_summary(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sm private.lens_summaries; v private.lens_summary_versions; t text; resp text;
begin
 if jsonb_typeof(p_value) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_value))<>2
  or p_value->>'version' is null or p_value->>'version' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or p_value->>'response' is null or p_value->>'response' not in ('approve','suggest') then return jsonb_build_object('status','invalid_answer'); end if;
 resp:=p_value->>'response';
 select * into sm from private.lens_summaries where engagement_id=p_session.engagement_id and lens=private.ls_lens(p_session.options) and not deleted;
 select * into v from private.lens_summary_versions where id=sm.current_version_id and not deleted and undone_at is null and shown_at is not null;
 if sm.id is null or v.id is null or v.id<>(p_value->>'version')::uuid or sm.state='signed_off' then return jsonb_build_object('status','stale'); end if;
 if resp='approve' then return jsonb_build_object('status','ok','text','Approve','answers','[]'::jsonb,'value',jsonb_build_object('version',v.id,'response','approve')); end if;
 t:=btrim(regexp_replace(coalesce(p_text,''),'\s+',' ','g'));
 if length(t)=0 then return jsonb_build_object('status','invalid_answer'); end if;
 if length(t)>140 then return jsonb_build_object('status','limit'); end if;
 if private.screen_text(t) then return jsonb_build_object('status','filtered'); end if;
 return jsonb_build_object('status','ok','text',t,'answers','[]'::jsonb,'value',jsonb_build_object('version',v.id,'response','suggest'));
end $$;

-- Each answer is mirrored into the records (step 1's table). A person's answer on one version stands
-- once; an answer on an earlier version stays as history when a later one replaces it.
create function private.ls_mirror() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.sessions; ver uuid; resp text;
begin
 select * into s from public.sessions where id=new.session_id and engagement_id=new.engagement_id;
 if s.interaction is distinct from 'lens_summary' then return new; end if;
 ver:=case when new.value->>'version' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (new.value->>'version')::uuid end;
 if ver is null then return new; end if;
 if new.deleted or new.hidden or (new.withdrawn and new.replaced_by is null) then
  update private.lens_summary_responses set deleted=true where submission_id=new.id and version_id=ver and not deleted;
  return new;
 end if;
 if new.withdrawn then return new; end if;
 resp:=new.value->>'response';
 if resp is null or resp not in ('approve','suggest') then return new; end if;
 update private.lens_summary_responses set deleted=true where version_id=ver and attendee_id=new.attendee_id and not deleted and submission_id is distinct from new.id;
 update private.lens_summary_responses set response=resp,suggestion=case when resp='suggest' then left(new.text,280) else '' end
  where submission_id=new.id and version_id=ver and not deleted;
 if not found then
  insert into private.lens_summary_responses(engagement_id,version_id,attendee_id,response,suggestion,submission_id)
   values(new.engagement_id,ver,new.attendee_id,resp,case when resp='suggest' then left(new.text,280) else '' end,new.id);
 end if;
 return new;
end $$;
create trigger ls_mirror after insert or update of text,value,withdrawn,hidden,deleted on public.submissions for each row execute function private.ls_mirror();

-- ---------- Going on air shows the lens's summary ----------
-- The step goes on the TV: the current lens's summary, if there is one, is shown now. The results are
-- recomputed here so it arrives with the step.
create function private.ls_on_air() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.sessions; sm private.lens_summaries;
begin
 if new.live_session_id is null or new.live_session_id is not distinct from old.live_session_id then return new; end if;
 select * into s from public.sessions where id=new.live_session_id and not deleted;
 if s.interaction is distinct from 'lens_summary' then return new; end if;
 select * into sm from private.lens_summaries where engagement_id=new.engagement_id and lens=private.ls_lens(s.options) and not deleted;
 if sm.current_version_id is not null then
  update private.lens_summary_versions set shown_at=clock_timestamp() where id=sm.current_version_id and shown_at is null and undone_at is null and not deleted;
 end if;
 new.results:=private.live_results_for(new.engagement_id,new.live_session_id,new.hidden_keys);
 return new;
end $$;
create trigger ls_on_air before update of live_session_id on public.room_states for each row execute function private.ls_on_air();

-- ---------- What every screen shows ----------
-- The same payload reaches the TV and the phones, and only while the version has been shown. It carries the
-- lens, the summary (all its lines and how many fit one TV screen: 420 characters, at least one line), the
-- tally for this version, the suggestion cards (anonymous, no ids but a short tag, no names), what the AI is
-- doing and which line is being typed. No sources, no names, no alignment data, no presenter notes.
create function private.results_lens_summary(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.sessions; e public.engagements; sm private.lens_summaries; v private.lens_summary_versions; v_lens smallint; a private.ai_sessions; run private.ai_runs; lk private.lens_summary_locks;
 t timestamptz:=clock_timestamp(); sentences jsonb:='[]'::jsonb; fit integer:=0; n_app integer:=0; n_sug integer:=0; ppl integer:=0; sugg jsonb:='[]'::jsonb; ai_state text; dec_text text; typing uuid;
begin
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted and interaction='lens_summary';
 select * into e from public.engagements where id=p_engagement;
 if s.id is null then return jsonb_build_object('total',0,'people',0,'words','[]'::jsonb); end if;
 v_lens:=private.ls_lens(s.options);
 select * into sm from private.lens_summaries where engagement_id=p_engagement and lens=v_lens and not deleted;
 select * into v from private.lens_summary_versions where id=sm.current_version_id and not deleted and undone_at is null and shown_at is not null;
 select * into a from private.ai_sessions where session_id=p_session and not deleted;
 if a.lease_run is not null and a.lease_until>t then select * into run from private.ai_runs where id=a.lease_run and status='running'; end if;
 select * into lk from private.lens_summary_locks where summary_id=sm.id and not deleted;
 if v.id is not null then
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'pos',x.pos,'text',x.text) order by x.pos),'[]'::jsonb),count(*) filter (where x.fits)::integer into sentences,fit
   from (select ss.id,ss.text,row_number() over(order by ss.position)::integer as pos,
     (sum(length(ss.text)+1) over(order by ss.position)-1<=420 or row_number() over(order by ss.position)=1) as fits
     from private.lens_summary_sentences ss where ss.version_id=v.id and not ss.deleted) x;
  select count(*) filter (where x.value->>'response'='approve')::integer,count(*) filter (where x.value->>'response'='suggest')::integer,count(distinct x.attendee_id)::integer
   into n_app,n_sug,ppl from public.submissions x
   where x.session_id=p_session and x.engagement_id=p_engagement and not x.deleted and not x.withdrawn and not x.hidden and x.value->>'version'=v.id::text;
  select coalesce(jsonb_agg(jsonb_build_object('id',left(q.id::text,8),'text',q.text) order by q.ts desc,q.id),'[]'::jsonb) into sugg
   from (select x.id,x.text,x.updated_at as ts from public.submissions x where x.session_id=p_session and x.engagement_id=p_engagement and not x.deleted and not x.withdrawn and not x.hidden and not (x.id::text=any(p_hidden))
     and x.value->>'version'=v.id::text and x.value->>'response'='suggest' order by x.updated_at desc,x.id limit 24) q;
  if sm.decision_id is not null and sm.state='signed_off' then select d.decision into dec_text from private.decisions d where d.id=sm.decision_id and not d.deleted; end if;
 end if;
 if lk.summary_id is not null and lk.sentence_id is not null and lk.typed_at>t-interval '4 seconds' then typing:=lk.sentence_id; end if;
 ai_state:=case when not private.ai_on(p_session) then 'off'
  when run.job='draft_lens_summary' then 'drafting' when run.job='fold_lens_summary' then 'folding'
  when lk.summary_id is not null and lk.seen_at>t-interval '40 seconds' then 'editing'
  when sm.fold_held or sm.draft_held then 'held' else 'idle' end;
 return jsonb_build_object('total',n_app+n_sug,'people',ppl,'words','[]'::jsonb,'lens',v_lens,'lens_name',e.lens_names[v_lens],'lens_names',to_jsonb(e.lens_names),
  'lenses',(select jsonb_agg(jsonb_build_object('lens',g.l,'name',e.lens_names[g.l],'state',
     case when m.state='signed_off' then 'signed' when g.l=v_lens then 'now' else 'later' end) order by g.l)
    from generate_series(1,5) g(l) left join private.lens_summaries m on m.engagement_id=p_engagement and m.lens=g.l and not m.deleted),
  'signed',(select count(*) from private.lens_summaries m where m.engagement_id=p_engagement and m.state='signed_off' and not m.deleted),
  'ai',private.ai_on(p_session),'ai_state',ai_state,'typing',typing,
  'summary',case when v.id is not null then jsonb_build_object('id',sm.id,'version_id',v.id,'version',v.version,'author',v.author,'tracked',v.tracked,'note',v.note,
    'sentences',sentences,'fit',fit,'more',jsonb_array_length(sentences)-fit,'changes',case when v.tracked then v.changes else '[]'::jsonb end,
    'signed',sm.state='signed_off','decision',dec_text) end,
  'tally',jsonb_build_object('approve',n_app,'suggest',n_sug),'suggestions',sugg);
end $$;

create function private.items_lens_summary(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$ select '[]'::jsonb $$;

-- ---------- The sources, for phones ----------
-- The lens sentences behind each line of the version on the screen. Phones only: the TV never gets them.
-- Nothing before the version has been shown.
create function private.lens_summary_sources(p_engagement uuid,p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.room_states; s public.sessions; sm private.lens_summaries; v private.lens_summary_versions;
begin
 if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted and interaction='lens_summary';
 if s.id is null or r.live_session_id is distinct from s.id then return jsonb_build_object('status','missing'); end if;
 select * into sm from private.lens_summaries where engagement_id=p_engagement and lens=private.ls_lens(s.options) and not deleted;
 select * into v from private.lens_summary_versions where id=sm.current_version_id and not deleted and undone_at is null and shown_at is not null;
 if v.id is null then return jsonb_build_object('status','missing'); end if;
 return jsonb_build_object('status','ok','version',v.id,'sentences',coalesce((select jsonb_agg(jsonb_build_object('id',ss.id,'sources',coalesce((
    select jsonb_agg(jsonb_build_object('id',l.id,'text',l.text) order by l.created_at,l.id) from private.lens_summary_sources src
     join private.lens_sentences l on l.id=src.lens_sentence_id and l.engagement_id=src.engagement_id and not l.deleted and not l.withdrawn
     where src.summary_sentence_id=ss.id and not src.deleted),'[]'::jsonb)) order by ss.position)
   from private.lens_summary_sentences ss where ss.version_id=v.id and not ss.deleted),'[]'::jsonb));
end $$;

-- ---------- The facilitator's view ----------
-- Everything the control surface lists for the step: the five lenses, the summary on show with each line's
-- sources, the suggestions, the versions, the lock, the AI and the decision. Facilitators only.
create function private.lens_summary_state(p_engagement uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; e public.engagements; sm private.lens_summaries; v private.lens_summary_versions; a private.ai_sessions; run private.ai_runs; lk private.lens_summary_locks;
 t timestamptz:=clock_timestamp(); v_lens smallint; last_sug timestamptz; n_sug integer:=0; n_app integer:=0; sig text; wait_ms integer; ai_state text; room jsonb; last_run private.ai_runs; d private.decisions; me uuid:=private.clearway_user_id();
begin
 if not coalesce(private.wf_facilitates(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 select * into e from public.engagements where id=p_engagement;
 select * into s from public.sessions where id=r.live_session_id and not deleted and interaction='lens_summary';
 if s.id is null then return jsonb_build_object('status','ok','session',null,'lens_names',to_jsonb(e.lens_names)); end if;
 v_lens:=private.ls_lens(s.options);
 select * into sm from private.lens_summaries where engagement_id=p_engagement and lens=v_lens and not deleted;
 select * into v from private.lens_summary_versions where id=sm.current_version_id and not deleted and undone_at is null;
 select * into a from private.ai_sessions where session_id=s.id and not deleted;
 if a.lease_run is not null and a.lease_until>t then select * into run from private.ai_runs where id=a.lease_run and status='running'; end if;
 select * into lk from private.lens_summary_locks where summary_id=sm.id and not deleted;
 select * into last_run from private.ai_runs where session_id=s.id and job in ('draft_lens_summary','fold_lens_summary') and not deleted order by created_at desc limit 1;
 if v.id is not null then
  select count(*) filter (where x.value->>'response'='suggest')::integer,count(*) filter (where x.value->>'response'='approve')::integer,max(x.updated_at) filter (where x.value->>'response'='suggest'),
    md5(string_agg(x.id::text||':'||x.revision::text,',' order by x.id) filter (where x.value->>'response'='suggest'))
   into n_sug,n_app,last_sug,sig from public.submissions x
   where x.session_id=s.id and x.engagement_id=p_engagement and not x.deleted and not x.withdrawn and not x.hidden and x.value->>'version'=v.id::text;
 end if;
 if n_sug>0 and not sm.fold_held and sm.state<>'signed_off' and not (lk.summary_id is not null and lk.seen_at>t-interval '40 seconds')
  and (sm.fold_tried is distinct from v.id::text||':'||sig or (sm.fold_now_at is not null and sm.fold_now_at>coalesce(sm.fold_tried_at,'-infinity'))) then
  wait_ms:=greatest(0,(extract(epoch from last_sug+interval '3 seconds'-t)*1000)::integer);
 end if;
 ai_state:=case when not private.ai_on(s.id) then 'off' when run.job='draft_lens_summary' then 'drafting' when run.job='fold_lens_summary' then 'folding'
  when lk.summary_id is not null and lk.seen_at>t-interval '40 seconds' then 'editing' when sm.fold_held or sm.draft_held then 'held'
  when wait_ms is not null then 'waiting' else 'idle' end;
 if sm.decision_id is not null then select * into d from private.decisions where id=sm.decision_id and not deleted; end if;
 room:=private.results_lens_summary(p_engagement,s.id,array[]::text[]);
 return jsonb_build_object('status','ok','session',s.id,'lens',v_lens,'lens_names',to_jsonb(e.lens_names),'version',r.version,'room',room,
  'lenses',(select jsonb_agg(jsonb_build_object('lens',g.l,'name',e.lens_names[g.l],'state',coalesce(m.state,'empty'),'versions',coalesce((select count(*) from private.lens_summary_versions x where x.summary_id=m.id and not x.deleted),0),
     'open',private.lens_is_open(p_engagement,g.l::smallint),
     'sentences',case when private.lens_is_open(p_engagement,g.l::smallint) then (select count(*) from private.lens_sentences l where l.engagement_id=p_engagement and l.lens=g.l and not l.deleted and not l.withdrawn) else 0 end,
     'drafted',m.current_version_id is not null) order by g.l)
    from generate_series(1,5) g(l) left join private.lens_summaries m on m.engagement_id=p_engagement and m.lens=g.l and not m.deleted),
  'summary',jsonb_build_object('id',sm.id,'state',coalesce(sm.state,'empty'),'version_id',v.id,'author',v.author,'tracked',v.tracked,'signed_off_version_id',sm.signed_off_version_id,
    'draft_held',coalesce(sm.draft_held,false),'fold_held',coalesce(sm.fold_held,false),
    'decision',case when d.id is not null then jsonb_build_object('id',d.id,'decision',d.decision,'reasons',d.reasons,'at',d.marked_at) end,
    'sentences',coalesce((select jsonb_agg(jsonb_build_object('id',ss.id,'pos',ss.pos,'text',ss.text,'sources',coalesce((
        select jsonb_agg(jsonb_build_object('id',l.id,'text',l.text) order by l.created_at,l.id) from private.lens_summary_sources src
         join private.lens_sentences l on l.id=src.lens_sentence_id and l.engagement_id=src.engagement_id and not l.deleted
         where src.summary_sentence_id=ss.id and not src.deleted),'[]'::jsonb)) order by ss.pos)
      from (select x.id,x.text,row_number() over(order by x.position)::integer as pos from private.lens_summary_sentences x where x.version_id=v.id and not x.deleted) ss),'[]'::jsonb),
    'versions',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'version',x.version,'author',x.author,'note',x.note,'tracked',x.tracked,'shown',x.shown_at is not null,'undone',x.undone_at is not null,
        'at',x.created_at,'current',x.id=sm.current_version_id,'signed',x.id=sm.signed_off_version_id,
        'approve',(select count(*) from private.lens_summary_responses q where q.version_id=x.id and q.response='approve' and not q.deleted),
        'suggest',(select count(*) from private.lens_summary_responses q where q.version_id=x.id and q.response='suggest' and not q.deleted),
        'sentences',(select jsonb_agg(z.text order by z.position) from private.lens_summary_sentences z where z.version_id=x.id and not z.deleted)) order by x.version desc)
      from private.lens_summary_versions x where x.summary_id=sm.id and not x.deleted),'[]'::jsonb),
    'suggestions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'text',q.text,'at',q.ts) order by q.ts desc,q.id)
      from (select x.id,x.text,x.updated_at as ts from public.submissions x where v.id is not null and x.session_id=s.id and x.engagement_id=p_engagement and not x.deleted and not x.withdrawn and not x.hidden
        and x.value->>'version'=v.id::text and x.value->>'response'='suggest' order by x.updated_at desc,x.id limit 60) q),'[]'::jsonb),
    'tally',jsonb_build_object('approve',n_app,'suggest',n_sug),
    'attendees',(select count(*) from public.attendees att where att.engagement_id=p_engagement and not att.deleted),
    'lock',case when lk.summary_id is not null and lk.seen_at>t-interval '40 seconds' then jsonb_build_object('mine',lk.user_id=me,
       'by',(select split_part(btrim(u.name),' ',1) from public.clearway_users u where u.id=lk.user_id),'sentence',lk.sentence_id) end),
  'ai',jsonb_build_object('on',private.ai_on(s.id),'engagement',coalesce(e.settings->>'ai_enabled','false')='true','state',ai_state,'wait_ms',wait_ms,
    'running_ms',case when run.id is not null then (extract(epoch from t-run.created_at)*1000)::integer end,'last_ms',a.last_ms,
    'failing',a.last_failed_at is not null and (a.last_ok_at is null or a.last_failed_at>a.last_ok_at),
    'last_run',case when last_run.id is not null then jsonb_build_object('id',last_run.id,'job',last_run.job,'status',last_run.status,'changed',last_run.changed,'undone',last_run.undone_at is not null,'at',last_run.created_at) end));
end $$;

-- ---------- The facilitator's presses ----------
-- show:       the lens the step is on: next, previous or a number. A drafted lens goes on the TV now.
-- edit_start, edit_beat, edit_done: the editing presence (a lock) the AI waits for. Not logged.
-- edit:       one line, in place, in small batches (op text, add or remove). The first edit of an AI version makes a
--             new version of the facilitator's own, with the tally at zero; the rest change that version in place,
--             with no tracked change. Not logged.
-- undo:       the current version goes; the one before comes back. An undone fold or draft is held, so AI does not
--             make the same one again until Release or Fold in now (or Write it again after the first draft).
-- fold_now, hold, release, redraft: the AI's pace. ai_on, ai_off: the AI switch.
-- decide:     Mark a decision for this lens: the room's consensus, by the facilitator, never a count.
-- undecide:   take the lens back to the screen.
create function private.lens_summary_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; sm private.lens_summaries; cv private.lens_summary_versions; w private.lens_summary_versions; me uuid:=private.clearway_user_id(); done private.room_controls;
 logged text; t timestamptz:=clock_timestamp(); v_lens smallint; v_new smallint; op text; txt text; target uuid; wid uuid; nsent integer; who text; before boolean; marked jsonb; word text; why text; n_sug integer; lk private.lens_summary_locks; prev uuid; changed boolean:=true;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or jsonb_typeof(p) is distinct from 'object'
  or p_action not in ('show','edit_start','edit_beat','edit','edit_done','undo','fold_now','hold','release','redraft','ai_on','ai_off','decide','undecide') then return jsonb_build_object('status','invalid_request'); end if;
 logged:=case p_action when 'show' then 'ls_show' when 'undo' then 'ls_undo' when 'fold_now' then 'ls_fold_now' when 'hold' then 'ls_hold' when 'release' then 'ls_release'
  when 'redraft' then 'ls_redraft' when 'ai_on' then 'turn_ai_on' when 'ai_off' then 'turn_ai_off' when 'decide' then 'mark_decision' when 'undecide' then 'ls_undecide' end;
 if logged is not null then
  select * into done from private.room_controls where id=p_id;
  if found then
   if done.engagement_id=p_engagement and done.action=logged then return jsonb_build_object('status','duplicate','version',r.version); end if;
   return jsonb_build_object('status','conflict');
  end if;
 end if;
 select * into s from public.sessions where id=r.live_session_id and not deleted and interaction='lens_summary';
 if s.id is null or s.state not in ('live','phones_down','open') then return jsonb_build_object('status','invalid_state'); end if;
 v_lens:=private.ls_lens(s.options);
 sm:=private.ls_ensure(p_engagement,v_lens);
 select * into sm from private.lens_summaries where id=sm.id for update;
 select * into cv from private.lens_summary_versions where id=sm.current_version_id and not deleted and undone_at is null;

 if p_action='show' then
  if p->>'to' in ('next','prev') then v_new:=v_lens+case when p->>'to'='next' then 1 else -1 end;
  elsif p->>'to' ~ '^[1-5]$' then v_new:=(p->>'to')::smallint;
  else return jsonb_build_object('status','invalid_request'); end if;
  if v_new not between 1 and 5 or v_new=v_lens then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update public.sessions set options=options||jsonb_build_object('lens',v_new::integer) where id=s.id;
  sm:=private.ls_ensure(p_engagement,v_new);
  update private.lens_summary_versions set shown_at=clock_timestamp() where id=sm.current_version_id and shown_at is null and undone_at is null and not deleted;
  delete from private.lens_summary_locks where engagement_id=p_engagement;

 elsif p_action in ('edit_start','edit_beat','edit_done') then
  if sm.state='signed_off' then return jsonb_build_object('status','invalid_state'); end if;
  if p_action='edit_done' then delete from private.lens_summary_locks where summary_id=sm.id; changed:=true;
  else
   if p ? 'sentence' and (jsonb_typeof(p->'sentence') is distinct from 'string' or p->>'sentence' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return jsonb_build_object('status','invalid_request'); end if;
   select * into lk from private.lens_summary_locks where summary_id=sm.id;
   if lk.summary_id is not null and lk.user_id<>me and lk.seen_at>t-interval '40 seconds' then return jsonb_build_object('status','locked','by',(select split_part(btrim(u.name),' ',1) from public.clearway_users u where u.id=lk.user_id)); end if;
   insert into private.lens_summary_locks as ll(summary_id,engagement_id,user_id,sentence_id,seen_at) values(sm.id,p_engagement,me,nullif(p->>'sentence','')::uuid,t)
    on conflict(summary_id) do update set user_id=me,seen_at=t,deleted=false,sentence_id=case when p ? 'sentence' then nullif(p->>'sentence','')::uuid else ll.sentence_id end;
   changed:=false;
  end if;

 elsif p_action='edit' then
  op:=p->>'op';
  if sm.state='signed_off' then return jsonb_build_object('status','invalid_state'); end if;
  if op is null or op not in ('text','add','remove') then return jsonb_build_object('status','invalid_request'); end if;
  select * into lk from private.lens_summary_locks where summary_id=sm.id;
  if lk.summary_id is not null and lk.user_id<>me and lk.seen_at>t-interval '40 seconds' then return jsonb_build_object('status','locked','by',(select split_part(btrim(u.name),' ',1) from public.clearway_users u where u.id=lk.user_id)); end if;
  if op in ('text','add') then
   if jsonb_typeof(p->'text') is distinct from 'string' then return jsonb_build_object('status','invalid_request'); end if;
   txt:=btrim(regexp_replace(p->>'text','\s+',' ','g'));
   if length(txt) not between 1 and 400 then return jsonb_build_object('status','invalid_request'); end if;
   if private.screen_text(txt) then return jsonb_build_object('status','filtered'); end if;
  end if;
  if op in ('text','remove') then
   if p->>'sentence' is null or p->>'sentence' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
   target:=(p->>'sentence')::uuid;
   if cv.id is null or not exists(select 1 from private.lens_summary_sentences where id=target and version_id=cv.id and not deleted) then return jsonb_build_object('status','missing'); end if;
   if op='text' and (select text from private.lens_summary_sentences where id=target)=txt then return jsonb_build_object('status','unchanged','version',r.version); end if;
   if op='remove' and (select count(*) from private.lens_summary_sentences where version_id=cv.id and not deleted)<=1 then return jsonb_build_object('status','invalid_state'); end if;
  end if;
  if cv.id is null then
   -- Nothing on the screen yet: the facilitator's own first line is version 1.
   if op<>'add' then return jsonb_build_object('status','missing'); end if;
   wid:=private.ls_new_version(sm.id,'facilitator',null,'',array[txt],array[null]::uuid[],'[[]]'::jsonb,false,null,true);
   update private.lens_summaries set draft_held=true where id=sm.id;
   select ss.id into target from private.lens_summary_sentences ss where ss.version_id=wid and not ss.deleted limit 1;
  else
   w:=cv;
   if cv.author<>'facilitator' then
    wid:=private.ls_copy(sm.id,cv.id,'facilitator',true);
    update private.lens_summaries set draft_held=true where id=sm.id;
    select * into w from private.lens_summary_versions where id=wid;
    if target is not null then select ss.id into target from private.lens_summary_sentences ss where ss.version_id=wid and ss.from_sentence_id=target and not ss.deleted; end if;
   end if;
   if op='text' then update private.lens_summary_sentences set text=txt where id=target;
   elsif op='remove' then update private.lens_summary_sentences set deleted=true where id=target;
   else
    select count(*) into nsent from private.lens_summary_sentences where version_id=w.id and not deleted;
    if nsent>=8 then return jsonb_build_object('status','full'); end if;
    insert into private.lens_summary_sentences(engagement_id,version_id,position,text) values(p_engagement,w.id,coalesce((select max(position)+1 from private.lens_summary_sentences where version_id=w.id),0),txt)
     returning id into target;
   end if;
   if w.based_on is not null then update private.lens_summary_versions set changes=private.ls_changes(w.based_on,w.id) where id=w.id; end if;
  end if;
  insert into private.lens_summary_locks(summary_id,engagement_id,user_id,sentence_id,seen_at,typed_at) values(sm.id,p_engagement,me,case when op='remove' then null else target end,t,t)
   on conflict(summary_id) do update set user_id=me,seen_at=t,typed_at=t,deleted=false,sentence_id=case when op='remove' then null else target end;

 elsif p_action='undo' then
  if sm.state='signed_off' then return jsonb_build_object('status','invalid_state'); end if;
  if cv.id is null then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.lens_summary_versions set undone_at=t where id=cv.id;
  if cv.ai_run_id is not null then update private.ai_runs set undone_at=t,undone_by=me where id=cv.ai_run_id and undone_at is null; end if;
  select x.id into prev from private.lens_summary_versions x where x.summary_id=sm.id and x.version<cv.version and not x.deleted and x.undone_at is null order by x.version desc limit 1;
  update private.lens_summaries set current_version_id=prev,state=case when prev is null then 'empty' else 'on_screen' end,
   fold_held=case when prev is not null then true else fold_held end,draft_held=case when prev is null then true else draft_held end where id=sm.id;
  delete from private.lens_summary_locks where summary_id=sm.id;
  if prev is not null then update private.lens_summary_versions set shown_at=coalesce(shown_at,t) where id=prev; end if;

 elsif p_action='fold_now' then
  if cv.id is null or sm.state='signed_off' then return jsonb_build_object('status','invalid_state'); end if;
  select count(*) into n_sug from public.submissions x where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden and x.value->>'version'=cv.id::text and x.value->>'response'='suggest';
  if n_sug=0 then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.lens_summaries set fold_now_at=t,fold_held=false where id=sm.id;
  delete from private.lens_summary_locks where summary_id=sm.id;
  changed:=false;

 elsif p_action in ('hold','release') then
  if sm.fold_held=(p_action='hold') then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.lens_summaries set fold_held=(p_action='hold') where id=sm.id;

 elsif p_action='redraft' then
  if cv.id is not null or not sm.draft_held then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.lens_summaries set draft_held=false where id=sm.id;
  changed:=false;

 elsif p_action in ('ai_on','ai_off') then
  if p_action='ai_on' and not exists(select 1 from public.engagements where id=p_engagement and settings->>'ai_enabled'='true') then return jsonb_build_object('status','engagement_off'); end if;
  insert into private.ai_sessions(session_id,engagement_id) values(s.id,s.engagement_id) on conflict(session_id) do nothing;
  perform 1 from private.ai_sessions where session_id=s.id for update;
  before:=private.ai_on(s.id);
  update private.ai_sessions set ai=(p_action='ai_on') where session_id=s.id;
  if before=private.ai_on(s.id) then return jsonb_build_object('status','unchanged','version',r.version); end if;

 elsif p_action='decide' then
  if cv.id is null or cv.shown_at is null then return jsonb_build_object('status','invalid_state'); end if;
  if sm.state='signed_off' then return jsonb_build_object('status','decided'); end if;
  if p ? 'decision' and jsonb_typeof(p->'decision') is distinct from 'string' then return jsonb_build_object('status','invalid_request'); end if;
  if p ? 'reasons' and jsonb_typeof(p->'reasons') is distinct from 'string' then return jsonb_build_object('status','invalid_request'); end if;
  word:=coalesce(nullif(btrim(regexp_replace(coalesce(p->>'decision',''),'\s+',' ','g')),''),'Signed off');
  why:=btrim(coalesce(p->>'reasons',''));
  if length(word) not between 1 and 400 or length(why)>1000 then return jsonb_build_object('status','invalid_request'); end if;
  marked:=private.decision_mark(p_engagement,p_id,jsonb_build_object('decision',word,'reasons',why,'label',private.ls_label(p_engagement,v_lens),'subject','lens_summary','subject_id',sm.id,'session',s.id));
  if marked->>'status' is distinct from 'ok' then return marked; end if;
  update private.lens_summaries set state='signed_off',signed_off_version_id=cv.id where id=sm.id;
  delete from private.lens_summary_locks where summary_id=sm.id;

 else
  if sm.state<>'signed_off' then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.lens_summaries set state='on_screen',signed_off_version_id=null,decision_id=null,fold_held=true where id=sm.id;
 end if;

 if changed then update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r; end if;
 -- decision_mark logged its own press; the edit family is not logged.
 if logged is not null and p_action<>'decide' then
  insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,me,logged,s.id,r.version,clock_timestamp());
  select split_part(btrim(name),' ',1) into who from public.clearway_users where id=me;
  perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action',logged,'by',who,'version',r.version,'changed',changed));
 end if;
 return jsonb_build_object('status','ok','version',r.version,'lens',(select private.ls_lens(options) from public.sessions where id=s.id));
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

-- The lens's name for the decision record's label.
create function private.ls_label(p_engagement uuid,p_lens smallint) returns text
language sql stable security definer set search_path='' as $$
 select left(e.lens_names[p_lens]||' lens summary',200) from public.engagements e where e.id=p_engagement
$$;

-- ---------- Public entry points, as the other kinds ----------
create function public.lens_summary_state(p_engagement uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.lens_summary_state(p_engagement) $$;
create function public.lens_summary_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.lens_summary_control(p_engagement,p_id,p_action,p) $$;
create function public.lens_summary_sources(p_engagement uuid,p_session uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.lens_summary_sources(p_engagement,p_session) $$;

-- ---------- The AI worker: claim, apply, fail ----------
alter function private.ai_claim(uuid,uuid,text,jsonb) rename to ai_claim_base2;
alter function private.ai_apply(uuid,uuid,jsonb,jsonb) rename to ai_apply_base2;
alter function private.ai_fail(uuid,uuid,text,jsonb) rename to ai_fail_base2;

-- A lens summary step is claimed here; every other session goes to the function that was there. The room is
-- on the step and the AI is on. In order: fold the suggestions into the current lens's summary (once the last
-- suggestion is 3 seconds old, or at Fold in now), draft the current lens, then draft the other lenses ahead
-- (never shown until the facilitator moves to them). "wait" tells the worker how long to hold on.
create function private.ai_claim(p_session uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; a private.ai_sessions; r public.room_states; t timestamptz:=clock_timestamp(); sm private.lens_summaries; v private.lens_summary_versions; lk private.lens_summary_locks;
 v_lens smallint; lx smallint; job text; v_inputs jsonb; v_run uuid; sig text; last_sug timestamptz; n_sug integer; n_app integer; base jsonb; v_ids jsonb; picked smallint;
begin
 select * into s from public.sessions where id=p_session and not deleted;
 if s.id is null or s.interaction<>'lens_summary' then return private.ai_claim_base2(p_session,p_lease,p_model,p_versions); end if;
 if p_lease is null or p_model is null or length(p_model) not between 1 and 100 or jsonb_typeof(p_versions) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 if not private.ai_on(s.id) or s.state not in ('live','phones_down','open') then return jsonb_build_object('status','off'); end if;
 -- Room row first, like every other press; the run starting is told to the room.
 select * into r from public.room_states where engagement_id=s.engagement_id and not deleted for update;
 if r.live_session_id is distinct from s.id then return jsonb_build_object('status','off'); end if;
 insert into private.ai_sessions(session_id,engagement_id) values(s.id,s.engagement_id) on conflict(session_id) do nothing;
 select * into a from private.ai_sessions where session_id=s.id for update;
 if a.lease_id is not null and a.lease_until>t then return jsonb_build_object('status','busy'); end if;
 if a.last_failed_at is not null and a.last_failed_at>t-interval '10 seconds' and (a.last_ok_at is null or a.last_failed_at>a.last_ok_at) then
  return jsonb_build_object('status','cooling','ms',(extract(epoch from a.last_failed_at+interval '10 seconds'-t)*1000)::integer); end if;
 if a.lease_run is not null then update private.ai_runs set status='stale',finished_at=t where id=a.lease_run and status='running'; end if;
 if coalesce(p_versions->>'draft_lens_summary','') !~ '^[a-z0-9_.@-]{1,60}$' or coalesce(p_versions->>'fold_lens_summary','') !~ '^[a-z0-9_.@-]{1,60}$' then return jsonb_build_object('status','invalid_request'); end if;
 v_lens:=private.ls_lens(s.options);
 sm:=private.ls_ensure(s.engagement_id,v_lens);
 select * into sm from private.lens_summaries where id=sm.id;
 select * into v from private.lens_summary_versions where id=sm.current_version_id and not deleted and undone_at is null and shown_at is not null;

 -- 1. Fold the current lens's suggestions.
 if v.id is not null and sm.state<>'signed_off' and not sm.fold_held then
  select count(*)::integer,max(x.updated_at),md5(string_agg(x.id::text||':'||x.revision::text,',' order by x.id)) into n_sug,last_sug,sig
   from public.submissions x where x.session_id=s.id and x.engagement_id=s.engagement_id and not x.deleted and not x.withdrawn and not x.hidden
    and x.value->>'version'=v.id::text and x.value->>'response'='suggest';
  if n_sug>0 then
   sig:=v.id::text||':'||sig;
   select * into lk from private.lens_summary_locks where summary_id=sm.id and not deleted;
   if lk.summary_id is not null and lk.seen_at>t-interval '40 seconds' then return jsonb_build_object('status','idle'); end if;
   if sm.fold_now_at is not null and sm.fold_now_at>coalesce(sm.fold_tried_at,'-infinity') then job:='fold';
   elsif sm.fold_tried is distinct from sig then
    if last_sug>t-interval '3 seconds' then return jsonb_build_object('status','wait','ms',greatest(100,(extract(epoch from last_sug+interval '3 seconds'-t)*1000)::integer)); end if;
    job:='fold';
   end if;
   if job='fold' then
    select count(*)::integer into n_app from public.submissions x where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden and x.value->>'version'=v.id::text and x.value->>'response'='approve';
    base:=private.ls_inputs(s.engagement_id,v_lens);
    v_ids:=base->'ids'||jsonb_build_object(
     's',(select coalesce(jsonb_object_agg('s'||q.pos,q.id),'{}'::jsonb) from (select ss.id,row_number() over(order by ss.position)::integer as pos from private.lens_summary_sentences ss where ss.version_id=v.id and not ss.deleted) q),
     'g',(select coalesce(jsonb_object_agg('g'||q.pos,q.id),'{}'::jsonb) from (select x.id,row_number() over(order by x.updated_at,x.id)::integer as pos from public.submissions x
        where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden and x.value->>'version'=v.id::text and x.value->>'response'='suggest') q where q.pos<=24));
    v_inputs:=(base-'ids')||jsonb_build_object('job','fold','summary_id',sm.id,'version',v.id,'approvals',n_app,
     'summary',(select coalesce(jsonb_agg(jsonb_build_object('ref','s'||q.pos,'text',q.text,'sources',coalesce((select jsonb_agg(k.key order by k.key) from jsonb_each_text(base->'ids'->'a') k
         where exists(select 1 from private.lens_summary_sources src where src.summary_sentence_id=q.id and not src.deleted and src.lens_sentence_id::text=k.value)),'[]'::jsonb)) order by q.pos),'[]'::jsonb)
       from (select ss.id,ss.text,row_number() over(order by ss.position)::integer as pos from private.lens_summary_sentences ss where ss.version_id=v.id and not ss.deleted) q),
     'suggestions',(select coalesce(jsonb_agg(jsonb_build_object('ref','g'||q.pos,'text',q.text) order by q.pos),'[]'::jsonb)
       from (select x.text,row_number() over(order by x.updated_at,x.id)::integer as pos from public.submissions x
        where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden and x.value->>'version'=v.id::text and x.value->>'response'='suggest') q where q.pos<=24),
     'ids',v_ids);
    insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,created_at) values(s.engagement_id,s.id,'fold_lens_summary',p_model,p_versions->>'fold_lens_summary',v_inputs,t) returning id into v_run;
    update private.lens_summaries set fold_tried=sig,fold_tried_at=t where id=sm.id;
    update private.ai_sessions set lease_id=p_lease,lease_run=v_run,lease_until=t+interval '45 seconds' where session_id=s.id;
    update public.room_states set results=private.live_results(s.engagement_id) where engagement_id=s.engagement_id;
    return jsonb_build_object('status','claimed','run',v_run,'job','fold_lens_summary','prompt_version',p_versions->>'fold_lens_summary','inputs',v_inputs);
   end if;
  end if;
 end if;

 -- 2. Draft the current lens, then the others ahead of time.
 picked:=null;
 for lx in select g::smallint from generate_series(1,5) g order by (g::smallint<>v_lens),g loop
  if not private.lens_is_open(s.engagement_id,lx) then continue; end if;
  sm:=private.ls_ensure(s.engagement_id,lx);
  select * into sm from private.lens_summaries where id=sm.id;
  if sm.draft_held or sm.state='signed_off' then continue; end if;
  if exists(select 1 from private.lens_summary_versions x where x.id=sm.current_version_id and not x.deleted and x.undone_at is null) then continue; end if;
  if (select count(*) from private.lens_sentences x where x.engagement_id=s.engagement_id and x.lens=lx and not x.deleted and not x.withdrawn)<2 then continue; end if;
  picked:=lx; exit;
 end loop;
 if picked is null then return jsonb_build_object('status','idle'); end if;
 base:=private.ls_inputs(s.engagement_id,picked);
 if jsonb_array_length(base->'sentences')<2 then return jsonb_build_object('status','idle'); end if;
 sm:=private.ls_ensure(s.engagement_id,picked);
 v_inputs:=(base-'ids')||jsonb_build_object('job','draft','summary_id',sm.id,'ids',base->'ids');
 insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,created_at) values(s.engagement_id,s.id,'draft_lens_summary',p_model,p_versions->>'draft_lens_summary',v_inputs,t) returning id into v_run;
 update private.ai_sessions set lease_id=p_lease,lease_run=v_run,lease_until=t+interval '45 seconds' where session_id=s.id;
 if picked=v_lens then update public.room_states set results=private.live_results(s.engagement_id) where engagement_id=s.engagement_id; end if;
 return jsonb_build_object('status','claimed','run',v_run,'job','draft_lens_summary','prompt_version',p_versions->>'draft_lens_summary','inputs',v_inputs);
end $$;

-- A model's line is kept only when it is a clean present-tense sentence: no future tense, no quotes, no
-- number that is not in the words it came from, through the word filter. Returns the reason it is not.
create function private.ls_line_problem(p_text text,p_allowed text,p_year integer) returns text
language sql stable security invoker set search_path='' as $$
 select case when p_text is null or length(p_text) not between 1 and 400 then 'length'
  when p_text ~* '\m(will|would|shall|going to|hope to|plan to|aim to|intend to)\M' then 'future'
  when private.ai_quoted(p_text) then 'quote'
  when private.screen_text(p_text) then 'filtered'
  when not (private.ai_numbers(p_text)<@(private.ai_numbers(p_allowed)||array[p_year::text,(p_year-10)::text,'10'])) then 'number'
 end
$$;

create function private.ai_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; a private.ai_sessions; r public.room_states; s public.sessions; sm private.lens_summaries; cv private.lens_summary_versions; lk private.lens_summary_locks;
 t timestamptz:=clock_timestamp(); v_ms integer; v_lens smallint; ids jsonb; item jsonb; txt text; prob text; allowed text; srcs jsonb; ref text; pidv uuid; sug integer; i integer; show boolean;
 year integer; vid uuid; note text; applied jsonb:='[]'::jsonb; refused jsonb:='[]'::jsonb; entries jsonb:='[]'::jsonb; acc uuid[]:=array[]::uuid[]; pid uuid[]; ptxt text[]; pkey integer[]; q integer; base integer; total integer; cnt integer;
 rt text[]; rf uuid[]; rs jsonb; seen text[]:=array[]::text[]; removed integer:=0; discard boolean:=false; did boolean:=false;
begin
 select * into run from private.ai_runs where id=p_run;
 if run.id is null or run.job not in ('draft_lens_summary','fold_lens_summary') then return private.ai_apply_base2(p_run,p_lease,p_output,p_usage); end if;
 if p_lease is null then return jsonb_build_object('status','invalid_request'); end if;
 if run.engagement_id='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(run.engagement_id::text,7)); end if;
 select * into r from public.room_states where engagement_id=run.engagement_id and not deleted for update;
 select * into a from private.ai_sessions where session_id=run.session_id for update;
 select * into run from private.ai_runs where id=p_run;
 if run.status<>'running' or a.lease_id is distinct from p_lease or a.lease_run is distinct from p_run then return jsonb_build_object('status','stale'); end if;
 v_ms:=private.ai_usage(p_usage,'ms',600000)::integer;
 select * into s from public.sessions where id=run.session_id;
 update private.ai_sessions set lease_id=null,lease_run=null,lease_until=null,last_ok_at=t,last_ms=v_ms where session_id=run.session_id;
 if jsonb_typeof(p_output) is distinct from 'object' or pg_column_size(p_output)>131072 then p_output:='{}'::jsonb; end if;
 v_lens:=(run.inputs->>'lens')::smallint;
 ids:=run.inputs->'ids';
 year:=coalesce((run.inputs->>'year')::integer,0);
 select * into sm from private.lens_summaries where id=(run.inputs->>'summary_id')::uuid and engagement_id=run.engagement_id and not deleted for update;
 select * into cv from private.lens_summary_versions where id=sm.current_version_id and not deleted and undone_at is null;
 select * into lk from private.lens_summary_locks where summary_id=sm.id and not deleted;
 -- The work is dropped when it is no longer wanted or no longer fits what is on the screen.
 if not private.ai_on(run.session_id) or s.deleted or sm.id is null or sm.state='signed_off' then discard:=true;
 elsif run.job='draft_lens_summary' and (cv.id is not null or sm.draft_held) then discard:=true;
 elsif run.job='fold_lens_summary' and (cv.id is null or cv.id::text is distinct from run.inputs->>'version' or sm.fold_held or (lk.summary_id is not null and lk.seen_at>t-interval '40 seconds')) then discard:=true;
 end if;
 if discard then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms,input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,
   output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
  if r.live_session_id=run.session_id then update public.room_states set results=private.live_results(run.engagement_id) where engagement_id=run.engagement_id; end if;
  return jsonb_build_object('status','discarded');
 end if;
 show:=r.live_session_id=run.session_id and v_lens=private.ls_lens(s.options);
 note:=btrim(regexp_replace(coalesce(case when jsonb_typeof(p_output->'note')='string' then p_output->>'note' end,''),'\s+',' ','g'));
 if length(note)>300 or private.ai_quoted(note) or private.screen_text(note) then note:=''; end if;
 allowed:=coalesce((select string_agg(x->>'text',' ') from jsonb_array_elements(run.inputs->'sentences') x),'');

 if run.job='draft_lens_summary' then
  -- Each line needs a source, and stays in the present tense. The lines that fit 420 characters are kept.
  total:=0; cnt:=0;
  for item in select x from jsonb_array_elements(case when jsonb_typeof(p_output->'sentences')='array' then p_output->'sentences' else '[]'::jsonb end) x limit 16 loop
   txt:=btrim(regexp_replace(coalesce(case when jsonb_typeof(item)='object' and jsonb_typeof(item->'text')='string' then item->>'text' end,''),'\s+',' ','g'));
   srcs:=(select coalesce(jsonb_agg(distinct (ids->'a'->>(x#>>'{}'))),'[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(item->'sources')='array' then item->'sources' else '[]'::jsonb end) x
     where jsonb_typeof(x)='string' and ids->'a' ? (x#>>'{}'));
   prob:=null;
   if jsonb_typeof(item) is distinct from 'object' then prob:='shape';
   elsif jsonb_array_length(srcs)=0 then prob:='no_source';
   elsif lower(txt)=any(seen) then prob:='duplicate';
   else prob:=private.ls_line_problem(txt,allowed,year); end if;
   if prob is null and cnt>=8 then prob:='too_many'; end if;
   if prob is null and total+length(txt)+(case when cnt>0 then 1 else 0 end)>420 then prob:='too_long'; end if;
   if prob is null then
    total:=total+length(txt)+case when cnt>0 then 1 else 0 end; cnt:=cnt+1; seen:=seen||lower(txt);
    entries:=entries||jsonb_build_array(jsonb_build_object('text',txt,'src',srcs));
   else refused:=refused||jsonb_build_array(jsonb_build_object('text',left(coalesce(txt,''),120),'reason',prob)); end if;
  end loop;
  if cnt=0 then
   update private.lens_summaries set draft_held=true where id=sm.id;
   update private.ai_runs set status='ok',changed=false,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'applied','[]'::jsonb,'refused',refused),
    input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
   if r.live_session_id=run.session_id then update public.room_states set results=private.live_results(run.engagement_id) where engagement_id=run.engagement_id; end if;
   return jsonb_build_object('status','ok','changed',false,'applied',0,'refused',jsonb_array_length(refused));
  end if;
  select array_agg(e->>'text' order by n),array_agg(null::uuid order by n),jsonb_agg(e->'src' order by n) into rt,rf,rs from jsonb_array_elements(entries) with ordinality w2(e,n);
  vid:=private.ls_new_version(sm.id,'ai',run.id,note,rt,rf,rs,false,null,show);
  did:=true;
  applied:=jsonb_build_array(jsonb_build_object('version',vid,'sentences',cnt));
 else
  -- Fold: the prior lines are kept word for word unless a suggestion is named for the change.
  select array_agg(ss.id order by ss.position),array_agg(ss.text order by ss.position) into pid,ptxt from private.lens_summary_sentences ss where ss.version_id=cv.id and not ss.deleted;
  pkey:=array_fill(null::integer,array[coalesce(cardinality(pid),0)]);
  i:=0;
  for item in select x from jsonb_array_elements(case when jsonb_typeof(p_output->'sentences')='array' then p_output->'sentences' else '[]'::jsonb end) x limit 16 loop
   i:=i+1; pidv:=null; prob:=null; txt:=null;
   if jsonb_typeof(item) is distinct from 'object' then refused:=refused||jsonb_build_array(jsonb_build_object('item',i,'reason','shape')); continue; end if;
   ref:=coalesce(item->>'keep',item->>'edit');
   if ref is not null then
    pidv:=case when ids->'s' ? ref then (ids->'s'->>ref)::uuid end;
    if pidv is null or not pidv=any(pid) or pidv=any(acc) then refused:=refused||jsonb_build_array(jsonb_build_object('item',i,'reason','unknown')); continue; end if;
    q:=array_position(pid,pidv);
   end if;
   -- The suggestions named for this change, and the text that may supply its numbers.
   sug:=(select count(*) from jsonb_array_elements_text(case when jsonb_typeof(item->'suggestions')='array' then item->'suggestions' else '[]'::jsonb end) g where ids->'g' ? g);
   srcs:=(select coalesce(jsonb_agg(distinct (ids->'a'->>(x#>>'{}'))),'[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(item->'sources')='array' then item->'sources' else '[]'::jsonb end) x
     where jsonb_typeof(x)='string' and ids->'a' ? (x#>>'{}'));
   if item ? 'keep' then
    acc:=acc||pidv; pkey[q]:=i*100; seen:=seen||lower(ptxt[q]);
    entries:=entries||jsonb_build_array(jsonb_build_object('key',i*100,'text',ptxt[q],'from',pidv,'src',coalesce((select jsonb_agg(src.lens_sentence_id) from private.lens_summary_sources src where src.summary_sentence_id=pidv and not src.deleted),'[]'::jsonb)));
    continue;
   end if;
   txt:=btrim(regexp_replace(coalesce(case when jsonb_typeof(item->'text')='string' then item->>'text' end,''),'\s+',' ','g'));
   allowed:=coalesce((select string_agg(x->>'text',' ') from jsonb_array_elements(run.inputs->'suggestions') x
      where x->>'ref' in (select g from jsonb_array_elements_text(case when jsonb_typeof(item->'suggestions')='array' then item->'suggestions' else '[]'::jsonb end) g)),'')
     ||' '||coalesce((select string_agg(x->>'text',' ') from jsonb_array_elements(run.inputs->'summary') x),'')
     ||' '||coalesce((select string_agg(x->>'text',' ') from jsonb_array_elements(run.inputs->'sentences') x
        where exists(select 1 from jsonb_array_elements_text(srcs) z where z=ids->'a'->>(x->>'ref'))),'');
   prob:=case when sug=0 then 'no_suggestion' else private.ls_line_problem(txt,allowed,year) end;
   if lower(coalesce(txt,''))=any(seen) then prob:=coalesce(prob,'duplicate'); end if;
   if prob is not null then
    refused:=refused||jsonb_build_array(jsonb_build_object('text',left(coalesce(txt,''),120),'reason',prob));
    -- A refused edit leaves the line as it was.
    if pidv is not null then
     acc:=acc||pidv; pkey[q]:=i*100;
     entries:=entries||jsonb_build_array(jsonb_build_object('key',i*100,'text',ptxt[q],'from',pidv,'src',coalesce((select jsonb_agg(src.lens_sentence_id) from private.lens_summary_sources src where src.summary_sentence_id=pidv and not src.deleted),'[]'::jsonb)));
    end if;
    continue;
   end if;
   seen:=seen||lower(txt);
   if pidv is not null then
    acc:=acc||pidv; pkey[q]:=i*100;
    if txt<>ptxt[q] then did:=true; end if;
    entries:=entries||jsonb_build_array(jsonb_build_object('key',i*100,'text',txt,'from',pidv,'src',
      coalesce((select jsonb_agg(distinct u) from (select src.lens_sentence_id::text as u from private.lens_summary_sources src where src.summary_sentence_id=pidv and not src.deleted
         union all select x#>>'{}' from jsonb_array_elements(srcs) x) z(u)),'[]'::jsonb)));
   else
    did:=true;
    entries:=entries||jsonb_build_array(jsonb_build_object('key',i*100,'text',txt,'from',null,'src',srcs));
   end if;
  end loop;
  -- A removal needs a suggestion named for it.
  for item in select x from jsonb_array_elements(case when jsonb_typeof(p_output->'remove')='array' then p_output->'remove' else '[]'::jsonb end) x limit 8 loop
   ref:=case when jsonb_typeof(item)='object' then item->>'ref' end;
   pidv:=case when ref is not null and ids->'s' ? ref then (ids->'s'->>ref)::uuid end;
   sug:=(select count(*) from jsonb_array_elements_text(case when jsonb_typeof(item->'suggestions')='array' then item->'suggestions' else '[]'::jsonb end) g where ids->'g' ? g);
   if pidv is null or not pidv=any(pid) or pidv=any(acc) or sug=0 then refused:=refused||jsonb_build_array(jsonb_build_object('ref',ref,'reason','removal'));
   else acc:=acc||pidv; removed:=removed+1; did:=true; end if;
  end loop;
  -- A prior line the reply did not account for stays, where it was.
  for j in 1..coalesce(cardinality(pid),0) loop
   if pid[j]=any(acc) then continue; end if;
   base:=null;
   for qq in reverse (j-1)..1 loop if pkey[qq] is not null then base:=pkey[qq]; exit; end if; end loop;
   pkey[j]:=coalesce(base,-1000)+j;
   entries:=entries||jsonb_build_array(jsonb_build_object('key',pkey[j],'text',ptxt[j],'from',pid[j],'src',coalesce((select jsonb_agg(src.lens_sentence_id) from private.lens_summary_sources src where src.summary_sentence_id=pid[j] and not src.deleted),'[]'::jsonb)));
  end loop;
  select count(*),sum(length(e->>'text'))+count(*)-1 into cnt,total from jsonb_array_elements(entries) e;
  if cnt>8 then did:=false; refused:=refused||jsonb_build_array(jsonb_build_object('reason','too_many'));
  elsif total>420 then did:=false; refused:=refused||jsonb_build_array(jsonb_build_object('reason','too_long'));
  end if;
  if did then
   select array_agg(e->>'text' order by (e->>'key')::integer),array_agg(nullif(e->>'from','')::uuid order by (e->>'key')::integer),jsonb_agg(e->'src' order by (e->>'key')::integer)
    into rt,rf,rs from jsonb_array_elements(entries) e;
   vid:=private.ls_new_version(sm.id,'ai',run.id,note,rt,rf,rs,true,cv.id,show);
   applied:=jsonb_build_array(jsonb_build_object('version',vid,'sentences',cnt,'removed',removed));
  end if;
 end if;

 update private.ai_runs set status='ok',changed=did,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'applied',applied,'refused',refused),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,
  cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 if r.live_session_id=run.session_id then update public.room_states set results=private.live_results(run.engagement_id) where engagement_id=run.engagement_id; end if;
 return jsonb_build_object('status','ok','changed',did,'applied',jsonb_array_length(applied),'refused',jsonb_array_length(refused));
end $$;

-- A failed lens summary job goes back to the room (the AI is no longer "working") and a failed fold may be tried again
-- after the cool-down.
create function private.ai_fail(p_run uuid,p_lease uuid,p_error text,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; res jsonb;
begin
 select * into run from private.ai_runs where id=p_run;
 if run.id is not null and run.job in ('draft_lens_summary','fold_lens_summary') then
  -- Room row first, as everywhere else.
  perform 1 from public.room_states where engagement_id=run.engagement_id and not deleted for update;
 end if;
 res:=private.ai_fail_base2(p_run,p_lease,p_error,p_usage);
 if run.id is not null and run.job in ('draft_lens_summary','fold_lens_summary') and res->>'status'='ok' then
  if run.job='fold_lens_summary' then update private.lens_summaries set fold_tried=null where id=(run.inputs->>'summary_id')::uuid and engagement_id=run.engagement_id; end if;
  update public.room_states set results=private.live_results(run.engagement_id) where engagement_id=run.engagement_id and live_session_id=run.session_id;
 end if;
 return res;
end $$;

-- ---------- Practice reset also clears the overnight review and this step's tables ----------
-- Every statement of the wayfinding records version stays. Added: the overnight rounds and what hangs from them
-- are soft-deleted (draft versions keep no deleted flag and go with their outcome), published snapshots are
-- withdrawn, review presence is cleared, and the lens summary locks are cleared.
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
 update public.engagements set status='setup' where id=eng;
 update public.room_states set live_session_id=null,tv_content='holding',phones_down=false,burst_ends_at=null,spotlight_id=null,
   hidden_ids=array[]::uuid[],remote_holder_id=null,team_led_block_id=null,show_tv_on_phones=false,
   results='{"total":0,"people":0,"words":[]}' where engagement_id=eng;
 return true;
end $$;

-- ---------- Grants ----------
revoke all on function private.ls_lens(jsonb),private.ls_ensure(uuid,smallint),private.ls_diff(text,text),private.ls_changes(uuid,uuid),
 private.ls_new_version(uuid,text,uuid,text,text[],uuid[],jsonb,boolean,uuid,boolean),private.ls_copy(uuid,uuid,text,boolean),private.ls_inputs(uuid,smallint),
 private.options_lens_summary(jsonb,uuid),private.parse_lens_summary(public.sessions,text,jsonb),private.ls_mirror(),private.ls_on_air(),
 private.results_lens_summary(uuid,uuid,text[]),private.items_lens_summary(uuid,text[]),private.lens_summary_sources(uuid,uuid),private.lens_summary_state(uuid),
 private.lens_summary_control(uuid,uuid,text,jsonb),private.ls_label(uuid,smallint),private.ls_line_problem(text,text,integer),
 public.lens_summary_state(uuid),public.lens_summary_control(uuid,uuid,text,jsonb),public.lens_summary_sources(uuid,uuid),
 private.ai_claim(uuid,uuid,text,jsonb),private.ai_apply(uuid,uuid,jsonb,jsonb),private.ai_fail(uuid,uuid,text,jsonb),
 private.ai_claim_base2(uuid,uuid,text,jsonb),private.ai_apply_base2(uuid,uuid,jsonb,jsonb),private.ai_fail_base2(uuid,uuid,text,jsonb)
 from public,anon,authenticated;
-- The engine finds options, parse, results and items by name; the wrappers call the private functions as the signed-in caller.
grant execute on function private.lens_summary_state(uuid),private.lens_summary_control(uuid,uuid,text,jsonb),private.lens_summary_sources(uuid,uuid),
 public.lens_summary_state(uuid),public.lens_summary_control(uuid,uuid,text,jsonb),public.lens_summary_sources(uuid,uuid) to authenticated;
-- The worker's claim, apply and fail keep their grants (service role); the renamed originals are for the wrappers.
grant execute on function private.ai_claim(uuid,uuid,text,jsonb),private.ai_apply(uuid,uuid,jsonb,jsonb),private.ai_fail(uuid,uuid,text,jsonb),
 private.ai_claim_base2(uuid,uuid,text,jsonb),private.ai_apply_base2(uuid,uuid,jsonb,jsonb),private.ai_fail_base2(uuid,uuid,text,jsonb) to service_role;
commit;
