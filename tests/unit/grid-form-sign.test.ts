import test from "node:test";
import assert from "node:assert/strict";
import {
  addPoint, clamp01, dotRadius, formAnswer, formAnswersOf, formOf, gridAnswer, gridColor, gridOf, gridResults, inkLength, kindPress, maxFormAnswer, maxInk,
  newKey, nextOpen, placesOf, separate, signaturePath, signersOf, signSpot, signText, strokesOf, wallLayout,
} from "../../lib/interactions/grid-form-sign";
import { applyLiveEvent } from "../../lib/live/protocol";
import { ownAnswers } from "../../lib/phone/policy";
import type { LiveEvent, LiveSnapshot } from "../../lib/live/types";

const id = (n: number) => `58000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const items = [{ key: "a1", text: "Online newcomer path" }, { key: "b2", text: "Prayer room" }, { key: "c3", text: "Leader residency" }];
const overlaps = (dots: { x: number; y: number; r: number }[], gap = 0) => dots.some((p, i) => dots.some((q, j) => j > i && Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r + gap - 0.5));

// ---------- INT-08 ----------
test("grid options fill the axes from the preset, and the pre-mortem preset is likelihood and impact", () => {
  const empty = gridOf({});
  assert.deepEqual([empty.x_label, empty.y_label, empty.x_low, empty.y_high, empty.legend], ["Effort", "Impact", "Low", "High", "Items"], "empty: the default axes");
  const pm = gridOf({ preset: "pre_mortem" });
  assert.deepEqual([pm.x_label, pm.x_low, pm.x_high, pm.y_label, pm.legend], ["Likelihood", "Unlikely", "Likely", "Impact", "Reasons it failed"]);
  assert.equal(gridOf({ x_label: "Cost" }).x_label, "Cost", "the facilitator's own labels win");
  assert.equal(gridOf({ items: Array.from({ length: 14 }, (_, i) => ({ key: `k${i}`, text: `Item ${i}` })) }).items.length, 10, "a grid holds ten items at most");
});

test("every item keeps its own color from the ten-color palette, by its number", () => {
  assert.deepEqual([1, 2, 10].map(gridColor), ["cwl-i1", "cwl-i2", "cwl-i10"]);
  assert.equal(new Set(Array.from({ length: 10 }, (_, i) => gridColor(i + 1))).size, 10, "ten items, ten colors");
  assert.equal(gridColor(11), "cwl-i1", "past ten it repeats (the run of show stops at ten)");
});

test("a person's whole set of placements rides in one answer", () => {
  const places = { a1: [0.25, 0.8] as [number, number], c3: [0.6, 0.55] as [number, number] };
  const answer = gridAnswer(places, items);
  assert.equal(answer.text, "2 of 3 placed");
  assert.deepEqual(answer.value, { places });
  assert.deepEqual(placesOf(answer.value), places, "read back from the answer");
  assert.deepEqual(placesOf({ places: { a1: [2, 0.5], b2: "x", c3: [0.1, 0.2] } }), { c3: [0.1, 0.2] }, "anything off the grid is ignored");
  assert.equal(clamp01(1.4), 1); assert.equal(clamp01(-0.2), 0); assert.equal(clamp01(0.123456), 0.1235);
});

test("placing moves on to the next number still open", () => {
  assert.equal(nextOpen(items, {}, null), "b2", "from the first, the next");
  assert.equal(nextOpen(items, { a1: [0.1, 0.1] }, "a1"), "b2");
  assert.equal(nextOpen(items, { a1: [0.1, 0.1], b2: [0.2, 0.2] }, "b2"), "c3");
  assert.equal(nextOpen(items, { b2: [0.1, 0.1], c3: [0.2, 0.2] }, "c3"), "a1", "it wraps round to an earlier open number");
  assert.equal(nextOpen(items, { a1: [0, 0], b2: [0, 0], c3: [0, 0] }, "b2"), "b2", "all placed: it stays put");
});

test("grid results come from the server: means, counts, faint placements and merges", () => {
  const results = gridResults({ total: 3, people: 2, items: [
    { key: "a1", num: 1, text: "Online newcomer path", count: 2, x: 0.3, y: 0.7, places: [["aaaa1111", 0.2, 0.8], ["bbbb2222", 0.4, 0.6]] },
    { key: "b2", num: 2, text: "Prayer room", count: 1, x: 0.6, y: 0.4 },
    { key: "c3", num: 3, text: "Leader residency", count: 0, into: "a1" }, { nope: true }] });
  assert.equal(results.length, 3);
  assert.deepEqual(results[0].places, [["aaaa1111", 0.2, 0.8], ["bbbb2222", 0.4, 0.6]], "faint dots once two people placed it");
  assert.equal(results[1].places, undefined, "one person: no faint dot");
  assert.equal(results[2].into, "a1", "a merged duplicate names its survivor");
  assert.equal(results[2].x, undefined, "and has no position of its own");
});

test("dots grow with the people who placed them, from the floor's dot", () => {
  assert.equal(dotRadius(1, 1, 34, 30), 34, "first item: the base size");
  assert.equal(dotRadius(9, 9, 34, 30), 64, "the leader is largest");
  assert.ok(dotRadius(4, 9, 34, 30) > 34 && dotRadius(4, 9, 34, 30) < 64);
});

test("no two dots overlap, and a dot is nudged only as far as needed", () => {
  const alone = separate([{ key: "a", x: 200, y: 200, r: 30 }, { key: "b", x: 600, y: 300, r: 30 }], 1000, 600);
  assert.deepEqual(alone.map(d => [d.x, d.y]), [[200, 200], [600, 300]], "apart already: nothing moves");
  const pair = separate([{ key: "a", x: 300, y: 300, r: 30 }, { key: "b", x: 320, y: 300, r: 30 }], 1000, 600, 10);
  assert.ok(!overlaps(pair, 10), "two overlapping dots ease apart");
  assert.ok(Math.abs(pair[0].x - 275) < 1 && Math.abs(pair[1].x - 345) < 1, "each moves half the overlap, along the line between them");
  const same = separate([{ key: "a", x: 300, y: 300, r: 30 }, { key: "b", x: 300, y: 300, r: 30 }], 1000, 600, 10);
  assert.ok(!overlaps(same, 10) && same[0].x < same[1].x, "exactly on top: parted sideways, the same way every time");
  const edge = separate([{ key: "a", x: -50, y: 700, r: 30 }], 1000, 600);
  assert.deepEqual([edge[0].x, edge[0].y], [30, 570], "a dot stays inside the plot");
});

test("crowded: ten items placed by fifty phones still sit apart", () => {
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const dots = Array.from({ length: 10 }, (_, i) => ({ key: `k${i}`, x: 400 + rnd() * 120, y: 250 + rnd() * 120, r: dotRadius(1 + Math.floor(rnd() * 50), 50, 34, 30) }));
  const placed = separate(dots, 1240, 600, 9);
  assert.ok(!overlaps(placed, 8), "no overlaps");
  assert.ok(placed.every(d => d.x >= d.r && d.x <= 1240 - d.r && d.y >= d.r && d.y <= 600 - d.r), "all inside the plot");
});

// ---------- INT-09 ----------
test("a private form answers its questions in words, up to a thousand characters each", () => {
  const questions = formOf({ questions: [{ key: "q1", text: "What would make this a win?" }, { key: "q2", text: "Anything else?" }, { bad: 1 }] });
  assert.equal(questions.length, 2);
  assert.deepEqual(formAnswer({}, questions).ok, false, "empty: held");
  const one = formAnswer({ q1: "  A plan we all believe in ", q2: "  " }, questions);
  assert.deepEqual(one, { ok: true, text: "Answered 1 of 2", value: { answers: { q1: "A plan we all believe in" } } });
  assert.equal(formAnswer({ q1: "x".repeat(maxFormAnswer + 1) }, questions).ok, false, "very long text: held, with the count shown");
  assert.deepEqual(formAnswersOf({ answers: { q1: "Yes", q2: 3 } }), { q1: "Yes" });
});

test("a private form's answers never reach the TV: the event carries only the count", () => {
  const frame = { status: "ok", role: "tv", topic: "t", version: 4, next: null, phone_depth: null, server_time: "", answers: [],
    state: { engagement_id: id(1), live_session_id: id(2), version: 4, tv_content: "session", phones_down: false, burst_ends_at: null, results: { total: 0, people: 0, words: [] } },
    session: { id: id(2), title: "Before we start", interaction: "form", prompt: "A few questions", state: "live", max_sends: 3, max_characters: 28, max_words: 3 } } as unknown as LiveSnapshot;
  const event = { state: { ...frame.state, version: 5, results: { total: 1, people: 1, words: [] } }, session: frame.session,
    answer: { id: id(3), session_id: id(2), text: null, answers: [], value: null, revision: 0 } } as unknown as LiveEvent;
  const next = applyLiveEvent(frame, event);
  assert.equal(next.kind, "applied");
  assert.equal(next.value.state.results.people, 1, "the count climbs");
  assert.equal(next.value.answers[0].value, undefined, "no value on the TV");
  assert.equal(next.value.answers[0].text, null, "no text on the TV");
});

// ---------- INT-10 ----------
test("a finger signature is stroke paths in a 600 by 200 field, whole numbers, bounded", () => {
  let s = addPoint(null, 10.4, 20.6);
  assert.equal(s, "M10 21");
  s = addPoint(s, 11, 21); assert.equal(s, "M10 21", "points too close to the last are skipped");
  s = addPoint(s, 40, 50); s = addPoint(s, 900, -30);
  assert.equal(s, "M10 21L40 50L600 0", "points stay inside the field");
  assert.deepEqual(strokesOf({ strokes: [s, "M1 2 <script>", 4, "M5 5"] }), [s, "M5 5"], "only plain paths are read");
  assert.equal(signaturePath(["M5 5", s]), "M5 5L5 5 M10 21L40 50L600 0", "a lone tap draws as a dot");
  assert.equal(inkLength(["M1 1L2 2"]), 8);
  assert.ok(maxInk < 7600, "the phone stops below the server's bound");
});

test("names arrive in the order people signed, and the wall is three columns", () => {
  assert.deepEqual(signersOf({ signers: [{ id: id(1), name: "Mark Ellis" }, { id: id(2), name: "Priya Shah" }, { nope: 1 }] }).map(s => s.name), ["Mark Ellis", "Priya Shah"]);
  assert.deepEqual(signersOf({}), [], "empty: no names");
  assert.deepEqual(signSpot({ signers: [{ id: id(1), name: "Mark Ellis" }] }, id(1)), { text: "Mark Ellis", meta: "Signed" }, "Spotlight lifts the name");
  assert.equal(signSpot({ signers: [] }, id(1)), null, "a hidden or unknown name lifts nothing");
  const cells = wallLayout(5, 1200, 3, 180, 40, 30);
  assert.deepEqual(cells.map(c => [Math.round(c.x), c.y]), [[0, 0], [413, 0], [827, 0], [0, 210], [413, 210]]);
  assert.equal(wallLayout(50, 1200, 3, 180, 40, 30).at(-1)!.y, 16 * 210, "crowded: fifty names, seventeen rows to roll through");
  assert.equal(signText({ text: "  We commit.\n\n## Our first goal\nLaunch it.  " }), "We commit.\n\n## Our first goal\nLaunch it.");
});

test("the phone's own signature stands alone: signing again replaces it", () => {
  const answers = [{ id: id(10), session_id: id(2), text: "Priya Shah", value: { name: "Priya Shah", strokes: ["M1 1L5 5"] }, revision: 0, withdrawn: false }];
  const outbox = [{ request: { id: id(10), session: id(2), revision: 1, action: "change" as const, text: "Priya", value: { strokes: ["M9 9L20 20"] }, sentAt: new Date().toISOString(), queuedAt: new Date().toISOString() }, state: "saved" as const }];
  const mine = ownAnswers(id(2), answers, outbox, false, true);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].status, "saved", "offline and queued: saved on this phone");
  assert.deepEqual(strokesOf(mine[0].value), ["M9 9L20 20"], "the newest strokes show");
});

// ---------- This step's presses ----------
test("merge, undo and close signing are checked before they reach the database", () => {
  assert.deepEqual(kindPress({ kind: "grid", id: id(1), action: "merge", from: id(2), item: "c3", into: "a1" }), { rpc: "grid_control", id: id(1), action: "merge", p: { from: id(2), item: "c3", into: "a1" } });
  assert.deepEqual(kindPress({ kind: "grid", id: id(1), action: "unmerge", from: null, item: "c3" })?.p, { from: null, item: "c3" });
  assert.equal(kindPress({ kind: "grid", id: id(1), action: "merge", from: id(2), item: "c3", into: "c3" }), null, "not into itself");
  assert.equal(kindPress({ kind: "grid", id: id(1), action: "merge", from: id(2), item: "C 3", into: "a1" }), null, "keys are checked");
  assert.equal(kindPress({ kind: "grid", id: "nope", action: "merge", from: id(2), item: "c3", into: "a1" }), null, "the press id is a uuid");
  assert.deepEqual(kindPress({ kind: "sign", id: id(1), action: "close", from: id(2) }), { rpc: "sign_control", id: id(1), action: "close", p: { from: id(2) } });
  assert.equal(kindPress({ kind: "sign", id: id(1), action: "reopen", from: id(2) }), null, "Reopen is the engine's own press");
  assert.deepEqual(kindPress({ kind: "sign", id: id(1), action: "unhide", from: id(2), item: id(9) })?.p, { from: id(2), item: id(9) }, "a hidden name comes back with its signature");
  assert.equal(kindPress({ kind: "sign", id: id(1), action: "unhide", from: id(2), item: "c3" }), null, "a name is unhidden by its answer id");
  assert.equal(kindPress({ kind: "form", id: id(1), action: "close", from: id(2) }), null);
});

test("new item keys are short and lower case, as the database expects", () => {
  for (let i = 0; i < 50; i++) assert.match(newKey(), /^[a-z0-9]{8}$/);
});
