# Live lens summaries and sign-off

Milestone 4, step 2b. One interaction kind, `lens_summary` (INT-18). Migration `20261104160000_lens_summary.sql`. After the Learning lens, AI drafts each lens's one-screen 10-year Future summary in the present tense from that lens's sentences and clusters. The draft goes straight to the TV, marked AI. Phones tap Approve or Suggest a change. AI folds the suggestions into a new version on the TV. The facilitator marks the room's decision for each lens. Every version is kept. The draft Map (step 7) reads the signed-off summaries; the Day 2 confirm is milestone 5.

## What the room sees

**One session walks the five lenses.** The step is `{ "lens": 1..5, "ai": true }`. The facilitator moves through the lenses on the control surface (Previous lens, Next lens, or a lens chip). The other lenses are drafted ahead of time but only shown when the facilitator moves to them. The Defaults Chris accepted on November 4 are built as written:

| Default | How it is built |
| --- | --- |
| A sign-off session of about 25 minutes, straight after the Learning lens | `lens_summary` has a 25 minute palette length (`lib/run-of-show/builder.ts`). The Wayfinding template that places it is a later step |
| The tally restarts at zero when a new version folds in | Answers carry the version they were given on. The tally counts the current version only. Earlier answers stay as history (`private.lens_summary_responses`) |
| Suggestions show on the TV as anonymous cards beside the tally: two shown, the rest counted on phones | `results.suggestions` carries an 8 character tag and the text, never a name. The TV shows two cards and "+ n more on phones" |
| AI folds automatically after 3 quiet seconds, with Fold in now, Hold and Undo on the control surface | `ai_claim` returns `{status: "wait", ms}` until the last suggestion is 3 seconds old. The worker sleeps (at most 4 seconds, inside its budget) and asks again |
| A summary is one TV screen, 420 characters, with "+ n more on phones" past that | `results.summary.fit` and `more` are computed in the database. At least one line is always shown. Phones show every line |
| Facilitator edits replace the line in place on the TV in small batches, no tracked change | Edits are not logged presses. The TV crossfades the one line (`--cwl-dur-line-replace`); typing that extends a line just grows it. The facilitator's caret shows for about 3 seconds |

**On the TV (`LensSummaryView`).** The lens heading with its icon and the five lenses as a strip (a check on a decided lens). A card with the summary: "Drafted by AI" with the AI icon and "Version n", or "Edited by the facilitator". Beside it the tally ("Approved", "Suggested a change") and up to two anonymous suggestion cards. Numbers show where the room is. They never decide.

**On a phone (`LensSummaryInput`).** Every line, each with "From n sentences" opening the room's sentences it came from (a separate phone-only route, `/api/live/[id]/summary`; the TV never gets sources). Approve, and Suggest a change with a short box (140 characters). One answer per person for each version. When AI folds a new version in, the buttons come back for it. A phone one version behind gets `stale` and reads the new version (`lib/phone/policy.ts` settles it, so the outbox never retries it forever).

**On the control surface (`LensSummaryPanel`, private).** The lens chips, the lines (editable while live; each shows its sources), Add line, Remove, the AI row (Fold in now, Hold or Release, Undo, Write it again, Turn AI on or off), the suggestions (anonymous), the tally, Mark a decision (with reasons) and Take back to the screen, and every version with its author, note and counts. Only you see this.

## Keeping the screen alive

AI is never in the path from phone to TV. An Approve or a suggestion is stored and broadcast by `live_submit`, and the tally and the card reach the TV in the same room version. The draft and the fold arrive later as their own room events.

On the TV, rows keep their place in the page across versions (`reconcile` in `lib/interactions/lens-summary.ts`): by id, then by wording, then, for a facilitator's version, by place. A fold arrives as a tracked change (pass 5's look): inserted words are underlined, deleted words are struck and stay readable for `--cwl-delay-tc-leave` (900 ms), then leave while the paragraph reflows. A removed line stays struck in its place, then leaves. Nothing redraws, blanks or waits for a reveal. Reduced motion shows the final state at once.

## The tracked change is computed in the database

`ls_changes` matches the new version's lines to the old by lineage (`from_sentence_id`), never by position, and yields `edit` (with word-level `keep`, `del` and `ins` parts from `ls_diff`), `add` and `remove`, each with the line's place. `results` carries them only for an AI fold (`tracked`).

## The facilitator edits while it is live

`edit_start` and `edit_beat` hold a lock (40 seconds fresh) that AI waits for and a second facilitator respects. `edit` changes one line, adds one or removes one (up to 8 lines, 400 characters a line). The first edit of an AI version makes a version of the facilitator's own, with the tally at zero; later edits change that version in place. A hand edit stops AI redrafting that lens. `edit_done` frees the lock and lets a pending fold run.

## Undo, Hold and Mark a decision

Undo takes the current version off the screen and brings the one before back. An undone fold or draft is held, so AI does not make the same one again until Release, Fold in now or Write it again. Hold stops folds for the lens. Mark a decision calls the shared `decision_mark` (subject `lens_summary`) and signs off the version on the screen; the lens then takes no more answers or edits until Take back to the screen. Counts never decide: the decision works with any tally.

## AI

Two jobs, both through the milestone 3 worker (`ai_claim`, the model call, `ai_apply`, one lease per session, the run log):

| Job | Prompt | When |
| --- | --- | --- |
| `draft_lens_summary` | `draft-lens-summary@1` | A lens has at least two sentences and no summary on screen. The current lens first, then the others ahead of time |
| `fold_lens_summary` | `fold-lens-summary@1` | The last suggestion on the current version is 3 seconds old (or Fold in now), the facilitator is not editing and the fold is not held |

The model sees the sentences (`a1`..), the clusters (`c1`..), the summary lines (`s1`..) and the suggestions (`g1`..) under short refs. It never sees ids, names or the alignment signal. The merge limits are code in `ai_apply`:

- A drafted line is kept only with a real source, in the present tense (no will, would, shall, going to, hope to, plan to, aim to or intend to), with no quotation marks and with only numbers that came from its sources (or the year). At most 8 lines and 420 characters; if none are valid the draft is held.
- A fold keeps every prior line word for word unless a suggestion is named for the change. An unaccounted line stays in its place. Over 8 lines or 420 characters, the fold is refused. An unchanged result is a no-op, and the same suggestions are not tried twice.
- A failed or slow call leaves the summary as it is, and the facilitator writes it by hand.

Riverside fixtures for both jobs are in `tests/fixtures/ai/live.json`; the scripted stand-in (`lib/ai/fake.ts`) follows the same rules for the browser kit.

## Security

Row-level security is on every table, with pgTAP by role (`supabase/tests/database/lens_summary.test.sql`). Participants never read the tables. The TV and phones get only `results` (lines, tally, anonymous cards, the lens strip). Sources reach a participant's phone through `lens_summary_sources`, only for the version on the screen. The facilitator's view is `lens_summary_state`. The alignment signal, presenter notes and Discover data are not in any of it.

## Tests

`supabase/tests/database/lens_summary.test.sql` (by role, the apply limits, the fold, the lock, undo, decide, the practice reset), `tests/unit/lens-summary.test.ts` and the lens summary cases in `tests/unit/ai-live.test.ts` (fixtures, the scripted stand-in), and `npm run test:lens-summary`: a paired TV and 50 simulated phones through the real endpoints with the scripted model slow. It checks 95 of 100 phone-to-TV times under one second, that rows keep their elements and never jump, a tracked change on the fold, the tally restarting at zero, a stale phone, a hand edit replacing a line in place, Mark a decision and that no name or email reaches the TV or an AI input.
