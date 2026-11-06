// The milestone 5 practice-room fixes (November 6 run): the palette's read-back defaults, and the overnight review's count labels.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { droppedSession, palette } from "../../lib/run-of-show/builder";
import { interactionKinds, type KindInfo } from "../../lib/interactions/kinds";
import { counted } from "../../lib/overnight/policy";

const kinds: KindInfo[] = interactionKinds.map(kind => ({ kind, label: kind, input: kind !== "content", one_per_person: false, counts: "answers", structured: false, shares_answers: true, spotlight: "none",
  named: kind === "sign" ? "always" : kind === "form" ? "never" : "setting" }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("A Read-back session from the palette starts as the Wayfinding template's step does: its prompt and a limit that never gets in the way", () => {
  const entry = palette(kinds).interactions.find(e => e.kind === "read_back")!;
  const s = droppedSession(entry, id(0), "Day 2", kinds, id(1));
  assert.equal(s.prompt, "Did we hear you right?", "the TV shows the question, not the session title in capitals");
  assert.ok(s.max_sends >= 60, `Answers per person (${s.max_sends}) covers a Yes or change and several What's missing answers for every item`);
  assert.equal(s.max_characters, 280); assert.equal(s.max_words, 50);
  // The template step is written in the read-back migration; the palette's defaults are that step's.
  const sql = readFileSync("supabase/migrations/20261106070000_read_back.sql", "utf8");
  assert.ok(sql.includes(`'prompt','${s.prompt}'`), "the template step carries the same prompt");
  assert.ok(sql.includes(`'max_sends',${s.max_sends},'max_characters',${s.max_characters},'max_words',${s.max_words}`), "and the same limits");
});

test("Only a step that asks one fixed question starts with a prompt; every other palette default is as it was", () => {
  for (const entry of palette(kinds).interactions) {
    const s = droppedSession(entry, id(0), "Day 1", kinds, id(2));
    if (entry.kind === "read_back") continue;
    assert.equal(s.prompt, "", `${entry.label} starts with no prompt`);
  }
  assert.deepEqual([droppedSession(palette(kinds).interactions.find(e => e.kind === "wall")!, id(0), "Day 1", kinds, id(3))].map(s => [s.max_sends, s.max_characters, s.max_words])[0], [3, 280, 50]);
});

test("A count in the overnight review is singular for exactly one", () => {
  assert.equal(counted(1, "easel photo"), "1 easel photo");
  assert.equal(counted(0, "easel photo"), "0 easel photos");
  assert.equal(counted(11, "scribe card"), "11 scribe cards");
  assert.equal(counted(1, "source"), "1 source");
  assert.equal(counted(2, "bullet"), "2 bullets");
  assert.equal(counted(1, "minute"), "1 minute");
  assert.equal(counted(1, "box", "boxes"), "1 box"); assert.equal(counted(2, "box", "boxes"), "2 boxes");
});

test("The tidying line of the overnight review counts through counted()", () => {
  const source = readFileSync("components/overnight/review.tsx", "utf8");
  assert.ok(source.includes('counted(r.inputs.photos ?? 0, "easel photo")') && source.includes('counted(r.inputs.cards ?? 0, "scribe card")') && source.includes('counted(r.inputs.bullets ?? 0, "bullet")'), "bullets, scribe cards and easel photos");
  assert.ok(!/\}\s+easel photos/.test(source.split("\n").filter(line => !line.includes("=== 1")).join("\n")), "no easel photos count is left plural");
});
