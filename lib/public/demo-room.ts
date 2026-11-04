// The public page's demo room: a scripted Riverside Church session that feeds the real
// TV components (the same TvScenes, word cloud and live bars the room sees). Every number
// here mirrors the database's results functions, so the demo moves exactly as a room does.
// Nothing is sent anywhere: a visitor's own answer joins the demo in their browser only.
import type { LiveAnswer, LiveEvent, LiveResults, LiveSession, LiveSnapshot } from "../live/types";
import type { KindInfo } from "../interactions/kinds";
import type { OptionItem } from "../interactions/bars";
import type { TvAppearance } from "../tv/types";

export const demoKinds = ["word_cloud", "choice", "points", "scale"] as const;
export type DemoKind = typeof demoKinds[number];
export type DemoValue = string | { choices: string[] } | { points: Record<string, number> } | { value: number };
export type DemoAnswer = { text: string; value?: DemoValue };
export type DemoScript = { kind: DemoKind; label: string; title: string; prompt: string; options?: Record<string, unknown>;
  answers: DemoAnswer[]; gaps: number[] };

const kinds: Record<DemoKind, KindInfo> = {
  word_cloud: { kind: "word_cloud", label: "Word cloud", input: true, one_per_person: false, counts: "answers", structured: false, shares_answers: true, spotlight: "key" },
  choice: { kind: "choice", label: "Multiple choice", input: true, one_per_person: true, counts: "people", structured: true, shares_answers: true, spotlight: "key" },
  points: { kind: "points", label: "100 points", input: true, one_per_person: true, counts: "people", structured: true, shares_answers: true, spotlight: "key" },
  scale: { kind: "scale", label: "Scale", input: true, one_per_person: true, counts: "people", structured: true, shares_answers: true, spotlight: "key" },
};

const priorities: OptionItem[] = [
  { key: "next", text: "Raise new leaders" },
  { key: "door", text: "Welcome neighbours" },
  { key: "care", text: "Care for families" },
  { key: "team", text: "Own the plan together" },
];
const words = (list: string[]) => list.map(text => ({ text }));
const choice = (keys: string[]) => keys.map(key => ({ text: priorities.find(o => o.key === key)!.text, value: { choices: [key] } }));
const points = (rows: number[][]) => rows.map(row => ({ text: "100 points", value: { points: Object.fromEntries(priorities.map((o, i) => [o.key, row[i]])) } }));
const scale = (values: number[]) => values.map(value => ({ text: String(value), value: { value } }));

// Answers land in small bursts and singles, as phones do in a 3 to 5 minute burst.
export const demoScripts: Record<DemoKind, DemoScript> = {
  word_cloud: { kind: "word_cloud", label: "Word cloud", title: "Pre-call", prompt: "In a word or two, what are you most grateful for at Riverside?",
    answers: words(["Generosity", "The people", "Prayer", "generosity", "Our kids ministry", "Worship", "the people", "Generosity", "Welcome", "Prayer",
      "Worship", "The people", "generosity", "Sunday mornings", "welcome", "prayer", "The people", "Generosity"]),
    gaps: [700, 1400, 300, 1100, 900, 250, 1300, 800, 1000, 300, 1200, 700, 900, 1100, 400, 1000, 800, 1200] },
  choice: { kind: "choice", label: "Multiple choice", title: "Discern", prompt: "Which Vision Outcome needs the room's attention first?", options: { items: priorities },
    answers: choice(["next", "team", "next", "door", "next", "care", "team", "next"]), gaps: [900, 1300, 300, 1200, 800, 1400, 350, 1100] },
  points: { kind: "points", label: "100 points", title: "Decide", prompt: "Spread 100 points across the priorities you'd give this year to.", options: { items: priorities, cut: 0 },
    answers: points([[40, 20, 10, 30], [25, 25, 25, 25], [50, 10, 10, 30], [20, 40, 20, 20], [35, 15, 15, 35], [30, 20, 10, 40], [45, 5, 20, 30], [30, 30, 10, 30]]),
    gaps: [1100, 1300, 400, 1200, 900, 1400, 300, 1000] },
  scale: { kind: "scale", label: "Scale", title: "Discover", prompt: "How clear is our direction as a team today?", options: { max: 5, low: "Not clear", high: "Very clear" },
    answers: scale([3, 2, 3, 4, 2, 3, 3, 2]), gaps: [800, 1200, 300, 1000, 1300, 700, 400, 1100] },
};

export const demoDisplay: TvAppearance = { church: "Riverside Church", title: "Wayfinding", logo_url: null, room_code: "A7C3E91F",
  theme: "dark", texture: true, room_size: "very_small", reduced_motion: false };
export const demoEngagement = "d0000000-0000-4000-8000-000000000001";

// The server's word key: lowercase, letters and numbers only, a leading small word
// dropped, and a plural s trimmed from words longer than three letters.
const smallWords = ["a", "an", "the", "in", "my", "our", "of", "to", "for", "on", "at", "with"];
export function demoWordKey(text: string) {
  let parts = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && smallWords.includes(parts[0])) parts = parts.slice(1);
  return parts.map(word => word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word).join(" ");
}
// The same filter the database applies before an answer is published.
export const demoFiltered = (text: string) => /\b(fuck|fucking|shit|bullshit|bitch|cunt|motherfucker)\b/i.test(text);
// A word cloud answer may hold up to five, separated by commas.
export function demoItems(text: string) {
  return text.split(",").map(part => part.trim()).filter(Boolean).slice(0, 5).map(item => ({ text: item, key: demoWordKey(item) })).filter(item => item.key);
}

