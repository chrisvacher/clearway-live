"use client";
import { useEffect, useRef } from "react";
import type { LiveSnapshot } from "@/lib/live/types";
import { TvScenes } from "@/components/tv/tv-scenes";
import { screenType } from "@/lib/tv/policy";

// The TV's own scenes at mirror scale, drawn from the version the TV confirmed.
// It keeps the TV's theme and live-only colors inside the light app shell.
export function TvMirror({ frame, label = "On the TV now" }: { frame: LiveSnapshot | null; label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const fit = () => el.style.setProperty("--tv-stage-scale", String(el.clientWidth / 1920));
    const observer = new ResizeObserver(fit); observer.observe(el); fit(); return () => observer.disconnect();
  }, []);
  const display = frame?.display;
  return <div ref={box} className="tv-mirror" role="img" aria-label={`${label}: ${frame?.session?.title ?? (frame?.state.tv_content === "join" ? "Join screen" : "Holding screen")}`}
    data-surface="tv" data-theme={display?.theme || "dark"} data-room={display?.room_size || "very_small"} data-motion="reduced"
    data-screen={screenType(frame)} data-texture={display?.texture === false ? "off" : "on"}>
    <div className="tv-stage" aria-hidden="true">
      {frame && <TvScenes status={{ status: "paired", engagement: frame.state.engagement_id, tv: "mirror" }} frame={frame} nameLimit={14} reconnecting={false} />}
    </div>
  </div>;
}
