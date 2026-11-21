# Design pass 11: room fixes after Pickering

Brief for Codex. Decided by Chris on November 20, 2026, after the Pickering Pentecostal workshop (Novetera skin) and the debrief. Hope Oakville runs on the Novetera skin on November 24, so everything here must work in the room, on real devices, without a refresh.

Read `AGENTS.md` first and follow it, especially "The screen is alive": nothing on the TV redraws, blanks or waits for a reveal; everything moves from its current state to the next. Then read `docs/prd.md` for the surfaces and `docs/project-status.md` for what is built.

## The design

Chris approved a design canvas (30 artboards) that you can't open, so it is in this repository:

- `docs/design-pass-11/screens/<name>.png`: each artboard rendered at its real size.
- `docs/design-pass-11/boards/<name>.html`: each artboard's source as a plain HTML page. Open it in a browser or read the CSS for exact sizes, spacing and colours. The colours in these files are written as hex values for the canvas; in the app use the matching tokens from `design/clearway-live/live_tokens.css` and the skin files. Never paste a hex value into a component.

The artboards use sample content (Hope Oakville, sample answers). Build the behaviour and layout, not the sample words.

| Artboard | What it shows | Size |
| --- | --- | --- |
| `Main` | TV: Q&A step, join frame on, Novetera | 1920 x 1080 |
| `TvFrameOffNv` | TV: the same step before the frame comes in, Novetera | 1920 x 1080 |
| `TvFrameOnCw` | TV: word cloud, join frame on, Clearway | 1920 x 1080 |
| `FrameMotion` | Join frame: how it moves | 1920 x 620 |
| `LiveTransport` | Live room: Frame in the transport bar, on | 1440 x 620 |
| `RemoteFrame` | Remote: Frame | 390 x 844 |
| `LivePrivate` | Live room: switched to private while live, results for facilitators | 1440 x 800 |
| `TvPrivateNv` | TV: after switching to private, Novetera | 1920 x 1080 |
| `TvScaleNv` | TV: 1 to 10 as the phone slider, Novetera | 1920 x 1080 |
| `TvScaleCw` | TV: 1 to 10 as the phone slider, Clearway | 1920 x 1080 |
| `PhScaleNv` | Phone: 1 to 10 slider, sends on release, Novetera | 390 x 844 |
| `PhScaleCw` | Phone: 1 to 10 slider, sends on release, Clearway | 390 x 844 |
| `PhChoiceNv` | Phone: poll, a tap sends, Novetera | 390 x 844 |
| `PhRankNv` | Phone: ranking, saves on each change, Novetera | 390 x 844 |
| `TvScaleNpsNv` | TV: 1 to 10 with NPS-style bands, Novetera | 1920 x 1080 |
| `TvScaleNpsCw` | TV: 1 to 10 with NPS-style bands, Clearway | 1920 x 1080 |
| `RosVideo` | Run of show: a Video step | 1440 x 860 |
| `LiveVideo` | Live room: Video step controls | 1440 x 440 |
| `TvVideoNv` | TV: Video step playing, Novetera | 1920 x 1080 |
| `PhVideoNv` | Phone: during a Video step, Novetera | 390 x 844 |
| `PhVideoCw` | Phone: during a Video step, Clearway | 390 x 844 |
| `RosBeforeAfter` | Run of show: a Before and after step | 1440 x 760 |
| `TvBeforeAfterNv` | TV: Before and after, Novetera | 1920 x 1080 |
| `TvBeforeAfterCw` | TV: Before and after, Clearway | 1920 x 1080 |
| `PhBeforeAfterNv` | Phone: Before and after when it reads two scale steps, Novetera | 390 x 844 |
| `PhBeforeAfterPairedNv` | Phone: Before and after asked together, Novetera | 390 x 844 |
| `LapTextNv` | Laptop: open text, Novetera | 1280 x 800 |
| `LapChoiceCw` | Laptop: poll, Clearway | 1280 x 800 |
| `EventsDuplicateMenu` | Engagements: Duplicate run of show in the row menu | 1440 x 460 |
| `EventsDuplicateDialog` | Duplicate run of show: choose where it goes | 1440 x 900 |

Where an artboard and this brief disagree, this brief wins. Where something isn't drawn, follow the existing design system and the nearest drawn screen.

