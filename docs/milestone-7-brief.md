# Milestone 7 brief: After the retreat

The PRD governs behaviour ("Outputs", "AI", the data model, "Milestones > 7"). Design pass 7 governs look: `docs/design-pass-7-handoff.md` and the export in `design/clearway-live/pass-7/` (start with its `README.md`, `screens.html`, `docs/screen-index.md` and `docs/motion-spec.md`). Where this brief and the PRD disagree, the PRD wins. Where the PRD and the Clearway Brain disagree on a Wayfinding term, the Brain wins and the PRD is edited to match.

Screens: AFT-01 (report), AFT-02 (visibility plan), AFT-03 (share links and the read-only copy), AFT-04 (the check-in email and phone), AFT-05 (check-in results). Shelved (November 4, Publish to CORE is out of the app): COR-01 to COR-03 and the CoreConnection, OverlapList, ReadinessRegister, OwnerMatch, PublishSummary, PublishButton, PublishConfirm, PublishProgress, RemotePublish, PublishedTV, PublishedPhone, PublishHistory and SecondPublish components, and the publish-commit motion prototype. **No screen in this milestone shows a CORE status**, reads CORE or links to CORE. Where pass 7 shows "CORE status" or "Updated from CORE", the app shows what the owner reported in their check-in, or nothing.

## What milestone 7 builds

