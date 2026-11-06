// What We Heard (milestone 6, step 4): the page's state, the calls it makes, how a draft becomes the run of show step's fields, and the plain
// sentences for each answer. Pure and shared by the browser and the server. The database checks every rule again, including who may do it.
import { uuid } from "../room/identity";

export type HeardKey = "survey" | "four_lists" | "input" | "interviews";
export const heardKeys: HeardKey[] = ["survey", "four_lists", "input", "interviews"];
// The words a template's content step carries in options.source; the words before the first " · " name the source.
export const heardNames: Record<HeardKey, string> = { survey: "Congregational survey", four_lists: "Four Helpful Lists", input: "Board and staff input conversations", interviews: "Leadership interviews" };
// How a source reads in a sentence ("Nothing accepted yet for the congregational survey").
export const heardFor: Record<HeardKey, string> = { survey: "the congregational survey", four_lists: "the Four Helpful Lists", input: "board and staff input conversations", interviews: "leadership interviews" };
export const SLOW_AFTER_MS = 30000;
export const NUMBER_MAX = 12, LINE_MAX = 140, DETAIL_MAX = 600;

export type HeardQuote = { text: string; label: string };
export type HeardRest = { label: string; count: string; thin: boolean };
export type HeardDraft = {
  id: string; number: string; line: string; detail: string; quotes: HeardQuote[]; rests: HeardRest[]; thin: boolean; thin_reason: string | null; basis: string | null;
  by_hand: boolean; edited: boolean; ai: boolean; applied_at: string | null; stale: boolean;
};
export type HeardStep = { id: string; title: string; part: string; state: string };
export type HeardSource = { key: HeardKey; name: string; step: HeardStep | null; themes: number; thin_themes: number; named_themes?: number; draft: HeardDraft | null };
export type HeardRound = { status: "pending" | "drafting" | "ready" | "failed" | "idle"; requested_at: string; attempts: number; error: string | null; ok_at: string | null; offered: number | null; refused: number | null; kept: number | null };
export type HeardState = { status: "ok"; server_time: string; ai: boolean; slow_after_ms?: number; round: HeardRound | null; sources: HeardSource[] };

// The source a step reads as: its options.source up to the first " · ", matched without regard to case.
export function heardKeyOf(source: unknown): HeardKey | null {
  if (typeof source !== "string") return null;
  const name = source.split(" · ")[0].trim().toLowerCase();
  return heardKeys.find(k => heardNames[k].toLowerCase() === name) ?? null;
}

// ---------- A draft as the run of show step holds it ----------
// The headline is the step's prompt (one bold phrase allowed); the number and the source line are content options; phone depth is paragraphs,
// and a line starting "> " is a quote with its source on the next line starting "- ". All of it is what the content screen already reads.
export const THIN_WORDS = "thin data";
export const headlineText = (line: string, thin: boolean) => thin ? `${line.trim().replace(/[\s.]+$/, "")} (${THIN_WORDS})` : line.trim();
export const sourceLine = (name: string, basis: string | null | undefined) => basis ? `${name} · ${basis}` : name;
export function phoneDepth(d: Pick<HeardDraft, "detail" | "quotes" | "thin" | "thin_reason">): string {
  const parts: string[] = [];
  if (d.detail.trim()) parts.push(d.detail.trim());
  if (d.thin) parts.push(d.thin_reason ? `Read this one carefully. It rests on ${d.thin_reason}, which is thin data.` : "Read this one carefully. It rests on thin data.");
  for (const q of d.quotes) parts.push(`> ${q.text.replace(/\s+/g, " ").trim()}\n- ${q.label}`);
  return parts.join("\n\n");
}
export type StepFields = { prompt: string; phone_depth: string; options: Record<string, unknown> };
// What Apply writes into a step: its headline, number, source line and phone depth. Everything else in the step stays as it is, and the
// source keeps the name the step already carries.
export function stepFields(draft: HeardDraft, current: { options: Record<string, unknown> }, fallbackName: string): StepFields {
  const name = typeof current.options.source === "string" && current.options.source.split(" · ")[0].trim() ? current.options.source.split(" · ")[0].trim() : fallbackName;
  const options: Record<string, unknown> = { ...current.options, source: sourceLine(name, draft.basis) };
  if (draft.number.trim()) options.number = draft.number.trim(); else delete options.number;
  return { prompt: headlineText(draft.line, draft.thin), phone_depth: phoneDepth(draft), options };
}

// What a draft says it rests on, in a short plain line for the setup row.
export const restsLine = (d: Pick<HeardDraft, "rests" | "by_hand">) => d.by_hand ? "Typed by hand" : d.rests.map(r => `${r.label}, ${r.count}`).join("; ");

