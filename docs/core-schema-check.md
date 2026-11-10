# CORE schema check

**Superseded November 4, 2026.** Chris removed all CORE integration from the
app. Clearway's team enters the plan into CORE after the retreat. This research
is historical, and its proposed writes and open decisions are not current work.
See the PRD's Integrations section and `docs/milestone-7-brief.md`.

Research for milestone 7, read only, November 3. CORE's repository (`chrisvacher/clearway-core`) was read at commit `5830ba88a0a618d26e1916fe91448d8a6c9d9501` (October 30). CORE's production database (`clearway-core`, `hecdzipeokpioisdcegr`) was inspected for structure only: table and column lists, constraints, enums, indexes, policies and functions, plus a few counts. No rows were read and nothing in CORE was changed.

## Summary for Chris

- **`core-reference.json` is still accurate, so it is unchanged.** It only records the package versions Clearway Live copied from CORE. Every one of the 22 versions still matches CORE's lock file exactly. CORE has moved one commit past the commit it names, and that commit only touched a billing card and a testing guide, so nothing in it affects Live.
- **The file doesn't describe CORE's database.** The tables and fields Publish to CORE writes are listed in the PRD's "Write to CORE" table (read October 29). I checked that table against CORE's production database instead. It holds up: every table and required field the PRD names exists, with the allowed values the PRD gives.
- **CORE's repository doesn't define its main tables.** Goals, Vision Outcomes, tasks and organizations were created outside CORE's migrations folder. The repository's TypeScript types match production for the fields Publish to CORE uses, but its schema snapshot (`docs/database-schema.md`) is older than production. Production is the source of truth for milestone 7.
- **Six things the PRD doesn't say yet:**
  1. A new Vision Outcome can only be On track, At risk or Off track. CORE has no "Not started" for outcomes, so the open question about the starting status has three choices, not four.
  2. CORE has nowhere to store a Clearway Live id on the records it receives. Live has to keep every CORE id it creates (the PRD already says it will). The one exception is an unused id field on Vision Outcomes, described below.
  3. A goal's owner can be left empty. That makes "publish with no owner until the invitation is claimed" possible without any change to CORE.
  4. Each email belongs to only one CORE user and each user to only one church. An owner who already uses CORE at another church can't simply be matched.
  5. If 30-day first steps go in as CORE tasks, CORE's own trigger recalculates the goal's status from its tasks, and a task with no assignee is given the goal's owner.
  6. CORE has no place for the commander's intent statement itself, only for the first steps under it.
- **Seats.** 33 of CORE's 85 live churches are on the Client plan, which has unlimited seats. Free has 1, Small team 3, Large team 50, Custom whatever was set. Pending invitations count against seats, so about 8 owners only fit a Client, Large team or large enough Custom plan.

Decisions this feeds are already in the PRD's Open questions for milestone 7. Points 1, 3, 4 and 6 add facts to those rows, so the PRD's "Write to CORE" section and the milestone 7 rows of Open questions need updating once you've decided.

## `docs/core-reference.json` vs CORE today

CORE's `package.json` uses ranges (for example `^15.3.6`). The reference records the exact versions resolved in CORE's `package-lock.json`, which is what was compared.

