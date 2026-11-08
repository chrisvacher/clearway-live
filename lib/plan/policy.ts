// The visibility plan (milestone 7, step 3): the page's state, the calls it makes and the plain sentences for each answer. Pure and shared by the browser
// and the server. The database checks every rule again, including who may do it.
import { uuid } from "../room/identity";
import type { SourceInfo } from "../report/policy";

export type Stage = "lead_pastor" | "participants" | "board" | "staff" | "key_leaders" | "congregation" | "other";
export type PlanStatus = "empty" | "drafting" | "drafted" | "edited" | "reviewed" | "needs_attention" | "thin";
export const SLOW_AFTER_MS = 45000;

// The Brain's outward order, with the words the page uses.
export const stageOrder: Stage[] = ["lead_pastor", "participants", "board", "staff", "key_leaders", "congregation"];
export const stageNames: Record<Stage, string> = { lead_pastor: "Lead pastor", participants: "Retreat participants", board: "Board or elders", staff: "Staff", key_leaders: "Members and key leaders", congregation: "Congregation", other: "Other" };
export const stageRank = (stage: string): number => { const i = stageOrder.indexOf(stage as Stage); return i < 0 ? stageOrder.length + 1 : i + 1; };
export const statusNames: Record<PlanStatus, string> = { empty: "Not drafted", drafting: "Drafting", drafted: "Draft to review", edited: "Edited", reviewed: "Every row reviewed", needs_attention: "Needs attention", thin: "Nothing said about it" };

export type PlanSource = { id: string; kind: string; ref_id: string | null; excerpt: string; room?: boolean; broken?: boolean; info: SourceInfo | null };
export type PlanRowState = {
  id: string; position: number; stage: Stage; who: string; when_text: string; when_date: string | null; by_whom: string; what_they_hear: string; risk: string;
  origin: "ai" | "facilitator"; touched: boolean; needs_source: boolean; reviewed: { at: string; by: string | null } | null; sources: PlanSource[];
};
export type PlanRound = { status: "pending" | "drafting" | "ready" | "failed" | "idle"; requested_at: string; attempts: number; error: string | null; ok_at: string | null; kept: number; dropped: number };
export type PlanState =
  | { status: "ok"; server_time: string; ai: boolean; lead: boolean; report_draft: boolean; closed?: boolean; report_stale?: boolean; slow_after_ms?: number;
      plan: { id: string; moment: string; public_date: string | null; status: PlanStatus; error: string | null; dropped: number; drafted_at: string | null; dates_blanked?: number } | null;
      round: PlanRound | null; rows: PlanRowState[] }
  | { status: "denied" | "unavailable" | "missing" | "closed" };
type Ok = Extract<PlanState, { status: "ok" }>;

// ---------- What the page says about the drafting round ----------
export type DraftView = { kind: "none" } | { kind: "working"; slow: boolean } | { kind: "retry" } | { kind: "failed" } | { kind: "off" };
export function roundView(state: Ok, now: number, slowAfter = SLOW_AFTER_MS): DraftView {
  const r = state.round, p = state.plan;
  if (r && (r.status === "pending" || r.status === "drafting")) return r.status === "pending" && r.attempts > 0 ? { kind: "retry" } : { kind: "working", slow: now - Date.parse(r.requested_at) > slowAfter };
  if (p?.status === "needs_attention" && p.error) return { kind: "failed" };
  if (!state.ai && !state.rows.length) return { kind: "off" };
  return { kind: "none" };
}

// ---------- Rows ----------
export const rowsLeft = (rows: PlanRowState[]) => rows.filter(r => !r.reviewed).length;
// A row's date is after the public date the plan works back from: shown as a flag, never changed.
export const afterPublic = (when: string | null, publicDate: string | null) => Boolean(when && publicDate && when > publicDate);
// Are the rows in the Brain's outward order? Rows the facilitator moved on purpose may not be.
export function inOutwardOrder(rows: Pick<PlanRowState, "stage">[]): boolean { return rows.every((r, i) => i === 0 || stageRank(rows[i - 1].stage) <= stageRank(r.stage)); }
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// The stages that have no row, in the outward order. The page names them once the plan has been drafted.
export const missingStages = (rows: Pick<PlanRowState, "stage">[]): Stage[] => stageOrder.filter(s => !rows.some(r => r.stage === s));
// A row kept with its when cleared (no public date yet, or a date that ran backwards): said in plain words.
export const blankedText = (n: number) => n === 1 ? "1 row’s date was left blank" : `${n} rows’ dates were left blank`;
export const longDate = (iso: string | null) => { if (!iso) return ""; const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); };
// What the When cell says: the words and the date together.
export const whenText = (r: Pick<PlanRowState, "when_text" | "when_date">) => [r.when_text.trim(), longDate(r.when_date)].filter(Boolean).join(", ");

