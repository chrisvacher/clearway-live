// INT-11 The Four Helpful Lists: the shapes the server sends and the pure rules every surface shares.
// A card is a column and a few words; many cards per person. Agreeing is its own write, one per person per card,
// toggled, never on your own card. Every number (agree, folded, rank) is the server's, from results_four_lists;
// nothing here counts or ranks on its own.
import type { OutboxEntry } from "../phone/types";
import type { SubmissionRequest } from "../live/types";
import { uuid } from "../room/identity";

export const fourColumns = ["right", "wrong", "missing", "confused"] as const;
export type FourColumn = typeof fourColumns[number];
export const isFourColumn = (value: unknown): value is FourColumn => fourColumns.includes(value as FourColumn);
// The four headings, as the facilitator says them (design pass 6).
export const columnLabels: Record<FourColumn, string> = { right: "What’s right?", wrong: "What’s wrong?", missing: "What’s missing?", confused: "What’s confused?" };
export const columnWords: Record<FourColumn, string> = { right: "right", wrong: "wrong", missing: "missing", confused: "confused" };

export type FourCard = {
  id: string; column: FourColumn; text: string; agree: number; folded: number; ai?: boolean; pinned?: boolean; ids: string[]; rank: number; at: number;
  hidden?: boolean; members?: { id: string; text: string; merge: string; by: "words" | "ai" }[];
};
export type FourResults = { total: number; people: number; ai?: boolean; columns?: Partial<Record<FourColumn, number>>; cards?: FourCard[] };

export function cardsOf(results: unknown): FourCard[] {
  const list = results && typeof results === "object" ? (results as FourResults).cards : null;
  return Array.isArray(list) ? list.filter((c): c is FourCard => Boolean(c) && typeof c.id === "string" && typeof c.text === "string" && isFourColumn(c.column)
    && Number.isFinite(c.agree) && Number.isFinite(c.rank)) : [];
}
export const columnTotals = (results: unknown): Record<FourColumn, number> => {
  const c = results && typeof results === "object" ? (results as FourResults).columns ?? {} : {};
  return { right: Number(c.right) || 0, wrong: Number(c.wrong) || 0, missing: Number(c.missing) || 0, confused: Number(c.confused) || 0 };
};

// The TV shows the top four cards of each column in the server's rank (agreement, then arrival), three when the
// column holds long cards, and says how many more wait on phones.
export const longCard = 80, topCards = 4, topLong = 3;
export function topOf(cards: FourCard[], column: FourColumn, total?: number) {
  const mine = cards.filter(c => c.column === column && !c.hidden).sort((a, b) => a.rank - b.rank);
  const cap = mine.slice(0, topCards).some(c => c.text.length > longCard) ? topLong : topCards;
  const shown = mine.slice(0, cap);
  return { shown, rest: Math.max(0, Math.max(total ?? 0, mine.length) - shown.length) };
}
export const moreLine = (rest: number) => rest > 0 ? `+ ${rest} more on phones` : "";
// A card an AI fold stands for: the survivor and what folded beneath it ("AI 3").
export const foldedCount = (c: Pick<FourCard, "folded">) => c.folded + 1;
// The card that now holds a folded one (a fold glides into its survivor).
export const foldedInto = (id: string, cards: FourCard[]) => cards.find(c => c.id !== id && c.ids.includes(id))?.id ?? null;
export const agreeLabel = (n: number) => `${n} ${n === 1 ? "person agrees" : "people agree"}`;
export const cardLabel = (c: FourCard) => `${c.text}. ${agreeLabel(c.agree)}${c.folded ? `, ${c.ai ? "combined by AI, " : ""}${c.folded + 1} cards` : ""}`;

// Mirrors the database's checks, so the phone holds Send and says why.
export const fourMax = 280;
export function checkCard(text: string, max = 140, words = 30): { ok: boolean; message: string; count: string } {
  const trimmed = text.trim(), length = [...trimmed].length, limit = Math.min(max, fourMax), count = trimmed ? trimmed.split(/\s+/).length : 0;
  return { ok: length > 0 && length <= limit && count <= words, count: `${length} / ${limit}`,
    message: length > limit ? `${length - limit} characters over. Keep it to ${limit}.` : count > words ? `${count - words} words over. Keep it to ${words}.` : "" };
}

// ---------- The phone: agreeing with others' cards ----------
// A person's agree is one row per card: its id stays, each press raises the revision and says on or off, so a resend
// never toggles twice. The phone's outbox holds it until the server settles it.
export type FourAgree = { id: string; card_id: string; agreed: boolean; revision: number };
export type AgreeRequest = SubmissionRequest & { value: { four: "agree"; card: string; on: boolean } };
export const isAgree = (r: SubmissionRequest): r is AgreeRequest =>
  Boolean(r.value && typeof r.value === "object" && (r.value as { four?: string }).four === "agree");

