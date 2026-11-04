# Design pass 4b handoff

Design pass 4b covers the live lens summaries and their sign-off on Day 1, the team facilitator's follow-up access without a Clearway sign-in, and two pass 5 revisions: the Day 2 confirm and the overnight review. The reference export is in `design/clearway-live/pass-4b/` (start with its `README.md` and `screens.html`). Its HTML files use relative paths. The export code is design reference, not an application script.

## What's in it

- Hi-fi screens by screen ID: D1-14, D1-15 and INT-18 (the summary on the TV, phones, control surface and remote), FAC-05 and FAC-06 (follow-up access), and the revised D2-03, D2-04, INT-14 and OVN-01 to OVN-03. Each board moves between its states without redrawing. The decisions board is first.
- Components named as they'll be in code: LensSummaryTV, SummaryPhone, SummaryEditor, SuggestionList, VersionList, DecisionPanel, LensSignoff, FollowUpIssue, FollowUpPair, FollowUpScope, TeamRemote, ConfirmLens, OutcomeStatusList, OutcomeDraft, OutcomeSources, PublishDay2. The index is `pass-4b/docs/screen-index.md`.
- Three motion prototypes with tokens and reduced-motion equivalents: the summary arriving, a version folding in, a lens settling. The spec is `pass-4b/docs/motion-spec.md`.

## Changes in this pull request beyond the export

- None to the app. The export's copy of `live_tokens.css` matches the app's after PR #58 (the AI icon tokens), and pass 4b adds no tokens.

## Build notes

- A lens summary is drafted from that lens's sentences and clusters, in the present tense, each of its sentences linked to its source sentences. The source sentences show on phones under each sentence and never on the TV. The summary goes to the TV as drafted.
- The tally has no leader color. It shows where the room is and never decides: the facilitator marks the decision per lens, with a short reason, and can undo it.
- Fitting one TV screen: a summary may be up to 420 characters, checked in code, and the AI is told to write to fit. If a facilitator's edit goes past it, the TV shows the sentences that fit and says how many more are on phones. Phones always show everything.
- The summary field is locked to whoever is editing it, the same way as the review screens. While a facilitator is editing, suggestions are held and AI does not fold.
- Suggestions are anonymous everywhere the room can see them. A suggestion box takes 140 characters. With AI off, the facilitator writes the summary and suggestions are applied as written, still as tracked changes.
- Every version is kept. Undo AI version returns to the previous version and puts its suggestions back in the list.
- The draft Clearway Map takes its 10-year Future from the signed-off summaries. A lens that was never signed off is not used.
- Follow-up access is a link emailed to the team facilitator plus a 9-character code told to them in the call. It is scoped to the follow-up block, opens an hour before the first session, ends two hours after the last, and stops the moment the lead facilitator revokes it. One TV view and one remote are paired at once. The team remote never shows the alignment signal, presenter notes, Discover data, other blocks, door list, emails, scribe cards or settings, and cannot publish to CORE, switch AI or change access. Three wrong codes lock the page for 10 minutes. Ending access or taking the remote back never changes what is on the TV.
- Day 2 at 9:00 is a short confirm of each signed-off lens after prayer. Phones show the signed-off paragraph only, without the source sentences. Corrections work as in pass 5.
- Overnight, AI tidies the provisional Vision Outcomes and the 3-year Vision first pass from the room's bullets, scribe cards and easel photos. The 10-year Future is not redrafted. A number in a bullet always comes from a scribe card or an easel photo.
- Docs to update when this is approved: the PRD sections on the read-back, overnight review and INT-14; the Wayfinding session list (a sign-off session after the Learning lens); the SET-08 template times; the surfaces and remote sections for follow-up access.

## Defaults to confirm

Designed to the Default; the decisions board in `screens.html` says what the other option would change.

| Decision | Default designed |
| --- | --- |
| Where the summaries sit on Day 1 | A sign-off session of about 25 minutes straight after the Learning lens |
| The tally when a new version folds in | It starts again at zero |
| Suggested changes on the TV | Anonymous cards beside the tally, two shown and the rest counted on phones |
| When AI folds suggestions in | Automatically after 3 quiet seconds, with Fold in now, Hold and Undo |
| How long a summary may be | One TV screen, 420 characters, with "+ n more on phones" past that |
| The facilitator's edits on the TV | Small batches replacing the line in place, no tracked change |
| The team facilitator's access | Link plus a separate code, from an hour before to two hours after the block, one pairing at a time |
| The Day 2 confirm | Lens by lens, phones see the signed-off paragraph only |

Pass 5's five Defaults are approved and applied where the read-back and the review still exist.
