import test from "node:test";
import assert from "node:assert/strict";
import { boldParts, contentOf, countLabel, countOf, countUnit, depthBlocks, kindOf, outlineRows, plainText } from "../../lib/interactions/kinds";
import { fitSize, mediaInput } from "../../lib/interactions/media";
import { applyLiveEvent, submissionRequest } from "../../lib/live/protocol";
import { ownAnswers } from "../../lib/phone/policy";
import { screenType } from "../../lib/tv/policy";
import type { LiveEvent, LiveSnapshot } from "../../lib/live/types";

const id = (n: number) => `57000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("the TV count reads people for one-answer-per-person kinds and answers for text", () => {
  assert.equal(countOf({ total: 23, people: 8 }, "people"), 8);
  assert.equal(countOf({ total: 23, people: 8 }, "answers"), 23);
  // The count badges' spoken label: people alone for one response a person, both where one person sends several.
  assert.equal(countLabel(8, 8, "people", "choice"), "8 answering");
  assert.equal(countLabel(8, 23, "answers", "word_cloud"), "23 answers from 8 people");
  assert.equal(countLabel(1, 1, "answers", "qa"), "1 question from 1 person");
  assert.equal(countUnit(8, "people"), "answering");
  assert.equal(countUnit(1, "answers"), "answer");
  assert.equal(countUnit(23, "answers"), "answers");
  assert.equal(kindOf({ interaction: "wall" })?.counts, "answers", "an old snapshot without a kind still counts answers");
});

test("bold phrases are marked with two stars and nothing else is markup", () => {
  assert.deepEqual(boldParts("Write down the **revelation** and make it plain"), [
    { text: "Write down the ", bold: false }, { text: "revelation", bold: true }, { text: " and make it plain", bold: false }]);
  assert.deepEqual(boldParts("<b>not html</b> * single"), [{ text: "<b>not html</b> * single", bold: false }]);
  assert.equal(plainText("Let's **pray**"), "Let's pray");
});

test("content options default to a headline and keep their fields", () => {
  assert.equal(contentOf({}).screen, "headline");
  assert.equal(contentOf({ screen: "sermon" }).screen, "headline");
  assert.deepEqual(contentOf({ screen: "scripture", reference: "Habakkuk 2:2" }), { screen: "scripture", reference: "Habakkuk 2:2" });
});

test("phone depth reads paragraphs, quotes with sources and read-more sections", () => {
  const blocks = depthBlocks("It was the most named strength.\n\n> The teaching on Sundays is why I stayed.\n- Survey comment, anonymous\n\n## Read more: by age group\nUnder 30s named welcome first.");
  assert.deepEqual(blocks, [
    { kind: "text", text: "It was the most named strength." },
    { kind: "quote", text: "The teaching on Sundays is why I stayed.", source: "Survey comment, anonymous" },
    { kind: "section", title: "Read more: by age group", blocks: [{ kind: "text", text: "Under 30s named welcome first." }] },
  ]);
});

test("the holding outline is the facilitator's own lines, a time first if given", () => {
  assert.deepEqual(outlineRows("9:00 Welcome and prayer\n\n2:45 pm Provisional Vision Outcomes\nLunch"), [
    { time: "9:00", text: "Welcome and prayer" }, { time: "2:45 pm", text: "Provisional Vision Outcomes" }, { time: "", text: "Lunch" }]);
});

test("a structured answer carries a small JSON value, checked again in the database", () => {
  const base = { id: id(1), session: id(2), revision: 0, action: "submit", sentAt: new Date().toISOString() };
  assert.ok(submissionRequest({ ...base, text: "", value: { choice: "a" } }), "a value may stand in for text");
  assert.equal(submissionRequest({ ...base, text: "" }), null, "an empty answer with no value is refused");
  assert.equal(submissionRequest({ ...base, text: "x", value: "a" }), null, "a value is an object");
  assert.equal(submissionRequest({ ...base, text: "x", value: { big: "x".repeat(9000) } }), null, "a value stays small");
});

test("an event that replaces a person's earlier answer removes it in the same version", () => {
  const session = id(10);
  const current = { status: "ok", role: "tv", topic: "t", version: 4, next: null, phone_depth: null, server_time: "", session: null,
    state: { engagement_id: id(0), live_session_id: session, version: 4, tv_content: "session", phones_down: false, burst_ends_at: null, results: { total: 1, people: 1, words: [] } },
    answers: [{ id: id(20), session_id: session, text: "a", answers: [], value: { choice: "a" }, revision: 0 }] } as unknown as LiveSnapshot;
  const event = { state: { ...current.state, version: 5 }, session: null,
    answer: { id: id(21), session_id: session, text: "b", answers: [], value: { choice: "b" }, revision: 0, replaced: [id(20)] } } as unknown as LiveEvent;
  const out = applyLiveEvent(current, event);
  assert.equal(out.kind, "applied");
  assert.deepEqual(out.value.answers.map(a => [a.id, a.value]), [[id(21), { choice: "b" }]]);
});

test("a phone shows only its latest answer for a one-answer-per-person kind", () => {
  const session = id(30), sentAt = new Date().toISOString();
  const answers = [{ id: id(31), session_id: session, text: "a", value: { choice: "a" }, revision: 0, withdrawn: false }];
  const outbox = [{ request: { id: id(32), session, revision: 0, action: "submit" as const, text: "b", value: { choice: "b" }, sentAt }, state: "sending" as const }];
  assert.deepEqual(ownAnswers(session, answers, outbox, true, true).map(a => a.value), [{ choice: "b" }]);
  assert.equal(ownAnswers(session, answers, outbox, true).length, 2, "text kinds keep every answer");
});

test("images are PNG, JPEG or WebP, base64, and fitted to a 2400px long edge", () => {
  assert.ok(mediaInput({ session: id(1), mime: "image/png", width: 10, height: 10, data: "iVBORw0KGgo=" }));
  assert.equal(mediaInput({ session: id(1), mime: "image/gif", width: 10, height: 10, data: "R0lG" }), null);
  assert.equal(mediaInput({ session: id(1), mime: "image/png", width: 10, height: 10, data: "not base64!" }), null);
  assert.deepEqual(fitSize(4800, 3600), { width: 2400, height: 1800 });
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
});

test("a holding screen in the run of show carries the holding texture", () => {
  const frame = (options: Record<string, unknown>) => ({ state: { tv_content: "session" }, session: { interaction: "content", options } }) as unknown as LiveSnapshot;
  assert.equal(screenType(frame({ screen: "holding" })), "holding");
  assert.equal(screenType(frame({ screen: "scripture" })), "content");
});
