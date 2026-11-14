import { uuid } from "../room/identity";
import type { TvReceipt } from "./types";
import { roomOrigin, type Skin } from "../brand";
import type { LiveSnapshot } from "../live/types";
export function pairingCode(value: unknown) {
  const code = typeof value === "string" ? value.replaceAll(" ", "") : "";
  return /^\d{6}$/.test(code) ? code : null;
}
export const roomCode = (value: string) => /^[A-F0-9]{8}$/i.test(value);
// The room link on the TV and in its QR code: the engagement's address (live.clearway.co for Clearway,
// live.novetera.co for Novetera) and the code. The older /r/CODE keeps working for links already sent.
export function shortRoomLink(code: string, skin: Skin = "clearway", env?: Parameters<typeof roomOrigin>[1]) {
  if (!roomCode(code)) throw new Error("Invalid room code");
  return `${roomOrigin(skin, env)}/${code.toUpperCase()}`;
}
// What a person types or pastes into the join box: the code alone, with spaces or a
// hyphen, or the whole link from the screen. Returns the code in capitals, or "".
export function typedRoomCode(value: unknown) {
  if (typeof value !== "string") return "";
  const last = value.trim().split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? "";
  return last.replace(/[\s-]/g, "").toUpperCase().slice(0, 24);
}
// The practice room, for anyone trying the app before a retreat.
export const practiceCode = "PRACTICE";
export function receiptInput(body: Record<string, unknown>) {
  const date = (v: unknown) => typeof v === "string" && v.length <= 40 && Number.isFinite(Date.parse(v));
  const uncertainty = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 60000;
  if (!uuid(body.engagement) || !Number.isSafeInteger(body.version) || Number(body.version) < 0 || !date(body.received_at) || !uncertainty(body.uncertainty_ms)
    || !Array.isArray(body.answers) || body.answers.length > 500) return null;
  const answers: TvReceipt[] = [];
  for (const a of body.answers) {
    if (!a || !uuid(a.id) || !Number.isInteger(a.revision) || a.revision < 0 || a.revision > 1000000 || !date(a.received_at) || !uncertainty(a.uncertainty_ms)) return null;
    answers.push({ id: a.id, revision: a.revision, received_at: a.received_at, uncertainty_ms: a.uncertainty_ms });
  }
  return { engagement: body.engagement, version: Number(body.version), received_at: body.received_at as string, uncertainty_ms: Number(body.uncertainty_ms), answers };
}
// Texture by screen type: live input screens and content screens carry the
// glow only; holding, join and breaks carry the oversized mark with glow.
export function screenType(frame: Pick<LiveSnapshot, "state" | "session"> | null) {
  const content = frame?.state.tv_content;
  if (content === "screen_check") return "content";
  if (content !== "session") return "holding";
  if (frame?.session?.interaction !== "content") return "input";
  // A holding or walk-in screen in the run of show carries the holding texture.
  const options = frame.session.options as { screen?: string } | undefined;
  return options?.screen === "holding" ? "holding" : "content";
}
