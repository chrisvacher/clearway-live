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
