// The live AI prompts (PRD "AI"). Each prompt lives here with its version; every AI run
// stores the version it used. The model sees answer text and counts under short refs only,
// never an attendee field. Its reply is JSON, read by `parse`; the database then applies it
// under the merge limits, which are code, not prompt.
export type AiJob = "combine_words" | "group_wall" | "summarize_wall" | "fold_questions";
export const aiJobs: AiJob[] = ["combine_words", "group_wall", "summarize_wall", "fold_questions"];

// What ai_claim hands the worker for each job.
export type CombineInputs = { raw: number; threshold: number; words: { ref: string; key: string; text: string; count: number }[] };
export type GroupInputs = { answers: { ref: string; id: string; text: string }[];
  groups: { ref: string; id: string; label: string; pinned: boolean; renamed: boolean; count: number; examples: string[] }[] };
export type SummaryInputs = { question: string; count: number; cut_at: string; answers: string[]; groups: { label: string; count: number }[] };
export type FoldInputs = { questions: { ref: string; id: string; text: string; asked: number }[] };
export type AiInputs = CombineInputs | GroupInputs | SummaryInputs | FoldInputs;

export type MergeOutput = { groups: { survivor: string; members: string[] }[] };
export type GroupOutput = { groups: { group: string; label?: string; answers: string[] }[] };
export type SummaryOutput = { summary: string };
export type AiOutput = MergeOutput | GroupOutput | SummaryOutput;

export type Prompt = { job: AiJob; version: string; system: string; maxTokens: number; user: (inputs: AiInputs) => string; parse: (text: string) => AiOutput };

// The first JSON object in the reply. A reply that isn't one is an empty answer, never a guess.
export function replyJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  try { const value: unknown = JSON.parse(text.slice(start, end + 1)); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
  catch { return {}; }
}
const refs = (value: unknown, max = 60) => Array.isArray(value) ? value.filter((x): x is string => typeof x === "string" && /^[a-z]\d{1,4}$/.test(x)).slice(0, max) : [];
function merges(text: string): MergeOutput {
  const raw = replyJson(text).groups;
  return { groups: (Array.isArray(raw) ? raw : []).slice(0, 100).flatMap(g => {
    const item = g as Record<string, unknown>;
    return typeof item?.survivor === "string" ? [{ survivor: item.survivor, members: refs(item.members, 10) }] : [];
  }) };
}

const rules = "Use only the refs you are given. Reply with one JSON object and nothing else.";

export const prompts: Record<AiJob, Prompt> = {
  combine_words: {
    job: "combine_words", version: "combine-words@1", maxTokens: 800,
    system: [
      "You tidy a live word cloud at a church team gathering run by Clearway Church Solutions. People typed short answers on their phones.",
      "Find answers that mean the same thing written differently: a synonym, a spelling, a short and long form (\"youth\" and \"young people\").",
      "Combine only true near-duplicates. Related but different ideas stay apart (\"hope\" and \"joy\" are different; \"youth\" and \"kids\" are different).",
      "Never combine an answer written as a quote. Never combine answers whose numbers differ. Never combine more than four answers into one.",
      "The survivor is the most common wording. Most answers combine with nothing; that is normal.",
      `Reply as {"groups":[{"survivor":"w1","members":["w7"]}]}, or {"groups":[]} when nothing should combine. ${rules}`,
    ].join("\n"),
    user: inputs => JSON.stringify({ words: (inputs as CombineInputs).words.map(w => ({ ref: w.ref, text: w.text, count: w.count })) }),
    parse: merges,
  },
  group_wall: {
    job: "group_wall", version: "group-wall@1", maxTokens: 1200,
    system: [
      "You group answers on an open text wall during a live session of a church team, run by Clearway Church Solutions.",
      "Put answers that share a theme into groups with short labels: one to four plain words, sentence case, no quotes, never a person's name.",
      "Use the room's own words in a label where you can. Never invent anything nobody said.",
      "You see the existing groups (g1, g2...) with a few of their answers, and the answers not yet in a group (a1, a2...).",
      "Add an answer to an existing group by its ref, or start a new group with ref n1, n2... holding at least two answers.",
      "Never add to a pinned group. Leave out an answer that fits no theme; it stays on the wall in arrival order.",
      `Reply as {"groups":[{"group":"g1","answers":["a3"]},{"group":"n1","label":"Baptisms","answers":["a1","a2"]}]}. ${rules}`,
    ].join("\n"),
    user: inputs => { const i = inputs as GroupInputs; return JSON.stringify({
      groups: i.groups.map(g => ({ ref: g.ref, label: g.label, pinned: g.pinned, answers: g.examples })),
      answers: i.answers.map(a => ({ ref: a.ref, text: a.text })) }); },
    parse: text => {
      const raw = replyJson(text).groups;
      return { groups: (Array.isArray(raw) ? raw : []).slice(0, 40).flatMap(g => {
        const item = g as Record<string, unknown>;
        if (typeof item?.group !== "string" || !/^[gn]\d{1,3}$/.test(item.group)) return [];
        return [{ group: item.group, ...(typeof item.label === "string" ? { label: item.label.slice(0, 80) } : {}), answers: refs(item.answers) }];
      }) };
    },
  },
  summarize_wall: {
    job: "summarize_wall", version: "summarize-wall@1", maxTokens: 200,
    system: [
      "You write a short read of the room for the TV at a church team's live session, run by Clearway Church Solutions.",
      "Read the question and the answers on the wall. Write one or two sentences, at most 30 words, in the present tense and plain words. It shows large on the TV, so keep it short.",
      "Say what comes up most first. Use the room's own words where you can. Never name a person. Never add anything nobody said. No quotation marks.",
      `Reply as {"summary":"..."}. ${rules}`,
    ].join("\n"),
    user: inputs => { const i = inputs as SummaryInputs; return JSON.stringify({ question: i.question, groups: i.groups, answers: i.answers }); },
    parse: text => { const s = replyJson(text).summary; return { summary: typeof s === "string" ? s.slice(0, 1000) : "" }; },
  },
  fold_questions: {
    job: "fold_questions", version: "fold-questions@1", maxTokens: 800,
    system: [
      "You fold near-duplicate questions in a live Q&A at a church team gathering, run by Clearway Church Solutions.",
      "Fold questions only when they ask the same thing in different words. Questions on the same topic that ask different things stay apart.",
      "Never fold questions whose numbers differ. Never fold a quote. Never fold more than four questions into one.",
      "The survivor is the clearest wording, usually the one asked by most people.",
      `Reply as {"groups":[{"survivor":"q1","members":["q4"]}]}, or {"groups":[]} when nothing should fold. ${rules}`,
    ].join("\n"),
    user: inputs => JSON.stringify({ questions: (inputs as FoldInputs).questions.map(q => ({ ref: q.ref, text: q.text, asked: q.asked })) }),
    parse: merges,
  },
};
export const promptVersions = Object.fromEntries(aiJobs.map(job => [job, prompts[job].version])) as Record<AiJob, string>;
