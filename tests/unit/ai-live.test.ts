import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { aiConfig, costUsd } from "../../lib/ai/config";
import { aiClient, anthropicClient, type AiClient } from "../../lib/ai/client";
import { fakeClient, jobOf, recordedClient, scripted } from "../../lib/ai/fake";
import { capWords, prompts, promptVersions, replyJson, summaryWords, type AiInputs, type AiJob, type GroupOutput, type MergeOutput, type SummaryOutput } from "../../lib/ai/prompts";
import { rawChars, runSession, workSessions } from "../../lib/ai/worker";
import { absorbedInto, aiControlBody, aiNotice, combinedLine, combinedWith, dollars, moreGroups, shownGroups, wallOf, type AiStatus, type WallGroup } from "../../lib/interactions/ai";

type Case = { name: string; job: AiJob; inputs: AiInputs; reply: string;
  expect: { together?: string[][]; apart?: string[][]; maxGroup?: number; labelWords?: number; joins?: string[][]; neverJoins?: string[][]; maxWords?: number; mentions?: string[] } };
const fixtures = JSON.parse(readFileSync(new URL("../fixtures/ai/live.json", import.meta.url), "utf8")) as { names: string[]; cases: Case[] };
const caseOf = (job: AiJob, n = 0) => fixtures.cases.filter(c => c.job === job)[n];
const id = (n: number) => `75000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ---------- Configuration ----------
test("Model names and prices live in configuration, with a fast model by default", () => {
  const config = aiConfig({});
  assert.equal(config.model, "claude-haiku-4-5");
  assert.equal(aiConfig({ CLEARWAY_AI_MODEL_LIVE: "claude-other-1" }).model, "claude-other-1");
  assert.equal(aiConfig({ CLEARWAY_AI_MODEL_LIVE: "bad model; drop" }).model, "claude-haiku-4-5", "a malformed name falls back");
  assert.equal(aiConfig({ CLEARWAY_AI_TIMEOUT_MS: "999999" }).timeoutMs, 20000, "out-of-range values fall back");
  assert.equal(costUsd(config, 1_000_000, 200_000), 2, "cost per call from tokens and the configured prices");
  assert.equal(costUsd(aiConfig({ CLEARWAY_AI_PRICE_INPUT_PER_MTOK: "3", CLEARWAY_AI_PRICE_OUTPUT_PER_MTOK: "15" }), 1000, 100), 0.0045);
});
test("The client: the fake only where asked and never on production, the API only with a key", () => {
  assert.equal(aiClient({}), null, "no key, no AI: the room works in arrival order");
  assert.ok(aiClient({ ANTHROPIC_API_KEY: "test-key" }), "with a key, the Anthropic client");
  assert.equal(aiClient({ CLEARWAY_AI_FAKE: "script" })?.model(aiConfig({})), "fake-script");
  assert.equal(aiClient({ CLEARWAY_AI_FAKE: "script", VERCEL_ENV: "production" }), null, "the fake never runs on production");
});

// ---------- Prompts ----------
test("Every prompt has a version, Clearway's name and JSON-only replies", () => {
  for (const job of Object.keys(prompts) as AiJob[]) {
    const p = prompts[job];
    assert.match(p.version, /^[a-z-]+@\d+$/);
    assert.equal(promptVersions[job], p.version);
    assert.match(p.system, /Clearway Church Solutions/);
    assert.match(p.system, /JSON object and nothing else/);
    assert.ok(!/[–—]/.test(p.system), "no em or en dashes in prompts");
    assert.equal(jobOf({ system: p.system }), job);
  }
});
test("The model never sees ids, keys or attendee fields: answer text and counts under short refs", () => {
  for (const c of fixtures.cases) {
    const user = prompts[c.job].user(c.inputs);
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(user), `${c.name}: no ids`);
    assert.ok(!/"key"|"id"|attendee|email/.test(user), `${c.name}: no keys or identity fields`);
  }
});
test("Replies are read defensively: anything that isn't the shape is an empty answer", () => {
  assert.deepEqual(replyJson("not json"), {});
  assert.deepEqual(replyJson("Here you go: {\"groups\":[]} thanks"), { groups: [] });
  const cloud = caseOf("combine_words").inputs, wall = caseOf("group_wall").inputs, questions = caseOf("fold_questions").inputs;
  assert.deepEqual(prompts.combine_words.parse("{\"groups\":[{\"survivor\":\"w1\",\"members\":[\"w2\",\"x\",3,\"w3\"]},{\"members\":[\"w4\"]}]}", cloud), { groups: [{ survivor: "w1", members: ["w2", "w3"] }] });
  assert.deepEqual(prompts.group_wall.parse("{\"groups\":[{\"group\":\"n1\",\"label\":\"Baptisms\",\"answers\":[\"a1\",\"a2\"]},{\"answers\":[\"a3\"]},{\"group\":\"g7\",\"answers\":[\"a9\"]}]}", wall),
    { groups: [{ group: "n1", label: "Baptisms", answers: ["a1", "a2"] }, { group: "g7", answers: [] }] }, "no group and no label is dropped; an unknown g ref is the database's to refuse");
  assert.deepEqual(prompts.summarize_wall.parse("{\"summary\":42}", caseOf("summarize_wall").inputs), { summary: "" });
  assert.deepEqual(prompts.fold_questions.parse("[]", questions), { groups: [] });
  assert.deepEqual(prompts.group_wall.parse("nothing", wall), { groups: [] });
});

// ---------- Prompt behaviour, against fixtures (and the real API when a key is present) ----------
const textOf = (c: Case, ref: string) => {
  const i = c.inputs as unknown as Record<string, { ref: string; text?: string; label?: string }[]>;
  for (const list of [i.words, i.answers, i.questions, i.groups, i.reasons]) { const hit = list?.find(x => x.ref === ref); if (hit) return hit.text ?? hit.label; }
  return undefined;
};
function check(c: Case, reply: string) {
  const out = prompts[c.job].parse(reply, c.inputs), e = c.expect;
  if (c.job === "summarize_wall") {
    const summary = (out as SummaryOutput).summary;
    assert.ok(summary.length > 0, `${c.name}: a summary`);
    assert.ok(summary.split(/\s+/).length <= (e.maxWords ?? 30), `${c.name}: at most ${e.maxWords} words`);
    for (const m of e.mentions ?? []) assert.match(summary.toLowerCase(), new RegExp(m), `${c.name}: uses the room's words (${m})`);
    for (const name of fixtures.names) assert.ok(!summary.includes(name), `${c.name}: never names people (${name})`);
    assert.ok(!/["“”]/.test(summary), `${c.name}: no quotation marks`);
    return;
  }
  if (c.job === "group_wall") {
    const groups = (out as GroupOutput).groups, sets = groups.map(g => g.answers.map(r => textOf(c, r)));
    const all = groups.flatMap(g => g.answers);
    assert.equal(new Set(all).size, all.length, `${c.name}: each answer in one group`);
    for (const ref of all) assert.ok(textOf(c, ref), `${c.name}: never invents an answer (${ref})`);
    for (const [a, b] of e.together ?? []) assert.ok(sets.some(s => s.includes(a) && s.includes(b)), `${c.name}: groups "${a}" with "${b}"`);
    for (const [a, b] of e.apart ?? []) assert.ok(!sets.some(s => s.includes(a) && s.includes(b)), `${c.name}: keeps "${a}" apart from "${b}"`);
    for (const g of groups) if (g.label !== undefined) {
      assert.ok(g.label.trim().split(/\s+/).length <= (e.labelWords ?? 4), `${c.name}: a short label (${g.label})`);
      for (const name of fixtures.names) assert.ok(!g.label.includes(name), `${c.name}: labels never name people`);
    }
    for (const [answer, label] of e.joins ?? []) assert.ok(groups.some(g => textOf(c, g.group) === label && g.answers.some(r => textOf(c, r) === answer)), `${c.name}: "${answer}" joins ${label}`);
    for (const [answer, label] of e.neverJoins ?? []) assert.ok(!groups.some(g => textOf(c, g.group) === label && g.answers.some(r => textOf(c, r) === answer)), `${c.name}: never joins pinned ${label}`);
    return;
  }
  const groups = (out as MergeOutput).groups, sets = groups.map(g => [g.survivor, ...g.members].map(r => textOf(c, r)));
  for (const g of groups) { assert.ok(textOf(c, g.survivor), `${c.name}: known survivor`); assert.ok(1 + g.members.length <= (e.maxGroup ?? 4), `${c.name}: at most four into one`); }
  for (const [a, b] of e.together ?? []) assert.ok(sets.some(s => s.includes(a) && s.includes(b)), `${c.name}: folds "${a}" with "${b}"`);
  for (const [a, b] of e.apart ?? []) assert.ok(!sets.some(s => s.includes(a) && s.includes(b)), `${c.name}: keeps "${a}" apart from "${b}"`);
}
test("Recorded replies behave as the prompts promise (the fake client)", async () => {
  const fake = recordedClient(fixtures.cases.map(c => ({ job: c.job, user: prompts[c.job].user(c.inputs), reply: c.reply })));
  for (const c of fixtures.cases) {
    const p = prompts[c.job];
    const reply = await fake.complete({ system: p.system, user: p.user(c.inputs), maxTokens: p.maxTokens, timeoutMs: 1000 }, aiConfig({}));
    check(c, reply.text);
  }
  assert.equal(fake.calls.length, fixtures.cases.length);
});
const key = process.env.ANTHROPIC_API_KEY;
test("Real replies behave as the prompts promise (runs only with ANTHROPIC_API_KEY)", { skip: !key && "no ANTHROPIC_API_KEY: the recorded fixtures above stand in" }, async () => {
  const client = anthropicClient(key!), config = aiConfig();
  for (const c of fixtures.cases) {
    const p = prompts[c.job];
    const reply = await client.complete({ system: p.system, user: p.user(c.inputs), maxTokens: p.maxTokens, timeoutMs: config.timeoutMs }, config);
    check(c, reply.text);
  }
});
test("The scripted stand-in for the browser kits follows the same expectations", () => {
  for (const c of fixtures.cases.filter(c => c.job !== "summarize_wall")) {
    const p = prompts[c.job];
    check(c, scripted({ system: p.system, user: p.user(c.inputs), maxTokens: p.maxTokens, timeoutMs: 1000 }));
  }
});
test("The scripted stand-in can be slow or fail, for FAIL-09", async () => {
  const dir = new URL("../../node_modules/.cache/", import.meta.url).pathname, path = `${dir}ai-fake-unit.json`;
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });
  const p = prompts.fold_questions, call = { system: p.system, user: "{\"questions\":[]}", maxTokens: 10, timeoutMs: 1000 };
  writeFileSync(path, JSON.stringify({ fail: true }));
  await assert.rejects(fakeClient("script", path).complete(call, aiConfig({})), /unavailable/);
  writeFileSync(path, JSON.stringify({ delayMs: 5000 }));
  await assert.rejects(fakeClient("script", path).complete({ ...call, timeoutMs: 1000 }, aiConfig({})), /timeout/);
  writeFileSync(path, "{}");
  assert.equal((await fakeClient("script", path).complete(call, aiConfig({}))).text, "{\"groups\":[]}");
});

