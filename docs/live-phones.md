# Live phones: the participant's phone in the live room

Milestone 2, PR 5 turns the signed-in room page, `/room/[engagement]`, into the live phone. Signing in is unchanged. Once signed in, the phone takes the whole screen and follows the room.

## Following the room

The phone follows the same room state as the TV, through `GET /api/live/[engagement]?surface=phone` and the private realtime channel, with the snapshot check and fallback from PR 1. It also reads its own view, `GET /api/live/[engagement]/mine`, which calls `phone_room`: the steps the room has reached (`shown_at` set, so never ahead), with prompts and phone depth filled with the horizon years, and the person's own answers. Nothing about anyone else, no presenter notes, no planning times. It reloads that view when the room moves, after an answer settles, and every 15 seconds.

## Phone states

| State | What the phone shows |
| --- | --- |
| Waiting | The church's name, "You’re in, {name}." and "Watch the screen. Questions will appear here." |
| Live, input open | The prompt, phone depth under "More detail", the quiet burst countdown if one is running, "Who sees my answers?", the person's answers with Change and Withdraw, and the input with its limit |
| Live, phones down | The prompt and the person's answers, dimmed, with "Phones down". A draft stays on the phone |
| Content | The headline with its detail underneath |
| Earlier step, still open | The step's title with "still open", its prompt and the person's answers, with input |
| Session closed | The person's answers, read-only, with "This step is closed. Your answers are kept." |
| Offline | Input still works. Each unsent answer shows "Saved on this phone" and the header shows Offline, then Reconnecting while the queue drains |
| TV view on phones | The TV view above the input |
| New phone | A one-time line that the person's earlier answers are here |

The header carries one marker, in this order: Offline, Reconnecting, TV view, Phones down, Live.

## Looking back, never ahead

Earlier and Later page through the steps the room has reached; Back to now returns to the live step. When the room moves, the phone follows unless the person is typing an answer to an earlier step. Phones down and bursts lock only the live step: an earlier step in the same segment takes answers until the room leaves the segment or the day closes (PR 4).

## Sending

Each answer gets its id on the phone. Change sends the same id with the next revision, and Withdraw sends the next revision with no text. Every send, change and withdraw goes through the phone's outbox in `localStorage`: one at a time, in the order written, with the same id, revision and times on every retry, backing off with jitter. A server error or a lost connection keeps the entry and retries; a settled outcome (accepted, duplicate, closed, limit, filtered, invalid) is never retried, and a refusal stays on the answer as "Not sent" with the reason until dismissed. An answer that had to wait carries `queuedAt`, so the 2-minute grace window applies after a close.

Limits hold Send and say why, never cutting an answer: a word cloud takes up to 5 answers separated by commas, each within the word and character limits; a wall answer is counted in characters. Every send counts toward the session's limit, including withdrawn answers, as on the server. Drafts are kept per step on the phone, so phones down, a refresh or sleep keeps them. Refresh phones reloads the page; drafts and the outbox survive it.

## Tests

- `supabase/tests/database/live_phones.test.sql`: reached steps only, filled years, own answers only, no notes or other people's data, other rooms and the TV denied.
- `tests/unit/phone.test.ts`: limits, send counting, answer status, settled outcomes, outbox order and retries, reload and offline.
- `tests/smoke/routes.test.ts`: `/mine` needs the room's own cookie.
