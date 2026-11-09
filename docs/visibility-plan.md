# The visibility plan (milestone 7, step 3)

AFT-02. After the retreat, the facilitators draft a visibility plan from what the room said: who needs to hear the Vision, when, who tells them, what they hear and the risk each conversation answers. It is private to the facilitators and is the table in the report's Make the Vision Visible section. Nothing here reaches the room or the church.

Migrations: `supabase/migrations/20261108030000_visibility_plan.sql`, then `20261108090000_plan_name_check.sql` (the name rule, a row whose when is cleared, and the count the page shows). Prompt: `visibility-plan@2` in `lib/ai/prompts.ts`. Page: `/control/[id]/plan` (linked from the After hub's Visibility plan tile). Worker: `lib/ai/plan.ts`. Policy for the page: `lib/plan/policy.ts`. It builds on the report (step 1): the guard, the cleaners, the source kinds and the check helpers are the report's.

## How a plan is built (the Brain's ruling)

Start from the most public moment (Vision Sunday unless the facilitator names another) and work backwards. The plan moves outward in this order and no other: the lead pastor, the retreat participants, the board or elders, the staff, members and key leaders, the congregation. Commander's intent anchors on the public date: what the church must hear and understand on that day. A row the facilitator names for themselves (stage `other`) sorts after the six.

## What the facilitator sees

- The moment and its date at the top. Without a date no row has a when, and the page says so. With a date, a row may carry a short when ("The week before") and a date on or before it. A row dated after it is flagged, and the facilitator may keep it.
- **Draft the plan** makes the rows: exactly one for each stage that is not already held by a row the facilitator kept (visibility-plan@2). They arrive in the outward order, each with the number of sources it rests on, an AI mark, and the stage. Choosing a row shows its sources in the panel (the same cards as the report). A facilitator's own row says it needs no source.
- Once the plan has been drafted, the stage list at the top says "No row yet" beside any stage that has no row. A row whose when had to be cleared (no public date yet, a date after it, or a date that runs backwards against a kept row) stays, and the page says "1 row’s when was left blank" (or "3 rows’ whens were left blank") until the facilitator writes a when or a date on it. The run's output logs each one with its stage and reason (`blanked_rows`).
- Every cell can be edited in place. A row can be added, moved up or down, removed (after asking) and marked reviewed. Positions always run one to n. Editing a cell makes the row the facilitator's to keep: it is marked Edited and takes the review away.
- **Redraft the plan** asks first when any row is the facilitator's (edited, added, moved or reviewed), keeps those rows where they are and replaces only the rest. New rows go after the last row that is not further out than they are.
- The plan's status is Not drafted, Drafting, Draft to review, Edited, Every row reviewed, Needs attention or Nothing said about it.
- Make the Vision Visible in the report is built from the plan when the report is first drafted and again on Refresh from the records. Every change to the plan (set, edit, add, remove, move, review, apply) marks that section out of date and takes its review away, when a report draft exists. The report says so, and sign-off refuses with "The visibility plan changed since Make the Vision Visible was built. Refresh it from the records." until the section is refreshed. The plan page has a button that refreshes just that section, and a link to open it.
- An engagement that is closed shows the plan read only. A plan left in Drafting (after Clear test answers, for example) is healed the next time it is read.
- Rows drafted in a practice room are marked as test rows and cleared with the practice room. A lease that runs out counts as a failed attempt, and the second one gives up with Needs attention.

## What the model sees and what the database keeps

The model reads refs only, never names: scribe action cards (a), scribe mitigation cards (m), risks (r), mitigations (k), commander's intent cards (i), first steps (s), 1-year goals (g), decisions (d) and ranked success measures (y), plus the public moment and date and the stages already kept. A ref that names a person (the report's `report_names`: attendees, scribe speakers, owners) is never sent. No id, owner, speaker, email or due date reaches it.

