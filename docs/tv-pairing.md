# TV page and pairing

Milestone 2, PR 3 implements FAC-04 and the D1-01 join screen.

## The TV comes from the live room (November 16)

- **One button.** In the live room, the live screen's chip says "No TV connected. Open the TV" (or "TV reconnecting. Open the TV"). Pressing it runs the one-click open (`lib/tv/pair-link.ts`): a five-minute, single-use link opens the TV already paired, in the window named `cwl-tv`. Pressing it again reuses that window, so the same button mends a TV that dropped. The pop-up keeps its opener (it only ever shows this app's `/tv` page), because a browser lets the live room at live.clearway.co navigate a window at live.novetera.co only if it opened it. Connected, the chip says "TV is live". The header's Open the TV button does the same.
- **A second computer** at the screen opens `/tv` there and shows a six-digit code. In the live room, Room admin, TV and phones, choose **Use a second computer** and type the code and a name. It is the same pairing as Setup, Screens, which stays as a fallback page.
- **An unpaired TV explains itself:** "Open this screen from the live room with Open the TV. Using a second computer? Type this code in the live room."
- **A TV window whose workshop ended** shows "Workshop ended" instead of a fresh code, for 12 hours, until Open the TV pairs that same window again. The revocation itself is unchanged: End workshop still revokes the pairing and its native session, and Reopen workshop does not pair the old TV. The window remembers the ended engagement in `private.tv_devices.ended_engagement_id`, which clears when the device is paired again by link or code. `tv_device` returns `ended`; a window opened with a pair link claims it as usual.

## Pairing by code

Open `/tv` on the separate screen computer. In the live room choose **Use a second computer**, or in an engagement choose **Screens** in the sidebar, then enter its six-digit code and name the screen. Each code lasts 60 minutes (Chris, November 3; it was five) and is consumed on approval. Multiple TVs can be paired independently.

## Pairing codes and the server's clock

The database alone decides when a code expires, and it replaces a code on the TV's first request after expiry. The TV never shows a code the server would refuse:

- Each pairing reply carries the server's time. The TV measures its offset from that and the round trip, so its own computer's clock does not matter. A TV computer whose clock is 37 seconds slow still retires its code on time.
- The code leaves the screen at the server's expiry, less the round-trip uncertainty and a 250 ms allowance between the app server's and the database's clocks. The countdown reaches 0:00 at that moment. Until the replacement arrives the six code cards stay in place, empty.
- The TV asks for the replacement just after the database's clock passes expiry, then every 200 ms for up to 2 seconds. The new code is on screen within about half a second of expiry on a normal connection, and within a second in the native test.
- While unpaired and failing to connect, the TV retries at least every 2 seconds instead of backing off to 30, and a request that hangs is dropped after 5 seconds. A failing connection can delay a new code but never keeps an expired one on screen.

Codes are not accepted past expiry. There is no grace period.

The timing lives in `lib/tv/pair-clock.ts` and the TV's pairing loop in `lib/tv/sync.ts`, both covered by `tests/unit/tv-pairing-clock.test.ts`, including runs with the TV clock 37 seconds slow and fast and with the network down across an expiry.

The TV has its own persistent HttpOnly device proof and `cw-tv` Auth cookie. Facilitator and participant cookies are never used for TV access. Approval requires the current native Google session, Clearway allowlist and engagement assignment. A server-only, no-email token exchange creates a native identity solely for the approved device and binds its native session to that engagement. Browser clients cannot call that exchange. Pair attempts and anonymous initialization are rate limited, and code hashes remain private.

Reopening the TV page resumes its existing native session. If an expired session must be restored, the device proof can restore only its still-approved pairing. Unpairing or engagement closure revokes the binding and native refresh session, clears pending claims, retires its private topic and requires a fresh approval. Reopening the engagement cannot restore the old TV; Open the TV pairs its window again in one click. A TV cannot read another room, roster emails, attendee identifiers, phone depth, planning fields or presenter notes.

The persistent Navy shell scales a 1920 by 1080 stage uniformly, preserves full screen while following room state, requests screen wake lock where supported and toggles full screen with F. The cursor and up-close controls disappear after inactivity. The browser may require a user gesture for full screen or decline a wake lock. HDMI, mirroring, OS display settings and reading from the farthest seat remain physical acceptance checks.

Preparation controls select holding, join or screen check for all paired TVs. They do not interrupt a live session. Saved room size, Navy/Off-White theme, texture and reduced-motion settings use the shared versioned state. The screen check has overscan corners, safe edges, a true circle and a fixed type ladder. The approved filled Clearway mark is used as texture, and a church logo tile or church-name fallback appears after pairing.

The join screen encodes a public short room alias in a QR code. It redirects to the existing room sign-in flow and grants no access. Only first names appear, at most 14 plus a remaining count. Multiple devices for one attendee count once. Participant arrival notifications run after the identity transaction commits, avoiding a device-to-room lock inversion. TV heartbeats reconcile missed arrival notifications. Matching presence checks do not increment the room version.

The TV uses the existing private Realtime stream, five-second snapshots and 1.5-second fallback. On disconnect it keeps its last frame and shows the quiet Reconnecting mark. Names fade in and existing positions ease from their current position. Acknowledgements follow committed TV versions, with original per-answer receive times retained through serial/batched retries. No token or room data is stored in browser local storage. Full word-cloud and wall renderers remain in PR 6, and live-session controls remain in PR 4.

## Verification

`npm run check` covers application checks. CI replays and lints the migration, runs the role matrix, and executes `npm run test:tv` against disposable loopback Auth, Postgres and private Realtime. The TV integration verifies code expiry, a replaced code reaching a TV with a slow clock within a second, approval, two screens, browser-client resume, first-name arrivals, duplicate-device counting, private data isolation, per-answer timestamps, cached-channel revocation, display settings and closure/reopen. HTTP tests exercise the real SSR SDK cookie namespaces and code-exchange endpoints. Native fixture clocks and transport probes do not establish venue latency acceptance. No production TV pairing, Auth session, attendee or email is created by automated checks.
