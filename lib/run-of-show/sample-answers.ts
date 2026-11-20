import { optionItems } from "../interactions/bars";
import { gridOf } from "../interactions/grid-form-sign";
import type { QaQuestion } from "../interactions/qa";
import type { InteractionKind } from "../interactions/kinds";
import type { LiveAnswer, LiveResults } from "../live/types";
import type { ShowSession } from "./types";

const lines: Partial<Record<InteractionKind, readonly string[]>> = {
  word_cloud: ["Focus", "Trust", "Clear direction", "Focus"],
  wall: ["Make time to listen.", "Agree on the next step.", "Share what we learn."],
  qa: ["What happens next?", "How can we help?", "When will we start?"],
  lens: ["We listen well.", "Leaders make room for new voices.", "The team moves together."],
  lens_summary: ["Keep the first line.", "Include more people.", "Name a next step."],
  four_lists: ["Clear roles", "Competing priorities", "A shared plan", "Next steps"],
  candidates: ["Care for the team", "Welcome new people", "Share responsibility"],
  goals: ["Train two leaders", "Make a welcome plan", "Review progress monthly"],
  bullets: ["We know what matters.", "We agree on the next step.", "People know how to help."],
  confirm: ["Keep it", "Rename it", "Discuss it"],
  read_back: ["Looks right", "Name who owns it", "Add the timing"],
  intent: ["Listen first", "Share the plan", "Check in next month"],
  form: ["A clear next step", "Time together", "A shared plan"],
  sign: ["Alex", "Jordan", "Sam"],
};

export function sampleAnswers(session: Pick<ShowSession, "id" | "interaction"> & { options?: Record<string, unknown> }): { answers: LiveAnswer[]; results: LiveResults } {
  const { interaction, options = {}, id } = session;
  const items = optionItems(options).slice(0, 5);
  const examples = lines[interaction] ?? (interaction === "scale" ? ["2", "3", "4"] : interaction === "grid" ? ["First item", "Second item", "Third item"] : items.map(item => item.text));
  const answers = examples.map((text, index) => ({
    id: `sample-${index}`, session_id: id, text, answers: [{ key: text.toLowerCase(), text }], revision: 0,
  }));
  const results: LiveResults = { total: answers.length, people: answers.length, words: [] };
  if (interaction === "word_cloud") {
    results.words = [...new Set(examples)].map((text, order) => {
      const count = examples.filter(word => word === text).length;
      return { key: text.toLowerCase(), text, count, size: count > 1 ? 128 : 64, level: count > 1 ? "leader" : "single", order };
    });
  } else if (["choice", "ranking", "points", "statements"].includes(interaction)) {
    const weights = [3, 2, 1, 1, 1].slice(0, items.length);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    results.bars = items.map((item, index) => {
      const count = weights[index], percent = Math.round(count * 100 / total);
      return { ...item, count, percent, place: index + 1, fraction: count / 3, leader: index === 0, average: 4.5 - index / 2, share: percent, agree: percent };
    });
  } else if (interaction === "scale") {
    const max = Math.min(10, Math.max(2, Number(options.max) || 5));
    const scores = [Math.ceil(max / 2), Math.max(1, max - 1), max];
    results.scale = { max, average: scores.reduce((sum, score) => sum + score, 0) / scores.length, low: scores[0], high: max,
      columns: Array.from({ length: max }, (_, i) => {
        const count = scores.filter(score => score === i + 1).length;
        return { key: String(i + 1), value: i + 1, count, fraction: count / scores.length };
      }) };
  } else if (interaction === "grid") {
    const grid = gridOf(options);
    const gridItems = grid.items.length ? grid.items.slice(0, 3) : examples.map((text, i) => ({ key: `sample-${i}`, text }));
    results.items = gridItems.map((item, i) => ({ ...item, num: i + 1, count: 1, x: [0.25, 0.5, 0.8][i], y: [0.75, 0.38, 0.65][i] }));
  } else if (interaction === "qa") {
    results.questions = answers.map(({ id, text }, index): QaQuestion => ({
      id, text, ids: [id], askers: 1, votes: 2 - index, people: 3 - index, score: 3 - index, rank: index + 1,
      folded: 0, answered: false, edited: false, at: index,
    }));
  }
  return { answers, results };
}
