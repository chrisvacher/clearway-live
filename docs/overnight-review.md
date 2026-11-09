# The overnight drafts and review

Milestone 5, step 2 builds OVN-01 (the overnight draft), OVN-02 (the two-facilitator review) and OVN-03 (Publish), from the approved pass 5 designs and the PRD's "Overnight review and the read-back". The 10-year Future is not drafted overnight: it was signed off live on Day 1. The job tidies the provisional Vision Outcomes and the 3-year Vision first pass.

## Who sees what

| Who | Reads | Writes |
| --- | --- | --- |
| The lead and co-facilitators of the engagement, on a laptop | The drafts, sources, versions, locks, and speaker names on scribe cards (through `scribe_speakers`) | Edit, restore, remove, add a source, mark reviewed, acknowledge a thin outcome, start or hand over the draft |
| The lead only | The same | Publish and Unpublish |
| Participants, TVs, scribes, anon, people from another engagement | Nothing | Nothing |

Review is on the laptop only. The remote shows "Drafts ready" and no link. Nothing from a draft reaches the TV or any phone before it is published, and publishing is not a TV event: step 3's read-back reads the snapshot.

## The job (OVN-01)

Closing Day 1 (`close_part`) opens an `overnight_rounds` row through a trigger on `private.room_controls`, and the control route kicks the worker. The worker follows the same shape as the live AI jobs: `overnight_claim` (a lease), the model call, then `overnight_apply` or `overnight_fail`, with every run in `private.ai_runs` (`session_id` is empty for this engagement-level job).

- Prompt: `overnightPrompt` in `lib/ai/prompts.ts`, version `overnight-draft@1`, with the Riverside fixture in `tests/fixtures/ai/overnight.json`. Prompts never invent content and never name people.
- Model: `CLEARWAY_AI_MODEL_DEEP`, which reads the easel photos as images. Photos with typed words are sent as text. A photo that cannot be read is reported, and a facilitator types what it says.
- The model is given text, counts and images under short refs (`o1`, `o1b1`, `c1`, `p1`). It is never given attendee identity, a card's speaker, or a card's owner.
- What is kept from the reply: each bullet needs a source; a number in a bullet must appear in a scribe card or an easel photo; voices and tensions must be word for word from the cards they cite (quotes and decisions for voices, tensions and questions for tensions) and are kept apart. A bullet resting on one room bullet may keep the room's exact words.
- Thin outcomes (no bullets) are flagged and must be acknowledged or written before Publish.
- Retry: a pause of 30 seconds times the attempt, three attempts, then the round is `failed` and the facilitators write the draft by hand.
- Ready within 30 minutes: the review screen shows the clock, says so when it is slower, and offers "Write it by hand instead" at any time.

## The review (OVN-02)

`/control/[id]/review`. The overview lists each outcome with its status; an outcome opens with its bullets, source marks, the sources panel, voices not to lose, tensions the room named, and the room's bullets not yet used.

- Locks: editing takes a lock (`review_presence` with `editing`), kept alive by a heartbeat every 12 seconds and expired after 40. The other facilitator reads the outcome and cannot change it. State is read every 3 seconds.
- Concurrency: every draft has a `revision`; a stale edit is refused with a plain message.
- Restore the room's words: one action returns a bullet to the room's own wording when it rests on one room bullet.
- Version history: every version is kept (`draft_versions` is append-only, enforced by a trigger). Restoring a version makes a new one.
The version note written when the tidy lands reads "Tidied from 9 bullets, 16 scribe cards and 1 easel photo": the singular for one (`private.ov_count`, migration `20261109040000_overnight_setup_reset.sql`).
- "Drafts ready" shows on the review screen, the control surface and the remote.

## Publish (OVN-03)

Lead only, idempotent by a client-made id. It needs every outcome reviewed and every thin outcome acknowledged, and nobody editing. It writes a snapshot to `overnight_publications`. Step 3's read-back reads it with `overnight_published` (facilitators). Unpublish is lead only.

## Files

- Migration: `supabase/migrations/20261104150000_overnight_review.sql`. Tests: `supabase/tests/database/overnight_review.test.sql`, `tests/unit/overnight.test.ts`, `tests/browser/overnight.ts` (`npm run test:overnight`).
- Code: `lib/ai/overnight.ts`, `lib/ai/prompts.ts`, `lib/ai/fake.ts`, `lib/overnight/*`, `app/api/overnight/[id]`, `components/overnight/*`.

## Documents and requirements to update

- `docs/milestone-5-brief.md`: mark step 2 built; the Defaults below.
- PRD "Overnight review and the read-back": the 10-year Future is not drafted overnight; the publish snapshot is the read-back's source.
- `docs/ai-live.md`: add the overnight job, its prompt version and the deeper model.

## Defaults for Chris

- Only the lead publishes; co-facilitators review and edit.
- Reviewed means one facilitator marked the outcome; a lock never blocks Publish for a holder who has left (40 second expiry).
- `reset_practice_room` does not yet clear the overnight tables.
