// Timers (TM-1 to TM-3): the room's one general timer. The room state holds when it started and when it ends; every surface
// works out the time from those and the server clock, so nothing ticks in the database and every screen agrees.
export type TimerKind = "down" | "up" | "to";
export type LiveTimer = {
  id: string; kind: TimerKind; seconds?: number; length?: number; at?: string; started_at: string; ends_at?: string; paused_at?: string;
  tv: boolean; phones: boolean; source: "step" | "manual"; from?: string; through?: string;
};
// A step's own timer setting, in the run of show.
export type StepTimer = { kind: TimerKind; seconds?: number; at?: string; tv: boolean; phones: boolean; start: "live" | "hand"; through?: string };
export const timerKinds: TimerKind[] = ["down", "up", "to"];
export const timerKindLabels: Record<TimerKind, string> = { down: "Count down", up: "Count up", to: "Count to a time" };
export const timerSecondsMin = 10, timerSecondsMax = 14400;

export function stepTimer(options: unknown): StepTimer | null {
  const t = options && typeof options === "object" && !Array.isArray(options) ? (options as { timer?: unknown }).timer : null;
  if (!t || typeof t !== "object") return null;
  const o = t as Partial<StepTimer>;
  if (!o.kind || !timerKinds.includes(o.kind)) return null;
  return { kind: o.kind, seconds: o.seconds, at: o.at, tv: o.tv !== false, phones: o.phones === true, start: o.start === "hand" ? "hand" : "live", through: o.through };
}

export function clock(total: number) {
  const s = Math.max(0, Math.floor(total)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

// What a timer shows at `now` (server milliseconds): counting down or to a time, the time left, then "+1:12" over;
// counting up, the time so far. The last minute and overtime are their own phase: Sunrise on the TV, never a flash.
export type TimerView = { text: string; phase: "normal" | "last" | "over"; paused: boolean; label: string };
export function timerView(t: LiveTimer, now: number): TimerView {
  const at = t.paused_at ? Date.parse(t.paused_at) : now, paused = Boolean(t.paused_at);
  if (t.kind === "up" || !t.ends_at) {
    const shown = clock((at - Date.parse(t.started_at)) / 1000);
    return { text: shown, phase: "normal", paused, label: `${shown} so far${paused ? ", paused" : ""}` };
  }
  const left = Date.parse(t.ends_at) - at;
  if (left > 0) {
    const shown = clock(Math.ceil(left / 1000));
    return { text: shown, phase: left <= 60000 ? "last" : "normal", paused, label: `${shown} left${paused ? ", paused" : ""}` };
  }
  const over = clock(Math.floor(-left / 1000));
  return { text: `+${over}`, phase: "over", paused, label: `${over} over${paused ? ", paused" : ""}` };
}

// The run of show's marks for timers that run through later steps (D21): the step that owns the timer, the steps it keeps
// running through, and the one where it ends. Steps are in run order.
export type TimerMark = { role: "owner" | "running" | "end"; label: string };
export function timerMarks(ordered: { id: string; options?: unknown }[]) {
  const marks = new Map<string, TimerMark>();
  ordered.forEach((s, i) => {
    const t = stepTimer(s.options); if (!t) return;
    const length = t.kind === "down" ? `Timer ${clock(t.seconds ?? 0)}` : t.kind === "up" ? "Timer counts up" : `Timer to ${t.at ?? ""}`;
    if (!marks.has(s.id)) marks.set(s.id, { role: "owner", label: length });
    const end = t.through ? ordered.findIndex(x => x.id === t.through) : -1;
    if (end <= i) return;
    for (let k = i + 1; k <= end; k++) if (!marks.has(ordered[k].id)) marks.set(ordered[k].id, { role: k === end ? "end" : "running", label: k === end ? "Timer ends here" : "Timer running" });
  });
  return marks;
}