// ---------- Lenient replies (production, November 3: refs given as text, groups with no ref) ----------
const reply = (value: unknown) => JSON.stringify(value);
test("Combine: a survivor or member given as its text or key is read back to its ref", () => {
  const cloud = caseOf("combine_words").inputs, parse = (v: unknown) => prompts.combine_words.parse(reply(v), cloud);
  // The production reply: the survivor's text where its ref belonged.
  assert.deepEqual(parse({ groups: [{ survivor: "youth", members: ["w3"] }] }), { groups: [{ survivor: "w1", members: ["w3"] }] });
  assert.deepEqual(parse({ groups: [{ survivor: " Youth ", members: ["Young  People"] }] }), { groups: [{ survivor: "w1", members: ["w3"] }] }, "case and spacing are ignored");
  assert.deepEqual(parse({ groups: [{ survivor: "kid", members: ["children"] }] }), { groups: [{ survivor: "w6", members: ["w7"] }] }, "a word's key reads back too");
  assert.deepEqual(parse({ groups: [{ survivor: "W12", members: ["welcoming"] }] }), { groups: [{ survivor: "w12", members: ["w13"] }] }, "a ref in capitals");
  assert.deepEqual(parse({ groups: [{ survivor: "welcome", members: ["welcoming", "hospitality", "welcome", "w13"] }] }), { groups: [{ survivor: "w12", members: ["w13"] }] },
    "an unknown member is dropped, the survivor never merges into itself and a member counts once");
  assert.deepEqual(parse({ groups: [{ survivor: "togetherness", members: ["w2"] }, { survivor: "w4", members: ["delight"] }] }), { groups: [] }, "what matches nothing is dropped, never guessed");
  assert.deepEqual(prompts.combine_words.parse("```json\n{\"groups\":[{\"survivor\":\"youth\",\"members\":[\"young people\"]}]}\n```", cloud), { groups: [{ survivor: "w1", members: ["w3"] }] }, "a fenced reply");
});
test("Fold: questions given as their text are read back to their refs", () => {
  const questions = caseOf("fold_questions").inputs;
  assert.deepEqual(prompts.fold_questions.parse(reply({ groups: [{ survivor: "When does the new building open?", members: ["what date will the new building be ready?"] }] }), questions),
    { groups: [{ survivor: "q1", members: ["q2"] }] });
});
test("Group: new groups with no ref, a label for a ref, or a bare number each become their own new group", () => {
  const wall = caseOf("group_wall").inputs, parse = (v: unknown) => prompts.group_wall.parse(reply(v), wall) as GroupOutput;
  const expected = { groups: [{ group: "n1", label: "Baptisms", answers: ["a1", "a2"] }, { group: "n2", label: "Alpha", answers: ["a3", "a4"] }] };
  // No group key at all.
  assert.deepEqual(parse({ groups: [{ label: "Baptisms", answers: ["a1", "a2"] }, { label: "Alpha", answers: ["a3", "a4"] }] }), expected);
  // The label where the ref belongs.
  assert.deepEqual(parse({ groups: [{ group: "Baptisms", answers: ["a1", "a2"] }, { group: "Alpha", answers: ["a3", "a4"] }] }), expected);
  // Bare numbers for groups and answers.
  assert.deepEqual(parse({ groups: [{ group: 1, label: "Baptisms", answers: [1, 2] }, { group: "2", label: "Alpha", answers: ["3", "a4"] }] }), expected);
  // A name or title key in place of label.
  assert.deepEqual(parse({ groups: [{ name: "Baptisms", answers: ["a1", "a2"] }, { title: "Alpha", answers: ["a3", "a4"] }] }), expected);
  // Answers given as their text, and a mix of the model's own n refs with a label-only group.
  assert.deepEqual(parse({ groups: [{ group: "n1", label: "Baptisms", answers: ["Three baptisms at Easter", "teenagers asking to be baptized"] }, { label: "Alpha", answers: ["Our Alpha course was full", "a4"] }] }), expected);
  // The same new label twice is one new group, made once.
  assert.deepEqual(parse({ groups: [{ label: "Baptisms", answers: ["a1"] }, { group: "baptisms", answers: ["a2", "a1"] }, { label: "Alpha", answers: ["a3", "a4"] }] }), expected);
  // Distinct new labels never share a ref.
  const many = parse({ groups: [{ label: "Baptisms", answers: ["a1", "a2"] }, { group: "n1", label: "Alpha", answers: ["a3", "a4"] }, { label: "Young families", answers: ["a5", "a6"] }] });
  assert.deepEqual(many.groups.map(g => [g.group, g.label]), [["n1", "Baptisms"], ["n2", "Alpha"], ["n3", "Young families"]]);
  // What can't be read is dropped: an item with neither ref nor label, an answer nobody gave.
  assert.deepEqual(parse({ groups: [{ answers: ["a1", "a2"] }, { label: "Baptisms", answers: ["a1", "Something nobody said", "a2"] }] }), { groups: [expected.groups[0]] });
  for (const v of [expected, many]) check({ ...caseOf("group_wall"), expect: { labelWords: 4 } }, reply(v));
});
test("Group: a group given as an existing group's label joins that group", () => {
  const wall = caseOf("group_wall", 1).inputs, parse = (v: unknown) => prompts.group_wall.parse(reply(v), wall);
  assert.deepEqual(parse({ groups: [{ group: "Baptisms", answers: ["a1"] }] }), { groups: [{ group: "g1", answers: ["a1"] }] });
  assert.deepEqual(parse({ groups: [{ label: "baptisms", answers: ["Baptism class doubled"] }] }), { groups: [{ group: "g1", answers: ["a1"] }] });
  assert.deepEqual(parse({ groups: [{ group: "n1", label: "Baptisms", answers: ["a1"] }] }), { groups: [{ group: "g1", answers: ["a1"] }] }, "never a second group with the same label");
  assert.deepEqual(parse({ groups: [{ group: 1, answers: ["a1"] }] }), { groups: [{ group: "g1", answers: ["a1"] }] }, "a bare number with no label is that existing group");
  // A pinned group is still named: the database refuses it as pinned.
  assert.deepEqual(parse({ groups: [{ group: "Alpha", answers: ["a2"] }] }), { groups: [{ group: "g2", answers: ["a2"] }] });
  check(caseOf("group_wall", 1), reply({ groups: [{ group: "Baptisms", answers: ["a1"] }] }));
});
test("Group: two answers with the same words are each named once", () => {
  const inputs = { groups: [], answers: [{ ref: "a1", id: id(1), text: "Baptisms" }, { ref: "a2", id: id(2), text: "baptisms" }, { ref: "a3", id: id(3), text: "Alpha" }] };
  assert.deepEqual(prompts.group_wall.parse(reply({ groups: [{ label: "Baptisms", answers: ["Baptisms", "Baptisms"] }] }), inputs), { groups: [{ group: "n1", label: "Baptisms", answers: ["a1", "a2"] }] });
});

