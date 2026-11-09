import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { roomMutation } from "../../lib/live/mutation";

const client = {} as SupabaseClient, room = "55000000-0000-4000-8000-000000000001";
const unavailable = { error: { code: "P0001", message: "Room broadcast unavailable" } };
test("only a confirmed broadcast rollback permits a single retry with a live private connection", async () => {
  const events: string[] = []; let attempts = 0;
  const result = await roomMutation(client, room, async () => { events.push("write"); return ++attempts === 1 ? unavailable : { error: null }; },
    async (caller, engagement) => { assert.equal(caller, client); assert.equal(engagement, room); events.push("connect"); return async () => { events.push("close"); }; });
  assert.equal(result.error, null); assert.deepEqual(events, ["write", "connect", "write", "close"]);
});
test("successful, denied, timed-out and ambiguous writes are never replayed", async () => {
  for (const outcome of [{ error: null }, { error: { code: "42501", message: "denied" } }, { error: { code: "P0001", message: "another failure" } }, { error: { code: "", message: "fetch failed" } }]) {
    let writes = 0;
    assert.equal(await roomMutation(client, room, async () => { writes++; return outcome; }, async () => { assert.fail("No recovery for an unconfirmed rollback"); }), outcome);
    assert.equal(writes, 1);
  }
});
test("failed recovery stays bounded and cleanup never turns a committed write into an error", async () => {
  let writes = 0;
  assert.equal(await roomMutation(client, room, async () => { writes++; return unavailable; }, async () => { throw new Error("offline"); }), unavailable);
  assert.equal(writes, 1);
  writes = 0; let closes = 0;
  assert.equal(await roomMutation(client, room, async () => { writes++; return unavailable; }, async () => async () => { closes++; }), unavailable);
  assert.equal(writes, 2); assert.equal(closes, 1);
  writes = 0;
  assert.equal((await roomMutation(client, room, async () => ++writes === 1 ? unavailable : { error: null }, async () => async () => { throw new Error("cleanup"); })).error, null);
});

import { queuedWrite } from "../../lib/live/mutation";
const timedOut = { error: { code: "57014", message: "canceling statement due to statement timeout" } };
test("a write cancelled while it waits for the room lock is sent again, a bounded number of times", async () => {
  let writes = 0; const lines: Record<string, unknown>[] = [];
  const result = await queuedWrite(async () => ++writes < 3 ? timedOut : { error: null }, { log: line => lines.push(line) });
  assert.equal(result.error, null); assert.equal(writes, 3); assert.equal(lines.length, 2);
  writes = 0;
  assert.equal(await queuedWrite(async () => { writes++; return timedOut; }, { log: () => {} }), timedOut);
  assert.equal(writes, 3, "two repeats, then the failure stands");
});
test("only a statement timeout is repeated, and the repeat stops once its time budget is spent", async () => {
  for (const outcome of [{ error: null }, { error: { code: "42501", message: "denied" } }, { error: { code: "P0001", message: "Room broadcast unavailable" } }, { error: { code: "", message: "fetch failed" } }]) {
    let writes = 0;
    assert.equal(await queuedWrite(async () => { writes++; return outcome; }), outcome);
    assert.equal(writes, 1);
  }
  let clock = 0, writes = 0;
  await queuedWrite(async () => { writes++; clock += 9000; return timedOut; }, { now: () => clock, budgetMs: 10000, log: () => {} });
  assert.equal(writes, 2, "after 18 seconds of waiting there is no third try");
});
test("a repeat gets its attempt number, so it can carry the queued time, and a lock timeout is repeated too", async () => {
  const seen: number[] = [], lockTimeout = { error: { code: "55P03", message: "canceling statement due to lock timeout" } };
  await queuedWrite(async attempt => { seen.push(attempt); return attempt < 2 ? (attempt ? lockTimeout : timedOut) : { error: null }; }, { log: () => {} });
  assert.deepEqual(seen, [0, 1, 2]);
  const queued = (attempt: number) => attempt ? "2026-11-09T05:20:00Z" : null;
  assert.equal(queued(seen[0]), null, "the first attempt keeps the original queued time");
  assert.ok(queued(seen[1]) && queued(seen[2]), "attempt 1 and later carry the sent time as the queued time");
});
