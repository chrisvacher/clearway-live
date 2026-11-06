// AI, live (PRD "AI"): the shapes the server sends and the pure rules every surface shares.
// AI results arrive inside each kind's results (word cloud words with ai and merged, the
// wall's groups and summary, Q&A questions with ai). Every number is the server's.
import { uuid } from "../room/identity";

export type AiWord = { key: string; text: string; count: number; size: number; level: string; order?: number; ai?: boolean; merged?: string[] };
export type WallGroup = { id: string; label: string; count: number; ids: string[]; pinned: boolean };
export type WallSummary = { id: string; text: string; answers: number; at: number };
export type WallResults = { total: number; people: number; ai?: boolean; groups?: WallGroup[]; summary?: WallSummary };

export function wallOf(results: unknown): { ai: boolean; groups: WallGroup[]; summary: WallSummary | null } {
  const r = results && typeof results === "object" ? results as WallResults : null;
  const groups = Array.isArray(r?.groups) ? r!.groups.filter(g => g && typeof g.id === "string" && typeof g.label === "string" && Array.isArray(g.ids)) : [];
  const summary = r?.summary && typeof r.summary.text === "string" && r.summary.text ? r.summary : null;
  return { ai: r?.ai === true, groups, summary };
}
// The TV holds nine groups, four while the summary shows; the rest wait on the control surface.
export const groupCap = (summary: boolean) => summary ? 4 : 9;
export function shownGroups(groups: WallGroup[], summary: boolean) {
  const cap = groupCap(summary), sorted = [...groups].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  return { shown: sorted.slice(0, cap), rest: Math.max(0, sorted.length - cap) };
}
export const moreGroups = (rest: number, summary: boolean) => rest > 0 && !summary ? `+ ${rest} smaller ${rest === 1 ? "group" : "groups"} on the control surface` : "";
// The word cloud's AI line in the foot, once anything on screen was combined.
export const combinedLine = (words: AiWord[]) => words.some(w => w.ai) ? "Combined similar answers" : "";
// Where an absorbed word went: the survivor that now lists it.
export function absorbedInto(key: string, words: AiWord[]) { return words.find(w => w.key !== key && w.merged?.includes(key))?.key ?? null; }

// The phone: "On the screen with youth" under the person's own word, once AI combined it.
export function combinedWith(frame: { session?: { interaction?: string } | null; answers?: { id: string; answers: { key: string }[] }[]; state: { results: { words?: unknown[] } } } | null, id: string) {
  if (!frame || frame.session?.interaction !== "word_cloud") return null;
  const keys = frame.answers?.find(a => a.id === id)?.answers.map(a => a.key) ?? [];
  const words = (frame.state.results.words ?? []) as AiWord[];
  const into = words.find(w => w.ai && w.merged?.some(k => keys.includes(k)));
  return into ? into.text : null;
}

// ---------- The control surface ----------
export type AiState = { running: boolean; job: string | null; running_ms: number | null; last_ms: number | null; last_ok_at: string | null; last_failed_at: string | null; failing: boolean; slow: boolean };
export type AiCombine = { id: string; survivor: string; member: string; survivor_text: string; member_text: string; member_count: number; survivor_count: number; at: string; undone: boolean };
export type AiGroupRow = { id: string; label: string; ai_label: string; pinned: boolean; renamed: boolean; undone: boolean; at: string; members: { id: string; text: string }[] };
export type AiFold = { id: string; survivor: string; member: string; survivor_text: string; member_text: string; at: string; undone: boolean };
export type AiStatus = {
  status: "ok"; version: number; engagement_ai: boolean; cost: { usd: number; runs: number; input_tokens: number; output_tokens: number };
  session: null | { id: string; title: string; interaction: "word_cloud" | "wall" | "qa" | "lens" | "four_lists"; live: boolean; ai: boolean; option: boolean; override: boolean | null; summary_available: boolean; summary_shown: boolean };
  state?: AiState; last_change?: { run: string; job: string; at: string; count: number } | null;
  combines?: AiCombine[]; different?: number; threshold?: number;
  groups?: AiGroupRow[]; answers?: number; grouped?: number; waiting?: number; summary?: { text: string; answers: number; at: string } | null;
  folds?: AiFold[];
};
export const aiKinds = ["word_cloud", "wall", "qa", "lens", "four_lists"] as const;
export const isAiKind = (kind: unknown): kind is typeof aiKinds[number] => aiKinds.includes(kind as typeof aiKinds[number]);

