// D2-03, D2-04 and INT-14, the Day 2 read-back: the shapes the server sends and the pure rules every surface shares.
// The TV reads the five signed-off lens summaries, then each reviewed outcome with its 3-year Vision bullets, one at a time.
// Phones answer "Yes, that's us" or "It needs a change" and may add "What's missing?". A correction folds in as a tracked
// change. Every number here is the server's. Counts show where the room is; they never decide, the facilitator does.
import type { Change, Part } from "@/lib/interactions/lens-summary";
import { changesOf, partsOf } from "@/lib/interactions/lens-summary";

export { reconcile, glideMoved, lineSize, leaveMs, moreOnPhones, struckHoldMs } from "@/lib/interactions/lens-summary";
export type { Change, Part, Row } from "@/lib/interactions/lens-summary";

export const changeLimit = 140;
export const missingLimit = 280;
export const readBackLimit = 420;
export const maxReadBackLines = 8;
export const yesText = "Yes, that's us";
export const changeText = "It needs a change";
export const askText = "Did we hear you right?";
export const missingText = "What's missing?";
// The TV shows this many "What's missing?" answers; the rest are counted.
export const shownMissing = 6;

export type ReadBackLine = { id: string; pos: number; text: string; origin: "source" | "correction"; marks: Part[] | null };
export type ItemChip = { id: string; kind: "lens" | "outcome"; label: string; state: "now" | "settled" | "later" };
export type ReadBackItem = {
  id: string; kind: "lens" | "outcome"; lens: number | null; heading: string; year: number; horizon: string; versionId: string; version: number;
  author: "source" | "code" | "ai"; tracked: boolean; lines: ReadBackLine[]; fit: number; more: number; changes: Change[]; settled: boolean; decision: string;
};
export type ReadBackResults = {
  items: ItemChip[]; index: number; count: number; of: number; published: boolean; item: ReadBackItem | null;
  tally: { yes: number; change: number }; missing: { id: string; text: string }[]; missingCount: number; people: number;
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 2000) => typeof value === "string" ? value.slice(0, max) : "";
const num = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

function linesOf(value: unknown): ReadBackLine[] {
  return list(value).flatMap((x): ReadBackLine[] => {
    const o = record(x);
    return typeof o.id === "string" && typeof o.text === "string" ? [{ id: o.id, pos: num(o.pos), text: o.text, origin: o.origin === "correction" ? "correction" : "source", marks: o.marks == null ? null : partsOf(o.marks) }] : [];
  });
}
export const chipsOf = (value: unknown): ItemChip[] => list(value).flatMap((x): ItemChip[] => {
  const o = record(x);
  return typeof o.id === "string" ? [{ id: o.id, kind: o.kind === "outcome" ? "outcome" : "lens", label: text(o.label, 200), state: o.state === "now" || o.state === "settled" ? o.state : "later" }] : [];
});

// What the room's results carry (private.results_read_back).
export function readBackOf(results: unknown): ReadBackResults {
  const r = record(results), i = record(r.item), tally = record(r.tally);
  const item = typeof i.id === "string" && typeof i.version_id === "string" ? {
    id: i.id, kind: i.kind === "outcome" ? "outcome" as const : "lens" as const, lens: i.lens == null ? null : num(i.lens), heading: text(i.heading, 200), year: num(i.year), horizon: text(i.horizon, 40),
    versionId: i.version_id, version: num(i.version), author: i.author === "ai" ? "ai" as const : i.author === "code" ? "code" as const : "source" as const, tracked: i.tracked === true,
    lines: linesOf(i.lines), fit: num(i.fit), more: num(i.more), changes: changesOf(i.changes), settled: i.settled === true, decision: text(i.decision, 400),
  } : null;
  return {
    items: chipsOf(r.items), index: num(r.index), count: num(r.count), of: num(r.of), published: r.published === true, item,
    tally: { yes: num(tally.yes), change: num(tally.change) }, people: num(r.people),
    missing: list(r.missing).flatMap((x): { id: string; text: string }[] => { const o = record(x); return typeof o.id === "string" && typeof o.text === "string" ? [{ id: o.id, text: o.text }] : []; }),
    missingCount: Math.max(list(r.missing).length, num(r.total) - num(tally.yes) - num(tally.change)),
  };
}
// The lines the TV shows: the first `fit`, the rest "+ n more on phones" (the 420-character one-screen rule).
export const shownReadBack = (item: ReadBackItem) => item.lines.slice(0, Math.max(1, item.fit));
// A bar's share of the room, from the people here. No bar is the leader: both use the same colour.
export const share = (n: number, of: number) => of > 0 ? Math.min(100, Math.round((n / of) * 100)) : 0;

