import { uuid } from "../room/identity";
import { cardKinds, type CardKind } from "./types";
import { cleanDetail, fileTypes, maxFileBytes, maxText } from "./policy";

const date = (x: unknown) => typeof x === "string" && x.length <= 40 && Number.isFinite(Date.parse(x));
const text = (x: unknown, max: number) => typeof x === "string" && x.length <= max;

export type ScribeBody =
  | { action: "capture"; id: string; session: string; kind: CardKind; text: string; detail: Record<string, unknown>; speaker: string; capturedAt: string; queuedAt: string | null }
  | { action: "edit"; id: string; text: string; detail: Record<string, unknown>; speaker: string; revision: number }
  | { action: "refile"; id: string; session: string }
  | { action: "file_begin"; id: string; session: string; fileKind: "photo" | "file"; name: string; contentType: string; bytes: number; capturedAt: string; queuedAt: string | null }
  | { action: "file_done"; id: string };

// The shape of a scribe call. The database checks every rule again.
export function scribeBody(raw: Record<string, unknown> | null): ScribeBody | null {
  if (!raw || !uuid(raw.id)) return null;
  const id = raw.id;
  const detail = raw.detail && typeof raw.detail === "object" && !Array.isArray(raw.detail) ? raw.detail as Record<string, unknown> : {};
  if (raw.action === "capture") {
    if (!uuid(raw.session) || !cardKinds.includes(raw.kind as CardKind) || !text(raw.text, maxText * 2) || !String(raw.text).trim() || !date(raw.capturedAt)
      || (raw.queuedAt != null && !date(raw.queuedAt)) || !text(raw.speaker ?? "", 400)) return null;
    return { action: "capture", id, session: raw.session, kind: raw.kind as CardKind, text: String(raw.text), detail: cleanDetail(raw.kind as CardKind, detail), speaker: String(raw.speaker ?? ""), capturedAt: String(raw.capturedAt), queuedAt: raw.queuedAt ? String(raw.queuedAt) : null };
  }
  if (raw.action === "edit") {
    if (!text(raw.text, maxText * 2) || !String(raw.text).trim() || !Number.isInteger(raw.revision) || Number(raw.revision) < 0 || !text(raw.speaker ?? "", 400)) return null;
    return { action: "edit", id, text: String(raw.text), detail, speaker: String(raw.speaker ?? ""), revision: Number(raw.revision) };
  }
  if (raw.action === "refile") return uuid(raw.session) ? { action: "refile", id, session: raw.session } : null;
  if (raw.action === "file_begin") {
    if (!uuid(raw.session) || (raw.fileKind !== "photo" && raw.fileKind !== "file") || typeof raw.name !== "string" || !raw.name.trim() || raw.name.length > 400
      || typeof raw.contentType !== "string" || !fileTypes[raw.contentType.toLowerCase()] || !Number.isInteger(raw.bytes) || Number(raw.bytes) < 1 || Number(raw.bytes) > maxFileBytes
      || !date(raw.capturedAt) || (raw.queuedAt != null && !date(raw.queuedAt))) return null;
    return { action: "file_begin", id, session: raw.session, fileKind: raw.fileKind, name: raw.name, contentType: raw.contentType, bytes: Number(raw.bytes), capturedAt: String(raw.capturedAt), queuedAt: raw.queuedAt ? String(raw.queuedAt) : null };
  }
  if (raw.action === "file_done") return { action: "file_done", id };
  return null;
}