export const aiActions = ["ai_on", "ai_off", "undo_combine", "undo_group", "redo_group", "pin_group", "unpin_group", "rename_group", "undo_last", "show_summary", "hide_summary"] as const;
export type AiAction = typeof aiActions[number];
// Validates a browser press into the RPC's arguments. The database checks it again.
export function aiControlBody(value: unknown): { id: string; action: AiAction; p: Record<string, unknown> } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!uuid(v.id) || !aiActions.includes(v.action as AiAction)) return null;
  const action = v.action as AiAction, p: Record<string, unknown> = {};
  if (["ai_on", "ai_off", "undo_last", "show_summary", "hide_summary"].includes(action)) { if (!uuid(v.session)) return null; p.session = v.session; }
  else if (action === "undo_combine") { if (!uuid(v.merge)) return null; p.merge = v.merge; }
  else { if (!uuid(v.group)) return null; p.group = v.group; }
  if (action === "rename_group") { if (typeof v.label !== "string" || !v.label.trim() || v.label.length > 80) return null; p.label = v.label; }
  return { id: v.id as string, action, p };
}

// FAIL-09: what the control surface and remote say. The TV never says any of it.
export function aiNotice(status: AiStatus | null): { kind: "warning" | "info"; title: string; text: string; short: string } | null {
  const s = status?.session;
  if (!status || !s) return null;
  if (!status.engagement_ai) return { kind: "info", title: "AI is off for this engagement.", text: "Turn it on in the engagement's setup. The room works in arrival order.", short: "AI is off for this engagement." };
  if (!s.ai) return { kind: "info", title: "AI is off for this session.", text: s.interaction === "wall" ? "The wall shows answers in arrival order." : s.interaction === "lens" ? "The wall shows sentences in arrival order, with no clusters." : s.interaction === "four_lists" ? "Only cards with the same words combine. Nothing on the TV is marked as AI." : "Nothing on the TV is marked as AI.", short: "AI is off. The room is fine." };
  const waiting = status.waiting ? ` ${status.waiting} ${status.waiting === 1 ? "answer" : "answers"} waiting for grouping.` : "";
  if (status.state?.failing) return { kind: "warning", title: "AI isn't responding.", text: `The room keeps working: answers show in arrival order and AI catches up when it's back.${waiting}`, short: "AI isn't responding. The room is fine." };
  if (status.state?.slow) return { kind: "warning", title: "AI is slow.", text: `The room keeps working: answers show in arrival order and ${s.interaction === "wall" ? "groups catch up" : "AI catches up"} when AI does.${waiting}`, short: "AI is slow. The room is fine." };
  return null;
}
// Recent presses and other remotes' toasts, in plain words.
export const aiPressNames: Record<string, string> = {
  turn_ai_on: "turned AI on", turn_ai_off: "turned AI off", undo_ai_combine: "undid an AI combine", undo_ai_group: "undid an AI group", redo_ai_group: "redid an AI group",
  pin_group: "pinned a group", unpin_group: "unpinned a group", rename_group: "renamed a group", undo_last_ai_change: "undid the last AI change", show_summary: "showed the AI summary", hide_summary: "hid the AI summary",
};
export const seconds = (ms: number | null | undefined) => ms == null ? "·" : `${(ms / 1000).toFixed(1)}s`;
export const dollars = (usd: number) => usd < 0.01 ? (usd > 0 ? "under $0.01" : "$0.00") : `$${usd.toFixed(2)}`;
export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 45 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
}
