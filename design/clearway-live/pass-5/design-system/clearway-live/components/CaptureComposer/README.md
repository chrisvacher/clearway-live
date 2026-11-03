# CaptureComposer

Keyboard-first capture on the scribe console: pick a kind with 1 to 6, type, add who said it for the record, Enter.

**Screens:** SCR-01. **Sets:** Scribe. Design pass 5 (milestone 5).

**Consumer provides:** the kind, the text, the speaker, the live session from the run of show, errors, whether the console is off; in the read-back, the lens and the agreed wording and reason.

**Anatomy:** Six `.cwl-a-tag` kind chips with keys (`aria-keyshortcuts`), What was said, two extra fields for a tension (both views) or an action (owner and date), Who said it with the record-only note, the Attaches to row (`.cwl-scr-attach`), Upload a file (U) and Capture (Enter). In the read-back it becomes the correction composer: For the lens, The wording the room agrees, Why, Send correction.

| State | Behavior |
| --- | --- |
| Default | Quote picked; the session follows the run of show |
| Tension, Action | Extra fields appear for both views, or owner and date |
| Correction | Read-back only: wording and reason go to the facilitator's correction queue |
| Error | Says what to do: Type what was said, then Enter |
| Off | Disabled for the team-led block |
| Nothing live | Cards wait for the next session |