// ---------- Plain sentences for each answer ----------
export function planMessage(status: string): string {
  switch (status) {
    case "denied": return "Only the lead and co-facilitators of this engagement can use the visibility plan.";
    case "closed": return "This engagement is closed, so the visibility plan can't change.";
    case "ai_off": return "AI is off for this engagement. Add the rows by hand, or turn AI on in the engagement settings.";
    case "ai_unavailable": return "AI isn't set up on this server yet. Add the rows by hand.";
    case "busy": return "The plan is already being drafted. Give it a moment.";
    case "confirm": return "Some rows are yours. Choose whether to keep them.";
    case "not_found": return "That one is gone. Reload the page.";
    case "unchanged": return "Nothing changed.";
    case "duplicate": return "That was already done.";
    case "unsourced": return "This row has no source left. Edit it into your own words, or draft the plan again.";
    case "invalid_request": return "Check the details and try again.";
    default: return "We couldn't save that. Try again.";
  }
}

// ---------- The calls the page makes ----------
export type Cells = { stage?: Stage; who?: string; when_text?: string; when_date?: string | null; by_whom?: string; what_they_hear?: string; risk?: string };
export type PlanBody =
  | { action: "set"; moment: string; date: string | null }
  | { action: "draft"; id: string; confirm: boolean }
  | { action: "edit"; row: string; cells: Cells }
  | { action: "add"; cells: Cells & { stage: Stage; who: string } }
  | { action: "remove" | "reviewed" | "unreview"; row: string }
  | { action: "move"; row: string; direction: "up" | "down" };

const allStages: Stage[] = [...stageOrder, "other"];
const clean = (value: unknown) => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
const LIMITS = { who: 200, when_text: 120, by_whom: 200, what_they_hear: 600, risk: 400 } as const;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

export function cellsOf(raw: unknown, requireWho: boolean): Cells | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Check the details and try again." };
  const o = raw as Record<string, unknown>, out: Cells = {};
  if (o.stage !== undefined) { if (!allStages.includes(o.stage as Stage)) return { error: "Choose who hears it." }; out.stage = o.stage as Stage; }
  for (const k of ["who", "when_text", "by_whom", "what_they_hear", "risk"] as const) {
    if (o[k] === undefined) continue;
    const v = clean(o[k]);
    if (v.length > LIMITS[k]) return { error: `Keep this to ${LIMITS[k]} characters.` };
    out[k] = v;
  }
  if (o.when_date !== undefined) {
    if (o.when_date === null || o.when_date === "") out.when_date = null;
    else if (isDate(o.when_date)) out.when_date = o.when_date; else return { error: "Write the date as year, month and day." };
  }
  if (out.who !== undefined && !out.who) return { error: "Say who hears it." };
  if (requireWho && !out.who) return { error: "Say who hears it." };
  return out;
}

export function planBody(raw: Record<string, unknown> | null): PlanBody | { error: string } | null {
  if (!raw) return null;
  switch (raw.action) {
    case "set": {
      const moment = clean(raw.moment);
      if (!moment) return { error: "Name the public moment." };
      if (moment.length > 80) return { error: "Keep the name to 80 characters." };
      if (raw.date !== null && raw.date !== undefined && raw.date !== "" && !isDate(raw.date)) return { error: "Write the date as year, month and day." };
      return { action: "set", moment, date: isDate(raw.date) ? raw.date : null };
    }
    case "draft": return uuid(raw.id) ? { action: "draft", id: raw.id as string, confirm: raw.confirm === true } : null;
    case "edit": {
      if (!uuid(raw.row)) return null;
      const cells = cellsOf(raw.cells, false);
      if ("error" in cells) return cells;
      return Object.keys(cells).length ? { action: "edit", row: raw.row as string, cells } : null;
    }
    case "add": {
      const cells = cellsOf(raw.cells, true);
      if ("error" in cells) return cells;
      return { action: "add", cells: { ...cells, stage: cells.stage ?? "other", who: cells.who ?? "" } };
    }
    case "remove": case "reviewed": case "unreview": return uuid(raw.row) ? { action: raw.action, row: raw.row as string } : null;
    case "move": return uuid(raw.row) && (raw.direction === "up" || raw.direction === "down") ? { action: "move", row: raw.row as string, direction: raw.direction } : null;
    default: return null;
  }
}
