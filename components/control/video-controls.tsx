"use client";
import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw, VolumeX } from "lucide-react";
import { mediaPosition, videoOptions, videoTime } from "@/lib/video/playback";
import type { Room } from "./live-controls";
import "./video-controls.css";

export function VideoControls({ room, compact = false }: { room: Room; compact?: boolean }) {
  const step = room.frame?.session;
  const media = room.frame?.state.media;
  const options = videoOptions(step?.options);
  const [scrub, setScrub] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);
  const playing = Boolean(media?.playing);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [playing]);
  if (step?.interaction !== "video" || !options || !media || media.session !== step?.id) return null;
  const end = options.end ?? media.duration;
  const length = end === undefined ? null : Math.max(options.start, end);
  const position = scrub ?? mediaPosition(media, Math.max(now, Date.now()) + room.clockOffset, length);
  const blocked = room.frame?.state.media_sound_blocked || media.sound_blocked;
  const busy = Boolean(room.pending) || room.show.context.closed;
  const sendSeek = (value: number) => { setScrub(null); void room.press("media_seek", { position: value }); };
  return <section className="ctl-video" aria-label="Video controls">
    {blocked && <p className="ctl-video-warning" role="status"><VolumeX aria-hidden="true" />The TV needs a click to play sound. Click the TV once.</p>}
    <div className="ctl-row ctl-video-controls">
      <button type="button" className="show-button is-primary" disabled={busy} aria-keyshortcuts={compact ? undefined : "K"}
        onClick={() => void room.press(playing ? "media_pause" : "media_play")}>
        {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}{playing ? "Pause" : "Play"}{!compact && <kbd className="ctl-kbd" aria-hidden="true">K</kbd>}
      </button>
      <button type="button" className="show-button" disabled={busy} onClick={() => void room.press("media_restart")}><RotateCcw size={16} aria-hidden="true" />Restart</button>
      <output className="ctl-video-time" aria-label="Video time">{videoTime(position)}{length !== null ? ` / ${videoTime(length)}` : ""}</output>
    </div>
    {!compact && <><input className="ctl-video-scrub" aria-label="Seek video" type="range" min={options.start} max={length ?? Math.max(options.start + 1, position)} step={0.1} value={position} disabled={busy || length === null}
      onChange={event => setScrub(Number(event.currentTarget.value))}
      onPointerUp={event => sendSeek(Number(event.currentTarget.value))}
      onKeyUp={event => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) sendSeek(Number(event.currentTarget.value)); }} />
      <p className="show-help">Ends: {options.ends === "next" ? "goes to the next step" : "holds the last frame"}</p>
      <p className="show-help">Sound plays from the TV window. Check the TV&apos;s volume during Screen check.</p></>}
  </section>;
}
