# Proposal: the submit lock and the silent-card floor (for Chris)

Held back from PR #129 after independent review. The code is on this branch (from the head of #129 before it was slimmed). No pull request is open.

## Change 1: `private.live_submit` does its checks before the room lock

What it does: role check, attendee, step and kind lookups, request checks and the answer's parse run before the room lock, so each submit holds the lock for less time. Motivation: live-4 23.8 (26 of 150 Four Helpful Lists cards refused as unavailable, Postgres 57014, in the third burst). It was not reproduced locally at 150, 450 or 1,000 cards; the lock hold is a plausible cause, not a proven one.

Review findings:
- Stale-vote race. The parse functions for lens summary, read-back, candidates, bullets and confirm check room state, and now run before the lock. A vote can pass, wait while Show new version or Sign off commits, then be stored as accepted for the old version, and `ls_mirror` writes a response after sign-off.
- A practice-room reset can let a deleted attendee's answer in, because the attendee is read before the lock.
- The change is unproven on the hosted project.

Suggested fixes:
- Parse again after the lock for every kind whose parse reads tables (keep the early parse only for kinds that read nothing).
- Re-check the attendee after the lock.
- Add a two-connection race test (a vote waiting on the lock while the version changes).
- Read hosted Postgres timings for `ai_apply`, `four_lists_agree` and `live_submit` during a live rerun of the load test, before choosing what to change.

## Change 2: a floor for silent cards after Phones down

What it does: `quietThemeCards` in `lib/ai/prompts.ts` adds a silent card for each strong theme the model gave no card, once phones are down, and the prompt asks for one per strong theme. Motivation: live-4 26.10 (a strong theme nobody spoke to raised no silent card in two runs).

Review findings:
- It can raise false silent cards: the model may have left a theme out because the room did speak to it.
- The prompt still says "if nothing stands out, reply with no cards", and the 6-card cap conflicts with "every strong theme".
- The prompt version was not bumped.

Suggested fixes:
- Have the model return a `spoken` list (themes the room spoke to) and floor only themes not in it.
- Bump to `alignment-signal@2`.
- Tag floor cards `by: code` so they can be told apart from model cards.
