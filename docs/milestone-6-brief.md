# Milestone 6 brief: Discover and the alignment signal

The PRD governs behaviour ("Discover", "The alignment signal", "AI", the data model, "Milestones > 6"). Design pass 6 governs look: `docs/design-pass-6-handoff.md` and the export in `design/clearway-live/pass-6/` (start with its `README.md`, `screens.html`, `docs/screen-index.md` and `docs/motion-spec.md`). The Team Hub research is `docs/discover-survey-source.md`. Where this brief and the PRD disagree, the PRD wins, except for Chris's decisions below, which are newer.

Screens: SET-05, SET-06, INT-11, PRE-08 What We Heard, FAC-02 and the signal list on the facilitator's own remote (FAC-03). Not in this milestone: the report, the communication plan, check-ins and the read-only copy (milestone 7).

Milestone 6 runs alongside the end of milestone 5 by Chris's direction (November 5).

## Decisions

| Decision | Chris's decision |
| --- | --- |
| The congregational survey (November 3) | Built and sent with Team Hub's survey builder before the event. Decided November 5: Clearway runs its data report in Team Hub ahead of Wayfinding, and the app doesn't read the survey. Its only polls are quick polls from participants in the room |
| Survey findings (Default, November 5) | The facilitator adds the survey report's key findings to the engagement by hand: a short title, the share or count the report gives, and how many respondents it rests on, so What We Heard and the signal can use them |
| Where interview notes come from (pass 6 Default, confirmed) | Paste, Word, PDF or text. No Granola import |

## Rules every step follows

- **Team Hub is read only.** The app never writes to Team Hub. Agents never run anything against Team Hub.
- **Only accepted themes count.** A drafted theme never reaches What We Heard, the signal, the TV or a phone.
- **Thin data is code:** a theme or segment resting on fewer than 10 responses, under 10 percent of respondents, or one interview is flagged wherever it appears.
- **No names.** Themes, quotes and headlines never carry a respondent's or interviewee's name, email or identity fields. Inputs to AI carry text and counts under short refs only. Open answers can name people: they are sent to AI as written (Decided November 2), and the facilitator reviews before anything is accepted.
- **The signal is private.** It shows on the control surface and the facilitator's own remote only, never on the TV, a phone or the team facilitator's remote, enforced in the database and tested. Every `cwl-sg-*` rule is scoped to `[data-surface="control"]`.
- **The screen is alive** for everything in the room (INT-11, PRE-08): every input on the TV in under a second, nothing jumps or blanks, as the earlier milestones' kits check.
- Data is organized around the engagement. New tables are private, forced RLS, reached through `security definer` functions with `security invoker` wrappers, with pgTAP tests by role.
- Migrations follow the shared-objects rule in the agent briefing (supersets of `ai_runs_job_check`, `ai_on`, `reset_practice_room` and `rehearsal_control`).

## Work order

One branch and one pull request per step. Migrations are applied after each pull request merges, in filename order.

1. **The Four Helpful Lists (INT-11, SET-05).** A new interaction kind, `four_lists`. Phones add cards to any of the four columns (What's right? What's wrong? What's missing? What's confused?) and tap to agree with others' cards, one agreement per person per card. The TV fills four columns as cards arrive, columns told apart by heading and position, agreement counts ticking up on each card, similar cards in a column sliding together (AI grouping as the wall does, never in the path from phone to TV, with undo, pin and off). After the session the facilitator reviews the cards (SET-05): edit, merge, keep or set aside, and mark which feed What We Heard and which feed Strategic Tensions. Usually run with the board, so it works in any engagement and in a board discovery session template. CSV and recap like every kind.

   **Built (step 1).** See `docs/four-lists.md`. Defaults chosen in step 1, flagged for Chris:
   - 12 cards per person, 200 characters and 50 words a card, all editable in the run of show.
   - Agreement is one per person per card, undone by a second tap, never on your own card, and not queued offline (the phone says "Couldn't reach the room").
   - The TV shows at most 8 cards per list, ranked by agreement then arrival, as many whole cards as fit. The type steps from 44 px down to 36 px before any card is held back, and the rest are counted as "+ n more on phones".
   - AI groups only inside one list (two or more cards). The survivor is the most-agreed card, and its count is the distinct people who agreed. Hide is the existing hide.
   - Review: edited words replace the card's words (the original is kept). Merge works only inside a list. Strategic Tensions can be marked only from What's wrong? and What's confused?; What We Heard from any list. Marks are stored in `private.four_list_review`, and step 4 reads them through `four_lists_marks(engagement)`.
   - A short "Board discovery session" template (Welcome, Four Helpful Lists, Close) is added to the palette of templates, flagged for Chris.
   - CSV has List and Card columns; the agreement count is not in the CSV.
