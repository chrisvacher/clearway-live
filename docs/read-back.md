# The Day 2 read-back

Milestone 5, step 3a. One interaction kind, `read_back` (D2-03, D2-04, INT-14). Migration `20261106070000_read_back.sql`. Day 2, 9:00 is a short confirm: the five signed-off lens summaries in lens order, then each reviewed outcome with its 3-year Vision bullets from the latest overnight publication.

## What the room sees

**The TV (`ReadBackView`).** One item at a time. The heading is "Community, 2036" or the outcome's title, the session prompt reads "Did we hear you right?", and the text is one screen (420 characters, at most 8 lines, "+ n more on phones" past that). A tally of "Yes, that's us" and "It needs a change" uses one colour for both bars, so neither leads. "What's missing?" answers appear anonymously beside it, up to six, and the rest are counted on a "+ n more on phones" line. A progress strip marks the settled items; it stays on one row at the floor size of the type ramp, the current chip keeps its name and the others shorten, so a long confirm leaves the height to the text and the answers. The tally stays slim, and the side column's type starts at the room's size and steps down (four even steps) toward the floor of the ramp (36 px) until up to six answers fit whole; it never goes below the floor, so past that the answers that do not fit whole are counted instead, never clipped and never moved by hand. The count is a plain function of the column's box and the words (`useAnswerFit`), measured before paint, again when the fonts arrive and whenever the column changes size, so it does not move while the room is quiet. At 1920 by 1080, short answers (one line at the floor size) show six at every room size; answers of two lines show four or more. Moving on lifts the text out and the next item rises in (motion 6). A correction that folds in shows as a tracked change (motion 5): inserted words stay underlined until the item is settled and the tally restarts at zero (motion 4).

**A phone (`ReadBackInput`).** The full text with the source sentences under each line. For an outcome, only the phone input the overnight draft cites. "Yes, that's us" or "It needs a change" (a 140 character box), one answer per person per item version and changeable. "What's missing?" takes up to 280 characters, several allowed. Settled items stay on the phone to look back at. A phone on an old version is told to read the new one.

**The scribe console.** A correction composer (`CorrectionComposer`): pick a line or "a new line", write the agreed wording and the reason. It goes to the facilitator's queue, through the scribe outbox when offline.

**The control surface (`ReadBackPanel`, private).** Previous and Next, item chips, the tally, the "It needs a change" texts and the missing answers (anonymous), the correction queue (Accept, Edit, Dismiss), Undo the last fold, Reload items, AI on or off, and Mark a decision per item. The facilitator can also write a correction directly. The scribe's reason shows here and never on the TV. The remote has Previous, Next and the tally.

## How it is built

- Kind position 130, `input` true, `structured` true, not one per person (one "Yes" or "needs a change" per person per version is enforced by `rb_mirror`).
- Tables: `read_back_boards`, `read_back_items`, `read_back_versions`, `read_back_lines`, `read_back_corrections`. Items are read at go-live (`rb_load`) by the `rb_on_air` trigger. Every version of every item is kept.
- Functions: `read_back_phone`, `read_back_scribe`, `read_back_correct`, `read_back_state` and `read_back_control` (show, reload, correct, accept, dismiss, undo, decide, undecide, ai_on, ai_off), each with a `security invoker` public wrapper.
- A correction naming a line folds in code. One naming no line goes to the AI job `fold_read_back` (prompt `fold-read-back@1`, the fast live model, through the worker). Every other line must stay word for word, numbers must come from the item's sources, lens lines stay in the present tense, at most 8 lines and 420 characters. Otherwise the fold is refused and the facilitator names the line by hand. With AI off the facilitator edits by hand.
- Mark a decision (`decision_mark`, subject `read_back`) settles an item. A lens item settled with a change becomes a new signed-off lens summary version by `read_back`, noted "Changed in the Day 2 confirm". An outcome item settled with a change updates the Map's 3-year Vision: `map_assemble` reads the settled read-back text first, then the overnight publication, then the room's bullets. An empty item shows as empty.
- Palette: a Read-back dropped from the run of show palette starts as the template step does (`droppedSession` in `lib/run-of-show/builder.ts`): the prompt "Did we hear you right?", 60 sends per person, 280 characters, 50 words, AI on.
- Templates: both Wayfinding templates replace the "Confirm the 10-year Future" placeholder with a 30 minute `read_back` step and a presenter note. Existing engagements are unchanged.

## Shared database objects this migration changes

Redefined as supersets of the newest definitions: `ai_runs_job_check`, `ai_on`, `decision_mark`, `decisions_subject_check`, `lens_summary_versions_author_check`, `map_assemble`, `control_status` (patched in place). Wrapped by renaming the previous function: `ai_claim` (to `ai_claim_pre_read_back`), `ai_apply` (`ai_apply_pre_read_back`), `ai_fail` (`ai_fail_pre_read_back`), `reset_practice_room` (`reset_practice_room_pre_read_back`), `rehearsal_control` (`rehearsal_control_pre_read_back`).

## Tests

- `supabase/tests/database/read_back.test.sql`: by role.
- `tests/unit/read-back.test.ts` and the `fold_read_back` cases in `tests/unit/ai-live.test.ts` with Riverside fixtures and a scripted stand-in in `lib/ai/fake.ts`.
- `npm run test:read-back` (`tests/browser/read-back.ts`): a paired TV and 50 simulated phones, 95 of 100 phone-to-TV times under a second, no row jumps, a scribe correction accepted and folding in as a tracked change, the tally restarting at zero, an AI fold, Undo, an offline scribe, Mark a decision, the Map reading the changed text, and screenshots with `KIT_SHOTS`. The practice room takes one room-wide lock, so the kit opens the control surface after the 100 answers, as the lens summary kit does.

The Mark a decision field starts empty, with a hint saying what the database will write ("Confirmed", or "Confirmed with changes" once a correction folded in). Typing nothing leaves the wording to the database, so a changed item is never recorded as plain "Confirmed".
