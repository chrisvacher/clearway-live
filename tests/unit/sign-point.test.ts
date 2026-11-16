import test from "node:test";
import assert from "node:assert/strict";
import { pointInViewBox } from "../../components/interactions/grid-form-sign/sign-point";

// The signature field is 600 by 200; the phone draws it in a box 104px tall.
const W = 600, H = 200;
const near = (got: [number, number], want: [number, number]) => {
  assert.ok(Math.abs(got[0] - want[0]) < 1e-9 && Math.abs(got[1] - want[1]) < 1e-9, `got ${got.join(",")}, want ${want.join(",")}`);
};

test("scale 1: a 312 by 104 box at the origin maps corners and centre exactly", () => {
  const r = { left: 0, top: 0, width: 312, height: 104 };
  near(pointInViewBox(0, 0, r, W, H), [0, 0]);
  near(pointInViewBox(312, 104, r, W, H), [600, 200]);
  near(pointInViewBox(156, 52, r, W, H), [300, 100]);
});

test("a 0.5 CSS transform scale on an ancestor: the rect is half size and the mapping still lands on the same point", () => {
  // getBoundingClientRect reports the transformed box, so a 312 by 104 field shows as 156 by 52.
  const r = { left: 100, top: 40, width: 156, height: 52 };
  near(pointInViewBox(100, 40, r, W, H), [0, 0]);
  near(pointInViewBox(100 + 39, 40 + 13, r, W, H), [150, 50]);
  near(pointInViewBox(256, 92, r, W, H), [600, 200]);
});

test("devicePixelRatio 2: client coordinates and the rect are both CSS pixels, so the result does not change", () => {
  const r = { left: 0, top: 0, width: 312, height: 104 };
  // The same pointer on a 2x screen reports the same clientX/clientY and the same rect.
  near(pointInViewBox(78, 26, r, W, H), [150, 50]);
});

test("an offset rect (scrolled page, padded pad) subtracts left and top", () => {
  const r = { left: 214, top: 618, width: 312, height: 104 };
  near(pointInViewBox(214, 618, r, W, H), [0, 0]);
  near(pointInViewBox(214 + 104, 618 + 52, r, W, H), [200, 100]);
});

test("a box wider than 3 by 1 (laptop) letterboxes like the svg does: centred, one uniform scale", () => {
  // 624 by 104: the svg draws the field 312 wide in the middle, 156px of empty band each side.
  const r = { left: 0, top: 0, width: 624, height: 104 };
  near(pointInViewBox(156, 0, r, W, H), [0, 0]);
  near(pointInViewBox(312, 52, r, W, H), [300, 100]);
  near(pointInViewBox(468, 104, r, W, H), [600, 200]);
  // The old mapping (x / width * 600) put the centre of the left half at 150 instead of the band edge.
  assert.notEqual(pointInViewBox(156, 0, r, W, H)[0], (156 / 624) * 600);
});

test("a box narrower than 3 by 1 (small phone) letterboxes top and bottom", () => {
  const r = { left: 0, top: 0, width: 300, height: 104 };
  // scale 0.5, the field is 300 by 100, 2px band above and below.
  near(pointInViewBox(0, 2, r, W, H), [0, 0]);
  near(pointInViewBox(300, 102, r, W, H), [600, 200]);
});

test("an empty rect does not divide by zero", () => {
  near(pointInViewBox(10, 10, { left: 0, top: 0, width: 0, height: 0 }, W, H), [0, 0]);
});
