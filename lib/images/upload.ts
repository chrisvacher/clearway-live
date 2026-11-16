"use client";
import { imageMaxBytes, imageProblem, imageTypes, sniffImage, type EngagementImage, type ImageType } from "./shared";

// Upload one image to the engagement: record it, put the bytes straight into Storage at the signed address, then let the
// database check it landed. The browser measures the image's shape, so letterboxing is known before it reaches the TV.
export async function uploadImage(engagement: string, file: File, id: string = crypto.randomUUID()): Promise<EngagementImage> {
  const problem = imageProblem(file); if (problem) throw new Error(problem);
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer()), sniffed = sniffImage(head);
  if (!sniffed || !imageTypes.includes(sniffed as ImageType)) throw new Error("Use a PNG, JPG or WebP image.");
  if (file.size > imageMaxBytes) throw new Error("Use an image of 20 MB or smaller.");
  const shape = await measure(file);
  const post = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/setup/images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engagement, id, ...body }) });
    const data = await response.json().catch(() => ({})) as { status?: string; message?: string; uploaded?: boolean; upload?: { url: string; key: string }; image?: EngagementImage };
    if (!response.ok || data.status !== "ok") throw new Error(data.message || "We couldn’t add that image. Please try again.");
    return data;
  };
  const begun = await post({ action: "begin", name: file.name, mime: sniffed, bytes: file.size });
  if (!begun.uploaded && begun.upload) {
    const form = new FormData(); form.append("cacheControl", "3600"); form.append("", file, file.name);
    const put = await fetch(begun.upload.url, { method: "PUT", body: form, headers: { "x-upsert": "true", apikey: begun.upload.key } });
    if (!put.ok) throw new Error("That image didn’t upload. Please try again.");
  }
  const done = await post({ action: "finish", width: shape.width, height: shape.height });
  return done.image!;
}

async function measure(file: File) {
  try { const bitmap = await createImageBitmap(file); const shape = { width: bitmap.width, height: bitmap.height }; bitmap.close(); return shape; }
  catch { throw new Error("That image couldn’t be read. Try exporting it again."); }
}

export async function listImages(engagement: string): Promise<EngagementImage[]> {
  const response = await fetch(`/api/setup/images?engagement=${engagement}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({})) as { images?: EngagementImage[] };
  return response.ok ? data.images ?? [] : [];
}
