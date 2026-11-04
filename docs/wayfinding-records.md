# Wayfinding records and shared pieces (milestone 4, step 1)

Migration: `supabase/migrations/20261104040000_wayfinding_records.sql`. Tests: `supabase/tests/database/wayfinding_records.test.sql` (by role) and `tests/unit/wayfinding-records.test.ts`. Live only after merge and Chris's approval; the coordinator applies it.

## The records

All sit in the `private` schema, hang off the engagement, and use forced row-level security. Browsers never write them: each kind writes through its own function in later steps. Every child row carries `engagement_id` and a composite foreign key, so a record can't point into another engagement.

| Table | Holds |
| --- | --- |
| `lens_openings` | Which lens is open (1 to 5). Seeded sentences become readable when their lens opens |
| `lens_sentences` | Sentences with lens and source (`seeded` or `live`), plus the author for the record |
| `vision_outcomes`, `outcome_indicators` | Title, description, provisional or confirmed, what we'll stop, order. Indicators are the 3-year Vision bullets |
| `risks`, `risk_mitigations` | Pre-mortem risks (likelihood and impact) and mitigations, recorded by the facilitator or later the scribe |
| `goals`, `goal_risks` | 1-year goals with result, one owner, end date and the risks they answer. The CORE letters are checked in code (`goal_core`) |
| `intent_cards`, `intent_card_people`, `first_steps` | Commander's intent, pairs, and first steps with owner and date flags (`first_step_flags`) |
| `key_metrics`, `celebrations` | Ranked success measures and celebrations |
| `map_drafts` | The draft Clearway Map pages. This Year's Priorities stays empty |
| `lens_summaries`, `lens_summary_versions`, `lens_summary_sentences`, `lens_summary_sources`, `lens_summary_responses` | One summary per lens per engagement: versions, each sentence's source sentences, each person's Approve or Suggest a change, and the facilitator's marked decision |
| `decisions` | The room's consensus decision and reasons, for a step, lens summary, outcome, candidate, cut line, goal or intent card |

## Who reads what

| Role | Reads directly |
| --- | --- |
| Facilitator or admin of the engagement | Every record, except seeded lens sentences before their lens opens. They get only the count, from `lens_seed_counts` |
| Room participant | Lens openings, Vision Outcomes and their indicators, lens summary versions already shown on the TV, and their own responses |
| TV, other engagement's facilitator, stranger, anon | Nothing |

Seeded sentences have no read policy for any role other than the facilitator, and the facilitator's policy requires `source = 'live'` or an open lens. An immutability trigger stops a sentence's lens or source changing after it is written. The tests prove each role against a closed lens, then an opened one.

## Mark a decision

`decision_mark(p_engagement, p_id, p)` records what the room decided and why. It is one press by a client-made id (a repeat returns `duplicate`), runs under the room lock, logs to `room_controls` and sends the facilitator's other screens a notice. `p` takes `decision`, `reasons`, `label`, `subject`, `subject_id` and `session`. A decision on a lens summary or an outcome also links `decision_id` on that record. The numbers on screen at the time are kept as a record of where the room was, never as the decision. `decisions_for` lists the latest 30.

App side: `POST/GET /api/control/[id]/decision`, validated by `lib/wayfinding/decision.ts`, and the Mark a decision panel in `components/control/mark-decision.tsx`, shown on the control surface and the remote.

## Seeded from

`sessions.seeded_from` names an earlier step of the same kind and engagement whose answers start this one. The server refuses a different kind, a cycle and a stale revision, and clears the link when the source step is removed. The run of show form offers it (`session-form.tsx`), and `show_write` saves it with the session.

## Lens identity

`components/wayfinding/lens-icon.tsx` holds `LensIcon` (the five icons from pass 4, `currentColor` strokes on the 24px grid) and `LensHeading` (the TV fill with `cwl-lens` and `cwl-on-lens`, or the small chip with `cwl-lens-small`). Names come from the engagement through `lensName` in `lib/wayfinding/lens.ts`; `lens_names` is now in the TV display and the run of show context.

## Scripture at body size

A Scripture content screen takes `size: "body"`, set at `tv-body` beside the join link (PRE-06 on 1 Corinthians 3:5-8, New Living Translation, with "What's important is that God makes the seed grow." in bold). The editor offers it. The prayer screen is unchanged. The templates that place these screens (PRE-06, D1-13, D2-01) are built in step 7.

## Reserved kind names

`lens`, `candidates`, `bullets`, `confirm`, `goals`, `intent` and `lens_summary` are held in `reservedKinds` (`lib/interactions/kinds.ts`). Each joins the interaction list, the screen ids and the database registry in the step that builds it. Nothing is registered in the database here.

## Riverside seed

`supabase/seed.sql` adds fictional Riverside records for later steps' tests: lens sentences for all five lenses (Congregation open, the rest closed), five provisional Vision Outcomes with indicators, risks and mitigations, goals (one meeting CORE, two missing letters), intent cards and first steps, key metrics, celebrations, a decision, and a Congregation summary on the TV with source links, one approval and one suggested change. It is idempotent and local only. `reset_practice_room` clears all of it.
