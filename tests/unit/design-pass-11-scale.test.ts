import { test } from "node:test";
import assert from "node:assert/strict";
import { npsSummary, scaleDotLayout, scaleStackOrder, signedScore } from "../../lib/interactions/scale";
import { sessionCsv, type SessionExport } from "../../lib/export/csv";

test("NPS-style scores use 1 to 10, signed and rounded, with empty distinct from zero", () => {
  assert.equal(signedScore(npsSummary([9, 10]).score!), "+100");
  assert.equal(npsSummary([1, 2, 3, 4, 5, 6]).score, -100);
  assert.deepEqual(npsSummary([1, 7, 9]), { score: 0, low: 1, middle: 1, high: 1 });
  assert.equal(npsSummary([10, 10, 7]).score, 67);
  assert.equal(npsSummary([1, 1, 7]).score, -67);
  assert.equal(npsSummary([1, ...Array(7).fill(7)]).score, -13);
  assert.equal(npsSummary([]).score, null);
  assert.equal(npsSummary([0, 11, NaN, 1.5]).score, null);
});
test("scale dots fit above track, shrink and switch to columns at the room floor", () => {
  const dots = Array.from({ length: 5 }, (_, i) => ({ key: String(i), value: 5 }));
  const five = scaleDotLayout(dots, 10, 1680, 400);
  assert.equal(five.columns, false);
  assert.ok(five.size >= 36 && five.size < 76);
  const positions = five.positions.sort((a, b) => a.y - b.y);
  positions.forEach((p, i) => {
    assert.ok(p.y >= five.size / 2);
    assert.ok(p.y + five.size / 2 < 400);
    if (i) assert.ok(p.y - positions[i - 1].y >= five.size);
  });
  assert.equal(scaleDotLayout(Array.from({ length: 40 }, (_, i) => ({ key: String(i), value: 5 })), 10, 1680, 400).columns, true);
});
test("a changed answer keeps its opaque dot key and changes value position", () => {
  const before = scaleDotLayout([{ key: "same", value: 2 }], 10, 1680, 400).positions[0];
  const after = scaleDotLayout([{ key: "same", value: 8 }], 10, 1680, 400).positions[0];
  assert.equal(before.key, after.key);
  assert.ok(after.x > before.x);
});
test("an arrival appends above stationary answers even when its key sorts first", () => {
  const earlier = [{ key: "z", value: 3 }, { key: "y", value: 3 }];
  const arrived = { key: "a", value: 3 };
  assert.deepEqual(scaleStackOrder(earlier, [arrived, ...earlier]), [...earlier, arrived]);
  assert.deepEqual(scaleStackOrder(earlier, [{ key: "z", value: 8 }, earlier[1]]), [earlier[1], { key: "z", value: 8 }]);
});
test("scale CSV keeps individual values and includes aggregate NPS and average", () => {
  const data: SessionExport = { status: "ok", named: false, timezone: "UTC", session: { id: "s", title: "Recommend", part: "Feedback", mode: "live", interaction: "scale", label: "Scale", prompt: "Question", options: { max: 10, nps: true } }, rows: [1, 7, 9, 10].map((value, i) => ({ id: String(i), at: "2026-11-20T12:00:00Z", text: String(value), value: { value }, hidden: false, test: false })) };
  const csv = sessionCsv(data);
  assert.match(csv, /Room average,NPS-style score,1 to 6 count,7 or 8 count,9 or 10 count/);
  assert.match(csv, /,6.8,'\+25,1,1,2/);
});
