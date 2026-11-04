# Clearway Live · design pass 4b · live lens summaries and follow-up access

Design pass 4b for the Clearway app (live.clearway.co): the 10-year Future drafted live on Day 1 and signed off lens by lens, the team facilitator's follow-up access without a Clearway sign-in, and two pass 5 revisions (the Day 2 confirm and the overnight review). Built on the Clearway Live design system and the approved pass 2 to 5 work without restyling it. The PRD governs behaviour; the design system governs look. Seed data is Riverside Church (fictional), base year 2026, so the 10-year Future is 2036, the 3-year Vision 2029 and the 1-year Outlook 2027. Every year is computed from the base year.

## Open these

| File | What it is |
| --- | --- |
| `screens.html` | Every pass 4b screen by screen ID and component name. The decisions board is first, the three motion prototypes are last. Each board moves between its states without redrawing, in Navy and Off-White where the TV is shown |
| `docs/motion-spec.md` | The written spec for the three movements, with tokens and reduced-motion equivalents |
| `docs/screen-index.md` | Screen IDs, the board that shows each, and the components it uses |

Open `screens.html` in Chrome, Edge or Safari. If a browser blocks local files, run `python3 -m http.server` in this folder and open http://localhost:8000/screens.html.

## Folder

| Path | Contents |
| --- | --- |
| `design-system/` | The base Clearway Design System and Clearway Live as published after pass 5, with the AI icon tokens matching the app after PR #58. No new tokens |
| `pass-2/`, `pass-3/`, `pass-4/`, `pass-5/` | The approved earlier passes, unchanged. Pass 4b builds on them and reuses ReadBackLens, TrackedChange, MissingList, CorrectionQueue, LensProgress, DraftStatusList and the review components |
| `pass-4b/pass4b.css` | Pass 4b styles, tokens only. Classes `cwl-ai-mark`, `cwl-ls-*` (summary on the TV), `cwl-lsp-*` (phone), `cwl-lsc-*` (control), `cwl-fu-*` (follow-up access), `cwl-ovo-*` (overnight outcomes) |
| `pass-4b/lens4b.js` | `window.ClearwayLivePass4b`: the components below, named as in code |
| `pass-4b/data4b.js` | Seed data: the five lens summaries with their source sentences and suggestions, the follow-up access, the overnight outcomes |
| `pass-4b/screens4b.js` | The boards and motion prototypes in `screens.html` |
| `vendor/` | Lucide 0.441.0 and qrcode-generator 1.4.4 |

The scripts are working reference code: port their logic into the app's components rather than loading them as scripts.

## Components

| Component | Sets |
| --- | --- |
| LensSummaryTV | TV |
| SummaryPhone | Phones |
| SummaryEditor, SuggestionList, VersionList, DecisionPanel, LensSignoff | Control surface |
| FollowUpIssue | Setup |
| FollowUpPair, FollowUpScope | The team facilitator's link page |
| TeamRemote | Team remote |
| ConfirmLens | TV (Day 2 confirm) |
| OutcomeStatusList, OutcomeDraft, OutcomeSources, PublishDay2 | Overnight review |

## Rules held

The screen is alive: every suggestion appears on the TV as it arrives, and existing text animates, regroups and resizes. The tally shows where the room is with no leader color and never decides: the facilitator marks the decision. Names never show on the TV. The alignment signal, presenter notes and Discover data never reach the TV, phones or the team remote. Copy is sentence case with no dashes.
