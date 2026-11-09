// Overnight acceptance fixes (November 9): palette drop defaults, empty content steps stay Drafts, and what the setup API says when the database refuses.
import assert from "node:assert/strict";
import { test } from "node:test";
import { dropOptions, droppedSession, hasContent, palette, readyState } from "../../lib/run-of-show/builder";
import { interactionKinds, type KindInfo } from "../../lib/interactions/kinds";
import { deliberate } from "../../lib/setup/errors";
import { setupInput } from "../../lib/setup/policy";

const kinds: KindInfo[] = interactionKinds.map(kind => ({ kind, label: kind, input: kind !== "content", one_per_person: false, counts: "answers", structured: false, shares_answers: true, spotlight: "none", named: "setting" }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("Every palette tile drops with options its kind accepts", () => {
  for (const entry of palette(kinds).interactions) {
    assert.ok(entry.kind in dropOptions, `${entry.kind} has drop defaults`);
    const s = droppedSession(entry, id(0), "Day 1", kinds, id(1));
    assert.ok(s.max_sends >= 1 && s.max_characters >= 1 && s.max_words >= 1, `${entry.kind} has limits`);
    const o = s.options as Record<string, unknown>;
    if (entry.kind === "lens") assert.ok(Number.isInteger(o.lens) && (o.lens as number) >= 1 && (o.lens as number) <= 5, "the Lens wall names lens 1 to 5 (options_lens refuses {})");
    if (entry.kind === "lens_summary") assert.ok(o.lens === undefined || (Number.isInteger(o.lens) && (o.lens as number) >= 1 && (o.lens as number) <= 5));
    if (entry.kind === "goals") assert.ok(o.risk_links === "required" || o.risk_links === "later");
    if (["bullets", "confirm", "four_lists"].includes(entry.kind)) assert.deepEqual(Object.keys(o).filter(k => k !== "ai"), []);
    if (["choice", "ranking", "points", "statements"].includes(entry.kind)) assert.ok(Array.isArray(o.items) && (o.items as unknown[]).length >= 2);
  }
  const lens = droppedSession(palette(kinds).interactions.find(e => e.kind === "lens")!, id(0), "Day 1", kinds, id(2));
  assert.deepEqual(lens.options, { lens: 1 });
  assert.deepEqual([lens.max_sends, lens.max_characters, lens.max_words], [8, 200, 50], "the limits the session form gives a Lens wall");
});

test("Done keeps an empty Scripture, Headline or Image step a Draft, and every other step as asked", () => {
  const step = (screen: string, extra: Record<string, unknown> = {}, prompt = "") => ({ interaction: "content" as const, prompt, options: { screen, ...extra } });
  for (const screen of ["scripture", "headline", "image"]) {
    assert.equal(hasContent(step(screen)), false, `an empty ${screen} has nothing to show`);
    assert.equal(readyState(step(screen), "ready"), "draft");
  }
  assert.equal(readyState(step("scripture", { reference: "John 3:16" }, "For God so loved the world"), "ready"), "ready");
  assert.equal(readyState(step("headline", {}, "Giving is steady"), "ready"), "ready");
  assert.equal(readyState(step("image", { media: id(9) }), "ready"), "ready");
  assert.equal(readyState(step("image"), "draft"), "draft");
  for (const screen of ["prayer", "holding", "screen_check"]) assert.equal(readyState(step(screen), "ready"), "ready");
  assert.equal(readyState({ interaction: "wall" as const, prompt: "", options: {} }, "ready"), "ready");
});

test("The setup API passes the database's own sentences and hides raw errors", () => {
  assert.deepEqual(deliberate({ code: "23514", message: "Wait a few minutes before sending more invites." }), { message: "Wait a few minutes before sending more invites.", status: 429 });
  assert.equal(deliberate({ code: "23514", message: "Review a new invite batch after changing the attendee list." })?.status, 409);
  assert.equal(deliberate({ code: "23514", message: "Keep the practice room separate." })?.status, 400);
  assert.equal(deliberate({ code: "23505", message: 'duplicate key value violates unique constraint "attendees_email_unique"' })?.message, "Someone in this engagement already has that email address.");
  assert.equal(deliberate({ code: "42501", message: 'new row violates row-level security policy for table "attendees"' })?.status, 403);
  assert.equal(deliberate({ code: "23514", message: 'new row for relation "engagements" violates check constraint "engagements_title_check"' }), null);
  assert.equal(deliberate({ code: "23514", message: "check_violation" }), null);
  assert.equal(deliberate({ code: "XX000", message: "Something broke in the database." }), null);
  assert.equal(deliberate(null), null);
});

test("Saving with the consensus wording empty says so", () => {
  const body = (wording: unknown) => ({
    church: { name: "Grace", timezone: "America/Toronto", values: [], leadership_rhythms: [] },
    engagement: { title: "Retreat", type: "wayfinding", status: "setup", start_date: "", end_date: "", retreat_start_date: "", retreat_end_date: "", pre_call_local: "", base_year: "2026",
      lens_names: ["Congregation", "Community", "Leadership", "Operations", "Learning"], how_the_room_decides: wording, settings: {} },
  });
  for (const empty of ["", "   ", undefined]) assert.throws(() => setupInput(body(empty)), /^Error: Explain how the room decides before saving\.$/);
});
