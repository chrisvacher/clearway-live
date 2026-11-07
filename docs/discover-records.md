# Discover records, survey findings and SET-06 notes (milestone 6, step 1)

Migration: `supabase/migrations/20261106010000_discover_records.sql`. Page: `/setup/<engagement>/discover`, linked from the setup overview and the run of show sidebar. Kit: `npm run test:discover`. Role tests: `supabase/tests/database/discover_records.test.sql`.

## What it does

The facilitator adds, by hand and in setup: the survey report's key findings (a short title, the number as the report gives it, how many respondents it rests on), the survey's total respondents once per engagement, and notes from leadership interviews and board or staff input conversations (paste, .docx, .pdf or .txt up to 4 MB). The app never reads the survey (Decided November 5). Saving a finding makes or updates its own accepted survey theme in the same call. Themes from notes and the Four Helpful Lists are drafted in step 3; the page lists whatever themes exist and says "No themes yet" when there are none.

Everything is facilitator-only: the lead, a co-facilitator and an admin. A participant, the scribe, a team facilitator, the TV, a facilitator of another engagement and an unsigned browser get `denied` (or a permission error for anon), tested for every function and every table.

## Records (all in `private`, forced row-level security, no browser grant)

| Table | Holds |
| --- | --- |
| `survey_findings` | title, figure (text with a digit), rests_on respondents |
| `conversation_notes` | kind (`interview` or `input`), person (record only), title, text up to 60,000 characters, source (`paste`, `docx`, `pdf`, `txt`), char and word counts |
| `discover_themes` | source (`survey`, `four_lists`, `conversations`), label, detail, rests_on, out_of, up to 3 quotes, status (`draft`, `accepted`, `rejected`), merged_into, ai_run, test flag |
| `discover_theme_sources` | a theme to one finding, one note or one Four Helpful Lists card (no foreign key, the cards belong to step 2), with a quote. A finding is the source of exactly one theme |
| `signals` | records only: session, kind (`aligned`, `divergent`, `silent`, `thin`), theme, evidence, dismissed, saved as citation (aligned only), neutral question sent. One card per session, kind and theme. No function reads or writes it yet (step 5) |
| `public.engagements.survey_respondents` | the survey's total (1 to 1,000,000), written only through `discover_total_set`; not in the update grant |

Thin and strength are never stored. They are worked out in `lib/discover/thin.ts` and `lib/discover/strength.ts` from the counts, with unit tests in `tests/unit/discover.test.ts`.

## Functions

Each is `security definer` in `private` with a `security invoker` wrapper in `public`; the role check is in the private function (`private.discover_guard`: admin or facilitator of the engagement; writes also refuse a closed engagement).

`discover_state` (findings, notes without their text, themes, total), `discover_total_set`, `discover_finding_save`, `discover_finding_delete`, `discover_note_add`, `discover_note_update`, `discover_note_delete`, `discover_note_read`.

Ids come from the browser, so a repeated save or add is the same one (`duplicate`, never a second row). A total below the biggest finding, or a finding above the total, is refused with a sentence. Limits: 100 findings and 200 notes an engagement.

The person on a note leaves the database only through `discover_state` and `discover_note_read` for facilitators, for SET-06. It is never put in the note's text, a theme or a quote, and later steps must send AI only the note's text and kind.

## Notes from files

`POST /api/discover/<id>/file` reads the text on the server (`mammoth` for Word, `unpdf` for PDF, UTF-8 for text) and adds the note. The file is not stored anywhere. A Word file's unpacked size is checked first (100 MB cap) and a PDF is limited to 400 pages. An unreadable file says why and what to do (a scan, a password, a binary file). Pasted or extracted text over 60,000 characters is refused with "Split it into two notes."

## Shared objects changed (each a superset of its latest definition)

| Object | Extends | Adds |
| --- | --- | --- |
| `private.reset_practice_room` | `20261104190000_m4_acceptance_fixes` | the five new tables, and clears `survey_respondents` |
| `private.rehearsal_control` | `20261105100000_practice_fixes_1` | Clear test answers puts away test drafted themes (with their sources) and signals. Findings, notes and survey themes are real setup data and stay |
| `private.control_status` | `20261105100000_practice_fixes_1` | only the rehearsal `test_answers` count widened |

The `ai_runs` job check, `ai_on`, `ai_claim` and `ai_apply` are not touched. Only signals and drafted themes (not survey themes) carry the test flag (the `mark_test` trigger). Findings, notes and survey themes carry none, so Clear test answers never wipes them; `reset_practice_room` still clears every Discover row of the practice room.

## Live surfaces keep working before the migration is applied

The Discover page checks that `discover_state` exists; if not it says "Discover isn't ready yet" and the rest of setup is unchanged (tested in the kit by renaming the function).

## Defaults chosen in this step (flagged for Chris)

- Thin for a finding: under 10 respondents, or under 10 percent of the survey total when one is set (the brief's rule). Without a total only the 10 applies.
- Thin for a conversation theme: rests on one conversation or fewer (PRD "one interview").
- Thin for a Four Helpful Lists theme: rests on one person or fewer. The PRD rule is silent here; this treats one person as the analog of one interview.
- Strong: 40 percent or more of its source and not thin; with no total there is no share, so not strong.
- A survey theme carries the finding's figure in `detail`, its respondents in `rests_on` and the survey total in `out_of`. Editing a finding only renames its theme when the title changed, and saving always sets it accepted.
- One text cap, 60,000 characters, for pasted and extracted notes.
- **File limit 4 MB, changed from the brief's 10 MB, for Chris to confirm.** Vercel caps a function request body at 4.5 MB, so a larger file would stop at the platform before the route runs. 10 MB would need a short-lived Storage upload read once and deleted.
- Conversation kinds read "Input conversation" with the church's own governing group word (`churches.governance_body_name`, "board" when empty), per Words in the app.

## Left open

- Accept, rename, merge and reject on themes, and drafting themes from notes, are step 3.
- Granola transcripts stay Open.

## Practice-room fixes, batch B (November 7)

- **The page follows the database.** The Discover page reads the notes, the themes and What We Heard every 4 seconds while it is on screen (3 while a draft runs), and at once when the tab shows again, the window gets focus or the network returns (`components/discover/use-poll.ts`). A tab the facilitator left to run the show from another window used to keep the state it had when they left. A note added or removed reads the themes again, so "of 8 conversations" and "N notes were added since" move with it.
- **The rehearsal count.** The control surface says "N test items", counted once by `private.rehearsal_counts` (answers, drafted themes, signals, and every other test item Clear test answers removes), and `control_status.rehearsal.test_answers` is that total, with `test_counts` beside it. Clear test answers returns `answers`, `themes`, `signals` and `other` and the message names them, for example "Cleared 9 test answers, 12 drafted themes and 4 signals"; the parts add up to the count on the button. `private.rehearsal_log` gains `themes`, `signals` and `other`, so the last clear reads the same. The themes round goes back to idle when no drafted theme is left, so "AI offered 12 themes" does not outlive them.

| Shared object | Extends | Change |
| --- | --- | --- |
| `private.control_status` | the read-back's patch (20261106070000) | `test_answers` is the helper's total; adds `test_counts`; `last_clear` gains `themes`, `signals`, `other` |
| `private.rehearsal_control` | the read-back's wrapper (20261106070000) | renamed `_pre_fixes_b` and wrapped: reports the parts, records them, quiets the themes round |
