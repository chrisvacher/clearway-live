# Discover survey source: Team Hub's survey builder

Research for milestone 6, read only, November 3. Nothing was created or changed in Team Hub.

## Summary for Chris

You decided on November 3 that the congregational survey is built and sent with Team Hub's survey builder before the event, and that Clearway Live reads and shows the results without running surveys itself. Team Hub can support that well. Here is what I found.

- **The right project.** Team Hub is the Supabase project `clearway-team-hub` (`tilmrkgiwlpuflbtueen`). Mission Control's project id is the same project. Clearway Live's reader is already installed there: the eight `live_read` views and the two reader roles exist in production. They cover no survey tables yet.
- **Two tables hold the survey.** `surveys` holds each survey, its questions and its link to a client and an engagement. `survey_responses` holds one row per person who answered, with all their answers in one block keyed by question id. Every saved answer matches a question id in its survey, so the two fit together cleanly.
- **The link to an engagement is direct.** Each survey can carry a Team Hub engagement id and a client id. Clearway Live already stores the Team Hub engagement id on every engagement, so "the surveys for this engagement" is one simple lookup. Today 10 of the 30 surveys carry an engagement id and 20 carry a client id, so linking the survey to the engagement when you build it matters.
- **Team Hub already themes open answers.** Team Hub has a full survey analysis pipeline (analyses, codes, coded answers and a frequencies view). It produces themes with counts per question, reviewed by a person. That is close to what the PRD calls Discover themes. Whether Clearway Live reuses those themes or makes its own with AI is a choice for you (option C below).
- **Volume is small for a database.** Team Hub holds 3,299 responses across 30 surveys today. The largest single survey has 2,660 responses. An average response is about 1 KB and the largest is about 6 KB, so a survey of a few hundred responses is well under 1 MB to read.
- **Privacy needs care in three places.** Responses can carry an email address (7 responses do, from the one survey set to require email). Responses also store a hashed network address and the browser's description. Open answers can name people. None of these should reach Clearway Live's facilitator screens, and none may reach the TV or phones.
- **Nothing runs live.** Team Hub doesn't broadcast new responses, so Clearway Live would show the count and results as of the last refresh. That suits a survey that closes before the event.
- **What needs your decision.** The reader can't see any survey data until you approve new views and grants on Team Hub, the same way you approved the first reader script. The options are below. I haven't created anything.

The PRD still lists the survey as Open and describes Clearway Live hosting its own survey link. Once you're happy with an option, the PRD's Discover section, the Team Hub table under Integrations, milestone 6's first user story and the "Discover survey" row in Open questions need updating to match your November 3 decision.

## How a survey links to an engagement

| Step | Team Hub | Clearway Live |
| --- | --- | --- |
| Church | `clients.id` | Church's stored Team Hub client id |
| Engagement | `engagements.id` | Engagement's stored Team Hub engagement id |
| Survey | `surveys.engagement_id` (nullable, set null if the engagement is deleted) and `surveys.client_id` (nullable) | Read surveys where `engagement_id` matches and `deleted` is false. Fall back to the church's client id only when a survey has no engagement, and ask the facilitator to pick |
| Responses | `survey_responses.survey_id` (cascade delete with the survey) | Read by survey id |

## Team Hub tables Clearway Live would read

### `surveys` (30 rows, RLS on, 3 soft-deleted)

| Column | Type | Read? | Why |
| --- | --- | --- | --- |
| id | uuid | Yes | Survey id stored in Live |
| client_id | uuid, nullable | Yes | Fallback link to the church |
| engagement_id | uuid, nullable | Yes | Link to the engagement |
| title | text | Yes | Shown on setup and What We Heard |
| description | text | No | Not needed |
| status | text: draft, published, closed | Yes | Show "still open" or "closed" |
| builder_data | jsonb | Yes | The questions. Shape: `{ version: "survey_v1", sections: [{ id, title, description?, questions: [...] }] }` |
| settings | jsonb | No | Holds Google Sheet ids and URLs, email collection and messages |
| response_count | integer | Yes | Kept in step with the real count (all 30 match today) |
| public_token | text | **Never** | The open survey link's secret |
| locked_at | timestamptz | Yes | Set by a trigger on the first response, so questions stop changing after answers arrive |
| published_at, closed_at, close_date | timestamptz | Yes | Dates for setup |
| created_by, updated_by, deleted_by | uuid | No | Staff ids, not needed |
| created_at, updated_at | timestamptz | updated_at only | Refresh check |
| deleted, deleted_at | boolean, timestamptz | Filter only | Hide deleted surveys |

