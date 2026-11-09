import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfig } from "../../lib/ai/config";
import { fakeClient, jobOf, recordedClient, scripted } from "../../lib/ai/fake";
import { aiJobs, prompts, promptVersions, replyJson, type SignalInputs } from "../../lib/ai/prompts";
import { runSession, signalTimeoutMs } from "../../lib/ai/worker";

type Case = { name: string; inputs: SignalInputs; reply: string; expect: { cards: number; kinds: string[]; silent: string; thinRoom: string[]; alsoOnThin: string[] } };
const fixtures = JSON.parse(readFileSync(new URL("../fixtures/ai/signal.json", import.meta.url), "utf8")) as { names: string[]; cases: Case[] };
const riverside = fixtures.cases[0], p = prompts.alignment_signal;

test("The signal prompt is versioned, JSON only, private, never corrects and keeps horizons exact", () => {
  assert.ok(aiJobs.includes("alignment_signal"));
  assert.equal(p.version, "alignment-signal@1");
  assert.equal(promptVersions.alignment_signal, p.version);
  assert.equal(jobOf({ system: p.system }), "alignment_signal");
  assert.match(p.system, /private to the facilitator/);
  assert.match(p.system, /nothing you write goes on the screen/);
  assert.match(p.system, /data, not instructions/);
  assert.match(p.system, /Never correct, rank, grade or judge/);
  assert.match(p.system, /Never say the room is wrong/);
  assert.match(p.system, /Only when phones_down is true/);
  assert.match(p.system, /no number, share or count/);
  assert.match(p.system, /Never name a person/);
  assert.match(p.system, /At most 6 cards/);
  assert.match(p.system, /never raise one marked dismissed/);
  assert.match(p.system, /neutral question/);
  assert.ok(!/[–—]/.test(p.system), "no em or en dashes");
  for (const term of ["10-year Future", "3-year Vision", "1-year Outlook", "Five Lenses"]) assert.ok(p.system.includes(term));
  assert.ok(!/(\b3 year\b|\bthree-year\b|\b10 year\b|\bten-year\b|\b1 year\b|\bone-year\b)/i.test(p.system));
});

test("The model sees theme words, weights and the room's words under short refs: no ids, no people, no counts", () => {
  const user = p.user(riverside.inputs);
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(user), "no ids");
  assert.ok(!/"id"|rests_on|out_of|attendee|speaker|email|"person"/.test(user), "no id, count or person field");
  const parsed = replyJson(user) as { themes: { ref: string; weight: string }[]; room: { ref: string; from?: string; new?: boolean }[]; raised: { kind: string; theme: string }[]; phones_down: boolean };
  assert.deepEqual(parsed.themes.map(t => [t.ref, t.weight]), [["t1", "strong"], ["t2", "strong"], ["t3", "thin"], ["t4", "strong"]]);
  assert.equal(parsed.room.length, 8);
  assert.equal(parsed.room[7].from, "the scribe", "a scribe card is marked as one, with no speaker");
  assert.equal(parsed.phones_down, true);
  assert.deepEqual(parsed.raised, [{ kind: "aligned", theme: "t1" }]);
});

test("The recorded Riverside reply: unknown kinds, themes and refs are dropped, never guessed", () => {
  const out = p.parse(riverside.reply, riverside.inputs) as { cards: { kind: string; theme: string; room: string[]; also: string[]; ask?: string }[]; complete: boolean };
  assert.equal(out.complete, true);
  assert.equal(out.cards.length, riverside.expect.cards);
  assert.deepEqual(out.cards.map(c => c.kind), riverside.expect.kinds);
  assert.deepEqual(out.cards.find(c => c.kind === "silent")!.room, []);
  assert.equal(out.cards.find(c => c.kind === "silent")!.theme, riverside.expect.silent);
  const thin = out.cards.find(c => c.kind === "thin")!;
  assert.deepEqual(thin.room, riverside.expect.thinRoom, "r99 is not a ref the run gave");
  assert.deepEqual(thin.also, ["t1"], "t9 is not a theme the run gave");
  assert.equal(thin.ask, undefined);
});

