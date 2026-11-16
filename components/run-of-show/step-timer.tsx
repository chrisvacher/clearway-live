"use client";
import { sortSessions } from "@/lib/run-of-show/policy";
import type { ShowSession } from "@/lib/run-of-show/types";
import { stepTimer, timerKindLabels, timerKinds, type StepTimer } from "@/lib/live/timer";
import { Select } from "@/components/ui/select";

// A step's timer in the run of show (TM-1 and TM-2): count down, count up or count to a clock time; on the TV and phones or not;
// started on Go live or by hand; and it can run through a later step, keeping time as the room moves between them.
export function StepTimerField({ session, others, value, onChange, locked }: {
  session: ShowSession; others: ShowSession[]; value: Record<string, unknown>; onChange: (options: Record<string, unknown>) => void; locked: boolean;
}) {
  const t = stepTimer(value);
  const set = (next: StepTimer | null) => { const { timer: _old, ...rest } = value; void _old; onChange(next ? { ...rest, timer: next } : rest); };
  const patch = (p: Partial<StepTimer>) => t && set({ ...t, ...p });
  const ordered = sortSessions(others.some(s => s.id === session.id) ? others : [...others, session]).filter(s => s.mode === "live");
  const later = ordered.slice(ordered.findIndex(s => s.id === session.id) + 1);
  const seconds = t?.seconds ?? 300, mins = Math.floor(seconds / 60), secs = seconds % 60;
  return <>
    <label className="show-check is-full" htmlFor="timer-on"><input id="timer-on" type="checkbox" checked={Boolean(t)} disabled={locked}
      onChange={e => set(e.target.checked ? { kind: "down", seconds: 300, tv: true, phones: false, start: "live" } : null)} />Add a timer to this step</label>
    {t && <>
      <div className="is-full step-timer-kinds" role="radiogroup" aria-label="Kind of timer">{timerKinds.map(k => <button key={k} type="button" role="radio" aria-checked={t.kind === k} className={t.kind === k ? "is-on" : ""} disabled={locked}
        onClick={() => set({ ...t, kind: k, seconds: k === "down" ? t.seconds ?? 300 : undefined, at: k === "to" ? t.at ?? "10:30" : undefined })}>{timerKindLabels[k]}</button>)}</div>
      {t.kind === "down" && <>
        <label htmlFor="timer-mins">Minutes<input id="timer-mins" type="number" min={0} max={240} value={mins} disabled={locked} onChange={e => patch({ seconds: Math.min(14400, Math.max(10, Math.max(0, Number(e.target.value) || 0) * 60 + secs)) })} /></label>
        <label htmlFor="timer-secs">Seconds<input id="timer-secs" type="number" min={0} max={59} value={secs} disabled={locked} onChange={e => patch({ seconds: Math.min(14400, Math.max(10, mins * 60 + Math.min(59, Math.max(0, Number(e.target.value) || 0)))) })} /></label>
      </>}
      {t.kind === "to" && <label htmlFor="timer-at">Count to<input id="timer-at" type="time" value={t.at ?? "10:30"} disabled={locked} onChange={e => patch({ at: e.target.value })} /><span className="show-help">In the engagement’s time zone.</span></label>}
      <label htmlFor="timer-start">Starts<Select id="timer-start" value={t.start} disabled={locked} onChange={e => patch({ start: e.target.value === "hand" ? "hand" : "live" })}>
        <option value="live">When the step goes live</option><option value="hand">When I start it in Room admin</option></Select></label>
      <label htmlFor="timer-through">Runs through<Select id="timer-through" value={t.through ?? ""} disabled={locked} onChange={e => patch({ through: e.target.value || undefined })}>
        <option value="">This step only</option>{later.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</Select>
        <span className="show-help">It keeps running as the room moves through these steps, and stops after the last one.</span></label>
      <label className="show-check" htmlFor="timer-tv"><input id="timer-tv" type="checkbox" checked={t.tv} disabled={locked} onChange={e => patch({ tv: e.target.checked })} />Show on the TV</label>
      <label className="show-check" htmlFor="timer-phones"><input id="timer-phones" type="checkbox" checked={t.phones} disabled={locked} onChange={e => patch({ phones: e.target.checked })} />Show on phones</label>
    </>}
  </>;
}
