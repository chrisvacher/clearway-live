# The Four Helpful Lists

Milestone 6, step 1. One interaction kind, `four_lists` (INT-11), and the review after the session (SET-05). Migration `20261105150000_four_lists.sql`. It works in any engagement and is usually run with a board or an elder team before the retreat.

## What the room does

Four fixed lists: What's right? What's wrong? What's missing? What's confused? A person picks a list on their phone, writes a card (up to 200 characters, anonymous) and sends it. Everyone sees everyone's cards on their phone, by list, and taps Agree on the ones they share. One agreement per person per card, taken back with a second tap, never on their own card. A step also works self-paced: the same phone, open between two times.

The TV shows the four lists side by side, told apart by heading and position and never by colour alone. A card shows its words, how many people agreed, and (once AI has grouped it) the AI icon and how many cards it holds. Counts tick up as agreement arrives, the lists re-order by agreement and every card glides to its place. No refresh, no reveal step. Each list shows as many whole cards as fit, at most eight, most agreed first; the rest wait on phones under "+ n more on phones". The type starts at the TV body size and steps down once to the room minimum before any card is held back. It does not step back up during the step.

## Who sees what

| Surface | Sees |
| --- | --- |
| TV | The words, the list, the agreement count, "+ n more on phones", "Grouped from your answers" beside the AI icon once AI has grouped anything. No name, no author. |
| Phone | Every card by list with its count, which cards are its own (marked Yours) and which it agreed with. No name, no author. |
| Control surface and remote | The count in each list, every card with its agreement count and Hide or Unhide, the AI groups with their list, Pin, Rename and Undo, AI on and off, and a link to the review. |
| Review (SET-05) | Facilitators only. |

Votes never decide. An agreement count is a number beside a card. The facilitator chooses what feeds What We Heard.

## How it is stored

Cards are ordinary `submissions` rows with `value = {"column": "right" | "wrong" | "missing" | "confused"}`, sent through the same phone outbox as every answer (`parse_four_lists` requires a list and 200 characters at most). Two tables are new, both private, forced RLS and reached only through `security definer` functions:

- `private.four_list_agreements`: one live row per person per card (a partial unique index), set to agreed or taken back. `four_lists_agree(engagement, card, on)` is a state, not a toggle, so a resend never flips it twice. It refuses a person's own card (`own`), a hidden or withdrawn card (`missing`) and a step that is not taking input (`closed`), and it raises the room version so the count reaches the TV.
- `private.four_list_review`: what the facilitator did after the session: edited words (the original stays on the submission), kept or set aside, merged into another card, and the two marks `feeds_heard` and `feeds_tensions`.

The room results (`results_four_lists`) hold, per list, the card and unit counts, and up to eight cards each with its id, list, words, agreement count, how many cards it holds, whether AI grouped it, whether it is pinned and the ids it holds. They never hold an author. The control surface's items (`items_four_lists`) add the hidden cards and the list.

## AI grouping

Job `group_four_lists`, prompt `group-four-lists@1` in `lib/ai/prompts.ts`. It reuses the wall's group tables (`private.ai_groups`, `ai_group_members`) and the wall's claim, apply, undo, redo, pin and rename, so the limits are the wall's, plus these, all code in `ai_apply`:

- A group stays inside one list. A reply that crosses lists is refused for that group.
- A new group holds at least two cards. A pinned group takes nothing.
- The model sees refs, the list and the words. It never sees an id, a name or an agreement count. The card that stays is the most agreed in the group, then the oldest; a group's count is the number of different people who agreed with any card in it.
- AI is never in the path from a phone to the TV. A card is stored and on the TV before the worker is asked. With AI off, failing or slow, every card stands on its own and nothing else changes (FAIL-09 shows on the control surface only).
- Off removes the grouping from the TV and puts every card back; on groups again. Undo dissolves one group; Undo last AI change undoes the last run.

When a grouped card absorbs another on the TV, the absorbed card slides into it and fades while the count adds. Reduced motion shows the final state at once.

## The review (SET-05)

`/control/<engagement>/lists/<session>`, linked from the control surface. Four columns, one card each with its agreement count. The facilitator can:

- Edit the words (up to 200 characters, through the word filter). The original is shown under it.
- Merge cards of one list: the first selected card keeps its words and the others join it. Their people add without counting anyone twice. Take a card back out.
- Keep a card or set it aside. Setting aside clears its marks and lets cards merged into it stand alone.
- Mark Feeds What We Heard (any list) and Feeds Strategic Tensions (What's wrong? and What's confused? only; the database refuses it elsewhere).

The marks are stored for step 4 (What We Heard). `four_lists_marks(engagement)` returns every marked card with its list, its words as edited, the number of people who agreed and how many people took part in the step. Facilitators and the service role may call it.

## Templates and exports

The run of show builder palette offers Four Helpful Lists by its label, and the printed run of show names it the same way (FAIL-10). A dropped step starts with AI grouping on and a limit of 12 cards per person. The shipped template Board discovery session (a welcome, the lists for 35 minutes, a close; 45 minutes) is new in this step and is flagged for Chris. The CSV has a List column and a Card column.

## Rehearsal and practice

Rehearsal answers are test answers like every kind: test agreements are cleared and counted with votes by `rehearsal_control`, and `reset_practice_room` clears the two new tables for the practice room.

## Shared objects this migration replaces

Each is a superset of its definition on main when this step was written, so nothing already built changes:

| Object | Built on | What this adds |
| --- | --- | --- |
| `ai_runs_job_check` | The list from `20261104170000_candidates.sql` | `group_four_lists` |
| `ai_on` | The candidates-era definition | `four_lists` |
| `reset_practice_room` | `20261104190000_m4_acceptance_fixes.sql` | The two new tables |
| `rehearsal_control` | `20261105100000_practice_fixes_1.sql` | Test agreements and review rows |
| `ai_claim`, `ai_apply`, `ai_fail`, `ai_status`, `ai_control` | The wall and lens definitions, renamed `_base5`, `_base5`, `_base4`, `_base1`, `_base1` | A four_lists branch; every other session goes to the renamed original |

## Tests

- `supabase/tests/database/four_lists.test.sql`: by role (anonymous, participant, other engagement, facilitator, service role): the registry, forced RLS and grants, saving options, the cards, the results with no names, agreements (own, hidden, closed, twice, undo), hide, phones down, AI claim and apply under their limits, undo, pin, off, the review and the marks, rehearsal and practice clearing, the shipped template.
- `tests/unit/four-lists.test.ts`: the kind, the pure rules, the prompt against the Riverside fixtures in `tests/fixtures/ai/four-lists.json` (recorded replies through the fake client, the scripted stand-in), the CSV.
- `npm run test:four-lists` (`tests/browser/four-lists.ts`): a paired TV and 50 simulated phones adding 100 cards and agreeing, with the model made slow. It checks 95 of 100 phone-to-TV times under a second, frame sampling (no card leaps when its place changes and the TV never blanks), that the TV's order and counts match the server and that the line for cards waiting on phones is right, AI grouping inside lists with the scripted stand-in, pin, undo, off and on, Hide, a phone in a real browser, the review with its marks, and the control surface. CI runs it after the other kits and uploads the screenshots.
