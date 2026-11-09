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

A card attaches to the session that is live when it is made, and the composer says which. The scribe can edit a card's words and details, and re-file a synced card to another step that isn't team-led. Edits carry the revision the card had when Edit was opened, not the one the console has read since: if another scribe saves the card while the form is open, the edit is refused and says so ("This card changed somewhere else, so this edit didn’t go in."). The card keeps showing the scribe's own words, marked Didn’t save, until Dismiss; after Dismiss it shows what the server holds.

A Mitigation card is linked to the pre-mortem risk it names. The scribe types the risk in the card's own words (no pick list), and the database puts the card's words under that risk as a mitigation recorded by the scribe, so it shows under the reason on the TV and in the Map. The words must match one reason, ignoring case, spacing and closing punctuation; a reason holds up to three mitigations (the facilitator's count too). A card that names no reason, names one more than once, or would be the fourth stays a card and says "Not on a risk yet". Editing the card moves or updates its mitigation, and the mitigation keeps the first 300 characters of the card. Code: `private.scribe_link_mitigation` in `supabase/migrations/20261109020000_overnight_scribe_handover.sql`, which wraps `private.scribe_capture`, `private.scribe_edit` and `private.scribe_state`. Test: `supabase/tests/database/scribe_mitigation.test.sql`.

The speaker is optional and "for the record only". It is stored in `private.scribe_cards.speaker`, never in any state a browser reads (the state carries only whether one was kept), and shown only on the review screens, to facilitators.

## Photos and files

The camera button on the phone, and Upload a file on both. Photos are fitted in the browser (2400 px on the long edge, JPEG) and the bytes wait in IndexedDB until they are sent. Sending is three calls: `file_begin` makes the row and returns a signed upload address, the browser puts the bytes there, then `file_done` marks the row uploaded. The private `scribe` bucket's policies allow a write only to the exact path a row names, once. Files are shown through `/api/scribe/[id]/files/[file]`, which reads under the caller's own session, with `nosniff` and a sandbox policy.

Allowed: JPEG, PNG, WebP, HEIC, PDF, Word, PowerPoint, Excel, text and CSV, up to 15 MB.

## Offline (FAIL-03)

Every card, edit, re-file, photo and file goes into a durable outbox on the device first. The outbox sends one item at a time in the order made, with the card's id made in the browser, so a retry or a replay after a reload is a duplicate and never a second card. A new item never overtakes an older one that is waiting. Retries back off with jitter and start at once when the connection returns. Each card says where it is: Saved on this laptop (or phone), Syncing or Synced, and numbered in send order while it waits. A card, edit or re-file the server refuses for good (for example, the team took the room, or the card changed somewhere else) says why and has a Dismiss button.

## The team-led block

`sessions.team_led` is set from the step's options in the run-of-show editor (a checkbox that saves at once). While a team-led step is live, the console and the phone say "The team has the room", capture is off, and `scribe_capture` and `scribe_file_begin` refuse with `team_led`.

## The feed

The control surface's right column has a private Scribe panel. The database sends a content-free notice when anything changes, and the panel reads the state again under the facilitator's sign-in. It shows the newest cards for the live step with their photos and files, no speakers.

## Files

- Migration: `supabase/migrations/20261104100000_scribe_console.sql`. Tests: `supabase/tests/database/scribe_console.test.sql`, `tests/unit/scribe.test.ts`, `tests/browser/scribe.ts` (`npm run test:scribe`).
- Code: `lib/scribe/*` (policy, outbox, image, request shaping, server), `app/api/scribe/[id]`, `app/api/run-of-show/[id]/team-led`, `components/scribe/*`.
- The local stack and CI now run Supabase Storage. `private.scribe_storage_setup()` makes the bucket and its policies; the migration runs it, and the browser kit runs it again in case Storage started after the migration.

## Promoting a quote to the TV (step 3b)

A facilitator can put a scribe quote on the TV from the scribe feed on the control surface (FAC-01): **Promote to TV** on a quote card, **Take off the TV** on the card that is up, or Take off the TV on the remote. The TV shows PromotedQuote: pass 3's spotlight (the Navy scrim and the Sunrise card) with the Scripture screen's light and bold treatment, the eyebrow "From the room", the quote in light type with its second half bold, and the live step's name under it. It shows the words only. Never the speaker, the scribe, a time or the card's id: the shared room state carries `promoted_quote: { text, session }` and nothing else.

- **It is an overlay.** The live step keeps running and taking answers underneath. Taking the quote down plays the spotlight's reverse and the step is exactly as it was: no blank frame, no reload, no lost answer.
- **One at a time.** Promoting another quote crossfades over the first (the scrim never lifts). Motion comes from the spotlight tokens; reduced motion shows the final state at once.
- **Every screen agrees.** The promotion is part of the room state, so it carries the room version, comes with every snapshot (a TV that reloads or reconnects shows it) and appears in the control surface's and the remote's TV view. Promote and Take down are one press each (`quote_promote`, `quote_take_down`, through `POST /api/control/[id]/quote`), decided under the room lock and moving the room version once. A repeat changes nothing.
- **Who.** The lead and co-facilitators (and admins) of the engagement. Not the scribe, participants, TVs, anon, or a facilitator of another engagement.
- **Where it lives.** On the card (`private.scribe_cards.promoted_session`, `promoted_text`, `promoted_at`, one per engagement), so Reset practice room and Clear test answers, which already put the cards away, clear it with no change to either. The words are copied when it is promoted: a later edit on the scribe console never changes what the room sees.
- **Off, in plain words.** Promote is disabled, with the reason beside it, when nothing is live ("Put a step on the TV first."), during a team-led step ("The team has the room, so a quote can’t go on the TV now."), and for a card with no words. Only quotes can be promoted.
- **Long quotes** wrap at headline size, then shrink until the card fits the screen (never clip), then widen the card, then run in two columns. A 2,000-character quote ends at about 26 px at the default room size and at Medium.

Defaults chosen (flagged for Chris):

| Question | Default |
| --- | --- |
| Do phones show a quote that is up? | No. Phones stay on the live step. (A phone showing the TV view shows what the TV shows.) |
| Can the facilitator trim the words before promoting? | No. The quote goes as the scribe wrote it; trim it on the scribe console, then take down and promote again |
| Can the remote take it down? | Yes. The remote shows the quote while it is up, with Take off the TV |
| What happens when the live step changes while a quote is up? | The quote comes down with the same room version, and does not return if the room goes back. It also comes down when the TV leaves the step (holding, join, screen check), when a Spotlight starts, when a part closes, and on Reset practice room |
| Promote while a Spotlight is up? | The quote replaces it: one thing over the screen at a time |
| Which quotes can be promoted? | Any quote of the engagement while a step is live, even one filed under another step; the feed lists the live step's cards, and the quote on the TV always stays in the feed so it can be taken down |

Code: migration `supabase/migrations/20261106050000_promoted_quote.sql` (it wraps `private.live_public_state` and `private.scribe_state` by renaming each to `..._pre_quote`, and adds a `room_states` trigger that clears the promotion), `supabase/tests/database/promoted_quote.test.sql`, `tests/unit/promoted-quote.test.ts`, `tests/browser/promoted-quote.ts` (`npm run test:promoted-quote`), `components/tv/promoted-quote.tsx`, `components/control/quote-on-tv.tsx`, `lib/quote/promoted.ts`, `app/api/control/[id]/quote`.