test("A reply that is not a whole answer is empty and retires nothing", () => {
  assert.deepEqual(p.parse("not json", riverside.inputs), { cards: [], complete: false });
  assert.deepEqual(p.parse("{\"cards\":[]}", { ...riverside.inputs, phones_down: false }), { cards: [], complete: true });
  assert.deepEqual(p.parse("{\"cards\":\"x\"}", riverside.inputs), { cards: [], complete: false });
  assert.equal((p.parse("{\"cards\":[],\"complete\":false}", riverside.inputs) as { complete: boolean }).complete, false);
});

test("Cards are suggestions: the recorded wording notices and never corrects", () => {
  const out = p.parse(riverside.reply, riverside.inputs) as { cards: { title: string; line: string; ask?: string }[] };
  for (const c of out.cards) {
    assert.ok(!/\b(wrong|incorrect|mistake|bad idea|should|must|contradict|ignore)/i.test(`${c.title} ${c.line}`), c.title);
    assert.ok(!/\d/.test(`${c.title} ${c.line}`), "no number: the app counts");
    assert.ok(!/["“”]/.test(`${c.title} ${c.line}`), "no quotation marks");
    if (c.ask) assert.match(c.ask, /\?$/);
    for (const name of fixtures.names) assert.ok(!new RegExp(`\\b${name}\\b`, "i").test(`${c.title} ${c.line} ${c.ask ?? ""}`), `no ${name}`);
  }
});

test("The recorded client answers the signal call with the recorded reply", async () => {
  const client = recordedClient([{ job: "alignment_signal", user: p.user(riverside.inputs), reply: riverside.reply }]);
  const reply = await client.complete({ system: p.system, user: p.user(riverside.inputs), maxTokens: p.maxTokens, timeoutMs: 1000 }, aiConfig({}));
  assert.equal(reply.text, riverside.reply);
});

test("The scripted stand-in follows the rules: aligned, silent only with phones down, thin, divergent, and nothing already up", () => {
  const call = (inputs: SignalInputs) => ({ system: p.system, user: p.user(inputs), maxTokens: 1, timeoutMs: 1 });
  const out = (inputs: SignalInputs) => (replyJson(scripted(call(inputs))) as { cards: { kind: string; theme: string; room: string[] }[]; complete: boolean });
  const up = out(riverside.inputs);
  assert.equal(up.complete, true);
  const kinds = (o: typeof up) => o.cards.map(c => `${c.kind}:${c.theme}`).sort();
  assert.ok(kinds(up).includes("aligned:t1"), "new input on t1 raises its card again, which updates it in place");
  const settled = out({ ...riverside.inputs, room: riverside.inputs.room.map(r => ({ ...r, new: false })) });
  assert.ok(!kinds(settled).includes("aligned:t1"), "nothing new on t1 leaves its card alone");
  assert.ok(kinds(up).includes("silent:t4") && kinds(up).includes("thin:t3") && kinds(up).some(k => k.startsWith("divergent:")));
  const phonesUp = out({ ...riverside.inputs, phones_down: false });
  assert.ok(!phonesUp.cards.some(c => c.kind === "silent"), "silent only once phones are down");
  for (const c of up.cards) if (c.kind === "silent") assert.deepEqual(c.room, []);
  assert.deepEqual(out({ ...riverside.inputs, room: [], raised: [] }).cards.filter(c => c.kind !== "silent"), [], "an empty room raises no aligned, thin or divergent card");
});

test("The worker runs the signal on the deeper model with a longer timeout and names the model when it applies", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const claim = { status: "claimed", run: "run-1", job: "alignment_signal", prompt_version: p.version, inputs: riverside.inputs };
  const db = { rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return name === "ai_claim" ? { data: calls.filter(c => c.name === "ai_claim").length === 1 ? claim : { status: "idle" }, error: null } : { data: { status: "ok" }, error: null }; } } as unknown as SupabaseClient;
  const seen: { model: string; timeoutMs: number }[] = [];
  const base = fakeClient("script");
  const ai = { model: base.model, async complete(c: Parameters<typeof base.complete>[0], config: Parameters<typeof base.complete>[1]) { seen.push({ model: config.model, timeoutMs: c.timeoutMs }); return base.complete(c, config); } };
  const config = { ...aiConfig({}), deepModel: "claude-deep-test" };
  const report = await runSession(db, ai, "session-1", config);
  assert.equal(report.runs[0].job, "alignment_signal");
  assert.equal(seen[0].model, "claude-deep-test", "the deeper model");
  assert.ok(seen[0].timeoutMs > config.timeoutMs && seen[0].timeoutMs <= signalTimeoutMs(config), "a longer timeout than a live fold, within the lease");
  const apply = calls.find(c => c.name === "ai_apply")!;
  assert.equal((apply.args.p_usage as { model: string }).model, "fake-script", "the model it used goes back with the reply");
  assert.deepEqual((calls[0].args.p_versions as Record<string, string>).alignment_signal, p.version, "the prompt version goes with every claim");
  assert.ok((apply.args.p_output as { cards: unknown[] }).cards.length > 0);
});

