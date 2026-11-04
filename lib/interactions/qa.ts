// INT-03 Q&A: the shapes the server sends and the pure rules every surface shares.
// Every number (people, askers, votes, rank) is the server's, from results_qa; nothing
// here counts or ranks on its own.
import type { OutboxEntry } from "../phone/types";
import type { SubmissionRequest } from "../live/types";
import { uuid } from "../room/identity";

export type QaQuestion = {
  id: string; text: string; askers: number; votes: number; people: number; score: number; rank?: number; folded: number;
  ai?: boolean; ids: string[]; answered: boolean; edited: boolean; at: number;
  hidden?: boolean; original?: string; members?: { id: string; text: string; merge: string; by: "words" | "ai" | "facilitator" }[];
};
export type QaResults = { total: number; people: number; questions?: QaQuestion[] };
export type QaPool = { session_id: string; title: string; max_characters: number; max_sends: number; waiting: number };
export type QaSpot = { id: string; session_id: string; text: string; people: number; askers: number; ai: boolean };
export type QaPublic = { pool: QaPool | null; spotlight: QaSpot | null };
export const qaMax = 200, qaTop = 3;

export function questionsOf(results: unknown): QaQuestion[] {
  const list = results && typeof results === "object" ? (results as QaResults).questions : null;
  return Array.isArray(list) ? list.filter(q => q && typeof q.id === "string" && typeof q.text === "string") : [];
}
// The TV: the top three waiting questions, in the server's rank, and how many more wait on phones.
export function topQuestions(list: QaQuestion[], top = qaTop) {
  const waiting = list.filter(q => !q.answered && !q.hidden).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  return { shown: waiting.slice(0, top), rest: Math.max(0, waiting.length - top) };
}
// A question that folded away: the group whose ids now hold it (it glides into that row).
export function foldedInto(id: string, list: QaQuestion[]) {
  return list.find(q => q.id !== id && q.ids.includes(id))?.id ?? null;
}
// Questions any time: Ask shows on every session's phone screen while the engagement has a
// pool, which the server keeps after the pool step has run and closed. The one exception is
// the pool step itself while the room is on it, which has its own question box.
export function showsAsk(pool: Pick<QaPool, "session_id"> | null | undefined, viewing: string | null): pool is QaPool {
  return Boolean(pool) && viewing !== pool!.session_id;
}
// The label below a question two or more people asked (Chris, November 4): "Asked by 2", led on the TV
// and phones by the AI icon and a dot when AI folded them. No "Combined".
export const askedBy = (q: Pick<QaQuestion, "askers">) => q.askers > 1 ? `Asked by ${q.askers}` : "";
export const moreLine = (rest: number) => rest > 0 ? `+ ${rest} more on your phones` : "";

// Mirrors the database's checks, so the phone holds Ask and says why.
export function checkQuestion(text: string, max = qaMax): { ok: boolean; message: string; count: string } {
  const length = [...text.trim()].length, limit = Math.min(max, 280);
  return { ok: length > 0 && length <= limit, count: `${length} / ${limit}`, message: length > limit ? `${length - limit} characters over. Keep it to ${limit}.` : "" };
}

// ---------- The phone's Q&A outbox ----------
// Votes and Questions any time asks ride the phone's own outbox (offline order, ids,
// revisions). A vote is the person's one row per question: its id stays, each press raises
// the revision and says on or off, so a resend never toggles twice.
export type QaVote = { id: string; question_id: string; voted: boolean; revision: number };
export type QaRequest = SubmissionRequest & { value: { qa: "vote"; question: string; on: boolean } | { qa: "ask" } };
export const isVote = (r: SubmissionRequest): r is QaRequest & { value: { qa: "vote"; question: string; on: boolean } } =>
  Boolean(r.value && typeof r.value === "object" && (r.value as { qa?: string }).qa === "vote");
export const isAsk = (r: SubmissionRequest) => Boolean(r.value && typeof r.value === "object" && (r.value as { qa?: string }).qa === "ask");

