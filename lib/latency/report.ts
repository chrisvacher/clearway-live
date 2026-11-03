// The milestone 2 measure, read from the latency log: 95 of 100 submissions
// reach the TV in under one second. Pure helpers shared by the report page,
// its API route and the load script.
export type Spread = { p50: number | null; p95: number | null; p99?: number | null; max?: number | null };
export type LatencyReport = {
  status: "ok"; from: string; to: string; sent: number; queued: number; missing_tv: number; measured: number; under_second: number;
  phone_tv: Spread; phone_server: Spread; server_tv: Spread; uncertainty_ms: number | null;
  sessions: { id: string; title: string; measured: number; under_second: number; p95: number | null }[];
};
export const target = { share: 0.95, ms: 1000 };

export function verdict(report: Pick<LatencyReport, "measured" | "under_second">) {
  if (!report.measured) return { met: false, share: 0, label: "No answers reached a TV in this window" };
  const share = report.under_second / report.measured, met = share >= target.share;
  return { met, share, label: `${report.under_second} of ${report.measured} reached the TV in under 1 second (${Math.floor(share * 1000) / 10}%). ${met ? "Meets" : "Below"} the target of 95 in 100.` };
}
export const seconds = (ms: number | null | undefined) => ms == null ? "No data" : `${(ms / 1000).toFixed(2)} s`;

// A window is at most 7 days, written as ISO times; anything else falls back to the last 12 hours.
export function reportWindow(from: string | null | undefined, to: string | null | undefined, now = Date.now()) {
  const end = to && Number.isFinite(Date.parse(to)) ? Date.parse(to) : now;
  const start = from && Number.isFinite(Date.parse(from)) ? Date.parse(from) : end - 12 * 3600e3;
  if (start > end || end - start > 7 * 86400e3) return { from: new Date(now - 12 * 3600e3).toISOString(), to: new Date(now).toISOString() };
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}

// Percentiles for the load script's own phone-side measure (tap to accepted).
export function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), rank = (sorted.length - 1) * p, low = Math.floor(rank), high = Math.ceil(rank);
  return Math.round(sorted[low] + (sorted[high] - sorted[low]) * (rank - low));
}
