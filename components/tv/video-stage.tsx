"use client";
import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import type { LiveSnapshot } from "@/lib/live/types";
import { serverNow } from "@/lib/live/protocol";
import { makeLinkedPlayer } from "@/lib/video/linked-player";
import { linkedVideo, mediaPosition, videoOptions, type VideoPlayback, type VideoPreload } from "@/lib/video/playback";
import "./video-stage.css";

export function TestVideoSound({ armed, onSound }: { armed: boolean; onSound: () => void }) {
  async function play() {
    const audio = new AudioContext();
    try {
      await audio.resume();
      const tone = audio.createOscillator(), gain = audio.createGain();
      gain.gain.setValueAtTime(0.10, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + .24);
      tone.frequency.value = 540; tone.connect(gain).connect(audio.destination);
      tone.start(); tone.stop(audio.currentTime + .25);
      tone.onended = () => void audio.close();
      onSound();
    } catch { void audio.close(); }
  }
  return <button type="button" className="tv-test-sound" onClick={() => void play()}><Volume2 aria-hidden="true" />{armed ? "Test sound again" : "Test sound"}</button>;
}

export function VideoStage({ frame, surface, sound }: { frame: LiveSnapshot; surface: "tv" | "control"; sound: boolean }) {
  const current = frame.session?.interaction === "video" && frame.state.tv_content === "session" ? frame.session : null;
  const options = current && videoOptions(current.options);
  const live = current && options ? { session: current.id, video: options } : null;
  const preload = surface === "tv" ? frame.state.media_preload : null;
  const seats = [...(preload && preload.session !== live?.session ? [preload] : []), ...(live ? [live] : [])];
  const media = frame.state.media;
  return <>{seats.map(seat => <VideoSeat key={`${seat.session}:${seat.video.id ?? seat.video.url}`} seat={seat}
    engagement={frame.state.engagement_id} active={seat.session === live?.session} surface={surface}
    sound={sound && seat.video.sound && surface === "tv"} media={media?.session === seat.session ? media : null} />)}</>;
}

type SeatProps = { seat: VideoPreload; engagement: string; active: boolean; surface: "tv" | "control"; sound: boolean; media: VideoPlayback | null };
function VideoSeat(props: SeatProps) {
  const { active, seat } = props;
  return <div className={`tv-video-stage${active ? " is-active" : ""}`} aria-hidden={!active} data-video-stage={active ? "live" : "preload"}>
    {seat.video.source === "upload" ? <UploadedVideo {...props} /> : <LinkedVideo {...props} />}
  </div>;
}

function notify(engagement: string, media: VideoPlayback, change: { duration?: number; soundBlocked?: boolean }) {
  return fetch(`/api/live/${engagement}/media`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session: media.session, at: media.at, ...change }) });
}

function UploadedVideo({ active, seat, engagement, media, surface, sound }: SeatProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false), [duration, setDuration] = useState<number | null>(null);
  const { start, end, id } = seat.video;
  useEffect(() => {
    const player = video.current;
    if (!player || !ready) return;
    if (!active) { player.pause(); if (Math.abs(player.currentTime - start) > .2) player.currentTime = start; return; }
    const target = media ? mediaPosition(media, serverNow(), end ?? duration) : start;
    const safeTarget = duration === null ? target : Math.min(target, Math.max(0, duration - .04));
    if (Math.abs(player.currentTime - safeTarget) > .3 || (!media?.playing && Math.abs(player.currentTime - safeTarget) > .04)) player.currentTime = safeTarget;
    if (!media?.playing) { player.pause(); return; }
    let canceled = false;
    async function play() {
      if (!player || !media) return;
      player.muted = !sound;
      try {
        await player.play();
        if (!canceled && surface === "tv" && seat.video.sound && media.sound_blocked !== !sound) void notify(engagement, media, { soundBlocked: !sound }).catch(() => {});
      } catch (error) {
        if (canceled || player.muted) return;
        player.muted = true;
        await player.play().catch(() => {});
        if (!canceled && surface === "tv" && error instanceof Error && error.name === "NotAllowedError") void notify(engagement, media, { soundBlocked: true }).catch(() => {});
      }
    }
    void play();
    return () => { canceled = true; };
  }, [active, media, start, end, ready, duration, sound, surface, engagement, seat.video.sound]);
  useEffect(() => {
    if (!active || !media || surface !== "tv" || duration === null) return;
    if (media.duration !== duration) void notify(engagement, media, { duration }).catch(() => {});
    if (!media.playing) return;
    const stop = Math.min(duration, end ?? Infinity);
    const delay = Math.max(0, (stop - mediaPosition(media, serverNow())) * 1000);
    const timer = setTimeout(() => { void notify(engagement, media, { duration }).catch(() => {}); }, delay + 80);
    return () => clearTimeout(timer);
  }, [active, media, duration, end, engagement, surface]);
  return <>
    <video ref={video} className="tv-video-file" playsInline preload="auto" muted={!sound || !active} disablePictureInPicture disableRemotePlayback
      src={`/api/videos/${engagement}/${id}?surface=${surface}`}
      onLoadedMetadata={event => {
        const length = event.currentTarget.duration;
        if (Number.isFinite(length) && length > 0) setDuration(length);
        setReady(true);
      }} onError={() => setFailed(true)}
      onEnded={() => { if (surface === "tv" && media && duration) void notify(engagement, media, { duration }).catch(() => {}); }} />
    {(!ready || failed) && <p className="tv-video-loading">{failed ? "This video could not be loaded." : "Loading video"}</p>}
  </>;
}

