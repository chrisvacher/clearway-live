# Motion spec · design pass 4b

The screen is alive: every input appears at once, and existing items move, regroup and resize as new input arrives, with no refresh and no reveal step. Every duration, easing and delay is a token in `live_tokens.css`. Play each in `screens.html` under "Motion". Pass 4b adds no tokens.

## 1. The summary arriving (LensSummaryTV)

- The lens heading is already up. The AI icon is gradient ink with one sweep (`cwl-dur-ai-sweep`, `cwl-ease-calm`), then the sentences arrive in order, `cwl-delay-stagger` apart, each over `cwl-dur-arrive` on `cwl-ease-arrive`.
- The tally appears at zero beside it, so the first tap has something to grow from.
- Reduced motion: the summary appears at once with no sweep.

## 2. A version folding in (LensSummaryTV, TrackedChange)

- AI folds suggestions once none has arrived for `cwl-delay-quiet`, or when the facilitator taps Fold in now. It waits while the facilitator is editing.
- Pass 5's movement is reused as is: the strike draws over `cwl-dur-tc-strike`, deleted words stay `cwl-delay-tc-leave`, then leave over `cwl-dur-hide` while the paragraph reflows over `cwl-dur-make-room`. Inserted words arrive underlined (`cwl-tc-line`, `cwl-tc-offset`) and stay underlined until the lens is signed off.
- The suggestions that were folded leave the list. The tally starts again at zero and the AI line says which version it is.
- Undoing a version runs the same movement backwards and returns the suggestions to the list.
- The facilitator's own edits reach the TV in batches (`cwl-delay-type-batch`), replacing the line in place with a quiet underline on the sentence being typed.
- Reduced motion: the new text appears at once, with the changes underlined.

## 3. A lens settling (LensSummaryTV, LensProgress)

- Marking a decision runs one Lime sweep across the lens in the progress (`cwl-dur-outcome-confirm`), then the lens takes its outlined check. It is the page's single Lime moment.
- The tracked-change underlines turn into plain words, the tally holds, and the next lens arrives over `cwl-dur-map-field` on `cwl-ease-calm`, with its summary already drafted.
- Reduced motion: the mark and the words change in place.
