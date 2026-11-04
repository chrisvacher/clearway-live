import { uuid } from "../room/identity";

// The shape of a review call. The database checks every rule again, including who may do it.
export type OvernightBody =
  | { action: "presence"; place: string; editing: boolean }
  | { action: "edit"; outcome: string; revision: number; bullets: { id?: string; text: string }[] }
  | { action: "restore_words"; outcome: string; bullet: string; revision: number }
  | { action: "remove"; outcome: string; bullet: string; removed: boolean; revision: number }
  | { action: "source"; outcome: string; bullet: string; kind: "bullet" | "card" | "photo"; ref: string; add: boolean; revision: number }
  | { action: "add_room_bullet"; outcome: string; indicator: string; revision: number }
  | { action: "accept"; outcome: string; revision: number }
  | { action: "ack_thin"; outcome: string; value: boolean }
  | { action: "restore_version"; outcome: string; version: number; revision: number }
  | { action: "photo_text"; file: string; text: string }
  | { action: "start" }
  | { action: "by_hand" }
  | { action: "publish"; id: string }
  | { action: "unpublish" };

const rev = (x: unknown) => Number.isInteger(x) && Number(x) >= 0 && Number(x) < 1e9;
export function overnightBody(raw: Record<string, unknown> | null): OvernightBody | null {
  if (!raw) return null;
  switch (raw.action) {
    case "presence": return typeof raw.place === "string" && (raw.place === "overview" || raw.place === "publish" || uuid(raw.place)) && typeof raw.editing === "boolean" ? { action: "presence", place: raw.place, editing: raw.editing } : null;
    case "edit": {
      if (!uuid(raw.outcome) || !rev(raw.revision) || !Array.isArray(raw.bullets) || raw.bullets.length > 20) return null;
      const bullets: { id?: string; text: string }[] = [];
      for (const b of raw.bullets) {
        if (!b || typeof b !== "object" || typeof (b as { text?: unknown }).text !== "string") return null;
        const item = b as { id?: unknown; text: string };
        if (item.text.length > 1000 || (item.id !== undefined && !uuid(item.id))) return null;
        bullets.push({ ...(item.id ? { id: item.id as string } : {}), text: item.text });
      }
      return { action: "edit", outcome: raw.outcome, revision: Number(raw.revision), bullets };
    }
    case "restore_words": return uuid(raw.outcome) && uuid(raw.bullet) && rev(raw.revision) ? { action: "restore_words", outcome: raw.outcome, bullet: raw.bullet, revision: Number(raw.revision) } : null;
    case "remove": return uuid(raw.outcome) && uuid(raw.bullet) && typeof raw.removed === "boolean" && rev(raw.revision) ? { action: "remove", outcome: raw.outcome, bullet: raw.bullet, removed: raw.removed, revision: Number(raw.revision) } : null;
    case "source": return uuid(raw.outcome) && uuid(raw.bullet) && uuid(raw.ref) && (raw.kind === "bullet" || raw.kind === "card" || raw.kind === "photo") && typeof raw.add === "boolean" && rev(raw.revision)
      ? { action: "source", outcome: raw.outcome, bullet: raw.bullet, kind: raw.kind, ref: raw.ref, add: raw.add, revision: Number(raw.revision) } : null;
    case "add_room_bullet": return uuid(raw.outcome) && uuid(raw.indicator) && rev(raw.revision) ? { action: "add_room_bullet", outcome: raw.outcome, indicator: raw.indicator, revision: Number(raw.revision) } : null;
    case "accept": return uuid(raw.outcome) && rev(raw.revision) ? { action: "accept", outcome: raw.outcome, revision: Number(raw.revision) } : null;
    case "ack_thin": return uuid(raw.outcome) && typeof raw.value === "boolean" ? { action: "ack_thin", outcome: raw.outcome, value: raw.value } : null;
    case "restore_version": return uuid(raw.outcome) && Number.isInteger(raw.version) && Number(raw.version) >= 1 && rev(raw.revision) ? { action: "restore_version", outcome: raw.outcome, version: Number(raw.version), revision: Number(raw.revision) } : null;
    case "photo_text": return uuid(raw.file) && typeof raw.text === "string" && raw.text.trim().length > 0 && raw.text.length <= 2000 ? { action: "photo_text", file: raw.file, text: raw.text } : null;
    case "start": return { action: "start" };
    case "by_hand": return { action: "by_hand" };
    case "publish": return uuid(raw.id) ? { action: "publish", id: raw.id } : null;
    case "unpublish": return { action: "unpublish" };
    default: return null;
  }
}
