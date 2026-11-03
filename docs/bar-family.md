# The bar family

Milestone 3, step 2. Multiple choice (INT-04), scale (INT-05), ranking with Add an option (INT-06), 100 points (INT-07) and statements (INT-17). Migration `bar_family`.

## Kinds

Each kind registers itself in `private.interaction_kinds`: it takes input, one answer per person, counted by people ("8 answering"), structured (the TV shows its empty structure before anyone answers), answers shared, Spotlight and Hide by option key, never named. Nothing shared is redefined. Each supplies `options_`, `parse_`, `results_` and `items_` functions.

| Kind | Options (`sessions.options`) | One answer (`submissions.value`) |
| --- | --- | --- |
| `choice` | `items` (2 to 12), `multiple` (pick any) | `{choices: [key]}`, one key unless pick any |
| `scale` | `max` (2 to 10, default 5), `low`, `high`; `items` are made by the database: each number and `average` | `{value: n}` |
| `ranking` | `items` (2 to 12), `suggest` (Add an option) | `{order: [key]}`, one to all of the options, each once |
| `points` | `items` (2 to 8), `cut` (0 for none, else after the top N) | `{points: {key: n}}`, whole points summing to exactly 100 |
| `statements` | `items` (1 to 8), `low`, `high`, `flag_divided` | `{ratings: {key: 1..5}}`, one or more statements |

Options are `items = [{key, text}]`. A missing key gets the next free `oN` on save, and a key never changes, so answers and Spotlight keep pointing at the same option when its words are edited. Duplicate wording is refused.

## Every number on screen comes from the server

`results_<kind>` returns `total`, `people` and the kind's own numbers, in display order. Each bar is `{key, text, place, fraction, leader}` plus its own values. `fraction` is the bar's length from 0 to 1; ties share the lead (Sunrise).

