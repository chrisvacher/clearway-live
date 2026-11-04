# DraftStatusList

Every lens and the provisional outcomes with their state and the time drafting started.

**Screens:** OVN-01. **Sets:** Review, remote. Design pass 5 (milestone 5).

**Consumer provides:** sections, each state (drafting, ready, editing by, reviewed by, flagged), the current section.

**Anatomy:** Rows (`.cwl-ovn-row`) with the lens icon, title ("Congregation, 2036"), a line about it, and a state chip (`.cwl-ovn-st`): Drafting (spinning loader), Ready to review (info), editing (selected), Reviewed by (success), Flagged (Warning disc). Compact on the remote.

| State | Behavior |
| --- | --- |
| Drafting | Rows turn Ready in place as each section is drafted |
| Flagged | A thin outcome or an unreadable photo |
| AI off | Write from the room's sentences |
| Compact | The remote's read-only list |