// ---------- The phone ----------
export type OwnAnswers = { response: "yes" | "change" | null; change: string; missing: { id: string; text: string }[] };
export function ownAnswers(mine: { id?: string; value?: unknown; text: string; withdrawn: boolean }[], versionId: string | undefined, itemVersions: string[]): OwnAnswers {
  let response: OwnAnswers["response"] = null, change = "";
  const missing: OwnAnswers["missing"] = [];
  if (!versionId) return { response, change, missing };
  for (const a of mine) {
    if (a.withdrawn) continue;
    const v = record(a.value);
    if (v.response === "missing" && typeof v.version === "string" && itemVersions.includes(v.version)) missing.push({ id: a.id ?? String(missing.length), text: a.text });
    else if (v.version === versionId && (v.response === "yes" || v.response === "change")) { response = v.response; change = v.response === "change" ? a.text : ""; }
  }
  return { response, change, missing };
}
export function checkText(value: string, limit: number): { ok: boolean; message: string; count: string } {
  const length = [...value.trim()].length;
  return { ok: length > 0 && length <= limit, count: `${length} / ${limit}`, message: length > limit ? `${length - limit} characters over. Keep it to ${limit}.` : "" };
}
export type PhoneLine = { id: string; text: string; sources: string[] };
export type PhoneRead = {
  item: { id: string; versionId: string; lines: PhoneLine[] } | null;
  settled: { id: string; kind: "lens" | "outcome"; heading: string; changed: boolean; lines: string[] }[];
};
export function phoneOf(value: unknown): PhoneRead | null {
  const r = record(value);
  if (r.status !== "ok") return null;
  const i = record(r.item);
  return {
    item: typeof i.id === "string" && typeof i.version_id === "string" ? { id: i.id, versionId: i.version_id, lines: list(i.lines).flatMap((x): PhoneLine[] => {
      const o = record(x);
      return typeof o.id === "string" && typeof o.text === "string" ? [{ id: o.id, text: o.text, sources: list(o.sources).flatMap(s => { const t = record(s).text; return typeof t === "string" ? [t] : []; }) }] : [];
    }) } : null,
    settled: list(r.settled).flatMap(x => {
      const o = record(x);
      return typeof o.id === "string" ? [{ id: o.id, kind: o.kind === "outcome" ? "outcome" as const : "lens" as const, heading: text(o.heading, 200), changed: o.changed === true,
        lines: list(o.lines).flatMap(l => { const t = record(l).text; return typeof t === "string" ? [t] : []; }) }] : [];
    }),
  };
}

// ---------- The scribe's composer ----------
export type ScribeRead = { session: string | null; item: { id: string; heading: string; kind: "lens" | "outcome"; settled: boolean; versionId: string; lines: { id: string; pos: number; text: string }[] } | null };
export function scribeReadOf(value: unknown): ScribeRead | null {
  const r = record(value);
  if (r.status !== "ok") return null;
  const i = record(r.item);
  return {
    session: typeof r.session === "string" ? r.session : null,
    item: typeof i.id === "string" && typeof i.version_id === "string" ? { id: i.id, heading: text(i.heading, 200), kind: i.kind === "outcome" ? "outcome" : "lens", settled: i.settled === true, versionId: i.version_id,
      lines: list(i.lines).flatMap(x => { const o = record(x); return typeof o.id === "string" && typeof o.text === "string" ? [{ id: o.id, pos: num(o.pos), text: o.text }] : []; }) } : null,
  };
}
export const correctionLimit = 400;
export const reasonLimit = 400;
export type CorrectionDraft = { id: string; item: string; line: string | null; wording: string; reason: string };
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const clean = (v: unknown, max: number) => typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
// The scribe's correction as the route accepts it: a client-made id, the item, a line id, "new" or none, the agreed wording and the reason.
export function correctionOf(value: unknown): CorrectionDraft | null {
  const v = record(value);
  if (!isUuid(v.id) || !isUuid(v.item)) return null;
  const wording = clean(v.wording, correctionLimit), reason = typeof v.reason === "string" ? v.reason.trim().slice(0, reasonLimit) : "";
  const line = v.line === "new" ? "new" : isUuid(v.line) ? String(v.line).toLowerCase() : null;
  if (!wording || (v.line != null && v.line !== "" && !line)) return null;
  return { id: String(v.id).toLowerCase(), item: String(v.item).toLowerCase(), line, wording, reason };
}

