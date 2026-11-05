import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { mapMarkdown, type MapDraft } from "../../lib/wayfinding/map";

type Item = { title: string; part: string; interaction: string; planned_minutes: number; notes?: string; prompt?: string; offset?: number; day?: number; team_led?: boolean; options?: Record<string, unknown>; segment?: string; mode?: string };
const sql = readFileSync("supabase/migrations/20261104180000_map_templates.sql", "utf8");
const [full, half] = [...sql.matchAll(/\$tpl\$([\s\S]*?)\$tpl\$/g)].map(m => JSON.parse(m[1]) as Item[]);
const registered = ["content", "word_cloud", "wall", "ranking", "qa", "lens", "lens_summary", "candidates", "bullets", "confirm", "grid", "goals", "intent", "sign", "statements", "points", "choice", "scale", "form"];

test("both templates are in the migration with every kind registered", () => {
  assert.equal(full.length, 40); assert.equal(half.length, 41);
  for (const item of [...full, ...half]) assert.ok(registered.includes(item.interaction), `${item.title}: ${item.interaction}`);
});
test("no dashes anywhere, and no Publish to CORE session", () => {
  const text = JSON.stringify([full, half]);
  assert.ok(!/[–—]/.test(text));
  assert.ok(!/publish to core/i.test(text));
  assert.ok(!/[–—]/.test(sql));
});
test("the lens summary sign-off is 25 minutes straight after the Learning lens, before the Vision Outcomes", () => {
  for (const list of [full, half]) {
    const lens = list.findIndex(i => i.title.startsWith("Five Lenses:") && i.options?.lens === 5);
    const summary = list.findIndex(i => i.interaction === "lens_summary");
    assert.equal(list[summary].planned_minutes, 25);
    assert.ok(summary > lens && summary - lens <= 2, "only the break sits between");
    assert.ok(list.findIndex(i => i.interaction === "candidates") > summary);
  }
});
test("the team-led block ends the second day and the day-and-a-half follow-up is all team-led", () => {
  assert.equal(full.filter(i => i.team_led).length, 3);
  assert.ok(half.filter(i => i.part === "Follow-up").every(i => i.team_led));
});
test("horizon terms are written exactly", () => {
  const text = JSON.stringify([full, half]);
  assert.ok(!/10 year Future|ten-year Future|3 year Vision|1 year Outlook/i.test(text));
});

const draft: MapDraft = { status: "ok", version: 2, assembled_at: "2026-11-05T12:00:00Z", pages: {
  church: "Riverside Church", title: "Wayfinding", years: { base: 2026, future: 2036, vision: 2029, outlook: 2027 },
  page1: { mission: { text: "Help every neighbour take a next step.", empty: false }, purpose: { empty: true, why: "Add it in setup" }, values: { items: ["Hospitality"], empty: false }, strategy: { empty: true, why: "Add it in setup" },
    future: { year: 2036, lenses: [{ lens: 1, name: "Congregation", state: "signed_off", lines: ["Every Sunday the room is full."] }, { lens: 2, name: "Community", state: "not_signed_off", lines: [], why: "Not signed off yet" }] },
    vision: { year: 2029, outcomes: [{ id: "a", n: 1, title: "Leaders raised from within", status: "provisional", indicators: ["12 apprentices"] }] } },
  page2: { priorities: { empty: true, why: "Left for the church's Annual Planning" },
    outlook: { year: 2027, goals: [{ id: "g", title: "Launch the pathway", result: "8 placed", owner: "Priya", end_date: "2027-04-30" }], unmet: 1, metrics: { items: [{ text: "People in groups" }] }, celebrations: { items: [], empty: true, why: "No celebrations yet" } },
    season: { label: "Jan to Apr 2027", goals: [] , empty: true, why: "No goal meets CORE yet" }, rhythms: { items: ["Monthly elders meeting"] },
    issues: { items: [{ kind: "risk", text: "We tried all five at once", mitigations: ["Launch a season apart"] }, { kind: "tension", text: "Pace" }] } } } };

test("the text copy keeps both pages, the horizon terms and the empty states", () => {
  const md = mapMarkdown(draft);
  for (const part of ["## Page 1: Identity and direction", "## Page 2: Action", "10-year Future (2036)", "3-year Vision (2029)", "1-year Outlook (2027)", "This Year's Priorities"]) assert.ok(md.includes(part), part);
  assert.ok(md.includes("_Empty. Not signed off yet_"));
  assert.ok(md.includes("_Empty. Left for the church's Annual Planning_"));
  assert.ok(md.includes("Leaders raised from within** (provisional)"));
  assert.ok(md.includes("- Risk: We tried all five at once (Launch a season apart)"));
  assert.ok(!/[–—]/.test(md));
});
