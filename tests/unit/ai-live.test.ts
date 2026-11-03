import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { aiConfig, costUsd } from "../../lib/ai/config";
import { aiClient, anthropicClient, type AiClient } from "../../lib/ai/client";
import { fakeClient, jobOf, recordedClient, scripted } from "../../lib/ai/fake";
import { prompts, promptVersions, replyJson, type AiInputs, type AiJob, type GroupOutput, type MergeOutput, type SummaryOutput } from "../../lib/ai/prompts";
import { runSession, workSessions } from "../../lib/ai/worker";
import { absorbedInto, aiControlBody, aiNotice, combinedLine, combinedWith, dollars, moreGroups, shownGroups, wallOf, type AiStatus, type WallGroup } from "../../lib/interactions/ai";

type Case = { name: string; job: AiJob; inputs: AiInputs; reply: string;
  expect: { together?: string[][]; apart?: string[][]; maxGroup?: number; labelWords?: number; joins?: string[][]; neverJoins?: string[][]; maxWords?: number; mentions?: string[] } };
const fixtures = JSON.parse(readFileSync(new URL("../fixtures/ai/live.json", import.meta.url), "utf8")) as { names: string[]; cases: Case[] };
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
  assert.deepEqual(prompts.combine_words.parse("{\"groups\":[{\"survivor\":\"w1\",\"members\":[\"w2\",\"x\",3,\"w3\"]},{\"members\":[\"w4\"]}]}"), { groups: [{ survivor: "w1", members: ["w2", "w3"] }] });
  assert.deepEqual(prompts.group_wall.parse("{\"groups\":[{\"group\":\"n1\",\"label\":\"Baptisms\",\"answers\":[\"a1\",\"a2\"]},{\"group\":\"zz\",\"answers\":[\"a3\"]}]}"), { groups: [{ group: "n1", label: "Baptisms", answers: ["a1", "a2"] }] });
  assert.deepEqual(prompts.summarize_wall.parse("{\"summary\":42}"), { summary: "" });
  assert.deepEqual(prompts.fold_questions.parse("[]"), { groups: [] });
});

// ---------- Prompt behaviour, against fixtures (and the real API when a key is present) ----------
const textOf = (c: Case, ref: string) => {
  const i = c.inputs as unknown as Record<string, { ref: string; text?: string; label?: string }[]>;
  for (const list of [i.words, i.answers, i.questions, i.groups]) { const hit = list?.find(x => x.ref === ref); if (hit) return hit.text ?? hit.label; }
  return undefined;
};
function check(c: Case, reply: string) {
  const out = prompts[c.job].parse(reply), e = c.expect;
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
  assert.deepEqual(apply.args.p_output, { groups: [{ survivor: "q1", members: ["q2"] }] });
  assert.deepEqual(apply.args.p_usage, { input_tokens: 1000, output_tokens: 50, cost_usd: 0.00125, ms: (apply.args.p_usage as { ms: number }).ms }, "tokens and cost are logged");
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
