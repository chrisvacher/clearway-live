# Design system changes in pass 6

The Clearway Live design system artifact is at version 42.

## Token

| Token | Value | Use |
| --- | --- | --- |
| `cwl-dur-signal-in` | 900ms | An alignment signal card coming into the private panel: a soft fade and an 8px rise on `cwl-ease-calm`, slower than a room arrival. No ring, no color flash, no sound. Added to `live_tokens.css`, `tokens.json` and the README motion table |

No new colors. The thin flag, AI drafted marker, Four Helpful Lists columns and signal kinds use existing tokens, and each reads without color (icon, label, dashed outline, heading and position). The signal uses the existing facilitator-only `cwl-fac-signal-*` tokens, and every `cwl-sg-*` rule is scoped to `[data-surface="control"]`.

## Components

Sixteen new component cards, each with a README and a live preview: SurveyLink, ResponseCount, QuestionResult, SurveyResultScreen, SegmentFilter, DuplicateFlag, DiscoverTheme, ThinFlag, NotesUpload, FourListsBoard, FourListsCard, FourListsComposer, WhatWeHeardHeadline, SignalCard, SignalDetail, SignalList. The previews run on `live-room/pass6.css`, `data6.js`, `discover6.js` and `cards6.js`.

## Nesting guard

`bundle.css` adds a guard so a TV or phone drawn inside an app surface keeps its own live marker size (72px on the TV, 28px or 32px on a phone). Before, `.cwl-app .cwl-live-marker` shrank the control surface's TV mirror marker to 24px. This is a reference bundle fix only: the app's TV marker (`.tv-live`) sets its own size. The theme guard from passes 4 and 5 held with the signal panel open.

## Checks

- No raw hex in `pass6.css` or the new components.
- No `cwl-fac-*` token outside `[data-surface="control"]`.
- No em dashes, en dashes or semicolons in app copy.
- New pairings pass WCAG AA: gray-600 on gray-100 6.9:1, gray-600 on Off-White 7.2:1, white glyph on the Divergent disc 3.2:1 (icon). Every other pairing was already in the Contrast pairs card.
- Every state, theme and button on every board, and every preview card, ran with no console errors.
