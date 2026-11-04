-- Milestone 4, step 2: lens seeding and the lens wall (INT-12, PRE-10, PRE-11, D1-05, D1-06).
-- Live only, after merge and Chris's approval. No session is started and no data is seeded.
--
-- One kind, `lens`, registered in private.interaction_kinds with its own parse_, results_,
-- options_ and items_ functions. A lens session is one of two things, told apart by its options:
--   seeding   {seed: true}   self-paced, opened during the pre-call, open until Day 1. People write
--                            present-tense sentences for any of the five lenses (the lens rides in
--                            each answer's value). No lens is named in the options.
--   lens wall {lens: 1..5}   a live step for one lens (a Day 1 step, "Seeded from" the seeding step).
-- Both can carry ai (on by default); the seeding step never uses AI. The seeding step also takes
-- recording, the link for someone who missed the pre-call (PRE-11), and shows it on the phone.
--
-- Seeds stay hidden. A seeded sentence is written once, into private.lens_sentences (step 1's table,
-- readable by no role before its lens opens). The submission row that live_submit stores for it
-- carries a placeholder, never the words, so every reader that already reads submissions (the TV
-- and phone snapshots, the broadcast, the author's own phone, the control surface, exports, the
-- recap) holds only "Hidden until Day 1". The facilitator gets counts from lens_seed_counts.
-- A lens opens the moment its step goes on the TV and phones (a trigger on the room's live step),
-- never during a rehearsal, and then its seeded sentences arrive first: they join the wall's
-- results, and live sentences land through the same answer path as every other kind.
--
-- AI stays out of the path from phone to TV. The lens wall's clustering is step 5's group path
-- (ai_claim, ai_apply, ai_control, ai_clear), widened to the lens kind with the job group_lens:
--   * ai_wall_open and ai_wall_groups read a lens session's open sentences (seeded once open, live),
--     so the claim, the merge limits (four per group per step, twelve groups, labels up to forty
--     characters and six words, pinned and renamed groups untouched, undone groups and removed
--     members never regrouped) and Clear test answers are step 5's, unchanged.
--   * ai_claim adds the lens, its name, the base year and the question to the job's inputs.
--   * ai_status and ai_control list the same group rows and take the same presses for a lens.
--
-- Shared functions redefined (step 2 only): private.ai_on (adds lens, never the seeding step),
-- ai_wall_open, ai_wall_groups, ai_claim, ai_apply, ai_fail, ai_status and ai_control (each copied
-- from step 5 with the lens added; every rule and merge limit kept), and public.room_control
-- (Close Pre-call, Close Day 1 and the rest leave the seeding step open through a transaction
-- setting that a trigger on sessions reads; private.room_control is untouched).
-- Step 2b (live lens summaries) reads private.lens_wall_read(session): sentences, clusters, ids.
begin;

insert into private.interaction_kinds(kind,label,input,one_per_person,counts,structured,shares_answers,spotlight,named,position) values
 ('lens','Lens wall',true,false,'answers',false,true,'id','never',25);

alter table private.ai_runs drop constraint ai_runs_job_check;
alter table private.ai_runs add constraint ai_runs_job_check check(job in ('combine_words','group_wall','summarize_wall','fold_questions','group_lens'));

-- ---------- Options ----------
create function private.options_lens(p jsonb,p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when jsonb_typeof(p)='object' and not exists(select 1 from jsonb_object_keys(p) k where k not in ('lens','seed','ai','recording'))
  and coalesce(jsonb_typeof(p->'seed'),'boolean')='boolean' and coalesce(jsonb_typeof(p->'ai'),'boolean')='boolean'
  and coalesce(jsonb_typeof(p->'lens'),'number')='number' and coalesce(jsonb_typeof(p->'recording'),'string')='string'
  and case when coalesce((p->>'seed')::boolean,false) then not (p ? 'lens' and p->>'lens' is not null) and coalesce(p->>'recording','') ~ '^(https://[^[:space:]<>"]{1,255})?$'
    else p->>'lens' ~ '^[1-5]$' and not (p ? 'recording' and p->>'recording' is not null) end
  then jsonb_strip_nulls(jsonb_build_object('lens',case when not coalesce((p->>'seed')::boolean,false) then (p->>'lens')::integer end,
    'seed',case when coalesce((p->>'seed')::boolean,false) then true end,
    'recording',nullif(btrim(coalesce(p->>'recording','')),''),
    'ai',case when p ? 'ai' then (p->>'ai')::boolean end)) end
$$;

-- ---------- Parsing a sentence ----------
-- The wall's rules (length, word filter, one sentence), plus the lens: a seeding sentence names
-- its lens in value; a lens wall sentence takes the step's lens. The placeholder is not a sentence.
create function private.parse_lens(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare parsed jsonb; v_lens integer;
begin
 if coalesce(p_session.options->>'seed','false')='true' then
  if jsonb_typeof(p_value) is distinct from 'object' or p_value->>'lens' is null or p_value->>'lens' !~ '^[1-5]$'
   or exists(select 1 from jsonb_object_keys(p_value) k where k<>'lens') then return jsonb_build_object('status','invalid_answer'); end if;
  v_lens:=(p_value->>'lens')::integer;
 elsif p_session.options->>'lens' is null or p_session.options->>'lens' !~ '^[1-5]$' then return jsonb_build_object('status','invalid_answer');
 end if;
 if p_text is null or length(btrim(p_text))>400 or btrim(p_text)='Hidden until Day 1' then return jsonb_build_object('status','invalid_answer'); end if;
 parsed:=private.parse_text_answers(p_session,p_text,false);
 if parsed->>'status'<>'ok' then return parsed; end if;
 return case when v_lens is not null then parsed||jsonb_build_object('value',jsonb_build_object('lens',v_lens)) else parsed end;
end $$;

-- ---------- Reading the sentences ----------
-- A lens wall's standing sentences: its own live ones, and the seeded ones once the lens has
-- opened (a rehearsal's test seeds show during the rehearsal). The seeding step has none.
create function private.lens_open_sentences(p_session uuid) returns table(id uuid,text text,received timestamptz,source text,attendee_id uuid)
language sql stable security definer set search_path='' as $$
 select l.submission_id,l.text,coalesce(x.server_received_at,x.created_at),l.source,l.attendee_id
 from public.sessions s
 join private.lens_sentences l on l.engagement_id=s.engagement_id and l.lens=case when s.options->>'lens' ~ '^[1-5]$' then (s.options->>'lens')::smallint end
 join public.submissions x on x.id=l.submission_id
 where s.id=p_session and not s.deleted and s.interaction='lens' and coalesce(s.options->>'seed','false')<>'true'
  and not l.deleted and not l.withdrawn and not x.deleted and not x.withdrawn and not x.hidden
  and ((l.source='live' and l.session_id=s.id)
   or (l.source='seeded' and (s.seeded_from is null or l.session_id=s.seeded_from) and (private.lens_is_open(s.engagement_id,l.lens) or x.test)))
$$;

-- The words behind a submission where the lens rules allow them: a sentence of a lens that has not
-- opened gives null. Anything that is not a lens sentence gives its own text.
create function private.lens_text(p_submission uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when l.id is null then x.text when l.source='live' or private.lens_is_open(l.engagement_id,l.lens) or x.test then l.text end
 from public.submissions x left join private.lens_sentences l on l.submission_id=x.id where x.id=p_submission
$$;

-- What the lens job tells the model besides the sentences: the lens, its name, the years.
create function private.lens_prompt_inputs(p_session uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('lens',(s.options->>'lens')::integer,'lens_name',e.lens_names[(s.options->>'lens')::integer],'lens_names',to_jsonb(e.lens_names),
  'base_year',e.base_year,'question',private.fill_years(s.prompt,e.base_year))
 from public.sessions s join public.engagements e on e.id=s.engagement_id where s.id=p_session and s.options->>'lens' ~ '^[1-5]$'
$$;

-- ---------- Results (the TV) ----------
-- total and people count the standing sentences. seeded lists the seeded sentences (empty before the
-- lens opens), which arrive first; live sentences ride the answer path. With AI on, groups are the
-- clusters of two or more standing sentences, at most twelve, largest first, by sentence id.
create function private.results_lens(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with s as (select * from public.sessions where id=p_session and engagement_id=p_engagement and not deleted and interaction='lens'),
 sent as (select * from private.lens_open_sentences(p_session)),
 o as (select private.ai_on(p_session) as ai),
 groups as (
  select g.id,g.label,g.pinned,g.created_at,jsonb_agg(l.id order by l.received,l.id) as ids,count(*)::integer as n
  from private.ai_groups g join private.ai_group_members gm on gm.group_id=g.id and gm.removed_at is null and not gm.deleted
  join sent l on l.id=gm.submission_id
  where g.session_id=p_session and g.undone_at is null and not g.deleted and (select ai from o)
  group by g.id having count(*)>=2
 )
 select jsonb_build_object('total',(select count(*) from sent),'people',(select count(distinct attendee_id) from sent),'words','[]'::jsonb,
  'lens',(select case when s.options->>'lens' ~ '^[1-5]$' then (s.options->>'lens')::integer end from s),
  'lens_name',(select e.lens_names[(s.options->>'lens')::integer] from s join public.engagements e on e.id=s.engagement_id where s.options->>'lens' ~ '^[1-5]$'),
  'ai',(select ai from o),
  'seeded',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'text',l.text) order by l.received,l.id) from sent l where l.source='seeded'),'[]'::jsonb))
  ||case when (select ai from o) then jsonb_build_object('groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'label',g.label,'count',g.n,'ids',g.ids,'pinned',g.pinned) order by g.n desc,g.created_at,g.id)
     from (select * from groups order by n desc,created_at,id limit 12) g),'[]'::jsonb)) else '{}'::jsonb end
$$;

-- ---------- Control surface items ----------
create function private.items_lens(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',id,'text',text,'count',1,'hidden',hidden) order by hidden,server_received_at desc,id),'[]'::jsonb)
 from (select x.id,x.text,x.hidden,x.server_received_at from public.submissions x join public.sessions s on s.id=x.session_id
  where x.session_id=p_session and not x.deleted and not x.withdrawn and s.interaction='lens' and coalesce(s.options->>'seed','false')<>'true'
  order by x.server_received_at desc,x.id limit 500) w
$$;

-- ---------- Step 2b's read: sentences and clusters, in one shape ----------
-- The sentences a lens wall stands on, each with the cluster it sits in (null when none), and the
-- clusters with their sentence ids. Reads nothing while the lens has not opened. Service role only.
create function private.lens_wall_read(p_session uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('session',s.id,'engagement',s.engagement_id,'lens',(s.options->>'lens')::integer,'lens_name',e.lens_names[(s.options->>'lens')::integer],
  'open',private.lens_is_open(s.engagement_id,(s.options->>'lens')::smallint),
  'sentences',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'text',l.text,'source',l.source,
     'cluster',(select g.id from private.ai_group_members gm join private.ai_groups g on g.id=gm.group_id and g.undone_at is null and not g.deleted
       where gm.submission_id=l.id and gm.removed_at is null and not gm.deleted limit 1)) order by l.received,l.id) from private.lens_open_sentences(s.id) l),'[]'::jsonb),
  'clusters',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'label',g.label,'pinned',g.pinned,'renamed',g.renamed_by is not null,
     'ids',(select jsonb_agg(l.id order by l.received,l.id) from private.ai_group_members gm join private.lens_open_sentences(s.id) l on l.id=gm.submission_id
       where gm.group_id=g.id and gm.removed_at is null and not gm.deleted)) order by g.created_at,g.id)
    from private.ai_groups g where g.session_id=s.id and g.undone_at is null and not g.deleted),'[]'::jsonb))
 from public.sessions s join public.engagements e on e.id=s.engagement_id
 where s.id=p_session and not s.deleted and s.interaction='lens' and s.options->>'lens' ~ '^[1-5]$'
