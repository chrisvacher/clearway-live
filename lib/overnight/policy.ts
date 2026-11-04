import type { Draft, DraftBullet, OvernightState } from "@/components/overnight/types";

// What a refused change says, in plain words.
export function resultMessage(result: { status: string; by?: string }): string {
  switch (result.status) {
    case "locked": return `${result.by || "The other facilitator"} is editing this outcome. You can change it when they finish.`;
    case "conflict": return "This outcome changed while you were looking. It is updated. Try again.";
    case "published": return "The drafts are published. Unpublish them to change anything.";
    case "flagged": return "A bullet has no source, or has a number that no scribe card or easel photo has. Fix it first.";
    case "thin": return "This outcome has no bullets. Acknowledge that it shows as thin before accepting it.";
    case "drafting": return "The draft is still being written for this outcome. Write it by hand if you can’t wait.";
    case "no_room_words": return "This bullet rests on more than one source, so there are no single words to restore.";
    case "not_ready": return "Not everything is reviewed yet. The checklist shows what is left.";
    case "closed": return "This engagement is closed.";
    case "denied": return "You can’t do that here.";
    case "not_found": return "That is no longer in the draft.";
    case "invalid_request": return "That couldn’t be saved. Check the wording and try again.";
    case "unavailable": return "The review is unavailable right now. Your last change may not have saved.";
    default: return "";
  }
}

export const okStatus = (status: string) => ["ok", "duplicate", "unchanged"].includes(status);
export const liveBullets = (draft: Draft) => draft.bullets.filter(b => !b.removed);

// The status chip of a row in the outcome list.
export type RowStatus = "drafting" | "by_hand" | "ready" | "editing" | "reviewed" | "flag";
export function rowStatus(draft: Draft): { kind: RowStatus; label: string } {
  if (draft.reviewed) return { kind: "reviewed", label: `Reviewed by ${draft.reviewed.by}` };
  if (draft.lock) return { kind: "editing", label: `${draft.lock.mine ? "You are" : `${draft.lock.by} is`} editing` };
  if (draft.tidy === "waiting") return { kind: "drafting", label: "Tidying" };
  if (draft.thin) return { kind: "flag", label: draft.thin_ack ? "Thin, acknowledged" : "Thin" };
  const flags = liveBullets(draft).filter(b => b.flag).length;
  if (flags) return { kind: "flag", label: flags === 1 ? "1 flag" : `${flags} flags` };
  return draft.tidy === "by_hand" ? { kind: "ready", label: "Written by hand" } : { kind: "ready", label: "Ready to review" };
}

// How a bullet marks its sources: the room's own words, a count, or none.
export function markOf(bullet: DraftBullet): { kind: "room" | "count" | "none"; n: number } {
  if (!bullet.sources.length) return { kind: "none", n: 0 };
  return { kind: bullet.room_text !== null && bullet.text === bullet.room_text ? "room" : "count", n: bullet.sources.length };
}

export const minutesBetween = (from: string, to: string | number) => Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
export const clock = (iso: string | null, zone: string) => iso ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone }).format(new Date(iso)).toLowerCase().replace(/\s/g, " ") : "";

// Why the drafts cannot be published yet, one line per thing in the way.
export function blockers(state: Extract<OvernightState, { status: "ok" }>): string[] {
  const c = state.check, out: string[] = [];
  if (c.drafting) out.push("The draft is still being written.");
  for (const name of c.unreviewed) out.push(`${name} is not reviewed yet.`);
  for (const e of c.editing) out.push(`${e.by} is still editing ${e.name}.`);
  for (const t of c.thin) if (!t.acknowledged) out.push(`${t.name} has no bullets and the flag is not acknowledged.`);
  return out;
}
