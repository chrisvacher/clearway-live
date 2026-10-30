# Foundation practice and seed data

`supabase/seed.sql` creates the permanent practice engagement and the fictional Riverside Church Wayfinding engagement with eight people, including one scribe. Names, emails and church records are fictional. Stable seed ids support repeatable tests, while `ON CONFLICT DO NOTHING` preserves existing edits and soft-deleted history. External Team Hub and CORE ids remain null. Existing Clearway admins are assigned as lead where a seed engagement has no lead.

Seeds are deliberately separate from schema migrations. Local setup runs `npm run db:seed` after starting and resetting the local stack. This command refuses a non-loopback database URL. CI replays schema/role tests without seeds, then loads the seeds twice and tests their actual contents and native practice Auth. Production seeds run only against the Live project after PR 7 is merged.

`/practice` opens the permanent room. A phone supplies its name and a random device proof, without email sign-in or a code. A service-only RPC accepts name-only joining for that exact permanent practice id and type. Other engagements still require the attendee email/code, confirmed link or facilitator approval. The server generates a pseudonymous per-device email under `practice.clearway.invalid`, exchanges a native Supabase OTP session without sending any email, and binds it using the same room-session proof checks. Global anonymous Auth remains disabled.

The control/setup surfaces still require a listed Clearway Google account. Practice participants cannot read setup, the roster, Clearway users or invite batches. Fictional `.example`, `.invalid` and `.test` addresses cannot receive invitation batches. To test email sign-in with a real phone, replace a fictional Riverside attendee email with your own, or add a real test attendee, then review and send that personal invite.

# Reset

An assigned facilitator or Clearway admin uses **Reset practice room**, then **Confirm reset** on the practice setup page. The database accepts no caller-supplied engagement id for reset. It soft-deletes practice attendees, requests and sign-in proofs, revokes practice device sessions, deletes only the Auth sessions bound to that practice engagement, and reopens it in setup status. It preserves the permanent engagement, facilitator assignments, audit rows, unrelated Auth sessions and Riverside’s eight people.

Guest grants and every practice proof/claim operation share a database advisory lock with reset. An in-flight claim cannot restore a revoked device after reset. Open phones discover the missing device, initialize a new device, and show the name form again. They can rejoin immediately. No nightly job is scheduled in milestone 1 because scheduled jobs have not been introduced.

# Acceptance

`docs/milestone-1-acceptance.md` is Chris’s real-phone acceptance script. Passing automated tests and desktop emulation does not substitute for that acceptance. Milestone 2 implementation waits for this acceptance, Chris’s motion-prototype signoff and design pass 2.
