# Outcome bullets and Outcome confirm (milestone 4, step 4)

Screens D1-11, D1-12, D2-05, D2-06. Two kinds join the interaction library, each with its own `parse_`, `results_`, `options_` and `items_` functions, registry lines and migration (`20261104120000_outcome_bullets_confirm.sql`).

## Outcome bullets (`bullets`)

"In 2029, what's true?" for one Vision Outcome at a time. The year is the engagement's base year plus 3 (the 3-year Vision). The facilitator chooses the outcome on the screen (Show on the screen); the TV, the phones and the rail change in the same moment.

- A bullet is an answer (several per person, up to the step's Sends) and the outcome's indicator. A trigger writes the indicator from the answer, follows a change, and retires it on withdraw, hide or a cleared test answer. The bullet keeps the place where its first keystroke landed.
- An outcome with no bullet stays outlined in Sunrise on the TV and in the rail until it has one. The server says which (`empty`); step 1's `outcome_is_empty` agrees.
- Typed text. `bullet_type` takes what a phone has typed (the bullet's own id, which becomes the answer's id, the outcome, the text, a sequence number). It checks length and the word filter as the text is typed, so nothing the filter would stop reaches the TV. The TV shows the text letter by letter and marks it as typing until it is added.
- Batching. A phone sends at most one typed update per 120 ms (`--cwl-delay-type-batch`) and the server tells the room at most once per 120 ms per step, however many people type. An update held back answers `pending` with `wait_ms`; the phone then nudges (`bullet_nudge`) so the last keystrokes never wait. Adding sends the answer normally and the draft ends.
- Field lock. One person per bullet at a time: a typist holds the bullet 3 seconds after the last keystroke (`--cwl-dur-field-lock`). The facilitator's Edit bullet (fix a number or a name) waits while a phone holds the bullet (`locked`) and then holds the lock itself for 3 seconds. Another person cannot type into someone else's bullet (`conflict`). Old or repeated updates answer `stale`.
- Only the newest six bullets show on the TV; "+ N earlier bullets on your phones" counts the rest. Drafts older than a minute are ignored.

## Outcome confirm (`confirm`)

Phones confirm, rename or challenge each provisional outcome, with an optional reason. One answer per person for the whole list (sending again replaces it).

- The TV shows counts only (confirm, rename, challenge per outcome). No reason, suggested name or person ever reaches the TV or other phones; the kind does not share answers.
- A challenged outcome gets a soft highlight and a Challenged tag on the TV until it is decided, and lifts to the top of the facilitator's list on the control surface, with the reasons and the suggested names (never who).
- Counts never decide. The facilitator records the room's decision per outcome (Confirmed, Renamed, Removed) with a reason. It is step 1's Mark a decision with subject `outcome`, and the outcome's new state in one press, idempotent by press id. A decided outcome stays decided. Confirming sweeps Lime across the row once, then settles to the Confirmed mark.
- A rename keeps the old name (`renamed_from`) for the struck-through line.
- Each outcome carries a one-line description and what the church will stop (`description`, `what_we_stop`), saved by the facilitator at any time (Save details) or with the decision.
- Fewer than four or more than six confirmed shows a note on the control surface from step 1's `outcome_range`. It never blocks.

## Notes for the build

- `reset_practice_room` is not redefined here. It already soft-deletes outcomes and answers; drafts, locks and the screen choice only matter while those exist and are ignored once they are deleted.
- The pass 4 CSS is ported as `oc-*` classes in `components/interactions/outcomes/outcomes.css`, tokens only.
- Browser kit: `npm run test:outcomes` (a TV, three phones and the control surface, then 50 simulated phones typing in bursts and confirming). `KIT_SHOTS=<folder>` saves each screen.
