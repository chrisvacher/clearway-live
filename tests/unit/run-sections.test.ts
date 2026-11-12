import test from "node:test";
import assert from "node:assert/strict";
import { hasSections, onlyMoved, sectionAt, sectionLine, sectionsOf } from "../../lib/run-of-show/builder";
import { sessionInput } from "../../lib/run-of-show/policy";
import { templateInput } from "../../lib/templates/policy";
import type { ShowSession } from "../../lib/run-of-show/types";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const s = (n: number, section: string | undefined, over: Partial<ShowSession> = {}): ShowSession => ({
  id: id(n), engagement_id: id(900), title: `S${n}`, part: "Day 1", position: n, planned_start: null, planned_minutes: 10, mode: "live", opens_at: null, closes_at: null,
  interaction: "word_cloud", prompt: "", phone_depth: "", options: {}, settings: { anonymous: true, burst_minutes: 4, join_strip: false }, notes: "", lands_in: "", state: "draft", segment: "",
  max_sends: 3, max_characters: 28, max_words: 3, revision: 1, ...(section === undefined ? {} : { section }), ...over });

test("sections are runs of sessions next to each other with the same name", () => {
  const run = [s(1, "Arrival"), s(2, "Arrival"), s(3, ""), s(4, "Feedback"), s(5, "Arrival")];
  assert.deepEqual(sectionsOf(run).map(x => [x.name, x.sessions.length]), [["Arrival", 2], ["", 1], ["Feedback", 1], ["Arrival", 1]]);
  assert.equal(hasSections(run), true);
  assert.equal(hasSections([s(1, undefined), s(2, " ")]), false);
  assert.equal(sectionLine([s(1, "A"), s(2, "A", { mode: "self_paced" })]), "2 sessions · 0:10");
  assert.equal(sectionLine([s(1, "A", { planned_minutes: 75 })]), "1 session · 1:15");
});

test("a session takes the section above where it lands, or the one below at the top", () => {
  const run = [s(1, "Arrival"), s(2, "Arrival"), s(3, "Feedback")];
  assert.equal(sectionAt(run, "Day 1", 0), "Arrival");
  assert.equal(sectionAt(run, "Day 1", 2), "Arrival");
  assert.equal(sectionAt(run, "Day 1", 3), "Feedback");
  assert.equal(sectionAt(run, "Day 1", 99), "Feedback");
  assert.equal(sectionAt(run, "Day 2", 0), "");
  assert.equal(sectionAt(run, "Day 1", 2, id(3)), "Arrival", "the session being moved is not its own neighbour");
});

test("a renamed section does not count as an edit to an open session", () => {
  assert.equal(onlyMoved(s(1, "Arrival"), s(1, "Welcome", { revision: 4, position: 3 })), true);
  assert.equal(onlyMoved(s(1, "Arrival"), s(1, "Arrival", { title: "Changed" })), false);
});

test("the API keeps a section only when one is sent", () => {
  const base = { ...s(1, undefined), revision: 1 };
  assert.equal("section" in sessionInput(base), false);
  assert.equal(sessionInput({ ...base, section: "  Where   we are " }).section, "Where we are");
  assert.throws(() => sessionInput({ ...base, section: "x".repeat(101) }));
});

test("a block is a template saved from named sessions", () => {
  const input = { engagement: id(900), name: "Opening" };
  assert.deepEqual(templateInput({ action: "save", input: { ...input, sessions: [id(1), id(2)] } }).input, { engagement: id(900), name: "Opening", description: "", shared: true, sessions: [id(1), id(2)] });
  assert.equal("sessions" in templateInput({ action: "save", input }).input, false);
  for (const sessions of [[], [id(1), id(1)], ["nope"], "x"]) assert.throws(() => templateInput({ action: "save", input: { ...input, sessions } }));
});
