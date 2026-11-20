# Who sees answers

Implemented November 20, 2026. Migration `20261120160000_step_visibility.sql`.

Each answering step chooses whether its answers show to the room or only to the
facilitators. The first uses are the NPS question at the end of a workshop, as a
private 1 to 10 scale, and a private testimonial wall.

## The setting

- Stored in `sessions.options` as `"visibility": "public"` or `"private"`.
  Public is the default, also when the key is absent.
- Validated in the options wrapper chain (`private.session_options`), beside
  `untitled`, `image` and `timer`, so no `options_<kind>` function changes.
  Any other value is refused.
- Content screens have no setting. The key is dropped.
- The private form is always private. It stores `"private"` whatever is sent.
- The general kinds can be private: word cloud, open text, Q&A, multiple choice,
  scale, ranking, 100 points, statements, 2x2 grid, sign together and the form
  (`private.interaction_kinds.private_ok`). The Wayfinding boards (lens wall,
  lens summary, Four Helpful Lists, candidates, intent, goals, outcome bullets
  and confirm, read-back) are built for the room to see, so they refuse
  `"private"` rather than half-enforce it.
- Duplicating a step, saving a template and starting from a template carry the
  setting with the rest of the options.

In the run of show, the step's Settings tab has **Who sees answers**:
Everyone (TV and phones) or Facilitators only. The preview draws the private TV
and phone screens when Facilitators only is chosen.

## Enforced in the database

A step is private when it is the form, when its visibility is private, or when
it is seeded from a private step (`private.step_private`).

- **Room state.** A before trigger on `room_states` (`zz_private_results`, after
  every other before trigger) stores only `{total, people, words: []}` while a
  private step is live, whichever path wrote the results. Attendees can select
  `room_states`, so this is the guarantee for the TV, phones, the snapshot and
  every broadcast.
- **Snapshot, broadcast and preview.** `live_snapshot`, `live_broadcast` and
  `session_preview` treat a private step as not sharing answers: no answer
  list, and the broadcast's answer patch carries no text, answers or value.
- **Public options** carry `"visibility": "private"` for every private step, so
  the TV and phones draw the private screens.
- **Q&A.** A private question is never spotlit on the TV (`qa_public`), and
  phones cannot upvote it (`qa_vote` returns `closed`). Phones list only their
  own questions.
- **Seeding.** A public step cannot be seeded from a private one
  (`show_seed_from` returns `private_source`, and a save carrying it fails
  whole). The run of show explains why before the save.
- **A live step switched underneath** (the run of show cannot change a live
  step, but the row can change) recounts the room at once
  (`room_visibility_changed`).
- **AI** grouping and summaries still run for the facilitators. Their output
  reaches the TV only through the room state's results, which hold counts only
  while the step is private.

Facilitator surfaces are unchanged and show every answer: the control surface's
items (`control_status`), results, the CSV export and the recap. Each marks the
step Private. The recap draws a private step's full results. The CSV adds a
last Private column only when the file holds a private step, so a public step's
file is unchanged.

## TV and phones

On the TV, a private step of any kind draws the private form's screen: the
question, the count of people who have answered and "Only the facilitators
will read what you write." No bars, words or cards. Phones show the same line
under the question, with the Private marker, and still see their own answers.

## Tests

- `supabase/tests/database/step_visibility.test.sql`: the setting, seeding,
  duplicates and templates, and the leak test. It signs in as an attendee, as
  the TV and as a signed-out visitor, calls every RPC either role can execute
  with every argument filled two ways, reads `room_states`, `submissions` and
  `sessions`, and reads every realtime topic as realtime would deliver it. No
  private answer comes back. Removing the room-state trigger or the snapshot
  check makes it fail.
- `npm run test:visibility` (`tests/browser/step-visibility.ts`): the practice
  room runs one public and one private step of every kind with the setting,
  with 50 simulated phones and a paired headless TV, from the latency log.
- `tests/unit/visibility.test.ts`: the helpers, the CSV marking and the recap.
