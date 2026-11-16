# Live controls: control surface and remote

Milestone 2, PR 4 implements FAC-01 at `/control/[engagement]` and FAC-03 at `/remote/[engagement]`, built from the approved pass 2 boards. Both are the control surface: a current Clearway facilitator session and engagement assignment are required. They send the same presses and change nothing locally.

## One press, one version

Every control is one call to `room_control`, made through `POST /api/control/[engagement]`. The database takes the room lock, checks the facilitator, decides the change and updates the room once, so each press raises the room version once and sends one verified broadcast. Each press carries a client-made id and the session it acted on (`from`). A repeated id does nothing. A press made against a room that has already moved is refused with `moved`, naming where the room is and who moved it, so two remotes pressing Next together move the room once.

Controls: Go live, Next, Back, Nothing live, Stop answers, Take answers, Start burst (3, 4 or 5 minutes), Extend 1 min, End burst, Phones down, Open phones, Spotlight, Clear spotlight, Hide, Unhide, Refresh phones, Show the TV view on phones, Room size and Close a part (Pre-call, Day 1, Day 2, Follow-up). Refresh phones and closing a part need a second tap within 3 seconds.

## Steps stay open until they are ended (decided November 16)

This replaces the November 1 rule that a step closed when the room left its segment. It applies to every engagement, Wayfinding included. Migration: `supabase/migrations/20261116150000_steps_stay_open.sql`. Tests: `supabase/tests/database/steps_stay_open.test.sql` and `npm run test:steps-stay-open`.

1. **Next, Back, Go live, Home and the TV screens only change what the TV shows.** The step left behind becomes `open` and keeps taking answers. Nothing closes a step except End workshop, Close part (Close day, still the Wayfinding boundary), or Stop answers on that step.
2. **Anyone can go back.** Any earlier step sent to the TV is live and answering, not read-only. Phones look back with Earlier and answer or change any step still open.
3. **Stop answers / Take answers** is one toggle in the step controls (and on the remote), for the live step. `room_control` also takes a `session` to stop or open an earlier step by name. A stopped step stays stopped when it comes back to the TV, until Take answers. The phone says "Answers for this step are finished." The TV shows the step with no Closed marker beside the mark, in both skins.
4. `sessions.closed_by` says why a step is closed: `stop`, `part` or `end`. It clears whenever the step leaves closed.

Phones down and bursts lock only the step on the TV. Closing a part closes its open steps and, if one is on the TV, goes to the holding screen. Answers queued offline before a close or a stop keep the 2-minute grace window. The old Reopen press still works for an open remote during the deploy; it does what Take answers does on the live step.

The run of show shows three states for each step: not yet (Ready or Draft), open with its answer count, and stopped. The counts come from `control_status` (`step_answers`).

## Start fresh and Reopen workshop (November 16)

**Start fresh** (Room admin) is one action, two taps, refused while a step is live. It deletes every answer, vote and AI or What We Heard state in the engagement, puts every step back to Ready, clears the timer and reloads every phone. TV pairings and phone sign-ins stay. Export answers (every step as CSV) sits beside it. It runs through the same chain as Rehearsal's Clear test answers: everything answered is marked as a test answer and cleared, so each feature's own clean-up applies. It is logged in the rehearsal log with `fresh`, and Room admin's Rehearsal panel shows "Started fresh" with who and when. The practice room keeps Reset practice room instead (`start_fresh` refuses it with `practice`). Database: `private.start_fresh`.

**Reopen workshop** (the live room's Workshop ended chip) sets the engagement back to setup, and the database reopens exactly the steps End workshop closed (`closed_by='end'`, `private.reopen_ended_steps`). Steps stopped by hand or closed with their part stay closed; steps never shown stay Ready. Phones sign in again. Steps closed before November 16 in a team workshop are labelled as closed by End, so a workshop that was ended under the old rule reopens whole.

## Spotlight and hide

Items are addressed by key: a wall answer's id, or a word-cloud word's normalized key. Hidden wall answers keep `submissions.hidden`; hidden words are stored per session in `sessions.hidden_keys`, so Back and Reopen bring them back hidden. Shared results, snapshots and answer patches leave hidden items out; the facilitator's item list keeps them, muted, with Unhide. Hiding a spotlit item clears the spotlight; changing the shown session clears it too.

## Bursts end on the server

`burst_ends_at` uses the database clock. At the end time the TV, and any open control surface or remote, call `live_tick`; the database ends the burst only if its own clock agrees, so an early or repeated tick changes nothing. The TV is always in the room, so this works with the laptop closed and the remote locked.

## What the TV confirmed

The remote and the control surface render the mirror from the version every connected TV has confirmed, keeping recent room states in memory. A TV whose heartbeat is older than 12 seconds drops out, so one dead screen cannot hold the room in Syncing. After 2 seconds without confirmation the remote shows Syncing and FAC-01 shows a quiet Warning. With no TV connected the remote says so and every control still works. After 12 seconds without connecting, both offer Reload and say the room is fine.

## Private boundaries

`control_status` (facilitators only) returns paired TVs and their confirmed versions, counts, the latency 95th percentile, the shown session's items including hidden ones, and recent presses with first names. Private notices travel on `fac:<engagement>:<generation>`, which rotates with the room's channel and admits only a current assigned facilitator: TV confirmations (`ack`) and presses (`control`). They are hints; status is polled every 3 seconds as the authority. The shared room event never carries an actor, notes, depth, planning fields, previews or identities. Preview is local to the device previewing.

## Verification

`supabase test db` runs `live_controls.test.sql` (roles, idempotency, moved presses, steps staying open, Stop and Take answers, late answers, grace, bursts, hide and spotlight, Close a part, room-wide controls, ticks and private status) and `steps_stay_open.test.sql` (Next never closes, Back is live and answering, a phone answering an earlier step, Stop and Take answers, Start fresh keeping the TV and phones, End and Reopen, and the ended TV window). `npm run test:controls` runs native loopback Auth, Postgres and private Realtime with two facilitators, a TV and a phone: private notices, TV confirmation, simultaneous remotes, segment late answers, a server burst end, word hiding and assignment revocation. Unit and HTTP smoke tests cover press validation, confirmation, Syncing, navigation and the protected routes. These are not venue acceptance; the practice-room checks remain Chris's milestone 2 acceptance.
