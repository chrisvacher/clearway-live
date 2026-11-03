# FourListsBoard

The Four Helpful Lists on the TV: four columns told apart by heading and position, cards arriving, similar cards sliding together, and agreement counts ticking up.

**Screens:** INT-11. **Sets:** TV, control mirror. Design pass 6 (milestone 6).

**Consumer provides:** The cards (column, text, agreement count, how many folded in), the newest card, and how many show per column.

**Anatomy:** Four equal columns under a cwl-border-strong rule, each with its number at tv-floor and its question at tv-body 700. Cards stack by agreement, most first, up to four, with + N more on phones. Columns carry no color.

| State | Behavior |
| --- | --- |
| Empty | Outlined slot under each heading |
| First card | Slides in, Lime for cwl-dur-new-hold |
| Typical | Ordered by agreement |
| Fold | A similar card glides into its survivor (cwl-dur-regroup), marked AI |
| Agreement | Counts tick, cards glide up when they pass |
| Crowded | Four per column and a count |
| AI off | Only cards with the same words fold |
| Reduced motion | In place |

**Don't:** Color the columns, or reorder a column while nothing changed.