| Field | Reference | CORE today | Result |
| --- | --- | --- | --- |
| repository | chrisvacher/clearway-core | chrisvacher/clearway-core | Matches |
| commit | ea0a669c066e | 5830ba88a0a6 (1 commit ahead: `TESTING-SETUP-GUIDE.md`, `components/ui/organization/BillingCard.tsx`) | Kept. It records the commit Live was built from, and no version changed |
| next | 15.3.6 | 15.3.6 | Matches |
| react | 19.1.0 | 19.1.0 | Matches |
| react-dom | 19.1.0 | 19.1.0 | Matches |
| lucide-react | 0.511.0 | 0.511.0 | Matches |
| clsx | 2.1.1 | 2.1.1 | Matches |
| tailwind-merge | 3.3.1 | 3.3.1 | Matches |
| class-variance-authority | 0.7.1 | 0.7.1 | Matches |
| server-only | 0.0.1 | 0.0.1 | Matches |
| @supabase/ssr | 0.6.1 | 0.6.1 | Matches |
| @supabase/supabase-js | 2.50.3 | 2.50.3 | Matches |
| @eslint/eslintrc | 3.3.1 | 3.3.1 | Matches |
| @types/node | 20.19.9 | 20.19.9 | Matches |
| @types/react | 19.1.8 | 19.1.8 | Matches |
| @types/react-dom | 19.1.6 | 19.1.6 | Matches |
| autoprefixer | 10.4.21 | 10.4.21 | Matches |
| eslint | 9.30.1 | 9.30.1 | Matches |
| eslint-config-next | 15.3.1 | 15.3.1 | Matches |
| postcss | 8.5.6 | 8.5.6 | Matches |
| tailwindcss | 3.4.17 | 3.4.17 | Matches |
| tailwindcss-animate | 1.0.7 | 1.0.7 | Matches |
| tsx | 4.20.3 | 4.20.3 | Matches |
| typescript | 5.8.3 | 5.8.3 | Matches |
| securityOverrides | Live-only patched versions | Not a CORE field | Unchanged, by design |

Changes made to `core-reference.json`: none.

## PRD "Write to CORE" vs CORE production

### organizations (85 live churches)

| PRD field | CORE today | Result |
| --- | --- | --- |
| Matched by the CORE organization id stored on the church | `id` uuid | Matches |
| Mission, Purpose, Values, Strategy (PRD says CORE doesn't hold them) | Not present. `description` text exists | Matches the PRD |
| Link back to Team Hub or Live | None | Live keeps the CORE organization id, as the PRD says |
| Season settings for the Vision Matrix | `vision_matrix_seasons` per church, `vision_matrix_max_years` (default 3) | New in CORE, see Vision Matrix |
| Seats | `billing_package`: FREE 1, SMALL_TEAM 3, LARGE_TEAM 50, CLIENT unlimited, CUSTOM `seats_included` (at least 1). Pending invitations count | Matches the PRD's "Free has one seat". Details are new |

### vision_outcomes

| PRD field | CORE today | Result |
| --- | --- | --- |
| title (required) | `title` text, not null | Matches |
| description | `description` text, nullable | Matches |
| indicators | `indicators` text[], nullable | Matches |
| display_order | `display_order` integer, nullable | Matches |
| organization_id | `organization_id` uuid, not null | Matches |
| status, set explicitly | `status` enum ON_TRACK, AT_RISK, OFF_TRACK, not null, default ON_TRACK | Matches, but there is no NOT_STARTED for outcomes |
| source_type, a new value | `source_type` text, default `manual`, no check constraint. In use: `manual` 124, `ONBOARDING` 12, `MANUAL` 11 | Matches. A new value such as `CLEARWAY_LIVE` needs no schema change. CORE's code doesn't branch on it |
|  | `indicator_progress` integer[], default empty | New in CORE. Progress per indicator, matched by position. Publish should send zeros, one per indicator |
|  | `created_by` uuid, nullable, references a CORE user | New. Should be the publishing CORE user if there is one |
|  | `source_upload_id` uuid, nullable, no foreign key | New. Unused by CORE's code. Could hold Live's Vision Outcome id for overlap checks, if Chris agrees |
|  | `extracted_at`, `reviewed_by`, `reviewed_at` | New, unused by publish |
|  | Times are `timestamp` without time zone; soft delete by `deleted_at` | New detail |

### goals

| PRD field | CORE today | Result |
| --- | --- | --- |
| title (required) | `title` text, not null | Matches |
| description (the result) | `description` text, nullable | Matches |
| owner_id | `owner_id` uuid, **nullable**, references a CORE user | Matches. Nullable is new information |
| due_date (the end date) | `due_date` timestamp without time zone, nullable | Matches. CORE allows no end date, Live always sends one |
| season (required, SEP_DEC, JAN_APR, MAY_AUG) | `season` enum JAN_APR, MAY_AUG, SEP_DEC, not null | Matches. CORE's own rule: Sep to Dec, Jan to Apr, May to Aug, by month |
| vision_outcome_id | `vision_outcome_id` uuid, nullable | Matches |
| organization_id | `organization_id` uuid, not null | Matches |
| status NOT_STARTED | `status` enum NOT_STARTED, ON_TRACK, AT_RISK, OFF_TRACK, COMPLETED, default NOT_STARTED | Matches |
|  | `team_visibility` boolean, default false | New. Publish can leave the default |
|  | `auto_status`, `status_override` (default false), `status_calculated_at`, `status_factors` | New. CORE recalculates `status` from linked tasks unless `status_override` is true |

### Read back from CORE

| PRD | CORE today | Result |
| --- | --- | --- |
| goals.status NOT_STARTED, ON_TRACK, AT_RISK, OFF_TRACK, COMPLETED | Same five values | Matches |

### invitations (owners without a CORE account)

| PRD field | CORE today | Result |
| --- | --- | --- |
| CORE's invite flow creates the token and sends the email | `lib/auth/invitations.ts`: `createInvitation` or `upsertPendingInvitation`, then `sendInvitationEmail` through Resend | Matches |
| requested_role MEMBER, ADMIN or OWNER (Default MEMBER) | `requested_role` text, check MEMBER, ADMIN, OWNER, default MEMBER | Matches |
|  | One pending invitation per church and email (unique). Expires after 30 days. `invited_by` nullable | New detail. Re-publishing must reuse or rotate a pending invitation, as `upsertPendingInvitation` does |
|  | `users.email` is unique across CORE, and each user has one `organization_id` | New. A person can belong to only one CORE church |

The invitations table in CORE's repository migration (`20250102_create_invitations_table.sql`) has no `requested_role`. Production does. This is one place the repository is behind production.

### 30-day first steps (Open in the PRD)

| Option in the PRD | CORE today | Notes |
| --- | --- | --- |
| tasks (title, goal_id, assignee_id, due_date) | `tasks`: `title` not null, `status` TODO, IN_PROGRESS, DONE, `due_date` timestamp, `goal_id`, `assignee_id`, `organization_id` not null | Matches. No description field, so the first step's text is the title. A trigger sets the assignee to the goal's owner when none is given, and every task change recalculates the goal's status |
| A goal of its own | As goals above | Possible, but it would show as a separate goal in CORE |
| A project task | `project_tasks` needs a `project_id` | Needs a project first |

### Commander's intent

| Live | CORE today | Result |
| --- | --- | --- |
| Intent card: intent statement, the must-do, what we'll stop | No matching table. `goal_notes` (what's going well, not going well, action plan) and `entity_comments` (goal, project or task) are the nearest | Missing in CORE. Needs a decision: leave it in the report and read-only copy, put it in the Vision Outcome description, or add something to CORE |

