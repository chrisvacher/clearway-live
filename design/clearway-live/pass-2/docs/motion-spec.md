# Clearway Live motion specification · design pass 2

Milestone 2: the live room. This is the written spec Codex builds the TV's motion from. Durations, easing and delays are the Clearway Live tokens in `design-system/clearway-live/live_tokens.css`; this document never introduces a value of its own. The playable reference is `motion-review.html`; its engine is `pass-2/live-room.js`.

The PRD wins on behaviour, the design system wins on look. Where this spec and the PRD differ, raise it with Chris.

## The rule every movement serves

The TV page loads once and never reloads, refreshes, blanks or waits for a reveal. It renders from the room state and animates from what it is showing now to the next state. A new layout is never swapped in: positions animate by FLIP (measure, change, invert, play), sizes by CSS transition, colors by transition.

- New input appears first; grouping, crowding and AI rearrange it afterward.
- Missing a version means fetching a snapshot and animating the difference. A snapshot that matches changes nothing on screen.
- Every movement has a still equivalent for reduced motion (phones follow the system setting; the TV has its own setting).
- Motion never carries meaning alone: every state also has a word, an icon or a size.

## Evolving, not redrawing (changed October 30)

Chris saw the first version as abrupt and herky-jerky: each update started a fresh glide that threw away the speed of the one still running, and words re-wrapped into new lines, so items lurched, stalled, restarted and crossed each other. The TV now evolves in place.

