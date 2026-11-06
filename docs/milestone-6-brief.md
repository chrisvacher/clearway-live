# Milestone 6 brief: Discover and the alignment signal

The PRD governs behaviour ("Discover", "The alignment signal", "AI", the data model, "Milestones > 6"). Design pass 6 governs look: `docs/design-pass-6-handoff.md` and the export in `design/clearway-live/pass-6/` (start with its `README.md`, `screens.html`, `docs/screen-index.md` and `docs/motion-spec.md`). Where this brief and the PRD disagree, the PRD wins.

Screens: SET-05, INT-11, SET-06, PRE-08 (What We Heard), FAC-02 and the FAC-03 signal list, plus a survey findings form in setup. Shelved (November 5): SET-04, SET-04 results, SET-10 and the SurveyLink, ResponseCount, QuestionResult, SurveyResultScreen, SegmentFilter and DuplicateFlag components. Not in this milestone: the report, the communication plan, the read-only copy and check-ins (milestone 7).

## What milestone 6 builds

- **Survey findings, by hand.** The congregational survey lives in Team Hub, and Clearway runs its report there (Decided November 5). The app never reads the survey. In setup the facilitator adds the report's key findings: a short title, the number as the report gives it (a share or a count), how many respondents it rests on, and the survey's total respondents once per engagement. Thin data is worked out in code.
- **The Four Helpful Lists (SET-05, INT-11).** A new interaction kind. Phones add cards to any of the four columns (What's right? What's wrong? What's missing? What's confused?) and tap to agree with other people's cards. The TV shows four columns filling as cards arrive, similar cards sliding together (AI, with undo), and agreement counts ticking up. SET-05 is the facilitator's review of the cards after the session.
- **Interviews and input conversations (SET-06).** The facilitator adds notes or transcripts by paste, Word, PDF or text. Each note is a leadership interview or a board or staff input conversation, with the person kept for the record only.
- **Discover themes.** AI drafts themes across the conversation notes and the Four Helpful Lists cards, with no names, each showing how many conversations or cards it rests on ("4 of 5"). The facilitator accepts, renames, merges or rejects each one. Each survey finding is its own theme. Only accepted themes count anywhere.
- **What We Heard (PRE-08).** From the accepted themes and findings, AI drafts headlines with depth for the pre-call's four What We Heard steps (survey, Four Helpful Lists, board and staff input, leadership interviews), which milestone 4's templates already hold as hand-typed content steps. The facilitator edits and applies them. Thin data is marked on the line.
- **The alignment signal (FAC-02, FAC-03).** During a live session, AI compares the room's input with the accepted themes and raises private cards: aligned, divergent, silent and thin data. Cards appear only in the control surface's private panel and on the lead and co-facilitator's own remotes. Never the TV, a phone, a scribe or the team facilitator's remote, tested. Each card shows its evidence. The facilitator can dismiss it, save an aligned card as a citation for the report, or put a neutral question on the TV that carries no data and doesn't name the signal.

## Decisions

| Decision | Source |
| --- | --- |
| The app doesn't read the survey. Findings are added by hand. SET-04 and SET-10 are shelved | Chris, November 5 |
| Where survey themes come from, a survey collecting email, segment questions | Pass 6 Defaults (November 3), now moot with the survey out of the app |
| Where interview notes come from: paste, Word, PDF or text | Pass 6 Default, confirmed November 3. Granola transcripts stay Open |
| Thin data: under 10 responses, under 10 percent of respondents, or one interview | PRD Default |
| Silent signals appear only after phones first go down in a session | PRD Default |
| The signal uses the most capable model; the Four Helpful Lists grouping uses the fast live model | PRD Default ("Models and cost") |

Defaults chosen in this brief (flagged for Chris, built until he changes them):

| Default | Chosen |
| --- | --- |
| A finding's thin flag | Thin when it rests on fewer than 10 respondents or under 10 percent of the survey's total respondents |
| A theme's strength | The share of its source it rests on: conversations for interview and input themes, distinct people who wrote or agreed for Four Helpful Lists themes, respondents for findings. Strong at 40 percent or more and not thin |
| Where the Four Helpful Lists sits in the Wayfinding templates | A new Discover part ahead of the Pre-call, with one live Four Helpful Lists step for the board or team. The facilitator can switch it to self-paced |
| Agreeing with a card | One tap agrees, a second tap takes it back. A person can't agree with their own card. Agreement counts people |
| Similar cards on the TV | AI folds similar cards within one column only, never across columns, at least two cards to a fold, with undo, pin and off as the wall has them |
| Notes files | .docx, .pdf and .txt up to 10 MB, text extracted on the server and the file not kept. Pasted text up to 60,000 characters a note |
| What reaches AI from notes | The note's text and kind. Never the person's name field. The prompt never names people and drops names it finds |
| When themes are drafted | On Draft themes, pressed by the facilitator, and again on Redraft. A redraft keeps accepted themes and offers new ones beside them |
| When the signal runs | While a Wayfinding or general input session is live with AI on: after every 8 new answers or 45 seconds with new input, whichever comes first, one run at a time per session |
| The neutral question | AI suggests the wording from the card; the facilitator edits it before sending. It shows on the TV as a layer over the live session until the facilitator presses Back to the session, and phones keep the live session |
| A signal card's life | A card is replaced, not duplicated, when the same kind and theme fire again in the same session. Dismissed cards stay dismissed for that session |

