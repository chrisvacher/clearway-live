export const cardKinds = ["quote", "decision", "tension", "action", "question", "mitigation"] as const;
export type CardKind = typeof cardKinds[number];
export type FileKind = "photo" | "file";
// What each kind may carry besides its words (checked again by the database).
export type CardDetail = { views?: [string, string]; owner?: string; date?: string; why?: string; risk?: string };

export type ScribeCardRow = { id: string; session_id: string; kind: CardKind; text: string; detail: CardDetail; has_speaker: boolean;
  captured_at: string; received_at: string; seq: string; revision: number; refiled: boolean };
export type ScribeFileRow = { id: string; session_id: string; kind: FileKind; name: string; content_type: string; bytes: number; uploaded: boolean;
  captured_at: string; received_at: string; seq: string; refiled: boolean };
export type ScribeSession = { id: string; title: string; part: string; team_led: boolean };
export type ScribeLive = { id: string; title: string; part: string; state: string; team_led: boolean };
export type ScribeState = { status: "ok"; role: "scribe" | "facilitator"; server_time: string; version: number; live: ScribeLive | null;
  sessions: ScribeSession[]; cards: ScribeCardRow[]; files: ScribeFileRow[] };

// One thing waiting on the scribe's laptop or phone, in the order it was made.
export type CaptureItem = { type: "capture"; id: string; session: string; kind: CardKind; text: string; detail: CardDetail; speaker: string; capturedAt: string; queuedAt?: string };
export type EditItem = { type: "edit"; id: string; text: string; detail: CardDetail; speaker: string; revision: number };
export type RefileItem = { type: "refile"; id: string; session: string };
export type FileItem = { type: "file"; id: string; session: string; fileKind: FileKind; name: string; contentType: string; bytes: number; capturedAt: string; queuedAt?: string };
export type OutboxItem = CaptureItem | EditItem | RefileItem | FileItem;
export type OutboxEntry = { item: OutboxItem; state: "saved" | "sending" | "failed" | "sent"; reason?: string };
// "sent" is only ever on the screen's overlay: the server has settled the item, but the state read that shows it has not come back yet.
