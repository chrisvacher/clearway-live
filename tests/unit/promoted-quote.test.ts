import assert from "node:assert/strict";
import { test } from "node:test";
import { promoteBlock, quoteBody, quoteMessages, quoteParts } from "../../lib/quote/promoted";
import { applyLiveEvent } from "../../lib/live/protocol";
import type { LiveEvent, LiveRead } from "../../lib/live/types";

const id = "55000000-0000-4000-8000-000000000001", session = "55000000-0000-4000-8000-000000000002", card = "55000000-0000-4000-8000-000000000003";
const snapshot = (version = 1): LiveRead => ({ status: "ok", version, topic: "live:fixture", role: "tv", next: null, phone_depth: null, server_time: new Date().toISOString(), answers: [], session: null, promoted_quote: null,
  state: { engagement_id: id, live_session_id: session, version, tv_content: "session", phones_down: false, burst_ends_at: null, results: { total: 0, people: 0, words: [] } } });

test("a promote or take down press is checked before it is sent", () => {
  assert.deepEqual(quoteBody({ action: "promote", card }), { action: "promote", card });
  assert.deepEqual(quoteBody({ action: "take_down" }), { action: "take_down" });
  assert.deepEqual(quoteBody({ action: "take_down", card: "ignored" }), { action: "take_down" });
  for (const bad of [null, [], "promote", {}, { action: "promote" }, { action: "promote", card: "nope" }, { action: "hide", card }]) assert.equal(quoteBody(bad), null);
});

test("the words split light then bold, and never lose or add a word", () => {
  const [lead, bold] = quoteParts("We are a church that opens its doors wide");
  assert.equal(`${lead} ${bold}`, "We are a church that opens its doors wide");
  assert.ok(bold.length > 0 && lead.length > 0);
  assert.deepEqual(quoteParts("Hope"), ["Hope", ""]);
  assert.deepEqual(quoteParts("  spaced   out  words "), ["spaced", "out words"]);
});

test("Promote says in plain words why it is off", () => {
  assert.equal(promoteBlock({ team_led: false }, { kind: "quote", text: "Hello" }), null);
  assert.equal(promoteBlock(null, { kind: "quote", text: "Hello" }), "Put a step on the TV first.");
  assert.match(promoteBlock({ team_led: true }, { kind: "quote", text: "Hello" })!, /team has the room/);
  assert.equal(promoteBlock({ team_led: false }, { kind: "quote", text: "   " }), "This quote has no words to show.");
  assert.equal(promoteBlock({ team_led: false }, { kind: "decision", text: "Hello" }), "Only quotes go on the TV.");
  for (const text of Object.values(quoteMessages)) assert.ok(!/[\u2013\u2014]/.test(text), "no dashes in app copy");
});

test("a promoted quote rides the room version: on, replaced and taken down, and a snapshot keeps it", () => {
  const first = snapshot();
  const on: LiveEvent = { ...snapshot(2), promoted_quote: { text: "We open our doors", session: "Five Lenses: Community" } };
  const applied = applyLiveEvent(first, on); assert.equal(applied.kind, "applied");
  assert.deepEqual(applied.value.promoted_quote, { text: "We open our doors", session: "Five Lenses: Community" });
  // A later event with no promoted_quote field keeps what the screen shows; null takes it down.
  const quiet: LiveEvent = { ...snapshot(3) }; delete (quiet as { promoted_quote?: unknown }).promoted_quote;
  assert.equal(applyLiveEvent(applied.value, quiet).value.promoted_quote?.text, "We open our doors");
  const second = applyLiveEvent(applied.value, { ...snapshot(3), promoted_quote: { text: "We stay curious", session: "Five Lenses: Community" } });
  assert.equal(second.value.promoted_quote?.text, "We stay curious");
  const off = applyLiveEvent(second.value, { ...snapshot(4), promoted_quote: null });
  assert.equal(off.value.promoted_quote, null);
  // The room version still orders everything: the same version again changes nothing.
  assert.equal(applyLiveEvent(off.value, { ...snapshot(4), promoted_quote: { text: "late", session: "x" } }).kind, "same");
  // The quote carries only words and the step's name.
  assert.deepEqual(Object.keys(applied.value.promoted_quote!).sort(), ["session", "text"]);
});
