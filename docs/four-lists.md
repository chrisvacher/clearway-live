# The Four Helpful Lists (milestone 6, step 2)

INT-11 on the TV and phones, SET-05 for the facilitator's review. Migration: `supabase/migrations/20261106020000_four_lists.sql`. Kit: `npm run test:four-lists`.

## What it does

- A card is a list (right, wrong, missing, confused) plus a few words. A person can write several.
- Agreeing is its own write, keyed by person and card. One tap on, a second tap off. You can't agree with your own card. Counts are people who pressed Agree: on a card with others folded beneath it, the distinct people who agreed with the survivor or any card folded into it, never a writer of any card in the group (a folded card's writer is not an agree; fixes A, November 7). The TV, phones, control surface and CSV all read this one number. An agree made offline says "Saved on this phone" beside the card, as a card does, until it sends.
- The TV shows the four lists side by side. A new card slides in with the Lime moment; counts tick; a card that gains agreement glides up its list. Reduced motion is a 150 ms fade, and folds and trades happen in place.
- Cards sit at the room's type floor. If a list runs over, padding tightens, never type. The TV shows the top four of a list and says "+ N more on phones". A phone is offered every standing card of the list it picks (the whole board from `four_lists_my_agrees`, not the TV's top twelve), so it can agree with any of them.
- Cards with the same words fold at once beneath a survivor, with no AI mark. The AI job `fold_four_lists` (prompt `fold-four-lists@2`) folds cards that say the same thing, inside one list only, at least two per fold, never cards that merely share an adjective (the database refuses a member that shares no meaningful word with its survivor, as `unrelated`: stop words and generic praise or judgement words such as strong, good, clear, real, our, church and people are dropped, and plurals and -ing fold), never different numbers or quotes, at most four per fold, and in each run at least 60% of the groups that stood when the run began stay standing (the run's later folds are refused once they would pass that). A survivor it creates carries the AI mark and the count. With AI off, AI folds are not shown anywhere: those cards stand alone on the TV and in the panel, and come back if AI is turned on.
- The AI is never in the path from a phone to the TV. Cards and agrees reach the TV on their own; folds arrive later.
- The facilitator can turn AI off or on, undo the last AI change, undo one fold, and pin, unpin, hide or unhide a card. Hidden cards leave the TV and stay in SET-05.
- SET-05 (`/setup/<id>/four-lists`) is a read-only review with a CSV. It names no one.

## Defaults chosen

- Agree toggles, no self-agree, counts people.
- AI folds inside one list, at least 2 cards, with undo, pin and off.
- A Discover part sits ahead of Pre-call in both Wayfinding templates with one live Four Helpful Lists step (30 minutes, 12 cards each, 140 characters, 30 words). The facilitator can switch it to self-paced.
- Twelve cards each is the default send limit.
- Saving a template anchors it on its Pre-call, and Start an engagement asks for "Pre-call starts"; Discover is set 7 days before at 19:00. The step lands in What We Heard and Strategic Tensions.
- The TV shows the top four cards of a list (three if any of them is long).

## Shared objects extended

Each is the newest earlier definition plus Four Helpful Lists, built by renaming the earlier function to a `_base` name and wrapping it:

- `ai_runs_job_check` (adds `fold_four_lists`), `ai_on` (redefined as a superset)
- `ai_claim` (wraps `ai_claim_base4`), `ai_apply` (wraps `ai_apply_base4`), `ai_fail` (wraps `ai_fail_base3`)
- `ai_status`, `ai_control` (wrap `ai_status_base`, `ai_control_base`)
- `reset_practice_room` (wraps `reset_practice_room_base`), `rehearsal_control` (wraps `rehearsal_control_base`)
- `control_status`: the rehearsal `test_answers` count also counts test agrees (text patch; nothing else changes).
- `part_order` now includes Discover. `ai_due` also lists open self-paced Four Helpful Lists steps, so they get folds too.
- Rehearsals: an agree pressed during a rehearsal is a test row beside the person's real one (the unique key includes the test flag, and the newest row counts), so Clear test answers puts the real agree back. A test agree pressed again for real after the rehearsal becomes a real agree and is not cleared.

Deviation: `show_write`, `template_write` (which also anchors a saved template on its Pre-call) and `room_control` take Discover by a text patch of their current definition (`pg_get_functiondef`, then a replace inside a DO block), not a rewrite. The result is the same as a rewrite, without copying three long bodies. The pgTAP file checks each contains the new part list.

## Contract for Team Hub and CORE

`private.four_lists_cards_for_themes(p_engagement uuid)` returns each standing card (card id, session id, list, text, people agreeing, ids folded beneath it, and `people uuid[]`: the distinct attendee ids of the writer and every agreer across the card and its folds, test rows left out, sorted) for the engagement, for the themes step to read. Service role only. Nothing is written to CORE.

## Practice-room fixes A (November 7, `20261107010000_m6_fixes_a`)

- `private.four_lists_share_word(a, b)` (with `four_lists_stems`) is the word check. `ai_apply` (step 2's body, reached as `ai_apply_pre_signal`) refuses a group as `unrelated` when a member shares no meaningful word with the survivor. "Roles of staff are confusing" under "Elder and staff roles are unclear" shares "staff" and "roles" and stands.
- `private.four_lists_board` no longer adds the writers of folded cards to a survivor's agree count. It had, so that two people who wrote the same words showed as two; the result was an agree nobody pressed, which Undo took away.

## Load on the room lock (November 9, `20261109070000_four_lists_submit_load`)

The 50-phone load test on the live practice room (3 cards each) refused 26 of 150 cards as unavailable. Hosted Postgres cancelled
them with 57014: the `authenticator` role's 8 second statement limit ended requests that were still waiting for the practice
room's lock (the advisory lock keyed on the room, logged as `advisory lock [5,1302358647,492023929,1]`). Every answer, agree, follow-up
status poll, AI apply and TV heartbeat for the room takes that lock or the room row lock, one at a time.
- The follow-up status poll (each open control surface makes it about twice a second) took the lock though it writes nothing.
  `private.followup_manage` now reads without the lock when the action is `status` and no lapsed grant needs sweeping. Writes,
  and a status with a grant to sweep, lock first as before. Statuses and results are unchanged.
- A phone's answer or agree that the database cancels at the statement limit while it waits is sent again by the server up to twice
  (`queuedWrite` in `lib/live/mutation.ts`). Both are keyed by the phone's id and revision, so a repeat stores once. Only 57014 is
  repeated, within 24 seconds. Each repeat is logged as `Room lock wait`.
- Every check that reads room state stays under the lock in `private.live_submit`. `npm run test:submit-lock` holds the lock on one
  connection while a lens summary vote waits on another: a new version or a sign-off, or the person's removal, in between must make
  the vote stale or denied and store nothing.

## Known limits

- `ai_apply` refuses a whole group (`kept_apart`) if the facilitator ever separated one of its members, so the AI never re-folds what a person pulled apart.
- The home page's tool count rises by one.
- The 60% standing rule is per run (against the groups standing when the run was claimed), across all four lists together.
