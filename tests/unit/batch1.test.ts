import assert from "node:assert/strict";
import { test } from "node:test";
import { loopIndex, loopNextIn, loopOf } from "../../lib/images/loop";
import { stepImage, imageProblem } from "../../lib/images/shared";
import { responsesView } from "../../lib/control/responses";
import { clock, stepTimer, timerMarks, timerView } from "../../lib/live/timer";

const a = "8d000000-0000-4000-8000-000000000050", b = "8d000000-0000-4000-8000-000000000051", c = "8d000000-0000-4000-8000-000000000052";

test("a loop reads its images, seconds and transition, with defaults", () => {
  assert.deepEqual(loopOf({ screen: "loop", images: [a, b], seconds: 12, transition: "slide" }), { images: [a, b], seconds: 12, transition: "slide" });
  assert.deepEqual(loopOf({ screen: "loop", images: [a], seconds: 2, transition: "wipe" }), { images: [a], seconds: 8, transition: "fade" });
  assert.equal(loopOf({ screen: "loop", images: [] }), null);
  assert.equal(loopOf(null), null);
});

test("every surface picks the same image from the start time and the server clock", () => {
  const startedAt = "2026-11-20T14:00:00.000Z", t0 = Date.parse(startedAt);
  const loop = { images: [a, b, c], seconds: 8, startedAt };
  assert.equal(loopIndex(loop, t0), 0);
  assert.equal(loopIndex(loop, t0 + 7999), 0);
  assert.equal(loopIndex(loop, t0 + 8000), 1);
  assert.equal(loopIndex(loop, t0 + 16000), 2);
  assert.equal(loopIndex(loop, t0 + 24000), 0, "and it comes round again");
  assert.equal(loopIndex(loop, t0 - 5000), 0, "a clock a little behind the start shows the first image");
  assert.equal(loopIndex({ ...loop, startedAt: null }, t0 + 30000), 0, "with no start time yet it shows the first");
  assert.equal(loopIndex({ images: [a], seconds: 8, startedAt }, t0 + 30000), 0, "one image never moves");
});

test("the Live screen says how long until the next image", () => {
  const startedAt = "2026-11-20T14:00:00.000Z", t0 = Date.parse(startedAt), loop = { images: [a, b, c], seconds: 8, startedAt };
  assert.equal(loopNextIn(loop, t0), 8);
  assert.equal(loopNextIn(loop, t0 + 3000), 5);
  assert.equal(loopNextIn(loop, t0 + 7900), 1);
  assert.equal(loopNextIn({ images: [a], seconds: 8, startedAt }, t0), null);
});

test("a step's image is read only when it is well formed", () => {
  assert.deepEqual(stepImage({ image: { id: a, display: "place" } }), { id: a, display: "place" });
  assert.equal(stepImage({ image: { id: a, display: "cover" } }), null);
  assert.equal(stepImage({ image: a }), null);
  assert.equal(imageProblem({ type: "image/gif", size: 10, name: "x.gif" } as File) !== null, true);
});

test("the Responses list counts shown and hidden answers, and the Hidden filter keeps only hidden ones", () => {
  const items = [{ key: "1", text: "A", count: 1, hidden: false }, { key: "2", text: "B", count: 1, hidden: true, hidden_by: "Chris", hidden_at: "2026-11-20T14:24:00Z" }, { key: "3", text: "C", count: 1, hidden: false }];
  const all = responsesView(items, "all"), hidden = responsesView(items, "hidden");
  assert.equal(all.shown, 2); assert.equal(all.hidden, 1); assert.equal(all.list.length, 3);
  assert.deepEqual(hidden.list.map(i => i.key), ["2"]);
  assert.deepEqual(responsesView([], "hidden"), { shown: 0, hidden: 0, list: [] });
});

test("a timer shows the time left, the last minute, then overtime counting up, from the server clock", () => {
  const t0 = Date.parse("2026-11-20T14:00:00.000Z"), started_at = new Date(t0).toISOString();
  const down = { id: "t", kind: "down" as const, seconds: 300, started_at, ends_at: new Date(t0 + 300000).toISOString(), tv: true, phones: false, source: "manual" as const };
  assert.deepEqual(timerView(down, t0), { text: "5:00", phase: "normal", paused: false, label: "5:00 left" });
  assert.equal(timerView(down, t0 + 1).text, "5:00", "a part second rounds up, so it never shows 4:59 at the start");
  assert.equal(timerView(down, t0 + 239000).phase, "normal");
  assert.equal(timerView(down, t0 + 240000).phase, "last", "the last minute");
  assert.deepEqual(timerView(down, t0 + 372000), { text: "+1:12", phase: "over", paused: false, label: "1:12 over" });
  const paused = { ...down, paused_at: new Date(t0 + 60000).toISOString() };
  assert.equal(timerView(paused, t0 + 200000).text, "4:00", "paused, it holds");
  assert.equal(timerView(paused, t0 + 200000).paused, true);
  const up = { id: "u", kind: "up" as const, started_at, tv: true, phones: true, source: "manual" as const };
  assert.equal(timerView(up, t0 + 3725000).text, "1:02:05", "counting up past an hour");
  assert.equal(clock(59.9), "0:59");
});

test("a step's timer reads its setting, and the run of show marks the steps it runs through", () => {
  const a = "8d000000-0000-4000-8000-0000000000a1", b = "8d000000-0000-4000-8000-0000000000a2", c = "8d000000-0000-4000-8000-0000000000a3", d = "8d000000-0000-4000-8000-0000000000a4";
  assert.deepEqual(stepTimer({ timer: { kind: "down", seconds: 600 } }), { kind: "down", seconds: 600, at: undefined, tv: true, phones: false, start: "live", through: undefined });
  assert.equal(stepTimer({ timer: { kind: "sideways" } }), null);
  const marks = timerMarks([{ id: a, options: {} }, { id: b, options: { timer: { kind: "down", seconds: 600, through: d } } }, { id: c, options: {} }, { id: d, options: {} }]);
  assert.equal(marks.get(a), undefined);
  assert.deepEqual(marks.get(b), { role: "owner", label: "Timer 10:00" });
  assert.deepEqual(marks.get(c), { role: "running", label: "Timer running" });
  assert.deepEqual(marks.get(d), { role: "end", label: "Timer ends here" });
  assert.equal(timerMarks([{ id: a, options: { timer: { kind: "up", through: a } } }]).get(a)?.label, "Timer counts up", "running through itself is just this step");
});