- **The report draft (AFT-01).** AI drafts the report section by section in Clearway's report order from the engagement's records. Every sentence carries its sources (the records it rests on), including the aligned signals the facilitator saved as citations in milestone 6. Quotes are word for word. Thin data is labelled. Sections built from records (the 10-year Future, the 3-year Vision, Risks and Roadblocks, the 1-year Outlook, Commander's Intent, Decisions, the visibility plan) are assembled by code from the records, with a short AI-drafted lead. The facilitator edits any sentence, adds their own read of the team, swaps AI wording for the room's exact words in one action, marks each section reviewed and signs the report off.
- **Export (AFT-01 ExportPanel, WordPreview).** The signed-off report (or the current draft, marked Draft) downloads as a Clearway-branded Word document following Clearway's document standard, and as a PDF of the same document.
- **The visibility plan (AFT-02).** AI drafts the plan from what the room said: scribe actions, risks about who hears what, pre-mortem mitigations, intent cards and goals. Rows: who, when, who tells them, what they hear, the risk it answers, each with its sources. The facilitator edits, adds, removes, reorders and marks rows reviewed. It's the report's "Make the Vision Visible" section.
- **The read-only copy (AFT-03).** Once Day 2 closes, the facilitator makes named links for elders. A link opens a public page with no sign-in and no edit controls: the Clearway Map, the Vision Outcomes with their indicators, the 1-year goals with owners and dates, the commander's intent cards with first steps, and the signed-off report once there is one. Never raw answers, scribe cards or drafts. Each link can be revoked; a revoked link shows a plain page.
- **Check-ins (AFT-04, AFT-05).** At 30, 60 and 90 days after the retreat, each owner gets one email with a link (no sign-in) to a short check-in on their own first steps (Done, Under way, Stuck, and a note) and their own goals (a status they choose, and "What would help?"). The facilitator sees the results, stuck steps as follow-ups, and who hasn't answered.

## Decisions

| Decision | Source |
| --- | --- |
| Publish to CORE is out of the app. Clearway's team enters the plan into CORE after the retreat | Chris, November 4 (PRD) |
| Nothing is read from CORE. Each owner reports where their own goals and first steps stand | PRD Default, confirmed by the November 4 decision |
| The read-only copy is available once Day 2 closes, and the report joins it once signed off | PRD Default |
| Report order: Overview, The Church Today, The Process, What We Heard, Leadership Interviews, Strategic Tensions, The 10-year Future, The 3-year Vision, Risks and Roadblocks, The 1-year Outlook, Commander's Intent, Decisions, Communication, Closing | 02-wayfinding-method, the PRD's "Where each output lands" |
| The report and the overnight drafts use the most capable model | PRD Default ("Models and cost") |
| AI never receives attendee identity fields. Owners are added back by code | PRD "AI" rules |
| The 10-year Future in the report is the five lens summaries signed off on Day 1, word for word | Pass 7 handoff, PRD |

### Pass 7 Defaults

Of the ten Defaults on pass 7's decisions board, seven were about publishing to CORE and are withdrawn with it: who presses Publish, a Vision Outcome's status from CORE, first steps as CORE tasks, the Vision Matrix, owners without a CORE account, an email in another church in CORE, and commander's intent in CORE. Commander's intent stays where that Default put it: the report, the Map and the read-only copy.

These three still apply, adjusted for no CORE. They are with Chris before the build starts:

| Decision | Default | The other option |
| --- | --- | --- |
| Which words the report and plan use | "Visibility plan" in the app, and "Make the Vision Visible" as the report section, following the Brain's ruling of November 1. The PRD and its report order are edited to match | Keep "communication plan" and the section "Communication". Only labels change |
| The read-only copy and the report | The link shows the plan from the engagement's records. The report appears on it only once signed off, and a new sign-off replaces what the link shows. Edits after sign-off stay off the link until signed off again | The link always shows the latest draft, marked Draft |
| Who gets check-in emails | Each owner of a first step, plus each goal owner who owns no first step, one email each per round, in their own email, listing only their own steps and goals | Owners of a first step only (a goal whose owner has no first step goes unreported), or one team email listing every first step |

### Defaults chosen in this brief

Flagged for Chris, built until he changes them.

| Default | Chosen |
| --- | --- |
| Where the extra pass 7 sections go | Pass 7 adds Retreat Participants, Celebrations and Key Metrics. They fold into The Process (who took part, celebrations) and The 3-year Vision (the success measures the team ranked), as the PRD's "lands in" table has them, so the report keeps 14 sections |
| Which sections AI writes | Overview, The Church Today, The Process, What We Heard, Leadership Interviews, Strategic Tensions and Closing as prose. The other seven are record blocks built by code, each with an AI lead of one to three sentences. Overview and Closing are drafted last, from the other sections |
| Names in the report | Owners by full name in The 1-year Outlook and Commander's Intent, added by code. Quotes are anonymous ("a participant", "an elder interviewed"). The facilitator can add a name to a quote by hand. Nobody else is named |
| Sign-off | The lead facilitator signs off. Co-facilitators edit and mark sections reviewed. Sign-off needs every section reviewed and every sentence sourced, except the facilitator's own words, which are marked as theirs |
| Redrafting a section | Redraft section rewrites the sentences nobody has touched and keeps the edited ones, asking inside the panel first when any are edited. Refresh from the records rebuilds a record block from the current records |
| Export | Word with the `docx` npm package, following Clearway's document standard (copied into `docs/clearway-document-standard.md`): Plus Jakarta Sans, white page, restrained bold, section eyebrows, tables for goals, risks and the plan, quote blocks, thin data as a callout, and no source markers. PDF with `@react-pdf/renderer` from the same document model. Both are free npm packages. The signed-off version exports clean. A draft export says Draft in the header and the file name |
| The visibility plan's order | Working back from the most public moment, which the facilitator names with its date (default "Vision Sunday", date blank): the lead pastor, the retreat participants, the board or elders, the team, members and key leaders (major donors here), then the congregation. With no date, "when" stays empty rather than invented |
| When Day 2 has closed | When the last retreat part (Day 2, or the half day for a day-and-a-half engagement) is closed with Close the day and all its steps are closed, the engagement records `day2_closed_at`, as Day 1's close opens the overnight round today. The facilitator can also press Mark the retreat closed on the After page |
| Read-only links | Any number of named links. Each is a 24-byte token, stored only as its hash, shown once with Copy. The page is `noindex`. It shows when the link was last opened and how many times. Links stop when the engagement is closed |
| Goal status in the read-only copy | Each goal shows the status its owner gave in their newest check-in, as a label with its date ("On track, Dec 13"), never the note. Before the first check-in it shows nothing |
| Check-in timing | Rounds fall 30, 60 and 90 days after the retreat's last day (the engagement's retreat end date, otherwise the date Day 2 closed). A daily scheduled run on Vercel at 13:07 UTC (8:07 am Eastern) sends each round on its due date. Check-ins switch on when Day 2 closes, for Wayfinding and day-and-a-half engagements. The facilitator can switch them off or press Send now on a round, which asks inside the panel |
| The check-in link | One link per person per round, no sign-in. Answers save on each tap and queue offline ("Saved on this phone"). A round's answers can be changed until the next round goes out, then that link shows the answers read-only and points to the newest email. Every link ends kindly when the engagement is closed |
| What a check-in asks | For each of their own first steps: Done, Under way or Stuck, and an optional note. For each of their own goals: Not started, On track, At risk, Off track or Done, and "What would help?". Labels and icons carry the status. Phones show no Warning or Error colors |
| Practice and test addresses | An address on `.example`, `.invalid` or `.test` is never emailed. Its round row says "Practice address, not sent" and the results page offers Open as this person, so the practice room can test the phone without email. No emails to real people from the practice room |
| Engagement close | Unchanged: the facilitator closes the engagement by hand. After the 90-day round the check-ins page suggests closing it |

