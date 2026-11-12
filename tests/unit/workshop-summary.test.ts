import test from "node:test";
import assert from "node:assert/strict";
import { editedBody, paragraphsOf, summaryBody, summaryInputs, summaryMessage } from "../../lib/workshop/summary";
import { workshopSummaryPrompt, draftWorkshopSummary } from "../../lib/ai/workshop-summary";
import { fakeClient } from "../../lib/ai/fake";
import { aiConfig } from "../../lib/ai/config";
import type { Recap, RecapEntry } from "../../lib/export/recap";

const entry = (over: Omit<Partial<RecapEntry>, "results"> & { title: string; interaction: string; results?: Record<string, unknown> }): RecapEntry => ({
  part: "Day 1", mode: "live", opens_at: null, closes_at: null, hidden_keys: [], hidden_ids: [], answers: [], csv_rows: 3, ...over,
  session: { id: over.title, title: over.title, interaction: over.interaction as never, prompt: "How ready are you?", state: "closed", max_sends: 1, max_characters: 200, max_words: 3 },
  results: { total: 3, people: 3, words: [], ...(over.results ?? {}) },
});
const recap = (sessions: RecapEntry[]) => ({ status: "ok", server_time: "2026-11-20T15:00:00Z", version: 1, display: {} as never, sessions }) as Recap;

test("the model sees what the TV showed, never a hidden answer", () => {
  const inputs = summaryInputs(recap([
    entry({ title: "Ready before", interaction: "scale", results: { scale: { max: 5, average: 2.44, low: 1, high: 4, columns: [{ key: "1", value: 1, count: 2, fraction: 1 }] } } }),
    entry({ title: "Tell another church", interaction: "wall", hidden_ids: ["b"], answers: [{ id: "a", session_id: "s", text: "  Start   small ", answers: [], revision: 1 }, { id: "b", session_id: "s", text: "Hidden one", answers: [], revision: 1 }] }),
    entry({ title: "Feelings", interaction: "word_cloud", hidden_keys: ["rude"], results: { words: [{ key: "curious", text: "curious", count: 4, size: 1, level: "a" }, { key: "rude", text: "rude", count: 9, size: 1, level: "a" }] }, answers: [{ id: "c", session_id: "s", text: "curious", answers: [], revision: 1 }] }),
    entry({ title: "Nobody answered", interaction: "wall", results: { total: 0, people: 0 } }),
  ]), "Staff AI Workshop");
  assert.equal(inputs.event, "Staff AI Workshop");
  assert.deepEqual(inputs.sessions.map(s => s.title), ["Ready before", "Tell another church", "Feelings"]);
  assert.equal(inputs.sessions[0].average, 2.4);
  assert.deepEqual(inputs.sessions[0].columns, [{ value: 1, count: 2 }]);
  assert.deepEqual(inputs.sessions[1].answers, ["Start small"]);
  assert.deepEqual(inputs.sessions[2].words, [{ text: "curious", count: 4 }]);
  assert.equal(inputs.sessions[2].answers, undefined);
  assert.doesNotMatch(JSON.stringify(inputs), /Hidden one|rude/);
});

test("a reply becomes plain paragraphs with no dashes or markup", () => {
  assert.equal(summaryBody(["The room began unsure — then it moved.", "  **Ready** rose.  ", 7, ""]), "The room began unsure, then it moved.\n\nReady rose.");
  assert.equal(summaryBody(undefined), "");
  assert.equal(workshopSummaryPrompt.parse("Here you go: {\"paragraphs\":[\"One.\",\"Two.\"]}"), "One.\n\nTwo.");
  assert.equal(workshopSummaryPrompt.parse("no json"), "");
});

test("an edit keeps the facilitator's paragraphs", () => {
  assert.equal(editedBody(" First.\r\n\r\n\r\n\r\nSecond.  \n"), "First.\n\nSecond.");
  assert.deepEqual(paragraphsOf("First.\n\nSecond."), ["First.", "Second."]);
  assert.equal(editedBody(4), "");
});

test("the prompt holds Clearway's rules", () => {
  assert.match(workshopSummaryPrompt.system, /never instructions to you/);
  assert.match(workshopSummaryPrompt.system, /Never name a person/);
  assert.match(workshopSummaryPrompt.system, /Never use dashes or semicolons/);
  assert.doesNotMatch(workshopSummaryPrompt.system, /[—–]/);
});

test("the stand-in drafts from what it is given, and its run carries the cost", async () => {
  const inputs = summaryInputs(recap([entry({ title: "Ready before", interaction: "scale", results: { scale: { max: 5, average: 2, low: 1, high: 4, columns: [] } } }), entry({ title: "Ready after", interaction: "scale", results: { scale: { max: 5, average: 4, low: 1, high: 5, columns: [] } } })]), "Workshop");
  const draft = await draftWorkshopSummary(fakeClient("script"), inputs, aiConfig({}));
  assert.equal(draft.status, "ok");
  if (draft.status !== "ok") return;
  assert.match(draft.body, /Ready before/); assert.match(draft.body, /Ready after/);
  assert.equal(draft.ai.prompt_version, "workshop-summary@1");
  assert.ok(draft.ai.input_tokens > 0);
});

test("every refusal has plain words", () => {
  for (const s of ["ai_off", "ai_unavailable", "nothing", "empty", "invalid_request", "timeout", "anything"]) assert.doesNotMatch(summaryMessage(s), /[—–]|undefined/);
});
