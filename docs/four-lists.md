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

## Known limits

- `ai_apply` refuses a whole group (`kept_apart`) if the facilitator ever separated one of its members, so the AI never re-folds what a person pulled apart.
- The home page's tool count rises by one.
- The 60% standing rule is per run (against the groups standing when the run was claimed), across all four lists together.

## Under load, and the lock a submission holds (acceptance finding live-4 23.8, November 9)

On live.clearway.co the 50-phone load test (`npm run load -- --origin https://live.clearway.co`) sent 150 cards with the Four Helpful Lists live: 124 were accepted and 26 came back unavailable (Postgres 57014, statement timeout), all in the third burst, with about 120 cards on the step. The 50 agrees all succeeded.

What the local stack shows (the load script against `http://localhost:3000`, on an engagement of its own, 150, 450 and about 1,000 cards, and the database throttled to a fortieth of a CPU):

- 150 cards land with none refused. One submission costs about 22 ms of database time, the same at 0 cards and at 450, so the card count alone does not make the queue. The board (`four_lists_board`) is built once per submission, not several times, and its cost grows only gently with cards (about 5 ms at 150, 9 ms at 600).
- Every submission holds the room's row lock (and, in the practice room, an advisory lock before it) from its first statement to the end of its transaction, and the statement timeout counts the wait for that lock. So the capacity of a room is the length of time one submission holds the lock, and a burst that arrives faster than that queues until the last phone's wait passes the timeout. On a database that is several times slower than the local one (the hosted project) the same burst can queue for eight seconds.
- Nearly half of that time was spent before anything needed the lock: the caller's role check, the attendee ids, the step and kind lookups, the request's shape and the answer's own parse.

Not shown here: the local stack could not make the 150 cards fail without throttling the database to a fortieth of a CPU with all 50 phones sending in the same instant, and the throttled run is CPU-bound as a whole, so it does not tell the lock hold from everything else. The hosted project's logs are the check that the change below was enough. The load script now counts the Four Helpful Lists in CI, so a regression that loses cards fails the pull request.

Change (`supabase/migrations/20261109060000_overnight_four_lists_signal.sql`): `private.live_submit` does the role check, the attendee, the step and kind lookups, the request shape and the parse before the room lock; then takes the lock, reads the step again (its state can change while a request waits), the person's earlier answer, the room's state and the answer limit, and writes. Statuses and writes are as before, and the parse's verdict is acted on where it always was (after the conflict and closed checks). A refused request (denied, invalid session, invalid request) no longer queues.

Load check: `npm run load -- --origin <origin> [--room <practice room id>]` joins 50 phones and sends 3 bursts of cards to whichever of word cloud, wall, lens or Four Helpful Lists is live. `--room` names another room that accepts the practice guest join. `npm run test:load` runs the word cloud, then the Four Helpful Lists with 150 cards and 50 agrees, and fails on any refusal.
