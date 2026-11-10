# File protection and app monitoring

Implemented November 10, 2026. The Live-only migrations are applied:
`20261110180606_operations_backups_monitoring.sql` and
`20261110181339_private_operations_helpers.sql`. Their repository filenames match
Supabase history. Production activation and verification are recorded separately.

## File copies

Live copies uploaded church files into protected Postgres records. Supabase's
existing daily database snapshots therefore include the file bytes. The copies
are separate from the Storage bucket, so losing an object there does not remove
its protected version. This uses the existing Live project and adds no provider.

A copy starts after the app confirms an upload. An hourly authenticated
`/api/cron/operations` sweep at minute 37 catches anything missed. It takes up to
20 pending files, with later runs continuing the backlog. Missing source files
count as failures and are included in alerts. Practice files are excluded because
that room is deliberately reset.

Each version records the Storage update, filename, content type, byte count and
SHA-256. Bytes are stored in chunks of at most 1 MiB, with the existing 15 MiB file
limit. A version is readable only after all bytes and the full checksum agree.
Retries resume partial copies. Completed bytes cannot be overwritten through the
worker RPC. Source changes produce another version.

Copies and chunks force RLS. Browser roles cannot write them or enumerate sources.
Verified Clearway admins can inspect status and download completed copies through
`/setup/operations`. Ordinary facilitators, participants, TV sessions and anonymous
visitors cannot use those routes or RPCs. Operational records and protected bytes
are excluded from engagement JSON exports.

**Verify file recovery** uses a harmless test file. It copies the bytes, removes
the original Storage object, verifies recovery from Postgres, uploads the recovered
bytes, compares the checksum and removes the test object. It never deletes or
overwrites an engagement file.

## Monitoring and alerts

`instrumentation-client.ts` installs listeners before the app becomes interactive.
It captures unhandled browser errors and rejected promises. Route and root React
boundaries report render failures and offer a retry. Next's server hook captures
unhandled request errors. Handled server failures continue to use Vercel logs.

Telemetry keeps an allowlisted error class, route pattern, up to four same-origin
static JavaScript frames, a numeric digest when available and the revision. It
excludes messages, answers, names, emails, actual room ids, bearer links, query
strings, fragments, cookies and foreign stack URLs. Reports are untrusted signals.

The browser omits cookies and the Referrer header on monitoring requests.
Ingestion checks the exact Origin, rejects cross-site requests, caps the body at
4 KiB and sanitizes it again on the server. Database limits allow 30 reports per
network per UTC hour and 1,000 globally. Browser deduplication also caps a page at
ten reports per minute. Network addresses are never stored. A daily rotating HMAC
is kept only for the short rate window.

Errors are grouped by fingerprint, deployment and UTC hour. They appear on the
private operations page and in structured Vercel logs. Error and alert history
expires after seven days on the operations sweep. Rate hashes cover at most the
current and previous hour.

Chris approved Resend alerts to `chris@clearway.co` on November 10. The first issue
can send an alert after the response. The hourly sweep retries alerts and reports
backup failures or stalled runs. At most one alert is sent in each UTC hour.
Claims last ten minutes, use a saved snapshot and stable Resend idempotency key,
and record delivery after a successful provider call. Optional server-only
`OPERATIONS_ALERT_EMAIL` overrides the approved default.

Alerts contain counts and the private operations link, with no input text or
participant details. Chris owns the response: open Operations, check events and
backup status, then inspect the matching deployment's Vercel logs. **Verify
monitoring** sends a controlled test through the same capture path. A telemetry
or email failure must never block a participant submission.

## Recovery and limits

Admin downloads stream chunks with a SHA-256 header. Store downloads privately and
verify the hash before restoring a file to its original path. Use the approved
recovery procedure instead of overwriting current files during diagnosis.

Copies increase database size and remain with the engagement until the open
retention/deletion policy is decided. Monitor growth as real engagements are
added. Historical protected copies can outnumber active files. No automatic
file-copy purge is introduced.

The next daily snapshot is still needed to put newly copied bytes into provider
backup history. The daily recovery window applies. A full database/Auth snapshot
restore has not been rehearsed. Deleting the entire Supabase project can also
remove its provider backups. Independent private exports cover that separate
failure case. See [backup and recovery](backup-recovery.md).

## Verification

Local lint, TypeScript, production build and 483 unit tests passed, with one
external Anthropic test skipped. All 43 HTTP smoke tests passed. CI includes role,
corruption, retry, immutability, Storage-loss recovery, grouping and limit tests.
The browser kit tests real Storage, the authenticated recovery download, global
error capture, privacy, local email delivery, admin-only access and populated
operations screens at 1440px and 390px. Hosted results are recorded separately.
