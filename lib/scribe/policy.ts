import type { CardDetail, CardKind, OutboxEntry, ScribeCardRow, ScribeFileRow, ScribeState } from "./types";
import { cardKinds } from "./types";

// The six card kinds, in the order of keys 1 to 6. Lands is where the card goes in the report (PRD "Scribe capture").
export const kindInfo: Record<CardKind, { label: string; key: string; icon: "Quote" | "Gavel" | "Zap" | "SquareCheck" | "CircleHelp" | "ShieldCheck"; field: string; lands: string }> = {
  quote: { label: "Quote", key: "1", icon: "Quote", field: "What was said", lands: "The lens or section’s pull quote, the report" },
  decision: { label: "Decision", key: "2", icon: "Gavel", field: "What the room decided", lands: "Decisions" },
  tension: { label: "Tension", key: "3", icon: "Zap", field: "The tension", lands: "Strategic Tensions" },
  action: { label: "Action", key: "4", icon: "SquareCheck", field: "What someone will do", lands: "Communication, next steps" },
  question: { label: "Question", key: "5", icon: "CircleHelp", field: "What is unresolved", lands: "Key Issues" },
  mitigation: { label: "Mitigation", key: "6", icon: "ShieldCheck", field: "What the team would do", lands: "Risks and Roadblocks, linked to the risk" },
};
export const kindForKey = (key: string): CardKind | null => cardKinds.find(k => kindInfo[k].key === key) ?? null;

export const maxText = 2000;
export const maxFileBytes = 15 * 1024 * 1024;
export const fileTypes: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf", "text/plain": "txt", "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx", "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};
export const fileAccept = Object.keys(fileTypes).join(",");

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
// The detail a kind carries, trimmed to the database's limits. Empty parts are left out.
export function cleanDetail(kind: CardKind, raw: Partial<Record<string, unknown>>): CardDetail {
  const out: CardDetail = {};
  if (kind === "tension") {
    const views = Array.isArray(raw.views) ? raw.views : [];
    const a = clean(views[0], 500), b = clean(views[1], 500);
    if (a || b) out.views = [a, b];
  }
  if (kind === "action") { const owner = clean(raw.owner, 200), date = clean(raw.date, 40); if (owner) out.owner = owner; if (date) out.date = date; }
  if (kind === "decision") { const why = clean(raw.why, 1000); if (why) out.why = why; }
  if (kind === "mitigation") { const risk = clean(raw.risk, 300); if (risk) out.risk = risk; }
  return out;
}

// The message the composer shows when a card can't be captured yet; empty when it can.
export function checkCapture(text: string): string {
  const length = [...text.trim()].length;
  if (length === 0) return "";
  return length > maxText ? `${length - maxText} characters over. Keep it to ${maxText}.` : "";
}
export const canCapture = (text: string) => text.trim().length > 0 && checkCapture(text) === "";

export function checkFile(file: { size: number; type: string }): string {
  if (!fileTypes[file.type.toLowerCase()]) return "This kind of file can’t be uploaded. Use a photo, PDF, Word, PowerPoint, Excel, text or CSV file.";
  if (file.size > maxFileBytes) return "Files can be up to 15 MB.";
  if (file.size === 0) return "This file is empty.";
  return "";
}

// ---------- What the screens show ----------
export type CardState = "queued" | "syncing" | "synced" | "failed";
export type ShownCard = ScribeCardRow & { state: CardState; order?: number; reason?: string; pending?: boolean };
export type ShownFile = ScribeFileRow & { state: CardState; order?: number; reason?: string };

const cardState = (entry: OutboxEntry, online: boolean): CardState => entry.state === "sent" ? "synced" : entry.state === "failed" ? "failed" : online && entry.state === "sending" ? "syncing" : "queued";

// The server's cards overlaid with what is still waiting on this device. Waiting cards come first,
// newest first, numbered in the order they will send. A card the server holds shows Synced.
export function shownCards(state: Pick<ScribeState, "cards"> | null, outbox: OutboxEntry[], online: boolean, now: string): ShownCard[] {
  const server = new Map((state?.cards ?? []).map(c => [c.id, c]));
  const waiting: ShownCard[] = [];
  let order = 0;
  for (const entry of outbox) {
    if (entry.state !== "sent") order++;
    const item = entry.item;
    if (item.type !== "capture" || server.has(item.id)) continue;
    waiting.push({ id: item.id, session_id: item.session, kind: item.kind, text: item.text, detail: item.detail, has_speaker: Boolean(item.speaker), captured_at: item.capturedAt, received_at: now,
      seq: "", revision: 0, refiled: false, state: cardState(entry, online), order: entry.state === "sent" ? undefined : order, reason: entry.reason, pending: true });
  }
  const edits = new Map<string, Extract<OutboxEntry["item"], { type: "edit" }>>();
  const refiles = new Map<string, string>();
  for (const entry of outbox) { if (entry.item.type === "edit") edits.set(entry.item.id, entry.item); if (entry.item.type === "refile") refiles.set(entry.item.id, entry.item.session); }
  const pendingEdit = (list: OutboxEntry[], id: string) => list.some(e => e.state !== "sent" && e.item.id === id && (e.item.type === "edit" || e.item.type === "refile"));
  const held = [...server.values()].map<ShownCard>(c => {
    const edit = edits.get(c.id), session = refiles.get(c.id);
    return { ...c, ...(edit ? { text: edit.text, detail: edit.detail } : {}), ...(session ? { session_id: session, refiled: true } : {}), state: edit || session ? (pendingEdit(outbox, c.id) ? "queued" : "synced") : "synced" };
  });
  return [...waiting.reverse(), ...held];
}
export function shownFiles(state: Pick<ScribeState, "files"> | null, outbox: OutboxEntry[], online: boolean, now: string): ShownFile[] {
  const server = new Map((state?.files ?? []).map(f => [f.id, f]));
  const waiting: ShownFile[] = [];
  let order = 0;
  for (const entry of outbox) {
    if (entry.state !== "sent") order++;
    const item = entry.item;
    if (item.type !== "file" || (server.get(item.id)?.uploaded)) continue;
    waiting.push({ id: item.id, session_id: item.session, kind: item.fileKind, name: item.name, content_type: item.contentType, bytes: item.bytes, uploaded: false, captured_at: item.capturedAt, received_at: now,
      seq: "", refiled: false, state: cardState(entry, online), order: entry.state === "sent" ? undefined : order, reason: entry.reason });
  }
  return [...waiting.reverse(), ...[...server.values()].filter(f => f.uploaded).map<ShownFile>(f => ({ ...f, state: "synced" }))];
}

// Outcomes the server has settled are never retried; anything else waits and retries in order.
export function settledReason(status: string): string | null {
  switch (status) {
    case "accepted": case "duplicate": case "ok": case "unchanged": return "";
    case "team_led": return "The team had the room, so this didn’t go in.";
    case "invalid_request": case "invalid_session": case "not_found": return "This couldn’t be saved.";
    case "conflict": return "This card changed somewhere else, so this edit didn’t go in.";
    case "missing": return null;
    default: return null;
  }
}

// The step the console follows. Nothing live, and the team-led block, switch it off.
export type ConsoleMode = "ready" | "nothing" | "team_led" | "signed_out";
export function consoleMode(state: ScribeState | null): ConsoleMode {
  if (!state) return "signed_out";
  if (!state.live) return "nothing";
  return state.live.team_led ? "team_led" : "ready";
}

// The wording of a card for tests and the plain-text list.
export const cardLine = (c: Pick<ScribeCardRow, "kind" | "text">) => `${kindInfo[c.kind].label}: ${c.text}`;
