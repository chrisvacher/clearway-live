// The live AI prompts (PRD "AI"). Each prompt lives here with its version; every AI run
// stores the version it used. The model sees answer text and counts under short refs only,
// never an attendee field. Its reply is JSON, read by `parse`; the database then applies it
// under the merge limits, which are code, not prompt.
export type AiJob = "combine_words" | "group_wall" | "summarize_wall" | "fold_questions" | "merge_reasons";
export const aiJobs: AiJob[] = ["combine_words", "group_wall", "summarize_wall", "fold_questions", "merge_reasons"];

// What ai_claim hands the worker for each job.
export type CombineInputs = { raw: number; threshold: number; words: { ref: string; key: string; text: string; count: number }[] };
export type GroupInputs = { answers: { ref: string; id: string; text: string }[];
  groups: { ref: string; id: string; label: string; pinned: boolean; renamed: boolean; count: number; examples: string[] }[] };
export type SummaryInputs = { question: string; count: number; cut_at: string; answers: string[]; groups: { label: string; count: number }[] };
export type FoldInputs = { questions: { ref: string; id: string; text: string; asked: number }[] };
// The pre-mortem's reasons (it is 2029 and the plan failed): text and how many people placed each.
export type ReasonInputs = { reasons: { ref: string; key: string; text: string; count: number }[]; total: number };
export type AiInputs = CombineInputs | GroupInputs | SummaryInputs | FoldInputs | ReasonInputs;

export type MergeOutput = { groups: { survivor: string; members: string[] }[] };
export type GroupOutput = { groups: { group: string; label?: string; answers: string[] }[] };
export type SummaryOutput = { summary: string };
export type AiOutput = MergeOutput | GroupOutput | SummaryOutput;

export type Prompt = { job: AiJob; version: string; system: string; maxTokens: number; user: (inputs: AiInputs) => string; parse: (text: string, inputs: AiInputs) => AiOutput };

// The first JSON object in the reply. A reply that isn't one is an empty answer, never a guess.
export function replyJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  try { const value: unknown = JSON.parse(text.slice(start, end + 1)); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
  catch { return {}; }
}

// The model is asked for refs, but sometimes answers with the text it saw ("youth" for w3),
// a ref in capitals, or a bare number. Each is read back to the ref it means, from the
// run's own inputs; anything that matches nothing is dropped, never guessed.
const norm = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
type Resolver = (value: unknown) => string | null;
function resolver(items: { ref: string; texts: (string | undefined)[] }[]): Resolver {
  const known = new Set(items.map(i => i.ref)), prefix = items[0]?.ref.match(/^[a-z]/)?.[0];
  const byText = new Map<string, string[]>();
  for (const item of items) for (const text of new Set(item.texts.filter((t): t is string => typeof t === "string").map(norm))) {
    if (text) byText.set(text, [...(byText.get(text) ?? []), item.ref]);
  }
  // Two answers with the same words: each mention takes the next one not yet named.
  const taken = new Set<string>();
  return value => {
    if (value && typeof value === "object" && !Array.isArray(value)) { const o = value as Record<string, unknown>; value = o.ref ?? o.text; }
    if (typeof value === "number" && Number.isInteger(value)) value = String(value);
    if (typeof value !== "string") return null;
    const v = norm(value);
    if (known.has(v)) { taken.add(v); return v; }
    const hits = byText.get(v);
    if (hits) { const ref = hits.find(r => !taken.has(r)) ?? hits[0]; taken.add(ref); return ref; }
    if (prefix && /^\d{1,4}$/.test(v) && known.has(`${prefix}${Number(v)}`)) { const ref = `${prefix}${Number(v)}`; taken.add(ref); return ref; }
    return null;
  };
}
const listOf = (value: unknown) => Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
function merges(text: string, items: { ref: string; texts: (string | undefined)[] }[]): MergeOutput {
  const raw = replyJson(text).groups, resolve = resolver(items);
  return { groups: (Array.isArray(raw) ? raw : []).slice(0, 100).flatMap(g => {
    const item = (g && typeof g === "object" ? g : {}) as Record<string, unknown>;
    const survivor = resolve(item.survivor);
    if (!survivor) return [];
    const members = [...new Set(listOf(item.members).map(resolve).filter((r): r is string => r !== null && r !== survivor))].slice(0, 10);
    return members.length ? [{ survivor, members }] : [];
  }) };
}

