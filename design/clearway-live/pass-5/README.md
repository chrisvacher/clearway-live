# Clearway Live · design pass 5 · milestone 5: scribe and overnight

Design pass 5 for the Clearway app (live.clearway.co): the scribe console and the scribe's phone, the scribe's cards on the control surface, the overnight drafts and their review, and the Day 2 read-back. Built on the Clearway Live design system and the approved pass 2, 3 and 4 work without restyling it. The PRD governs behaviour; the design system governs look. Seed data is Riverside Church (fictional), base year 2026, so the 10-year Future is 2036, the 3-year Vision 2029 and the 1-year Outlook 2027. Every year is computed from the base year.

## Open these

| File | What it is |
| --- | --- |
| `screens.html` | Every milestone 5 screen by screen ID and component name. Each board moves between its states without redrawing; the read-back keeps one persistent TV with its phones, control surface, remote and scribe console, in Navy and Off-White. The decisions board is first, the six motion prototypes are last |
| `docs/motion-spec.md` | The written spec for the six new movements, with tokens and reduced-motion equivalents |
| `docs/screen-index.md` | Screen IDs, the board that shows each, and the components it uses |
| `docs/design-system-changes.md` | New tokens and components, the nesting guard extended to phones, and the checks |

Open `screens.html` in Chrome, Edge or Safari. If a browser blocks local files, run `python3 -m http.server` in this folder and open http://localhost:8000/screens.html.

## Folder

| Path | Contents |
| --- | --- |
| `design-system/clearway-base/` | The base Clearway Design System, unchanged |
| `design-system/clearway-live/` | Clearway Live as published after pass 5: `live_tokens.css` (the pass 5 tokens and the nesting guard covering phones), `tokens.json`, `components/bundle.css` (the same guard), `components/bundle.js`, `README.md`, the five lens icons, and a README and live preview for each new component in `components/<Name>/` (the previews run inside the design system artifact, which serves `live-room/`) |
| `pass-2/`, `pass-3/`, `pass-4/` | The approved live room, interaction library and Wayfinding tools, unchanged. Pass 5 builds on them |
| `pass-5/pass5.css` | Pass 5 styles, tokens only. Classes `cwl-scr-*` (scribe), `cwl-ovn-*` (overnight review), `cwl-rb-*` and `cwl-lp-*` (read-back), `cwl-tc-*` (tracked changes), `cwl-cq-*` (corrections) |
| `pass-5/scribe5.js` | `window.ClearwayLivePass5`: the 19 components below, named as in code |
| `pass-5/data5.js` | Seed data: the scribe's cards, the Community draft with its sources, versions, corrections and the read-back |
| `pass-5/screens5.js` | The boards in `screens.html` |
| `pass-5/motion5.js` | The six motion prototypes |
| `pass-5/cards5.js` | The design system's live previews for the new components |
| `vendor/` | Lucide 0.441.0 and qrcode-generator 1.4.4 |

The pass 5 scripts are working reference code: port their logic into the app's components rather than loading them as scripts.

## Components

| Component | Sets |
| --- | --- |
| ScribeCard | Scribe, control, review |
| CaptureComposer | Scribe |
| EaselCapture | Scribe phone |
| ScribeFeed | Control |
| PromotedQuote | TV |
| DraftParagraph, SourcePanel, VoicesAndTensions, ReviewPresence, VersionHistory, PublishCheck | Review |
| DraftStatusList | Review, remote |
| ReadBackLens | TV |
| ReadBackTally, MissingList | TV, control |
| ReadBackPhone | Phone |
| TrackedChange | TV, phone, review |
| CorrectionQueue | Control, remote |
| LensProgress | TV, phone, control |

## Defaults to confirm

Designed to the Default. The decisions board in `screens.html` says what the other option would change.

| Decision | Default designed | The other option |
| --- | --- | --- |
| "What's missing?" on the TV | Answers appear under the paragraph as they arrive, anonymous | The control surface only; the facilitator reads them out |
| What a phone sends with "It needs a change" | A short box; the scribe records the agreed wording and reason; the facilitator accepts | A tap only; the scribe types every correction |
| How the facilitators learn the drafts are ready | The review screen and the remote show "Drafts ready" | An email to both facilitators as well |
| Reviewing on a phone | Laptop only | A read-and-accept phone view for the co-facilitator |
| Phones during the read-back | The current lens, and settled lenses to look back at | All five lenses ahead of the TV |

## Calls made in this pass

- **PromotedQuote** uses the pass 3 spotlight (Sunrise card over the Navy scrim) with the Scripture screen's light and bold treatment, because pass 3 has no separate quote screen.
- **ReadBackTally** has no leader color, so the bars never suggest the room has decided. Bars are stacked (label and count above a full-width bar) because the read-back's side column is too narrow for the pass 3 label, bar, value row.
- **The paragraph reflows calmly on the TV:** words that stay on their line slide along it; words that change line fade back in at their new place, so no word crosses the text.
- **On the TV a folded deletion leaves**; on phones and in review it stays struck through until the lens is settled.
- **Speaker names** show only in review (OVN-02's source panel and scribe cards there). The scribe's own console says "Speaker kept for the record" after capture.
- **The scribe records corrections** in the read-back with a correction composer (wording and why) on the console.
- **The nesting guard now covers phones** drawn inside an app surface. OVN-03's phone preview inside review otherwise took the light page's tokens.

## Checks (run after any change)

1. No raw hex values in `pass-5/`.
2. No `cwl-fac-` token in any TV or phone component (pass 5 uses them only under `[data-surface="control"]`).
3. Every color pairing passes WCAG AA on Navy, Off-White and the light app surfaces (pass 5's new text pairs all pass, lowest 4.27:1 for Off-White on Royal at 36px and up).
4. No em dashes, en dashes or semicolons in app copy.
5. No Sunrise on the scribe console or review; Warning and Error appear only there and on the control surface.
6. Tracked changes read in grayscale: underline for inserted, strikethrough for deleted.
7. No speaker name outside review.
8. Every year is computed from the base year; horizon terms written exactly.
