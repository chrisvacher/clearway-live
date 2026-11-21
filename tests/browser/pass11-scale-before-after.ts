// Extends the pass 11 paired-room kit using only its disposable local workshop.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { Page } from "playwright";
import { joinPhones } from "../../scripts/load-test";
import { engagement, facilitator, press, until } from "./harness";

type Args = { sql: pg.Client; room: Awaited<ReturnType<typeof engagement>>; fac: Awaited<ReturnType<typeof facilitator>>; tv: Page; phone?: Page; origin: string; name: string; beforeAfter?: boolean; shot?: (page: Page, name: string) => Promise<void> };
async function noOverlap(page: Page, selector: string, label: string) {
  const boxes = await page.locator(selector).evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    assert.ok(a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1, `${label}: dots ${i}/${j} do not overlap`);
  }
}
export async function testPass11ScaleBeforeAfter({ sql, room, fac, tv, phone, origin, name, beforeAfter = true, shot }: Args) {
  const create = async (title: string, kind: string, options: Record<string, unknown>, position: number) => {
    const id = await room.session(title, kind, title, position);
    await sql.query("update public.sessions set options=private.session_options(interaction,$2::jsonb,engagement_id) where id=$1", [id, JSON.stringify(options)]);
    return id;
  };
  const opts = { max: 10, low: "Getting started", high: "Ready to go" };
  const scale = await create("Scale dot checks", "scale", opts, 100);
  const submissions = Array.from({ length: 40 }, () => randomUUID());
  const phones = await joinPhones(origin, 40, { room: room.id, prefix: `Pass11 ${randomUUID().slice(0, 6)}` });
  const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
  const go = async (id: string, kind = "scale") => {
    assert.equal((await press(fac, sql, room.id, "go_live", { session: id })).status, "ok");
    await until(async () => await layer().getAttribute("data-kind") === kind, "expected board", 10000);
  };
  const state = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [room.id])).rows[0].results;
  await go(scale);
  let sent = 0;
  for (const count of [1, 5, 11, 40]) {
    while (sent < count) { assert.equal(await phones[sent].sendValue(room.id, scale, { value: 8 }, "", { id: submissions[sent], revision: 0 }), "accepted"); sent++; }
    await until(async () => (await state()).people === count, `${count} scale answers`, 10000);
    await until(async () => await layer().locator(".tv-scale-number").textContent() === "8.0", "scale average", 8000);
    if (count < 11) {
      assert.equal(await layer().locator(".tv-scale").getAttribute("data-layout"), "dots");
      await until(async () => await layer().locator(".tv-scale-dot:not(.is-leaving)").count() === count, `${count} scale dots`, 8000);
      await noOverlap(tv, ".tv-layer:not(.is-leaving) .tv-scale-dot:not(.is-leaving)", `scale ${count}`);
    }
    if (count === 40) await until(async () => await layer().locator(".tv-scale").getAttribute("data-layout") === "columns", "scale crowding falls back to columns");
    await shot?.(tv, `${name}-scale-${count}`);
  }
  // Return to dots and verify changing an answer retargets the same DOM node.
  await sql.query("update public.submissions set hidden=true where session_id=$1 and id<>$2", [scale, submissions[0]]);
  await sql.query("update public.room_states set results=private.live_results(engagement_id) where engagement_id=$1", [room.id]);
  await until(async () => (await state()).people === 1, "one visible answer", 8000);
  await until(async () => await layer().locator(".tv-scale-dot:not(.is-leaving)").count() === 1, "one dot", 8000);
  const dotKey = await layer().locator(".tv-scale-dot:not(.is-leaving)").getAttribute("data-dot");
  assert.equal(await phones[0].sendValue(room.id, scale, { value: 3 }, "", { id: submissions[0], revision: 1 }), "accepted");
  await until(async () => await layer().locator(`.tv-scale-dot[data-dot="${dotKey}"]`).getAttribute("data-value") === "3", "same dot changes value", 8000);
  await sql.query("update public.sessions set options=private.session_options(interaction,options||'{\"nps\":true}'::jsonb,engagement_id) where id=$1", [scale]);
  await sql.query("update public.room_states set results=private.live_results(engagement_id) where engagement_id=$1", [room.id]);
  await until(async () => await layer().locator(".tv-scale-bands").count() === 1 && await layer().locator(".tv-scale-number").textContent() === "-100", "NPS bands and score", 8000);
  assert.equal(await layer().locator(".tv-scale-average-line").count(), 0);
  await shot?.(tv, `${name}-scale-nps`);

  if (!beforeAfter) return;
  const afterScale = await create("Later scale checks", "scale", opts, 101);
  const paired = await create("Compare together", "before_after", { ...opts, mode: "paired", question: "How ready did you feel before and after?" }, 102);
  const sourced = await create("Compare earlier scales", "before_after", { mode: "steps", before_session: scale, after_session: afterScale, ...opts }, 103);
  await go(paired, "before_after");
  assert.equal(await phones[0].sendValue(room.id, paired, { before: 2 }), "accepted");
  assert.equal(await phones[1].sendValue(room.id, paired, { after: 8 }), "accepted");
  assert.equal(await phones[2].sendValue(room.id, paired, { before: 4, after: 10 }), "accepted");
  await until(async () => (await state()).before_after?.change === 6, "paired aggregate change", 8000);
  await layer().locator(".ba-change").getByText("Up 6.0", { exact: true }).waitFor();
  assert.equal(await layer().locator("[data-aggregate-only=true]").count(), 1);
  assert.equal(await layer().locator("[data-person], [data-attendee], [data-pair], [data-before-person], [data-after-person]").count(), 0);
  await noOverlap(tv, ".tv-layer:not(.is-leaving) .ba-plot-dot", "paired aggregate");
  await shot?.(tv, `${name}-before-after-paired`);
  if (phone) {
    await phone.getByRole("heading", { name: "How ready did you feel before and after?" }).waitFor();
    const before = phone.getByRole("slider", { name: "Before today" });
    const after = phone.getByRole("slider", { name: "After today" });
    await before.press("Home");
    await phone.getByText("Sent. Slide either one to change it.").waitFor();
    await until(async () => (await state()).before_after?.before.count === 3, "paired phone sends before on its own");
    await after.press("End");
    await until(async () => (await state()).before_after?.after.count === 3, "paired phone adds an after answer");
    await shot?.(phone, `${name}-before-after-paired-phone`);
  }

  await go(afterScale);
  assert.equal(await phones[0].sendValue(room.id, afterScale, { value: 9 }), "accepted");
  await go(sourced, "before_after");
  await until(async () => (await state()).before_after?.after.count === 1, "read source aggregate", 8000);
  assert.equal(await phones[1].sendValue(room.id, afterScale, { value: 7 }), "accepted");
  await until(async () => (await state()).before_after?.after.count === 2, "late source updates aggregate", 8000);
  await shot?.(tv, `${name}-before-after-sources`);
  if (phone) {
    await phone.getByText("Look at the screen to see how the room moved.").waitFor();
    assert.equal(await phone.getByRole("slider").count(), 0, "source mode collects no answers");
    assert.deepEqual(await phone.locator(".ba-own b").allTextContents(), ["-", "-"]);
    await shot?.(phone, `${name}-before-after-sources-phone`);
  }
  await sql.query("update public.sessions set options=options||'{\"visibility\":\"private\"}'::jsonb where id=$1", [afterScale]);
  await tv.locator(".tv-private-count").waitFor({ timeout: 1000 });
  assert.deepEqual(Object.keys(await state()).sort(), ["people", "total", "words"]);
  assert.equal(await layer().locator(".ba-plot, .ba-key, .ba-change").count(), 0);
  await shot?.(tv, `${name}-before-after-private-source`);
}
