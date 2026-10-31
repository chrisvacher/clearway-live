import assert from "node:assert/strict";
import { test } from "node:test";
import { fillYears, sessionInput, sortSessions } from "../../lib/run-of-show/policy";
import { zonedInstant } from "../../lib/setup/policy";
import type { ShowSession } from "../../lib/run-of-show/types";
const valid = () => ({ id: "55000000-0000-4000-8000-000000000005", revision: null, title: "Celebration", part: "Day 1", planned_start: null, planned_minutes: 15, mode: "live", opens_at: null, closes_at: null, interaction: "word_cloud", prompt: "It's {base year + 10}.", phone_depth: "Phone only", notes: "Private", lands_in: "", state: "draft", max_sends: 3, max_characters: 28, max_words: 3, settings: { anonymous: true, burst_minutes: 4, join_strip: false } });
test("run of show validates all editor fields and drops room/audit injection", () => {
  const value = sessionInput({ ...valid(), engagement_id: "another", position: 999, deleted: true, created_at: "bad", extra: "private" });
  assert.equal(value.title, "Celebration"); assert.equal("engagement_id" in value, false); assert.equal("deleted" in value, false);
  for (const change of [{ id: "bad" }, { revision: -1 }, { title: " " }, { part: "Other" }, { interaction: "poll" }, { planned_minutes: 0 }, { max_sends: 101 }, { max_words: 1.2 }, { notes: "x".repeat(30001) }, { state: "hacked" }, { settings: { anonymous: false } }, { settings: { anonymous: true, burst_minutes: "4", join_strip: false } }, { planned_start: "tomorrow" }]) assert.throws(() => sessionInput({ ...valid(), ...change }));
});
test("self-paced opening must precede closing and session times respect church timezone", () => {
  assert.throws(() => sessionInput({ ...valid(), mode: "self_paced" }));
  assert.throws(() => sessionInput({ ...valid(), mode: "self_paced", opens_at: "2026-11-14T14:00:00Z", closes_at: "2026-11-14T13:00:00Z" }));
  assert.equal(sessionInput({ ...valid(), mode: "self_paced", opens_at: "2026-11-14T09:00:00-05:00", closes_at: "2026-11-14T10:00:00-05:00" }).opens_at, "2026-11-14T14:00:00.000Z");
  assert.equal(zonedInstant("2026-11-14T09:00", "America/Toronto"), "2026-11-14T14:00:00.000Z");
  assert.throws(() => zonedInstant("2026-11-01T01:30", "America/Toronto"));
});
test("horizon years render as plain text and sessions sort by part then facilitator order", () => {
  assert.equal(fillYears("{base year}: {base year + 10}, {base year+3}, {base year + 1}", 2026), "2026: 2036, 2029, 2027");
  assert.equal(fillYears("<b>{other}</b>", 2026), "<b>{other}</b>");
  const row = { ...valid(), engagement_id: "room", revision: 0 } as ShowSession;
  const values = [{ ...row, id: "b", position: 1 }, { ...row, id: "a", position: 0 }, { ...row, id: "c", position: 9, part: "Pre-call" as const }];
  assert.deepEqual(sortSessions(values).map(x => x.id), ["c", "a", "b"]); assert.equal(values[0].id, "b");
});