## Work order

One branch and one pull request per step. Shared database objects follow "The engine contract" below. Each migration takes the timestamp below; a step that merges after a later-numbered one renames its migration to the next timestamp after main's newest before it merges, so filenames always apply in merge order.

| Step | What it is | Branch | Migration | After |
| --- | --- | --- | --- | --- |
| 1 | Report records, the drafting job and AFT-01's editor and sign-off | `m7/step-1-report` | `20261108010000_report` | Main |
| 2 | Check-ins (AFT-04, AFT-05), the scheduled run and the check-in phone page | `m7/step-2-check-ins` | `20261108020000_check_ins` | Main, beside step 1 |
| 3 | The visibility plan (AFT-02) | `m7/step-3-visibility-plan` | `20261108030000_visibility_plan` | Step 1 |
| 4 | Day 2 close, share links and the read-only copy (AFT-03) | `m7/step-4-read-only` | `20261108040000_read_only` | Steps 1 and 2 |
| 5 | Word and PDF export | `m7/step-5-export` | None expected | Steps 1 and 3 |
| 6 | Acceptance kit and practice-room sections 39 onward | `m7/step-6-acceptance` | `20261108060000_m7_acceptance` if needed | Steps 1 to 5 |

1. **Report records and the draft.** Tables in `private` (see "Report contract"): `report_drafts`, `report_sections`, `report_sentences`, `report_sources`, `report_rounds` and `report_sign_offs`. Facilitator-only reads and writes through `security definer` functions in `private` with `security invoker` wrappers in `public`, as milestone 6 did. The engagement-level job `draft_report` follows the overnight and Discover pattern (its own round table with `_due`, `_claim`, `_apply` and `_fail`, kicked with `after()` from the page's routes and retried by the page's poll), one run per section on the deeper model. Inputs go to AI under short refs, never names. Code checks every reply before it's kept: each sentence cites at least one ref it was given; text in quotation marks appears word for word in a cited source; every number appears in a cited source; no attendee name appears; em dashes, en dashes and semicolons are rewritten; horizon terms are exact. A sentence failing a check is dropped and the section is marked Needs attention. Record blocks are built by code. The page `/control/[id]/report` with SectionList, SectionBody, SourcesPanel and SignOffBar: section status (Drafting, Drafted, Edited, Reviewed, Needs attention, Thin data), source marks on each sentence, the sources panel with the used words highlighted, Use the room's words, Add your own read, Redraft section, Mark reviewed, Sign off. Sign-off saves a snapshot to `report_sign_offs` and is what the read-only copy and the clean export read. An "After the retreat" link in the control surface header opens `/control/[id]/after`, a hub with Report, Visibility plan, Share and Check-ins (the last three show "Coming in this milestone" until their step merges). The Riverside seed gains what a report needs: signed-off lens summaries, scribe cards of every kind with speakers, accepted Discover themes with sources, two survey findings (one thin), and an aligned signal saved as a citation. Prompt tests on Riverside fixtures in `tests/fixtures/ai/report.json`. Kit `test:report`. The visibility plan section reads `private.visibility_plan_for_report` through a fixture function until step 3 replaces it.
2. **Check-ins.** Tables in `private`: `check_in_rounds`, `check_in_recipients`, `check_in_answers` (see "Check-in contract"). Rounds are created when Day 2 closes (reading `day2_closed_at` through the contract below, with a fixture until step 4) and can be created by hand from the Check-ins page. A Vercel cron in `vercel.json` (`7 13 * * *`) calls `GET /api/cron/check-ins`, which refuses any request without `Authorization: Bearer $CRON_SECRET` and sends every due round: one email a person (`lib/email/check-in.ts`, built like `sign-in.ts` from email tokens), idempotent by recipient id, never to a practice or test address. `CLEARWAY_NOW` sets the clock in tests and is refused when `VERCEL_ENV=production`. The phone page `/c/[token]` (CheckInPhone): the person's own first steps and goals only, every state on pass 7's AFT-04 board except the CORE ones, offline queue, no sign-in. The results page `/control/[id]/check-ins` (CheckInResults): each round with sent and answered counts, every step's answer and note, goals by status, stuck steps as follow-ups with Mark followed up, who hasn't answered, progress against the earlier round at 60 and 90 days, Send now, switch off, CSV. Riverside seed: goal seasons, and one goal and one first step owned by a name and email with no attendee row. Kit `test:check-ins`.
3. **The visibility plan.** Tables `visibility_plans` (one per engagement: the public moment and its date, status, AI run) and `visibility_plan_rows` with `visibility_plan_sources` (the same source kinds as the report). Engagement-level job `draft_visibility_plan` on the deeper model, from scribe action and mitigation cards, risks and mitigations, intent cards and first steps, goals and decisions, under refs. Code checks as step 1, plus: rows come in the Brain's outward order, and a "when" is either blank or worked back from the public date. The page `/control/[id]/plan` (VisibilityPlan): the public moment and date, the rows with their sources, edit in place, Add a row, Remove (asks inside the panel), reorder, Mark reviewed, Redraft (keeps edited and reviewed rows). Replaces `private.visibility_plan_for_report` with the real function, so the report's "Make the Vision Visible" section shows the plan as a table. Prompt tests in `tests/fixtures/ai/visibility-plan.json`. Kit `test:visibility-plan`.
4. **Day 2 close, share links and the read-only copy.** Adds `engagements.day2_closed_at`, the trigger that sets it (beside `overnight_day1_closed`, reading the template's part names) and Mark the retreat closed. Replaces step 2's fixture so rounds are created on Day 2 close. Table `read_only_links` (engagement, name, token hash, created by and when, revoked by and when, last opened, open count). The Share page `/control/[id]/share` (ShareLinks): New link with a name, the link shown once with Copy, each link's state and opens, Revoke (asks inside the panel). The public page `/v/[token]` (ReadOnlyCopy), laptop and phone: the Map, the Vision Outcomes with indicators, the goals with owners, dates and their newest owner-reported status, the intent cards with first steps, and the signed-off report when there is one, rendered from the sign-off snapshot without source marks. Before Day 2 closes, after revoke or after the engagement closes: a plain page that says the link isn't available, with nothing about the plan. The page's data comes from one `security definer` function keyed by the token's hash, called only from the server with the service role; its payload is tested to hold no submissions, scribe cards, drafts, sources, signals, emails or check-in notes. `middleware.ts` leaves `/v` and `/c` public. Kit `test:read-only`.
5. **Word and PDF export.** `lib/export/report-model.ts` turns a sign-off snapshot (or the live draft, marked Draft) into one document model. `lib/export/report-docx.ts` renders it with `docx`, following `docs/clearway-document-standard.md` (copy it from the clearway-docs skill's `references/clearway-design-system.md`, applying the skill's October 2026 formatting preferences: restrained bold, white page, no contents page under eight pages), with the Clearway logo and a cover naming the church, "Wayfinding Report" and the retreat dates. `lib/export/report-pdf.tsx` renders the same model with `@react-pdf/renderer` and Plus Jakarta Sans from `@fontsource/plus-jakarta-sans`. ExportPanel and WordPreview on the report page; `GET /api/control/[id]/report/export?format=docx|pdf&version=signed|draft`, facilitator only. Tests unzip the Word file and read the PDF's text with `unpdf`: headings in Clearway's order, the font, no source markers, no em or en dashes, thin labels and quotes present.
6. **Acceptance kit.** `test:acceptance-m7`: every milestone 7 surface through its acceptance criteria end to end on Riverside (draft, edit, sign off, export both formats, plan, Day 2 close, share and revoke, a 30-day round sent by the scheduled run to the harness mailbox, every owner answering, results), the failure kit extended (AI slow and failing on the report and plan, the check-in phone offline, a revoked link, the scheduled run called twice), CI steps for every new kit, and milestone 7 sections 39 onward in `docs/practice-room-script.md`.

## In parallel

Steps 1 and 2 run side by side. Step 3 follows step 1. Step 4 follows 1 and 2. Step 5 follows 1 and 3, and can start beside step 4. Step 6 is last. Whichever of two parallel steps merges second rebases on the first, folds in its shared-object changes and takes the next migration timestamp.

**The contracts between steps** (each a function of exactly this signature; the later step replaces the earlier step's fixture):

- `private.visibility_plan_for_report(p_engagement uuid)` returns `table(row_id uuid, position int, who text, when_text text, by_whom text, what_they_hear text, risk text, reviewed boolean, sources jsonb)`. Step 1 ships a fixture returning no rows; step 3 replaces it.
- `private.retreat_closed_on(p_engagement uuid)` returns `date` (the retreat's last day once Day 2 has closed, else null). Step 2 ships a fixture reading `retreat_end_date` only when the engagement's status is `follow_up`; step 4 replaces it with `day2_closed_at` and the end date.
- `private.report_signed_for_view(p_engagement uuid)` returns `jsonb` (the newest sign-off snapshot without sources, or null). Step 1 provides it.
- `private.check_in_latest_for_view(p_engagement uuid)` returns `table(goal_id uuid, status text, answered_on date)`. Step 2 provides it.

## The report contract

Sections are keyed and ordered:

| Position | Key | Heading | Kind | Inputs (refs) |
| --- | --- | --- | --- | --- |
| 1 | `overview` | Overview | Prose, drafted last | The other sections' sentences and sources |
| 2 | `church_today` | The Church Today | Prose | The church record (mission, purpose, values, strategy), survey findings, accepted survey themes |
| 3 | `process` | The Process | Prose | Attendee count and roles (no names), the run of show's parts and dates, how the room decided, celebrations, discernment notes (scribe quotes and decisions from the opening) |
| 4 | `heard` | What We Heard | Prose | Survey findings, accepted Four Helpful Lists and board and staff input themes with their quotes, Four Helpful Lists cards, aligned signals saved as citations |
| 5 | `interviews` | Leadership Interviews | Prose | Accepted interview themes with their quotes |
| 6 | `tensions` | Strategic Tensions | Prose | Scribe tension cards, challenged outcomes (read-back corrections and outcome decisions) |
| 7 | `future` | The 10-year Future | Record block, lead | The five signed-off lens summaries, word for word |
| 8 | `vision` | The 3-year Vision | Record block, lead | Confirmed Vision Outcomes with descriptions, indicators and what we'll stop, and the ranked key metrics |
| 9 | `risks` | Risks and Roadblocks | Record block, lead | Pre-mortem risks (not merged away) with likelihood, impact and mitigations |
| 10 | `outlook` | The 1-year Outlook | Record block, lead | Goals with outcome, owner, end date and season |
| 11 | `intent` | Commander's Intent | Record block, lead | Intent cards with must-do, what we'll stop and first steps with owners and dates |
| 12 | `decisions` | Decisions | Record block, lead | Facilitator decisions and scribe decision cards |
| 13 | `visibility` | Make the Vision Visible | Record block, lead | `visibility_plan_for_report`, scribe action cards |
| 14 | `closing` | Closing | Prose, drafted last | The other sections |

**Source kinds** (`report_sources.kind`, also used by the visibility plan): `finding`, `theme`, `four_lists_card`, `scribe_card`, `photo`, `lens_summary_sentence`, `outcome`, `indicator`, `risk`, `mitigation`, `goal`, `intent_card`, `first_step`, `key_metric`, `celebration`, `decision`, `signal` (aligned and saved as a citation only, checked in the database), `submission` (a phone answer, shown anonymously), and `record` (a field of the church or engagement record, named in `excerpt`). Each source row has `sentence_id`, `kind`, `ref_id` (null only for `record`), `excerpt` (up to 280 characters, the words used) and `position`.

**Sentences** (`report_sentences`): section, position, text, `origin` (`ai`, `facilitator`, `room` for the room's exact words, `record` for code-built lines), `ai_text` (kept for Use the room's words and undo), `quote` (true when the sentence is a verbatim quote), `thin_label` (worked out in code from the finding or theme thin rules of milestone 6), touched, soft delete. A sentence of origin `ai`, `room` or `record` must have at least one source, checked on apply and on sign-off. Record blocks keep their structured rows in `report_sections.blocks jsonb`, rebuilt by Refresh from the records.

**Sign-off** (`report_sign_offs`): n, snapshot (every section's heading, sentences with origin, quote and thin label, blocks, and the sources, all as text so later edits can't change it), signed by, signed at. `report_signed_for_view` and the clean export strip sources from the snapshot.

## The check-in contract

- `check_in_rounds`: engagement, day (30, 60 or 90), due on, status (`scheduled`, `sending`, `sent`, `off`), sent at, sent by (`schedule` or a facilitator).
- `check_in_recipients`: round, email (lowercase), name, attendee (null for a name-and-email owner), token hash, send result (`sent`, `practice_address`, `failed`), sent at, opened at, answered at, help text.
- `check_in_answers`: recipient, exactly one of first step or goal, answer (`done`, `under_way`, `stuck` for a step; `not_started`, `on_track`, `at_risk`, `off_track`, `done` for a goal), note (up to 500 characters), followed up at and by, updated at.
- Recipients are the distinct owner emails of the engagement's first steps (and goals, per the Default with Chris), worked out when the round is sent, so an owner changed before then is the one emailed. A person sees only the steps and goals they own.

## The engine contract

Milestone 3's engine is unchanged (`docs/interaction-engine.md`). Nothing in milestone 7 is an interaction kind or touches the live room, the TV or the remote. The check-in phone page and the read-only copy are public pages with their own token, not room pages.

**Shared database objects.** `private.ai_runs`' `ai_runs_job_check` gains `draft_report` and `draft_visibility_plan`, and `ai_runs_session_check` lets both run with no session. `reset_practice_room` (newest in `20261106070000_read_back`) and `rehearsal_control` (newest in `20261107020000_m6_fixes_b`) clear every new table's rows for the practice engagement, by renaming the newest to `_pre_<step>` and wrapping it. `ai_claim` and `ai_apply` are not used by milestone 7's jobs. A migration that changes a shared object rewrites it as a superset of its newest definition in `supabase/migrations/`, and repoints any pgTAP test that reads that function's text (`signal.test.sql`, `candidates.test.sql`). Row-level security is one written-out `alter table ... enable row level security` per table, never in a loop. No comment or string may read "into <word>" or "create table <word>".

**Live surfaces keep working before a migration is applied.** Main deploys to live.clearway.co before the migration is applied. A new link or panel on an existing screen (the control surface's After the retreat link, the After hub) must fail quietly if its function doesn't exist yet: no error page, nothing blank, the rest of the screen unchanged.

**AI.** Prompts live in `lib/ai/prompts.ts` beside the overnight and Discover prompts, with a version each, Clearway's institutional voice ("we", warm and plain, no semicolons, no dashes), Clearway's terms exactly (Wayfinding, Vision Outcomes, the horizon terms, visibility plan), never inventing content, never naming people. The model is `config.deepModel`. Every run is logged in `private.ai_runs`. AI output never reaches the TV or phones. Tested against Riverside fixtures with a recorded reply by default, and with the fake model in browser kits.

| Job | Step | Reaches anyone how | Model |
| --- | --- | --- | --- |
| `draft_report` | 1 | The facilitator edits and signs off. The read-only copy and the clean export show only the signed-off snapshot | Deeper model |
| `draft_visibility_plan` | 3 | The facilitator edits the rows. It reaches others only inside the signed-off report | Deeper model |

**Private by default.** Report drafts, sources, the visibility plan and check-in answers are facilitator-only. Owners' emails never leave the database except to send their own check-in. The read-only copy carries no email, note or source.

**Scheduled run.** The only scheduled job is the daily check-in run. It needs `CRON_SECRET` in Vercel's environment variables (Production). The route returns 401 without it and sends nothing.

## Checks for every step

Tests from the acceptance criteria; role tests for every new table and function (lead, co-facilitator, another engagement's facilitator, participant, scribe, team facilitator, TV and anon); `npm run check`; `supabase db reset`, then `supabase db lint --local --schema public,private --fail-on warning` and `supabase test db --local`; `npm run test:live`, `test:controls`, `test:tv`; after `npm run build` and `npm run db:seed`, `test:browser`, `test:content`, `test:ai` and the step's own kit, added to CI; a browser check of every surface against the pass 7 boards with screenshots (`KIT_SHOTS=<folder>`); no em or en dashes in app copy or generated documents; no "CORE status" or "Updated from CORE" anywhere; the step's doc in `docs/` written (`docs/report.md`, `docs/check-ins.md`, `docs/visibility-plan.md`, `docs/read-only-copy.md`, `docs/report-export.md`); one push per batch, and merge when CI passes.

## Acceptance criteria (PRD, milestone 7) and the tests that prove them

| Criterion | Proved by |
| --- | --- |
| Check-ins go out by email at 30, 60 and 90 days, and each owner reports where their own goals and first steps stand | `test:check-ins`: with `CLEARWAY_NOW` set to each due date, the scheduled run sends one email a person to the harness mailbox and nothing on other days; a second run the same day sends nothing; a practice address is never sent; each person's page lists only their own steps and goals; answers save, survive a reload and queue offline; the results page shows every answer and stuck steps as follow-ups; the route refuses a missing or wrong secret |
| The report follows Clearway's order and exports as a Clearway-branded Word document and PDF | `test:report` and the export unit tests: the 14 sections in order; every AI sentence has a source and a broken source blocks sign-off; quotes appear word for word in their source; no attendee name in AI text; an aligned signal saved as a citation appears as a source in What We Heard; thin data labelled; the 10-year Future matches the signed-off lens summaries exactly; the Word file and PDF carry the headings in order, Plus Jakarta Sans and the logo, the thin labels and quotes, and no source markers or dashes |
| The read-only copy has no edit controls and its link can be revoked | `test:read-only`: the page has no inputs, buttons that change data or edit links; its payload holds no submissions, scribe cards, drafts, sources, signals, emails or check-in notes; it shows nothing before Day 2 closes; the report appears only after sign-off and an edit after sign-off doesn't show until signed off again; a revoked link shows the plain page at once; pgTAP proves anon and every room role can't read `read_only_links` or call the view function |
| User story: Chris reviews an AI-drafted communication (visibility) plan built from what the room said | `test:visibility-plan`: every drafted row has a source from the room's records; the rows come in the outward order; no "when" is invented without a public date; edits and reviewed rows survive a redraft; the plan appears as the report's "Make the Vision Visible" table |

## Questions for Chris

The three pass 7 Defaults above ("Which words the report and plan use", "The read-only copy and the report", "Who gets check-in emails") before the build starts. The Defaults chosen in this brief are flagged and built until he changes them. Adding `CRON_SECRET` to the app's Vercel environment variables is the one change outside the repository.