Questions inside `builder_data` carry `id`, `type`, `title`, and depending on type `options`, `min`, `max`, `min_label`, `max_label`, `scale_mode`, `required`, `description` and `body_html`. Question types in use today:

| Team Hub type | Count in all surveys | Clearway Live treatment |
| --- | --- | --- |
| long_text | 175 | Open text, themed |
| single_choice | 65 | Bars. Also the way demographics are asked (age band, years at the church, role) |
| info_block | 40 | Not a question, skip |
| linear_scale | 22 | Scale |
| short_text | 11 | Open text. May hold names, see privacy |
| slider | 6 | Scale |
| multi_choice | 5 | Bars, each option counted |
| file_upload | 1 | Skip. Files live in a private store |

Team Hub has no ranking question type and no separate demographics type. The PRD's question list (multiple choice, scale, ranking, open text, demographics) maps onto these except ranking. Segments would be built from whichever single choice questions the facilitator marks as demographics.

### `survey_responses` (3,299 rows, RLS on, no soft delete column)

| Column | Type | Read? | Why |
| --- | --- | --- | --- |
| id | uuid | Yes | Keyset paging and theme sources |
| survey_id | uuid | Yes | Link to survey |
| response_data | jsonb | Yes | Answers keyed by question id: strings (35,552 values), numbers (3,272), arrays (24, multi choice) and objects (7, file uploads) |
| submitted_at | timestamptz | Yes | Paging, and "responses since last refresh" |
| email | text, nullable | **Never** | Breaks anonymity |
| ip_hash | text, nullable | Not directly | Present on 3,038 responses. See the duplicate flag option |
| user_agent | text, nullable | **Never** | Device fingerprinting |
| client_submission_id | text, nullable | No | Team Hub's own retry protection, unique per survey |
| sheet_synced_at, sheet_sync_attempts, sheet_sync_error | | No | Google Sheet sync bookkeeping |

### Team Hub's analysis pipeline (optional source of themes)

| Table or view | Rows | What it holds |
| --- | --- | --- |
| analyses | 6 (2 published) | One per survey. Status draft, data_prep, coding, in_review, approved, published. `valid_n`, `excluded_responses`, `share_token`, `published_report` |
| analysis_questions | | One per question in the analysis: open or closed, `denominator`, `coding_status` (not_started to approved) |
| codes | 440 | The themes: `code`, `theme_label`, `definition`, `is_active`, `is_pinned_salient` |
| coding_units | | Open answers split into meaning units. Holds raw answer text |
| code_assignments | | Which unit got which theme, with `source` (ai_draft, human_validated, human_added) and a reliability pass |
| report_components | | Approved report sections |
| analysis_question_frequencies (view, security invoker) | | Per theme: `response_count`, `unit_application_count`, `response_percentage` against the question's denominator |

### Other survey objects in Team Hub (not for Clearway Live)

- `survey_attachments`: uploaded files, readable only by Team Hub's server.
- `survey_sheet_reconciliation_runs`: Google Sheet sync history.
- The `hcs` schema: a separate Healthy Church Survey system with its own cycles, cohorts, demographics and links (1 response today). It isn't the survey builder and isn't covered here.

### Security state

- RLS is enabled (not forced) on every survey table. The only policies let an active Team Hub team member read and write through Team Hub's own app. There is no public read policy. Public answers come in through Team Hub's server.
- The `clearway_live_view_owner` role has no grants on any survey table today, so the installed reader can't see surveys.
- The existing reader settings still apply to anything added: five connections at most, read-only, 5 second statement timeout.
- Separate from surveys, Supabase's advisor flags two Team Hub tables, `public.tmp_core_html` and `public.tmp_core_text`, with RLS disabled. They look empty, but anyone with Team Hub's public key could read or write them. Enabling RLS on them, or dropping them if they're leftovers, is your call in Team Hub. Clearway Live doesn't use them.

