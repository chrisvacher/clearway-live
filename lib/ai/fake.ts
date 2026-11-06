// Fake model clients for tests and the browser kits. Never used on production
// (lib/ai/client.ts refuses it there), never calls the API.
//  * recordedClient: answers each prompt with a recorded reply (the fixture tests).
//  * fakeClient("script"): a stand-in that follows the prompts' rules on any input, so a
//    kit can run the room end to end. A control file (CLEARWAY_AI_FAKE_CONTROL) makes it
//    slow or failing, for FAIL-09, or gives the summary it names (a long one, for the TV's fit).
import { readFileSync } from "node:fs";
import type { AiCall, AiClient, AiReply } from "./client";
import { heardPrompt, overnightPrompt, prompts, replyJson, themesPrompt, type AiJob, type HeardInputs, type HeardOutput, type OvernightOutput, type ThemesOutput } from "./prompts";

export function jobOf(call: Pick<AiCall, "system">): AiJob | null {
  return (Object.values(prompts).find(p => p.system === call.system)?.job) ?? null;
}
const tokens = (text: string) => Math.ceil(text.length / 4);
const reply = (call: AiCall, text: string): AiReply => ({ text, inputTokens: tokens(call.system + call.user), outputTokens: tokens(text) });

// A recorded reply per job and user message.
export function recordedClient(recordings: { job: AiJob | "overnight_draft" | "draft_discover_themes" | "draft_what_we_heard"; user: string; reply: string }[]): AiClient & { calls: AiCall[] } {
  const calls: AiCall[] = [];
  return {
    calls, model: () => "recorded-fixture",
    async complete(call) {
      calls.push(call);
      const job = jobOf(call) ?? (isOvernight(call) ? "overnight_draft" : isThemes(call) ? "draft_discover_themes" : isHeard(call) ? "draft_what_we_heard" : null), hit = recordings.find(r => r.job === job && r.user === call.user);
      if (!hit) throw new Error(`No recorded reply for ${job}`);
      return reply(call, hit.reply);
    },
  };
}

// ---------- The scripted stand-in ----------
const synonyms: string[][] = [
  ["youth", "young people", "youth group", "teenagers", "teens"], ["kids", "children", "kid", "child"],
  ["community", "neighbourhood", "neighborhood", "neighbours"], ["generosity", "giving", "generous"],
  ["worship", "praise"], ["prayer", "praying", "pray"], ["welcome", "welcoming", "hospitality"],
];
const themes: [string, RegExp][] = [
  ["Baptisms", /bapti/i], ["Alpha", /\balpha\b/i], ["Young families", /famil/i], ["Youth", /youth|teen|student/i],
  ["Prayer", /pray/i], ["Worship", /worship|music/i], ["Generosity", /giv|generos/i], ["Serving", /serv|volunteer/i],
];
const words = (text: string) => new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
  .filter(w => w.length > 3 && !["what", "when", "will", "does", "there", "about", "with", "have", "this", "that", "your", "from"].includes(w))
  .map(w => w.replace(/s$/, "")).map(w => sameAs[w] ?? w));
// Words a question uses for the same thing ("When does it open?", "What date will it be ready?").
const sameAs: Record<string, string> = { ready: "open", finished: "open", finish: "open", done: "open", date: "open", opening: "open" };
const shared = (a: Set<string>, b: Set<string>) => [...a].filter(w => b.has(w)).length;

// The lens wall's stand-in themes, in the present tense the lens sentences are written in.
const lensThemes: [string, RegExp][] = [
  ["Welcome at the door", /welcom|stranger|guest|visitor/i], ["Eating together", /\beat|meal|table|food|dinner/i], ["Prayer first", /pray/i],
  ["Leaders raised here", /lead|apprentic|mentor/i], ["Shared work", /\bserv|volunteer|share the work|share the load/i], ["Known neighbours", /neighbo/i],
  ["Always learning", /learn|disciple|grow|teach/i],
];
function scriptedGroups(input: Record<string, unknown>, themes: [string, RegExp][], key: "answers" | "sentences") {
  const answers = (input[key] ?? []) as { ref: string; text: string }[], existing = (input.groups ?? []) as { ref: string; label: string; pinned: boolean }[];
  const out = new Map<string, { group: string; label?: string; answers: string[] }>(); let n = 0;
  for (const a of answers) {
    const theme = themes.find(([, re]) => re.test(a.text)); if (!theme) continue;
    const group = existing.find(g => g.label.toLowerCase() === theme[0].toLowerCase() || themes.find(([l]) => l === theme[0])![1].test(g.label));
    if (group?.pinned) continue;
    const k = group ? group.ref : theme[0];
    if (!out.has(k)) out.set(k, group ? { group: group.ref, answers: [] } : { group: `n${++n}`, label: theme[0], answers: [] });
    out.get(k)!.answers.push(a.ref);
  }
  return JSON.stringify({ groups: [...out.values()] });
}

