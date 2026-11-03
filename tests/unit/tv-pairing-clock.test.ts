import assert from "node:assert/strict";
import { test } from "node:test";
import { pairCodeView, pairOverdueMs, pairPollDelay, pairPollMs, pairReply, pairRetryMs, pairSample, pairShowMs, pairSkewMs, pairTickDelay, unknownPairClock } from "../../lib/tv/pair-clock";
import { TvSync, pairFailureCapMs, pairedPollMs, type TvSyncReply, type TvSyncView } from "../../lib/tv/sync";

const base = Date.parse("2026-11-03T00:27:00.000Z"), expires = new Date(base + 300000).toISOString();

test("a pairing code leaves the TV before its server expiry, whatever the TV computer's clock says", () => {
  const exact = { offsetMs: 0, uncertaintyMs: 0 };
  assert.equal(pairShowMs(expires, base, exact), 300000 - pairSkewMs);
  assert.deepEqual(pairCodeView(expires, base, exact), { shown: true, seconds: 300 });
  assert.deepEqual(pairCodeView(expires, base + 300000 - pairSkewMs, exact), { shown: false, seconds: 0 });
  assert.deepEqual(pairCodeView(expires, base + 300000 - pairSkewMs - 1, exact), { shown: true, seconds: 1 });
  // A TV computer 37 seconds slow sees the server's expiry 37 seconds late on
  // its own clock. Measured against the server it retires the code on time.
  const slow = 37000, fromTv = pairSample(base - slow, base - slow + 80, new Date(base + 40).toISOString());
  assert.equal(fromTv.offsetMs, slow); assert.equal(fromTv.uncertaintyMs, 40);
  const serverExpiryOnTvClock = base + 300000 - slow;
  assert.equal(pairCodeView(expires, serverExpiryOnTvClock - 1, fromTv).shown, false, "gone before the server's expiry");
  assert.equal(pairCodeView(expires, serverExpiryOnTvClock - pairSkewMs - 40 - 1, fromTv).shown, true, "and not earlier than needed");
  // A fast TV computer would otherwise drop the code early; it keeps it for the server's full life.
  const fast = pairSample(base + 60000, base + 60010, new Date(base + 5).toISOString());
  assert.equal(pairCodeView(expires, base + 60000 + 290000, fast).shown, true);
  // The round trip widens the margin: the server's clock could be anywhere within it.
  assert.ok(pairShowMs(expires, base, { offsetMs: 0, uncertaintyMs: 900 }) < pairShowMs(expires, base, exact));
});

test("bad or missing times never keep a code on screen", () => {
  assert.deepEqual(pairCodeView("not a date", base, unknownPairClock), { shown: false, seconds: 0 });
  assert.equal(pairCodeView(expires, NaN, unknownPairClock).shown, false);
  assert.equal(pairCodeView(expires, base, { offsetMs: NaN, uncertaintyMs: 0 }).shown, false);
  // Without a server time, the TV falls back to its own clock with the round trip as its margin.
  assert.deepEqual(pairSample(base, base + 300, undefined), { offsetMs: 0, uncertaintyMs: 150 });
  assert.deepEqual(pairSample(base, base + 300, "garbage"), { offsetMs: 0, uncertaintyMs: 150 });
  assert.deepEqual(pairSample(base + 10, base, new Date(base).toISOString()), { offsetMs: 0, uncertaintyMs: 0 });
});

test("the countdown ticks on whole seconds and lands exactly when the code leaves", () => {
  const exact = { offsetMs: 0, uncertaintyMs: 0 }, leave = base + 300000 - pairSkewMs;
  assert.equal(pairTickDelay(expires, leave - 2500, exact), 500);
  assert.equal(pairTickDelay(expires, leave - 3000, exact), 1000);
  assert.equal(pairTickDelay(expires, leave - 400, exact), 400);
  assert.equal(pairTickDelay(expires, leave + 1, exact), pairPollMs);
  assert.ok(pairTickDelay(expires, leave - 1, exact) >= 16);
});

test("the TV asks for the replacement just after the database's clock passes expiry", () => {
  const exact = { offsetMs: 0, uncertaintyMs: 0 }, clock = { offsetMs: 0, uncertaintyMs: 30 }, serverExpiry = base + 300000;
  assert.equal(pairPollDelay(expires, base, exact), pairPollMs, "usual cadence while the code is fresh");
  // Near the end the next poll lands just past the database's expiry, never before it.
  for (const now of [serverExpiry - 900, serverExpiry - 500, serverExpiry - 300]) {
    const delay = pairPollDelay(expires, now, clock);
    assert.ok(delay >= pairRetryMs && delay <= pairPollMs, `${delay}`);
    assert.ok(now + delay - clock.uncertaintyMs >= serverExpiry || delay === pairRetryMs, "the poll reaches the server after expiry");
    assert.ok(now + delay <= serverExpiry + pairSkewMs + 2 * clock.uncertaintyMs + pairRetryMs, "and soon after it");
  }
  assert.equal(pairPollDelay(expires, serverExpiry + 100, clock), pairRetryMs, "an overdue code is asked about quickly");
  assert.equal(pairPollDelay(expires, serverExpiry + pairOverdueMs + 1000, clock), pairPollMs, "then at the usual pace if the server has not replaced it");
  assert.equal(pairPollDelay("bad", base, clock), pairPollMs);
});

