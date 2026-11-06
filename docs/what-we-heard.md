# What We Heard from accepted themes (milestone 6, step 4)

PRE-08. On the Discover setup page the facilitator presses Draft What We Heard. AI reads only the accepted themes and survey findings and drafts one headline with depth for each What We Heard content step in the engagement's run of show. The facilitator edits each draft and presses Apply, which writes the step. Nothing reaches the TV or phones until the step goes live as usual.

Migration: `supabase/migrations/20261106040000_what_we_heard.sql`. Prompt: `heard-draft@1` in `lib/ai/prompts.ts`. Page: Discover, `/setup/[id]/discover`, the What We Heard part (below Themes).

## What the facilitator sees

- **Draft What We Heard** (becomes **Redraft What We Heard** after a draft). On only when AI is on for the engagement and at least one source has both a step and accepted themes. It runs the job `draft_what_we_heard` on the deeper model.
- One row per source: Congregational survey, Four Helpful Lists, Board and staff input conversations, Leadership interviews. Steps are matched by `options.source`, by the words before the first " · ", whatever the case. A source with no step says so and links to the run of show. A source with no accepted themes says "Nothing accepted yet for ..." and AI invents nothing for it.
- A draft has the number, the headline line (one bold phrase), the detail for phones, up to three quotes the room said (each can be left out), how it reads on the TV, and what phones see. The AI icon marks a draft AI wrote. "Edited" shows once the facilitator has changed it. Thin data is marked on the line as "(thin data)", added by the page, never hidden.
- **Apply** writes the step's headline (`prompt`), `options.number`, `options.source` (with the basis after the source's name, such as "Congregational survey · 87 respondents") and the phone depth, through the run of show's own save. Nothing else in the step changes. **Save draft** keeps edits without applying. **Discard draft** removes it. "Applied to the step" shows until the draft is edited again.
- **Type it by hand** is on every source with a step and no draft, so the page never waits on AI. Slow (over 30 seconds): "This is taking longer than usual". Failed: "AI couldn't draft the headlines this time", Redraft to retry, and the by-hand path stays open.
- A redraft keeps every draft the facilitator edited, applied or typed by hand. "Themes changed since this was drafted" shows on a draft whose themes moved.

## Records

- `private.heard_rounds`: one row per engagement. Status pending, drafting, ready, failed or idle; the lease; attempts; last error, success and counts offered, refused and kept.
- `private.heard_drafts`: one row per engagement and source (unique where not deleted). Number, line, detail, quotes, what it rests on, thin and why, basis, the theme ids, by hand, edited, the AI run, applied time and step. Test rows carry `test`.
- `private.ai_runs`: the job `draft_what_we_heard` (engagement-level, so `session_id` may be null, as for the themes draft and `overnight_draft`).
- Both tables: RLS enabled and forced, no browser grant, service role only.

## Functions

Facilitators (lead and co-facilitator only; every function checks the role again): `discover_heard_state`, `discover_heard_start(p_engagement, p_id)` (statuses ai_off, nothing, busy, duplicate, ok), `discover_heard_edit`, `discover_heard_discard`, `discover_heard_applied`. Each is a `security definer` function in `private` with a `security invoker` wrapper in `public`.

The worker (service role only): `discover_heard_due`, `discover_heard_claim`, `discover_heard_apply`, `discover_heard_fail`. Helpers: `heard_source_key`, `heard_steps`, `heard_themes`, `heard_inputs`.

What the model is given: accepted themes (through `private.discover_accepted_themes`, step 3) per source under short refs (t1, q1), with the label, the detail, the figure, the count text, thin and quotes. Conversation themes are split by the kind of note (input or interview) with a count for each kind. It is never given a note's person field, a title, a name or an id. A quote that carries a name is dropped before the claim.

What the database decides, not the model: the number is the lead theme's figure; quotes are chosen by ref and copied from the inputs; a line or detail with a number the themes do not carry, a name, or an unsourced claim is refused; thin follows the lead theme.

## Shared objects changed

| Object | Earlier definition extended | Change |
| --- | --- | --- |
| `private.ai_runs` `ai_runs_job_check` | step 3's list (candidates, `fold_four_lists`, `draft_discover_themes`) | adds `draft_what_we_heard` |
| `private.ai_runs` `ai_runs_session_check` | step 3's (`overnight_draft`, `draft_discover_themes`) | adds `draft_what_we_heard` as engagement-level |
| `private.reset_practice_room` | the newest, step 2's wrapper over step 3's base | renamed `_base4` and wrapped; also soft-deletes the practice room's drafts and rounds |
| `private.rehearsal_control` | the newest, step 2's wrapper over step 1's | renamed `_base4` and wrapped; Clear test answers also clears test drafts and returns the round to idle when none is left |

Wrapping the newest definition keeps every earlier step's clearing in place, whichever step merges first.

## Defaults chosen

- The number on a headline is the lead theme's own figure (the highest count in its source); the model writes no numbers.
- Line up to 140 characters with at most one `**bold**` phrase; detail up to 600; number up to 12; at most three quotes.
- Slow after 30 seconds (`CLEARWAY_AI_HEARD_SLOW_MS` shortens it for the kit); the model call allows at least 60 seconds and never goes past the 300 second function limit.
- Apply on a step that is already live shows the change at once, as any edit to a live step does; the step's state never changes.
- If the functions are missing from the database, the page leaves the section out and says nothing is wrong.

## Limits

- Clear test answers does not count drafts in the rehearsal `test_answers` total (`control_status` is unchanged); they are cleared all the same.
- Matching needs the template's source names. A step whose source is something else is not drafted for.
- It never reads the congregational survey itself, only the findings step 1 saved.

## Tests

- pgTAP `supabase/tests/database/what_we_heard.test.sql` (163): the records, grants, job check, source matching, theme splitting, roles, claim contents, apply refusals, number from the lead figure, quotes by ref, thin, kept edits on redraft, failure and retry, the practice reset and Clear test answers.
- Unit `tests/unit/what-we-heard.test.ts` (15) with `tests/fixtures/ai/what-we-heard.json` (Riverside): prompt rules, refs only, defensive parse, recorded reply, a real never-names check, the fake, the pure helpers and the worker.
- Browser `npm run test:what-we-heard` (9 checks): drafting, edit and redraft, Apply into the step, a live step, nothing accepted, slow and failed AI with the by-hand path, roles, and the quiet state.
