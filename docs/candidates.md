# Candidate priorities

Milestone 4, step 3. One interaction kind, `candidates` (INT-13), for the screens D1-07 to D1-10. Migration `20261104170000_candidates.sql`. This is where the Five Lenses become the provisional Vision Outcomes.

## One step, four phases

The step is one board with a phase, shown on the control surface as buttons and on the TV and phones as the screen.

| Phase | Who sees what | The facilitator's button |
| --- | --- | --- |
| `review` | Only the facilitator sees the candidates. The TV and phones wait. | Draft candidates with AI, Send to the TV |
| `sent` | The TV shows a number and a title for each candidate. Phones rename, merge or suggest. | Accept or Dismiss each suggestion, Open 100 points |
| `points` | The TV shows the 100 points bars and the cut line. Phones place 100 points. | Cut line 4, 5 or 6, Mark provisional |
| `marked` | The TV shows only the provisional Vision Outcomes, outlined. | Mark again, if none is confirmed yet |

Nothing is shown before the facilitator sends it, and nothing a phone suggests reaches the screen until the facilitator accepts it with one tap. Counts show where the room is. They never decide: Mark provisional takes the candidates above the cut line by default, and the facilitator may tick any others.

## Where the candidates come from

AI is optional. The facilitator presses Draft candidates with AI (job `propose_candidates`, prompt `propose-candidates@1` in `lib/ai/prompts.ts`). The worker reads every standing sentence of every opened lens wall (the 80 newest for each lens) with the cluster each sits in, and the model proposes 6 to 10 candidates, each with the sentences it rests on. The limits are code, not prompt:

- A name is one line, at most 80 characters and ten words, with no quotation, through the word filter.
- Each candidate names at least one known sentence. The model sees sentences under short refs and never an attendee.
- No name twice, ten from one draft at most, twelve standing candidates at most.
- A redraft replaces the AI's own candidates that nobody has touched. Candidates the facilitator wrote, renamed or accepted from a phone stay.
- Fewer than six is allowed and is noted on the control surface.

With AI off for the engagement or the step, or failing, nothing else changes. The control surface lists the lens wall's clusters and sentences, and Use as a candidate adds a cluster as a candidate with its sentences. The facilitator can also type a candidate.

AI is never in the path from a phone to the TV. A suggestion is stored first, shown to the facilitator, and reaches the TV only through the facilitator's accept.

## What phones can do (D1-08)

While the candidates are on the TV, each phone can suggest a rename, a merge of one candidate into another (with an optional new name), or a new candidate. A person has six suggestions. The same suggestion twice, from one person or two, is shown once to the facilitator with a count and first names. Names are on the facilitator's view only.

When the facilitator accepts a rename, the title on the TV changes in place: the old words fade out as the new ones fade in, and the card does not move. A merge glides the leaving card onto the one it joins; its sentences go with it. A new candidate arrives with the usual arrival motion. The cards move to their new places without jumping.

## The 100 points (D1-09)

The points use INT-07's rules (`private.bar_parse_points`), with the standing candidates as the options, and the same bars on the TV and the same faders on phones. Open 100 points needs between two and eight candidates, the most INT-07 holds. Opening dismisses any suggestion still waiting. The cut line starts where the step's option says (5 unless changed) and the facilitator moves it between 4 and 6. Once anyone has placed points, the candidates are fixed.

## Mark provisional (D1-10)

Mark provisional writes one `private.decisions` row (subject `cut_line`, with the facilitator's reasons and the counts on screen) and one `private.vision_outcomes` row for each marked candidate, status `provisional`, in the order the points put them. Marking again replaces the earlier marks until an outcome is confirmed or has bullets; after that the press is refused with `locked`. A mark outside four to six is allowed, with a plain warning. The 4 to 6 range is a guide, not a rule.

## What the TV and phones can read

The room results for `candidates` hold the phase, and from `sent` on each candidate's id, number and title, the merges that just happened, and (from `points`) the bars and the cut line. They never hold a sentence, a lens, an AI badge or a name. Sources, lenses and the AI badge are on the control surface only (the pass 4 review change).

## Security

Four new tables, each under forced row-level security and reachable only through functions: `candidate_boards`, `candidates`, `candidate_sources`, `candidate_suggestions`. The functions:

- `candidate_suggest` (participants only, while the board is `sent`).
- `candidates_control` (the facilitator, one press by a client-made id, as the other controls).
- `candidates_state` (the facilitator's read).

`supabase/tests/database/candidates.test.sql` tests each by role: the facilitator, a participant, the TV, a facilitator of another room and a stranger.

## Shared objects this step touched

- `private.ai_runs` check `ai_runs_job_check`: adds `propose_candidates` to the earlier list.
- `private.ai_on`: also true for a candidates step.
- `private.ai_claim` and `private.ai_apply`: now wrappers that handle a candidates session and pass every other kind to the unchanged function, renamed `ai_claim_base3` and `ai_apply_base3`.
- `private.reset_practice_room`: step 1's version plus the four new tables.

`ai_status`, `ai_fail` and `ai_due` are not changed. The candidates state function carries its own AI fields.

## Tests

- `supabase/tests/database/candidates.test.sql`: by role, the AI limits, suggestions, accepts, points, mark and the practice reset.
- `tests/unit/candidates.test.ts` with `tests/fixtures/ai/candidates.json` (a Riverside draft): the prompt, the parse and the scripted stand-in.
- `npm run test:candidates`: a paired TV and 50 simulated phones. A failed AI draft first, then a good one; renames, merges and new candidates from phones; accepts; 100 points with the one-second rule (95 in 100); nothing jumps, blanks or redraws; accepted renames stay in place; marking against the counts. Screenshots go to `KIT_SHOTS`.

## Known limits

- Clear test answers (the rehearsal control) does not clear candidate suggestions. The practice reset does.
- The AI badge is not shown on the TV, by design.
