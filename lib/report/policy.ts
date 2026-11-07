// The Wayfinding report (milestone 7, step 1): the page's state, the calls it makes and the plain sentences for each answer. Pure and shared by the
// browser and the server. The database checks every rule again, including who may do it.
import { uuid } from "../room/identity";

export type SectionKey = "overview" | "church_today" | "process" | "heard" | "interviews" | "tensions" | "future" | "vision" | "risks" | "outlook" | "intent" | "decisions" | "visibility" | "closing";
export type SectionStatus = "empty" | "drafting" | "drafted" | "edited" | "reviewed" | "needs_attention" | "thin";
export type Origin = "ai" | "facilitator" | "room" | "record";
export type SourceKind = "finding" | "theme" | "four_lists_card" | "scribe_card" | "photo" | "lens_summary_sentence" | "outcome" | "indicator" | "risk" | "mitigation" | "goal" | "intent_card" | "first_step" | "key_metric" | "celebration" | "decision" | "signal" | "submission" | "record";
export const SLOW_AFTER_MS = 45000;

export type SourceInfo = { label: string; text: string; [key: string]: unknown };
export type ReportSource = { id: string; kind: SourceKind; ref_id: string | null; excerpt: string; room: boolean; info: SourceInfo | null };
export type ReportSentence = { id: string; position: number; text: string; origin: Origin; quote: boolean; thin_label: string | null; touched: boolean; can_undo: boolean; needs_source: boolean; sources: ReportSource[] };
export type BlockPart = { role: string; sentence_id: string; owner?: string | null; due?: string | null };
export type BlockRow = { title: string; cells: string[]; parts: BlockPart[]; reviewed?: boolean; group?: string };
export type Blocks = { kind?: string; columns?: string[]; rows?: BlockRow[] };
export type ReportSection = {
  id: string; key: SectionKey; position: number; heading: string; kind: "prose" | "record"; status: SectionStatus; error: string | null; dropped: number;
  reviewed: { at: string; by: string | null } | null; blocks: Blocks | null; sentences: ReportSentence[];
};
export type ReportRound = { status: "pending" | "drafting" | "ready" | "failed" | "idle"; requested_at: string; queue: string[]; current: string | null; attempts: number; error: string | null; ok_at: string | null; kept: number; dropped: number };
export type ReportState =
  | { status: "ok"; server_time: string; ai: boolean; lead: boolean; draft: boolean; slow_after_ms?: number; round: ReportRound | null; signed: { n: number; signed_at: string; by: string | null; stale: boolean } | null; sections: ReportSection[] }
  | { status: "denied" | "unavailable" | "missing" | "closed" };
export type Candidate = { kind: SourceKind; ref_id: string | null; excerpt: string; room: boolean; label: string };

export const statusNames: Record<SectionStatus, string> = { empty: "Not drafted", drafting: "Drafting", drafted: "Drafted", edited: "Edited", reviewed: "Reviewed", needs_attention: "Needs attention", thin: "Thin data" };
export const originNames: Record<Origin, string> = { ai: "AI draft", facilitator: "Your words", room: "The room's words", record: "From the records" };

// ---------- What the page says about the drafting round ----------
export type DraftView = { kind: "none" } | { kind: "working"; slow: boolean; left: number; total: number } | { kind: "ready"; kept: number; dropped: number } | { kind: "off" };
export function roundView(state: Extract<ReportState, { status: "ok" }>, now: number, slowAfter = SLOW_AFTER_MS): DraftView {
  const r = state.round;
  if (r && (r.status === "pending" || r.status === "drafting")) {
    const total = state.sections.length || 14, left = state.sections.filter(s => s.status === "drafting").length;
    return { kind: "working", slow: now - Date.parse(r.requested_at) > slowAfter, left, total };
  }
  if (!state.ai && !state.sections.some(s => s.kind === "prose" && s.sentences.length)) return { kind: "off" };
  if (r?.status === "ready" || r?.status === "failed") return { kind: "ready", kept: r.kept, dropped: r.dropped };
  return { kind: "none" };
}

