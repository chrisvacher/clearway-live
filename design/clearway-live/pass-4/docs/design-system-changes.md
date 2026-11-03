# Design system changes · design pass 4

## Fixed to match the code

**Nesting guard.** The app keeps the guard in `design/clearway-live/live_tokens.css`, scoped to a TV inside an app surface (`[data-surface="control"] [data-surface="tv"]`). The design system had it in `bundle.css` on every TV and phone. It now lives in `live_tokens.css` with the app's scope, listing all four app surfaces (control, setup, scribe, review) so a TV preview on setup or review keeps its theme too. `bundle.css` repeats the block only because design system previews load it instead of `live_tokens.css`.

The design system's block also re-declares four tokens the app's block leaves out on a dark TV: `--cwl-bar-track`, `--cwl-bar-label`, `--cwl-cut-line` and `--cwl-focus-ring` (plus `--cwl-offline` and the AI gradient ends). Without them, a dark TV mirror inside the light remote picks up the light bar track and cut line. The app's block should add them.

**App scrim.** `cwl-app-scrim` (Navy at 40%) is declared under the app surfaces only, as in the code, and its usage now matches the code: behind app modals, side panels and the remote's bottom sheets (`.ctl-sheet-scrim`). Updated in `live_tokens.css`, `tokens.json`, the README, AppModal and PhoneRemote.

## New tokens

| Token | Value | Use |
| --- | --- | --- |
| `cwl-lens-small` | Deeper Royal | Lens chips and dots below 20px (4.9:1 with Off-White) |
| `cwl-flag`, `cwl-on-flag` | Sunrise, Navy | Needs fixing, TV and phones only. Unset on app surfaces |
| `cwl-flag-width`, `cwl-flag-gap` | 6px, 5px | The flag outline on dark screens |
| `cwl-typing` | Royal | The underline under an intent-card field in use |
| `cwl-letter-hatch-ink`, `cwl-letter-hatch` | Navy at 18% | The hatch in a missing CORE letter |
| `cwl-held-dim` | 0.5 | Remote controls while someone else holds the remote |
| `cwl-dur-cluster-drift` | 900ms | Sentence drifting into its cluster |
| `cwl-dur-cluster-label` | 600ms | Cluster label growing |
| `cwl-dur-outcome-confirm` | 700ms | The Lime sweep on a confirmed outcome |
| `cwl-dur-line-replace` | 240ms | A rewritten line crossfading |
| `cwl-dur-field-lock` | 3000ms | A card field held for one phone |
| `cwl-dur-remote-hand` | 500ms | The remote changing hands |
| `cwl-dur-map-field` | 700ms | A draft Map field rising into place |
| `cwl-delay-type-batch` | 120ms | Most often the TV applies typed edits |
| `cwl-delay-map-step` | 160ms | Between draft Map fields |

## New components

LensIcon · LensWall · CandidatePriorities · OutcomeBullets · OutcomeConfirmRow · PremortemGrid · CoreGoalBuilder (with GoalCard) · IntentCard · RemoteHandover · ClearwayMapDraft. Each has a README and a live preview in the design system.

Updated: LensHeading (the new icons), ScriptureScreen (Day 1 close, Day 2 prayer and listening), MotionTokens (the five new movements), PhoneRemote (sheets, handed over), AppModal (scrim scope), the README (lens identity, flags, motion table, checks 8 to 10), and the Icons asset group (the five lens icons).

## Lens icons

Drawn for Clearway Live on a 24px grid, 2px round strokes in `currentColor`. They replace the Lucide stand-ins (users, map-pin, compass, settings, book-open) on every surface and in the report.

| Lens | Drawn as |
| --- | --- |
| Congregation | three figures in an arc: people gathered |
| Community | two houses on one street |
| Leadership | a flag on the summit |
| Operations | connected parts of one system |
| Learning | an open book with a new shoot |
