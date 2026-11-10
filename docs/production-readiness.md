# Production readiness

Initial audit November 10, 2026, America/Toronto, against production revision
`aecc735f84b381070d1017589e56316343a38d53` at `https://live.clearway.co`.
Remote `main` and the working copy matched at the start of this audit.

Updated later November 10, America/Chicago, for the deployed operations work at
`cba45a27527f33288173c082a8c679942dfed2e6`. File-loss recovery, client error capture
and email alerting are now verified. The original hosted audit below remains a
dated baseline. See the subsequent operations checks for current counts.

The hosted app is operating, and the configuration checks below passed. Release
to a church still has acceptance, recovery and product-decision gates.
Chris confirmed on November 10 that the later milestone checks so far were agent
testing in Claude. That evidence does not complete real-device acceptance.
The historical [milestone 1 acceptance](milestone-1-acceptance.md) remains recorded.

## Original hosted checks

| Area | Evidence | Status and limit |
| --- | --- | --- |
| Deployment | Vercel production deployment `dpl_6iwEYxxKTrMBjzG9xBZUtf4oonkM` is Ready, serves `live.clearway.co`, uses Node 22.x and matches `aecc735` | Passed |
| Database | Live project `uxfypmohciupjyzbonlq` is active and healthy, Postgres 17.11 | Passed |
| Migrations | All 69 local migration versions and names match production, through `20261110121926_practice_reset_archive.sql` | Passed |
| Access and security headers | Signed-out `/setup` and `/control` redirect to sign-in. Export and both cron routes return 401. Public entry/sign-in/TV pages return 200. Responses have no-store, HSTS, frame denial and noindex headers | Passed |
| RLS and Storage | All 111 tables in `public` and `private` have RLS enabled. The `scribe` bucket is private | Passed. Role behavior is additionally tested in isolated CI |
| Google Auth | Google is the only enabled external provider. Email is enabled for participant Auth, anonymous sign-ins and manual identity linking are off, email confirmation is on. Site URL is `https://live.clearway.co` | Passed configuration check |
| OAuth initiation | A fresh app POST returns 303 to Live Supabase, which returns 302 to Google's chooser with `prompt=select_account`, the Clearway domain hint and the correct `/auth/callback?next=%2Fsetup` destination | Passed initiation. Existing real facilitator session also loaded protected setup. A new consent/login was not completed in this audit |
| Production credentials | Vercel's masked metadata shows Production-only Supabase configuration, service credentials, Team Hub reader URL/certificate, Resend key/sender, Anthropic key and `CRON_SECRET` | Passed presence and scope. No values revealed. `APP_ORIGIN` uses the code's production default |
| Team Hub reader | Production setup successfully listed 50 Team Hub clients through the app. The deployed reader verifies its dedicated database role and read-only transaction on each read, with TLS verification | Passed. No engagement created and no Team Hub data changed |
| Email | Resend shows `clearway.co` Verified and six Delivered Riverside messages, comprising five sign-in emails and an invitation. Gmail independently contains the October 30 invitation from `live@clearway.co` | Delivery evidence is historical, October 30. No new messages sent during this audit |
| AI | Production contains 405 successful recorded runs across 17 job kinds with Haiku 4.5 and Sonnet 4.5. Latest recorded completion: November 9, 16:52:40 UTC, 11:52:40 am Toronto. Key metadata is Production-only, and app code disables its fake client in Production | Passed configuration and historical evidence. A new Anthropic request was not generated during this audit |
| Check-in schedule | Vercel shows Active at `7 13 * * *`, 13:07 UTC daily, 8:07 am Toronto standard time or 9:07 am daylight time | Passed |
| Check-in authorization and route | Zero rounds/recipients existed before the manual Vercel Run. Request Logs show GET `/api/cron/check-ins` returned 200 on November 10 at 7:40:52 am Toronto. The signed-out probe returned 401. Database still had zero rounds and recipients after the run | Passed empty production run. Sending due rounds is covered by the isolated harness, not a new production email |
| Nightly reset and JSON archive | Applied and checked November 10, including actual facilitator download, practice-only reset and repeat protection | [Production evidence](evidence/production/2026-11-10-practice-reset-archive.md). Next automatic reset is November 11 at 09:17 UTC and has not yet been observed |
| Database backups | Supabase shows daily physical snapshots for November 3 through 10. Latest: November 10, 11:29:55 UTC, 6:29:55 am Toronto. Organization is Pro. PITR is not enabled | Nightly database coverage passed. Files and restore drill remain open below |

## Subsequent operations checks

Verified November 10 at 18:21 to 18:24 UTC, 12:21 to 12:24 pm America/Chicago.
[Detailed evidence](evidence/production/2026-11-10-operations.md) records the
methods, revision, checksum, isolated test results and limits.