// The overnight draft's stand-in: each room bullet becomes a tidied bullet that rests on it (a bullet with a number
// keeps the room's exact words, since only a card or photo may bring a number), a card that shares words with an
// outcome's bullets joins the first bullet as a source and, as a quote or tension, is kept as a voice or tension in
// the card's own words. An outcome with no bullets stays thin. A photo with no image and no typed words is unreadable.
export const isOvernight = (call: Pick<AiCall, "system">) => call.system === overnightPrompt.system;
function scriptedOvernight(call: AiCall): string {
  const input = replyJson(call.user) as { outcomes?: { ref: string; bullets: { ref: string; text: string }[] }[]; cards?: { ref: string; kind: string; text: string }[]; photos?: { ref: string; typed?: string; image: boolean }[] };
  const tidy = (text: string) => { const t = text.trim().replace(/\s+/g, " "); return /\d/.test(t) ? t : `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? "" : "."}`; };
  const out: OvernightOutput = { outcomes: [], unreadable: [] };
  for (const o of input.outcomes ?? []) {
    const mine = new Set(o.bullets.flatMap(b => [...words(b.text)]));
    const related = (input.cards ?? []).filter(c => shared(words(c.text), mine) >= 2);
    const bullets = o.bullets.map((b, i) => ({ text: tidy(b.text), sources: [{ ref: b.ref }, ...(i === 0 ? related.filter(c => ["quote", "decision"].includes(c.kind)).slice(0, 1).map(c => ({ ref: c.ref })) : [])] }));
    out.outcomes.push({ outcome: o.ref, bullets,
      voices: related.filter(c => c.kind === "quote").slice(0, 3).map(c => ({ text: c.text, source: c.ref })),
      tensions: related.filter(c => c.kind === "tension" || c.kind === "question").slice(0, 3).map(c => ({ text: c.text, source: c.ref })) });
  }
  for (const p of input.photos ?? []) if (!p.image && !p.typed) out.unreadable.push({ photo: p.ref });
  return JSON.stringify(out);
}

