import assert from "node:assert/strict";
import { test } from "node:test";
import { decisionBody } from "../../lib/wayfinding/decision";
import { defaultLensNames, isLens, lensName } from "../../lib/wayfinding/lens";
import { contentOf, interactionKinds, isReservedKind, reservedKinds } from "../../lib/interactions/kinds";
import { sessionInput } from "../../lib/run-of-show/policy";

const id = "11111111-1111-4111-8111-111111111111";

test("lens names come from the engagement and fall back to the defaults", () => {
  assert.equal(lensName(1, ["Flock", "Neighbours"]), "Flock");
  assert.equal(lensName(2, ["Flock", "Neighbours"]), "Neighbours");
  assert.equal(lensName(3, ["Flock", "Neighbours"]), "Leadership");
  assert.equal(lensName(5, ["", " "]), "Learning");
  assert.equal(defaultLensNames.length, 5);
  assert.equal(isLens(5), true); assert.equal(isLens(6), false);
});

test("reserved kind names hold the Wayfinding kinds without clashing with the library", () => {
  assert.deepEqual([...reservedKinds], ["candidates", "lens_summary"]);
  assert.equal(reservedKinds.some(k => (interactionKinds as readonly string[]).includes(k)), false);
  assert.equal(isReservedKind("lens_summary"), true); assert.equal(isReservedKind("wall"), false);
});

test("Mark a decision body trims, names a subject and rejects what the database would", () => {
  assert.deepEqual(decisionBody({ id, decision: "  Keep   all five ", reasons: " They fit. " }), { id, decision: "Keep all five", reasons: "They fit.", label: "", subject: "step" });
  assert.equal(decisionBody({ id, decision: "Confirmed", subject: "outcome", subject_id: id })?.subject_id, id);
  assert.equal(decisionBody({ id, decision: "" }), null);
  assert.equal(decisionBody({ id: "x", decision: "Yes" }), null);
  assert.equal(decisionBody({ id, decision: "Yes", subject: "vote" }), null);
  assert.equal(decisionBody({ id, decision: "Yes", subject_id: "nope" }), null);
  assert.equal(decisionBody({ id, decision: "x".repeat(401) }), null);
  assert.equal(decisionBody(null), null);
});

test("Scripture keeps body size for scripture only", () => {
  assert.equal(contentOf({ screen: "scripture", size: "body" }).size, "body");
  assert.equal(contentOf({ screen: "headline", size: "body" }).size, undefined);
  assert.equal(contentOf({ screen: "scripture", size: "huge" }).size, undefined);
});

test("Seeded from passes a valid session id and clears with an empty value", () => {
  const base = { id, revision: 1, title: "t", part: "Day 1", planned_start: null, planned_minutes: 5, mode: "live", opens_at: null, closes_at: null, interaction: "wall", prompt: "", phone_depth: "", notes: "", lands_in: "", state: "draft",
    max_sends: 3, max_characters: 140, max_words: 5, settings: { anonymous: true, burst_minutes: 4, join_strip: true }, options: {} };
  assert.equal(sessionInput({ ...base, seeded_from: id.toUpperCase() }).seeded_from, id);
  assert.equal(sessionInput({ ...base, seeded_from: "" }).seeded_from, null);
  assert.equal("seeded_from" in sessionInput(base), false);
  assert.throws(() => sessionInput({ ...base, seeded_from: "nope" }));
});