// ---------- The summary's word cap ----------
const count = (text: string) => text.split(/\s+/).filter(Boolean).length;
const cleanEnd = (text: string) => /[\p{L}\p{N}]\.$|[.!?]$/u.test(text) && !/[,;:]\.$|\s\.$|\.\.$/.test(text) && !/…/.test(text);
test("The summary is cut to 30 words in code, at a sentence where it can be", () => {
  // Production wrote 37 words; this one runs to 35, past the cap.
  const long = "Baptisms lead the wall, with teenagers asking to be baptized and a baptism class that doubled this year. Alpha is full, guests stay for church, and young families now stay after the service most weeks.";
  assert.equal(count(long), 35);
  assert.equal(capWords(long), "Baptisms lead the wall, with teenagers asking to be baptized and a baptism class that doubled this year.");
  const parsed = (prompts.summarize_wall.parse(reply({ summary: long }), caseOf("summarize_wall").inputs) as SummaryOutput).summary;
  assert.equal(parsed, capWords(long), "the parser applies the cap");
  assert.equal(summaryWords, 30);
});
test("The summary cap falls back to a clause, then a clean hard cut", () => {
  const clauses = "The room keeps coming back to baptisms and teenagers taking a public step of faith, to an Alpha course that filled up and kept its guests, and to young families who now stay after the service each week";
  const atClause = capWords(clauses);
  assert.ok(count(atClause) <= 30 && cleanEnd(atClause), atClause);
  assert.equal(atClause, "The room keeps coming back to baptisms and teenagers taking a public step of faith, to an Alpha course that filled up and kept its guests.");
  const run = "People celebrate baptisms and teenagers taking a public step of faith and an Alpha course that filled up and young families who stay after the service and new volunteers who serve on Sunday mornings in the kids program and the cafe";
  const hard = capWords(run);
  assert.ok(count(hard) <= 30 && count(hard) >= 15 && cleanEnd(hard), hard);
  assert.ok(!/\b(and|the|in|of|who)\.$/i.test(hard), `no dangling word at the end: ${hard}`);
  assert.ok(run.replace(/\s+/g, " ").startsWith(hard.slice(0, -1)), "a cut, never a rewrite");
  assert.equal(capWords("  Baptisms lead,   and Alpha is full.  "), "Baptisms lead, and Alpha is full.", "30 words or fewer only tidy the spaces");
  const thirty = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
  assert.equal(capWords(thirty), thirty);
  assert.equal(count(capWords(`${thirty} more,`)), 30);
});

