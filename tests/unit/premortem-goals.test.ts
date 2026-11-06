import assert from "node:assert/strict";
import { test } from "node:test";
import { controlPress, dateLabel, dateShort, goalColumns, goalPlaces, needsLine, flagsOf, goalBody, goalFields, goalsForm, goalsResults, letters, missing, needs, reasonBody, seasonEnd } from "../../lib/interactions/goals";
import { prompts } from "../../lib/ai/prompts";
import { gridOf, premortemPrompt } from "../../lib/interactions/grid-form-sign";
import { interactionKinds, isReservedKind } from "../../lib/interactions/kinds";

const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222", c = "33333333-3333-4333-8333-333333333333";

test("goals is a live kind (INT-15), no longer reserved", () => {
  assert.ok((interactionKinds as readonly string[]).includes("goals"));
  assert.equal(isReservedKind("goals"), false);
});

test("the four CORE letters and what each missing one needs", () => {
  assert.deepEqual(letters.map(([l]) => l), ["C", "O", "R", "E"]);
  const g = { letters: { C: true, O: false, R: true, E: false }, needs_risk: true };
  assert.deepEqual(missing(g), ["O", "E"]);
  assert.deepEqual(flagsOf(g), ["O", "E", "risk"]);
  assert.equal(needs.O, "Needs an owner");
  assert.deepEqual(flagsOf({ letters: { C: true, O: true, R: true, E: true }, needs_risk: false }), []);
});

test("goal results are read from the server and never trusted for shape", () => {
  const r = goalsResults({ outcome: { id: a, title: "Reach", number: 2, of: 5 }, bullets: ["x", 4, "y"], risk_links: "later", total: 1, people: 1,
    goals: [{ id: b, title: "T", letters: { C: true, O: true, R: false, E: true }, met: false, risks: [1, "x", 3], needs_risk: false, owner: "Priya", end_date: "2027-04-30" }, { nope: 1 }] });
  assert.equal(r.outcome?.number, 2); assert.deepEqual(r.bullets, ["x", "y"]); assert.equal(r.risk_links, "later");
  assert.equal(r.goals.length, 1); assert.deepEqual(r.goals[0].risks, [1, 3]); assert.deepEqual(missing(r.goals[0]), ["R"]);
  assert.equal(goalsResults(null).outcome, null); assert.equal(goalsResults(undefined).risk_links, "required");
});

test("seasons end on Dec 31, Apr 30 and Aug 31, never at a quarter", () => {
  assert.equal(seasonEnd(new Date("2026-09-01T12:00:00Z")), "2026-12-31");
  assert.equal(seasonEnd(new Date("2026-12-31T12:00:00Z")), "2026-12-31");
  assert.equal(seasonEnd(new Date("2027-01-01T12:00:00Z")), "2027-04-30");
  assert.equal(seasonEnd(new Date("2027-04-30T12:00:00Z")), "2027-04-30");
  assert.equal(seasonEnd(new Date("2027-05-01T12:00:00Z")), "2027-08-31");
  assert.equal(seasonEnd(new Date("2027-08-31T12:00:00Z")), "2027-08-31");
  assert.equal(dateLabel("2027-04-30"), "Apr 30, 2027"); assert.equal(dateLabel("nope"), "");
});

test("a goal's fields are checked before they are sent", () => {
  assert.deepEqual(goalFields({ title: "  Launch   it ", result: "Done", end_date: "2027-04-30", owner: { attendee: a }, risks: [b] }),
    { title: "Launch it", result: "Done", end_date: "2027-04-30", owner: { attendee: a }, risks: [b] });
  assert.deepEqual(goalFields({ owner: { name: "Sam Lee", email: " SAM@Example.org " } }), { owner: { name: "Sam Lee", email: "sam@example.org" } });
  assert.deepEqual(goalFields({ owner: null, end_date: null }), { owner: null, end_date: null });
  for (const bad of [{ title: "" }, { title: "x".repeat(201) }, { result: "x".repeat(401) }, { owner: { attendee: "x" } }, { owner: { name: "Sam" } },
    { owner: { attendee: a, name: "Sam", email: "s@e.org" } }, { owner: { name: "Sam", email: "not an email" } }, { end_date: "tomorrow" }, { risks: "x" }, { risks: [a, a, a, a, a, a, a] }, { risks: ["x"] }])
    assert.equal(goalFields(bad), null, JSON.stringify(bad));
});

test("a phone proposes a goal with a title, or changes one of its own", () => {
  assert.equal(goalBody({ id: a, session: b, fields: {} }), null);
  assert.equal(goalBody({ id: a, session: b, fields: { title: "T" } })?.fields.title, "T");
  assert.equal(goalBody({ id: a, session: b, goal: c, fields: { result: "R" } })?.goal, c);
  assert.equal(goalBody({ id: "x", session: b, fields: { title: "T" } }), null);
  assert.equal(goalBody({ id: a, session: b, goal: "x", fields: { title: "T" } }), null);
});

test("a reason is one short line", () => {
  assert.deepEqual(reasonBody({ id: a, session: b, text: "  Volunteers  burn out " }), { id: a, session: b, text: "Volunteers burn out" });
  assert.equal(reasonBody({ id: a, session: b, text: " " }), null); assert.equal(reasonBody({ id: a, session: b, text: "x".repeat(121) }), null);
});

