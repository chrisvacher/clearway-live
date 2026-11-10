# Production verification, November 10, 2026

Verified against `live.clearway.co`, deployed code `51076ba`, using Chris's
existing facilitator browser session and the Vercel production cron controls.
User authorized applying the migration and checking both features in production.

## Migration and permissions

Applied through the connected Supabase tool only to `clearway-live`
(`uxfypmohciupjyzbonlq`, Postgres 17). Team Hub and CORE were not changed.
Supabase recorded `practice_reset_archive` at version `20261110121926`.
The repository migration was renamed to that version without changing its SQL.

Verified both public RPCs exist. The reset RPC is unavailable to browser roles,
the archive RPC is unavailable to anonymous callers, and the reset ledger has
RLS enabled and forced. The archive retains its own facilitator authorization.

## JSON download

Opened Riverside's production Results recap through Chris's existing Google
facilitator session and clicked Download engagement JSON. Chrome completed the
download from the production endpoint. Parsed the downloaded file locally:

| Check | Result |
| --- | --- |
| Download size | 11,918 bytes |
| Status and format | `ok`, `clearway.engagement`, version 1 |
| Collections | 91, including the separate facilitator collection |
| Record rows | 17, the current Riverside foundation records |
| Cross-engagement rows | None |
| Excluded credential columns | None present |
| Binary files | Excluded, `file_bytes_included` is false |
| HTTP without facilitator authentication | 401 |

Riverside has no reached input sessions at this check, so this download verifies
the production route, real session, RPC, metadata and serialization. Populated
interaction records and lens visibility are additionally covered by CI's SQL
tests. The downloaded archive was not committed to the repository.

## Practice reset

The Vercel dashboard showed `/api/cron/practice-reset` Active with expression
`17 9 * * *`, daily at 09:17 UTC (4:17 am Toronto standard time, 5:17 am daylight
time). The separate check-in schedule remained active and was not run manually.

Before testing, the practice room had 50 attendees, zero devices with a heartbeat
in the last 15 minutes, and its latest control press was on November 9. Invoked
Run for the reset job through Vercel, using Vercel's configured authorization.
No production secret value was retrieved.

The ledger recorded one reset at **12:22:53 UTC, 7:22:53 am Toronto time**, on
November 10. Active practice attendees became zero, all practice device bindings
were revoked, and the live-session pointer cleared. Hashes of every other
engagement and attendee record were identical before and after.

Invoked the Vercel job a second time. The ledger still contained one row with
the original timestamp, and the non-practice record hashes remained identical.
A request to the production cron route without authorization returned 401.

The manual invocation verifies the deployed scheduled endpoint. The next
automatic run is November 11 at 09:17 UTC, which has not yet been observed.

## Operational notes

The Vercel connector denied the environment-metadata read with 403, and its CLI
fallback could not reach the API. Browser cron controls provided the authorized
test without reading secrets. The runtime-log search returned no matching
console entries, so verification rests on the completed download, active cron
configuration and database readbacks rather than a claimed response-log entry.

Security advisors added no warnings. The new private ledger adds one expected
informational RLS-without-policy finding, matching the existing RPC-only private
table design. The existing leaked-password-protection warning is unchanged:
[Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
