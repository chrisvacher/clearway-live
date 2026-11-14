# The live-screen acceptance kit and the failure kit for milestone 3

Milestone 3, step 7a. Every interaction goes through the live-screen rules with 50 simulated phones, and the failure kit covers the new kinds. No migration. Step 7b (the practice-room script and the team workshop run end to end) is separate.

## `npm run test:acceptance-live`

`tests/browser/acceptance-live.ts`. One headless TV is paired to the practice room and watched on every animation frame for the whole run. Fifty simulated phones join by name and answer through the real phone endpoint, as `scripts/load-test.ts` does (its `Phone` and `joinPhones` are now exported and shared, rather than copied into another kit). Each kind goes live in turn:

| Screen | What the phones send |
| --- | --- |
| INT-01 Word cloud | One word each |
| INT-02 Open text | One sentence each |
| INT-03 Q&A | One question each (some fold by matching words), then one vote each |
| INT-04 Multiple choice | A pick each; ten change it |
| INT-05 Scale | A number each; ten change it |
| INT-06 Ranking | A full or partial ranking each; ten change it |
| INT-07 100 points | A full budget each; ten move points |
| INT-08 2x2 grid | Ten items; each phone places four, then seven, then all ten |
| INT-09 Private form | One private answer each |
| INT-10 Sign together | A signature each |
| INT-17 Statements | A rating of all five statements each; ten change them |
| Content screens | Holding, headline, Scripture, prayer, an image page and the screen check |

Every phone answers within six seconds of the step going live: a burst, as the PRD means one. For each kind the kit checks:

