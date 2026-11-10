# Backup and recovery

Prepared November 10, 2026. This is an operating procedure to validate. A restore
drill has not been performed, and no production restore is authorized by this
document. See [readiness evidence](production-readiness.md).

## Coverage now

Clearway Live's database is project `uxfypmohciupjyzbonlq`, Postgres 17, in
`us-east-1`. Supabase's dashboard showed daily physical backups for November 3
through 10, latest at November 10, 11:29:55 UTC. The Pro plan normally provides
seven days of daily recovery history. Use the actual available dates when
responding to an incident. PITR is not enabled.

Daily snapshots can lose the changes since the chosen backup. A two-day retreat
can produce most of its record between daily snapshots, so record whether that
data-loss window is acceptable before the first retreat. The latest verified
snapshot predates the November 10 reset/archive migration.

Supabase backs up database and Storage metadata, but excludes uploaded file bytes.
The `scribe` bucket currently contains two objects. Easel photos and uploaded
notes therefore need separate private copies. The engagement JSON download
contains file metadata and private paths, but excludes the files and is not a
replacement for a database/Auth or file backup.

Sources: [Supabase backups and restoration](https://supabase.com/docs/guides/platform/backups)
and the Live dashboard's Scheduled backups and Point in time pages, inspected
November 10. The vendor documents downtime during restoration.

## Before the first church engagement

1. Assign the recovery owner and record acceptable data loss and recovery time.
2. Choose an approved private location for original uploads and file backups.
   Set retention and access to match the church data policy. Keep the binaries,
   their original bucket/path, byte counts and checksums in a dated manifest.
   Verify that a separate copy can be read. A copy in the same bucket does not
   protect against losing that bucket.
3. Keep facilitator JSON snapshots at meaningful retreat checkpoints in that
   private location. They preserve a portable record of the engagement, with
   private notes and authorship, and need corresponding access restrictions.
   No JSON import/restore feature is implemented.
4. Test recovery in an approved isolated environment. Provisioning a new paid
   project or changing external configuration requires Chris's approval. Restore
   a real backup only to a destination approved to hold its data. Test files as
   well as database records, authentication, RLS, TV pairing and an export.
5. Record backup time, restored revision/migration versions, object counts and
   checksums, elapsed recovery time, device results and failed steps. A procedure
   becomes verified only when those results are recorded.

## Incident procedure

1. Chris and the recovery owner establish the last known good time and whether
   restoration is needed. Stop active facilitation/writes and scheduled sends
   through an agreed maintenance procedure before restoring. Preserve diagnostics
   and the current data if available. Do not restore just to diagnose an error.
2. Confirm the project is **clearway-live**, `uxfypmohciupjyzbonlq`. Team Hub and
   CORE are separate systems and are outside this procedure.
3. Prefer recovery validation in an approved isolated destination first. For an
   in-place restore, review the available snapshot, data-loss window and expected
   downtime with Chris before he authorizes the final restore action. The
   dashboard route is Database, Backups, Scheduled backups.
4. After restoration, compare its migration history with the app revision being
   recovered. Apply only missing reviewed Live migrations or select the matching
   app revision. Do not replay migrations already recorded. Recheck RLS and
   function privileges. Verify any custom-role credentials privately as needed.
5. Recover file bytes separately from the approved backup, preserving bucket and
   paths that the recovered metadata expects. Compare counts/checksums and open
   sample files through the app's authorized flow. Database restore alone cannot
   recreate a deleted Storage object.
6. Test facilitator Google access, participant sign-in, one phone submission to a
   paired TV, the independent remote and JSON/document exports. Check Auth session
   behavior and decide whether old participant devices need to rejoin.
7. Review the restored check-in rounds, recipients and send results before
   resuming scheduled sends. A database rollback can make an already sent email
   look unsent, so reconcile with Resend's delivery history and have Chris approve
   the send state before resuming. Review practice reset's dated ledger as well.
8. Resume service only after Chris accepts the verified result. Record actual data
   loss, recovery time and follow-up work without storing credentials in evidence.
