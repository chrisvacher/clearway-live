-- Milestone 3, step 4: Q&A (INT-03), kind qa. Live only, after merge and Chris's approval.
--
-- Shared changes (step 4 only, as the milestone 3 brief allows; Spotlight over any session and
-- Questions any time reach beyond the live session):
--  * private.live_public_state is redefined with every existing field and rule kept exactly,
--    plus one new top-level key, "qa": the engagement's Questions any time pool (its session and
--    how many questions wait) and the spotlit question.
--  * room_states.spotlight_id, an existing column no function set (every room reset already
--    clears it), now holds the spotlit question. Navigation never clears it, so it shows over
--    any session; Answered, Hide and Clear do. No column is added.
--  * An after insert or update trigger on public.submissions records each Q&A question's words
--    and folds a new question into a matching one as it arrives. It does nothing for other kinds.
-- Nothing else shared is redefined. private.phone_room is unchanged: a phone reads its own votes
-- through public.qa_my_votes.
--
-- Folding seam for step 5: every fold is a row in private.qa_merges with made_by 'words' (this
-- step), 'ai' (step 5) or 'facilitator', and detail for the model and prompt version. Results
-- mark a group as AI when any of its folds is made_by 'ai'. Undo works the same for all three.
begin;

insert into private.interaction_kinds(kind,label,input,one_per_person,counts,structured,shares_answers,spotlight,named,position)
 values('qa','Q&A',true,false,'answers',false,true,'id','never',30);

