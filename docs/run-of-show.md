# Run of show and printouts

Milestone 2, PR 2 implements SET-07 and FAIL-10. Open **Edit run of show** from an engagement's setup page. Sessions are grouped into Pre-call, Day 1, Day 2 and Follow-up. Move buttons work by keyboard and touch. A session's part changes in its editor.

The editor follows the approved pass 2 white app shell and 480px private panel. It supports title, church-local planned time and length, mode and opening window, word cloud/wall/content, prompt, phone depth, answer limits, default burst length, join strip, presenter notes, output destination and draft/ready state. Self-paced windows are stored now; scheduled opening belongs to the interaction-library milestone. AI and named-answer settings are not enabled ahead of their milestones.

The API refreshes and persists the facilitator cookie during long editing sessions. Save commits the session, its notes, one room version and its verified private broadcast together. It never starts a session. Current live/closed states remain under live-room controls. Mode or interaction cannot change while running or after answers exist. Removing a session is a soft delete and is refused for a current/live/open session.

A per-session revision prevents lost edits. Reordering validates the complete part with each revision under the room lock, so concurrent additions or edits cannot be dropped. Closing an engagement follows the same room-before-session lock order, tested with a deterministic concurrent Save/close race. The run of show reloads explicitly and preserves an open editor's unsaved text. On a conflict, reload, close the editor and reopen the session to use the latest saved version.

Presenter notes are stored only in `private.session_notes`. Both read and write RPCs validate the current native Google session, Clearway allowlist and engagement assignment (or admin role). Public wrappers are invokers. No browser has direct session/note write grants. Participants, scribes, unrelated facilitators and TVs cannot call the planning reader. Its UUID paging and list version prevent truncation above 1,000 sessions or mixed concurrent versions.

Shared broadcasts whitelist current public fields. They contain neither planning times, presenter notes nor phone depth. A public session revision tells phones to immediately fetch their guarded snapshot after Save. The snapshot renders horizon placeholders using the engagement's base year. TVs apply the saved public prompt directly without a page reload. Base-year changes also send a new room version.

**Print run of show** opens an authenticated, no-store print route. It includes planned times in the church timezone, prompt, phone depth and private notes, with repeated table headers and print styles for letter portrait. Text stays plain, including facilitator-entered markup. Browser printing can produce paper or a PDF. No public share link or stored PDF is created.

## Verification

Run `npm run check`. CI also replays migrations, lints functions and runs the database isolation tests plus native Auth/private Realtime integration on disposable loopback services. The native run-of-show case verifies a committed Save over a real private WebSocket, private phone depth, simultaneous-save conflict protection and 1,206-session paging. The printed route is covered by HTTP tests and reviewed in the local browser fixture.

These checks do not claim venue phone-to-TV acceptance. The TV/phone UIs, physical printing and practice-room timing acceptance follow in their ordered PRs. No production attendee or Auth session is created for these checks.
