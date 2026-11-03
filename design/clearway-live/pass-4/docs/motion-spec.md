# Motion spec · design pass 4

The screen is alive: every input appears at once, and existing items move, regroup and resize as new input arrives, with no refresh and no reveal step. These five movements join the pass 2 and 3 set. Every duration, easing and delay is a token in `live_tokens.css`. Play each in `screens.html` under "Motion".

## 1. Sentences drifting into clusters, labels growing (LensWall, INT-12)

- A sentence lands in the right-hand column the moment it's sent (`cwl-dur-arrive`, `cwl-ease-arrive`), newest first, with the Lime mark for `cwl-dur-new-hold` when it lands alone. Clustering never holds it.
- When the AI path groups it, a copy of the sentence drifts from its row into its cluster's block over `cwl-dur-cluster-drift` (900ms) on `cwl-ease-calm`, fading in at the row and out at the block. Several grouped at once go `cwl-delay-regroup-step` (40ms) apart, 12 at most. The rest update in place.
- The row takes the cluster's number tag (fade and scale over `cwl-dur-settle-color`).
- From `cwl-delay-label-after-drift` (600ms) the cluster's label grows toward its new size over `cwl-dur-cluster-label` (600ms) on `cwl-ease-arrive`. Size = tv-floor + (tv-main minus tv-floor) x min(1, (count minus 1) / 5). The count and the latest sentence update as the drift lands.
- Clusters keep their places in order of first appearance. New clusters arrive and existing ones make room (FLIP, `cwl-dur-make-room`).
- Drifts run while sentences still arrive: the column and the clusters are separate areas, so nothing anyone is reading moves under them.
- Reduced motion: no drift. The row takes its number in place, and the cluster's count, latest sentence and label size change at once.

## 2. An outcome confirming (OutcomeConfirmRow, D2-05)

- When the facilitator records the decision, Lime sweeps across the row from the left over `cwl-dur-outcome-confirm` (700ms) on `cwl-ease-signature` (scaleX from 0 on a layer behind the content). Text on the row turns `cwl-on-live` meanwhile.
- It holds for 40% of `cwl-dur-new-hold`, then fades back to the row over `cwl-dur-settle-color`, leaving the outlined Confirmed or Renamed mark in place of the counts. A rename shows the old name struck through beneath.
- It's the screen's one Lime moment: the LIVE mark takes its Off-White form for the duration (the existing handoff).
- A challenged row loses its Royal highlight and Sunrise tag in the same movement.
- Reduced motion: the mark appears in place. No sweep.

## 3. Intent-card lines replacing as people type (IntentCard, INT-16)

- The TV applies typed edits at most every `cwl-delay-type-batch` (120ms), each landing in place, so a line never stutters.
- If the new text extends or trims the old (typing), the line simply grows or shrinks in place. Height changes make room (`cwl-dur-make-room`).
- If the new text is a rewrite, it crossfades in place over `cwl-dur-line-replace` (240ms): the old line lifts 0.35em and fades on `cwl-ease-exit` while the new one rises 0.35em into place on `cwl-ease-signature`.
- The field in use carries a 6px `cwl-typing` underline that shrinks over `cwl-dur-field-lock` (3s) and resets on each keystroke. The field is released when it runs out. Names never show on the TV.
- Reduced motion: the text swaps in place and the underline is still.

## 4. The remote changing hands (RemoteHandover, D2-11)

- On the facilitator's and co-facilitator's remotes, the holder banner ("Priya has the remote") slides down 14px into place and fades in over `cwl-dur-remote-hand` (500ms) on `cwl-ease-signature`. The controls settle to `cwl-held-dim` (0.5) over the same time. Take back stays at full strength.
- On the team facilitator's phone, the "You have the remote" banner slides in the same way and the remote controls rise 16px into place, 40ms apart (6 steps max).
- Taking it back plays the same movements the other way round. The team facilitator's phone shows "Chris has the remote" and returns to participant mode.
- The TV never changes.
- Reduced motion: banners and controls change in place.

## 5. The Map assembling (ClearwayMapDraft, D2-15)

- At the close of Day 2 each field rises 18px into place and fades in over `cwl-dur-map-field` (700ms) on `cwl-ease-calm`, `cwl-delay-map-step` (160ms) apart, in reading order (left column, then right).
- Empty fields arrive like the rest and stay visibly empty: an outlined chip with circle-dashed and why it's empty.
- Page 2 follows page 1 the same way.
- Reduced motion: each page is there at once.
