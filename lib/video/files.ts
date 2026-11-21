import { uuid } from "@/lib/room/identity";
export const videoBucket = "engagement-videos";
export const videoLimit = 524_288_000;
export const videoChunk = 6 * 1024 * 1024;
export const videoTypes = ["video/mp4", "video/quicktime"] as const;
export type VideoFile = { id: string; name: string; width: number; height: number; mime: typeof videoTypes[number]; bytes: number; duration: number };

export function videoUploadRequest(body: Record<string, unknown>) {
  if (!uuid(body.engagement) || !uuid(body.id)) return null;
  const identifiers = { engagement: body.engagement, id: body.id };
  if (body.action === "begin" && typeof body.name === "string" && typeof body.mime === "string" && videoTypes.includes(body.mime as VideoFile["mime"])
    && typeof body.bytes === "number" && Number.isInteger(body.bytes) && body.bytes >= 1 && body.bytes <= videoLimit)
    return { ...identifiers, action: "begin" as const, name: body.name.trim().slice(0, 200), mime: body.mime, bytes: body.bytes };
  const dimensions = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 16384;
  if (body.action === "finish" && dimensions(body.width) && dimensions(body.height)
    && typeof body.duration === "number" && Number.isFinite(body.duration) && body.duration >= .01 && body.duration <= 86400)
    return { ...identifiers, action: "finish" as const, width: body.width, height: body.height, duration: body.duration };
  return null;
}

export function resumableVideoEndpoint(base: string) {
  const url = new URL(base);
  if (/^[a-z0-9]+\.supabase\.co$/i.test(url.hostname)) url.hostname = url.hostname.replace(".supabase.co", ".storage.supabase.co");
  return new URL("/storage/v1/upload/resumable/sign", url).href;
}
