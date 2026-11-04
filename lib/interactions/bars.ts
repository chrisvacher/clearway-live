// The bar family (milestone 3, step 2): multiple choice (INT-04), scale (INT-05), ranking
// (INT-06), 100 points (INT-07) and statements (INT-17). Every number here comes from the
// server's results; this file only reads and formats them, and holds the phone's own rules
// (the points allocator, tapping a ranking) that run before anything is sent.
import type { LiveResults } from "../live/types";

export const barKinds = ["choice", "scale", "ranking", "points", "statements"] as const;
export type BarKind = typeof barKinds[number];
export const isBarKind = (kind: unknown): kind is BarKind => barKinds.includes(kind as BarKind);

export type OptionItem = { key: string; text: string };
// One bar as the server sends it, in display order. Each kind adds its own numbers.
export type Bar = { key: string; text: string; place: number; fraction: number; leader: boolean;
  count?: number; percent?: number; ranked?: number; average?: number | null; points?: number; share?: number; agree?: number };
export type ScaleResults = { max: number; average: number | null; low: number | null; high: number | null; columns: { key: string; value: number; count: number; fraction: number }[] };

export function optionItems(options: unknown): OptionItem[] {
  const items = options && typeof options === "object" && Array.isArray((options as { items?: unknown }).items) ? (options as { items: unknown[] }).items : [];
  return items.flatMap(item => item && typeof item === "object" && typeof (item as OptionItem).key === "string" && typeof (item as OptionItem).text === "string" ? [item as OptionItem] : []);
}
export function barsOf(results: LiveResults | null | undefined): Bar[] {
  return Array.isArray(results?.bars) ? results.bars as Bar[] : [];
}
export function scaleOf(results: LiveResults | null | undefined): ScaleResults | null {
  const scale = results?.scale as ScaleResults | undefined;
  return scale && Array.isArray(scale.columns) ? scale : null;
}
const one = (n: number | null | undefined) => typeof n === "number" ? n.toFixed(1) : "";

// The value beside the bar (pass 3 change 3), as a main part and a smaller part.
export function barValue(kind: BarKind, bar: Bar, people: number): { main: string; small?: string } {
  switch (kind) {
    case "choice": return { main: String(bar.count ?? 0), small: `· ${bar.percent ?? 0}%` };
    case "ranking": return people && bar.average != null ? { main: `avg ${one(bar.average)}` } : { main: "", small: "No rankings yet" };
    case "points": return { main: `${bar.share ?? 0}%` };
    case "statements": return bar.count ? { main: one(bar.average), small: `· ${bar.agree ?? 0}% agree` } : { main: "", small: "No answers yet" };
    default: return { main: "" };
  }
}
// The widest values a kind can show beside its bars, so the value column is sized for them
// before they arrive (a "100% agree" never clips, and the column never jumps when one lands).
export function widestValues(kind: BarKind, people: number): { main: string; small?: string }[] {
  switch (kind) {
    case "choice": return [{ main: String(Math.max(people, 10)), small: "· 100%" }];
    case "ranking": return [{ main: "avg 0.0" }, { main: "", small: "No rankings yet" }];
    case "points": return [{ main: "100%" }];
    case "statements": return [{ main: "5.0", small: "· 100% agree" }, { main: "", small: "No answers yet" }];
    default: return [];
  }
}
// What Spotlight lifts over the scrim for an option key.
export function barSpot(kind: BarKind, results: LiveResults, key: string): { text: string; meta: string } | null {
  if (kind === "scale") {
    const scale = scaleOf(results); if (!scale) return null;
    if (key === "average") return { text: scale.average != null ? one(scale.average) : "No average yet", meta: scale.average != null ? `average of ${results.people}` : "Waiting for answers" };
    const column = scale.columns.find(c => c.key === key); if (!column) return null;
    return { text: String(column.value), meta: `${column.count} ${column.count === 1 ? "person" : "people"}` };
  }
  const bar = barsOf(results).find(b => b.key === key); if (!bar) return null;
  const people = results.people;
  switch (kind) {
    case "choice": return { text: bar.text, meta: `${bar.count ?? 0} of ${people} · ${bar.percent ?? 0}%` };
    case "ranking": return { text: bar.text, meta: people ? `Place ${bar.place} · avg ${one(bar.average)}` : "No rankings yet" };
    case "points": return { text: bar.text, meta: `${bar.share ?? 0}% of the points` };
    case "statements": return { text: bar.text, meta: bar.count ? `${one(bar.average)} average · ${bar.agree ?? 0}% agree` : "No answers yet" };
  }
}