- **Under one second.** From the latency log, every answer and change reached the TV and was logged, and at least 95 in 100 arrived in under one second. The share and the 95th percentile are printed for each kind.
- **Nothing jumps.** The frame watcher measures how far every item the kind draws (words, cards, question rows, bars, the cut line, the scale's marker and columns, dots, signatures) moves between two frames. A move of 150 px or more in one frame fails. The largest step is printed.
- **Nothing blanks, fades out or is drawn again.** No frame has the session scene empty, and no frame has its layers fading below half cover. The live layer and its board are marked when the step goes live and must be the same elements at the end, so the view animated in place. The TV page never reloads.
- **The TV's numbers are the server's.** Once settled, the TV shows the server's results: bars in its order with its lengths and leaders, the scale's average and every column, Q&A's count, top three and more line, every grid item's dot and its legend count, every word repeated on the server and its leader, every wall card, 50 signatures. The private form shows only its count, and no answer text is anywhere on the TV page.
- **Content screens.** Each cross-fades in from the screen before it with no blank frame. All 50 phones read the new step within one second of Go live (the PRD's "Go live to every phone moved"). The image keeps its own shape.

The kit's sessions are removed from the practice room afterward. `KIT_SHOTS=<folder>` saves each TV screen; `KIT_ONLY=word_cloud,choice` (or `content`) runs only those, for a quick look.

**Results on loopback** (local stack, 2 CPUs, November 3):

| Screen | Under 1 s | 95th | Largest step |
| --- | --- | --- | --- |
| INT-01 Word cloud | 50 of 50 | 112 ms | 44 px |
| INT-02 Open text | 50 of 50 | 115 ms | 0 px |
| INT-03 Q&A | 50 of 50 | 183 ms | 82 px |
| INT-04 Multiple choice | 60 of 60 | 108 ms | 24 px |
| INT-05 Scale | 60 of 60 | 126 ms | 19 px |
| INT-06 Ranking | 60 of 60 | 179 ms | 13 px |
| INT-07 100 points | 60 of 60 | 129 ms | 26 px |
| INT-08 2x2 grid | 150 of 150 | 235 ms | 28 px |
| INT-09 Private form | 50 of 50 | 116 ms | 0 px |
| INT-10 Sign together | 50 of 50 | 143 ms | 60 px |
| INT-17 Statements | 60 of 60 | 152 ms | 52 px |

Content screens: Go live reached all 50 phones in 513 to 728 ms, with no blank frame.

These numbers prove the pipeline, not the venue. Venue acceptance is the practice-room run.

## The failure kit on the new kinds

`npm run test:browser` runs the milestone 2 checks (`tests/browser/failures.ts`, unchanged). Then, in the same browser and app, it runs `tests/browser/failures-m3.ts` on an engagement of its own, with the scripted fake AI model (never the API):

| Check | What it proves |
| --- | --- |
| FAIL-01, structured | Offline, a phone signs (the step on the TV), then looks back through the segment to place a grid item, spend 100 points, rank, and pick and change a choice. Each says Saved on this phone and nothing reaches the server. Back online, all arrive in the order written, each once. The changed pick is withdrawn by the server's one-answer-per-person rule, and the latest stands |
| FAIL-02 on a bar and a grid | The TV's network is cut while two phones answer. It keeps its last bars or dots with the Reconnecting mark, then catches up to the server's numbers within 3 seconds of the network returning, without reloading |
| FAIL-06 on a Q&A ranking | The TV can't confirm while two votes lift the last question to the top. The remote shows Syncing and keeps the TV's last confirmed picture, then corrects once the TV confirms |
| FAIL-08, structured | The person signs in on a new phone and sees her own signature, grid placement, 100 points, ranking and latest pick, with the one-time line |
| FAIL-09 on word cloud, wall and Q&A | AI slow (9 seconds a call), then failing: every answer still lands on the TV at once in arrival order, the control surface says "AI is slow" and then "AI isn't responding", and the TV never mentions AI. On the word cloud AI then comes back and the warning clears (about 40 seconds: the cool-down plus the failed call's budget) |
| FAIL-10 with the new kinds | The printed run of show names every new kind (never "Content"), its prompts, the self-paced session and its window, and "If the tech fails" |

`KIT_SHOTS=<folder>` saves each failure state.

## CI

The database job runs `npm run test:acceptance-live` after the existing kits. The failure kit and the acceptance kit save screenshots to the runner's temporary folder. They are uploaded as the `kit-screenshots` artifact (kept 14 days), on failure too. Locally, the failure kit now takes about 3 minutes and the acceptance kit about 5. The job ran in about 14 minutes before this step, so its timeout goes from 30 to 40 minutes.

## What the kit found and fixed

- **The word cloud's single-mention row jumped a whole chip for one frame** whenever its oldest chip slid off the left edge (`lib/tv/board.ts`, `Chips.step`). The row's transform was written before the oldest chip was removed and the offset reduced by its width. For one frame, every chip in the row drew 200 to 300 px to the left of where it belonged, then snapped back. The transform is now written after the removal, in the same frame. A unit test (`tests/unit/tv-board.test.ts`, "Retiring a chip off the left edge never shifts the row for a frame") runs the row through a minimal DOM. It fails without the fix (230 px) and passes with it (the spring's own largest step, 68 px). The milestone 2 kits never filled the row past its width.

Nothing else in the app changed.

# Milestone 4: the live-screen kit, the failure kit and the Riverside retreat

Step 8. One migration, `20261104190000_m4_acceptance_fixes.sql`, closes two known gaps (below). Both kits run in CI with screenshots uploaded.

## `npm run test:acceptance-m4`

`tests/browser/acceptance-m4.ts`. One headless TV is paired to the practice room and watched on every animation frame (`tests/browser/frame-watch.ts`) for the whole run. Fifty phones ("Wayfinder 01" to "50") use each Wayfinding kind in turn through the real phone endpoints, with the scripted fake AI model, never the API.

| Kind | What the phones send | What is checked |
| --- | --- | --- |
| Lens seeding | 50 sentences, ten for each lens | All stored, no words visible to the TV, a phone snapshot, the room state or the facilitator's count |
| Lens wall | 50 sentences with AI 2.5 s per call | The lens's seeds come first, the other lenses' stay hidden, clusters equal the server's, under one second from the latency log |
| Lens summary | 40 Approve, 10 Suggest a change with AI slow | Tally equals the server's, two anonymous cards and the rest counted, decision shows |
| Candidates | 50 suggestions (rename, merge, add), then 100 points | Suggestions never reach the TV, one tap accepts in place, bars in the server's order, five provisional outcomes |
| Outcome bullets | 100 bullets typed then added | The room is not told on every keystroke, newest six show, the rest counted |
| Outcome confirm | 50 answers | Counts equal the server's, no reason or name on the TV, four decided |
| Pre-mortem | 10 reasons, 50 placements with AI slow | Reasons stamped on the TV page for latency, AI merges, dots equal the server's, mitigation shows |
| Goals | 30 goals (the limit) and 20 phones reading the form | Letters checked in code, flagged goals outlined, the rest counted |
| Commander's intent | 12 editors, 36 line updates | Latency stamped on the TV page, other phones watch |
| Remote handover | Give and take back | All 50 phones read it within one second, the TV unchanged both ways |
| Affirm together | 50 signatures | 50 on the TV, under one second from the latency log |

For each kind the kit prints the share of answers on the TV under one second and the 95th percentile. Kinds the server's latency log covers (anything sent through `live_submit`) read from it. Reasons, goals and intent lines go through their own endpoints, so the kit stamps their arrival on the TV page (`arrivalRecorder` and `tokenRecorder`) and compares with the send times. Frame sampling fails the run on any blank, dim or jump of 150 px or more, and every step checks that the TV page never reloaded and that no name or email is on it.

## The failure kit on the Wayfinding kinds

`npm run test:browser` now also runs `tests/browser/failures-m4.ts` after milestone 3's checks.

| Check | What it proves |
| --- | --- |
| FAIL-01 on the lens wall and the lens summary | Three lens sentences written offline are saved on the phone and sent in the order written, each once, and an offline Approve is sent once and counted on the TV |
| FAIL-02 on the lens wall and the lens summary | The TV keeps its last screen with Reconnecting, then catches up to the server's count and tally within 3 seconds |
| FAIL-09 on the lens wall and the lens summary | With AI slow, then failing, every sentence lands at once and only the control surface says so. With AI failing the lens summary room still works |
| FAIL-10 from the Wayfinding templates | The run of show prints from the Wayfinding template and the day-and-a-half template, with the follow-up part and no Publish to CORE |

## `npm run test:wayfinding`

`tests/browser/wayfinding-retreat.ts`. A Riverside engagement starts from the Wayfinding template, rehearses and clears test answers, pairs a TV and signs in eight phones by email code. It then runs, in order: lens seeding hidden until each lens opens, the lens wall, five lens summaries signed off, candidates renamed and marked as provisional Vision Outcomes, outcome bullets typed on a phone, confirm, the pre-mortem with a mitigation, CORE goals linked to risks, the handover with commander's intent and Affirm together, and the draft Clearway Map. It ends with the day-and-a-half template's follow-up block run through a follow-up link and code with no Clearway sign-in.

## Known gaps closed

- **Clear test answers did not clear candidate suggestions.** `private.candidate_suggestions` now has a `test` column set by the same rehearsal trigger as the other tables, and `rehearsal_control` clear puts away the rehearsal's rows. A real suggestion and another room's are untouched.
- **The practice reset did not clear scribe cards or scribe files.** `reset_practice_room` now puts both away, and the app route removes the stored bytes from Storage (SQL cannot delete from Storage's tables), using the new `practice_scribe_paths()` for the list. Both fixes are in `supabase/tests/database/m4_acceptance_fixes.test.sql`.
- **The content-screen cross-fade check failed once and passed on rerun (not fixed here).** Cause found: the leaving layer starts to fade as soon as it is marked leaving, while the entering layer waits two animation frames to begin (`SessionLayers` in `components/tv/tv-scenes.tsx`). When one frame runs long, the combined cover dips below one half and the kit sees a dim. The fix tried was a CSS animation on `.tv-layer.is-entering` that starts in the same frame, with the leaving layer removed on a timer. It closed the gap in `acceptance-live`, but with it in place `test:lens-summary` failed its "no row jumped" check (165 px against its 160 px limit) in three of four CI runs, and it passed once the change was taken out. The TV layout is another Claude's area, so the change is left out of this pull request and the tested version is in commit `ba1b394` on this branch for whoever owns the TV. `tests/browser/frame-watch.ts` has `stallOnNewLayer(ms)`, which stalls the page for `ms` when a layer is added; adding `await tv.evaluate(stallOnNewLayer(350))` after the content-screen watch in `acceptance-live` reproduces the dip on demand.

# Milestone 6: the live-screen kit and the failure kit for Discover and the alignment signal

Step 6. No migration. `npm run test:acceptance-m6` and the extended failure kit run in CI with screenshots uploaded (`acceptance-m6-screens`). The practice-room rows are sections 22 to 30 of `docs/practice-room-script.md`.

## `npm run test:acceptance-m6`

`tests/browser/acceptance-m6.ts`. One headless TV is paired to the practice room and watched on every animation frame (`tests/browser/frame-watch.ts`). Fifty phones ("Wayfinder 01" to "50") use the Four Helpful Lists through the real phone endpoints, with the scripted fake AI model, never the API. The facilitator's pages (Discover, the control surface, the remote) are real browser pages under the lead's own sign-in; one phone is a real browser page so its page and network can be read.

| Check | What it proves |
| --- | --- |
| Four Helpful Lists, 50 phones, AI slow | Every card on the TV: 95 in 100 under one second from the latency log, no frame blank or faded, no card jumps 150 px or more in a frame, the view animates in place, the page never reloads. The TV's cards in each list and its "more on phones" line equal the server's |
| Four Helpful Lists, agrees | Twenty timed agrees (95 in 100 under one second) and every phone agreeing in a burst. The TV's numbers equal the server's, no one counts twice |
| Discover setup | The total and the findings by hand; each finding is its own accepted theme; thin and strong come from the counts (5 of 100 is thin and says why, 52 of 100 is strong) |
| Draft themes | Themes arrive from the notes and the phones' cards with the AI icon and counts ("2 of 5 conversations", "of N people"); one interview alone is thin; no person on the page; only the findings count until the facilitator accepts |
| Accept, reject, leave | Only accepted themes are returned by `discover_accepted_themes` |
| Draft What We Heard | Headlines come from accepted themes; the stored AI run input holds no unaccepted theme and no person; the number is the lead figure; thin is marked exactly when the lead is thin; nothing is written to a step before Apply |
| Apply, then go live | Apply writes headline, number, source and phone depth and leaves the step's state alone (the TV shows nothing); when the step goes live the TV and a phone show it |
| Signal cards | Aligned, divergent and thin cards reach the control surface and the remote while 10 phones answer on a wall. Not one is in the TV's or a phone's page, a byte either was sent (network and live socket), or a phone's snapshot. A participant's session and an unsigned caller are refused by the signal route |
| Signal inputs | The stored `alignment_signal` run inputs hold accepted themes and the room's words only, no person; no card rests on an unaccepted theme |
| Dismiss and citation | The dismissed card fades and closes up on both surfaces; only an aligned card can be saved as a citation |
| The neutral question | The TV cross-fades to it and back with no blank frame (sampled every frame); the count and the AI line are hidden and restored; the payload holds the question and no theme, count or kind; phones keep the live step and never show it |
| The neutral question over a word cloud | A second question over a live word cloud with combined words: the AI line is asserted to show first, is hidden while the question is up (with the count), and returns as it was, with no blank frame either way |
| Silent cards | None while phones are up; one after Phones down on the strong theme nobody spoke of; never on the TV |
| Reset | Reset practice room puts away the findings, notes, themes, drafts and signals the run made |

`KIT_SHOTS=<folder>` saves the screens. The kit's data lives in the permanent practice room and is cleared at the end.

## The failure kit, milestone 6

`tests/browser/failures-m6.ts`, run by `npm run test:browser` after milestone 4's checks, on an engagement of its own with the scripted fake model.

| Check | What it proves |
| --- | --- |
| FAIL-09 on `fold_four_lists` | AI slow (9 s a call), then failing: every card is on the TV at once, the control surface says "AI is slow." then "AI isn't responding.", the TV never mentions AI, and hide, unhide and agree work by hand |
| FAIL-09 on `draft_discover_themes` | "This is taking longer than usual", then "AI couldn't draft themes this time" with Redraft themes; a theme added by hand counts while it is slow; accepted themes are untouched by the failure; the retry works |
| FAIL-09 on `draft_what_we_heard` | The same on What We Heard: a headline typed by hand and applied while the draft is slow; Apply still works while the draft has failed; nothing goes live |
| FAIL-05 with the signal | The laptop closed: the remote still lists the cards, takes a new one, edits and puts the neutral question up and down, dismisses, and lists a silent card after Phones down |
| FAIL-09 on `alignment_signal` | A slow run is not a failed one; with AI failing, answers still land, the cards already up stay and work, and a question the facilitator wrote still goes up |
| FAIL-01 on the Four Helpful Lists | Offline, cards and agrees are saved on the phone and sent in the order written, each once, and the TV counts them |

## The load script and the Four Helpful Lists

`npm run load` (`scripts/load-test.ts`) now also drives a live Four Helpful Lists step: each phone sends a card (`{ column }` and its words) in every burst, then every phone taps Agree on a standing card through `/api/live/<room>/agree`. Own and repeat agrees are refused by design and reported apart; the pass mark is the same 95 in 100 from the latency report. Practice-room row 23 uses it.

## Notes from writing the kit

- A phone named "Discover phone 01" made the signal refuse every card that said "Discover": the database correctly treats an attendee's name as a name. The kit's phones are "Wayfinder NN".
- A drafted theme is dropped if its label is already on the page, so a card theme the notes also name is not offered twice. The kit's card theme is one the notes never mention.

# Milestone 5: the live-screen kit and the failure kit for the scribe, the overnight drafts and the Day 2 confirm

Step 4. No migration. `npm run test:acceptance-m5` and the extended `npm run test:browser` run in CI after the other kits, with screenshots uploaded as `acceptance-m5-screens` and `kit-screenshots`.

## `npm run test:acceptance-m5`

`tests/browser/acceptance-m5.ts`. One headless TV is paired to the practice room and watched on every animation frame (`tests/browser/frame-watch.ts`). Fifty phones ("Wayfinder NN") use the real phone endpoints, the scribe signs in as a scribe attendee in a laptop browser, and two facilitators (the first leads, the second co-facilitates) use the control surface and the review. AI is the scripted model, never the API. The kit runs in Riverside order:

| Step | What happens | What is checked |
| --- | --- | --- |
| Lens wall | 50 sentences with AI 2.5 s per call | Under one second from the latency log, clusters and count equal the server's, nothing jumps |
| Scribe console | The scribe captures a card of each kind (with a speaker on the quote) and an easel photo through the UI while the lens wall is live | Six cards in the database in order, the speaker stored but on no screen, the photo in the private bucket, the TV undisturbed (no jump, no card words) |
| Promote a quote | The quote is promoted from the Scribe panel, 50 more phones answer underneath, the quote is taken down | The TV shows the words only, under one second under the quote, count and clusters equal the server's, taking it down leaves the step as it was with no blank frame |
| Close Day 1 | The overnight round starts | Ready well inside 30 minutes, nothing from it on the TV or a phone, phones refused by the drafts API |
| Review | Lead and co-facilitator in two browsers | Every drafted bullet has a source, the thin outcome is flagged, voices and tensions stand apart, the speaker shows on review only, one outcome is locked to the editor, Restore the room's words is one action, every version is kept |
| Publish | The co-facilitator tries, then the lead publishes | The co-facilitator is refused, one publication, publishing is not a TV or phone event |
| Day 2 read-back | 40 "Yes, that's us", 10 "It needs a change", 50 "What's missing?" | 100 of 100 logged, under one second, one colour for both bars, at most six anonymous answers and "+ n more", the tally equals the server's, nothing jumps, phones see source sentences and no scribe words |
| A correction | The scribe sends one through the composer, the facilitator accepts it | The scribe's reason is on the control surface only, the line folds in as a tracked change, other lines word for word, the tally restarts at zero |
| Mark a decision | One decision on each of the eight items | All eight settled, a phone can look back at all eight and sees the one that changed, the changed lens is a new signed-off version, the draft Map shows the changed text |
| Identity | Every payload the room can read | No speaker or scribe name on the TV, phones, read-back or in any AI input |
| Reset practice room | | Scribe cards, files and read-back items are cleared |

Latency is read from the server's log (the lens wall and the read-back go through `live_submit`). The practice room takes one room-wide lock, so no control surface, review or scribe console is open while phones are measured, as in the read-back kit. The frame check ignores a lens-wall row that is below the bottom of the screen at both ends of a move (the feed keeps older rows there).

## The failure kit, milestone 5

`tests/browser/failures-m5.ts`, run by `npm run test:browser` after milestone 4's checks.

| Check | What it proves |
| --- | --- |
| FAIL-03 the scribe goes offline | A quote, a decision, a read-back correction, an easel photo and a tension are saved on the laptop in the order made, each with its own id (read from the outbox), and nothing reaches the server. When the network returns they arrive in that order, once each, even though the first response is lost on purpose and the card is sent again. A replay of a card and a correction is a duplicate. The control surface shows the cards, the photo and the correction with its reason, and no speaker |
| FAIL-02 on the read-back | The TV's network is cut while a correction folds in and the room moves to the next item. The TV keeps its item with Reconnecting, then shows the server's item within 3 seconds without reloading |
| FAIL-09 on `fold_read_back` | AI slow: Accept answers at once, the correction says AI is folding it in, the TV keeps its words, and the fold lands later. AI failing: the correction waits and tells the facilitator to name the line, the TV is unchanged, naming the line folds it in without AI. The TV never mentions AI |
| FAIL-09 on the overnight drafts, slow | Past 30 minutes the review says so, "Write it by hand instead" is offered, and the late draft still lands |
| FAIL-09 on the overnight drafts, failing | The review says the draft hit a problem and the facilitators write it by hand |

## CI

One step after the other kits (the database job's timeout is now 75 minutes, because the milestone 6 and 7 kits and their failure checks lengthen it). The acceptance kit takes about 2 minutes locally and the milestone 5 failure checks about 1 minute.

## Notes from writing the kit

- The scribe feed shows the newest cards, so the kit captures the quote last to find its Promote button.
- The failure kit's shared fake-model folder is removed once, after the last milestone's checks.

# Milestone 7: the after-the-retreat kit and the failure kit

Step 6. No migration. `npm run test:acceptance-m7` runs in CI after the other milestone 7 kits (`test:check-ins`, `test:read-only`, `test:report`, `test:visibility-plan`), with screenshots uploaded as `acceptance-m7-screens`, and the extended `npm run test:browser` carries the failure checks.

## `npm run test:acceptance-m7`

`tests/browser/acceptance-m7.ts`. One run on the seeded Riverside engagement, in real browsers against the production build and the local stack, with the scripted fake model (never the API) and the harness mailbox standing in for Resend. The app is started with `CRON_SECRET` set and `CLEARWAY_NOW` at the 30-day date (30 days after Riverside's retreat end date). The seed's owner addresses end in `.example`, which the check-ins never email, so for the run they are changed to `.example.org` and put back afterward, together with the engagement's status, settings, Day 2 steps and facilitators.

| Step | What is checked |
| --- | --- |
| Close the day | Close Day 2 on the control surface sets `day2_closed_at` and makes the 30, 60 and 90-day rounds on the right dates. Undo takes it back (rounds gone) and Mark the retreat closed makes the same rounds again |
| Draft the report | Fourteen sections in Clearway's order, Overview and Closing drafted last, seven tables built from the records |
| Sources | Every AI, room and record sentence has a source. The aligned signal saved as a citation is a source in What We Heard, and only a saved aligned signal. The thin survey finding carries its Thin data label |
| The 10-year Future | The five signed-off lens summaries word for word, with no edit or remove |
| Edit, review, sign off | An edit and the facilitator's own read, sign-off shut until every section is reviewed, then version 1 signed and kept |
| Export | Word and PDF: the fourteen headings in order, Plus Jakarta Sans and the logo, no Draft mark, no source markers, no dashes or semicolons, the 10-year Future word for word, the edit present |
| The visibility plan | Drafted from refs: rows in the outward order, each with a source, no when without a public date |
| Make the Vision Visible | The plan changing marks the section out of date, the server refuses a sign-off until it is refreshed, the refreshed table holds every plan row, and version 2 carries the plan while version 1 is as it was |
| Share | A named link shown once. On a phone-size and a laptop-size page: no inputs or edit links, only a Print button, Vision Outcomes, goals with their owners, intent cards, the signed report with its fourteen headings and the plan, no email, no status before any check-in, no sideways scroll |
| Revoke | A panel asks first, then the page is the plain one at once, the same as a link that never existed |
| The scheduled run | 401 without the right secret and nothing sent. At the 30-day date one email goes to each of the four owners (two attendees, two with only a name and email) and to nobody else, each listing only their own steps and goals. A second run sends nothing |
| Owners answer | Each owner answers on a phone-size page seeing only their own items: a stuck step, a goal at risk, on track, off track and a step under way |
| Results | Every answer and note, "3 to follow up", "Everyone has answered", Mark followed up and Clear the follow-up |
| Owner status on the copy | A new link shows each answered goal's status as a label and a date, a goal nobody answered shows none, and never a note or an email |

Before Day 2 closes it also checks that Share says "Available once Day 2 closes" and offers no link. After sign-off version 1 is saved and later compared byte for byte, and an edit after sign-off is checked to stay off the link. The step timings are printed at the end. The kit takes about 1 minute locally.

Both milestone 7 kits put other engagements' scheduled check-in rounds away while they run, so the email counts are Riverside's, and put them back afterward.

## The failure kit, milestone 7

`tests/browser/failures-m7.ts`, run by `npm run test:browser` after milestone 6's checks, on the seeded Riverside engagement with the scripted fake model and the harness mailbox. The slow notices are shortened to 2.5 s for the run, and `CRON_SECRET` and `CLEARWAY_NOW` are set for it.

| Check | What it proves |
| --- | --- |
| FAIL-09 on `draft_report` | AI slow (6 s a call): the page says drafting is taking longer than usual, a section that is done can be read and a facilitator's own read added while the rest are still drafting. Then AI failing: sections the model failed on say Needs attention and that AI could not draft them, the facilitator writes one by hand, and when AI is back Try again drafts it while the hand-written words stay |
| FAIL-09 on `draft_visibility_plan` | AI slow: the page says so and a row is added by hand while the draft still lands. Then failing: "AI couldn't draft the plan" with Try again and Add a row, nothing written is lost, a row is added by hand, and Try again works |
| A revoked link | The plain page at once on a phone page that was already open, and on a new browser, with nothing about the plan and no count of opens |
| The scheduled run | 401 with no header, a wrong secret or no Bearer, and nothing sent. With the secret, one email to each owner. Called again the same day it sends nothing |
| FAIL-01 on the check-in phone | Offline, the answers (a changed answer and a note) are saved on the phone and nothing reaches the server. Back online, they are sent once and the phone's copy is cleared. A tap alone is not an answer sent |

The failure kit's shared fake-model folder is removed once, by `failures.ts`, after the last milestone's checks (milestone 6's check no longer removes it).

## `npm run test:admin`

Design pass 8, step 6. `tests/browser/admin.ts` checks the signed-in admin pages at 1440px and 390px: one frame (`admin-page`, `admin-heading`), no title larger than page-title size, the button and field standard, no sideways overflow, and the steps each sweep batch added. `npm run test:admin` runs it for areas `a`, `b`, `c` and `d` in turn (`KIT_AREA`) and stops at the first failure; area `b` points the Team Hub reader at a closed port by itself. It needs `npm run build` and the local stack, and runs in the CI database job after the other browser kits.
