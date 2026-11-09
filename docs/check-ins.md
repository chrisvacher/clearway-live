# Check-ins (milestone 7, step 2)

At 30, 60 and 90 days after the retreat, each owner gets one email with a link to a short check-in on their own first steps and goals. The facilitator reads the answers, follows up on stuck steps and sees who has not answered. Screens: AFT-04 (the email and the phone page) and AFT-05 (the results page). Nothing here reads, writes or links to CORE, and no CORE status is shown anywhere.

## What it asks

- For each of the person's own first steps: Done, Under way or Stuck, and an optional note ("What would help?" when Stuck).
- For each of their own goals: Not started, On track, At risk, Off track or Done, and "What would help?".
- One optional "Anything else that would help?" at the end.

Labels and icons carry every status. The phone shows no Warning or Error colors.

## Who gets an email

Decided November 7: each owner of a first step, plus each goal owner who owns no first step, one email per person per round, listing only their own first steps and goals. Owners are worked out when the round is sent, so an owner changed before then is the one emailed. An attendee owner gives the attendee's own name and email. Otherwise the step or goal's owner name and email are used. The grouping is `groupRecipients` in `lib/check-ins/policy.ts`. The database checks every item it is given belongs to that person as the records have it now (`check_in_round_save`).

Each recipient keeps a snapshot of their items (`check_in_recipients.items`), so the email and the phone page agree even if the plan is edited later.

## Rounds

- Made when Day 2 closes, by `private.retreat_close` (called from the Day 2 trigger on `private.room_controls` and from Mark the retreat closed), which calls `private.check_in_make_rounds(engagement, base)` with `private.retreat_closed_on(engagement)`: the retreat end date if set, else the date Day 2 closed in the church's time zone. See `docs/read-only-copy.md`.
- Or made by hand from the results page (Create check-ins), which asks for the retreat end date when the contract gives none.
- Due 30, 60 and 90 days after that date. Only wayfinding, day-and-a-half and practice engagements have check-ins.
- Status: `scheduled`, `sending`, `sent`, `off`. The facilitator can switch the unsent rounds off and on, and press Send now on a round (asked inside the panel; for a real engagement it says it emails real people).
- A round is skipped once any later round of the engagement is `sending` or `sent`, because its link would be read-only from the start. `private.check_in_superseded(round)` is that rule. The daily run puts such a round away (`off`) in `check_in_claim_due`, `check_in_round_begin` and `check_in_send_guard` refuse it (status `superseded`), and Switch check-ins on leaves it `off`. It covers a base date in the past (only the latest due round goes out, the earlier ones are put away), a run missed for days, and Send now on a later round while an earlier one is scheduled.
- The results page says Skipped for such a round and Switched off for one the facilitator switched off, and never "Goes out" for an `off` round. It offers Switch check-ins on only when `can_switch_on` is true, meaning switching on would schedule at least one round.

## The scheduled run

`vercel.json` has `"crons": [{"path": "/api/cron/check-ins", "schedule": "7 13 * * *"}]`, which is 8:07 am in standard time and 9:07 am in daylight time, so the page says each check-in goes out in the morning around 8 or 9 am Eastern. `GET /api/cron/check-ins`:

1. Returns 401, and sends nothing, without `Authorization: Bearer ${CRON_SECRET}`, or if `CRON_SECRET` is not set.
2. Claims every due round (`check_in_claim_due`), then for each: begins it (`check_in_round_begin`), saves its people with a token hash each (`check_in_round_save`), sends one email each with `sendEmail` using the recipient id as the idempotency key, records the result and finishes.
3. Never emails an address ending in `.example`, `.invalid` or `.test` (recorded as `practice_address`), and never emails anyone from the practice room.
4. Running twice the same day sends nothing new: a sent round is not claimed again, and a round held by another run is busy for ten minutes (after that a run that stopped half way is resumed, skipping people who already have a result).

The email's body comes from the round's snapshot (`check_in_rounds.snapshot`: the church's name and the next check-in's date), taken once at the first `check_in_round_begin` and reused when a send resumes or is retried, together with each recipient's stored items and name. A resumed send therefore makes the identical email as the first attempt, which matters because Resend answers 409 to the same idempotency key with different content within 24 hours. The idempotency key is the recipient id.

A person's link is `/c/` plus a token made from their recipient id and the server's secret, so a resumed send makes the same link again. The database stores only the token's hash. If the app's service key changes between a send and its resume the link would differ, so rotate that key with no round in the sending state.

`CLEARWAY_NOW` (an ISO date) sets the clock for tests, and is ignored when `VERCEL_ENV` is `production`.

## The phone page `/c/[token]`

Public, no sign-in, `noindex`, and `middleware.ts` does not cover it. It shows only the owner's own first steps and goals. Each tap saves through `POST /api/check-in`. A person counts as answered (`answered_at`) only when they press Send my check-in, which saves with kind `finish` after their answers (it needs at least one answer). Until then partial answers are kept, the person still shows under who has not answered, and reopening the link continues at the first question left. The page records that it was opened with kind `open`, a small POST from the page after it loads, so an email scanner that only fetches the page does not count as an open (`opened_at` is never set by the server render). A save that cannot reach the server waits in the phone's own storage ("Saved on this phone") and is sent when the signal is back. A round's answers can be changed until the next round is sent, then the link shows the answers read-only and points to the newest email. When the engagement is closed the page says the check-ins have stopped. A save is the same save twice, so replaying the queue changes nothing.

## The results page `/control/[id]/check-ins`

Facilitators only (the lead and co-facilitators). Each round with its due date, status, sent and answered counts. Every step's answer and note, goals by status, stuck steps and goals at risk or off track as follow-ups (Mark followed up, and Clear the follow-up to undo it), who has not answered, progress against the earlier round at 60 and 90 days, Send now, Switch off, Download CSV. A practice-address row offers Open as this person (the server mints a fresh token for that row and opens its phone page). A changed answer clears its follow-up mark.

## The contract for the read-only copy

`private.check_in_latest_for_view(engagement)` returns `(goal_id, status, answered_on)`: each goal's newest owner-reported status (label and date, never the note). Service role only.

## Environment variables

- `CRON_SECRET` (Production): a long random string. Vercel sends it as the Bearer token on cron calls.
- Already needed: `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`), `SUPABASE_URL`, `APP_ORIGIN`, `RESEND_API_KEY`, `EMAIL_FROM` (or `RESEND_FROM_EMAIL`).

## Tests

`supabase/tests/database/check_ins.test.sql` (roles, rounds, send, phone, practice reset), `tests/unit/check-ins.test.ts` (email, grouping, clock, CSV), `npm run test:check-ins` (the browser kit, with the harness mailbox as Resend).

## Overnight acceptance fixes, batch c (November 9)

Migration `supabase/migrations/20261109030000_overnight_after_privacy.sql`.

- **No emails in the facilitator's results.** `check_in_state` (and `GET /api/control/<id>/check-ins`) no longer carries an owner's email: a recipient is its id, name, send result, times, the practice flag and answers. A name that is only the email is shown as "Unnamed owner". The CSV and Open as this person need no email and work as before. Test: `check_ins.test.sql`.
- **Dates in the church's time zone.** The state, and the phone page read, now carry `timezone`; "sent" dates use `dayInZone` (`lib/check-ins/policy.ts`), so a send at 10:30 PM on November 8 Eastern reads November 8. Test: `tests/unit/check-ins.test.ts`.
