// Images uploaded to an engagement (batch 1: TC-2, TC-3, LP-1). Shared by the browser and the server.
export const imageTypes = ["image/png", "image/jpeg", "image/webp"] as const;
export type ImageType = typeof imageTypes[number];
export const imageMaxBytes = 20 * 1024 * 1024;
export const imageMaxAtOnce = 10;
export const imageBucket = "engagement-images";
export type EngagementImage = { id: string; name: string; mime: ImageType; bytes: number; width: number | null; height: number | null; created_at: string };
// An image on a step: Fill takes the whole TV (content screens only), In place sits beside the headline.
export type StepImage = { id: string; display: "fill" | "place" };
export type ImageSurface = "tv" | "phone" | "control";
// The address every surface reads an image from. The server checks the reader, then sends it to a short-lived signed address.
export const imageUrl = (engagement: string, image: string, surface: ImageSurface) => `/api/images/${engagement}/${image}?surface=${surface}`;
export function stepImage(options: unknown): StepImage | null {
  const o = options && typeof options === "object" && !Array.isArray(options) ? (options as { image?: unknown }).image : null;
  if (!o || typeof o !== "object") return null;
  const { id, display } = o as { id?: unknown; display?: unknown };
  return typeof id === "string" && (display === "fill" || display === "place") ? { id, display } : null;
}
// Sniffed from the first bytes, so a renamed file is caught before it is uploaded.
export function sniffImage(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}
export const imageProblem = (file: { size: number; type: string }) =>
  !imageTypes.includes(file.type as ImageType) ? "Use a PNG, JPG or WebP image." : file.size > imageMaxBytes ? "Use an image of 20 MB or smaller." : null;
