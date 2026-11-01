# Live board: the word cloud and wall on the TV

Milestone 2, PR 6 implements D1-02 and D1-03: the TV's session screens, with the word cloud (INT-01) and the response wall's answer column (INT-02), built from the approved pass 2 motion (`design/clearway-live/pass-2/docs/motion-spec.md`). It also adds the phone texture carried forward from PR 5.

## Session layers

Each session on the TV is its own layer. When the room goes live on another session, the next layer is prepared behind the current one and cross-fades in over `cwl-dur-make-room`; the old layer keeps its last picture while it fades, so the TV never blanks. Content sessions (D1-02, Scripture and headlines) show the title as an eyebrow and the prompt as a still `tv-headline-xl`, line breaks kept. Word cloud and wall sessions show the prompt, the live board, a quiet "Waiting for answers" until the first answer, and the join strip (room link and a small QR code) when the session's join strip setting is on.

Texture follows the screen type: holding, join and breaks keep the oversized filled mark with glow; live input and content screens carry the glow only, with the LIVE pill top right.

## Counts and sizes come from the server

The database computes every count, square-root size (56 to 168px at room scale 1), level (single, repeated, leader) and, new here, each word's arrival order, once per answer, and broadcasts them with the event. The TV scales those sizes by the room's type scale and only steps every size down together when the words would crowd the space, never below the room's type floor (`cwl-fs-tv-floor`) and never wider than 1280px.

## The word filter

`private.screen_text` screens every answer before it is stored, in every session, so nothing filtered is ever broadcast or reaches the TV. The phone shows "That answer can't go on the screen. Try different words." It catches spaced (f u c k), punctuated (f.u.c.k), repeated-letter (fuuuck), number-for-letter (sh1t, $hit) and starred (f*ck) spellings, words inside other words (bullshit, motherfuckers) and a short list of slurs. Whole-word-only entries keep words such as class, pass, assess, retardant and Arsenal. Scripture language (hell, damn, God) is never screened. One screened part holds the whole send. Phones and anonymous callers cannot call the function, so the vocabulary cannot be probed.

## The arrival flow

`TvFlow` sits between the room stream and the board. An answer event (submit, change or withdraw) whose controls match the frame before it waits its turn: answers that land together are released `cwl-delay-stagger` apart, compressing toward `cwl-delay-stagger-min`, and reach the board in batches no more often than `cwl-delay-stagger`. No answer is held past `cwl-delay-max-hold`. A batch shows the server's own counts and sizes from the version it carries. Controls (phones down, spotlight, hide and unhide, session changes), snapshots and replays after a reconnect land at once with everything still waiting, in one pass. A hidden page lands everything at once. Acknowledgements to the remote still follow committed versions and the original receive times.

Only a lone arrival takes the newest-arrival moment: Lime on the new word (or a Lime bar on the new wall answer) for `cwl-dur-new-hold`, with the LIVE pill in its outline form meanwhile. If a flow begins during the moment, the moment ends at once, so Lime never sits on one item while others stream in. The leader keeps Sunrise.

## The board

- **Word cloud.** Repeated words live in the field: each keeps its own place, larger words are placed first and keep their spot if it is free, and a new word takes the free spot nearest the middle. Nothing re-sorts by rank. Every word glides and grows on one critically damped spring that settles over `cwl-dur-regroup` and never resets its speed when retargeted. Single mentions sit in a row underneath, oldest to newest by the server's arrival order; the row eases left once full and the oldest fade off the left edge. Color: Sky for one mention, Off-White for repeated, Sunrise for the leader (ties share it).
- **Wall.** Individual answers in the right column, newest first, sliding down as one piece; changes replace the text in place, hidden or withdrawn answers fade and their space closes, and unhidden answers return to their old place. Older answers fade at the foot. The main area says "Grouping as answers arrive" until AI groups arrive in milestone 3.
- **Count.** The tally climbs on the same spring, in step with the answers the board is showing.
- **Spotlight.** The Navy scrim rises and the item lifts in a Sunrise block over `cwl-dur-spotlight-on`, with "Spotlight", the word or answer, and the mention count for a word. The leading word takes its normal color meanwhile. Clearing it plays the reverse.
- **Reduced motion.** With the TV's reduced motion setting (or the system setting on phones and mirrors), items take their places at once and arrivals fade over `cwl-dur-reduced`.

The control surface's mirror and the phone's TV view draw the same board at once, without the flow.

## Phone texture

A phone that is waiting, phones down, or on a closed step carries the filled mark's offset pattern (A2) at `cwl-tex-solid`, fading over `cwl-dur-phones-dim`. Phones answering or reading content stay plain Navy.

## Tests

- `supabase/tests/database/word_cloud_wall.test.sql`: the filter's evasions and kept words, no probe access, filtered wall and cloud sends never stored or versioned, server counts, sizes, levels and arrival order.
- `tests/unit/tv-board.test.ts`: 50 answers at once flow in batches no more often than the stagger with no hold past 1.5 seconds; only a lone arrival takes the Lime moment; controls and replays land at once; the spring keeps its speed when retargeted and settles without overshoot or jumps; square-root sizing matches the server; the field plans without overlaps and keeps every word in its place; hides and session changes are controls; a changed answer keeps its place; texture by screen type.
- `npm run test:live`: the broadcast event carries the server's counts, sizes, levels and order, and a screened answer is never broadcast.

The browser check ran the production build against the local stack with a paired TV and eight phones in the practice room. On loopback, single answers reached the TV 69 to 200 ms after Send, and an eight-phone burst spread over about a second as a steady flow. These are not venue acceptance; the practice-room checks remain Chris's milestone 2 acceptance.
