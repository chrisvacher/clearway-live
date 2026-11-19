# Word cloud and open text in a small room

Chris's November 19, 2026 decision applies to the shared TV board, including
the control surface's TV preview and Live monitor. Phone input, prompts and
database definitions are unchanged.

## What changed

Every word starts in the cloud. The cloud can grow above its natural scale,
up to the room-scaled 168px ceiling, while staying within 1280px per word.
Planning reads measurements without changing live elements. Once the cloud
cannot fit at the room's type floor, the oldest single mentions move to the
bottom row. They stay there through hides and returns until another person
repeats them. The row takes no height while empty and opens with the existing
make-room motion. New arrivals, AI combines and Undo keep their existing
motion and colours.

Chris approved one width exception during implementation: a repeated answer
that cannot fit within 1280px at the floor may shrink below it. Crowding alone
never lowers the type floor. A single mention that is too wide at the floor
moves to the bottom row.

The cloud uses a bounded free-rectangle planner to keep crowded dry runs fast.
Other `Field` users retain their existing planner and exact DOM measurements,
including fixed-size group count badges.

Open text with AI on shows the existing answer cards until there is a group
to display. The first group cross-fades to the existing groups and answers
layout. Undo of the last group cross-fades back. A summary uses the groups
layout even without groups, leaving the area below it empty. Both layouts
remain mounted and receive each frame. The grouping placeholder is removed.
The current TV snapshot exposes summary text, so the summary layout begins
when that text reaches the board after Show summary.

## Verification and evidence

`npm run test:small-room` runs the paired-TV kit in
[`tests/browser/small-room.ts`](../tests/browser/small-room.ts), using simulated
phones, the scripted fake model and disposable local workshop rooms. It covers
both skins, both TV themes, very small and medium rooms, and full and reduced
motion. It checks 3, 8, 20 and 60 words, geometry, overflow order, sticky
placement, repeated return, layout cross-fades, summary, newest arrivals and
phone-to-TV latency. CI runs the kit and uploads its screenshots.

The direct Chromium renderer matrix passed all 16 display configurations.
It verified cloud geometry at 3, 8, 20 and 60 words, plus cards, first group,
return to cards and summary without groups. These are renderer fixtures,
not paired-TV, API, Realtime, fake-model or latency evidence.

Renderer measurements are in
[`renderer/results.json`](evidence/small-room/renderer/results.json).
Additional Chromium checks covered a repeated 28-wide-letter answer across
all five room sizes, both skins and both themes. Every measured width stayed
below 1280px. Continuous arrivals, combines and Undo, including an absorbed
overflow chip, had no jumps of 150px or more and no settled overlap or clipping.
See the [wide-word and motion results](evidence/small-room/renderer/edge-results.json)
and [overflow combine results](evidence/small-room/renderer/overflow-edge-results.json).

Representative screenshots:

- [Three words, Clearway dark](evidence/small-room/renderer/clearway-very_small-dark-full-cloud-3.png)
- [Twenty words, Clearway dark](evidence/small-room/renderer/clearway-very_small-dark-full-cloud-20.png)
- [Sixty words, Clearway dark](evidence/small-room/renderer/clearway-very_small-dark-full-cloud-60.png)
- [Answer cards, Novetera light](evidence/small-room/renderer/novetera-very_small-light-full-wall-cards.png)
- [First group, Novetera light](evidence/small-room/renderer/novetera-very_small-light-full-wall-groups.png)
- [Summary without groups, Novetera light](evidence/small-room/renderer/novetera-very_small-light-full-wall-summary.png)

`npm run check` passed. It ran lint, typecheck, the production build, 610 unit
tests and all 45 production smoke tests. One unit test requires an Anthropic
API key and was skipped.

The first [GitHub Actions run](https://github.com/chrisvacher/clearway-live/actions/runs/44628317878)
passed the AI, lens wall, milestone 4 acceptance and load kits. Regular load
delivered 148 of 150 answers in under one second, with p95 at 269 ms. The lens
wall delivered 100 of 100 in under one second, with p95 at 259 ms. The separate
50-phone simultaneous spike delivered all 50 answers and had p95 at 1099 ms.

The [team workshop rerun](https://github.com/chrisvacher/clearway-live/actions/runs/44630616332/job/135935931368)
passed all 22 checks. The [small-room rerun](https://github.com/chrisvacher/clearway-live/actions/runs/44631901111)
passed all 16 display configurations. All 1,104 measured submissions reached
the paired TV in under one second. The slowest configuration's p95 was 67 ms.
Each session also met the 95-in-100 target. At full motion, the largest
measured move in a frame was 75.5px.
The [repository evidence](evidence/small-room/native/) contains measurements
for all 16 configurations and every test state for four representative displays.
The [full run artifacts](https://github.com/chrisvacher/clearway-live/actions/runs/44631901111)
contain all 192 screenshots. These measurements use simulated phones on
isolated runners.
