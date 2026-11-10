# File protection and monitoring, November 10, 2026

Verified on `live.clearway.co` at revision
`cba45a27527f33288173c082a8c679942dfed2e6`, deployed through main as
`dpl_BTXhtnuPqVorsKjhsmaVgvCVvPjG`, Ready with the production alias assigned.
The user authorized file backups, client monitoring and pushing main, and
explicitly approved operational email alerts to `chris@clearway.co`.

Times below are UTC and America/Chicago, which was CST on this date. Production
checks used Chris's existing admin session and Vercel's authenticated cron
controls. No production secret values were retrieved. No church file was removed
or overwritten. Team Hub and CORE were not changed, and no paid service was added.

## Migrations and access

Applied only to Live, Supabase project `uxfypmohciupjyzbonlq`:

- `20261110180606_operations_backups_monitoring.sql`
- `20261110181339_private_operations_helpers.sql`

Repository filenames match Supabase history, with the applied SQL unchanged.
The first migration's SHA-256 is
`7f0baa269b99ea2db5b1ec385c714b48834a193267c30055e0814a4c9a0cd6bb`.
All 71 migration versions match. All 117 app tables have RLS enabled, including
the six new operations tables, which also force RLS and deny direct browser reads.
Worker RPCs are service-only. Admin readers are public invoker wrappers around
guarded private functions. Authenticated role claims alone cannot impersonate an
admin. Operations records and file bytes are excluded from engagement JSON.

Signed-out production probes returned:

| Request | Result |
| --- | --- |
| GET `/api/operations` | 403 |
| GET a completed `/api/operations/backups/:id` | 403 |
| GET `/api/cron/operations` | 401 |
| POST `/api/operations/errors` from an unrelated Origin | 403 |

Final security advisors showed the existing leaked-password-protection warning
and 85 expected RLS-without-policy notices, six more than the previous baseline.
Intermediate public-definer warnings were resolved by the second migration.

## Production file recovery

Clicked **Verify file recovery** on the protected Operations page. The app
created its fixed harmless probe, copied it into Postgres, removed the original
Storage object, recovered the bytes, reuploaded them and compared the checksum.
The UI reported: "The test file was recovered and its checksum matched."

| Check | Recorded result |
| --- | --- |
| Completion | November 10, 18:21:51 UTC, 12:21:51 pm Chicago |
| Run | `ok`, copied 1, failed 0, recovery verification recorded |
| File | `backup-check.txt`, 79 bytes, explicitly marked Recovery test |
| SHA-256 | `02bb33c4b263b3155e8dba07eb0780a3f10fcef883e67bb146f4bf34c5708c11` |
| Protected download | Clicked Download protected copy through the real admin session. Local file was 79 bytes and independently matched the SHA-256 above |
| Cleanup | Zero objects under `scribe/operations-probe/` after completion |

At activation there were zero active church uploads needing protection. The two
older Storage objects are associated with reset/deleted practice records. They
are excluded by design. Production proof therefore uses the harmless probe. The
isolated browser test also covers a real uploaded non-practice fixture larger than
1 MiB, including multiple chunks and source loss.

## Production monitoring and email

Clicked **Verify monitoring** once. At 18:22:00 UTC, 12:22:00 pm Chicago, the
private page displayed one `TypeError`, kind `test`, route `/setup/operations`,
one occurrence, revision `cba45a2`. Database readback contained only the sanitized
kind, class, route and empty frame array, plus the revision and timing metadata.
It contained no error message, user input, participant identity or room link.

The alert ledger recorded one successful send at 18:22:00 UTC. Gmail independently
received **Check Clearway Live** from `Clearway Live <live@clearway.co>` to
`chris@clearway.co` at the same time. It reported one event and zero failed backup
runs, with the private operations link. Chris owns operational triage. Alerts are
limited to one per UTC hour. The controlled test remains visibly labelled Test
and expires with the seven-day operational history.

## Hourly sweep

Vercel showed `/api/cron/operations` Active with `37 * * * *`, every hour at
minute 37 UTC. Invoked **Run** using Vercel's configured authorization. Request
Logs showed GET 200 at **18:23:05.663 UTC, 12:23:05.663 pm Chicago**. The database
recorded an `ok` run finishing at 18:23:06 UTC, copied 0 and failed 0. No second
alert was sent. The next automatic hourly invocation was not yet observed.
The existing check-in and practice-reset schedules remained Active.

## Automated and visual verification

- Final local lint, TypeScript, production build and all 43 smoke tests passed.
  Unit results: 483 passed, one external Anthropic test skipped.
- Production revision [CI run 42873437574](https://github.com/chrisvacher/clearway-live/actions/runs/42873437574)
  passed the foundation job, including the production dependency audit, and
  migration replay, database lint, all database-role tests and the operations
  browser kit. The preceding implementation head also passed all 6,353 database
  assertions in [run 42872174133](https://github.com/chrisvacher/clearway-live/actions/runs/42872174133).
  The wider browser regression suite was still running at this record.
- The new SQL tests cover authorization, spoofed claims, corruption, partial
  retry, immutable completed copies, source loss, grouping, rate limits and alert
  claims. The browser kit covers actual global error capture with deliberately
  sensitive fixture messages, verifies those messages stay out of stored reports
  and email, and uses an isolated mailbox rather than real recipients.
- Visually reviewed the final revision's populated Operations captures at
  [1440px](../admin/operations-1440.png) and
  [390px](../admin/operations-390.png). Text, checksums and controls fit. The
  captures come from the isolated CI fixture, artifact `operations-screens`, ID
  `13791450823`, not a church engagement. Also inspected the real production
  desktop page and both successful control results.

## Limits and remaining readiness work

Copies are separate from Storage but remain in the Live database. The next daily
provider snapshot must include the newly copied records before they appear in
backup history. A full database/Auth snapshot restore has not been rehearsed.
Independent private exports are needed for loss of the entire Supabase project
and its provider backups. Acceptable data loss, recovery time and retention still
need decisions. See [recovery procedure](../../backup-recovery.md).

This verification does not complete the real-device milestones or a fresh review
of every admin workflow. The existing admin refresh covers 20 views at desktop
and phone widths, with the scope recorded in the
[admin audit](../../admin-refresh-audit.md). Church-use gates remain in
[production readiness](../../production-readiness.md).
