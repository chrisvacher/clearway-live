import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";

export function normalizedEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}
export const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const digest = (secret: string, ...parts: string[]) => createHmac("sha256", secret).update(JSON.stringify(parts)).digest("hex");
export function newDevice() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return { id: randomUUID(), secret: randomBytes(32).toString("hex"), code: Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("") };
}
export const newCode = () => String(randomInt(1000000)).padStart(6, "0");
export const newLink = () => randomBytes(32).toString("hex");
export function parseDevice(value: string | undefined): { id: string; secret: string } | null {
  try {
    const data = JSON.parse(value || "");
    return uuid(data.id) && typeof data.secret === "string" && /^[0-9a-f]{64}$/.test(data.secret) ? { id: data.id, secret: data.secret } : null;
  } catch { return null; }
}
export function sessionId(token: string): string | null {
  try { const id = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).session_id; return uuid(id) ? id : null; }
  catch { return null; }
}
