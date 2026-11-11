// After the workshop (design pass 8, step 4): the short summary of what the room said. This file is the pure part: what the model is
// shown (built from the recap, so it is exactly what the TV showed, with hidden answers left out and never a name), how a reply becomes
// the words that are kept, and the page's messages.
import type { Recap, RecapEntry } from "../export/recap";
import { recapCount } from "../export/recap";
import { barsOf, scaleOf } from "../interactions/bars";

export type SummaryState = { status: "ok"; ai: boolean; summary: { body: string; source: "ai" | "edited"; drafted_at: string | null; updated_at: string } | null };
export type SummarySession = { title: string; kind: string; prompt: string; count: string; average?: number; scale_max?: number; columns?: { value: number; count: number }[];
  bars?: { text: string; value: string }[]; words?: { text: string; count: number }[]; answers?: string[] };
export type SummaryInputs = { event: string; sessions: SummarySession[] };

export const SUMMARY_MAX = 6000;
const clip = (text: string, n: number) => text.replace(/\s+/g, " ").trim().slice(0, n);

// One session as the model sees it: its name, kind, prompt and count, then whichever results it has. Sessions nobody answered are left out.
function sessionOf(entry: RecapEntry): SummarySession | null {
  const s = entry.session, r = entry.results;
  if (!r || (!r.total && !r.people && !entry.answers.length)) return null;
  const hidden = new Set(entry.hidden_ids), hiddenKeys = new Set(entry.hidden_keys);
  const out: SummarySession = { title: clip(s.title, 160), kind: s.kind?.label ?? s.interaction, prompt: clip(s.prompt ?? "", 400), count: recapCount(entry) };
  const scale = scaleOf(r);
  if (scale) { if (scale.average != null) out.average = Math.round(scale.average * 10) / 10; out.scale_max = scale.max; out.columns = scale.columns.map(c => ({ value: c.value, count: c.count })); }
  const bars = barsOf(r);
  if (bars.length) out.bars = bars.slice(0, 12).map(b => ({ text: clip(b.text, 120), value: b.count != null ? `${b.count} chose it` : b.share != null ? `${b.share}% of points` : b.average != null ? `average ${Math.round(b.average * 10) / 10}` : "" }));
  const words = Array.isArray(r.words) ? r.words.filter(w => !hiddenKeys.has(w.key)).sort((a, b) => b.count - a.count).slice(0, 30) : [];
  if (words.length) out.words = words.map(w => ({ text: clip(w.text, 60), count: w.count }));
  // Only free-text kinds send their answers: a structured kind (a signature, a placement) can carry a name, and its numbers are already above.
  const text = s.interaction !== "word_cloud" && (s.kind ? s.kind.structured === false && s.kind.input : s.interaction === "wall");
  const answers = !text ? [] : entry.answers.filter(a => !hidden.has(a.id) && a.text?.trim()).slice(0, 60).map(a => clip(a.text, 280));
  if (answers.length) out.answers = answers;
  return out;
}

// Everything the model is given, capped so one long workshop still fits in one call.
export function summaryInputs(recap: Recap, event: string): SummaryInputs {
  const sessions: SummarySession[] = []; let size = 0;
  for (const entry of recap.sessions) {
    const s = sessionOf(entry); if (!s) continue;
    size += JSON.stringify(s).length; if (size > 60000 || sessions.length >= 40) break;
    sessions.push(s);
  }
  return { event: clip(event, 200), sessions };
}

// The words that are kept: paragraphs separated by a blank line, with no dashes (Words in the app) and no markup.
export function summaryBody(paragraphs: unknown): string {
  const list = Array.isArray(paragraphs) ? paragraphs : typeof paragraphs === "string" ? paragraphs.split(/\n{2,}/) : [];
  return list.flatMap(p => typeof p === "string" ? [p] : []).map(p => p.replace(/\s*[—–]\s*/g, ", ").replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 6).join("\n\n").slice(0, SUMMARY_MAX);
}
// What the facilitator typed, tidied the same way but keeping their own line breaks.
export const editedBody = (text: unknown) => typeof text === "string" ? text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, SUMMARY_MAX) : "";
export const paragraphsOf = (body: string) => body.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

const messages: Record<string, string> = {
  ai_off: "AI is off for this engagement. Turn it on in Details, or write the summary yourself.",
  ai_unavailable: "AI isn't available right now. Try again, or write the summary yourself.",
  nothing: "There are no answers to summarize yet.",
  empty: "The draft came back empty. Try again, or write the summary yourself.",
  invalid_request: "Write a summary of up to 6,000 characters.",
  missing: "This engagement can't be found.",
  timeout: "The draft took too long. Try again.",
};
export const summaryMessage = (status: string) => messages[status] ?? "The summary isn't available right now. Try again.";
