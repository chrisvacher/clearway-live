"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Home, ImagePlus, X } from "lucide-react";
import { imageMaxAtOnce, imageUrl, type EngagementImage } from "@/lib/images/shared";
import { listImages, uploadImage } from "@/lib/images/upload";
import { loopImagesMax, loopOf, loopSecondsDefault, loopSecondsMax, loopSecondsMin, loopTransitionLabels, loopTransitions } from "@/lib/images/loop";
import { chooseHome } from "@/lib/images/home";
import type { ShowContext, ShowSession } from "@/lib/run-of-show/types";
import { Select } from "@/components/ui/select";

// The image loop's settings in the run of show (LP-1): its images in order, the seconds each shows, the transition, and
// whether it is the engagement's Home screen.
export function LoopOptions({ session, value, context, fresh, locked, onChange }: {
  session: ShowSession; value: Record<string, unknown>; context: ShowContext; fresh: boolean; locked: boolean; onChange: (options: Record<string, unknown>) => void;
}) {
  const images = Array.isArray(value.images) ? value.images.filter((x): x is string => typeof x === "string") : [];
  const loop = loopOf(value), seconds = loop?.seconds ?? (Number.isInteger(value.seconds) ? Number(value.seconds) : loopSecondsDefault);
  const transition = loop?.transition ?? (loopTransitions.includes(value.transition as never) ? value.transition as typeof loopTransitions[number] : "fade");
  const set = (patch: Record<string, unknown>) => onChange({ ...value, screen: "loop", images, seconds, transition, ...patch });
  const [library, setLibrary] = useState<EngagementImage[] | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [home, setHome] = useState(context.home_session === session.id), [homeBusy, setHomeBusy] = useState(false), [homeNote, setHomeNote] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (library === null) void listImages(context.id).then(setLibrary); }, [context.id, library]);
  const names = new Map((library ?? []).map(i => [i.id, i]));
  async function add(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, Math.min(imageMaxAtOnce, loopImagesMax - images.length));
    if (!files.length) return;
    setBusy(true); setMessage(files.length === 1 ? "Uploading the image..." : `Uploading ${files.length} images...`);
    const added: string[] = [], failed: string[] = [];
    for (const f of files) {
      try { const image = await uploadImage(context.id, f); added.push(image.id); setLibrary(prev => [image, ...(prev ?? []).filter(i => i.id !== image.id)]); }
      catch (error) { failed.push(error instanceof Error ? `${f.name}: ${error.message}` : f.name); }
    }
    if (added.length) set({ images: [...images, ...added] });
    setMessage(failed.length ? `Not added: ${failed.join(" ")}` : `${added.length === 1 ? "Image" : `${added.length} images`} added. Press Done to put the loop in the run of show.`);
    setBusy(false); if (file.current) file.current.value = "";
  }
  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return;
    const next = [...images]; const [x] = next.splice(from, 1); next.splice(to, 0, x); set({ images: next });
  };
  async function toggleHome() {
    const want = !home;
    setHomeBusy(true); setHomeNote("");
    const result = await chooseHome(context.id, want ? session.id : null);
    setHomeBusy(false);
    if (result.ok) { setHome(want); context.home_session = want ? session.id : null; window.dispatchEvent(new CustomEvent("cwl:home", { detail: context.home_session })); setHomeNote(want ? "This loop is now the Home screen." : "Home is the usual holding screen again."); }
    else setHomeNote(result.message);
  }
  const unused = (library ?? []).filter(i => !images.includes(i.id));
  const turn = images.length * seconds;
  return <>
    <div className="is-full loop-images">
      <div className="loop-images-head"><b>Images in the loop</b><span className="show-help">{images.length ? `${images.length} of ${loopImagesMax}` : "None yet"}</span></div>
      {images.length > 0 && <ol className="loop-grid">{images.map((id, i) => {
        const info = names.get(id), name = info?.name || `Image ${i + 1}`;
        const shape = info?.width && info.height ? (Math.abs(info.width / info.height - 16 / 9) < 0.02 ? "16:9" : "Letterboxed") : "";
        return <li key={`${id}:${i}`} className={`loop-item${drag === i ? " is-drag" : ""}`} draggable={!locked}
          onDragStart={e => { setDrag(i); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDrag(null)}
          onDragOver={e => { if (drag !== null) e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (drag !== null) move(drag, i); setDrag(null); }}>
          <div className="add-images-item-head"><span className="add-images-num">{i + 1}</span><span className="add-images-name">{name}</span>
            <button type="button" className="show-button is-icon is-small" aria-label={`Move ${name} earlier`} disabled={locked || i === 0} onClick={() => move(i, i - 1)}><ArrowLeft size={14} aria-hidden="true" /></button>
            <button type="button" className="show-button is-icon is-small" aria-label={`Move ${name} later`} disabled={locked || i === images.length - 1} onClick={() => move(i, i + 1)}><ArrowRight size={14} aria-hidden="true" /></button>
            <button type="button" className="show-button is-icon is-small" aria-label={`Remove ${name}`} disabled={locked} onClick={() => set({ images: images.filter((_, k) => k !== i) })}><X size={14} aria-hidden="true" /></button></div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="add-images-thumb"><img src={imageUrl(context.id, id, "control")} alt="" /></div>
          {shape && <span className="show-help">{shape}</span>}
        </li>;
      })}</ol>}
      <div className="step-image-tools">
        <label className="show-button" htmlFor="loop-file"><ImagePlus size={16} aria-hidden="true" />Add images
          <input ref={file} id="loop-file" className="sr-only" type="file" multiple accept="image/png,image/jpeg,image/webp" disabled={busy || locked || images.length >= loopImagesMax} onChange={e => void add(e.target.files)} /></label>
        {unused.length > 0 && <Select aria-label="Use an image already added" value="" disabled={busy || locked || images.length >= loopImagesMax} onChange={e => { const pick = e.target.value; if (pick) set({ images: [...images, pick] }); }}>
          <option value="">Use an image already added</option>{unused.map(i => <option key={i.id} value={i.id}>{i.name || "Image"}{i.width && i.height ? ` (${i.width} by ${i.height})` : ""}</option>)}</Select>}
      </div>
      <span className="show-help" role="status">{message || "Drag to reorder. Each image shows whole, letterboxed on the TV ground if it isn’t 16:9. PNG, JPG or WebP up to 20 MB."}</span>
    </div>
    <label htmlFor="loop-seconds">Seconds per image<Select id="loop-seconds" value={String(seconds)} disabled={locked} onChange={e => set({ seconds: Number(e.target.value) })}>
      {Array.from({ length: loopSecondsMax - loopSecondsMin + 1 }, (_, k) => k + loopSecondsMin).map(n => <option key={n} value={n}>{n}</option>)}</Select>
      <span className="show-help">From {loopSecondsMin} to {loopSecondsMax} seconds.{images.length > 1 ? ` ${images.length} images, ${turn} seconds a turn.` : ""}</span></label>
    <div className="loop-transition" role="radiogroup" aria-label="Transition"><span className="show-label">Transition</span>
      <div className="rb-mode">{loopTransitions.map(t => <button key={t} type="button" role="radio" aria-checked={transition === t} className={transition === t ? "is-on" : ""} disabled={locked} onClick={() => set({ transition: t })}>{loopTransitionLabels[t]}</button>)}</div>
      <span className="show-help">With reduced motion on, slide and cross-fade become a cut.</span></div>
    <div className="is-full loop-home">
      <div><b><Home size={16} aria-hidden="true" />Use as the Home screen</b>
        <span className="show-help" role="status">{homeNote || (fresh ? "Press Done to add the loop first, then turn this on." : "The Home control under the Live screen shows this loop, and phones show it while Home is live.")}</span></div>
      <button type="button" className={`loop-switch${home ? " is-on" : ""}`} role="switch" aria-checked={home} aria-label="Use as the Home screen" disabled={fresh || homeBusy || context.closed} onClick={() => void toggleHome()} />
    </div>
  </>;
}
