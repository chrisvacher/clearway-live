import assert from "node:assert/strict";
import type pg from "pg";
import type { Page } from "playwright";
import { interactionKinds, kindLabels } from "../../lib/interactions/kinds";
import { dropOptions } from "../../lib/run-of-show/builder";
import { engagement, facilitator, press, until } from "./harness";

type Args = { sql: pg.Client; room: Awaited<ReturnType<typeof engagement>>; fac: Awaited<ReturnType<typeof facilitator>>; tv: Page };

export async function testPass11FrameBoards({ sql, room, fac, tv }: Args) {
  for (const [index, kind] of interactionKinds.entries()) {
    if (kind === "video") continue; // The paired video test exercises the media stage.
    const step = await room.session(`Frame fit, ${kindLabels[kind]}`, kind, "What would help the team take the next step together?", 400 + index);
    const options = kind === "content" ? { screen: "headline" } : (dropOptions[kind] ?? {});
    await sql.query("update public.sessions set options=coalesce(private.session_options(interaction,$2::jsonb,engagement_id),$2::jsonb) where id=$1", [step, JSON.stringify(options)]);
    await press(fac, sql, room.id, "go_live", { session: step });
    const board = tv.locator(`.tv-layer:not(.is-leaving)[data-kind="${kind}"]`).last();
    await board.waitFor();
    await until(async () => {
      const box = await board.boundingBox();
      return box && box.y + box.height <= 833;
    }, `${kind} fits in the framed area`, 1500);
    const overshoot = await board.evaluate(element => {
      const area = element.getBoundingClientRect();
      return Array.from(element.querySelectorAll("h1, h2, .qa-row, .tv-scale-ends, .ba-plot")).find(child => {
        const draft = child.getBoundingClientRect();
        return draft.width > 0 && draft.height > 0 && (draft.bottom > area.bottom + 2 || draft.right > area.right + 2);
      })?.textContent;
    });
    assert.equal(overshoot, undefined, `${kind} has no clipped heading or layout below the frame`);
  }
}
