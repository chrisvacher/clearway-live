# Project status and remaining work

Reviewed November 10, 2026, America/Toronto. Source baseline:
[`6853b8e`](https://github.com/chrisvacher/clearway-live/commit/6853b8e9ade4699b8c148980e3d2bc591be88ef0),
remote `main`, including admin refresh PRs #133 to #136. The [PRD](prd.md)
governs behaviour. This review records implementation evidence and gaps,
and does not change Chris's decisions or confer milestone acceptance.

The reset and archive were activated in production later on November 10.
Their verification is recorded below and in the linked evidence.
The subsequent [production readiness audit](production-readiness.md) checked
hosted configuration and identified the remaining church-use gates.

## Repository state

The active working copy is `/Users/chrisvacher/Documents/ChatGPT/clearway-live`.
It was an empty Git repository and was populated from
`https://github.com/chrisvacher/clearway-live.git`. Documentation updates are
merged to `main` along with the reset/archive implementation at `51076ba`.
Both PRs #137 and #138 are merged. The earlier iCloud working copy was left intact.
Reads of its Git metadata and AGENTS.md timed out, so its uncommitted work and
branch state could not be reconciled with this copy. Preserve it until those
files are available and its status has been compared.

GitHub reported no open issues and one open pull request at review time:
[#102, social share image](https://github.com/chrisvacher/clearway-live/pull/102).
It was open, unmerged and reported `mergeable: false`. Review its current diff,
resolve conflicts and rerun checks before deciding whether to merge or close it.
Its social metadata and images are not present on this baseline.

## Implementation and acceptance

| Area | What is in the repository | Acceptance evidence and next step |
| --- | --- | --- |
| 1. Foundation | Google facilitator auth, setup, attendees, invites, room auth, restricted Team Hub reader, practice room | [Accepted October 30](milestone-1-acceptance.md), including Chris's real-phone checks. Counts in that record apply to that historical revision |
| 2. Live room | Server room state, realtime and fallback, paired TV, independent remote, phone outbox, latency and failure handling | Implementation and scripts: [room engine](live-room-engine.md), [failure states](failure-states.md), [practice-room script](practice-room-script.md). Record final real-device acceptance if it occurred outside the repository |
| 3. Interaction library | General interactions including statements, content screens, live AI, self-paced input, rehearsal, CSV, recap and templates | [Automated kit and recorded loopback results](acceptance-kit.md). Record Chris's acceptance of practice-room sections 1 to 11 |
| 4. Wayfinding | Five Lenses, summaries, candidates, outcome bullets and consensus, pre-mortem, goals, intent, handover, scoped follow-up, Map and templates | [Accepted November 5 with five fixes](milestone-4-brief.md#november-5-changes). Fixes are recorded in the same brief |
| 5. Scribe and overnight | Offline cards/files, quote promotion, source-linked drafts, concurrent review, publish and Day 2 read-back | [Kits](acceptance-kit.md) and practice-room sections 31 to 38. Final acceptance is not recorded in a dedicated milestone acceptance record |
| 6. Discover and signal | Manual findings, notes upload, Four Helpful Lists, accepted themes, What We Heard, private signal | [Kits](acceptance-kit.md) and practice-room sections 22 to 30. Final acceptance is not recorded in a dedicated milestone acceptance record |
| 7. After the retreat | Report editor and sign-off, Word/PDF, visibility plan, revocable read-only links, owner check-ins and cron route | [Kits](acceptance-kit.md) and practice-room sections 39 to 48. Final acceptance, including real-device export checks, remains to record |
| November 9 additions | Admin-only workshop open joining and refreshed home, setup tools and After pages | Open joining is in [room sign-in](room-sign-in.md). [Admin evidence](admin-refresh-audit.md) covers 1440px and 390px local fixtures. PRs #133 to #136 are merged |

The major feature groups from all seven briefs are implemented. The table does
not imply that every PRD requirement or operational gate is complete. Missing
acceptance records were checked with Chris on November 10. He confirmed the later
milestone testing so far was agent testing in Claude. Real-device acceptance for
milestones 2, 3, 5, 6 and 7 remains outstanding. The historical milestone 1 and
milestone 4 acceptance records remain as recorded, with their evidence limits.

## Remaining work, in order

1. **Complete real-device acceptance.** Chris confirmed the later milestone
   testing so far was agent testing in Claude. Run milestones 2, 3, 5, 6 and 7
   on the required devices. Record date, revision, environment,
   devices, latency results and failed rows. Use the existing
   [practice-room script](practice-room-script.md), including venue wifi,
   iPhone/Android, HDMI, mirroring, video sharing, offline recovery and the
   independent remote. Capture the farthest-seat readability check and the
   95-in-100 under-one-second result. The Word/Google Docs/PDF checks in
   section 42 need real application/device evidence.
2. **Complete recovery coverage.** Daily database backups are present. Files
   are excluded from those backups and the JSON archive. Establish private file
   backup coverage and complete an isolated restore drill using the
   [recovery procedure](backup-recovery.md). Record acceptable data loss and
   measured recovery time.
3. **Complete error monitoring.** Server logs and Vercel request logs exist,
   but client exception capture is missing. The platform log-drain query returned
   404, so it does not establish whether an external drain exists. Add client
   capture, verify a controlled error reaches the monitor and assign the response
   owner. Adding a paid service or changing external configuration needs Chris's
   approval.
4. **Resolve first-use product decisions.** The PRD leaves privacy and retention,
   language scope and the final product name open before a church uses/sees
   the app. Record Chris's decisions and implement resulting changes. This
   review does not make a legal assessment. Chris deferred optional integrations
   on November 10. Paste and Word/PDF/text notes already work, while direct
   Granola import, people sync and Google Doc program sync stay for later.
5. **Close release-process work.** Authenticated previews have no database
   credentials, while CI has an isolated local stack. Configure isolated
   authenticated previews before relying on them to review private workflows.
   The complete browser CI run must finish before calling the audited revision
   fully green. Social-sharing PR #102 can be finished or retired separately
   from church-use acceptance.

## Hosted work verified November 10

The [production audit](production-readiness.md) verified deployment, all 69
migrations, RLS on all 111 app tables, Google Auth configuration/initiation,
Production-only credential metadata, the app's restricted Team Hub reader,
historical email/AI evidence and a successful empty authenticated check-in cron
run. Daily database backup coverage is present, with the recovery gaps above.

The nightly reset and JSON archive are active. Migration
`20261110121926_practice_reset_archive.sql` is applied. Vercel's 09:17 UTC job
reset the idle practice room, and a repeat retained one ledger entry. The real
facilitator JSON download parsed and excluded credentials and cross-engagement
records. See [production evidence](evidence/production/2026-11-10-practice-reset-archive.md).
The next automatic reset, November 11 at 09:17 UTC, has not yet been observed.

## Scope already settled

- The app never connects to CORE. The team enters the plan there afterwards.
- The app does not run or read the congregational survey. Findings are added
  by hand from Team Hub's report. Survey-specific pass 6 screens are shelved.
- Statements (INT-17) are included. Quizzes and predictions remain outside
  the first release.
- Table mode, additional integrations, native apps and other items under the
  PRD's "Not in the first release" remain deferred.

## Original source review verification

This section records the initial repository review before the hosted work later
on November 10. Current hosted results are in [production readiness](production-readiness.md)
and [reset/archive evidence](evidence/production/2026-11-10-practice-reset-archive.md).

- Pulled remote main at the baseline above. Open PR and issue state was read
  through connected GitHub tools on November 10.
- GitHub reports [CI run 461](https://github.com/chrisvacher/clearway-live/actions/runs/42724997944)
  successful for PR #136's head `87f2d30`. This is evidence for that PR head,
  not a fresh run of merged main.
- Local Node 22.14.0 verification passed: lint, TypeScript, production build,
  477 unit tests and 41 smoke tests. One additional unit test was skipped
  because no `ANTHROPIC_API_KEY` was supplied. Recorded AI fixtures ran.
  The first smoke attempt was blocked by the sandbox's localhost binding
  restriction, then all 41 passed with localhost binding allowed.
- Checked 74 Markdown files across root instructions, app route notes and
  `docs/`: all 201 relative links resolve and every documented `npm run`
  command names an existing package script. `git diff --check` passed.
- The local database and browser kits need a Docker-compatible runtime.
  Docker is unavailable on this checkout's command path, so no database
  reset, seed or authenticated browser kit was run during this review.
- Hosted migrations, deployment, credentials, backups and real email were not
  exercised. No shared practice-room reset was run.
