# Clearway Live · design pass 2 · milestone 2: the live room

Design pass 2 for the Clearway app (live.clearway.co), built on the Clearway Live design system as it stood on October 29, 2026 (solid-mark textures, LIVE pill on TV input screens). The PRD governs behaviour; the design system governs look.

## Open these

| File | What it is |
| --- | --- |
| `motion-review.html` | The playable motion review: a persistent TV and one phone with controls for one answer, 50 at once (with measured holds), repeat, spotlight, hide, phones down, reconnecting and restore, reduced motion, and resettable demonstrations |
| `screens.html` | Every milestone 2 screen by screen ID: FAC-04, screen check, holding, D1-01, D1-02, D1-03, FAC-01, FAC-03, SET-07, phone states, "Only you see this", failure states, and the two decisions |
| `docs/motion-spec.md` | The written motion specification for Codex |
| `docs/review-checklist.md` | The practice-room checklist for motion sign-off (the milestone 2 entry gate) |

Open either page by double-clicking it in Chrome, Edge or Safari. Everything it needs is in this folder with relative paths, including fonts and icons. If a browser blocks local files, run `python3 -m http.server` in this folder and open http://localhost:8000/motion-review.html.

## Folder

| Path | Contents |
| --- | --- |
| `design-system/clearway-base/` | The base Clearway Design System `colors_and_type.css`, unchanged, with Plus Jakarta Sans 300 to 700 |
| `design-system/clearway-live/` | Clearway Live as published: `live_tokens.css`, `tokens.json`, `components/bundle.css`, `components/bundle.js`, `README.md`, fonts, and the solid and outline marks as SVG. Unchanged |
| `pass-2/pass2.css` | Pass 2 additions, tokens only: TV stage parts, pairing code, screen check, phone states, control surface, remote, run of show, the print sheet, the church lockup, and the nesting guard |
| `pass-2/live-room.js` | The live room engine both pages use: one TV built once, a participant phone, the arrival flow with hold measurement, wall crowding, spotlight, hide, phones down, reconnect and restore |
| `pass-2/screens.js` | The renderers for every screen in `screens.html` |
| `vendor/` | Lucide 0.441.0 and qrcode-generator 1.4.4, the versions the design system loads from jsDelivr |
| `tools/build-publish.py` | Makes the copies published as claude.ai artifacts |

## Decided in this pass (Chris, October 30)

- Default TV screen: dark (Navy).
- The church on the TV: the church's logo beside Clearway's.

## Checks (run after any change)

1. No raw hex values in `pass-2/`.
2. Facilitator-only tokens (`cwl-fac-`) only under `[data-surface="control"]`.
3. No Sunrise, callout or texture on app surfaces; Warning and Error only on app surfaces.
4. The 50-answer demonstration reports Pass on the practice-room TV computer.
5. Every TV and phone root carries a `data-screen` type.
