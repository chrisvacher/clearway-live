# Nightly practice reset and engagement archives

Implemented and verified in production November 10, 2026. Migration:
`supabase/migrations/20261110121926_practice_reset_archive.sql`.
The migration is applied to Clearway Live. Supabase assigned version
`20261110121926`, and the repository filename matches that history. The deployed
production routes were checked with the real facilitator session and Vercel cron
controls. See [production evidence](evidence/production/2026-11-10-practice-reset-archive.md).
No Team Hub or CORE changes were made.

## Nightly reset

`GET /api/cron/practice-reset` is scheduled in `vercel.json` at **09:17 UTC**
daily, 4:17 am Toronto standard time and 5:17 am daylight time. It uses the
existing `CRON_SECRET`, with a timing-safe header check. Missing or incorrect
authorization returns 401 before connecting to the database.

The service-only `public.nightly_practice_reset()` RPC accepts no parameters.
It can reset only the permanent practice engagement, and calls the complete
existing reset chain. The underlying base additionally recognizes the trusted
SQL `service_role`. A browser's JWT claims or user metadata cannot grant that
database role. Manual facilitator reset keeps its existing permissions.

- The practice advisory lock and room-state row lock serialize the check and
  reset with guest claims, submissions and manual reset. A busy lock skips the
  run, with no partial reset.
- A device heartbeat, control press, engagement/session edit, submission,
  scribe card, review presence or running AI job in the last 15 minutes skips
  the room. A TV left open by itself does not block the reset.
- The reset clears the same practice records and revokes the same sign-ins as
  manual reset. Other engagements and the reset audit remain intact.
- `private.practice_reset_runs` is a private RLS-protected ledger keyed by UTC
  date. The successful reset and ledger entry commit together. Repeated calls
  that day return `already_reset`. An active/busy skip consumes no daily entry.
- Responses are `reset`, `already_reset`, `active`, `busy`, or `missing`.
  Missing practice data or database errors return 503. Active/busy skips are
  retried at the next nightly run, or by calling the protected endpoint again
  once the room is idle. On-demand reset remains available to facilitators.

## Engagement JSON archive

Choose **Download everything** on Results, or use
`GET /api/control/<engagement>/export?format=json`. Existing session CSV
downloads are unchanged. The route uses the facilitator's own session, never a
service key. The database independently requires an assigned lead,
co-facilitator or active Clearway admin. Other engagements and room roles
cannot read the archive. It works after engagement closure while the
facilitator still has access.

The archive is a single consistent database snapshot with `format` equal to
`clearway.engagement`, `version` equal to `1`, `exported_at`, `engagement_id`,
and `records`. Ninety allowlisted record collections include the church,
engagement, assignments, attendees, sessions, submissions, notes, decisions,
Discover findings/themes, live interaction records, Wayfinding records,
scribe capture, draft history, publications, reports, sign-offs, visibility
plan, check-in records, sharing metadata and AI run history. Assigned
facilitator names/emails are supplied in a separate `facilitators` collection.

It includes soft-deleted history and private names/notes, so keep it with the
facilitation team. Unopened seeded lens sentences remain excluded, including
their submission rows, until that lens opens. Explicit table and column
allowlists prevent future schema additions from silently expanding version 1.

Auth/device bindings, sign-in proofs, access-token hashes, job leases, invitation
payloads and global templates are excluded. File records carry private Storage
paths and metadata, not file bytes or signed URLs. Session images include their
metadata without the database's binary data column. `file_bytes_included` is
false. This JSON download is a record archive, with no restore/import operation.
Preserve original uploads and database backups separately for complete file recovery.

The response is an attachment with private/no-store headers and is streamed
in chunks. A missing migration returns a private 503 response, and does not
prevent the rest of Results from loading.

## Verification

- `supabase/tests/database/practice_reset_archive.test.sql`: trusted service
  role, browser denial and forged claims, recent edits/phones, once-per-day
  reset, practice sign-in revocation, unrelated data preservation, archive
  assignment checks, private notes/authorship, lens visibility and a future
  secret column excluded from the existing archive version.
- `tests/unit/archive.test.ts`: streamed large records and Unicode round-trip.
- `npm run test:practice-reset-lock`: two real database connections verify that
  a scheduled reset returns `busy` while a room operation holds its lock and
  leaves the daily ledger unchanged. The harness refuses nonlocal services.
- `tests/smoke/routes.test.ts`: cron authentication, no database calls on
  refusal, database result handling, archive download headers and own-session
  authorization. `npm run check` includes these tests.
- `npm run check:db` replays the role assertions on the local stack. CI runs
  them after replaying every migration from an empty PostgreSQL 17 database.

References: [Vercel cron authentication and delivery](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs)
and [Supabase function privileges](https://supabase.com/docs/guides/database/functions).