## Work order

One branch and one pull request per step. Each migration takes the timestamp assigned below, so they apply in this order.

| Step | What it is | Branch | Migration | After |
| --- | --- | --- | --- | --- |
| 1 | Discover records, survey findings and SET-06 notes | `m6/step-1-discover-records` | `20261106010000_discover_records` | Main |
| 2 | The Four Helpful Lists (INT-11, SET-05) | `m6/step-2-four-lists` | `20261106020000_four_lists` | Main, beside step 1 |
| 3 | Discover themes from notes and cards (SET-06 themes) | `m6/step-3-themes` | `20261106030000_discover_themes` | Step 1 (reads step 2's cards through the contract below) |
| 4 | What We Heard from accepted themes (PRE-08) | `m6/step-4-what-we-heard` | `20261106040000_what_we_heard` if needed | Steps 2 and 3 |
| 5 | The alignment signal (FAC-02, FAC-03 signal list) | `m6/step-5-signal` | `20261106050000_signal` | Step 3 |
| 6 | Acceptance kit and practice-room rows | `m6/step-6-acceptance` | `20261106060000_m6_acceptance` if needed | Steps 1 to 5 |

1. **Discover records, survey findings and SET-06 notes.** This brief. Tables in `private`: `survey_findings` (title, figure as text, rests on, created and updated, soft delete), the survey's total respondents on the engagement, `conversation_notes` (kind interview or input conversation, person for the record, title, text, source kind paste, docx, pdf or txt, character count), `discover_themes` (source survey, four_lists or conversations; label; detail; rests on; out of; example quotes; status draft, accepted or rejected; merged into; AI run; thin and strength worked out in code from the counts), `discover_theme_sources` (theme to a finding, a note or a Four Helpful Lists card, with the quote), and `signals` (session, kind aligned, divergent, silent or thin, theme, evidence, dismissed, saved as citation, neutral question sent). Facilitator-only reads and writes through `security definer` functions in `private` with `security invoker` wrappers in `public`. Saving a finding makes or updates its accepted survey theme in the same call. The Discover setup page for the engagement: the findings form with the total, and SET-06's notes upload with paste and files (extract text with small, well-known npm libraries such as `mammoth` and `unpdf`, on the server only). The thin and strength rules in `lib/discover/`. Role tests: lead, co-facilitator, another engagement's facilitator, participant, scribe, team facilitator, TV and anon.
2. **The Four Helpful Lists.** A registered interaction kind `four_lists` following `docs/interaction-engine.md`: a card's answer carries its column and text, several cards a person, agreeing as its own write keyed by person and card, counts in the results function. Phone composer (FourListsComposer) with the column picker and agree taps on others' cards. TV board (FourListsBoard, FourListsCard) with the pass 6 card landing motion: slide in, Lime moment, similar cards folding beneath a survivor marked AI with how many it holds, counts ticking and cards gliding up their column. AI job `fold_four_lists` on the fast model, within a column, with undo, pin and off, never in the path from phone to TV. SET-05 review: every card by column with agreement counts and its fold, read-only, with CSV. The Discover part and the Four Helpful Lists step in both Wayfinding templates. The kind's own browser kit `test:four-lists` with 50 simulated phones.
3. **Discover themes.** AI job `draft_discover_themes` on the deeper model reading conversation notes and accepted Four Helpful Lists cards under short refs, never names or the person field, returning themes with their source refs and a quote each. Themes per source kind (Four Helpful Lists and conversations; survey themes come from findings). SET-06's ThemeList and DiscoverTheme with accept, rename, merge and reject, the pass 6 growing, merging and rejecting motions, counts as "4 of 5", thin and strong marks. Reads Four Helpful Lists cards only through the contract below, so it can be built beside step 2 with a fixture. Prompt tests on Riverside fixtures in `tests/fixtures/ai/`.
4. **What We Heard.** On the Discover page, Draft What We Heard: AI drafts one headline with depth per What We Heard step from accepted themes and findings (a number and one line for the headline, the detail and up to three quotes for phone depth, thin data marked on the line). The facilitator edits each and presses Apply, which writes the step's headline, source and phone depth through the existing content screen fields. Nothing reaches the TV until that step goes live. Uses WhatWeHeardHeadline and pass 4's HeadlineDepth.
5. **The alignment signal.** AI job `alignment_signal` on the deeper model, run as the Defaults say, reading accepted themes and the live session's input under refs. Silent cards only after phones first go down in the session. Signal cards in the private panel of the control surface (SignalPanel, SignalCard, SignalDetail) with the pass 6 arrival motion, and the short list on the lead and co-facilitator's own remotes (SignalList). Dismiss, Save as a citation (aligned only), and Ask the room: the neutral question layer on the TV (TVLayer), which carries no data, hides the room's count and the AI line, and crossfades as a session change does. Tests prove the TV, phones, scribes and the team facilitator's remote can't read a signal or its evidence, and that the neutral question's payload holds no theme, count or signal kind.
6. **Acceptance kit.** `test:acceptance-m6`: every milestone 6 surface through the live-screen rules (the Four Helpful Lists with 50 phones, the neutral question crossfade, signal cards never on the TV or phones), the failure kit extended (AI slow and failing on fold, themes, What We Heard and the signal; laptop closed with the signal on the remote), and milestone 6 rows in `docs/practice-room-script.md`.

## In parallel

Steps 1 and 2 run side by side: the Four Helpful Lists uses none of step 1's tables. Step 3 follows step 1. Steps 4 and 5 run side by side once 2 and 3 merge. Step 6 is last. Whichever of two parallel steps merges second rebases on the first and folds its shared-object changes in.

**The cards contract between steps 2 and 3.** Step 2 provides `private.four_lists_cards_for_themes(p_engagement uuid)` returning one row per visible card that hasn't been folded away: card id, session id, column (`right`, `wrong`, `missing`, `confused`), text, agreement count (people), the ids of cards folded into it, and a seventh, last column `people uuid[]`: the distinct attendee ids of the writer and every agreer (test rows left out) across the card and every card folded into it, sorted. Service role only. Step 3 writes against a fixture function of the same signature in its own tests, and step 2's migration replaces it with the real one.

## The engine contract

Milestone 3's engine is unchanged (`docs/interaction-engine.md`). The Four Helpful Lists is a registered kind. Discover setup, themes, What We Heard drafting and the signal are not interaction kinds: they are facilitator surfaces reached under the facilitator's own sign-in.

**Shared database objects.** Several functions and constraints are shared across steps: `private.ai_runs` job check (`ai_runs_job_check`), `ai_on`, `ai_claim` and `ai_apply` (wrapped by renaming the earlier one to `_base`), `reset_practice_room` and `rehearsal_control`. A migration that changes one rewrites it as a superset of its latest definition in `supabase/migrations/` (read the newest file that defines it), never dropping an earlier job, clause or table. When two steps both change the same object, the one merged second rebases and includes the first's additions. `reset_practice_room` and Clear test answers must clear every new table's practice and test rows.

**Live surfaces keep working before a migration is applied.** Main deploys to live.clearway.co before Chris runs the step's migration in the SQL editor. A new panel or call on an existing screen (the control surface's signal panel, the remote's signal list, the TV layer) must fail quietly if its function doesn't exist yet: no error page, nothing blank, the rest of the screen unchanged.

**AI.** As milestone 3 step 5 built it (`docs/ai-live.md`): never in the path from phone to TV, the worker's claim, apply and fail with one lease, the switches per engagement and session, the run log, FAIL-09, and the one AI icon on anything AI made. Prompts live in `lib/ai/prompts.ts` with a version each, use Clearway's terms exactly, never invent content, never name people, and are tested against Riverside fixtures with a recorded reply by default.

| Job | Step | Reaches the room how | Model |
| --- | --- | --- | --- |
| `fold_four_lists` | 2 | On the TV, marked AI, with undo | Fast live model |
| `draft_discover_themes` | 3 | Never. The facilitator accepts each theme | Deeper model |
| `draft_what_we_heard` | 4 | Only when the facilitator applies it and the step goes live | Deeper model |
| `alignment_signal` | 5 | Never. The control surface and the facilitator's own remote only | Deeper model |

**Private by default.** Notes, themes, findings and signals are facilitator-only. The person on a note never leaves the database except to facilitators on SET-06. Signal colors and `cwl-sg-*` rules stay scoped to `[data-surface="control"]`.

## Checks for every step

Tests from the acceptance criteria; `npm run check`; `supabase db lint --local --schema public,private --fail-on warning`; `supabase test db --local`; `npm run test:live`, `test:controls`, `test:tv`; `npm run test:browser`, `test:content` and `test:ai` after `npm run build` and `npm run db:seed`, plus the step's own kit; a browser check of every surface against the pass 6 boards with screenshots (`KIT_SHOTS=<folder>`); no em or en dashes in app copy; the step's doc in `docs/` written or updated; one push per batch, and merge when CI passes.

## Acceptance criteria (PRD, milestone 6)

- Survey findings and conversation themes show how many respondents or conversations each rests on, and thin data is flagged by the rule in Discover.
- Only accepted themes reach What We Heard and the signal.
- Signal cards never reach the TV or any participant's phone, tested.
- From a signal card, the facilitator can put a neutral question on the TV that carries no data and doesn't name the signal.
- Aligned signals can be saved as citations for the report.
- What We Heard headlines with depth are generated from accepted themes for the pre-call.
- The Four Helpful Lists runs on the TV and phones, with cards landing live, similar cards folding with undo, and agreement counts ticking.

## Questions for Chris

None block the work. The Defaults above are flagged for confirmation.