// ---------- The worker ----------
type Rpc = { name: string; args: Record<string, unknown> };
function fakeDb(claims: Record<string, unknown>[], applyStatus = "ok") {
  const calls: Rpc[] = [];
  return { calls, rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === "ai_claim") return { data: claims.shift() ?? { status: "idle" }, error: null };
    if (name === "ai_apply") return applyStatus === "error" ? { data: null, error: { code: "P0001" } } : { data: { status: applyStatus }, error: null };
    return { data: { status: "ok" }, error: null };
  } };
}
const foldClaim = (run: string) => ({ status: "claimed", run, job: "fold_questions", prompt_version: promptVersions.fold_questions, inputs: fixtures.cases.find(c => c.job === "fold_questions")!.inputs });
const okClient: AiClient = { model: () => "test-model", complete: async () => ({ text: "{\"groups\":[{\"survivor\":\"q1\",\"members\":[\"q2\"]}]}", inputTokens: 1000, outputTokens: 50 }) };
const config = { ...aiConfig({}), debounceMs: 0, budgetMs: 5000 };

test("The worker claims, calls and applies until nothing is due, with the lease it claimed", async () => {
  const db = fakeDb([foldClaim(id(1)), foldClaim(id(2))]);
  const report = await runSession(db as never, okClient, id(9), config);
  assert.deepEqual(db.calls.map(c => c.name), ["ai_claim", "ai_apply", "ai_claim", "ai_apply", "ai_claim"]);
  assert.equal(report.stopped, "idle");
  const [claim, apply] = db.calls;
  assert.equal(apply.args.p_lease, claim.args.p_lease, "the apply carries the claim's lease");
  assert.deepEqual(claim.args.p_versions, promptVersions, "the prompt versions go with every claim");
  assert.equal(claim.args.p_model, "test-model");
  assert.deepEqual(apply.args.p_output, { groups: [{ survivor: "q1", members: ["q2"] }], raw: "{\"groups\":[{\"survivor\":\"q1\",\"members\":[\"q2\"]}]}" }, "the model's own reply goes with the parsed output");
  assert.deepEqual(apply.args.p_usage, { input_tokens: 1000, output_tokens: 50, cost_usd: 0.00125, ms: (apply.args.p_usage as { ms: number }).ms }, "tokens and cost are logged");
});
test("The worker reads the reply against the claim's own inputs and keeps the raw reply, cut to size", async () => {
  const text = "{\"groups\":[{\"survivor\":\"When does the new building open?\",\"members\":[\"q2\"]}]}";
  const db = fakeDb([foldClaim(id(5))]);
  await runSession(db as never, { model: () => "m", complete: async () => ({ text, inputTokens: 1, outputTokens: 1 }) }, id(9), config);
  assert.deepEqual(db.calls[1].args.p_output, { groups: [{ survivor: "q1", members: ["q2"] }], raw: text });
  const long = `${"x".repeat(9000)}{"groups":[]}`, big = fakeDb([foldClaim(id(6))]);
  await runSession(big as never, { model: () => "m", complete: async () => ({ text: long, inputTokens: 1, outputTokens: 1 }) }, id(9), config);
  const output = big.calls[1].args.p_output as { groups: unknown[]; raw: string };
  assert.equal(output.raw.length, rawChars);
  assert.equal(rawChars, 8000);
  assert.deepEqual(output.groups, []);
});
test("A failing or timed-out call is recorded and the worker stops; the room is untouched", async () => {
  const db = fakeDb([foldClaim(id(3))]);
  const report = await runSession(db as never, { model: () => "m", complete: async () => { throw new Error("Request timed out."); } }, id(9), config);
  assert.deepEqual(db.calls.map(c => c.name), ["ai_claim", "ai_fail"]);
  assert.equal(db.calls[1].args.p_error, "timeout");
  assert.equal(report.stopped, "failed");
});
test("An apply that cannot commit releases its lease", async () => {
  const db = fakeDb([foldClaim(id(4))], "error");
  await runSession(db as never, okClient, id(9), config);
  assert.deepEqual(db.calls.map(c => c.name), ["ai_claim", "ai_apply", "ai_fail"]);
});
test("Busy, off and cooling stop at once: another worker or the switch has it", async () => {
  for (const status of ["busy", "off", "cooling"]) {
    const db = fakeDb([{ status }]);
    assert.equal((await runSession(db as never, okClient, id(9), config)).stopped, status);
    assert.equal(db.calls.length, 1);
  }
});
test("Triggers that arrive together share one worker per session, which goes round again", async () => {
  const db = fakeDb([foldClaim(id(5))]);
  await Promise.all([workSessions(db as never, okClient, [id(9)], config), workSessions(db as never, okClient, [id(9)], config), workSessions(db as never, okClient, [id(9), id(9)], config)]);
  assert.equal(db.calls.filter(c => c.name === "ai_apply").length, 1, "one apply for one claim");
  assert.ok(db.calls.filter(c => c.name === "ai_claim").length <= 3, "no pile-up of claims");
});

