# The alignment signal (milestone 6, step 5)

FAC-02 and the FAC-03 signal list. While a Wayfinding or general input step is live with AI on, the deeper model compares the room's input with the accepted Discover themes and raises private cards: aligned, divergent, silent and thin data. Each card shows its evidence. The facilitator can dismiss it, save an aligned card as a citation for the report, or Ask the room: put a neutral question on the TV, over the live step, until Back to the session.

The cards are suggestions. They notice and describe; they never correct. (Chris: "not striking out bad ideas, but noticing the discussion going a different direction.")

Migration: `supabase/migrations/20261106050100_signal.sql`. Prompt: `alignment-signal@1` in `lib/ai/prompts.ts`. Kit: `npm run test:signal`. Database tests: `supabase/tests/database/signal.test.sql`.

## Who sees it

The lead and the co-facilitator, on the control surface (private panel, first in the side column) and on their own remote (a short list that works with the laptop closed). Never on the TV, any phone, the scribe console or a team facilitator's remote. Every function checks `private.show_allowed`, and every style is scoped to `[data-surface="control"]`. The panel and the list render nothing when the read is missing or denied, so the control surface and remote are unchanged before the migration.

The only things the TV receives are the neutral question's words, through `state.neutral_question` in the public payload. No theme, count, signal kind, evidence or AI line is stored with it or sent. The room's count and the AI line are hidden by rendering while it is up (removing results from the payload would blank the board during the cross-fade). Phones keep the live step and never show it.

## When it runs

One job, `alignment_signal`, on the deeper model, through the worker's own contract (`ai_claim`, then the model, then `ai_apply` or `ai_fail`) and the same run log (`private.ai_runs`).

- Only for a step that is the room's live step, in state live or phones down, with AI on, and of kind word cloud, wall, lens or Q&A. At least one theme must be accepted. Four Helpful Lists is excluded because its cards are already themes (circular); the pre-mortem is excluded as it is not a read of the church today.
- Due after 8 new inputs, or 45 seconds after the first new input, whichever comes first. Also once when phones first go down, so silent themes get their turn. An input is an answer or a scribe card; hidden, withdrawn and deleted answers are not input. Rehearsal answers are (they are test rows).
- One signal run at a time per session, on the signal's own lease (`signal_lease_id`, `signal_lease_run`, `signal_lease_until` on `private.ai_sessions`, 75 seconds), apart from the live jobs' lease, so live grouping and folding are never made to wait by it. The worker runs the signal's model call beside its loop for the same reason. A reset or Clear test answers clears the lease, never closer than 10 seconds apart. A failed run waits 30 seconds and then reads all the input again.
- Fairness: a signal that has waited 30 seconds goes before the live jobs, so a steady stream of answers (wall grouping) cannot starve it. Otherwise the live jobs go first and the signal takes the idle moment after them.
- The control surface's 3 second poll asks `ai_due` as before, which is how the 45 second rule is kept with nobody answering.
- The run never reads as AI being slow or failing and never becomes "Undo last AI change": `changed` is always false, `last_ok_at`, `last_ms` and `last_failed_at` are not touched, and the signal never takes the live jobs' lease, so `ai_status` is not touched. The panel's own `state.running` reads the signal's lease.

## What the model reads