type Placed = { id: string; person: number; answer: DemoAnswer };
const round1 = (n: number) => Math.round(n * 10) / 10;
const fraction = (n: number, top: number) => top > 0 ? Math.round(n / top * 10000) / 10000 : 0;

function wordResults(placed: Placed[]): LiveResults {
  const items = placed.flatMap((p, order) => demoItems(p.answer.text).map(item => ({ ...item, person: p.person, order })));
  const groups = new Map<string, { text: string; count: number; first: number }>();
  for (const item of items) {
    const g = groups.get(item.key);
    if (g) { g.count++; if (item.text < g.text) g.text = item.text; } else groups.set(item.key, { text: item.text, count: 1, first: item.order });
  }
  const maximum = Math.max(0, ...[...groups.values()].map(g => g.count));
  const ordered = [...groups.entries()].sort((a, b) => a[1].first - b[1].first || a[0].localeCompare(b[0]));
  const list = ordered.map(([key, g], i) => ({ key, text: g.text, count: g.count, order: i + 1,
    size: maximum <= 1 ? 56 : 56 + 112 * (Math.sqrt(g.count) - 1) / (Math.sqrt(maximum) - 1),
    level: g.count === maximum && g.count > 1 ? "leader" : g.count > 1 ? "repeated" : "single" })).sort((a, b) => a.key.localeCompare(b.key));
  return { total: items.length, people: new Set(items.map(i => i.person)).size, words: list };
}

// One answer per person: a person's latest stands, as on the server.
function standing(placed: Placed[]) {
  const latest = new Map<number, Placed>();
  for (const p of placed) latest.set(p.person, p);
  return [...latest.values()];
}

function barResults(script: DemoScript, placed: Placed[]): LiveResults {
  const ans = standing(placed), people = ans.length, items = (script.options?.items ?? []) as OptionItem[];
  const base = { total: people, people, words: [] };
  if (script.kind === "scale") {
    const max = Number(script.options?.max ?? 5), values = ans.map(a => (a.answer.value as { value: number }).value);
    const cols = Array.from({ length: max }, (_, i) => ({ value: i + 1, count: values.filter(v => v === i + 1).length }));
    const tall = Math.max(0, ...cols.map(c => c.count));
    return { ...base, scale: { max, average: values.length ? round1(values.reduce((s, v) => s + v, 0) / values.length) : null,
      low: values.length ? Math.min(...values) : null, high: values.length ? Math.max(...values) : null,
      columns: cols.map(c => ({ key: String(c.value), value: c.value, count: c.count, fraction: fraction(c.count, tall) })) } };
  }
  const score = (key: string) => script.kind === "choice"
    ? ans.filter(a => (a.answer.value as { choices: string[] }).choices.includes(key)).length
    : ans.reduce((sum, a) => sum + ((a.answer.value as { points: Record<string, number> }).points[key] ?? 0), 0);
  const counted = items.map((o, ord) => ({ ...o, ord, n: score(o.key) }));
  const top = Math.max(0, ...counted.map(c => c.n)), everything = counted.reduce((s, c) => s + c.n, 0);
  const ranked = [...counted].sort((a, b) => b.n - a.n || a.ord - b.ord);
  const bars = ranked.map((c, i) => ({ key: c.key, text: c.text, place: i + 1, fraction: fraction(c.n, top), leader: top > 0 && c.n === top,
    ...(script.kind === "choice" ? { count: c.n, percent: people ? Math.round(c.n * 100 / people) : 0 }
      : { points: c.n, share: everything ? Math.round(c.n * 100 / everything) : 0 }) }));
  return { ...base, bars, ...(script.kind === "points" ? { cut: 0, cut_label: null } : { multiple: false }) };
}

export function demoResults(script: DemoScript, placed: Placed[]): LiveResults {
  return script.kind === "word_cloud" ? wordResults(placed) : barResults(script, placed);
}

export function demoSession(script: DemoScript, id: string): LiveSession {
  return { id, title: script.title, interaction: script.kind, prompt: script.prompt, state: "live", max_sends: script.kind === "word_cloud" ? 5 : 1,
    max_characters: 40, max_words: 3, options: script.options, kind: kinds[script.kind], settings: { anonymous: true, burst_minutes: 4, join_strip: false } };
}

// A frame the TV can draw, and the event that brought its newest answer.
export function demoFrame(script: DemoScript, session: string, placed: Placed[], version: number): { frame: LiveSnapshot; event: LiveEvent | null } {
  const results = demoResults(script, placed), live = demoSession(script, session);
  const answers: LiveAnswer[] = placed.map(p => ({ id: p.id, session_id: session, text: p.answer.text, revision: 0,
    answers: script.kind === "word_cloud" ? demoItems(p.answer.text) : [], ...(typeof p.answer.value === "object" ? { value: p.answer.value } : {}) }));
  const state = { engagement_id: demoEngagement, live_session_id: session, version, tv_content: "session", phones_down: false, burst_ends_at: null, results };
  const frame: LiveSnapshot = { status: "ok", role: "tv", topic: "demo", version, display: demoDisplay, presence: { count: 8, names: [] },
    state, session: live, answers, next: null, phone_depth: null, server_time: new Date(0).toISOString() };
  const newest = answers[answers.length - 1];
  return { frame, event: newest ? { state, session: live, answer: newest } : null };
}

export type { Placed as DemoPlaced };
