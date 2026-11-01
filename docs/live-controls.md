# Live controls: control surface and remote

Milestone 2, PR 4 implements FAC-01 at `/control/[engagement]` and FAC-03 at `/remote/[engagement]`, built from the approved pass 2 boards. Both are the control surface: a current Clearway facilitator session and engagement assignment are required. They send the same presses and change nothing locally.

## One press, one version

Every control is one call to `room_control`, made through `POST /api/control/[engagement]`. The database takes the room lock, checks the facilitator, decides the change and updates the room once, so each press raises the room version once and sends one verified broadcast. Each press carries a client-made id and the session it acted on (`from`). A repeated id does nothing. A press made against a room that has already moved is refused with `moved`, naming where the room is and who moved it, so two remotes pressing Next together move the room once.

Controls: Go live, Next, Back, Nothing live, Reopen, Start burst (3, 4 or 5 minutes), Extend 1 min, End burst, Phones down, Open phones, Spotlight, Clear spotlight, Hide, Unhide, Refresh phones, Show the TV view on phones, Room size and Close a part (Pre-call, Day 1, Day 2, Follow-up). Refresh phones and closing a part need a second tap within 3 seconds.

## Late answers and segments (decided November 1)

A session's optional **Segment** (for example "Five Lenses") groups steps that belong together. Leaving a step leaves it `open`, so phones that look back can still answer it while the room is in its segment. Phones down and bursts lock only the step on the TV. Going live on a step outside the segment closes every step in it; a step with no segment closes when the room moves on. Nothing live is a break and closes nothing. Closing a part closes its open steps and, if one is on the TV, goes to the holding screen. Answers queued offline before a close keep the 2-minute grace window. Back to a closed step shows it read-only until Reopen.

## Spotlight and hide

Items are addressed by key: a wall answer's id, or a word-cloud word's normalized key. Hidden wall answers keep `submissions.hidden`; hidden words are stored per session in `sessions.hidden_keys`, so Back and Reopen bring them back hidden. Shared results, snapshots and answer patches leave hidden items out; the facilitator's item list keeps them, muted, with Unhide. Hiding a spotlit item clears the spotlight; changing the shown session clears it too.

## Bursts end on the server

`burst_ends_at` uses the database clock. At the end time the TV, and any open control surface or remote, call `live_tick`; the database ends the burst only if its own clock agrees, so an early or repeated tick changes nothing. The TV is always in the room, so this works with the laptop closed and the remote locked.

## What the TV confirmed

The remote and the control surface render the mirror from the version every connected TV has confirmed, keeping recent room states in memory. A TV whose heartbeat is older than 12 seconds drops out, so one dead screen cannot hold the room in Syncing. After 2 seconds without confirmation the remote shows Syncing and FAC-01 shows a quiet Warning. With no TV connected the remote says so and every control still works. After 12 seconds without connecting, both offer Reload and say the room is fine.

## Private boundaries

`control_status` (facilitators only) returns paired TVs and their confirmed versions, counts, the latency 95th percentile, the shown session's items including hidden ones, and recent presses with first names. Private notices travel on `fac:<engagement>:<generation>`, which rotates with the room's channel and admits only a current assigned facilitator: TV confirmations (`ack`) and presses (`control`). They are hints; status is polled every 3 seconds as the authority. The shared room event never carries an actor, notes, depth, planning fields, previews or identities. Preview is local to the device previewing.

## Verification

`supabase test db` runs `live_controls.test.sql` (106 assertions: roles, idempotency, moved presses, segments, late answers, grace, bursts, hide and spotlight, Close a part, room-wide controls, ticks and private status). `npm run test:controls` runs native loopback Auth, Postgres and private Realtime with two facilitators, a TV and a phone: private notices, TV confirmation, simultaneous remotes, segment late answers, a server burst end, word hiding and assignment revocation. Unit and HTTP smoke tests cover press validation, confirmation, Syncing, navigation and the protected routes. These are not venue acceptance; the practice-room checks remain Chris's milestone 2 acceptance.
