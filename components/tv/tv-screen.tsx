"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Maximize } from "lucide-react";
import { RoomStream } from "@/lib/live/stream";
import { clockSample, retryDelay } from "@/lib/live/protocol";
import type { LiveRead, LiveSnapshot } from "@/lib/live/types";
import { TvReceipts } from "@/lib/tv/receipts";
import type { TvBinding, TvStatus } from "@/lib/tv/types";
import { TvScenes } from "./tv-scenes";

export function TvScreen({ initial }: { initial: TvBinding | null }) {
  const [status, setStatus] = useState<TvStatus>(initial || { status: "opening" });
  const [frame, setFrame] = useState<LiveSnapshot | null>(null), [mode, setMode] = useState("connecting"), [awake, setAwake] = useState(true);
  const root = useRef<HTMLElement>(null), stage = useRef<HTMLDivElement>(null), sync = useRef<() => void>(() => {});
  const receipt = useRef<TvReceipts | null>(null), clock = useRef({ offsetMs: 0, uncertaintyMs: 60000 });
  const boxes = useRef(new Map<string, DOMRect>());
  const engagement = status.status === "paired" ? status.engagement : null, binding = status.status === "paired" ? status.tv : null;
  useEffect(() => {
    let stopped = false, running = false, again = false, timer: ReturnType<typeof setTimeout>, failures = 0;
    async function poll() {
      if (stopped) return; if (running) { again = true; return; } running = true; clearTimeout(timer);
      let paired = false;
      try {
        const response = await fetch("/api/tv", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const next = await response.json() as TvStatus; if (stopped) return;
        if (next.status === "unavailable" || next.status === "limited" || !response.ok) throw new Error("unavailable");
        paired = next.status === "paired";
        setStatus(before => JSON.stringify(before) === JSON.stringify(next) ? before : next);
        if (!paired) setFrame(null); failures = 0;
      } catch { if (!stopped) { setMode("offline"); failures++; } }
      finally { running = false; if (!stopped) { if (again) { again = false; void poll(); } else timer = setTimeout(() => void poll(), failures ? retryDelay(failures) : paired ? 5000 : 1000); } }
    }
    sync.current = () => void poll(); void poll();
    const resume = () => { if (document.visibilityState === "visible") void poll(); };
    window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
    return () => { stopped = true; clearTimeout(timer); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
  }, []);
  useEffect(() => {
    if (!engagement || !binding) return;
    const receipts = new TvReceipts(engagement, async ack => (await fetch("/api/tv/ack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ack) })).ok,
      () => ({ time: new Date(Date.now() + clock.current.offsetMs).toISOString(), uncertainty: clock.current.uncertaintyMs }));
    receipt.current = receipts;
    const stream = new RoomStream({
      read: async transport => {
        const sent = Date.now(), response = await fetch(`/api/live/${engagement}?surface=tv${transport ? "&transport=1" : ""}`, { cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 403 ? "denied" : "unavailable");
        const data = await response.json() as LiveRead;
        clock.current = clockSample(sent, Date.now(), Date.parse(data.server_time)); return data;
      },
      received: (event, at) => { if (event.answer) receipts.record(event.state.version, { id: event.answer.id, revision: event.answer.revision, received_at: new Date(at + clock.current.offsetMs).toISOString(), uncertainty_ms: clock.current.uncertaintyMs }); },
      render: value => {
        boxes.current = new Map([...stage.current?.querySelectorAll<HTMLElement>("[data-name-key]") || []].map(el => [el.dataset.nameKey!, el.getBoundingClientRect()]));
        setFrame(value);
      },
      mode: next => { setMode(next); if (next === "denied") { setFrame(null); setStatus({ status: "opening" }); sync.current(); } },
    });
    stream.start(); const resume = () => { if (document.visibilityState === "visible") stream.resume(); };
    window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
    return () => { stream.stop(); receipts.stop(); receipt.current = null; window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
  }, [engagement, binding]);
  useLayoutEffect(() => {
    if (!frame || !stage.current) return;
    const el = stage.current, style = getComputedStyle(el), scale = el.getBoundingClientRect().width / 1920;
    const duration = frame.display?.reduced_motion || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : parseFloat(style.getPropertyValue("--cwl-dur-make-room"));
    el.querySelectorAll<HTMLElement>("[data-name-key]").forEach(name => {
      const before = boxes.current.get(name.dataset.nameKey!), after = name.getBoundingClientRect();
      if (before && duration && (before.left !== after.left || before.top !== after.top)) {
        name.getAnimations().forEach(animation => animation.cancel());
        name.animate([{ transform: `translate(${(before.left - after.left) / scale}px,${(before.top - after.top) / scale}px)` }, { transform: "translate(0,0)" }], { duration, easing: style.getPropertyValue("--cwl-ease-signature").trim() });
      }
    });
    // The persistent shell has committed this version, and animation begins on
    // its next paint. Receipt timestamps remain the original receive times.
    const raf = requestAnimationFrame(() => receipt.current?.paint(frame.version));
    return () => cancelAnimationFrame(raf);
  }, [frame]);
  useEffect(() => {
    const el = root.current; if (!el) return;
    const resize = () => el.style.setProperty("--tv-stage-scale", String(Math.min(el.clientWidth / 1920, el.clientHeight / 1080)));
    const observer = new ResizeObserver(resize); observer.observe(el); resize(); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>, lock: WakeLockSentinel | null = null, stopped = false;
    async function wake() { if (document.visibilityState !== "visible" || stopped || lock) return; try { lock = await navigator.wakeLock?.request("screen") || null; if (stopped) { await lock?.release(); lock = null; } else lock?.addEventListener("release", () => { lock = null; }); } catch { /* Browser keeps its native wake-lock limits. */ } }
    const activity = () => { setAwake(true); clearTimeout(timer); timer = setTimeout(() => setAwake(false), 3000); };
    const visibility = () => { if (document.visibilityState === "visible") void wake(); };
    const key = (event: KeyboardEvent) => { activity(); if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "f") { event.preventDefault(); void fullscreen(); } };
    window.addEventListener("pointermove", activity); window.addEventListener("keydown", key); document.addEventListener("visibilitychange", visibility); activity(); void wake();
    return () => { stopped = true; clearTimeout(timer); void lock?.release(); window.removeEventListener("pointermove", activity); window.removeEventListener("keydown", key); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  async function fullscreen() { try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.current?.requestFullscreen(); } catch { /* A blocked request leaves the same TV shell in place. */ } }
  const display = frame?.display;
  return <main ref={root} id="main" className={`tv-viewport${awake ? " is-awake" : ""}`} data-surface="tv" data-theme={display?.theme || "dark"} data-motion={display?.reduced_motion ? "reduced" : undefined} data-room={display?.room_size || "very_small"} data-screen={frame?.state.tv_content === "screen_check" || frame?.state.tv_content === "session" ? "content" : "holding"} data-texture={display?.texture === false ? "off" : "on"}>
    <div ref={stage} className="tv-stage" data-version={frame?.version}><TvScenes status={status} frame={frame} reconnecting={mode === "offline" || status.status === "paired" && ["fallback", "connecting"].includes(mode)} /></div>
    <div className="tv-tools"><button onClick={() => void fullscreen()}><Maximize size={20} aria-hidden="true" />Toggle full screen (F)</button><span>Escape exits full screen</span></div>
  </main>;
}
