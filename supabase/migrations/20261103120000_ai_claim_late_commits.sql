-- Milestone 3: AI claims answers that commit late (fix after step 5).
--
-- private.ai_claim decided what was new by time: an answer counted as new for grouping (the
-- wall) or folding (Q&A) when its server_received_at was later than the session's watermark,
-- and the watermark became the claim's own time. live_submit stamps server_received_at when
-- its transaction starts, and answers sent together commit one after another behind the room
-- lock. A claim that ran while some of them were still committing set its watermark past
-- their received times, so once they committed they sat below it: AI never grouped or folded
-- them until another answer arrived. With eight phones sending at once this left most of a
-- wall ungrouped. The wall summary's cut time could undercount fresh answers the same way.
--
-- Now each claim records which answers it saw, and an answer is new when no earlier claim saw
-- it, whatever its time. The seen set counts only while its watermark time is set, so
-- private.ai_fail and Clear test answers (private.ai_clear), which set the time back to null
-- to try again, are unchanged. The summary's run records the ids it read.
--
-- Shared functions redefined: private.ai_claim only, every rule and input kept except the
-- three tests above. Two columns are added to private.ai_sessions. live_submit, ai_apply,
-- ai_fail, ai_clear, the merge limits, the lease and undo are untouched.
begin;

alter table private.ai_sessions add column group_seen_ids uuid[] not null default array[]::uuid[];
alter table private.ai_sessions add column fold_seen_ids uuid[] not null default array[]::uuid[];

-- ---------- The worker's claim ----------
-- The job due for a session, if any, with its inputs and a lease. One lease at a time per
-- session: a second trigger while one runs gets busy, and the running worker claims again
-- when it finishes, so nothing that arrived meanwhile is missed. Inputs carry only answer
-- text and counts, each under a short ref (w1, a1, g1, q1), never an attendee field.
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
 elsif s.interaction='wall' then
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
   v_job:='group_wall';
   select jsonb_build_object(
    'answers',coalesce((select jsonb_agg(jsonb_build_object('ref','a'||ord,'id',id,'text',text) order by ord) from (select o.*,row_number() over(order by o.received,o.id) as ord from (select * from private.ai_wall_open(s.id) limit 60) o) z),'[]'::jsonb),
    'groups',coalesce((select jsonb_agg(jsonb_build_object('ref','g'||ord,'id',id,'label',label,'pinned',pinned,'renamed',z.renamed,'count',z.n,'examples',to_jsonb(coalesce(z.texts,array[]::text[]))) order by ord)
      from (select g.*,row_number() over(order by g.created_at,g.id) as ord from private.ai_wall_groups(s.id) g) z),'[]'::jsonb)) into v_inputs;
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
commit;
