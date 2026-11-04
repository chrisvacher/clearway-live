-- Fix after the practice-room run (November 3): Questions any time stays on every phone.
--
-- private.qa_pool chose the engagement's pool as the first Q&A step with Questions any time
-- on that was neither a draft nor closed. Once the room had run that step and moved on, the
-- step closed (a step with no segment closes as soon as the room moves on, and Close the day
-- closes the rest), so there was no pool: the Ask button left every phone and an Ask was
-- refused as closed. The PRD gives every session's phone screen an Ask button, with one
-- shared pool for the engagement, so the pool now outlives its own step.
--
-- The pool is still the first Q&A step in run-of-show order with the setting on that is not a
-- draft, preferring one that is not closed. With the setting on a single step (the usual
-- case) that step stays the pool for the whole engagement, closed or not, and questions asked
-- from later sessions land in it. While the pool step is on the TV its own rules hold as
-- before (phones down, bursts, read-only when shown closed).
--
-- Shared functions redefined: private.qa_pool only, with "not closed" turned from a filter
-- into the first sort key. private.qa_ask, private.qa_public, private.qa_status, private.ai_due,
-- the votes (which still wait until the pool step is on), folding and every grant are unchanged.
begin;

create or replace function private.qa_pool(p_engagement uuid) returns public.sessions
language sql stable security definer set search_path='' as $$
 select s.* from public.sessions s where s.engagement_id=p_engagement and not s.deleted and s.interaction='qa' and s.mode='live'
  and s.options->>'any_time'='true' and s.state<>'draft'
 order by s.state='closed',private.part_order(s.part),s.position,s.id limit 1
$$;

commit;
