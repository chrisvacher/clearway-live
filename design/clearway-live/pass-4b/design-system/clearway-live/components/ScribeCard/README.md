# ScribeCard

One capture by the scribe: quote, decision, tension (with both views), action (owner and date if named), question, mitigation (linked to its risk), photo, file, and in the read-back a correction.

**Screens:** SCR-01. **Sets:** Scribe, control, review. Design pass 5 (milestone 5).

**Consumer provides:** the card's kind, text, time and session; the extras for its kind (views, owner, date, risk, photo, file); an optional speaker; its sync state and capture order when queued; where it was re-filed.

**Anatomy:** `.cwl-scr-card.is-<kind>`: a top row with the capture order when queued (`.cwl-scr-order`), the kind chip (`.cwl-scr-kind`: Lucide icon and word on `cwl-app-sunken`), time and session, and the state (Saved on this laptop, Syncing, Synced, Didn't upload, Re-filed to). Then the text, a quote in quotation marks and 600 weight, and the kind's extras (`.cwl-scr-views`, `.cwl-scr-facts`).

| State | Behavior |
| --- | --- |
| Kinds | quote (quote, 1), decision (gavel, 2), tension (zap, 3), action (square-check, 4), question (circle-help, 5), mitigation (shield-check, 6), photo (camera, from the phone), file (paperclip, U), correction (pencil-line, read-back only). Told apart by icon and word, never by color |
| Speaker | Stored for the record. Shown by name only on the facilitators' review screens (`names: true`). The scribe console says Speaker kept for the record. The control surface, TV and phones never show it |
| Queued | Dashed edge, the capture order, Saved on this laptop |
| Syncing | Spinning sync icon in place; nothing moves |
| Synced | Synced; each send carries its own key, so a retry is never a duplicate |
| Failed | `cwl-app-error` edge and Didn't upload (photos). Error lives only on app surfaces |
| Re-filed | Re-filed to the session's name, then it leaves the list |
| Very long text | Wraps in full, never truncates |
