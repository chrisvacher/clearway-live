"use client";
import { useState } from "react";
import { Pause, Play, Plus, RotateCcw, Square, Timer } from "lucide-react";
import type { Room } from "./live-controls";
import { useTimerNow } from "@/components/tv/tv-timer";
import { stepTimer, timerKindLabels, timerKinds, timerView, type LiveTimer, type TimerKind } from "@/lib/live/timer";
import { Select } from "@/components/ui/select";

type Press = (action: string, p?: Record<string, unknown>) => Promise<{ status: string }>;
// The room's timer controls (TM-3): one press each, decided by the database under the room lock.
export function useTimerPress(engagement: string) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const press: Press = async (action, p = {}) => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/control/${engagement}/timer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, p }) });
      const data = await response.json().catch(() => ({ status: "unavailable" })) as { status: string };
      if (!["ok", "unchanged", "running"].includes(data.status)) setMessage(data.status === "past" ? "That time has already passed today." : data.status === "closed" ? "This engagement has closed." : data.status === "missing" ? "No timer is running." : "The timer didn’t change. Please try again.");
      return data;
    } catch { setMessage("We couldn’t reach the room. Please try again."); return { status: "unavailable" }; }
    finally { setBusy(false); }
  };
  return { press, busy, message };
}

function Readout({ timer }: { timer: LiveTimer }) {
  const view = timerView(timer, useTimerNow(true));
  return <b className={`ctl-timer-time is-${view.phase}`} role="timer" aria-label={view.label}>{view.text}</b>;
}
const where = (t: LiveTimer) => [t.tv ? "TV" : "", t.phones ? "phones" : ""].filter(Boolean).join(" and ") || "this screen only";

// The Live screen's header (D20): the timer with Pause and +1 under the Live title.
export function TimerChip({ room, engagement }: { room: Room; engagement: string }) {
  const timer = room.frame?.state.timer, { press, busy } = useTimerPress(engagement);
  if (!timer) return null;
  return <div className="ctl-timer-chip" data-timer-chip>
    <Timer size={16} aria-hidden="true" /><Readout timer={timer} />
    {timer.kind !== "to" && <button type="button" className="show-button is-small" disabled={busy} onClick={() => void press(timer.paused_at ? "resume" : "pause")}>{timer.paused_at ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}{timer.paused_at ? "Resume" : "Pause"}</button>}
    <button type="button" className="show-button is-small" disabled={busy} onClick={() => void press("add", { seconds: 60 })}><Plus size={14} aria-hidden="true" />1 min</button>
  </div>;
}

// Room admin and the remote (D19): Pause, +1 min, +5 min, minus 1 min and Reset for the running timer, and Start a timer
// (Down, Up or To a time, with a length). Starting while one runs asks first: Keep the running timer, or Replace it.
export function TimerCard({ room, engagement, compact = false }: { room: Room; engagement: string; compact?: boolean }) {
  const timer = room.frame?.state.timer ?? null, { press, busy, message } = useTimerPress(engagement);
  const live = room.current, own = live ? stepTimer(live.options) : null;
  const [kind, setKind] = useState<TimerKind>("down"), [minutes, setMinutes] = useState("5"), [at, setAt] = useState("10:30");
  const [tv, setTv] = useState(true), [phones, setPhones] = useState(false), [asking, setAsking] = useState<null | (() => Promise<unknown>)>(null);
  const setting = () => ({ kind, ...(kind === "down" ? { seconds: Math.round(Math.max(1, Number(minutes) || 0) * 60) } : {}), ...(kind === "to" ? { at } : {}), tv, phones });
  const start = async (action: "start" | "start_step", p: Record<string, unknown>) => {
    const r = await press(action, p);
    if (r.status === "running") setAsking(() => () => press(action, { ...p, replace: true }).then(() => setAsking(null)));
  };
  const btn = compact ? "ctl-r-btn" : "show-button is-small";
  return <div className="ctl-timer" data-timer-card>
    {timer ? <div className="ctl-timer-now">
      <div className="ctl-timer-line"><Timer size={18} aria-hidden="true" /><Readout timer={timer} /><span className="show-help">{timerKindLabels[timer.kind]}{timer.paused_at ? ", paused" : ""} · on the {where(timer)}</span></div>
      <div className="ctl-timer-buttons">
        {timer.kind !== "to" && <button type="button" className={btn} disabled={busy} onClick={() => void press(timer.paused_at ? "resume" : "pause")}>{timer.paused_at ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}{timer.paused_at ? "Resume" : "Pause"}</button>}
        <button type="button" className={btn} disabled={busy} onClick={() => void press("add", { seconds: 60 })}>+1 min</button>
        <button type="button" className={btn} disabled={busy} onClick={() => void press("add", { seconds: 300 })}>+5 min</button>
        <button type="button" className={btn} disabled={busy} onClick={() => void press("add", { seconds: -60 })}>−1 min</button>
        {timer.kind !== "to" && <button type="button" className={btn} disabled={busy} onClick={() => void press("reset")}><RotateCcw size={16} aria-hidden="true" />Reset</button>}
        <button type="button" className={btn} disabled={busy} onClick={() => void press("stop")}><Square size={16} aria-hidden="true" />Stop</button>
      </div>
    </div> : <p className="show-help">No timer is running. The burst countdown is separate and stays as it is.</p>}
    {own && own.start === "hand" && timer?.from !== live?.id && <button type="button" className={btn} disabled={busy} onClick={() => void start("start_step", {})}><Play size={16} aria-hidden="true" />Start this step’s timer</button>}
    <details className="ctl-timer-start" open={!timer && !compact}>
      <summary>Start a timer</summary>
      <div className="ctl-timer-form">
        <div className="ctl-timer-kinds" role="radiogroup" aria-label="Kind of timer">{timerKinds.map(k => <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "is-on" : ""} onClick={() => setKind(k)}>{k === "down" ? "Down" : k === "up" ? "Up" : "To a time"}</button>)}</div>
        {kind === "down" && <label htmlFor={`timer-minutes${compact ? "-r" : ""}`}>Minutes<Select id={`timer-minutes${compact ? "-r" : ""}`} value={minutes} onChange={e => setMinutes(e.target.value)}>{[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 45, 60, 90].map(m => <option key={m} value={m}>{m}</option>)}</Select></label>}
        {kind === "to" && <label htmlFor={`timer-at${compact ? "-r" : ""}`}>Time<input id={`timer-at${compact ? "-r" : ""}`} type="time" value={at} onChange={e => setAt(e.target.value)} /></label>}
        <label className="show-check"><input type="checkbox" checked={tv} onChange={e => setTv(e.target.checked)} />Show on the TV</label>
        <label className="show-check"><input type="checkbox" checked={phones} onChange={e => setPhones(e.target.checked)} />Show on phones</label>
        <button type="button" className={`${btn} is-primary`} disabled={busy} onClick={() => void start("start", setting())}><Play size={16} aria-hidden="true" />Start</button>
      </div>
    </details>
    {asking && <div className="ctl-timer-ask" role="alertdialog" aria-labelledby="ctl-timer-ask-title">
      <p id="ctl-timer-ask-title"><b>Replace the running timer?</b></p>
      <div className="ctl-timer-buttons">
        <button type="button" className={btn} onClick={() => setAsking(null)}>Keep the running timer</button>
        <button type="button" className={`${btn} is-primary`} disabled={busy} onClick={() => void asking()}>Replace it</button>
      </div>
    </div>}
    {message && <p className="show-message is-error" role="alert">{message}</p>}
  </div>;
}
