import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmedVersion, controlBody, isSyncing, neighbours, resultMessage, timing, upNext } from "../../lib/control/policy";
import { applyLiveEvent } from "../../lib/live/protocol";
import type { LiveRead } from "../../lib/live/types";
import type { ShowSession } from "../../lib/run-of-show/types";

const id = (n: number) => `56000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const step = (n: number, extra: Partial<ShowSession> = {}): ShowSession => ({ id: id(n), engagement_id: id(0), title: `Step ${n}`, part: "Day 1", position: n, planned_start: null, planned_minutes: 10,
  mode: "live", opens_at: null, closes_at: null, interaction: "word_cloud", prompt: "", phone_depth: "", settings: { anonymous: true, burst_minutes: 4, join_strip: false },
  notes: "", lands_in: "", state: "ready", segment: "", max_sends: 3, max_characters: 28, max_words: 3, revision: 0, ...extra });

test("a press is validated before it reaches the room", () => {
  assert.deepEqual(controlBody({ id: id(1), action: "next", from: null }), { id: id(1), action: "next", p: { from: null } });
  assert.deepEqual(controlBody({ id: id(1), action: "start_burst", from: id(2), minutes: 4 })?.p, { from: id(2), minutes: 4 });
  assert.deepEqual(controlBody({ id: id(1), action: "close_part", part: "Day 1" })?.p, { part: "Day 1" });
  assert.deepEqual(controlBody({ id: id(1), action: "room_size", size: "medium" })?.p, { size: "medium" });
  for (const bad of [{ id: "x", action: "next", from: null }, { id: id(1), action: "approve", from: null }, { id: id(1), action: "next" }, { id: id(1), action: "next", from: "x" },
    { id: id(1), action: "go_live", from: null, session: "x" }, { id: id(1), action: "start_burst", from: null, minutes: 6 }, { id: id(1), action: "start_burst", from: null, minutes: "4" },
    { id: id(1), action: "hide", from: null, item: "" }, { id: id(1), action: "hide", from: null, item: "x".repeat(201) }, { id: id(1), action: "tv_on_phones", on: "yes" },
    { id: id(1), action: "room_size", size: "huge" }, { id: id(1), action: "close_part", part: "Day 3" }, null, []]) assert.equal(controlBody(bad), null, JSON.stringify(bad));
});

test("the remote follows what every connected TV confirmed, and a silent TV drops out", () => {
  const screens = [{ id: "a", label: "Front", confirmed_version: 10, last_seen_at: null, connected: true }, { id: "b", label: "Side", confirmed_version: 8, last_seen_at: null, connected: true }];
  assert.equal(confirmedVersion(screens, new Map()), 8);
  assert.equal(confirmedVersion(screens, new Map([["b", 12]])), 10);
  assert.equal(confirmedVersion([{ ...screens[0] }, { ...screens[1], connected: false }], new Map()), 10);
  assert.equal(confirmedVersion([], new Map()), null);
  assert.equal(isSyncing(11, 10, 1000, 2999), false);
  assert.equal(isSyncing(11, 10, 1000, 3000), true);
  assert.equal(isSyncing(11, 11, 1000, 9000), false);
  assert.equal(isSyncing(11, null, 1000, 9000), false, "No TV connected is not Syncing");
});

test("Next and Back skip drafts and self-paced sessions; Up next is the next ready step", () => {
  const show = [step(1, { state: "closed" }), step(2, { state: "draft" }), step(3, { state: "live" }), step(4, { mode: "self_paced" }), step(5), step(6, { part: "Day 2", position: 0 })];
  assert.deepEqual([neighbours(show, id(3), id(3)).back?.id, neighbours(show, id(3), id(3)).next?.id], [id(1), id(5)]);
  assert.equal(upNext(show, id(3), id(3))?.id, id(5));
  assert.deepEqual([neighbours(show, null, id(3)).back?.id, neighbours(show, null, id(3)).next?.id], [id(3), id(5)], "After a break, Back returns to the step left");
  assert.deepEqual([neighbours(show, null, null).back, neighbours(show, null, null).next?.id], [null, id(1)]);
  assert.equal(neighbours(show, id(6), id(6)).next, null);
});

test("timing compares the step on the TV with its planned window", () => {
  const at = Date.parse("2026-11-14T14:00:00Z"), s = { planned_start: "2026-11-14T14:00:00Z", planned_minutes: 20 };
  assert.deepEqual(timing(s, at + 10 * 60000), { onTime: true, label: "On time" });
  assert.deepEqual(timing(s, at + 28 * 60000), { onTime: false, label: "8 min behind" });
  assert.deepEqual(timing(s, at - 5 * 60000), { onTime: false, label: "5 min ahead" });
  assert.equal(timing({ planned_start: null, planned_minutes: 5 }, at), null);
  assert.equal(timing(s, at + 3 * 86400000), null, "Another day is not a timing signal");
});

test("refusals say plainly what happened, with no dashes", () => {
  assert.equal(resultMessage({ status: "moved", by: "Jaisy", title: "Five Lenses: Community" }), "Jaisy already moved the room to Five Lenses: Community.");
  assert.equal(resultMessage({ status: "ok" }), "");
  for (const status of ["moved", "not_ready", "no_session", "hidden", "missing", "invalid_state", "closed", "denied", "unavailable"]) assert.doesNotMatch(resultMessage({ status }), /[–—]/);
});

test("a hidden word leaves shared answers at once; unhiding waits for the snapshot", () => {
  const room = "56000000-0000-4000-8000-000000000099", session = id(3);
  const frame = (version: number, hidden: string[] = []): LiveRead => ({ status: "ok", version, topic: "live:fixture", role: "tv", next: null, phone_depth: null, server_time: new Date().toISOString(), session: null,
    answers: [{ id: id(90), session_id: session, text: "Hope, Care", answers: [{ text: "Hope", key: "hope" }, { text: "Care", key: "care" }], revision: 0 }],
    state: { engagement_id: room, live_session_id: session, version, tv_content: "session", phones_down: false, burst_ends_at: null, hidden_keys: hidden, results: { total: 2, people: 1, words: [] } } });
  const hidden = applyLiveEvent(frame(1), frame(2, ["hope"]));
  assert.equal(hidden.kind, "applied");
  assert.deepEqual(hidden.value.answers[0].answers.map(a => a.key), ["care"]);
  assert.equal(applyLiveEvent({ ...hidden.value }, frame(3, [])).kind, "snapshot");
});
