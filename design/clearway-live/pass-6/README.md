# Clearway Live · design pass 6 · milestone 6: Discover and the alignment signal

Design pass 6 for the Clearway app (live.clearway.co): Discover in the app (the congregational survey read from Team Hub, survey results and themes in setup and in the room, the Four Helpful Lists, leadership interviews and input conversations, What We Heard from accepted themes) and the alignment signal on the facilitator's private view and own remote. Built on the Clearway Live design system and the approved pass 2 to 5 work without restyling it. The PRD governs behaviour, except where the pass 6 brief records a decision made since (the survey lives in Team Hub, decided November 3). The design system governs look. Seed data is Riverside Church (fictional), base year 2026: 87 survey responses from Team Hub's Wayfinding template, 6 of them under 30, 5 leadership interviews, an elders conversation, a staff conversation, and 7 elders for the Four Helpful Lists. Every number is computed from the seed data.

## Open these

| File | What it is |
| --- | --- |
| `screens.html` | Every milestone 6 screen by screen ID and component name. Each board moves between its states without redrawing, in Navy and Off-White. The decisions board is first, the six motion prototypes are last |
| `docs/motion-spec.md` | The written spec for the six new movements, with tokens and reduced-motion equivalents |
| `docs/screen-index.md` | Screen IDs, the board that shows each, and the components it uses |
| `docs/design-system-changes.md` | The new token and components, the nesting guard extended to the live marker, and the checks |

Open `screens.html` in Chrome, Edge or Safari. If a browser blocks local files, run `python3 -m http.server` in this folder and open http://localhost:8000/screens.html.

## Folder

| Path | Contents |
| --- | --- |
| `design-system/clearway-base/` | The base Clearway Design System, unchanged |
| `design-system/clearway-live/` | Clearway Live as published after pass 6 (version 42): `live_tokens.css` (with `cwl-dur-signal-in`), `tokens.json`, `components/bundle.css` (the marker nesting guard), `components/bundle.js`, `README.md`, and a README and live preview for each new component in `components/<Name>/` (the previews run inside the design system artifact, which serves `live-room/`) |
| `pass-2/` to `pass-5/` | The approved live room, interaction library, Wayfinding tools and scribe and overnight work, unchanged. Pass 6 builds on them |
| `pass-6/pass6.css` | Pass 6 styles, tokens only. Classes `cwl-d6-*` (setup and Discover), `cwl-sr-*` (survey results in the room), `cwl-fl-*` (Four Helpful Lists), `cwl-wwh-*` (What We Heard), `cwl-sg-*` (the signal, scoped to `[data-surface="control"]`) |
| `pass-6/discover6.js` | `window.ClearwayLivePass6`: the components below, named as in code |
| `pass-6/data6.js` | Seed data: the linked survey, its questions and counts, themes, duplicates, interview files and themes, the Four Helpful Lists cards, What We Heard headlines and the signals. Holds the thin data rule as code (`isThin`) |
| `pass-6/screens6.js` | The boards in `screens.html` |
| `pass-6/motion6.js` | The six motion prototypes |
| `pass-6/cards6.js` | The design system's live previews for the new components |
| `vendor/` | Lucide 0.441.0 and qrcode-generator 1.4.4 |

The pass 6 scripts are working reference code: port their logic into the app's components rather than loading them as scripts. The app reads Team Hub's `surveys` and `survey_responses` and never writes to them.

## Components

| Component | Sets |
| --- | --- |
| SurveyLink, ResponseCount, QuestionResult, SegmentFilter, DuplicateFlag, NotesUpload | Setup |
| SurveyResultScreen | TV, phone, control |
| DiscoverTheme (with ThemeList) | Setup |
| ThinFlag | Setup, control, TV, phone |
| FourListsBoard | TV, control mirror |
| FourListsCard | TV, phone, setup |
| FourListsComposer | Phone |
| WhatWeHeardHeadline | Setup, TV, phone |
| SignalCard, SignalDetail (with SignalPanel) | Control |
| SignalList | Remote, the facilitator's own only |

## Calls made in this pass

- **Survey status** reads Draft, Open and Closed in the app. Team Hub's own word for Open is published.
- **Setup results keep the survey's option order,** so a refresh grows bars in place and nothing trades places. In the room, choice results use the pass 3 bars, leader first.
- **A thin result in the room drops the Sunrise number,** so thin data is never the screen's look-here moment.
- **Save as a citation shows on aligned signals only,** following the PRD. The other kinds offer the neutral question and Dismiss.
- **The neutral question hides the room's count and the AI line** while it's up, so the TV carries no data at all.
- **Hidden segments never show their count,** only that they're hidden and why.

## Fixed while checking

The control surface's TV mirror kept its theme with the signal panel open, but its live marker shrank to the app's 24px: the app rule `.cwl-app .cwl-live-marker` reached into the nested TV. `bundle.css` now guards the marker size for a TV or phone inside an app surface. The app isn't affected: its TV marker (`.tv-live` in `app/globals.css`) has a fixed size of its own.
