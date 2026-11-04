// Milestone 4, step 4: Outcome bullets (D1-11, D1-12) and Outcome confirm (D2-05, D2-06).
// The shapes the server sends and the small rules every surface shares. Every number (counts,
// the four to six note, which outcome is empty) is the server's, from results_bullets,
// results_confirm and confirm_for; nothing here counts or decides.
import { uuid } from "../room/identity";

export type OutcomeRail = { id: string; number: number; title: string; count: number; empty: boolean };
export type BulletLine = { id: string; text: string; typing: boolean; order: number };
export type BulletsResults = {
  total: number; people: number; year: number | null; outcomes: OutcomeRail[];
  current: (OutcomeRail & { earlier: number; bullets: BulletLine[] }) | null;
};
export type ConfirmRow = {
  id: string; number: number; title: string; was: string | null; c: number; r: number; x: number;
  challenged: boolean; decision: "confirmed" | "renamed" | null;
};
export type ConfirmResults = { total: number; people: number; outcomes: ConfirmRow[]; confirmed: number; provisional: number };

const obj = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const num = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const str = (value: unknown) => typeof value === "string" ? value : "";

export function bulletsOf(results: unknown): BulletsResults {
  const r = obj(results);
  const outcomes = (Array.isArray(r.outcomes) ? r.outcomes : []).map(obj).filter(o => typeof o.id === "string").map(o => (
    { id: str(o.id), number: num(o.number), title: str(o.title), count: num(o.count), empty: o.empty === true }));
  const c = r.current && typeof r.current === "object" ? obj(r.current) : null;
  return {
    total: num(r.total), people: num(r.people), year: typeof r.year === "number" ? r.year : null, outcomes,
    current: c && typeof c.id === "string" ? {
      id: str(c.id), number: num(c.number), title: str(c.title), count: num(c.count), empty: c.empty === true, earlier: num(c.earlier),
      bullets: (Array.isArray(c.bullets) ? c.bullets : []).map(obj).filter(b => typeof b.id === "string")
        .map(b => ({ id: str(b.id), text: str(b.text), typing: b.typing === true, order: num(b.order) })),
    } : null,
  };
}
export function confirmOf(results: unknown): ConfirmResults {
  const r = obj(results);
  return {
    total: num(r.total), people: num(r.people), confirmed: num(r.confirmed), provisional: num(r.provisional),
    outcomes: (Array.isArray(r.outcomes) ? r.outcomes : []).map(obj).filter(o => typeof o.id === "string").map(o => ({
      id: str(o.id), number: num(o.number), title: str(o.title), was: typeof o.was === "string" ? o.was : null, c: num(o.c), r: num(o.r), x: num(o.x),
      challenged: o.challenged === true, decision: o.decision === "renamed" ? "renamed" : o.decision === "confirmed" ? "confirmed" : null })),
  };
}

// ---------- Typing ----------
// A phone tells the server what it has typed at most once every batch window; the server
// tells the room at most once per window too, so the TV shows text as it is typed without
// flooding the channel. The window is cwl-dur-type-batch's 120 ms, the lock cwl-dur-field-lock's 3 s.
export const typeBatchMs = 120;
export const fieldLockMs = 3000;
export const bulletMax = 280;

// What the phone holds while someone types: the bullet's own id (it becomes the answer's id),
// the outcome it was begun under, and a count that only grows.
export type TypedUpdate = { id: string; session: string; outcome: string; text: string; seq: number; revision?: number };
export function typeBody(raw: unknown): ({ action: "type" } & TypedUpdate) | { action: "nudge"; session: string } | null {
  const b = obj(raw);
  if (b.action === "nudge") return uuid(b.session) ? { action: "nudge", session: b.session as string } : null;
  if (b.action !== "type" || !uuid(b.id) || !uuid(b.session) || !uuid(b.outcome) || typeof b.text !== "string" || b.text.length > 600) return null;
  if (typeof b.seq !== "number" || !Number.isInteger(b.seq) || b.seq < 0 || b.seq > 1_000_000) return null;
  const revision = b.revision;
  if (revision !== undefined && (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0 || revision > 1_000_000)) return null;
  return { action: "type", id: b.id as string, session: b.session as string, outcome: b.outcome as string, text: b.text, seq: b.seq, ...(revision !== undefined ? { revision: revision as number } : {}) };
}
export const typeStatusCode = (status: string) => ["ok"].includes(status) ? 200 : status === "denied" ? 403 : ["closed", "conflict", "stale", "locked"].includes(status) ? 409 : 422;

