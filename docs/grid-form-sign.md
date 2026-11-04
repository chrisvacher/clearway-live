# The 2x2 grid, the private form and sign together

Milestone 3, step 3. Three kinds on the step 1 engine: INT-08 `grid`, INT-09 `form` and INT-10 `sign`. Migration `grid_form_sign`. Nothing shared is redefined.

## Kinds

| Kind | One per person | Counts | Structured | Shares answers | Spotlight and Hide | Named |
| --- | --- | --- | --- | --- | --- | --- |
| `grid` | Yes | People | Yes | Yes | By item key | Never |
| `form` | Yes | People | Yes | No | None | Never on the screen |
| `sign` | Yes | People | Yes | Yes | By answer id | Always, by design |

Each supplies `options_`, `parse_` (an SQL wrapper over `<kind>_value`), `results_` and `items_`.

## INT-08 2x2 grid

Pass 3 changes 12 and 16 replace the PRD's name-or-pick and place-it screens.

- **Settings.** The two axes and their end labels, a legend title and the items (`options.items = [{key, text}]`). A grid holds ten items at most, so every item keeps its own color from the item palette (`cwl-item-1` to `-10`, by its number). The Axes setting has a Pre-mortem preset: Likelihood (Unlikely to Likely) by Impact, legend "Reasons it failed". Empty lines are dropped; two items cannot share a name.
- **Phone.** The numbered items and the grid on one screen. Tap a number, then tap or drag on the grid; drag a placed dot to move it; placing moves on to the next open number. Arrow keys move the selected dot, Enter places it in the middle. Each placement sends as it is made: the person's whole set (`{places: {key: [x, y]}}`, 0 to 1) rides in one answer, sent again as a change on every placement, so offline placements queue in order like any answer.
- **Server.** `results_grid` computes everything on the screen: for each item its people, its mean position (x and y averaged separately) and, once two people have placed it, each placement for the faint dots, named only by the first eight characters of its answer id.
- **TV.** Exactly one large numbered dot per item at the mean, sized by the people who placed it (from the TV floor's size, never larger than the plot can hold ten of, so a large room size doesn't crowd the plot), plus one faint dot per placement at `cwl-faint` in the item's color. A dot is nudged only as far as needed to stop two items overlapping, and stays inside the plot. Means glide on springs settling over `cwl-dur-regroup`; a dot's first appearance takes the Lime moment. The legend sits beside the plot, two lines at most per item, stopping short of the count; rows that don't fit leave "+ 2 more on your phones", a line that always keeps its room so the legend never resizes under the rows.
- **Duplicates merge** (`grid_control`, from the control surface's Merge into). The duplicate's placements count toward the survivor; a person who placed both counts once, at the mean of the two. Its dot glides into the survivor and fades while the survivor grows; Undo merge brings it back. One step only: a merged item cannot take others. Merges live in `private.grid_merges` (forced row-level security).
- **Spotlight** by item key works before anyone places it: the dot is ringed in Sunrise and the rest step back, in the plot itself (no scrim, so the dot keeps its place on the axes; the grid has no entry in `spotlights.ts`). **Hide** takes the dot and its legend row off the TV.

## INT-09 Private form

- **Settings.** Up to eight questions, answered in words (up to 1,000 characters each).
- **Phone.** The questions, marked Private: "Only the facilitators will read this, with your name. It never shows on the screen." Send privately sends them all; afterwards "Sent privately. Only the facilitators will read what you wrote." Change my answers edits them. The draft survives phones down, a refresh and sleep. Where the phone has the room's presence count it also shows the TV's marks and "6 of 8 answered"; the phone snapshot doesn't carry presence today, so the marks stay off phones until it does.
- **TV (redrawn November 4, interaction rework).** One mark for each person present (`presence.count`, at least the answers), open until they answer, then filled from its centre over `cwl-dur-mark-fill`, in the order answers arrive, never by seat or name. A lone answer's mark takes the Lime moment. "6 of 8 answered", then "All 8 answered", and "Only the facilitators will read what you write. This screen just counts." The marks, count and line are one block centred under the prompt, at least `cwl-tv-moment-gap` beneath it; the marks take the largest size from `cwl-private-mark-max` (144px) down to `cwl-private-mark-min` (16px) in 2px steps that fits, gap 28% of the mark. Someone arriving or leaving adds or removes a mark at the end and the rest make room (FLIP over `cwl-dur-make-room`). Past `cwl-private-marks-max` (500) the count stands alone. No count badges on this screen, since the count is the screen.
- **Privacy, in the database.** The kind does not share answers, so the engine keeps them out of every snapshot and event (text and value are stripped; only the count travels). The facilitator reads them by person on the control surface (`items_form`, through `control_status`, facilitators only). Private answers are not run through the TV word filter: they never reach a screen.

## INT-10 Sign together

Pass 3 change 13 replaces the name tap with a signature field.

- **Settings.** The full text to sign (`options.text`, up to 20,000 characters); `## Title` starts a section phones can expand. The prompt is its title on the TV.
- **Phone.** The text, then a signature field: sign with a finger on the line, the person's name printed under it. Sign stays held until there is ink; Clear wipes the field. After signing the phone shows the signature, with Sign again.
- **Storage.** Stroke paths in a 600 by 200 field, `"M12 34L13 35..."`, whole numbers only, up to 60 strokes and 7,600 characters, checked in `sign_value`. The name is read on the server from the signed-in attendee (`private.room_attendee_ids()`), never from the phone.
- **TV.** The title, each signature with the name under it arriving one at a time in the arrival flow with its Lime moment, and the count. Names hold their places; hiding one fades it and the rest close the gap. When the wall is full and nothing has arrived for `cwl-delay-quiet`, it rolls slowly, one row per `cwl-dur-roll-row`, down to the newest row and back, never jumping. Reduced motion: no roll, the newest in view. Results carry names only; each signature's strokes travel once, with its answer.
- **Controls** (`sign_control`). Close signing on the live step (the TV shows the quiet mark with Closed, phones keep their signature, nothing more arrives; Reopen is the engine's own). Unhide a name through `sign_control` too: it sends the answer back with its strokes in the same version. Spotlight on a name lifts it over the scrim with "Signed" (`spotlights.ts`, `signSpot`).

## Motion

The three TV views are imperative, one per session layer, on step 1's springs (`components/interactions/grid-form-sign/view-base.ts`). Each frame loop sleeps once everything has settled and wakes with the next change, writes only what moved, and reads timing tokens once, so a busy room's TV spends its time on arrivals, not on a still screen. The mirror and the phone's TV view draw from the same views.

## The control surface

`components/interactions/control-items.tsx` lets a kind replace the general list of items: the grid's items with Spotlight, Hide, Merge into and Undo merge; the form's answers by person under Only you see this; sign together's names with Hide from the TV, Unhide and Close signing or Reopen signing. The step's presses go to `POST /api/control/:id/grid-form-sign`. This is a separate registry from step 2's `control-panels.tsx`: a panel adds a section under the general list on the laptop only, while these replace the list itself, on the laptop and the remote alike (the remote is where the board puts Hide a name and Close signing).

## Tests

- `supabase/tests/database/grid_form_sign.test.sql`: the registry, every option rule (ten items, presets, named by design), placements and their limits, one standing set per person, means and faint dots, Spotlight on an unplaced item, Hide, merges with idempotency and by role, the private form never in a TV or phone snapshot, event, table read or the room channel, the facilitator's read, signatures with the server's name, stroke rules and bounds, Hide and Unhide with strokes, Close signing, late queued signatures, Reopen, and the invoker wrappers.
- `tests/unit/grid-form-sign.test.ts`: options and presets, the item palette, the whole set in one answer, next number, results parsing, dot sizes, no overlap with minimal nudges (and 10 items from 50 phones), the private event, strokes, the signature wall, and the presses.
- `npm run test:grid-form-sign`: in real browsers, each kind on a paired TV and three phones through its states (empty, first item, typical, offline and queued, phones down, reduced motion, very long text, pre-mortem axes, duplicates merge, hide, signing closed) with the laptop's own controls, then 50 simulated phones per kind in the practice room: every answer on the TV in under one second on loopback, no dot jumps between frames, the wall rolls once quiet, and the TV's numbers match the server's. `KIT_SHOTS=<folder>` saves the screens.
