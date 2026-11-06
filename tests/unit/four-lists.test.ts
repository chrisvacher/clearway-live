import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { interactionKinds, kindLabels, screenIds, countUnit } from "../../lib/interactions/kinds";
import { agreeBody, canFeedTensions, cardMax, cardsIn, checkCard, columnOf, fourListsOf, groupedLine, limitLine, listKeys, listNames, moreOnPhones, phoneCardsOf, reviewCounts, reviewOf, reviewPress, standing, withAgreement } from "../../lib/interactions/four-lists";
import { aiNotice, isAiKind, type AiStatus } from "../../lib/interactions/ai";
import { aiClient } from "../../lib/ai/client";
import { jobOf, recordedClient, scripted } from "../../lib/ai/fake";
import { aiJobs, prompts, promptVersions, type AiInputs, type FourListsInputs } from "../../lib/ai/prompts";
import { sessionCsv } from "../../lib/export/csv";
import { dropOptions, palette } from "../../lib/run-of-show/builder";

const id = (n: number) => `77000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Case = { name: string; job: "group_four_lists"; inputs: FourListsInputs; reply: string; expect: { together?: string[][]; apart?: string[][]; joins?: string[][]; neverJoins?: string[][]; labelWords?: number } };
const fixtures = JSON.parse(readFileSync(new URL("../fixtures/ai/four-lists.json", import.meta.url), "utf8")) as { names: string[]; cases: Case[] };

test("The kind is registered by name, screen and label", () => {
  assert.ok((interactionKinds as readonly string[]).includes("four_lists"));
  assert.equal(screenIds.four_lists, "INT-11");
  assert.equal(kindLabels.four_lists, "Four Helpful Lists");
  assert.equal(countUnit(1, "answers", "four_lists"), "card");
  assert.equal(countUnit(5, "answers", "four_lists"), "cards");
  assert.ok(isAiKind("four_lists"));
});
test("The four lists are fixed, in order, with the words on the screen", () => {
  assert.deepEqual([...listKeys], ["right", "wrong", "missing", "confused"]);
  assert.deepEqual(listKeys.map(k => listNames[k]), ["What's right?", "What's wrong?", "What's missing?", "What's confused?"]);
  assert.equal(groupedLine, "Grouped from your answers");
});
test("The palette offers the kind by its label and a dropped step starts with AI grouping on", () => {
  const entry = palette([{ kind: "four_lists", label: "Four Helpful Lists", input: true, one_per_person: false, counts: "answers", structured: false, shares_answers: true, spotlight: "id" }]).interactions[0];
  assert.equal(entry.label, "Four Helpful Lists");
  assert.ok(entry.blurb.length > 0 && entry.minutes > 0);
  assert.deepEqual(dropOptions.four_lists, { ai: true });
});

test("The TV reads cards, lists and counts, and drops anything malformed", () => {
  const r = fourListsOf({ total: 4, people: 3, ai: true, columns: { right: { cards: 2, units: 1 }, wrong: { cards: 9, units: 9 }, missing: { cards: 0, units: 0 }, confused: { cards: 1, units: 1 } },
    cards: [{ id: id(1), col: "right", text: "  Warm   welcome ", agree: 3, held: 2, ai: true, pinned: false, ids: [id(1), id(2), "nope"], order: 1 },
      { id: id(3), col: "wrong", text: "Parking", agree: 0, held: 1, ai: false, pinned: false, ids: [id(3)], order: 2 },
      { id: "bad", col: "right", text: "x" }, { id: id(4), col: "elsewhere", text: "x" }, { id: id(5), col: "right", text: "" }] });
  assert.equal(r.cards.length, 2);
  assert.equal(r.cards[0].text, "Warm welcome");
  assert.deepEqual(r.cards[0].ids, [id(1), id(2)]);
  assert.equal(cardsIn(r, "right").length, 1);
  assert.equal(r.columns.wrong.units, 9);
  assert.equal(fourListsOf(null).cards.length, 0);
  assert.equal(fourListsOf(undefined).columns.right.units, 0);
});
test("A list that holds more than the TV shows says so, in plain words", () => {
  assert.equal(moreOnPhones({ cards: 9, units: 9 }, 4), "+ 5 more on phones");
  assert.equal(moreOnPhones({ cards: 3, units: 3 }, 3), "");
});

test("A card is up to 200 characters and flagged beyond that", () => {
  assert.equal(cardMax, 200);
  assert.deepEqual(checkCard("Parking", 200), { ok: true, count: 7, message: "" });
  assert.equal(checkCard("   ", 200).ok, false);
  const over = checkCard("a".repeat(201), 200);
  assert.equal(over.ok, false);
  assert.match(over.message, /200 characters/);
  assert.equal(checkCard("a".repeat(200), 200).ok, true);
  assert.match(limitLine(12, 12), /all 12 of your cards/);
  assert.match(limitLine(3, 12), /3 of 12 cards added/);
});
test("An agreement body needs a card and a state, and taking it back is a state", () => {
  assert.deepEqual(agreeBody({ card: id(1).toUpperCase(), on: false }), { card: id(1), on: false });
  assert.equal(agreeBody({ card: id(1) }), null);
  assert.equal(agreeBody({ card: "x", on: true }), null);
  const cards = phoneCardsOf({ cards: [{ id: id(1), col: "right", text: "A", agree: 2, mine: false, own: false }, { id: id(2), col: "wrong", text: "B", agree: 0, mine: true, own: true }] });
  assert.equal(cards.length, 2);
  const on = withAgreement(cards, id(1), true);
  assert.equal(on[0].agree, 3);
  assert.equal(on[0].mine, true);
  assert.equal(withAgreement(on, id(1), true)[0].agree, 3, "agreeing twice counts once");
  assert.equal(withAgreement(on, id(1), false)[0].agree, 2, "undo puts it back");
  assert.equal(withAgreement(cards, id(2), false)[0 + 1].agree, 0, "never below zero");
});
test("A stored answer's list comes from its value", () => {
  assert.equal(columnOf({ column: "missing" }), "missing");
  assert.equal(columnOf({ column: "other" }), null);
  assert.equal(columnOf(null), null);
});

test("The review reads cards and counts what feeds step 4, never counting set aside or merged cards", () => {
  const card = (n: number, col: string, extra: Record<string, unknown> = {}) => ({ id: id(n), col, text: `Card ${n}`, original: `Card ${n}`, edited: false, hidden: false, kept: true, merged_into: null, agree: n, heard: false, tensions: false, members: 0, at: "2026-11-05T10:00:00Z", ...extra });
  const review = reviewOf({ status: "ok", session: id(90), title: "Four Helpful Lists", ai: true, took_part: 7,
    cards: [card(1, "right", { heard: true }), card(2, "wrong", { heard: true, tensions: true }), card(3, "wrong", { kept: false, heard: true }), card(4, "wrong", { merged_into: id(2) }), { id: "bad" }] })!;
  assert.equal(review.cards.length, 4);
  assert.equal(standing(review.cards).length, 2);
  assert.deepEqual(reviewCounts(review.cards), { heard: 2, tensions: 1, kept: 2, aside: 1 });
  assert.equal(reviewOf({ status: "denied" }), null);
  assert.equal(canFeedTensions("wrong"), true);
  assert.equal(canFeedTensions("confused"), true);
  assert.equal(canFeedTensions("right"), false);
  assert.equal(canFeedTensions("missing"), false);
});
test("A review press is checked before it is sent", () => {
  const session = id(90);
  assert.deepEqual(reviewPress({ session, action: "edit", card: id(1), text: "  Clearer   words " }), { session, action: "edit", p: { card: id(1), text: "Clearer words" } });
  assert.equal(reviewPress({ session, action: "edit", card: id(1), text: "a".repeat(201) }), null);
  assert.equal(reviewPress({ session, action: "edit", card: id(1), text: "  " }), null);
  assert.deepEqual(reviewPress({ session, action: "keep", card: id(1), kept: false })?.p, { card: id(1), kept: false });
  assert.equal(reviewPress({ session, action: "keep", card: id(1) }), null);
  assert.deepEqual(reviewPress({ session, action: "merge", cards: [id(1), id(2)] })?.p, { cards: [id(1), id(2)] });
  assert.equal(reviewPress({ session, action: "merge", cards: [id(1)] }), null);
  assert.deepEqual(reviewPress({ session, action: "mark", card: id(1), heard: true, tensions: false })?.p, { card: id(1), heard: true, tensions: false });
  assert.equal(reviewPress({ session, action: "mark", card: id(1), heard: true }), null);
  assert.equal(reviewPress({ session, action: "delete", card: id(1) }), null);
});

// ---------- The AI grouping prompt ----------
const columnOfRef = (inputs: FourListsInputs, ref: string) => inputs.answers.find(a => a.ref === ref)?.column ?? inputs.groups.find(g => g.ref === ref)?.column ?? null;
function check(c: Case, reply: string) {
  const out = prompts.group_four_lists.parse(reply, c.inputs) as { groups: { group: string; label?: string; answers: string[] }[] };
  const all = out.groups.flatMap(g => g.answers);
  assert.equal(new Set(all).size, all.length, `${c.name}: each card in one group`);
  for (const ref of all) assert.ok(c.inputs.answers.some(a => a.ref === ref), `${c.name}: never invents a card (${ref})`);
  for (const g of out.groups) {
    const lists = new Set(g.answers.map(r => columnOfRef(c.inputs, r)));
    const home = columnOfRef(c.inputs, g.group);
    if (home) lists.add(home);
    assert.equal(lists.size, 1, `${c.name}: group ${g.group} stays inside one list`);
    if (g.label !== undefined) {
      assert.ok(g.label.trim().split(/\s+/).length <= (c.expect.labelWords ?? 4), `${c.name}: a short label (${g.label})`);
      for (const name of fixtures.names) assert.ok(!g.label.includes(name), `${c.name}: labels never name people`);
    }
  }
  const sets = out.groups.map(g => g.answers);
  for (const [a, b] of c.expect.together ?? []) assert.ok(sets.some(s => s.includes(a) && s.includes(b)), `${c.name}: groups ${a} with ${b}`);
  for (const [a, b] of c.expect.apart ?? []) assert.ok(!sets.some(s => s.includes(a) && s.includes(b)), `${c.name}: keeps ${a} apart from ${b}`);
  for (const [card, group] of c.expect.joins ?? []) assert.ok(out.groups.some(g => g.group === group && g.answers.includes(card)), `${c.name}: ${card} joins ${group}`);
  for (const [card, group] of c.expect.neverJoins ?? []) {
    assert.ok(c.inputs.groups.find(g => g.ref === group)?.pinned, `${c.name}: the fixture pins ${group}`);
    assert.ok(!out.groups.some(g => g.group === group && g.answers.includes(card)), `${c.name}: ${card} never joins pinned ${group}`);
  }
}
test("The prompt is registered, versioned and asks for groups inside one list", () => {
  assert.ok(aiJobs.includes("group_four_lists"));
  assert.equal(promptVersions.group_four_lists, "group-four-lists@1");
  const p = prompts.group_four_lists;
  assert.match(p.system, /Never put cards from two lists in one group/);
  assert.match(p.system, /never a person's name/);
  assert.match(p.system, /Never add to a pinned group/);
  assert.ok(!/[\u2013\u2014]/.test(p.system), "no em or en dashes");
  const user = JSON.parse(p.user(fixtures.cases[1].inputs as AiInputs));
  assert.equal(user.cards[0].ref, "a1");
  assert.equal(user.cards[0].list, "wrong");
  assert.equal(user.groups[1].pinned, true);
  assert.ok(!("id" in user.cards[0]), "the model sees refs, not ids");
});
test("Recorded replies behave as the prompt promises (the fake client)", async () => {
  const fake = recordedClient(fixtures.cases.map(c => ({ job: c.job, user: prompts[c.job].user(c.inputs as AiInputs), reply: c.reply })));
  for (const c of fixtures.cases) {
    const p = prompts[c.job];
    const reply = await fake.complete({ system: p.system, user: p.user(c.inputs as AiInputs), maxTokens: p.maxTokens, timeoutMs: 1000 }, { model: "x", timeoutMs: 1000 } as never);
    assert.equal(jobOf({ system: p.system }), "group_four_lists");
    check(c, reply.text);
  }
  assert.equal(fake.calls.length, fixtures.cases.length);
});
test("A reply that crosses lists is caught by the check that the database repeats", () => {
  const c = fixtures.cases[0];
  const crossing = JSON.stringify({ groups: [{ group: "n1", label: "Everything about talks", answers: ["a1", "a6"] }] });
  assert.throws(() => check(c, crossing), /stays inside one list/);
});
test("The scripted stand-in groups inside lists, leaves pinned groups alone and never makes a group of one", () => {
  const c = fixtures.cases[0], p = prompts.group_four_lists;
  const out = JSON.parse(scripted({ system: p.system, user: p.user(c.inputs as AiInputs), maxTokens: p.maxTokens, timeoutMs: 1000 })) as { groups: { group: string; label?: string; answers: string[] }[] };
  assert.ok(out.groups.length >= 2, "groups what shares words");
  for (const g of out.groups) {
    assert.equal(new Set(g.answers.map(r => columnOfRef(c.inputs, r))).size, 1, "one list per group");
    if (g.label !== undefined) assert.ok(g.answers.length >= 2, "a new group holds at least two cards");
  }
  const second = fixtures.cases[1];
  const again = JSON.parse(scripted({ system: p.system, user: p.user(second.inputs as AiInputs), maxTokens: p.maxTokens, timeoutMs: 1000 })) as { groups: { group: string; answers: string[] }[] };
  assert.ok(!again.groups.some(g => g.group === "g2"), "never adds to a pinned group");
  check(c, JSON.stringify(out));
});
test("With no key there is no AI, so the lists stand as cards", () => {
  assert.equal(aiClient({}), null);
  const status = { status: "ok", version: 1, engagement_ai: true, cost: { usd: 0, runs: 0, input_tokens: 0, output_tokens: 0 },
    session: { id: id(1), title: "Lists", interaction: "four_lists", live: true, ai: false, option: false, override: false, summary_available: false, summary_shown: false } } as AiStatus;
  assert.match(aiNotice(status)!.text, /cards on their own/);
});

test("The export lays the lists out as a column and a card", () => {
  const csv = sessionCsv({ session: { id: id(1), title: "Lists", part: "Day 1", mode: "live", interaction: "four_lists", label: "Four Helpful Lists", prompt: "", options: {} }, named: false, timezone: "America/Toronto",
    rows: [{ id: id(2), at: "2026-11-05T14:00:00Z", text: "Parking", value: { column: "wrong" }, hidden: false, test: false }] } as never);
  assert.match(csv, /List,Card/);
  assert.match(csv, /What's wrong\?,Parking/);
});
