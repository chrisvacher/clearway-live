import { uuid } from "@/lib/room/identity";

export type VideoOptions = { source: "upload" | "link"; id?: string; url?: string; start: number; end: number | null; ends: "hold" | "next"; sound: boolean };
export type VideoPlayback = { session: string; playing: boolean; position: number; at: string; duration?: number; sound_blocked?: boolean };
export type VideoPreload = { session: string; video: VideoOptions };

export function videoOptions(options?: Record<string, unknown> | null): VideoOptions | null {
  const value = options?.video as Partial<VideoOptions> | undefined;
  if (value?.source !== "upload" && value?.source !== "link") return null;
  if (value.source === "upload" && !uuid(value.id) || value.source === "link" && typeof value.url !== "string") return null;
  return { ...value, source: value.source, start: value.start ?? 0, end: value.end ?? null, ends: value.ends === "next" ? "next" : "hold", sound: value.sound !== false };
}
export function mediaPosition(media: VideoPlayback, now: number, end?: number | null) {
  const elapsed = media.playing ? Math.max(0, now - Date.parse(media.at)) / 1000 : 0;
  return Math.max(0, Math.min(media.position + elapsed, end ?? media.duration ?? Infinity));
}
export function videoTime(value: number) {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function linkedVideo(url: string): { provider: "youtube" | "vimeo"; id: string; hash?: string } | null {
  try {
    const address = new URL(url);
    if (address.protocol !== "https:" || address.username || address.password || address.port) return null;
    const host = address.hostname;
    const parts = address.pathname.split("/").filter(Boolean);
    if (["youtu.be", "youtube.com", "www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com"].includes(host)) {
      const id = host === "youtu.be" ? parts[0] : parts[0] === "watch" ? address.searchParams.get("v") : ["embed", "shorts", "live"].includes(parts[0]) ? parts[1] : null;
      return id && /^[\w-]{11}$/.test(id) ? { provider: "youtube", id } : null;
    }
    if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) {
      const [id, trailing] = parts[0] === "video" ? parts.slice(1) : parts;
      const hash = address.searchParams.get("h") ?? trailing;
      return id && /^\d{1,16}$/.test(id) && (!hash || /^[\da-f]{6,20}$/i.test(hash)) ? { provider: "vimeo", id, ...(hash ? { hash } : {}) } : null;
    }
  } catch { /* An invalid URL is not a supported link. */ }
  return null;
}
