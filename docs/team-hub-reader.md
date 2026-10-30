# Milestone 1, PR 5: Team Hub reader

The reviewed installer is `supabase/team-hub/live_reader.sql`. It is deliberately
outside Live's migrations. Chris reviews and runs it in Team Hub himself. Codex
does not execute it on Team Hub or CORE. The supplied draft is superseded by this
reviewed file. A copy is delivered for approval after isolated CI verification.

## Changes for review

The script creates two dedicated roles. `clearway_live_view_owner` cannot log in,
inherit other roles or bypass RLS. It receives SELECT on only the approved source
columns plus `deleted`. It owns eight security-barrier views in `live_read`.
`clearway_live_reader` can log in and SELECT those views only, with no membership
in the view owner, source table/column access or write grants. Only the installing
administrator may hold administrative membership, including PostgreSQL 17's
implicit role-creator grant. The reader has five connections at most, read-only
transactions by default and short statement/lock/idle transaction timeouts.

Views deliberately use the restricted owner's permissions, rather than granting
the login direct source privileges. The view owner is neither a table owner nor
a bypass role. Eight SELECT policies apply only to that owner and hide deleted
records. Existing source RLS enable/force flags, data and other policies remain
unchanged. Source and view columns are explicit, with no `SELECT *` projection.
The private `live_read` schema is never added to the Data API exposed schemas.

The PRD restricts team members to names and email. Their id is retained for the
required link. `status`, although present in the milestone brief's permitted list,
is excluded from that view to follow the stricter PRD. Every other projection
matches the brief. No Google/Wave fields, notes or financial amounts are exposed.

Postgres roles always inherit PUBLIC privileges, even with NOINHERIT. The installer
therefore fails and rolls back if the reader could read source columns through
existing PUBLIC grants, inherit another role, own unrelated objects, or execute
an accessible security-definer function. This includes existing functions whose
Auth guards could be spoofed through custom JWT settings on a direct SQL login.
The script does not silently revoke or rewrite Team Hub's PUBLIC privileges. Any
reported function or grant needs review in Team Hub before installation resumes.

## Server reads

`lib/server/team-hub.ts` is server-only and accepts `TEAM_HUB_DATABASE_URL` from
Vercel. The DSN must use the dedicated reader and Team Hub's exact project, either
its direct host or the Supabase pooler with the project-qualified username. Admin,
CORE and unrelated hosts are rejected. Remote TLS verifies the certificate even
if the supplied DSN asks to disable it. No admin/service credential or MCP fallback
is used. The pool holds at most two connections and releases them promptly.

Every query starts a read-only transaction, sets local timeouts and verifies the
actual database role and read-only state. Only constant, parameterized queries
against `live_read` are exposed by the module. Methods read clients, engagements,
planned elements, scheduled events, people with primary email/current church links,
and team member names/email. Engagement reads check both engagement and client id.
People use stable keyset pages of 500 and continue past 1,000 rows without duplicates.

PR 6 connects these reads to authorized setup actions. New church/engagement search
is admin-only. Assigned facilitators can refresh only the church and engagement
links stored on their RLS-authorized record. Integration failure never affects
room sign-in or later live-room code. Runtime reads never write to Team Hub.

## Approval and configuration

1. Review the final SQL and its isolated test results.
2. Run it in the Team Hub SQL editor. A failed preflight rolls back every change
   and names the grant/function requiring review. Do not bypass that check.
3. Set `clearway_live_reader`'s password privately in Team Hub. Never paste it in
   this repository or chat. Keep `clearway_live_view_owner` NOLOGIN.
4. Store the reader DSN as `TEAM_HUB_DATABASE_URL` in Live's production Vercel
   settings. The Supabase pooler is suitable when direct IPv6 is unavailable.
   If Supabase’s certificate chain needs its database root certificate, download
   that certificate from Database settings and set its PEM contents as
   `TEAM_HUB_DATABASE_CA_CERT` in the same Vercel environment. Certificate and
   hostname verification stay enabled. Do not use a private key or disable TLS
   verification. See [Supabase database TLS](https://supabase.com/docs/guides/database/connecting-to-postgres).
5. Deploy Live and use setup's refresh action to check the connected client,
   engagement, dates and people. Preview uses its own isolated configuration.

Until this is configured, the application reports Team Hub unavailable and does
not invent links or fall back to privileged credentials. Fictional seeds remain
local to Live and are not written to Team Hub.

## Verification

`npm run test:team-hub` refuses non-loopback root database URLs, creates a completely
separate disposable database, loads eight fake source tables and installs the
reviewed script there. It tests exact columns, RLS/deleted filtering, write denial,
source/token/financial denial and inability to assume the owner. The TypeScript
reader then logs in as the actual restricted role, checks parameterization and
client scoping, and reads all 1,205 people. A deliberately unsafe PUBLIC definer
proves the installer refuses a privilege escape. No hosted credentials or data
are used. This runs alongside Live's role and native Auth tests in CI.

References: [PostgreSQL view security](https://www.postgresql.org/docs/17/sql-createview.html)
and [role creation and membership](https://www.postgresql.org/docs/17/role-attributes.html).
