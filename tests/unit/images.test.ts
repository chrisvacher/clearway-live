import assert from "node:assert/strict";
import { test } from "node:test";
import { loopIndex, loopNextIn, loopOf } from "../../lib/images/loop";
import { stepImage, imageProblem } from "../../lib/images/shared";

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
