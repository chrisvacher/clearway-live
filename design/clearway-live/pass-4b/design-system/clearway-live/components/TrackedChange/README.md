# TrackedChange

Inserted and deleted words in a paragraph, readable without color.

**Screens:** D2-03. **Sets:** TV, phone, review. Design pass 5 (milestone 5).

**Consumer provides:** the paragraph, the corrections (what's deleted, what's inserted, where) and each one's state: pending, folded or settled.

**Anatomy:** Inserted words underlined (`cwl-tc-line` at `cwl-tc-offset`), deleted words struck through, both in the text's own color, on every surface and theme. On phones and review a folded deletion stays struck; on the TV it leaves after `cwl-delay-tc-leave`. Settled: plain text.

| State | Behavior |
| --- | --- |
| Folding in (TV) | Strike draws, struck words leave, words on the line slide, words changing line fade back in, inserted words arrive underlined |
| Settled | Plain words |
| Reduced motion | Final state at once |
