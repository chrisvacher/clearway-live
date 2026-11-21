# Design pass 11 handoff

Implementation and verification for Clearway Live and Novetera Live. The
[approved brief](design-pass-11-brief.md) records the room behaviours and visual references.

Vercel deployment `dpl_GZ25MqdabR3FjGXa1b6oiqqWwzDb` was ready at application
commit `5a17ba8`. Both production aliases pointed to it, and both homepages
returned HTTP 200. [Clearway Live](https://live.clearway.co) and
[Novetera Live](https://live.novetera.co).

## What shipped

| Part | Release commit | Behaviour |
| --- | --- | --- |
| 1 | `1d7ebb5` | Change Who sees answers from the live room, remote or run of show, including on open and live steps. The live room offers Undo. |
| 2 | `532533b` | Facilitator Results stays available for private steps in the live room and on the remote. |
| 3 | `9a9f8f5` | Frame adds the join address and QR code while the TV stays on the step. It follows navigation and hides on Join and Blackout. |
| 4 | `d72df45` | Scales have a track with stacked dots, a crowded column layout, and optional NPS-style bands with facilitator and CSV results. |
| 5 | `d373281` | Selections and valid allocations use the participant outbox and send automatically. Text and signatures keep Send. |
| 6 | `06ab4a3` | Participant screens have a bounded two-column layout from 900px and a keyboard shortcut for long text on fine-pointer devices. |
| 7 | `a309ea6` | Video has private Storage, preview preload, room playback controls, muted fallback and a phone cue. |
| 8 | `4ab83a1` | Before and after uses two independent aggregate distributions. It accepts paired partial answers or follows two earlier scales. If either source is private, the TV shows a count. |
| DR-1 | `52062b0` | Duplicate into an editable engagement. The transaction remaps references, protects existing answers, and records target-owned media. Duplicate as a new event uses the same copy path. |

Follow-up releases are `7272fce` for signed resumable uploads and frame motion,
`8b85056` for scale stacks and the separate comparison question, `9d80f01`
for readable framed Q&A motion, and `5a17ba8` for grid drag completion.

The duplicate dialog starts with Add after them when both modes are available.
If a target has no date, included starts retain their original timestamps.
The database commit runs after Storage copies finish. If the database declines
the request, the API removes those copied objects. When a network error leaves
the commit outcome uncertain, the API keeps the objects so a successful
transaction does not lose its media.

When a step turns private, its public values leave the TV DOM immediately
and the count fades in.
A scale's newest dot uses its ordinary colour if the average marker is too
close for the live highlight.

## Migrations in apply order

Target Supabase project `clearway-live` (`uxfypmohciupjyzbonlq`).

| Order | Migration | Production |
| --- | --- | --- |
| 1 | `20261121041740_live_visibility_controls.sql` | Applied |
| 2 | `20261121043046_private_live_results.sql` | Applied |
| 3 | `20261121043115_join_frame.sql` | Applied |
| 4 | `20261121043323_scale_dots_nps.sql` | Applied |
| 5 | `20261121045732_video_storage_options.sql` | Applied |
| 6 | `20261121045733_video_room_playback.sql` | Applied |
| 7 | `20261121045740_before_after_aggregates.sql` | Applied |
| 8 | `20261121045933_duplicate_run_of_show.sql` | Applied |
| 9 | `20261121052500_before_after_question.sql` | Applied |

Parts 5 and 6 require no migrations.

## Verification

- `npm run check` passed in a temporary copy of the final application source.
  It ran lint, types, the production build, 638 unit tests and 45 smoke tests.
  One unit test was skipped by the existing suite.
- The `npm run test:pass-11` room scenarios passed in all 16 configurations
  across two local runs. The runs covered both skins and TV themes, very
  small and medium rooms, motion on and reduced motion, and the paired
  Chromium TV, live room, remote and simulated phones. The first run
  covered all eight Clearway configurations, and the second covered all
  eight Novetera configurations and duplication. A previous combined run
  exceeded the one-second Undo check. The rerun passed that configuration.
  The kit checks the public payload, Undo, private facilitator results,
  the Frame controls, and the available space for the registered boards.
- Focused runs exercised scale dots and crowded columns with 1, 5, 11 and 40
  answers, persistent dot identity when an answer changes, NPS-style counts,
  offline outbox replacement, both comparison modes and private-source
  suppression. The paired MP4 run covered upload, Preview preload, playback,
  pause, seek, restart, reconnect, both end behaviours and muted fallback.
  A second run in Novetera used an 8 MiB test clip and resumed after a
  deliberately dropped upload chunk.
- Browser checks in both skins covered holding a grid drag without sending
  and sending the completed placement exactly once on release.
- The team workshop regression kit passed 23 checks on a paired TV, eight
  phones and the live room, including the 100-points and grid auto-send paths.
  The self-paced kit passed all 12 checks.
- The participant sweep covered both skins, every registered kind at
  1280 × 800 and 1440 × 900, mobile layout, and Enter and Shift + Enter.
- The duplicate browser checks use disposable engagements to cover an empty
  target, Replace, Add after them, and options for media, time and visibility.
  The browser reads back the copied bytes from the target Storage folder and
  verifies remapped timer and comparison references, Replace refusal with answers,
  and a separate image copy when duplicating to a new event.
- Focused database tests covered live visibility permissions and the payload
  boundary, NPS-style math, video validation, aggregate-only comparison, and
  duplicate permissions and local-clock scheduling.
- The AI and lens wall assertions passed with the fake model and disposable
  workshops. The load runs delivered 99 of 100 AI wall answers and 98 of 100
  lens sentences to the paired TV in under a second.
- The small-room checks passed all 16 display configurations across the
  original run and three targeted reruns. The 12 configurations covered by
  the reruns delivered all 828 answers in under one second.
- The load kit's regular 50-phone bursts ran in a disposable open-joining
  workshop. All 150 answers reached the TV in under one second. Phone-to-TV
  p95 was 45 ms. The separate simultaneous 50-phone burst, which the existing
  kit reports without gating the run, delivered all 50 with p95 at 1331 ms.
  Four Helpful Lists accepted all 60 cards in the same run.

## Remaining acceptance

- The project-level hosted Storage limit was not confirmed during the rollout.
  The private video bucket and the application both allow 524,288,000 bytes.
  The dashboard was unavailable and automatic approval review blocked a
  Management API request that would first read the CLI credential.
  A 200 MB manual upload and live playback with YouTube and Vimeo remain
  unverified.
- The signed-in layout sweep passed 290 of 292 checks on its last run.
  The Wayfinding run-of-show and remote pages redirected to sign-in at
  1440px. Earlier runs hit different signed-in pages.
- Local database lint reported volatility warnings in the existing functions
  and an unused text parameter in the Before and after parser's shared
  interface. The focused pass 11 pgTAP cases passed. The broader local
  visibility SQL suite was interrupted by a database backend exit during
  its anonymous permission sweep.
- The bundled M4 acceptance kit requires the permanent practice room and
  calls its reset function. The workshop was left untouched.
- Loopback Chromium evidence covers the app pipeline. Venue Wi-Fi, the
  physical display and sound, real phones, and the complete geometry sweep
  for every board and room size remain to be verified.

## Screenshot evidence

- [Private TV](evidence/design-pass-11/novetera-very_small-dark-full-private-tv.png),
  [facilitator Results](evidence/design-pass-11/novetera-very_small-dark-full-private-results.png)
- [Framed Q&A](evidence/design-pass-11/novetera-very_small-dark-full-frame-qa.png),
  [remote Frame](evidence/design-pass-11/novetera-very_small-dark-full-frame-remote.png)
- [Scale dots](evidence/design-pass-11/novetera-very_small-dark-full-scale-5.png),
  [NPS-style bands](evidence/design-pass-11/novetera-very_small-dark-full-scale-nps.png)
- [Selection after reconnect](evidence/design-pass-11/clearway-very_small-dark-full-offline-selection-sent.png),
  [participant layout](evidence/design-pass-11/participant/)
- [Video setup](evidence/design-pass-11/clearway-very_small-dark-full-video-setup.png),
  [TV](evidence/design-pass-11/clearway-very_small-dark-full-video-tv.png),
  [live controls](evidence/design-pass-11/clearway-very_small-dark-full-video-live.png),
  [phone](evidence/design-pass-11/clearway-very_small-dark-full-video-phone.png)
- [Before and after](evidence/design-pass-11/novetera-very_small-dark-full-before-after-paired.png),
  [two source steps](evidence/design-pass-11/novetera-very_small-dark-full-before-after-sources.png),
  [private source](evidence/design-pass-11/novetera-very_small-dark-full-before-after-private-source.png),
  [participant sliders](evidence/design-pass-11/clearway-very_small-dark-full-before-after-paired-phone.png),
  [participant source answers](evidence/design-pass-11/clearway-very_small-dark-full-before-after-sources-phone.png)
- [Duplicate menu](evidence/design-pass-11/duplicate-run-of-show-menu.png),
  [target dialog](evidence/design-pass-11/duplicate-run-of-show-dialog.png),
  [Replace unavailable](evidence/design-pass-11/duplicate-run-of-show-replace-disabled.png)
- [All recorded screenshots](evidence/design-pass-11/)
