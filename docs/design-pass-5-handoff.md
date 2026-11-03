# Design pass 5 handoff

Design pass 5 covers milestone 5: the scribe console, the overnight drafts and their review, and the Day 2 read-back. The reference export is in `design/clearway-live/pass-5/` (start with its `README.md` and `screens.html`). Its HTML files use relative paths. The export code is design reference, not an application script.

Archive SHA-256 (`clearway-live-design-pass-5.zip`, November 3, 2026): `690ca3539668bb9199571fa4ef357b1da5e9e563509542ce8b6460a3b686fd84`.

## What's in it

- Hi-fi screens by screen ID: SCR-01, SCR-02, the scribe feed added to FAC-01, FAIL-03, OVN-01 to OVN-03, D2-03, D2-04 and INT-14, each with the earlier passes' states where they apply plus the scribe, overnight, publish and read-back states. The read-back board shows the TV, phones, control surface, remote and the scribe's correction composer together.
- Components named as they'll be in code: ScribeCard, CaptureComposer, EaselCapture, ScribeFeed, PromotedQuote, DraftParagraph, SourcePanel, VoicesAndTensions, ReviewPresence, VersionHistory, DraftStatusList, PublishCheck, ReadBackLens, ReadBackTally, ReadBackPhone, MissingList, TrackedChange, CorrectionQueue, LensProgress. The index is `pass-5/docs/screen-index.md`.
- Six motion prototypes with tokens and reduced-motion equivalents: a scribe card landing, a sentence's sources lighting up, restoring the room's words, the tally filling, a correction folding in, moving to the next lens. The spec is `pass-5/docs/motion-spec.md`.

## Changes in this pull request beyond the export

- `design/clearway-live/live_tokens.css` gains the pass 5 tokens: `cwl-dur-source-light`, `cwl-dur-tc-strike`, `cwl-delay-tc-leave`, `cwl-tc-line`, `cwl-tc-offset`, and `cwl-app-source-word` (app surfaces only).
- The nesting guard now covers phones as well as TVs drawn inside an app surface, so OVN-03's phone preview inside review keeps its dark theme.

## Build notes

- Speaker names on scribe cards render only on review screens. The scribe console shows that a speaker was kept for the record; the control surface, TV, phones and read-back never show a name.
- The read-back tally has no leader color: it shows where the room is and never settles a lens. The facilitator settles each lens.
- On the TV a folded deletion leaves after `cwl-delay-tc-leave`; on phones and in review it stays struck through until the lens is settled. Inserted words stay underlined until then.
- PromotedQuote uses the pass 3 spotlight with the Scripture screen's light and bold treatment.

## Defaults to confirm

Designed to the Default; the decisions board in `screens.html` says what the other option would change.

| Decision | Default designed |
| --- | --- |
| "What's missing?" on the TV | Answers appear under the paragraph as they arrive, anonymous |
| What a phone sends with "It needs a change" | A short box; the scribe records the agreed wording and reason; the facilitator accepts |
| How the facilitators learn the drafts are ready | The review screen and the remote show "Drafts ready" |
| Reviewing on a phone | Laptop only |
| Phones during the read-back | The current lens, and settled lenses to look back at |
