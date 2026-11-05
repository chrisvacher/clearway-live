// INT-18, the lens summary: the shapes the server sends and the pure rules every surface shares.
// After the Learning lens, AI drafts each lens's one-screen 10-year Future summary; it goes straight to
// the TV, phones tap Approve or Suggest a change, AI folds the suggestions into a new version, and the
// facilitator marks the room's decision. Every number here is the server's. Counts show where the room
// is; they never decide.
import { isLens, type LensNumber } from "@/lib/wayfinding/lens";

export const suggestionLimit = 140;
export const summaryLimit = 420;
export const maxLines = 8;
export const approveText = "Approve";
// The TV shows two suggestion cards; the rest are counted and read on phones.
export const shownSuggestions = 2;
// A struck word stays readable this long (--cwl-delay-tc-leave), then leaves.
export const struckHoldMs = 900;
export const leaveMs = 400;
// The TV's typing caret clears itself when the facilitator stops (the server sends it for 4 seconds).
export const caretMs = 3000;

export type Part = { k: "keep" | "del" | "ins"; t: string };
export type Change = { kind: "edit" | "add" | "remove"; id: string; at: number; parts: Part[] };
export type SummaryLine = { id: string; pos: number; text: string };
export type AiState = "off" | "drafting" | "folding" | "editing" | "held" | "idle" | "waiting";
export type LensChip = { lens: LensNumber; name: string; state: "now" | "signed" | "later" };
export type SummaryResults = {
  lens: LensNumber | null; lensName: string; lensNames: string[]; lenses: LensChip[]; signed: number;
  ai: boolean; aiState: AiState; typing: string | null;
  summary: { id: string; versionId: string; version: number; author: "ai" | "facilitator"; tracked: boolean; note: string; lines: SummaryLine[]; fit: number; more: number; changes: Change[]; signed: boolean; decision: string } | null;
  tally: { approve: number; suggest: number }; suggestions: { id: string; text: string }[];
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 2000) => typeof value === "string" ? value.slice(0, max) : "";
const num = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const aiStates: readonly string[] = ["off", "drafting", "folding", "editing", "held", "idle", "waiting"];

export function partsOf(value: unknown): Part[] {
  return list(value).flatMap((p): Part[] => { const o = record(p); return (o.k === "keep" || o.k === "del" || o.k === "ins") && typeof o.t === "string" ? [{ k: o.k, t: o.t }] : []; });
}
export function changesOf(value: unknown): Change[] {
  return list(value).flatMap((c): Change[] => {
    const o = record(c);
    return (o.kind === "edit" || o.kind === "add" || o.kind === "remove") && typeof o.id === "string" ? [{ kind: o.kind, id: o.id, at: num(o.at), parts: partsOf(o.parts) }] : [];
  });
}

// What the room's results carry (private.results_lens_summary).
export function summaryOf(results: unknown): SummaryResults {
  const r = record(results), s = record(r.summary), tally = record(r.tally);
  const lensNumber = isLens(r.lens) ? r.lens : null;
  const summary = typeof s.version_id === "string" ? {
    id: text(s.id, 64), versionId: s.version_id, version: num(s.version), author: s.author === "facilitator" ? "facilitator" as const : "ai" as const, tracked: s.tracked === true, note: text(s.note, 300),
    lines: list(s.sentences).flatMap((x): SummaryLine[] => { const o = record(x); return typeof o.id === "string" && typeof o.text === "string" ? [{ id: o.id, pos: num(o.pos), text: o.text }] : []; }),
    fit: num(s.fit), more: num(s.more), changes: changesOf(s.changes), signed: s.signed === true, decision: text(s.decision, 400),
  } : null;
  return {
    lens: lensNumber, lensName: text(r.lens_name, 100), lensNames: list(r.lens_names).filter((n): n is string => typeof n === "string"),
    lenses: list(r.lenses).flatMap((x): LensChip[] => { const o = record(x); return isLens(o.lens) ? [{ lens: o.lens, name: text(o.name, 100), state: o.state === "signed" || o.state === "now" ? o.state : "later" }] : []; }),
    signed: num(r.signed), ai: r.ai === true, aiState: aiStates.includes(r.ai_state as string) ? r.ai_state as AiState : "idle", typing: typeof r.typing === "string" ? r.typing : null,
    summary, tally: { approve: num(tally.approve), suggest: num(tally.suggest) },
    suggestions: list(r.suggestions).flatMap((x): { id: string; text: string }[] => { const o = record(x); return typeof o.id === "string" && typeof o.text === "string" ? [{ id: o.id, text: o.text }] : []; }),
  };
}

