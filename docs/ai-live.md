# AI, live

Milestone 3, step 5. The AI states of the word cloud (INT-01), the open text wall (INT-02) and Q&A (INT-03), Show summary, and FAIL-09. Migration `20261103110000_ai_live` (after step 6a's `self_paced`).

## AI is never in the path from phone to TV

An answer is stored and broadcast by `live_submit` exactly as before. AI work starts only after the response has gone, on the server, and its results arrive later as their own room events (a combine, a group, a fold, a summary) that rearrange what is already on screen.

**How it runs on Vercel.** The submission route (and Ask any time, the AI controls, and the control surface's status poll) calls `kickAi` (`lib/ai/trigger.ts`), which schedules the work with Next's `after()`: Vercel keeps the function alive for it with `waitUntil` after the response is sent (`maxDuration` 60 on those routes). The worker (`lib/ai/worker.ts`) waits a short debounce (700 ms by default) so answers that land together share one call, then loops:

1. `ai_claim(session, lease, model, versions)`: the database decides what is due (see below), records an AI run with the model, the prompt version and the inputs, and gives this worker the session's one lease (45 seconds). A second trigger while it holds the lease gets `busy` and stops, so nothing runs twice; in one server process a second trigger only asks the running worker to go round again.
2. The model call, through the Anthropic SDK (`lib/ai/client.ts`), with a timeout (20 seconds).
3. `ai_apply(run, lease, output, usage)`: under the room lock, it checks the lease is still this worker's, applies the output under the merge limits, logs tokens and cost on the run, releases the lease and raises one room version if anything changed. A second apply of the same run, an apply after the lease expired, or one after AI was switched off, changes nothing (`stale` or `discarded`).
4. Claim again, until nothing is due. Answers that arrived during a call are picked up by the next claim, so nothing is missed.

A failed or timed-out call goes to `ai_fail`: the run is recorded as failed, its watermark goes back so the work is tried again, and the session cools down for ten seconds before the next try. The room keeps working in arrival order throughout. A summary refresh that is due with nobody answering (75 seconds) is picked up by the control surface's 3-second status poll, which kicks the live session's due work.

**What is due.** Word cloud: about 30 different answers (Default) and new words since the last run. Wall: answers not yet in a group that no earlier claim saw, plus the summary when shown and due (no summary yet, 8 answers it has not read, or 75 seconds and something new). Q&A: questions no earlier claim saw and at least two standing.

**New means not seen, not later** (migration `ai_claim_late_commits`). Each claim records the answers it saw (`ai_sessions.group_seen_ids`, `fold_seen_ids`; a summary's run keeps the ids it read in its inputs). An answer is new when no earlier claim saw it, whatever its received time. Answers sent together commit one after another, each stamped when its own write began, so one can commit after a claim with an earlier time; a time watermark left those out until another answer arrived, and with eight phones sending at once most of a wall stayed ungrouped. A failed call and Clear test answers still set the watermark back to null, which counts every answer as new again.

## Switches

AI is on for a session when the engagement has it on (setup: "Use AI in live sessions", `settings.ai_enabled`, on by default for new engagements since Chris approved the AI disclosure on November 3; an engagement saved before then keeps the setting it was saved with), the kind uses AI, and the session's own switch is on: the live switch on the control surface or remote (`private.ai_sessions.ai`), else the run of show's setting (`options.ai`, on by default; the wall also has `options.summary`). The session settings column is untouched (6b owns `show_write`); the new options go through each kind's own `options_` function.

With AI off, nothing on the TV is marked as AI: the word cloud's words stand as matching left them, the wall shows answer cards in arrival order, and Q&A shows only word and facilitator folds. Turning AI back on brings back what AI had done, and the worker picks up from what is there.

## The merge limits are code

`ai_apply` enforces them, never the prompt (PRD "Merge limits"):

- Never more than four items into one in a single step (a combine or fold of five is refused; a group gains at most four answers per step and the rest wait).
- At least 60 percent of items left standing (the different words, or the waiting questions); combines past that are refused as `standing`.
- Never a number dropped: a member whose numbers are not all in the survivor is refused ("3 baptisms" never folds into "baptisms").
- Never a quote merged: text with a double quotation mark, or wrapped in single quotes, is refused. An apostrophe is not a quote.
- Never different kinds: every merge is within one session, refs only from the run's own inputs.
- Kept apart: a word whose combine was undone, a question whose fold was undone (by anyone) and an answer whose group was undone or that was taken out are never offered to AI again. Edited and answered questions are never folded. Pinned groups are never changed; renamed groups keep their name.
- Labels: up to 40 characters and six words, one line, no quotes, through the word filter. Summaries: up to 320 characters (the prompt asks for 30 words), through the word filter.

Every refusal is kept on the run's output with its reason.

## What AI sees

Inputs carry answer text and counts only, under short refs (`w1`, `a1`, `g1`, `q1`); the worker maps them back. Attendee identity fields (names, emails, roles, ids) never reach the model. Free text is sent as written (Decided November 2). The run stores the full inputs, the model, the prompt version, the output, tokens, cost and time; the control surface shows the cost for the engagement.

## Prompts and models

The four prompts live in `lib/ai/prompts.ts`, each with a version (`combine-words@1`, `group-wall@1`, `summarize-wall@1`, `fold-questions@1`) and a defensive reader for the reply. The model is `CLEARWAY_AI_MODEL_LIVE` (default `claude-haiku-4-5`, the fast model); prices for the cost log are `CLEARWAY_AI_PRICE_INPUT_PER_MTOK` and `CLEARWAY_AI_PRICE_OUTPUT_PER_MTOK` (defaults 1 and 5 US dollars, the fast model's list price; set them in Vercel if it changes). The key is `ANTHROPIC_API_KEY`, server only. With no key, no AI runs and the room works in arrival order.

## The TV

- **INT-01.** A combined word carries the gradient AI icon and the foot says "Combined similar answers" once, beside the icon. Both icons sweep once with each new combine. The absorbed word glides into the survivor's place on the regroup spring while it fades, and the survivor grows; Undo plays it backwards, the word leaving the survivor's place for one of its own.
- **INT-02, AI on.** Pass 2's layout: the AI groups as short labels in the main area, sized by how many answers they hold, under one gradient AI icon on the "Grouped from answers" line above the groups (shortened from the design so it holds one line on a very small screen), with the answers in a column on the right, newest first. Groups form from two answers; a pinned group shows the pin. Up to nine groups show, four while the summary shows, and only as many as fit whole at the floor size (at least one): groups never overlap and are never cut. The rest wait on the control surface ("+ 2 smaller groups on the control surface").
- **INT-02, the summary.** After Show summary, the summary opens at the top of the groups column under the question (its AI band then heads the column, so the groups' own heading steps aside, and the answers column narrows to give it room): an AI gradient header band with the AI icon and "AI summary", the text on its own Deeper Royal panel at the floor size. The groups glide down to make room; a refresh cross-fades the text; Hide summary closes it.
- **INT-02, AI off.** Answer cards in arrival order, oldest first, so each card keeps its place as new ones join at the end. A crowded wall steps older cards down to the body size, then the floor, then every card to the floor, then the oldest take turns (the two newest always show) ("+ 6 more, taking turns", every `cwl-dur-turn-hold`), only once nothing has arrived for `cwl-delay-quiet`. Switching AI on or off cross-fades between the two layouts; neither redraws.
- **INT-03.** A group with an AI fold shows the gradient AI icon and "Combined · asked by 3", and its icon sweeps once with the fold; the Spotlight shows it too, as the plain icon in Navy on its Sunrise fill.
- The AI icon never sits in the TV top bar beside the LIVE mark. The word cloud's AI line is in the foot.
- The TV never says AI is slow, failing or off. Reduced motion puts everything in place at once.

## Phones

A word cloud answer AI combined says "On the screen with youth" under it, beside the gradient AI icon. Q&A's combined questions carry the icon. Both sit on Off-White cards, so they take the light-ground gradient, and sweep once when AI combines or folds them.

## The control surface and remote (FAIL-09)

The AI panel (laptop, under the items): the session's AI switch and what AI is doing ("Combines once there are about 30 different answers", "Groups as answers arrive", "Slow: 9.2s to group"), Undo last AI change (everything the latest AI run did), Turn AI off or on, Show summary or Hide summary, a meter (answers, grouped by AI, AI response time), the summary in private once shown, and the engagement's AI cost. Banners: "AI is slow" (a call running over 6 seconds, or the last one slower), "AI isn't responding" (the last call failed), "AI is off for this session" and "AI is off for this engagement", each saying the room keeps working in arrival order.

The item lists: the word cloud's AI combines with Undo, and the wall's AI groups with Rename, Pin or Unpin, Undo and Redo, each above the general item list. Q&A's AI folds are in step 4's panel ("Combined by AI", Undo fold). The remote carries Undo last, AI on and off, Pin groups and Summary, and the item lists in its sheet. Presses go to `POST /api/control/:id/ai` (`private.ai_control`: room lock, facilitator check, press id, one version raise) and show in Recent presses in plain words. `GET /api/control/:id/ai` reads `private.ai_status`.

## Shared functions redefined

`private.results_word_cloud`, `private.results_wall`, `private.qa_board`, `private.qa_root`, `private.options_qa` and step 6a's `private.rehearsal_control`, each keeping every earlier field and rule. New: `options_word_cloud`, `options_wall`, `ai_clear`. App lines: the wall's TV view is `components/interactions/ai/wall-view.tsx` in `tv-views.tsx`; the word cloud's board (`lib/tv/board.ts`) gains the gradient AI icon and the combine glides; `tv-scenes.tsx` gains the foot line; `controlItems` and `controlPanels` gain the AI lists and panel; the remote gains `AiRemote`; `live-controls.tsx` exports its general item list; the run of show gains the AI settings; the phone's answer card gains the combined note; setup's AI label is now "Use AI in live sessions".

## Clear test answers

Step 6a's Clear test answers (`private.rehearsal_control`, redefined with one added call to `private.ai_clear`) also retires everything AI made from the cleared answers: word combines that touch a cleared word, group memberships of cleared answers and any group left with no standing answer, the summaries of the sessions it touched, and those sessions' AI runs since the first test answer, undone records included. It resets those sessions' lease, watermarks and Show summary, so the real session starts clean; the live AI switch stays as the facilitator left it. The cost log keeps what the rehearsal spent. Every results function skips deleted rows, so nothing of the rehearsal reaches a screen.

## The AI disclosure

Chris approved the wording on November 3 (PRD, "AI"). The words live in one file, `lib/ai/disclosure.ts`, and are tested against his text with no dashes.

- **"How we use AI"** at `/how-we-use-ai`: a phone page in the room tree, outside the sign-in middleware, so it opens without signing in. Its last line is the icon credit.
- **Room sign-in:** under the Sign in button (and under Join the practice room), the AI line with its last three words linking to the page, only when the engagement has AI on. The room page reads that through `public.room_ai` (service role only), the same reading as `private.ai_on`.
- **Invite email:** the approved paragraph after the sign-in steps, then the page's link, only when the engagement has AI on.
- **Survey intro:** milestone 6; the wording is recorded in the PRD.

## The AI icon

"Generative" by LAFS on Flaticon (design pass 3, change 14), traced, in `public/marks/ai-generative.svg` and `components/interactions/ai/ai-path.ts`. Chris decided the credit on November 3: "The AI mark is the Generative icon by LAFS from Flaticon." appears only as the last line of "How we use AI", never in the app chrome (the SVG's title is just "AI"). Swap in the official SVG path when it is downloaded.

**Gradient ink with a sweep** (Decided by Chris, November 3). There is no badge tile anywhere: the icon itself carries the gradient, at about the size the icon had inside the old badge, with what AI did beside it in plain words (Grouped, Combined, Drafted). It is drawn as an element whose background is the gradient and whose shape is a CSS mask of the icon (`.cwl-ai-mark` in `ai.css`, `AiMark` in `ai-icon.tsx`, `aiMarkEl` in `ai-dom.ts`).

- **Two versions, chosen by the ground.** Dark grounds (Navy TV and phone screens): 115deg, Sky (#99C5FE) to Soft Lime (#E6FFA8). Light grounds (Off-White and white cards on the TV wall, phone answer and question cards, the light TV theme, the control surface, setup, scribe console and overnight review): 115deg, Royal (#3F72DE) to Bright Chartreuse (#A6C800). Bright Chartreuse is live-only and used for this icon alone (1.8:1 on Off-White, accepted by Chris: the Royal half carries the AI letters).
- **The sweep.** When AI acts, a light passes through the icon once: a 300 percent wide `linear-gradient(115deg, start 0%, end 33%, glint 50%, start 67%, end 100%)`, its background position animated from 0% to 100% over `cwl-dur-ai-sweep` (900ms) on `cwl-ease-calm`. The glint is White on dark grounds and Sky on light ones. At rest it shows the plain start to end gradient. It never loops.
- **When it runs.** Once per AI change, timed with the motion it marks: the wall's "Grouped from answers" icon when AI groups another answer or forms a group (as the groups drift), a combined word's icon and the foot's when AI combines words (as the word glides into its survivor), a Q&A row's icon when AI folds a question into it (as the folded row glides in), the phone's icon on a combined word or folded question, and the control surface's AI panel icon on each new AI run. `AiChanges` (`ai-dom.ts`) names each thing AI has done by a key; a key never seen before is AI acting. A screen opening on AI's earlier work, an ordinary re-render, Undo, Redo, rename and pin never sweep. Reduced motion (the TV's own setting, and the system setting on phones): no sweep.
- **Unchanged.** The plain icon inside buttons and on coloured fills (Turn AI on, Show summary, the Sunrise spotlight) is `currentColor`. The AI summary's header band keeps its Sky to Soft Lime band (`cwl-ai`, fixed on every theme) with Navy text (`cwl-on-ai`, now for the band only) and the plain Navy icon.
- **Tokens** (`design/clearway-live/live_tokens.css` and `tokens.json`): `cwl-ai-start` and `cwl-ai-end` (dark: Sky and Soft Lime; light grounds: Royal and Bright Chartreuse), `cwl-ai-glint` (dark: White; light: Sky), `cwl-bright-chartreuse` (#A6C800), `cwl-dur-ai-sweep` (900ms). The badge tile, its deeper-shade gradient on light grounds and the thin Navy edge on light grounds are retired.

## Tests

- `supabase/tests/database/ai_live.test.sql`: tables and privileges (only the service role runs the worker), switches and options, combines with every limit (four into one, 60 percent standing, numbers, quotes, unknown refs), one version raise per apply, a second apply and an expired lease changing nothing, the run's model, prompt version, inputs, tokens, cost and time, undo and kept apart, AI off and back on, failure and cool-down; wall groups (two answers, four per step, labels through the filter, pinned, renamed, undo, redo, undo last), the summary only after Show summary and its refresh rule; Q&A folds as step 4's merges with the AI marker, undo, kept apart, edited questions, AI off; status, cost and roles. No identity field in any input.
- `supabase/tests/database/ai_claim_late_commits.test.sql`: an answer received before the last claim's watermark but committed after it is still claimed for grouping and for folding, and the wall summary counts late answers as fresh; seen once, an answer makes nothing due again; a failed call still tries the same answers again.
- `tests/unit/ai-live.test.ts`: configuration and the client (the fake never on production), prompts (versions, no ids in what the model sees, defensive replies), prompt behaviour against the fixture set (`tests/fixtures/ai/live.json`, from the fictional Riverside engagement: folds what should fold, keeps apart what should, never invents, never names people, short labels, summary length and the room's words) with recorded replies, and against the real API when `ANTHROPIC_API_KEY` is set (skipped otherwise); the scripted stand-in; the worker's claim, apply, fail, busy and one worker per session; the wall cap, the foot line, the phone note, press validation and FAIL-09's words.
- `tests/unit/ai-disclosure.test.ts`: the disclosure is Chris's text exactly with no dashes, the credit only on the page, the invite paragraph with AI on and none with AI off, and AI on by default for new engagements. `tests/smoke/routes.test.ts` renders the page without signing in, the sign-in line and its link with AI on (none off), and checks the faked invite email both ways.
- `npm run test:ai`: in real browsers with the scripted fake model (`CLEARWAY_AI_FAKE=script`, slowed or failed through `CLEARWAY_AI_FAKE_CONTROL`): a paired TV, three phones, the control surface and the remote run INT-01's combine and Undo, INT-02's groups, rename, pin, undo, Show summary and AI off, FAIL-09 slow, not responding and off, reduced motion, INT-03's AI fold and Undo fold, and check the TV never mentions AI's state. Then 50 simulated phones answer an AI wall in the practice room while every AI call takes 2.5 seconds: phone to TV under one second (95 in 100, from the latency log), no group label jumping, and the TV's count and groups against the server. The kit also opens the room sign-in on a phone with AI off (no line) and on (the line under Sign in, linking to the page), follows the link and reads the page's words. `KIT_SHOTS=<folder>` saves the screens.
