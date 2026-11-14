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
| 4 | Workshop clean-up: Discover, After and the live room's Wayfinding panels by engagement type, and After the workshop | Built, see step 4 notes |
| 5 | Run of show: named sections, the grouped session editor, saved blocks | Built, see step 5 notes |
| 6 | Consistency sweep | Built, see step 6 notes |

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

## Step 4 notes

- **After the workshop** is the Results page (`/control/[id]/recap`) for a workshop: a Summary card, then "Results, session by
  session" with the same cards, CSV downloads and print to PDF as before. A Wayfinding engagement's Results page is unchanged.
- **The summary** is drafted by AI only when the facilitator presses Draft a summary. The model is shown what the recap shows
  (`lib/workshop/summary.ts`): session titles, prompts, counts, scale averages, bars, word cloud words and free-text answers.
  Hidden answers and words are left out, and a structured kind (a signature, a placement) sends no answers, so no name goes.
  The prompt is `workshop-summary@1` in `lib/ai/workshop-summary.ts`, on the deeper model, one call while the facilitator waits.
  The facilitator edits it, writes it by hand where AI is off, removes it, and downloads it as Word (`lib/export/summary-docx.ts`).
  Draft again asks first when the summary has been edited.
- **Where a workshop has no page**, the link goes somewhere useful: After the retreat, Report, Visibility plan, Read-only copy,
  Check-ins, Overnight review and the draft Clearway Map go to Results. Discover and Four Helpful Lists go to the Overview.
- **The live room** leaves out the alignment signal, the Scribe feed, the Overnight review card, Draft Clearway Map and After
  the retreat for a workshop. Everything else is the same.
- Migration `20261112100000_workshop_summary.sql`: `private.workshop_summaries`, `workshop_summary_state`, `workshop_summary_save`
  and `workshop_summary_clear`, and the AI run log accepts `draft_workshop_summary`. Until it is applied the Summary card is left
  out and the rest of the page works. Tests: `supabase/tests/database/workshop_summary.test.sql`,
  `tests/unit/workshop-summary.test.ts` and two steps in `tests/browser/team-workshop.ts`.
- Not built: one PDF that holds the summary and the results as a file (Print or save as PDF does this from the browser), the
  two-scale "before and after" comparison card from the design, and the summary in the engagement JSON archive.

## Step 5 notes

- **A section** is a run of sessions next to each other in a part that carry the same name (`public.sessions.section`). It is a
  label for planning: it changes no time, no state and nothing on a phone or the TV. A segment still keeps late answers open, and
  a part is still a day. A part with no named section looks exactly as it did.
- **In the run of show**, each section has a header with its name (edited in place), its count and length, and a menu: Save as a
  block, and Remove the section name. Sessions with no section in a part that has one sit under a header that asks for a name.
  Add a section names a new one; it is kept once a session lands in it (click an element, or drag one in).
- **Dropping between two sections**: above the lower section's header the session joins the section above, below it the one
  below. From the keyboard a session takes the section above where it lands; the Section field in its options moves it.
- **The options** are grouped under Basics, On the TV and phones, Settings and limits, and Your notes, all on one page, with a
  Section field under Basics. The design showed these as tabs; they are headings so every field stays one scroll away.
- **A saved block** is a template made from one section's sessions (`private.templates.block`). Saved blocks is a second tab in
  Add to the run: click a block to add its sessions at the end of the part it was saved from, with their section names. Blocks
  also show in Templates, marked Block. Whole templates keep their section names too.
- **Database**: `20261112200000_run_sections.sql`. The run of show's functions are wrapped, not rewritten: `show_read`,
  `show_write`, `template_write` and `template_public` are renamed to `..._pre_section` and called by new functions of the old
  names. `show_write` gains the action `section` (name a set of sessions) and keeps a `section` sent with `save` or `place`.
  It is safe in either order with the deploy: until it is applied the run of show works as before and section names are not kept.
- **Tests**: `supabase/tests/database/run_sections.test.sql`, `tests/unit/run-sections.test.ts`, and two steps at the end of
  `tests/browser/templates.ts`. Three source checks in `four_lists.test.sql` now read the `..._pre_section` functions.
- **Not built**: section names in the live room's run list and on the results page; dragging a block to a place (it lands at
  the end); the TV and phone preview beside the options; tabs in the options; reordering whole sections by dragging a header.

## Step 6 notes

Built November 13, 2026, in pull requests #145 to #151 and the closing pull request. The checklist was the page table and the event variables
table of the review, checked against main at `0e08e88` first.

- **One stylesheet.** `components/facilitator/admin.css` is imported once, in `app/(facilitator)/(protected)/layout.tsx`. Before this only some
  pages imported it, so the Door list, Four Helpful Lists and the draft Clearway Map rendered unstyled when opened directly or refreshed. The admin
  kit now fails if any page's title is larger than page-title size.
