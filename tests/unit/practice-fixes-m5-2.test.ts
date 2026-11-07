// The milestone 5 practice-room fixes, second round: the read-back TV's answer type step (up to six whole answers).
import assert from "node:assert/strict";
import { test } from "node:test";
import { answerSize, fitCount } from "../../lib/tv/fit";

test("answerSize keeps the room's type when the answers fit, and steps down in a few even steps to the floor, never below it", () => {
  assert.equal(answerSize(() => true, 36, 54), 54, "the room's own size when everything fits");
  assert.equal(answerSize(px => px <= 40, 36, 54), 36 + 0, "no step fits, so the floor");
  const tried: number[] = [];
  assert.equal(answerSize(px => { tried.push(px); return px <= 46; }, 36, 54, 4), 45, "the largest of the even steps that fits (54, 49.5, 45)");
  assert.deepEqual(tried, [54, 49.5, 45]);
  assert.equal(answerSize(() => false, 36, 54), 36, "when even the floor does not fit, the floor: type never goes below it");
  assert.equal(answerSize(() => false, 36, 36), 36); assert.equal(answerSize(() => true, 36, 30), 36);
});

test("A smaller type size is what lets six answers fit: the same answers count more whole cards at the floor than at the room's size", () => {
  const at = (px: number) => Array.from({ length: 6 }, () => Math.round(px * 1.2) + 12);
  const space = 407, count = (px: number) => fitCount(at(px), 6, space, "start", 0);
  assert.ok(count(54) < 6 && count(36) === 6, `${count(54)} at 54 px, ${count(36)} at 36 px`);
  assert.equal(answerSize(px => count(px) >= 6, 36, 54), 40.5, "the first of the even steps at which all six fit");
});
