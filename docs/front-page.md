# The front page (HOME-01)

live.clearway.co's front page, built November 3 at Chris's request and modelled on synrg.live and its guide. The PRD's "Surfaces > The front page and room codes" governs.

## What's where

| Path | What it is |
| --- | --- |
| `app/(public)/page.tsx` | The page: the join box, then How it works, the live demo, Ask the room, Wayfinding, In the room, Privacy, and the close |
| `app/(public)/home.css` | Its styles, in Clearway Live tokens only |
| `app/(public)/[code]/page.tsx` | live.clearway.co/CODE. Only a code-shaped segment redirects. Anything else (live.clearway.co/remote) gets the app's not-found page |
| `app/(public)/join/route.ts` | The join box's GET target, so joining works without script |
| `lib/room/join.ts` | One rule for both (`joinTarget`): the room, the practice room, or back to the join box with `status` (empty, unknown, unavailable). `codeShaped` decides which paths count as codes |
| `lib/tv/policy.ts` | `shortRoomLink` (now live.clearway.co/CODE) and `typedRoomCode` |
| `lib/public/demo-room.ts` | The demo's scripts and results, mirroring the database's results functions |
| `components/public/demo-room.tsx` | `DemoRoom` (the TV beside a phone) and `DemoJoin` (the join screen in the hero) |

## How the demo works

- `DemoRoom` builds a `LiveSnapshot` for each scripted answer and offers it to a `TvFlow`, exactly as the TV page does, so arrivals stagger, the newest takes its Lime moment and bars glide. The TV scenes, word cloud and live bars are the production components.
- The phone uses the production phone inputs (`phoneInputs`) for choice, 100 points and scale, and a text form with the phone's own checks for the word cloud. A visitor's answer joins as a ninth phone. One answer per person still holds.
- The demo runs only while it is on screen, cycles through the four kinds until the visitor picks one, and holds longer after the visitor answers.
- Nothing is sent to the server. The word cloud applies the database's key rules and filter in the browser.

## Checks

- Unit: `tests/unit/public-demo.test.ts` (typed codes, word keys, sizes and levels, one answer per person, frames).
- Smoke: `tests/smoke/routes.test.ts` (the page's surface and links, /CODE and /join for known, unknown, empty and practice codes, named routes winning over codes, and the note on the page).
