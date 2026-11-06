import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canSelfPace, clock, defaultWindow, droppedSession, endOfRun, kindMinutes, liveMinutes, onlyMoved, palette, paletteScreens, partOf, partTimes, placeSession, slots, stepSlot } from "../../lib/run-of-show/builder";
import { templateInput } from "../../lib/templates/policy";
import { interactionKinds, type KindInfo } from "../../lib/interactions/kinds";
import type { ShowSession } from "../../lib/run-of-show/types";

const kinds: KindInfo[] = interactionKinds.map(kind => ({ kind, label: kind, input: kind !== "content", one_per_person: false, counts: "answers", structured: false, shares_answers: true, spotlight: "none",
  named: kind === "sign" ? "always" : kind === "form" ? "never" : "setting" }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n: number, extra: Partial<ShowSession> = {}): ShowSession => ({ ...droppedSession(palette(kinds).interactions[0], id(0), "Day 1", kinds, id(n)), title: `S${n}`, position: n, revision: 0, ...extra });

test("SET-07: the palette offers every interaction the server runs and every content screen", () => {
  const p = palette(kinds);
  assert.deepEqual(p.interactions.map(e => e.kind), interactionKinds.filter(k => k !== "content"));
  assert.deepEqual(p.screens.map(e => e.screen), paletteScreens);
  assert.equal(p.interactions.length, 20, "the ten general interactions, statements, the lens wall, the lens summary, the two outcome kinds, commander's intent, the CORE goal builder, the candidate priorities, the Four Helpful Lists and the read-back");
  for (const e of [...p.interactions, ...p.screens]) { assert.ok(e.blurb, `${e.label} has a line`); assert.ok(e.minutes >= 5); }
  assert.equal(palette(kinds.filter(k => k.kind !== "content")).screens.length, 0, "no content screens before the server runs them");
});

test("SET-07: a dropped session goes as dropped, with every default, Draft until it is finished", () => {
  const p = palette(kinds);
  for (const entry of [...p.interactions, ...p.screens]) {
    const s = droppedSession(entry, id(0), "Day 2", kinds, id(9));
    assert.equal(s.part, "Day 2"); assert.equal(s.title, entry.label); assert.equal(s.planned_minutes, entry.minutes); assert.equal(s.mode, "live");
    assert.ok([3, 4, 5].includes(s.settings.burst_minutes));
    if (entry.kind === "sign") assert.equal(s.settings.anonymous, false, "sign together is named by design"); else assert.equal(s.settings.anonymous, true);
    const items = (s.options as { items?: { text: string }[] }).items;
    if (items) assert.ok(items.every(i => i.text.trim()), `${entry.label}: starting options are never blank`);
    if (entry.kind === "content") assert.equal((s.options as { screen: string }).screen, entry.screen);
  }
  assert.equal(droppedSession(p.interactions[0], id(0), "Day 1", kinds, id(1)).state, "draft");
  assert.equal(droppedSession(p.screens.find(e => e.screen === "holding")!, id(0), "Day 1", kinds, id(1)).state, "ready");
  assert.equal(droppedSession(p.screens.find(e => e.screen === "scripture")!, id(0), "Day 1", kinds, id(1)).state, "draft", "Scripture waits for its passage");
  assert.equal(kindMinutes.points, 15);
});

test("SET-07: a drop lands where the gap opened, and a move keeps every other session in order", () => {
  const run = [row(0), row(1), row(2)];
  const fresh = row(9, { title: "New" });
  const dropped = placeSession(run, fresh, "Day 1", 1);
  assert.deepEqual(partOf(dropped, "Day 1").map(s => s.title), ["S0", "New", "S1", "S2"]);
  assert.deepEqual(partOf(dropped, "Day 1").map(s => s.position), [0, 1, 2, 3]);
  assert.deepEqual(partOf(placeSession(run, run[0], "Day 1", 2), "Day 1").map(s => s.title), ["S1", "S2", "S0"], "index counts the rest of the part");
  const moved = placeSession(run, run[1], "Day 2", 0);
  assert.deepEqual(partOf(moved, "Day 1").map(s => [s.title, s.position]), [["S0", 0], ["S2", 1]]);
  assert.deepEqual(partOf(moved, "Day 2").map(s => s.title), ["S1"]);
  assert.deepEqual(partOf(placeSession(run, fresh, "Day 1", 99), "Day 1").at(-1)?.title, "New", "an index past the end lands at the end");
  assert.deepEqual(endOfRun(run), { part: "Day 1", index: 3 });
  assert.deepEqual(endOfRun([...run, row(5, { part: "Day 2" })]), { part: "Day 2", index: 1 });
  assert.deepEqual(endOfRun([]), { part: "Day 1", index: 0 }, "an empty run starts on Day 1");
});

test("SET-07: times recalculate from the durations, from the part's first start", () => {
  const run = [row(0, { planned_minutes: 5, planned_start: "2026-11-19T14:00:00.000Z" }), row(1, { planned_minutes: 10, planned_start: "2026-11-19T18:00:00.000Z" }),
    row(2, { mode: "self_paced", planned_minutes: 30, opens_at: "2026-11-18T12:00:00.000Z" }), row(3, { planned_minutes: 15 })];
  const t = partTimes(run);
  assert.deepEqual([...t.values()].map(x => x.offset), [0, 5, null, 15]);
  assert.equal(t.get(id(1))!.at, "2026-11-19T14:05:00.000Z", "a stored time follows the lengths before it");
  assert.equal(t.get(id(3))!.at, "2026-11-19T14:15:00.000Z", "self-paced sessions take no room time");
  assert.equal(t.get(id(2))!.at, "2026-11-18T12:00:00.000Z");
  assert.deepEqual([...partTimes([row(0), row(1)]).values()].map(x => x.at), [null, null], "an untimed part shows offsets");
  assert.equal(liveMinutes(run), 30); assert.equal(clock(90), "1:30"); assert.equal(clock(5), "0:05");
});

test("SET-07: the keyboard reaches every place a drag can, and an open editor follows a move", () => {
  const run = [row(0), row(1), row(2, { part: "Day 2" })];
  const all = slots(run);
  assert.equal(all.length, 1 + 1 + 3 + 2 + 1, "each part's gaps, empty parts included (Discover too)");
  assert.deepEqual(stepSlot(all, { part: "Day 1", index: 2 }, 1), { part: "Day 2", index: 0 });
  assert.deepEqual(stepSlot(all, { part: "Pre-call", index: 0 }, -1), { part: "Discover", index: 0 }, "the Pre-call sits just below Discover");
  assert.deepEqual(stepSlot(all, { part: "Discover", index: 0 }, -1), { part: "Discover", index: 0 }, "stops at the top");
  assert.equal(slots(run, id(0)).filter(s => s.part === "Day 1").length, 2, "a moving row leaves its own place");
  const before = row(1);
  assert.equal(onlyMoved(before, { ...before, position: 7, revision: 4, planned_start: "2026-11-19T14:05:00.000Z" }), true);
  assert.equal(onlyMoved(before, { ...before, prompt: "Edited elsewhere", revision: 4 }), false);
  assert.equal(onlyMoved(before, { ...before, options: { ...before.options } }), true, "key order never matters");
});

test("SET-08: the templates API takes only what it needs", () => {
  const e = id(1), t = id(2);
  assert.deepEqual(templateInput({ action: "save", input: { engagement: e, name: "  Team   workshop ", extra: "x" } }), { action: "save", input: { engagement: e, name: "Team workshop", description: "", shared: true } });
  assert.equal((templateInput({ action: "save", input: { engagement: e, name: "Board", shared: false } }).input as { shared: boolean }).shared, false);
  assert.deepEqual(templateInput({ action: "apply", input: { template: t, engagement: e, start: "2026-11-19T19:00:00-05:00" } }), { action: "apply", input: { template: t, engagement: e, start: "2026-11-20T00:00:00.000Z" } });
  assert.equal((templateInput({ action: "apply", input: { template: t, engagement: e } }).input as { start: string | null }).start, null);
  for (const bad of [{ action: "save", input: { engagement: "x", name: "A" } }, { action: "save", input: { engagement: e, name: " " } }, { action: "save", input: { engagement: e, name: "x".repeat(121) } },
    { action: "apply", input: { template: t, engagement: e, start: "tomorrow" } }, { action: "apply", input: { template: "x", engagement: e } }, { action: "remove", input: {} }, { action: "drop", input: {} }])
    assert.throws(() => templateInput(bad as Record<string, unknown>));
});

test("SET-07 and SET-08 copy has no em or en dashes", () => {
  for (const file of ["lib/run-of-show/builder.ts", "lib/templates/policy.ts", "components/run-of-show/show-editor.tsx", "components/run-of-show/save-template.tsx", "components/run-of-show/session-form.tsx",
    "components/templates/template-library.tsx", "supabase/migrations/20261103100000_templates.sql"])
    assert.doesNotMatch(readFileSync(file, "utf8"), /[–—]/, file);
});

test("SET-07: a session added as self-paced starts as a Draft with a week-long window; content screens stay in the room", () => {
  const p = palette(kinds), now = Date.parse("2026-11-19T14:20:00Z");
  const s = droppedSession(p.interactions.find(e => e.kind === "wall")!, id(0), "Day 1", kinds, id(1), "self_paced", now);
  assert.equal(s.mode, "self_paced"); assert.equal(s.state, "draft");
  assert.equal(s.opens_at, "2026-11-19T15:00:00.000Z", "from the next whole hour"); assert.equal(s.closes_at, "2026-11-26T15:00:00.000Z", "for a week");
  assert.equal(defaultWindow(Date.parse("2026-11-19T15:00:00Z")).opens_at, "2026-11-19T16:00:00.000Z", "always in the future");
  const holding = p.screens.find(e => e.screen === "holding")!;
  assert.equal(canSelfPace(holding), false);
  assert.equal(droppedSession(holding, id(0), "Day 1", kinds, id(2), "self_paced", now).mode, "live");
  assert.deepEqual([...partTimes([row(0, { planned_start: "2026-11-19T14:00:00.000Z" }), s, row(3)]).values()].map(t => t.offset), [0, null, 10], "it takes no room time");
});

test("the template preview shows the registry labels for the Wayfinding kinds, not their code names", async () => {
  const { kindLabel } = await import("../../lib/interactions/kinds");
  const expected: Record<string, string> = { lens: "Lens wall", lens_summary: "Lens summary", candidates: "Candidate priorities", bullets: "Outcome bullets", confirm: "Outcome confirm", goals: "CORE goals", intent: "Commander's intent" };
  for (const [kind, label] of Object.entries(expected)) assert.equal(kindLabel(kind, null), label);
  assert.equal(kindLabel("wall", null), "Open text");
});
