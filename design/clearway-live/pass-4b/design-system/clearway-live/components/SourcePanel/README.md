# SourcePanel

The phone sentences, scribe cards and easel photos behind the selected sentence, with the source words highlighted.

**Screens:** OVN-02. **Sets:** Review. Design pass 5 (milestone 5).

**Consumer provides:** the selected sentence and its sources with the words each gave; the lens's other sources.

**Anatomy:** The sentence, then its source cards (`.cwl-ovn-scard`): phone (anonymous), scribe (kind, time, and the speaker for the record), easel photo (the line highlighted on the page). Source words use `.cwl-ovn-hl` in `cwl-app-source-word`. Below a divider, the lens's other sources, quieter.

| State | Behavior |
| --- | --- |
| Selecting | Sources come forward (FLIP) and their words highlight across over `cwl-dur-source-light` |
| No source | Warning banner |
| Unreadable photo | Blurred page, Warning, Type what it says |
| AI off | The room's sentences with Add to the paragraph |