- **Multiple choice:** `count` and `percent`, of people answering (so pick any can pass 100% in total). Length is relative to the leader.
- **Scale:** `scale.average` (one decimal), `low`, `high` and one column per number with its `count` and height.
- **Ranking:** `average` place (one decimal), `ranked` (how many placed it). Unranked options take the middle of the remaining places (Synrg's rule), so a partial ranking counts, and an option added later is unranked in every earlier ranking. Order is by average place; length is `(options + 1 - average) / options`.
- **100 points:** `points` and `share` of the room's points, `cut` and `cut_label` ("Top three"). Only full budgets are ever stored, so a person counts once all 100 are placed.
- **Statements:** `average` agreement, `agree` (the share who chose 4 or 5) and `count`. The bar runs from 1 (empty) to 5 (full). Divided never appears in results, so it can never reach a TV.

`items_<kind>` gives the control surface every option in the TV's order with the same numbers, hidden ones last so they can be unhidden. For statements it adds Divided: at least 35% disagree (1 or 2) and at least 35% agree (4 or 5), once four people have rated it, when Flag divided statements is on.

## Add an option (INT-06)

- **Phone:** with Add an option on, a ranking shows "Suggest an option". `POST /api/live/:id/suggest` calls `ranking_suggest`: the live (or still open) ranking step, the word filter, three per person per step, an id made on the phone so a resend is a duplicate. Suggestions live in `private.ranking_suggestions` under forced row-level security, and a private notice wakes the control surface. No name travels.
- **Control surface:** the "Suggested options" panel (only you see this) reads `GET /api/control/:id/ranking` (`ranking_suggestions_for`). Suggestions whose words sit inside each other ("Prayer", "Prayer and discernment") show as one, with the fullest wording leading and an editable box. Ones that match an existing option say so.
- **Add to every phone:** `POST /api/control/:id/ranking` calls `ranking_control`, following `room_control`: room row lock first, the facilitator check, a client-made id, the version raised once by updating `results`, which broadcasts. The option joins `options.items` with a key of its own, every suggestion in the group is marked added, and the option appears on every phone (marked New) and glides onto the TV. Dismiss clears the group.

## The TV

One live bar component (`components/interactions/bars/tv-bars.tsx`) draws choice, ranking, 100 points and statements; the scale has its own view beside it. The TV, the control surface's mirror and the phone's TV view all draw from it.

- **Value beside the bar** (pass 3 change 3): "n · %" for choice, "avg 2.3" with a place column for ranking, the share for 100 points, "3.8 · 63% agree" for statements. The cut line's label has its own 240px column (scaled with the room).
- **Springs** (change 4): each row's place and each bar's length is a spring that retargets from where it is without losing speed (`springStep`, `springRate`): rows glide on `cwl-dur-bar-trade`, bars grow on `cwl-dur-bar-grow`, the cut line slides on `cwl-dur-cut-line`. Bars grow from zero only on a session's first appearance or for an option added later. Rows never swap. A hidden option fades where it stands, then the rest close up.
- **Labels** sit at `tv-body` while two lines of it fit the row, else at the floor; statements always at the floor. They wrap to two lines and then end. Never below `cwl-fs-tv-floor`; phones carry the whole text.
- **Scale:** the average large in Sunrise ("3.8" over "average of 8"), the spread as live columns, and an average marker sliding along the axis on the same spring.
- **Spotlight** lifts an option with its numbers over the scrim ("Second campus", "0 of 4 · 0%"), before or after anyone answers. The leader takes Royal meanwhile, so Sunrise has one moment. On a scale, Spotlight can lift the average or one number.
- **Reduced motion** puts every row, bar, column and marker in place at once.

## Phones

- **Multiple choice:** pick one (radios) or pick any (checkboxes), then Send; Change my answer until the session closes.
- **Scale:** up to seven numbers as buttons, a tap sends and another tap changes it; wider ranges as a slider that sends when it comes to rest. The end labels sit under it.
- **Ranking:** tap options in priority order, tap a ranked one to remove it, or move one up; "Not ranked yet · counts as the middle". Send my order.
- **100 points** (change 11): five lines with a circle each, all on one screen. Dragging one past the budget takes the overage from the others in proportion to what they hold (largest remainder, whole points), so their circles slide back live; dragging back only frees points. Keyboard: arrows 1, Page Up and Page Down 10, Home and End 0 and 100. Points left always shows; Send waits until all 100 are placed.
- **Statements:** every statement with five numbered buttons on one screen. Each tap sends the person's whole set; tapping another number changes it.
- Each shows sent, saved on this phone, sending or not sent, and holds still and dims when phones are down.

## Run of show

Each kind has its options editor (`components/interactions/bars/bar-options.tsx`) and defaults: the options (add, edit, move up, remove, within each kind's limits), Pick any, the scale's range and end labels, Add an option, the cut line ("After the top three"), the statements' end labels and Flag divided statements. Statements are always anonymous on the screen (`named` is never).

## Shared app edits

Two small registries, each one line per kind, so steps 3 and 4 can add theirs: `components/interactions/control-panels.tsx` (a kind's private panel under the items list) and `components/interactions/spotlights.ts` (what Spotlight lifts for a kind addressed by key). The control surface renders the live kind's panel and labels sessions by their registered kind; the TV's Spotlight asks the kind first. The engine test now checks that word cloud, wall and content are among the registered kinds, since later steps add more.

## Tests

- `supabase/tests/database/bar_family.test.sql`: the registry rows, each kind's options (keys kept, limits, duplicates refused), answers (one per person with replacement, partial rankings, full budgets only, ratings 1 to 5), every number in results, ties sharing the lead, hiding, Spotlight by key before anyone answers, Divided on the control surface only, Add an option end to end (suggest, resend, the word filter, three each, merge, add, dismiss, roles, nothing on the shared channel) and the invoker wrappers.
- `tests/unit/bar-family.test.ts`: the allocator and its keyboard, tapping a ranking, buttons or slider, the value beside each bar, Spotlight text, defensive reads, the phone's one standing answer offline, route bodies, tokens and copy.
- `npm run test:bars`: in real browsers on a paired TV, four phones and the control surface, each kind through empty, first item, typical, Spotlight, phones down, offline and queued, pick any, very long text, the 1 to 10 slider, Add an option, the cut line, Divided, reduced motion in the Off-White theme, and the mirror and the TV view on phones; the options editors save from the run of show. Then 50 simulated phones answer and change answers for every kind in the practice room: every answer reaches the TV under one second on loopback (95 in 100), the TV settles on the server's order and lengths, and no row jumps. `KIT_SHOTS=<folder>` saves each screen.
