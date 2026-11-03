import assert from "node:assert/strict";
import { test } from "node:test";
import { askBody, askedBy, checkQuestion, foldedInto, isAsk, isVote, moreLine, nextVote, outboxStatus, qaControlBody, qaMessage, questionsOf, topQuestions, voteBody, voteState, type QaQuestion } from "../../lib/interactions/qa";
import { countUnit } from "../../lib/interactions/kinds";
import { settledReason } from "../../lib/phone/policy";
import type { OutboxEntry } from "../../lib/phone/types";
import { applyLiveEvent } from "../../lib/live/protocol";
import type { LiveEvent, LiveSnapshot } from "../../lib/live/types";

const id = (n: number) => `74000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const q = (n: number, rank: number | undefined, extra: Partial<QaQuestion> = {}): QaQuestion => ({ id: id(n), text: `Question ${n}`, askers: 1, votes: 0, people: 1, score: 2, rank, folded: 0,
  ids: [id(n)], answered: false, edited: false, at: n, ...extra });
const sent = "2026-11-03T15:00:00.000Z";

test("Empty: no questions, nothing on the TV, no more line", () => {
  assert.deepEqual(questionsOf({ total: 0, people: 0, words: [] }), []);
  assert.deepEqual(topQuestions([]), { shown: [], rest: 0 });
  assert.equal(moreLine(0), "");
});

test("First item and typical: the top three by the server's rank, the rest on phones", () => {
  assert.deepEqual(topQuestions([q(1, 1)]).shown.map(x => x.id), [id(1)]);
  const list = [q(3, 3), q(1, 1), q(5, 5), q(2, 2), q(4, 4), q(9, undefined, { answered: true })];
  const top = topQuestions(list);
  assert.deepEqual(top.shown.map(x => x.id), [id(1), id(2), id(3)], "in rank order, whatever order they arrive in");
  assert.equal(top.rest, 2, "answered questions leave the count");
  assert.equal(moreLine(top.rest), "+ 2 more on your phones");
});

test("Crowded, 50 phones: 29 questions keep the top three and an honest count", () => {
  const list = Array.from({ length: 29 }, (_, i) => q(i + 1, i + 1));
  const top = topQuestions(list);
  assert.equal(top.shown.length, 3); assert.equal(top.rest, 26);
  assert.equal(moreLine(top.rest), "+ 26 more on your phones");
  assert.equal(countUnit(29, "answers", "qa"), "questions", "the TV counts questions");
  assert.equal(countUnit(1, "answers", "qa"), "question");
  assert.equal(countUnit(2, "answers", "word_cloud"), "answers", "other kinds keep their words");
  assert.equal(countUnit(8, "people"), "answering");
});

test("Folding: asked by 3, and a folded question glides into its survivor", () => {
  const survivor = q(1, 1, { askers: 3, folded: 2, ids: [id(1), id(7), id(8)] });
  assert.equal(askedBy(survivor), "asked by 3");
  assert.equal(askedBy(q(2, 2)), "", "a single asker says nothing");
  assert.equal(foldedInto(id(7), [survivor, q(2, 2)]), id(1));
  assert.equal(foldedInto(id(9), [survivor]), null, "an unknown id folded nowhere");
});

test("Very long text: the phone holds Ask past 200 characters and says by how much", () => {
  const long = "When the survey says people want more connection beyond Sunday, does that mean more small groups, more midweek events, or something we haven't thought of yet, like serving together? And who decides?";
  assert.equal(checkQuestion(long).ok, true, `${long.length} characters is within 200`);
  const over = checkQuestion("a".repeat(205));
  assert.equal(over.ok, false); assert.equal(over.message, "5 characters over. Keep it to 200."); assert.equal(over.count, "205 / 200");
  assert.equal(checkQuestion("   ").ok, false, "an empty question is held");
  assert.equal(checkQuestion("Why?", 280).count, "4 / 280");
  assert.doesNotMatch(over.message, /[–—]/);
});

test("Votes: one per question, toggled with the same id and the next revision", () => {
  const first = nextVote(id(1), undefined, () => id(50));
  assert.deepEqual(first, { id: id(50), revision: 0, on: true }, "a first press makes a new vote");
  assert.deepEqual(nextVote(id(1), { id: id(50), question_id: id(1), voted: true, revision: 0 }, () => id(51)), { id: id(50), revision: 1, on: false }, "then toggles it off");
  assert.deepEqual(nextVote(id(1), { id: id(50), question_id: id(1), voted: false, revision: 1 }, () => id(51)), { id: id(50), revision: 2, on: true }, "and on again");
});

test("Offline and queued: a vote waiting on the phone shows as on and pending, the server's after", () => {
  const vote = (rev: number, on: boolean, state: OutboxEntry["state"] = "saved"): OutboxEntry => ({ state, request: { id: id(50), session: id(9), revision: rev, action: rev ? "change" : "submit", text: "", value: { qa: "vote", question: id(1), on }, sentAt: sent, queuedAt: sent } });
  assert.equal(voteState([], [vote(0, true)]).get(id(1))?.pending, true);
  assert.equal(voteState([], [vote(0, true)]).get(id(1))?.voted, true);
  const server = [{ id: id(50), question_id: id(1), voted: true, revision: 0 }];
  assert.deepEqual(voteState(server, []).get(id(1)), { ...server[0], pending: false, failed: false });
  assert.equal(voteState(server, [vote(1, false)]).get(id(1))?.voted, false, "a newer press on the phone wins");
  assert.equal(voteState(server, [vote(0, true, "sending")]).get(id(1))?.pending, false, "a resend of what the server already holds shows as counted");
  assert.equal(voteState(server, [vote(1, false, "failed")]).get(id(1))?.failed, true, "a refused press is marked, then goes back");
  const ask: OutboxEntry = { state: "saved", request: { id: id(60), session: id(9), revision: 0, action: "submit", text: "Will we talk about the building?", value: { qa: "ask" }, sentAt: sent } };
  assert.ok(isAsk(ask.request) && !isVote(ask.request));
  assert.equal(voteState([], [ask]).size, 0, "asks are not votes");
});

test("Request bodies are checked before the database checks them again", () => {
  assert.ok(voteBody({ id: id(1), question: id(2), revision: 0, on: true, sentAt: sent }));
  assert.equal(voteBody({ id: id(1), question: id(2), revision: -1, on: true, sentAt: sent }), null);
  assert.equal(voteBody({ id: id(1), question: "nope", revision: 0, on: true, sentAt: sent }), null);
  assert.equal(voteBody({ id: id(1), question: id(2), revision: 0, on: "yes", sentAt: sent }), null);
  assert.equal(voteBody({ id: id(1), question: id(2), revision: 0, on: true, sentAt: sent, uncertaintyMs: 90000 }), null);
  assert.ok(askBody({ id: id(1), text: "Is the building really the main issue?", sentAt: sent, queuedAt: sent }));
  assert.equal(askBody({ id: id(1), text: 3, sentAt: sent }), null);
  assert.equal(askBody({ id: id(1), text: "x".repeat(1405), sentAt: sent }), null);
  assert.deepEqual(qaControlBody({ id: id(1), action: "spotlight", question: id(2) }), { id: id(1), action: "spotlight", p: { question: id(2) } });
  assert.deepEqual(qaControlBody({ id: id(1), action: "clear_spotlight" }), { id: id(1), action: "clear_spotlight", p: {} });
  assert.deepEqual(qaControlBody({ id: id(1), action: "undo_fold", merge: id(3) }), { id: id(1), action: "undo_fold", p: { merge: id(3) } });
  assert.deepEqual(qaControlBody({ id: id(1), action: "edit", question: id(2), text: "Better words?" })?.p, { question: id(2), text: "Better words?" });
  assert.equal(qaControlBody({ id: id(1), action: "edit", question: id(2), text: "  " }), null);
  assert.equal(qaControlBody({ id: id(1), action: "merge_everything", question: id(2) }), null);
  assert.equal(qaControlBody({ id: id(1), action: "answered" }), null);
});

test("Refused votes settle on the phone instead of retrying forever", () => {
  for (const status of ["own", "missing", "closed", "conflict", "invalid_request"]) assert.notEqual(settledReason(outboxStatus(status)), null, status);
  assert.equal(settledReason(outboxStatus("accepted")), "");
  assert.equal(settledReason(outboxStatus("duplicate")), "");
  for (const status of ["missing", "hidden", "invalid_state", "filtered", "invalid_request", "closed", "denied", "unavailable"]) assert.doesNotMatch(qaMessage(status), /[–—]/);
  assert.equal(qaMessage("ok"), "");
});

test("Spotlight over any session and the pool ride every event, and an older server's event keeps them", () => {
  const state = (version: number) => ({ engagement_id: id(100), live_session_id: id(9), version, tv_content: "session", phones_down: false, burst_ends_at: null, results: { total: 0, people: 0, words: [] } });
  const spot = { id: id(1), session_id: id(8), text: "Is the building really the main issue?", people: 3, askers: 1, ai: false };
  const frame = { status: "ok", role: "tv", topic: "t", version: 1, answers: [], next: null, phone_depth: null, server_time: sent, state: state(1), session: null, qa: { pool: null, spotlight: null } } as unknown as LiveSnapshot;
  const on = applyLiveEvent(frame, { state: state(2), session: null, qa: { pool: null, spotlight: spot } } as unknown as LiveEvent);
  assert.equal(on.kind, "applied"); assert.deepEqual(on.value.qa?.spotlight, spot, "the spotlit question arrives with the event");
  const old = applyLiveEvent(on.value, { state: state(3), session: null } as unknown as LiveEvent);
  assert.deepEqual(old.value.qa?.spotlight, spot, "an event without qa keeps what is on screen");
  const off = applyLiveEvent(old.value, { state: state(4), session: null, qa: { pool: null, spotlight: null } } as unknown as LiveEvent);
  assert.equal(off.value.qa?.spotlight, null, "clearing it clears it");
});
