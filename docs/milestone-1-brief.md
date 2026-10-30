# Codex brief: Clearway live app, milestone 1 (Foundation)

October 29, 2026. The PRD (`docs/prd.md`) is the source of truth. Read "The non-negotiable: the screen is alive", "Three surfaces, one room", "Decisions and constraints", "Words in the app", "Users, roles and sign-in", "Architecture", "Integrations", "Data model", "Non-functional requirements" and "Milestones, 1. Foundation" before writing code. Where this brief and the PRD differ, the PRD wins. Raise a question rather than work around a decision.

## What milestone 1 delivers

The app's foundation: the repository and environments, Clearway sign-in, the engagement record linked to Team Hub, the attendee list, invites, and room sign-in on phones. No live screens, no sessions, no Discover.

## Setup

| Item | What to do | Needs Chris |
| --- | --- | --- |
| Repository | This repository. Copy CORE's package versions, linting, folder layout and styling approach from `chrisvacher/clearway-core` | Access to CORE's repository |
| Stack | Next.js (App Router) and TypeScript on Node 22.x, matching CORE | |
| Database | Supabase project `clearway-live` (Postgres 17) in the "Chris Vacher Projects" organization, region us-east-1 like CORE and Team Hub, separate from both | Creates the project |
| Hosting | Vercel project `clearway-live` in the "Chris' projects" team, framework Next.js, Node 22.x (matching clearway-core). A preview deployment per pull request, each on a Supabase branch or a staging project | Imports this repository into Vercel |
| Domain | live.clearway.co on the Vercel project. clearway.co's DNS is on Cloudflare, so the record is a CNAME for `live` pointing to `cname.vercel-dns.com`, set in Cloudflare like team and core | Adds the DNS record |
| Redirect | clearway.co/live redirects to live.clearway.co, set in the clearway.co website's repository (`chrisvacher/clearway-dot-co`) once live.clearway.co is up | Approves the change |
| Email | Resend, as CORE uses, sending from a clearway.co address | Resend key and sender address |
| Secrets | Supabase service key, Resend key, Team Hub connection string, Google OAuth client. Vercel environment variables only, never sent to a browser | Supplies each |

## Facilitator sign-in

- Google sign-in through Supabase Auth, limited to Clearway accounts (Decided).
- Allow only @clearway.co Google accounts, and only those listed as Clearway users in the app (Default). A Clearway user links to a Team Hub team member.
- Only Clearway users reach the control surface and setup pages. A participant session can't load them or read their data.
- Chris creates the Google OAuth client in Clearway's Google Cloud project and adds it to the Supabase project's Google provider.

## Room sign-in (scribes and participants)

- The invite email opens the room page, which offers "Send me a sign-in code". The person signs in with the 6-digit code or by tapping the link in the email.
- The code works on a different device from the email. Codes expire after 10 minutes and allow 5 attempts, and requests are rate-limited (Default).
- The link opens a confirm page, and sign-in happens only after a tap, so a link scanner that opens it signs nobody in.
- Emails are checked against the engagement's attendee list. An email not on the list gets a gentle "not on the list" message and can ask to join. A facilitator approval from the door list lets that phone in with no further step.
- A facilitator can sign someone in by hand with the device code their phone shows.
- A signed-in device stays signed in until the engagement closes.

## Reading Team Hub

- The app reads Team Hub through Supabase, from its server only, and never writes to it (Decided).
- Default: a read-only database role on Team Hub with views that expose only the columns below. A draft is in `supabase/team-hub/live_reader_draft.sql`. Review it, adjust it, and give it to Chris to approve and run. Never run it yourself.

