# Pre-mortem and the CORE goal builder (milestone 4, step 5)

D2-07 to D2-10 and INT-15. Migration `20261104130000_premortem_goals.sql`; browser kit `npm run test:premortem-goals`.

## Pre-mortem (on the grid kind)
- The grid's Pre-mortem preset takes the prompt "It's {base year + 3} and this plan failed. Why?". Reasons are grid items placed on likelihood and impact.
- Participants add reasons from their phones (`reason_add`). Each reason mirrors into `private.risks`, so goals can link to risks.
- AI merges duplicate reasons (`merge-reasons@1`, job `merge_reasons`) under the existing merge limits. Merges are written to `grid_merges` with `made_by = 'ai'`. Unmerge undoes one; "Undo AI merges" undoes all, and AI does not merge what was undone.
- The facilitator records mitigations from the control surface (`reasons_control`). Each row stores `recorded_by` (`facilitator` or `scribe`) so a scribe can tag them later. They show under the reason on the TV.

## CORE goal builder (`goals` kind)
- One outcome at a time: 3-year Vision bullets left, 1-year goals right. A goal has a title, a result, one owner, an end date and the risk it answers.
- The owner is an attendee, or a name and email. The end date defaults to the next season end (Sept 1 to Dec 31, Jan 1 to Apr 30, May 1 to Aug 31).
- Connected, Owned, Result and End date are checked in the database (`private.goal_core`). A goal stays flagged until all four are met.
- Risk links: `required` in the two-day template; `later` in the day-and-a-half template, after the follow-up session.

## Defaults for Chris
- A pre-mortem grid holds 10 reasons; 3 per person. Merging starts at 3 standing reasons.
- Up to 3 mitigations per reason.
- Up to 6 goals per person per outcome, 30 per outcome. A phone can change only its own goals.
- Changing a goal's result clears "Result is clear".
- The TV shows an owner's first name only.

## Shared functions changed
`private.ai_on`, `results_grid`, `items_grid`; `ai_claim` and `ai_apply` are wrapped (the originals are `ai_claim_base` and `ai_apply_base`, used for every other kind).