// ---------- Sign-off ----------
// What stands between the lead and a signed report, in the order the page lists it. The database refuses the same things.
export type Blocker = { kind: "no_draft" | "drafting" | "not_reviewed" | "needs_source" | "lead_only"; count: number; sections: SectionKey[] };
export function signOffBlockers(state: Extract<ReportState, { status: "ok" }>): Blocker[] {
  const out: Blocker[] = [];
  if (!state.lead) out.push({ kind: "lead_only", count: 1, sections: [] });
  if (!state.draft || state.sections.length < 14) { out.push({ kind: "no_draft", count: 1, sections: [] }); return out; }
  const drafting = state.sections.filter(s => s.status === "drafting");
  if (drafting.length) out.push({ kind: "drafting", count: drafting.length, sections: drafting.map(s => s.key) });
  const open = state.sections.filter(s => s.status !== "reviewed" && s.status !== "drafting");
  if (open.length) out.push({ kind: "not_reviewed", count: open.length, sections: open.map(s => s.key) });
  const unsourced = state.sections.filter(s => s.sentences.some(x => x.needs_source));
  if (unsourced.length) out.push({ kind: "needs_source", count: unsourced.reduce((n, s) => n + s.sentences.filter(x => x.needs_source).length, 0), sections: unsourced.map(s => s.key) });
  return out;
}
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export function blockerText(b: Blocker): string {
  switch (b.kind) {
    case "lead_only": return "Only the lead facilitator signs off.";
    case "no_draft": return "Draft the report first.";
    case "drafting": return `${plural(b.count, "section is", "sections are")} still being drafted.`;
    case "not_reviewed": return `${plural(b.count, "section")} still to review.`;
    case "needs_source": return `${plural(b.count, "sentence")} with no source. Add one, or write it in your own words.`;
  }
}

// ---------- A sentence's marks ----------
// How many sources a sentence rests on, and whether its words are the room's own: shown beside the sentence.
export type Mark = { kind: "none" | "sources" | "room" | "record" | "yours"; n: number };
export function markOf(s: Pick<ReportSentence, "origin" | "sources" | "needs_source">): Mark {
  if (s.needs_source) return { kind: "none", n: 0 };
  if (s.origin === "facilitator" && s.sources.length === 0) return { kind: "yours", n: 0 };
  return { kind: s.origin === "room" ? "room" : s.origin === "record" ? "record" : "sources", n: s.sources.length };
}

// The words of a source with the part the sentence used lit: the quoted words of a quotation, else the excerpt the sentence rests on.
export function litPart(text: string, part: string | null | undefined): { before: string; lit: string; after: string } {
  const i = part ? text.toLowerCase().indexOf(part.toLowerCase()) : -1;
  return i < 0 || !part ? { before: text, lit: "", after: "" } : { before: text.slice(0, i), lit: text.slice(i, i + part.length), after: text.slice(i + part.length) };
}

// ---------- Plain sentences for each answer ----------
export function reportMessage(status: string): string {
  switch (status) {
    case "denied": return "Only the lead and co-facilitators of this engagement can use the report.";
    case "closed": return "This engagement is closed, so the report can't change.";
    case "ai_off": return "AI is off for this engagement. The tables are built from the records. Write each section by hand, or turn AI on in the engagement settings.";
    case "ai_unavailable": return "AI isn't set up on this server yet. Write each section by hand.";
    case "busy": return "The report is already being drafted. Give it a moment.";
    case "nothing": return "Every section already has a draft.";
    case "confirm": return "This section has sentences you changed. Choose whether to keep them.";
    case "not_found": return "That one is gone. Reload the page.";
    case "unchanged": return "Nothing changed.";
    case "duplicate": return "That was already done.";
    case "no_room_words": return "None of this sentence's sources holds the room's exact words.";
    case "not_a_source": return "That record isn't one this section can cite.";
    case "too_many": return "A sentence can rest on up to 8 sources.";
    case "not_ready": return "Draft this section or write something in it before you mark it reviewed.";
    case "lead_only": return "Only the lead facilitator signs off.";
    case "no_draft": return "Draft the report before you sign off.";
    case "not_reviewed": return "Every section has to be marked reviewed before you sign off.";
    case "unsourced": return "A sentence has no source. Add one, or write it in your own words.";
    case "invalid_request": return "Check the details and try again.";
    default: return "We couldn't save that. Try again.";
  }
}

