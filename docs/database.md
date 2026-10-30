# Milestone 1, PR 2: Database and row-level security

This PR adds only churches, engagements, Clearway users, engagement facilitators,
attendees, join requests, and device sessions. There are no live-room, survey,
answer, scribe-capture, or output tables yet. Practice/Riverside seeds arrive in
PR 7. The supplied Team Hub SQL remains an unchanged review-only draft.

## Access model

| Caller | Read access to these seven tables |
| --- | --- |
| Clearway admin | All records, including soft-deleted records for administration |
| Lead / co-facilitator | Church and records for assigned engagements, plus the active Clearway directory for assigning co-facilitators |
| Unassigned Clearway user | Active Clearway directory only |
| Participant / scribe | Own verified attendee record and current registered device session, within an open engagement |
| Team facilitator | Same foundation reads as a participant; future block delegation grants no setup privileges |
| Unlisted, disabled, wrong-provider or non-Clearway identity | No foundation records |
| TV, elder/board shared link, congregation, unsigned browser | No foundation records; their future public projections are separate from setup data |
| Trusted server (`service_role`) | Administrative access for explicitly authorized workflows; its key must stay server-only |

Room clients cannot select raw churches, engagements, the roster or the door
list. Later phone endpoints will return only room-safe fields such as church
name and How the room decides. The entire engagement `settings` object stays
private. No public views or exposed definer RPCs are introduced here.

Clearway access requires a listed, active account linked to a Team Hub team
member, a confirmed matching @clearway.co Auth email, a verified Google identity,
OAuth proof on the current Auth session, and an existing, unexpired Auth
session belonging to that caller. PR 3 enables Google as the only external
provider for facilitator sign-in. The account's provider metadata alone is not
login-method proof: a Google-linked account signing in by email remains denied. Admin status and assignments come from database records, never
user-editable metadata. Deleting an assignment, removing the Google identity,
disabling the account, banning the user or signing out immediately removes the
relevant access, even before an old JWT expires.

Room access requires the current JWT session id to match a server-issued device
binding to that caller's attendee record. A second device does not replace the
first. No fixed app timeout is imposed before engagement closure. Supabase Auth
refresh and expiry remain enforced. Closing or soft-deleting an engagement
revokes its devices; reopening does not resurrect them. Changing a roster email
clears verification and revokes old devices. A case or whitespace correction
keeps the same verified identity and sign-in. Auth sign-out preserves audit rows.

## Writes and integrity

Admins create root church/engagement records and manage Clearway accounts and
lead assignments. Assigned facilitators edit their church/engagement setup and
roster and can manage co-facilitator assignments. They cannot promote themselves
to lead or edit Clearway accounts. A browser cannot reparent an engagement,
rebind an attendee Auth identity, mark verification, issue device sessions,
submit or approve a join request directly. PR 4 adds the server transactions for
those sign-in and approval workflows. These column grants complement RLS.

All tables have forced RLS, UUID keys, created/updated times and a soft-delete
flag. Browser hard deletion is denied. Every foreign key has an index. Partial
unique indexes permit archived records while deduplicating active emails and
assignments. Emails normalize to lowercase with whitespace trimmed. Device and
join bindings must refer to an attendee in the same engagement. Each engagement
stores both Team Hub ids, with its client id checked against its church. CORE
organization ids remain empty until linked. Pre-call and retreat dates are stored
separately from engagement dates. The horizon base year defaults to the retreat
year when provided, and an explicit base year is preserved.

Authorization helpers live in an unexposed `private` schema. The narrowly scoped
security-definer lookups avoid recursive RLS, use an empty search path, bind all
checks to `auth.uid()` and the real Auth session, and accept no arbitrary user id.
Only identity-bound lookup functions are executable by `authenticated`; trigger
functions and anonymous callers receive no execution grants.

## Local / CI checks

Use Supabase CLI **2.72.7** and a running Docker-compatible local runtime:

```sh
npm run db:start
npm run db:reset
npm run check:db
```

The commands explicitly target local Postgres 17, never `--linked`. CI starts a
fresh database, replays the migration, lints both schemas, and runs pgTAP role
and integrity tests inside a transaction that rolls back. It needs no hosted
Supabase credentials. `npm run check` remains the app suite; `check:db` is the
additional database suite. Both jobs run on every PR and main push.

The SQL tests use real Postgres RLS roles and Supabase Auth tables. They assert
exact visible record ids for every role across two churches and open, closed,
deleted and revoked states, then attempt cross-engagement writes, metadata
spoofing, self-promotion, invalid bindings and stale-session access. They also
check policy enforcement, column privileges, foreign keys, normalization,
constraints, closure revocation and audit preservation. Auth claims are set by
the privileged test harness to simulate trusted JWTs; no production auth bypass
or test helper is deployed. Sign-in HTTP flows arrive in PRs 3 and 4.

On this development Mac, no Docker daemon was available. The real database test
results therefore come from the isolated GitHub Actions runner.

## Deployment

Chris authorized production deployments for Clearway Live during PR 2. After CI
passes, the reviewed migration is applied only to `clearway-live`
(`uxfypmohciupjyzbonlq`), followed by role/security verification and the main-branch
Vercel deployment. No Team Hub or CORE migration is authorized by this permission.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
and [database testing](https://supabase.com/docs/guides/local-development/testing/overview).

The initial production migration is `20261030025957_foundation_schema.sql`.
Its version matches the migration history recorded by Supabase. The identical
SQL passed 315 pgTAP assertions in CI before application.