// The Discover themes' stand-in: a theme for each pattern that at least one note (or card) matches, resting on every one that
// does, with the first matching sentence of the first note as its quote, word for word (the most agreed card's words for the
// Four Helpful Lists). It skips any label already on the page or rejected, and writes no count, as the prompt asks.
export const isThemes = (call: Pick<AiCall, "system">) => call.system === themesPrompt.system;
const discoverThemes: [string, string, RegExp][] = [
  ["Small groups are hard to find", "Newcomers cannot find a way into a small group.", /small group|find a group|join a group|groups are (?:full|hard)|way into groups|way in\b/i],
  ["Volunteers are stretched", "The same few people carry the work.", /volunteer|burn out|burnt out|burning out|stretched/i],
  ["The next step is unclear", "People are welcomed warmly and then find no clear next step.", /next step|first step|newcomer|new famil|visitor/i],
  ["Worship and music are strengths", "People are proud of the music and the worship.", /music|worship|singing|band/i],
  ["Leaders feel alone", "Leaders carry the load without much support.", /alone|isolated|lonely|unsupported/i],
  ["Giving is steady", "People give steadily and gladly.", /giving|generos|tithe/i],
  ["Communication is unclear", "People do not always know what is happening.", /communicat|announce|don't know what|nobody knows|who decides/i],
];
function scriptedThemes(call: AiCall): string {
  const input = replyJson(call.user) as { notes?: { ref: string; text: string }[]; cards?: { ref: string; text: string; people_agree?: number }[]; already_on_the_page?: { label: string }[]; rejected_by_the_facilitator?: string[] };
  const seen = new Set([...(input.already_on_the_page ?? []).map(a => a.label), ...(input.rejected_by_the_facilitator ?? [])].map(l => l.trim().toLowerCase()));
  const out: ThemesOutput = { themes: [] };
  const first = (text: string, re: RegExp) => text.split(/(?<=[.!?])\s+/).find(s => re.test(s))?.trim().slice(0, 200) ?? "";
  for (const [label, detail, re] of discoverThemes) {
    if (seen.has(label.toLowerCase())) continue;
    const notes = (input.notes ?? []).filter(n => re.test(n.text));
    if (notes.length && out.themes.filter(t => t.source === "conversations").length < 8) {
      const quote = first(notes[0].text, re);
      out.themes.push({ source: "conversations", label, detail, sources: notes.slice(0, 12).map(n => n.ref), quote: quote ? { text: quote, source: notes[0].ref } : null });
    }
    const cards = (input.cards ?? []).filter(c => re.test(c.text)).sort((a, b) => (b.people_agree ?? 0) - (a.people_agree ?? 0));
    if (cards.length && out.themes.filter(t => t.source === "four_lists").length < 8) out.themes.push({ source: "four_lists", label, detail, sources: cards.slice(0, 12).map(c => c.ref), quote: { text: cards[0].text, source: cards[0].ref } });
  }
  const kind = (source: "conversations" | "four_lists") => out.themes.filter(t => t.source === source).map(t => ({ label: t.label, detail: t.detail, sources: t.sources, quote: t.quote }));
  return JSON.stringify({ conversations: kind("conversations"), four_lists: kind("four_lists") });
}

// The What We Heard stand-in: for each source it is given, a headline that leads with the theme the app listed first (the strongest), written in
// the room's own labels, resting on up to three themes and quoting up to two of their quotes by ref. It writes no number: the app puts the lead
// theme's own figure beside the line. Its detail repeats only the count and detail it was given.
export const isHeard = (call: Pick<AiCall, "system">) => call.system === heardPrompt.system;
const heardVerbs: Record<string, string> = { survey: "of respondents named", four_lists: "people wrote or agreed about", input: "input conversations named", interviews: "interviews named" };
function scriptedHeard(call: AiCall): string {
  const input = replyJson(call.user) as { sources?: { source: HeardInputs["sources"][number]["key"]; name: string; themes: { ref: string; label: string; detail: string; count: string; quotes: { ref: string }[] }[] }[] };
  const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
  const out: HeardOutput = { headlines: [] };
  for (const s of input.sources ?? []) {
    const rest = s.themes.slice(0, 3), lead = rest[0];
    if (!lead) continue;
    const detail = s.source === "survey" ? `${lead.count} named ${lower(lead.label)}.` : `${lead.detail || lead.label} (${lead.count}).`;
    out.headlines.push({ source: s.source, lead: lead.ref, line: `${heardVerbs[s.source] ?? "named"} **${lower(lead.label)}**`.slice(0, 140), detail: detail.slice(0, 400),
      themes: rest.map(t => t.ref), quotes: rest.flatMap(t => t.quotes.map(q => q.ref)).slice(0, 2) });
  }
  return JSON.stringify(out);
}

// The lens summary's stand-in. The draft makes one line per cluster, in the room's own words (the cluster's
// first sentence), then the sentences no cluster holds, within 8 lines and 420 characters. The fold follows the
// prompt's rules: "Add ..." adds a line, "Remove ..." removes the line it shares most words with, anything else
// rewords the line it shares most words with (or adds a line when it shares none). Lines it changes name the
// suggestion; every other line is kept.
const futureTense = /\b(will|would|shall|going to|hope to|plan to|aim to|intend to)\b/i;
const tidyLine = (text: string) => { const t = text.trim().replace(/\s+/g, " ").replace(/^[-:,\s]+/, ""); return `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? "" : "."}`; };
function scriptedLensDraft(input: Record<string, unknown>) {
  const sentences = (input.sentences ?? []) as { ref: string; text: string }[], clusters = (input.clusters ?? []) as { ref: string; sentences?: string[] }[];
  const byRef = new Map(sentences.map(a => [a.ref, a])), used = new Set<string>(), out: { text: string; sources: string[] }[] = []; let total = 0;
  const put = (text: string, sources: string[]) => {
    const t = tidyLine(text);
    if (out.length >= 8 || total + t.length + (out.length ? 1 : 0) > 420) return;
    total += t.length + (out.length ? 1 : 0); out.push({ text: t, sources });
  };
  for (const c of clusters) {
    const members = (c.sentences ?? []).filter(r => byRef.has(r)); if (!members.length) continue;
    members.forEach(r => used.add(r));
    const first = members.map(r => byRef.get(r)!).find(a => !futureTense.test(a.text));
    if (first) put(first.text, members);
  }
  for (const a of sentences) if (!used.has(a.ref)) { used.add(a.ref); if (!futureTense.test(a.text)) put(a.text, [a.ref]); }
  return JSON.stringify({ sentences: out });
}
function scriptedLensFold(input: Record<string, unknown>) {
  const summary = (input.summary ?? []) as { ref: string; text: string }[], suggestions = (input.suggestions ?? []) as { ref: string; text: string }[];
  const edits = new Map<string, { text: string; suggestions: string[] }>(), removed = new Map<string, string[]>(), added: { text: string; suggestions: string[] }[] = [];
  const closest = (text: string) => { const mine = words(text); let best: { ref: string; n: number } | null = null;
    for (const l of summary) { const n = shared(mine, words(l.text)); if (n > (best?.n ?? 0)) best = { ref: l.ref, n }; } return best; };
  for (const g of suggestions) {
    if (futureTense.test(g.text)) continue;
    const add = /^(?:add|include)\b[:\s]*(.+)$/i.exec(g.text), drop = /^(?:remove|drop)\b[:\s]*(.+)$/i.exec(g.text);
    if (add) { added.push({ text: tidyLine(add[1]), suggestions: [g.ref] }); continue; }
    if (drop) { const hit = closest(drop[1]); if (hit) removed.set(hit.ref, [...(removed.get(hit.ref) ?? []), g.ref]); continue; }
    const hit = closest(g.text);
    if (hit && !edits.has(hit.ref) && !removed.has(hit.ref)) edits.set(hit.ref, { text: tidyLine(g.text), suggestions: [g.ref] });
    else if (!hit) added.push({ text: tidyLine(g.text), suggestions: [g.ref] });
  }
  const sentences: Record<string, unknown>[] = [];
  for (const l of summary) { if (removed.has(l.ref)) continue; const e = edits.get(l.ref); sentences.push(e ? { edit: l.ref, ...e } : { keep: l.ref }); }
  sentences.push(...added);
  return JSON.stringify({ sentences, remove: [...removed].map(([ref, suggestions]) => ({ ref, suggestions })) });
}

export function scripted(call: AiCall): string {
  if (isOvernight(call)) return scriptedOvernight(call);
  if (isThemes(call)) return scriptedThemes(call);
  if (isHeard(call)) return scriptedHeard(call);
  const job = jobOf(call), input = replyJson(call.user);
  if (job === "combine_words") {
    const list = (input.words ?? []) as { ref: string; text: string; count: number }[], groups: { survivor: string; members: string[] }[] = [];
    for (const set of synonyms) {
      const hits = list.filter(w => set.includes(w.text.toLowerCase().trim())).sort((a, b) => b.count - a.count);
      if (hits.length > 1) groups.push({ survivor: hits[0].ref, members: hits.slice(1, 4).map(w => w.ref) });
    }
    return JSON.stringify({ groups });
  }
  if (job === "group_wall") return scriptedGroups(input, themes, "answers");
  if (job === "group_lens") return scriptedGroups(input, lensThemes, "sentences");
  if (job === "summarize_wall") {
    const groups = (input.groups ?? []) as { label: string; count: number }[], answers = (input.answers ?? []) as string[];
    const top = groups.slice(0, 2).map(g => g.label.toLowerCase());
    return JSON.stringify({ summary: top.length ? `Most answers celebrate ${top.join(" and ")}, with ${answers.length} answers so far.` : `The room has named ${answers.length} things so far.` });
  }
  if (job === "fold_questions") {
    const list = (input.questions ?? []) as { ref: string; text: string; asked: number }[], used = new Set<string>(), groups: { survivor: string; members: string[] }[] = [];
    for (const q of list) {
      if (used.has(q.ref)) continue;
      const mine = words(q.text), digits = q.text.match(/\d+/g)?.join(",") ?? "";
      const same = list.filter(o => o.ref !== q.ref && !used.has(o.ref) && shared(mine, words(o.text)) >= 2 && (o.text.match(/\d+/g)?.join(",") ?? "") === digits).slice(0, 3);
      if (same.length) { groups.push({ survivor: q.ref, members: same.map(o => o.ref) }); used.add(q.ref); same.forEach(o => used.add(o.ref)); }
    }
    return JSON.stringify({ groups });
  }
  if (job === "fold_four_lists") {
    // Within one column: two shared words and the same numbers, the survivor the card more people agree with.
    const columns = (input.columns ?? []) as { cards: { ref: string; text: string; agree: number }[] }[], groups: { survivor: string; members: string[] }[] = [];
    for (const column of columns) {
      const used = new Set<string>();
      for (const q of [...column.cards].sort((a, b) => (b.agree ?? 0) - (a.agree ?? 0))) {
        if (used.has(q.ref)) continue;
        const mine = words(q.text), digits = q.text.match(/\d+/g)?.join(",") ?? "";
        const same = column.cards.filter(o => o.ref !== q.ref && !used.has(o.ref) && shared(mine, words(o.text)) >= 2 && (o.text.match(/\d+/g)?.join(",") ?? "") === digits).slice(0, 3);
        if (same.length) { groups.push({ survivor: q.ref, members: same.map(o => o.ref) }); used.add(q.ref); same.forEach(o => used.add(o.ref)); }
      }
    }
    return JSON.stringify({ groups });
  }
  if (job === "merge_reasons") {
    // Stand-in for merge-reasons@2: reasons merge only when they say the same thing, which here means two shared
    // words and the same numbers. A shared topic alone ("Staff burned out", "We ran out of volunteers") never merges.
    const list = (input.reasons ?? []) as { ref: string; text: string; placed: number }[], used = new Set<string>(), groups: { survivor: string; members: string[] }[] = [];
    for (const q of [...list].sort((a, b) => (b.placed ?? 0) - (a.placed ?? 0))) {
      if (used.has(q.ref)) continue;
      const mine = words(q.text), digits = q.text.match(/\d+/g)?.join(",") ?? "";
      const same = list.filter(o => o.ref !== q.ref && !used.has(o.ref) && shared(mine, words(o.text)) >= 2 && (o.text.match(/\d+/g)?.join(",") ?? "") === digits).slice(0, 3);
      if (same.length) { groups.push({ survivor: q.ref, members: same.map(o => o.ref) }); used.add(q.ref); same.forEach(o => used.add(o.ref)); }
    }
    return JSON.stringify({ groups });
  }
  if (job === "draft_lens_summary") return scriptedLensDraft(input);
  if (job === "fold_lens_summary") return scriptedLensFold(input);
  if (job === "propose_candidates") {
    // One candidate for each theme that at least two sentences share; the sentences are its sources.
    const list = (input.sentences ?? []) as { ref: string; text: string }[], candidates: { name: string; sources: string[] }[] = [];
    for (const [name, re] of lensThemes) {
      const hits = list.filter(x => re.test(x.text));
      if (hits.length >= 2) candidates.push({ name, sources: hits.slice(0, 12).map(x => x.ref) });
    }
    return JSON.stringify({ candidates: candidates.slice(0, 10) });
  }
  return "{}";
}

type Control = { delayMs?: number; fail?: boolean; summary?: string };
function control(path?: string): Control {
  if (!path) return {};
  try { const value: unknown = JSON.parse(readFileSync(path, "utf8")); return value && typeof value === "object" ? value as Control : {}; } catch { return {}; }
}
export function fakeClient(mode: string, controlPath?: string): AiClient {
  return {
    model: () => `fake-${mode}`.slice(0, 100),
    async complete(call) {
      const c = control(controlPath), wait = Math.max(0, Math.min(60000, Number(c.delayMs) || 0));
      if (wait) await new Promise(resolve => setTimeout(resolve, Math.min(wait, call.timeoutMs)));
      if (wait >= call.timeoutMs) throw new Error("timeout");
      if (c.fail) throw new Error("unavailable");
      if (typeof c.summary === "string" && jobOf(call) === "summarize_wall") return reply(call, JSON.stringify({ summary: c.summary.slice(0, 1000) }));
      return reply(call, scripted(call));
    },
  };
}
