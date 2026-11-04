# ReadBackLens

The read-back on the TV, one lens at a time: lens progress, "Community, 2036", the paragraph, the live tally and what's missing.

**Screens:** D2-03. **Sets:** TV. Design pass 5 (milestone 5).

**Consumer provides:** the lens, settled lenses, correction states, the tally, missing answers.

**Anatomy:** Inside the Shell: LensProgress across the top; left, the heading (lens dot, lens name bold, the year) and the paragraph at tv-body as word boxes, with "N changes from the room" or Settled by the room; right, Did we hear you right?, ReadBackTally and MissingList. The close: "Did we hear you right?" with What's missing answers.

| State | Behavior |
| --- | --- |
| Empty | Bars at zero |
| Split room | Bars show where the room is; no leader color |
| Folded in | Inserted words underlined until settled |
| Settled | Lime sweep once on the progress, then the check |
| Next lens | Paragraph out, next in, bars from zero |
| Very long text | Steps down to tv-floor; then words move to phones |
| Offline | Holds its last state |
