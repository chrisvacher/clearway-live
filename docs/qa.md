# Q&A

Milestone 3, step 4. INT-03, kind `qa`: anonymous questions with upvotes and folding, Spotlight over any session, Answered, and Questions any time. Migration `qa`.

## Shared changes

Step 4 alone may change shared functions where Q&A reaches beyond the live session (milestone 3 brief). These are the only ones:

- **`private.live_public_state`** is redefined with every existing field and rule kept exactly, plus one new top-level key, `qa`: the engagement's Questions any time pool (`session_id`, `title`, `max_characters`, `max_sends`, `waiting`) and the spotlit question (`id`, `session_id`, `text`, `people`, `askers`, `ai`). pgTAP compares it, less `qa`, with a verbatim copy of step 1's function with the Q&A step live, with another step live under a spotlit question, and on the holding screen, and checks the phone's fields are unchanged.
- **`room_states.spotlight_id`**, an existing column no function set, now holds the spotlit question. Every room reset already clears it, and navigation never does, so it holds over any session. No column is added.
- **An after insert or update trigger on `public.submissions`** (`private.qa_arrive`) records each Q&A question's words and folds a new one as it arrives. Other kinds pass straight through.
- **`lib/live/protocol.ts`** carries `qa` from each event into the frame (one line).
- App lines: `countUnit` takes the kind so the TV counts "7 questions"; `Tally` passes it; the TV scenes render the Q&A spotlight and the waiting note; the phone header carries the Ask button and the phone input gets the room's frame; the Q&A panel is the kind's line in `components/interactions/control-items.tsx` (laptop and remote), and `QaAnyTime` sits after the item list on the laptop and in the remote's items sheet so the pool and a spotlit question follow the room over any step; the printed run of show names each kind from the registry instead of calling new kinds Content. `private.phone_room` is unchanged.

## The kind

Registered as several questions per person, counted as answers, Spotlight and Hide by question id, never named. Its functions: `parse_qa` (up to the step's characters, 200 by default, through `private.screen_text`), `results_qa`, `options_qa` (one setting, `any_time`) and `items_qa`.

## Ranking and folding

- **Ranking counts people.** Each person who asked a question in a group counts 2, each other person who voted counts 1. Ties go to the most recent activity (an ask or a vote). `results_qa` returns every question with `people`, `askers`, `votes`, `score`, `rank`, `ids` (the group) and `answered`; `total` is the questions still waiting.
- **Folding by matching words** as each question arrives: lower-cased, punctuation dropped, common words removed, a trailing "s" dropped on words over three letters. A new question folds into the standing question that shares the most words when the shared words are at least three-quarters of the longer one's. Folded questions show "Asked by 3".
- **Every fold is a merge** (`private.qa_merges`, the PRD's Merge): survivor, member, `made_by` (`words` now, `ai` from step 5, or `facilitator`), `detail` for the model and prompt version, and undo. Undo brings the question back as its own row. A question whose fold was undone, or that the facilitator edited, is never refolded by words. Groups with an `ai` fold carry `ai: true`; the TV and phones lead their label with the AI icon and a dot ("Combined" was dropped November 4).
- **The seam for step 5:** AI folding inserts merges with `made_by 'ai'` under the same limits; results, the TV, phones, Undo and the panel already handle them.

## Votes

`private.qa_votes` (the PRD's Question vote): one row per person per question, toggled. The phone makes the id; each press says on or off and raises the revision, so a resend is a duplicate and never toggles twice. A vote on a question the person asked, or one folded with theirs, is refused as `own`. Votes follow the step's answer rules (live with phones up, taking late answers, or queued before close and arriving within 2 minutes). `POST /api/live/:id/vote` takes a press; `GET` returns the phone's own votes. Votes ride the phone's own Q&A outbox (`lib/phone/outbox.ts`), in order, offline first.

## The TV

The top three waiting questions, each with its count of people and, when two or more asked it, "Asked by 3" below (led by the AI icon and a dot when AI folded them), and "+ 4 more on your phones". Adjusted November 4 (interaction rework): the arrow and count sit side by side on the question's first line, at the question's own size, flush with the prompt's left edge, in a column 2.3em wide and 32px from the question; the Lime moment's bar sits in the gutter. The count badges top left read people who asked, then questions. Rows rise and fall on springs that retarget without losing speed (`cwl-dur-bar-trade`); a question rising from the phones slides up from below, one pushed out slides down as it fades, a fold glides into its survivor, Answered fades where it stands (`cwl-dur-hide`). Rows never swap. Questions clamp to two lines (one when a crowded row can't hold two and its "asked by" line; a row too short for even one line with "asked by" beneath, as in the control surface's mirror, puts "asked by" beside the question); phones carry the whole question. A lone arrival takes the Lime moment. "Waiting for questions" before the first. The count badges read 8 people and 7 questions. Reduced motion puts every row in place at once.

**Spotlight over any session** puts one question large in Sunrise over the scrim, on any step, the holding screen included. Answered clears it and marks the question answered; Hide clears it too.

## Phones

Ask anonymously (the step's characters, 200 by default) at the foot of the list, and upvote others' questions. Your own questions say Yours and can't be voted on. A vote or question made offline says Saved on this phone and sends in order on reconnect. Answered questions move to an Answered list. Phones down holds Ask and votes.

**Questions any time** (a setting on a Q&A step): every other session's phone screen carries an Ask button. Its sheet says "Anonymous. It goes to one list for the whole engagement." and posts to `POST /api/live/:id/ask`, which files the question in the pool, the first Q&A step in run-of-show order with the setting on that is neither a draft nor closed. While another step is on, the TV notes "Questions any time: 3 waiting" quietly in the bottom left; the questions stay off the screen until the facilitator shows them (Spotlight, or going live on the step). Votes on pool questions open when the pool step is on.

## The control surface

The Q&A panel (laptop and remote) lists the questions by rank with their people and votes, folded questions under their survivor with Undo fold, Spotlight or Clear, Answered (and Bring back), Edit (the asker's words stay in the record; the panel shows them) and Hide or Unhide (a group hides as a whole). While another step is on, the panel follows the Questions any time pool, or the spotlit question's step. Presses go to `POST /api/control/:id/qa` (`private.qa_control`: room lock, facilitator check, press id, one version raise) and are logged in Recent presses in plain words.

## Tests

- `supabase/tests/database/qa.test.sql`: the kind and its privacy, matching words, asking and limits, folding as questions arrive, votes (toggle, duplicate, another phone, own, conflict, phones down), ranking and ties, the panel, Undo fold, edit, Answered, Hide, Spotlight over another session and the holding screen, Questions any time, and that the shared state, session and phone fields are unchanged.
- `tests/unit/qa.test.ts`: empty, first item, typical, crowded (29 questions), folding, very long text, votes and the offline overlay, request bodies, outbox statuses, and `qa` riding events.
- `npm run test:qa`: in real browsers, a paired TV, three phones and the control surface run every state (empty, first item, typical, crowded with 50 phones, offline and queued, phones down, AI off, reduced motion, very long text) plus folding and undo, Spotlight over any session, Answered, edit, Questions any time and the remote. The 50-phone run asks and votes in the practice room and checks phone to TV under one second (95 in 100, from the latency log), no row jumping, and the TV's count, top three and more line against the server. It also checks "asked by" never spills out of a row in the control surface's mirror. `KIT_SHOTS=<folder>` saves the screens.
