# The Wayfinding report (milestone 7, step 1)

AFT-01. After the retreat, the facilitators draft the Wayfinding report from the records the room made, edit it, review every section and the lead signs it off. Nothing here reaches the room or the church: sharing and export are later steps.

Migration: `supabase/migrations/20261108010000_report.sql`. Prompts: `report-<section>@1` and `report-lead@1` in `lib/ai/prompts.ts`. Pages: `/control/[id]/report` and the hub `/control/[id]/after`. Worker: `lib/ai/report.ts`.

## What the facilitator sees

- **After the retreat** on the control surface (only when the report's functions are in the database; it fails quietly otherwise). It opens the hub: Report, Visibility plan, Share and Check-ins. Visibility plan opens `/control/[id]/plan` (step 3). Share and Check-ins say "Coming in this milestone".
- **Draft the report** builds all 14 sections in order: Overview, The church today, The Wayfinding process, What We Heard, Leadership interviews, Tensions we worked through, The 10-year Future, The 3-year Vision, Risks and how we answer them, The 1-year Outlook, Commander's intent, Decisions made, The visibility plan, Closing. Each section shows Drafting, Drafted, Edited, Reviewed, Needs attention or Thin data, and appears on the page as soon as it is ready.
- Seven sections are prose, drafted by the model: Overview, The church today, The Wayfinding process, What We Heard, Leadership interviews, Tensions we worked through and Closing. Overview and Closing are drafted last, from the other sections' own sentences. Seven are tables built by code from the records (the 10-year Future, 3-year Vision, risks, 1-year Outlook, commander's intent, decisions, visibility plan); the model writes only a one or two sentence lead above each. Owners and dates in a table come from the records, never from the model.
- Every sentence rests on sources: the records it came from, shown in a panel beside it with the words it used lit (the same lighting as the overnight review). A quotation is kept as the room's exact words. A sentence on thin data carries a "Thin data" label that follows the milestone 6 thin rules. The panel shows a scribe card's speaker for the facilitators only.
- A sentence can be edited, removed, given the room's words (with undo back to the draft wording), or added by the facilitator ("Add your own read", which needs no source). Sources can be added from the records the section reads, or taken off. A sentence that is not the facilitator's own and has no source is marked "No source".
- **Redraft section** keeps every sentence the facilitator touched and asks inside the panel first when there are any. **Refresh from the records** rebuilds a table and asks first when the facilitator changed any of its lines.
- **Mark reviewed** on each section. Editing a section takes its review away. **Sign off the report** is for the lead only, and waits until every section is reviewed and every sentence that is not the facilitator's own has a source. A report changed after it was signed is signed again as the next version; earlier versions are kept as they were signed.
- With AI off for the engagement the tables are still built from the records; the other sections are written by hand.

## The signal rule

A signal can be a source only when it is aligned and the facilitator saved it as a citation (`saved_as_citation_at`). The database enforces it with a trigger on `report_sources`, whoever writes the row, and the sign-off check counts a sentence as unsourced if the signal behind it is no longer saved. Divergent, silent and thin signals are never sources.

## Records (all in `private`, RLS enabled and forced, no browser grant)

`report_drafts` (one per engagement), `report_sections` (14 keys), `report_sentences` (origin ai, facilitator, room or record; the AI wording kept for undo), `report_sources` (a kind, the record's id, the excerpt, whether it is the room's words), `report_rounds` (the drafting queue and lease), `report_sign_offs` (the snapshot as text, one row for each version). All rows carry the practice room's `test` flag and are put away by the practice reset and Clear test answers.

## Functions

Facilitators (lead and co-facilitator only; every function checks the role again; each has a `security invoker` wrapper in `public`): `report_state`, `report_candidates`, `report_start(p_engagement, p_id, p_scope, p_section, p_confirm)`, `report_refresh`, `report_edit`, `report_add`, `report_remove`, `report_room_words`, `report_undo_room_words`, `report_source_set`, `report_mark_reviewed`, `report_sign_off` (statuses lead_only, no_draft, not_reviewed, unsourced, unchanged, duplicate, ok).

The worker (service role only): `report_due`, `report_claim`, `report_apply`, `report_fail`, `report_section_inputs`. One run in `private.ai_runs` for each section (job `draft_report`, no session). The lease lasts six minutes; a failure is retried once after a pause, then the section is marked Needs attention and the round moves on.

Contract functions for the later steps (service role only):

- `private.report_signed_for_view(p_engagement uuid) returns jsonb`: the newest signed version as `{ n, signed_at, sections }`, every sentence as text with its origin, quote and thin label, and the sources stripped out. Null before the first sign-off.
- `private.visibility_plan_for_report(p_engagement uuid) returns table(row_id uuid, position int, who text, when_text text, by_whom text, what_they_hear text, risk text, reviewed boolean, sources jsonb)`: step 3 replaced the fixture with the real function (`docs/visibility-plan.md`): the plan's rows that are not deleted, in position order. The report's visibility section reads it, and each row's `sources` is `[{ kind, ref_id, excerpt, room }]`.

## What the model is given and what the code decides

The model sees refs only (`f1` survey finding, `t1` accepted theme, `q1` quote, `c1` Four Helpful Lists card, `g1` saved aligned signal, `s1` scribe card, `e1` celebration, `h1` church or run of show record, `o1` challenged outcome, `d1` decision, `b1` a table's record sentence, `z1` another section's sentence) with a group name and the words. Never a name, email, role, speaker or id. Free text that names someone is left out.

`report_apply` keeps a sentence only if it cites refs it was given, any quotation is copied word for word from a cited ref, every number (digits, and spelled out from two to twenty) is carried by a cited ref, it names no attendee, it has no "communication plan" and writes the horizons exactly (10-year Future, 3-year Vision, 1-year Outlook), and it passes the profanity filter. Dashes and semicolons are rewritten to commas. A section that loses a sentence is marked Needs attention. The untouched AI sentences of a section are replaced only when at least one new sentence is kept.

## Shared objects changed

| Object | Earlier definition extended | Change |
| --- | --- | --- |
| `ai_runs_job_check` | the newest list | adds `draft_report` and `draft_visibility_plan` |
| `ai_runs_session_check` | the newest | lets both run with no session |
| `private.reset_practice_room` | the newest | renamed `_pre_report` and wrapped; puts away every report record |
| `private.rehearsal_control` | the newest | renamed `_pre_report` and wrapped; Clear test answers puts away what a rehearsal made |

## Tests

`supabase/tests/database/report.test.sql` (roles, the signal rule, every check on a reply, sign-off, practice room), `tests/unit/report.test.ts` with `tests/fixtures/ai/report.json` (prompts, parsing, the stand-in, the worker, the page's rules), and `npm run test:report` (`tests/browser/report.ts`, on the seeded Riverside engagement with `CLEARWAY_AI_FAKE=script`; the fake's control file can fail one section with `failSection`).

## Defaults chosen

- The model's lead above a table is one or two sentences with no number and no horizon term. Tables are never written by the model.
- A section with nothing to read is marked Thin data without calling the model.
- A sign-off snapshots every sentence's text and sources; `report_signed_for_view` strips the sources.
- Anyone who is a lead or co-facilitator can draft, edit and review; only the lead signs off.
