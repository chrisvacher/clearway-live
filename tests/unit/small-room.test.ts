import assert from "node:assert/strict";
import { test } from "node:test";
import { cloudOverflow, fitField, type MeasuredEntry } from "../../lib/tv/motion";

const opt = { gapX: 40, gapY: 6, fill: 0.55, floor: 48, maxWidth: 1280, grow: true };
const word = (key: string, size = 56 * opt.floor / 36, ems = 3): MeasuredEntry => ({ key, size,
  measure: px => ({ w: px * ems, h: px * 1.05 }) });

test("Three cloud words grow above one, within the room's 168px headline ceiling", () => {
  const entries = [word("hope"), word("faith"), word("love")];
  const plan = fitField(entries, 1700, 680, opt);
  assert.equal(plan.ok, true);
  assert.ok(plan.scale > 1);
  assert.ok(plan.placed.every(w => w.size <= 168 * opt.floor / 36));
  const spacious = fitField(entries, 4000, 2500, opt);
  assert.equal(spacious.scale, 3);
  assert.equal(Math.max(...spacious.placed.map(w => w.size)), 168 * opt.floor / 36);
});

test("Growth respects the maximum word width and the default group field still never grows", () => {
  const entry = word("a longer answer", 112, 10);
  const cloud = fitField([entry], 3000, 1500, opt);
  assert.equal(cloud.ok, true);
  assert.ok(cloud.placed[0].w <= 1280);
  const groups = fitField([word("group")], 1700, 680, { ...opt, grow: false });
  assert.equal(groups.scale, 1);
  assert.equal(groups.placed[0].size, word("group").size);
});

test("A word wider than maxWidth at the floor reports an impossible plan", () => {
  const plan = fitField([word("wide", 84, 30)], 1700, 680, opt);
  assert.equal(plan.ok, false);
  assert.equal(plan.placed[0].size, opt.floor);
});

test("An overly wide repeated word shrinks below the floor only to enforce maxWidth", () => {
  const repeated = { ...word("wide repeat", 84, 30), shrinkToWidth: true };
  const plan = fitField([repeated], 1700, 680, opt);
  assert.equal(plan.ok, true);
  assert.ok(plan.placed[0].size < opt.floor);
  assert.ok(plan.placed[0].w <= opt.maxWidth);
  const withMark = fitField([{ ...repeated, measure: size => ({ w: Math.ceil(size * 30 + opt.floor * 1.6), h: Math.max(size * 1.05, opt.floor * 1.7) }) }], 1700, 680, opt);
  assert.equal(withMark.ok, true);
  assert.ok(withMark.placed[0].size < opt.floor);
  assert.ok(withMark.placed[0].w <= opt.maxWidth, "fixed-size AI mark also stays within the limit");
  const crowded = fitField(Array.from({ length: 20 }, (_, i) => ({ ...word(`repeat${i}`, 168, 5), shrinkToWidth: true })), 1000, 200, opt);
  assert.equal(crowded.ok, false);
  assert.ok(crowded.placed.every(w => w.size === opt.floor), "crowding alone cannot shrink repeated words below the room floor");
});

test("A crowded cloud reports failure at the type floor", () => {
  const entries = Array.from({ length: 20 }, (_, i) => word(`w${i}`, 168, 10));
  const plan = fitField(entries, 1000, 200, opt);
  assert.equal(plan.ok, false);
  assert.ok(plan.placed.every(w => w.size === opt.floor));
});

test("Overflow moves the oldest single mentions first and never moves repeated words", () => {
  const words = [{ key: "latest", count: 1, order: 4 }, { key: "leader", count: 3, order: 0 },
    { key: "second", count: 1, order: 2 }, { key: "first", count: 1, order: 1 }];
  const before = new Set<string>();
  const result = cloudOverflow(words, before, cloud => cloud.length <= 2);
  assert.deepEqual(result.row.map(w => w.key), ["first", "second"]);
  assert.deepEqual(result.cloud.map(w => w.key), ["latest", "leader"]);
  assert.deepEqual([...before], [], "dry selection does not change the previous state");
  const onlyRepeated = cloudOverflow(words.filter(w => w.count > 1), before, () => false);
  assert.deepEqual(onlyRepeated.row, []);
  assert.deepEqual(onlyRepeated.cloud.map(w => w.key), ["leader"]);
});

test("Overflow stays across freed space and a hide, then returns when repeated", () => {
  const first = { key: "first", count: 1, order: 1 }, later = { key: "later", count: 1, order: 2 };
  const crowded = cloudOverflow([first, later], new Set(), cloud => cloud.length < 2);
  const hidden = cloudOverflow([later], crowded.overflow, () => true);
  assert.equal(hidden.overflow.has(first.key), true);
  const unhidden = cloudOverflow([first, later], hidden.overflow, () => true);
  assert.deepEqual(unhidden.row.map(w => w.key), [first.key]);
  const repeated = cloudOverflow([{ ...first, count: 2 }, later], unhidden.overflow, () => true);
  assert.deepEqual(repeated.row, []);
  assert.equal(repeated.overflow.has(first.key), false);
});

test("Field.plan measures unseen cloud entries without creating or moving live elements", async () => {
  const globals = globalThis as unknown as Record<string, unknown>, saved = globals.document;
  globals.document = {};
  try {
    const { Field } = await import("../../lib/tv/board");
    const root = { clientWidth: 1700, clientHeight: 680 } as HTMLElement;
    let creations = 0;
    const field = new Field(root, () => { creations++; throw new Error("must not create"); }, { ...opt, floor: () => opt.floor });
    const entries = [word("one"), word("two"), word("three")].map(entry => ({ ...entry, update: () => { throw new Error("must not update"); } }));
    const first = field.plan(entries), second = field.plan(entries);
    assert.equal(first.ok, true);
    assert.ok(first.scale > 1);
    assert.deepEqual(first, second);
    assert.equal(creations, 0);
    field.destroy();
  } finally { globals.document = saved; }
});

test("Sixty long words can select overflow within the phone-to-TV time budget", () => {
  const words = Array.from({ length: 60 }, (_, i) => ({ key: `w${i}`, count: 1, order: i, size: 84,
    measure: (size: number) => ({ w: (9 + i % 12) * size * 0.54, h: size * 1.05 }) }));
  const started = performance.now();
  const selected = cloudOverflow(words, new Set(), cloud => fitField(cloud, 1776, 600, { ...opt, floor: 54 }).ok);
  assert.ok(performance.now() - started < 1000, "planning does not exhaustively search impossible placements");
  assert.ok(selected.row.length > 0);
  const plan = fitField(selected.cloud, 1776, 600, { ...opt, floor: 54 });
  assert.equal(plan.ok, true);
  for (const [i, a] of plan.placed.entries()) {
    assert.ok(a.x - a.w / 2 >= -0.01 && a.x + a.w / 2 <= 1776.01);
    assert.ok(a.y - a.h / 2 >= -0.01 && a.y + a.h / 2 <= 600.01);
    for (const b of plan.placed.slice(i + 1)) assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 - 0.01 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2 - 0.01);
  }
});
