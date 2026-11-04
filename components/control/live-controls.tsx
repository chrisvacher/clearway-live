"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CircleCheck, EyeOff, Eye, MonitorSmartphone, MonitorOff, Pause, Play, Plus, RefreshCw, RotateCcw, Smartphone, Square, Sun, SunDim, Timer, TriangleAlert, Info, X } from "lucide-react";
import { fillYears } from "@/lib/run-of-show/policy";
import { stateLabels } from "@/lib/control/policy";
import type { ShowContext, ShowSession } from "@/lib/run-of-show/types";
import type { RoomSize } from "@/lib/control/types";
import type { useControlRoom } from "./use-control-room";
import { controlItems } from "@/components/interactions/control-items";
import { MarkDecision } from "./mark-decision";

export type Room = ReturnType<typeof useControlRoom>;
export const roomSizes: [RoomSize, string][] = [["very_small", "Very small screen"], ["small", "Small screen"], ["medium", "Medium screen"], ["large", "Large screen"], ["very_large", "Very large screen"]];

// A consequential press needs a second tap within 3 seconds. No browser dialogs.
export function useSecondTap() {
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(null), 3000); return () => clearTimeout(t); }, [armed]);
  return { armed, tap: (key: string, run: () => void) => { if (armed === key) { setArmed(null); run(); } else setArmed(key); } };
}

export function burstLeft(room: Room) {
  const ends = room.frame?.state.burst_ends_at;
  if (!ends) return null;
  const ms = Math.max(0, Date.parse(ends) - (room.now + room.clockOffset));
  return { ms, label: `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}` };
}

export function SyncChip({ room }: { room: Room }) {
  const screens = room.status?.screens ?? [];
  const connected = screens.filter(s => s.connected);
  const title = screens.map(s => `${s.label}: ${s.connected ? `confirmed, version ${s.confirmed_version}` : "reconnecting"}`).join("\n");
  if (room.syncing) return <span className="ctl-sync is-syncing" role="status" title={title}><RefreshCw size={14} aria-hidden="true" />Syncing</span>;
  // A paired TV silent for 12 seconds is reconnecting (FAIL-02); none paired is no TV.
  if (!connected.length) return <span className="ctl-sync is-none" role="status" title={title || "Pair a TV in setup"}><MonitorOff size={14} aria-hidden="true" />{screens.length ? "TV reconnecting" : "No TV connected"}</span>;
  return <span className="ctl-sync" role="status" title={title}><CircleCheck size={14} aria-hidden="true" />On the TV now</span>;
}

// One banner at a time: TV reconnecting > Syncing > fallback mode.
export function Banners({ room, compact = false }: { room: Room; compact?: boolean }) {
  const down = (room.status?.screens ?? []).filter(s => !s.connected && s.last_seen_at);
  const tvOnPhones = Boolean(room.frame?.state.show_tv_on_phones);
  if (down.length) return <div className="ctl-banner is-warning" role="status"><TriangleAlert size={18} aria-hidden="true" /><div>
    <strong>{down.map(s => s.label).join(" and ")} reconnecting.</strong> {compact ? "The room is fine." : "It’s holding the last screen. If it stays down, show the TV view on phones."}
    {!compact && !tvOnPhones && <div><button className="show-button" disabled={Boolean(room.pending)} onClick={() => void room.press("tv_on_phones", { on: true })}><MonitorSmartphone size={18} aria-hidden="true" />Show the TV view on phones</button></div>}
  </div></div>;
  if (room.syncing) return <div className="ctl-banner is-warning" role="status"><TriangleAlert size={18} aria-hidden="true" /><div><strong>The TV hasn’t confirmed yet.</strong> The room is fine.{compact ? "" : " The controls show what the TV confirms."}</div></div>;
  if (room.mode === "fallback") return <div className="ctl-banner is-info" role="status"><Info size={18} aria-hidden="true" /><div><strong>Fallback mode.</strong> This venue blocks live connections, so the room updates every 1 to 2 seconds. Nothing redraws.</div></div>;
  return null;
}

export function ReloadNotice({ room }: { room: Room }) {
  if (!room.reload) return null;
  return <div className="ctl-banner is-warning" role="alert"><RefreshCw size={18} aria-hidden="true" /><div><strong>Still connecting.</strong> The room is fine: the TV and phones keep running.
    <div><button className="show-button is-primary" onClick={() => window.location.reload()}><RotateCcw size={18} aria-hidden="true" />Reload</button></div></div></div>;
}

export function Toasts({ room }: { room: Room }) {
  return <div className="ctl-toasts" aria-live="polite">{room.toasts.map(t => <div key={t.id} className="ctl-toast" role="status"><Info size={18} aria-hidden="true" /><div><strong>{t.text}</strong><span>From another remote · just now</span></div></div>)}</div>;
}

