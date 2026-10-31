# Live room engine

Milestone 2, PR 1 supplies the data/transport layer. The run of show, pairing flow,
control/remote screens, participant interactions and animated TV follow in the
brief's remaining PRs. This change starts no live session and creates no attendee
or TV Auth session in production.

## Data and authorization

Each engagement gets one versioned `room_states` row. Sessions are separate from
presenter notes. Submissions retain authorship under owner-only RLS; the shared
snapshot and event omit attendee/Auth identifiers. Planning fields, phone-only
depth, notes, transport membership and latency records are never broadcast.
All new tables enable and force RLS. Browsers cannot write raw state/submission
rows or publish Realtime messages. Exposed RPCs use invoker privileges, delegating
to narrowly granted, identity-bound functions in the unexposed private schema.

Authorization uses current native Auth sessions, the Clearway allowlist/assignment,
bound attendee devices or the private TV session binding. A cookie, JWT metadata
role or caller-supplied attendee id cannot grant access. TV bindings are schema
support for the later pairing PR; there is no public self-pairing operation here.

## One write, one committed event

`POST /api/live/:engagement` accepts the phone's immutable submission id, session,
revision, action (`submit`, `change`, `withdraw`), text and timing measurements.
It requires the matching participant cookie and same-origin request. One database
transaction locks the room row, validates current access/session/limits, stores
the answer, computes results, advances the version, inserts the private Realtime
message and records server latency timestamps. A failed transaction rolls all of
these back. Retrying the same id/revision returns a duplicate result without a new
answer, event, version or latency row. Conflicting ownership/revisions are refused.

Word-cloud matching, length/word/send bounds and a whole-word profanity screen
run in the database too, so calling the RPC directly cannot bypass validation.
The initial profanity vocabulary is deliberately explicit in the migration;
broader filtering and its acceptance belong to the word-cloud/wall PR.
Queued submissions retain their original times and have the PRD's two-minute
grace window after close; ordinary sends and edits cannot bypass phones down or
an expired burst. These client timestamps are input, not an authentication proof.

State and an anonymous answer patch travel in one `room` event with one version.
Word counts, square-root sizes and total/people counts are computed once on the
server. The client applies consecutive versions, ignores duplicates, and fetches
a snapshot on a gap or session change. A matching snapshot does nothing; an older
response cannot rewind a newer event. Rendering consumes these changes later,
using the approved motion rather than replacing the screen.

## Private channels and revoked subscribers

The channel is `live:<engagement>:<random generation>`, configured private at both
ends. Realtime's receive RLS validates the current native session. Clients have
no send policy. Supabase checks authorization when a client joins, so the engine
also fingerprints active authorized sessions before sending each data event.
If membership changes, it sends a content-free `rekey` notice on the old topic,
rotates the channel generation and sends the data on the new topic. Existing
authorized clients fetch a current snapshot and join again. A revoked socket
cannot continue receiving answers on its formerly authorized topic.

The fingerprint and generation live in a service-only private table. Snapshot
authorization is checked on every read, including recovery and token refresh.
The caller's own token and the publishable key are returned only on an explicit
`transport=1` read, with private/no-store headers, for in-memory receive-only
Realtime. Service credentials never enter the response or browser bundle.

## Snapshot recovery

`GET /api/live/:engagement?surface=phone|control|tv` selects the corresponding
cookie namespace and checks the actual database role. It reads 500 rows at a
time by UUID cursor. Every page must match the first page's room version. A change
restarts the snapshot, with three bounded attempts; no partial/mixed response is
returned. Tests exercise more than 1,000 answers through the native Data API and
the real Next.js endpoint.

`RoomStream` keeps the last frame on connection failure. It checks snapshots every
five seconds with Realtime connected and every 1.5 seconds in fallback, refreshes
its receive credentials periodically, and avoids overlapping reads. Gaps and
rekeys recover immediately. Retry delays back off with jitter. The serial send
worker retains the phone's ids/revisions/order; durable offline storage is added
with the participant phone PR.

## Timing and verification

Latency records store normalized phone-send, database-receive, acceptance and
per-TV receive times. The TV-only acknowledgement RPC validates its binding and
version, records each receipt once and updates that TV's confirmed version.
Clock sampling estimates offset with half-RTT uncertainty; the report must retain
the combined uncertainty and distinguish offline queued sends. The TV pairing
and load-report PRs connect this to the full rendered flow. This PR does not claim
the venue's under-one-second target has passed.

Run `npm run check` for lint/types/unit/Next.js HTTP checks. CI also starts a
disposable PostgreSQL 17/Auth/Realtime stack, runs role/transaction/paging tests
and `npm run test:live`. That native test exercises actual private WebSocket
delivery, 50 simultaneous submissions, ordering, deduplication, sender denial,
1256-row paging, timing receipts and revocation while a subscriber stays connected.
The integration script refuses non-loopback database/API URLs. It sends no email
and touches neither Team Hub nor CORE.

References: [database broadcast](https://supabase.com/docs/guides/realtime/broadcast)
and [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization).