// ---------- The state of the drafting round, as the page words it ----------
export type DraftView =
  | { kind: "off" } | { kind: "nothing" } | { kind: "ready" }
  | { kind: "working"; slow: boolean } | { kind: "failed" } | { kind: "done"; offered: number; refused: number; kept: number };
export function draftView(state: Pick<HeardState, "ai" | "round" | "sources">, now: number, slowAfter = SLOW_AFTER_MS): DraftView {
  const r = state.round;
  if (r && (r.status === "pending" || r.status === "drafting")) return { kind: "working", slow: now - Date.parse(r.requested_at) > slowAfter };
  if (!state.ai) return { kind: "off" };
  if (!state.sources.some(s => s.step && s.themes > 0)) return { kind: "nothing" };
  if (r?.status === "failed") return { kind: "failed" };
  if (r?.status === "ready" && r.offered !== null) return { kind: "done", offered: r.offered, refused: r.refused ?? 0, kept: r.kept ?? 0 };
  return { kind: "ready" };
}

// What a source with no draft says, so the page never invents: nothing accepted, no step, or themes waiting to be drafted from.
export type SourceNote = { kind: "no_step" } | { kind: "nothing" } | { kind: "waiting"; themes: number; thin: number };
export function sourceNote(s: Pick<HeardSource, "step" | "themes" | "thin_themes">): SourceNote {
  if (!s.step) return { kind: "no_step" };
  if (s.themes === 0) return { kind: "nothing" };
  return { kind: "waiting", themes: s.themes, thin: s.thin_themes };
}

export function heardMessage(status: string): string {
  switch (status) {
    case "denied": return "Only the lead and co-facilitators of this engagement can use What We Heard.";
    case "closed": return "This engagement is closed, so headlines can't change.";
    case "ai_off": return "AI is off for this engagement. Type each headline by hand, or turn AI on in the engagement settings.";
    case "ai_unavailable": return "AI isn't set up on this server yet. Type each headline by hand.";
    case "nothing": return "There is nothing to draft from yet. Accept some themes, and keep a What We Heard step in the run of show.";
    case "busy": return "Headlines are already being drafted. Give it a moment.";
    case "no_step": return "The run of show has no What We Heard step for that source. Add one first.";
    case "not_found": return "That one is gone. Reload the page.";
    case "unchanged": return "Nothing changed.";
    case "conflict": return "The run of show changed while you were here. Reload the page and apply again.";
    case "running": return "That step is on the TV right now. Apply after it's off.";
    case "step_missing": return "That step has changed or gone from the run of show. Reload the page.";
    case "invalid_request": return "Check the details and try again.";
    default: return "We couldn't save that. Try again.";
  }
}

// ---------- The calls the page makes ----------
export type HeardEdit = { number: string; line: string; detail: string; keep: number[] | null };
export type HeardBody =
  | { action: "draft"; id: string }
  | { action: "discard"; source: HeardKey }
  | ({ action: "edit"; source: HeardKey } & HeardEdit)
  | ({ action: "apply"; source: HeardKey } & HeardEdit);

const clean = (value: unknown) => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
export function heardEdit(raw: Record<string, unknown>): HeardEdit | { error: string } {
  const number = clean(raw.number), line = clean(raw.line);
  const detail = typeof raw.detail === "string" ? raw.detail.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : "";
  if (number.length > NUMBER_MAX) return { error: `Keep the number to ${NUMBER_MAX} characters.` };
  if (!line) return { error: "Write the headline line." };
  if (line.length > LINE_MAX) return { error: `Keep the line to ${LINE_MAX} characters.` };
  if (/\*/.test(line) && !/^[^*]*\*\*[^*]+\*\*[^*]*$/.test(line)) return { error: "Mark at most one phrase bold, with two stars on each side." };
  if (detail.length > DETAIL_MAX) return { error: `Keep the detail to ${DETAIL_MAX} characters.` };
  let keep: number[] | null = null;
  if (raw.keep !== undefined && raw.keep !== null) {
    if (!Array.isArray(raw.keep) || raw.keep.length > 3 || !raw.keep.every(k => Number.isInteger(k) && k >= 0 && k <= 2)) return { error: "Check the quotes." };
    keep = [...new Set(raw.keep as number[])].sort();
  }
  return { number, line, detail, keep };
}
export function heardBody(raw: Record<string, unknown> | null): HeardBody | { error: string } | null {
  if (!raw) return null;
  switch (raw.action) {
    case "draft": return uuid(raw.id) ? { action: "draft", id: raw.id as string } : null;
    case "discard": return heardKeys.includes(raw.source as HeardKey) ? { action: "discard", source: raw.source as HeardKey } : null;
    case "edit": case "apply": {
      if (!heardKeys.includes(raw.source as HeardKey)) return null;
      const e = heardEdit(raw);
      return "error" in e ? e : { action: raw.action as "edit" | "apply", source: raw.source as HeardKey, ...e };
    }
    default: return null;
  }
}