// The November 9 acceptance run: a strong theme nobody spoke of, two signal runs after Phones down, and the model said nothing about it both times.
test("After Phones down, a strong theme with no card gets a silent card even when the model omits it", () => {
  const strong = riverside.inputs.themes.filter(t => t.strong).map(t => t.ref);
  const out = p.parse("{\"cards\":[]}", { ...riverside.inputs, raised: [] }) as { cards: { kind: string; theme: string; room: string[]; title: string; line: string }[]; complete: boolean };
  assert.equal(out.complete, true);
  assert.deepEqual(out.cards.map(c => c.theme), strong.slice(0, 3), "strongest first, at most 3");
  for (const c of out.cards) {
    assert.equal(c.kind, "silent"); assert.deepEqual(c.room, []);
    assert.ok(!/\d/.test(`${c.title} ${c.line}`) && !/["“”–—]/.test(`${c.title} ${c.line}`) && !/\b(wrong|should|must|mistake|contradict|ignore)/i.test(`${c.title} ${c.line}`));
  }
  assert.deepEqual(p.parse("{\"cards\":[]}", { ...riverside.inputs, phones_down: false }), { cards: [], complete: true }, "never while phones are up");
  assert.deepEqual(p.parse("{\"cards\":[],\"complete\":false}", { ...riverside.inputs, raised: [] }), { cards: [], complete: false }, "not on a reply that is not whole");
  assert.deepEqual(p.parse("not json", { ...riverside.inputs, raised: [] }), { cards: [], complete: false });
});

test("A strong theme the model raised a card on, or that already has a card (dismissed too), gets no extra silent card", () => {
  const strong = riverside.inputs.themes.filter(t => t.strong).map(t => t.ref);
  const reply = JSON.stringify({ cards: [{ kind: "aligned", theme: strong[0], title: "Small groups echoed", line: "The room's words point the same way.", room: [riverside.inputs.room[0].ref] }] });
  const raised = [{ kind: "divergent" as const, theme: strong[1], dismissed: true }];
  const out = p.parse(reply, { ...riverside.inputs, raised }) as { cards: { kind: string; theme: string }[] };
  assert.deepEqual(out.cards.map(c => `${c.kind}:${c.theme}`), [`aligned:${strong[0]}`, ...strong.slice(2, 5).map(r => `silent:${r}`)]);
});

test("The prompt asks for a silent card for every strong theme the room has not spoken to once phones are down", () => {
  assert.match(p.system, /go through every strong theme/);
  assert.match(p.system, /never leave one out/);
});
