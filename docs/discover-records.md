# Discover records, survey findings and SET-06 notes (milestone 6, step 1)

Migration: `supabase/migrations/20261106010000_discover_records.sql`. Page: `/setup/<engagement>/discover`, linked from the setup overview and the run of show sidebar. Kit: `npm run test:discover`. Role tests: `supabase/tests/database/discover_records.test.sql`.

## What it does

The facilitator adds, by hand and in setup: the survey report's key findings (a short title, the number as the report gives it, how many respondents it rests on), the survey's total respondents once per engagement, and notes from leadership interviews and board or staff input conversations (paste, .docx, .pdf or .txt). The app never reads the survey (Decided November 5). Saving a finding makes or updates its own accepted survey theme in the same call. Themes from notes and the Four Helpful Lists are drafted in step 3; the page lists whatever themes exist and says "No themes yet" when there are none.

Everything is facilitator-only: the lead, a co-facilitator and an admin. A participant, the scribe, a team facilitator, the TV, a facilitator of another engagement and an unsigned browser get `denied` (or a permission error for anon), tested for every function and every table.

## Records (all in `private`, forced row-level security, no browser grant)

| Table | Holds |
| --- | --- |
| `survey_findings` | title, figure (text with a digit), rests_on respondents, test flag |
| `conversation_notes` | kind (`interview` or `input`), person (record only), title, text up to 60,000 characters, source (`paste`, `docx`, `pdf`, `txt`), char and word counts, test flag |
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
| `private.rehearsal_control` | `20261105100000_practice_fixes_1` | Clear test answers puts away test findings, notes, themes, theme sources and signals |
| `private.control_status` | `20261105100000_practice_fixes_1` | only the rehearsal `test_answers` count widened |

The `ai_runs` job check, `ai_on`, `ai_claim` and `ai_apply` are not touched. Findings, notes, themes and signals made during a rehearsal carry the test flag (the `mark_test` trigger). A survey theme is made by its finding, so it is not counted a second time.

## Live surfaces keep working before the migration is applied

The Discover page checks that `discover_state` exists; if not it says "Discover isn't ready yet" and the rest of setup is unchanged (tested in the kit by renaming the function).

## Defaults chosen in this step (flagged for Chris)

- Thin for a finding: under 10 respondents, or under 10 percent of the survey total when one is set (the brief's rule). Without a total only the 10 applies.
- Thin for a conversation theme: rests on one conversation or fewer (PRD "one interview").
- Thin for a Four Helpful Lists theme: rests on one person or fewer. The PRD rule is silent here; this treats one person as the analog of one interview.
- Strong: 40 percent or more of its source and not thin; with no total there is no share, so not strong.
- A survey theme carries the finding's figure in `detail`, its respondents in `rests_on` and the survey total in `out_of`. Editing a finding only renames its theme when the title changed, and saving always sets it accepted.
- One text cap, 60,000 characters, for pasted and extracted notes.

## Left open

- Vercel caps a function request body at 4.5 MB, so a file between 4.5 and 10 MB stops at the platform with a plain "too large to upload here, paste the text" message. The code accepts 10 MB. Allowing the full 10 MB would need a short-lived Storage upload read once and deleted.
- Accept, rename, merge and reject on themes, and drafting themes from notes, are step 3.
- Granola transcripts stay Open.
