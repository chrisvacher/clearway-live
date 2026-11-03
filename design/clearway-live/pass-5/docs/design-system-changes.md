# Design system changes · design pass 5

## New tokens (live_tokens.css, tokens.json and the README)

| Token | Value | Use |
| --- | --- | --- |
| `cwl-app-source-word` | Sky 50% (`cwl-sky-light`) | App surfaces only. The source words highlighted in a source card and on an easel photo. Navy text on it is 11.1:1 |
| `cwl-dur-source-light` | 400ms | The selected sentence's tint and the highlight sweeping across its source words |
| `cwl-dur-tc-strike` | 400ms | The strike or underline of a tracked change drawing across |
| `cwl-delay-tc-leave` | 900ms | Struck words staying readable on the TV before they leave |
| `cwl-tc-line` | 0.08em | Thickness of the tracked-change lines, in the text's own color |
| `cwl-tc-offset` | 0.18em | Gap under inserted words |

Everything else reuses existing tokens: `cwl-dur-line-replace` (restore), `cwl-dur-bar-grow` and the pass 3 bar colors (tally), `cwl-dur-outcome-confirm` (settle), `cwl-dur-map-field` (next lens), the spotlight tokens (promoted quote). Scribe card kinds need no colors: icon and word.

## Nesting guard: now covers phones

The guard re-declared a dark TV's tokens inside an app surface. A dark phone inside an app surface (OVN-03's read-back preview inside review) inherited the light page's text and surface tokens instead. The selector is now `:is([data-surface="control"], [data-surface="setup"], [data-surface="scribe"], [data-surface="review"]) :is([data-surface="tv"], [data-surface="phone"])`, in `live_tokens.css` and repeated in `bundle.css`. The app's `design/clearway-live/live_tokens.css` needs the same change. Checked in OVN-03 on Navy and Off-White: both previews keep their own theme.

## New components (README and live preview each, group "Scribe and overnight")

ScribeCard · CaptureComposer · EaselCapture · ScribeFeed · PromotedQuote · DraftParagraph · SourcePanel · VoicesAndTensions · ReviewPresence · VersionHistory · DraftStatusList · PublishCheck · ReadBackLens · ReadBackTally · ReadBackPhone · MissingList · TrackedChange · CorrectionQueue · LensProgress

Updated: README (app surface rules for scribe and review, the source word color, the six movements in the motion table, the component list, checks 8, 11 and 12), MotionTokens, ScribeTagChips (Mitigation on key 6 inside CaptureComposer).

## Contrast

Every new text pairing passes WCAG AA. Lowest: Off-White on Royal for the current lens chip at 36px and up (4.27:1, large text), Off-White on Deeper Royal on phones (4.87:1), Royal focus ring on white (4.49:1).
