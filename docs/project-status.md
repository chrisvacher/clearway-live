# Project status and remaining work

Reviewed November 10, 2026, America/Toronto. Source baseline:
[`6853b8e`](https://github.com/chrisvacher/clearway-live/commit/6853b8e9ade4699b8c148980e3d2bc591be88ef0),
remote `main`, including admin refresh PRs #133 to #136. The [PRD](prd.md)
governs behaviour. This review records implementation evidence and gaps,
and does not change Chris's decisions or confer milestone acceptance.

## Repository state

The active working copy is `/Users/chrisvacher/Documents/ChatGPT/clearway-live`.
It was an empty Git repository and was populated from
`https://github.com/chrisvacher/clearway-live.git`. Documentation updates are
on `codex/docs-project-review`. The earlier iCloud working copy was left intact.
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
acceptance records should first be checked with Chris, so completed venue runs
are recorded rather than repeated unnecessarily.

## Remaining work, in order

1. **Close the acceptance record.** Confirm which real-device runs Chris has
   completed for milestones 2, 3, 5, 6 and 7. Record date, revision, environment,
   devices, latency results and failed rows. Use the existing
   [practice-room script](practice-room-script.md), including venue wifi,
   iPhone/Android, HDMI, mirroring, video sharing, offline recovery and the
   independent remote. Capture the farthest-seat readability check and the
   95-in-100 under-one-second result. The Word/Google Docs/PDF checks in
   section 42 need real application/device evidence.
2. **Build the nightly practice reset required by the PRD.** On-demand reset is
   implemented, but `vercel.json` schedules only `/api/cron/check-ins` and there
   is no nightly practice-reset route or scheduled database job in tracked
   source. Choose and document the reset time and time zone, protect the job,
   reuse the existing reset transaction, and verify that other engagements
   remain intact and that an active rehearsal is handled deliberately.
3. **Build the full-engagement JSON archive required by the PRD.** The export
   route currently offers one session or all reached sessions as CSV.
   `format=model` on the report route is a report-preview model, not an
   engagement archive. Define its contents and version, enforce facilitator
   authorization, and verify private data and authorship access. The Map
   already offers browser Print or save as PDF and Markdown download,
   as documented in [Map and templates](map-templates.md).
4. **Finish or retire social sharing PR #102.** Resolve conflicts against
   current main, review the image/metadata and crawler rules, and run checks.
   It is separate from core live facilitation acceptance.
5. **Verify production readiness against the accepted revision.** Check the
   deployed commit, Live-only migration history through
   `20261109080000_open_join.sql`, per-PR database isolation, Google auth,
   restricted Team Hub reader, email configuration, AI configuration and the
   authenticated check-in schedule. Confirm `CRON_SECRET` is set in Production
   without displaying it. Verify Supabase backup coverage and a restore
   procedure. Source files do not prove these operational checks are complete.
   This review did not inspect or change hosted configuration.
6. **Complete error monitoring.** The PRD calls for server and client error
   capture. The repository logs server errors, but no external monitoring SDK
   or client capture integration was found in dependencies or app code.
   Confirm whether platform tooling meets the requirement, then document it
   or implement remaining capture. Adding a paid service or changing an
   external service still needs Chris's approval.
7. **Resolve first-use product decisions.** The PRD leaves privacy and retention,
   language scope and the final product name open before a church uses/sees
   the app. Record Chris's decisions and implement resulting changes. This
   review does not make a legal assessment. Granola import is also open,
   while paste and Word/PDF/text notes already work. Treat direct import as
   optional until Chris decides it is required.

## Scope already settled

- The app never connects to CORE. The team enters the plan there afterwards.
- The app does not run or read the congregational survey. Findings are added
  by hand from Team Hub's report. Survey-specific pass 6 screens are shelved.
- Statements (INT-17) are included. Quizzes and predictions remain outside
  the first release.
- Table mode, additional integrations, native apps and other items under the
  PRD's "Not in the first release" remain deferred.

## Verification for this review

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