// The person's vote on each question now: the server's, overlaid with what is still on this
// phone, newest revision winning. Pending says whether it is still waiting to send.
export function voteState(server: QaVote[], outbox: OutboxEntry[]) {
  const out = new Map<string, QaVote & { pending: boolean; failed: boolean }>();
  for (const v of server) out.set(v.question_id, { ...v, pending: false, failed: false });
  for (const e of outbox) {
    if (!isVote(e.request)) continue;
    const q = e.request.value.question, before = out.get(q);
    if (e.state === "failed") { if (!before || before.revision < e.request.revision) out.set(q, { ...(before ?? { id: e.request.id, question_id: q, voted: false, revision: -1 }), pending: false, failed: true }); continue; }
    if (before && !before.pending && before.revision >= e.request.revision && before.id === e.request.id) continue;
    out.set(q, { id: e.request.id, question_id: q, voted: e.request.value.on, revision: e.request.revision, pending: true, failed: false });
  }
  return out;
}
// The next press on a question: the same id and the next revision, or a new vote.
export function nextVote(question: string, current: (QaVote & { pending?: boolean }) | undefined, makeId: () => string) {
  return current && current.revision >= 0 ? { id: current.id, revision: current.revision + 1, on: !current.voted } : { id: makeId(), revision: 0, on: true };
}

// ---------- Request bodies, checked again by the database ----------
const time = (v: unknown) => typeof v === "string" && v.length <= 40 && Number.isFinite(Date.parse(v));
const uncertainty = (v: unknown) => v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 60000);
export function voteBody(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const b = v as Record<string, unknown>;
  if (!uuid(b.id) || !uuid(b.question) || typeof b.on !== "boolean" || !Number.isInteger(b.revision) || (b.revision as number) < 0 || (b.revision as number) > 1000000
    || !time(b.sentAt) || (b.queuedAt !== undefined && b.queuedAt !== null && !time(b.queuedAt)) || !uncertainty(b.uncertaintyMs)) return null;
  return { id: b.id as string, question: b.question as string, revision: b.revision as number, on: b.on, sentAt: b.sentAt as string, queuedAt: (b.queuedAt as string | undefined) || null, uncertaintyMs: (b.uncertaintyMs as number | undefined) ?? 0 };
}
export function askBody(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const b = v as Record<string, unknown>;
  if (!uuid(b.id) || typeof b.text !== "string" || b.text.length > 1404 || !time(b.sentAt) || (b.queuedAt !== undefined && b.queuedAt !== null && !time(b.queuedAt)) || !uncertainty(b.uncertaintyMs)) return null;
  return { id: b.id as string, text: b.text, sentAt: b.sentAt as string, queuedAt: (b.queuedAt as string | undefined) || null, uncertaintyMs: (b.uncertaintyMs as number | undefined) ?? 0 };
}
export const qaActions = ["spotlight", "clear_spotlight", "answered", "unanswer", "edit", "undo_fold", "hide", "unhide"] as const;
export type QaAction = typeof qaActions[number];
export function qaControlBody(v: unknown): { id: string; action: QaAction; p: Record<string, unknown> } | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const b = v as Record<string, unknown>;
  if (!uuid(b.id) || !qaActions.includes(b.action as QaAction)) return null;
  const action = b.action as QaAction, p: Record<string, unknown> = {};
  if (action === "undo_fold") { if (!uuid(b.merge)) return null; p.merge = b.merge; }
  else if (action !== "clear_spotlight") { if (!uuid(b.question)) return null; p.question = b.question; }
  if (action === "edit") { if (typeof b.text !== "string" || !b.text.trim() || b.text.length > 280) return null; p.text = b.text; }
  return { id: b.id as string, action, p };
}
// The phone's outbox settles only on the statuses it knows; the routes speak its language.
export function outboxStatus(status: string) {
  return status === "own" ? "invalid_answer" : status === "missing" ? "invalid_session" : status;
}
export function qaMessage(status: string) {
  switch (status) {
    case "ok": case "duplicate": case "unchanged": return "";
    case "missing": return "That question is no longer on the list.";
    case "hidden": return "Unhide this question first.";
    case "invalid_state": return "An answered question can’t be spotlit. Bring it back first.";
    case "filtered": return "Those words can’t go on the screen. Try different words.";
    case "invalid_request": return "Check the question and try again.";
    case "closed": return "This engagement has closed.";
    case "denied": return "You’re not assigned to this engagement.";
    default: return "We couldn’t reach the room. The TV and phones keep running. Try again.";
  }
}
