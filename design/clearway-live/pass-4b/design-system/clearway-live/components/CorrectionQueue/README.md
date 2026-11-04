# CorrectionQueue

Corrections waiting for the facilitator, each with the scribe's reason, and Accept or Dismiss.

**Screens:** INT-14. **Sets:** Control, remote. Design pass 5 (milestone 5).

**Consumer provides:** corrections with the change, the scribe's reason and their state.

**Anatomy:** Cards (`.cwl-cq-i`): the change as a tracked change, the scribe's reason, then Accept (primary) and Dismiss, or Folded in. With AI off it says the change goes in exactly as written. On the remote the buttons fill the width.

| State | Behavior |
| --- | --- |
| Waiting | Accept and Dismiss |
| Accepted | Folded in, sunken |
| Empty | Says the scribe sends the agreed wording |