// The lines the TV shows: the first `fit`, the rest "+ n more on phones".
export const shownLines = (s: NonNullable<SummaryResults["summary"]>) => s.lines.slice(0, Math.max(1, s.fit));
export const moreOnPhones = (n: number) => `+ ${n} more on phones`;

// ---------- Keeping the screen alive ----------
// A row is one line on the TV. It keeps its key (and so its place in the page) as the summary changes under it:
// a fold, an edit, a line added or taken away. Rows match the new lines by id, then by wording, then (for a
// facilitator's version, which has new ids) by place. Struck lines stay as `gone` rows until they leave.
export type Row = { key: string; id: string; text: string; parts: Part[] | null; state: "steady" | "new" | "gone"; rev: number };
const oldText = (parts: Part[]) => parts.filter(p => p.k !== "ins").map(p => p.t).join(" ");

export function reconcile(prev: Row[], next: { id: string; text: string }[], changes: Change[], tracked: boolean, makeKey: () => string): Row[] {
  const live = prev.filter(r => r.state !== "gone"), at = new Map<number, Change>();
  for (const c of changes) if (c.kind !== "remove") at.set(c.at, c);
  const taken = new Set<number>(), pick = new Array<number>(next.length).fill(-1);
  const claim = (i: number, match: (r: Row) => boolean) => { const j = live.findIndex((r, k) => !taken.has(k) && match(r)); if (j >= 0) { taken.add(j); pick[i] = j; } };
  next.forEach((n, i) => claim(i, r => r.id === n.id));
  next.forEach((n, i) => { if (pick[i] < 0) claim(i, r => r.text === n.text); });
  next.forEach((n, i) => { const c = at.get(i + 1); if (pick[i] < 0 && c?.kind === "edit") claim(i, r => r.text === oldText(c.parts)); });
  if (!tracked) {
    // A facilitator's edit replaces the line in place: the unmatched lines pair off in order.
    const free = live.map((_, k) => k).filter(k => !taken.has(k));
    next.forEach((_, i) => { if (pick[i] < 0 && free.length) { const k = free.shift()!; taken.add(k); pick[i] = k; } });
  }
  const rows = next.map((n, i): Row => {
    const old = pick[i] >= 0 ? live[pick[i]] : null, c = tracked ? at.get(i + 1) : undefined;
    const parts = c ? c.parts : null;
    if (!old) return { key: makeKey(), id: n.id, text: n.text, parts, state: "new", rev: 0 };
    const grew = n.text.length >= old.text.length && n.text.startsWith(old.text.replace(/[.!?\s]+$/, ""));
    return { key: old.key, id: n.id, text: n.text, parts, state: "steady", rev: old.text === n.text || grew ? old.rev : old.rev + 1 };
  });
  // Lines that are no longer in the summary stay, struck, in the place they held, then leave.
  const gone: { after: number; row: Row }[] = [];
  live.forEach((r, k) => {
    if (taken.has(k)) return;
    let after = -1;
    for (let q = k - 1; q >= 0; q--) { const i = pick.indexOf(q); if (i >= 0) { after = i; break; } }
    gone.push({ after, row: { ...r, parts: [{ k: "del", t: r.text }], state: "gone" } });
  });
  for (const g of gone.reverse()) rows.splice(g.after + 1, 0, g.row);
  return rows;
}

// ---------- The phone ----------
export type PhoneReply = { response: "approve" | "suggest"; text: string; version: string };
export function ownReply(mine: { value?: unknown; text: string; withdrawn: boolean }[], versionId: string | undefined): PhoneReply | null {
  if (!versionId) return null;
  for (const a of [...mine].reverse()) {
    const v = record(a.value);
    if (!a.withdrawn && v.version === versionId && (v.response === "approve" || v.response === "suggest")) return { response: v.response, text: v.response === "suggest" ? a.text : "", version: versionId };
  }
  return null;
}
export function checkSuggestion(value: string): { ok: boolean; message: string; count: string } {
  const length = [...value.trim()].length;
  return { ok: length > 0 && length <= suggestionLimit, count: `${length} / ${suggestionLimit}`, message: length > suggestionLimit ? `${length - suggestionLimit} characters over. Keep it to ${suggestionLimit}.` : "" };
}
// A phone's view of where each line came from (private.lens_summary_sources).
export type Sources = { version: string; lines: Record<string, string[]> } | null;
export function sourcesOf(value: unknown): Sources {
  const r = record(value);
  if (r.status !== "ok" || typeof r.version !== "string") return null;
  const lines: Record<string, string[]> = {};
  for (const s of list(r.sentences)) { const o = record(s); if (typeof o.id === "string") lines[o.id] = list(o.sources).flatMap(x => { const t = record(x).text; return typeof t === "string" ? [t] : []; }); }
  return { version: r.version, lines };
}