$$;

-- ---------- Writing a sentence where it belongs ----------
-- The sentence is written by a trigger that runs before its submission row exists, so the
-- foreign key to the submission is checked when the transaction commits.
alter table private.lens_sentences drop constraint lens_sentences_submission_id_fkey;
alter table private.lens_sentences add constraint lens_sentences_submission_id_fkey foreign key(submission_id) references public.submissions(id) deferrable initially deferred;

-- Every lens answer is mirrored into private.lens_sentences (step 1's table), seeded or live. A seeded
-- answer's words are replaced by the placeholder on the submission row itself, in the same write.
create function private.lens_capture() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.sessions; v_seed boolean; v_lens integer; l private.lens_sentences; v_hold constant text:='Hidden until Day 1';
begin
 select * into s from public.sessions where id=new.session_id and engagement_id=new.engagement_id;
 if s.interaction is distinct from 'lens' then return new; end if;
 v_seed:=coalesce(s.options->>'seed','false')='true';
 select * into l from private.lens_sentences where submission_id=new.id;
 if l.id is not null then v_lens:=l.lens;
 elsif v_seed then v_lens:=case when new.value->>'lens' ~ '^[1-5]$' then (new.value->>'lens')::integer end;
 else v_lens:=case when s.options->>'lens' ~ '^[1-5]$' then (s.options->>'lens')::integer end;
 end if;
 if v_lens is null then return new; end if;
 if l.id is null then
  insert into private.lens_sentences(engagement_id,lens,source,text,session_id,submission_id,attendee_id,withdrawn,deleted)
   values(new.engagement_id,v_lens,case when v_seed then 'seeded' else 'live' end,new.text,new.session_id,new.id,new.attendee_id,new.withdrawn,new.deleted);
 else
  update private.lens_sentences set text=case when v_seed and new.text=v_hold then text else new.text end,withdrawn=new.withdrawn,deleted=new.deleted where id=l.id;
 end if;
 if v_seed then new.text:=v_hold; new.answers:=jsonb_build_array(jsonb_build_object('text',v_hold,'key','hidden')); new.value:=jsonb_build_object('lens',v_lens); end if;
 return new;
end $$;
create trigger lens_capture before insert or update of text,withdrawn,deleted,value on public.submissions for each row execute function private.lens_capture();

-- ---------- A lens opens when its step goes on the TV ----------
-- Never during a rehearsal. The results are recomputed here so the seeded sentences arrive with the step.
create function private.lens_on_air() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.sessions;
begin
 if new.live_session_id is null or new.live_session_id is not distinct from old.live_session_id then return new; end if;
 select * into s from public.sessions where id=new.live_session_id and not deleted;
 if s.interaction is distinct from 'lens' or coalesce(s.options->>'seed','false')='true' or s.options->>'lens' !~ '^[1-5]$' then return new; end if;
 if private.rehearsing(new.engagement_id) is not null or private.lens_is_open(new.engagement_id,(s.options->>'lens')::smallint) then return new; end if;
 insert into private.lens_openings(engagement_id,lens,session_id) values(new.engagement_id,(s.options->>'lens')::smallint,s.id);
 new.results:=private.live_results_for(new.engagement_id,new.live_session_id,new.hidden_keys);
 return new;
end $$;
create trigger lens_on_air before update of live_session_id on public.room_states for each row execute function private.lens_on_air();

-- ---------- Close Pre-call leaves the seeding step open ----------
create function private.lens_keep_seeding() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_setting('clearway.close_part',true)='on' and old.interaction='lens' and old.mode='self_paced' and coalesce(old.options->>'seed','false')='true' then
  new.closes_at:=old.closes_at; new.closed_at:=old.closed_at;
 end if;
 return new;
end $$;
create trigger lens_keep_seeding before update of closes_at,closed_at on public.sessions for each row execute function private.lens_keep_seeding();
create or replace function public.room_control(p_engagement uuid,p_id uuid,p_action text,p jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare out jsonb;
begin
 if p_action='close_part' then perform set_config('clearway.close_part','on',true); end if;
 out:=private.room_control(p_engagement,p_id,p_action,p);
 perform set_config('clearway.close_part','',true);
 return out;
end $$;

-- ---------- The lens wall's open sentences and clusters, for step 5's group path ----------
create or replace function private.ai_wall_open(p_session uuid) returns table(id uuid,text text,received timestamptz)
language sql stable security definer set search_path='' as $$
 select z.id,z.text,z.received from (
  select x.id,x.text,coalesce(x.server_received_at,x.created_at) as received from public.submissions x
   where x.session_id=p_session and not x.deleted and not x.withdrawn and not x.hidden
    and not exists(select 1 from public.sessions q where q.id=p_session and q.interaction='lens')
    and not exists(select 1 from private.ai_group_members gm where gm.submission_id=x.id and not gm.deleted)
  union all
  select l.id,l.text,l.received from private.lens_open_sentences(p_session) l
   where not exists(select 1 from private.ai_group_members gm where gm.submission_id=l.id and not gm.deleted)
 ) z order by z.received,z.id
$$;
create or replace function private.ai_wall_groups(p_session uuid) returns table(id uuid,label text,pinned boolean,renamed boolean,n integer,texts text[],created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select g.id,g.label,g.pinned,g.renamed_by is not null,count(x.id)::integer,(array_agg(x.text order by x.received,x.id) filter (where x.id is not null))[1:4],g.created_at
 from private.ai_groups g left join private.ai_group_members gm on gm.group_id=g.id and gm.removed_at is null and not gm.deleted
 left join (
  select y.id,y.text,coalesce(y.server_received_at,y.created_at) as received from public.submissions y
   where y.session_id=p_session and not y.deleted and not y.withdrawn and not y.hidden
    and not exists(select 1 from public.sessions q where q.id=p_session and q.interaction='lens')
  union all select l.id,l.text,l.received from private.lens_open_sentences(p_session) l
 ) x on x.id=gm.submission_id
 where g.session_id=p_session and g.undone_at is null and not g.deleted
 group by g.id order by g.created_at,g.id
$$;

-- ---------- AI switches: the lens wall can use AI, the seeding step never does ----------
create or replace function private.ai_on(p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select coalesce(e.settings->>'ai_enabled','false')='true' and (s.interaction in ('word_cloud','wall','qa') or (s.interaction='lens' and coalesce(s.options->>'seed','false')<>'true'))
   and coalesce(a.ai,case when jsonb_typeof(s.options->'ai')='boolean' then (s.options->>'ai')::boolean end,true)
  from public.sessions s join public.engagements e on e.id=s.engagement_id and not e.deleted
  left join private.ai_sessions a on a.session_id=s.id and not a.deleted
  where s.id=p_session and not s.deleted),false)
$$;

-- ---------- The worker's claim: the lens wall's grouping job ----------
create or replace function private.ai_claim(p_session uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; a private.ai_sessions; v_job text; v_inputs jsonb; v_run uuid; n integer; t timestamptz:=clock_timestamp(); last_sum private.ai_summaries; fresh integer; standing integer; sum_ids uuid[];
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
 elsif s.interaction in ('wall','lens') then
  -- The summary first, once shown: after 8 new answers or 75 seconds (Default).
  if private.ai_summary_on(s.id) and a.summary_shown then
   select * into last_sum from private.ai_summaries where session_id=s.id and not deleted order by created_at desc limit 1;
   -- An answer is fresh when the last summary did not read it: by the ids that summary's run
   -- recorded (an answer that committed late, with an earlier received time, still counts),
   -- or by its cut time for a summary made before ids were recorded.
   select case when jsonb_typeof(r.inputs->'ids')='array' then array(select jsonb_array_elements_text(r.inputs->'ids')::uuid) end into sum_ids
    from private.ai_runs r where r.id=last_sum.run_id;
   select count(*)::integer,count(*) filter (where last_sum.id is null or (sum_ids is not null and not x.id=any(sum_ids))
     or (sum_ids is null and coalesce(x.server_received_at,x.created_at)>last_sum.cut_at))::integer into standing,fresh
    from public.submissions x where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden;
   if standing>0 and (last_sum.id is null or fresh>=8 or (fresh>=1 and last_sum.created_at<=t-interval '75 seconds') or (standing<>last_sum.answers and last_sum.created_at<=t-interval '75 seconds')) then
    v_job:='summarize_wall';
    select jsonb_build_object('question',private.fill_years(s.prompt,(select e.base_year from public.engagements e where e.id=s.engagement_id)),'count',standing,'cut_at',t,
     'answers',coalesce((select jsonb_agg(z.text order by z.at,z.id) from (select x.id,x.text,coalesce(x.server_received_at,x.created_at) as at from public.submissions x
       where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden order by coalesce(x.server_received_at,x.created_at) desc,x.id limit 120) z),'[]'::jsonb),
     'groups',coalesce((select jsonb_agg(jsonb_build_object('label',g.label,'count',g.n) order by g.n desc) from private.ai_wall_groups(s.id) g where g.n>=2),'[]'::jsonb),
     'ids',coalesce((select jsonb_agg(x.id order by x.id) from public.submissions x where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden),'[]'::jsonb)) into v_inputs;
   end if;
  end if;
  -- New for grouping: an open answer no earlier claim saw. The seen set counts only while
  -- group_seen_at is set (ai_fail and Clear test answers set it back to null to try again).
  if v_job is null and exists(select 1 from private.ai_wall_open(s.id) o where a.group_seen_at is null or not o.id=any(a.group_seen_ids))
    and ((select count(*) from private.ai_wall_open(s.id))>=2 or exists(select 1 from private.ai_wall_groups(s.id) g where not g.pinned)) then
   v_job:=case when s.interaction='lens' then 'group_lens' else 'group_wall' end;
   select jsonb_build_object(
    'answers',coalesce((select jsonb_agg(jsonb_build_object('ref','a'||ord,'id',id,'text',text) order by ord) from (select o.*,row_number() over(order by o.received,o.id) as ord from (select * from private.ai_wall_open(s.id) limit 60) o) z),'[]'::jsonb),
    'groups',coalesce((select jsonb_agg(jsonb_build_object('ref','g'||ord,'id',id,'label',label,'pinned',pinned,'renamed',z.renamed,'count',z.n,'examples',to_jsonb(coalesce(z.texts,array[]::text[]))) order by ord)
      from (select g.*,row_number() over(order by g.created_at,g.id) as ord from private.ai_wall_groups(s.id) g) z),'[]'::jsonb)) into v_inputs;
   if s.interaction='lens' then v_inputs:=v_inputs||private.lens_prompt_inputs(s.id); end if;
   update private.ai_sessions set group_seen_at=t,group_seen_ids=array(select o.id from private.ai_wall_open(s.id) o order by o.id) where session_id=s.id;
  end if;
 elsif s.interaction='qa' then
  select count(*) into n from jsonb_array_elements(private.qa_board(s.id,false)) e where not (e->>'answered')::boolean and not (e->>'edited')::boolean;
  if n>=2 and exists(select 1 from public.submissions x where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden
    and (a.fold_seen_at is null or not x.id=any(a.fold_seen_ids))) then
   v_job:='fold_questions';
   select jsonb_build_object('questions',coalesce(jsonb_agg(jsonb_build_object('ref','q'||ord,'id',e->>'id','text',e->>'text','asked',(e->>'askers')::integer) order by ord),'[]'::jsonb)) into v_inputs
    from (select e,row_number() over(order by (e->>'at')::bigint,e->>'id') as ord from jsonb_array_elements(private.qa_board(s.id,false)) e
     where not (e->>'answered')::boolean and not (e->>'edited')::boolean order by (e->>'at')::bigint desc limit 80) z;
   update private.ai_sessions set fold_seen_at=t,fold_seen_ids=array(select x.id from public.submissions x where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden order by x.id) where session_id=s.id;
  end if;
 end if;
 if v_job is null then return jsonb_build_object('status','idle'); end if;
 if coalesce(p_versions->>v_job,'') !~ '^[a-z0-9_.@-]{1,60}$' then return jsonb_build_object('status','invalid_request'); end if;
 insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,created_at) values(s.engagement_id,s.id,v_job,p_model,p_versions->>v_job,v_inputs,t) returning id into v_run;
 update private.ai_sessions set lease_id=p_lease,lease_run=v_run,lease_until=t+interval '45 seconds' where session_id=s.id;
 return jsonb_build_object('status','claimed','run',v_run,'job',v_job,'prompt_version',p_versions->>v_job,'inputs',v_inputs);
end $$;

-- ---------- Applying a grouping (the merge limits are step 5's, unchanged) ----------
create or replace function private.ai_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
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

 elsif run.job in ('group_wall','group_lens') then
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

create or replace function private.ai_fail(p_run uuid,p_lease uuid,p_error text,p_usage jsonb) returns jsonb
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
  group_seen_at=case when run.job in ('group_wall','group_lens') then null else group_seen_at end,
  fold_seen_at=case when run.job='fold_questions' then null else fold_seen_at end where session_id=run.session_id;
 return jsonb_build_object('status','ok');
end $$;

-- ---------- The facilitator's AI panel ----------
create or replace function private.ai_status(p_engagement uuid,p_session uuid) returns jsonb
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
    from private.ai_runs where engagement_id=p_engagement));
 if s.id is null or s.interaction not in ('word_cloud','wall','qa','lens') then return out||jsonb_build_object('session',null); end if;
 select * into a from private.ai_sessions where session_id=s.id and not deleted;
 if a.lease_run is not null and a.lease_until>t then select * into running from private.ai_runs where id=a.lease_run; end if;
 select * into last_change from private.ai_runs where session_id=s.id and status='ok' and changed and undone_at is null and job<>'summarize_wall' and not deleted order by created_at desc limit 1;
 select * into last_group from private.ai_runs where session_id=s.id and job in ('group_wall','group_lens') and status='ok' and not deleted order by created_at desc limit 1;
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
 elsif s.interaction in ('wall','lens') then
  out:=out||jsonb_build_object('groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'label',g.label,'ai_label',g.ai_label,'pinned',g.pinned,'renamed',g.renamed_by is not null,
     'undone',g.undone_at is not null,'at',g.created_at,
     'members',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'text',coalesce(private.lens_text(x.id),'')) order by x.server_received_at,x.id) from private.ai_group_members gm join public.submissions x on x.id=gm.submission_id
       where gm.group_id=g.id and gm.removed_at is null and not gm.deleted and not x.deleted and not x.withdrawn and not x.hidden),'[]'::jsonb))
     order by g.undone_at is not null,g.created_at,g.id) from (select * from private.ai_groups where session_id=s.id and not deleted order by created_at desc limit 60) g),'[]'::jsonb),
   'answers',case when s.interaction='lens' then (select count(*) from private.lens_open_sentences(s.id)) else (select count(*) from public.submissions x where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden) end,
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

