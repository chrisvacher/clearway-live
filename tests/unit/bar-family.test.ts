import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { allocate, barSpot, barValue, barsOf, budget, isBarKind, optionItems, pointsKey, rankTap, rankUp, rankingControlBody, scaleOf, scaleUsesSlider, suggestionBody, valueOf, widestValues, type Bar } from "../../lib/interactions/bars";
import { ownAnswers } from "../../lib/phone/policy";
import { submissionRequest } from "../../lib/live/protocol";
import type { LiveResults } from "../../lib/live/types";

const id = (n: number) => `58000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const results = (extra: Record<string, unknown>, people = 8): LiveResults => ({ total: people, people, words: [], ...extra });

test("the bar family's kinds are fixed", () => {
  for (const kind of ["choice", "scale", "ranking", "points", "statements"]) assert.ok(isBarKind(kind));
  assert.ok(!isBarKind("grid"));
});

test("100 points: going past the budget takes the overage from the others in proportion, by largest remainder", () => {
  // Pass 3 change 11. 40 + 30 + 20 + 10 = 100; dragging the first to 70 needs 30 back from 60 held by the others.
  assert.deepEqual(allocate([40, 30, 20, 10, 0], 0, 70), [70, 15, 10, 5, 0]);
  // Uneven shares round by largest remainder, in whole points, and the budget holds exactly.
  const next = allocate([20, 20, 20, 20, 20], 4, 33);
  assert.equal(sum(next), budget); assert.equal(next[4], 33);
  assert.deepEqual(next.slice(0, 4).sort(), [16, 17, 17, 17].sort());
  // Dragging back only frees points; it never raises another.
  assert.deepEqual(allocate([70, 15, 10, 5, 0], 0, 50), [50, 15, 10, 5, 0]);
  // Inside the budget nothing else moves.
  assert.deepEqual(allocate([10, 0, 0, 0, 0], 1, 40), [10, 40, 0, 0, 0]);
  // Lines with nothing are never taken from; the end of a line is 100.
  assert.deepEqual(allocate([50, 50, 0, 0, 0], 2, 100), [0, 0, 100, 0, 0]);
  assert.deepEqual(allocate([0, 0, 0, 0, 0], 0, 140), [100, 0, 0, 0, 0]);
  assert.deepEqual(allocate([0, 0, 0, 0, 0], 0, -5), [0, 0, 0, 0, 0]);
  // Fifty people dragging at random never break the budget.
  let seed = 7; const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let person = 0; person < 50; person++) {
    let values = [0, 0, 0, 0, 0];
    for (let move = 0; move < 30; move++) { values = allocate(values, Math.floor(rand() * 5), Math.round(rand() * 120)); assert.ok(sum(values) <= budget && values.every(v => v >= 0 && Number.isInteger(v))); }
  }
});

test("100 points keyboard: arrows move 1, Page Up and Page Down 10, Home and End 0 and 100", () => {
  assert.equal(pointsKey("ArrowRight", 10), 11); assert.equal(pointsKey("ArrowUp", 10), 11);
  assert.equal(pointsKey("ArrowLeft", 10), 9); assert.equal(pointsKey("ArrowDown", 10), 9);
  assert.equal(pointsKey("PageUp", 10), 20); assert.equal(pointsKey("PageDown", 10), 0);
  assert.equal(pointsKey("Home", 40), 0); assert.equal(pointsKey("End", 40), 100);
  assert.equal(pointsKey("a", 40), null);
});

test("ranking on the phone: tap to add, tap again to remove, move one up; a partial order stands", () => {
  let order = rankTap([], "b"); order = rankTap(order, "a"); order = rankTap(order, "c");
  assert.deepEqual(order, ["b", "a", "c"]);
  assert.deepEqual(rankTap(order, "a"), ["b", "c"]);
  assert.deepEqual(rankUp(order, "c"), ["b", "c", "a"]);
  assert.deepEqual(rankUp(order, "b"), ["b", "a", "c"], "the top one stays");
  assert.deepEqual(rankUp(order, "z"), order);
});

test("scale: up to seven numbers are buttons, wider ranges a slider", () => {
  assert.equal(scaleUsesSlider(5), false); assert.equal(scaleUsesSlider(7), false); assert.equal(scaleUsesSlider(10), true);
});

test("the value sits beside the bar, from the server's numbers, for every state", () => {
  const empty: Bar = { key: "o1", text: "Reaching new people", place: 1, fraction: 0, leader: false, count: 0, percent: 0 };
  assert.deepEqual(barValue("choice", empty, 0), { main: "0", small: "· 0%" }, "empty structure");
  assert.deepEqual(barValue("choice", { ...empty, count: 3, percent: 38 }, 8), { main: "3", small: "· 38%" }, "n · %");
  assert.deepEqual(barValue("ranking", { ...empty, average: null }, 0), { main: "", small: "No rankings yet" });
  assert.deepEqual(barValue("ranking", { ...empty, average: 2.25 }, 7), { main: "avg 2.3" }, "rounded to one place");
  assert.deepEqual(barValue("points", { ...empty, share: 34 }, 7), { main: "34%" });
  assert.deepEqual(barValue("statements", { ...empty, count: 0 }, 0), { main: "", small: "No answers yet" });
  assert.deepEqual(barValue("statements", { ...empty, count: 8, average: 4, agree: 63 }, 8), { main: "4.0", small: "· 63% agree" });
  const long = { ...empty, text: "A very long option name that wraps to two lines on the TV and then ends ".repeat(4), count: 50, percent: 100 };
  assert.deepEqual(barValue("choice", long, 50), { main: "50", small: "· 100%" }, "very long text never changes the value");
});

test("Spotlight lifts an option with its numbers, before or after anyone answers", () => {
  const bars: Bar[] = [{ key: "o2", text: "Next generation", place: 1, fraction: 1, leader: true, count: 2, percent: 25 }, { key: "o1", text: "Reaching new people", place: 2, fraction: 0, leader: false, count: 0, percent: 0 }];
  assert.deepEqual(barSpot("choice", results({ bars }), "o2"), { text: "Next generation", meta: "2 of 8 · 25%" }, "the pass 3 board's Spotlight an option");
  assert.deepEqual(barSpot("choice", results({ bars }, 0), "o1"), { text: "Reaching new people", meta: "0 of 0 · 0%" });
  assert.equal(barSpot("choice", results({ bars }), "nope"), null);
  assert.deepEqual(barSpot("ranking", results({ bars: [{ key: "a", text: "Alpha", place: 2, fraction: 0.6, leader: false, average: 2.3 }] }), "a"), { text: "Alpha", meta: "Place 2 · avg 2.3" });
  const scale = { max: 5, average: 3.8, low: 2, high: 5, columns: [1, 2, 3, 4, 5].map(v => ({ key: String(v), value: v, count: v === 4 ? 3 : 1, fraction: 0.5 })) };
  assert.deepEqual(barSpot("scale", results({ scale }), "average"), { text: "3.8", meta: "average of 8" });
  assert.deepEqual(barSpot("scale", results({ scale }), "4"), { text: "4", meta: "3 people" });
  assert.deepEqual(barSpot("scale", results({ scale: { ...scale, average: null } }, 0), "average"), { text: "No average yet", meta: "Waiting for answers" });
});

test("results and options are read defensively from what the server sends", () => {
  assert.deepEqual(barsOf(results({})), []);
  assert.equal(scaleOf(results({})), null);
  assert.deepEqual(optionItems({ items: [{ key: "a", text: "Alpha" }, { key: 3, text: "bad" }, null] }), [{ key: "a", text: "Alpha" }]);
  assert.deepEqual(optionItems(null), []);
  assert.deepEqual(valueOf<string[]>({ choices: ["a"] }, "choices"), ["a"]);
  assert.equal(valueOf({ choices: ["a"] }, "order"), undefined);
});

test("offline and queued: the phone keeps one standing structured answer, saved on this phone", () => {
  const sentAt = new Date().toISOString();
  const answers = [{ id: id(1), session_id: id(9), text: "3", value: { value: 3 }, revision: 0, withdrawn: true, replaced: true }, { id: id(2), session_id: id(9), text: "4", value: { value: 4 }, revision: 0, withdrawn: false }];
  const outbox = [{ request: { id: id(3), session: id(9), revision: 0, action: "submit" as const, text: "5", value: { value: 5 }, sentAt, queuedAt: sentAt }, state: "saved" as const }];
  const mine = ownAnswers(id(9), answers, outbox, false, true);
  assert.equal(mine.length, 1);
  assert.deepEqual(mine[0].value, { value: 5 }); assert.equal(mine[0].status, "saved");
  assert.equal(ownAnswers(id(9), answers, [], true, true)[0].value && (ownAnswers(id(9), answers, [], true, true)[0].value as { value: number }).value, 4);
});

test("every bar value is a small JSON object the protocol accepts", () => {
  const base = { id: id(1), session: id(2), revision: 0, action: "submit", sentAt: new Date().toISOString() };
  for (const value of [{ choices: ["o1"] }, { value: 4 }, { order: ["a", "b"] }, { points: { a: 60, b: 40 } }, { ratings: { s1: 5 } }]) assert.ok(submissionRequest({ ...base, text: "x", value }), JSON.stringify(value));
  assert.equal(submissionRequest({ ...base, text: "4", value: 4 }), null, "a bare number is refused; values are objects");
});

test("Add an option: the routes check their bodies before the database does", () => {
  assert.deepEqual(suggestionBody({ id: id(1), session: id(2), text: "  Prayer   and discernment " }), { id: id(1), session: id(2), text: "Prayer and discernment" });
  assert.equal(suggestionBody({ id: id(1), session: id(2), text: "   " }), null);
  assert.equal(suggestionBody({ id: id(1), session: id(2), text: "x".repeat(81) }), null);
  assert.equal(suggestionBody({ id: "nope", session: id(2), text: "Prayer" }), null);
  assert.deepEqual(rankingControlBody({ id: id(1), action: "add_option", ids: [id(3), id(4)], text: "Prayer" }), { id: id(1), action: "add_option", ids: [id(3), id(4)], text: "Prayer" });
  assert.deepEqual(rankingControlBody({ id: id(1), action: "dismiss", ids: [id(3)] }), { id: id(1), action: "dismiss", ids: [id(3)], text: "" });
  assert.equal(rankingControlBody({ id: id(1), action: "add_option", ids: [id(3)], text: " " }), null, "an added option needs words");
  assert.equal(rankingControlBody({ id: id(1), action: "add_option", ids: [], text: "Prayer" }), null);
  assert.equal(rankingControlBody({ id: id(1), action: "delete", ids: [id(3)] }), null);
  assert.equal(rankingControlBody({ id: id(1), action: "dismiss", ids: Array.from({ length: 301 }, (_, i) => id(i)) }), null);
});

test("the bar family's files use tokens only and plain copy: no raw hex, no em or en dashes", () => {
  const dir = join(__dirname, "../../components/interactions/bars");
  const files = [...readdirSync(dir).map(f => join(dir, f)), join(__dirname, "../../lib/interactions/bars.ts"), join(__dirname, "../../supabase/migrations/20261103050000_bar_family.sql")];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /[–—]/, `${file} has a dash`);
    if (!file.endsWith(".sql")) assert.doesNotMatch(text, /#[0-9a-fA-F]{3,8}\b/, `${file} has a raw hex value`);
  }
});

// The TV sizes each kind's value column for its widest value before any answer arrives, so
// "5.0 · 100% agree" never clips and the column never jumps when it lands (November 3 fix).
test("the widest values: every value a kind shows is no longer than its widest", () => {
  const text = (v: { main: string; small?: string }) => `${v.main}${v.small ? `${v.main ? " " : ""}${v.small}` : ""}`;
  const longest = (kind: Parameters<typeof widestValues>[0], people: number) => Math.max(...widestValues(kind, people).map(v => text(v).length));
  const bar = { key: "s1", text: "We agree", count: 0, fraction: 0, leader: false } as unknown as Bar;
  assert.ok(widestValues("statements", 8).some(v => text(v) === "5.0 · 100% agree"), "statements: the full agree share");
  assert.ok(widestValues("statements", 8).some(v => text(v) === "No answers yet"), "statements: the empty state");
  for (const [average, agree] of [[1, 0], [3.4, 50], [5, 100], [4.25, 88]]) {
    const v = barValue("statements", { ...bar, count: 8, average, agree } as Bar, 8);
    assert.ok(text(v).length <= longest("statements", 8), `statements: ${text(v)}`);
  }
  assert.ok(text(barValue("statements", bar, 0)).length <= longest("statements", 0), "statements: no answers yet");
  for (const people of [1, 8, 16, 50]) {
    assert.ok(text(barValue("choice", { ...bar, count: people, percent: 100 } as Bar, people)).length <= longest("choice", people), `choice: ${people} people`);
  }
  assert.ok(text(barValue("points", { ...bar, share: 100 } as Bar, 8)).length <= longest("points", 8));
  assert.ok(text(barValue("ranking", { ...bar, average: 5 } as Bar, 8)).length <= longest("ranking", 8));
  assert.ok(text(barValue("ranking", bar, 0)).length <= longest("ranking", 0));
});
