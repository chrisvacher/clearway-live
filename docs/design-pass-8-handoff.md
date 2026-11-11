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
| 1 | The shell: `components/layout/app-shell.tsx` and `shell-nav.tsx`, engagement layouts, the lockup in the header | PR #140 |
| 2 | Create flow, the Overview page and the Invite the room card | PR #141 |
| 3 | Setup split into Details, People and joining and Screens, with the flexible joining model | Built, see step 3 notes |
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

## Step 2 notes

- `/setup/[id]` is now the Overview: a readiness list (details, run of show, people and joining, screens) and the
  Invite the room card with the link, the room code, a QR code, Copy link, Copy invite text and Download QR code.
- The long editor moved, unchanged, to `/setup/[id]/details`. Step 3 splits it.
- `/setup` groups engagements as Upcoming, No date yet, Past and Practice. Each row shows its room link with a copy
  button and leads with one action that follows its status; the rest are under More.
- `/setup/new` asks four things: the Team Hub church and engagement, the kind of event with the template to start
  from, the date and first session time, and for a workshop how people join. It creates the engagement, applies the
  template and opens the Overview.
- The type reads "Workshop", not "Team workshop". The database value is still `team_workshop`.
- Not built in this step: creating without a Team Hub link, a printable door sign, and choosing the link name or
  room code (step 3, with its database change).

## Step 3 notes

- **People and joining** (`/setup/[id]/joining`) holds the link, who can join, the ways in, How the room decides and
  the attendee list with invites. Each card saves on its own through `joining_save`.
- **The link** is a name the facilitator chooses (3 to 24 letters or digits, lower case) or the generated room code.
  The room code always keeps working beside a chosen name: the TV shows it, its QR code uses it and people type it at
  live.clearway.co. A name can't be a word the app uses for its own pages, or look like a generated code.
  `live.clearway.co/<name>` opens the room in any letter case. A name nobody chose is a not-found page.
- **Make a new code** replaces the generated code after a confirmation. The old code and any printed QR code stop.
- **Who can join** is the existing open joining setting, shown as a choice. It stays a team workshop setting that
  only an admin changes (`20261109080000_open_join`): Wayfinding keeps the list so check-ins reach each person.
- **Ways in** lists the link, the QR code and the typed room code. All three are always on. Turning one off would
  change the TV's join screen, which belongs to the TV layout work, so it is not a setting yet.
- **Details** (`/setup/[id]/details`) keeps the event, the church, AI and the Wayfinding fields. The TV theme and
  size are only on Screens (`/setup/[id]/tv`) now.
- Migration `20261111200000_join_link.sql`: `engagements.link_name` with a format check and a unique index,
  `tv_room_link` resolving a name as well as a code, `joining_save` and `room_code_renew`. Tests:
  `supabase/tests/database/join_link.test.sql`. The engagement JSON archive does not list `link_name` yet.
- Not built: a logo upload and a time zone picker on Details, a link name field in the create flow, shorter room codes.