// The wall's groups. A new group may come back with no group key, a label in its place or a
// bare number: each new label gets its own n ref. A group named by an existing group's label
// is that group. Items for the same group are joined, so one new group is made once.
function wallGroups(text: string, inputs: GroupInputs): GroupOutput {
  const raw = replyJson(text).groups, resolve = resolver(inputs.answers.map(a => ({ ref: a.ref, texts: [a.text] })));
  const existing = new Map(inputs.groups.map(g => [g.ref, g])), byLabel = new Map<string, string>();
  for (const g of inputs.groups) if (!byLabel.has(norm(g.label))) byLabel.set(norm(g.label), g.ref);
  const fresh = new Map<string, string>(), out = new Map<string, { group: string; label?: string; answers: string[] }>();
  const newRef = (...keys: string[]) => {
    const ref = keys.map(k => fresh.get(k)).find(Boolean) ?? `n${fresh.size ? Math.max(...[...fresh.values()].map(r => Number(r.slice(1)))) + 1 : 1}`;
    for (const k of keys) fresh.set(k, ref);
    return ref;
  };
  for (const g of (Array.isArray(raw) ? raw : []).slice(0, 40)) {
    const item = (g && typeof g === "object" ? g : {}) as Record<string, unknown>;
    const given = typeof item.group === "number" ? String(item.group) : typeof item.group === "string" ? item.group.trim() : "";
    const labelText = [item.label, item.name, item.title].find((x): x is string => typeof x === "string" && x.trim() !== "");
    let label = labelText?.trim().slice(0, 80);
    let ref: string | null = null;
    const asRef = given.toLowerCase();
    if (/^g\d{1,3}$/.test(asRef)) ref = asRef; // an unknown g ref is the database's to refuse
    else if (/^n\d{1,3}$/.test(asRef)) ref = label && byLabel.has(norm(label)) ? byLabel.get(norm(label))! : newRef(`ref:${asRef}`, ...(label ? [`label:${norm(label)}`] : []));
    else if (/^\d{1,3}$/.test(asRef) && !label) ref = existing.has(`g${Number(asRef)}`) ? `g${Number(asRef)}` : null;
    else {
      // The group given as its label, or no group at all.
      if (given && !/^\d{1,3}$/.test(given)) label ??= given.slice(0, 80);
      if (!label) continue;
      ref = byLabel.get(norm(label)) ?? newRef(`label:${norm(label)}`);
    }
    if (!ref) continue;
    const answers = listOf(item.answers).map(resolve).filter((r): r is string => r !== null);
    const into = out.get(ref);
    if (into) { into.answers.push(...answers.filter(a => !into.answers.includes(a))); if (!into.label && label) into.label = label; continue; }
    if (ref.startsWith("g") && existing.has(ref) && label && norm(label) === norm(existing.get(ref)!.label)) label = undefined;
    out.set(ref, { group: ref, ...(label ? { label } : {}), answers: [...new Set(answers)].slice(0, 60) });
  }
  return { groups: [...out.values()] };
}