## What the reader needs (options for Chris)

Each option follows the pattern the installed reader already uses: column grants to `clearway_live_view_owner`, a read policy for that role only, a security-barrier view in `live_read`, and SELECT on the view for `clearway_live_reader`. It would go in a reviewed script that you run in Team Hub, with the same fake-data test in CI. None of this exists yet.

| Option | What Clearway Live can see | Good | Watch |
| --- | --- | --- | --- |
| **A. Raw answers, privacy columns removed** | `live_read.surveys` (the "Yes" columns above) and `live_read.survey_responses` (id, survey_id, response_data, submitted_at) for non-deleted surveys | Live can do everything the PRD asks: counts, segments with the under-5 rule, thin data, its own AI themes, examples | Open answers can still name people, and a short text question could ask for a name. Live has to keep raw answers on the facilitator side only |
| **B. Totals plus open text only** | A view of counts per question and option for closed questions, plus a view of open text answers with their response id and segment answers | Less raw data crosses over | Segment breakdowns need the counts computed per segment in Team Hub, which is more SQL to review. Less flexible later |
| **C. Team Hub's reviewed themes** | Views over `codes` and `analysis_question_frequencies` for analyses that are approved or published, plus the analysis's `valid_n` | Reuses themes a person already reviewed, with real counts, so nothing is themed twice | Only works once the analysis has been coded in Team Hub before the pre-call. Themes come per question, not across the survey |
| **D. Duplicate flag without the hash** | A boolean or count per response, "shares a network with another response", computed in Team Hub | Meets the PRD's flag-never-block rule without moving the hash | Team Hub has no device id, so the flag rests on network only, which a whole church on wifi will trip. Treat it as a hint |

A and C can be combined: raw answers for counts and segments, with Team Hub's reviewed themes offered first where they exist. D can be added to A. Whatever you choose, `email`, `user_agent`, `public_token`, `settings` and `coding_units.unit_text` should stay out of every view.

If you choose A, the policy on `survey_responses` has to check its parent survey isn't deleted, since responses have no delete flag of their own.

## Volume

- A few hundred responses at about 1 KB each is a few hundred KB. Even the largest survey in Team Hub today (2,660 responses) is about 3 MB.
- Read in pages of 500 ordered by `(submitted_at, id)`. Team Hub already has an index on `(survey_id, submitted_at desc)`, so each page is fast and well inside the 5 second timeout.
- Copy the responses into Clearway Live's own database on refresh, rather than reading Team Hub during the pre-call or retreat. The PRD requires the room to keep working if Team Hub is down, and a stored copy also keeps theme sources stable.
- Use `surveys.response_count` and `updated_at` as a cheap check before re-reading. Once `status` is closed, one final read is enough.
- Team Hub doesn't broadcast survey changes, so the response count on setup refreshes on load or when the facilitator taps refresh. Polling every minute or so while a survey is open would be fine within the five-connection limit.

## Privacy notes

- **Email.** One survey is set to require email, and 7 responses carry one. The view must never include `email`. If a Discover survey collects email, tell the church that answers are anonymous to the room but not to Clearway.
- **Names in answers.** Open answers and short text questions can name staff or members. The PRD says AI themes carry no names. Example quotes shown on the facilitator view or in What We Heard need the same rule, and raw answers must never reach the TV, phones or the elder link.
- **Small segments.** Hide any segment under 5 respondents (PRD Default). With Team Hub's single choice demographics, this check happens in Clearway Live after reading.
- **Network hash and browser.** `ip_hash` and `user_agent` together can single out a person on a small church network. Keep both out of Live (option D gives a flag instead).
- **Retention.** A copy in Live inherits Live's row-level security and soft delete. Deleting a survey in Team Hub won't delete Live's copy, so Live needs its own clear-out when an engagement closes, if you want that.