## Rules for every part

- Every room-facing screen works in both skins (Clearway and Novetera), both TV themes, every room size, and with reduced motion.
- The control surface and remote stay Clearway Live styling in every skin (decided November 13). Go live stays Navy with the Orange icon tile (November 19). Orange is for Go live only.
- Sunrise (`--cwl-callout`) is one moment per screen and never within `--cwl-tv-moment-gap` (48px) of Lime or the live mark.
- Phone to TV stays under one second for 95 in 100 answers. Every change in the room reaches the TV, phones, control surface and remote through the existing room state and broadcast, never by polling or a page refresh.
- Copy: sentence case, plain words, buttons start with a verb, no em dashes or en dashes anywhere.
- Keep every existing behaviour working. In particular: steps stay open after the room moves past them (November 16), hide a response, timers, images and the image loop, the per-engagement skin, open joining and link names, Preview and Go live, the run list shows Preview and Go live only on the hovered or focused row (November 19), the small-room word cloud and open text (handoff 13).
- Database work goes in new migrations in `supabase/migrations/`, following the rename-and-wrap pattern the recent migrations use (for example `20261120160000_step_visibility.sql` wraps `private.session_options`). Every new table has row-level security, and every new function revokes access from `public`, `anon` and `authenticated` the way the existing ones do. Never touch Team Hub or CORE.

There are eight parts. Build them in this order, committing to `main` after each part passes its checks.

---

## Part 1. Who sees answers, changeable while a step is live (VS-1)

Today `components/run-of-show/session-form.tsx` disables the Who sees answers select once a step has run (`running`), and the live room has no way to change it. Since steps stay open, that locks the setting on every step the room has seen. At Pickering, the "Ready after today" scale was set to private by mistake and Chris couldn't fix it in the room.

**Behaviour**

1. In the live room, the step controls for the live step (and the selected step in the run list, if the step panel shows one) get a segmented control: label "Who sees answers", options "Everyone" (eye icon) and "Facilitators only" (lock icon). See `LivePrivate`. It shows only for kinds where `canBePrivate(kind)` is true and `alwaysPrivate(kind)` is false (`lib/interactions/visibility.ts`). The form stays always private and shows no control.
2. It works in every state: draft, ready, open, live, closed. It changes only `options.visibility` through the same server path the run of show uses (`show_write`), and nothing else about the step.
3. The server must accept a visibility-only change on a step in any state, while every other edit keeps today's locks. If `show_write`'s save path refuses edits to a running step, add a dedicated action (for example `p_action='visibility'` with `{session, visibility}`) that checks facilitator access, changes only that key through `private.session_options`, and refuses every other key.
4. The database already recounts a live step when its visibility changes (the trigger in `20261120160000_step_visibility.sql`), so the TV and phones redraw from the room state. Confirm this end to end: switching to Facilitators only must remove every answer value from the TV, the phones and the broadcast within one second; switching back must bring them in.
5. After the change, show a toast on the control surface with Undo for 8 seconds:
   - To private: "Answers on {step title} are now private. The TV and phones show the count only."
   - To public: "Answers on {step title} now show on the TV and phones."
   Undo sets it back.
6. The same control goes on the phone remote (`components/control/remote.tsx`) under the live step, as two buttons in the remote's style.
7. In `session-form.tsx`, remove the `running` lock from the Who sees answers select (keep the `alwaysPrivate` lock and the seeded-from-private rule). Update its help line so it no longer implies the setting is fixed.
8. The run list in the live room shows the existing `PrivateTag` on every private step. Check it shows in the narrow run list.

**Motion on the TV:** public to private, the results fade out on `--cwl-dur-hide` with `--cwl-ease-exit` while the private count screen (`TvPrivateNv`: the count large, "answers in", and the lock line) fades in on `--cwl-dur-arrive`. Private to public, the reverse, with the results arriving with their usual arrival motion. No blank frame between.

## Part 2. Results for facilitators on a private step (VS-2)

At Pickering, Chris could see neither the average nor the spread on a private step from the live room. The live monitor mirrors the TV, which shows only the count.

**Behaviour**

