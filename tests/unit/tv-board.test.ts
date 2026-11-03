import assert from "node:assert/strict";
import { test } from "node:test";
import { applyLiveEvent } from "../../lib/live/protocol";
import type { LiveEvent, LiveSnapshot } from "../../lib/live/types";
import { TvFlow, controlsOf } from "../../lib/tv/flow";
import { ArrivalSchedule, planField, springRate, springStep, wordSize } from "../../lib/tv/motion";
import { screenType } from "../../lib/tv/policy";

// The Clearway Live token values (live_tokens.css). The browser reads them from CSS.
const timing = { stagger: 120, staggerMin: 30, maxHold: 1500, newHold: 1200 };
const frameMs = 1000 / 60;
const engagement = "66000000-0000-4000-8000-000000000001", session = "66000000-0000-4000-8000-000000000002";
const id = (n: number) => `66000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function run<T>(schedule: ArrivalSchedule<T>, from: number, until: number) {
  const batches: { at: number; items: T[]; holds: number[]; lone: boolean }[] = [];
  for (let now = from; now <= until; now += frameMs) { const batch = schedule.tick(now); if (batch) batches.push({ at: now, ...batch }); }
  return batches;
}

test("Fifty answers at once flow steadily in batches, none held past 1.5 seconds", () => {
  const schedule = new ArrivalSchedule<number>(timing);
  for (let i = 0; i < 50; i++) schedule.push(i, 0);
  const batches = run(schedule, 0, 3000);
  const released = batches.flatMap(batch => batch.items), holds = batches.flatMap(batch => batch.holds);
  assert.deepEqual(released, [...Array(50).keys()], "every answer arrives, in order, once");
  assert.ok(Math.max(...holds) < timing.maxHold, `max hold ${Math.max(...holds)}`);
  assert.ok(batches.length >= 8, "a steady flow, not one jump");
  for (let i = 1; i < batches.length; i++) {
    const gap = batches[i].at - batches[i - 1].at, oldest = batches[i].holds[0];
    assert.ok(gap >= timing.stagger - 0.01 || oldest >= timing.maxHold - 100 - frameMs, `batches no more often than the stagger (gap ${gap})`);
  }
  assert.ok(batches.every(batch => !batch.lone), "no Lime moment during a flow");
  assert.equal(schedule.waiting, 0);
});

test("Only a lone arrival takes the newest-arrival moment", () => {
  const schedule = new ArrivalSchedule<string>(timing);
  schedule.push("first", 5000);
  const [first] = run(schedule, 5000, 5400);
  assert.equal(first.lone, true);
  assert.ok(first.holds[0] <= frameMs + 0.01, "a lone answer is not held");
  schedule.push("soon after", 5600);
  assert.equal(run(schedule, 5600, 6000)[0].lone, false, "within cwl-dur-new-hold of the last arrival");
  schedule.push("later", 9000);
  assert.equal(run(schedule, 9000, 9400)[0].lone, true);
  schedule.push("a", 12000); schedule.push("b", 12000);
  assert.ok(run(schedule, 12000, 13000).every(batch => !batch.lone));
});

test("A replay or control lands everything waiting in one pass", () => {
  const schedule = new ArrivalSchedule<number>(timing);
  for (let i = 0; i < 20; i++) schedule.push(i, 0);
  run(schedule, 0, 200);
  const rest = schedule.drain(250);
  assert.ok(rest.length > 0 && rest.length < 20);
  assert.equal(schedule.waiting, 0);
  assert.ok(schedule.maxHold < timing.maxHold);
});

test("The spring keeps its speed when retargeted and settles without overshoot", () => {
  const omega = springRate(1200);
  let [x, v] = [0, 0];
  for (let t = 0; t < 0.3; t += 1 / 60) [x, v] = springStep(x, v, 100, omega, 1 / 60);
  const before = v;
  [x, v] = springStep(x, v, 160, omega, 1 / 60);
  assert.ok(v > 0 && Math.abs(v - before) < before * 0.5, "a new target bends the motion; it never resets it");
  let peak = x;
  for (let t = 0; t < 3; t += 1 / 60) { [x, v] = springStep(x, v, 160, omega, 1 / 60); peak = Math.max(peak, x); }
  assert.ok(Math.abs(x - 160) < 0.5, "settled over cwl-dur-regroup");
  assert.ok(peak <= 160.5, "critically damped: no overshoot");
  // No frame jumps: speed changes smoothly between frames.
  [x, v] = [0, 0]; let last = 0, jumps = 0;
  for (let t = 0; t < 2; t += 1 / 60) { const [nx, nv] = springStep(x, v, t < 0.5 ? 100 : 40, omega, 1 / 60); if (Math.abs(nx - x - last) > 4) jumps++; last = nx - x; x = nx; v = nv; }
  assert.equal(jumps, 0);
});

test("Word size follows the square root of the count, matching the server", () => {
  assert.equal(wordSize(1, 1, 56, 168), 56);
  assert.equal(wordSize(9, 9, 56, 168), 168);
  assert.equal(wordSize(4, 9, 56, 168), 56 + 112 * (2 - 1) / (3 - 1));
  assert.ok(wordSize(2, 16, 56, 168) < wordSize(3, 16, 56, 168));
});

test("The field plans without overlaps and keeps every item in its place when it can", () => {
  const overlaps = (placed: { x: number; y: number; w: number; h: number }[]) => placed.some((a, i) => placed.some((b, j) => i < j
    && Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2));
  const words = ["youth", "alpha", "baptisms", "momentum", "welcome", "families"].map((key, i) => ({ key, w: 180 + i * 40, h: 70 + (i % 3) * 20 }));
  const first = planField(words, 1700, 560, 40, 6);
  assert.equal(first.ok, true); assert.equal(overlaps(first.placed), false);
  assert.ok(first.placed.every(p => p.x - p.w / 2 >= 0 && p.x + p.w / 2 <= 1700 && p.y - p.h / 2 >= 0 && p.y + p.h / 2 <= 560));
  // A new word arrives: everything already placed keeps its place, the newcomer takes the free spot nearest the middle.
  const next = planField([...words.map((w, i) => ({ ...w, x: first.placed[i].x, y: first.placed[i].y })), { key: "hope", w: 150, h: 70 }], 1700, 560, 40, 6);
  assert.equal(overlaps(next.placed), false);
  words.forEach((w, i) => assert.deepEqual([next.placed[i].x, next.placed[i].y], [first.placed[i].x, first.placed[i].y], `${w.key} kept its place`));
  // More than fits: the planner says so, so every size steps down together.
  assert.equal(planField(Array.from({ length: 40 }, (_, i) => ({ key: `w${i}`, w: 400, h: 120 })), 1700, 560, 40, 6).ok, false);
});

function frame(version: number, answers: { id: string; text: string }[], state: Partial<LiveSnapshot["state"]> = {}): LiveSnapshot {
  return { status: "ok", role: "tv", topic: "t", version, next: null, phone_depth: null, server_time: new Date().toISOString(),
    session: { id: session, title: "Celebration", interaction: "word_cloud", prompt: "One word", state: "live", max_sends: 3, max_characters: 28, max_words: 3, revision: 1 },
    answers: answers.map(a => ({ ...a, session_id: session, revision: 0, answers: [{ text: a.text, key: a.text.toLowerCase() }] })),
    state: { engagement_id: engagement, live_session_id: session, version, tv_content: "session", phones_down: false, burst_ends_at: null,
      results: { total: answers.length, people: answers.length, words: [] }, ...state } };
}

test("Answers wait their turn on the TV; controls and replays land at once with everything waiting", () => {
  let now = 0;
  const flow = new TvFlow(timing, () => now), shown: string[][] = [];
  flow.subscribe(s => shown.push(s.fresh));
  flow.offer(frame(1, []));
  assert.deepEqual(shown, [[]], "the first frame shows at once");
  const answers: { id: string; text: string }[] = [];
  for (let i = 0; i < 6; i++) {
    answers.push({ id: id(i), text: `word${i}` });
    const next = frame(2 + i, [...answers]);
    flow.offer(next, { state: next.state, session: next.session, answer: { ...next.answers[i] } } as LiveEvent);
  }
  assert.equal(shown.length, 1, "arrivals are held for the flow, not applied on receipt");
  assert.equal(flow.waiting, 6);
  for (; now < 400; now += frameMs) flow.tick();
  assert.ok(shown.length > 1 && flow.waiting < 6, "released in batches");
  const control = frame(8, [...answers], { phones_down: true });
  flow.offer(control, { state: control.state, session: control.session } as LiveEvent);
  assert.equal(flow.waiting, 0);
  assert.equal(flow.current!.replay, true);
  assert.deepEqual(new Set(shown.flat()), new Set(answers.map(a => a.id)), "every answer reached the board exactly once");
  assert.equal(shown.flat().length, 6);
  assert.ok(flow.maxHold < timing.maxHold);
});

test("Hiding and session changes are controls, not arrivals", () => {
  const base = frame(3, [{ id: id(1), text: "hope" }]);
  const hide = frame(4, [], { hidden_ids: [id(1)] });
  assert.notEqual(controlsOf(base), controlsOf(hide));
  const flow = new TvFlow(timing, () => 0); let count = 0;
  flow.subscribe(() => count++);
  flow.offer(base);
  flow.offer(hide, { state: hide.state, session: hide.session, answer: { ...base.answers[0], hidden: true } } as LiveEvent);
  assert.equal(count, 2, "a hide lands at once");
  const other = { ...frame(5, []), state: { ...frame(5, []).state, live_session_id: id(99) } };
  flow.offer(other, { state: other.state, session: other.session, answer: { ...base.answers[0] } } as LiveEvent);
  assert.equal(count, 3, "a new session never waits behind the old one");
});

test("A changed answer keeps its place on the wall", () => {
  const current = { ...frame(2, [{ id: id(1), text: "first" }]), answers: [{ id: id(1), session_id: session, text: "first", revision: 0, answers: [], created_at: "2026-11-01T10:00:00Z" }] };
  const next = frame(3, []);
  const result = applyLiveEvent(current, { state: next.state, session: next.session, answer: { id: id(1), session_id: session, text: "changed", revision: 1, answers: [] } });
  assert.equal(result.kind, "applied");
  assert.equal(result.value.answers[0].text, "changed");
  assert.equal(result.value.answers[0].created_at, "2026-11-01T10:00:00Z");
});

test("Texture follows the screen type", () => {
  const f = frame(1, []);
  assert.equal(screenType(f), "input");
  assert.equal(screenType({ ...f, session: { ...f.session!, interaction: "content" } }), "content");
  assert.equal(screenType({ ...f, state: { ...f.state, tv_content: "join" } }), "holding");
  assert.equal(screenType({ ...f, state: { ...f.state, tv_content: "screen_check" } }), "content");
  assert.equal(screenType(null), "holding");
});

test("A catch-up snapshot counts its new answers as received; opening and other sessions do not", async () => {
  const { snapshotArrivals } = await import("../../lib/tv/receipts");
  const before = frame(3, [{ id: id(1), text: "hope" }]);
  const after = frame(5, [{ id: id(1), text: "hope" }, { id: id(2), text: "youth" }]);
  assert.deepEqual(snapshotArrivals(before, after), [{ id: id(2), revision: 0 }]);
  assert.deepEqual(snapshotArrivals(null, after), [], "the first frame after opening is a baseline");
  const other = { ...after, state: { ...after.state, live_session_id: id(99) } };
  assert.deepEqual(snapshotArrivals(before, other), [], "another session's answers were not just delivered");
  const changed = { ...after, answers: after.answers.map(a => a.id === id(1) ? { ...a, revision: 1 } : a) };
  assert.equal(snapshotArrivals(after, changed).length, 1, "a change is a new revision");
});

test("The latency report's verdict, window and percentiles", async () => {
  const { percentile, reportWindow, verdict } = await import("../../lib/latency/report");
  assert.equal(verdict({ measured: 100, under_second: 95 }).met, true);
  assert.equal(verdict({ measured: 100, under_second: 94 }).met, false);
  assert.match(verdict({ measured: 0, under_second: 0 }).label, /No answers/);
  const now = Date.parse("2026-11-02T20:00:00Z");
  assert.deepEqual(reportWindow(null, null, now), { from: "2026-11-02T08:00:00.000Z", to: "2026-11-02T20:00:00.000Z" }, "the last 12 hours by default");
  assert.equal(reportWindow("2026-10-01T00:00:00Z", null, now).from, "2026-11-02T08:00:00.000Z", "more than 7 days falls back");
  assert.equal(reportWindow("2026-11-02T19:00:00Z", "2026-11-02T19:30:00Z", now).to, "2026-11-02T19:30:00.000Z");
  assert.equal(percentile([], 0.95), null);
  assert.equal(percentile([100, 200, 300, 400, 500], 0.5), 300);
  assert.equal(percentile([100, 200, 300, 400, 500], 1), 500);
});