// ---------- The control surface ----------
export type CorrectionState = "queued" | "folding" | "folded" | "dismissed" | "failed";
export type Correction = { id: string; state: CorrectionState; failure: string; wording: string; reason: string; source: "scribe" | "facilitator"; newLine: boolean; lineId: string | null; by: string; at: string; currentVersion: boolean };
export type FacilitatorLine = { id: string; pos: number; text: string; sources: string[]; marks: Part[] | null };
export type FacilitatorVersion = { id: string; version: number; author: string; note: string; tracked: boolean; undone: boolean; current: boolean; settled: boolean; at: string; wording: string; reason: string; lines: string[] };
export type ReadBackState = {
  session: string | null; version: number; room: ReadBackResults | null; items: (ItemChip & { versions: number; queued: number })[];
  item: { id: string; kind: "lens" | "outcome"; heading: string; settled: boolean; versionId: string; version: number; author: string; lines: FacilitatorLine[]; landed: boolean;
    decision: { decision: string; reasons: string } | null; versions: FacilitatorVersion[] } | null;
  changes: { id: string; text: string }[]; missing: { id: string; text: string; version: number }[]; corrections: Correction[];
  ai: { on: boolean; engagement: boolean; state: "off" | "folding" | "waiting" | "idle"; runningMs: number | null; failing: boolean; lastRun: { status: string; changed: boolean; undone: boolean } | null };
  published: { loaded: number | null; latest: number | null; any: boolean; newer: boolean }; notSigned: string[];
};
const correctionStates: readonly string[] = ["queued", "folding", "folded", "dismissed", "failed"];
export function readBackState(value: unknown): ReadBackState | null {
  const r = record(value);
  if (r.status !== "ok") return null;
  const i = record(r.item), ai = record(r.ai), last = record(ai.last_run), pub = record(r.published), dec = record(i.decision);
  const item = typeof i.id === "string" ? {
    id: i.id, kind: i.kind === "outcome" ? "outcome" as const : "lens" as const, heading: text(i.heading, 200), settled: i.settled === true, versionId: text(i.version_id, 64), version: num(i.version), author: text(i.author, 20),
    lines: list(i.lines).flatMap((x): FacilitatorLine[] => {
      const o = record(x);
      return typeof o.id === "string" && typeof o.text === "string" ? [{ id: o.id, pos: num(o.pos), text: o.text, marks: o.marks == null ? null : partsOf(o.marks),
        sources: list(o.sources).flatMap(s => { const t = record(s).text; return typeof t === "string" ? [t] : []; }) }] : [];
    }),
    landed: i.landed === true, decision: typeof dec.decision === "string" ? { decision: dec.decision, reasons: text(dec.reasons, 1000) } : null,
    versions: list(i.versions).flatMap((x): FacilitatorVersion[] => {
      const o = record(x);
      return typeof o.id === "string" ? [{ id: o.id, version: num(o.version), author: text(o.author, 20), note: text(o.note, 300), tracked: o.tracked === true, undone: o.undone === true, current: o.current === true, settled: o.settled === true,
        at: text(o.at, 40), wording: text(o.wording, 400), reason: text(o.reason, 400), lines: list(o.lines).filter((t): t is string => typeof t === "string") }] : [];
    }),
  } : null;
  const aiState = ai.state === "folding" || ai.state === "waiting" || ai.state === "off" ? ai.state : "idle";
  return {
    session: typeof r.session === "string" ? r.session : null, version: num(r.version), room: r.room ? readBackOf(r.room) : null,
    items: chipsOf(r.items).map((chip, n) => ({ ...chip, versions: num(record(list(r.items)[n]).versions), queued: num(record(list(r.items)[n]).queued) })),
    item,
    changes: list(r.changes).flatMap(x => { const o = record(x); return typeof o.id === "string" && typeof o.text === "string" ? [{ id: o.id, text: o.text }] : []; }),
    missing: list(r.missing).flatMap(x => { const o = record(x); return typeof o.id === "string" && typeof o.text === "string" ? [{ id: o.id, text: o.text, version: num(o.version) }] : []; }),
    corrections: list(r.corrections).flatMap((x): Correction[] => {
      const o = record(x);
      return typeof o.id === "string" && correctionStates.includes(o.state as string) ? [{ id: o.id, state: o.state as CorrectionState, failure: text(o.failure, 40), wording: text(o.wording, 400), reason: text(o.reason, 400),
        source: o.source === "facilitator" ? "facilitator" : "scribe", newLine: o.new_line === true, lineId: typeof o.line_id === "string" ? o.line_id : null, by: text(o.by, 60), at: text(o.at, 40), currentVersion: o.current_version === true }] : [];
    }),
    ai: { on: ai.on === true, engagement: ai.engagement === true, state: aiState, runningMs: ai.running_ms == null ? null : num(ai.running_ms), failing: ai.failing === true,
      lastRun: typeof last.status === "string" ? { status: last.status, changed: last.changed === true, undone: last.undone === true } : null },
    published: { loaded: pub.loaded == null ? null : num(pub.loaded), latest: pub.latest == null ? null : num(pub.latest), any: pub.any === true, newer: pub.newer === true },
    notSigned: list(r.not_signed).filter((n): n is string => typeof n === "string"),
  };
}
export const aiLine: Record<ReadBackState["ai"]["state"], string> = {
  off: "AI is off. Name the line yourself when you accept a correction.", folding: "AI is folding in a correction.", waiting: "AI folds in a correction as soon as it can.", idle: "AI is ready.",
};
export const failureLine: Record<string, string> = {
  no_line: "AI did not name a line. Pick the line and accept again.", number: "AI used a number the room never gave. Pick the line and accept again.", future: "AI wrote the line in the future tense. Pick the line and accept again.",
  quote: "AI added a quotation. Pick the line and accept again.", filtered: "AI wrote a word the room's filter stops. Pick the line and accept again.", length: "AI's line was too long. Pick the line and accept again.",
  too_long: "AI's version would not fit one screen. Pick the line and accept again.", too_many: "That would be more than 8 lines. Edit an existing line instead.", unchanged: "AI changed nothing. Pick the line and accept again.",
  ai_failed: "AI did not answer. Pick the line and accept again.",
};