-- Each question's state beyond the submission: the words folding matches on, the
-- facilitator's edit (the asker's own words stay in the submission) and Answered.
create table private.qa_questions (
 submission_id uuid primary key references public.submissions(id),
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 words text[] not null default array[]::text[],
 edited_text text check(edited_text is null or length(edited_text) between 1 and 280),
 edited_by uuid references public.clearway_users(id),
 edited_at timestamptz,
 answered_at timestamptz,
 answered_by uuid references public.clearway_users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create index qa_questions_session_idx on private.qa_questions(session_id,engagement_id);
create index qa_questions_engagement_idx on private.qa_questions(engagement_id);
create index qa_questions_edited_idx on private.qa_questions(edited_by);
create index qa_questions_answered_idx on private.qa_questions(answered_by);

-- Merge (PRD "Merge"): what words, AI or the facilitator folded, and its undo.
create table private.qa_merges (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 survivor_id uuid not null references public.submissions(id),
 member_id uuid not null references public.submissions(id),
 made_by text not null check(made_by in ('words','ai','facilitator')),
 actor_id uuid references public.clearway_users(id),
 detail jsonb not null default '{}' check(jsonb_typeof(detail)='object' and pg_column_size(detail)<=4096),
 undone_at timestamptz,
 undone_by uuid references public.clearway_users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 check(survivor_id<>member_id),
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create unique index qa_merges_member_idx on private.qa_merges(member_id) where undone_at is null and not deleted;
create index qa_merges_survivor_idx on private.qa_merges(survivor_id);
create index qa_merges_member_all_idx on private.qa_merges(member_id);
create index qa_merges_session_idx on private.qa_merges(session_id,engagement_id);
create index qa_merges_engagement_idx on private.qa_merges(engagement_id);
create index qa_merges_actor_idx on private.qa_merges(actor_id);
create index qa_merges_undone_idx on private.qa_merges(undone_by);

-- Question vote (PRD "Question vote"): one row per person per question, toggled. The id is
-- made on the phone and each press raises the revision, as answers do.
create table private.qa_votes (
 id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 question_id uuid not null references public.submissions(id),
 attendee_id uuid not null,
 voted boolean not null,
 revision integer not null check(revision between 0 and 1000000),
 phone_sent_at timestamptz not null,
 queued_at timestamptz,
 server_received_at timestamptz not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id),
 foreign key(attendee_id,engagement_id) references public.attendees(id,engagement_id)
);
create unique index qa_votes_person_idx on private.qa_votes(question_id,attendee_id) where not deleted;
create index qa_votes_session_idx on private.qa_votes(session_id,engagement_id);
create index qa_votes_attendee_idx on private.qa_votes(attendee_id,engagement_id);
create index qa_votes_engagement_idx on private.qa_votes(engagement_id);

do $$ declare t text; begin
 foreach t in array array['private.qa_questions','private.qa_merges','private.qa_votes'] loop
  execute format('alter table %s enable row level security',t);
  execute format('alter table %s force row level security',t);
  execute format('revoke all on %s from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on %s to service_role',t);
  execute format('create trigger touch_record before update on %s for each row execute function private.touch_live_record(%L)',t,case when t='private.qa_questions' then 'submission_id' else 'id' end);
 end loop;
end $$;

-- ---------- Matching words ----------
-- Lower-cased, punctuation dropped, common words removed, a trailing "s" dropped on words
-- over three letters, each word once.
create function private.qa_words(p_text text) returns text[]
language sql immutable security invoker set search_path='' as $$
 select coalesce(array_agg(distinct w order by w),array[]::text[]) from (
  select case when length(t)>3 and right(t,1)='s' and right(t,2)<>'ss' then left(t,-1) else t end as w
  from regexp_split_to_table(regexp_replace(lower(coalesce(p_text,'')),'[^[:alnum:][:space:]]',' ','g'),'\s+') t
  where length(t)>0 and not t=any(array['a','an','the','and','or','but','if','of','to','in','on','at','by','for','with','from','about','as','into','onto','is','are','was','were','be','been',
   'being','am','do','does','did','doing','done','have','has','had','having','i','me','my','mine','we','our','ours','us','you','your','yours','he','him','his','she','her','it','its',
   'they','them','their','this','that','these','those','what','which','who','whom','whose','when','where','why','how','can','could','would','should','will','shall','may','might',
   'must','there','here','than','then','so','not','no','all','any','some','more','most','very','just','also','too','up','out','over','really','get','got','going','go','any',
   'anything','something','thing','things','ever','still','yet','much','many','lot','lots','one','way','im','dont','cant','isnt','arent','wasnt','whats','hows','theres','lets'])
 ) x
$$;
-- About three-quarters overlap: shared words over the longer question's words.
create function private.qa_overlap(p_a text[],p_b text[]) returns numeric
language sql immutable security invoker set search_path='' as $$
 select case when cardinality(p_a)=0 or cardinality(p_b)=0 then 0
  else (select count(*) from unnest(p_a) w where w=any(p_b))::numeric/greatest(cardinality(p_a),cardinality(p_b)) end
$$;

-- A question's group: the survivor it is folded into while that survivor stands, else itself.
create function private.qa_root(p_question uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select coalesce((select m.survivor_id from private.qa_merges m join public.submissions s on s.id=m.survivor_id
   where m.member_id=p_question and m.undone_at is null and not m.deleted and not s.deleted and not s.withdrawn and not s.hidden),p_question)
$$;

-- Fold a question that just arrived into the best standing match. A question already folded,
-- answered, edited by the facilitator, or whose fold was undone is never refolded by words.
create function private.qa_fold_words(p_question uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me private.qa_questions; target uuid; score numeric;
begin
 select q.* into me from private.qa_questions q where q.submission_id=p_question and not q.deleted;
 if me.submission_id is null or cardinality(me.words)=0 or me.edited_text is not null
   or exists(select 1 from private.qa_merges m where m.member_id=p_question and not m.deleted)
   or exists(select 1 from private.qa_merges m where m.survivor_id=p_question and m.undone_at is null and not m.deleted) then return null; end if;
 select c.submission_id,private.qa_overlap(c.words,me.words) into target,score
 from private.qa_questions c join public.submissions x on x.id=c.submission_id
 where c.session_id=me.session_id and c.submission_id<>p_question and not c.deleted and c.answered_at is null
  and not x.deleted and not x.withdrawn and not x.hidden and cardinality(c.words)>0
  and not exists(select 1 from private.qa_merges m where m.member_id=c.submission_id and m.undone_at is null and not m.deleted)
  and private.qa_overlap(c.words,me.words)>=0.75
 order by private.qa_overlap(c.words,me.words) desc,x.server_received_at,x.id limit 1;
 if target is null then return null; end if;
 insert into private.qa_merges(engagement_id,session_id,survivor_id,member_id,made_by,detail)
  values(me.engagement_id,me.session_id,target,p_question,'words',jsonb_build_object('overlap',round(score,2)));
 return target;
end $$;

-- Every Q&A question, however it arrives (the Q&A step or Questions any time), records its
-- words; a new one folds as it arrives. Other kinds pass straight through.
create function private.qa_arrive() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.sessions s where s.id=new.session_id and s.interaction='qa') then return new; end if;
 insert into private.qa_questions(submission_id,engagement_id,session_id,words) values(new.id,new.engagement_id,new.session_id,private.qa_words(new.text))
  on conflict(submission_id) do update set words=case when private.qa_questions.edited_text is null then excluded.words else private.qa_questions.words end;
 if tg_op='INSERT' and not new.withdrawn and not new.deleted then perform private.qa_fold_words(new.id); end if;
 return new;
end $$;
create trigger qa_arrive after insert or update of text on public.submissions for each row execute function private.qa_arrive();

-- ---------- The board: every number on screen, computed once ----------
-- Ranking counts people: each person who asked a question in a group counts 2, each other
-- person who voted counts 1; ties go to the most recent activity (an ask or a vote).
-- p_all adds what only the facilitator sees: folded members with their merges, and hidden questions.
create function private.qa_board(p_session uuid,p_all boolean) returns jsonb
language sql stable security definer set search_path='' as $$
 with q as (
  select x.id,x.attendee_id,x.text,x.hidden,coalesce(x.server_received_at,x.created_at) as at,qq.edited_text,qq.answered_at,
   m.id as merge_id,m.survivor_id,m.made_by
  from public.submissions x join private.qa_questions qq on qq.submission_id=x.id and not qq.deleted
  left join private.qa_merges m on m.member_id=x.id and m.undone_at is null and not m.deleted
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

-- ---------- The kind's own functions ----------
create function private.parse_qa(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t text:=btrim(coalesce(p_text,'')); key text;
begin
 if length(t)=0 or (p_value is not null and jsonb_typeof(p_value)<>'null') then return jsonb_build_object('status','invalid_answer'); end if;
 if length(t)>least(p_session.max_characters,280) then return jsonb_build_object('status','limit'); end if;
 if private.screen_text(t) then return jsonb_build_object('status','filtered'); end if;
 key:=coalesce(nullif(array_to_string(private.qa_words(t),' '),''),btrim(regexp_replace(lower(t),'[^[:alnum:][:space:]]','','g')),'');
 if key='' then key:=lower(t); end if;
 return jsonb_build_object('status','ok','text',t,'answers',jsonb_build_array(jsonb_build_object('text',t,'key',key)));
end $$;
-- The count is the questions still waiting (answered ones leave it); people are the askers.
create function private.results_qa(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with b as (select private.qa_board(p_session,false) as list)
 select jsonb_build_object('total',(select count(*) from jsonb_array_elements(b.list) e where not (e->>'answered')::boolean)::integer,
  'people',(select count(distinct attendee_id) from public.submissions where engagement_id=p_engagement and session_id=p_session and not deleted and not withdrawn and not hidden)::integer,
  'questions',b.list) from b
$$;
-- One setting: Questions any time makes this step the engagement's shared pool.
create function private.options_qa(p jsonb,p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when jsonb_typeof(p)='object' and not exists(select 1 from jsonb_object_keys(p) k where k<>'any_time')
  and coalesce(jsonb_typeof(p->'any_time'),'boolean')='boolean'
  then jsonb_build_object('any_time',coalesce((p->>'any_time')::boolean,false)) end
$$;
create function private.items_qa(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',e->>'id','text',e->>'text','count',(e->>'people')::integer,'hidden',coalesce((e->>'hidden')::boolean,false))),'[]'::jsonb)
 from jsonb_array_elements(private.qa_board(p_session,true)) e
$$;

-- Questions any time: the first Q&A step in run-of-show order with the setting on that is
-- neither a draft nor closed. Its questions are one pool for the whole engagement.
create function private.qa_pool(p_engagement uuid) returns public.sessions
language sql stable security definer set search_path='' as $$
 select s.* from public.sessions s where s.engagement_id=p_engagement and not s.deleted and s.interaction='qa' and s.mode='live'
  and s.options->>'any_time'='true' and s.state not in ('draft','closed')
 order by private.part_order(s.part),s.position,s.id limit 1
$$;

-- What every surface needs beyond the live step: the pool and the spotlit question. Anonymous.
create function private.qa_public(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.sessions; spot uuid; s uuid; e jsonb; pool jsonb; spotlight jsonb;
begin
 p:=private.qa_pool(p_engagement);
 if p.id is not null then
  pool:=jsonb_build_object('session_id',p.id,'title',p.title,'max_characters',least(p.max_characters,280),'max_sends',p.max_sends,
   'waiting',(select count(*) from jsonb_array_elements(private.qa_board(p.id,false)) x where not (x->>'answered')::boolean));
 end if;
 select r.spotlight_id into spot from public.room_states r where r.engagement_id=p_engagement and not r.deleted;
 if spot is not null then
  select x.session_id into s from public.submissions x join public.sessions y on y.id=x.session_id and y.interaction='qa'
   where x.id=spot and x.engagement_id=p_engagement and not x.deleted and not x.withdrawn and not x.hidden;
  if s is not null then
   select t.x into e from jsonb_array_elements(private.qa_board(s,false)) t(x) where t.x->>'id'=spot::text and not (t.x->>'answered')::boolean;
   if e is not null then spotlight:=jsonb_build_object('id',spot,'session_id',s,'text',e->>'text','people',(e->>'people')::integer,'askers',(e->>'askers')::integer,'ai',coalesce((e->>'ai')::boolean,false)); end if;
  end if;
 end if;
 return jsonb_build_object('pool',pool,'spotlight',spotlight);
end $$;

-- Shared state: step 1's fields and rules exactly, plus "qa" (the pool and the spotlit question).
create or replace function private.live_public_state(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('state',jsonb_build_object('engagement_id',r.engagement_id,'live_session_id',r.live_session_id,'tv_content',r.tv_content,'phones_down',r.phones_down,'burst_ends_at',r.burst_ends_at,'spotlight_id',r.spotlight_id,'spotlight_key',r.spotlight_key,'hidden_ids',r.hidden_ids,'hidden_keys',r.hidden_keys,'remote_holder_id',r.remote_holder_id,'team_led_block_id',r.team_led_block_id,'show_tv_on_phones',r.show_tv_on_phones,'phone_refresh_version',r.phone_refresh_version,'results',r.results,'version',r.version),'session',case when s.id is not null then jsonb_build_object(
 'id',s.id,'title',s.title,'interaction',s.interaction,'prompt',private.fill_years(s.prompt,e.base_year),'state',s.state,'revision',s.revision,'base_year',e.base_year,
 'max_sends',s.max_sends,'max_characters',s.max_characters,'max_words',s.max_words,'options',private.public_options(s,e.settings),'kind',private.kind_public(s.interaction),
 'settings',jsonb_build_object('anonymous',s.settings->'anonymous','burst_minutes',s.settings->'burst_minutes','join_strip',s.settings->'join_strip')) end,
 'qa',private.qa_public(p_engagement))||private.tv_room_info(p_engagement)
 from public.room_states r join public.engagements e on e.id=r.engagement_id left join public.sessions s on s.id=r.live_session_id and not s.deleted
 where r.engagement_id=p_engagement and not r.deleted
$$;

-- ---------- Asking any time ----------
-- An Ask from any session's phone goes to the pool, live or not. It follows live_submit's
-- rules for ids, times, limits and the word filter; when the pool is the live step the
-- event carries the question exactly as live_submit's does.
create function private.qa_ask(p_engagement uuid,p_id uuid,p_text text,p_sent timestamptz,p_queued timestamptz,p_uncertainty double precision) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; who uuid; previous public.submissions; parsed jsonb; received timestamptz:=clock_timestamp(); live boolean;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 select id into who from public.attendees where engagement_id=p_engagement and id in(select private.room_attendee_ids());
 if who is null or r.engagement_id is null then return jsonb_build_object('status','denied'); end if;
 if p_id is null or p_sent is null or not isfinite(p_sent) or (p_queued is not null and not isfinite(p_queued)) or p_uncertainty is null or p_uncertainty not between 0 and 60000
   or p_uncertainty='NaN'::float8 or p_sent>received+interval '1 minute' or p_queued>received+interval '1 minute' then return jsonb_build_object('status','invalid_request'); end if;
 s:=private.qa_pool(p_engagement);
 select * into previous from public.submissions where id=p_id;
 if found then
  if previous.attendee_id<>who or previous.engagement_id<>p_engagement or previous.deleted then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','id',p_id,'revision',previous.revision,'version',r.version);
 end if;
 live:=s.id is not null and s.id=r.live_session_id;
 if s.id is null or (live and (s.state<>'live' or r.phones_down or (r.burst_ends_at is not null and r.burst_ends_at<=received))) then return jsonb_build_object('status','closed'); end if;
 parsed:=private.parse_qa(s,p_text,null);
 if parsed->>'status' is distinct from 'ok' then return jsonb_build_object('status',coalesce(parsed->>'status','invalid_answer')); end if;
 if (select count(*) from public.submissions where session_id=s.id and attendee_id=who and not deleted)>=s.max_sends then return jsonb_build_object('status','limit'); end if;
 insert into public.submissions(id,engagement_id,session_id,attendee_id,text,answers,value,revision,phone_sent_at,queued_at,clock_uncertainty_ms,server_received_at)
  values(p_id,p_engagement,s.id,who,parsed->>'text',parsed->'answers',null,0,p_sent,p_queued,p_uncertainty,received);
 if live then
  perform set_config('clearway.live_answer',jsonb_build_object('id',p_id,'session_id',s.id,'revision',0,'withdrawn',false,'hidden',false,'replaced','[]'::jsonb,
   'text',parsed->>'text','answers',parsed->'answers','value',null)::text,true);
 end if;
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 perform set_config('clearway.live_answer','',true);
 if live then
  insert into private.latency_logs(engagement_id,submission_id,revision,room_version,phone_sent_at,server_received_at,clock_uncertainty_ms)
   values(p_engagement,p_id,0,r.version,p_sent,received,p_uncertainty);
 end if;
 return jsonb_build_object('status','accepted','id',p_id,'revision',0,'version',r.version,'server_received_at',received,'session',s.id);
end $$;

-- ---------- Votes ----------
-- One vote per person per question, toggled, never on a question the person asked (or one
-- folded with theirs). Votes follow the step's answer rules: while it is live and phones are
-- up, while it takes late answers, or queued before it closed and arriving within 2 minutes.
create function private.qa_vote(p_engagement uuid,p_id uuid,p_question uuid,p_revision integer,p_on boolean,p_sent timestamptz,p_queued timestamptz,p_uncertainty double precision) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; q public.submissions; v private.qa_votes; who uuid; root uuid; received timestamptz:=clock_timestamp(); accepting boolean; vid uuid; rev integer;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 select id into who from public.attendees where engagement_id=p_engagement and id in(select private.room_attendee_ids());
 if who is null or r.engagement_id is null then return jsonb_build_object('status','denied'); end if;
 if p_id is null or p_question is null or p_on is null or p_revision is null or p_revision not between 0 and 1000000 or p_sent is null or not isfinite(p_sent)
   or (p_queued is not null and not isfinite(p_queued)) or p_uncertainty is null or p_uncertainty not between 0 and 60000 or p_uncertainty='NaN'::float8
   or p_sent>received+interval '1 minute' or p_queued>received+interval '1 minute' then return jsonb_build_object('status','invalid_request'); end if;
 select x.* into q from public.submissions x join public.sessions y on y.id=x.session_id and y.interaction='qa' and not y.deleted
  where x.id=p_question and x.engagement_id=p_engagement and not x.deleted;
 if q.id is null or q.withdrawn or q.hidden then return jsonb_build_object('status','missing'); end if;
 select * into s from public.sessions where id=q.session_id;
 accepting:=case when r.live_session_id=s.id then s.state='live' and not r.phones_down and (r.burst_ends_at is null or r.burst_ends_at>received)
  else s.state='open' and s.mode='live' end;
 if not accepting and not (p_queued is not null and s.state='closed' and s.closed_at is not null and p_queued<=s.closed_at and p_sent<=s.closed_at
   and received<=s.closed_at+interval '2 minutes') then return jsonb_build_object('status','closed'); end if;
 root:=private.qa_root(p_question);
 if exists(select 1 from public.submissions x where x.attendee_id=who and not x.deleted and not x.withdrawn and not x.hidden and (x.id=root or x.id in(
   select m.member_id from private.qa_merges m where m.survivor_id=root and m.undone_at is null and not m.deleted))) then return jsonb_build_object('status','own'); end if;
 select * into v from private.qa_votes where id=p_id;
 if found then
  if v.attendee_id<>who or v.question_id<>p_question or v.engagement_id<>p_engagement or v.deleted then return jsonb_build_object('status','conflict'); end if;
  if p_revision<=v.revision then return jsonb_build_object('status','duplicate','id',p_id,'revision',v.revision,'voted',v.voted,'version',r.version); end if;
  if p_revision<>v.revision+1 then return jsonb_build_object('status','conflict'); end if;
  update private.qa_votes set voted=p_on,revision=p_revision,phone_sent_at=p_sent,queued_at=p_queued,server_received_at=received where id=p_id;
  vid:=p_id; rev:=p_revision;
 else
  select * into v from private.qa_votes where question_id=p_question and attendee_id=who and not deleted;
  if found then
   -- The same person on another phone: their latest press wins, on their one vote.
   update private.qa_votes set voted=p_on,revision=v.revision+1,phone_sent_at=p_sent,queued_at=p_queued,server_received_at=received where id=v.id;
   vid:=v.id; rev:=v.revision+1;
  elsif p_revision<>0 then return jsonb_build_object('status','conflict');
  else
   insert into private.qa_votes(id,engagement_id,session_id,question_id,attendee_id,voted,revision,phone_sent_at,queued_at,server_received_at)
    values(p_id,p_engagement,s.id,p_question,who,p_on,0,p_sent,p_queued,received);
   vid:=p_id; rev:=0;
  end if;
 end if;
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 return jsonb_build_object('status','accepted','id',vid,'revision',rev,'voted',p_on,'version',r.version);
end $$;
-- A phone's own votes, so it can show and toggle them after a reload or on a new phone.
create function private.qa_my_votes(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare who uuid;
begin
 if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 select id into who from public.attendees where engagement_id=p_engagement and id in(select private.room_attendee_ids());
 if who is null then return jsonb_build_object('status','denied'); end if;
 return jsonb_build_object('status','ok','server_time',clock_timestamp(),'votes',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'question_id',v.question_id,'voted',v.voted,'revision',v.revision) order by v.created_at,v.id)
  from (select * from private.qa_votes where engagement_id=p_engagement and attendee_id=who and not deleted order by created_at,id limit 2000) v),'[]'::jsonb));
end $$;

-- ---------- The facilitator's Q&A controls ----------
-- Spotlight (over any session), Clear, Answered, Bring back, Edit, Undo fold, Hide, Unhide.
-- Room row lock first, facilitator check, the press id for idempotency, one version raise.
create function private.qa_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; done private.room_controls; q public.submissions; s public.sessions; m private.qa_merges; qq private.qa_questions;
 v_spot uuid; v_ids uuid[]; root uuid; t text; me uuid:=private.clearway_user_id(); target uuid; logged text;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if r.engagement_id is null or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or p_action not in ('spotlight','clear_spotlight','answered','unanswer','edit','undo_fold','hide','unhide') or jsonb_typeof(p) is distinct from 'object' then
  return jsonb_build_object('status','invalid_request'); end if;
 -- Recent presses name what happened in plain words.
 logged:=case p_action when 'spotlight' then 'spotlight_question' when 'clear_spotlight' then 'clear_question' when 'answered' then 'mark_answered'
  when 'unanswer' then 'bring_back_question' when 'edit' then 'edit_question' when 'undo_fold' then 'undo_fold' when 'hide' then 'hide_question' else 'unhide_question' end;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>logged then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','version',r.version);
 end if;
 v_spot:=r.spotlight_id; v_ids:=r.hidden_ids;
 if p_action='clear_spotlight' then
  if v_spot is null then return jsonb_build_object('status','unchanged','version',r.version); end if;
  v_spot:=null;
 elsif p_action='undo_fold' then
  if p->>'merge' is null or p->>'merge' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
  select * into m from private.qa_merges where id=(p->>'merge')::uuid and engagement_id=p_engagement and not deleted;
  if m.id is null then return jsonb_build_object('status','missing'); end if;
  if m.undone_at is not null then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.qa_merges set undone_at=clock_timestamp(),undone_by=me where id=m.id;
  target:=m.member_id;
 else
  if p->>'question' is null or p->>'question' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
  select x.* into q from public.submissions x join public.sessions y on y.id=x.session_id and y.interaction='qa' and not y.deleted
   where x.id=(p->>'question')::uuid and x.engagement_id=p_engagement and not x.deleted and not x.withdrawn;
  if q.id is null then return jsonb_build_object('status','missing'); end if;
  select * into s from public.sessions where id=q.session_id;
  if p_action in ('hide','unhide') then
   -- A group hides and comes back as a whole, so its folded questions never pop out alone.
   update public.submissions x set hidden=(p_action='hide') where x.hidden is distinct from (p_action='hide') and (x.id=q.id or x.id in(
    select mm.member_id from private.qa_merges mm where mm.survivor_id=q.id and mm.undone_at is null and not mm.deleted));
   if not found then return jsonb_build_object('status','unchanged','version',r.version); end if;
   if r.live_session_id=s.id then
    v_ids:=coalesce((select array_agg(x.id order by x.id) from public.submissions x where x.session_id=s.id and x.hidden and not x.deleted),array[]::uuid[]);
   end if;
   if p_action='hide' and v_spot=q.id then v_spot:=null; end if;
   target:=q.id;
  else
   if q.hidden then return jsonb_build_object('status','hidden'); end if;
   root:=private.qa_root(q.id); target:=root;
   select * into qq from private.qa_questions where submission_id=root;
   if p_action='spotlight' then
    if qq.answered_at is not null then return jsonb_build_object('status','invalid_state'); end if;
    if v_spot=root then return jsonb_build_object('status','unchanged','version',r.version); end if;
    v_spot:=root;
   elsif p_action='answered' then
    if qq.answered_at is not null then return jsonb_build_object('status','unchanged','version',r.version); end if;
    update private.qa_questions set answered_at=clock_timestamp(),answered_by=me where submission_id=root;
    if v_spot=root then v_spot:=null; end if;
   elsif p_action='unanswer' then
    if qq.answered_at is null then return jsonb_build_object('status','unchanged','version',r.version); end if;
    update private.qa_questions set answered_at=null,answered_by=null where submission_id=root;
   else
    t:=btrim(coalesce(p->>'text',''));
    if length(t)=0 or length(t)>least(s.max_characters,280) then return jsonb_build_object('status','invalid_request'); end if;
    if private.screen_text(t) then return jsonb_build_object('status','filtered'); end if;
    if t=coalesce(qq.edited_text,(select x.text from public.submissions x where x.id=root)) then return jsonb_build_object('status','unchanged','version',r.version); end if;
    update private.qa_questions set edited_text=t,edited_by=me,edited_at=clock_timestamp(),words=private.qa_words(t) where submission_id=root;
   end if;
  end if;
 end if;
 update public.room_states set spotlight_id=v_spot,hidden_ids=v_ids,results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,me,logged,r.live_session_id,r.version,clock_timestamp());
 -- Other remotes refresh at once; the panel that pressed shows its own result, so no toast.
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','action',logged,'version',r.version,'changed',true));
 return jsonb_build_object('status','ok','version',r.version,'question',target);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

-- The control surface's Q&A panel: the live Q&A step, or else the Questions any time pool,
-- or the step asked for. Facilitators only; names never appear.
create function private.qa_status(p_engagement uuid,p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.room_states; s public.sessions; list jsonb;
begin
 if not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 if r.engagement_id is null then return jsonb_build_object('status','missing'); end if;
 if p_session is not null then select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted and interaction='qa'; end if;
 if s.id is null then select * into s from public.sessions where id=r.live_session_id and not deleted and interaction='qa'; end if;
 if s.id is null then s:=private.qa_pool(p_engagement); end if;
 if s.id is null then return jsonb_build_object('status','ok','version',r.version,'session',null,'questions','[]'::jsonb,'spotlight',r.spotlight_id); end if;
 list:=private.qa_board(s.id,true);
 return jsonb_build_object('status','ok','version',r.version,'spotlight',r.spotlight_id,
  'session',jsonb_build_object('id',s.id,'title',s.title,'state',s.state,'live',s.id=r.live_session_id,'any_time',coalesce((s.options->>'any_time')::boolean,false)),
  'questions',list,
  'counts',jsonb_build_object('questions',(select count(*) from jsonb_array_elements(list) e where not (e->>'answered')::boolean and not coalesce((e->>'hidden')::boolean,false)),
   'folded',(select coalesce(sum((e->>'folded')::integer),0) from jsonb_array_elements(list) e),
   'answered',(select count(*) from jsonb_array_elements(list) e where (e->>'answered')::boolean and not coalesce((e->>'hidden')::boolean,false)),
   'hidden',(select count(*) from jsonb_array_elements(list) e where coalesce((e->>'hidden')::boolean,false))));
end $$;

create function public.qa_ask(p_engagement uuid,p_id uuid,p_text text,p_sent timestamptz,p_queued timestamptz default null,p_uncertainty double precision default 0) returns jsonb
language sql security invoker set search_path='' as $$ select private.qa_ask(p_engagement,p_id,p_text,p_sent,p_queued,p_uncertainty) $$;
create function public.qa_vote(p_engagement uuid,p_id uuid,p_question uuid,p_revision integer,p_on boolean,p_sent timestamptz,p_queued timestamptz default null,p_uncertainty double precision default 0) returns jsonb
language sql security invoker set search_path='' as $$ select private.qa_vote(p_engagement,p_id,p_question,p_revision,p_on,p_sent,p_queued,p_uncertainty) $$;
create function public.qa_my_votes(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.qa_my_votes(p_engagement) $$;
create function public.qa_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.qa_control(p_engagement,p_id,p_action,p) $$;
create function public.qa_status(p_engagement uuid,p_session uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.qa_status(p_engagement,p_session) $$;

revoke all on function private.qa_words(text),private.qa_overlap(text[],text[]),private.qa_root(uuid),private.qa_fold_words(uuid),private.qa_arrive(),
 private.qa_board(uuid,boolean),private.parse_qa(public.sessions,text,jsonb),private.results_qa(uuid,uuid,text[]),private.options_qa(jsonb,uuid),private.items_qa(uuid,text[]),
 private.qa_pool(uuid),private.qa_public(uuid),
 private.qa_ask(uuid,uuid,text,timestamptz,timestamptz,double precision),private.qa_vote(uuid,uuid,uuid,integer,boolean,timestamptz,timestamptz,double precision),
 private.qa_my_votes(uuid),private.qa_control(uuid,uuid,text,jsonb),private.qa_status(uuid,uuid),
 public.qa_ask(uuid,uuid,text,timestamptz,timestamptz,double precision),public.qa_vote(uuid,uuid,uuid,integer,boolean,timestamptz,timestamptz,double precision),
 public.qa_my_votes(uuid),public.qa_control(uuid,uuid,text,jsonb),public.qa_status(uuid,uuid)
 from public,anon,authenticated;
grant execute on function private.qa_ask(uuid,uuid,text,timestamptz,timestamptz,double precision),private.qa_vote(uuid,uuid,uuid,integer,boolean,timestamptz,timestamptz,double precision),
 private.qa_my_votes(uuid),private.qa_control(uuid,uuid,text,jsonb),private.qa_status(uuid,uuid),
 public.qa_ask(uuid,uuid,text,timestamptz,timestamptz,double precision),public.qa_vote(uuid,uuid,uuid,integer,boolean,timestamptz,timestamptz,double precision),
 public.qa_my_votes(uuid),public.qa_control(uuid,uuid,text,jsonb),public.qa_status(uuid,uuid)
 to authenticated;
commit;