### Goals in the 3x3 Vision Matrix (Open in the PRD)

| PRD field | CORE today | Result |
| --- | --- | --- |
| item_type GOAL | `item_type` OBJECTIVE, GOAL, PROJECT. GOAL requires `goal_id` and no content | Matches |
| goal_id | `goal_id` uuid, cascade delete with the goal | Matches |
| year 1 | `year` integer, check 1 to 5 | Matches |
| season SEASON_1, SEASON_2, SEASON_3 for that church | Same values. Each church's `vision_matrix_seasons` row gives each season's start and end month and day | Matches. Publish must read the church's seasons to map an end date |
| created_by must be a CORE user | `created_by` not null, cascade delete with that user | Matches. New: if that user is later deleted, the Matrix items go with them |

### Security and how a publish could run

- Row-level security is on (not forced) for every table above. Goals, Vision Outcomes and tasks have one policy each, "Organization isolation with superadmin access", for signed-in CORE users. Invitations are written by CORE's server with the service role.
- CORE has no publish endpoint and no database function that creates outcomes, goals and tasks together. The nearest functions are `validate_and_claim_invitation` and `seats_allowed`. CORE's API routes all check a signed-in CORE user (`lib/api-middleware.ts`), so a call from Live would need its own server-to-server check.
- So the PRD's Default still stands: a small addition in CORE's repository, with your approval, that creates every record in one transaction and sends invitations only after it commits.

