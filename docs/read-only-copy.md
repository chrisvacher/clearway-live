# Day 2 close, share links and the read-only copy (AFT-03)

Milestone 7, step 4. Migration `supabase/migrations/20261108040000_read_only.sql`.

## Day 2 close

`engagements.day2_closed_at` is set when the last retreat part closes. A trigger on `private.room_controls` (`private.retreat_day2_closed`), beside the Day 1 one, fires after a `close_part` row when that same call closed a Day 2 step (one whose `closed_at` is not before the transaction began) and none is left live, phones down or open (and no self-paced step is open). Closing Day 1 or another part while a Day 2 step happens to be closed already does not close the retreat. Neither does a rehearsal on a real engagement (`private.rehearsing` is set). Draft steps that were never run do not block. The half day of a day-and-a-half retreat is also part `Day 2`.

`close_part` logs nothing when every step is already closed, so the trigger cannot fire then. Mark the retreat closed on the After hub covers that case. It is open to the lead and a co-facilitator, asks inside the panel, and has Undo. It is allowed once the engagement is in Retreat or Follow-up status or its retreat start date has come (practice rooms always); before that it says why (`too_early`).

`private.retreat_close(engagement, at)` sets `day2_closed_at` once and then calls `private.check_in_make_rounds(engagement, private.retreat_closed_on(engagement))`. Step 2's status trigger (`check_in_after_status`) is gone. Rounds that already exist are left alone.

`private.retreat_closed_on(engagement)` is null until Day 2 closes, then the retreat end date if set, else the date Day 2 closed in the church's time zone (`churches.timezone`). `check_in_latest_for_view` gives each answer's day in that zone too.

Undo (`private.retreat_reopen`) is allowed for one hour after the close and only before any check-in round has been sent or has recipients. It deletes only the scheduled rounds that close made (`check_in_rounds.made_by_close`), never a round made by hand, switched off, or from before, and clears `day2_closed_at`.

## Share links

`private.read_only_links` holds a name, the SHA-256 of the token, who made and who revoked it, and the open count and last opened time. No browser role can read it (forced RLS, service_role only). A token is 24 random bytes in base64url, returned once; only its hash is stored. There is no limit on links.

Facilitator functions (lead or co-facilitator of that engagement, `security definer` in `private`, `security invoker` wrappers in `public`): `share_state`, `share_link_create`, `share_link_revoke`, `retreat_mark_closed`, `retreat_reopen`.

Pages: `/control/[id]/share` (before the close it says "Available once Day 2 closes" and offers Mark the retreat closed; after it, Make a link, the link shown once with Copy, each link's name, who made it, when, opens and last opened, state, and Revoke asked inside the panel). The After hub's Share tile links there with the real status, and fails quietly before the migration.

## The public page

`/v/[token]`, no sign-in, no inputs, one Print button, `noindex`, `referrer-policy: no-referrer`, `Cache-Control: private, no-store`. The data comes from `read_only_view(hash)`, granted to service_role only, which records the open and returns one payload.

Shows: church and engagement name, the Clearway Map, the Vision Outcomes with indicators, the 1-year goals with owners, end dates and the newest owner-reported status (label and date only), the commander's intent cards with first steps (owner and date), and the signed-off report as reading text without source marks. Until a report is signed off the page says it will appear once signed off. An edit after sign-off stays off until the report is signed off again.

Never in the payload: submissions, scribe cards, drafts, sources, signals, emails, check-in notes, attendee ids. The Map's Key Issues keep only risks, so scribe tensions and questions are dropped.

An unknown token, a revoked link, a closed engagement, or a link used before Day 2 closes all give the same plain "This link isn't available" page.

## Defaults chosen

- Day 2 counts as closed when no step is open; drafts do not block.
- The close date uses the church's time zone.
- Undo: one hour, and only before any check-in goes out; it takes away only the rounds that close made.
- Any number of named links per engagement.
- The Map omits scribe tensions and questions; every 1-year goal (not only those that meet CORE) appears once, under its outcome, with an empty owner or date shown as empty. Provisional outcomes carry a "Provisional" tag. A Map field with nothing in it (mission, purpose, values, strategy, a lens not signed off, metrics, celebrations, rhythms, issues) is left out of the copy: the setup prompts ("Add it in setup") are for the facilitator's own views.
- The report shows the sign-off date, not the signer's name.

## Reset

`reset_practice_room` and `rehearsal_control` (clear) delete the practice engagement's links and reset `day2_closed_at`.

## Tests

- `supabase/tests/database/read_only.test.sql`: structure, the Day 2 trigger, the half day, church-zone dates, Day 1 and rehearsal closes that must not close the retreat, every role (lead, co-facilitator, other engagement's facilitator, participant, scribe, team facilitator, TV, anon), payload exclusions, revoke, closed engagement, undo, rounds, reset.
- `tests/browser/read-only.ts` (`npm run test:read-only`).

## Existing engagements

The migration sets `day2_closed_at` for engagements already in follow-up with a retreat end date, so their Share and Check-ins pages work. Others stay open until their Day 2 closes.

If the page cannot read its data (a failed call or a missing setting), it shows the plain unavailable page and logs an error code, never the token.

**Overnight acceptance fix (November 9).** The Share page names the button as it reads, Close Day 2. A day and a half closes the same way, because its half day is Day 2.
