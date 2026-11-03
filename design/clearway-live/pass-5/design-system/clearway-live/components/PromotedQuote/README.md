# PromotedQuote

A scribe quote shown on the TV, anonymous, in the pass 3 spotlight with the content treatment.

**Screens:** FAC-01. **Sets:** TV. Design pass 5 (milestone 5).

**Consumer provides:** the quote text and the session name.

**Anatomy:** The Shell's spotlight: Navy scrim, Sunrise card, eyebrow From the room, the quote in light 300 with its second half bold, then the session. Never a name. On and off use `cwl-dur-spotlight-on` and `cwl-dur-spotlight-off`. Note: pass 3 has no separate quote screen, so this uses the spotlight and the Scripture screen's light and bold treatment.

| State | Behavior |
| --- | --- |
| On | Over the live screen; the wall recedes |
| Off | The wall returns exactly as it was |
| Very long text | Wraps at headline size |
