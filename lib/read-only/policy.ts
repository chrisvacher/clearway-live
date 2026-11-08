// The read-only copy (milestone 7, step 4): what the Share page and the public page say, apart from the database and the network.
// Plain functions, so the tests can read them without a server.
import { answerLabel, longDate } from "@/lib/check-ins/policy";

export const tokenShape = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(value);

export type ShareLink = { id: string; name: string; made_by: string | null; created_at: string; opens: number; last_opened_at: string | null; revoked_at: string | null; revoked_by: string | null; state: "active" | "revoked" };
export type ShareState =
  | { status: "ok"; server_time: string; type: string; engagement_status: string; timezone: string; eligible: boolean; practice: boolean; closed: boolean; closed_at: string | null; closed_on: string | null; can_reopen: boolean;
      report: { n: number; signed_at: string; stale: boolean } | null; links: ShareLink[] }
  | { status: "denied" | "closed" | "unavailable" };

// What the Share tile on the After page says.
export function shareLine(state: Extract<ShareState, { status: "ok" }>): string {
  if (!state.eligible) return "This kind of engagement has no read-only copy.";
  if (!state.closed) return "Available once Day 2 closes.";
  const active = state.links.filter(l => l.state === "active").length;
  if (!state.links.length) return "No links yet. Make one for the elders.";
  const opens = state.links.reduce((n, l) => n + l.opens, 0);
  return `${active} ${active === 1 ? "link" : "links"} on, opened ${opens} ${opens === 1 ? "time" : "times"}.`;
}

export const stamp = (iso: string | null | undefined, zone = "America/Toronto") => iso ? new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "";

// ---------- The public page's data ----------
export type RoField = { text?: string; items?: string[]; empty?: boolean; why?: string | null };
export type RoGoal = { title: string; result?: string; owner?: string; end_date?: string; season?: string; status?: string; status_on?: string };
export type RoOutcome = { n: number; title: string; description?: string; status?: string; stop?: string; indicators: string[]; goals: RoGoal[] };
export type RoIntent = { n: number; outcome: string; intent?: string; must_do?: string; stop?: string; steps: { text: string; owner?: string; due?: string }[] };
export type RoSentence = { text: string; quote: boolean; thin?: string };
export type RoRow = { title?: string; group?: string; cells: string[]; parts: { role: string; owner?: string; due?: string; text?: string }[] };
export type RoSection = { key: string; heading: string; kind: "prose" | "record"; sentences: RoSentence[]; table?: { columns: string[]; rows: RoRow[] } };
export type RoView = {
  status: "ok"; church: string; title: string; years: { base: number; future: number; vision: number; outlook: number };
  map: {
    page1: { mission: RoField; purpose: RoField; values: RoField; strategy: RoField;
      future: { year: number; lenses: { lens: number; name: string; state: string; lines: string[]; why?: string }[] };
      vision: { year: number; empty: boolean; why?: string | null; outcomes: { n: number; title: string; status?: string }[] } };
    page2: { priorities: { why: string }; outlook: { year: number; metrics: { items?: { text: string }[]; empty?: boolean; why?: string }; celebrations: { items?: { text: string }[]; empty?: boolean; why?: string } };
      rhythms: RoField; issues: { items?: { kind: string; text: string; mitigations?: string[] }[]; empty?: boolean; why?: string } };
  };
  outcomes: RoOutcome[]; intents: RoIntent[];
  report: { n: number; signed_at: string; sections: RoSection[] } | null;
};
export type RoAnswer = RoView | { status: "unavailable" };

// A goal's status as its owner gave it: the label and the day, never the note.
export const goalStatusLine = (g: Pick<RoGoal, "status" | "status_on">) => g.status ? { label: answerLabel[g.status] ?? g.status, on: g.status_on ? longDate(g.status_on) : "" } : null;
export const dayLine = (iso: string | undefined) => iso ? longDate(iso) : "";
