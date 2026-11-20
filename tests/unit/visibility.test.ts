import test from "node:test";
import assert from "node:assert/strict";
import { canBePrivate, isPrivateStep, privateLine, visibilityOf, withVisibility } from "../../lib/interactions/visibility";
import { allSessionsCsv, sessionCsv, type SessionExport } from "../../lib/export/csv";
import { recapFrame, type RecapEntry } from "../../lib/export/recap";

test("Who sees answers: public by default, private when set, the form always", () => {
  assert.equal(visibilityOf({ interaction: "scale", options: {} }), "public");
  assert.equal(visibilityOf({ interaction: "scale", options: { visibility: "private" } }), "private");
  assert.equal(visibilityOf({ interaction: "form", options: {} }), "private");
  assert.equal(isPrivateStep(null), false);
  assert.equal(canBePrivate("wall"), true);
  assert.equal(canBePrivate("lens"), false);
  assert.equal(canBePrivate("content"), false);
  assert.equal(privateLine, "Only the facilitators will read what you write.");
});

test("Everyone drops the key and Facilitators only stores private, keeping the other options", () => {
  assert.deepEqual(withVisibility({ max: 10, visibility: "private" }, "public"), { max: 10 });
  assert.deepEqual(withVisibility({ max: 10 }, "private"), { max: 10, visibility: "private" });
  assert.deepEqual(withVisibility(undefined, "public"), {});
});

const exported = (options: Record<string, unknown>): SessionExport => ({ status: "ok", named: false, timezone: "America/Toronto",
  session: { id: "s", title: "NPS", part: "Day 1", mode: "live", interaction: "scale", label: "Scale", prompt: "How likely?", options },
  rows: [{ id: "a", at: "2026-11-20T15:00:00Z", text: "9", value: { value: 9 }, hidden: false, test: false }] });

test("The CSV marks a private step and leaves a public one's file unchanged", () => {
  const open = sessionCsv(exported({ max: 10 })), closed = sessionCsv(exported({ max: 10, visibility: "private" }));
  assert.doesNotMatch(open, /Private/);
  assert.match(closed.split("\r\n")[0], /,Private$/);
  assert.match(closed.split("\r\n")[1], /,Yes$/);
  assert.doesNotMatch(allSessionsCsv([exported({})]), /Private/);
  assert.match(allSessionsCsv([exported({}), exported({ visibility: "private" })]).split("\r\n")[0], /,Private$/);
});

test("The recap draws a private step's full results for the facilitators", () => {
  const entry = { part: "Day 1", mode: "live", opens_at: null, closes_at: null, hidden_keys: [], hidden_ids: [], answers: [],
    results: { total: 1, people: 1, words: [], columns: [] },
    session: { id: "s", title: "NPS", interaction: "scale", prompt: "", state: "closed", max_sends: 1, max_characters: 1, max_words: 1, options: { max: 10, visibility: "private" } } } as unknown as RecapEntry;
  const frame = recapFrame({ display: {} as never, server_time: "", version: 1 }, entry);
  assert.equal(isPrivateStep(frame.session), false);
  assert.deepEqual(frame.state.results, entry.results);
});
