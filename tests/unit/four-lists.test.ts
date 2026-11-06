import assert from "node:assert/strict";
import { test } from "node:test";
import { agreeBody, agreeOptions, agreeState, cardLabel, cardsOf, checkCard, columnLabels, columnTotals, foldedInto, fourColumns, fourControlBody, moreLine, nextAgree, outboxStatus, reviewColumns, topOf,
  type FourCard, type ReviewCard } from "../../lib/interactions/four-lists";
import { fourListsCsv } from "../../lib/export/four-lists-csv";
import { kindLabels, screenIds, countUnit } from "../../lib/interactions/kinds";
import { sessionCsv, type SessionExport } from "../../lib/export/csv";
import { parts } from "../../lib/run-of-show/types";

const id = (n: number) => `88800000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const card = (n: number, column: FourCard["column"], text: string, agree = 0, extra: Partial<FourCard> = {}): FourCard =>
  ({ id: id(n), column, text, agree, folded: 0, ids: [id(n)], rank: n, at: n, ...extra });

test("INT-11: the kind is registered under its screen id, with four headings in the facilitator's words", () => {
  assert.equal(screenIds.four_lists, "INT-11");
  assert.equal(kindLabels.four_lists, "Four Helpful Lists");
  assert.deepEqual(fourColumns, ["right", "wrong", "missing", "confused"]);
  assert.deepEqual(Object.values(columnLabels), ["What’s right?", "What’s wrong?", "What’s missing?", "What’s confused?"]);
  assert.equal(countUnit(2, "answers", "four_lists"), "cards");
  assert.equal(parts[0], "Discover", "Discover runs ahead of the Pre-call");
});

test("The TV reads the server's cards and totals, and ignores anything that is not a card", () => {
  const good = card(1, "right", "Preaching is strong", 3);
  assert.deepEqual(cardsOf({ cards: [good, { id: 1 }, null, { ...good, column: "other" }, { ...good, id: id(2), rank: "x" }] }), [good]);
  assert.deepEqual(cardsOf(null), []);
  assert.deepEqual(columnTotals({ columns: { right: 5, missing: "2" } }), { right: 5, wrong: 0, missing: 2, confused: 0 });
});

test("Each list shows its top four cards in the server's rank, three when the cards are long, with a count of the rest", () => {
  const cards = [1, 2, 3, 4, 5, 6].map(n => card(n, "wrong", `Card ${n}`, 6 - n));
  const mixed = [...cards, card(7, "right", "Preaching is strong", 2)];
  const top = topOf(mixed, "wrong", 6);
  assert.deepEqual(top.shown.map(c => c.id), [id(1), id(2), id(3), id(4)]);
  assert.equal(top.rest, 2);
  assert.equal(moreLine(top.rest), "+ 2 more on phones");
  assert.equal(moreLine(0), "");
  // The server sends only its top twelve; the column total says how many wait beyond them.
  assert.equal(topOf(cards.slice(0, 4), "wrong", 30).rest, 26);
  const long = [card(1, "missing", "x".repeat(81)), card(2, "missing", "b"), card(3, "missing", "c"), card(4, "missing", "d")];
  assert.equal(topOf(long, "missing", 4).shown.length, 3, "a long card steps the list down to three");
  assert.equal(topOf([card(1, "right", "Hidden", 1, { hidden: true })], "right").shown.length, 0, "a hidden card never shows");
});

test("A folded card glides into the card whose ids now hold it, and the label says what the card stands for", () => {
  const survivor = card(1, "missing", "A path into groups", 4, { folded: 2, ai: true, ids: [id(1), id(2), id(3)] });
  assert.equal(foldedInto(id(2), [survivor]), id(1));
  assert.equal(foldedInto(id(1), [survivor]), null);
  assert.match(cardLabel(survivor), /A path into groups\. 4 people agree, combined by AI, 3 cards/);
  assert.match(cardLabel(card(2, "right", "x", 1)), /1 person agrees$/);
});

test("Cards offered to agree with exclude the person's own and anything folded under theirs", () => {
  const cards = [card(1, "right", "Mine", 5), card(2, "right", "Folded with mine", 3, { ids: [id(2), id(9)] }), card(3, "right", "Theirs", 2), card(4, "wrong", "Other list", 9),
    card(5, "right", "Also theirs", 1), card(6, "right", "More", 1), card(7, "right", "Even more", 1)];
  const offered = agreeOptions(cards, "right", new Set([id(1), id(9)]));
  assert.deepEqual(offered.map(c => c.id), [id(3), id(5), id(6), id(7)], "every standing card, the strongest first, none left out");
});

test("An agree is one row per card: the same id and the next revision, on then off, the newest revision winning", () => {
  const first = nextAgree(undefined, () => id(50));
  assert.deepEqual(first, { id: id(50), revision: 0, on: true });
  const settled = { id: id(50), card_id: id(1), agreed: true, revision: 0 };
  assert.deepEqual(nextAgree(settled, () => "unused"), { id: id(50), revision: 1, on: false });
  const state = agreeState([settled], [{ state: "saved", request: { id: id(50), session: id(9), revision: 1, action: "change", text: "", value: { four: "agree", card: id(1), on: false }, sentAt: "2026-11-05T10:00:00Z" } }]);
  assert.equal(state.get(id(1))!.agreed, false);
  assert.equal(state.get(id(1))!.pending, true, "still waiting on this phone");
  assert.equal(agreeState([settled], []).get(id(1))!.pending, false);
  // A request that is not an agree never changes the agrees.
  assert.equal(agreeState([], [{ state: "saved", request: { id: id(51), session: id(9), revision: 0, action: "submit", text: "A card", value: { column: "right" }, sentAt: "2026-11-05T10:00:00Z" } }]).size, 0);
});

test("Request bodies are checked again by the database", () => {
  const ok = { id: id(1), card: id(2), revision: 0, on: true, sentAt: "2026-11-05T10:00:00Z" };
  assert.deepEqual(agreeBody(ok), { ...ok, queuedAt: null, uncertaintyMs: 0 });
  for (const bad of [null, [], {}, { ...ok, id: "x" }, { ...ok, card: 3 }, { ...ok, on: "yes" }, { ...ok, revision: -1 }, { ...ok, revision: 1.5 }, { ...ok, sentAt: "later" }, { ...ok, uncertaintyMs: 70000 }])
    assert.equal(agreeBody(bad), null);
  assert.deepEqual(fourControlBody({ id: id(1), action: "pin", card: id(2) }), { id: id(1), action: "pin", p: { card: id(2) } });
  assert.deepEqual(fourControlBody({ id: id(1), action: "undo_fold", merge: id(3) }), { id: id(1), action: "undo_fold", p: { merge: id(3) } });
  for (const bad of [null, { id: id(1), action: "spotlight", card: id(2) }, { id: id(1), action: "pin" }, { id: id(1), action: "undo_fold", card: id(2) }, { action: "hide", card: id(2) }])
    assert.equal(fourControlBody(bad), null);
  assert.equal(outboxStatus("own"), "invalid_answer");
  assert.equal(outboxStatus("missing"), "invalid_session");
  assert.equal(outboxStatus("accepted"), "accepted");
});

test("The phone holds Send for a card the database would refuse, and says why", () => {
  assert.equal(checkCard("Preaching is strong").ok, true);
  assert.equal(checkCard("").ok, false);
  assert.equal(checkCard("   ").ok, false);
  const over = checkCard("x".repeat(150), 140);
  assert.equal(over.ok, false); assert.match(over.message, /10 characters over/);
  const words = checkCard(Array.from({ length: 31 }, () => "a").join(" "), 140, 30);
  assert.equal(words.ok, false); assert.match(words.message, /1 word over/);
  assert.equal(checkCard("y".repeat(300), 500).ok, false, "never past 280 characters");
});

const review = (cards: ReviewCard[]) => ({ status: "ok" as const, engagement: { id: id(100), title: "Riverside" }, sessions: [{ id: id(101), title: "Four Helpful Lists", part: "Discover", state: "closed", people: 7, cards }] });
test("SET-05: the review lays every card out by list, strongest first, and the CSV follows the existing export pattern", () => {
  const cards: ReviewCard[] = [
    { ...card(1, "right", "Preaching is strong", 5), members: [] },
    { ...card(2, "missing", "A path into groups", 4, { folded: 1, ai: true, ids: [id(2), id(3)] }), members: [{ id: id(3), text: "A clear way to join a group", merge: id(30), by: "ai" }] },
    { ...card(4, "right", "=cmd|calc", 2, { pinned: true }), members: [] },
    { ...card(5, "wrong", "Hidden one", 0, { hidden: true }), members: [] },
  ];
  const columns = reviewColumns(cards);
  assert.deepEqual(columns.map(c => c.cards.length), [2, 0, 1, 0]);
  assert.equal(columns[1].hidden.length, 1);
  const csv = fourListsCsv(review(cards)), lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.ok(csv.startsWith("﻿"), "UTF-8 with a byte order mark, as the other exports");
  assert.equal(lines[0], "Step,List,Card,People agreeing,Folded into,Folded by,Pinned,Hidden from the TV");
  assert.equal(lines[1], "Four Helpful Lists,What’s right?,Preaching is strong,5,,,,");
  assert.equal(lines[2], "Four Helpful Lists,What’s right?,'=cmd|calc,2,,,Yes,", "a formula typed on a phone is kept as text");
  assert.equal(lines[3], "Four Helpful Lists,What’s wrong?,Hidden one,,,,,Yes", "the lists in order: right, wrong, missing, confused");
  assert.equal(lines[4], "Four Helpful Lists,What’s missing?,A path into groups,4,,,,");
  assert.equal(lines[5], "Four Helpful Lists,What’s missing?,A clear way to join a group,,A path into groups,AI,,");
  assert.ok(!/@|person|name/i.test(csv.replace("Four Helpful Lists", "")), "no one is named");
});

test("The session export carries the list beside each card", () => {
  const data: SessionExport = { status: "ok", named: false, timezone: "America/Toronto", session: { id: id(101), title: "Four Helpful Lists", part: "Discover", mode: "live", interaction: "four_lists", label: "Four Helpful Lists", prompt: "", options: {} },
    rows: [{ id: id(1), at: "2026-11-05T15:00:00Z", text: "Preaching is strong", value: { column: "right" }, hidden: false, test: false }] };
  const lines = sessionCsv(data).replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines[0], "Answered at,List,Card,Hidden from the TV,Test answer");
  assert.match(lines[1], /^2026-11-05 10:00:00,What’s right\?,Preaching is strong,,$/);
});
