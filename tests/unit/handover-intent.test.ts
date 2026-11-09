import assert from "node:assert/strict";
import { test } from "node:test";
import { cardNeeds, cardsOf, isTeamPress, lineChange, needsText, normalizeCode, phoneIntent, showCode, stepMissing, validCode, followupWindow, shortDate, followupManageText, followupStatusText } from "../../lib/interactions/intent";
import { interactionKinds, isReservedKind, screenIds } from "../../lib/interactions/kinds";

const id = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";

test("intent is a registered kind with its screen id and no longer reserved", () => {
  assert.ok(interactionKinds.includes("intent"));
  assert.equal(screenIds.intent, "INT-16");
  assert.equal(isReservedKind("intent"), false);
});

test("a first step without an owner or a date is flagged, in code", () => {
  assert.deepEqual(stepMissing({ owner: null, date: null }), ["owner", "date"]);
  assert.deepEqual(stepMissing({ owner: "Priya", date: null }), ["date"]);
  assert.deepEqual(stepMissing({ owner: null, date: "2026-12-01" }), ["owner"]);
  assert.deepEqual(stepMissing({ owner: "Priya", date: "2026-12-01" }), []);
  assert.equal(needsText(["owner", "date"]), "Needs an owner and a date");
  assert.equal(needsText([]), "");
  assert.equal(cardNeeds([{ owner: null, date: "2026-12-01", missing: ["owner"] }]), "Step needs an owner");
  assert.equal(cardNeeds([{ owner: null, date: null, missing: ["owner", "date"] }, { owner: null, date: null, missing: ["owner", "date"] }]), "Steps need owners or dates");
  assert.equal(cardNeeds([{ owner: "A", date: "2026-12-01", missing: [] }]), "");
});

test("cards are read from results and malformed ones are left out", () => {
  const cards = cardsOf({ cards: [{ id, number: 1, title: "Welcome", intent: "x", must_do: "", what_we_stop: "", filled: 1, pair: 2, typing: ["intent", "bogus"],
    steps: [{ id: other, text: "Call", owner: null, date: "2026-12-01", missing: ["owner"] }, { text: "no id" }] }, { number: 2 }, "no"] });
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].typing, ["intent"]);
  assert.equal(cards[0].steps.length, 1);
  assert.equal(cards[0].flagged, 1);
  assert.deepEqual(cardsOf(null), []);
});

test("typing grows a line in place and a rewrite crossfades", () => {
  assert.equal(lineChange("", "We"), "new");
  assert.equal(lineChange("We", "We grow"), "typing");
  assert.equal(lineChange("We grow", "We gro"), "typing");
  assert.equal(lineChange("We grow", "They shrink"), "rewrite");
  assert.equal(lineChange("same", "same"), "same");
});

test("dates read short", () => { assert.equal(shortDate("2026-11-27"), "Nov 27"); assert.equal(shortDate(null), ""); });

test("the team remote's presses are a short list", () => {
  for (const a of ["go_live", "next", "back", "phones_down", "open_phones", "intent_present", "intent_auto"]) assert.ok(isTeamPress(a), a);
  for (const a of ["close_day", "refresh_phones", "nothing_live", "ai_on", "intent_affirm_text", "handover", "export"]) assert.equal(isTeamPress(a), false, a);
});

test("phone requests are checked before they reach the database", () => {
  assert.deepEqual(phoneIntent({ kind: "join", card: id }), { rpc: "intent_join", args: { p_card: id } });
  assert.equal(phoneIntent({ kind: "join", card: "nope" }), null);
  assert.equal(phoneIntent({ kind: "edit", card: id, op: "set", p: { field: "intent", text: "x".repeat(401) } }), null);
  assert.equal(phoneIntent({ kind: "edit", card: id, op: "set", p: { field: "elsewhere", text: "x" } }), null);
  assert.ok(phoneIntent({ kind: "edit", card: id, op: "set", p: { field: "must_do", text: "ok" } }));
  assert.equal(phoneIntent({ kind: "edit", card: id, op: "step_set", p: { step: "x" } }), null);
  assert.equal(phoneIntent({ kind: "edit", card: id, op: "drop", p: {} }), null);
  const press = phoneIntent({ kind: "press", id, action: "intent_assign", p: { from: null } });
  assert.deepEqual(press && press.rpc, "intent_control");
  assert.equal(phoneIntent({ kind: "press", id, action: "close_day", p: { from: null } }), null);
  assert.equal(phoneIntent({ kind: "press", id, action: "go_live", p: { from: "bad" } }), null);
});

test("the follow-up code is five letters and four numbers, shown with a space", () => {
  assert.equal(normalizeCode("maple 4821"), "MAPLE4821");
  assert.equal(normalizeCode("MAPLE-4821"), "MAPLE4821");
  assert.ok(validCode("MAPLE4821"));
  for (const bad of ["MAPLE482", "MAP1E4821", "MAPLE48211", ""]) assert.equal(validCode(bad), false, bad);
  assert.equal(showCode("MAPLE4821"), "MAPLE 4821");
});

test("the follow-up window opens an hour early and ends two hours late", () => {
  const w = followupWindow(new Date("2026-12-01T15:00:00Z"), new Date("2026-12-01T17:00:00Z"));
  assert.equal(w.opens.toISOString(), "2026-12-01T14:00:00.000Z");
  assert.equal(w.closes.toISOString(), "2026-12-01T19:00:00.000Z");
});

test("Fill Affirm together is the facilitator's press: the control route takes it, the phone route refuses it", async () => {
  const { phoneIntent } = await import("../../lib/interactions/intent");
  const id = "11111111-1111-4111-8111-111111111111", session = "22222222-2222-4222-8222-222222222222";
  const body = { kind: "press", id, action: "intent_affirm_text", p: { from: null, session } };
  assert.equal(phoneIntent(body), null, "a phone or team remote cannot fill it");
  assert.deepEqual(phoneIntent(body, true), { rpc: "intent_control", args: { p_id: id, p_action: "affirm_text", p: { session } } });
  assert.equal(phoneIntent({ ...body, p: { from: null, session: "x" } }, true), null, "the step must be a real id");
});

test("each follow-up refusal has its own plain line, and none reads as a dead room", () => {
  for (const status of ["invalid_window", "invalid_request", "limit", "closed"]) {
    const text = followupManageText[status];
    assert.ok(text && text !== followupStatusText.unavailable, status);
    assert.ok(!/[\u2013\u2014]/.test(text), "no dashes");
  }
  assert.match(followupManageText.invalid_window, /scheduled times of the follow-up steps/);
});