1. When the live step is private, the live room shows a Results card beside the live monitor, as drawn in `LivePrivate`: header "Results" with a "Facilitators only" lock chip, then the step's facilitator results. It reads the facilitator data the control route already returns (`app/api/control/[id]/route.ts`, which shows every answer), never the public room state.
2. What it shows, by kind:
   - Scale: the average large (one decimal), "average of N answers", one column per value from 1 to the maximum with its count above it, and the end labels below. With NPS-style bands on (part 4), also the score and the three band counts.
   - Multiple choice, ranking, 100 points, statements, 2x2 grid: the facilitator view of the bars these kinds already have (reuse `components/interactions/bars/control-bars.tsx` and the grid control view).
   - Word cloud, open text, Q&A, form, sign: the existing responses list, which already shows every answer.
3. It updates live as answers arrive, with the same motion as the TV boards (columns grow on `--cwl-dur-bar-grow`, the average slides on its spring).
4. The remote shows a compact version: the average and count for a scale, the top three bars for bar kinds, the newest five answers for text kinds.
5. For a public step, the card is not needed (the live monitor shows the results), but the live room may show it if that is simpler. It must never appear on the TV or phones.

## Part 3. The join frame (FR-1)

At Pickering, Chris had to leave a step to show the join screen again, and repeated the address several times. The frame brings the join link and QR code onto the TV without leaving the step.

**Behaviour**

1. A new room state flag, `join_frame` (boolean, default false), in `public.room_states`. Include it in the room snapshot and broadcast (the latest `private.live_public_state`, currently in `20261116130000_timers.sql`, and the snapshot and broadcast functions that `20261120160000_step_visibility.sql` patches), and in `lib/live/types.ts`. Add a `room_control` action `join_frame` with `{on: boolean}` (the latest `private.room_control` is in `20261116150000_steps_stay_open.sql`). Turning it on or off bumps the room version like every other control.
2. The control surface transport bar gets a toggle button after Join: icon a frame (a rectangle with a bar along its bottom), label "Frame", keyboard key F with the key hint, `aria-pressed`. While on it reads "Frame on" and uses the pressed style drawn in `LiveTransport` (pale blue fill, blue outline). Keep the existing labels and order of the other buttons (Back, Go live, Next, then Blackout, Join, Frame, Home).
3. The remote gets the same toggle beside Blackout, Join and Home (`RemoteFrame`), with the help line "Frame keeps the join link and QR code along the bottom of the TV across steps until you turn it off."
4. The frame stays on across steps, Preview, Go live, Back and Next, until turned off. It is hidden (not turned off) while the TV shows the Join screen (it would repeat it) or Blackout, and comes back when the TV leaves them. Closing or ending the workshop turns it off.
5. The frame shows the same join link as the Join screen and the join strip in `components/tv/tv-scenes.tsx`: the link name address when the engagement has one, otherwise the room code address, written without `https://`. The QR code encodes the full address. It follows the engagement's skin.
6. Phones are not affected.

**Look (at 1920 x 1080; scale with the TV stage like everything else)**

