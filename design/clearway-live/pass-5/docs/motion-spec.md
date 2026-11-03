# Motion spec · design pass 5

The screen is alive: every input appears at once, and existing items move, regroup and resize as new input arrives, with no refresh and no reveal step. Every duration, easing and delay is a token in `live_tokens.css`. Play each in `screens.html` under "Motion".

## 1. A scribe card landing (ScribeCard, ScribeFeed)

- A captured card arrives at the top of the console's list (`cwl-dur-arrive`, `cwl-ease-arrive`); the cards below make room (FLIP, `cwl-dur-make-room`). It carries a focus ring for `cwl-dur-new-hold`.
- The same card lands in the control surface's scribe panel the same way.
- Offline, cards are already on the console, numbered in capture order. Back online, each changes state in place (Saved on this laptop, Syncing, Synced). Nothing on the console moves.
- On the control surface the synced cards arrive oldest first, `cwl-delay-stagger` apart.
- Reduced motion: a 150ms fade in place (`cwl-dur-reduced`); state chips change in place.

## 2. A sentence's sources lighting up (DraftParagraph, SourcePanel)

- The selected sentence takes `cwl-app-selected` over `cwl-dur-source-light`.
- Its source cards come forward: cards already in the panel glide to the top (FLIP, `cwl-dur-make-room`), new ones arrive (`cwl-dur-arrive`), cards leaving fade (`cwl-dur-hide`). The lens's other sources sit below a divider.
- Then each source's words highlight from left to right in `cwl-app-source-word` over `cwl-dur-source-light` on `cwl-ease-signature`, the line of an easel photo included.
- Reduced motion: the new order and the highlight appear at once.

## 3. Restoring the room's words (DraftParagraph)

- The AI wording lifts 0.35em and fades on `cwl-ease-exit` while the room's words rise into place on `cwl-ease-signature`, both over `cwl-dur-line-replace` (the pass 4 crossfade).
- The paragraph makes room for a different length; the marker gains the quote mark.
- Reduced motion: swap in place.

## 4. The tally filling (ReadBackTally)

- Each tap grows its bar from where it is to its new length over `cwl-dur-bar-grow` on the signature easing; the count ticks with it (`cwl-dur-count`).
- A bar starts from zero only when its lens first appears. Taps close together retarget the bar mid-movement.
- No leader color: the tally never settles a lens.
- Reduced motion: instant.

## 5. A correction folding in (TrackedChange, ReadBackLens)

- When the facilitator accepts a correction, the strike draws through the deleted words over `cwl-dur-tc-strike`.
- They stay readable for `cwl-delay-tc-leave` (900ms), then fade out (`cwl-dur-hide`, `cwl-ease-exit`).
- The paragraph reflows in one movement over `cwl-dur-make-room`: words that stay on their line slide along it; words that change line are hidden and fade back in at their new place over the last 30% of 1.3 x `cwl-dur-make-room`, so no word crosses the text.
- Inserted words arrive (`cwl-dur-arrive`, after 60% of `cwl-dur-make-room`) and their underline draws under them (`cwl-dur-tc-strike`). The underline stays until the lens is settled.
- Lines use `cwl-tc-line` in the text's own color, offset `cwl-tc-offset`, so the change reads without color on both themes.
- Reduced motion: the deleted words disappear and the inserted words appear underlined at once.

## 6. Moving to the next lens (LensProgress, ReadBackLens)

- Settle: Lime sweeps once across the lens in the progress (`cwl-dur-outcome-confirm`, scaleX from the left), holds 40% of `cwl-dur-new-hold`, then fades over `cwl-dur-settle-color` to the outlined check. The LIVE mark steps back meanwhile (the screen's one Lime moment). The underlines become plain words.
- Next: the main column lifts out 12px (`cwl-dur-hide`, `cwl-ease-exit`); the current fill moves along the progress as a color change in place (`cwl-dur-settle-color`); after `cwl-delay-make-room-after-hide` the next heading and paragraph rise 18px into place (`cwl-dur-map-field`, `cwl-ease-calm`). The bars return to zero (`cwl-dur-bar-grow`).
- Reduced motion: the check, the current lens and the next paragraph appear in place.
