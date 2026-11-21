import type { LiveResults } from "../live/types";
export type BeforeAfterOptions = { mode: "paired" | "steps"; max: number; low: string; high: string; before_label: string; after_label: string; show_change: boolean; question?: string; before_session?: string; after_session?: string };
export const beforeAfterDefaults: BeforeAfterOptions = { mode: "paired", max: 10, low: "Not at all", high: "Completely", before_label: "Before today", after_label: "After today", show_change: true };
export const beforeAfterOptions = (options: Record<string, unknown> | undefined): BeforeAfterOptions => ({ ...beforeAfterDefaults, ...options } as BeforeAfterOptions);
export type Aggregate = { count: number; average: number | null; columns: number[] };
export type BeforeAfterResults = { max: number; before: Aggregate; after: Aggregate; change: number | null };
export function aggregate(values: readonly (number | undefined)[], max: number): Aggregate {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= max);
  const columns = Array.from({ length: max }, (_, i) => valid.filter(v => v === i + 1).length);
  return { count: valid.length, average: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null, columns };
}
export function beforeAfterSummary(before: readonly (number | undefined)[], after: readonly (number | undefined)[], max: number): BeforeAfterResults {
  const b = aggregate(before, max), a = aggregate(after, max);
  return { max, before: b, after: a, change: b.average === null || a.average === null ? null : Math.round((a.average - b.average) * 10) / 10 || 0 };
}
export const beforeAfterOf = (results: LiveResults | null | undefined): BeforeAfterResults | null => {
  const value = results?.before_after as BeforeAfterResults | undefined;
  return value && value.before && value.after && Array.isArray(value.before.columns) && Array.isArray(value.after.columns) ? value : null;
};
export function changeLabel(change: number | null) {
  return change === null ? "Waiting for both answers" : change > 0 ? `Up ${change.toFixed(1)}` : change < 0 ? `Down ${Math.abs(change).toFixed(1)}` : "No change";
}
