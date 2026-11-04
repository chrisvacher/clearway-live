import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { aiConfig } from "../../lib/ai/config";
import type { AiClient } from "../../lib/ai/client";
import { fakeClient, isOvernight, recordedClient, scripted } from "../../lib/ai/fake";
import { overnightPrompt, overnightVersion, prompts, replyJson, type OvernightInputs, type OvernightOutput } from "../../lib/ai/prompts";
import { loadPhotos, runOvernight, workOvernight } from "../../lib/ai/overnight";
import { overnightBody } from "../../lib/overnight/body";
import { blockers, markOf, minutesBetween, resultMessage, rowStatus } from "../../lib/overnight/policy";
import type { Draft, DraftBullet, OvernightState } from "../../components/overnight/types";

type Case = { name: string; inputs: OvernightInputs; reply: string; expect: { outcomes: number; bulletsAtMost: number; thin: string[]; voicesFromCards: string[]; tensionsFromCards: string[]; unreadable: string[] } };
const fixtures = JSON.parse(readFileSync(new URL("../fixtures/ai/overnight.json", import.meta.url), "utf8")) as { names: string[]; cases: Case[] };
const riverside = fixtures.cases[0];
const uuid = (n: number) => `85500000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const numbers = (text: string): string[] => text.match(/\d+/g) ?? [];

// ---------- The prompt ----------
test("The overnight prompt is versioned, named for Clearway, JSON only, and uses the terms exactly", () => {
  assert.match(overnightPrompt.version, /^[a-z-]+@\d+$/);
  assert.equal(overnightVersion, overnightPrompt.version);
  assert.match(overnightPrompt.system, /Clearway Church Solutions/);
  assert.match(overnightPrompt.system, /JSON object and nothing else/);
  assert.ok(!/[–—]/.test(overnightPrompt.system), "no em or en dashes in the prompt");
  for (const term of ["3-year Vision", "10-year Future", "1-year Outlook", "Vision Outcomes"]) assert.ok(overnightPrompt.system.includes(term), `the prompt says ${term} exactly`);
  assert.ok(!/(\b3 year\b|\bthree-year\b|\b10 year\b|\bten-year\b|\b1 year\b|\bone-year\b)/i.test(overnightPrompt.system), "no other spelling of a horizon");
  assert.match(overnightPrompt.system, /Never invent/);
  assert.match(overnightPrompt.system, /Never name a person/);
  assert.match(overnightPrompt.system, /Do not draft the 10-year Future/);
  assert.match(overnightPrompt.system, /Keep two lists apart/);
  assert.match(overnightPrompt.system, /a scribe card or an easel photo/);
  assert.equal(isOvernight({ system: overnightPrompt.system }), true);
  for (const p of Object.values(prompts)) assert.notEqual(p.system, overnightPrompt.system, "it is not one of the live jobs");
});
test("The model sees text, counts and refs: no ids, paths, speakers, owners or attendees", () => {
  const withOwner: OvernightInputs = { ...riverside.inputs, cards: riverside.inputs.cards.map((c, i) => i === 0 ? { ...c, detail: { owner: "Sam Lee", why: "because" } } : c) };
  const user = overnightPrompt.user(withOwner, ["p1"]);
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(user), "no ids");
  assert.ok(!/"path"|"id"|attendee|speaker|email|Sam Lee/.test(user), "no paths, identity fields or owners");
  const parsed = replyJson(user) as { photos: { ref: string; image: boolean }[]; outcomes: { ref: string; bullets: { ref: string }[] }[] };
  assert.deepEqual(parsed.photos.map(p => [p.ref, p.image]), [["p1", true], ["p2", false]], "it says which photos are attached as images");
  assert.deepEqual(parsed.outcomes[0].bullets.map(b => b.ref), ["o1b1", "o1b2", "o1b3"]);
});
test("The recorded Riverside reply: sourced, honest about numbers, apart, and never naming a person", () => {
  const out = overnightPrompt.parse(riverside.reply, riverside.inputs);
  assert.equal(out.outcomes.length, riverside.expect.outcomes);
  const refs = new Set([...riverside.inputs.outcomes.flatMap(o => [o.ref, ...o.bullets.map(b => b.ref)]), ...riverside.inputs.cards.map(c => c.ref), ...riverside.inputs.photos.map(p => p.ref)]);
  const text = (ref: string) => riverside.inputs.outcomes.flatMap(o => o.bullets).find(b => b.ref === ref)?.text ?? riverside.inputs.cards.find(c => c.ref === ref)?.text ?? "";
  for (const o of out.outcomes) {
    assert.ok(o.bullets.length <= riverside.expect.bulletsAtMost);
    for (const b of o.bullets) {
      assert.ok(b.sources.length > 0, `every sentence has a source: ${b.text}`);
      for (const s of b.sources) assert.ok(refs.has(s.ref), `${s.ref} was given`);
      const fromCardsOrPhotos = b.sources.filter(s => /^[cp]\d/.test(s.ref)).map(s => text(s.ref)).join(" ");
      for (const n of numbers(b.text)) assert.ok(numbers(fromCardsOrPhotos).includes(n), `the number ${n} in a bullet comes from a scribe card or an easel photo`);
      assert.ok(b.text.length <= 280);
    }
    for (const v of o.voices) { const card = riverside.inputs.cards.find(c => c.ref === v.source); assert.ok(card && riverside.expect.voicesFromCards.includes(card.kind), "a voice comes from a quote or decision"); assert.ok(card.text.includes(v.text), "word for word"); }
    for (const t of o.tensions) { const card = riverside.inputs.cards.find(c => c.ref === t.source); assert.ok(card && riverside.expect.tensionsFromCards.includes(card.kind), "a tension comes from a tension or question"); assert.ok(card.text.includes(t.text), "word for word"); }
    const all = [...o.bullets.map(b => b.text), ...o.voices.map(v => v.text), ...o.tensions.map(t => t.text)].join(" ");
    for (const name of fixtures.names) assert.ok(!new RegExp(`\\b${name}\\b`).test(all), `${name} is not named`);
    assert.ok(!/[–—]/.test(all), "no dashes");
  }
  assert.deepEqual(out.outcomes.filter(o => o.bullets.length === 0).map(o => o.outcome), riverside.expect.thin, "a thin outcome stays thin");
  assert.deepEqual(out.unreadable.map(u => u.photo), riverside.expect.unreadable);
  const separate = out.outcomes[0];
  assert.equal(separate.voices.length, 1);
  assert.equal(separate.tensions.length, 2);
  assert.ok(separate.voices.every(v => !separate.tensions.some(t => t.text === v.text)), "voices and tensions are kept apart");
});
test("A reply is read defensively: anything that isn't the shape is an empty draft", () => {
  assert.deepEqual(overnightPrompt.parse("not json", riverside.inputs), { outcomes: [], unreadable: [] });
  const wild = overnightPrompt.parse(JSON.stringify({ outcomes: [{ outcome: "O1", bullets: [{ text: "  Spaced   out  ", sources: ["O1B1", { ref: 2 }, { ref: "c2", excerpt: 5 }, null] }, { text: "", sources: ["c1"] }, 7],
    voices: [{ text: "x", source: "c1" }, { text: "no source" }], tensions: "nope" }, { outcome: "o9", bullets: [] }, "o2"], unreadable: ["p1", { photo: "P2", outcome: "o1" }, 3] }), riverside.inputs);
  assert.equal(wild.outcomes.length, 1, "an outcome that isn't in the run is dropped");
  assert.equal(wild.outcomes[0].bullets[0].text, "Spaced out");
  assert.deepEqual(wild.outcomes[0].bullets[0].sources.map(s => s.ref), ["o1b1", "2", "c2"]);
  assert.equal(wild.outcomes[0].bullets.length, 1, "an empty bullet is dropped");
  assert.equal(wild.outcomes[0].voices.length, 1);
  assert.deepEqual(wild.outcomes[0].tensions, []);
  assert.deepEqual(wild.unreadable, [{ photo: "p1" }, { photo: "p2", outcome: "o1" }, { photo: "3" }]);
  const long = overnightPrompt.parse(JSON.stringify({ outcomes: [{ outcome: "o1", bullets: Array.from({ length: 20 }, (_, i) => ({ text: `b${i}`, sources: ["c1"] })), voices: Array.from({ length: 9 }, () => ({ text: "x", source: "c1" })) }] }), riverside.inputs);
  assert.equal(long.outcomes[0].bullets.length, 8, "at most eight bullets");
  assert.equal(long.outcomes[0].voices.length, 3, "and three voices");
});
test("The stand-in follows the same rules on any input: each room bullet tidied with its source; a number stays the room's own words", () => {
  const out = JSON.parse(scripted({ system: overnightPrompt.system, user: overnightPrompt.user(riverside.inputs, ["p1"]), maxTokens: 1, timeoutMs: 1 })) as OvernightOutput;
  assert.equal(out.outcomes.length, 3);
  assert.deepEqual(out.outcomes[0].bullets.map(b => b.sources[0].ref), ["o1b1", "o1b2", "o1b3"]);
  assert.equal(out.outcomes[0].bullets[0].text, "Leaders grow here and lead here.", "tidied: capital and full stop");
  assert.deepEqual(out.outcomes[2].bullets, [], "a thin outcome stays thin");
  assert.deepEqual(out.unreadable, [{ photo: "p2" }], "a photo with no image is unreadable");
  const numeric = JSON.parse(scripted({ system: overnightPrompt.system, user: JSON.stringify({ outcomes: [{ ref: "o1", bullets: [{ ref: "o1b1", text: "50 new leaders" }] }], cards: [], photos: [] }), maxTokens: 1, timeoutMs: 1 })) as OvernightOutput;
  assert.equal(numeric.outcomes[0].bullets[0].text, "50 new leaders", "a bullet with a number keeps the room's words");
});
test("The recorded client answers the overnight prompt, and the fake client fails or stalls when told to", async () => {
  const user = overnightPrompt.user(riverside.inputs, []), recorded = recordedClient([{ job: "overnight_draft", user, reply: riverside.reply }]);
  const config = aiConfig({});
  assert.equal((await recorded.complete({ system: overnightPrompt.system, user, maxTokens: 1, timeoutMs: 1 }, config)).text, riverside.reply);
  await assert.rejects(() => recorded.complete({ system: overnightPrompt.system, user: "other", maxTokens: 1, timeoutMs: 1 }, config), /No recorded reply/);
  const fake = fakeClient("script");
  assert.ok((await fake.complete({ system: overnightPrompt.system, user, maxTokens: 1, timeoutMs: 1000 }, config)).text.includes("outcomes"));
});

// ---------- Configuration and the client ----------
test("The deeper model comes from configuration, with its own timeout and budget", () => {
  const config = aiConfig({});
  assert.equal(config.deepModel, "claude-sonnet-4-5");
  assert.equal(aiConfig({ CLEARWAY_AI_MODEL_DEEP: "claude-deep-1" }).deepModel, "claude-deep-1");
  assert.equal(aiConfig({ CLEARWAY_AI_MODEL_DEEP: "bad model; drop" }).deepModel, "claude-sonnet-4-5");
  assert.equal(aiConfig({ CLEARWAY_AI_MODEL_LIVE: "live-1" }).model, "live-1", "the live model is its own setting");
  assert.ok(config.deepTimeoutMs > config.timeoutMs);
});

// ---------- The worker ----------
type Rpc = { name: string; args: Record<string, unknown> };
function fakeDb(claims: Record<string, unknown>[], files: Record<string, number | null> = {}, apply = "ok") {
  const calls: Rpc[] = [], downloads: string[] = [];
  return { calls, downloads,
    storage: { from: (bucket: string) => ({ download: async (path: string) => { downloads.push(`${bucket}/${path}`); const size = files[path]; return size ? { data: new Blob([new Uint8Array(size)]), error: null } : { data: null, error: { message: "missing" } }; } }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "overnight_claim") return { data: claims.shift() ?? { status: "idle" }, error: null };
      if (name === "overnight_apply") return apply === "error" ? { data: null, error: { code: "P0001" } } : { data: { status: apply }, error: null };
      return { data: { status: "ok" }, error: null };
    } };
}
const claim = (inputs = riverside.inputs) => ({ status: "claimed", run: uuid(1), job: "overnight_draft", prompt_version: overnightVersion, inputs: { ...inputs, photos: inputs.photos.map(p => ({ ...p, path: `eng/step/${p.ref}.jpg` })) } });
const deepConfig = { ...aiConfig({ CLEARWAY_AI_MODEL_DEEP: "deep-test" }), deepBudgetMs: 5000 };
const okClient = (log: { model: string[]; images: number[] }): AiClient => ({ model: c => c.model, complete: async (call, c) => { log.model.push(c.model); log.images.push(call.images?.length ?? 0); return { text: riverside.reply, inputTokens: 4000, outputTokens: 900 }; } });

test("The overnight worker claims with the deep model and prompt version, reads the photos, and applies under its lease", async () => {
  const db = fakeDb([claim()], { "eng/step/p1.jpg": 2000 }), log = { model: [] as string[], images: [] as number[] };
  const report = await runOvernight(db as never, okClient(log), uuid(9), deepConfig);
  assert.deepEqual(db.calls.map(c => c.name), ["overnight_claim", "overnight_apply"]);
  const [c, a] = db.calls;
  assert.equal(c.args.p_model, "deep-test", "the deeper model, not the live one");
  assert.deepEqual(c.args.p_versions, { overnight_draft: overnightVersion });
  assert.equal(a.args.p_lease, c.args.p_lease, "the apply carries the claim's lease");
  assert.equal(a.args.p_run, uuid(1));
  assert.deepEqual(log, { model: ["deep-test"], images: [1] }, "the readable photo goes as an image; the heic one does not");
  assert.deepEqual(db.downloads, ["scribe/eng/step/p1.jpg"], "from the private bucket");
  const output = a.args.p_output as OvernightOutput & { raw: string };
  assert.ok(output.unreadable.some(u => u.photo === "p2"), "a photo it could not send is reported as unreadable");
  assert.equal(output.raw, riverside.reply);
  const usage = a.args.p_usage as { input_tokens: number; cost_usd: number };
  assert.equal(usage.input_tokens, 4000);
  assert.ok(usage.cost_usd > 0, "tokens and cost are logged");
  assert.equal(report.status, "ok");
});
test("A photo that can't be fetched, is too big or has typed words is not sent", async () => {
  const photos = [
    { ref: "p1", id: uuid(21), step: "s", caption: "a", path: "a.jpg", type: "image/jpeg", bytes: 100, readable: true, typed: null },
    { ref: "p2", id: uuid(22), step: "s", caption: "b", path: "b.jpg", type: "image/png", bytes: 100, readable: true, typed: null },
    { ref: "p3", id: uuid(23), step: "s", caption: "c", path: "c.jpg", type: "image/png", bytes: 100, readable: true, typed: "Typed words" },
    { ref: "p4", id: uuid(24), step: "s", caption: "d", path: "d.jpg", type: "image/jpeg", bytes: 6 * 1024 * 1024, readable: true, typed: null } ];
  const db = fakeDb([], { "a.jpg": 100 });
  const loaded = await loadPhotos(db as never, photos);
  assert.deepEqual(loaded.sent, ["p1"]);
  assert.deepEqual(loaded.missed, ["p2", "p4"]);
  assert.equal(loaded.images[0].type, "image/jpeg");
  assert.deepEqual(db.downloads, ["scribe/a.jpg", "scribe/b.jpg"], "a typed photo and an oversized one are never downloaded");
});
test("A failing or slow call is recorded and the round carries on for the facilitators", async () => {
  const db = fakeDb([claim()]);
  const report = await runOvernight(db as never, { model: c => c.model, complete: async () => { throw new Error("Request timed out."); } }, uuid(9), deepConfig);
  assert.deepEqual(db.calls.map(c => c.name), ["overnight_claim", "overnight_fail"]);
  assert.equal(db.calls[1].args.p_error, "timeout");
  assert.equal(db.calls[1].args.p_lease, db.calls[0].args.p_lease);
  assert.equal(report.status, "timeout");
  const other = fakeDb([claim()]);
  await runOvernight(other as never, { model: c => c.model, complete: async () => { throw new Error("boom"); } }, uuid(9), deepConfig);
  assert.equal(other.calls[1].args.p_error, "unavailable");
  const stale = fakeDb([{ ...claim(), prompt_version: "overnight-draft@99" }]);
  await runOvernight(stale as never, okClient({ model: [], images: [] }), uuid(9), deepConfig);
  assert.deepEqual(stale.calls.map(c => c.name), ["overnight_claim", "overnight_fail"], "a prompt version the code doesn't have is a failure, not a guess");
});
test("An apply that cannot commit releases the lease; busy, off, cooling and idle do nothing", async () => {
  const db = fakeDb([claim()], {}, "error");
  const report = await runOvernight(db as never, okClient({ model: [], images: [] }), uuid(9), deepConfig);
  assert.deepEqual(db.calls.map(c => c.name), ["overnight_claim", "overnight_apply", "overnight_fail"]);
  assert.equal(report.status, "unavailable");
  for (const status of ["busy", "off", "cooling", "idle", "missing"]) {
    const quiet = fakeDb([{ status }]);
    const r = await runOvernight(quiet as never, okClient({ model: [], images: [] }), uuid(9), deepConfig);
    assert.deepEqual(quiet.calls.map(c => c.name), ["overnight_claim"]);
    assert.equal(r.status, status);
  }
});
test("One overnight worker per engagement in this process", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const db = fakeDb([claim()]);
  const slow: AiClient = { model: c => c.model, complete: async () => { await gate; return { text: riverside.reply, inputTokens: 1, outputTokens: 1 }; } };
  const first = workOvernight(db as never, slow, uuid(77), deepConfig), second = workOvernight(db as never, slow, uuid(77), deepConfig);
  assert.equal(first, second, "a second trigger joins the first");
  release();
  await first;
  assert.equal(db.calls.filter(c => c.name === "overnight_claim").length, 1);
});

// ---------- The review's request shapes and words ----------
test("Review calls are checked for shape before they reach the database", () => {
  const id = uuid(5);
  assert.deepEqual(overnightBody({ action: "presence", place: "overview", editing: false }), { action: "presence", place: "overview", editing: false });
  assert.equal(overnightBody({ action: "presence", place: "somewhere", editing: false }), null);
  assert.equal(overnightBody({ action: "presence", place: id, editing: "yes" }), null);
  assert.deepEqual(overnightBody({ action: "edit", outcome: id, revision: 3, bullets: [{ id, text: "a" }, { text: "b" }] }), { action: "edit", outcome: id, revision: 3, bullets: [{ id, text: "a" }, { text: "b" }] });
  assert.equal(overnightBody({ action: "edit", outcome: id, revision: -1, bullets: [] }), null);
  assert.equal(overnightBody({ action: "edit", outcome: id, revision: 0, bullets: [{ id: "x", text: "a" }] }), null);
  assert.equal(overnightBody({ action: "edit", outcome: id, revision: 0, bullets: Array.from({ length: 21 }, () => ({ text: "a" })) }), null);
  assert.equal(overnightBody({ action: "restore_words", outcome: id, bullet: id, revision: 0 })?.action, "restore_words");
  assert.equal(overnightBody({ action: "restore_words", outcome: id, revision: 0 }), null);
  assert.equal(overnightBody({ action: "source", outcome: id, bullet: id, kind: "video", ref: id, add: true, revision: 0 }), null);
  assert.equal(overnightBody({ action: "source", outcome: id, bullet: id, kind: "photo", ref: id, add: true, revision: 0 })?.action, "source");
  assert.equal(overnightBody({ action: "photo_text", file: id, text: "  " }), null);
  assert.equal(overnightBody({ action: "photo_text", file: id, text: "x".repeat(2001) }), null);
  assert.equal(overnightBody({ action: "publish" }), null);
  assert.equal(overnightBody({ action: "publish", id })?.action, "publish");
  assert.equal(overnightBody({ action: "start" })?.action, "start");
  assert.equal(overnightBody({ action: "by_hand" })?.action, "by_hand");
  assert.equal(overnightBody({ action: "drop_tables" }), null);
  assert.equal(overnightBody(null), null);
});
const bullet = (over: Partial<DraftBullet> = {}): DraftBullet => ({ id: uuid(40), position: 0, text: "Leaders grow here.", ai_text: null, room_text: null, origin: "ai", removed: false, restorable: false, flag: null, sources: [], ...over });
const draft = (over: Partial<Draft> = {}): Draft => ({ id: uuid(30), outcome_id: uuid(31), name: "Leaders raised from within", original_name: "Leaders raised from within", description: "", position: 0, tidy: "tidied", revision: 0, thin: false,
  thin_ack: null, reviewed: null, unreadable: [], lock: null, versions: 1, bullets: [bullet()], voices: [], tensions: [], room_bullets: [], ...over });
test("The outcome list says where each outcome stands, and what a facilitator is waiting for", () => {
  assert.deepEqual(rowStatus(draft({ tidy: "waiting" })), { kind: "drafting", label: "Tidying" });
  assert.deepEqual(rowStatus(draft()), { kind: "ready", label: "Ready to review" });
  assert.deepEqual(rowStatus(draft({ tidy: "by_hand" })), { kind: "ready", label: "Written by hand" });
  assert.deepEqual(rowStatus(draft({ lock: { by: "Jaisy", mine: false } })), { kind: "editing", label: "Jaisy is editing" });
  assert.deepEqual(rowStatus(draft({ lock: { by: "Chris", mine: true } })), { kind: "editing", label: "You are editing" });
  assert.deepEqual(rowStatus(draft({ reviewed: { by: "Chris", mine: true, at: "2026-11-05T01:00:00Z" } })), { kind: "reviewed", label: "Reviewed by Chris" });
  assert.deepEqual(rowStatus(draft({ thin: true, bullets: [] })), { kind: "flag", label: "Thin" });
  assert.deepEqual(rowStatus(draft({ thin: true, bullets: [], thin_ack: { by: "Jaisy", at: "x" } })), { kind: "flag", label: "Thin, acknowledged" });
  assert.deepEqual(rowStatus(draft({ bullets: [bullet({ flag: "none" }), bullet({ id: uuid(41), flag: "number" })] })), { kind: "flag", label: "2 flags" });
  assert.deepEqual(markOf(bullet()), { kind: "none", n: 0 });
  assert.deepEqual(markOf(bullet({ sources: [{ id: "a", kind: "card", ref: "r", excerpt: "" }, { id: "b", kind: "bullet", ref: "s", excerpt: "" }] })), { kind: "count", n: 2 });
  assert.deepEqual(markOf(bullet({ text: "same", room_text: "same", sources: [{ id: "a", kind: "bullet", ref: "r", excerpt: "" }] })), { kind: "room", n: 1 });
  assert.equal(minutesBetween("2026-11-04T23:00:00Z", "2026-11-04T23:26:20Z"), 26);
});
test("What stands in the way of Publish is listed in plain words", () => {
  const state = { status: "ok", check: { total: 3, reviewed: 1, unreviewed: ["New faith stories", "Homes"], editing: [{ name: "Homes", by: "Jaisy" }], thin: [{ name: "Families", acknowledged: false }, { name: "Seen", acknowledged: true }], thin_open: 1, drafting: true, ready: false } } as unknown as Extract<OvernightState, { status: "ok" }>;
  assert.deepEqual(blockers(state), ["The draft is still being written.", "New faith stories is not reviewed yet.", "Homes is not reviewed yet.", "Jaisy is still editing Homes.", "Families has no bullets and the flag is not acknowledged."]);
});
test("Refusals say what happened without dashes, and a lock names who has it", () => {
  assert.equal(resultMessage({ status: "locked", by: "Jaisy" }), "Jaisy is editing this outcome. You can change it when they finish.");
  for (const status of ["locked", "conflict", "published", "flagged", "thin", "drafting", "no_room_words", "not_ready", "closed", "denied", "not_found", "invalid_request", "unavailable"]) {
    const text = resultMessage({ status });
    assert.ok(text.length > 10 && !/[–—]/.test(text), status);
  }
  assert.equal(resultMessage({ status: "ok" }), "");
});
