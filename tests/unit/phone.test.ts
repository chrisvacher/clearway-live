import assert from "node:assert/strict";
import { test } from "node:test";
import { PhoneOutbox } from "../../lib/phone/outbox";
import { checkAnswer, keepSettled, limitHint, ownAnswers, selfListHidden, sendsUsed, settledReason, type SettledAnswer } from "../../lib/phone/policy";
import type { OutboxEntry, OwnAnswer } from "../../lib/phone/types";
import type { SubmissionRequest } from "../../lib/live/types";

const cloud = { interaction: "word_cloud" as const, max_sends: 3, max_characters: 28, max_words: 3 };
const wall = { interaction: "wall" as const, max_sends: 5, max_characters: 20, max_words: 40 };
const request = (id: string, extra: Partial<SubmissionRequest> = {}): SubmissionRequest => ({ id, session: "s1", revision: 0, action: "submit", text: id, sentAt: "2026-11-01T12:00:00.000Z", ...extra });
const memory = () => { const data = new Map<string, string>(); return { data, get: (k: string) => data.get(k) ?? null, set: (k: string, v: string) => { data.set(k, v); } }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test("limits hold Send and say why, never cutting an answer", () => {
  assert.deepEqual(checkAnswer("", cloud), { ok: false, message: "", count: "0 / 28" });
  assert.equal(checkAnswer("Hope, joy", cloud).ok, true);
  assert.match(checkAnswer("one two three four", cloud).message, /4 words\. Keep it to 3\./);
  assert.match(checkAnswer("a,b,c,d,e,f", cloud).message, /Up to 5 answers/);
  assert.match(checkAnswer("a,,b", cloud).message, /empty answer/);
  assert.match(checkAnswer("x".repeat(29), cloud).message, /28 characters/);
  const over = checkAnswer("y".repeat(23), wall);
  assert.equal(over.ok, false); assert.equal(over.count, "23 / 20"); assert.match(over.message, /3 characters over/);
  assert.equal(checkAnswer("👋".repeat(20), wall).ok, true, "characters are counted, not code units");
  assert.equal(limitHint(cloud), "Up to 3 words"); assert.equal(limitHint({ ...cloud, max_words: 1 }), "Up to 1 word"); assert.equal(limitHint(wall), "Up to 20 characters");
});

test("every send counts toward the limit, including withdrawn and queued ones", () => {
  const answers: OwnAnswer[] = [{ id: "a", session_id: "s1", text: "A", revision: 1, withdrawn: true }, { id: "b", session_id: "s2", text: "B", revision: 0, withdrawn: false }];
  const outbox: OutboxEntry[] = [{ request: request("c"), state: "saved" }, { request: request("a", { action: "change", revision: 2 }), state: "saved" }, { request: request("d"), state: "failed" }];
  assert.equal(sendsUsed("s1", answers, outbox), 2);
});

test("own answers show Sent, Saved on this phone, Sending and Not sent, newest change winning", () => {
  const answers: OwnAnswer[] = [{ id: "a", session_id: "s1", text: "Old", revision: 0, withdrawn: false }, { id: "w", session_id: "s1", text: "Gone", revision: 1, withdrawn: true }];
  const outbox: OutboxEntry[] = [
    { request: request("a", { action: "change", revision: 1, text: "New", queuedAt: "x" }), state: "saved" },
    { request: request("b"), state: "sending" },
    { request: request("c", { queuedAt: "x" }), state: "sending" },
    { request: request("d"), state: "failed", reason: "This step closed before your answer arrived." },
    { request: request("e", { session: "s2" }), state: "saved" },
  ];
  const offline = ownAnswers("s1", answers, outbox, false);
  assert.deepEqual(offline.map(a => [a.id, a.text, a.status]), [["a", "New", "saved"], ["b", "b", "sent"], ["c", "c", "saved"], ["d", "d", "failed"]]);
  assert.equal(ownAnswers("s1", answers, outbox, true).find(a => a.id === "c")!.status, "sending");
  const withdrawn = ownAnswers("s1", answers, [{ request: request("a", { action: "withdraw", revision: 1, text: "" }), state: "saved" }], true);
  assert.equal(withdrawn.length, 0, "a withdrawal hides the answer at once");
  const stale = ownAnswers("s1", [{ id: "a", session_id: "s1", text: "Server", revision: 2, withdrawn: false }], [{ request: request("a", { action: "change", revision: 1, text: "Older" }), state: "saved" }], true);
  assert.equal(stale[0].text, "Server");
});

test("an answer the server accepted stays on the phone only until a later read, so cleared test answers leave the phone", () => {
  const settled: SettledAnswer[] = [{ id: "t", session_id: "s1", text: "rehearsing", revision: 0, withdrawn: false, settledAt: 1000 }, { id: "n", session_id: "s1", text: "new", revision: 0, withdrawn: false, settledAt: 3000 }];
  assert.deepEqual(keepSettled(settled, 500).map(a => a.id), ["t", "n"], "a read that began before it settled may not include it yet");
  const kept = keepSettled(settled, 2000);
  assert.deepEqual(kept.map(a => a.id), ["n"], "a read that began after it settled decides");
  // Clear test answers removed "t" on the server: the phone no longer shows it or counts it.
  assert.equal(sendsUsed("s1", kept, []), 1);
  assert.deepEqual(ownAnswers("s1", kept, [], true).map(a => a.text), ["new"]);
});

test("settled outcomes are never retried; anything else waits", () => {
  assert.equal(settledReason("accepted"), ""); assert.equal(settledReason("duplicate"), "");
  for (const status of ["closed", "limit", "filtered", "invalid_answer", "conflict"]) assert.ok(settledReason(status));
  for (const status of ["denied", "unavailable", "rate_limited", "whatever"]) assert.equal(settledReason(status), null);
});

test("the outbox sends one at a time, in order, with the same request on every retry", async () => {
  const store = memory(), sent: SubmissionRequest[] = [], settled: string[] = [];
  let fail = true, inFlight = 0, most = 0;
  const box = new PhoneOutbox("k", async r => { inFlight++; most = Math.max(most, inFlight); sent.push(r); await tick(); inFlight--; if (fail) throw new Error("offline"); return { status: "accepted" }; },
    () => {}, r => settled.push(r.id), store, () => true);
  box.add(request("1")); box.add(request("2"));
  await tick(); await tick();
  assert.deepEqual(sent.map(r => r.id), ["1"], "a failed send waits; nothing after it jumps ahead");
  const stored = JSON.parse(store.data.get("k")!) as OutboxEntry[];
  assert.equal(stored.length, 2); assert.equal(stored[0].request.queuedAt, stored[0].request.sentAt, "a send that had to wait is marked queued");
  fail = false; box.kick();
  for (let i = 0; i < 10 && settled.length < 2; i++) await tick();
  assert.deepEqual(settled, ["1", "2"]); assert.equal(most, 1);
  const retries = sent.filter(r => r.id === "1");
  assert.equal(retries[1].sentAt, retries[0].sentAt); assert.equal(retries[1].revision, retries[0].revision);
  assert.deepEqual(JSON.parse(store.data.get("k")!), []);
  box.stop();
});

test("the outbox keeps settled refusals for the person and survives a reload", async () => {
  const store = memory();
  store.set("k", JSON.stringify([{ request: request("1"), state: "sending" }, { request: request("2"), state: "saved" }, { nonsense: true }]));
  const reasons: string[] = [];
  const box = new PhoneOutbox("k", async r => ({ status: r.id === "1" ? "closed" : "accepted" }), () => {}, (_, reason) => reasons.push(reason), store, () => true);
  assert.equal(box.entries.length, 2); assert.equal(box.entries[0].state, "saved", "a send cut off by a reload is retried");
  box.kick(); for (let i = 0; i < 10 && reasons.length < 2; i++) await tick();
  assert.deepEqual(reasons, ["This step closed before your answer arrived.", ""]);
  assert.equal(box.entries.length, 1); assert.equal(box.entries[0].state, "failed");
  box.dismiss("1", 0); assert.equal(box.entries.length, 0);
  box.stop();
});

test("an answer written offline is marked queued from the start", () => {
  const store = memory();
  const box = new PhoneOutbox("k", async () => new Promise(() => {}), () => {}, () => {}, store, () => false);
  box.add(request("1"));
  assert.equal(box.entries[0].request.queuedAt, "2026-11-01T12:00:00.000Z");
  box.stop();
});

test("the self-paced list hides only under a live step that takes input", () => {
  assert.equal(selfListHidden(true, true, true), true, "a live input step hides it");
  assert.equal(selfListHidden(true, true, false), false, "a live content step (a holding screen) leaves it visible");
  assert.equal(selfListHidden(false, false, true), false);
  assert.equal(selfListHidden(true, false, true), false);
});
