import test from "node:test";
import assert from "node:assert/strict";
import { templateByline } from "../../lib/templates/policy";

const saved = { kind: "saved" as const, mine: false, by: "Dana Reyes", created_at: "2026-11-03T15:00:00Z" };

test("a saved template's byline is the person and the date with a separator between", () => {
  assert.equal(templateByline(saved, "UTC"), "Saved by Dana Reyes · Nov 3");
  assert.equal(templateByline({ ...saved, mine: true }, "UTC"), "Saved by you · Nov 3");
});

test("the byline never carries a template or engagement name, and parts never run together", () => {
  const line = templateByline({ ...saved, by: "Dana Reyes", ...{ name: "Practice run", source: "Practice room" } }, "UTC");
  assert.ok(!/Practice/.test(line));
  assert.match(line, /^Saved by .+ · [A-Z][a-z]+ \d+$/);
});

test("a missing person or an unreadable date is left out, not printed", () => {
  assert.equal(templateByline({ ...saved, by: null }, "UTC"), "Saved by a Clearway facilitator · Nov 3");
  assert.equal(templateByline({ ...saved, by: "  " }, "UTC"), "Saved by a Clearway facilitator · Nov 3");
  assert.equal(templateByline({ ...saved, created_at: "not a date" }, "UTC"), "Saved by Dana Reyes");
});

test("a template that ships with the app says so", () => {
  assert.equal(templateByline({ kind: "shipped", mine: false, by: null, created_at: "2026-11-03T15:00:00Z" }, "UTC"), "Ships with the app");
});
