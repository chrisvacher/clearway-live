# Design system changes in pass 7

No new tokens in the app. The pass 7 copy of the design system matches the app's AI icon.

## What changed in the copy

| File | Change |
| --- | --- |
| `design-system/clearway-live/live_tokens.css` | Adds `--cwl-bright-chartreuse`, `--cwl-ai-glint` and `--cwl-dur-ai-sweep`, and sets the AI gradient by ground: Sky to Soft Lime to White on dark, Royal to Bright Chartreuse to Sky on light and app surfaces |
| `components/bundle.css` | Replaces the AI badge tile (`.cwl-ai-badge`, `.cwl-ai-glyph`) with `.cwl-ai-mark`: the icon drawn as a mask over the gradient |
| `components/bundle.js` | `aiBadge` and `aiGlyph` return the new mark. New `sweepAi(target)` runs the single sweep with Web Animations and skips it under reduced motion |

No new colors elsewhere. Every pass 7 color, size and duration is a token, and each status reads without color (icon and label).

## Checks

No raw hex in `pass7.css`, `core7.js`, `screens7.js` or `motion7.js` apart from the Word preview pages, which use Clearway base tokens. No em or en dashes. The TV and phones carry no names, no alignment signal, no Discover data and no Warning or Error colors.
