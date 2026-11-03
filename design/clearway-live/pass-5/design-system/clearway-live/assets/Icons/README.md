# Icons

**AI icon** (`ai-generative.svg`): "Generative" by LAFS on Flaticon (flaticon.com/free-icon/generative_16806607), a rounded square holding the letters AI with a four-point sparkle at its corner. Chosen by Chris, Nov 2 2026, for every place AI is involved.

**License:** Flaticon's free license allows commercial use with attribution. Credit it as "Generative icon by LAFS from Flaticon" (for example on an About or credits page of live.clearway.co), or use a Flaticon Premium license, which drops the attribution. This file was traced from Flaticon's 512px PNG; replace its path with the official SVG download when you have it (same 24 by 24 frame).

**Usage:**
- In code, never place the file directly: use `ClearwayLive.aiIcon()` (currentColor), `aiBadge()` (Navy icon on the AI gradient badge) or `aiBadge(true)` (the icon filled with the AI gradient). `lucide("sparkles")` returns the AI icon, so no sparkles icon ever appears on its own.
- On the AI gradient, the icon is always Navy (`cwl-on-ai`). Off-White on this gradient falls below 3:1, so it is not used.
- Never recolor it outside these three forms, never stretch or rotate it, and never put it next to the word AI (the icon already says AI).

**Lens icons** (`lens-congregation.svg`, `lens-community.svg`, `lens-leadership.svg`, `lens-operations.svg`, `lens-learning.svg`): drawn for Clearway Live in design pass 4 on a 24 by 24 grid with 2px round strokes, so they sit beside Lucide. Congregation: people gathered. Community: two houses on one street. Leadership: a flag on the summit. Operations: connected parts of one system. Learning: an open book with a new shoot.

**Ink:** the files stroke in `currentColor`, so an `<img>` shows them black. In code, never place the files: use `ClearwayLivePass4.lensIcon(key)` inline, which takes the text color around it (`cwl-on-lens` in a lens heading or chip, `cwl-text` elsewhere). Always pair the icon with the lens name, and use the same icon on every surface and in the report.