export function PreviewCard({ session, context, room, onClose }: { session: ShowSession; context: ShowContext; room: Room; onClose: () => void }) {
  const live = room.frame?.state.live_session_id === session.id;
  return <section className="ctl-preview" aria-labelledby="ctl-preview-title">
    <div className="ctl-row is-between"><span className="ctl-eyebrow">Preview · not on the TV</span><span className={`show-state is-${session.state}`}>{stateLabels[session.state] ?? session.state}</span></div>
    <h2 id="ctl-preview-title">{session.title}</h2>
    <dl className="ctl-defs">
      <dt>On the TV and phones</dt><dd>{fillYears(session.prompt, context.base_year) || "No prompt"}</dd>
      <dt>Phones only</dt><dd>{session.phone_depth ? fillYears(session.phone_depth, context.base_year) : "No phone depth"}</dd>
      {session.interaction !== "content" && <><dt>Burst</dt><dd>{session.settings.burst_minutes} minutes</dd></>}
    </dl>
    <div className="ctl-private"><div className="show-private"><EyeOff size={16} aria-hidden="true" />Only you see this<span>Presenter notes</span></div><p className="ctl-notes">{session.notes || "No presenter notes."}</p></div>
    <div className="ctl-row">
      <button className="show-button is-primary" disabled={Boolean(room.pending) || live || session.state === "draft" || context.closed} onClick={() => void room.press("go_live", { session: session.id }).then(r => { if (r.status === "ok") onClose(); })}><Play size={18} aria-hidden="true" />Go live from preview</button>
      <button className="show-button" onClick={onClose}><X size={18} aria-hidden="true" />Close preview</button>
    </div>
    {session.state === "draft" && <p className="show-help">Mark this session ready in the run of show before it goes live.</p>}
  </section>;
}

// The live controls. The laptop and the remote send the same presses.
export function LiveControls({ room, variant, onItems, onRoomSize }: { room: Room; variant: "laptop" | "remote"; onItems: () => void; onRoomSize?: () => void }) {
  const { frame, current, steps, pending, press } = room;
  const confirm = useSecondTap();
  const [minutes, setMinutes] = useState<3 | 4 | 5>(4);
  const sessionMinutes = current?.settings.burst_minutes;
  useEffect(() => { if (sessionMinutes === 3 || sessionMinutes === 4 || sessionMinutes === 5) setMinutes(sessionMinutes); }, [current?.id, sessionMinutes]);
  const busy = Boolean(pending) || !frame;
  const state = frame?.session?.state, input = frame?.session && frame.session.interaction !== "content";
  const readOnly = state === "closed", burst = burstLeft(room), down = Boolean(frame?.state.phones_down);
  const spotlit = frame?.state.spotlight_key, tvOnPhones = Boolean(frame?.state.show_tv_on_phones);
  const up = room.upNext;
  const btn = variant === "remote" ? "ctl-r-btn" : "show-button";
  const primary = readOnly
    ? <button className={`${btn} is-primary is-wide`} disabled={busy} onClick={() => void press("reopen")}><RotateCcw size={20} aria-hidden="true" />Reopen {frame?.session?.title}</button>
    : <button className={`${btn} ${burst ? "is-primary" : "is-live"} is-wide`} disabled={busy || !up} onClick={() => up && void press("go_live", { session: up.id })}><Play size={20} aria-hidden="true" />{up ? `Go live: ${up.title}` : "No session ready"}</button>;
  return <div className={`ctl-controls is-${variant}`}>
    {burst && <div className="ctl-countdown" role="timer" aria-label={`Burst, ${burst.label} left`}><Timer size={20} aria-hidden="true" /><b>{burst.label}</b><progress className="ctl-progress" max={100} value={Math.min(100, burst.ms / ((current?.settings.burst_minutes ?? 4) * 600))} aria-hidden="true" />
      <button className={btn} disabled={busy} onClick={() => void press("extend_burst")}><Plus size={18} aria-hidden="true" />Extend 1 min</button></div>}
    {primary}
    <div className="ctl-grid">
      <button className={btn} disabled={busy || !steps.back} onClick={() => void press("back")} title={steps.back?.title}><ChevronLeft size={20} aria-hidden="true" />Back</button>
      <button className={btn} disabled={busy || !steps.next} onClick={() => void press("next")} title={steps.next?.title}>Next<ChevronRight size={20} aria-hidden="true" /></button>
    </div>
    {input && !readOnly && <div className="ctl-grid">
      {burst ? <>
        <button className={btn} disabled={busy} onClick={() => void press("end_burst")}><Square size={18} aria-hidden="true" />End burst</button>
        <button className={btn} disabled={busy} onClick={() => void press("phones_down")}><Smartphone size={18} aria-hidden="true" />Phones down</button>
      </> : <>
        <button className={`${btn} is-primary`} disabled={busy} onClick={() => void press("start_burst", { minutes })}><Timer size={18} aria-hidden="true" />Start burst</button>
        <div className="ctl-seg" role="radiogroup" aria-label="Burst length in minutes">{([3, 4, 5] as const).map(n => <button key={n} role="radio" aria-checked={minutes === n} aria-label={`${n} minutes`} onClick={() => setMinutes(n)}>{n}</button>)}</div>
      </>}
    </div>}
    <div className="ctl-grid">
      {input && !readOnly && !burst && (down
        ? <button className={btn} disabled={busy} onClick={() => void press("open_phones")}><Smartphone size={18} aria-hidden="true" />Open phones</button>
        : <button className={btn} disabled={busy} onClick={() => void press("phones_down")}><Smartphone size={18} aria-hidden="true" />Phones down</button>)}
      <button className={btn} disabled={busy || !frame?.state.live_session_id} onClick={() => void press("nothing_live")}><Pause size={18} aria-hidden="true" />Nothing live</button>
    </div>
    {input && <div className="ctl-grid">
      {spotlit
        ? <button className={btn} disabled={busy} onClick={() => void press("clear_spotlight")}><SunDim size={18} aria-hidden="true" />Clear spotlight</button>
        : <button className={btn} disabled={busy} onClick={onItems}><Sun size={18} aria-hidden="true" />Spotlight</button>}
      <button className={btn} disabled={busy} onClick={onItems}><EyeOff size={18} aria-hidden="true" />Hide</button>
    </div>}
    <div className="ctl-grid">
      <button className={btn} disabled={busy} aria-pressed={tvOnPhones} onClick={() => void press("tv_on_phones", { on: !tvOnPhones })}>{tvOnPhones ? <Eye size={18} aria-hidden="true" /> : <MonitorSmartphone size={18} aria-hidden="true" />}{tvOnPhones ? "Stop the TV view on phones" : "TV view on phones"}</button>
      <button className={btn} disabled={busy} onClick={() => confirm.tap("refresh", () => void press("refresh_phones"))}><RefreshCw size={18} aria-hidden="true" />{confirm.armed === "refresh" ? "Tap again to refresh phones" : "Refresh phones"}</button>
    </div>
    <MarkDecision room={room} variant={variant} />
    {variant === "remote" && onRoomSize && <button className={btn} disabled={busy} onClick={onRoomSize}>Room size</button>}
  </div>;
}

