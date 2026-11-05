import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { jobOf, scripted } from "../../lib/ai/fake";
import { aiJobs, prompts, promptVersions, type CandidateInputs, type CandidateOutput } from "../../lib/ai/prompts";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/ai/candidates.json", import.meta.url), "utf8")) as
  { cases: { name: string; inputs: CandidateInputs; reply: string; expect: { min: number; max: number; lenses: number; minSources: number } }[] };
const c = fixture.cases[0];

test("The candidates job is registered with a version and a system prompt in Clearway's terms", () => {
  assert.ok(aiJobs.includes("propose_candidates"));
  assert.equal(promptVersions.propose_candidates, "propose-candidates@1");
  const p = prompts.propose_candidates;
  assert.match(p.system, /Clearway Church Solutions/);
  assert.match(p.system, /Five Lenses/);
  assert.match(p.system, /10-year Future/);
  assert.ok(!/[–—]/.test(p.system), "no em or en dashes");
  assert.equal(jobOf({ system: p.system }), "propose_candidates");
});
test("The prompt shows the model sentences under refs and never an id or attendee", () => {
  const user = JSON.parse(prompts.propose_candidates.user(c.inputs));
  assert.equal(user.sentences.length, c.inputs.sentences.length);
  assert.ok(!JSON.stringify(user).includes("76000000"), "no ids");
  assert.equal(user.sentences[0].ref, "s1");
});
test("The recorded reply parses to 6 to 10 candidates over all five lenses, each with two or more sources", () => {
  const out = prompts.propose_candidates.parse(c.reply, c.inputs) as CandidateOutput;
  assert.ok(out.candidates.length >= c.expect.min && out.candidates.length <= c.expect.max);
  const lens = new Map(c.inputs.sentences.map(s => [s.ref, s.lens]));
  const seen = new Set(out.candidates.flatMap(x => x.sources.map(s => lens.get(s))));
  assert.equal(seen.size, c.expect.lenses);
  for (const x of out.candidates) { assert.ok(x.sources.length >= c.expect.minSources, x.name); assert.ok(x.name.split(" ").length <= 10); }
});
test("A cluster ref stands for every sentence in it; unknown refs and empty names are dropped", () => {
  const out = prompts.propose_candidates.parse(JSON.stringify({ candidates: [{ name: "Welcome", sources: ["c1", "s99", "c9"] }, { name: "", sources: ["s1"] }, "nope"] }), c.inputs) as CandidateOutput;
  assert.equal(out.candidates.length, 1);
  assert.deepEqual(out.candidates[0].sources, ["s1", "s2", "s6"]);
  assert.deepEqual((prompts.propose_candidates.parse("not json", c.inputs) as CandidateOutput).candidates, []);
});
test("The scripted stand-in follows the rules on any input", () => {
  const p = prompts.propose_candidates, out = JSON.parse(scripted({ system: p.system, user: p.user(c.inputs), maxTokens: 100, timeoutMs: 1000 })) as CandidateOutput;
  assert.ok(out.candidates.length >= 2);
  for (const x of out.candidates) assert.ok(x.sources.length >= 2);
});
