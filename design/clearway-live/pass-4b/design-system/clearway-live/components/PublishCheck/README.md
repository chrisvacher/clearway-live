# PublishCheck

The TV and phone preview of the read-back, the checklist of lenses, outcomes and acknowledged flags, and Publish.

**Screens:** OVN-03. **Sets:** Review. Design pass 5 (milestone 5).

**Consumer provides:** review states, flags and their acknowledgement, the TV theme.

**Anatomy:** Three columns: the TV preview (a real ReadBackLens at 0 answered) and the phone preview (ReadBackPhone), both kept in their own theme by the nesting guard, and the checklist (`.cwl-ovn-check`). Publish the read-back is the page's one Lime moment.

| State | Behavior |
| --- | --- |
| Not ready | Unreviewed sections and an unacknowledged flag; Publish disabled with why |
| Ready | All checked |
| Published | Says when, and that nothing shows until the session goes live |