2. **Interview and conversation notes (SET-06).** Paste, Word (.docx), PDF or text, stored in a private Storage bucket, one record per conversation (kind: leadership interview, board input, staff input; a label the facilitator writes; never a name the app requires). AI drafts themes across the conversations with no names attached, each showing how many conversations it rests on ("4 of 5") and its example lines with names removed. The facilitator accepts, renames, merges or rejects each. Themes resting on one interview are thin. This step creates the shared Discover themes record (source, title, description, status, counts, thin flag, example quotes, accepted by and when) that steps 3 to 5 also use.
3. **Survey findings (setup).** The facilitator adds the key findings from the survey's Team Hub report: a short title, the share or count the report gives, and how many respondents it rests on, with an optional quote from the report. Each is a Discover theme with source survey, accepted as entered, thin by the rule. Edit, reorder and remove. No Team Hub reads.
4. **What We Heard (PRE-08).** Headlines with depth drafted from accepted themes (survey, Four Helpful Lists cards, interview and conversation themes), one at a time, with the detail, sources and quotes under each on phones. The facilitator edits and orders them, and the pre-call's What we heard step uses them in place of hand-entered headlines. Thin headlines are labelled.
5. **The alignment signal (FAC-02, FAC-03).** Compares the room's live input (lens sentences, wall answers, candidates, bullets) with accepted Discover themes and shows aligned, divergent, silent and thin-data cards on the control surface, each with its evidence. Silent signals only after phones first go down in a session (Default). The facilitator can dismiss a card, save an aligned card as a citation for the report, or put a neutral question on the TV that carries no data and doesn't name the signal (while it is up, the room's count and the AI line are hidden). The facilitator's own remote shows a short list. Tests prove no signal reaches the TV, a phone, the scribe or the team facilitator's remote.
6. **Acceptance kit.** Every milestone 6 surface through the live-screen rules, the failure kit extended, and milestone 6 rows in `docs/practice-room-script.md`.

## In parallel

Steps 1 and 2 share nothing and run side by side. Step 3 follows step 2's themes record. Step 4 follows steps 1 to 3. Step 5 follows step 4, since it reads accepted themes from every source. Step 6 is last.

## AI

As milestone 3 step 5 built it (`docs/ai-live.md`): the worker's claim, apply and fail with one lease, the switches per engagement and session, the run log and FAIL-09. Prompts live in `lib/ai/prompts.ts` with a version each, use Clearway's terms exactly, and are tested against Riverside fixtures in `tests/fixtures/ai/`: never invent content, never name people, keep counts honest.

| Job | Step | Model |
| --- | --- | --- |
| Group similar Four Helpful Lists cards in a column | 1 | The fast live model |
| Theme interview and conversation notes | 2 | The deeper model |
| Draft What We Heard headlines | 4 | The deeper model |
| Find aligned, divergent and silent signals | 5 | The deeper model. Thin data is code |

## Checks for every step

As the milestone 5 brief lists, plus the step's own browser kit, and screenshots at 1920 by 1080 at room size Medium and the default room size.

## Questions for Chris

- None open.
