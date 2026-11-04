# Clearway Live · design pass 7 · milestone 7: CORE and after

Design pass 7 for the Clearway app (live.clearway.co): Publish to CORE (the check, the publish from the control surface and the remote, and publishing again) and what happens after the retreat (the report draft with Word and PDF export, the visibility plan, the read-only copy for the elders, and the 30, 60 and 90-day check-ins with their results). Built on the Clearway Live design system and the approved pass 2 to 6 work, with Riverside Church's seed data.

## Open these

| File | What it is |
| --- | --- |
| `screens.html` | Every milestone 7 screen by screen ID and component name. Each board moves between its states without redrawing. The decisions board is first, the two motion prototypes are last |
| `docs/motion-spec.md` | The written spec for the two new movements, with tokens and reduced-motion equivalents |
| `docs/screen-index.md` | Screen IDs, the board that shows each, and the components it uses |
| `docs/design-system-changes.md` | What changed in the design system copy (the AI icon in gradient ink with a sweep) and the checks |

Open `screens.html` in Chrome, Edge or Safari. If a browser blocks local files, run `python3 -m http.server` in this folder and open http://localhost:8000/screens.html.

## Folder

| Path | Contents |
| --- | --- |
| `design-system/clearway-base/` | The base Clearway Design System, unchanged |
| `design-system/clearway-live/` | Clearway Live with the AI icon in gradient ink (`.cwl-ai-mark`, `sweepAi`) matching the app's tokens |
| `pass-2/` to `pass-6/` | The approved earlier work, unchanged. Pass 7 builds on them |
| `pass-7/pass7.css` | Pass 7 styles, tokens only. Classes `cwl-c7-*` (CORE and shared), `cwl-rp-*` (report), `cwl-vp-*` (visibility plan), `cwl-ci-*` (check-ins), `cwl-ro-*` (read-only copy) |
| `pass-7/core7.js` | `window.ClearwayLivePass7`: the components below, named as in code |
| `pass-7/data7.js` | Seed data: the CORE organization, plans, outcomes, goals, first steps, gaps, overlaps, the report sections, the visibility plan rows, check-in answers and share links |
| `pass-7/screens7.js` | The boards in `screens.html` |
| `pass-7/motion7.js` | The two motion prototypes |
| `vendor/` | Lucide 0.441.0 and qrcode-generator 1.4.4 |

The pass 7 scripts are working reference code: port their logic into the app's components rather than loading them as scripts.

## Components

| Component | Sets |
| --- | --- |
| CoreConnection, OverlapList, ReadinessRegister, OwnerMatch, PublishSummary, PublishButton | Setup (COR-01) |
| PublishConfirm, PublishProgress, RemotePublish | Control surface and remote (COR-02) |
| PublishedTV, PublishedPhone | TV and phone (COR-02) |
| PublishHistory, SecondPublish | Setup (COR-03) |
| SectionList, SectionBody, SourcesPanel, SignOffBar, ExportPanel, WordPreview | Setup (AFT-01) |
| VisibilityPlan | Setup (AFT-02) |
| ShareLinks | Setup (AFT-03) |
| ReadOnlyCopy | Phone and laptop, public by link (AFT-03) |
| CheckInEmail, CheckInPhone | Email and phone (AFT-04) |
| CheckInResults | Setup (AFT-05) |

## Calls made in this pass

- **Overlaps come first.** What may already be in CORE shows before the readiness check, and publishing waits until each overlap has a decision.
- **The publish is one transaction.** While it runs nothing shows as created. It commits whole or fails with the reason and nothing partial. Invitations are sent after the save, so a failed invitation never undoes the goals.
- **A second publish adds only what is new** and never edits or removes a record in CORE.
- **Commander's intent has no home in CORE.** The publish screen says so before the button, and the intent stays in the report, the Map and the read-only copy.
- **The 10-year Future in the report** is shown as signed off in the room: the five lens summaries approved on Day 1, word for word.
- **Phones carry no Warning or Error colors.** The check-in shows CORE status by label and icon.

## Fixed while checking

The AI icon in the pass 6 copy of the design system was still the old badge tile. The pass 7 copy ports the app's gradient-ink icon and its single sweep.
