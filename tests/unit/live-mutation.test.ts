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
