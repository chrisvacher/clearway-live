# Engagement setup

Milestone 1 implements SET-01, SET-02, SET-03 and SET-09. `/setup` lists RLS-visible engagements. Admins create an engagement by choosing an existing Team Hub client and engagement. Both ids are checked by the restricted server reader, including the engagement's client association. Existing engagements remain editable while the reader is unconfigured. Fictional seed engagements deliberately have no external ids.

The church, engagement, lead and co-facilitator save in one database transaction. An assigned facilitator can edit church details and their engagement, including a co-facilitator, but cannot change external links or the lead. Admins add Clearway users explicitly from approved Team Hub team members with `@clearway.co` email, without granting admin status. No user is automatically admitted just because they exist in Team Hub.

Pre-call times are entered in the church's IANA time zone and stored as instants. Ambiguous or nonexistent times during daylight-saving changes require another local time. Retreat dates remain dates. A blank base year uses the retreat year, then engagement start year. A supplied base year is preserved. The 10-year Future, 3-year Vision and 1-year Outlook will use this stored base year in later milestones.

The settings store AI permission, Scripture translation, TV theme, texture and room size, without activating later milestone features. Very small screen is the PRD room-size default. The initial settings use dark theme, texture on and AI off. The theme remains editable and does not settle the later TV design choice. SET-09 is required, editable consensus wording. Its saved text appears on the phone welcome and in each personal invitation.

# People and email

Imports show a review before saving. CSV supports UTF-8 BOM, quoted commas, doubled quotes and quoted newlines, with a 128 KB input limit and 500 people per import. Name and email are required. `role` means role at the church. Optional `room_role` explicitly sets participant or scribe. Other fields are retained. Email matching trims and lowercases, keeping the first duplicate. Existing scribe roles stay unchanged when room_role is absent. Pasted lists use `Name <email@example.org>` per line. Team Hub imports resolve the church's persisted link after an RLS check and verify every selected person against that church's current people.

Editing an email or removing a person revokes their existing device access through the existing identity-change trigger. Bulk imports are atomic. Browser input cannot set an Auth identity, verification time, or device binding.

Invites are reviewed and sent in batches of up to 50 through Resend's batch API. A private forced-RLS outbox snapshots recipients, church, dates and consensus. The reviewed batch id is the provider idempotency key, and retries reuse the exact payload for up to 23 hours, within the provider's 24-hour window. Accepted batches are marked sent through a service-only invoker RPC. If marking fails after provider acceptance, retrying uses the same idempotency key. Closing the engagement, removing a recipient, or changing their email blocks a pending batch. Three new batches per engagement per five minutes limit accidental repeats. No automatic retries, background sending, or real-person test emails run in CI.

# Validation

Unit tests cover CSV edge cases, duplicate matching, roles, local times, dates and invitation content. HTTP tests exercise guarded setup routes, import review/save and invite review/send/retry against local Auth, REST and Resend fixtures. PostgreSQL tests prove participants and other-engagement facilitators cannot save setup, import people or queue invitations. They also cover immutable external links, private outbox access, atomic imports, preserved scribe roles, consensus snapshots and admin creation.
