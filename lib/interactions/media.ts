import { uuid } from "../room/identity";

export const mediaTypes = ["image/png", "image/jpeg", "image/webp"] as const;
export type MediaType = typeof mediaTypes[number];
export const maxMediaBytes = 4 * 1024 * 1024;

export function mediaInput(body: Record<string, unknown>) {
  const { session, mime, width, height, data } = body;
  const size = (n: unknown) => Number.isInteger(n) && Number(n) >= 1 && Number(n) <= 8192;
  if (!uuid(session) || !mediaTypes.includes(mime as MediaType) || !size(width) || !size(height) || typeof data !== "string"
    || data.length > Math.ceil(maxMediaBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  return { session: session as string, mime: mime as MediaType, width: Number(width), height: Number(height), data };
}
export const mediaUrl = (engagement: string, media: string, surface: "tv" | "phone" | "control") => `/api/media/${engagement}/${media}?surface=${surface}`;

// The TV is 1920 by 1080. A page is kept sharp enough to read up close and small
// enough to travel quickly: its long edge at most 2400px.
export function fitSize(width: number, height: number, longest = 2400) {
  const scale = Math.min(1, longest / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
