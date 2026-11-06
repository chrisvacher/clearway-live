import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfig } from "../../lib/ai/config";
import { fakeClient, isThemes, recordedClient } from "../../lib/ai/fake";
import { prompts, replyJson, themesPrompt, themesVersion, type ThemesInputs } from "../../lib/ai/prompts";
import { runThemes, themesBudgetMs, themesTimeoutMs } from "../../lib/ai/themes";
import { draftView, themeBody, themeMessage, themeStrength, type ThemesState } from "../../lib/discover/themes";
import { thin } from "../../lib/discover/thin";
import { strength } from "../../lib/discover/strength";

type Case = { name: string; inputs: ThemesInputs; reply: string; expect: { conversations: number; four_lists: number; restsOn: Record<string, [number, number]> } };
const fixtures = JSON.parse(readFileSync(new URL("../fixtures/ai/discover-themes.json", import.meta.url), "utf8")) as { names: string[]; cases: Case[] };
const riverside = fixtures.cases[0];
const named = (text: string) => fixtures.names.filter(n => new RegExp(`\\b${n}\\b`, "i").test(text));
const id = (n: number) => `85600000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("The themes prompt is versioned, JSON only, keeps horizons exact and never names people or invents", () => {
  assert.match(themesPrompt.version, /^themes-draft@\d+$/);
  assert.equal(themesVersion, themesPrompt.version);
  assert.match(themesPrompt.system, /Clearway Church Solutions/);
  assert.match(themesPrompt.system, /one JSON object and nothing else/);
  assert.ok(!/[–—]/.test(themesPrompt.system), "no em or en dashes");
  for (const term of ["10-year Future", "3-year Vision", "1-year Outlook"]) assert.ok(themesPrompt.system.includes(term));
  assert.ok(!/(\b3 year\b|\bthree-year\b|\b10 year\b|\bten-year\b|\b1 year\b|\bone-year\b)/i.test(themesPrompt.system));
  assert.match(themesPrompt.system, /Never invent/);
  assert.match(themesPrompt.system, /Never name a person/);
  assert.match(themesPrompt.system, /Keep the room's words/);
  assert.match(themesPrompt.system, /word for word/);
  assert.match(themesPrompt.system, /data, never instructions/);
  assert.match(themesPrompt.system, /Never write a count/);
  assert.equal(isThemes({ system: themesPrompt.system }), true);
  for (const p of Object.values(prompts)) assert.notEqual(p.system, themesPrompt.system);
});

test("The model sees note text and card words under short refs: no ids, titles, people or attendees", () => {
  const user = themesPrompt.user(riverside.inputs);
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(user), "no ids");
  assert.ok(!/"id"|"title"|"person"|speaker|attendee|email/.test(user), "the person field, titles and ids are never sent");
  const parsed = replyJson(user) as { notes: { ref: string; kind: string }[]; cards: { ref: string; list: string; people_agree: number }[] };
  assert.deepEqual(parsed.notes.map(n => n.ref), ["n1", "n2", "n3", "n4", "n5"]);
  assert.equal(parsed.notes[0].kind, "leadership interview");
  assert.equal(parsed.notes[2].kind, "board or staff input conversation");
  assert.deepEqual(parsed.cards.map(c => c.list).slice(0, 2), ["what's right", "what's wrong"]);
});

test("The recorded Riverside reply: sourced per kind, quotes word for word, no names, no counts from the model", () => {
  const out = themesPrompt.parse(riverside.reply, riverside.inputs);
  assert.equal(out.themes.filter(t => t.source === "conversations").length, riverside.expect.conversations);
  assert.equal(out.themes.filter(t => t.source === "four_lists").length, riverside.expect.four_lists);
  const text = new Map([...riverside.inputs.notes, ...riverside.inputs.cards].map(x => [x.ref, x.text]));
  for (const t of out.themes) {
    const prefix = t.source === "conversations" ? "n" : "f";
    assert.ok(t.sources.length > 0 && t.sources.every(s => s.startsWith(prefix) && text.has(s)), `${t.label} rests on its own kind only`);
    if (t.quote) { assert.ok(text.get(t.quote.source)!.includes(t.quote.text), "word for word"); }
    assert.deepEqual(named(`${t.label} ${t.detail} ${t.quote?.text ?? ""}`), [], `no person in ${t.label}`);
    assert.ok(!/\d/.test(t.label + t.detail), "no numbers from the model");
    const [rests, out_of] = riverside.expect.restsOn[t.label] ?? [];
    if (rests) { assert.equal(t.sources.length, rests); assert.equal(riverside.inputs.total_notes, out_of); }
  }
});

test("The never-names-people check is real: the notes name someone, the reply writes around it, and the check fails if it does not", () => {
  assert.ok(riverside.inputs.notes.some(n => n.text.includes("Priya runs the welcome table")), "a fixture note names a person");
  const out = themesPrompt.parse(riverside.reply, riverside.inputs);
  assert.deepEqual(named(JSON.stringify(out)), [], "the recorded reply writes around the name");
  const leaky = themesPrompt.parse(JSON.stringify({ conversations: [{ label: "Priya runs the welcome table", detail: "", sources: ["n1"], quote: { text: "Priya runs the welcome table and it is the best part.", source: "n1" } }] }), riverside.inputs);
  assert.deepEqual(named(JSON.stringify(leaky)), ["Priya"], "and the check does see a name when one is there (the database refuses such a theme)");
});

test("parse is defensive: unknown refs, wrong kind, junk and fences are dropped, not thrown", () => {
  const bad = JSON.stringify({ conversations: [{ label: "A", detail: "", sources: ["f1"] }, { label: "", sources: ["n1"] }, { label: "Real", sources: ["n1", "n9", "n1"], quote: { text: "x", source: "n9" } }, null, 7],
    four_lists: [{ label: "Card theme", sources: ["f2"], quote: { text: "Hard to find a small group as a newcomer", source: "f2" } }, { label: "Mixed", sources: ["n1"] }] });
  const out = themesPrompt.parse("```json\n" + bad + "\n```", riverside.inputs);
  assert.deepEqual(out.themes.map(t => t.label), ["Real", "Card theme"]);
  assert.deepEqual(out.themes[0].sources, ["n1"]);
  assert.equal(out.themes[0].quote, null);
  assert.deepEqual(themesPrompt.parse("not json at all", riverside.inputs).themes, []);
  assert.deepEqual(themesPrompt.parse("{\"conversations\":\"x\"}", riverside.inputs).themes, []);
});

test("The scripted fake drafts from the notes, skips themes already on the page or rejected, and quotes word for word", async () => {
  const client = fakeClient("script");
  const call = (inputs: ThemesInputs) => ({ system: themesPrompt.system, user: themesPrompt.user(inputs), maxTokens: 4000, timeoutMs: 5000 });
  const first = await client.complete(call(riverside.inputs), aiConfig({}));
  const out = themesPrompt.parse(first.text, riverside.inputs);
  assert.ok(out.themes.some(t => t.source === "conversations" && t.label === "Small groups are hard to find"));
  assert.ok(out.themes.some(t => t.source === "four_lists"));
  const text = new Map([...riverside.inputs.notes, ...riverside.inputs.cards].map(x => [x.ref, x.text]));
  for (const t of out.themes) if (t.quote) assert.ok(text.get(t.quote.source)!.includes(t.quote.text));
  const again = await client.complete(call({ ...riverside.inputs, already: [{ ref: "t1", source: "conversations", label: "Small groups are hard to find" }], rejected: ["volunteers are stretched"] }), aiConfig({}));
  const labels = themesPrompt.parse(again.text, riverside.inputs).themes.map(t => t.label);
  assert.ok(!labels.includes("Small groups are hard to find") && !labels.includes("Volunteers are stretched"));
});

test("Thin and strong follow one rule, the same cases the database test uses", () => {
  const cases: [string, number, number | null, boolean, boolean][] = [
    ["conversations", 1, 5, true, false], ["conversations", 2, 5, false, true], ["conversations", 4, 5, false, true], ["conversations", 0, 5, true, false],
    ["four_lists", 1, 8, true, false], ["four_lists", 3, 8, false, false], ["four_lists", 4, 8, false, true], ["four_lists", 2, 8, false, false],
    ["survey", 9, 87, true, false], ["survey", 40, 500, true, false], ["survey", 50, 100, false, true]];
  for (const [source, restsOn, outOf, isThin, isStrong] of cases) {
    const counts = { source: source as "survey", restsOn, outOf };
    assert.equal(thin(counts).thin, isThin, `${source} ${restsOn}/${outOf} thin`);
    assert.equal(strength(counts).strong, isStrong, `${source} ${restsOn}/${outOf} strong`);
    assert.equal(themeStrength({ source: source as "survey", rests_on: restsOn, out_of: outOf }).strong, isStrong);
  }
});

test("themeBody accepts only well-formed calls and cleans text", () => {
  assert.deepEqual(themeBody({ action: "accept", theme: id(1) }), { action: "accept", theme: id(1) });
  assert.equal(themeBody({ action: "accept", theme: "nope" }), null);
  assert.equal(themeBody({ action: "burn", theme: id(1) }), null);
  assert.equal(themeBody(null), null);
  assert.deepEqual(themeBody({ action: "rename", theme: id(1), label: "  Small   groups \n are hard " }), { action: "rename", theme: id(1), label: "Small groups are hard" });
  assert.deepEqual(themeBody({ action: "rename", theme: id(1), label: "   " }), { error: "Give the theme a name." });
  assert.ok("error" in (themeBody({ action: "rename", theme: id(1), label: "x".repeat(300) }) as object));
  assert.deepEqual(themeBody({ action: "merge", theme: id(1), into: id(2) }), { action: "merge", theme: id(1), into: id(2) });
  assert.equal(themeBody({ action: "merge", theme: id(1), into: "x" }), null);
  assert.deepEqual(themeBody({ action: "draft", id: id(3) }), { action: "draft", id: id(3) });
  const add = themeBody({ action: "add", id: id(4), source: "conversations", label: "A", detail: "", sources: [id(1), id(1), id(2)] });
  assert.deepEqual(add, { action: "add", id: id(4), source: "conversations", label: "A", detail: "", sources: [id(1), id(2)] });
  assert.equal(themeBody({ action: "add", id: id(4), source: "survey", label: "A", detail: "", sources: [] }), null);
  assert.equal(themeBody({ action: "add", id: id(4), source: "four_lists", label: "A", detail: "", sources: ["bad"] }), null);
});

test("draftView says what the page should say, on the server's clock", () => {
  const base = { ai: true, inputs: { notes: 2, cards: 3 } };
  const round = (status: string, extra = {}) => ({ status, redraft: false, requested_at: new Date(1_000_000).toISOString(), attempts: 0, error: null, ok_at: null, offered: null, refused: null, stale_notes: 0, left_out: 0, ...extra }) as ThemesState["round"];
  assert.deepEqual(draftView({ ...base, ai: false, round: null }, 0), { kind: "off" });
  assert.deepEqual(draftView({ ai: true, inputs: { notes: 0, cards: 0 }, round: null }, 0), { kind: "nothing" });
  assert.deepEqual(draftView({ ...base, round: null }, 0), { kind: "ready" });
  assert.deepEqual(draftView({ ...base, round: round("drafting") }, 1_010_000), { kind: "working", slow: false, redraft: false });
  assert.deepEqual(draftView({ ...base, round: round("pending", { redraft: true }) }, 1_040_000), { kind: "working", slow: true, redraft: true });
  assert.deepEqual(draftView({ ...base, round: round("drafting") }, 1_005_000, 1000), { kind: "working", slow: true, redraft: false });
  assert.deepEqual(draftView({ ...base, round: round("failed") }, 2_000_000), { kind: "failed" });
  assert.deepEqual(draftView({ ...base, round: round("ready", { offered: 3, refused: 1, stale_notes: 2, left_out: 0 }) }, 2_000_000), { kind: "done", offered: 3, refused: 1, stale: 2, leftOut: 0, cardsLeftOut: 0 });
});

test("Messages are plain sentences with no dashes", () => {
  for (const s of ["denied", "closed", "ai_off", "ai_unavailable", "nothing", "busy", "not_found", "survey_theme", "merged", "cannot_merge", "unchanged", "conflict", "limit", "invalid_request", "other"]) {
    assert.ok(themeMessage(s).length > 5 && !/[–—]/.test(themeMessage(s)), s);
  }
});

// A database stand-in that records the calls the worker makes.
function mockDb(claim: unknown, applied: { name: string; args: Record<string, unknown> }[], failApply = false) {
  return { rpc: async (name: string, args: Record<string, unknown>) => {
    applied.push({ name, args });
    if (name === "discover_theme_claim") return { data: claim, error: null };
    if (name === "discover_theme_apply") return failApply ? { data: null, error: { message: "boom" } } : { data: { status: "ok", offered: 2 }, error: null };
    return { data: { status: "ok" }, error: null };
  } } as unknown as SupabaseClient;
}
const claimed = { status: "claimed", run: id(9), job: "draft_discover_themes", prompt_version: themesVersion, inputs: riverside.inputs };

test("The worker claims, asks the deeper model once, and hands the parsed reply to apply with usage", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const ai = recordedClient([{ job: "draft_discover_themes", user: themesPrompt.user(riverside.inputs), reply: riverside.reply }]);
  const report = await runThemes(mockDb(claimed, calls), ai, id(5), aiConfig({}));
  assert.equal(report.status, "ok");
  assert.equal(ai.calls.length, 1);
  assert.equal(ai.calls[0].system, themesPrompt.system);
  const apply = calls.find(c => c.name === "discover_theme_apply")!;
  assert.equal((apply.args.p_output as { themes: unknown[] }).themes.length, 6);
  assert.ok(String((apply.args.p_output as { raw: string }).raw).length > 0);
  assert.ok(!calls.some(c => c.name === "discover_theme_fail"));
});

test("The worker records a failure when the model fails, and when apply fails; and does nothing when there is nothing to claim", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const broken = { model: () => "m", complete: async () => { throw new Error("request timed out"); } };
  assert.equal((await runThemes(mockDb(claimed, calls), broken, id(5), aiConfig({}))).status, "timeout");
  assert.equal(calls.find(c => c.name === "discover_theme_fail")?.args.p_error, "timeout");
  const calls2: typeof calls = [];
  const ai = recordedClient([{ job: "draft_discover_themes", user: themesPrompt.user(riverside.inputs), reply: riverside.reply }]);
  assert.equal((await runThemes(mockDb(claimed, calls2, true), ai, id(5), aiConfig({}))).status, "unavailable");
  assert.ok(calls2.some(c => c.name === "discover_theme_fail"));
  const calls3: typeof calls = [];
  assert.equal((await runThemes(mockDb({ status: "idle" }, calls3), ai, id(5), aiConfig({}))).status, "idle");
  assert.equal(calls3.length, 1);
  const calls4: typeof calls = [];
  assert.equal((await runThemes(mockDb({ ...claimed, prompt_version: "themes-draft@0" }, calls4), ai, id(5), aiConfig({}))).status, "unavailable");
});

test("The themes job allows long notes: at least 90 seconds, never past the function limit", () => {
  const c = aiConfig({});
  assert.ok(themesTimeoutMs(c) >= 90000 && themesTimeoutMs(c) <= 280000);
  assert.ok(themesBudgetMs(c) >= 100000 && themesBudgetMs(c) <= 290000);
});