// ---------- The calls the page makes ----------
export type ReportBody =
  | { action: "draft"; id: string; scope: "all" | "section"; section?: SectionKey; confirm: boolean }
  | { action: "refresh"; section: SectionKey; confirm: boolean }
  | { action: "edit"; sentence: string; text: string }
  | { action: "add"; section: string; text: string }
  | { action: "remove" | "room_words" | "undo_room_words"; sentence: string }
  | { action: "source"; sentence: string; kind: string; ref: string | null; excerpt: string; add: boolean }
  | { action: "reviewed"; section: string; reviewed: boolean }
  | { action: "sign_off"; id: string };

export const sectionKeys: SectionKey[] = ["overview", "church_today", "process", "heard", "interviews", "tensions", "future", "vision", "risks", "outlook", "intent", "decisions", "visibility", "closing"];
export const recordKeys: SectionKey[] = ["future", "vision", "risks", "outlook", "intent", "decisions", "visibility"];
export const TEXT_MAX = 1200;
const clean = (value: unknown) => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
export function reportBody(raw: Record<string, unknown> | null): ReportBody | { error: string } | null {
  if (!raw) return null;
  const key = (v: unknown) => sectionKeys.includes(v as SectionKey) ? v as SectionKey : null;
  switch (raw.action) {
    case "draft": {
      if (!uuid(raw.id) || (raw.scope !== "all" && raw.scope !== "section")) return null;
      const section = key(raw.section);
      if (raw.scope === "section" && !section) return null;
      return { action: "draft", id: raw.id as string, scope: raw.scope, ...(section ? { section } : {}), confirm: raw.confirm === true };
    }
    case "refresh": { const section = key(raw.section); return section && recordKeys.includes(section) ? { action: "refresh", section, confirm: raw.confirm === true } : null; }
    case "edit": case "add": {
      const text = clean(raw.text), id = raw.action === "edit" ? raw.sentence : raw.section;
      if (!uuid(id)) return null;
      if (!text) return { error: "Write the sentence first." };
      if (text.length > TEXT_MAX) return { error: `Keep a sentence to ${TEXT_MAX} characters.` };
      return raw.action === "edit" ? { action: "edit", sentence: id as string, text } : { action: "add", section: id as string, text };
    }
    case "remove": case "room_words": case "undo_room_words": return uuid(raw.sentence) ? { action: raw.action, sentence: raw.sentence as string } : null;
    case "source": {
      const kind = clean(raw.kind), excerpt = typeof raw.excerpt === "string" ? raw.excerpt.trim() : "", ref = raw.ref === null || raw.ref === undefined ? null : raw.ref;
      if (!uuid(raw.sentence) || !/^[a-z_]{1,40}$/.test(kind) || typeof raw.add !== "boolean" || (ref !== null && !uuid(ref)) || (kind !== "record" && ref === null) || excerpt.length > 280) return null;
      return { action: "source", sentence: raw.sentence as string, kind, ref: ref as string | null, excerpt, add: raw.add };
    }
    case "reviewed": return uuid(raw.section) && typeof raw.reviewed === "boolean" ? { action: "reviewed", section: raw.section as string, reviewed: raw.reviewed } : null;
    case "sign_off": return uuid(raw.id) ? { action: "sign_off", id: raw.id as string } : null;
    default: return null;
  }
}
