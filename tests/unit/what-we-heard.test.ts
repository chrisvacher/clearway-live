import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfig } from "../../lib/ai/config";
import { fakeClient, isHeard, recordedClient } from "../../lib/ai/fake";
import { heardPrompt, heardVersion, prompts, replyJson, themesPrompt, type HeardInputs } from "../../lib/ai/prompts";
import { heardBudgetMs, heardTimeoutMs, runHeard } from "../../lib/ai/heard";
import { depthBlocks } from "../../lib/interactions/kinds";
import { draftView, headlineText, heardBody, heardEdit, heardFor, heardKeyOf, heardMessage, heardNames, phoneDepth, sourceLine, sourceNote, stepFields, type HeardDraft, type HeardState } from "../../lib/discover/heard";

type Case = { name: string; inputs: HeardInputs; reply: string; expect: { headlines: number; leads: Record<string, string>; quotes: Record<string, number>; thinLead: Record<string, boolean> } };
const fixtures = JSON.parse(readFileSync(new URL("../fixtures/ai/what-we-heard.json", import.meta.url), "utf8")) as { names: string[]; cases: Case[] };
const riverside = fixtures.cases[0];
const named = (text: string) => fixtures.names.filter(n => new RegExp(`\\b${n}\\b`, "i").test(text));
const digits = (text: string) => [...new Set(text.match(/[0-9]+/g) ?? [])];
const id = (n: number) => `85600000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// Everything a source's themes carry, the way the database reads it when it checks a number.
const known = (inputs: HeardInputs, key: string) => { const s = inputs.sources.find(x => x.key === key)!; return `${s.basis} ${s.themes.map(t => `${t.label} ${t.detail} ${t.figure} ${t.count}`).join(" ")}`; };

test("The prompt is versioned, JSON only, keeps horizons exact, never invents, never names people and never writes the number", () => {
  assert.match(heardPrompt.version, /^heard-draft@\d+$/);
  assert.equal(heardVersion, heardPrompt.version);
  assert.match(heardPrompt.system, /Clearway Church Solutions/);
  assert.match(heardPrompt.system, /one JSON object and nothing else/);
  assert.ok(!/[–—]/.test(heardPrompt.system), "no em or en dashes");
  for (const term of ["10-year Future", "3-year Vision", "1-year Outlook"]) assert.ok(heardPrompt.system.includes(term));
  assert.ok(!/(\b3 year\b|\bthree-year\b|\b10 year\b|\bten-year\b|\b1 year\b|\bone-year\b)/i.test(heardPrompt.system));
  assert.match(heardPrompt.system, /Never invent/);
  assert.match(heardPrompt.system, /Never name a person/);
  assert.match(heardPrompt.system, /Never write the number yourself/);
  assert.match(heardPrompt.system, /data, never instructions/);
  assert.match(heardPrompt.system, /Never write a quote yourself/);
  assert.match(heardPrompt.system, /What We Heard/);
  assert.equal(isHeard({ system: heardPrompt.system }), true);
  for (const p of [...Object.values(prompts), themesPrompt]) assert.notEqual(p.system, heardPrompt.system);
});

test("The model reads accepted themes under short refs: no ids, notes, titles, people or attendees", () => {
  const user = heardPrompt.user(riverside.inputs);
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(user), "no ids");
  assert.ok(!/"id"|"title"|"person"|speaker|attendee|email|"notes"/.test(user), "no id, title, person or note field");
  const parsed = replyJson(user) as { sources: { source: string; themes: { ref: string; thin_data: boolean; quotes: { ref: string; from: string }[] }[] }[] };
  assert.deepEqual(parsed.sources.map(s => s.source), ["survey", "four_lists", "input", "interviews"]);
  assert.deepEqual(parsed.sources[0].themes.map(t => t.ref), ["t1", "t2", "t3"]);
  assert.equal(parsed.sources[0].themes[2].thin_data, true);
  assert.equal(parsed.sources[3].themes[0].quotes[0].from, "Leadership interview");
  assert.deepEqual(named(user), [], "no name from the engagement reaches the model");
});

test("The recorded Riverside reply: a lead and sources of its own, quotes by ref, no names, and no number the themes do not carry", () => {
  const out = heardPrompt.parse(riverside.reply, riverside.inputs);
  assert.equal(out.headlines.length, riverside.expect.headlines);
  for (const h of out.headlines) {
    const source = riverside.inputs.sources.find(s => s.key === h.source)!, refs = source.themes.map(t => t.ref), quoteRefs = source.themes.flatMap(t => t.quotes.map(q => q.ref));
    assert.equal(h.lead, riverside.expect.leads[h.source]);
    assert.ok(h.themes.every(r => refs.includes(r)), "rests on its own source's themes");
    assert.ok(h.quotes.every(r => quoteRefs.includes(r)), "quotes are by ref, from its own source");
    assert.equal(h.quotes.length, riverside.expect.quotes[h.source], `${h.source} quotes (an unknown ref is dropped)`);
    assert.deepEqual(named(`${h.line} ${h.detail}`), [], `no person in the ${h.source} headline`);
    const have = digits(known(riverside.inputs, h.source));
    assert.ok(digits(`${h.line} ${h.detail}`).every(d => have.includes(d)), `${h.source}: every number is one the themes carry`);
    assert.ok((h.line.match(/\*\*/g) ?? []).length <= 2, "at most one bold phrase");
    assert.ok(!/["“”]/.test(h.line + h.detail), "nothing quoted in the words");
    assert.ok(h.line.length <= 140 && h.detail.length <= 400);
    assert.equal(riverside.inputs.sources.find(s => s.key === h.source)!.themes.find(t => t.ref === h.lead)!.thin, riverside.expect.thinLead[h.source]);
  }
});

test("The never-names-people check is real: names in the engagement never reach the model, the reply writes around them, and the check fails if it does not", () => {
  const withName: HeardInputs = JSON.parse(JSON.stringify(riverside.inputs));
  assert.deepEqual(named(heardPrompt.user(riverside.inputs)), [], "the inputs the database hands over carry no name");
  withName.sources[3].themes[0].quotes[0].text = "Priya runs the welcome table and it is the best part.";
  assert.deepEqual(named(heardPrompt.user(withName)), ["Priya"], "and the check does see a name when one is there (the database drops such a quote before the claim)");
  const out = heardPrompt.parse(riverside.reply, riverside.inputs);
  assert.deepEqual(named(JSON.stringify(out)), [], "the recorded reply writes around the names");
  const leaky = heardPrompt.parse(JSON.stringify({ headlines: [{ source: "input", lead: "t6", line: "Ruth said volunteers are stretched", detail: "Priya runs the welcome table.", themes: ["t6"], quotes: [] }] }), riverside.inputs);
  assert.deepEqual(named(JSON.stringify(leaky)), ["Priya", "Ruth"], "the check sees a name in a leaky reply (the database refuses such a headline)");
});

test("parse is defensive: unknown sources, leads and refs, junk and fences are dropped, not thrown", () => {
  const bad = JSON.stringify({ headlines: [{ source: "poll", lead: "t1", line: "x" }, { source: "survey", lead: "t9", line: "No such lead" }, { source: "survey", lead: "t1", line: "" },
    { source: "survey", lead: "T2", line: "Real", detail: "d", themes: ["t1", "t1", "t4", "t9", 7], quotes: ["q1"] }, null, 7, { source: "four_lists", lead: "t4", line: "Cards", quotes: ["Q1", "q3"] }] });
  const out = heardPrompt.parse("```json\n" + bad + "\n```", riverside.inputs);
  assert.deepEqual(out.headlines.map(h => h.source), ["survey", "four_lists"]);
  assert.equal(out.headlines[0].lead, "t2");
  assert.deepEqual(out.headlines[0].themes, ["t1"], "a ref from another source or one that does not exist is dropped");
  assert.deepEqual(out.headlines[0].quotes, [], "a quote the source does not have is dropped");
  assert.deepEqual(out.headlines[1].quotes, ["q1"], "a ref in capitals is read back, and another source's is dropped");
  assert.deepEqual(heardPrompt.parse("not json at all", riverside.inputs).headlines, []);
  assert.deepEqual(heardPrompt.parse("{\"headlines\":\"x\"}", riverside.inputs).headlines, []);
});

test("The scripted fake leads with each source's first theme, writes no number of its own and quotes by ref", async () => {
  const client = fakeClient("script");
  const reply = await client.complete({ system: heardPrompt.system, user: heardPrompt.user(riverside.inputs), maxTokens: 3000, timeoutMs: 5000 }, aiConfig({}));
  const out = heardPrompt.parse(reply.text, riverside.inputs);
  assert.deepEqual(out.headlines.map(h => h.source), ["survey", "four_lists", "input", "interviews"]);
  assert.deepEqual(out.headlines.map(h => h.lead), ["t1", "t4", "t6", "t7"]);
  for (const h of out.headlines) {
    assert.ok(digits(`${h.line} ${h.detail}`).every(d => digits(known(riverside.inputs, h.source)).includes(d)), `${h.source}: the fake writes only numbers the themes carry`);
    assert.deepEqual(named(`${h.line} ${h.detail}`), []);
    assert.equal((h.line.match(/\*\*/g) ?? []).length, 2);
    assert.ok(h.themes.includes(h.lead));
  }
  assert.ok(out.headlines[1].quotes.length > 0 && out.headlines[0].quotes.length === 0, "quotes only where the source has them");
  const none = await client.complete({ system: heardPrompt.system, user: heardPrompt.user({ sources: [] }), maxTokens: 3000, timeoutMs: 5000 }, aiConfig({}));
  assert.deepEqual(heardPrompt.parse(none.text, { sources: [] }).headlines, [], "with nothing accepted it drafts nothing");
});

test("Source names match by the words before the first dot, whatever the case", () => {
  assert.equal(heardKeyOf("Congregational survey"), "survey");
  assert.equal(heardKeyOf("congregational survey · 87 respondents"), "survey");
  assert.equal(heardKeyOf("Four Helpful Lists · 8 people"), "four_lists");
  assert.equal(heardKeyOf("Board and staff input conversations · 2 conversations"), "input");
  assert.equal(heardKeyOf("Leadership interviews"), "interviews");
  assert.equal(heardKeyOf("Leadership"), null);
  assert.equal(heardKeyOf(undefined), null);
  assert.equal(heardKeyOf(7), null);
  for (const k of ["survey", "four_lists", "input", "interviews"] as const) { assert.equal(heardKeyOf(heardNames[k]), k); assert.ok(heardFor[k].length > 3); }
});

const draft = (extra: Partial<HeardDraft> = {}): HeardDraft => ({ id: id(1), number: "31%", line: "named **a clear way into groups** as what to improve", detail: "27 of 87 survey answers asked for a clear way into a group.",
  quotes: [{ text: "Newcomers cannot find a small group to join.", label: "Leadership interview" }, { text: "People stay for the singing.", label: "Leadership interview" }], rests: [{ label: "A clear way into groups", count: "27 of 87 respondents", thin: false }],
  thin: false, thin_reason: null, basis: "87 respondents", by_hand: false, edited: false, ai: true, applied_at: null, stale: false, ...extra });

test("A draft becomes the step's fields: headline, number, source line and phone depth, and nothing else in the step changes", () => {
  const current = { options: { screen: "headline", source: "Congregational survey", other: "kept" } };
  const f = stepFields(draft(), current, "Congregational survey");
  assert.equal(f.prompt, "named **a clear way into groups** as what to improve");
  assert.deepEqual(f.options, { screen: "headline", source: "Congregational survey · 87 respondents", other: "kept", number: "31%" });
  assert.equal(heardKeyOf(f.options.source), "survey", "the step still matches its source after Apply");
  const again = stepFields(draft({ basis: "90 respondents" }), { options: f.options }, "Congregational survey");
  assert.equal(again.options.source, "Congregational survey · 90 respondents", "a second Apply replaces the basis, it does not stack");
  assert.equal(stepFields(draft({ number: "", basis: null }), { options: { screen: "headline", number: "9%" } }, "Leadership interviews").options.number, undefined, "no number clears the old one");
  assert.equal(stepFields(draft({ basis: null }), { options: { screen: "headline" } }, "Leadership interviews").options.source, "Leadership interviews", "a step with no source falls back to its source's name");
  assert.equal(sourceLine("Four Helpful Lists", "8 people"), "Four Helpful Lists · 8 people");
});

test("Thin data is marked on the line, and the phone depth carries the detail, the reason and the quotes the content screen reads", () => {
  assert.equal(headlineText("survey answers came from **people under 30**", true), "survey answers came from **people under 30** (thin data)");
  assert.equal(headlineText("survey answers came from people under 30.", true), "survey answers came from people under 30 (thin data)", "a full stop is not left before the mark");
  assert.equal(headlineText("named it", false), "named it");
  const d = draft({ thin: true, thin_reason: "6 of 87 respondents" });
  assert.equal(stepFields(d, { options: {} }, "Congregational survey").prompt.endsWith("(thin data)"), true);
  const blocks = depthBlocks(phoneDepth(d));
  assert.equal(blocks[0].kind, "text");
  assert.match((blocks[1] as { text: string }).text, /rests on 6 of 87 respondents, which is thin data/);
  assert.deepEqual(blocks.slice(2).map(b => b.kind), ["quote", "quote"]);
  assert.deepEqual(blocks[2], { kind: "quote", text: "Newcomers cannot find a small group to join.", source: "Leadership interview" });
  assert.equal(depthBlocks(phoneDepth(draft({ quotes: [], detail: "" }))).length, 0, "an empty draft has no depth");
  assert.ok(!/[–—]/.test(phoneDepth(d)));
});

test("The page words the round on the server's clock, and a source with nothing accepted says so", () => {
  const source = (key: "survey" | "four_lists", themes: number, step: boolean) => ({ key, name: heardNames[key], step: step ? { id: id(2), title: "t", part: "Pre-call", state: "draft" } : null, themes, thin_themes: 0, draft: null });
  const base = { ai: true, sources: [source("survey", 2, true)] };
  const round = (status: string, extra = {}) => ({ status, requested_at: new Date(1_000_000).toISOString(), attempts: 0, error: null, ok_at: null, offered: null, refused: null, kept: null, ...extra }) as HeardState["round"];
  assert.deepEqual(draftView({ ...base, ai: false, round: null }, 0), { kind: "off" });
  assert.deepEqual(draftView({ ai: true, sources: [source("survey", 0, true), source("four_lists", 3, false)], round: null }, 0), { kind: "nothing" }, "themes with no step, or a step with no themes, give nothing to draft from");
  assert.deepEqual(draftView({ ...base, round: null }, 0), { kind: "ready" });
  assert.deepEqual(draftView({ ...base, round: round("drafting") }, 1_010_000), { kind: "working", slow: false });
  assert.deepEqual(draftView({ ...base, round: round("pending") }, 1_040_000), { kind: "working", slow: true });
  assert.deepEqual(draftView({ ...base, round: round("drafting") }, 1_005_000, 1000), { kind: "working", slow: true });
  assert.deepEqual(draftView({ ...base, round: round("failed") }, 2_000_000), { kind: "failed" });
  assert.deepEqual(draftView({ ...base, round: round("ready", { offered: 3, refused: 1, kept: 1 }) }, 2_000_000), { kind: "done", offered: 3, refused: 1, kept: 1 });
  assert.deepEqual(sourceNote(source("survey", 0, true)), { kind: "nothing" });
  assert.deepEqual(sourceNote(source("survey", 3, false)), { kind: "no_step" });
  assert.deepEqual(sourceNote({ ...source("survey", 3, true), thin_themes: 1 }), { kind: "waiting", themes: 3, thin: 1 });
});

test("heardBody accepts only well-formed calls and cleans text", () => {
  assert.deepEqual(heardBody({ action: "draft", id: id(3) }), { action: "draft", id: id(3) });
  assert.equal(heardBody({ action: "draft", id: "nope" }), null);
  assert.deepEqual(heardBody({ action: "discard", source: "survey" }), { action: "discard", source: "survey" });
  assert.equal(heardBody({ action: "discard", source: "poll" }), null);
  assert.equal(heardBody({ action: "burn", source: "survey" }), null);
  assert.equal(heardBody(null), null);
  assert.deepEqual(heardBody({ action: "apply", source: "input", number: " 2  of 2 ", line: "  named **volunteers**  ", detail: "A.\r\n\r\n\r\n\r\nB.  ", keep: [2, 0, 0] }),
    { action: "apply", source: "input", number: "2 of 2", line: "named **volunteers**", detail: "A.\n\nB.", keep: [0, 2] });
  assert.deepEqual(heardBody({ action: "edit", source: "survey", number: "", line: "x" }), { action: "edit", source: "survey", number: "", line: "x", detail: "", keep: null });
  assert.deepEqual(heardEdit({ line: "" }), { error: "Write the headline line." });
  assert.ok("error" in heardEdit({ line: "x".repeat(141) }));
  assert.ok("error" in heardEdit({ line: "one **two** and **three**" }));
  assert.ok("error" in heardEdit({ line: "one * star" }));
  assert.ok("error" in heardEdit({ line: "x", number: "1234567890123" }));
  assert.ok("error" in heardEdit({ line: "x", detail: "d".repeat(601) }));
  assert.ok("error" in heardEdit({ line: "x", keep: [3] }));
  assert.ok("error" in heardEdit({ line: "x", keep: "all" }));
  assert.ok("error" in heardEdit({ line: "x", keep: [0, 1, 2, 0] }));
  assert.deepEqual(heardEdit({ line: "x", keep: [] }), { number: "", line: "x", detail: "", keep: [] });
});

test("Messages are plain sentences with no dashes", () => {
  for (const s of ["denied", "closed", "ai_off", "ai_unavailable", "nothing", "busy", "no_step", "not_found", "unchanged", "conflict", "running", "step_missing", "invalid_request", "other"]) {
    assert.ok(heardMessage(s).length > 5 && !/[–—]/.test(heardMessage(s)), s);
  }
});

// A database stand-in that records the calls the worker makes.
function mockDb(claim: unknown, applied: { name: string; args: Record<string, unknown> }[], failApply = false) {
  return { rpc: async (name: string, args: Record<string, unknown>) => {
    applied.push({ name, args });
    if (name === "discover_heard_claim") return { data: claim, error: null };
    if (name === "discover_heard_apply") return failApply ? { data: null, error: { message: "boom" } } : { data: { status: "ok", offered: 4 }, error: null };
    return { data: { status: "ok" }, error: null };
  } } as unknown as SupabaseClient;
}
const claimed = { status: "claimed", run: id(9), job: "draft_what_we_heard", prompt_version: heardVersion, inputs: riverside.inputs };

test("The worker claims, asks the deeper model once, and hands the parsed reply to apply with usage", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const ai = recordedClient([{ job: "draft_what_we_heard", user: heardPrompt.user(riverside.inputs), reply: riverside.reply }]);
  const report = await runHeard(mockDb(claimed, calls), ai, id(5), aiConfig({}));
  assert.equal(report.status, "ok");
  assert.equal(ai.calls.length, 1);
  assert.equal(ai.calls[0].system, heardPrompt.system);
  const apply = calls.find(c => c.name === "discover_heard_apply")!;
  assert.equal((apply.args.p_output as { headlines: unknown[] }).headlines.length, 4);
  assert.ok(String((apply.args.p_output as { raw: string }).raw).length > 0);
  assert.ok(!calls.some(c => c.name === "discover_heard_fail"));
  assert.deepEqual(calls[0].args.p_versions, { draft_what_we_heard: heardVersion });
});

test("The worker records a failure when the model fails, and when apply fails; and does nothing when there is nothing to claim", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const broken = { model: () => "m", complete: async () => { throw new Error("request timed out"); } };
  assert.equal((await runHeard(mockDb(claimed, calls), broken, id(5), aiConfig({}))).status, "timeout");
  assert.equal(calls.find(c => c.name === "discover_heard_fail")?.args.p_error, "timeout");
  const calls2: typeof calls = [];
  const ai = recordedClient([{ job: "draft_what_we_heard", user: heardPrompt.user(riverside.inputs), reply: riverside.reply }]);
  assert.equal((await runHeard(mockDb(claimed, calls2, true), ai, id(5), aiConfig({}))).status, "unavailable");
  assert.ok(calls2.some(c => c.name === "discover_heard_fail"));
  const calls3: typeof calls = [];
  assert.equal((await runHeard(mockDb({ status: "idle" }, calls3), ai, id(5), aiConfig({}))).status, "idle");
  assert.equal(calls3.length, 1);
  const calls4: typeof calls = [];
  assert.equal((await runHeard(mockDb({ ...claimed, prompt_version: "heard-draft@0" }, calls4), ai, id(5), aiConfig({}))).status, "unavailable");
});

test("The What We Heard job allows a call of at least a minute, never past the function limit", () => {
  const c = aiConfig({});
  assert.ok(heardTimeoutMs(c) >= 60000 && heardTimeoutMs(c) <= 280000);
  assert.ok(heardBudgetMs(c) >= 70000 && heardBudgetMs(c) <= 290000);
});
