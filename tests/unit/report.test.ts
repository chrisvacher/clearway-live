import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfig } from "../../lib/ai/config";
import { fakeClient, isHeard, isReport, recordedClient, reportSection } from "../../lib/ai/fake";
import { heardPrompt, prompts, replyJson, reportHeadings, reportKeys, reportPromptList, reportPrompts, reportRecordKeys, reportVersion, themesPrompt, type ReportInputs, type ReportKey } from "../../lib/ai/prompts";
import { reportBudgetMs, reportTimeoutMs, runReport } from "../../lib/ai/report";
import { blockerText, litPart, markOf, reportBody, reportMessage, roundView, signOffBlockers, type ReportSection, type ReportSentence, type ReportState } from "../../lib/report/policy";

type Case = { name: string; inputs: ReportInputs; reply: string };
const fixtures = JSON.parse(readFileSync(new URL("../fixtures/ai/report.json", import.meta.url), "utf8")) as { names: string[]; cases: Case[] };
const byName = (n: string) => fixtures.cases.find(c => c.name === n)!;
const named = (text: string) => fixtures.names.filter(n => new RegExp(`\\b${n}\\b`, "i").test(text));
const id = (n: number) => `86500000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// The same rules the database applies to every sentence (report_check), so a recorded reply can be checked without a database.
const words = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const digits = (t: string) => [...new Set(t.match(/[0-9]+/g) ?? [])];
// A quotation is compared letter for letter once the marks are one kind and the spaces collapse (the database's rp_qnorm).
const qnorm = (t: string) => t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim();
// Where the database reads source flags, this reads the ref's group: a quote, a Four Helpful Lists card, a scribe card or a signed off lens line is the room's own words.
const roomRef = (r: ReportInputs["refs"][number]) => /^(Quote|Four Helpful Lists card|Scribe|Signed off lens)/.test(r.group);
const quoted = (t: string): string[] => {
  const n = qnorm(t), doubles = [...n.matchAll(/"([^"]+)"/g)].map(m => m[1]), rest = n.replace(/"[^"]*"/g, " ");
  return [...doubles, ...[...rest.matchAll(/(^|[\s(])'(.+?)'(?=[\s.,;:!?)]|$)/g)].map(m => m[2])];
};
function refuses(text: string, cited: ReportInputs["refs"], names: string[]): string | null {
  if (!text || text.length > 600) return "text";
  if (!cited.length) return "unsourced";
  if (named(text).length && names.length) return "name";
  const have = cited.map(r => r.text).join("\n");
  // The three horizon terms and "1-year goals" are exact wording, not numbers: they come out before the numbers are read.
  const stripped = text.replace(/10-year Future|3-year Vision|1-year Outlook|1-year goals?/g, "");
  const ok = digits(stripped).every(d => digits(have).includes(d));
  const spelled = (stripped.toLowerCase().match(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g) ?? [])
    .every(w => new RegExp(`\\b${w}\\b`, "i").test(have) || digits(have).includes(String(words.indexOf(w) + 1)));
  if (!ok || !spelled) return "number";
  if (/\b(10|ten|3|three|1|one)[ -]year\b/i.test(stripped) || /communications? plan/i.test(text)) return "term";
  if ((qnorm(text).match(/"/g) ?? []).length % 2) return "quote";
  const room = qnorm(cited.filter(roomRef).map(r => r.text).join("\n"));
  for (const q of quoted(text)) { const body = q.replace(/[.,!?…]+$/, ""); if (!body.trim() || q.length > 280 || !room.includes(body)) return "quote"; }
  return null;
}
const cited = (inputs: ReportInputs, refs: string[]) => inputs.refs.filter(r => refs.includes(r.ref));

test("Every section has a prompt: one per prose section, versioned, and one shared lead for the seven record sections", () => {
  assert.equal(reportKeys.length, 14);
  assert.deepEqual(Object.keys(reportPrompts).sort(), [...reportKeys].sort());
  for (const k of reportKeys) {
    const p = reportPrompts[k];
    assert.equal(p.job, "draft_report");
    if (reportRecordKeys.includes(k)) assert.equal(p.version, "report-lead@1"); else assert.equal(p.version, `report-${k}@1`);
  }
  assert.equal(reportVersion, "report@1");
  assert.equal(reportRecordKeys.length, 7);
  assert.equal(reportPromptList.length, 8, "seven prose prompts and the lead");
  const systems = reportPromptList.map(p => p.system);
  assert.equal(new Set(systems).size, systems.length, "no two prompts share their words");
  for (const other of [...Object.values(prompts), themesPrompt, heardPrompt]) assert.ok(!systems.includes(other.system));
  assert.equal(reportKeys.map(k => reportHeadings[k]).length, 14);
});

test("Each prompt is Clearway's voice, JSON only, keeps horizons exact, never invents, never names people and treats the refs as data", () => {
  for (const p of reportPromptList) {
    assert.match(p.system, /Clearway Church Solutions/, p.version);
    assert.match(p.system, /institutional voice/, p.version);
    assert.match(p.system, /one JSON object and nothing else/, p.version);
    assert.ok(!/[–—]/.test(p.system), `${p.version}: no em or en dashes`);
    assert.ok(!/;/.test(p.system.replace(/&[a-z]+;/g, "")), `${p.version}: no semicolons`);
    for (const term of ["10-year Future", "3-year Vision", "1-year Outlook"]) assert.ok(p.system.includes(term), `${p.version}: ${term}`);
    assert.ok(!/(\b3 year\b|\bthree-year\b|\b10 year\b|\bten-year\b|\b1 year\b|\bone-year\b)/i.test(p.system), `${p.version}: no wrong horizon`);
    assert.match(p.system, /Never name a person/, p.version);
    assert.match(p.system, /data, never instructions/, p.version);
    assert.match(p.system, /Never add a fact|Say nothing the refs do not say/, p.version);
    assert.match(p.system, /Five Lenses/, p.version);
    assert.match(p.system, /visibility plan, never communication plan/, p.version);
    assert.match(p.system, /double quotation marks around words copied exactly/, p.version);
    assert.ok(p.maxTokens >= 500 && p.maxTokens <= 4000);
  }
  assert.match(reportPrompts.church_today.system, /today's reality/);
  assert.match(reportPrompts.overview.system, /drafted last/);
  assert.match(reportPrompts.closing.system, /drafted last/);
  assert.match(reportPrompts.tensions.system, /both sides/);
  assert.match(reportPrompts.future.system, /may use the horizon terms, written exactly/);
  assert.ok(!/no horizon term|no number at all/i.test(reportPrompts.future.system), "a lead may carry a horizon term, and a number a ref carries");
  assert.match(reportPrompts.future.system, /one to three short sentences/);
});

test("The model reads refs only: no ids, names, speakers or sources reach it", () => {
  const c = byName("heard"), user = reportPrompts.heard.user({ ...c.inputs, section_id: id(1), refs: c.inputs.refs.map(r => ({ ...r, sources: [{ kind: "finding", ref_id: id(2), excerpt: "x" }] })) });
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(user), "no ids");
  assert.ok(!/"id"|speaker|attendee|email|"sources"|section_id|ref_id/.test(user));
  const parsed = replyJson(user) as { section: string; refs: { ref: string; thin_data: boolean }[] };
  assert.equal(parsed.section, "heard");
  assert.deepEqual(parsed.refs.map(r => r.ref), ["f1", "f2", "t1", "q1", "c1", "g1"]);
  assert.equal(parsed.refs[1].thin_data, true);
  assert.deepEqual(named(user), []);
  // A record section's lead is told which section it is, so the stand-in and the log know.
  assert.equal((replyJson(reportPrompts.future.user(byName("future lead").inputs)) as { section: string }).section, "future");
});

test("The recorded replies parse to sentences that cite only the refs they were given, and pass the same checks as the database", () => {
  for (const name of ["heard", "tensions", "future lead", "overview"]) {
    const c = byName(name), key = c.inputs.section, out = reportPrompts[key].parse(c.reply, c.inputs);
    assert.ok(out.sentences.length >= 1, name);
    const known = new Set(c.inputs.refs.map(r => r.ref));
    for (const s of out.sentences) {
      assert.ok(s.refs.length > 0 && s.refs.every(r => known.has(r)), `${name}: refs known`);
      assert.equal(refuses(s.text, cited(c.inputs, s.refs), fixtures.names), null, `${name}: "${s.text}"`);
      assert.ok(!/[–—;]/.test(s.text), "no dashes or semicolons");
    }
  }
  const heard = reportPrompts.heard.parse(byName("heard").reply, byName("heard").inputs);
  assert.equal(heard.sentences.length, 4);
  assert.deepEqual(heard.sentences[2].refs, ["q1", "t1"]);
  assert.match(heard.sentences[2].text, /"Volunteers are stretched thin, the same few people every week\."/);
});

test("The checks refuse what the database refuses: a number no ref carries, a quote not in a ref, a name, a wrong horizon, and no ref at all", () => {
  const c = byName("heard"), f1 = cited(c.inputs, ["f1"]);
  assert.equal(refuses("42% named a way into groups.", f1, fixtures.names), "number");
  assert.equal(refuses("31% named a way into groups.", f1, fixtures.names), null);
  assert.equal(refuses("Seven respondents named it.", f1, fixtures.names), "number");
  assert.equal(refuses("They said \"we are lost\".", f1, fixtures.names), "quote");
  assert.equal(refuses("Sarah named a way into groups.", f1, fixtures.names), "name");
  const ten = [{ ref: "z1", group: "g", text: "We have ten leaders.", thin: false }];
  assert.equal(refuses("The ten-year view starts with ten leaders.", ten, fixtures.names), "term");
  assert.equal(refuses("The 10-year Future starts with ten leaders.", ten, fixtures.names), null, "the term is wording, not a number");
  assert.equal(refuses("The 3-year Vision and the 1-year Outlook follow.", ten, fixtures.names), null);
  assert.equal(refuses("Each 1-year goal has an owner, and the 1-year goals have an end date.", ten, fixtures.names), null, "the PRD's own words");
  assert.equal(refuses("The 3-year goals are clear.", [{ ref: "z1", group: "g", text: "We have 3 groups.", thin: false }], fixtures.names), "term", "a horizon not written as a term");
  assert.equal(refuses("The 2-year Vision starts with ten leaders.", ten, fixtures.names), "number", "a digit that is not a term is still a number");
  assert.equal(refuses("A communication plan is needed.", f1, fixtures.names), "term");
  assert.equal(refuses("A clear way in.", [], fixtures.names), "unsourced");
});

test("The parser drops what cannot stand: unknown refs, no refs, empty text, and caps the count", () => {
  const c = byName("messy reply"), out = reportPrompts.heard.parse(c.reply, c.inputs);
  assert.equal(out.sentences.length, 2);
  assert.deepEqual(out.sentences[0].refs, ["f1"], "a ref in capitals is read back");
  assert.deepEqual(out.sentences[1].refs, ["t1"], "a number that is not a ref is dropped, the real ref stays");
  const many = JSON.stringify({ sentences: Array.from({ length: 30 }, (_, i) => ({ text: `Line ${i}.`, refs: ["f1"] })) });
  assert.equal(reportPrompts.heard.parse(many, c.inputs).sentences.length, 6);
  assert.equal(reportPrompts.future.parse(many, byName("future lead").inputs).sentences.length, 0, "refs not given are dropped");
  assert.deepEqual(reportPrompts.heard.parse("not json at all", c.inputs).sentences, []);
});

test("The scripted stand-in writes sentences from the refs it was given, citing them, with no number of its own, for every section", async () => {
  const ai = fakeClient("script");
  for (const key of reportKeys) {
    const inputs: ReportInputs = { section: key, heading: reportHeadings[key], refs: [
      { ref: "f1", group: "Survey finding", text: "A clear way into groups: 31%", thin: false },
      { ref: "q1", group: "Quote from a leadership interview", text: "Newcomers cannot find a small group to join.", thin: false },
      { ref: "t1", group: "Accepted theme", text: "Volunteers are stretched thin.", thin: true }] };
    const call = { system: reportPrompts[key].system, user: reportPrompts[key].user(inputs), maxTokens: 500, timeoutMs: 5000 };
    assert.equal(isReport(call), true);
    assert.equal(reportSection(call), key);
    const out = reportPrompts[key].parse((await ai.complete(call, aiConfig({}))).text, inputs);
    assert.ok(out.sentences.length >= 1, key);
    for (const s of out.sentences) {
      assert.equal(refuses(s.text, cited(inputs, s.refs), fixtures.names), null, `${key}: "${s.text}"`);
      assert.ok(s.refs.every(r => ["f1", "q1", "t1"].includes(r)));
    }
    if (reportRecordKeys.includes(key)) assert.ok(out.sentences.length >= 1 && out.sentences.length <= 3 && !/\d/.test(out.sentences[0].text), "a lead writes one to three lines, and the stand-in no number");
  }
  assert.equal(isHeard({ system: reportPrompts.heard.system }), false);
});

test("The stand-in quotes a quote ref in the room's own words and reads across the groups first", async () => {
  const inputs: ReportInputs = { section: "interviews", heading: "Leadership Interviews", refs: [
    { ref: "t1", group: "Theme", text: "Newcomers cannot find a group.", thin: false }, { ref: "t2", group: "Theme", text: "Staff are stretched.", thin: false },
    { ref: "q1", group: "Quote from a leadership interview", text: "Newcomers cannot find a small group to join.", thin: false }] };
  const text = (await fakeClient("script").complete({ system: reportPrompts.interviews.system, user: reportPrompts.interviews.user(inputs), maxTokens: 400, timeoutMs: 1000 }, aiConfig({}))).text;
  const out = reportPrompts.interviews.parse(text, inputs);
  assert.deepEqual(out.sentences.map(s => s.refs[0]), ["t1", "q1", "t2"]);
  assert.equal(out.sentences[1].text, "\"Newcomers cannot find a small group to join.\"");
});

test("The control file can fail one section and leave the rest, and can fail them all", async () => {
  const dir = mkdtempSync(join(tmpdir(), "report-")), path = join(dir, "control.json");
  const c = byName("heard"), call = (key: ReportKey) => ({ system: reportPrompts[key].system, user: reportPrompts[key].user({ ...c.inputs, section: key }), maxTokens: 400, timeoutMs: 1000 });
  writeFileSync(path, JSON.stringify({ failSection: "heard" }));
  const ai = fakeClient("script", path);
  await assert.rejects(ai.complete(call("heard"), aiConfig({})), /unavailable/);
  assert.ok((await ai.complete(call("tensions"), aiConfig({}))).text.includes("sentences"));
  writeFileSync(path, JSON.stringify({}));
  assert.ok((await ai.complete(call("heard"), aiConfig({}))).text.includes("sentences"));
  writeFileSync(path, JSON.stringify({ fail: true }));
  await assert.rejects(ai.complete(call("tensions"), aiConfig({})), /unavailable/);
});

// ---------- The worker ----------
type Call = { name: string; args: Record<string, unknown> };
function mockDb(claims: unknown[], calls: Call[], failApply = false) {
  const queue = [...claims];
  return { rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === "report_claim") return { data: queue.shift() ?? { status: "idle" }, error: null };
    if (name === "report_apply") return failApply ? { data: null, error: { message: "boom" } } : { data: { status: "ok", kept: 1, dropped: 0 }, error: null };
    return { data: { status: "ok" }, error: null };
  } } as unknown as SupabaseClient;
}
const claim = (key: ReportKey, n: number) => ({ status: "claimed", run: id(n), job: "draft_report", prompt_version: reportVersion, section: key, inputs: { ...byName(key === "future" ? "future lead" : key).inputs, section: key } });
const recorded = (...keys: string[]) => recordedClient(keys.map(k => { const c = byName(k); return { job: "draft_report" as const, user: reportPrompts[c.inputs.section].user(c.inputs), reply: c.reply }; }));

test("The worker claims a section at a time, asks the deeper model with that section's own prompt, and hands the parsed reply and its prompt to apply", async () => {
  const calls: Call[] = [], ai = recorded("heard", "tensions");
  const report = await runReport(mockDb([claim("heard", 1), claim("tensions", 2)], calls), ai, id(5), aiConfig({}));
  assert.equal(report.status, "idle");
  assert.equal(report.sections, 2);
  assert.equal(ai.calls.length, 2);
  assert.equal(ai.calls[0].system, reportPrompts.heard.system);
  assert.equal(ai.calls[1].system, reportPrompts.tensions.system);
  const applies = calls.filter(c => c.name === "report_apply");
  assert.equal(applies.length, 2);
  assert.equal((applies[0].args.p_output as { prompt: string }).prompt, "report-heard@1");
  assert.equal((applies[0].args.p_output as { sentences: unknown[] }).sentences.length, 4);
  assert.ok(String((applies[0].args.p_output as { raw: string }).raw).length > 0);
  assert.ok(!calls.some(c => c.name === "report_fail"));
  assert.deepEqual(calls[0].args.p_versions, { draft_report: reportVersion });
  assert.equal(calls.filter(c => c.name === "report_claim").length, 3, "the last claim finds nothing left");
});

test("A section that fails is recorded and the worker stops for the pause the database asks for; apply failing is recorded too", async () => {
  const broken = { model: () => "m", complete: async () => { throw new Error("request timed out"); } };
  const calls: Call[] = [];
  const r = await runReport(mockDb([claim("heard", 1), { status: "cooling", ms: 9000 }], calls), broken, id(5), aiConfig({}));
  assert.equal(r.status, "cooling");
  assert.equal(calls.find(c => c.name === "report_fail")?.args.p_error, "timeout");
  const calls2: Call[] = [];
  assert.equal((await runReport(mockDb([claim("heard", 1)], calls2, true), recorded("heard"), id(5), aiConfig({}))).status, "unavailable");
  assert.ok(calls2.some(c => c.name === "report_fail"));
  const calls3: Call[] = [];
  assert.equal((await runReport(mockDb([{ status: "idle" }], calls3), recorded("heard"), id(5), aiConfig({}))).status, "idle");
  assert.equal(calls3.length, 1);
  const calls4: Call[] = [];
  assert.equal((await runReport(mockDb([{ ...claim("heard", 1), prompt_version: "report@0" }, { status: "idle" }], calls4), recorded("heard"), id(5), aiConfig({}))).sections, 0);
  assert.ok(calls4.some(c => c.name === "report_fail"));
  const calls5: Call[] = [];
  assert.equal((await runReport(mockDb([{ ...claim("heard", 1), section: "nope" }, { status: "idle" }], calls5), recorded("heard"), id(5), aiConfig({}))).sections, 0);
});

test("The report job allows a call of at least a minute, never past the function limit", () => {
  const c = aiConfig({});
  assert.ok(reportTimeoutMs(c) >= 60000 && reportTimeoutMs(c) <= 280000);
  assert.ok(reportBudgetMs(c) >= 70000 && reportBudgetMs(c) <= 290000);
});

// ---------- The page's rules ----------
const sentence = (o: Partial<ReportSentence> = {}): ReportSentence => ({ id: id(100), position: 1, text: "A sentence.", origin: "ai", quote: false, thin_label: null, touched: false, can_undo: false, needs_source: false,
  sources: [{ id: id(101), kind: "finding", ref_id: id(102), excerpt: "31%", room: false, info: null }], ...o });
const section = (key: ReportSection["key"], status: ReportSection["status"], sentences: ReportSentence[] = [sentence()]): ReportSection => ({ id: id(200), key, position: reportKeys.indexOf(key) + 1, heading: reportHeadings[key], kind: reportRecordKeys.includes(key) ? "record" : "prose", status, error: null, dropped: 0, reviewed: null, blocks: null, sentences });
const state = (o: Partial<Extract<ReportState, { status: "ok" }>> = {}, status: ReportSection["status"] = "reviewed"): Extract<ReportState, { status: "ok" }> =>
  ({ status: "ok", server_time: "2026-11-05T12:00:00Z", ai: true, lead: true, draft: true, round: null, signed: null, sections: reportKeys.map(k => section(k, status)), ...o });

test("Sign-off waits for a lead, a draft, every section reviewed and a source for every sentence that is not the facilitator's own", () => {
  assert.deepEqual(signOffBlockers(state()), []);
  assert.deepEqual(signOffBlockers(state({ lead: false })).map(b => b.kind), ["lead_only"]);
  assert.deepEqual(signOffBlockers(state({ draft: false, sections: [] })).map(b => b.kind), ["no_draft"]);
  const mixed = state({ sections: reportKeys.map((k, i) => section(k, i === 0 ? "drafted" : i === 1 ? "drafting" : i === 2 ? "needs_attention" : "reviewed")) });
  const kinds = signOffBlockers(mixed);
  assert.deepEqual(kinds.map(b => b.kind), ["drafting", "not_reviewed"]);
  assert.equal(kinds[1].count, 2);
  const unsourced = state({ sections: reportKeys.map((k, i) => section(k, "reviewed", i === 4 ? [sentence({ needs_source: true, sources: [] })] : [sentence()])) });
  assert.deepEqual(signOffBlockers(unsourced).map(b => [b.kind, b.count, b.sections[0]]), [["needs_source", 1, "interviews"]]);
  for (const b of [...kinds, ...signOffBlockers(unsourced)]) assert.ok(blockerText(b).length > 10 && !/[–—;]/.test(blockerText(b)));
});

test("A sentence's mark says how many sources it rests on, whether the words are the room's, and when it has none", () => {
  assert.deepEqual(markOf(sentence()), { kind: "sources", n: 1 });
  assert.deepEqual(markOf(sentence({ needs_source: true, sources: [] })), { kind: "none", n: 0 });
  assert.deepEqual(markOf(sentence({ origin: "facilitator", sources: [] })), { kind: "yours", n: 0 });
  assert.equal(markOf(sentence({ origin: "room" })).kind, "room");
  assert.equal(markOf(sentence({ origin: "record" })).kind, "record");
});

test("The source panel lights the words the sentence used and leaves the rest as it is", () => {
  assert.deepEqual(litPart("Volunteers are stretched thin, the same few people every week.", "the same few people"), { before: "Volunteers are stretched thin, ", lit: "the same few people", after: " every week." });
  assert.deepEqual(litPart("Newcomers", "THE ROOM"), { before: "Newcomers", lit: "", after: "" });
  assert.deepEqual(litPart("Same words", "same words").lit, "Same words");
  assert.equal(litPart("x", null).lit, "");
});

test("The page shows the drafting round: working with how far it has got, slow after a while, and nothing when it is idle", () => {
  const working = state({ round: { status: "drafting", requested_at: "2026-11-05T12:00:00Z", queue: [], current: "heard", attempts: 0, error: null, ok_at: null, kept: 0, dropped: 0 } }, "drafted");
  assert.equal(roundView(working, Date.parse("2026-11-05T12:00:10Z"))?.kind, "working");
  assert.equal((roundView(working, Date.parse("2026-11-05T12:00:10Z")) as { slow: boolean }).slow, false);
  assert.equal((roundView(working, Date.parse("2026-11-05T12:02:00Z")) as { slow: boolean }).slow, true);
  assert.equal(roundView(state({ round: { ...working.round!, status: "ready", kept: 20, dropped: 1 } }), 0).kind, "ready");
  assert.equal(roundView(state({ round: null, ai: false, sections: [] }), 0).kind, "off");
});

test("The page's calls are checked before they are sent: a draft, a section, an edit, a source, a review and a sign-off", () => {
  assert.deepEqual(reportBody({ action: "draft", id: id(1), scope: "all" }), { action: "draft", id: id(1), scope: "all", confirm: false });
  assert.deepEqual(reportBody({ action: "draft", id: id(1), scope: "section", section: "heard", confirm: true }), { action: "draft", id: id(1), scope: "section", section: "heard", confirm: true });
  assert.equal(reportBody({ action: "draft", id: id(1), scope: "section" }), null);
  assert.equal(reportBody({ action: "draft", id: "nope", scope: "all" }), null);
  assert.equal(reportBody({ action: "refresh", section: "heard" }), null, "a prose section is redrafted, not refreshed");
  assert.deepEqual(reportBody({ action: "refresh", section: "future" }), { action: "refresh", section: "future", confirm: false });
  assert.deepEqual(reportBody({ action: "edit", sentence: id(2), text: "  A  clean   line. " }), { action: "edit", sentence: id(2), text: "A clean line." });
  assert.deepEqual(reportBody({ action: "edit", sentence: id(2), text: "   " }), { error: "Write the sentence first." });
  assert.ok("error" in (reportBody({ action: "add", section: id(3), text: "x".repeat(1201) }) as object));
  assert.deepEqual(reportBody({ action: "source", sentence: id(2), kind: "theme", ref: id(4), excerpt: "x", add: true }), { action: "source", sentence: id(2), kind: "theme", ref: id(4), excerpt: "x", add: true });
  assert.equal(reportBody({ action: "source", sentence: id(2), kind: "theme", ref: null, excerpt: "x", add: true }), null, "only a record source has no id");
  assert.deepEqual(reportBody({ action: "source", sentence: id(2), kind: "record", ref: null, excerpt: "Visibility plan row", add: false }), { action: "source", sentence: id(2), kind: "record", ref: null, excerpt: "Visibility plan row", add: false });
  assert.equal(reportBody({ action: "reviewed", section: id(3), reviewed: "yes" }), null);
  assert.deepEqual(reportBody({ action: "reviewed", section: id(3), reviewed: true }), { action: "reviewed", section: id(3), reviewed: true });
  assert.deepEqual(reportBody({ action: "sign_off", id: id(9) }), { action: "sign_off", id: id(9) });
  assert.equal(reportBody({ action: "unknown" }), null);
  assert.equal(reportBody(null), null);
});

test("Every status the database can answer has a plain sentence, with no dashes", () => {
  for (const s of ["denied", "closed", "ai_off", "ai_unavailable", "busy", "nothing", "confirm", "not_found", "unchanged", "duplicate", "no_room_words", "not_a_source", "too_many", "not_ready", "lead_only", "no_draft", "not_reviewed", "unsourced", "invalid_request", "whatever"]) {
    const m = reportMessage(s);
    assert.ok(m.length > 8 && !/[–—]/.test(m), s);
  }
  assert.notEqual(reportMessage("denied"), reportMessage("whatever"));
});

test("The headings are the brief's fourteen, the same in the prompts, the policy and the database", () => {
  const brief = ["Overview", "The Church Today", "The Process", "What We Heard", "Leadership Interviews", "Strategic Tensions", "The 10-year Future", "The 3-year Vision", "Risks and Roadblocks", "The 1-year Outlook", "Commander's Intent", "Decisions", "Make the Vision Visible", "Closing"];
  assert.deepEqual(reportKeys.map(k => reportHeadings[k]), brief);
  const sql = readFileSync(new URL("../../supabase/migrations/20261108010000_report.sql", import.meta.url), "utf8");
  const defs = [...sql.slice(sql.indexOf("create function private.report_defs()")).split("$$")[1].matchAll(/\('([a-z_]+)',(\d+),'((?:[^']|'')+)','(prose|record)'\)/g)];
  assert.deepEqual(defs.map(m => m[3].replace(/''/g, "'")), brief, "the database's names are the same");
  assert.deepEqual(defs.map(m => m[1]), [...reportKeys]);
  for (const key of ["church_today", "process", "interviews", "tensions"] as const) assert.ok(reportPrompts[key].system.includes(`This is ${reportHeadings[key]}.`), `${key}'s guide names its heading`);
  for (const wrong of ["The church today", "The Wayfinding process", "Leadership interviews", "Tensions we worked through", "Risks and how we answer them", "Decisions made", "The visibility plan"]) {
    for (const p of reportPromptList) assert.ok(!p.system.includes(wrong), `${p.version} does not say "${wrong}"`);
  }
});

