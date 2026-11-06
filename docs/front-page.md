# The front page (HOME-01)

live.clearway.co's front page, built November 3 at Chris's request and modelled on synrg.live and its guide. The PRD's "Surfaces > The front page and room codes" governs.

## What's where

| Path | What it is |
| --- | --- |
| `app/(public)/page.tsx` | The page: the join box beside a retreat photo with the live screen and a phone, then "New to Clearway Live?" (what it's for, for someone who has only heard their church is using it), How it works, the live demo, Ways to answer, Wayfinding, In the room, Privacy, and the close |
| `app/(public)/home.css` | Its styles, in Clearway Live tokens only |
| `app/(public)/[code]/page.tsx` | live.clearway.co/CODE. Only a code-shaped segment redirects. Anything else (live.clearway.co/remote) gets the app's not-found page |
| `app/(public)/join/route.ts` | The join box's GET target, so joining works without script |
| `lib/room/join.ts` | One rule for both (`joinTarget`): the room, the practice room, or back to the join box with `status` (empty, unknown, unavailable). `codeShaped` decides which paths count as codes |
| `lib/tv/policy.ts` | `shortRoomLink` (now live.clearway.co/CODE) and `typedRoomCode` |
| `lib/public/demo-room.ts` | The demo's scripts and results, mirroring the database's results functions |
| `components/public/demo-room.tsx` | `DemoRoom`: the TV beside a phone the visitor can answer on (`variant="hero"`: the screen and a phone that follows it, cycling on their own) |
| `components/public/home-parts.tsx` | `ThreeScreens` (the stepper), `Gallery` (each interaction on the TV and a phone), `TvShot` and `PhoneShot` frames, `Reveal` |
| `components/brand/live-wordmark.tsx` | The Clearway Live lockup, ported from the design system's LiveWordmark, with its `cwl-wordmark` tokens appended to `live_tokens.css` |
| `scripts/refresh-home-shots.ts` | `npm run home:shots`: rebuilds the app screenshots in `public/home/` from the workshop run in CI |
| `public/home/` | The page's images: real TV and phone screens from the Riverside team workshop run in CI (`team-workshop-screens`), and Clearway retreat photos from the clearway.co site |

## How the demo works

- `DemoRoom` builds a `LiveSnapshot` for each scripted answer and offers it to a `TvFlow`, exactly as the TV page does, so arrivals stagger, the newest takes its Lime moment and bars glide. The TV scenes, word cloud and live bars are the production components.
- The phone uses the production phone inputs (`phoneInputs`) for choice, 100 points and scale, and a text form with the phone's own checks for the word cloud. A visitor's answer joins as a ninth phone. One answer per person still holds.
- The demo runs only while it is on screen, cycles through the four kinds until the visitor picks one, and holds longer after the visitor answers.
- Nothing is sent to the server. The word cloud applies the database's key rules and filter in the browser.

## Checks

- Unit: `tests/unit/public-demo.test.ts` (typed codes, word keys, sizes and levels, one answer per person, frames).
- Smoke: `tests/smoke/routes.test.ts` (the page's surface and links, /CODE and /join for known, unknown, empty and practice codes, named routes winning over codes, and the note on the page).

## Page order (rebuilt November 3, after research on Mentimeter, Slido, AhaSlides, ThoughtExchange and Synrg)

1. Join first: the code box, beside a real retreat photo with the live TV and a phone over it.
2. New to Clearway Live? Four things it helps a team do.
3. A moving strip of retreat photos (paused on hover, still with reduced motion).
4. How it works: everyone sees the big screen, you give input on your phone, the facilitator keeps it moving. A stepper that moves on by itself. Each step runs a live scene on the real screen and phone components (`DemoRoom` variants `tv`, `phone` and `control`): answers arriving, a phone typing and sending an answer, and the facilitator's remote moving the screen to the next step.
5. Try it: the live demo.
6. Numbers.
7. Ways to answer: pick an interaction, see it on the TV and a phone.
8. What changes: easel sheets alone, and with Clearway Live.
9. Wayfinding: each stage with a room photo, then CORE.
10. In the room, with setting up the TV.
11. Privacy, quotes from Team Hub's testimonial library (about planning with Clearway, not the app), questions, and the close.

## Keeping the screens current

The live demos (the hero and Try it) run the production TV scenes and phone inputs, so they change with the app. If an interaction's results gain a field, `lib/public/demo-room.ts` needs it too, since the demo builds its own results.

The gallery uses screenshots. Whenever an interaction's TV or phone screen changes, refresh them in the same pull request:

- After the change is merged to main and CI has passed: `npm run home:shots -- --latest`.
- Or from a downloaded `team-workshop-screens` artifact: `npm run home:shots -- <folder>`.

`homeShots` in the script maps each image to its workshop screenshot. TV shots become 1600 wide WebP, phone shots keep their size. Look at the gallery afterwards, since a redesigned screen may need new alt text in `app/(public)/page.tsx`.