- A full-width bar at the bottom of the TV, 216px tall, edge to edge (no side margins). Background: the skin's light card surface (`--cwl-surface-card`: Off-White in Clearway, Chalk in Novetera); text in the card's text colour.
- Left, inside 96px padding: "Join on your phone or laptop" at 36px, weight 600, 78% opacity; under it the address at 92px, weight 800, letter-spacing -0.015em, with the host (for example `live.novetera.co`) at 62% opacity and weight 600, and the path (for example `/hope`) at full strength.
- Right, inside 96px padding: "or scan" and "the code" on two lines, right aligned, 34px, weight 600, 78% opacity; then 32px gap; then the QR code, 176px square on white with 10px padding and the skin's chip radius.
- The step's content does not sit under the bar. While the frame is on, the TV's content area ends 32px above the bar, and every board fits itself into the smaller space with its existing fitting: headlines step down to the next size, lists tighten, the word cloud and walls refit. Nothing is clipped and nothing is covered. Compare `TvFrameOffNv` and `Main`: the same Q&A step keeps all four questions.
- Image steps on Fill, the image loop and Video steps fit into the space above the bar (letterboxed on the skin's ground), so the bar never covers them.

**Motion** (`FrameMotion`)

- On: the bar slides up from below the bottom edge on `--cwl-dur-make-room` with `--cwl-ease-signature`. At the same time the content area shrinks and every board moves to its new layout on its existing spring (FLIP), never a redraw. 200ms after the bar starts, the QR code fades in and scales from 0.96 to 1 on `--cwl-dur-arrive` with `--cwl-ease-arrive`. The address is readable as soon as the bar lands.
- Off: the reverse. The QR code fades first, then the bar slides down while the content grows back.
- Reduced motion: the bar and the new layout appear and go at once.

## Part 4. A 1 to 10 scale on the TV that matches the phone (SC-3)

Today `LiveScale` in `components/interactions/bars/tv-bars.tsx` draws the average large with columns beneath. On the phone, a scale above 7 is a slider (`ScaleInput` in `phone-bars.tsx`). At Pickering the two didn't read as the same thing. The TV now draws the same track as the phone slider, with one dot per person. Use this TV layout for every scale (sliders and button scales alike), so scales always look the same.

**Look** (`TvScaleNv`, `TvScaleCw`)

- Header as today (church, counts, live mark), eyebrow and headline on the left at the existing type ramp (72px in the drawing, fitting down if long). Top right of the headline row: the average at 132px, weight 800, tabular figures, in the text colour, with "average" and "of N" on two lines beside it at 44px in the muted colour. No average yet: "No answers yet" in the muted colour.
- The plot is 1680px wide, centred. Along the bottom, the track: a 16px rounded bar in `--cwl-bar-track`, with a 28px circle at each value (the surface colour with a 4px inset ring in the strong border colour), evenly spaced from 1 to the maximum.
- Under the track, the numbers at 54px, weight 700, centred under each circle; under them, the end labels at 38px in the muted colour ("1 · {low label}" left, "{max} · {high label}" right).
- Above the track, one dot per answer: 76px circles in `--cwl-bar`, stacked upward from just above the track with a 14px gap, centred on their value.
- The newest answer's dot shows in the live colour for `--cwl-dur-new-hold`, then settles to `--cwl-bar` (the existing newest-arrival moment).
- The average: a 4px dashed vertical line in `--cwl-callout` from the track to the top of the plot, at the average's position along the track. It slides on the same spring the current average marker uses. Keep it at least `--cwl-tv-moment-gap` from a dot in the live colour: if they would be closer, delay the Lime moment rather than move the line.

**Crowding:** with more answers than fit, dots shrink (down to 36px at the very small room size's floor), then the stacks switch to columns with the count above each, using the existing column motion. A dot never overlaps another dot or the headline.

**Motion:** a new dot fades and grows in at the top of its stack on `--cwl-dur-arrive`; a changed answer moves its dot from the old value to the new one on the spring (the person moved their slider); a hidden or withdrawn answer's dot fades out and the stack settles.

### NPS-style bands (an option on scale steps)

For a "would you recommend" question. Chris chose to keep 1 to 10 (no 0 to 10 mode), so the app calls it "NPS-style".

- A new option on scale steps with a maximum of 10: "Show NPS-style bands" (off by default), in the run of show options for scale steps. It is stored in `sessions.options` and validated in the scale options function.
- With it on (`TvScaleNpsNv`, `TvScaleNpsCw`), three bands sit behind the dots, from the plot's top to just under the track, with the skin's card radius: 1 to 6, 7 or 8, and 9 or 10. They differ in lightness only (the text colour at about 3%, 7% and 13% opacity on dark; the matching steps on light themes), never by hue.
- At the top of each band: its count at 56px, weight 800, in the text colour, and its label ("1 to 6", "7 or 8", "9 or 10") at 38px in the muted colour.
- The headline number becomes the NPS-style score instead of the average: round(percent of answers at 9 or 10 minus percent at 1 to 6), shown with its sign (`+55`, `-10`, `0`), at 112px, with "NPS-style" and "score" on two lines beside it. No dashed average line when bands are on.
- The facilitator Results card (part 2), the results page and the CSV show the score and the three counts as well as the average.
- The step can still be private: then the TV shows the private count screen as it does today, and only facilitators see the score.

## Part 5. Answers that send themselves (AS-1)

Chris wants every interaction that can drop its Send button to drop it: a selection sends at once, and people can always change it.

**Behaviour** (`PhScaleNv`, `PhChoiceNv`, `PhRankNv`)

1. Multiple choice, pick one: a tap sends. Tapping another option sends the new choice.
2. Multiple choice, pick any: each tap toggles and the set sends after 600ms with no further taps.
3. Ranking: every change (add, remove, move up) sends the current order after 600ms with no further changes. Partial rankings count, as today.
4. Scale: unchanged for sliders (sends 600ms after it comes to rest) and buttons (a tap sends). Change the slider's help line to "It sends when you let go." and its sent line to "Sent. Slide again to change it."
5. Statements, 2x2 grid and 100 points: send on each completed change (a tap, the end of a drag, or a valid allocation), 600ms after the last change. For 100 points, an allocation that doesn't add up to the budget isn't sent; the status shows how many points are left.
6. Keep Send for anything typed (word cloud, open text, Q&A, form, the Wayfinding text kinds) and for signing. Leave the Wayfinding process kinds (lens, four lists, candidates, goals, intent, bullets, confirm, read-back, lens summary) as they are.
7. Every automatic send goes through the phone's existing outbox, so offline, retry, "Saved on this phone" and the one-answer-per-person replacement keep working. The status line under the input shows the answer's state as today. The sent wording is "Sent. Tap another to change it." for choice and "Saved as you go. Partial rankings count." for ranking.
8. A send never fires for an unchanged answer, and rapid changes never produce more than one send per 600ms quiet period.

## Part 6. The participant screen on phones and laptops (RP-1)

At Pickering, older participants found typing on phones hard. The participant screen must work as well on a laptop browser as on a phone. Same routes, same components, one responsive layout.

**Behaviour** (`LapTextNv`, `LapChoiceCw`)

1. Below 900px wide: today's phone layout, unchanged.
2. From 900px wide: the header becomes 64px tall with 40px side padding (church name left at 16px, the skin's mark right at 30px). The body is a centred column, at most 1120px wide, with 40px side padding and 56px top padding, split into two equal columns with a 56px gap:
   - Left: Earlier steps link (if shown), the eyebrow, the step's headline at 40px (weight 700, line height 1.15) and its help text at 18px in the muted colour.
   - Right: the answer area.
3. Text answers on a laptop: the text box is at least 260px tall, 20px text, line height 1.5. Under it, the character count on the left and the key hint on the right: "Enter sends · Shift + Enter new line" with each key in a key style. Send is right aligned. Enter sends and Shift+Enter makes a new line only when the device has a fine pointer and a hardware keyboard (`(pointer: fine)`); on touch devices keep today's behaviour.
4. Choice options on a laptop: a two-column grid of 72px-tall options with 19px text, left aligned.
5. Content screens, the join page, the waiting and holding states, images, timers and the private line all lay out sensibly at laptop width (centred, readable line lengths, no stretched phone controls). Check every interaction kind at 1280 x 800 and 1440 x 900.
6. Mark the phone header and body with the same surface attributes as today, so the skin's CSS applies at both sizes.

## Part 7. Video step (VD-1)

A new content kind, `video`, for clips like the one Chris had to skip at Pickering. Register it like any other kind: `lib/interactions/kinds.ts` (with a screen id and the label "Video"), the database registry (`private.interaction_kinds`, `input` false, counts none) and the run of show's kind list.

### Setup in the run of show (`RosVideo`)

- Title on phones and in the run of show (required).
- Video, one of:
  - Upload a video file: MP4 or MOV, up to 500 MB. Help: "Plays cleanest, with no player controls or ads." After upload, a file row shows the name, length, size, resolution and "Uploaded", with Replace.
  - Paste a YouTube or Vimeo link. Help: "A linked video can show the site's own controls and, on YouTube, ads. Upload when you can."
- Start at (default 0:00) and End at (default "The end"), as m:ss.
- When it ends: "Hold the last frame" (default) or "Go to the next step".
- Play sound from the TV window (on by default).
- Help line: "Phones show the title and "Watch the screen." Going live starts the video from Start at."
- Options are stored as `options.video`: `{source: "upload" | "link", id?: uuid, url?: string, start: seconds, end: seconds | null, ends: "hold" | "next", sound: boolean}`, validated in a new `private.options_video` function.

### Storage

- Follow the images pattern exactly (`20261116100000_images.sql` and the routes under `app/api/images` and `app/api/run-of-show/[id]/media`): a new private bucket `engagement-videos`, one folder per engagement, a `private.engagement_videos` table, `video_begin` and `video_finish` functions, signed upload addresses for the browser's upload and short-lived signed read addresses for the TV, control surface and remote. No storage policies; only the service role touches the bucket.
- Allowed types `video/mp4` and `video/quicktime`, up to 524,288,000 bytes. A 500 MB file can't pass through a Vercel function, so the browser uploads straight to Storage. Use Supabase's resumable upload (TUS) for files over 6 MB so a dropped connection resumes, with a progress bar in the file row.
- Check the clearway-live project's Storage file size limit. If it is below 500 MB, raise it within the current Pro plan. If raising it would need a paid change, stop and say so in the rollout notes instead of lowering the limit in the app.
- A deleted engagement's videos are marked deleted with it and purged by the operations job, as images are.
- Signed read addresses must outlast a session: make them valid for at least 6 hours, or refresh them before they expire, so a video never stops in the room.

### Playing it in the room

- Add a playback state for the live video step to the room state: `media` (jsonb) `{session: uuid, playing: boolean, position: seconds, at: timestamptz}`, included in the snapshot and broadcast. The TV computes the current position as `position + (now - at)` when playing, so a TV that reconnects jumps to the right place.
- `room_control` actions: `media_play`, `media_pause`, `media_seek` `{position}`, `media_restart`. Going live on a Video step sets `{playing: true, position: start}`. Leaving the step stops playback.
- When playback reaches End at (or the end of the file): "Hold the last frame" pauses on the last frame; "Go to the next step" advances the room as Next would, once, on the server, so the TV and control surface never disagree.
- TV (`TvVideoNv`): the video fills the TV like an image on Fill: no church badge, counts, live mark or link over it, letterboxed on the skin's ground if it isn't 16:9. Sound plays from the TV window when sound is on.
- The TV preloads the video while its step is in Preview, so it starts without buffering when it goes live.
- Autoplay with sound: browsers block it until the TV page has had a user gesture. Make Screen check (and the TV's first load) include a "Test sound" button that plays a short tone and records that the page may now play sound. If a Video step goes live and the TV still can't play with sound, the TV plays muted and the control surface shows a warning banner: "The TV needs a click to play sound. Click the TV once." Never leave the TV blank or frozen.
- YouTube and Vimeo links play through their official player APIs (YouTube IFrame Player API, Vimeo Player SDK) so play, pause and seek work from the control surface. Hide every control the API allows.

### Controls (`LiveVideo`)

- The live step panel for a Video step: a Pause or Play button (primary blue, never Orange) with the key hint K, Restart, the time "m:ss / m:ss", a scrubber you can drag to jump (the TV follows within a second), "Ends: holds the last frame" or "Ends: goes to the next step", and the note "Sound plays from the TV window. Check the TV's volume during Screen check."
- K plays and pauses while a Video step is live. Go live keeps its own job.
- The remote gets Play or Pause, Restart and the position.
- The live monitor and the Preview show the video muted, in sync with the TV.

### Phones (`PhVideoNv`, `PhVideoCw`)

- The step's eyebrow and title, then a card with a monitor icon: "Watch the screen. The video plays there, with sound." Earlier steps link as on other steps. Phones never play the video.

## Part 8. Before and after (BA-1)

A new kind, `before_after`, for the readiness question at the end of a workshop. It shows how the room moved as a whole. It never shows how any one person moved: the TV draws no per-person lines, arrows or pairings, and the facilitator views show the same aggregate (the CSV may keep each person's two answers, anonymous as the step is).

### Setup (`RosBeforeAfter`)

- Headline on the TV.
- How people answer:
  - "Ask both on one screen (recommended)" (the default): "At the end, each phone shows two sliders: Before today and After today. Each person compares themselves, not the room." With this mode the step has its own question, scale (5, 7 or 10; default 10) and end labels.
  - "Read two scale steps": "Picks two earlier scale steps with the same range." Two pickers list only scale steps earlier in the run of show; both must have the same maximum. Nobody answers on this step itself; it reads both steps live, so late answers still move the dots.
- Before label (default "Before today") and After label (default "After today").
- Show the change as a number (on by default).
- Help line: "Either way, the TV shows both sets of answers above one line, with both averages and the change. It never shows how any one person moved."
- Store the settings in `options`; validate them in a new options function. The "read two steps" pickers store the two session ids; refuse a step that isn't a scale, isn't earlier, or has a different maximum.

### Phones

- Asked together (`PhBeforeAfterPairedNv`): eyebrow, the question, the help line "Rate both now. Think back to before today for the first one.", then two sliders exactly like the scale slider, labelled with the Before and After labels, each with its value large, then the end labels and the status "Sent. Slide either one to change it." Each slider sends when it comes to rest (part 5); the stored answer is `{before?, after?}`, and a person counts in Before once they've set before and in After once they've set after.
- Reading two steps (`PhBeforeAfterNv`): the person's own two numbers in two cards (Before, After, from their answers on the two steps; a dash if they didn't answer one) and a card "Look at the screen to see how the room moved." Only that person sees their numbers.

### TV (`TvBeforeAfterNv`, `TvBeforeAfterCw`)

- Header as usual. Eyebrow and headline left; top right, when "Show the change as a number" is on, the change chip in `--cwl-callout` (the screen's one Sunrise moment): a trend-up icon and "Up 3.6", a trend-down icon and "Down 0.8", or "No change", from the difference of the two averages, one decimal.
- Under the headline, a key: a filled dot and "After today 7.6", an outlined dot and "Before today 4.0" (labels from the options, averages one decimal), at 44px weight 600 with the numbers weight 800.
- The plot is 1560px wide, centred, 440px tall, with the track along its bottom (64px up): a 12px rounded bar in `--cwl-bar-track` with a 24px circle at each value, and the numbers below at 44px, weight 700, muted.
- Both sets of answers stack above the same track. At each value, the Before dots sit 32px left of the value and the After dots 32px right, so the two stacks stand side by side. Dots are 56px; Before dots are outlined (a 6px ring in the muted colour, no fill); After dots are filled in `--cwl-bar`. Each stack rises from just above the track with a 66px pitch.
- The averages: the After average as a 4px dashed line in the text colour from the track up the plot, with a label chip at its top ("After 7.6", 40px weight 800, the card colour with the card's text); the Before average as a 4px solid line in the muted colour with its label ("Before 4.0", 40px weight 800, muted) at its top. Between the two averages, on the track, a segment in the muted colour shows the move.
- Live: dots arrive with the usual arrival motion; the averages, labels and the move segment slide on the spring as answers change. Crowding works as on the scale (dots shrink, then columns).
- If the step is private, or either source step is private, the TV shows the private count screen.

---

## Also in this pass: Duplicate run of show (DR-1)

`EventsDuplicateMenu`, `EventsDuplicateDialog`. "Duplicate as a new event" already exists (`private.engagement_duplicate`, using the template save and apply path). This adds copying a run of show into an engagement that already exists, such as Pickering's run of show into Hope Oakville's.

1. A new menu item, "Duplicate run of show", in the engagement row menu on the engagements list (`components/facilitator/engagements-table.tsx` through `useEventMenu` in `engagement-actions.tsx`) and in the engagement overview's More menu. Shown when the engagement has at least one step.
2. It opens a dialog titled "Duplicate run of show":
   - From: the source's title, organization, date, and "{n} steps in {m} sections".
   - To: a searchable picker of the other engagements the facilitator can edit (not archived, not closed, not the source, not the practice room), each shown as "title · organization · date".
   - If the target has steps, "It already has {n} steps" with two choices: "Replace them" ("Removes its {n} steps. Not offered when any of them already has answers."; disabled with that reason when any target step has a submission) and "Add after them" ("The copied steps go at the end, in their sections."). With no steps, no choice.
   - Bring along, all ticked by default: "Images and videos", "Timers and planned times", "Who sees answers on each step".
   - The note: "Answers never copy. Times move to the new date, keeping the same start. The new engagement keeps its own brand, so these steps show in Novetera if it's set to Novetera."
   - Buttons: Cancel, and "Duplicate {n} steps" (primary blue).
3. On success: a toast "Copied {n} steps to {target title}" with a link "Open its run of show".
4. Server: one transaction (a new `run_of_show_duplicate` function, or a `show_write` action) that checks facilitator access to both engagements, refuses if the target's room is live ("Duplicate after the workshop ends, or into another engagement."), and copies every non-deleted step with new ids: part, position (after the target's last step for Add after), section, title, interaction, prompt, phone depth, mode, limits, settings, options and team-led flags. It resets state to the state a new step gets, clears closed and shown times, remaps `seeded_from` and before-and-after source ids to the copied steps (or clears them if their source isn't copied), never copies submissions, AI groups, spotlights or hidden keys, and soft-deletes the target's steps for Replace.
   - Images and videos ticked: copy each referenced object into the target engagement's folder in its bucket and create new `engagement_images` / `engagement_videos` rows, then point the copied options at the new ids. A step must never read a file through another engagement's id. Unticked: drop the `image` and `video` keys (a Video step without its video stays, flagged in the run of show as needing a video).
   - Timers unticked: drop the `timer` keys and planned times. Ticked: shift planned starts to the target's date, keeping the clock time.
   - Who sees answers unticked: drop `visibility` (the form stays private).
   - Check whether `engagement_duplicate` copies images correctly today; if it doesn't, fix it the same way.

---

## Tests

Keep every existing check passing: `npm run check`, `test:ai`, `test:lens-wall`, `test:acceptance-m4`, `test:load`, `test:team-workshop`, `test:small-room` and the signed-in layout sweep from design pass 10. Add:

- Unit tests: the visibility-only server path accepts a change on a live step and refuses every other key; NPS-style score (all promoters `+100`, all 1 to 6 `-100`, mixed, rounding, empty); before-and-after averages and change from both modes; the duplicate function (remapping, Replace refused with answers, image copies, timer shift); video options validation (types, sizes, start before end, link parsing for YouTube and Vimeo).
- A browser kit `tests/browser/design-pass-11.ts` (`npm run test:pass-11`) with a paired TV, the control surface, the remote and simulated phones, in both skins, both TV themes, the very small and medium room sizes, and reduced motion:
  - Visibility: switch a live scale to private: within one second the TV shows the count screen, phones show the private line, and no answer value is present in the TV's DOM, the phones' DOM or any broadcast payload. Undo brings the results back. The Results card shows the average and columns throughout.
  - Frame: on and off from the transport bar, the F key and the remote; it persists across Next, Back, Preview and Go live; it hides on Join and Blackout; nothing on any board overlaps the bar or is clipped (check bounding boxes for every board kind at both room sizes); the "nothing jumped" check passes.
  - Scale: 1, 5, 11 and 40 answers; a changed answer moves its dot; NPS bands with the score; crowding switches to columns with no overlap.
  - Auto-send: one tap sends once; rapid changes send once per quiet period; offline then online sends the latest answer only.
  - Laptop: every kind at 1280 x 800 and 1440 x 900; Enter sends and Shift+Enter adds a line on a fine pointer.
  - Video: upload a test MP4 (use a small generated file in tests, and test a 200 MB file once by hand), go live, play, pause, seek, restart, end with each End choice, TV reconnect mid-play resumes at the right position, the muted-fallback banner appears when sound is blocked.
  - Before and after: both modes, live arrival, private source step shows the count screen, no per-person pairing anywhere in the TV's DOM.
  - Duplicate: copy into an empty engagement and into one with steps (Replace and Add after), with and without images, timers and visibility.
- Screenshots of every state to `docs/evidence/design-pass-11/`.

## Done means

- All eight parts and Duplicate run of show work as above in both skins, both TV themes, every room size, with and without reduced motion, on the TV, phones, laptops, control surface and remote.
- All checks and kits pass, and phone to TV stays under one second for 95 in 100 answers.
- `docs/design-pass-11-handoff.md` records what was built, anything that differs from this brief and why, every migration in apply order, and the screenshots.
- `docs/prd.md` and `docs/project-status.md` are updated for the new kinds, options, controls and room state.
- Committed to `main` after each part passes, and `live.clearway.co` and `live.novetera.co` serve the new build.
- Migrations: apply them to the clearway-live Supabase project if you can, in order, and confirm each in the handoff. If you can't, list them in apply order in the handoff and stop there; Claude will apply them.
- Don't press Reset practice room or go live in the practice room without asking Chris first. No emails to real people. Don't change Pickering's or Hope Oakville's engagements; Chris and Claude set up Hope's run of show after this ships.
