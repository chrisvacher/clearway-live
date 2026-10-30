Codex brief: Clearway live app, milestone 2 (The live room)
Oct 29, 2026 · @Chris Vacher
This is the handoff for milestone 2, the live room. The PRD is the source of truth: Clearway App: Product Requirements. Read "The non-negotiable: the screen is alive", "Three surfaces, one room", "Surfaces", "Engagements, templates and the run of show", "The live room engine", "Data model" (The live room), "Design system" (Motion, How the TV shows popularity), "Non-functional requirements", "Test plan" and "Milestones, 2. The live room" before writing code. Where this brief and the PRD differ, the PRD wins. Raise a question rather than work around a decision.
Codex can't open claude.ai links. Save this brief in the repository as docs/milestone-2-brief.md, alongside docs/prd.md.
What milestone 2 delivers
The live room for one interaction, end to end: the TV paired on its own computer, the control surface and the remote, phones in a live session, a basic run of show with Go live, bursts and phones down, spotlight and hide, and a word cloud that follows the motion rules. It proves the riskiest promise in the product: under 1 second from phone to TV for 95 of every 100 submissions, with the remote and the TV never disagreeing.
Entry gate. Don't start until all three are true:
1. Milestone 1 has passed its practice-room test and is merged.
2. Chris has signed off the motion prototypes in the Clearway Live design system, on the TV computer in the practice room.
3. Claude Design's pass 2 is ready: TV themes, type scale and texture, motion tokens and prototypes, the remote, the facilitator view, wall card, word cloud, offline and reconnecting states, and the private-view treatment.
Screens: FAC-01 (without the alignment signal), FAC-03, FAC-04, SET-07 (basic run of show), D1-01, D1-02, D1-03, FAIL-01 to FAIL-06, FAIL-08 and FAIL-10.
Setup
Nothing new to create. Milestone 2 runs on the repository, Supabase project and Vercel project from milestone 1.
Item
What to do
Needs Chris
Realtime
Supabase Realtime broadcast on the clearway-live project, one channel per engagement

Design files
Copy the Clearway Live motion tokens, the motion prototypes and the ArrivalFlow, flip, arrive, leave and countTo helpers from bundle.js into design/clearway-live, alongside live_tokens.css
Exports the files from the design system
Load test
A script that simulates 50 phones submitting in bursts against a preview deployment and reports the latency log's percentiles

