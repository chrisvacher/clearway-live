# Milestone 5 brief: the scribe, the overnight drafts and the read-back

The PRD governs behaviour ("Scribe capture", "Overnight review and the read-back", "AI", the data model, "Milestones > 5"). Design pass 5 governs look: `docs/design-pass-5-handoff.md` and the export in `design/clearway-live/pass-5/` (start with its `README.md`, `screens.html`, `docs/screen-index.md` and `docs/motion-spec.md`). Where this brief and the PRD disagree, the PRD wins, except for Chris's November 3 decisions below, which are newer than the PRD.

Screens: SCR-01, SCR-02, the scribe feed on FAC-01, FAIL-03, OVN-01 to OVN-03, D2-03, D2-04 and INT-14. Not in this milestone: Discover and the alignment signal (milestone 6), the report, the communication plan and Publish to CORE (milestone 7).

## What milestone 5 builds

- **The scribe console (SCR-01) and the scribe's phone (SCR-02).** Tagged capture of six card kinds (quote, decision, tension, action, question, mitigation) that attach to whatever session is live, with the time. The scribe can edit a card or re-file it to another session. Easel photos from the phone camera and uploaded files go to a private Supabase Storage bucket and attach to the live session. The speaker on a card is kept for the record and never shown on the TV, phones or the read-back.
- **The scribe feed on the control surface (FAC-01).** The newest cards for the live step arrive in the facilitator's private column, with photos and files. No card shows a speaker there.
- **Offline capture (FAIL-03).** With wifi off the scribe keeps capturing. Cards and photos are saved on the device and sync in order with no duplicates when the connection returns.
- **The team-led block.** The scribe console is off while a team-led step is live. Whether a step is team-led is a flag on the run-of-show step.
- **Overnight drafts (OVN-01).** When Day 1 closes, AI tidies the provisional Vision Outcomes and the 3-year Vision first pass from phone input, scribe cards and easel photos. Every sentence is linked to its sources. Drafts are ready within 30 minutes of Day 1 closing. Thin outcomes are flagged. The voices not to lose and the tensions the room named stay separate, so they aren't smoothed away.
- **Review (OVN-02).** Chris and the co-facilitator review and edit side by side on a laptop. A section one of them is editing is locked for the other. Sources show beside each sentence. Swapping the AI's wording for the room's exact words is one action. Every version of every draft is kept.
- **Publish (OVN-03).** Nothing from the drafts reaches the TV or phones until Chris publishes.
- **The Day 2 short confirm (D2-03, D2-04, INT-14).** Day 2, 9:00 is a short confirm of the signed-off 10-year Future plus the reviewed outcomes, after prayer. The TV shows one item at a time with a live tally. Phones show the full text with its source sentences, then "Yes, that's us" or "It needs a change", and "What's missing?". Corrections the room agrees fold in as tracked changes once the facilitator accepts each, with the scribe's reason. The tally never settles anything: the facilitator marks each decision.

## Decisions (November 3)