// ---------- The control surface ----------
export type FacilitatorLine = { id: string; pos: number; text: string; sources: string[] };
export type FacilitatorVersion = { id: string; version: number; author: string; note: string; tracked: boolean; shown: boolean; undone: boolean; current: boolean; signed: boolean; approve: number; suggest: number; at: string; lines: string[] };
export type FacilitatorState = {
  session: string | null; lens: LensNumber | null; lensNames: string[]; version: number; room: SummaryResults | null;
  lenses: { lens: LensNumber; name: string; state: string; versions: number; open: boolean; sentences: number; drafted: boolean }[];
  summary: { id: string; state: string; versionId: string | null; author: string; tracked: boolean; draftHeld: boolean; foldHeld: boolean; decision: { decision: string; reasons: string } | null;
    lines: FacilitatorLine[]; versions: FacilitatorVersion[]; suggestions: { id: string; text: string }[]; tally: { approve: number; suggest: number }; attendees: number; lock: { mine: boolean; by: string; sentence: string | null } | null } | null;
  ai: { on: boolean; engagement: boolean; state: AiState; waitMs: number | null; runningMs: number | null; failing: boolean; lastRun: { job: string; status: string; changed: boolean; undone: boolean } | null };
};
export function facilitatorState(value: unknown): FacilitatorState | null {
  const r = record(value);
  if (r.status !== "ok") return null;
  const s = record(r.summary), ai = record(r.ai), lock = record(s.lock), dec = record(s.decision), last = record(ai.last_run);
  const summary = typeof s.id === "string" ? {
    id: s.id, state: text(s.state, 30), versionId: typeof s.version_id === "string" ? s.version_id : null, author: text(s.author, 20), tracked: s.tracked === true, draftHeld: s.draft_held === true, foldHeld: s.fold_held === true,
    decision: typeof dec.decision === "string" ? { decision: dec.decision, reasons: text(dec.reasons, 1000) } : null,
    lines: list(s.sentences).flatMap((x): FacilitatorLine[] => { const o = record(x); return typeof o.id === "string" && typeof o.text === "string" ? [{ id: o.id, pos: num(o.pos), text: o.text, sources: list(o.sources).flatMap(q => { const t = record(q).text; return typeof t === "string" ? [t] : []; }) }] : []; }),
    versions: list(s.versions).flatMap((x): FacilitatorVersion[] => { const o = record(x); return typeof o.id === "string" ? [{ id: o.id, version: num(o.version), author: text(o.author, 20), note: text(o.note, 300), tracked: o.tracked === true, shown: o.shown === true, undone: o.undone === true, current: o.current === true, signed: o.signed === true,
      approve: num(o.approve), suggest: num(o.suggest), at: text(o.at, 40), lines: list(o.sentences).filter((t): t is string => typeof t === "string") }] : []; }),
    suggestions: list(s.suggestions).flatMap((x): { id: string; text: string }[] => { const o = record(x); return typeof o.id === "string" && typeof o.text === "string" ? [{ id: o.id, text: o.text }] : []; }),
    tally: { approve: num(record(s.tally).approve), suggest: num(record(s.tally).suggest) }, attendees: num(s.attendees),
    lock: typeof lock.mine === "boolean" ? { mine: lock.mine, by: text(lock.by, 60), sentence: typeof lock.sentence === "string" ? lock.sentence : null } : null,
  } : null;
  return {
    session: typeof r.session === "string" ? r.session : null, lens: isLens(r.lens) ? r.lens : null, lensNames: list(r.lens_names).filter((n): n is string => typeof n === "string"), version: num(r.version),
    room: r.room ? summaryOf(r.room) : null,
    lenses: list(r.lenses).flatMap(x => { const o = record(x); return isLens(o.lens) ? [{ lens: o.lens, name: text(o.name, 100), state: text(o.state, 30), versions: num(o.versions), open: o.open === true, sentences: num(o.sentences), drafted: o.drafted === true }] : []; }),
    summary,
    ai: { on: ai.on === true, engagement: ai.engagement === true, state: aiStates.includes(ai.state as string) ? ai.state as AiState : "idle", waitMs: ai.wait_ms == null ? null : num(ai.wait_ms), runningMs: ai.running_ms == null ? null : num(ai.running_ms), failing: ai.failing === true,
      lastRun: typeof last.job === "string" ? { job: last.job, status: text(last.status, 30), changed: last.changed === true, undone: last.undone === true } : null },
  };
}

