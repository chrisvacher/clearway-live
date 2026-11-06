import assert from "node:assert/strict";
import { test } from "node:test";
import { interactionKinds, isReservedKind, kindLabels, screenIds } from "../../lib/interactions/kinds";
import { prompts, promptVersions, type ReadBackFoldInputs } from "../../lib/ai/prompts";
import { scripted } from "../../lib/ai/fake";
import { decisionSubjects } from "../../lib/wayfinding/decision";
import {
  changeLimit, checkText, correctionOf, maxReadBackLines, missingLimit, ownAnswers, phoneOf, readBackOf, readBackPress, readBackState, scribeReadOf, share, shownReadBack,
} from "../../lib/interactions/read-back";

const uid = (n: number) => `75000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const lines = [1, 2, 3, 4].map(n => ({ id: uid(n), pos: n, text: `Line ${n} reads like this.`, origin: "source", marks: null }));
const results = {
  items: [{ id: uid(10), kind: "lens", label: "Community", state: "settled" }, { id: uid(11), kind: "lens", label: "Leadership", state: "now" }, { id: uid(12), kind: "outcome", label: "A church for the street", state: "later" }],
  index: 2, count: 3, of: 8, published: true, tally: { yes: 3, change: 1 }, total: 7, missing: [{ id: "abcd1234", text: "Nothing about children" }],
  item: { id: uid(11), kind: "lens", lens: 3, heading: "Leadership, 2036", year: 2036, horizon: "10-year Future", version_id: uid(20), version: 2, author: "code", tracked: true, lines, fit: 3, more: 1,
    changes: [{ kind: "edit", id: uid(2), at: 2, parts: [{ k: "del", t: "old" }, { k: "ins", t: "new" }] }], settled: false, decision: null },
};

test("D2-03: read_back is a registered kind with its screen and label, and a decision subject", () => {
  assert.ok((interactionKinds as readonly string[]).includes("read_back"));
  assert.equal(screenIds.read_back, "D2-03");
  assert.equal(kindLabels.read_back, "Read-back");
  assert.equal(isReservedKind("read_back"), false);
  assert.ok((decisionSubjects as readonly string[]).includes("read_back"), "Mark a decision names the item");
});
test("The TV reads the item, the tally, the anonymous missing answers and the progress strip from the room's results", () => {
  const r = readBackOf(results);
  assert.equal(r.items.length, 3); assert.deepEqual(r.items.map(c => c.state), ["settled", "now", "later"]);
  assert.equal(r.item?.heading, "Leadership, 2036"); assert.equal(r.item?.year, 2036); assert.equal(r.item?.tracked, true);
  assert.deepEqual(r.tally, { yes: 3, change: 1 });
  assert.equal(r.missingCount, 3, "answers past the ones sent are counted");
  assert.deepEqual(r.missing, [{ id: "abcd1234", text: "Nothing about children" }]);
  assert.equal(shownReadBack(r.item!).length, 3, "the 420 character rule shows the first lines that fit");
  assert.equal(r.item!.more, 1, "the rest are counted as + n more on phones");
  assert.equal(readBackOf({}).item, null); assert.equal(readBackOf(null).items.length, 0);
  assert.ok(!JSON.stringify(r).match(/attendee|speaker|name"/i), "no person is in what the TV reads");
});
test("No bar is the leader and a share never passes the room", () => {
  assert.equal(share(3, 8), 38); assert.equal(share(0, 8), 0); assert.equal(share(9, 8), 100); assert.equal(share(2, 0), 0);
});
test("One answer per person for the version on screen, several 'What's missing?', and the tally starts again for a new version", () => {
  const mine = [
    { id: "a", text: "Yes, that's us", value: { version: uid(19), response: "yes" }, withdrawn: false },
    { id: "b", text: "Needs a change please", value: { version: uid(20), response: "change" }, withdrawn: false },
    { id: "c", text: "Children", value: { version: uid(19), response: "missing" }, withdrawn: false },
    { id: "d", text: "Prayer", value: { version: uid(20), response: "missing" }, withdrawn: false },
    { id: "e", text: "Gone", value: { version: uid(20), response: "missing" }, withdrawn: true },
  ];
  const a = ownAnswers(mine, uid(20), [uid(19), uid(20)]);
  assert.equal(a.response, "change"); assert.equal(a.change, "Needs a change please"); assert.deepEqual(a.missing.map(m => m.text), ["Children", "Prayer"]);
  const fresh = ownAnswers(mine, uid(21), [uid(19), uid(20), uid(21)]);
  assert.equal(fresh.response, null, "a new version starts with no answer on this phone");
  assert.equal(ownAnswers(mine, undefined, []).missing.length, 0);
});
test("The 140 and 280 character boxes", () => {
  assert.equal(changeLimit, 140); assert.equal(missingLimit, 280); assert.equal(maxReadBackLines, 8);
  assert.equal(checkText("x".repeat(140), changeLimit).ok, true); assert.equal(checkText("x".repeat(141), changeLimit).ok, false);
  assert.match(checkText("x".repeat(145), changeLimit).message, /5 characters over/); assert.equal(checkText("   ", missingLimit).ok, false);
});
test("A phone gets the full text with the sentences behind each line, and the settled items", () => {
  const p = phoneOf({ status: "ok", item: { id: uid(11), version_id: uid(20), lines: [{ id: uid(1), text: "Line", sources: [{ id: uid(50), text: "The room said it" }] }] },
    settled: [{ id: uid(10), kind: "lens", heading: "Community, 2036", changed: true, lines: [{ text: "A settled line" }] }] });
  assert.deepEqual(p?.item?.lines[0].sources, ["The room said it"]); assert.equal(p?.settled[0].changed, true); assert.deepEqual(p?.settled[0].lines, ["A settled line"]);
  assert.equal(phoneOf({ status: "denied" }), null);
});
test("The scribe's correction as the route accepts it", () => {
  const ok = correctionOf({ id: uid(60), item: uid(11), line: uid(2), wording: "  The   agreed wording ", reason: "Heard it twice" });
  assert.deepEqual(ok, { id: uid(60), item: uid(11), line: uid(2), wording: "The agreed wording", reason: "Heard it twice" });
  assert.equal(correctionOf({ id: uid(60), item: uid(11), line: "new", wording: "x" })?.line, "new");
  assert.equal(correctionOf({ id: uid(60), item: uid(11), wording: "x" })?.line, null, "the room did not name a line");
  assert.equal(correctionOf({ id: uid(60), item: uid(11), line: "not a line", wording: "x" }), null);
  assert.equal(correctionOf({ id: "bad", item: uid(11), wording: "x" }), null); assert.equal(correctionOf({ id: uid(60), item: uid(11), wording: "   " }), null);
  assert.equal(correctionOf({ id: uid(60), item: uid(11), wording: "x".repeat(600) })?.wording.length, 400);
  const s = scribeReadOf({ status: "ok", session: uid(70), item: { id: uid(11), heading: "Leadership, 2036", kind: "lens", settled: false, version_id: uid(20), lines: [{ id: uid(1), pos: 1, text: "Line" }] } });
  assert.equal(s?.item?.lines.length, 1); assert.equal(scribeReadOf({ status: "denied" }), null);
});
test("Control presses carry a client id and only the fields each action takes", () => {
  assert.deepEqual(readBackPress({ id: uid(80), action: "show", to: "next" })?.p, { to: "next" });
  assert.deepEqual(readBackPress({ id: uid(80), action: "show", to: uid(12) })?.p, { to: uid(12) });
  assert.equal(readBackPress({ id: uid(80), action: "show", to: "sideways" }), null);
  assert.equal(readBackPress({ id: "x", action: "show", to: "next" }), null); assert.equal(readBackPress({ id: uid(80), action: "explode" }), null);
  assert.deepEqual(readBackPress({ id: uid(80), action: "accept", correction: uid(60) })?.p, { correction: uid(60) }, "without a line, the correction's own line stands");
  assert.deepEqual(readBackPress({ id: uid(80), action: "accept", correction: uid(60), line: "new", wording: "Edited", reason: "r" })?.p, { correction: uid(60), line: "new", wording: "Edited", reason: "r" });
  assert.equal(readBackPress({ id: uid(80), action: "accept" }), null);
  assert.deepEqual(readBackPress({ id: uid(80), action: "correct", line: "", wording: "Hello", reason: "Because" })?.p, { line: "", wording: "Hello", reason: "Because" });
  assert.equal(readBackPress({ id: uid(80), action: "correct", wording: "" }), null);
  assert.deepEqual(readBackPress({ id: uid(80), action: "decide", decision: "Confirmed", reasons: "All agreed" })?.p, { decision: "Confirmed", reasons: "All agreed" });
});
test("The facilitator's state keeps the scribe's reason, the queue and the publication", () => {
  const s = readBackState({ status: "ok", session: uid(70), version: 4, room: results, items: results.items.map(i => ({ ...i, versions: 1, queued: 2 })),
    item: { id: uid(11), kind: "lens", heading: "Leadership, 2036", settled: false, version_id: uid(20), version: 2, author: "code", lines: lines.map(l => ({ ...l, sources: [{ text: "A source" }] })), landed: false, decision: null, versions: [] },
    changes: [{ id: "c1", text: "Make it shorter" }], missing: [{ id: "m1", text: "Children", version: 1 }],
    corrections: [{ id: uid(60), state: "queued", failure: "", wording: "New wording", reason: "Heard it", source: "scribe", new_line: false, line_id: null, by: "Sam", at: "2026-11-05T10:00:00Z", current_version: true }],
    ai: { on: true, engagement: true, state: "idle", running_ms: null, failing: false, last_run: null }, published: { loaded: 1, latest: 2, any: true, newer: true }, not_signed: ["Learning"] });
  assert.equal(s?.corrections[0].reason, "Heard it"); assert.equal(s?.published.newer, true); assert.deepEqual(s?.notSigned, ["Learning"]);
  assert.equal(s?.items[0].queued, 2); assert.equal(s?.item?.lines[0].sources[0], "A source"); assert.equal(readBackState({ status: "denied" }), null);
  const none = readBackState({ status: "ok", published: { any: false } });
  assert.equal(none?.published.any, false, "nothing published: the control surface says the drafts are not out yet");
});
test("fold-read-back@1 changes one line or adds one, in the room's words, and names no person", () => {
  const p = prompts.fold_read_back;
  assert.equal(p.version, "fold-read-back@1"); assert.equal(promptVersions.fold_read_back, p.version);
  assert.match(p.system, /Clearway Church Solutions/); assert.match(p.system, /present tense/); assert.match(p.system, /8 lines/); assert.match(p.system, /420 characters/);
  assert.ok(!/[–—]/.test(p.system));
  const inputs: ReadBackFoldInputs = { job: "fold", kind: "lens", heading: "Leadership, 2036", lens_name: "Leadership", horizon: "10-year Future", base_year: 2026, year: 2036, max_chars: 420, max_lines: 8,
    lines: [{ ref: "l1", text: "Leaders raise up the next leaders.", sources: ["Leaders raise up leaders"] }], wording: "Apprentices serve beside every ministry lead.", reason: "Said twice", ids: { l: { l1: uid(1) } }, item: uid(11), correction: uid(60), version: uid(20) };
  const user = p.user(inputs);
  assert.ok(!user.includes(uid(11)) && !user.includes(uid(60)) && !user.includes(uid(1)), "the model sees refs, never ids");
  assert.deepEqual(p.parse('{"line":"l1","text":"Apprentices serve beside every ministry lead.","note":"Placed on l1"}', inputs), { line: "l1", text: "Apprentices serve beside every ministry lead.", note: "Placed on l1" });
  assert.equal((p.parse('{"line":"l9","text":"Nothing"}', inputs) as { line: string }).line, "", "an unknown line is not kept");
  assert.equal((p.parse('{"line":"new","text":"A new one."}', inputs) as { line: string }).line, "new");
  const out = JSON.parse(scripted({ system: p.system, user, maxTokens: 400, timeoutMs: 1000 })) as { line?: string; text?: string };
  assert.ok(out.line === "new" || out.line === "l1");
});