Error monitoring
Capture server and client errors, matching CORE's tool if it has one
Approves any new service
Test devices
Two iPhones, two Android phones, a laptop on HDMI to a TV, a laptop mirroring to a TV, and a video call to share the TV view in
Supplies the devices and the TV
Migrations
Each pull request's migration runs on its preview branch. It reaches the clearway-live project only after Chris merges the pull request
Merges
Work order
One pull request each, in this order. The engine comes first because every screen depends on it.
1. Room state and the realtime path. The room state row per engagement with its rising version, the one submission endpoint that validates, stores and broadcasts in the same step, the snapshot check every 5 seconds while live, the fallback to snapshots every 1 to 2 seconds when realtime is blocked, client-made submission ids, and the latency log. Tests prove ordering by version, no duplicates on resend, and reads that page past 1,000 rows.
2. Run of show (SET-07, basic). Sessions grouped by part, with title, planned start and length, mode, interaction, prompt, phone depth, settings, presenter notes and state. Saved edits reach the TV and phones within a second. The run of show and prompts print from the control surface (FAIL-10).
3. The TV page and pairing (FAC-04). One page that never reloads, the pairing code, pairing that survives the browser closing, more than one TV per engagement, screen wake lock, full screen on one key, the holding screen, room size, the screen check, the join screen with QR code and names arriving (D1-01), and the quiet "Reconnecting" mark.
4. Control surface (FAC-01) and remote (FAC-03). Go live, Next, Back, Nothing live, Reopen, Start burst (3, 4 or 5 minutes), extend or end a burst, Phones down and Open phones, Spotlight, Hide and Unhide, Refresh phones, Show the TV view on phones, room size and Preview. The remote shows what the TV has confirmed, and "Syncing" after 2 seconds without confirmation. Two remotes see each other's presses. The remote runs the room with the laptop closed. No alignment signal yet.
5. Phones in the live room. Every phone state in the PRD's phone table, following the room without running ahead, the quiet burst countdown, change and withdraw an answer, limits that hold Send, offline answers marked "Saved on this phone" and sent in order, and the 2-minute grace window after a close.
6. The word cloud and wall on the TV (D1-02, D1-03). Built from the Clearway Live components and motion tokens. Size follows the square root of the count, color steps Sky to Off-White to Sunrise for the leader, a new word shows Lime for a moment, and repeats swell while neighbours ease aside. Arrivals stagger with no answer held more than 1.5 seconds. Counts and word sizes are computed once on the server and broadcast. The word filter keeps profanity off the TV. Reduced motion on phones and as a TV setting.
7. Failure states and the test kit. FAIL-01 to FAIL-06, FAIL-08 and FAIL-10 as the PRD describes them, the load script's report, and the written practice-room script for Chris.
The live room rules
Every screen renders from one room state on the server, so the TV, the remote, the control surface and every phone always agree. Codex proposes the exact mechanism; the PRD's realtime path is the default, and the milestone 2 test decides whether it's good enough.
A submission is stored and broadcast in one step; the snapshot check corrects any screen that missed an event, by animating, never redrawing.
• One state, one version. The room state holds the live session, what the TV shows, phones down, the burst end, the spotlight and hidden items, the remote holder, TV view on phones, and a version that rises on every change. Clients apply versions in order. A client that misses one fetches a snapshot and animates to it, never redrawing.
• The TV wins. The remote shows what the TV has confirmed it is showing, not what the remote asked for.
• One source for counts. Results that need computing are computed once on the server and broadcast with the event.
• Gentle retries. Phones retry one at a time with back-off and jitter, so a slow server never gets a pile of requests.
• Motion. New items fade in where they land and what's there moves to make room. Bars animate from their previous value, never from zero. Nothing flashes, jumps or redraws. Exact durations and easing come from the Clearway Live motion tokens, not from the code.
Timing budget
Step
Budget
Phone tap to server accepted
Under 300 ms on venue wifi or 4G
Server to TV received
Under 300 ms
TV starts animating
Within one frame of receipt
Phone to TV, total
Under 1 second, 95 times in 100, with 50 phones submitting
Stagger hold
No answer held more than 1.5 seconds after receipt (replays after a reconnect exempt)
Go live to every phone moved
Under 1 second
Reconnect to current state
Under 3 seconds after the network returns
Data for this milestone
Add only what milestone 2 needs, from the PRD's data model. Row-level security on every table, created and updated times, and soft deletes, as in milestone 1. A TV session and a participant session can't read presenter notes or anything else facilitator-only, and a test proves it.
Entity
Holds
Links to
Session
Part, order, title, planned start and length, mode, interaction, prompt, phone depth, settings, presenter notes, state
Engagement
Room state
Live session, TV content, phones down, burst end, spotlight, hidden items, remote holder, TV view on phones, version
Engagement (one row)
TV pairing
Pairing code, paired time, last seen
Engagement
Submission
The answer, client-made id, queued, sent and received times, changed or withdrawn flags, hidden flag, test flag
Session, attendee
Latency log
Phone sent, server received, TV received
Submission
Acceptance criteria
From the PRD, milestone 2:
• With 10 real phones and a simulated 50, 95 of 100 submissions reach the TV in under 1 second, measured from the latency log.
• The remote, the TV and the control surface always show the same session and the same counts.
• The word cloud follows the motion rules: repeats swell, neighbours ease aside, nothing jumps, nothing redraws.
• With wifi switched off mid-burst, phones queue answers. On reconnect they arrive in order with no duplicates, and the TV never goes blank.
• Closing and reopening the TV browser resumes the current session without re-pairing.
• With the facilitator's laptop closed, the remote runs the session.
• The TV runs on a separate computer by HDMI and by screen mirroring, with no connection to the facilitator's laptop, and as a shared screen in a video call.
• Refresh phones reloads every phone and never the TV. Show the TV view on phones works when the TV is switched off.
• The run of show and prompts print from the control surface.
Definition of done
• Every acceptance criterion passes on the preview deployment in Chris's practice-room test, on the devices in Setup, including 30 seconds offline mid-burst and a run with realtime blocked.
• Automated tests cover every criterion that can be automated and run on every pull request, along with the load script.
• TV type has been read from the farthest seat in the practice room.
• Screens match the Claude Design pass 2 files.
Not in milestone 2
AI, every interaction except the word cloud and wall, the alignment signal, the scribe console, handing over the remote, moderation, Mark a decision, and Clear test answers. Don't build ahead, but keep the room state general enough to carry them.
Ask Chris before
• Applying any migration to the clearway-live project before its pull request is merged.
• Adding a paid service.
• Running anything on Team Hub, or touching CORE.
Open questions for Chris
Both are needed by design pass 2. Codex builds each as a setting; the default waits for Chris.
• Default TV screen: dark (Navy), light (Off-White), or chosen per room.
• The church on the TV: the church's name only, its logo beside Clearway's, or Clearway only.