# Design pass 7 handoff

Design pass 7 covers milestone 7, CORE and after: Publish to CORE (COR-01 to COR-03) and the report, visibility plan, read-only copy and check-ins (AFT-01 to AFT-05). The reference export is in `design/clearway-live/pass-7/` (start with its `README.md` and `screens.html`). Its HTML files use relative paths. The export code is design reference, not an application script.

## What's in it

- Hi-fi screens by screen ID: COR-01, COR-02, COR-03, AFT-01 to AFT-05, each with its empty, in-progress, error, offline and reduced-motion states. COR-02 shows the control surface, the lead facilitator's remote, the TV and phones together. AFT-03 and AFT-04 are phone screens, with the elders' page also on a laptop.
- Components named as they'll be in code: CoreConnection, OverlapList, ReadinessRegister, OwnerMatch, PublishSummary, PublishButton, PublishConfirm, PublishProgress, RemotePublish, PublishedTV, PublishedPhone, PublishHistory, SecondPublish, SectionList, SectionBody, SourcesPanel, SignOffBar, ExportPanel, WordPreview, VisibilityPlan, ShareLinks, ReadOnlyCopy, CheckInEmail, CheckInPhone, CheckInResults. The index is `pass-7/docs/screen-index.md`.
- Two motion prototypes with tokens and reduced-motion equivalents: a publish committing and the AI icon's sweep. The spec is `pass-7/docs/motion-spec.md`.

## Changes in this pull request beyond the export

None in the app. The export's design system copy carries the AI icon in gradient ink, matching the app's `live_tokens.css`.

## Build notes

- **CORE has no publish endpoint yet.** Publishing needs a CORE-side function that creates outcomes, goals and tasks in one transaction and returns the new ids. The app remembers each CORE id so a second publish never creates a record twice. Invitations are sent through CORE after the save.
- Overlaps are matched on the same title or a close meaning and shown before the readiness check. Linking attaches new records to the existing one and changes nothing in it.
- Owners are matched to CORE users by email (one user per email and per church). Seat limits count pending invitations. An email that belongs to another church is flagged.
- A Vision Outcome's status is derived by CORE, so the app publishes none. First steps go to CORE as tasks under their goal.
- Only the lead facilitator publishes, from the control surface or their own remote. The TV and phones never show a name or a warning color.
- The report keeps Clearway's section order. AI drafts each section from the engagement records, every sentence links to its sources, and the facilitator signs off. The read-only copy shows the signed-off version. The Word file carries thin data labels and verbatim quotes, and no source markers.
- The 10-year Future comes from the five lens summaries the room signed off on Day 1, word for word.
- The read-only link shows the Map, Vision Outcomes with indicators, goals with owners, dates and CORE status, and the commander's intent cards. Never raw answers, scribe cards or drafts. A turned-off link shows a plain page.
- Check-ins go by email at 30, 60 and 90 days to each owner of a first step, and read goal status from CORE. If CORE can't be read the check-in still works.
- The AI icon sweep runs once per AI change, never loops, and is plain inside buttons.

## Defaults

Chris hasn't confirmed these yet. The decisions board in `screens.html` records the other option for each.

| Decision | Default |
| --- | --- |
| Commander's intent and CORE | Not published. It stays in the report, the Map and the read-only copy |
| Who can press Publish to CORE | Only the lead facilitator |
| Which words the report and plan use | "Visibility plan" (Brain ruling, Nov 1), not "communication plan". The PRD needs the same edit |
| Where a Vision Outcome's status comes from | CORE derives it |
| Where first steps go | CORE tasks under their goal |
| The Vision Matrix | Not published |
| Owners without a CORE account | Invited through CORE after the save, with a seat check |
| An email in another church in CORE | Flagged and left unassigned until fixed |
| The read-only copy and the report | The report joins the link once it is signed off |
| Who gets check-in emails | Each owner of a first step, in their own email |
