# Discover themes (milestone 6, step 3)

SET-06's themes. AI drafts themes from the conversation notes and the Four Helpful Lists cards when the facilitator presses Draft themes. The facilitator accepts, renames, merges or rejects each one, or writes one by hand. Only accepted themes count anywhere.

Migration: `supabase/migrations/20261106030000_discover_themes.sql`. Prompt: `themes-draft@1` in `lib/ai/prompts.ts`. Page: Discover, `/setup/[id]/discover`, the Themes part.

## What the facilitator sees

- **Draft themes** (becomes **Redraft themes** after a draft). It is on only when AI is on for the engagement and there is something to read. Redraft keeps every accepted theme, sends the accepted and the rejected labels to the model so they are not offered again, and offers only new themes beside them.
- Each theme shows its label, what it rests on ("4 of 5 conversations", "3 of 8 people"), a bar for card themes, its kind, the AI icon when AI drafted it, a thin or strong mark, one or two quotes, and the sources it rests on (a note by its title, a card by its list and words). Never a person.
- **Accept** (Undo takes it back), **Rename** (the page keeps "Renamed from" and the old name), **Merge** into another theme of the same kind (the theme glides beneath the survivor, the survivor's counts recount once from the union of sources, **Split out** reverses it) and **Reject** (fades out; **Bring back** under Rejected themes).
- **Add a theme by hand**: a name, a detail and the notes or cards it rests on. It is accepted at once and carries no AI mark.
- Slow (over 30 seconds): "This is taking longer than usual" and the facilitator can keep working or add a theme by hand. Failed: "AI couldn't draft themes this time", Redraft themes to try again, and the by-hand form (FAIL-09 style).
- Survey themes come from step 1's findings. They appear in the same list, follow their finding, and have no actions here. AI never drafts them.

## Records

- `private.discover_theme_rounds`: one row per engagement. Status pending, drafting, ready, failed or idle; whether it is a redraft; the lease; attempts; the last error, success and counts offered and refused; the inputs summary (`notes`, `cards`, `left_out`). Row-level security enabled and forced, service role only.
- `private.discover_themes.original_label`: what a renamed theme was called.
- `private.ai_runs`: the job `draft_discover_themes` (engagement-level, so `session_id` may be null for it, as for `overnight_draft`). Every run, its tokens, cost and time, are logged there like the live jobs.

## Functions

Facilitators (lead and co-facilitator only; every function checks the role):

| Function | Does |
| --- | --- |
| `discover_themes_state(p_engagement)` | The themes with sources, members and flags, the round, the notes (title and kind) and the cards. Never the person field. |
| `discover_theme_act(p_engagement, p_theme, p_action, p)` | accept, undo, reject, restore, rename, merge, split. |
| `discover_theme_add(p_engagement, p_id, p_source, p_label, p_detail, p_sources)` | A hand-made, accepted theme. |
| `discover_draft_start(p_engagement, p_id)` | Starts or restarts a round. Statuses ai_off, nothing, busy, duplicate, ok. |

The worker (service role only): `discover_theme_due`, `discover_theme_claim`, `discover_theme_apply`, `discover_theme_fail`. The claim hands the model note text and kind and card words under short refs (n1, f1). It cuts a note at 30,000 characters and the whole at 180,000 and says how many were cut (`left_out`). The apply keeps a theme only when it has a source of its own kind, its label, detail and quote carry no name from the people in the engagement or the stoplist, a quote is word for word in a source, and the label is not already on the page. The counts are written from the sources, never from the model.

## What steps 4 and 5 read

`private.discover_accepted_themes(p_engagement uuid)` returns the accepted themes only, with a merged theme counted in its survivor and a rejected, draft, deleted or finding-less theme left out:

| Column | Meaning |
| --- | --- |
| `theme_id uuid` | The theme. |
| `source text` | `survey`, `conversations` or `four_lists`. |
| `label text`, `detail text` | The theme as the facilitator accepted it. |
| `rests_on integer`, `out_of integer` | "Rests on / out of": respondents of the survey; notes the theme rests on, out of all notes; or the distinct people behind its cards, out of the people in the room (the greater of the room's participants and the distinct people on any card). A card theme is read live from the cards, so it follows them as the room works. |
| `thin boolean`, `strong boolean` | From the rules in `lib/discover/thin.ts` and `strength.ts` (same cases in `supabase/tests/database/discover_themes.test.sql` and `tests/unit/discover-themes.test.ts`). |
| `quotes jsonb` | `[{kind: finding or note or card, id, quote}]`, the room's own words, never a person. |

It is `security definer` in `private`, with no grant to `anon` or `authenticated`.

## Defaults chosen

- **People on the lists.** `private.four_lists_cards_for_themes` returns `(card_id, session_id, "column", "text", agree, folded_ids, people)`. `people` is the distinct people who wrote or agreed with the card and the cards folded into it. A card theme's `rests_on` is the distinct union of `people` over its cards (a card folded beneath another counts through it). `out_of` is the greater of the participants in the room and the distinct people on any card. Nothing here reads `public.submissions`. The count is read live (`private.discover_card_counts`) in the page and in `discover_accepted_themes`, and stored when a theme changes.
- **Thin.** Conversations and Four Helpful Lists themes are thin when they rest on one source or none. Survey rules are step 1's. **Strong** is 40 percent or more and not thin.
- **Busy.** A draft counts as running for 3 minutes from the request, then Draft themes may start a new one. One failed call is retried after 15 seconds, a second ends the round as failed.
- **Limits.** At most 8 themes per kind per round, 3 quotes per theme, 300 cards and 300 themes per engagement, 60 sources on a hand-made theme. The page lists up to 200 cards for a hand-made theme; the model reads up to 300, and the page says how many notes were cut short or left out and how many cards were left out.
- **Timing.** The themes job gets at least 90 seconds for a call (`CLEARWAY_AI_MODEL_DEEP`). The page waits 30 seconds before it says "taking longer than usual" (`CLEARWAY_AI_THEMES_SLOW_MS` shortens it in the kit).
- **Notes added later** recount a conversation theme; the page says how many notes are newer than the last draft.

## Deviations and things left open

- `reset_practice_room` is redefined here as a superset of step 1's (20261106010000): the same text plus the practice room's `discover_theme_rounds`. If step 2 has already wrapped it (renamed to `reset_practice_room_base`), the migration redefines the base instead, so step 2's wrapper and its Four Helpful Lists clearing stay. `rehearsal_control` is not changed: step 1 already clears drafted test themes, and the page hides a round once the notes and cards are gone.
- `ai_on`, `ai_claim` and `ai_apply` are not changed: the job has no session, so it has its own claim and apply.
- Order with step 2: the stub for `four_lists_cards_for_themes` is made only when the function is missing. Step 2's migration (020000) runs first and replaces nothing of mine. If this one ran first, the stub is made only when the function is missing, and step 2 would need `create or replace`. Whichever of steps 2 to 5 merges later must rebase the `ai_runs_job_check` list.
- Survey themes cannot be merged with other kinds, and AI never reads the survey.

## Tests

- `supabase/tests/database/discover_themes.test.sql`: row-level security, wrappers, every role on every function, the claim contents, the apply refusals, counts, quotes, merge and split, hand-made themes, note recounts, `discover_accepted_themes`, failure and retry, redraft.
- `tests/unit/discover-themes.test.ts` with `tests/fixtures/ai/discover-themes.json` (Riverside): prompt rules, parse, recorded reply, the scripted fake, the worker.
- `npm run test:themes`: the browser kit (draft, accept, rename, merge, reject, redraft, slow, failed, by hand, who can reach it). It stands a fixed set of cards in for step 2's function and puts the original back.