A row is kept only when it passes the report's checks (`report_check`) and the plan's own: a known stage; a who and a hear; at least one ref it was given; a when only when there is a public date and a date on or before it (a row whose only fault is its when is kept with the when and the date cleared, and counted in `visibility_plan_rows.when_blanked`; any other failure drops it); no name; no number or spelled-out number its refs do not carry; the horizon terms written exactly; no "communication plan"; a quotation word for word from a cited scribe card. A row that fails is left out and logged with its reason, and the plan reads Needs attention with how many were left out. Rows come back in the outward order whatever order the model wrote them. A signal is a source only when it is aligned and saved as a citation (a database trigger, whoever writes the row).

## The round

One engagement-level round for the plan, as for the report: the press makes it pending, the worker claims it with a six minute lease and makes one run on the deeper model, and the database applies or fails it. The first failure waits ten seconds and is tried again. The second gives up: the plan reads Needs attention with "AI could not draft the plan", nothing the facilitator wrote is lost, and Try again drafts once more. With AI off, Draft says so and the rows are added by hand. A room that said nothing about it reads Nothing said about it and no model call is made.

## Database

Tables in `private`: `visibility_plans`, `visibility_plan_rows`, `visibility_plan_sources`, `visibility_plan_rounds`. Each has row level security enabled and forced and no grant to a browser role. Functions (facilitators only, security definer in `private`, security invoker wrappers in `public`): `visibility_plan_state`, `_set`, `_start`, `_row_edit`, `_row_add`, `_row_remove`, `_row_move`, `_row_reviewed`, and for the worker (service role only) `_due`, `_claim`, `_apply`, `_fail`. `private.visibility_plan_for_report` replaces step 1's fixture with the same signature. `reset_practice_room` and `rehearsal_control` are wrapped (`_pre_visibility_plan`) so Clear test answers and the practice reset put the plan away.

## Tests

`supabase/tests/database/visibility_plan.test.sql` (roles for every table and function, the signal rule, the checks, the round, the contract and the report block), `tests/unit/visibility-plan.test.ts` with `tests/fixtures/ai/visibility-plan.json`, and `npm run test:visibility-plan` (the browser kit, in CI after `test:report`).

## The name check

A report sentence or a plan row must never name a person, and an ordinary lowercase sentence must not be refused. A mistake falls the safe way: a dropped sentence, not a missed name. `private.discover_names` and `private.report_names` build the list of name words from attendees, facilitators, a note's person, scribe speakers and owners (`private.name_words`); `private.discover_has_name` matches it. The rule, in plain words:

- A name word has two letters or more. Accents are folded on both sides, and a word ends at anything that is not a letter, so "_Lee_" and "Grace2" are caught.
- Number words, "phone" and little words (of, to, tv, av) are never names. In a free-text field (a note's person, a speaker, an owner) function words, days of the week and role and description words are never names either (`private.name_stoplist`: member, volunteer, school, office, notes, years and so on), and a two-letter word counts only when it is capitalised there. An attendee's or facilitator's name keeps every word, so "Ann Bishop" keeps Bishop.
- A name that is not an ordinary word is matched in any case.
- A name that is also an ordinary word (`private.name_common`: will, grace, faith, hope, joy, mark, may, rose, young, king, bishop and so on), and any two-letter name (Wu, Ng, Ed), is stored as `*Word` and counts whenever it is written with a capital or in capitals, wherever it sits. Only the lowercase word is clear.
- A month name that is also a given name is not a name inside a date: "June 14", "June 2027", "14 June", "in June", "mid-June".

Tests: `supabase/tests/database/plan_name_check.test.sql`.

## A row added by hand keeps its place through Draft again

A row added by hand holds the number it had (the 5th stays the 5th, or the last when fewer rows stand); other kept rows are placed among the new rows as before. Migration `20261109060000_overnight_four_lists_signal.sql`. Test: `visibility_plan.test.sql`.

## Overnight acceptance fixes, batch c (November 9)

Redraft the plan (and Try again, and Keep them and redraft the rest) stay disabled from the press until the page has read the state back, so a second draft cannot be started while the first runs.