- **One frame.** Every page in the shell uses `admin-page` and `admin-heading`: a sentence-case kicker, the title (the sidebar's noun), a body-size
  lead, and the page's actions to the right of the title. Form pages keep to `--admin-form-max` (980px) through `.admin-narrow`, left-aligned.
- **One button family and one field standard**, inside the shell only: `.show-button`, `.admin-button` and `.button-link` render as the compact
  button (`is-primary`, `is-small`), disabled buttons look disabled, and no button stretches across a card. Fields are regular weight at table
  size. Every rule is scoped under `.app-shell`, so the TV, phones, public pages, sign-in, the live room, the run of show builder, Templates and
  the print view are not changed by them.
- **Templates.** The top "Use a template" button is gone; each card keeps Use. The save dialog focuses and selects the name, and the first click
  on it selects it too. The review's "Practice roomPractice run, Nov 3" was a template name, typed after the prefilled engagement title; the
  byline was never joined wrongly. That template still has that name in production.
- **Clearway users** loads the team when the page opens, with Try again if it fails. **Create an engagement** is matching cards with one
  primary: Who is it for, What kind of event and When, plus How people join for a workshop (four cards for a workshop, three otherwise). **Engagements** group headings are sentence case. **Operations** says when there are no protected copies; its wording is otherwise unchanged.
- **Details** is four cards: The event, The church, AI in the room, and Wayfinding settings (every kind except a workshop: Wayfinding, Day and a half and the practice room). Each has its own
  Save, and every Save sends the whole form through the existing `save` action. The Team Hub line shows the church and engagement names, never
  ids. Time zone is a select of IANA zones (`lib/setup/timezones.ts`). Labels changed: Event title, Kind of event, Name on screens.
- **Logo upload.** `POST /api/setup/logo` checks the origin and the facilitator, checks type by bytes (PNG, JPEG, WebP) and size (1 MB), and writes
  with the service role to the public bucket `church-logos`; the church's `logo_url` holds the public address, so the TV and join pages are
  unchanged. Migration `20261113100000_church_logos.sql`, applied to clearway-live on November 13. `lib/setup/policy.ts` accepts an `http` logo
  address only on 127.0.0.1 or localhost, for the local kits. Not covered: logos are not in the engagement JSON archive or the file protection
  backups, and a replaced or removed logo's file is left in the bucket.
- **Screens** is the page's title (it was "Pair a TV"). The setting is "Room size" with the live room's option words (`roomSizes`). Each message
  shows beside the button that caused it.
- **People and joining.** One width. Add people, the list and Invite the team are sections of one card. "Send invites" is disabled with nobody
  selected and never reads "Send 0 invites".
- **Door list** is the page's title. With open joining on, the first card is "In the room" and lists everyone who has joined, by name, in
  alphabetical order. The page refreshes its server data every 5 seconds while the tab is visible (`DoorKeepUp` in
  `components/facilitator/door-list.tsx`); there is no Refresh button. It polls; it is not a subscription.
- **Results.** The title is "After the workshop" for a workshop and "Results" for Wayfinding. "Print or save as PDF" is in the header. A Downloads
  card holds "Every answer as CSV" and "Download everything" (the engagement JSON archive, renamed).
- **After pages.** "Read-only copy" is the title of what was "Share". After the retreat has five cards (Results, Report, Visibility plan, Read-only
  copy, Check-ins) and "Mark the retreat closed" in the header. Phone to TV carries no second privacy band. Report, Visibility plan and Overnight
  review keep their designed workspaces; only their eyebrow is sentence case.
- **Discover** is on the standard frame without its own privacy chip or back link. **Four Helpful Lists** shows in the sidebar only when the run of
  show has the step (`hasFourLists` in `lib/server/shell.ts`, one read per page load on Wayfinding engagements; if the read fails the item still shows), and offers no CSV without it.
- **Print view.** It opens in a new tab from the run of show and from the live room, so "Return to run of show" is gone. The room link reads
  `live.clearway.co/<link name or room code>`.
- **Privacy marker.** Pages draw none of their own; every band uses the `EyeOff` icon. One exception is left: the live room's "Answers by person"
  band still uses a lock (`components/interactions/grid-form-sign/control.tsx`), because the live room was out of scope.
- **Tests.** `tests/browser/admin.ts` gained steps for every batch and runs in CI as `npm run test:admin`. Evidence is in
  `docs/evidence/design-pass-8/step-6/`.
- **Not built:** a subscription for the Door list; a logo in the archive and backups; a place on each engagement row; a rewrite of Operations'
  wording; a look at Report, Visibility plan, Overnight review and Check-ins with real content in them. A workshop's run of show still shows the
  Pre-call, Day 1, Day 2 and Follow-up parts; sections sit inside them (step 5).