function LinkedVideo({ seat, active, media, engagement, sound, surface }: SeatProps) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<ReturnType<typeof makeLinkedPlayer> | null>(null);
  const current = useRef({ media, active, sound }); current.current = { media, active, sound };
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false), [duration, setDuration] = useState<number | null>(null);
  const { url, start, end } = seat.video;
  useEffect(() => {
    const link = url && linkedVideo(url);
    if (!link || !host.current) { setFailed(true); return; }
    const show = makeLinkedPlayer(host.current, link, { start, end, muted: !current.current.sound || !current.current.active, title: "Workshop video",
      onAutoplayBlocked: () => {
        const now = current.current.media;
        if (surface === "tv" && now && current.current.active && seat.video.sound) void notify(engagement, now, { soundBlocked: true }).catch(() => {});
      },
      onPlayingChange: playing => {
        const now = current.current.media;
        if (playing && surface === "tv" && now && current.current.active && seat.video.sound && !current.current.sound && !now.sound_blocked)
          void notify(engagement, now, { soundBlocked: true }).catch(() => {});
      },
      onEnded: () => {
        const now = current.current.media;
        if (surface !== "tv" || !now || !current.current.active) return;
        void show.duration().then(length => notify(engagement, now, { duration: length })).catch(() => {});
      },
      onError: () => setFailed(true),
    });
    player.current = show;
    let alive = true;
    void show.ready.then(async () => {
      const length = await show.duration();
      if (alive) { setReady(true); if (Number.isFinite(length) && length > 0) setDuration(length); }
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; player.current = null; show.destroy(); };
  }, [url, start, end, surface, engagement, seat.video.sound]);
  useEffect(() => {
    const show = player.current;
    if (!show || !ready) return;
    let canceled = false;
    async function sync() {
      if (!show) return;
      if (!active || !media?.playing) await show.pause();
      if (canceled) return;
      await show.mute(!sound || !active);
      const at = active && media ? mediaPosition(media, serverNow(), end ?? duration) : start;
      const target = duration === null ? at : Math.min(at, Math.max(0, duration - .05));
      if (Math.abs((await show.currentTime()) - target) > .35 && !canceled) await show.seek(target);
      if (active && media?.playing && !canceled) await show.play();
    }
    void sync().catch(() => {});
    return () => { canceled = true; };
  }, [ready, active, media, sound, start, end, duration]);
  useEffect(() => {
    if (!active || !media || surface !== "tv" || duration === null) return;
    if (media.duration !== duration) void notify(engagement, media, { duration }).catch(() => {});
    if (!media.playing) return;
    const timer = setTimeout(() => { void notify(engagement, media, { duration }).catch(() => {}); },
      Math.max(0, (Math.min(duration, end ?? Infinity) - mediaPosition(media, serverNow())) * 1000) + 80);
    return () => clearTimeout(timer);
  }, [active, media, duration, end, engagement, surface]);
  return <><div className="tv-linked-player" ref={host} />
    {(!ready || failed) && <p className="tv-video-loading">{failed ? "This video could not be loaded." : "Loading video"}</p>}
  </>;
}
