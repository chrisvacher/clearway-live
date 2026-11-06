// Discover themes (milestone 6, step 3): the page's state, the calls it makes, and the plain sentences for each answer.
// Pure and shared by the browser and the server. The database checks every rule again, including who may do it.
import { uuid } from "../room/identity";
import { strength } from "./strength";
import type { ThemeSource } from "./thin";

export type ThemeStatus = "draft" | "accepted" | "rejected";
export type ThemeSourceRow =
  | { kind: "finding"; id: string; title: string | null; quote: string | null }
  | { kind: "note"; id: string; title: string | null; note_kind: "interview" | "input" | null; quote: string | null }
  | { kind: "card"; id: string; text: string | null; column: ColumnKey | null; agree: number | null; quote: string | null };
export type ColumnKey = "right" | "wrong" | "missing" | "confused";
export type ThemeRow = {
  id: string; source: ThemeSource; label: string; detail: string; rests_on: number; out_of: number | null; quotes: string[]; status: ThemeStatus;
  ai: boolean; by_hand: boolean; renamed_from: string | null; members: { id: string; label: string }[]; sources: ThemeSourceRow[];
};
export type RoundStatus = "pending" | "drafting" | "ready" | "failed" | "idle";
export type Round = { status: RoundStatus; redraft: boolean; requested_at: string; attempts: number; error: string | null; ok_at: string | null; offered: number | null; refused: number | null; stale_notes: number; left_out: number };
export type ThemesState = {
  status: "ok"; server_time: string; ai: boolean; slow_after_ms?: number; inputs: { notes: number; cards: number }; round: Round | null; themes: ThemeRow[];
  notes: { id: string; title: string; kind: "interview" | "input" }[]; cards: { id: string; column: ColumnKey; text: string; agree: number }[];
};

export const columnLabel: Record<ColumnKey, string> = { right: "What's right", wrong: "What's wrong", missing: "What's missing", confused: "What's confused" };
export const SLOW_AFTER_MS = 30000;

// What a theme shows: its counts, thin and strong, from the same rules the database uses.
export const themeStrength = (t: Pick<ThemeRow, "source" | "rests_on" | "out_of">) => strength({ source: t.source, restsOn: t.rests_on, outOf: t.out_of });

// The state of the drafting round, as the page words it. `now` is the server's clock, so a laptop with a wrong clock still reads right.
export type DraftView =
  | { kind: "off" } | { kind: "nothing" } | { kind: "ready" }
  | { kind: "working"; slow: boolean; redraft: boolean } | { kind: "failed" } | { kind: "done"; offered: number; refused: number; stale: number; leftOut: number };
export function draftView(state: Pick<ThemesState, "ai" | "inputs" | "round">, now: number, slowAfter = SLOW_AFTER_MS): DraftView {
  const r = state.round;
  if (r && (r.status === "pending" || r.status === "drafting")) return { kind: "working", slow: now - Date.parse(r.requested_at) > slowAfter, redraft: r.redraft };
  if (!state.ai) return { kind: "off" };
  if (!state.inputs.notes && !state.inputs.cards) return { kind: "nothing" };
  if (r?.status === "failed") return { kind: "failed" };
  if (r?.status === "ready" && r.offered !== null) return { kind: "done", offered: r.offered, refused: r.refused ?? 0, stale: r.stale_notes, leftOut: r.left_out };
  return { kind: "ready" };
}

// The themes that count right now, as the database reads them for What We Heard and the signal.
export const accepted = (themes: ThemeRow[]) => themes.filter(t => t.status === "accepted");

// Plain sentences for the statuses the theme functions return.
export function themeMessage(status: string): string {
  switch (status) {
    case "denied": return "Only the facilitators of this engagement can use Discover.";
    case "closed": return "This engagement is closed, so themes can't change.";
    case "ai_off": return "AI is off for this engagement. Add themes by hand, or turn AI on in the engagement settings.";
    case "nothing": return "There is nothing to read yet. Add conversation notes, or run the Four Helpful Lists, first.";
    case "busy": return "Themes are already being drafted. Give it a moment.";
    case "not_found": return "That one is gone. Reload the page.";
    case "survey_theme": return "A survey theme follows its finding. Change the finding instead.";
    case "merged": return "That theme sits beneath another. Split it out first.";
    case "cannot_merge": return "Those two can't merge. Themes merge within one source, and not into a rejected theme.";
    case "unchanged": return "Nothing changed.";
    case "conflict": return "That one belongs to another engagement.";
    case "limit": return "That's the most themes Discover holds. Reject some first.";
    case "invalid_request": return "Check the details and try again.";
    default: return "We couldn't save that. Try again.";
  }
}

// The calls the page makes. Every id comes from the browser or the page's own state.
export type ThemeBody =
  | { action: "draft"; id: string }
  | { action: "accept" | "undo" | "reject" | "restore" | "split"; theme: string }
  | { action: "rename"; theme: string; label: string }
  | { action: "merge"; theme: string; into: string }
  | { action: "add"; id: string; source: "conversations" | "four_lists"; label: string; detail: string; sources: string[] };

const clean = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max + 1) : "";
export function themeBody(raw: Record<string, unknown> | null): ThemeBody | { error: string } | null {
  if (!raw) return null;
  switch (raw.action) {
    case "draft": return uuid(raw.id) ? { action: "draft", id: raw.id as string } : null;
    case "accept": case "undo": case "reject": case "restore": case "split": return uuid(raw.theme) ? { action: raw.action, theme: raw.theme as string } : null;
    case "rename": {
      const label = clean(raw.label, 200);
      if (!uuid(raw.theme)) return null;
      if (!label) return { error: "Give the theme a name." };
      if (label.length > 200) return { error: "Keep the name to 200 characters." };
      return { action: "rename", theme: raw.theme as string, label };
    }
    case "merge": return uuid(raw.theme) && uuid(raw.into) ? { action: "merge", theme: raw.theme as string, into: raw.into as string } : null;
    case "add": {
      const label = clean(raw.label, 200), detail = clean(raw.detail, 1000);
      if (!uuid(raw.id) || (raw.source !== "conversations" && raw.source !== "four_lists")) return null;
      if (!label) return { error: "Give the theme a name." };
      if (label.length > 200) return { error: "Keep the name to 200 characters." };
      if (detail.length > 1000) return { error: "Keep the detail to 1,000 characters." };
      const sources = Array.isArray(raw.sources) ? raw.sources : [];
      if (sources.length > 60 || !sources.every(s => uuid(s))) return null;
      return { action: "add", id: raw.id as string, source: raw.source, label, detail, sources: [...new Set(sources as string[])] };
    }
    default: return null;
  }
}
