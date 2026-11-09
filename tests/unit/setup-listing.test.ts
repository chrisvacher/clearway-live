import test from "node:test";
import assert from "node:assert/strict";
import { eventDate, place, typeName } from "../../lib/setup/listing";

const blank = { start_date: null, end_date: null, retreat_start_date: null, retreat_end_date: null, pre_call_at: null };

test("a one-day workshop shows its day", () => {
  assert.equal(eventDate({ ...blank, start_date: "2026-11-20", end_date: "2026-11-20", retreat_start_date: "2026-11-20", retreat_end_date: "2026-11-20" }), "Fri, Nov 20, 2026");
});
test("a retreat shows its two days without a dash", () => {
  const text = eventDate({ ...blank, start_date: "2026-11-01", end_date: "2027-09-01", retreat_start_date: "2026-11-07", retreat_end_date: "2026-11-08" });
  assert.equal(text, "Sat, Nov 7 to Sun, Nov 8, 2026");
  assert.doesNotMatch(text!, /[–—]/);
});
test("a pre-call alone shows as the pre-call in the church's time zone", () => {
  assert.equal(eventDate({ ...blank, pre_call_at: "2026-11-21T02:30:00Z" }, "America/Toronto"), "Pre-call Fri, Nov 20, 2026");
});
test("no dates shows nothing", () => { assert.equal(eventDate(blank), null); });
test("the place is the city and province when Team Hub has them", () => {
  assert.equal(place({ city: "Pickering", state_province: "ON", country: "Canada" }), "Pickering, ON");
  assert.equal(place({ city: null, state_province: null, country: null }), null);
  assert.equal(place(null), null);
});
test("types read in plain words", () => {
  assert.equal(typeName("team_workshop"), "Team workshop");
  assert.equal(typeName("day_and_a_half"), "Wayfinding, day and a half");
});
