# Handover, commander's intent and follow-up access

Milestone 4, step 6 (D2-11 to D2-14, INT-16). Migration: `supabase/migrations/20261104140000_handover_intent.sql`. Database tests: `supabase/tests/database/handover_intent.test.sql`. Browser kit: `npm run test:handover-intent`.

## The remote changing hands

- The lead or co-facilitator names one person from the team and hands over the remote for a block. The block is the run of consecutive commander's intent and sign steps around the live step, or the steps named when a follow-up is issued.
- The team remote shows the block's steps, Go live, Next, Back, Phones down, Open phones, and for the intent step Pair everyone, Clear pairs and Present. It never shows the alignment signal, presenter notes, Discover data or any step outside the block. The database refuses everything else (`private.room_control`, `private.remote_actor`), so a hidden button is not the only guard.
- The lead's remote shows who holds it. Take it back changes only who holds the remote: the live step, spotlight and hidden items stay as they are. The remote returns to the lead on its own when the live step leaves the block.

## Commander's intent (INT-16)

- TV cards (November 5): the intent wraps to up to three lines at Medium, then an ellipsis, always above the progress bar; a crowded card tightens (one-line title, closer rows) to give the intent its lines. The default size's larger type may show fewer lines.

- One card for each confirmed Vision Outcome: commander's intent, the must-do, what we'll stop, and the next 30 days (first steps with an owner and a date).
- Pairs of up to three work a card, set from the remote or picked on phones (the step's `assign` option). One person types in a line at a time; a lock frees after three idle seconds (`cwl-dur-field-lock`).
- Every change goes to the TV as it is typed. Typing grows a line in place; a rewrite crossfades over `cwl-dur-line-replace`.
- A first step with no owner or no date is flagged on the TV and the phone. The rule lives in `private.first_step_flags` and `stepMissing` in `lib/interactions/intent.ts`.
- Affirm together fills the sign step's text from the cards (`intent_control` with `affirm_text`) and reuses sign together (INT-10).
- Names never show on the TV: a first step shows "Owner set", not who. Pairs show as first names on phones and the control surface only.

## Follow-up access (Chris's November 3 decision)

- The lead issues a link and a code for the follow-up block only. The link names the access; the code, five letters and four numbers, proves the person. Neither is stored, only their hashes. The link can be emailed; the code is told in person.
- The window opens an hour before the first step and ends two hours after the last. The lead can extend it by an hour, reissue it or revoke it. Three wrong codes lock the link for ten minutes.
- The team facilitator opens `/f/<token>` on a phone to take the remote, and `/f/<token>/tv` on the computer shared in the video call to pair the TV view. No Clearway sign-in. A grant, held in an HttpOnly cookie, carries every later call.
- When the access ends or is revoked, the remote returns to the lead and the TV view stops being a TV.

## Defaults for Chris

1. The credential is a 9 character code plus a link; the link is emailed, the code is told in person.
2. A block is the consecutive intent and sign steps around the live step, or the steps chosen when the follow-up is issued.
3. A pair is one to three people per card; a person holds one card at a time.
4. A line locks for three seconds after the last keystroke.
5. The follow-up window defaults to an hour before the first step and two hours after the last.
6. Taking the remote back leaves it with the lead until the lead hands it back.
