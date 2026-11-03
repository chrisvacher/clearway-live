# The interaction engine and content screens

Milestone 3, step 1. The room engine now runs any interaction kind, and content screens are built. Migration `interaction_engine`.

## Kinds

`private.interaction_kinds` registers each kind with its rules: whether it takes input, one answer per person, what the TV counts (people or answers), whether it shows an empty structure, whether answers are shared, what Spotlight and Hide address (an answer id or an item key), and whether answers are named (never, always, or a setting). `sessions.interaction` references it, so a session can only use a registered kind. This step registers word cloud, open text and content. The run of show reads the registered kinds from `show_read` and offers only those.

Each kind supplies `parse_`, `results_`, `options_` and `items_` functions, found by name (see `milestone-3-brief.md`). Word cloud and open text keep milestone 2's matching, limits, filter and results exactly; they moved into their own functions.

## Answers

- **Structured answers.** `submissions.value` holds a choice, a value, a ranking, points or a placement. `live_submit` takes it as `p_value`; the kind's parser checks it. The phone sends `{ text, value }` through the same outbox, so offline queueing, order and ids are unchanged.
- **One answer per person.** For such kinds, a submit or change withdraws the person's other standing answers and records `replaced_by`. The event carries `replaced`, so every screen drops them in the same version. Changing an earlier answer brings it back and replaces the later one. Answer limits per person don't apply.
- **Private kinds.** When a kind doesn't share answers, snapshots carry none of its answers and events carry no text or value, only the count. The person still sees their own answers on their phone.
- **Controls by kind.** Bursts, phones down and Open phones work on any kind that takes input. Spotlight and Hide follow the kind's rule; an option key in `options.items` can be spotlit before anyone picks it.

## The TV and phones

- **The count** sits in the bottom right: "8 answering" for one-answer-per-person kinds, "23 answers" for text kinds, number bold, at `tv-body` (pass 3 change 9).
- **The LIVE marker is the Clearway mark** (change 7): Lime while live, Off-White during the newest arrival's Lime moment, Navy on a Lime disc on light screens; the quiet Sky mark for Phones down; the mark beside "Closed" on a closed step. Offline and reconnecting turn it gray and breathing, with no word (change 10); screen readers still hear Offline or Reconnecting. The phone header carries the same mark.
- **The top left carries only the church** (change 8): its logo, or a monogram tile with its name.
- **Markers, chips and counts are squared off** (change 18, `cwl-radius-marker`).
- **Views by kind.** The TV draws each kind from `components/interactions/tv-views.tsx`; text kinds show "Waiting for answers" until the first answer, structured kinds their empty structure.

## Content screens

The run of show's Content screen has a Screen setting and the fields each screen needs (`sessions.options`, checked by `private.options_content`). The prompt is the main text.

| Screen | TV | Phone |
| --- | --- | --- |
| Headline with depth | Optional big number in Sunrise, the session title as eyebrow, the headline, the source | The headline and source, then the depth: paragraphs, quotes (a line starting `> `, with `- source`), and "Read more" sections (`## Title`) |
| Scripture | The passage, reference and translation as three pieces. `**two stars**` marks a bold phrase | The passage to read, with reference and translation |
| Prayer and silence | A still screen, or the prompt as a single line | Phones away |
| Image or document page | The image at its own shape, never stretched, with the room link small in the corner | The same, to zoom |
| Screen check | The full-bleed check, as from the TV page | Fixes for overscan, aspect and blur |
| Holding and walk-in | The session title, "Welcome to {church}" or the prompt, and either a line or the day's outline (one item per line, a time first). Holding texture | You're in, with the line |

The translation defaults from the engagement's Scripture translation when the field is empty. The outline is text the facilitator writes, so planned times never reach the room by themselves.

**Images.** The facilitator adds the image from the run of show (after saving the session once). The browser fits it to a 2400px long edge and sends PNG, JPEG or WebP under 4 MB to `POST /api/run-of-show/:id/media`; `media_write` checks the facilitator, the session and the file's own bytes. `GET /api/media/:id/:media?surface=tv|phone|control` serves it with the caller's own session: facilitators and TVs any step, phones only a step the room has reached. Images live in `private.session_media`, under forced row-level security.

## Tests

- `supabase/tests/database/interaction_engine.test.sql`: the registry and its privacy, a kind added by a test with its own functions (options, structured answers, one per person with replacement, results, Spotlight on an option, bursts), a private kind's answers never leaving the database, content options and the translation default, images by role and by step reached, and invoker wrappers.
- `tests/unit/interaction-library.test.ts`: counts and units, bold phrases, depth, outline, structured values, replaced answers in an event, the phone's one standing answer, images, and the holding texture.
- `npm run test:content`: in real browsers, every content screen goes live on a paired TV and two phones, the image goes in through the run of show editor, and the pass 3 chrome (church, mark, count, Phones down) is checked. `KIT_SHOTS=<folder>` saves the screens.
- Every milestone 2 test still passes unchanged except the `live_submit` signature, which gained `p_value`.
