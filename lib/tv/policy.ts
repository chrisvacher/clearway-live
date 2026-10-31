import { uuid } from "../room/identity";
import type { TvReceipt } from "./types";
export function pairingCode(value: unknown) {
  const code = typeof value === "string" ? value.replaceAll(" ", "") : "";
  return /^\d{6}$/.test(code) ? code : null;
}
export const roomCode = (value: string) => /^[A-F0-9]{8}$/i.test(value);
export function shortRoomLink(code: string) {
  if (!roomCode(code)) throw new Error("Invalid room code");
  return `https://live.clearway.co/r/${code.toUpperCase()}`;
}
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