// ---------- Outcome confirm ----------
export type Choice = "confirm" | "rename" | "challenge";
export type ConfirmEntry = { c: Choice; name?: string; reason?: string };
export type ConfirmAnswer = Record<string, ConfirmEntry>;
export const nameMax = 120, reasonMax = 280;
// The phone sends the whole list each time; the server keeps the latest answer per person.
export function confirmValue(answer: ConfirmAnswer) { return { outcomes: answer }; }
export function confirmText(answer: ConfirmAnswer) {
  const all = Object.values(answer);
  return `${all.filter(a => a.c === "confirm").length} confirm, ${all.filter(a => a.c === "rename").length} rename, ${all.filter(a => a.c === "challenge").length} challenge`;
}
export function checkEntry(entry: ConfirmEntry): { ok: boolean; message: string } {
  const name = (entry.name ?? "").trim(), reason = (entry.reason ?? "").trim();
  if (entry.c === "rename" && !name) return { ok: false, message: "Type the new name." };
  if (name.length > nameMax) return { ok: false, message: `${name.length - nameMax} characters over. Keep the name to ${nameMax}.` };
  if (reason.length > reasonMax) return { ok: false, message: `${reason.length - reasonMax} characters over. Keep the reason to ${reasonMax}.` };
  return { ok: true, message: "" };
}
// Reads the person's own last answer back from the value the server keeps for them.
export function ownConfirm(value: unknown): ConfirmAnswer {
  const list = obj(obj(value).outcomes), out: ConfirmAnswer = {};
  for (const [id, raw] of Object.entries(list)) {
    const e = obj(raw), c = e.c;
    if (c !== "confirm" && c !== "rename" && c !== "challenge") continue;
    out[id] = { c, ...(typeof e.name === "string" ? { name: e.name } : {}), ...(typeof e.reason === "string" ? { reason: e.reason } : {}) };
  }
  return out;
}

// ---------- The facilitator's presses ----------
export type OutcomePress =
  | { id: string; kind: "bullets"; action: "show"; outcome: string }
  | { id: string; kind: "bullets"; action: "edit"; bullet: string; text: string }
  | { id: string; kind: "confirm"; action: "decide"; outcome: string; decision: "confirm" | "rename" | "remove"; name?: string; reasons?: string; description?: string; stop?: string }
  | { id: string; kind: "confirm"; action: "details"; outcome: string; description?: string; stop?: string };
export function pressBody(raw: unknown): OutcomePress | null {
  const b = obj(raw);
  if (!uuid(b.id)) return null;
  const id = b.id as string, opt = (v: unknown, max: number) => typeof v === "string" && v.length <= max ? v : undefined;
  if (b.kind === "bullets" && b.action === "show" && uuid(b.outcome)) return { id, kind: "bullets", action: "show", outcome: b.outcome as string };
  if (b.kind === "bullets" && b.action === "edit" && uuid(b.bullet) && typeof b.text === "string" && b.text.length <= 600) return { id, kind: "bullets", action: "edit", bullet: b.bullet as string, text: b.text };
  if (b.kind === "confirm" && b.action === "decide" && uuid(b.outcome) && (b.decision === "confirm" || b.decision === "rename" || b.decision === "remove")) {
    const out: OutcomePress = { id, kind: "confirm", action: "decide", outcome: b.outcome as string, decision: b.decision };
    const name = opt(b.name, 200), reasons = opt(b.reasons, 1000), description = opt(b.description, 400), stop = opt(b.stop, 800);
    if (name !== undefined) out.name = name; if (reasons !== undefined) out.reasons = reasons; if (description !== undefined) out.description = description; if (stop !== undefined) out.stop = stop;
    return out;
  }
  if (b.kind === "confirm" && b.action === "details" && uuid(b.outcome)) {
    const description = opt(b.description, 400), stop = opt(b.stop, 800);
    if (description === undefined && stop === undefined) return null;
    return { id, kind: "confirm", action: "details", outcome: b.outcome as string, ...(description !== undefined ? { description } : {}), ...(stop !== undefined ? { stop } : {}) };
  }
  return null;
}
export const pressStatusCode = (status: string) => ["ok", "duplicate", "unchanged"].includes(status) ? 200 : status === "denied" ? 403 : status === "invalid_request" || status === "filtered" ? 422 : 409;

// The note under the list. Four to six is the Wayfinding range; outside it a warning, never a block.
export function rangeNote(range: { confirmed: number; note?: "fewer" | "more" | null } | null | undefined): string {
  if (!range) return "";
  if (range.note === "fewer") return `${range.confirmed} confirmed. Wayfinding works best with four to six.`;
  if (range.note === "more") return `${range.confirmed} confirmed. Wayfinding works best with four to six.`;
  return "";
}
