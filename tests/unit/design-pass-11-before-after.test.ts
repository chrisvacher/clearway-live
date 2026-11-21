import { test } from "node:test";
import assert from "node:assert/strict";
import { beforeAfterSummary, changeLabel } from "../../lib/interactions/before-after";
import { sessionCsv, type SessionExport } from "../../lib/export/csv";

test("paired and source modes use the same independent aggregate distributions", () => {
  const pairs = [{ before: 1, after: 7 }, { before: 3, after: 9 }, { before: 5 }, { after: 8 }];
  const paired = beforeAfterSummary(pairs.map(p => p.before), pairs.map(p => p.after), 10);
  const sourced = beforeAfterSummary([1, 3, 5], [7, 9, 8], 10);
  assert.deepEqual(paired, sourced);
  assert.equal(paired.before.average, 3);
  assert.equal(paired.after.average, 8);
  assert.equal(paired.change, 5);
  assert.equal(paired.before.count, 3);
  assert.equal(paired.after.count, 3);
  assert.deepEqual(Object.keys(paired.before).sort(), ["average", "columns", "count"]);
  assert.equal(JSON.stringify(paired).includes("attendee"), false);
});
test("aggregate change rounds once from unrounded averages and handles partial/empty", () => {
  const result = beforeAfterSummary([1, 2, 2], [3, 4, 4], 5);
  assert.equal(result.change, 2);
  assert.equal(changeLabel(result.change), "Up 2.0");
  assert.equal(changeLabel(beforeAfterSummary([4], [3], 5).change), "Down 1.0");
  assert.equal(changeLabel(beforeAfterSummary([2], [2], 5).change), "No change");
  assert.equal(beforeAfterSummary([1, 2], [], 10).change, null);
  assert.equal(beforeAfterSummary([], [], 10).before.average, null);
});
test("anonymous paired CSV exports both answers, with no person-movement field", () => {
  const data: SessionExport = { status: "ok", named: false, timezone: "UTC", session: { id: "s", title: "Readiness", part: "Feedback", mode: "live", interaction: "before_after", label: "Before and after", prompt: "Question", options: { max: 10 } }, rows: [{ id: "r", at: "2026-11-20T12:00:00Z", text: "Before: 3; After: 8", value: { before: 3, after: 8 }, hidden: false, test: false }] };
  const csv = sessionCsv(data);
  assert.match(csv, /Before today,After today/);
  assert.match(csv, /,3,8,/);
  assert.equal(csv.includes("Name"), false);
  assert.equal(csv.includes("change"), false);
});