test("facilitator presses: goals and mitigations", () => {
  assert.deepEqual(controlPress({ id: a, kind: "goals", action: "outcome", from: b, to: "next" }), { rpc: "goals_control", id: a, action: "outcome", p: { from: b, to: "next" } });
  assert.equal(controlPress({ id: a, kind: "goals", action: "outcome", from: b, to: "sideways" }), null);
  assert.equal(controlPress({ id: a, kind: "goals", action: "add", from: b, fields: {} }), null);
  assert.equal(controlPress({ id: a, kind: "goals", action: "edit", from: b, fields: { title: "T" } }), null);
  assert.equal(controlPress({ id: a, kind: "goals", action: "clear", from: b, goal: c, clear: "yes" }), null);
  assert.deepEqual(controlPress({ id: a, kind: "goals", action: "clear", from: null, goal: c, clear: true })?.p, { from: null, goal: c, clear: true });
  assert.equal(controlPress({ id: a, kind: "goals", action: "remove", from: b }), null);
  assert.deepEqual(controlPress({ id: a, kind: "reasons", action: "mitigate", from: b, item: "r1abc", text: " Rotate " }), { rpc: "reasons_control", id: a, action: "mitigate", p: { from: b, item: "r1abc", text: "Rotate" } });
  assert.equal(controlPress({ id: a, kind: "reasons", action: "mitigate", from: b, item: "Bad Key", text: "x" }), null);
  assert.equal(controlPress({ id: a, kind: "reasons", action: "mitigate", from: b, item: "r1", text: "x".repeat(301) }), null);
  assert.equal(controlPress({ id: a, kind: "reasons", action: "unmitigate", from: b, mitigation: "x" }), null);
  assert.equal(controlPress({ id: a, kind: "reasons", action: "undo_ai", from: b })?.rpc, "reasons_control");
  assert.equal(controlPress({ id: a, kind: "goals", action: "explode", from: b }), null);
  assert.equal(controlPress({ id: "x", kind: "goals", action: "outcome", from: b, to: "next" }), null);
});

test("the form a phone is handed is read only when ok", () => {
  assert.equal(goalsForm({ status: "denied" }), null);
  const f = goalsForm({ status: "ok", me: a, outcome: b, season_ends: [{ date: "2027-04-30", season: "JAN_APR", label: "Jan to Apr" }], people: [{ id: a, name: "Priya" }, { x: 1 }], risks: [{ id: b, n: 1, text: "R" }], mine: [c, 4] });
  assert.equal(f?.people.length, 1); assert.deepEqual(f?.mine, [c]); assert.equal(f?.risk_links, "required");
});

test("the Pre-mortem preset names its prompt and keeps its reasons on the grid kind", () => {
  assert.match(premortemPrompt, /this plan failed\. Why\?$/);
  assert.equal(gridOf({ preset: "pre_mortem", items: [{ key: "r1", text: "T" }] }).preset, "pre_mortem");
});

test("The TV's goal cards: two columns where the width allows, each card in the shorter column, what does not fit counted", () => {
  // Medium (floor 43.2): the list is wide enough for two columns; the default (floor 54) is not.
  assert.equal(goalColumns(1128, 43.2, 26), 2);
  assert.equal(goalColumns(990, 54, 32), 1);
  assert.equal(dateShort("2026-12-31"), "Dec 31");
  assert.equal(dateShort("nope"), "");
  // Six goals of 250 px in a 578 px list, two columns: the first four stand, two wait.
  const two = goalPlaces([250, 250, 250, 250, 250, 250], 2, 24, 578);
  assert.deepEqual(two.map(p => p.shown), [true, true, true, true, false, false]);
  assert.deepEqual(two.slice(0, 4).map(p => [p.col, p.y]), [[0, 0], [1, 0], [0, 274], [1, 274]]);
  // A tall card goes in the column that is shorter: the next card sits beside it, then under the short one.
  const mixed = goalPlaces([400, 150, 150, 150], 2, 20, 700);
  assert.deepEqual(mixed.map(p => [p.col, p.y]), [[0, 0], [1, 0], [1, 170], [1, 340]]);
  // One column: the cards stack and the rest wait; the first card always shows, even taller than the list.
  assert.deepEqual(goalPlaces([300, 300], 1, 20, 250).map(p => p.shown), [true, false]);
  assert.deepEqual(goalPlaces([200, 200, 200], 1, 20, 450).map(p => p.shown), [true, true, false]);
});

test("The TV's one line of what a goal needs, in the order of the letters", () => {
  assert.equal(needsLine([], false), "");
  assert.equal(needsLine(["R"], false), "Needs result");
  assert.equal(needsLine(["E", "O"], false), "Needs owner, date");
  assert.equal(needsLine(["R"], true), "Needs result, risk");
  assert.equal(needsLine([], true), "Needs risk");
});

test("merge-reasons@2 merges only the same cause said differently, and names what must stay apart", () => {
  const p = prompts.merge_reasons;
  assert.equal(p.version, "merge-reasons@2");
  const system = p.system;
  assert.match(system, /Merge reasons only when they mean the same thing/);
  for (const apart of ["Elders never agreed on priorities", "We tried to do all five at once", "Staff burned out", "We ran out of volunteers"]) assert.ok(system.includes(apart), apart);
  assert.match(system, /When you are unsure[^.]*keep them apart/);
});
