# SegmentFilter

Segments from the survey's About you section (age band, years attending, involvement, location for multisite churches). A segment under 5 respondents is hidden with the reason shown; a thin segment is flagged.

**Screens:** SET-04. **Sets:** Setup. Design pass 6 (milestone 6).

**Consumer provides:** The segment questions and their counts, the selected segment, and whether the church is multisite.

**Anatomy:** A filter card with Everyone or Clear, then each segment question's options as tags with their counts. Hidden segments show eye-off and hidden, never their count. Thin segments have a dashed border and circle-dashed. A note says why small segments are hidden.

| State | Behavior |
| --- | --- |
| Everyone | No filter |
| Selected | One segment pressed, results filtered |
| Hidden | Under 5 respondents: eye-off, hidden, never drawn |
| Thin | Dashed border and icon |
| One location | Location not in this survey |

**Don't:** Show the count of a hidden segment, or let a filter reach the room.