// The summary shows large on the TV, so the word cap is code, not only prompt: cut at the
// last sentence end that keeps most of it, else at a clause, else at the cap, and end clean.
export const summaryWords = 30;
const dangling = new Set(["and", "or", "but", "nor", "so", "yet", "with", "without", "the", "a", "an", "of", "to", "for", "in", "on", "at", "as", "by", "from", "into", "that", "which", "who", "while", "than", "its", "their", "our", "his", "her", "is", "are", "was", "were", "be", "like", "about", "over", "more", "most"]);
export function capWords(text: string, max = summaryWords): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(" ");
  const head = words.slice(0, max), keep = Math.ceil(max / 2);
  const end = (re: RegExp) => { for (let i = head.length - 1; i >= keep - 1; i--) if (re.test(head[i])) return i; return -1; };
  const sentence = end(/[.!?]["')\]]*$/);
  if (sentence >= 0) return head.slice(0, sentence + 1).join(" ");
  const clause = end(/[,;:]["')\]]*$/);
  let cut = clause >= 0 ? head.slice(0, clause + 1) : head;
  const bare = (w: string) => w.replace(/[^\p{L}\p{N}']+$/u, "");
  cut = cut.map((w, i) => i === cut.length - 1 ? bare(w) : w);
  while (cut.length > keep && (dangling.has(bare(cut[cut.length - 1]).toLowerCase()) || !bare(cut[cut.length - 1]))) cut.pop();
  cut[cut.length - 1] = bare(cut[cut.length - 1]);
  return `${cut.join(" ")}.`;
}

const rules = "Use only the refs you are given. Reply with one JSON object and nothing else.";

export const prompts: Record<AiJob, Prompt> = {
  combine_words: {
    job: "combine_words", version: "combine-words@2", maxTokens: 800,
    system: [
      "You tidy a live word cloud at a church team gathering run by Clearway Church Solutions. People typed short answers on their phones.",
      "Find answers that mean the same thing written differently: a synonym, a spelling, a short and long form (\"youth\" and \"young people\").",
      "Combine only true near-duplicates. Related but different ideas stay apart (\"hope\" and \"joy\" are different; \"youth\" and \"kids\" are different).",
      "Never combine an answer written as a quote. Never combine answers whose numbers differ. Never combine more than four answers into one.",
      "The survivor is the most common wording. Most answers combine with nothing; that is normal.",
      "Name every answer by its ref (w1, w2...), never by its text. If w1 is \"youth\" and w3 is \"young people\", the survivor is \"w1\", not \"youth\": {\"groups\":[{\"survivor\":\"w1\",\"members\":[\"w3\"]}]}.",
      `Reply as {"groups":[{"survivor":"w1","members":["w7"]}]}, or {"groups":[]} when nothing should combine. ${rules}`,
    ].join("\n"),
    user: inputs => JSON.stringify({ words: (inputs as CombineInputs).words.map(w => ({ ref: w.ref, text: w.text, count: w.count })) }),
    parse: (text, inputs) => merges(text, (inputs as CombineInputs).words?.map(w => ({ ref: w.ref, texts: [w.text, w.key] })) ?? []),
  },
  group_wall: {
    job: "group_wall", version: "group-wall@2", maxTokens: 1200,
    system: [
      "You group answers on an open text wall during a live session of a church team, run by Clearway Church Solutions.",
      "Put answers that share a theme into groups with short labels: one to four plain words, sentence case, no quotes, never a person's name.",
      "Use the room's own words in a label where you can. Never invent anything nobody said.",
      "You see the existing groups (g1, g2...) with a few of their answers, and the answers not yet in a group (a1, a2...).",
      "Add an answer to an existing group by its ref, or start a new group with ref n1, n2... holding at least two answers.",
      "Every group in your reply has a \"group\" ref: g1, g2... for an existing group, n1, n2... for a new one, and a new group also has a \"label\". Name answers by their refs (a1, a2...), never by their text.",
      "Never add to a pinned group. Leave out an answer that fits no theme; it stays on the wall in arrival order.",
      `Reply as {"groups":[{"group":"g1","answers":["a3"]},{"group":"n1","label":"Baptisms","answers":["a1","a2"]}]}. ${rules}`,
    ].join("\n"),
    user: inputs => { const i = inputs as GroupInputs; return JSON.stringify({
      groups: i.groups.map(g => ({ ref: g.ref, label: g.label, pinned: g.pinned, answers: g.examples })),
      answers: i.answers.map(a => ({ ref: a.ref, text: a.text })) }); },
    parse: (text, inputs) => wallGroups(text, { answers: (inputs as GroupInputs).answers ?? [], groups: (inputs as GroupInputs).groups ?? [] }),
  },
  summarize_wall: {
    job: "summarize_wall", version: "summarize-wall@2", maxTokens: 200,
    system: [
      "You write a short read of the room for the TV at a church team's live session, run by Clearway Church Solutions.",
      "Read the question and the answers on the wall. Write one or two sentences, 30 words at most (count them), in the present tense and plain words. It shows large on the TV, so keep it short: 20 to 25 words is best.",
      "Say what comes up most first. Use the room's own words where you can. Never name a person. Never add anything nobody said. No quotation marks.",
      `Reply as {"summary":"..."}. ${rules}`,
    ].join("\n"),
    user: inputs => { const i = inputs as SummaryInputs; return JSON.stringify({ question: i.question, groups: i.groups, answers: i.answers }); },
    parse: text => { const s = replyJson(text).summary; return { summary: typeof s === "string" ? capWords(s.slice(0, 1000)) : "" }; },
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
    parse: (text, inputs) => merges(text, (inputs as FoldInputs).questions?.map(q => ({ ref: q.ref, texts: [q.text] })) ?? []),
  },
  merge_reasons: {
    job: "merge_reasons", version: "merge-reasons@1", maxTokens: 800,
    system: [
      "You tidy the reasons in a pre-mortem at a church team gathering run by Clearway Church Solutions. The team imagines their plan has failed and writes why.",
      "Merge reasons only when they name the same cause in different words (\"We ran out of volunteers\" and \"Not enough people to serve\"). Reasons that share a topic but name different causes stay apart (\"We ran out of money\" and \"We spent the money badly\" are different).",
      "Never merge a reason written as a quote. Never merge reasons whose numbers differ. Never merge more than four reasons into one.",
      "The survivor is the clearest wording, usually the one more people placed. Most reasons merge with nothing; that is normal. Never reword a reason.",
      "Name every reason by its ref (r1, r2...), never by its text.",
      `Reply as {"groups":[{"survivor":"r1","members":["r4"]}]}, or {"groups":[]} when nothing should merge. ${rules}`,
    ].join("\n"),
    user: inputs => JSON.stringify({ reasons: (inputs as ReasonInputs).reasons.map(r => ({ ref: r.ref, text: r.text, placed: r.count })) }),
    parse: (text, inputs) => merges(text, (inputs as ReasonInputs).reasons?.map(r => ({ ref: r.ref, texts: [r.text] })) ?? []),
  },
};
export const promptVersions = Object.fromEntries(aiJobs.map(job => [job, prompts[job].version])) as Record<AiJob, string>;

// ---------- The overnight draft (milestone 5, step 2) ----------
// After Day 1 closes, one deeper call tidies each provisional Vision Outcome and its 3-year Vision bullets
// from the room's phone bullets, the scribe's cards and the easel photos. It is not one of the live jobs: it
// belongs to the engagement, not a step, and runs through its own claim, apply and fail (overnight_claim,
// overnight_apply, overnight_fail), with the same run log. The 10-year Future is not drafted here: the room
// signed the lens summaries off on Day 1. The model sees text, counts and images under short refs (o1, o1b2,
// c3, p2), never an attendee, a speaker or an id. What it may keep is code, not prompt: the database refuses
// a bullet with no source, a number no card or photo has, a quote that is not word for word, and a voice or
// tension that is not the room's own words.
export type OvernightInputs = { year: number; horizon: string;
  outcomes: { ref: string; id: string; title: string; description: string; bullets: { ref: string; id: string; text: string }[] }[];
  cards: { ref: string; id: string; kind: string; text: string; detail: { why?: string; views?: string[]; risk?: string; date?: string; owner?: string }; step: string }[];
  photos: { ref: string; id: string; step: string; caption: string; path: string; type: string; bytes: number; readable: boolean; typed: string | null }[] };
export type OvernightOutput = { outcomes: { outcome: string; bullets: { text: string; sources: { ref: string; excerpt?: string }[] }[];
  voices: { text: string; source: string }[]; tensions: { text: string; source: string }[] }[]; unreadable: { photo: string; outcome?: string }[] };
export type OvernightPrompt = { job: "overnight_draft"; version: string; system: string; maxTokens: number; user: (inputs: OvernightInputs, images?: string[]) => string; parse: (text: string, inputs: OvernightInputs) => OvernightOutput };

const textOf = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
const refOf = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : typeof value === "number" && Number.isInteger(value) ? String(value) : "";
export const overnightPrompt: OvernightPrompt = {
  job: "overnight_draft", version: "overnight-draft@1", maxTokens: 6000,
  system: [
    "You prepare the overnight first pass for a church team's two-day Wayfinding retreat, run by Clearway Church Solutions. Day 1 has closed. Two facilitators will review your draft in the morning, so it must be easy to check.",
    "You tidy each provisional Vision Outcome. Each has bullets the room typed on their phones (refs like o1b1), and you also see the scribe's cards (c1, c2...) and easel photos (p1, p2...) from Day 1. The bullets belong to the 3-year Vision, the picture of the outcome three years from now. Write them in the present tense, as things that are true then.",
    "Never invent. Every bullet you write must rest on at least one source: a room bullet, a scribe card or an easel photo, named by its ref. If the sources do not support a bullet, leave it out. A number or a date in a bullet must appear in a scribe card or an easel photo you name as its source. Never name a person, a speaker or an attendee; if a source names someone, write around it.",
    "Stay close to the room's words. Where one room bullet already says it well, give that bullet's words exactly, with that one source. Tidy only spelling, grammar and length (280 characters at most). Merge room bullets that say the same thing, and name each one as a source. Write at most eight bullets for an outcome.",
    "An outcome with little behind it stays thin. Give it fewer bullets, or none. Do not stretch it to look finished.",
    "Keep two lists apart for every outcome. Voices not to lose are strong lines worth keeping in the room's own words, from a quote or decision card or a room bullet. Tensions the room named are disagreements or open questions the room said out loud, from a tension or question card. Copy each one word for word from its source, with that source's ref. Never turn a tension into a bullet. Never turn a voice into a tension. Give at most three of each.",
    "Use Clearway's terms exactly: 3-year Vision, 10-year Future, 1-year Outlook, Vision Outcomes. Do not draft the 10-year Future; the room signed it off already. Do not draft goals.",
    "A photo is attached as an image after the text, in ref order. If an image is too blurry or too small to read, say so in unreadable with its ref, and the outcome it belongs to when you know it; do not guess its words. A photo with typed words uses those words.",
    "Name outcomes by their ref (o1, o2...), never by their title. Name sources by their ref, and an excerpt only if it is a word-for-word piece of the source.",
    "Reply as {\"outcomes\":[{\"outcome\":\"o1\",\"bullets\":[{\"text\":\"...\",\"sources\":[{\"ref\":\"o1b1\"},{\"ref\":\"c2\",\"excerpt\":\"...\"}]}],\"voices\":[{\"text\":\"...\",\"source\":\"c1\"}],\"tensions\":[{\"text\":\"...\",\"source\":\"c3\"}]}],\"unreadable\":[{\"photo\":\"p2\",\"outcome\":\"o1\"}]}. Use only the refs you are given. Reply with one JSON object and nothing else.",
  ].join("\n"),
  user: (inputs, images = []) => JSON.stringify({ horizon: inputs.horizon, year: inputs.year,
    outcomes: inputs.outcomes.map(o => ({ ref: o.ref, title: o.title, description: o.description, bullets: o.bullets.map(b => ({ ref: b.ref, text: b.text })) })),
    cards: inputs.cards.map(c => ({ ref: c.ref, kind: c.kind, text: c.text, ...(c.detail?.why ? { why: c.detail.why } : {}), ...(c.detail?.views?.length ? { views: c.detail.views } : {}),
      ...(c.detail?.risk ? { risk: c.detail.risk } : {}), ...(c.detail?.date ? { date: c.detail.date } : {}), step: c.step })),
    photos: inputs.photos.map(p => ({ ref: p.ref, step: p.step, caption: p.caption, ...(p.typed ? { typed: p.typed } : {}), image: images.includes(p.ref) })) }),
  parse: (text, inputs) => {
    const raw = replyJson(text), list = (value: unknown) => Array.isArray(value) ? value : [];
    const note = (value: unknown) => { const o = (value && typeof value === "object" ? value : {}) as Record<string, unknown>; const t = textOf(o.text, 400), source = refOf(o.source ?? o.ref); return t && source ? [{ text: t, source }] : []; };
    return {
      outcomes: list(raw.outcomes).slice(0, 12).flatMap(value => {
        const o = (value && typeof value === "object" ? value : {}) as Record<string, unknown>, outcome = refOf(o.outcome ?? o.ref);
        if (!inputs.outcomes.some(x => x.ref === outcome)) return [];
        return [{ outcome,
          bullets: list(o.bullets).slice(0, 8).flatMap(b => {
            const item = (b && typeof b === "object" ? b : {}) as Record<string, unknown>, t = textOf(item.text, 280);
            const sources = list(item.sources).slice(0, 6).flatMap(s => {
              const so: Record<string, unknown> = typeof s === "object" && s ? s as Record<string, unknown> : { ref: s }, ref = refOf(so.ref), excerpt = textOf(so.excerpt, 280);
              return ref ? [{ ref, ...(excerpt ? { excerpt } : {}) }] : [];
            });
            return t ? [{ text: t, sources }] : [];
          }),
          voices: list(o.voices).slice(0, 3).flatMap(note), tensions: list(o.tensions).slice(0, 3).flatMap(note) }];
      }),
      unreadable: list(raw.unreadable).slice(0, 24).flatMap(value => {
        const o = (value && typeof value === "object" ? value : { photo: value }) as Record<string, unknown>, photo = refOf(o.photo ?? o.ref), outcome = refOf(o.outcome);
        return photo ? [{ photo, ...(outcome ? { outcome } : {}) }] : [];
      }),
    };
  },
};
export const overnightVersion = overnightPrompt.version;