create or replace function private.ai_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
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
  select * into s from public.sessions where id=(p->>'session')::uuid and engagement_id=p_engagement and not deleted and interaction in ('word_cloud','wall','qa','lens');
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

-- The phone and TV read lens names from a lens step's public options, so a renamed lens shows everywhere.
create or replace function private.public_options(p_session public.sessions,p_settings jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 select case
  when p_session.interaction='content' and p_session.options->>'screen'='scripture' and coalesce(p_session.options->>'translation','')=''
   and coalesce(p_settings->>'scripture_translation','')<>'' then p_session.options||jsonb_build_object('translation',p_settings->>'scripture_translation')
  when p_session.interaction='lens' then p_session.options||jsonb_build_object('lens_names',(select to_jsonb(e.lens_names) from public.engagements e where e.id=p_session.engagement_id))
  else p_session.options end
$$;

-- ---------- Grants ----------
revoke all on function private.options_lens(jsonb,uuid),private.parse_lens(public.sessions,text,jsonb),private.lens_open_sentences(uuid),private.lens_text(uuid),
 private.lens_prompt_inputs(uuid),private.results_lens(uuid,uuid,text[]),private.items_lens(uuid,text[]),private.lens_wall_read(uuid),
 private.lens_capture(),private.lens_on_air(),private.lens_keep_seeding() from public,anon,authenticated;
grant execute on function private.lens_wall_read(uuid) to service_role;
commit;
