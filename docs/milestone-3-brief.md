# Milestone 3 brief: the interaction library

The PRD governs behaviour ("The interaction library", "AI", "Milestones > 3"). Design pass 3 (`design/clearway-live/` and the pass 3 export) governs look. Where this brief and the PRD disagree, the PRD wins.

Screens: INT-01 to INT-10, INT-17, the content screens, SET-07, SET-08 (team workshop template), FAIL-09. Not in this milestone: the Wayfinding interactions (INT-11 to INT-16).

## Decisions (November 2)

| Decision | Chris's decision |
| --- | --- |
| Anthropic API key | Approved. In Vercel as `ANTHROPIC_API_KEY`, server only. Never pasted into a chat |
| Names in free text sent to AI | Sent as written. Attendee identity fields are never sent |
| Scripture text | The facilitator pastes the passage. Reference and translation are separate fields; the translation defaults from the engagement |
| Mentimeter coverage | The ten general interactions plus the statements vote (INT-17). No quizzes or predictions |
| AI disclosure | Approved November 3: invite email, room sign-in and the "How we use AI" page on phones. Survey intro withdrawn November 5 because the app does not run or read the survey |

## The engine contract (step 1)

Every kind registers itself and supplies its own functions. Later steps add a kind without redefining anything shared, so steps 2, 3 and 4 can run side by side.

**Database.** One migration per step. Register the kind in `private.interaction_kinds` (input, one answer per person, what the TV counts, structured, shares answers, what Spotlight and Hide address, named, position), then add any of these, named by kind:

| Function | Signature | Job |
| --- | --- | --- |
| `private.parse_<kind>` | `(public.sessions, text, jsonb) returns jsonb` | Validate one answer: `{status:'ok', text, answers, value}` or `{status:'limit'}, 'filtered' or 'invalid_answer'`. Text answers go through `private.screen_text` |
| `private.results_<kind>` | `(uuid, uuid, text[]) returns jsonb` | Every number on screen, computed once: always `total` and `people`, plus the kind's own fields |
| `private.options_<kind>` | `(jsonb, uuid) returns jsonb` | Normalize the run of show's options, or return null to refuse. Structured kinds keep their options at `options.items = [{key, text}]` so Spotlight can address an option with no votes yet |
| `private.items_<kind>` | `(uuid, text[]) returns jsonb` | The control surface's item list for Spotlight and Hide |

The engine supplies the rest: one answer per person (the latest replaces the earlier, `replaced_by` and the event's `replaced`), answers that never leave the database for kinds that don't share them (INT-09), bursts and phones down for every kind that takes input, and Spotlight and Hide by id or key. Reserve these names: `qa`, `choice`, `scale`, `ranking`, `points`, `grid`, `form`, `sign`, `statements`.

**App.** One line each in three registries, plus the kind's own files:

- `components/interactions/tv-views.tsx`: the TV view. It animates from what is on screen; bars, columns, rows and dots run on springs that retarget without losing speed (pass 3 change 4).
- `components/interactions/phone-inputs.tsx`: the phone input. It sends through the outbox with `{ text, value }`.
- `components/interactions/option-editors.tsx`: the run of show's options editor and the kind's defaults.

## Work order

One branch and one pull request per step. Migrations are approved and applied one at a time, after each pull request merges, then renamed to the version the database recorded.

1. **Brief, engine and content screens.** This brief; the engine contract above; the count on the TV; the empty structure; content screens (headline with depth, Scripture with reference and translation, prayer and silence, image or document page, screen check, holding and walk-in); design pass 3's tokens and the TV and phone chrome (changes 1, 7 to 10, 14's tokens and icon file, 16's palette, 18).
2. **The bar family.** Multiple choice (INT-04), scale (INT-05), ranking with Add an option (INT-06), 100 points with the cut line and the five-line allocator (INT-07, change 11), statements (INT-17, change 17). One live bar component, value beside the bar (change 3).
3. **Grid, private form and sign together.** The 2x2 grid with the item palette and one-screen placing (INT-08, changes 12 and 16), the private form (INT-09), sign together with finger signatures stored as stroke paths (INT-10, change 13).
4. **Q&A.** INT-03, including "Questions any time".
5. **AI, live.** Word cloud near-duplicates, open text grouping, Show summary, Q&A folding by AI, FAIL-09. The AI icon is "Generative" by LAFS on Flaticon: credit it ("Generative icon by LAFS from Flaticon") or buy Flaticon Premium. Chris decides before this step ships.
6. **Self-paced, test answers, export and templates.** Also the SET-07 drag-to-build run of show (change 15), since it is the run of show builder that templates save; steps 2 to 4 plug their options editors into the registry it uses.
7. **Acceptance kit.** Every interaction through the live-screen rules with 50 simulated phones, the failure kit extended, the milestone 3 practice-room script with a team workshop run end to end.

## In parallel

Step 1 goes first and alone. After it merges, steps 2, 3 and 4 run as parallel agents in separate worktrees, each owning its kinds, components, functions and migration. Their pull requests merge one at a time, each rebased on the last; the registry lines are the only shared edits. Step 6's self-paced sessions, Clear test answers and templates can run beside them; its export and recap land after steps 2 to 4. Step 5 follows step 4. Step 7 is last.

## Checks for every step

Tests from the acceptance criteria; `npm run check`; `supabase db lint --local --schema public,private --fail-on warning`; `supabase test db --local`; `npm run test:live`, `test:controls`, `test:tv`; `npm run test:browser`, `test:load` and `test:content` after `npm run build` and `npm run db:seed`; a browser check of the TV and phones with screenshots (`KIT_SHOTS=<folder>`); the step's doc updated; merge when CI passes.
