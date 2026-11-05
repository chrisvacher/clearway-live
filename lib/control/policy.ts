import { uuid } from "../room/identity";
import { parts, type ShowSession } from "../run-of-show/types";
import { controlActions, type ControlAction, type ControlResult, type ControlScreen } from "./types";

const sizes = ["very_small", "small", "medium", "large", "very_large"];
export const roomWide: ControlAction[] = ["refresh_phones", "tv_on_phones", "room_size", "close_part"];

// Validates a browser press into the RPC's arguments. The database checks it again.
export function controlBody(value: unknown): { id: string; action: ControlAction; p: Record<string, unknown> } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!uuid(v.id) || !controlActions.includes(v.action as ControlAction)) return null;
  const action = v.action as ControlAction, p: Record<string, unknown> = {};
  if (!roomWide.includes(action)) {
    if (v.from !== null && !uuid(v.from)) return null;
    p.from = v.from;
  }
  if (action === "go_live") { if (!uuid(v.session)) return null; p.session = v.session; }
  if (action === "start_burst") { if (![3, 4, 5].includes(Number(v.minutes)) || typeof v.minutes !== "number") return null; p.minutes = v.minutes; }
  if (["spotlight", "hide", "unhide"].includes(action)) { if (typeof v.item !== "string" || !v.item || v.item.length > 200) return null; p.item = v.item; }
  if (action === "tv_on_phones") { if (typeof v.on !== "boolean") return null; p.on = v.on; }
  if (action === "room_size") { if (!sizes.includes(String(v.size))) return null; p.size = v.size; }
  if (action === "close_part") { if (!parts.includes(v.part as typeof parts[number])) return null; p.part = v.part; }
  return { id: v.id as string, action, p };
}

// What the TV has confirmed: the lowest version every connected TV has painted.
// A TV silent for 12 seconds drops out, so one dead screen cannot hold the room in Syncing.
export function confirmedVersion(screens: ControlScreen[], acks: Map<string, number>): number | null {
  const live = screens.filter(screen => screen.connected);
  if (!live.length) return null;
  return Math.min(...live.map(screen => Math.max(screen.confirmed_version, acks.get(screen.id) ?? 0)));
}
export const syncingAfterMs = 2000;
export function isSyncing(version: number, confirmed: number | null, appliedAt: number | undefined, now: number) {
  return confirmed !== null && confirmed < version && appliedAt !== undefined && now - appliedAt >= syncingAfterMs;
}

// Steps the run of show moves through, in order. Drafts and self-paced sessions are skipped.
export function liveSteps(sessions: ShowSession[]) {
  return sessions.filter(s => s.mode === "live" && s.state !== "draft")
    .sort((a, b) => parts.indexOf(a.part) - parts.indexOf(b.part) || a.position - b.position || a.id.localeCompare(b.id));
}
export function neighbours(sessions: ShowSession[], shown: string | null, anchor: string | null) {
  const steps = liveSteps(sessions), at = steps.findIndex(s => s.id === (shown ?? anchor));
  if (!shown) return { next: at < 0 ? steps[0] ?? null : steps[at + 1] ?? null, back: at < 0 ? null : steps[at] };
  return { next: at < 0 ? null : steps[at + 1] ?? null, back: at <= 0 ? null : steps[at - 1] };
}
// Up next: the next Ready step after the one on the TV.
export function upNext(sessions: ShowSession[], shown: string | null, anchor: string | null) {
  const steps = liveSteps(sessions), at = steps.findIndex(s => s.id === (shown ?? anchor));
  return steps.slice(at + 1).find(s => s.state === "ready") ?? null;
}

export function timing(session: Pick<ShowSession, "planned_start" | "planned_minutes"> | null, now: number) {
  if (!session?.planned_start) return null;
  const start = Date.parse(session.planned_start), end = start + session.planned_minutes * 60000, slack = 2 * 60000;
  const minutes = (ms: number) => Math.max(1, Math.round(ms / 60000));
  // A plan for another day is not a timing signal.
  if (Math.abs(now - start) > 6 * 3600000) return null;
  if (now > end + slack) return { onTime: false, label: `${minutes(now - end)} min behind` };
  if (now < start - slack) return { onTime: false, label: `${minutes(start - now)} min ahead` };
  return { onTime: true, label: "On time" };
}

export const stateLabels: Record<string, string> = { draft: "Draft", ready: "Ready", live: "Live", phones_down: "Phones down", open: "Taking late answers", closed: "Closed" };
export const actionNames: Record<string, string> = {
  go_live: "Go live", next: "Next", back: "Back", nothing_live: "Nothing live", reopen: "Reopen", start_burst: "Start burst",
  extend_burst: "Extend 1 min", end_burst: "End burst", phones_down: "Phones down", open_phones: "Open phones", spotlight: "Spotlight",
  clear_spotlight: "Clear spotlight", hide: "Hide", unhide: "Unhide", refresh_phones: "Refresh phones", tv_on_phones: "TV view on phones",
  room_size: "Room size", close_part: "Close the day", burst_ended: "Burst ended",
  turn_ai_on: "Turn AI on", turn_ai_off: "Turn AI off", undo_ai_combine: "Undo an AI combine", undo_ai_group: "Undo an AI group", redo_ai_group: "Redo an AI group",
  pin_group: "Pin a group", unpin_group: "Unpin a group", rename_group: "Rename a group", undo_last_ai_change: "Undo last AI change", show_summary: "Show summary", hide_summary: "Hide summary",
  candidates_draft: "Draft candidates", candidates_add: "Add a candidate", candidates_rename: "Rename a candidate", candidates_remove: "Remove a candidate", candidates_merge: "Merge candidates",
  candidates_accept: "Accept a suggestion", candidates_dismiss: "Dismiss a suggestion", candidates_send: "Send candidates to the TV", candidates_hold: "Hold candidates back", candidates_open_points: "Open 100 points",
  candidates_back: "Back to candidates", candidates_cut: "Move the cut line", candidates_mark: "Mark provisional Vision Outcomes",
};
// Copy shown after a refused press. Plain, verb-led, no dashes.
export function resultMessage(result: ControlResult) {
  switch (result.status) {
    case "ok": case "duplicate": case "unchanged": return "";
    case "moved": return result.by ? `${result.by} already moved the room${result.title ? ` to ${result.title}` : ""}.` : `The room already moved${result.title ? ` to ${result.title}` : ""}.`;
    case "not_ready": return "Mark this session ready in the run of show first.";
    case "no_session": return "There’s no session in that direction.";
    case "hidden": return "Unhide this answer before you spotlight it.";
    case "missing": return "That’s no longer on the TV.";
    case "invalid_state": return "That isn’t available right now.";
    case "closed": return "This engagement has closed.";
    case "denied": return "You’re not assigned to this engagement.";
    default: return "We couldn’t reach the room. The TV and phones keep running. Try again.";
  }
}
