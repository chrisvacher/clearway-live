// Milestone 4, step 5: the Pre-mortem (on the grid kind) and the CORE goal builder (INT-15).
// Pure rules shared by the TV view, the phone input, the control surface, the routes and the
// tests. Every number on a screen comes from the server's results: the four CORE letters are
// checked in the database (private.goal_core); what lives here is reading them, wording the
// flag beside each missing one, and checking what a press carries before it is sent.

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown) => Array.isArray(value) ? value : [];
export const isUuid = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
const clean = (x: unknown) => typeof x === "string" ? x.replace(/\s+/g, " ").trim() : "";

// ---------- The CORE letters ----------
export const letters = [["C", "Connected"], ["O", "Owned"], ["R", "Result"], ["E", "End date"]] as const;
export type Letter = typeof letters[number][0];
// The wording beside a missing letter (pass 4: an outlined, hatched letter with what it needs).
export const needs: Record<Letter | "risk", string> = {
  C: "Needs an outcome", O: "Needs an owner", R: "Needs a clear result", E: "Needs an end date", risk: "Needs a risk",
};

export type GoalResult = {
  id: string; title: string; result: string; owner: string; end_date: string; season: string; clear: boolean;
  letters: Record<Letter, boolean>; met: boolean; risks: number[]; needs_risk: boolean;
};
export type GoalsResults = {
  outcome: { id: string; title: string; number: number; of: number } | null; bullets: string[]; goals: GoalResult[];
  risk_links: "required" | "later"; total: number; people: number;
};
export function goalsResults(results: unknown): GoalsResults {
  const r = record(results), o = record(r.outcome);
  return {
    outcome: typeof o.id === "string" ? { id: o.id, title: String(o.title ?? ""), number: Number(o.number) || 1, of: Number(o.of) || 1 } : null,
    bullets: list(r.bullets).filter((b): b is string => typeof b === "string"),
    risk_links: r.risk_links === "later" ? "later" : "required", total: Number(r.total) || 0, people: Number(r.people) || 0,
    goals: list(r.goals).map(record).filter(g => typeof g.id === "string").map(g => {
      const l = record(g.letters);
      return {
        id: String(g.id), title: String(g.title ?? ""), result: typeof g.result === "string" ? g.result : "", owner: typeof g.owner === "string" ? g.owner : "",
        end_date: typeof g.end_date === "string" ? g.end_date : "", season: typeof g.season === "string" ? g.season : "", clear: g.clear === true,
        letters: { C: l.C === true, O: l.O === true, R: l.R === true, E: l.E === true }, met: g.met === true,
        risks: list(g.risks).map(Number).filter(n => Number.isInteger(n)), needs_risk: g.needs_risk === true,
      };
    }),
  };
}
// The letters a goal is missing, in C O R E order.
export const missing = (g: Pick<GoalResult, "letters">): Letter[] => letters.map(([l]) => l).filter(l => !g.letters[l]);
// Every flag on a goal: its missing letters, then the risk it has not answered yet.
export const flagsOf = (g: Pick<GoalResult, "letters" | "needs_risk">): (Letter | "risk")[] => [...missing(g), ...(g.needs_risk ? ["risk" as const] : [])];

// "Apr 30, 2027", read as the calendar date it is (no time zone shifts it).
export function dateLabel(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
}
// Seasons, never quarters: Sept to Dec, Jan to Apr, May to Aug. The end of the season a day falls in.
export function seasonEnd(day: Date) {
  const m = day.getUTCMonth() + 1, y = day.getUTCFullYear();
  return m >= 9 ? `${y}-12-31` : m <= 4 ? `${y}-04-30` : `${y}-08-31`;
}

// ---------- The form the server hands a phone ----------
export type SeasonEnd = { date: string; season: string; label: string };
export type GoalsForm = {
  me: string; outcome: string | null; risk_links: "required" | "later"; season_ends: SeasonEnd[];
  people: { id: string; name: string }[]; risks: { id: string; n: number; text: string }[]; mine: string[];
};
export function goalsForm(value: unknown): GoalsForm | null {
  const v = record(value);
  if (v.status !== "ok") return null;
  return {
    me: String(v.me ?? ""), outcome: typeof v.outcome === "string" ? v.outcome : null, risk_links: v.risk_links === "later" ? "later" : "required",
    season_ends: list(v.season_ends).map(record).filter(s => typeof s.date === "string").map(s => ({ date: String(s.date), season: String(s.season ?? ""), label: String(s.label ?? "") })),
    people: list(v.people).map(record).filter(p => typeof p.id === "string").map(p => ({ id: String(p.id), name: String(p.name ?? "") })),
    risks: list(v.risks).map(record).filter(r => typeof r.id === "string").map(r => ({ id: String(r.id), n: Number(r.n) || 0, text: String(r.text ?? "") })),
    mine: list(v.mine).filter((x): x is string => typeof x === "string"),
  };
}