export function agreeState(server: FourAgree[], outbox: OutboxEntry[]) {
  const out = new Map<string, FourAgree & { pending: boolean; failed: boolean }>();
  for (const v of server) out.set(v.card_id, { ...v, pending: false, failed: false });
  for (const e of outbox) {
    if (!isAgree(e.request)) continue;
    const q = e.request.value.card, before = out.get(q);
    if (e.state === "failed") { if (!before || before.revision < e.request.revision) out.set(q, { ...(before ?? { id: e.request.id, card_id: q, agreed: false, revision: -1 }), pending: false, failed: true }); continue; }
    if (before && !before.pending && before.revision >= e.request.revision && before.id === e.request.id) continue;
    out.set(q, { id: e.request.id, card_id: q, agreed: e.request.value.on, revision: e.request.revision, pending: true, failed: false });
  }
  return out;
}
export function nextAgree(current: (FourAgree & { pending?: boolean }) | undefined, makeId: () => string) {
  return current && current.revision >= 0 ? { id: current.id, revision: current.revision + 1, on: !current.agreed } : { id: makeId(), revision: 0, on: true };
}
// Other people's cards in one column for this phone to agree with: the person's own cards and folded duplicates of
// them are left out (the database refuses them too), the strongest first, and only a few at a time.
export const agreeRows = 3;
export function agreeOptions(cards: FourCard[], column: FourColumn, own: Set<string>, limit = agreeRows) {
  return cards.filter(c => c.column === column && !c.hidden && !c.ids.some(id => own.has(id))).sort((a, b) => a.rank - b.rank).slice(0, limit);
}

// ---------- Request bodies, checked again by the database ----------
const time = (v: unknown) => typeof v === "string" && v.length <= 40 && Number.isFinite(Date.parse(v));
const uncertainty = (v: unknown) => v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 60000);
export function agreeBody(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const b = v as Record<string, unknown>;
  if (!uuid(b.id) || !uuid(b.card) || typeof b.on !== "boolean" || !Number.isInteger(b.revision) || (b.revision as number) < 0 || (b.revision as number) > 1000000
    || !time(b.sentAt) || (b.queuedAt !== undefined && b.queuedAt !== null && !time(b.queuedAt)) || !uncertainty(b.uncertaintyMs)) return null;
  return { id: b.id as string, card: b.card as string, revision: b.revision as number, on: b.on, sentAt: b.sentAt as string, queuedAt: (b.queuedAt as string | undefined) || null, uncertaintyMs: (b.uncertaintyMs as number | undefined) ?? 0 };
}
export const fourActions = ["undo_fold", "pin", "unpin", "hide", "unhide"] as const;
export type FourAction = typeof fourActions[number];
export function fourControlBody(v: unknown): { id: string; action: FourAction; p: Record<string, unknown> } | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const b = v as Record<string, unknown>;
  if (!uuid(b.id) || !fourActions.includes(b.action as FourAction)) return null;
  const action = b.action as FourAction, p: Record<string, unknown> = {};
  if (action === "undo_fold") { if (!uuid(b.merge)) return null; p.merge = b.merge; }
  else { if (!uuid(b.card)) return null; p.card = b.card; }
  return { id: b.id as string, action, p };
}
// The phone's outbox settles only on the statuses it knows; the route speaks its language.
export const outboxStatus = (status: string) => status === "own" ? "invalid_answer" : status === "missing" ? "invalid_session" : status;
export function fourMessage(status: string) {
  switch (status) {
    case "ok": case "duplicate": case "unchanged": return "";
    case "missing": return "That card is no longer on the list.";
    case "invalid_request": return "Check the card and try again.";
    case "closed": return "This engagement has closed.";
    case "denied": return "You’re not assigned to this engagement.";
    default: return "We couldn’t reach the room. The TV and phones keep running. Try again.";
  }
}

// SET-05: the facilitator's review, one step at a time, every card by column.
export type ReviewCard = FourCard & { members: { id: string; text: string; merge: string; by: "words" | "ai" }[] };
export type FourReview = { status: "ok"; engagement: { id: string; title: string };
  sessions: { id: string; title: string; part: string; state: string; people: number; cards: ReviewCard[] }[] };
export function reviewColumns(cards: ReviewCard[]) {
  return fourColumns.map(column => ({ column, label: columnLabels[column], cards: cards.filter(c => c.column === column && !c.hidden).sort((a, b) => a.rank - b.rank),
    hidden: cards.filter(c => c.column === column && c.hidden) }));
}
