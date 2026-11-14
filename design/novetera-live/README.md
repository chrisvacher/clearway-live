The Novetera skin of Clearway Live: Novetera's values for every `--cwl-*` role, so the TV, the phones and the join page can draw as Novetera. It sits beside `design/clearway-live/`, which it reads and never edits. It is scoped to `[data-skin="novetera"]`: nothing outside such an element changes.

Source: the token map in the Novetera skin spec and the Live layer artboard of the canvas "Novetera Live: room skin for approval". Where they differ, the canvas wins (see "Differences" below).

## Files

| File | What it is |
| --- | --- |
| `novetera_tokens.css` | The overrides. Imported in `app/globals.css` after `live_tokens.css`. Palette values are named in comments; raw hex lives only here. |
| `novetera_fonts.css` | `@font-face` for Public Sans (400, 500, 600, 700, 800) and Source Serif 4 italic (400), files in `public/fonts/novetera/`, `font-display: swap`. A browser downloads a face only when text in a Novetera element uses it. |
| `../../components/brand/novetera-mark.tsx`, `novetera-lockup.tsx`, `novetera-brand.css` | The N mark (with its live state) and the full lockup. Not used on any screen yet. |

The Word download (a later batch) embeds the TrueType files in `lib/export/assets/fonts/novetera/` (Public Sans 400 and 700, Source Serif 4 italic). `next.config.ts` traces them into `/api/control/*/summary` and `/api/control/*/export`. Licence texts (SIL Open Font Licence 1.1) sit beside every font file.

## Switching it on

Put `data-skin="novetera"` on a root that also carries `data-surface` and `data-theme` (the TV, a phone, the join page). The skin element must carry its own `data-theme`; without one it is dark.

- Dark is Charcoal, light is Chalk. A light region inside a dark skin element, or a dark region inside a light one, takes its own values, as in `live_tokens.css`.
- A Novetera TV drawn inside the Clearway control surface (the preview, the remote's mirror) draws Novetera. Every selector repeats `[data-skin="novetera"]` three times, which lifts it above `live_tokens.css`'s nesting guards (up to specificity 0,3,0), so neither the guards nor `[data-surface="control"]` reach it.
- Roles Clearway sets and the skin leaves alone (the TV type ramp, room size, spacing, motion durations and easing, lockup heights) keep Clearway's value on purpose. `tests/unit/novetera-skin.test.ts` lists them, and fails on any role that is neither set here nor listed, so a role added to `live_tokens.css` later cannot fall back to Clearway unnoticed.
- A role that is derived from another role resolves where it is declared, so a derived role the skin changes is declared again here (the test checks this too).

## New roles

Clearway does not define these. A component reads each with a fallback to the Clearway role it replaces, for example `var(--cwl-surface-holding, var(--cwl-surface))`, so the same component works in both skins.

| Role | Job | Fall back to |
| --- | --- | --- |
| `--cwl-font-editorial` | Source Serif 4, set in italic: Scripture, prayer, quotes, the tagline | `--cwl-font` |
| `--cwl-surface-holding` | The TV join screen's ground | `--cwl-surface` |
| `--cwl-text-holding`, `--cwl-text-muted-holding`, `--cwl-presence-holding` | Text, muted text and arriving names on that ground | `--cwl-text`, `--cwl-text-muted`, `--cwl-presence` |
| `--cwl-mark-holding`, `--cwl-edge-holding` | The mark's second stroke and the code card's edge on that ground | `--cwl-mark-quiet`, `--cwl-card-edge` |
| `--cwl-code-ground`, `--cwl-code-ink` | The room code (QR): White with Charcoal ink, on every option | `--cw-white`, `--cw-navy` |
| `--cwl-mark-stroke`, `--cwl-mark-quiet`, `--cwl-mark-live` | The N mark's first stroke, its second stroke when nothing is live, and when the room is live | `--cwl-wordmark-*` |
| `--cwl-card-edge`, `--cwl-eyebrow` | A hairline on white and Chalk cards (none on dark grounds), and eyebrow text. Both are in the canvas. | `--cwl-border`, `--cwl-text-muted` |

## The join screen: one line

The canvas draws three join grounds: Charcoal, Chalk and Oxblood 700. Chris has not chosen, so the choice is one number in `novetera_tokens.css`:

```css
--nvl-join: 0; /* <<< THE ONE LINE: 0 Charcoal, 1 Chalk, 2 Oxblood 700 */
```

Change `0` to `1` or `2` and the ground, text, muted text, names, the mark's second stroke and the code card's edge all follow, because the `--cwl-*-holding` roles above pick from three option palettes written out once beside it (`--nvl-join-charcoal-*`, `--nvl-join-chalk-*`, `--nvl-join-oxblood-*`). The join screen reads the `-holding` roles, never an option palette. Charcoal is the value now. `tests/unit/contrast.test.ts` checks all three options for text contrast.

## What the skin turns off

- Texture: `--cwl-texture-ink: transparent`, the `--cwl-tex-*` opacities 0. Glow: `--cwl-glow: none`.
- The AI icon is flat: `--cwl-ai-start`, `--cwl-ai-end` and `--cwl-ai-glint` are one ink (Chalk on dark, Charcoal on light), so there is no gradient and no sweep to see. The AI summary band is flat Stone 150.
- Radii are 2px (controls, markers) and 4px (cards, TV panels), with Novetera's hairline shadow.

## Type

`--cwl-font` and the base `--font-sans` are Public Sans, and the skin element sets `font-family` so text inherits it from the skin root. The base `--fw-light`, which the TV headlines read, is 700 here: Novetera has no light weight. Class rules that write a literal `font-weight: 300` or `text-transform: uppercase` (`.cwl-tv-headline`, `.cwl-phone-button`) are not tokens, so a later batch scopes them to the skin if the canvas needs it.

TV text fit is measured in the browser (`tv-screen.tsx` shrinks `--cwl-fit-scale` until the scene fits), so it needs no per-font value, and `--cwl-check-*` are the screen-check ladder's calibration sizes in pixels. Both stay as they are. Measured, Public Sans against Plus Jakarta Sans at the TV sizes: main, body and floor text run about 2% narrower, display and eyebrow within 1%, and the headline (700 against Jakarta 300) about 3% wider.

## Differences between the spec and the canvas

- The canvas draws the AI icon as a gradient (Oxblood 300 to Brass 300 on dark, Oxblood 700 to Ochre on light, with a sweep). The spec, and the coordinator's brief from Chris's November 13 decision, make it flat. The skin is flat. To follow the canvas instead, set `--cwl-ai-start`, `--cwl-ai-end` and `--cwl-ai-glint` to those values in the two theme blocks.
- The canvas draws the wordmark and several headlines at weight 800; the spec says headlines are 700. Public Sans 800 is therefore shipped.

## Tests

`tests/unit/contrast.test.ts` (each skin and theme, the join options, the ten group and item tints), `tests/unit/novetera-skin.test.ts` (every role has a value, nothing matches outside the skin, the themes agree, fonts and licences exist, the TrueType files are traced).
