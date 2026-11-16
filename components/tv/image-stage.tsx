"use client";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { LiveSnapshot } from "@/lib/live/types";
import { contentOf } from "@/lib/interactions/kinds";
import { imageUrl, stepImage } from "@/lib/images/shared";
import { loopOf, loopIndex, type LoopTransition } from "@/lib/images/loop";
import { serverNow } from "@/lib/live/protocol";
import { tokenMs } from "@/lib/tv/board";
import { MediaSurface } from "./content-screen";
import "./images.css";

// What fills the whole TV: an image step (or any content screen) set to Fill, a running image loop, or the Home screen
// when the engagement's Home is a loop. Null when the TV shows its usual scenes.
export type ImageShow = { key: string; images: string[]; seconds: number; transition: LoopTransition; startedAt: string | null };
export function imageShowFor(frame: LiveSnapshot | null): ImageShow | null {
  if (!frame) return null;
  const mode = frame.state.tv_content, session = frame.session;
  if (mode === "session" && session?.interaction === "content") {
    const o = contentOf(session.options);
    if (o.screen === "loop") {
      const loop = loopOf(session.options);
      return loop ? { key: session.id, ...loop, startedAt: frame.state.screen_started_at ?? null } : null;
    }
    const image = stepImage(session.options);
    if (image?.display === "fill") return { key: session.id, images: [image.id], seconds: 0, transition: "fade", startedAt: null };
  }
  if (mode === "holding" && frame.state.home && frame.state.home.images.length) {
    const home = frame.state.home;
    return { key: `home:${home.session}`, images: home.images, seconds: home.seconds, transition: home.transition, startedAt: frame.state.screen_started_at ?? null };
  }
  return null;
}

type Layer = { key: string; id: string; leaving: boolean; entering: boolean; how: LoopTransition };

// The image stage covers the TV, header and footer included, on the skin's TV ground. Images are shown whole, never cropped:
// anything that isn't 16:9 is letterboxed on the ground. A change of image moves with the loop's transition (a cross-fade
// between steps), and the old image holds until the new one covers it, so the screen is never blank. Reduced motion cuts.
export function TvImageStage({ frame, reduced: chosen }: { frame: LiveSnapshot | null; reduced: boolean }) {
  const surface = useContext(MediaSurface);
  const [prefers, setPrefers] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)"), update = () => setPrefers(query.matches);
    update(); query.addEventListener("change", update); return () => query.removeEventListener("change", update);
  }, []);
  const reduced = chosen || prefers;
  const show = imageShowFor(frame);
  const engagement = frame?.state.engagement_id ?? "";
  // The loop's place comes from the room's clock and the moment the screen went up, so every surface shows the same image.
  const [now, setNow] = useState(() => serverNow());
  const index = show ? loopIndex(show, now) : 0;
  useEffect(() => {
    if (!show || show.images.length < 2 || !show.seconds) return;
    const period = show.seconds * 1000, started = show.startedAt ? Date.parse(show.startedAt) : now;
    const wait = period - ((serverNow() - started) % period + period) % period;
    const timer = setTimeout(() => setNow(serverNow()), Math.max(50, wait + 20));
    return () => clearTimeout(timer);
  }, [show?.key, show?.images.length, show?.seconds, show?.startedAt, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = show ? { key: `${show.key}:${index}:${show.images[index]}`, id: show.images[index] } : null;
  const how: LoopTransition = reduced ? "cut" : show && show.images.length > 1 ? show.transition : "fade";
  const [layers, setLayers] = useState<Layer[]>(() => current ? [{ ...current, leaving: false, entering: false, how }] : []);
  const box = useRef<HTMLDivElement>(null);
  if (current && !layers.some(layer => layer.key === current.key && !layer.leaving)) {
    // Within one loop the old image leaves the way the new one arrives; between steps it simply holds under the cross-fade.
    setLayers([...layers.filter(layer => layer.key !== current.key && !layer.leaving).map(layer => ({ ...layer, leaving: true, how })),
      { ...current, leaving: false, entering: layers.length > 0 && how !== "cut", how }]);
  } else if (!current && layers.some(layer => !layer.leaving)) {
    setLayers(layers.map(layer => ({ ...layer, leaving: true })));
  }
  useEffect(() => {
    if (!layers.some(layer => layer.leaving || layer.entering)) return;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setLayers(list => list.map(layer => layer.entering ? { ...layer, entering: false } : layer))));
    const el = box.current, slow = layers.some(layer => layer.how === "fade" && show && show.images.length > 1);
    const wait = (el ? tokenMs(el, slow ? "cwl-dur-regroup" : "cwl-dur-make-room") : 1200) + 80;
    const timer = setTimeout(() => setLayers(list => {
      const kept = list.filter(layer => !layer.leaving);
      // Once the stage has faded out entirely, the last image goes with it.
      return kept.length || !list.length ? kept : [];
    }), current ? wait : wait + 50);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [layers]); // eslint-disable-line react-hooks/exhaustive-deps
  // Every image in the loop, and the images the next steps will need, are loaded before they're shown.
  const preload = useMemo(() => [...new Set([...(show?.images ?? []), ...(frame?.state.preload ?? [])])], [show?.images, frame?.state.preload]);
  return <div ref={box} className={`tv-imgstage${show ? " is-active" : ""}${show && show.images.length > 1 && how === "fade" ? " is-loop-fade" : ""}`} aria-hidden={!show} data-image-stage={show ? "on" : "off"} data-image-index={show ? index : undefined}>
    {layers.map(layer => <div key={layer.key} className={`tv-img-layer is-${layer.how}${layer.leaving ? " is-leaving" : ""}${layer.entering ? " is-entering" : ""}`} data-image={layer.id}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl(engagement, layer.id, surface)} alt="" decoding="async" draggable={false} />
    </div>)}
    {engagement && <div className="tv-img-preload" aria-hidden="true">{preload.map(id =>
      // eslint-disable-next-line @next/next/no-img-element
      <img key={id} src={imageUrl(engagement, id, surface)} alt="" loading="eager" decoding="async" />)}</div>}
  </div>;
}
