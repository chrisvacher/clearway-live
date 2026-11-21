import { videoBucket, videoChunk, videoTypes, type VideoFile } from "./files";

type SignedVideoUpload = { url: string; token: string; path: string; key: string; resumable: string };
type VideoMetadata = { duration: number; width: number; height: number };
const wait = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

export function inspectVideo(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const player = document.createElement("video"), url = URL.createObjectURL(file);
    const cleanup = () => { clearTimeout(timer); URL.revokeObjectURL(url); player.removeAttribute("src"); };
    const failed = () => { cleanup(); reject(new Error("This browser couldn’t read that clip. Try a playable MP4 or MOV.")); };
    const timer = setTimeout(failed, 15000);
    player.preload = "metadata";
    player.onloadedmetadata = () => {
      const { duration, videoWidth, videoHeight } = player;
      if (!Number.isFinite(duration) || duration <= 0 || !videoWidth || !videoHeight) { failed(); return; }
      cleanup(); resolve({ duration, width: videoWidth, height: videoHeight });
    };
    player.onerror = failed;
    player.src = url;
  });
}

async function control(body: Record<string, unknown>) {
  const response = await fetch("/api/setup/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.status !== "ok") throw new Error(result.message || "Couldn’t upload the video. Try again.");
  return result as { uploaded?: boolean; upload?: SignedVideoUpload; video?: VideoFile };
}

export async function uploadVideo(engagement: string, file: File, progress: (fraction: number) => void) {
  const id = crypto.randomUUID();
  const mime = videoTypes.includes(file.type as VideoFile["mime"]) ? file.type : /\.mov$/i.test(file.name) ? "video/quicktime" : /\.mp4$/i.test(file.name) ? "video/mp4" : null;
  if (!mime) throw new Error("Choose an MP4 or MOV video.");
  const metadata = await inspectVideo(file);
  const { upload } = await control({ action: "begin", engagement, id, name: file.name, mime, bytes: file.size });
  if (!upload) throw new Error("Couldn’t start the upload. Try again.");
  if (file.size > videoChunk) await tusUpload(file, mime, upload, progress);
  else {
    const response = await fetch(upload.url, { method: "PUT", headers: { apikey: upload.key, "Content-Type": mime, "x-upsert": "false" }, body: file });
    if (!response.ok) throw new Error("The upload didn’t finish. Try again.");
  }
  progress(1);
  const result = await control({ action: "finish", engagement, id, ...metadata });
  if (!result.video) throw new Error("The upload didn’t finish. Try again.");
  return result.video;
}

// Supabase's signed TUS upload uses a 6 MiB chunk size. A reconnect checks the server's
// committed offset before retrying, so it can resume even when a PATCH lost its response.
async function tusUpload(file: File, mime: string, upload: SignedVideoUpload, progress: (fraction: number) => void) {
  const common = { "Tus-Resumable": "1.0.0", "x-signature": upload.token, apikey: upload.key };
  const encode = (text: string) => btoa(Array.from(new TextEncoder().encode(text), byte => String.fromCharCode(byte)).join(""));
  const meta = { bucketName: videoBucket, objectName: upload.path, contentType: mime, cacheControl: "3600" };
  const create = await fetch(upload.resumable, { method: "POST", headers: { ...common, "Upload-Length": String(file.size), "Upload-Metadata": Object.entries(meta).map(([key, value]) => `${key} ${encode(value)}`).join(",") } });
  const location = create.headers.get("Location");
  if (create.status !== 201 || !location) throw new Error("Couldn’t start the resumable upload. Try again.");
  const url = new URL(location, upload.resumable);
  if (url.origin !== new URL(upload.resumable).origin) throw new Error("The upload address was unexpected. Try again.");
  let offset = 0, retries = 0;
  const getOffset = (response: Response) => {
    const header = response.headers.get("Upload-Offset"), value = Number(header);
    if (header === null || !Number.isInteger(value) || value < 0 || value > file.size) throw new Error("The upload position was unavailable.");
    return value;
  };
  while (offset < file.size) {
    try {
      if (retries > 0) {
        const resume = await fetch(url, { method: "HEAD", headers: common });
        if (!resume.ok) throw new Error("Couldn’t resume the upload.");
        offset = getOffset(resume);
        if (offset === file.size) break;
      }
      const next = await fetch(url, { method: "PATCH", headers: { ...common, "Content-Type": "application/offset+octet-stream", "Upload-Offset": String(offset) }, body: file.slice(offset, offset + videoChunk) });
      if (next.status !== 204) throw new Error("Couldn’t continue the upload.");
      const nextOffset = getOffset(next);
      if (nextOffset <= offset) throw new Error("The upload did not move forward.");
      offset = nextOffset; retries = 0; progress(offset / file.size);
    } catch {
      if (++retries > 5) throw new Error("The connection dropped during upload. Check the connection and try again.");
      await wait(Math.min(8000, 500 * 2 ** retries));
    }
  }
}
