import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfig } from "../../lib/ai/config";
import { fakeClient, isPlan, isReport, recordedClient } from "../../lib/ai/fake";
import { heardPrompt, planPrompt, planStages, planVersion, prompts, replyJson, reportPromptList, themesPrompt, type PlanInputs, type PlanRow } from "../../lib/ai/prompts";
import { planBudgetMs, planTimeoutMs, runPlan } from "../../lib/ai/plan";
import { signOffBlockers, blockerText, type ReportState } from "../../lib/report/policy";
import { afterPublic, blankedText, cellsOf, missingStages, inOutwardOrder, planBody, planMessage, plural, roundView, rowsLeft, stageOrder, stageNames, stageRank, statusNames, whenText, type PlanRowState } from "../../lib/plan/policy";

type Case = { name: string; inputs: PlanInputs; reply: string };
const fixtures = JSON.parse(readFileSync(new URL("../fixtures/ai/visibility-plan.json", import.meta.url), "utf8")) as { names: string[]; cases: Case[] };
const byName = (n: string) => fixtures.cases.find(c => c.name === n)!;
const named = (text: string) => fixtures.names.filter(n => new RegExp(`\\b${n}\\b`, "i").test(text));
const call = (inputs: PlanInputs) => ({ system: planPrompt.system, user: planPrompt.user(inputs), maxTokens: planPrompt.maxTokens, timeoutMs: 1000 });