Themes from `private.discover_accepted_themes` (up to 40, strong first, each with at most two of the room's own quotes) under refs t1, t2; the live input (latest 120, oldest first) under refs r1, r2, never a person, a speaker or an id; the cards already on the panel (kind, theme, dismissed). A scribe card is marked as one and carries only its text.

## What a card may be (code, not prompt)

`ai_apply` keeps a card only if: its kind is valid and its theme is still accepted; aligned has at least one room input and a strong theme; divergent has at least one room input; thin has a thin theme and at least one room input; silent has no room input, a strong theme, and phones have been down; the words pass the word filter, hold no quotation marks, no name from the room and nothing in the tone of a correction (wrong, should, must, mistake, contradict, ignore and the like); no repeat of a kind and theme in one run. At most 6 cards a run and 12 live cards a step.

Counts, strengths and sources are worked out by the database from the run's own inputs and the themes as they stand; the model writes none. An invalid suggested question becomes none rather than refusing the card.

A card is replaced in place when the same kind and theme fire again, so there is never a duplicate, and a saved citation stays saved. A dismissed card stays dismissed for the session. A silent card stands, as the same card, until a complete run raises an aligned, divergent or thin card on its theme; a run that says nothing about the theme leaves it. A card already up is raised again, with the same kind and theme, when new input (marked new) changes what it rests on, and its evidence is refreshed in place. A divergent card is keyed on the theme it departs from, so the existing unique index (session, kind, theme) holds.

## Records

`private.signals` (step 1) gains `title`, `line`, `ask` (the suggested neutral question), `ask_sent` and `on_tv`. `private.ai_sessions` gains `phones_down_at` (set once by a trigger on `public.sessions` when state first becomes phones_down) and the signal's own watermarks. `public.room_states` gains `neutral_question`. A trigger clears it when the live step changes or the TV leaves a step screen, and clears each card's `on_tv` when it comes down.

## Functions

| Function | Does |
| --- | --- |
| `signal_state(p_engagement, p_session)` | Facilitators only. The cards of the live step with evidence, the question on the TV, themes held for phones, state. |
| `signal_act(p_engagement, p_id, p_signal, p_action, p)` | dismiss, save_citation (aligned only), ask (the facilitator's text, or the card's own), back. Idempotent through `room_controls`. Statuses ok, duplicate, unchanged, invalid_request, invalid_state, filtered, names_signal, missing, denied, closed. |

A neutral question is 1 to 200 characters, passes the word filter, and is refused (`names_signal`) if it holds the card's theme, a figure or percent, the words signal, aligned, divergent, silent, thin data, alignment, or survey, interviews or Discover. Ask needs the card's step to be the live step on the session screen. Putting a question up raises the room version so every screen hears it at once.

## Shared objects changed

| Object | Extends |
| --- | --- |
| `ai_runs_job_check` | step 3's list (20261106030000) plus `alignment_signal`. If step 4 adds a job, whichever merges second must rebase the list. |
| `live_public_state` | the promoted quote wrapper (20261106050000), renamed `live_public_state_pre_signal`, plus `state.neutral_question`, only while one is up |
| `ai_claim`, `ai_apply`, `ai_fail` | step 2's wrappers (20261106020000), renamed `*_pre_signal`, dispatch on job (`ai_status` is not wrapped) |
| `reset_practice_room` | step 2's wrapper (20261106020000), replaced in place with the signal's lines added (an earlier test reads the base chain) |
| `rehearsal_control` | step 2's wrapper, renamed `rehearsal_control_pre_signal`; Clear test answers also puts test signals away and resets the step's watermarks |

Not changed on purpose: `ai_on` (the signal runs where AI is already on) and `ai_due` (it already hands the live step to the worker).

## Defaults chosen

- Eligible steps: word cloud, wall, lens, Q&A. Four Helpful Lists and the pre-mortem are out.
- Thresholds: 8 new inputs or 45 seconds, 10 second floor, 30 second retry pause, 30 second fairness, 75 second lease, 30 second model timeout.
- The 120 newest inputs and 40 themes are what the model reads; 6 cards a run, 12 live cards a step.
- A neutral question is at most 200 characters (the suggestion at most 140).
- While a team facilitator holds the remote, the cards stay on the lead's surfaces with a note ("Ben has the remote. The cards stay here."). The pass 6 reference clears the list; this keeps the evidence in front of the lead and still shows nothing to the team facilitator.
- The facilitator topic notice `{kind: "signal"}` carries no card content and goes only to Clearway facilitators.
- Citations: a saved aligned card is `saved_as_citation_at` on `private.signals`, with its evidence. Milestone 7's report reads it from there.

## Tests

- `signal.test.sql`: forced row-level security, no browser grant; who may read and press (lead and co-facilitator yes; another engagement's facilitator, participant, scribe, team facilitator, TV, no place and unsigned no); the claim thresholds; code limits and refusals; replaced not duplicated; dismissed stays dismissed; citation aligned only; silent only after phones go down and retired once raised; failure and cooling; neutral question refusals; the TV payload with a question up holds the text and no theme, count or kind; the question leaves with the step.
- `tests/unit/signal.test.ts` with the Riverside fixture `tests/fixtures/ai/signal.json`: the prompt's rules, what the model sees, defensive parsing, suggestions that never correct, the scripted stand-in and the worker's use of the deeper model.
- `npm run test:signal`: cards arriving on the control surface and the remote with the soft rise, nothing on the TV or phones, the API refusing anyone else, evidence, citation, dismiss, the cross-fade to a neutral question and back, the remote with the laptop closed, and a silent card once phones go down.

## Practice-room fixes, batch B (November 7)

Migration `supabase/migrations/20261107020000_m6_fixes_b.sql`, tested in `supabase/tests/database/m6_fixes_b.test.sql` and `npm run test:signal`.

- **Silent themes waiting.** `signal_state.held` is the strong accepted themes that have no card at all in this step (any kind, dismissed or not). It used to subtract the themes with an aligned or divergent card from the strong count, so a divergent card on a thin theme took one off a strong theme the room had never spoken of. It now equals what a silent card can still come for, and is 0 once phones are down.
- **The TV's question layer.** Once the neutral question has faded out (700 ms, or the reduced-motion fade), the text and the step title are removed from `.tv-ask`. The layer stays in place, empty and `aria-hidden`, and the words stay for the whole fade so the cross-fade is unchanged.

## Overnight acceptance fixes, batch c (November 9)

Migration `supabase/migrations/20261109030000_overnight_after_privacy.sql`. The neutral question may not name any accepted theme of the engagement, not only the card's own: `private.signal_neutral(text,text,uuid)` adds the engagement's accepted theme labels (four letters or more) to the own-label check, and `signal_act` uses it. The same `names_signal` message answers. Test: `signal.test.sql`.