| Decision | Chris's decision |
| --- | --- |
| Lens drafts | Moved to milestone 4. When the Five Lenses exercise finishes, AI drafts a one-screen 10-year Future summary of each lens (milestone 4's live lens summaries). Overnight drafts in this milestone are no longer lens drafts |
| What the overnight AI tidies | The provisional Vision Outcomes and the 3-year Vision first pass, from phone input, scribe cards and easel photos. Every sentence is linked to its sources. Ready within 30 minutes of Day 1 closing |
| Review | By two facilitators, with section locks. Swapping AI wording for the room's exact words is one action. Nothing reaches the room until published |
| Day 2, 9:00 | A short confirm of the signed-off 10-year Future plus the reviewed outcomes. Corrections fold in as tracked changes once accepted |
| Design pass 5's five Defaults | Approved. "What's missing?" answers appear under the paragraph as they arrive, anonymous. "It needs a change" sends a short box, the scribe records the agreed wording and reason, and the facilitator accepts. "Drafts ready" shows on the review screen and the remote. Review is laptop only. Phones see the current item and settled items during the confirm |
| Mitigations in the pre-mortem | The facilitator records them from the control surface until the scribe console exists. Once it does, the scribe can tag them too (a Mitigation card, linked to the risk it answers) |

Defaults chosen in step 1 (flagged for Chris):

| Default | Chosen |
| --- | --- |
| Where the team-led flag lives | A `team_led` column on the run-of-show step, set from the step's options in the run-of-show editor. It saves at once, apart from Done |
| What an edit does to the speaker | An edit that names no speaker keeps the one already stored. Speakers are not edited on the console in this step |
| Files the scribe can upload | Photos (JPEG, PNG, WebP, HEIC), PDF, Word, PowerPoint, Excel, text and CSV, up to 15 MB each |
| Photos | Fitted in the browser to 2400 px on the long edge and sent as JPEG, so a phone photo stays small over venue wifi |
| Promote a quote to the TV | Not in step 1. The PRD's Default (anonymously, from the feed) comes with the read-back, since the promoted quote uses pass 3's spotlight |

## The screens

| Step | Screens | Components (pass 5) |
| --- | --- | --- |
| 1 | SCR-01, SCR-02, the scribe feed on FAC-01, FAIL-03 | ScribeCard, CaptureComposer, EaselCapture, ScribeFeed |
| 2 | OVN-01, OVN-02, OVN-03 | DraftStatusList, ReviewPresence, DraftParagraph, SourcePanel, VoicesAndTensions, VersionHistory, PublishCheck |
| 3 | D2-03, D2-04, INT-14, PromotedQuote | ReadBackLens, ReadBackTally, ReadBackPhone, MissingList, TrackedChange, CorrectionQueue, LensProgress, PromotedQuote |

Each pass 5 board covers empty, typical, offline and queued, reduced motion and very long text where it applies. The six pass 5 movements are in `pass-5/docs/motion-spec.md`: a scribe card landing, a sentence's sources lighting up, restoring the room's words, the tally filling, a correction folding in, and moving to the next item. Their tokens are in `design/clearway-live/live_tokens.css`. Step 1 builds the first (the scribe card landing).

Speaker names render only on review screens (step 2). The scribe console shows that a speaker was kept for the record; the control surface, TV, phones and the confirm never show a name.

## The engine contract

Milestone 3's engine is unchanged (`docs/interaction-engine.md`). The scribe console is not an interaction kind: it is a surface of its own, read and written under the scribe's room sign-in, and it never goes through a session's answers.

**Who is the scribe.** A verified attendee whose room role is scribe, on the device session they signed in with. Facilitators read the feed under their own sign-in. Participants and TVs read nothing.

**Records.** Step 1 adds `private.scribe_cards` and `private.scribe_files`, with a client-made id on every row so a replay is a duplicate. Both are organized around the engagement, not the retreat. They are reached only through `security definer` functions in `private` with `security invoker` wrappers in `public`, granted to `authenticated`. Row-level security is on, forced, with no direct policy: tests by role cover the scribe, lead, co-facilitator, participant, TV, an unverified scribe, another engagement's facilitator and scribe, and anon.

**Storage.** The private `scribe` bucket. A file's row is made first, then a signed upload address, then the bytes, then a call that marks the row uploaded. The bucket's policies key on those rows, so a scribe can only write the exact path a row names, once. Files are read back through an API route under the caller's own session.

**Offline and order.** The scribe's outbox keeps every card, edit, re-file, photo and file on the device until the server settles it, and sends one at a time in the order made, with the same id on every retry. Nothing overtakes an older item that is waiting.

**Private by default.** Speaker names never leave the database except through `scribe_speakers`, which returns them to facilitators for the review screens. Facilitator notices about scribe activity carry no card words or file names.

**Milestone 4's records.** Milestone 4's step 1 (Wayfinding records) is built in parallel. Step 1 of milestone 5 depends on none of its tables. From step 2 on, these are the dependencies:

| Needed by | Milestone 4 record | Why |
| --- | --- | --- |
| Step 2 | Vision Outcomes (title, description, provisional or confirmed, indicators, what we'll stop) | The overnight draft tidies the provisional outcomes and the 3-year Vision first pass, and review edits them |
| Step 2 | Lens sentences and lens clusters, and the signed-off 10-year Future summaries | Phone input the draft is sourced from, and the 10-year Future the confirm shows |
| Step 3 | Decisions (Mark a decision) | The facilitator marks each decision in the confirm |
| Step 3 | Risks | A Mitigation card links to the risk it answers, and the confirm reads the scribe's reasons |
| Step 3 | The draft Clearway Map | The confirmed text reaches the Map's 10-year Future and Vision Outcomes |

Scribe cards link to a risk by its words in step 1 (the card's risk detail). Step 3 resolves that to the pre-mortem risk's id once milestone 4's records exist.

## Work order

One branch and one pull request per step. Migrations are approved and applied one at a time, after each pull request merges.

1. **The scribe console** (SCR-01, SCR-02, the scribe feed, FAIL-03). This brief; tagged capture, photos and files in Storage, offline capture that syncs in order with no duplicates, the scribe feed on the control surface, the team-led flag. Mitigation cards, so the scribe can tag them in the pre-mortem.
2. **Overnight drafts and review** (OVN-01 to OVN-03). The overnight job, source links, the thin-outcome flags, voices and tensions kept separate, the two-facilitator review with section locks, one-action restore of the room's words, version history, "Drafts ready" on the review screen and remote, and Publish.
3. **The Day 2 short confirm and the read-back** (D2-03, D2-04, INT-14). The published draft one item at a time with the tally, "What's missing?", "It needs a change" with the scribe's correction composer, the correction queue, tracked changes folding in, and promoting a quote to the TV.
4. **Acceptance kit.** Every milestone 5 surface through the live-screen rules, the failure kit extended with FAIL-03, and milestone 5 practice-room rows added to `docs/practice-room-script.md`.

## In parallel

Step 1 goes first and alone. Step 2 follows it and milestone 4's records. Step 3 follows step 2, since it shows the published draft and folds corrections into it. Step 4 is last. Milestone 4's steps run in parallel with step 1, and step 1 takes none of their tables, so it can merge in either order.

## AI

As milestone 3 step 5 built it (`docs/ai-live.md`): AI is never in the path from phone to TV. The worker's claim, apply and fail with one lease, the AI switches per engagement and session, the run log (model, prompt version, inputs, output, tokens, cost) and FAIL-09 carry over. Step 1 has no AI.

| Job | Step | Reaches the room how | Model | Prompt |
| --- | --- | --- | --- | --- |
| Overnight draft: tidy the provisional Vision Outcomes and the 3-year Vision first pass, with every sentence linked to its sources, thin outcomes flagged, voices and tensions kept separate | 2 | Never directly. Review first, then Publish | The deeper model (`CLEARWAY_AI_MODEL_DEEP`), reading images | New. Reads phone input, scribe cards and easel photos |
| Fold agreed corrections into the draft as tracked changes | 3 | After the facilitator accepts each | The fast live model | New |

- The draft job starts when Day 1 closes and finishes within 30 minutes. If it fails or is slow, the review screen says so and the facilitators write the draft by hand from the sources.
- Inputs carry text, counts and images under short refs, never attendee identity fields and never a card's speaker.
- Prompts live in `lib/ai/prompts.ts` with a version each, use Clearway's terms exactly (Vision Outcomes, the horizon terms, the engagement's lens names) and are tested against fixtures from the fictional Riverside engagement in `tests/fixtures/ai/`: never invent content, keep the room's words where they are strong, keep tensions separate, never name people. With a recorded reply by default, and against the real API when `ANTHROPIC_API_KEY` is set.
- Everything else is code: the section locks, the version history, the source links, the thin-outcome flag and the publish check.

## Checks for every step

Tests from the acceptance criteria; `npm run check`; `supabase db lint --local --schema public,private --fail-on warning`; `supabase test db --local`; `npm run test:live`, `test:controls`, `test:tv`; `npm run test:browser`, `test:load`, `test:content` and `test:ai` after `npm run build` and `npm run db:seed`, plus the step's own browser kit (`npm run test:scribe` for step 1); a browser check of every surface against the pass 5 boards with screenshots (`KIT_SHOTS=<folder>`); no em or en dashes in app copy; the step's doc updated; merge when CI passes. The local Supabase stack runs Storage from step 1 on.

## Acceptance criteria (PRD, milestone 5)

- With wifi off, the scribe keeps capturing. Cards and photos sync in order with no duplicates.
- Speaker names on scribe cards are stored for the record and never shown on the TV or to participants.
- Cards attach to whatever session is live. The scribe can edit a card and re-file it. The console is off while a team-led step is live.
- Drafts are ready within 30 minutes of Day 1 closing, and each sentence links to the phone input, scribe cards or photos it came from.
- Two facilitators can review at once. A section one is editing is locked for the other.
- A facilitator can swap AI wording for the room's exact words in one action.
- Nothing from the drafts reaches the TV or phones until published.
- In the confirm, corrections the room agrees fold into the draft as tracked changes once accepted. The tally never decides.
- The scribe can tag mitigations in the pre-mortem.

## Questions for Chris

None open for step 1. The Defaults above are flagged for confirmation.
