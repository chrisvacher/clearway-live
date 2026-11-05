# The draft Clearway Map and the Wayfinding templates

Milestone 4, step 7 (D2-15, SET-08). Migration: `supabase/migrations/20261104180000_map_templates.sql`.

## The draft Clearway Map (D2-15)

Two pages, assembled from the engagement's records by `private.map_assemble`. The facilitator reads them through `public.map_draft_read(engagement)`. The call stores the pages in `private.map_drafts` and moves the version on only when the pages changed. Facilitators and admins only. Nothing reaches the TV or phones, and reading the Map does not touch the room state or broadcast anything.

Page 1, Identity and direction:

- Mission, Purpose, Values and Strategy come from the church record.
- The 10-year Future lists the five lenses. A lens shows the sentences of its signed-off summary (`signed_off_version_id`). A lens with no signed-off version shows "Not signed off yet".
- The 3-year Vision lists the Vision Outcomes with their indicators. A provisional outcome is tagged.

Page 2, Action:

- This Year's Priorities is always empty. It is left for the church's Annual Planning (Chris's decision).
- The 1-year Outlook lists the goals that meet CORE (Connected, Owned, Result, End date), then the ranked key metrics and the celebrations. Goals that do not meet CORE are counted, not listed.
- This Season's Goals are the CORE goals that end in the first season any goal ends in.
- Leadership Rhythms come from the church record. Key Issues are the pre-mortem risks with mitigations, then the scribe's tensions and questions. A scribe card's speaker is never read.

Every empty field says it is empty and why. Nothing is invented.

Where it shows: `/control/<engagement>/map` (link on the control surface, "Draft Clearway Map"). The page re-reads every 10 seconds. "Print or save as PDF" prints two pages without the buttons. "Download text" gives `/api/control/<engagement>/map?format=md`.

## The templates (SET-08)

Two shipped templates, built on the template system from step 6b:

| Template | Sessions | Live minutes |
| --- | --- | --- |
| Wayfinding | 40 | 980 (pre-call 90, Day 1 480, Day 2 410) |
| Wayfinding, day and a half | 41 | 945, with a team-led follow-up block |

Day 1 starts at 9:00 church time, 14 days after the pre-call. Day 2 starts at 8:30 the next morning. The follow-up starts on day 22 at 10:00. The pre-call seeding step is self-paced and closes when Day 1 begins.

They use every milestone 4 kind: lens seeding and the lens wall, lens_summary (25 minutes straight after the Learning lens, before the provisional Vision Outcomes), candidates, outcome bullets and confirm, pre-mortem, goals, handover and intent. Day 2 at 9:00 is a short-confirm placeholder for milestone 5. The team-led block (the remote handover, commander's intent, affirm together) closes Day 2. The day-and-a-half follow-up notes tell the lead to issue the follow-up link and code from the Video follow-up panel.

Publish to CORE is not part of the app (Chris, November 4). Neither template has a Publish to CORE session or placeholder.

The Scripture and prayer screens (PRE-06 to PRE-09, D1-04, D2-02) are wired in as the opening and closing prayers.

## What starting from a template does now

`private.template_write` was extended (a superset of the original):

- `{lens name}` in a title or prompt becomes the engagement's lens name.
- A part can place sessions by day and clock time in church time (`day`, `clock`), safe across daylight saving changes.
- `team_led` is saved and applied.
- `seeded_from` is saved by place and applied by key, never by id. A session is seeded only from an earlier session of the same kind.

## Shared objects touched

`private.template_write` and `private.template_public` (both supersets). New helpers: `private.template_text`, `private.template_moment`. Not touched: `reset_practice_room`, the `ai_*` functions, check-constraint lists.

## Tests

- pgTAP `supabase/tests/database/map_templates.test.sql`: roles (facilitator, admin, participant, TV, another room's facilitator, anonymous), the Map's content rules, the templates and starting from them.
- Unit `tests/unit/map-templates.test.ts`.
- Browser `npm run test:map-templates`: starts an engagement from each template, checks every session's kind, place and timing, then assembles a Map from seeded Riverside records and reads, prints and downloads it.
