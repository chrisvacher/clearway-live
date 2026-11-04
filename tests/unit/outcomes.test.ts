import assert from "node:assert/strict";
import test from "node:test";
import { bulletsOf, checkEntry, confirmOf, confirmText, confirmValue, ownConfirm, pressBody, rangeNote, typeBody, typeBatchMs, fieldLockMs } from "../../lib/interactions/outcomes";
import { interactionKinds, isReservedKind, screenIds } from "../../lib/interactions/kinds";

const id = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";

test("D1-11, D2-05: bullets and confirm are kinds with screen ids, no longer reserved", () => {
  assert.ok((interactionKinds as readonly string[]).includes("bullets") && (interactionKinds as readonly string[]).includes("confirm"));
  assert.equal(isReservedKind("bullets"), false); assert.equal(isReservedKind("confirm"), false);
  assert.equal(screenIds.bullets, "D1-11"); assert.equal(screenIds.confirm, "D2-05");
});

test("The batch window and field lock are the tokens' 120 ms and 3 s", () => {
  assert.equal(typeBatchMs, 120); assert.equal(fieldLockMs, 3000);
});

test("Bullets results read the server's shape and ignore the rest", () => {
  const r = bulletsOf({ total: 3, people: 2, year: 2029, outcomes: [{ id, number: 1, title: "A", count: 0, empty: true }, { nope: 1 }],
    current: { id, number: 1, title: "A", count: 2, empty: false, earlier: 1, bullets: [{ id: other, text: "Typing", typing: true, order: 3 }, { text: "no id" }] } });
  assert.equal(r.outcomes.length, 1); assert.equal(r.outcomes[0].empty, true);
  assert.deepEqual(r.current?.bullets, [{ id: other, text: "Typing", typing: true, order: 3 }]);
  assert.equal(r.current?.earlier, 1); assert.equal(r.year, 2029);
  assert.equal(bulletsOf(null).current, null); assert.deepEqual(bulletsOf("x").outcomes, []);
});

test("Confirm results carry counts and the decision, nothing else", () => {
  const r = confirmOf({ total: 4, people: 4, confirmed: 1, provisional: 2, outcomes: [
    { id, number: 1, title: "A", c: 3, r: 1, x: 0, challenged: false, decision: "renamed", was: "Old", reason: "must not travel", name: "must not travel" },
    { id: other, number: 2, title: "B", c: 0, r: 0, x: 2, challenged: true, decision: null }] });
  assert.equal(r.outcomes[0].decision, "renamed"); assert.equal(r.outcomes[0].was, "Old"); assert.equal(r.outcomes[1].challenged, true);
  assert.ok(!JSON.stringify(r).includes("must not travel"));
});

test("A typed update is checked like the database checks it", () => {
  assert.deepEqual(typeBody({ action: "type", id, session: other, outcome: id, text: "We", seq: 1 }), { action: "type", id, session: other, outcome: id, text: "We", seq: 1 });
  assert.equal(typeBody({ action: "type", id: "x", session: other, outcome: id, text: "We", seq: 1 }), null);
  assert.equal(typeBody({ action: "type", id, session: other, outcome: id, text: "x".repeat(601), seq: 1 }), null);
  assert.equal(typeBody({ action: "type", id, session: other, outcome: id, text: "We", seq: -1 }), null);
  assert.equal(typeBody({ action: "type", id, session: other, outcome: id, text: "We", seq: 1.5 }), null);
  assert.equal(typeBody({ action: "type", id, session: other, outcome: id, text: "We", seq: 1, revision: -1 }), null);
  assert.deepEqual(typeBody({ action: "nudge", session: id }), { action: "nudge", session: id });
  assert.equal(typeBody({ action: "nudge", session: "no" }), null); assert.equal(typeBody(null), null);
});

test("Confirm answers: rename needs a name, reasons are optional and bounded, the list round-trips", () => {
  assert.equal(checkEntry({ c: "confirm" }).ok, true);
  assert.equal(checkEntry({ c: "rename" }).ok, false);
  assert.equal(checkEntry({ c: "rename", name: "New name" }).ok, true);
  assert.equal(checkEntry({ c: "challenge", reason: "x".repeat(281) }).ok, false);
  const answer = { [id]: { c: "challenge" as const, reason: "Too broad" }, [other]: { c: "confirm" as const } };
  assert.equal(confirmText(answer), "1 confirm, 0 rename, 1 challenge");
  assert.deepEqual(ownConfirm(confirmValue(answer)), answer);
  assert.deepEqual(ownConfirm({ outcomes: { [id]: { c: "nonsense" } } }), {});
});

test("The facilitator's presses are shaped like the database expects", () => {
  assert.deepEqual(pressBody({ id, kind: "bullets", action: "show", outcome: other }), { id, kind: "bullets", action: "show", outcome: other });
  assert.equal(pressBody({ id, kind: "bullets", action: "edit", bullet: other, text: "Fixed" })?.action, "edit");
  assert.equal(pressBody({ id, kind: "bullets", action: "edit", bullet: "x", text: "Fixed" }), null);
  const d = pressBody({ id, kind: "confirm", action: "decide", outcome: other, decision: "rename", name: "New", reasons: "Because" });
  assert.deepEqual(d, { id, kind: "confirm", action: "decide", outcome: other, decision: "rename", name: "New", reasons: "Because" });
  assert.equal(pressBody({ id, kind: "confirm", action: "decide", outcome: other, decision: "vote" }), null);
  assert.equal(pressBody({ id, kind: "confirm", action: "details", outcome: other }), null);
  assert.equal(pressBody({ id, kind: "confirm", action: "details", outcome: other, stop: "Weekly report" })?.action, "details");
  assert.equal(pressBody({ kind: "bullets", action: "show", outcome: other }), null);
});

test("Four to six confirmed is a warning outside the range, never a block", () => {
  assert.equal(rangeNote({ confirmed: 5, note: null }), "");
  assert.match(rangeNote({ confirmed: 3, note: "fewer" }), /four to six/);
  assert.match(rangeNote({ confirmed: 7, note: "more" }), /four to six/);
  assert.equal(rangeNote(null), "");
});
