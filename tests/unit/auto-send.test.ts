import assert from "node:assert/strict";
import { test } from "node:test";
import { QuietSend } from "../../lib/phone/auto-send";
import { PhoneOutbox } from "../../lib/phone/outbox";
import type { SubmissionRequest } from "../../lib/live/types";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const request = (id: string, value: number): SubmissionRequest => ({ id, session: "scale", revision: 0, action: "submit", text: String(value), value: { value }, sentAt: "2026-11-20T12:00:00Z" });
const memory = () => { const data = new Map<string, string>(); return { get: (k: string) => data.get(k) ?? null, set: (k: string, v: string) => { data.set(k, v); } }; };

test("one tap sends once, with unchanged taps suppressed", () => {
  const sent: number[] = [], queue = new QuietSend(0, n => sent.push(n));
  queue.schedule(2, true); queue.schedule(2, true); queue.schedule(3, true);
  assert.deepEqual(sent, [2, 3]); queue.cancel();
});

test("rapid changes send only the latest after one quiet period", async () => {
  const sent: number[] = [], queue = new QuietSend(0, n => sent.push(n), 20);
  queue.schedule(1); queue.schedule(2); queue.schedule(3);
  assert.deepEqual(sent, []);
  await wait(35); assert.deepEqual(sent, [3]);
  queue.schedule(4); queue.schedule(3);
  await wait(35); assert.deepEqual(sent, [3], "returning to the standing answer cancels pending changes");
  queue.schedule(5); queue.cancel(); await wait(35); assert.deepEqual(sent, [3], "closing or leaving cancels pending work");
});

test("offline selection replacements persist and reconnect sends only the latest; typed sends remain", async () => {
  let online = false;
  const store = memory(), sent: SubmissionRequest[] = [];
  const box = new PhoneOutbox("k", async r => { sent.push(r); return { status: "accepted" }; }, () => {}, () => {}, store, () => online);
  box.add(request("one", 1), true); box.add(request("two", 2), true); box.add(request("three", 3), true);
  assert.equal(box.entries.length, 1); assert.equal(box.entries[0].request.id, "three");
  assert.equal(box.entries[0].request.queuedAt, box.entries[0].request.sentAt);
  assert.equal(sent.length, 0, "offline selection does not start a request");
  box.stop();
  const reloaded = new PhoneOutbox("k", async r => { sent.push(r); return { status: "accepted" }; }, () => {}, () => {}, store, () => online);
  online = true; reloaded.kick(); await wait(0);
  assert.deepEqual(sent.map(r => r.id), ["three"]);
  reloaded.stop();
  online = false;
  const typed = new PhoneOutbox("t", async () => ({ status: "accepted" }), () => {}, () => {}, memory(), () => online);
  typed.add({ ...request("a", 1), value: undefined }); typed.add({ ...request("b", 2), value: undefined });
  assert.equal(typed.entries.length, 2); typed.stop();
});

test("an in-flight selection retains its idempotent request while a newer value waits", async () => {
  let finish!: (value: { status: string }) => void;
  const box = new PhoneOutbox("k", () => new Promise(resolve => { finish = resolve; }), () => {}, () => {}, memory());
  box.add(request("active", 1), true); box.add(request("new", 2), true); box.add(request("latest", 3), true);
  assert.deepEqual(box.entries.map(e => e.request.id), ["active", "latest"]);
  box.stop(); finish({ status: "accepted" }); await wait(0);
});
