# ReadBackTally

Live bars for "Yes, that's us" and "It needs a change".

**Screens:** D2-03. **Sets:** TV, control. Design pass 5 (milestone 5).

**Consumer provides:** the two counts and the number of people.

**Anatomy:** Two rows (`.cwl-rbt-row`): label and count on one line at tv-floor, then a 36px bar in `cwl-bar` on `cwl-bar-track`, the pass 3 bar colors with the value beside the bar. Neither bar takes a leader color: the tally never settles a lens. On the control surface it's three numbers (yes, change, not yet).

| State | Behavior |
| --- | --- |
| Filling | Each tap grows its bar from where it is (`cwl-dur-bar-grow`) |
| Reduced motion | Instant |
