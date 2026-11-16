"use client";
import { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { serverNow } from "@/lib/live/protocol";
import { timerView, type LiveTimer } from "@/lib/live/timer";

// The time now on the room's clock, a few times a second while a timer is up.
export function useTimerNow(on: boolean) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => { if (!on) return; setNow(serverNow()); const t = setInterval(() => setNow(serverNow()), 250); return () => clearInterval(t); }, [on]);
  return now;
}

// The TV's timer (D8, D17): top right, left of the live mark, in the count badge's shape and the TV type ramp. In the last
// minute its outline and digits turn to the callout colour (Sunrise; Brass 300 in Novetera); at zero it keeps that look and
// counts overtime up. It fades in and out with the make-room timing, and the digits keep their width, so nothing moves.
export function TvTimer({ timer }: { timer: LiveTimer | null | undefined }) {
  const on = Boolean(timer && timer.tv), now = useTimerNow(on);
  const last = useRef<LiveTimer | null>(null);
  if (timer && timer.tv) last.current = timer;
  const shown = last.current, view = shown ? timerView(shown, now) : null;
  return <span className={`tv-timer${on ? " is-on" : ""}${view ? ` is-${view.phase}` : ""}${view?.paused ? " is-paused" : ""}`} role="timer" aria-hidden={!on} aria-label={view?.label} data-timer={on ? view?.phase : "off"}>
    <Timer aria-hidden="true" /><b>{view?.text ?? ""}</b>
  </span>;
}

// Phones (D18): a plain chip in the header beside the mark, with no colour change, the rule the burst ring follows.
export function PhoneTimer({ timer }: { timer: LiveTimer | null | undefined }) {
  const on = Boolean(timer && timer.phones), now = useTimerNow(on);
  if (!timer || !timer.phones) return null;
  const view = timerView(timer, now);
  return <span className="ph-timer" role="timer" aria-label={view.label} data-timer={view.phase}><Timer size={14} aria-hidden="true" />{view.text}</span>;
}
