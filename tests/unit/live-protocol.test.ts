import assert from "node:assert/strict";
import { test } from "node:test";
import { adoptSnapshot, applyLiveEvent, clockSample, retryDelay, snapshotDelay, submissionRequest } from "../../lib/live/protocol";
import { RoomStream, sendInOrder } from "../../lib/live/stream";
import type { LiveEvent, LiveRead, LiveSnapshot, SubmissionRequest } from "../../lib/live/types";
const id = "55000000-0000-4000-8000-000000000001", session = "55000000-0000-4000-8000-000000000002";
const snapshot = (version = 1): LiveRead => ({ status: "ok", version, topic: "live:fixture", role: "tv", next: null, phone_depth: null, server_time: new Date().toISOString(), answers: [], session: null,
  state: { engagement_id: id, live_session_id: session, version, tv_content: "session", phones_down: false, burst_ends_at: null, results: { total: 0, people: 0, words: [] } } });
const input = (): SubmissionRequest => ({ id, session, revision: 0, action: "submit", text: "Hope", sentAt: new Date().toISOString() });
test("room events are atomic, ordered, deduplicated and never rewind after a snapshot race", () => {
  const first = snapshot();
  const event: LiveEvent = { ...snapshot(2), answer: { id: "answer", session_id: session, text: "Hope", answers: [{ text: "Hope", key: "hope" }], revision: 0 } };
  const applied = applyLiveEvent(first, event); assert.equal(applied.kind, "applied"); assert.equal(applied.value.answers.length, 1);
  assert.equal(applyLiveEvent(applied.value, event).kind, "same");
  assert.equal(applyLiveEvent(applied.value, snapshot(4)).kind, "snapshot");
  assert.equal(adoptSnapshot(applied.value, first), applied.value);
  assert.equal(applyLiveEvent(first, { ...event, state: { ...event.state, engagement_id: "other" } }).kind, "snapshot");
  assert.equal(applyLiveEvent(first, { ...event, state: { ...event.state, live_session_id: "other" } }).kind, "snapshot");
  assert.equal(applyLiveEvent(applied.value, { ...snapshot(3), state: { ...snapshot(3).state, hidden_ids: ["answer"] } }).value.answers.length, 0);
  assert.equal(applyLiveEvent(applied.value, { ...snapshot(3), answer: { ...event.answer!, withdrawn: true } }).value.answers.length, 0);
});
test("submissions reject invalid ids, revisions, timestamps and non-finite clock measurements", () => {
  assert.ok(submissionRequest(input()));
  for (const change of [{ id: "bad" }, { revision: -1 }, { revision: 0.5 }, { sentAt: "invalid" }, { queuedAt: "invalid" }, { uncertaintyMs: Infinity }, { uncertaintyMs: -1 }, { text: "" }, { action: "approve" }]) assert.equal(submissionRequest({ ...input(), ...change }), null);
  assert.deepEqual(clockSample(1000, 1100, 1200), { offsetMs: 150, uncertaintyMs: 50 });
  assert.throws(() => clockSample(2, 1, 3));
  assert.equal(snapshotDelay(true), 5000); assert.equal(snapshotDelay(false), 1500);
  assert.equal(retryDelay(0, () => 0), 375); assert.ok(retryDelay(20, () => 1) <= 37500);
});
test("outbox retry preserves ids and serial order without simultaneous requests", async () => {
  const a = input(), b = { ...input(), id: session }; const queue = [a, b], calls: string[] = [], settled: string[] = [];
  let retry = true, active = 0;
  await sendInOrder(queue, async item => { assert.equal(active++, 0); await Promise.resolve(); calls.push(item.id); active--; if (retry) { retry = false; return "retry"; } return "settled"; }, item => settled.push(item.id), new AbortController().signal, async delay => { assert.ok(delay > 0); });
  assert.deepEqual(calls, [id, id, session]); assert.deepEqual(settled, [id, session]); assert.equal(queue.length, 0);
});
test("stream recovers a version gap and ignores an older snapshot arriving after a newer event", async () => {
  let receive!: (event: LiveEvent) => void, reads = 0, stopCount = 0;
  let release!: (value: LiveRead) => void;
  const views: LiveSnapshot[] = [];
  const stream = new RoomStream({ read: async () => ++reads === 1 ? snapshot() : reads === 2 ? new Promise(resolve => { release = resolve; }) : snapshot(3), render: value => views.push(value), mode: () => {},
    subscribe: (_read, event) => { receive = event; return () => { stopCount++; }; } });
  stream.start(); await new Promise(resolve => setImmediate(resolve));
  receive(snapshot(3)); await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 2); receive(snapshot(2)); release(snapshot(1)); await new Promise(resolve => setImmediate(resolve));
  assert.equal(views.at(-1)!.version, 3); assert.equal(reads, 3); stream.stop(); assert.equal(stopCount, 1);
});
