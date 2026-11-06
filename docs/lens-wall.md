# Lens seeding and the lens wall

Milestone 4, step 2. One interaction kind, `lens` (INT-12), with two shapes. Migration `20261104110000_lens_wall.sql`. Covers INT-12, PRE-10, PRE-11, D1-05 and D1-06.

## The two shapes

**Seeding (PRE-10, PRE-11).** A self-paced step, `{ "seed": true, "recording": "https://..." }`. It opens in the pre-call and stays open until Day 1. People pick one of the five lenses and write present-tense sentences about the 10-year Future. Someone who missed the call sees the recording link and writes on their own phone. Close Pre-call does not close this step: a trigger on `sessions` (`private.lens_keep_seeding`), with `room_control` marking the part being closed, leaves it open.

A seeded sentence may run to 400 characters (November 5), whatever the step's `max_characters` says; `private.parse_lens` checks 400 for a seeding step and the phone counter matches (`sentenceCap`). The live lens wall keeps the step's own limit, at most 280.

**The lens wall (D1-05, D1-06).** A live step, `{ "lens": 1..5, "ai": true }`. Several sentences per person. When the step goes on air the lens opens: the seeded sentences arrive on the TV first, then new sentences land live. Live AI clusters them.

## Seeds stay hidden, for everyone

The words of a seeded sentence live only in `private.lens_sentences`. The submission row holds the placeholder "Hidden until Day 1", so every existing reader (the TV, phones, the control surface, the remote, exports, the recap, realtime messages) is safe without change. The author's own phone shows that the sentence is waiting, never the words.

The facilitator sees counts only, through `lens_seed_counts` (route `/api/control/[id]/lens`), shown under Self-paced.

A lens opens when its step goes on air (`private.lens_on_air`, a trigger on `room_states.live_session_id`). It never opens in a rehearsal, and Clear test answers leaves real seeds alone.

## Live clustering

The lens wall is a lens version of `group-wall`: job `group_lens`, prompt `group-lens@1` (`lib/ai/prompts.ts`), Riverside fixtures in `tests/fixtures/ai/live.json`. The same pipeline as step 5 runs it: `ai_claim`, the model call, `ai_apply` under the merge limits, which are code and not prompt. Rename, undo, pin and AI off work as on the wall. The control surface and the remote reuse the AI group rows. AI is never in the path from phone to TV: a sentence is stored and broadcast first, and clusters arrive after.

The prompt gets the lens name from the engagement, the horizon "10-year Future" and the year from the engagement's base year plus ten.

## The TV

`LensBoard` shows the lens heading (icon and the engagement's name for the lens), the sentence feed and the clusters. Every cluster uses the one group color. A new cluster's sentences drift to it (ghost copies, 40 ms apart, the first twelve). Cluster labels grow from the floor size at one sentence to the main size at six.

## Reading clusters (step 2b)

`private.lens_wall_read(engagement, lens)` returns the standing clusters with their sentences, for the live lens summaries. It is granted to `service_role` only.

## Tests

- `supabase/tests/database/lens_wall.test.sql`: hidden seeds in every reader, Close Pre-call, rehearsal, opening order, the AI path.
- `tests/unit/lens-wall.test.ts`: the prompt, the helpers and the kind registry.
- `npm run test:lens-wall`: a paired TV and 50 simulated phones with AI slow. It checks the one-second rule, that no row jumps, and that the TV matches the server. Screenshots go to `KIT_SHOTS`.