| Team Hub table | Columns the app may read | Used for |
| --- | --- | --- |
| clients | id, name, logo, timezone, address_line1, address_line2, city, state_province, postal_code, country, website, status | Creating the church (SET-01) |
| engagements | id, client_id, title, engagement_type, status, start_date, end_date, assigned_consultant_id, coordinator_id | Linking the engagement |
| engagement_elements | id, engagement_id, title, type, status, scheduled_date, duration_minutes, order_index | Planned pre-call and retreat dates |
| events | id, engagement_id, engagement_element_id, client_id, event_name, start_date_time, end_date_time, location, location_type, status | Scheduled session dates |
| people | id, first_name, last_name, email, role, avatar | Building the attendee list (SET-03) |
| person_emails | id, person_id, email, is_primary | Matching people by email |
| person_organizations | id, person_id, organization_id (the client), role, is_primary, end_date | Which people belong to the church |
| team_members | id, name, email, status | Clearway users |

- Column names were checked against Team Hub's schema on October 29. Every view hides rows where `deleted` is true. Never expose `team_members.google_refresh_token`, any `wave_*` or `google_*` column, notes or financial columns. A test proves the role can't read them.
- The app stores each linked record's Team Hub id. It reads on demand and from a refresh button.

## Data for this milestone

Create only what milestone 1 needs, from the PRD's data model. Row-level security on every table, created and updated times, and soft deletes throughout.

| Entity | Holds | Links to |
| --- | --- | --- |
| Church | Name, time zone, logo, Mission, Purpose, Values, Strategy, Leadership Rhythms, governance body's name | Team Hub client id, CORE organization id (empty until linked) |
| Engagement | Type, status, dates, base year, lens names, settings | Church, Team Hub engagement id |
| Clearway user | Name, email, admin flag | Team Hub team member id |
| Engagement facilitator | Lead or co-facilitator | Engagement, Clearway user |
| Attendee | Name, email, room role (participant or scribe), role at the church, verified time | Engagement, Team Hub person id |
| Join request | Email, name, device, requested time, approved or declined, by whom | Engagement |
| Device session | A signed-in phone or laptop, valid until the engagement closes | Attendee |

**Seed data:** the permanent practice engagement (resettable on demand, and nightly once scheduled jobs exist) and a fictional church, "Riverside Church", with eight people. Seed names are fictional.

## Screens

Build SET-01, SET-02, SET-03, SET-09, PRE-01 to PRE-05 and FAIL-07. Until the high-fidelity designs from design pass 1 are in `design/`, build working screens from the PRD's descriptions using Clearway Live tokens, and restyle them when the designs land. Styles come from `design/clearway-live/live_tokens.css`, loaded after `design/clearway-base/colors_and_type.css`, never raw hex values. Copy follows "Words in the app".

## Acceptance criteria

From the PRD, milestone 1:

- Only Clearway Google accounts reach control and setup pages. A participant session can't load them or read their data.
- The code and the tap-to-confirm link both sign a person in, and the code works on a different device from the email. Codes expire and are rate-limited. Opening the link without tapping (as a link scanner does) signs nobody in.
- An email not on the list can ask to join, and an approval lets that phone in without another step. Manual sign-in works with the phone's device code.
- A signed-in device stays signed in until the engagement closes.
- Each engagement stores its Team Hub client id and Team Hub engagement id, and the church can store a CORE organization id (empty until linked).
- How the room decides (SET-09) explains consensus in plain words and appears in the invite email and on the pre-call welcome.
- The practice engagement and the Riverside seed engagement exist, and the practice engagement can be reset.
- Preview deployments, the test suite and row-level security tests run on every pull request.

## Definition of done

- Every acceptance criterion passes on the preview deployment, with real phones, in Chris's practice-room test.
- Automated tests cover every criterion that can be automated and run on every pull request.
- Row-level security is on for every table, with a test proving a participant can't read facilitator-only data and the Team Hub role can't read sensitive columns.
- Screens match the design files once they land.

## Not in milestone 1

Sessions, the run of show, the TV, the remote, realtime, AI, Discover, CORE publishing. Don't build ahead, but keep the room routes (phone, TV, remote) separate from the control and setup routes from the start, as the PRD's architecture sets out.

## Ask Chris before

- Running any migration on Team Hub.
- Changing the clearway.co website's repository.
- Anything that touches CORE.