// ---------- What every surface reads ----------
const group = (n: number, count: number, extra: Partial<WallGroup> = {}): WallGroup => ({ id: id(n), label: `Group ${n}`, count, ids: [], pinned: false, ...extra });
test("The wall: AI on or off, groups capped at nine (four with the summary), the rest on the control surface", () => {
  assert.deepEqual(wallOf({ total: 3, people: 2, ai: false }), { ai: false, groups: [], summary: null });
  const many = Array.from({ length: 11 }, (_, i) => group(i, 12 - i));
  assert.equal(shownGroups(many, false).shown.length, 9);
  assert.equal(shownGroups(many, false).rest, 2);
  assert.equal(shownGroups(many, true).shown.length, 4);
  assert.equal(moreGroups(2, false), "+ 2 smaller groups on the control surface");
  assert.equal(moreGroups(2, true), "", "while the summary shows, the note stays off");
  assert.equal(shownGroups([group(1, 2), group(2, 5)], false).shown[0].id, id(2), "largest first");
  const w = wallOf({ total: 4, people: 3, ai: true, groups: [group(1, 2)], summary: { id: id(7), text: "Baptisms lead.", answers: 4, at: 1 } });
  assert.equal(w.summary?.text, "Baptisms lead.");
});
test("The word cloud: the foot line and where an absorbed word went", () => {
  const words = [{ key: "youth", text: "youth", count: 6, size: 100, level: "leader", ai: true, merged: ["young people"] }, { key: "hope", text: "hope", count: 2, size: 60, level: "repeated" }];
  assert.equal(combinedLine(words), "Combined similar answers");
  assert.equal(combinedLine([words[1]]), "", "AI off or nothing combined: no line");
  assert.equal(absorbedInto("young people", words), "youth");
  assert.equal(absorbedInto("hope", words), null);
  const frame = { session: { interaction: "word_cloud" }, answers: [{ id: id(1), answers: [{ key: "young people" }] }, { id: id(2), answers: [{ key: "hope" }] }], state: { results: { words } } };
  assert.equal(combinedWith(frame, id(1)), "youth", "the phone says it is on the screen with youth");
  assert.equal(combinedWith(frame, id(2)), null);
});
test("AI presses are checked before they reach the database", () => {
  assert.deepEqual(aiControlBody({ id: id(1), action: "ai_off", session: id(2) }), { id: id(1), action: "ai_off", p: { session: id(2) } });
  assert.deepEqual(aiControlBody({ id: id(1), action: "rename_group", group: id(3), label: "Baptisms" }), { id: id(1), action: "rename_group", p: { group: id(3), label: "Baptisms" } });
  assert.equal(aiControlBody({ id: id(1), action: "rename_group", group: id(3), label: " " }), null);
  assert.equal(aiControlBody({ id: id(1), action: "undo_combine", merge: "nope" }), null);
  assert.equal(aiControlBody({ id: id(1), action: "drop_table", session: id(2) }), null);
});
const status = (extra: Partial<AiStatus> & { ai?: boolean; interaction?: "wall" | "word_cloud" | "qa" } = {}): AiStatus => ({ status: "ok", version: 1, engagement_ai: true, cost: { usd: 0, runs: 0, input_tokens: 0, output_tokens: 0 },
  session: { id: id(1), title: "Wall", interaction: extra.interaction ?? "wall", live: true, ai: extra.ai ?? true, option: true, override: null, summary_available: true, summary_shown: false },
  state: { running: false, job: null, running_ms: null, last_ms: 900, last_ok_at: null, last_failed_at: null, failing: false, slow: false }, ...extra });
