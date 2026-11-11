# Design pass 8: the admin shell and flow

Chris's decisions of November 11, 2026, and the build order that follows them. The screens are the Claude Design canvas
"Clearway Live design pass 8: admin" (https://claude.ai/artifact/A4si89fRxx8bjzXde6KhvQ). The review behind them is the
Claude Doc "Clearway Live admin: UX, UI and flow review" (https://claude.ai/artifact/Qnd2UYTCipubSzdHzqwMU7).

## Decided

- **One shell.** Every signed-in page sits in the sidebar shell, with the Clearway Live lockup in every instance, never
  typed "Clearway". One privacy marker: the Navy "Only you see this" band.
- **Joining is flexible.** The link is a name the facilitator chooses (for example the church's) or a random code. People
  get in by open registration with their name, a QR code or a typed room code, or the room is limited to an approved
  attendee list with email sign-in. Any mix must be possible.
- **Any workshop.** The facilitator names every section of the run of show and brings in whatever elements the event
  needs. The app is for any workshop Clearway runs, not only Wayfinding.
- **After a workshop:** results and downloads, plus a short AI-drafted summary.

## Build order

| Step | What it is | Status |
| --- | --- | --- |
| 1 | The shell: `components/layout/app-shell.tsx` and `shell-nav.tsx`, engagement layouts, the lockup in the header | This pull request |
| 2 | Create flow, the Overview page and the Invite the room card | Next |
| 3 | Setup split into Details, People and joining, Screens and Wayfinding settings, with the flexible joining model | After 2 |
| 4 | Workshop clean-up: Discover, After and the live room's Wayfinding panels by engagement type, and After the workshop | After 3 |
| 5 | Run of show: named sections, the grouped session editor, saved blocks | After 4 |
| 6 | Consistency sweep | Last |

## Step 1 notes

- The sidebar groups an engagement's pages as Prepare, Run and After. A team workshop shows only the pages a workshop
  uses. Wayfinding types add Discover, Four Helpful Lists, Overnight review and the After pages.
- Run of show and Templates keep their window-filling layouts and mount the same `ShellNav`. The live room and the
  print view carry no sidebar.
- The button row (`EngagementNavigation`), the back buttons and the per-page privacy markers are removed.
- Under 900px the sidebar folds behind a Menu button.
- Step 1 keeps today's routes: "Setup" is `/setup/[id]` and "Screens" is `/setup/[id]/tv` until steps 2 and 3 split them.