**The field (word cloud anchors, the wall's group labels).** Each item keeps its own place on the screen instead of sitting in wrapped lines.
- On every update the field plans a clean arrangement in which nothing overlaps. Larger items are placed first and keep their spot if it is still free; anything that no longer fits moves to the nearest free spot; a new item takes the free spot nearest the middle. Nothing re-sorts by rank.
- Every item glides to its place, and grows or shrinks, on one critically damped spring that settles over `cwl-dur-regroup` (1200ms, the "slower, calmer" duration). A new target bends the motion already under way; it never resets an item's speed.
- New items fade in over `cwl-dur-make-room` (700ms) from 8px low at 92% size. Removed items fade where they stand.
- If the items would crowd the space, every size steps down together, never below the 36px floor.
- Measured in this browser on the 50-answer run: no item ever jumps (speed change over 4px in a frame: 0 on the cloud, 6 on the wall, down from 227 and 719), and nothing overlaps once settled. Items can still pass each other briefly while gliding.

**The answer column (wall).** Answers arrive at the top and the whole column slides down as one piece on the same spring, so rows never overlap; new rows fade in, hidden rows fade and their space closes smoothly, and older answers fade out at the foot.

**The single-mention row (word cloud).** One row that slides as a unit: new words join at the right, the row eases left once full so the newest stay in view, and the oldest fade off the left edge.

**The count** climbs on the same gentle spring rather than restarting a tick with every batch.

**Reduced motion:** items take their places at once; arrivals fade over `cwl-dur-reduced` (150ms).

**Reference implementation:** `Field`, `Feed` and `Chips` in `pass-2/live-room.js`. Codex can port them or use an equivalent, as long as layout is planned without overlaps, items keep their places when they can, and retargeting never resets an item's velocity.

## The response wall (changed October 30)

Chris asked for this layout. The fill colors on the old wall carried no meaning and invited people to look for one.
- **Main area:** the AI's groups as 1 to 3 word theme labels, every label on the same fill (Royal, Off-White text, 36px bold or larger), each with its answer count, sized by how many answers it holds. One "AI grouped" marker heads the area.
- **Right column:** individual answers, newest first, scrolling down.
- AI never sits between a phone and the screen: an answer lands in the column first; the groups update as their own event a moment later (at most every 800ms while answers flow) and rework themselves as answers keep coming.
- Until a group forms, or with AI off, the main area says "Grouping as answers arrive" and the column carries the room.
- Milestone 2 builds the column; the groups arrive with AI in milestone 3 (INT-02). The review simulates the grouping with fixed themes.

## Movements

The table below gives the original token for each movement. On the wall and word cloud, Arriving, Making room, Swelling and Hide are now drawn by the field, column and row above, and Wall steps down no longer applies.

| Movement | Trigger | What moves | Duration | Easing | Delay rule | Reduced motion |
| --- | --- | --- | --- | --- | --- | --- |
| Arriving | An answer is released to the TV | The new item, from 0 opacity, 12px low, 92% scale | `cwl-dur-arrive` 500ms | `cwl-ease-arrive` | Steady flow (below) | 150ms fade in place (`cwl-dur-reduced`) |
| Making room | Any item arrives, leaves or changes size | Every neighbour, from its old position to its new one (FLIP) | `cwl-dur-make-room` 700ms | `cwl-ease-signature` | Starts with the arrival | Instant reflow |
| Swelling | A word's count rises | Font size (square root of count, 56 to 168px) and color together; neighbours make room | `cwl-dur-swell` 400ms | `cwl-ease-signature` | Color shift starts with the swell (`cwl-delay-swell-color` 0ms) | Instant |
| Newest arrival | A lone item lands (see below) | Lime ring (wall) or Lime word (cloud); the LIVE marker takes its outline form meanwhile | Held `cwl-dur-new-hold` 1200ms, settles over `cwl-dur-settle-color` 600ms | `cwl-ease-signature` | Never during a flow | Lime with no transition |
| Count tick | Any accepted answer | The tally number counts to its new value | `cwl-dur-count` 400ms | ease out | With the item | Changes in place |
| Spotlight on | Facilitator spotlights an item | Navy scrim rises; the item lifts from 94% scale and 4% low in a Sunrise block | `cwl-dur-spotlight-on` 600ms | `cwl-ease-calm` | Scrim and item together | Instant |
| Spotlight off | Facilitator clears it | The reverse | `cwl-dur-spotlight-off` 500ms | `cwl-ease-calm` | Together | Instant |
| Hide | Facilitator hides an item | The item fades and shrinks to 96%; then neighbours close the gap (FLIP) | `cwl-dur-hide` 400ms | `cwl-ease-exit` | Neighbours start `cwl-delay-make-room-after-hide` 200ms after the hide | 150ms fade, instant reflow |
| Unhide | Facilitator unhides | The item arrives back at its old index; neighbours make room | As Arriving | As Arriving | None | As Arriving |
| Phones down (TV) | Phones down | The LIVE marker cross-fades to a quiet Phones down pill. Nothing else moves | `cwl-dur-phones-dim` 300ms | `cwl-ease-signature` | None | Instant |
| Phones down (phone) | Phones down | Text and cards ease to `cwl-text-muted` and the track color (never opacity on text); the offset pattern (A2) fades in; the Phones down line appears; Send locks | `cwl-dur-phones-dim` 300ms | `cwl-ease-signature` | None | Instant |
| Reconnecting mark | TV loses its connection | A 24px `tv-upclose` mark with `refresh-cw` fades in bottom right. The TV keeps its last state | `cwl-dur-arrive` | `cwl-ease-signature` | None | Instant |
| Restore | Connection returns | Missed answers arrive in one pass from the last state; the Reconnecting mark fades out | As Arriving and Making room | As those | Replay is exempt from the stagger | As those |
| Session change | Go live, Next, Back, Nothing live | The next session is prepared behind the current one and cross-fades in; the old layer fades out | `cwl-dur-make-room` 700ms | `cwl-ease-signature` | Both layers overlap for the whole fade, so the TV never blanks | 150ms cross-fade |
| Wall steps down | Wall is crowded and nothing is arriving | Older cards step from `tv-body` to the `tv-floor` size with a uniform-scale FLIP; the oldest retire | `cwl-dur-make-room` 700ms | `cwl-ease-signature` | Waits until the flow has been idle 900ms; retiring cards use Hide | Instant |

## The arrival flow

`ClearwayLive.ArrivalFlow` (in `bundle.js`) decides when each answer is released; `pass-2/live-room.js` decides how released answers reach the screen.

- When several answers arrive together, the flow releases them `cwl-delay-stagger` (120ms) apart, compressing toward `cwl-delay-stagger-min` (30ms) as the queue grows.
- **The TV applies released answers in batches no more often than `cwl-delay-stagger` (120ms):** one reflow, one swell and one count tick per batch, never one per answer at 30ms. A batch flushes early if its oldest answer is within 100ms of the hold limit. (Changed October 30 after Chris saw a strobe effect at 30ms updates.)
- Never hold an answer more than `cwl-delay-max-hold` (1500ms) after the TV receives it.
- Answers replayed after a reconnect are exempt: they land in one pass.
- With 50 answers at once, holds rise evenly from about 0 to just under 1,500ms. The tail runs close to the limit by design. If the practice room shows a hold at the limit, raise it with Chris before changing `cwl-delay-stagger-min`.

## The newest-arrival Lime during a flow

- Only a **lone** arrival takes the newest-arrival Lime: nothing else arrived within `cwl-dur-new-hold` (1200ms) and nothing is queued.
- During a flow, no answer takes it, so Lime never hops from item to item and the LIVE marker stays steady in its filled form. (Measured on the 50-answer run: Lime changes went from 83 to 0, LIVE marker flips from 28 to 0.)

## Word cloud (INT-01, D1-03)

- Repeated answers live in the field (above); single mentions in the row underneath.
- Size: `56 + (168 − 56) × (√count − 1) / (√max − 1)` px, never wider than 1280px, stepping down together if crowded.
- Color: Sky (one mention), Off-White (repeated), Sunrise (the leader; ties share it), Lime for a lone arrival's moment.
- Rank shows by size and color only; words don't re-sort.

## Color moments while moving

- Lime: one moment per screen. Priority: Confirm > burst progress > newest arrival > LIVE marker. While a newest arrival has Lime, the LIVE marker takes its outline form (`screenTexture` handles this on input screens).
- Sunrise: one moment per screen. Priority: spotlight > leading answer > key number. While a spotlight is on, the leading word or bar uses its normal color (`.has-spot` in `pass2.css`).
- Lime and Sunrise never sit side by side: keep `cwl-tv-moment-gap` (48px) between them.

## Decisions for this pass (Chris, October 30)

- **Default TV screen: dark (Navy).** The TV theme stays a setting on the engagement; new engagements start dark. Every pass 2 frame uses it.
- **The church on the TV: the church's logo beside Clearway's.** On every TV screen after pairing, the top left carries the Clearway mark, a hairline, then the church's logo on an Off-White tile at the mark's 56px height (`.p2-lockup` in `pass2.css`, `ClearwayLivePass2.lockup()`). With no logo on file, the church's name sits in the tile. Before pairing, the TV shows the Clearway mark only. The lockup is still; it never animates with the room.

## Phones

- Send shows Sent at once (optimistic). Sent is not Lime.
- Offline, every unsent answer says Saved on this phone; on reconnect they send one at a time, in the order written, with backed-off retries, and each turns to Sent in place.
- A phone follows the room and never runs ahead; it returns to the live session unless the person is typing.

## Pass 2 additions to the design system (in `pass-2/pass2.css`)

1. **Nesting guard.** A TV or phone drawn inside an app surface (the control surface's TV mirror, the remote's mirror) keeps its own theme and its live-only colors. App surfaces set Sunrise to `initial` and the base light rules are written `[data-surface][data-theme="light"] .x`, which also match an ancestor; the guard re-declares the room surfaces' tokens from base values. Fold this into `live_tokens.css` and `bundle.css` when the design system next changes.
2. Spotlight outranks the leader (`.has-spot`).
3. Pairing code, screen check, marker slot (LIVE and Phones down cross-fade), Reconnecting mark, control surface layout, remote countdown and preview, run of show form and the printed run of show.
4. `strong` stays at 700, since Plus Jakarta Sans ships 300 to 700 here.

No new tokens. No raw hex values. Facilitator-only tokens appear only under `[data-surface="control"]`.

## What the simulation does not prove

The review measures how long the TV holds each answer after receipt in the viewing browser. It does not measure phone-to-server or server-to-TV time. The milestone 2 test does that from the latency log: 95 of 100 submissions under 1 second with 50 phones, on the practice-room TV computer.
