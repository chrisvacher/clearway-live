import assert from "node:assert/strict";
import { test } from "node:test";
import { aiConfig } from "../../lib/ai/config";
import type { AiClient } from "../../lib/ai/client";
import { prompts, promptVersions, type LensDraftInputs, type LensFoldInputs } from "../../lib/ai/prompts";
import { runSession } from "../../lib/ai/worker";
import { settledReason } from "../../lib/phone/policy";
import { interactionKinds, isReservedKind, screenIds } from "../../lib/interactions/kinds";
import { checkSuggestion, facilitatorState, moreOnPhones, ownReply, reconcile, shownLines, sourcesOf, summaryOf, summaryPress, type Change, type Row } from "../../lib/interactions/lens-summary";

const uid = (n: number) => `77000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const reply = (v: unknown) => JSON.stringify(v);

// ---------- The kind ----------
test("INT-18 is a library kind with its screen id, out of the reserved names", () => {
  assert.ok((interactionKinds as readonly string[]).includes("lens_summary"));
  assert.equal(screenIds.lens_summary, "INT-18");
  assert.equal(isReservedKind("lens_summary"), false);
});

// ---------- What the room's results carry ----------
const line = (n: number, text: string) => ({ id: uid(n), pos: n, text });
const results = (extra: Record<string, unknown> = {}) => ({ total: 7, people: 6, words: [], lens: 1, lens_name: "Our people", lens_names: ["Our people", "B", "C", "D", "E"],
  lenses: [{ lens: 1, name: "Our people", state: "now" }, { lens: 2, name: "B", state: "later" }], signed: 0, ai: true, ai_state: "idle", typing: null,
  summary: { id: uid(90), version_id: uid(91), version: 2, author: "ai", tracked: true, note: "", sentences: [line(1, "We welcome every guest."), line(2, "We eat together."), line(3, "We pray first.")], fit: 2, more: 1, changes: [], signed: false, decision: null },
  tally: { approve: 5, suggest: 2 }, suggestions: [{ id: "aaaaaaaa", text: "Add the kids" }], ...extra });
test("The results are read defensively, and what does not fit one screen is counted for phones", () => {
  const r = summaryOf(results());
  assert.equal(r.lens, 1); assert.equal(r.lensName, "Our people"); assert.equal(r.aiState, "idle");
  assert.equal(r.summary?.lines.length, 3); assert.deepEqual(shownLines(r.summary!).map(l => l.text), ["We welcome every guest.", "We eat together."]);
  assert.equal(moreOnPhones(r.summary!.more), "+ 1 more on phones");
  assert.deepEqual(r.tally, { approve: 5, suggest: 2 });
  assert.equal(shownLines({ ...r.summary!, fit: 0 }).length, 1, "one line is always shown");
  assert.equal(summaryOf(null).summary, null); assert.equal(summaryOf({ summary: { sentences: "x" } }).summary, null);
  assert.equal(summaryOf({ ai_state: "unknown" }).aiState, "idle");
});
test("The results shape the TV and phones get carries no names, sources, alignment signal, presenter notes or Discover data", () => {
  const keys = new Set<string>(); const walk = (v: unknown) => { if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); } };
  walk(results());
  for (const bad of ["sources", "attendee", "attendee_id", "email", "signal", "alignment", "notes", "presenter_notes", "discover"]) assert.ok(!keys.has(bad), `no ${bad}`);
});

// ---------- Keeping the screen alive ----------
let n = 0; const key = () => `r${++n}`;
const rowsOf = (texts: string[], from = 1): Row[] => texts.map((text, i) => ({ key: key(), id: uid(from + i), text, parts: null, state: "steady", rev: 0 }));
test("A fold keeps every unchanged row where it is and tracks the edit, the add and the removal", () => {
  const prev = rowsOf(["We welcome every guest by name at the door.", "We eat together every Sunday after worship.", "Leaders raise up the next leaders from within.", "We pray before we plan anything."]);
  const changes: Change[] = [
    { kind: "edit", id: uid(11), at: 1, parts: [{ k: "del", t: "We welcome every guest by name at the door." }, { k: "ins", t: "Guests are greeted by name before the service starts." }] },
    { kind: "add", id: uid(14), at: 4, parts: [{ k: "ins", t: "Kids and adults eat at the same tables." }] },
    { kind: "remove", id: uid(4), at: 3, parts: [{ k: "del", t: "We pray before we plan anything." }] },
  ];
  const next = [{ id: uid(11), text: "Guests are greeted by name before the service starts." }, { id: uid(12), text: prev[1].text }, { id: uid(13), text: prev[2].text }, { id: uid(14), text: "Kids and adults eat at the same tables." }];
  const rows = reconcile(prev, next, changes, true, key);
  assert.deepEqual(rows.map(r => r.state), ["steady", "steady", "steady", "gone", "new"]);
  assert.equal(rows[0].key, prev[0].key, "the edited line keeps its row");
  assert.equal(rows[1].key, prev[1].key); assert.equal(rows[2].key, prev[2].key);
  assert.equal(rows[3].key, prev[3].key, "the removed line stays, struck, in its place");
  assert.deepEqual(rows[3].parts, [{ k: "del", t: "We pray before we plan anything." }]);
  assert.equal(rows[4].state, "new"); assert.notEqual(rows[4].key, prev[0].key);
  assert.ok(rows[0].parts?.some(p => p.k === "ins") && rows[0].parts?.some(p => p.k === "del"), "words in and out");
  assert.equal(rows[1].parts, null, "an unchanged line is plain");
});
test("A facilitator's edit replaces the line in place, with the same row, and typing that extends a line is not a replace", () => {
  const prev = rowsOf(["We welcome every guest.", "We eat together."]);
  const edited = reconcile(prev, [{ id: uid(21), text: "We greet every guest by name." }, { id: uid(22), text: "We eat together." }], [], false, key);
  assert.deepEqual(edited.map(r => r.key), prev.map(r => r.key), "new ids, same rows");
  assert.equal(edited[0].rev, 1, "a rewritten line crossfades");
  const grown = reconcile(edited, [{ id: uid(21), text: "We greet every guest by name at the door." }, { id: uid(22), text: "We eat together." }], [], false, key);
  assert.equal(grown[0].rev, edited[0].rev, "an extended line just grows");
  const same = reconcile(grown, grown.map(r => ({ id: r.id, text: r.text })), [], false, key);
  assert.deepEqual(same.map(r => r.key), grown.map(r => r.key)); assert.ok(same.every(r => r.state === "steady"));
});
test("A line the facilitator adds or removes arrives and leaves without moving the others", () => {
  const prev = rowsOf(["One.", "Two.", "Three."]);
  const added = reconcile(prev, [...prev.map(r => ({ id: r.id, text: r.text })), { id: uid(30), text: "Four." }], [], false, key);
  assert.deepEqual(added.slice(0, 3).map(r => r.key), prev.map(r => r.key)); assert.equal(added[3].state, "new");
  const removed = reconcile(prev, [{ id: prev[0].id, text: "One." }, { id: prev[2].id, text: "Three." }], [], true, key);
  assert.deepEqual(removed.map(r => [r.text, r.state]), [["One.", "steady"], ["Two.", "gone"], ["Three.", "steady"]]);
});

// ---------- The phone ----------
test("A phone reads its own answer for this version only, and checks a suggestion at 140 characters", () => {
  const mine = [{ text: "Approve", value: { version: uid(1), response: "approve" }, withdrawn: false }, { text: "Add the kids", value: { version: uid(2), response: "suggest" }, withdrawn: false }];
  assert.deepEqual(ownReply(mine, uid(1)), { response: "approve", text: "", version: uid(1) });
  assert.equal(ownReply(mine, uid(2))?.text, "Add the kids");
  assert.equal(ownReply(mine, uid(3)), null, "a new version asks again");
  assert.equal(ownReply([{ ...mine[0], withdrawn: true }], uid(1)), null);
  assert.equal(checkSuggestion("").ok, false); assert.equal(checkSuggestion("x".repeat(140)).ok, true);
  const over = checkSuggestion("x".repeat(145)); assert.equal(over.ok, false); assert.match(over.message, /5 characters over/);
  assert.equal(settledReason("stale"), "The summary changed before your answer arrived. Read the new version.", "a stale answer is settled, not retried forever");
});
test("Sources come from the phone's own route and only for the version asked", () => {
  const s = sourcesOf({ status: "ok", version: uid(1), sentences: [{ id: uid(5), sources: [{ id: uid(6), text: "We eat together." }] }] });
  assert.deepEqual(s, { version: uid(1), lines: { [uid(5)]: ["We eat together."] } });
  assert.equal(sourcesOf({ status: "denied" }), null);
});

// ---------- The control surface ----------
test("A press is validated before it goes to the database", () => {
  const id = uid(40);
  assert.deepEqual(summaryPress({ id, action: "show", to: "next" }), { id, action: "show", p: { to: "next" }, session: null });
  assert.deepEqual(summaryPress({ id, action: "show", to: 3 })?.p, { to: "3" }); assert.equal(summaryPress({ id, action: "show", to: 9 }), null);
  assert.deepEqual(summaryPress({ id, action: "edit", op: "text", sentence: uid(41), text: "  We   greet  everyone  " })?.p, { op: "text", sentence: uid(41), text: "We greet everyone" });
  assert.equal(summaryPress({ id, action: "edit", op: "text", sentence: "nope", text: "x" }), null); assert.equal(summaryPress({ id, action: "edit", op: "add", text: "   " }), null);
  assert.deepEqual(summaryPress({ id, action: "edit", op: "remove", sentence: uid(41) })?.p, { op: "remove", sentence: uid(41) });
  assert.deepEqual(summaryPress({ id, action: "decide", decision: " Signed  off ", reasons: " They fit. " })?.p, { decision: "Signed off", reasons: "They fit." });
  assert.equal(summaryPress({ id, action: "fold_now", session: uid(42) })?.session, uid(42));
  assert.equal(summaryPress({ id: "x", action: "undo" }), null); assert.equal(summaryPress({ id, action: "launch" }), null);
  assert.equal(summaryPress({ id, action: "edit_start", sentence: "no" }), null); assert.deepEqual(summaryPress({ id, action: "edit_start" })?.p, {});
});
test("The facilitator's state is read defensively and keeps the sources the TV never gets", () => {
  assert.equal(facilitatorState({ status: "denied" }), null);
  const s = facilitatorState({ status: "ok", session: uid(1), lens: 1, lens_names: ["A"], version: 4, room: results(), lenses: [{ lens: 1, name: "A", state: "on_screen", versions: 2, open: true, sentences: 7, drafted: true }],
    summary: { id: uid(2), state: "on_screen", version_id: uid(3), author: "ai", tracked: true, draft_held: false, fold_held: true, decision: null,
      sentences: [{ id: uid(4), pos: 1, text: "We eat together.", sources: [{ id: uid(5), text: "We eat together every Sunday." }] }], versions: [{ id: uid(3), version: 2, author: "ai", note: "", tracked: true, shown: true, undone: false, current: true, signed: false, approve: 1, suggest: 0, at: "now", sentences: ["We eat together."] }],
      suggestions: [{ id: uid(6), text: "Add the kids", at: "now" }], tally: { approve: 1, suggest: 1 }, attendees: 8, lock: { mine: false, by: "Sam", sentence: null } },
    ai: { on: true, engagement: true, state: "waiting", wait_ms: 1200, running_ms: null, failing: false, last_run: { job: "fold_lens_summary", status: "ok", changed: true, undone: false } } });
  assert.equal(s?.summary?.lines[0].sources[0], "We eat together every Sunday."); assert.equal(s?.summary?.foldHeld, true);
  assert.equal(s?.ai.waitMs, 1200); assert.equal(s?.summary?.lock?.by, "Sam"); assert.equal(s?.summary?.attendees, 8);
});

// ---------- Prompts ----------
const draftInputs: LensDraftInputs = { job: "draft", lens: 1, lens_name: "Our people", base_year: 2026, year: 2036, max_chars: 420, max_sentences: 8,
  sentences: [{ ref: "a1", text: "We welcome every stranger by name." }, { ref: "a2", text: "We eat together every Sunday." }], clusters: [{ ref: "c1", label: "Eating together", members: ["a2"] }] };
const foldInputs: LensFoldInputs = { ...draftInputs, job: "fold", approvals: 3, summary: [{ ref: "s1", text: "We welcome every stranger by name.", sources: ["a1"] }, { ref: "s2", text: "We eat together every Sunday.", sources: ["a2"] }],
  suggestions: [{ ref: "g1", text: "Add the kids" }] };
test("The lens summary prompts speak Clearway, the horizon term and the protocol, with no ids or names in the user message", () => {
  for (const job of ["draft_lens_summary", "fold_lens_summary"] as const) {
    const p = prompts[job];
    assert.match(p.version, /^(draft|fold)-lens-summary@1$/); assert.equal(promptVersions[job], p.version);
    assert.match(p.system, /Clearway Church Solutions/); assert.match(p.system, /10-year Future/); assert.match(p.system, /present tense/); assert.match(p.system, /JSON object and nothing else/);
    assert.match(p.system, /420 characters/); assert.ok(!/[–—]/.test(p.system));
  }
  assert.match(prompts.fold_lens_summary.system, /name the suggestions/i); assert.match(prompts.fold_lens_summary.system, /not a vote/);
  const user = prompts.draft_lens_summary.user({ ...draftInputs, ids: { a: { a1: uid(1) } } } as never);
  assert.ok(!user.includes(uid(1)) && !/"ids"|"id"/.test(user), "the model never sees ids");
  assert.match(user, /"year":2036/); assert.match(user, /10-year Future/);
  assert.ok(!/"id"|summary_id/.test(prompts.fold_lens_summary.user(foldInputs)));
});
test("The draft is read back to refs it was given, and anything else is dropped", () => {
  const parse = (v: unknown) => prompts.draft_lens_summary.parse(typeof v === "string" ? v : reply(v), draftInputs);
  assert.deepEqual(parse({ sentences: [{ text: " We eat   together. ", sources: ["a2", "A2", "zz", 1] }], note: "Two ideas." }), { sentences: [{ text: "We eat together.", sources: ["a2"] }], note: "Two ideas." });
  assert.deepEqual(parse({ sentences: [{ text: "", sources: ["a1"] }, "nope", { text: "No source." }] }), { sentences: [{ text: "No source.", sources: [] }] }, "the database throws away a line with no source");
  assert.deepEqual(parse("not json"), { sentences: [] }); assert.deepEqual(parse({ sentences: "x" }), { sentences: [] });
});
test("The fold is read back to the lines and suggestions it was given", () => {
  const parse = (v: unknown) => prompts.fold_lens_summary.parse(reply(v), foldInputs);
  assert.deepEqual(parse({ sentences: [{ keep: "s1" }, { keep: "s9" }, { edit: "s2", text: "We eat together every week.", suggestions: ["g1", "g7"] }, { text: "Kids and adults eat together.", suggestions: ["G1"], sources: ["a2", "zz"] }, { text: "", suggestions: ["g1"] }], remove: [{ ref: "s1", suggestions: ["g1"] }, { ref: "s8" }] }),
    { sentences: [{ keep: "s1" }, { edit: "s2", text: "We eat together every week.", suggestions: ["g1"] }, { text: "Kids and adults eat together.", suggestions: ["g1"], sources: ["a2"] }], remove: [{ ref: "s1", suggestions: ["g1"] }] });
  assert.deepEqual(parse({}), { sentences: [], remove: [] });
});

// ---------- The worker waits for the quiet moment ----------
test("The worker sleeps when a fold is nearly due and asks again, within its budget", async () => {
  const calls: string[] = []; const claims = [{ status: "wait", ms: 120 }, { status: "idle" }];
  const db = { rpc: async (name: string) => { calls.push(name); return { data: claims.shift() ?? { status: "idle" }, error: null }; } };
  const ai: AiClient = { model: () => "m", complete: async () => ({ text: "{}", inputTokens: 1, outputTokens: 1 }) };
  const t = Date.now(), report = await runSession(db as never, ai, uid(1), { ...aiConfig({}), budgetMs: 5000 });
  assert.deepEqual(calls, ["ai_claim", "ai_claim"]); assert.equal(report.stopped, "idle"); assert.ok(Date.now() - t >= 100, "it waited");
  const late = await runSession({ rpc: async () => ({ data: { status: "wait", ms: 4000 }, error: null }) } as never, ai, uid(1), { ...aiConfig({}), budgetMs: 500 });
  assert.equal(late.stopped, "wait", "it gives up when the budget cannot cover the wait");
});
