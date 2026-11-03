# Clearway Live · design pass 4 · milestone 4: the Wayfinding session tools

Design pass 4 for the Clearway app (live.clearway.co), built on the Clearway Live design system and the approved pass 2 and pass 3 live room. The PRD governs behaviour; the design system governs look. Seed data is Riverside Church (fictional), base year 2026.

## Open these

| File | What it is |
| --- | --- |
| `screens.html` | Every milestone 4 screen by screen ID and component name, each interaction as one persistent TV with its states, the phones, the control surface and the remote, in Navy and Off-White. The five new motion prototypes are at the end |
| `docs/motion-spec.md` | The written spec for the five new movements, with tokens and reduced-motion equivalents |
| `docs/screen-index.md` | Screen IDs, the board that shows each, and the components it uses |
| `docs/design-system-changes.md` | New tokens and components, and the two fixes that match the design system to the code |

Open `screens.html` in Chrome, Edge or Safari. If a browser blocks local files, run `python3 -m http.server` in this folder and open http://localhost:8000/screens.html.

## Folder

| Path | Contents |
| --- | --- |
| `design-system/clearway-base/` | The base Clearway Design System, unchanged |
| `design-system/clearway-live/` | Clearway Live as published after pass 4: `live_tokens.css` (new tokens, the nesting guard and the app scrim matched to the code), `tokens.json`, `components/bundle.css`, `components/bundle.js`, `README.md`, and the five lens icons in `assets/Icons/` |
| `pass-2/`, `pass-3/` | The approved live room and interaction library, unchanged. Pass 4 builds on them |
| `pass-4/pass4.css` | Pass 4 styles, tokens only. Component classes are `cwl-wf-*` |
| `pass-4/wayfinding.js` | `window.ClearwayLivePass4`: LensIcon, LensWall, CandidateList (CandidatePriorities), OutcomeBullets, OutcomeConfirm (OutcomeConfirmRow), PremortemGrid, CoreGoalBuilder (GoalCard), IntentBoard (IntentCard), MapDraft (ClearwayMapDraft), and the phone, remote and control helpers |
| `pass-4/motion4.js` | The five motion prototypes, and `handIn()` for the remote changing hands |
| `pass-4/data4.js` | Seed data. Every year is computed from the base year |
| `pass-4/screens4.js` | The boards in `screens.html` |
| `pass-4/cards4.js` | The design system's live previews for the new components |
| `vendor/` | Lucide 0.441.0 and qrcode-generator 1.4.4 |

`design-system/clearway-live/components/bundle.js` and the pass 4 scripts are working reference code: port their logic into the app's components rather than loading them as scripts.

## Milestone 4 decisions (confirmed November 3)

| Decision | Decided |
| --- | --- |
| Pre-work before the pre-call | None. The pre-call is the start, and celebrations and success measures begin live in the call |
| Seeded lens sentences | Hidden from everyone, the facilitator included, until each lens opens. The facilitator sees only how many have been written |
| A current-reality line per Vision Outcome | Left out |
| This Year's Priorities | Left for the church's Annual Planning. The draft Map shows that field empty |
| The day-and-a-half follow-up | On video within two weeks, with a team facilitator holding the remote |

## Checks (run after any change)

1. No raw hex values in `pass-4/`.
2. No `cwl-fac-` token in any TV or phone component.
3. Every color pairing passes WCAG AA (pass 4's 34 new pairs all pass).
4. No em dashes, en dashes or semicolons in app copy.
5. No Sunrise or `cwl-flag` on app surfaces. Light-screen flags use the dashed `cwl-text` edge.
6. Every prompt shows years computed from the base year and the engagement's lens names.
