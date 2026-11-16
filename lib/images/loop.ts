// The image loop (LP-1): several images, each shown for a set number of seconds, rotating until the facilitator moves on.
// Its timing comes from the room state's start time, so the TV, the preview and phones always show the same image.
export const loopTransitions = ["fade", "slide", "cut"] as const;
export type LoopTransition = typeof loopTransitions[number];
export const loopTransitionLabels: Record<LoopTransition, string> = { fade: "Cross-fade", slide: "Slide", cut: "Cut" };
export const loopSecondsDefault = 8, loopSecondsMin = 3, loopSecondsMax = 60, loopImagesMax = 30;
export type LoopOptions = { images: string[]; seconds: number; transition: LoopTransition };
export function loopOf(options: unknown): LoopOptions | null {
  const o = options && typeof options === "object" && !Array.isArray(options) ? options as { images?: unknown; seconds?: unknown; transition?: unknown } : {};
  const images = Array.isArray(o.images) ? o.images.filter((x): x is string => typeof x === "string") : [];
  if (!images.length) return null;
  const seconds = Number.isInteger(o.seconds) && Number(o.seconds) >= loopSecondsMin && Number(o.seconds) <= loopSecondsMax ? Number(o.seconds) : loopSecondsDefault;
  const transition = loopTransitions.includes(o.transition as LoopTransition) ? o.transition as LoopTransition : "fade";
  return { images, seconds, transition };
}
// Which image is up at `now` (server milliseconds). With no start time yet, the loop starts at its first image.
export function loopIndex(loop: { images: string[]; seconds: number; startedAt?: string | null }, now: number) {
  const n = loop.images.length;
  if (n < 2 || !loop.seconds) return 0;
  const started = loop.startedAt ? Date.parse(loop.startedAt) : NaN;
  if (!Number.isFinite(started)) return 0;
  const step = Math.floor(Math.max(0, now - started) / (loop.seconds * 1000));
  return step % n;
}
// How long until the next image, for the Live screen's "next in 5s".
export function loopNextIn(loop: { images: string[]; seconds: number; startedAt?: string | null }, now: number) {
  if (loop.images.length < 2 || !loop.seconds) return null;
  const started = loop.startedAt ? Date.parse(loop.startedAt) : NaN;
  if (!Number.isFinite(started)) return loop.seconds;
  const period = loop.seconds * 1000;
  return Math.max(1, Math.ceil((period - (Math.max(0, now - started) % period)) / 1000));
}