export function ItemList({ room, onClose }: { room: Room; onClose?: () => void }) {
  const kind = room.frame?.session?.interaction;
  if (!kind || kind === "content") return null;
  const Own = controlItems[kind];
  if (Own) return <Own room={room} onClose={onClose} />;
  return <GeneralItems room={room} onClose={onClose} />;
}

// The general list of items with Spotlight and Hide. A kind's own list may show it too.
export function GeneralItems({ room, onClose, title = "Items on the TV" }: { room: Room; onClose?: () => void; title?: string }) {
  const items = room.status?.items ?? [], spot = room.frame?.state.spotlight_key, busy = Boolean(room.pending);
  const kind = room.frame?.session?.interaction;
  return <section className="ctl-items" aria-labelledby="ctl-items-title">
    <div className="ctl-row is-between"><h2 id="ctl-items-title">{title}</h2>{onClose && <button className="show-button is-icon" aria-label="Close items" onClick={onClose}><X size={20} aria-hidden="true" /></button>}</div>
    <p className="show-help">{kind === "wall" ? "Answers, newest first. Names never show." : kind === "word_cloud" ? "Words, most mentioned first." : "In the TV’s order, with the server’s numbers."}{room.status?.counts.hidden ? ` ${room.status.counts.hidden} hidden.` : ""}</p>
    {items.length ? <ul className="ctl-item-list">{items.map(item => <li key={item.key} className={item.hidden ? "is-hidden" : item.key === spot ? "is-spot" : ""}>
      <span className="ctl-item-text">{item.text}{kind === "word_cloud" && <small> · {item.count}</small>}</span>
      {item.hidden
        ? <button className="show-button" disabled={busy} onClick={() => void room.press("unhide", { item: item.key })}><Eye size={16} aria-hidden="true" />Unhide</button>
        : <>
          {item.key === spot
            ? <button className="show-button" disabled={busy} onClick={() => void room.press("clear_spotlight")}><SunDim size={16} aria-hidden="true" />Clear</button>
            : <button className="show-button" disabled={busy} onClick={() => void room.press("spotlight", { item: item.key }).then(r => { if (r.status === "ok") onClose?.(); })}><Sun size={16} aria-hidden="true" />Spotlight</button>}
          <button className="show-button" disabled={busy} onClick={() => void room.press("hide", { item: item.key })}><EyeOff size={16} aria-hidden="true" />Hide</button>
        </>}
    </li>)}</ul> : <p className="show-empty">Nothing on the TV yet.</p>}
  </section>;
}