| Area | Evidence | Status and limit |
| --- | --- | --- |
| Deployment and migrations | Production `dpl_BTXhtnuPqVorsKjhsmaVgvCVvPjG` is Ready at `cba45a2`. All 71 local migration versions match Live history | Passed |
| Private operations data | All 117 app tables have RLS enabled. The six new tables also force RLS and deny direct browser access. Public admin readers delegate to guarded private functions | Passed. Role and spoofed-claim cases also passed isolated CI |
| File protection | Active non-practice uploads get versioned private Postgres copies, full SHA-256 validation and admin downloads | Implemented. No active church upload existed at activation. Practice data is intentionally excluded |
| File-loss recovery | Harmless test original removed, bytes recovered and reuploaded, checksum matched. Downloaded protected copy matched independently. No test object remains in Storage | Passed production drill. A full database/Auth snapshot restore remains open |
| Operations sweep | `/api/cron/operations` Active at `37 * * * *`. Vercel Run returned 200 and recorded an `ok` run with zero failures. Unsigned request returned 401 | Passed configured production route. Next automatic hourly invocation has not yet been observed |
| Error capture and alert | Controlled client event appeared privately with revision `cba45a2`. Resend sent the approved alert and Gmail independently received it at `chris@clearway.co` | Passed. Chris owns the response. At most one alert per UTC hour, with no input text or error messages |
| Access | Anonymous operations status/download requests returned 403; cross-origin ingestion returned 403 | Passed |
| Operations layout | Final revision's isolated screenshots reviewed at 1440px and 390px, with populated records and downloads | Passed for this page. Not a fresh all-admin workflow review |

## Checks that do not establish full readiness

- CI uses disposable local PostgreSQL 17/Auth and a Team Hub fixture, with no
  production secrets in the workflow. PR previews are present and protected by
  Vercel authentication, while the custom production domain is public as required
  for participants. Project environment metadata shows no Preview credentials,
  and the Supabase dashboard shows no branches. Authenticated preview testing is
  therefore not configured. CI isolation is present, but an isolated database for
  each authenticated preview remains a delivery-process gap.
- The earlier baseline's [CI run 42818353841](https://github.com/chrisvacher/clearway-live/actions/runs/42818353841)
  completed successfully. The operations revision's
  [CI run 42873437574](https://github.com/chrisvacher/clearway-live/actions/runs/42873437574)
  passed lint, types, dependency audit, unit tests, build, HTTP smoke, migration
  replay, database lint, role tests and the new operations browser kit. The wider
  browser regression suite was still running at this update. Do not describe
  that entire run as fully green until it completes.
- Supabase health advisors are empty. Its existing leaked-password-protection
  warning remains. The operations migrations bring the RLS-without-policy notices
  from 79 to 85, all intentionally private RPC-only tables. Two intermediate
  public-definer findings were fixed by moving the admin readers into the private
  schema. Performance advisors in the original audit reported three multiple-policy warnings on
  the lens-summary tables, plus informational missing/unused indexes. These are
  recorded follow-up work, rather than evidence of a data leak or an observed
  latency failure. Advisor references:
  [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection),
  [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
  [multiple policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies),
  [foreign-key indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
  [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- Supabase's last 24 hours included 37 denied practice-room Realtime subscriptions
  clustered on November 9 at 16:51 UTC, plus isolated database errors from earlier
  work. Their origin was not established in this audit. Supabase's last 30 minutes
  contained no error/fatal entries. Vercel's last 30 minutes likewise had no
  error/fatal logs or runtime error clusters. This is a bounded observation, not
  proof of a clean venue run. A requested 24-hour Vercel log window was rejected
  by the platform, so the query was narrowed to 30 minutes.
- Vercel's original log-drain API read returned 404, which did not prove an
  external monitor absent. Live now provides its own private client/server error
  capture, boundaries, rate limits and approved Resend alerting. The controlled
  production check above closes the observed client-monitoring gap without a new
  external provider.

## Gates before use with a church

| Gate | What remains | How to close it |
| --- | --- | --- |
| Real-device acceptance | Milestones 2, 3, 5, 6 and 7 have agent evidence, with no completed real-device acceptance confirmed by Chris | Run the [practice-room script](practice-room-script.md) on iPhone and Android, the independent remote, venue wifi, HDMI/mirroring and video sharing. Record 95-in-100 phone-to-TV arrivals under one second, no blank/redraw, back-row readability, offline recovery and Word/Google Docs/PDF checks. Record revision, date, devices and failed rows |
| Complete recovery assurance | File copies and production Storage-loss recovery are verified. Newly copied bytes still await observation in the next daily snapshot. Whole-project loss needs independent exports. A full database/Auth snapshot restore and measured recovery time remain unverified | Observe the next snapshot, keep approved independent private exports, and complete an approved isolated restore drill using the [recovery procedure](backup-recovery.md). Set acceptable data loss and recovery time |
| Privacy and retention | The PRD requires checked consent wording and a retention decision before church use. The approved AI disclosure exists, but does not resolve retention | Chris records the reviewed wording and retention/deletion decision, then resulting app changes are implemented and checked |
| Language and name | The PRD still leaves English-only versus French support, and the public product name open | Chris confirms the first-use language scope and name, then the PRD and any affected copy are updated |

These are release gates from the PRD and observed operational gaps. This audit
did not find a new broken core production route. Agent and CI tests remain useful
evidence, with the device/venue checks still needed before making a readiness claim.

Optional integrations are deferred by Chris's November 10 instruction: Granola,
direct people sync and Google Doc program sync. Social-sharing PR #102 is separate
from core live facilitation acceptance. Neither is a reason to postpone the gates
above. No Team Hub or CORE schema/configuration was changed and no paid add-on was
enabled during this audit.
