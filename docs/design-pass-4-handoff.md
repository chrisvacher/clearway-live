# Design pass 4 handoff

Design pass 4 covers milestone 4: the Wayfinding session tools. The reference export is in `design/clearway-live/pass-4/` (start with its `README.md` and `screens.html`). Its HTML files use relative paths. The export code is design reference, not an application script.

Archive SHA-256 (`clearway-live-design-pass-4.zip`, November 3, 2026): `3609846b4bedda7eb43341d292ae7480e0316bfc378dd8c891ecf759b2b16d40`.

## What's in it

- Hi-fi screens by screen ID (PRE-06 to PRE-11, D1-04 to D1-13, D2-01, D2-02, D2-05 to D2-15, INT-12, INT-13, INT-15, INT-16, SET-08), each interaction with every state: empty, first item, typical, crowded (50 phones), offline and queued, phones down, AI off, reduced motion and very long text, plus the Wayfinding states.
- Components named as they'll be in code: LensIcon, LensWall, CandidatePriorities, OutcomeBullets, OutcomeConfirmRow, PremortemGrid, CoreGoalBuilder (GoalCard), IntentCard, RemoteHandover, ClearwayMapDraft. The index is `pass-4/docs/screen-index.md`.
- Five motion prototypes with tokens and reduced-motion equivalents: sentences drifting into clusters, an outcome confirming, intent-card lines replacing as people type, the remote changing hands, the Map assembling. The spec is `pass-4/docs/motion-spec.md`.
- The lens icons (one Royal lens color, five drawn icons) in `pass-4/design-system/clearway-live/assets/Icons/`.

## Changes in this pull request beyond the export

- `design/clearway-live/live_tokens.css` gains the pass 4 tokens: `cwl-lens-small`, the flag tokens (`cwl-flag`, `cwl-on-flag`, `cwl-flag-width`, `cwl-flag-gap`, unset on app surfaces), `cwl-typing`, the CORE letter hatch, `cwl-held-dim`, seven durations and two delays.
- The nesting guard is completed. A dark TV mirror inside an app surface now re-declares the bar track, bar label, cut line, focus ring, offline and AI tokens, so it no longer picks up the light bar track and cut line inside the light remote. It also covers setup, scribe and review, and keeps the light leader word Navy.

## Decided November 3

Chris confirmed the five milestone 4 decisions. The PRD is updated.

| Decision | Decided |
| --- | --- |
| Pre-work before the pre-call | None. The pre-call is the start |
| Seeded lens sentences | Hidden from everyone, the facilitator included, until each lens opens. The facilitator sees only how many have been written |
| A current-reality line per Vision Outcome | Left out |
| This Year's Priorities | Left for the church's Annual Planning. The draft Map shows that field empty |
| The day-and-a-half follow-up | On video within two weeks, with a team facilitator holding the remote |

## Review changes after delivery (November 3)

- PRE-06 opens on 1 Corinthians 3:5-8 (New Living Translation), set at `tv-body`.
- PRE-10's five lens headings are centred.
- Lens wall clusters all use the word wall's group styling (one panel color), with outlined cluster numbers and the count in the wall's filled marker, so no cluster reads as weightier than another.
- Candidate priorities on the TV show the number and title only. Sources, lenses and the AI badge stay on the control surface.

Not in this pass: the read-back (D2-03, D2-04, INT-14), which is design pass 5. The alignment signal's place on the control surface is left for milestone 6.