// ---------- What a press carries ----------
// A goal's fields, as the database reads them. Only the fields present change.
export type GoalFields = {
  title?: string; result?: string; owner?: { attendee: string } | { name: string; email: string } | null; end_date?: string | null; risks?: string[];
};
export function goalFields(value: unknown): GoalFields | null {
  const v = record(value), out: GoalFields = {};
  if ("title" in v) { const t = clean(v.title); if (!t || [...t].length > 200) return null; out.title = t; }
  if ("result" in v) { const t = clean(v.result); if ([...t].length > 400) return null; out.result = t; }
  if ("owner" in v) {
    const o = record(v.owner);
    if (v.owner === null) out.owner = null;
    else if (isUuid(o.attendee) && !("name" in o) && !("email" in o)) out.owner = { attendee: o.attendee.toLowerCase() };
    else if (!("attendee" in o) && clean(o.name) && [...clean(o.name)].length <= 200 && typeof o.email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email.trim()) && o.email.trim().length <= 254)
      out.owner = { name: clean(o.name), email: o.email.trim().toLowerCase() };
    else return null;
  }
  if ("end_date" in v) {
    if (v.end_date === null) out.end_date = null;
    else if (typeof v.end_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.end_date) && !Number.isNaN(Date.parse(v.end_date))) out.end_date = v.end_date;
    else return null;
  }
  if ("risks" in v) {
    if (!Array.isArray(v.risks) || v.risks.length > 6 || !v.risks.every(isUuid)) return null;
    out.risks = (v.risks as string[]).map(x => x.toLowerCase());
  }
  return out;
}
// A phone proposes a goal, or changes one it proposed (`goal`).
export function goalBody(value: unknown): { id: string; session: string; goal?: string; fields: GoalFields } | null {
  const v = record(value);
  if (!isUuid(v.id) || !isUuid(v.session) || (v.goal !== undefined && !isUuid(v.goal))) return null;
  const fields = goalFields(v.fields);
  if (!fields || (v.goal === undefined && !fields.title)) return null;
  return { id: v.id.toLowerCase(), session: v.session.toLowerCase(), ...(v.goal ? { goal: String(v.goal).toLowerCase() } : {}), fields };
}
export function reasonBody(value: unknown): { id: string; session: string; text: string } | null {
  const v = record(value);
  if (!isUuid(v.id) || !isUuid(v.session) || typeof v.text !== "string") return null;
  const text = clean(v.text);
  return text && [...text].length <= 120 ? { id: v.id.toLowerCase(), session: v.session.toLowerCase(), text } : null;
}

export type ControlPress = { rpc: "goals_control" | "reasons_control"; id: string; action: string; p: Record<string, unknown> };
const goalActions = ["outcome", "add", "edit", "clear", "remove"] as const;
const reasonActions = ["add_reason", "mitigate", "unmitigate", "undo_ai"] as const;
const isKey = (x: unknown) => typeof x === "string" && /^[a-z0-9]{1,24}$/.test(x);
export function controlPress(value: unknown): ControlPress | null {
  const v = record(value);
  if (!isUuid(v.id) || (v.from !== null && !isUuid(v.from))) return null;
  const id = String(v.id).toLowerCase(), from = v.from === null ? null : String(v.from).toLowerCase();
  if (v.kind === "goals" && (goalActions as readonly unknown[]).includes(v.action)) {
    const action = v.action as typeof goalActions[number];
    if (action === "outcome") return v.to === "next" || v.to === "prev" || isUuid(v.to) ? { rpc: "goals_control", id, action, p: { from, to: isUuid(v.to) ? v.to.toLowerCase() : v.to } } : null;
    if (action === "add" || action === "edit") {
      const fields = goalFields(v.fields);
      if (!fields || (action === "add" && !fields.title) || (action === "edit" && !isUuid(v.goal))) return null;
      return { rpc: "goals_control", id, action, p: { from, ...(action === "edit" ? { goal: String(v.goal).toLowerCase() } : {}), ...fields } };
    }
    if (!isUuid(v.goal)) return null;
    if (action === "clear") return typeof v.clear === "boolean" ? { rpc: "goals_control", id, action, p: { from, goal: String(v.goal).toLowerCase(), clear: v.clear } } : null;
    return { rpc: "goals_control", id, action, p: { from, goal: String(v.goal).toLowerCase() } };
  }
  if (v.kind === "reasons" && (reasonActions as readonly unknown[]).includes(v.action)) {
    const action = v.action as typeof reasonActions[number];
    if (action === "undo_ai") return { rpc: "reasons_control", id, action, p: { from } };
    if (action === "unmitigate") return isUuid(v.mitigation) ? { rpc: "reasons_control", id, action, p: { from, mitigation: String(v.mitigation).toLowerCase() } } : null;
    const text = clean(v.text);
    if (!text || [...text].length > (action === "add_reason" ? 120 : 300)) return null;
    if (action === "mitigate") return isKey(v.item) ? { rpc: "reasons_control", id, action, p: { from, item: v.item, text } } : null;
    return { rpc: "reasons_control", id, action, p: { from, text } };
  }
  return null;
}

// The words a press answers with, in plain language.
export const pressMessages: Record<string, string> = {
  moved: "The room moved on. Check what is live and try again.", invalid_state: "That can’t be done on this step now.", missing: "That is no longer there.",
  denied: "Only facilitators can do that.", unavailable: "The room didn’t answer. Try again.", closed: "This engagement has closed.",
  invalid_request: "That didn’t go through. Check it and try again.", invalid_answer: "Check the details and try again.", filtered: "Please use different words.",
  exists: "That is already on the list.", full: "There is no room for another.", unchanged: "Nothing changed.",
};
