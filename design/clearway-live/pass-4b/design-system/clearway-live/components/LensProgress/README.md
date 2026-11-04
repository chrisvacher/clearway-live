# LensProgress

The five lenses in order: settled, current and still to come.

**Screens:** D2-03. **Sets:** TV, phone, control. Design pass 5 (milestone 5).

**Consumer provides:** the lens names (an engagement setting), the current lens and the settled lenses.

**Anatomy:** Chips (`.cwl-lp-i`) with lens icon and name: settled is an outlined check, current is filled `cwl-lens`, still to come is muted. Phones show icons only except the current lens; the control surface uses app colors.

| State | Behavior |
| --- | --- |
| Settling | A Lime sweep across the chip once (`cwl-dur-outcome-confirm`), then the check |
| Moving on | The current fill moves along as a color change in place (`cwl-dur-settle-color`) |