// The words the control surface uses for the AI's state.
export const aiStateLine: Record<AiState, string> = {
  off: "AI is off. Write the summary yourself.", drafting: "AI is drafting this lens.", folding: "AI is folding in suggestions.", editing: "You are editing. AI waits.",
  held: "AI is on hold for this lens.", idle: "AI is ready.", waiting: "AI folds in suggestions after a quiet moment.",
};

// A fold that came back with nothing applied (refused whole, or no change) leaves the suggestions standing and
// AI idle. Say so, rather than "AI is ready"; Fold in now tries again.
export const foldRefusedLine = "AI couldn't fold these in. Fold in now to try again.";
export function foldRefused(state: FacilitatorState | null): boolean {
  const run = state?.ai.lastRun;
  return Boolean(state && run && run.job === "fold_lens_summary" && run.status === "ok" && !run.changed && !run.undone && state.ai.on && state.ai.state === "idle"
    && state.summary && state.summary.suggestions.length > 0 && state.summary.state !== "signed_off");
}

// One press from the control surface, by a client-made id (a repeat of the id is a duplicate).
export const summaryActions = ["show", "edit_start", "edit_beat", "edit", "edit_done", "undo", "fold_now", "hold", "release", "redraft", "ai_on", "ai_off", "decide", "undecide"] as const;
export type SummaryAction = typeof summaryActions[number];
export type SummaryPress = { id: string; action: SummaryAction; p: Record<string, unknown>; session: string | null };
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const clean = (v: unknown, max: number) => typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
export function summaryPress(value: unknown): SummaryPress | null {
  const body = pressOf(value);
  return body ? { ...body.press, session: isUuid(record(value).session) ? String(record(value).session).toLowerCase() : null } : null;
}
function pressOf(value: unknown): { press: Omit<SummaryPress, "session"> } | null {
  const v = record(value);
  if (!isUuid(v.id) || !(summaryActions as readonly unknown[]).includes(v.action)) return null;
  const action = v.action as SummaryAction, id = String(v.id).toLowerCase();
  const press = inner(v, action, id);
  return press ? { press } : null;
}
function inner(v: Record<string, unknown>, action: SummaryAction, id: string): Omit<SummaryPress, "session"> | null {
  if (action === "show") return v.to === "next" || v.to === "prev" || (typeof v.to === "number" && isLens(v.to)) ? { id, action, p: { to: String(v.to) } } : null;
  if (action === "edit_start" || action === "edit_beat") return v.sentence === undefined || v.sentence === null ? { id, action, p: {} } : isUuid(v.sentence) ? { id, action, p: { sentence: String(v.sentence).toLowerCase() } } : null;
  if (action === "edit") {
    const op = v.op;
    if (op === "remove") return isUuid(v.sentence) ? { id, action, p: { op, sentence: String(v.sentence).toLowerCase() } } : null;
    const body = clean(v.text, 400);
    if (!body) return null;
    if (op === "add") return { id, action, p: { op, text: body } };
    return op === "text" && isUuid(v.sentence) ? { id, action, p: { op, sentence: String(v.sentence).toLowerCase(), text: body } } : null;
  }
  if (action === "decide") return { id, action, p: { decision: clean(v.decision, 400), reasons: typeof v.reasons === "string" ? v.reasons.trim().slice(0, 1000) : "" } };
  return { id, action, p: {} };
}

// A child glides only when its place in the layout moved since the last render. A render that moved nothing, such as the
// TV's parent re-rendering every frame, never restarts a glide in flight.
export const glideMoved = (was: number | undefined, now: number): boolean => was !== undefined && Math.abs(now - was) >= 0.5;

// The TV's line type: the largest size from `most` (the body size) down to `least` (the floor), in whole pixels below `most`, at
// which every line fits whole in the sheet. A binary search, so a fit takes a handful of measurements. When even `least` does
// not fit, the lines keep `least`: type never goes below what the back of the room can read.
export function lineSize(fits: (px: number) => boolean, least: number, most: number): number {
  if (!(most > least)) return Math.max(most, least);
  if (fits(most)) return most;
  let lo = Math.ceil(least), hi = Math.ceil(most) - 1;
  if (hi < lo || !fits(lo)) return least;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (fits(mid)) lo = mid; else hi = mid - 1; }
  return lo;
}
