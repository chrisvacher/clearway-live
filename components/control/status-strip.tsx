"use client";

import { Monitor, MonitorOff, Smartphone, Timer, Wifi } from "lucide-react";
import { timerView } from "@/lib/live/timer";
import { useTimerNow } from "@/components/tv/tv-timer";
import { TvNoteLine, useOpenTv } from "./open-tv-window";
import type { Room } from "./live-controls";

export function StatusStrip({ room, onPhones }: { room: Room; onPhones: () => void }) {
  const { frame, status, syncing, show } = room;
  const { open, busy, note } = useOpenTv(show.context.id);
  const timer = frame?.state.timer;
  const now = useTimerNow(Boolean(timer));
  const clock = timer ? timerView(timer, now) : null;
  const connected = status?.screens.some(screen => screen.connected) && !syncing;
  const counts = status?.counts, p95 = counts?.latency_p95_ms;
  return <div className="ctl-header-status">
    <div className="ctl-status-strip" role="group" aria-label="Room status">
      {connected ? <span className="ctl-status" data-testid="tv-live"><Monitor size={14} aria-hidden="true" /><i aria-hidden="true" />TV connected</span>
        : show.context.closed ? <span className="ctl-status is-warning"><MonitorOff size={14} aria-hidden="true" />No TV connected</span>
          : <button type="button" className="ctl-status is-warning" disabled={busy} data-testid="tv-chip" onClick={() => void open()}><MonitorOff size={14} aria-hidden="true" />{busy ? "Opening the TV" : "No TV. Open the TV"}</button>}
      <button type="button" className="ctl-status" onClick={onPhones} aria-label={`${counts?.signed_in ?? 0} in the room`}><Smartphone size={14} aria-hidden="true" />{counts?.signed_in ?? 0} {(counts?.signed_in ?? 0) === 1 ? "phone" : "phones"}</button>
      <span className={`ctl-status${p95 != null && p95 > 1500 ? " is-warning" : ""}`} title="95th percentile phone to TV time">
        <Wifi size={14} aria-hidden="true" />{p95 == null ? "No speed yet" : `${(p95 / 1000).toFixed(1)} s to the TV`}</span>
      {clock && <span className={`ctl-status${clock.phase === "last" ? " is-warning" : clock.phase === "over" ? " is-error" : ""}`} role="timer">
        <Timer size={14} aria-hidden="true" />{clock.label}</span>}
    </div>
    <TvNoteLine note={note} />
  </div>;
}