test("the server shows the code it holds and stamps its own time", () => {
  const state = { code_hash: "b".repeat(64), expires_at: expires }, at = base + 1234;
  assert.deepEqual(pairReply(state, { code: "123456", hash: "b".repeat(64) }, null, at), { status: "pair", code: "123456", expires_at: expires, server_time: new Date(at).toISOString() });
  // A poll that offers a new code keeps the one the server still holds, from its cookie.
  assert.deepEqual(pairReply(state, { code: "123456", hash: "a".repeat(64) }, { code: "004321", hash: "b".repeat(64) }, at), { status: "pair", code: "004321", expires_at: expires, server_time: new Date(at).toISOString() });
  assert.deepEqual(pairReply(state, { code: "123456", hash: "a".repeat(64) }, { code: "004321", hash: "c".repeat(64) }, at), { status: "opening" });
});

// A fake clock and timer queue for the TV's pairing loop.
function harness(replies: ((at: number) => TvSyncReply)[], skewMs = 0, latencyMs = 40) {
  let now = base;
  const timers = new Map<number, { at: number; run: () => void }>(); let next = 1;
  const views: { at: number; view: TvSyncView }[] = [], asked: number[] = [];
  const request = async () => {
    asked.push(now); const sentAt = now; now += latencyMs;
    const reply = (replies.length > 1 ? replies.shift()! : replies[0])(sentAt + latencyMs / 2 + skewMs);
    return reply;
  };
  const sync = new TvSync({ status: "opening" }, request, view => views.push({ at: now, view }), () => now,
    { set: (run, ms) => { const id = next++; timers.set(id, { at: now + ms, run }); return id; }, clear: id => { timers.delete(id as number); } });
  async function advance(to: number) {
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= to).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); now = Math.max(now, due[1].at); due[1].run();
      for (let i = 0; i < 5; i++) await Promise.resolve();
    }
    now = Math.max(now, to);
  }
  return { sync, views, asked, advance, clockNow: () => now, flush: async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); } };
}

// The server: one code per five minutes, replaced on the first ask after expiry.
function server() {
  const codes: { code: string; expires: number }[] = [];
  return {
    codes,
    reply: (serverNow: number): TvSyncReply => {
      let current = codes.at(-1);
      if (!current || current.expires <= serverNow) { current = { code: String(100000 + codes.length), expires: serverNow + 300000 }; codes.push(current); }
      return { ok: true, data: { status: "pair", code: current.code, expires_at: new Date(current.expires).toISOString(), server_time: new Date(serverNow).toISOString() } };
    },
    accepts: (code: string, serverNow: number) => codes.some(c => c.code === code && c.expires > serverNow),
  };
}

for (const skew of [0, 37000, -37000]) test(`a replaced code reaches the TV within a second and an expired one is never shown (TV clock off by ${skew / 1000} s)`, async () => {
  const room = server(), t = harness([room.reply], skew);
  t.sync.start(); await t.flush();
  const end = base + 16 * 60000;
  for (let at = base; at < end; at += 50) {
    await t.advance(at);
    const shown = t.views.at(-1)!.view;
    if (shown.code) assert.ok(room.accepts(shown.code, t.clockNow() + skew), `code ${shown.code} shown at ${t.clockNow() - base} ms is refused by the server`);
  }
  assert.ok(room.codes.length >= 4, `codes issued: ${room.codes.length}`);
  for (const [i, code] of room.codes.slice(1).entries()) {
    const replacedAt = room.codes[i].expires, onTv = t.views.find(v => v.view.code === code.code);
    assert.ok(onTv, `code ${code.code} reached the TV`);
    const lag = onTv!.at + skew - replacedAt;
    assert.ok(lag <= 1000, `code ${code.code} reached the TV ${lag} ms after the server's expiry`);
  }
  // The usual cadence holds between replacements: about one ask a second.
  assert.ok(t.asked.length < 16 * 60 * 1.2, `${t.asked.length} asks`);
  t.sync.stop();
});

test("a failing connection never keeps an expired code, and a new code follows the network back", async () => {
  const room = server(); let down = false;
  const t = harness([at => down ? { ok: false, data: { status: "unavailable" } } : room.reply(at)]);
  t.sync.start(); await t.flush();
  assert.equal(t.views.at(-1)!.view.code, room.codes[0].code);
  await t.advance(base + 240000); down = true;
  await t.advance(base + 300000);
  const last = t.views.at(-1)!.view;
  assert.equal(last.code, null, "the code left with the network down"); assert.equal(last.offline, true);
  await t.advance(base + 330000); down = false;
  await t.advance(base + 330000 + pairFailureCapMs + 100);
  assert.equal(t.views.at(-1)!.view.code, room.codes[1].code); assert.equal(t.views.at(-1)!.view.offline, false);
  t.sync.stop();
});

test("a paired TV keeps its five-second check and a refused one reopens at once", async () => {
  const t = harness([() => ({ ok: true, data: { status: "paired", engagement: "e", tv: "t" } })]);
  t.sync.start(); await t.flush();
  assert.equal(t.views.at(-1)!.view.status.status, "paired");
  await t.advance(base + pairedPollMs * 3 + 200);
  assert.equal(t.asked.length, 4);
  t.sync.reopen(); await t.flush();
  assert.equal(t.asked.length, 5);
  t.sync.stop(); await t.advance(base + 60000); assert.equal(t.asked.length, 5, "stopped means stopped");
});
