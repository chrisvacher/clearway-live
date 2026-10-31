# Marks

The Clearway mark for the live layer, as single-ink SVGs. Ink: Navy #03294E (an `<img>` cannot recolor it; in code, use `ClearwayLive.markSVG()`, which draws in `currentColor`, or a CSS mask filled with a token).

- `mark-solid.svg`: the solid mark, traced from the base `logo-mark-navy.png` (99.7% overlap with the original).
- `mark-outline.svg`: the outline mark, the solid mark's own edge drawn as a line. The base has no outline mark; this is derived from the artwork, not redrawn.

Use them as a texture only on dark TV and phone screens of the live app (the live-app exception). Everywhere else the mark is a logo: use the base's logo files and clear-space rules.