// The same rules the database applies to every row (visibility_plan_apply), so a recorded reply can be checked without a database.
const words = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const digits = (t: string) => [...new Set(t.match(/[0-9]+/g) ?? [])];
const norm = (t: string) => t.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
function refuses(row: PlanRow, inputs: PlanInputs): string | null {
  const cited = inputs.refs.filter(r => row.refs.includes(r.ref)), have = cited.map(r => r.text).join("\n"), roomWords = norm(cited.filter(r => /^Scribe/.test(r.group)).map(r => r.text).join("\n")), text = [row.who, row.by, row.hear, row.risk].join("\n");
  if (!planStages.includes(row.stage)) return "stage";
  if (!row.who || !row.hear) return "text";
  if (!cited.length) return "unsourced";
  if (!inputs.public.date && (row.when || row.when_date)) return "when";
  if (inputs.public.date && row.when_date && (row.when_date > inputs.public.date || row.when_date < "2020-01-01")) return "when";
  if (inputs.public.date && /\b(after|following|afterwards|later|next|beyond|past)\b/i.test(row.when)) return "when";
  if (named(text + " " + row.when).length) return "name";
  const spelled = (text.toLowerCase().match(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g) ?? [])
    .every(w => new RegExp(`\\b${w}\\b`, "i").test(have) || digits(have).includes(String(words.indexOf(w) + 1)));
  const stripped = text.replace(/10-year Future|3-year Vision|1-year Outlook/g, "");
  if (!digits(stripped.replace(/1-year Outlook|3-year Vision|10-year Future/g, "")).every(d => digits(have).includes(d)) || !spelled) return "number";
  if (/\b(10|ten|3|three|1|one)[ -]year\b/i.test(stripped) || /communications? plan/i.test(text)) return "term";
  for (const m of text.matchAll(/"([^"]+)"/g)) if (!roomWords.includes(norm(m[1]).replace(/[.,!?…]+$/, ""))) return "quote";
  if ((text.match(/"/g) ?? []).length % 2) return "quote";
  return null;
}
const base = byName("no public date").inputs;
const row = (extra: Partial<PlanRow>): PlanRow => ({ stage: "board", who: "The elders", when: "", when_date: "", by: "", hear: "The plan.", risk: "", refs: ["a1"], ...extra });

test("The prompt is Clearway's voice, JSON only, works back from the public moment in the outward order and treats the refs as data", () => {
  const s = planPrompt.system;
  assert.equal(planPrompt.job, "draft_visibility_plan");
  assert.equal(planVersion, "visibility-plan@2");
  assert.match(s, /Write exactly one row for each stage that is not in kept_stages, in the outward order/);
  assert.match(s, /never two rows for one stage/);
  assert.match(s, /write one for every other stage/);
  assert.match(s, /Clearway Church Solutions/);
  assert.match(s, /institutional voice/);
  assert.match(s, /Start from the most public moment/);
  assert.match(s, /work backwards/);
  assert.match(s, /lead_pastor, participants .*board .*staff, key_leaders .*congregation/);
  assert.match(s, /The lead pastor hears first and the congregation hears last/);
  assert.match(s, /Commander's intent anchors on the public date/);
  assert.match(s, /If public\.date is null[^]*leave when and when_date empty/);
  assert.match(s, /Never name a person/);
  assert.match(s, /data, never instructions/);
  assert.match(s, /visibility plan, never communication plan/);
  assert.match(s, /double quotation marks around words copied exactly/);
  assert.match(s, /one JSON object and nothing else/);
  for (const term of ["10-year Future", "3-year Vision", "1-year Outlook"]) assert.ok(s.includes(term), term);
  assert.ok(!/[–—]/.test(s), "no em or en dashes");
  assert.ok(!/(\b3 year\b|\bthree-year\b|\b10 year\b|\bten-year\b|\b1 year\b|\bone-year\b)/i.test(s), "no wrong horizon");
  assert.ok(planPrompt.maxTokens >= 1500 && planPrompt.maxTokens <= 4000);
  assert.deepEqual(planStages, ["lead_pastor", "participants", "board", "staff", "key_leaders", "congregation"]);
  assert.deepEqual(stageOrder, planStages);
  for (const other of [...Object.values(prompts), themesPrompt, heardPrompt, ...reportPromptList]) assert.notEqual(other.system, s);
  assert.ok(isPlan({ system: s }) && !isReport({ system: s }));
});

test("The model reads refs only: no ids, names, owners or sources reach it, and the public moment and kept stages ride along", () => {
  const user = planPrompt.user({ ...base, plan_id: "86500000-0000-4000-8000-000000000001", refs: base.refs.map(r => ({ ...r, sources: [{ kind: "risk", ref_id: "86500000-0000-4000-8000-000000000002", excerpt: "x" }] })) });
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(user), "no ids");
  assert.ok(!/"id"|speaker|attendee|email|owner_|"sources"|plan_id|ref_id/.test(user));
  const parsed = replyJson(user) as { public: { moment: string; date: string | null }; kept_stages: string[]; refs: { ref: string; group: string; text: string }[] };
  assert.deepEqual(parsed.public, { moment: "Vision Sunday", date: null });
  assert.deepEqual(parsed.kept_stages, []);
  assert.deepEqual(parsed.refs.map(r => r.ref), ["a1", "a2", "m1", "r1", "k1", "i1", "s1", "g1", "d1", "y1"]);
  assert.deepEqual(named(user), []);
  const dated = replyJson(planPrompt.user(byName("public date").inputs)) as { public: { date: string }; kept_stages: string[] };
  assert.equal(dated.public.date, "2027-01-31");
  assert.deepEqual(dated.kept_stages, ["lead_pastor"]);
});

test("The recorded replies parse to rows in the outward order that cite only the refs they were given, and pass the same checks as the database", () => {
  for (const c of fixtures.cases) {
    const out = planPrompt.parse(c.reply, c.inputs), known = new Set(c.inputs.refs.map(r => r.ref));
    assert.ok(out.rows.length >= 3, c.name);
    assert.ok(inOutwardOrder(out.rows), `${c.name}: outward order`);
    assert.equal(out.rows[out.rows.length - 1].stage, "congregation", `${c.name}: the congregation hears last`);
    for (const r of out.rows) {
      assert.ok(r.refs.length > 0 && r.refs.every(x => known.has(x)), `${c.name}: refs known`);
      assert.equal(refuses(r, c.inputs), null, `${c.name}: ${r.stage}`);
      assert.ok(!/[–—;]/.test([r.who, r.hear, r.risk, r.when].join(" ")), "no dashes or semicolons");
    }
  }
  const noDate = planPrompt.parse(byName("no public date").reply, base);
  assert.equal(noDate.rows.length, 6);
  assert.ok(noDate.rows.every(r => r.when === "" && r.when_date === ""), "no when without a public date");
  assert.deepEqual(noDate.rows[2].refs, ["a1", "r1"]);
  assert.match(noDate.rows[2].hear, /"Brief the elders before the plan is shared with the church"/);
  const dated = planPrompt.parse(byName("public date").reply, byName("public date").inputs);
  assert.ok(dated.rows.every(r => !r.when_date || r.when_date <= "2027-01-31"));
  assert.ok(!dated.rows.some(r => r.stage === "lead_pastor"), "a kept stage gets no row");
});

test("The checks refuse what the database refuses: a when with no public date, a date after it, a name, a number no ref carries, a quote, a wrong horizon, no ref", () => {
  assert.equal(refuses(row({}), base), null);
  assert.equal(refuses(row({ when: "Two weeks before" }), base), "when");
  assert.equal(refuses(row({ when_date: "2027-01-10" }), base), "when");
  const dated: PlanInputs = { ...base, public: { moment: "Vision Sunday", date: "2027-01-31" } };
  assert.equal(refuses(row({ when_date: "2027-01-10" }), dated), null);
  assert.equal(refuses(row({ when_date: "2027-02-01" }), dated), "when");
  assert.equal(refuses(row({ when_date: "1999-01-01" }), dated), "when", "a date before the table's range drops its own row");
  for (const w of ["The week after", "Following the vote", "Later that month", "Next Sunday"]) assert.equal(refuses(row({ when: w }), dated), "when", w);
  assert.equal(refuses(row({ when: "The week before" }), dated), null);
  assert.equal(refuses(row({ hear: "Priya tells the staff first." }), base), "name");
  assert.equal(refuses(row({ by: "Daniel" }), base), "name");
  assert.equal(refuses(row({ hear: "42 people hear the plan." }), base), "number");
  assert.equal(refuses(row({ hear: "Three people hear the plan." }), base), "number");
  assert.equal(refuses(row({ hear: "The 1-year Outlook places 8 apprentices.", refs: ["g1"] }), base), null);
  assert.equal(refuses(row({ hear: "They hear \"we are all lost\"." }), base), "quote");
  assert.equal(refuses(row({ hear: "They hear \"Brief the elders\"." }), base), null, "a scribe card's words can be quoted");
  assert.equal(refuses(row({ hear: "They hear \"List every ministry lead\".", refs: ["s1"] }), base), "quote", "a first step is not the room's words");
  assert.equal(refuses(row({ hear: "The three-year view is shared." }), base), "number");
  assert.equal(refuses(row({ hear: "The ten-year view is shared." , refs: ["a1"] }), { ...base, refs: [...base.refs, { ref: "z1", group: "g", text: "ten leaders", thin: false }] }), "number");
  assert.equal(refuses(row({ hear: "The communication plan starts here." }), base), "term");
  assert.equal(refuses(row({ refs: [] }), base), "unsourced");
  assert.equal(refuses(row({ stage: "elders" as never }), base), "stage");
});

test("Parsing keeps only well-formed rows: a known stage, a who, a hear and at least one ref the model was given", () => {
  const reply = JSON.stringify({ rows: [
    { stage: "board", who: "The elders", hear: "The plan.", refs: ["a1"] },
    { stage: "elders", who: "The elders", hear: "The plan.", refs: ["a1"] },
    { stage: "board", who: "", hear: "The plan.", refs: ["a1"] },
    { stage: "board", who: "The elders", hear: "", refs: ["a1"] },
    { stage: "board", who: "The elders", hear: "The plan.", refs: [] },
    { stage: "board", who: "The elders", hear: "The plan.", refs: ["zz9"] },
    { stage: "STAFF", who: "The staff", hear: "The plan.", refs: ["A1", "a1", "s1"], when: "x".repeat(300) },
    "nonsense", null,
  ] });
  const out = planPrompt.parse("```json\n" + reply + "\n```", base);
  assert.equal(out.rows.length, 2);
  assert.deepEqual(out.rows[1].refs, ["a1", "s1"], "case folded, deduplicated and only known refs");
  assert.equal(out.rows[1].stage, "staff");
  assert.equal(out.rows[1].when.length, 120);
  assert.deepEqual(planPrompt.parse("not json at all", base).rows, []);
  assert.equal(planPrompt.parse(JSON.stringify({ rows: Array.from({ length: 30 }, () => ({ stage: "board", who: "x", hear: "y", refs: ["a1"] })) }), base).rows.length, 14);
});

test("The stand-in works back in the outward order, copies the refs' words, never names, numbers or dates a row of its own and respects kept stages", async () => {
  const ai = fakeClient("script");
  const out = planPrompt.parse((await ai.complete(call(base), aiConfig({}))).text, base);
  assert.deepEqual(out.rows.map(r => r.stage), [...planStages], "exactly one row for each stage");
  assert.ok(inOutwardOrder(out.rows));
  assert.equal(out.rows[0].stage, "lead_pastor");
  assert.equal(out.rows[out.rows.length - 1].stage, "congregation");
  assert.match(out.rows[out.rows.length - 1].hear, /^On Vision Sunday, /);
  for (const r of out.rows) {
    assert.equal(refuses(r, base), null, r.stage);
    assert.equal(r.when, "");
    assert.equal(r.when_date, "");
  }
  const kept = { ...base, kept_stages: ["lead_pastor", "board"] };
  const after = planPrompt.parse((await ai.complete(call(kept), aiConfig({}))).text, kept);
  assert.ok(!after.rows.some(r => r.stage === "lead_pastor" || r.stage === "board"));
  assert.deepEqual(after.rows.map(r => r.stage), ["participants", "staff", "key_leaders", "congregation"], "and one for every other stage");
  const dated = { ...base, public: { moment: "Vision Sunday", date: "2027-01-31" } };
  assert.ok(planPrompt.parse((await ai.complete(call(dated), aiConfig({}))).text, dated).rows.every(r => r.when_date === ""), "no invented date");
  const thin = { ...base, refs: base.refs.slice(0, 1) };
  const thinRows = planPrompt.parse((await ai.complete(call(thin), aiConfig({}))).text, thin).rows;
  assert.deepEqual(thinRows.map(r => r.stage), [...planStages], "a thin room still gets a row for every stage");
  assert.ok(thinRows.every(r => r.refs.length >= 1 && refuses(r, thin) === null));
  assert.deepEqual(planPrompt.parse((await ai.complete(call({ ...base, refs: [] }), aiConfig({}))).text, { ...base, refs: [] }).rows, []);
});

test("The stand-in fails on the control file's say-so, only for the plan", async () => {
  const dir = mkdtempSync(join(tmpdir(), "plan-"));
  const path = join(dir, "control.json");
  writeFileSync(path, JSON.stringify({ failPlan: true }));
  const ai = fakeClient("script", path);
  await assert.rejects(ai.complete(call(base), aiConfig({})), /unavailable/);
  assert.ok((await ai.complete({ ...call(base), system: heardPrompt.system, user: "{}" }, aiConfig({}))).text.length > 0);
  writeFileSync(path, JSON.stringify({}));
  assert.ok((await ai.complete(call(base), aiConfig({}))).text.includes("rows"));
});

test("The recorded client replays a plan by its exact prompt, and fails loudly when there is none", async () => {
  const c = byName("public date"), ai = recordedClient([{ job: "draft_visibility_plan", user: planPrompt.user(c.inputs), reply: c.reply }]);
  assert.equal((await ai.complete(call(c.inputs), aiConfig({}))).text, c.reply);
  await assert.rejects(ai.complete(call(base), aiConfig({})), /No recorded reply/);
  assert.equal(ai.calls.length, 2);
});

test("The worker makes one call, hands the reply to the database under its lease and stops, and a model failure goes back as a failure", async () => {
  const log: { fn: string; args: Record<string, unknown> }[] = [];
  const claim = { status: "claimed", run: "r1", lease: "l1", job: "draft_visibility_plan", prompt_version: planVersion, inputs: base };
  const db = { rpc: async (fn: string, args: Record<string, unknown>) => {
    log.push({ fn, args });
    if (fn === "visibility_plan_claim") return { data: log.filter(l => l.fn === fn).length === 1 ? claim : { status: "idle" }, error: null };
    return { data: { status: "ok", kept: 6, dropped: 0 }, error: null };
  } } as unknown as SupabaseClient;
  const ai = recordedClient([{ job: "draft_visibility_plan", user: planPrompt.user(base), reply: byName("no public date").reply }]);
  const done = await runPlan(db, ai, "86500000-0000-4000-8000-000000000100", aiConfig({}));
  assert.equal(ai.calls.length, 1);
  assert.equal(done.status, "ok");
  const apply = log.find(l => l.fn === "visibility_plan_apply");
  assert.ok(apply, "apply was called");
  assert.equal(apply!.args.p_run, "r1");
  assert.equal(typeof apply!.args.p_lease, "string");
  assert.equal((apply!.args.p_output as { rows: unknown[] }).rows.length, 6);
  assert.equal(log.find(l => l.fn === "visibility_plan_claim")!.args.p_engagement, "86500000-0000-4000-8000-000000000100");
  assert.ok(!log.some(l => l.fn === "visibility_plan_fail"));

  const log2: string[] = [];
  const db2 = { rpc: async (fn: string) => { log2.push(fn); return { data: fn === "visibility_plan_claim" ? (log2.filter(f => f === fn).length === 1 ? claim : { status: "idle" }) : { status: "ok", gave_up: false }, error: null }; } } as unknown as SupabaseClient;
  const failing = { model: () => "x", complete: async () => { throw new Error("unavailable"); } };
  const again = await runPlan(db2, failing, "86500000-0000-4000-8000-000000000100", aiConfig({}));
  assert.ok(log2.includes("visibility_plan_fail"));
  assert.ok(!log2.includes("visibility_plan_apply"));
  assert.notEqual(again.status, "ready");
  assert.ok(planTimeoutMs(aiConfig({})) >= 60000 && planTimeoutMs(aiConfig({})) <= 280000);
  assert.ok(planBudgetMs(aiConfig({})) >= 70000 && planBudgetMs(aiConfig({})) <= 290000);
});

// ---------- The facilitator's page: what the policy decides ----------
const rs = (o: Partial<PlanRowState>): PlanRowState => ({ id: "x", position: 1, stage: "board", who: "The elders", when_text: "", when_date: null, by_whom: "", what_they_hear: "", risk: "", origin: "ai", touched: false, reviewed: null, sources: [], needs_source: false, ...o } as PlanRowState);

test("Outward order and rank: the six stages in order, anything else after", () => {
  assert.deepEqual(stageOrder.map(stageRank), [1, 2, 3, 4, 5, 6]);
  assert.equal(stageRank("other"), 7);
  assert.ok(inOutwardOrder([rs({ stage: "lead_pastor" }), rs({ stage: "board" }), rs({ stage: "board" }), rs({ stage: "congregation" })]));
  assert.ok(!inOutwardOrder([rs({ stage: "staff" }), rs({ stage: "board" })]));
  assert.ok(inOutwardOrder([]));
});

test("A when is shown as its words and its date together, and a date after the public date is flagged", () => {
  assert.equal(whenText({ when_text: "The week before", when_date: "2027-01-24" }), "The week before, Jan 24, 2027");
  assert.equal(whenText({ when_text: "", when_date: "2027-01-24" }), "Jan 24, 2027");
  assert.equal(whenText({ when_text: "After the elders", when_date: null }), "After the elders");
  assert.equal(whenText({ when_text: " ", when_date: null }), "");
  assert.ok(afterPublic("2027-02-01", "2027-01-31"));
  assert.ok(!afterPublic("2027-01-31", "2027-01-31"));
  assert.ok(!afterPublic("2027-02-01", null));
  assert.ok(!afterPublic(null, "2027-01-31"));
});

test("Rows left to review counts the ones not yet reviewed, and plurals read plainly", () => {
  assert.equal(rowsLeft([rs({ reviewed: { at: "2027-01-01T00:00:00Z", by: null } }), rs({}), rs({})]), 2);
  assert.equal(rowsLeft([]), 0);
  assert.equal(plural(1, "row"), "1 row");
  assert.equal(plural(3, "row"), "3 rows");
});

test("Cells from the page are cleaned and checked before they are sent: a who is needed on a new row, a stage must be real, a date must be a date", () => {
  assert.deepEqual(cellsOf({ who: " The elders " }, true), { who: "The elders" });
  assert.ok("error" in (cellsOf({ stage: "board" }, true) as object));
  assert.ok("error" in (cellsOf({ who: "" }, false) as object));
  assert.ok("error" in (cellsOf({ stage: "elders" }, false) as object));
  assert.ok("error" in (cellsOf({ when_date: "next week" }, false) as object));
  assert.deepEqual(cellsOf({ colour: "red" }, false), {}, "a cell the plan does not have is left out here and refused by the database");
  assert.deepEqual(cellsOf({ when_date: null }, false), { when_date: null });
  assert.deepEqual(cellsOf({ when_date: "2027-01-03", when_text: "After the elders" }, false), { when_date: "2027-01-03", when_text: "After the elders" });
  const rid = "86500000-0000-4000-8000-000000000009";
  assert.deepEqual(planBody({ action: "move", row: rid, direction: "up" }), { action: "move", row: rid, direction: "up" });
  assert.equal(planBody({ action: "move", row: rid, direction: "sideways" }), null);
  assert.equal(planBody({ action: "move", row: "r1", direction: "up" }), null, "a row id is a uuid");
  assert.equal(planBody({ action: "nope" }), null);
  assert.equal(planBody(null), null);
  assert.deepEqual(planBody({ action: "draft", id: rid, confirm: true }), { action: "draft", id: rid, confirm: true });
  assert.deepEqual(planBody({ action: "draft", id: rid }), { action: "draft", id: rid, confirm: false });
  assert.deepEqual(planBody({ action: "set", moment: " Vision Sunday ", date: "" }), { action: "set", moment: "Vision Sunday", date: null });
  assert.ok("error" in (planBody({ action: "set", moment: "  " }) as object));
  assert.ok("error" in (planBody({ action: "set", moment: "Vision Sunday", date: "soon" }) as object));
  assert.equal(planBody({ action: "edit", row: rid, cells: {} }), null, "an edit with no cell is nothing");
  assert.deepEqual(planBody({ action: "add", cells: { who: "The volunteers" } }), { action: "add", cells: { who: "The volunteers", stage: "other" } });
  assert.deepEqual(planBody({ action: "unreview", row: rid }), { action: "unreview", row: rid });
});

test("The page's words for each answer use no dash and no CORE status, and the status names are the ones the brief gives", () => {
  for (const s of ["denied", "closed", "ai_off", "ai_unavailable", "busy", "confirm", "not_found", "unchanged", "duplicate", "unsourced", "invalid_request", "anything else"]) {
    const m = planMessage(s);
    assert.ok(m.length > 10 && m.length < 140, s);
    assert.ok(!/[–—]/.test(m), s);
    assert.ok(!/\bCORE\b/.test(m), s);
  }
  assert.equal(statusNames.needs_attention, "Needs attention");
  assert.equal(statusNames.drafting, "Drafting");
  assert.equal(statusNames.thin, "Nothing said about it");
  for (const n of Object.values(statusNames)) assert.ok(!/[–—]/.test(n) && !/\bCORE\b/.test(n));
  for (const n of Object.values(stageNames)) assert.ok(!/[–—]/.test(n));
});

test("The drafting indicator is shown while the round runs, slow after 45 seconds, a retry after one failure, a failure after two and AI off when it is off", () => {
  const ok = (round: object | null, extra: object = {}) => ({ status: "ok", ai: true, closed: false, plan: { status: "drafting" }, round, rows: [], ...extra }) as never;
  const now = Date.now(), at = (ms: number) => new Date(now - ms).toISOString();
  assert.deepEqual(roundView(ok(null, { plan: { status: "drafted" } }), now), { kind: "none" });
  assert.deepEqual(roundView(ok({ status: "drafting", requested_at: at(5000), attempts: 0 }), now), { kind: "working", slow: false });
  assert.deepEqual(roundView(ok({ status: "drafting", requested_at: at(60000), attempts: 0 }), now), { kind: "working", slow: true });
  assert.deepEqual(roundView(ok({ status: "pending", requested_at: at(5000), attempts: 1, error: "timeout" }), now), { kind: "retry" });
  assert.deepEqual(roundView(ok({ status: "failed", requested_at: at(5000), attempts: 2, error: "x" }, { plan: { status: "needs_attention", error: "AI could not draft the plan" } }), now), { kind: "failed" });
  assert.deepEqual(roundView(ok(null, { ai: false, plan: { status: "empty" } }), now), { kind: "off" });
});

test("A plan that changed after the report's section was built is a sign-off blocker with its own words", () => {
  const state = { status: "ok", lead: true, draft: true, plan_stale: true, sections: Array.from({ length: 14 }, (_, i) => ({ key: i === 12 ? "visibility" : `s${i}`, status: "reviewed", sentences: [] })) } as unknown as Extract<ReportState, { status: "ok" }>;
  const blockers = signOffBlockers(state);
  assert.deepEqual(blockers.map(b => b.kind), ["plan_changed"]);
  assert.equal(blockerText(blockers[0]), "The visibility plan changed since Make the Vision Visible was built. Refresh it from the records.");
  assert.deepEqual(signOffBlockers({ ...state, plan_stale: false } as never), []);
});

test("The page names a stage with no row and says how many whens were left blank, in plain words", () => {
  assert.deepEqual(missingStages([]), [...stageOrder]);
  assert.deepEqual(missingStages([{ stage: "lead_pastor" }, { stage: "board" }, { stage: "congregation" }, { stage: "other" }]), ["participants", "staff", "key_leaders"]);
  assert.deepEqual(missingStages(stageOrder.map(stage => ({ stage }))), []);
  assert.equal(blankedText(1), "1 row’s when was left blank");
  assert.equal(blankedText(3), "3 rows’ whens were left blank");
  assert.ok(!/[–—]/.test(blankedText(1) + blankedText(2)), "no dashes");
});
