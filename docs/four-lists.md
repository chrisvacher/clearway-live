# The Four Helpful Lists (milestone 6, step 2)

INT-11 on the TV and phones, SET-05 for the facilitator's review. Migration: `supabase/migrations/20261106020000_four_lists.sql`. Kit: `npm run test:four-lists`.

## What it does

- A card is a list (right, wrong, missing, confused) plus a few words. A person can write several.
- Agreeing is its own write, keyed by person and card. One tap on, a second tap off. You can't agree with your own card. Counts are people.
- The TV shows the four lists side by side. A new card slides in with the Lime moment; counts tick; a card that gains agreement glides up its list. Reduced motion is a 150 ms fade, and folds and trades happen in place.
- Cards sit at the room's type floor. If a list runs over, padding tightens, never type. A "+ N more on phones" line counts what is not shown.
- Cards with the same words fold at once beneath a survivor, with no AI mark. The AI job `fold_four_lists` folds similar cards, inside one list only, at least two per fold, never different numbers or quotes, at most four per fold, and at least 60% of cards stay standing across the session. Survivors it creates carry the AI mark and the count.
- The AI is never in the path from a phone to the TV. Cards and agrees reach the TV on their own; folds arrive later.
- The facilitator can turn AI off or on, undo the last AI change, undo one fold, and pin, unpin, hide or unhide a card. Hidden cards leave the TV and stay in SET-05.
- SET-05 (`/setup/<id>/four-lists`) is a read-only review with a CSV. It names no one.

## Defaults chosen

- Agree toggles, no self-agree, counts people.
- AI folds inside one list, at least 2 cards, with undo, pin and off.
- A Discover part sits ahead of Pre-call in both Wayfinding templates with one live Four Helpful Lists step (30 minutes, 12 cards each, 140 characters, 30 words). The facilitator can switch it to self-paced.
- Twelve cards each is the default send limit.
- The TV shows the top four cards of a list (three if any of them is long).

## Shared objects extended

Each is the newest earlier definition plus Four Helpful Lists, built by renaming the earlier function to a `_base` name and wrapping it:

- `ai_runs_job_check` (adds `fold_four_lists`), `ai_on` (redefined as a superset)
- `ai_claim` (wraps `ai_claim_base4`), `ai_apply` (wraps `ai_apply_base4`), `ai_fail` (wraps `ai_fail_base3`)
- `ai_status`, `ai_control` (wrap `ai_status_base`, `ai_control_base`)
- `reset_practice_room` (wraps `reset_practice_room_base`), `rehearsal_control` (wraps `rehearsal_control_base`)
- `part_order` now includes Discover.

Deviation: `show_write`, `template_write` and `room_control` take Discover by a text patch of their current definition (`pg_get_functiondef`, then a replace inside a DO block), not a rewrite. The result is the same as a rewrite, without copying three long bodies. The pgTAP file checks each contains the new part list.

## Contract for Team Hub and CORE

`private.four_lists_cards_for_themes(p_engagement uuid)` returns each standing card (card id, session id, list, text, people agreeing, ids folded beneath it) for the engagement, for the themes step to read. Nothing is written to CORE.

## Known limits

- `control_status.test_answers` does not count test agrees.
- `ai_apply` refuses a whole group (`kept_apart`) if the facilitator ever separated one of its members, so the AI never re-folds what a person pulled apart.
- The home page's tool count rises by one.
- The 60% standing rule is applied across the whole session, not per list.