## What Publish to CORE would need

1. **One new CORE operation.** A database function (or a CORE API route that calls one) that takes the church's CORE id and the full list of outcomes, goals and first steps, creates them in one transaction, and returns every new CORE id. Live stores those ids for re-publishing.
2. **A server-to-server credential.** Something CORE can verify that only Live's server holds, kept in Vercel on both sides. This is a new environment variable in both projects, so it needs your approval.
3. **Owner matching.** Look up CORE users by lowercased email. If the email belongs to a user at another church, stop and show it rather than linking.
4. **Invitations after commit.** Use CORE's own `upsertPendingInvitation` and `sendInvitationEmail` after the transaction, and check seats first with CORE's seat rules.
5. **Values to send.** `source_type` set to a Live value, `indicator_progress` as zeros, goal `status` NOT_STARTED, `season` from the end date by CORE's month rule, and an explicit outcome `status` once you choose one.
6. **Your decisions.** Starting status for outcomes (three choices), owners without accounts (empty owner works today), where first steps go, whether to fill the Vision Matrix, where commander's intent lives, and who creates a church that isn't in CORE yet.

## The PRD's former "Write to CORE" section (removed November 4)

Chris decided on November 4 that the app doesn't publish to CORE: Clearway's team enters the plan into CORE after the Wayfinding retreat. The PRD's mapping is kept here, as it stood, for reference if that ever changes.

**Write to CORE** (milestone 7). CORE is a separate Supabase project. Table names, required columns and allowed values below are CORE's as of October 29.

| From the app | CORE table | Fields |
| --- | --- | --- |
| Church | organizations | Matched by the CORE organization id stored on the church. The id is empty until the church is linked. Who creates a CORE organization for a church that isn't in CORE yet is Open |
| Vision Outcome | vision\_outcomes | title (required), description (the outcome's one-line description), indicators (the 3-year Vision bullets), display\_order, organization\_id, status set explicitly (Open: CORE defaults to ON\_TRACK, which shows Green on a brand-new outcome), source\_type set to a new value marking it as from the app |
| 1-year goal | goals | title (required), description (the result), owner\_id, due\_date (the end date), season (required: SEP\_DEC, JAN\_APR or MAY\_AUG, from the end date), vision\_outcome\_id, organization\_id, status NOT\_STARTED |
| Owner without a CORE account | invitations, through CORE's own invite flow | CORE's invite flow creates the token and sends the email. requested\_role is MEMBER, ADMIN or OWNER (Default MEMBER) |
| 30-day first step | Open | Options: tasks (title, goal\_id, assignee\_id, due\_date), a goal of its own, or a project task |
| Goals in the 3x3 Vision Matrix | Open | Option: vision\_matrix\_items with item\_type GOAL, goal\_id, year 1, and the season mapped to CORE's SEASON\_1, SEASON\_2 or SEASON\_3 for that organization. created\_by must be a CORE user |

- **One transaction.** Publishing runs as a single CORE-side operation (an API endpoint or database function in CORE) that creates every record or none. Invitations are sent only after it commits. This needs a small addition to CORE, which Codex builds in CORE's repository with Chris's approval.
- **Additive.** Publishing adds records and never overwrites existing ones. Before publishing, the facilitator sees anything that may overlap (an outcome with the same title already in CORE) and chooses to add, link or skip.
- **Re-publishing.** Later changes (after a day-and-a-half follow-up session, or corrections after the retreat) publish as additional records linked to what's already there. The app remembers every CORE id it created, so it never duplicates.
- **Owners.** Matched to CORE users by email. Anyone without a CORE account gets a CORE invitation. How their goals are held until they accept is Open.
- **Seats.** CORE organizations have plan and seat limits (the Free plan has one seat). How invitations for about 8 owners fit a church's plan is Open.

**Read from CORE** (milestone 7): goals.status (NOT\_STARTED, ON\_TRACK, AT\_RISK, OFF\_TRACK, COMPLETED) for check-ins and the read-only copy. On track shows as Green, at risk as Yellow, off track as Red, and completed as completed (never Green).
