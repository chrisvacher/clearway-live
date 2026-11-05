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
- **The content-screen cross-fade check failed once and passed on rerun.** Cause: the leaving layer began to fade as soon as it was marked, while the entering layer waited two animation frames to begin. When one frame ran long, the combined cover could dip below one half. The entering layer now fades with a CSS animation that starts on the frame it appears, and the leaving layer is removed on a timer. `acceptance-live` has a regression test that stalls the main thread for 350 ms when a layer is added, and `frame-watch.ts` is shared by both acceptance kits.
