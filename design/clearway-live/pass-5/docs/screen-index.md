# Screen index · design pass 5

| Screen | What | Board in screens.html | Components |
| --- | --- | --- | --- |
| SCR-01 | The scribe console | The scribe console | ScribeCard, CaptureComposer |
| SCR-02 | The scribe's phone | The scribe's phone | EaselCapture |
| FAC-01 (added to) | Scribe cards on the control surface, promoting a quote | Scribe cards on the control surface | ScribeFeed, PromotedQuote |
| FAIL-03 | The scribe goes offline | The scribe goes offline | ScribeCard, EaselCapture |
| OVN-01 | Overnight review | Overnight review | DraftStatusList, ReviewPresence |
| OVN-02 | A lens draft with its source words | A lens draft with its source words | DraftParagraph, SourcePanel, VoicesAndTensions, VersionHistory |
| OVN-03 | Publish the read-back | Publish the read-back | PublishCheck, ReadBackLens, ReadBackPhone |
| D2-03 | The read-back on the TV | The read-back | ReadBackLens, LensProgress, ReadBackTally, MissingList, TrackedChange |
| D2-04 | The read-back on phones | The read-back | ReadBackPhone, LensProgress, TrackedChange |
| INT-14 | The read-back on every surface | The read-back (TV, phones, control, remote, scribe) | CorrectionQueue, all of the above |

States covered: empty, first item, typical, crowded (50), offline and queued, phones down, AI off, reduced motion and very long text where they apply, plus the scribe states (queued with a count, syncing in order, synced, re-filed, off for the team-led block, photo failed), the overnight states (drafting, ready, locked, no source, thin outcome, reviewed, AI off, unreadable photo), publish (not ready, ready, published) and the read-back (all agreeing, split, correction waiting, folded in, settled, next lens, the close).
