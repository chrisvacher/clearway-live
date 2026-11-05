-- Milestone 4, step 8: the acceptance kit's fixes. No new tables, no new kinds.
--
-- Two gaps the earlier steps listed:
--   1. Clear test answers did not clear candidate suggestions. A suggestion made in a rehearsal is now
--      marked as a test (the same trigger as ranking suggestions) and cleared with the other test answers.
--   2. The practice reset did not clear scribe cards or scribe files. Both are now put away with the rest
--      of the practice room. The stored bytes are removed by the app through the Storage API, which
--      reads their paths first through private.practice_scribe_paths (Storage forbids deleting its
--      tables from SQL), and a file whose row is put away is already unreachable (scribe_object_access).
--
-- Shared objects touched, each a superset of its latest definition on main:
--   private.rehearsal_control     the AI step's version (20261103110000) plus one line for candidate suggestions
--   private.reset_practice_room   the candidates step's version (20261104170000) plus scribe cards and files
-- New: private.candidate_suggestions.test, its mark_test trigger, private.practice_scribe_paths and its
-- public wrapper. Nothing here touches Team Hub or CORE, and nothing reaches the TV or phones.
begin;

alter table private.candidate_suggestions add column test boolean not null default false;
create trigger mark_test before insert on private.candidate_suggestions for each row execute function private.mark_test();

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
 update public.engagements set status='setup' where id=eng;
 update public.room_states set live_session_id=null,tv_content='holding',phones_down=false,burst_ends_at=null,spotlight_id=null,
   hidden_ids=array[]::uuid[],remote_holder_id=null,team_led_block_id=null,show_tv_on_phones=false,
   results='{"total":0,"people":0,"words":[]}' where engagement_id=eng;
 return true;
end $$;

-- The stored bytes behind the practice room's scribe files, for the app to remove after a reset.
create function private.practice_scribe_paths() returns text[]
language plpgsql stable security definer set search_path='' as $$
declare eng uuid:='90000000-0000-4000-8000-000000000010'::uuid;
begin
 if not ((select private.is_admin()) or private.can_facilitate(eng)) then return array[]::text[]; end if;
 return coalesce((select array_agg(storage_path) from private.scribe_files where engagement_id=eng and not deleted),array[]::text[]);
end $$;
create function public.practice_scribe_paths() returns text[]
language sql stable security invoker set search_path='' as $$ select private.practice_scribe_paths() $$;
revoke all on function private.practice_scribe_paths(),public.practice_scribe_paths() from public,anon,authenticated;
grant execute on function private.practice_scribe_paths(),public.practice_scribe_paths() to authenticated;

commit;
