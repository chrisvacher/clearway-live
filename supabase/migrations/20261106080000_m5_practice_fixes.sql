-- Milestone 5 practice-room fixes (the November 6 run).
--
-- Shared objects this migration redefines:
--   private.candidate_board   the one definition (20261104170000_candidates) with one clause added: a board the practice reset put
--                             away starts again at the review phase instead of coming back as it was left
-- Nothing else changes. The read-back's prompt and per-person limit live in the template (20261106070000_read_back) and in the app's
-- palette defaults, not here; reset_practice_room, rehearsal_control, ai_on and ai_runs_job_check are not touched.

-- A candidates step's board is made on first use. The practice reset puts every board away (deleted) but leaves its phase, so a step
-- that goes live again after a reset found its old board still in the marked phase: the control surface offered only Mark again, with
-- no candidates to mark, and nothing moved the board on. A board that was put away now starts again: review, no cut line chosen,
-- nothing drafted, no mark, no decision. The room's own readers already treated a put-away board as no board at all (review).
create or replace function private.candidate_board(p_session uuid) returns private.candidate_boards
language plpgsql security definer set search_path='' as $$
declare b private.candidate_boards; s public.sessions;
begin
 select * into s from public.sessions where id=p_session and not deleted;
 if s.id is null then return null; end if;
 insert into private.candidate_boards(session_id,engagement_id) values(s.id,s.engagement_id) on conflict(session_id) do nothing;
 update private.candidate_boards set deleted=false,phase='review',cut=null,ai_requested_at=null,ai_drafted_at=null,ai_note=null,marked_at=null,decision_id=null
  where session_id=s.id and deleted;
 select * into b from private.candidate_boards where session_id=s.id;
 return b;
end $$;