test("A table cell is a plain value or the live sentences it points at, and a blocker says when the Future has moved", () => {
  const state = (future_ok: boolean | null): Extract<ReportState, { status: "ok" }> => ({ status: "ok", server_time: "2026-11-08T00:00:00Z", future_ok, ai: true, lead: true, draft: true, round: null, signed: null,
    sections: Array.from({ length: 14 }, (_, i) => ({ id: `s${i}`, key: "overview", position: i + 1, heading: "x", kind: "prose", status: "reviewed", error: null, dropped: 0, reviewed: { at: "2026-11-08T00:00:00Z", by: null }, blocks: null, sentences: [] })) as ReportSection[] });
  assert.deepEqual(signOffBlockers(state(true)), []);
  assert.deepEqual(signOffBlockers(state(false)).map(b => b.kind), ["future_changed"]);
  assert.match(blockerText({ kind: "future_changed", count: 1, sections: ["future"] }), /Refresh it from the records/);
  assert.match(reportMessage("locked"), /word for word/);
  assert.match(reportMessage("unsourced", { count: 2, sections: ["What We Heard", "Decisions"] }), /2 sentences in What We Heard, Decisions have no source, or rest on a record that is gone/);
  assert.match(reportMessage("unsourced", { count: 1, sections: ["Closing"] }), /1 sentence in Closing has no source/);
});