test("FAIL-09 on the control surface and remote: slow, not responding, off. The TV never says it", () => {
  assert.equal(aiNotice(status()), null, "all well: nothing to say");
  assert.match(aiNotice(status({ state: { ...status().state!, slow: true }, waiting: 6 }))!.text, /arrival order and groups catch up when AI does\. 6 answers waiting for grouping\./);
  assert.equal(aiNotice(status({ state: { ...status().state!, failing: true } }))!.title, "AI isn't responding.");
  assert.equal(aiNotice(status({ ai: false }))!.text, "The wall shows answers in arrival order.");
  assert.equal(aiNotice(status({ engagement_ai: false }))!.title, "AI is off for this engagement.");
  for (const n of [status({ state: { ...status().state!, slow: true } }), status({ ai: false })]) assert.ok(!/[–—]/.test(JSON.stringify(aiNotice(n))), "no dashes in app copy");
  assert.equal(dollars(0.004), "under $0.01");
  assert.equal(dollars(1.234), "$1.23");
});

// ---------- The AI icon: gradient ink with a sweep (Chris, November 3) ----------
test("One AI change sweeps once: never on opening, never on undo, redo or a re-render", async () => {
  const { AiChanges } = await import("../../components/interactions/ai/ai-dom");
  const ai = new AiChanges();
  assert.deepEqual(ai.next(["g1:a1", "g1:a2"]), [], "a screen opening on AI's earlier work starts there, without a sweep");
  assert.deepEqual(ai.next(["g1:a1", "g1:a2"]), [], "an ordinary re-render");
  assert.deepEqual(ai.next(["g1:a1", "g1:a2", "g1:a3"]), ["g1:a3"], "AI grouping another answer");
  assert.deepEqual(ai.next(["g1:a1"]), [], "Undo");
  assert.deepEqual(ai.next(["g1:a1", "g1:a2", "g1:a3"]), [], "Redo brings back what AI already did");
  assert.deepEqual(ai.next(["g1:a1", "g1:a2", "g1:a3", "g2:a4", "g2:a5"]), ["g2:a4", "g2:a5"], "a new group is one change");
});
test("The AI icon: no badge tile, two gradients by ground, a 900ms sweep, the band fixed", () => {
  const css = readFileSync("components/interactions/ai/ai.css", "utf8"), tokens = readFileSync("design/clearway-live/live_tokens.css", "utf8");
  assert.doesNotMatch(css, /cwl-ai-badge|cwl-ai-glyph|sky-deep|soft-lime-deep/, "the badge tile, the deep-shade tile and the glyph are retired");
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, "tokens only");
  assert.match(css, /\.cwl-ai-mark \{[^}]*linear-gradient\(115deg, var\(--cwl-ai-start\) 0%, var\(--cwl-ai-end\) 33%, var\(--cwl-ai-glint\) 50%, var\(--cwl-ai-start\) 67%, var\(--cwl-ai-end\) 100%\)[^}]*background-size: 300% 100%; background-position: 0% 50%/);
  assert.match(css, /mask: var\(--ai-shape\)/, "the icon's shape is a mask, so the sweep is a background-position animation");
  const root = /:root \{([\s\S]*?)\n\}/.exec(tokens)![1], light = /\[data-theme="light"\] \{([\s\S]*?)\n\}/.exec(tokens)![1];
  assert.match(root, /--cwl-bright-chartreuse: #A6C800;/);
  assert.match(root, /--cwl-ai-start: var\(--cw-sky-blue, #99C5FE\);/);
  assert.match(root, /--cwl-ai-end: var\(--cw-soft-lime, #E6FFA8\);/);
  assert.match(root, /--cwl-ai-glint: var\(--cw-white, #FFFFFF\);/);
  assert.match(root, /--cwl-dur-ai-sweep: 900ms;/);
  assert.match(root, /--cwl-ai: linear-gradient\(115deg, var\(--cw-sky-blue, #99C5FE\), var\(--cw-soft-lime, #E6FFA8\)\);/, "the summary band stays Sky to Soft Lime on every theme");
  assert.match(light, /--cwl-ai-start: var\(--cw-royal-blue, #3F72DE\);\s*--cwl-ai-end: var\(--cwl-bright-chartreuse\);\s*--cwl-ai-glint: var\(--cw-sky-blue, #99C5FE\);/);
  assert.match(tokens, /\[data-surface="control"\], \[data-surface="setup"\], \[data-surface="scribe"\], \[data-surface="review"\] \{[^}]*--cwl-ai-start: var\(--cw-royal-blue/, "app surfaces are light grounds");
  for (const file of ["components/interactions/ai/ai-icon.tsx", "components/interactions/ai/ai-dom.ts", "components/interactions/ai/ai-foot.tsx", "components/interactions/ai/wall-board.ts"])
    assert.doesNotMatch(readFileSync(file, "utf8"), /[–—]/, `${file} has a dash`);
  assert.match(readFileSync("components/interactions/ai/ai-dom.ts", "utf8"), /--cwl-ease-calm/, "the sweep runs on the calm ease");
});