// INT-05: up to seven numbers show as buttons; wider ranges as a slider.
export const scaleUsesSlider = (max: number) => max > 7;

// INT-06 on the phone: tap an option to add it to your order, tap a ranked one to remove it,
// or move one up. A partial order counts.
export function rankTap(order: string[], key: string) {
  return order.includes(key) ? order.filter(k => k !== key) : [...order, key];
}
export function rankUp(order: string[], key: string) {
  const i = order.indexOf(key); if (i <= 0) return order;
  const next = order.slice(); [next[i - 1], next[i]] = [next[i], next[i - 1]]; return next;
}

// INT-07 on the phone (pass 3 change 11): setting one line past the budget takes the overage
// from the others in proportion to what they hold, by largest remainder, in whole points.
// Lowering a line only frees points; it never raises another.
export const budget = 100;
export function allocate(values: number[], index: number, value: number): number[] {
  const next = values.slice(), old = next[index];
  const v = Math.max(0, Math.min(budget, Math.round(value)));
  next[index] = v;
  const over = next.reduce((a, b) => a + b, 0) - budget;
  if (v <= old || over <= 0) return next;
  const others = next.map((_, j) => j).filter(j => j !== index && next[j] > 0);
  const pool = others.reduce((a, j) => a + next[j], 0);
  if (!pool) { next[index] = v - over; return next; }
  const raw = others.map(j => over * next[j] / pool), cut = raw.map(Math.floor);
  let rest = over - cut.reduce((a, b) => a + b, 0);
  others.map((_, k) => k).sort((x, y) => (raw[y] - cut[y]) - (raw[x] - cut[x]) || x - y).forEach(k => { if (rest > 0) { cut[k]++; rest--; } });
  others.forEach((j, k) => { next[j] = Math.max(0, next[j] - cut[k]); });
  return next;
}
// Keyboard steps for a points line: arrows 1, Page Up and Page Down 10, Home and End 0 and 100.
export function pointsKey(key: string, current: number): number | null {
  const step: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
  if (key in step) return current + step[key];
  if (key === "Home") return 0;
  if (key === "End") return budget;
  return null;
}

// The person's standing answer, read back into each phone input's own shape.
export function valueOf<T>(value: unknown, field: string): T | undefined {
  return value && typeof value === "object" && field in value ? (value as Record<string, T>)[field] : undefined;
}

// The run of show's defaults when a kind is chosen. Keys are made here and kept.
export const newKey = () => `o${Math.random().toString(36).slice(2, 8)}`;

// Request bodies for INT-06's own routes, checked again by the database.
const isUuid = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
export function suggestionBody(value: unknown): { id: string; session: string; text: string } | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== "object" || !isUuid(v.id) || !isUuid(v.session) || typeof v.text !== "string") return null;
  const text = v.text.replace(/\s+/g, " ").trim();
  return text && [...text].length <= 80 ? { id: v.id.toLowerCase(), session: v.session.toLowerCase(), text } : null;
}
export function rankingControlBody(value: unknown): { id: string; action: "add_option" | "dismiss"; ids: string[]; text: string } | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== "object" || !isUuid(v.id) || (v.action !== "add_option" && v.action !== "dismiss") || !Array.isArray(v.ids)
    || !v.ids.length || v.ids.length > 300 || !v.ids.every(isUuid) || (v.text !== undefined && typeof v.text !== "string")) return null;
  const text = typeof v.text === "string" ? v.text.replace(/\s+/g, " ").trim() : "";
  if (v.action === "add_option" && (!text || [...text].length > 120)) return null;
  return { id: v.id.toLowerCase(), action: v.action, ids: (v.ids as string[]).map(x => x.toLowerCase()), text };
}
