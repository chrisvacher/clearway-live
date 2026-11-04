# The scribe console

Milestone 5, step 1 builds SCR-01 (the console on a laptop), SCR-02 (the easel camera on the scribe's phone), the scribe feed on the control surface (FAC-01) and FAIL-03 (the scribe goes offline), from the approved pass 5 boards. The brief is `milestone-5-brief.md`.

## Who sees what

| Who | Reads | Writes |
| --- | --- | --- |
| The scribe (a verified attendee with the scribe role, on the device they signed in with) | Every card and file for the engagement, with no speaker names | Capture, edit, re-file, photos and files |
| The lead and co-facilitators | The same, on the control surface (`?surface=control`), and speaker names through `scribe_speakers` for the review screens | The team-led flag on a run-of-show step |
| Participants, TVs, anon, an unverified scribe, people from another engagement | Nothing | Nothing |

The scribe signs in as any attendee does, on `/room/[id]`. A scribe sees the console on a screen 900 px wide or more and the easel camera on a phone. Everyone else sees the phone.

## Cards

Six kinds, picked by key (1 to 6) or by tapping: quote, decision, tension, action, question and mitigation. A kind carries only its own details, checked again by the database: a tension's two views, an action's owner and date, a decision's why, a mitigation's risk. A card has up to 2000 characters. Enter captures, Esc clears.

A card attaches to the session that is live when it is made, and the composer says which. The scribe can edit a card's words and details, and re-file a synced card to another step that isn't team-led. Edits carry the card's revision: an edit made on an old copy is refused and says so.

The speaker is optional and "for the record only". It is stored in `private.scribe_cards.speaker`, never in any state a browser reads (the state carries only whether one was kept), and shown only on the review screens, to facilitators.

## Photos and files

The camera button on the phone, and Upload a file on both. Photos are fitted in the browser (2400 px on the long edge, JPEG) and the bytes wait in IndexedDB until they are sent. Sending is three calls: `file_begin` makes the row and returns a signed upload address, the browser puts the bytes there, then `file_done` marks the row uploaded. The private `scribe` bucket's policies allow a write only to the exact path a row names, once. Files are shown through `/api/scribe/[id]/files/[file]`, which reads under the caller's own session, with `nosniff` and a sandbox policy.

Allowed: JPEG, PNG, WebP, HEIC, PDF, Word, PowerPoint, Excel, text and CSV, up to 15 MB.

## Offline (FAIL-03)

Every card, edit, re-file, photo and file goes into a durable outbox on the device first. The outbox sends one item at a time in the order made, with the card's id made in the browser, so a retry or a replay after a reload is a duplicate and never a second card. A new item never overtakes an older one that is waiting. Retries back off with jitter and start at once when the connection returns. Each card says where it is: Saved on this laptop (or phone), Syncing or Synced, and numbered in send order while it waits. A card the server refuses for good (for example, the team took the room) says why and can be dismissed.

## The team-led block

`sessions.team_led` is set from the step's options in the run-of-show editor (a checkbox that saves at once). While a team-led step is live, the console and the phone say "The team has the room", capture is off, and `scribe_capture` and `scribe_file_begin` refuse with `team_led`.

## The feed

The control surface's right column has a private Scribe panel. The database sends a content-free notice when anything changes, and the panel reads the state again under the facilitator's sign-in. It shows the newest cards for the live step with their photos and files, no speakers.

## Files

- Migration: `supabase/migrations/20261104100000_scribe_console.sql`. Tests: `supabase/tests/database/scribe_console.test.sql`, `tests/unit/scribe.test.ts`, `tests/browser/scribe.ts` (`npm run test:scribe`).
- Code: `lib/scribe/*` (policy, outbox, image, request shaping, server), `app/api/scribe/[id]`, `app/api/run-of-show/[id]/team-led`, `components/scribe/*`.
- The local stack and CI now run Supabase Storage. `private.scribe_storage_setup()` makes the bucket and its policies; the migration runs it, and the browser kit runs it again in case Storage started after the migration.
