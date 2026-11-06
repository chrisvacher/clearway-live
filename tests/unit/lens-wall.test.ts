import assert from "node:assert/strict";
import { test } from "node:test";
import { prompts, type LensInputs } from "../../lib/ai/prompts";
import { checkSentence, sentenceCap, clusterGrowth, futureTense, heldText, lensOf, lensOptions, seedCounts, seedLine, seededByLens } from "../../lib/interactions/lens";
import { interactionKinds, reservedKinds, screenIds } from "../../lib/interactions/kinds";
import { isAiKind } from "../../lib/interactions/ai";

const inputs: LensInputs = { lens: 2, lens_name: "Our neighbours", base_year: 2026, question: "Describe the church in the 10-year Future", groups: [{ ref: "g1", id: "g-1", label: "Open doors", pinned: true, renamed: false, count: 1, examples: ["Our doors are open all week"] }],
  answers: [{ ref: "a1", id: "s-1", text: "Neighbours borrow our hall" }, { ref: "a2", id: "s-2", text: "Our hall is full on weekdays" }] };

test("The lens kind is registered, with its screen id, and is no longer reserved", () => {
  assert.ok((interactionKinds as readonly string[]).includes("lens"));
  assert.ok(!(reservedKinds as readonly string[]).includes("lens"));
  assert.equal(screenIds.lens, "INT-12");
  assert.ok(isAiKind("lens"));
});
test("The lens prompt fills the year from the engagement's base year and names the lens", () => {
  const p = prompts.group_lens;
  assert.equal(p.version, "group-lens@1");
  const user = JSON.parse(p.user(inputs));
  assert.equal(user.year, 2036);
  assert.equal(user.horizon, "10-year Future");
  assert.equal(user.lens, "Our neighbours");
  assert.equal(JSON.parse(p.user({ ...inputs, base_year: 2031 })).year, 2041);
  assert.match(p.system, /present tense/);
  assert.ok(!/[–—]/.test(p.system), "no em or en dashes");
});
test("The lens reply parses like a wall reply", () => {
  const out = prompts.group_lens.parse(JSON.stringify({ groups: [{ group: "n1", label: "Hall in use", answers: ["a1", "a2"] } ] }), inputs) as { groups: { group: string; answers: string[] }[] };
  assert.ok(out.groups.some(g => g.group === "n1" && g.answers.length === 2));
});
test("Options and results read safely", () => {
  assert.deepEqual(lensOptions(null), { seed: false, lens: null, recording: "", names: [], ai: true });
  assert.equal(lensOptions({ seed: true, recording: "http://x" }).recording, "", "only https recordings");
  assert.equal(lensOptions({ lens: 3, lens_names: ["a", 1, "b"] }).names.length, 2);
  assert.equal(lensOptions({ lens: 9 }).lens, null);
  const r = lensOf({ total: 4, people: 2, lens: 1, lens_name: "Congregation", seeded: [{ id: "x", text: "We pray" }, { nope: true }], groups: [] });
  assert.equal(r.seeded.length, 1);
  assert.equal(r.lensName, "Congregation");
  assert.equal(lensOf(undefined).lens, null);
});
test("Sentences: a present-tense nudge, a cap, and the held text is never a sentence", () => {
  assert.equal(futureTense("We will welcome everyone"), true);
  assert.equal(futureTense("We welcome everyone"), false);
  assert.equal(checkSentence("", 200).ok, false);
  assert.equal(checkSentence("x".repeat(281), 400).ok, false);
  assert.equal(checkSentence("We welcome everyone", 200).ok, true);
  // Seeding allows 400 (the Default and the database's limit); the live wall keeps 280.
  assert.equal(checkSentence("x".repeat(400), 400, true).ok, true);
  assert.equal(checkSentence("x".repeat(400), 400, true).count, "400 / 400");
  assert.equal(checkSentence("x".repeat(401), 400, true).ok, false);
  assert.equal(checkSentence("x".repeat(300), 400, false).ok, false);
  assert.equal(sentenceCap(0, true), 400);
  assert.equal(sentenceCap(280, true), 400);
  assert.equal(sentenceCap(900, true), 400);
  assert.equal(sentenceCap(400, false), 280);
  assert.equal(checkSentence(heldText, 200).ok, false);
});
test("Seeding counts and the facilitator's lines carry numbers only", () => {
  assert.deepEqual(seededByLens([{ value: { lens: 2 }, withdrawn: false }, { value: { lens: 2 }, withdrawn: true }, { value: null, withdrawn: false }]), { 1: 0, 2: 1, 3: 0, 4: 0, 5: 0 });
  const rows = seedCounts({ lenses: [{ lens: 1, seeded: 3, people: 2, open: false }, { lens: 9, seeded: 1 }, { lens: 2, seeded: 0, people: 0, open: true }] });
  assert.equal(rows.length, 2);
  assert.equal(seedLine(rows[0]), "3 sentences from 2 people");
  assert.equal(seedLine(rows[1]), "Open on the TV");
  assert.equal(seedLine({ lens: 3, seeded: 0, people: 0, open: false }), "None yet");
  assert.deepEqual(seedCounts(null), []);
});
test("Cluster labels grow from the floor at one to the main size at six", () => {
  assert.equal(clusterGrowth(1), 0);
  assert.equal(clusterGrowth(6), 1);
  assert.equal(clusterGrowth(40), 1);
});
