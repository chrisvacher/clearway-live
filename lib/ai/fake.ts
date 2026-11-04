// Fake model clients for tests and the browser kits. Never used on production
// (lib/ai/client.ts refuses it there), never calls the API.
//  * recordedClient: answers each prompt with a recorded reply (the fixture tests).
//  * fakeClient("script"): a stand-in that follows the prompts' rules on any input, so a
//    kit can run the room end to end. A control file (CLEARWAY_AI_FAKE_CONTROL) makes it
//    slow or failing, for FAIL-09, or gives the summary it names (a long one, for the TV's fit).
import { readFileSync } from "node:fs";
import type { AiCall, AiClient, AiReply } from "./client";
import { overnightPrompt, prompts, replyJson, type AiJob, type OvernightOutput } from "./prompts";

export function jobOf(call: Pick<AiCall, "system">): AiJob | null {
  return (Object.values(prompts).find(p => p.system === call.system)?.job) ?? null;
}
const tokens = (text: string) => Math.ceil(text.length / 4);
const reply = (call: AiCall, text: string): AiReply => ({ text, inputTokens: tokens(call.system + call.user), outputTokens: tokens(text) });

// A recorded reply per job and user message.
export function recordedClient(recordings: { job: AiJob | "overnight_draft"; user: string; reply: string }[]): AiClient & { calls: AiCall[] } {
  const calls: AiCall[] = [];
  return {
    calls, model: () => "recorded-fixture",
    async complete(call) {
      calls.push(call);
      const job = jobOf(call) ?? (isOvernight(call) ? "overnight_draft" : null), hit = recordings.find(r => r.job === job && r.user === call.user);
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

export function scripted(call: AiCall): string {
  if (isOvernight(call)) return scriptedOvernight(call);
  const job = jobOf(call), input = replyJson(call.user);
  if (job === "combine_words") {
    const list = (input.words ?? []) as { ref: string; text: string; count: number }[], groups: { survivor: string; members: string[] }[] = [];
    for (const set of synonyms) {
      const hits = list.filter(w => set.includes(w.text.toLowerCase().trim())).sort((a, b) => b.count - a.count);
      if (hits.length > 1) groups.push({ survivor: hits[0].ref, members: hits.slice(1, 4).map(w => w.ref) });
    }
    return JSON.stringify({ groups });
  }
  if (job === "group_wall") {
    const answers = (input.answers ?? []) as { ref: string; text: string }[], existing = (input.groups ?? []) as { ref: string; label: string; pinned: boolean }[];
    const out = new Map<string, { group: string; label?: string; answers: string[] }>(); let n = 0;
    for (const a of answers) {
      const theme = themes.find(([, re]) => re.test(a.text)); if (!theme) continue;
      const group = existing.find(g => g.label.toLowerCase() === theme[0].toLowerCase() || themes.find(([l]) => l === theme[0])![1].test(g.label));
      if (group?.pinned) continue;
      const key = group ? group.ref : theme[0];
      if (!out.has(key)) out.set(key, group ? { group: group.ref, answers: [] } : { group: `n${++n}`, label: theme[0], answers: [] });
      out.get(key)!.answers.push(a.ref);
    }
    return JSON.stringify({ groups: [...out.values()] });
  }
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
  if (job === "merge_reasons") {
    // The same rule as folding questions: two shared words and the same numbers.
    const list = (input.reasons ?? []) as { ref: string; text: string; placed: number }[], used = new Set<string>(), groups: { survivor: string; members: string[] }[] = [];
    for (const q of [...list].sort((a, b) => (b.placed ?? 0) - (a.placed ?? 0))) {
      if (used.has(q.ref)) continue;
      const mine = words(q.text), digits = q.text.match(/\d+/g)?.join(",") ?? "";
      const same = list.filter(o => o.ref !== q.ref && !used.has(o.ref) && shared(mine, words(o.text)) >= 2 && (o.text.match(/\d+/g)?.join(",") ?? "") === digits).slice(0, 3);
      if (same.length) { groups.push({ survivor: q.ref, members: same.map(o => o.ref) }); used.add(q.ref); same.forEach(o => used.add(o.ref)); }
    }
    return JSON.stringify({ groups });
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
