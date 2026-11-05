import assert from "node:assert/strict";
import { canClearTests, testAnswersLabel } from "../../lib/run-of-show/self-paced";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { nextBoundary, partOpen, recheckDelay, rehearsalBody, rehearsalMessage, requestedStep, selfPacedLink, selfPacedState, windowLabel } from "../../lib/run-of-show/self-paced";
import { allSessionsCsv, csvCell, csvName, localStamp, sessionCsv, type ExportRow, type SessionExport } from "../../lib/export/csv";
import { recapCount, recapFrame, recapKey, type RecapEntry } from "../../lib/export/recap";
import { invitationMessages } from "../../lib/setup/invitation";

const id = (n: number) => `6a000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (iso: string) => Date.parse(iso);
const window = { mode: "self_paced", state: "ready", opens_at: "2026-11-10T14:00:00Z", closes_at: "2026-11-12T02:00:00Z" };

test("Self-paced sessions open and close on their times, worked out from the clock", () => {
  assert.equal(selfPacedState(window, at("2026-11-10T13:59:59Z")), "ready", "before it opens");
  assert.equal(selfPacedState(window, at("2026-11-10T14:00:00Z")), "open", "open from its open time");
  assert.equal(selfPacedState(window, at("2026-11-12T01:59:59Z")), "open");
  assert.equal(selfPacedState(window, at("2026-11-12T02:00:00Z")), "closed", "closed from its close time");
  assert.equal(selfPacedState({ ...window, state: "draft" }, at("2026-11-11T00:00:00Z")), "draft", "a draft never opens");
  assert.equal(selfPacedState({ mode: "live", state: "open" }, at("2026-11-11T00:00:00Z")), "open", "a live session keeps its own state");
});

test("The next boundary: when a screen should read again", () => {
  assert.equal(nextBoundary([window], at("2026-11-09T00:00:00Z")), at(window.opens_at));
  assert.equal(nextBoundary([window], at("2026-11-11T00:00:00Z")), at(window.closes_at));
  assert.equal(nextBoundary([window], at("2026-11-13T00:00:00Z")), null);
  assert.equal(nextBoundary([{ ...window, state: "draft" }], at("2026-11-09T00:00:00Z")), null, "drafts never open");
});

test("Window labels, in the church's time zone, sentence case, no dashes", () => {
  const zone = "America/Toronto";
  const labels = [windowLabel(window, zone, at("2026-11-09T00:00:00Z")), windowLabel(window, zone, at("2026-11-11T00:00:00Z")), windowLabel(window, zone, at("2026-11-13T00:00:00Z")),
    windowLabel({ ...window, state: "draft" }, zone, at("2026-11-11T00:00:00Z"))];
  assert.match(labels[0], /^Opens Tue, Nov\.? 10, 9:00/);
  assert.match(labels[1], /^Open until Wed, Nov\.? 11, 9:00/);
  assert.match(labels[2], /^Closed /);
  assert.match(labels[3], /^Draft\. Opens /);
  for (const label of labels) assert.doesNotMatch(label, /[–—]/);
  assert.equal(windowLabel({ state: "ready" }, zone, 0), "", "no times, no label");
});

test("The invite email links to each self-paced session, with the person's email and the step", () => {
  const link = new URL(selfPacedLink("https://live.clearway.co", id(1), id(2), "ann@example.org"));
  assert.equal(link.pathname, `/room/${id(1)}`);
  assert.equal(link.searchParams.get("email"), "ann@example.org");
  assert.equal(link.searchParams.get("step"), id(2));
  assert.equal(requestedStep(link.search), id(2), "the room page opens that step");
  assert.equal(requestedStep("?step=nope"), null, "only a real id");
  assert.equal(requestedStep(""), null);
  const snapshot = { title: "Wayfinding", church: "Riverside", timezone: "America/Toronto", pre_call_at: null, retreat_start_date: null, retreat_end_date: null, consensus: "We decide together.",
    people: [{ id: "a", name: "Ann", email: "ann@example.org" }, { id: "b", name: "Ben", email: "ben@example.org" }] };
  const [ann, ben] = invitationMessages(id(1), snapshot, "https://live.clearway.co", [{ id: id(2), title: "Celebrations before the pre-call", ...window }]);
  assert.match(ann.text, /Before we meet\nCelebrations before the pre-call: open from .+ until .+ \(America\/Toronto\)\n/);
  assert.ok(ann.text.includes(`step=${id(2)}`) && ann.text.includes("email=ann%40example.org"), "Ann's own link");
  assert.ok(ben.text.includes("email=ben%40example.org&step=") && !ben.text.includes("ann%40"), "Ben's own link, never Ann's");
  assert.doesNotMatch(ann.text, /[–—]/, "no em or en dashes");
  const [plain] = invitationMessages(id(1), snapshot, "https://live.clearway.co");
  assert.ok(!plain.text.includes("Before we meet"), "no self-paced sessions, no section");
});

test("Rehearsal presses and their messages", () => {
  assert.deepEqual(rehearsalBody({ id: id(3), action: "clear" }), { id: id(3), action: "clear" });
  assert.equal(rehearsalBody({ id: id(3), action: "wipe" }), null);
  assert.equal(rehearsalBody({ id: "x", action: "start" }), null);
  assert.equal(rehearsalBody(null), null);
  assert.equal(rehearsalMessage({ status: "ok", answers: 5, sessions: 2 }), "Cleared 5 test answers and set 2 steps back to Ready.");
  assert.equal(rehearsalMessage({ status: "ok", answers: 1, sessions: 0 }), "Cleared 1 test answer.");
  assert.equal(rehearsalMessage({ status: "ok" }), "", "start and end say nothing");
  assert.match(rehearsalMessage({ status: "live", title: "Celebration" }), /^Celebration is live\. Choose Nothing live first\./);
  for (const s of ["live", "closed", "denied", "unavailable"]) assert.doesNotMatch(rehearsalMessage({ status: s }), /[–—]/);
});

// ---------- CSV ----------
const row = (n: number, extra: Partial<ExportRow> = {}): ExportRow => ({ id: id(n), at: "2026-11-03T14:05:09Z", text: `Answer ${n}`, hidden: false, test: false, ...extra });
const data = (interaction: SessionExport["session"]["interaction"], rows: ExportRow[], options: Record<string, unknown> = {}, named = false): SessionExport =>
  ({ status: "ok", named, timezone: "America/Toronto", session: { id: id(9), title: "Step", part: "Day 1", mode: "live", interaction, label: interaction, prompt: "Prompt", options }, rows });
const lines = (csv: string) => csv.replace(/^﻿/, "").trimEnd().split("\r\n");

test("CSV cells: quoted when they must be, and never a formula", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell("a, b"), "\"a, b\"");
  assert.equal(csvCell("say \"hi\""), "\"say \"\"hi\"\"\"");
  assert.equal(csvCell("two\nlines"), "\"two\nlines\"");
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("+1"), "'+1"); assert.equal(csvCell("-1"), "'-1"); assert.equal(csvCell("@me"), "'@me");
  assert.equal(csvCell(null), ""); assert.equal(csvCell(0), "0");
  assert.equal(localStamp("2026-11-03T14:05:09Z", "America/Toronto"), "2026-11-03 09:05:09", "in the church's time zone");
  assert.equal(csvName("Riverside Church", "Five Lenses: Congregation"), "riverside-church-five-lenses-congregation.csv");
  assert.equal(csvName("", ""), "answers.csv");
});

test("An anonymous session exports without names; a named or private one with them", () => {
  const anon = lines(sessionCsv(data("wall", [row(1), row(2, { hidden: true, test: true })])));
  assert.deepEqual(anon[0].split(","), ["Answered at", "Answer", "Hidden from the TV", "Test answer"]);
  assert.equal(anon[1], "2026-11-03 09:05:09,Answer 1,,");
  assert.equal(anon[2], "2026-11-03 09:05:09,Answer 2,Yes,Yes");
  assert.ok(sessionCsv(data("wall", [row(1)])).startsWith("﻿"), "spreadsheets read it as UTF-8");
  const sign = lines(sessionCsv(data("sign", [row(1, { name: "Ben Ortiz", text: "Ben Ortiz", value: { name: "Ben Ortiz" } })], {}, true)));
  assert.deepEqual(sign[0].split(","), ["Answered at", "Name", "Hidden from the TV", "Test answer"]);
  assert.equal(sign[1], "2026-11-03 09:05:09,Ben Ortiz,,");
  const form = lines(sessionCsv(data("form", [row(1, { name: "Ruth Morrison", value: { answers: { q1: "Honest talk", q2: "No" } } })],
    { questions: [{ key: "q1", text: "What would make this a win?" }, { key: "q2", text: "Anything else?" }] }, true)));
  assert.deepEqual(form[0].split(","), ["Answered at", "Name", "What would make this a win?", "Anything else?", "Hidden from the TV", "Test answer"]);
  assert.equal(form[1], "2026-11-03 09:05:09,Ruth Morrison,Honest talk,No,,");
});

test("Structured kinds export one column per option, statement, item or question", () => {
  const items = [{ key: "a", text: "Prayer" }, { key: "b", text: "Hospitality" }, { key: "c", text: "Youth" }];
  const choice = lines(sessionCsv(data("choice", [row(1, { text: "Prayer, Youth", value: { choices: ["a", "c"] } })], { items, multiple: true })));
  assert.deepEqual(choice[0].split(","), ["Answered at", "Answer", "Prayer", "Hospitality", "Youth", "Hidden from the TV", "Test answer"]);
  assert.equal(choice[1], "2026-11-03 09:05:09,\"Prayer, Youth\",1,,1,,");
  const scale = lines(sessionCsv(data("scale", [row(1, { text: "4", value: { value: 4 } })], { max: 5 })));
  assert.equal(scale[1], "2026-11-03 09:05:09,4,,");
  const ranking = lines(sessionCsv(data("ranking", [row(1, { text: "1. Youth, 2. Prayer", value: { order: ["c", "a"] } })], { items })));
  assert.deepEqual(ranking[0].split(",").slice(1, 5), ["Ranking", "Place: Prayer", "Place: Hospitality", "Place: Youth"]);
  assert.equal(ranking[1], "2026-11-03 09:05:09,\"1. Youth, 2. Prayer\",2,,1,,", "a partial ranking leaves the rest blank");
  const points = lines(sessionCsv(data("points", [row(1, { value: { points: { a: 60, b: 0, c: 40 } } })], { items })));
  assert.equal(points[1], "2026-11-03 09:05:09,60,0,40,,");
  const statements = lines(sessionCsv(data("statements", [row(1, { value: { ratings: { a: 5, c: 2 } } })], { items })));
  assert.equal(statements[1], "2026-11-03 09:05:09,5,,2,,");
  const grid = lines(sessionCsv(data("grid", [row(1, { value: { places: { a: [0.2049, 0.8] } } })], { items: items.slice(0, 2), x_label: "Likelihood", y_label: "Impact" })));
  assert.deepEqual(grid[0].split(",").slice(1, 5), ["Prayer: Likelihood", "Prayer: Impact", "Hospitality: Likelihood", "Hospitality: Impact"]);
  assert.equal(grid[1], "2026-11-03 09:05:09,0.2,0.8,,,,");
  const qa = lines(sessionCsv(data("qa", [row(1, { text: "When does it start?", votes: 3, answered: true }), row(2, { text: "When will it start", votes: 0, answered: false, folded_into: id(1) })])));
  assert.deepEqual(qa[0].split(",").slice(1, 5), ["Question", "Votes", "Answered", "Folded into"]);
  assert.equal(qa[2], "2026-11-03 09:05:09,When will it start,0,,When does it start?,,");
});

test("Every session in one file for the recap's download", () => {
  const out = lines(allSessionsCsv([data("wall", [row(1)]), { ...data("sign", [row(2, { name: "Ben Ortiz", text: "Ben Ortiz" })], {}, true), session: { ...data("sign", []).session, title: "We commit", mode: "self_paced" } }]));
  assert.deepEqual(out[0].split(","), ["Part", "Session", "Interaction", "Mode", "Answered at", "Name", "Answer", "Hidden from the TV", "Test answer"]);
  assert.equal(out[1], "Day 1,Step,wall,Live,2026-11-03 09:05:09,,Answer 1,,", "no name for an anonymous session");
  assert.equal(out[2], "Day 1,We commit,sign,Self-paced,2026-11-03 09:05:09,Ben Ortiz,Ben Ortiz,,");
});

// ---------- The results recap ----------
const entry = (extra: Partial<RecapEntry> = {}): RecapEntry => ({ part: "Day 1", mode: "live", opens_at: null, closes_at: null, hidden_keys: [], hidden_ids: [], answers: [],
  session: { id: id(5), title: "Celebration", interaction: "choice", prompt: "Pick one", state: "closed", revision: 2, max_sends: 3, max_characters: 28, max_words: 3,
    kind: { kind: "choice", label: "Multiple choice", input: true, one_per_person: true, counts: "people", structured: true, shares_answers: true, spotlight: "key" } },
  results: { total: 8, people: 8, words: [], items: [] }, ...extra });

test("A recap card is the TV's own frame for that session, results from the server", () => {
  const e = entry(), frame = recapFrame({ display: { church: "Riverside", title: "Wayfinding", logo_url: null, room_code: "abc", theme: "dark", texture: true, room_size: "very_small", reduced_motion: false }, server_time: "2026-11-03T15:00:00Z", version: 41 }, e);
  assert.equal(frame.state.tv_content, "session");
  assert.equal(frame.state.live_session_id, e.session.id, "drawn as the step on the TV");
  assert.equal(frame.state.results, e.results, "with the server's results, untouched");
  assert.equal(frame.state.phones_down, false); assert.equal(frame.state.spotlight_key, null, "no spotlight on a card");
  assert.equal(frame.session?.state, "closed", "a closed step shows as closed");
  assert.equal(recapFrame({ display: frame.display!, server_time: "", version: 1 }, entry({ session: { ...e.session, state: "live" } })).session?.state, "open", "never a live mark on a card");
  assert.equal(recapCount(e), "8 answering", "the TV's own count words");
  assert.equal(recapCount(entry({ session: { ...e.session, interaction: "qa", kind: { ...e.session.kind!, counts: "answers" } }, results: { total: 7, people: 4, words: [] } })), "7 questions");
  assert.equal(recapKey(e), recapKey(entry()), "the same results keep the same frame");
  assert.notEqual(recapKey(e), recapKey(entry({ results: { ...e.results, people: 9 } })), "new results change it");
});

test("App copy for this step has no em or en dashes", () => {
  for (const file of ["components/control/rehearsal.tsx", "components/control/recap-view.tsx", "components/room/live-phone.tsx", "lib/run-of-show/self-paced.ts", "lib/export/csv.ts", "lib/setup/invitation.ts"])
    assert.doesNotMatch(readFileSync(file, "utf8"), /[–—]/, file);
});

test("Close the day is the backstop: it is offered while a live or self-paced step in that part is open", () => {
  const now = at("2026-11-11T00:00:00Z");
  const live = (state: string, part = "Day 1") => ({ part, mode: "live", state });
  const self = (part: string, opens: string, closes: string) => ({ part, mode: "self_paced", state: "ready", opens_at: opens, closes_at: closes });
  assert.equal(partOpen("Day 1", [live("closed"), self("Day 1", window.opens_at, window.closes_at)], now), true, "a self-paced step open by its clock keeps the day open");
  assert.equal(partOpen("Day 1", [self("Day 1", window.opens_at, window.closes_at)], now), true, "even with no live step in the day");
  assert.equal(partOpen("Day 1", [live("closed"), self("Day 1", "2026-11-12T00:00:00Z", "2026-11-13T00:00:00Z")], now), false, "one that opens later does not");
  assert.equal(partOpen("Day 1", [live("closed"), self("Day 1", "2026-11-09T00:00:00Z", "2026-11-10T00:00:00Z")], now), false, "nor one already closed");
  assert.equal(partOpen("Day 1", [live("closed"), self("Day 2", window.opens_at, window.closes_at)], now), false, "another day's step does not");
  assert.equal(partOpen("Day 1", [{ ...self("Day 1", window.opens_at, window.closes_at), state: "draft" }], now), false, "a draft does not");
  for (const state of ["live", "phones_down", "open"]) assert.equal(partOpen("Day 1", [live(state)], now), true, `a live step that is ${state}`);
  for (const state of ["ready", "closed", "draft"]) assert.equal(partOpen("Day 1", [live(state)], now), false, `a live step that is ${state}`);
});

test("A phone with a self-paced step open reads its view again when the room moves, at most every 3 seconds", () => {
  assert.equal(recheckDelay(0, 10000), 0, "long after the last read: now");
  assert.equal(recheckDelay(9000, 10000), 2000, "soon after: once the gap is up");
  assert.equal(recheckDelay(10000, 10000, 5000), 5000);
  const sql = readFileSync(join(__dirname, "../../supabase/migrations/20261104020000_close_day_self_paced.sql"), "utf8");
  assert.equal((sql.match(/create or replace function/g) ?? []).length, 1, "only room_control is redefined");
  assert.match(sql, /create or replace function private\.room_control\(/);
  assert.match(sql, /mode='self_paced' and state<>'draft' and opens_at<at_close and closes_at>at_close/, "only open self-paced steps close");
  assert.doesNotMatch(sql, /[\u2013\u2014]/);
});

test("Clear test answers is on when a rehearsal left only non-answer test items", () => {
  assert.equal(canClearTests(0, false), false, "nothing to clear");
  assert.equal(canClearTests(1, false), true, "one candidate suggestion is enough");
  assert.equal(canClearTests(0, true), true, "a running rehearsal can be cleared");
  assert.equal(testAnswersLabel(1), "1 test answer"); assert.equal(testAnswersLabel(3), "3 test answers");
});