// One press from the control surface, by a client-made id (a repeat of the id is a duplicate).
// The decision field starts empty: the database words a blank decision "Confirmed", or "Confirmed with changes" once a correction folded in.
// The field's hint says which, so typing nothing is a choice the facilitator can see.
export const decisionHint = (item: { version: number } | null): string => item && item.version > 1 ? "Confirmed with changes" : "Confirmed";
export const readBackActions = ["show", "reload", "correct", "accept", "dismiss", "undo", "decide", "undecide", "ai_on", "ai_off"] as const;
export type ReadBackAction = typeof readBackActions[number];
export type ReadBackPress = { id: string; action: ReadBackAction; p: Record<string, unknown>; session: string | null };
export function readBackPress(value: unknown): ReadBackPress | null {
  const v = record(value);
  if (!isUuid(v.id) || !(readBackActions as readonly unknown[]).includes(v.action)) return null;
  const action = v.action as ReadBackAction, id = String(v.id).toLowerCase(), session = isUuid(v.session) ? String(v.session).toLowerCase() : null;
  const line = (): { line?: string } | null => v.line === undefined ? {} : v.line === null || v.line === "" ? { line: "" } : v.line === "new" ? { line: "new" } : isUuid(v.line) ? { line: String(v.line).toLowerCase() } : null;
  let p: Record<string, unknown> | null = {};
  if (action === "show") p = isUuid(v.to) ? { to: String(v.to).toLowerCase() } : v.to === "next" || v.to === "prev" ? { to: v.to } : null;
  else if (action === "correct") {
    const l = line(), wording = clean(v.wording, correctionLimit);
    p = l && wording ? { ...l, wording, reason: typeof v.reason === "string" ? v.reason.trim().slice(0, reasonLimit) : "" } : null;
  } else if (action === "accept" || action === "dismiss") {
    if (!isUuid(v.correction)) return null;
    p = { correction: String(v.correction).toLowerCase() };
    if (action === "accept") {
      const l = line();
      if (!l) return null;
      Object.assign(p, l);
      if (v.wording !== undefined) { const w = clean(v.wording, correctionLimit); if (!w) return null; p.wording = w; }
      if (v.reason !== undefined) p.reason = typeof v.reason === "string" ? v.reason.trim().slice(0, reasonLimit) : "";
    }
  } else if (action === "decide") p = { decision: clean(v.decision, 400), reasons: typeof v.reasons === "string" ? v.reasons.trim().slice(0, 1000) : "" };
  return p ? { id, action, p, session } : null;
}
