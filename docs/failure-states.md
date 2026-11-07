# Failure states and the test kit

Milestone 2, PR 7 proves the failure states (FAIL-01 to FAIL-06, FAIL-08 and FAIL-10), adds the latency report behind the acceptance test, the load script, and the written practice-room script (`practice-room-script.md`). The failure screens themselves were built in steps 3 to 6; this step breaks each one on purpose in real browsers and fixes what the breaking found.

## Where each failure state lives

| Screen | What happens | Built in | Proven by |
| --- | --- | --- | --- |
| FAIL-01 Venue wifi drops: phones | Input still works, each unsent answer says "Saved on this phone", the header says Offline, and answers send in the order written with no duplicates | Step 5 | Browser kit |
| FAIL-02 The TV loses its connection | The TV keeps its last screen with the Reconnecting mark. After 12 seconds silent it drops out of confirmation, the control surface warns and offers Show the TV view on phones, and the TV catches up within 3 seconds of the network returning, without reloading | Steps 3 and 4 | Browser kit |
| FAIL-03 The scribe goes offline | The console and the scribe's phone keep capturing. Each card says "Saved on this laptop" (or phone) and its place in the send order, and everything sends in order with no duplicates when the connection returns. Easel photos wait on the device too | Milestone 5, step 1 | Browser kit (`test:scribe`), `tests/unit/scribe.test.ts` |
| FAIL-04 The TV's browser is closed | Reopening /tv resumes the current session without pairing again | Step 3 | Browser kit, `test:tv` |
| FAIL-05 The facilitator's laptop dies | The remote runs every control with the laptop closed | Step 4 | Browser kit |
| FAIL-06 The remote and the TV disagree | The TV wins. The remote shows Syncing after 2 seconds and the control surface a quiet warning, then both correct | Step 4 | Browser kit |
| FAIL-08 A phone dies | The person signs in by email code on another phone and sees their own answers, with a one-time line saying so | Step 5 | Browser kit |
| FAIL-10 The tech fails completely | The run of show and prompts print from the control surface, with "If the tech fails" | Step 2 | Browser kit |

The browser kit also proves Refresh phones reloads every phone and never the TV, and that a screen on a network that blocks live connections keeps up from snapshots.

## What the breaking found and fixed

- **A TV could sit on a retired channel.** The room's private channel rotates when people join or a facilitator signs in. If that happened between the TV's first read and its completed join, the TV missed the rotation notice and stayed on the old channel, catching up only through 5-second snapshots: every screen agreed, but answers took up to 5 seconds to land. The stream now compares each snapshot's topic with the one it joined and moves to the current channel. A unit test reproduces the race.
- **Answers delivered by a catch-up snapshot were missing from the latency log.** The TV now records a receipt for every new answer a snapshot brings in the session already on screen, at the time the snapshot arrived. The first frame after opening, and another session's existing answers, are not counted.
- **Fallback mode is not a disconnect.** On a network that blocks live connections, the TV updates every 1.5 seconds; it no longer shows the Reconnecting mark the whole time. The control surface keeps its quiet Fallback mode note.

## The latency report

`/control/[engagement]/latency` (facilitators of that engagement and Clearway admins only), linked from the control surface's Room panel, reads the latency log for a window (the last 12 hours by default, at most 7 days):

- How many answers reached the TV in under one second, against the target of 95 in 100.
- Phone to TV: median, 95th and 99th percentiles, slowest. Phone to server and server to TV at the 95th.
- Answers saved offline and sent later are reported apart, not counted: their wait is the network. Answers no TV received are counted.
- Each answer counts once, at its slowest paired TV, because the room sees it only when every screen shows it.
- Clock uncertainty: the widest combined phone and TV estimate.
- The same figures per session.

`public.latency_report` checks the role in the database. Phones, TVs and other rooms' facilitators are denied.

## The load script

`npm run load -- --origin <url>` joins simulated phones to the practice room by name, through the real app endpoints, and sends answers in bursts, then prints the report (with `LOAD_REPORT_COOKIE`) or a link to it. A burst means phones out, as in the PRD: every phone sends one answer at a random moment within `--spread` seconds (default 10). `--spread 0` is the extreme, every phone pressing Send in the same instant. It needs a paired TV and a live word cloud or wall session in the practice room, allowing at least as many answers as bursts. Practice guests it creates are cleared by Reset practice room.

On loopback, 50 phones in three 10-second bursts: 150 of 150 under one second, 95th 114 ms. The spike of 50 in the same instant reached 90% (95th 1,046 ms on one run, 1,238 ms on another): each answer holds the room lock for about 15 to 20 ms while it is stored, counted and broadcast, so the last of 50 simultaneous answers waits about a second. CI reports the spike without failing on it.

## Tests

- `npm run test:browser`: the failure kit, in Chromium against the production build and the local stack, with a local mailbox standing in for email.
- `npm run test:load`: a headless TV paired to the practice room, 50 simulated phones in three bursts (gated at 95 in 100) and one spike (reported).
- `supabase/tests/database/latency_report.test.sql`: who may read the report, the slowest screen deciding, queued and missing answers, percentiles, uncertainty and per-session figures.
- Unit tests: the rotated-channel race, catch-up receipts, the report's verdict, window and percentiles.

These are not venue acceptance. Chris's practice-room run, on venue wifi and real devices, is.

## After Reset practice room or Nothing live

The TV follows a reset like any other room change (a room version, with the snapshot every 5 seconds as the fallback). Once nothing is live and the scene has faded to the waiting screen, the TV also puts away the old session's last picture (`SessionLayers`): a screen that missed or stalled the fade can no longer sit on the old read-back's words until the page is reloaded, and the old view's timers stop. A step that goes live again starts a layer afresh.
