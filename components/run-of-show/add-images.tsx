"use client";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ArrowLeft, ArrowRight, Plus, Upload, X } from "lucide-react";
import { imageMaxAtOnce, imageProblem, type EngagementImage } from "@/lib/images/shared";
import { uploadImage } from "@/lib/images/upload";
import { endOfRun, partOf, sectionName, sectionsOf } from "@/lib/run-of-show/builder";
import type { Part, ShowSession } from "@/lib/run-of-show/types";
import { Select } from "@/components/ui/select";

type Item = { key: string; file: File; preview: string; state: "uploading" | "done" | "failed"; image?: EngagementImage; message?: string };
export type ImageTarget = { part: Part; section: string };

// Add images as slides (TC-2): choose several images exported from a deck, put them in order, pick the section, and each one
// becomes an Image step, in order. Uploads start as soon as images are chosen; titles are typed later in the run of show.
export function AddImages({ engagement, sessions, parts, onAdd, onClose }: { engagement: string; sessions: ShowSession[]; parts: readonly Part[];
  onAdd: (images: EngagementImage[], target: ImageTarget) => void; onClose: () => void }) {
  const [items, setItems] = useState<Item[]>([]), [note, setNote] = useState(""), [dragKey, setDragKey] = useState<string | null>(null);
  const targets = useMemo(() => parts.flatMap(part => {
    const group = partOf(sessions, part), names = [...new Set(sectionsOf(group).map(sec => sec.name))];
    return (names.length ? names : [""]).map(name => ({ part, section: name, label: `${part}: ${name || (group.length ? "no section" : "empty")}` }));
  }), [parts, sessions]);
  const [target, setTarget] = useState(() => {
    const end = endOfRun(sessions), group = partOf(sessions, end.part), last = group[group.length - 1];
    return `${end.part}::${last ? sectionName(last) : ""}`;
  });
  const dialog = useRef<HTMLDivElement>(null), file = useRef<HTMLInputElement>(null);
  useEffect(() => { dialog.current?.focus(); }, []);
  useEffect(() => () => items.forEach(item => URL.revokeObjectURL(item.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps
  function choose(list: FileList | File[] | null) {
    const files = [...(list ?? [])];
    if (!files.length) return;
    if (files.length > imageMaxAtOnce) setNote(`Up to ${imageMaxAtOnce} images at a time. The first ${imageMaxAtOnce} are added.`); else setNote("");
    const fresh: Item[] = files.slice(0, imageMaxAtOnce).map(f => ({ key: crypto.randomUUID(), file: f, preview: URL.createObjectURL(f), state: imageProblem(f) ? "failed" : "uploading", message: imageProblem(f) ?? undefined }));
    setItems(list => [...list, ...fresh]);
    // Three at a time, so ten large slides don't all compete for the connection.
    const queue = fresh.filter(item => item.state === "uploading");
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const key = item.key;
        try { const image = await uploadImage(engagement, item.file); setItems(list => list.map(x => x.key === key ? { ...x, state: "done", image } : x)); }
        catch (error) { setItems(list => list.map(x => x.key === key ? { ...x, state: "failed", message: error instanceof Error ? error.message : "That image didn’t upload." } : x)); }
      }
    };
    void Promise.all([worker(), worker(), worker()]);
    if (file.current) file.current.value = "";
  }
  const move = (key: string, by: number) => setItems(list => {
    const i = list.findIndex(x => x.key === key), j = i + by; if (i < 0 || j < 0 || j >= list.length) return list;
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });
  const drop = (over: string) => setItems(list => {
    if (!dragKey || dragKey === over) return list;
    const from = list.findIndex(x => x.key === dragKey), to = list.findIndex(x => x.key === over); if (from < 0 || to < 0) return list;
    const next = [...list]; const [it] = next.splice(from, 1); next.splice(to, 0, it); return next;
  });
  const remove = (key: string) => setItems(list => { const it = list.find(x => x.key === key); if (it) URL.revokeObjectURL(it.preview); return list.filter(x => x.key !== key); });
  const done = items.filter(x => x.state === "done"), uploading = items.filter(x => x.state === "uploading").length;
  const megabytes = (items.reduce((sum, x) => sum + x.file.size, 0) / 1048576).toFixed(1);
  const ready = done.length > 0 && uploading === 0;
  const [part, section] = target.split("::") as [Part, string];
  const onDropFiles = (e: DragEvent) => { if (e.dataTransfer.files.length) { e.preventDefault(); choose(e.dataTransfer.files); } };
  return <div className="rb-scrim" onMouseDown={e => { if (e.target === e.currentTarget && !uploading) onClose(); }}>
    <div ref={dialog} className="rb-modal add-images" role="dialog" aria-modal="true" aria-labelledby="add-images-title" tabIndex={-1} onKeyDown={e => { if (e.key === "Escape" && !uploading) onClose(); }}>
      <div className="rb-modal-head"><h2 id="add-images-title">Add images as slides</h2><button className="show-button is-icon" type="button" aria-label="Close" onClick={onClose} disabled={uploading > 0}><X size={20} aria-hidden="true" /></button></div>
      <div className="rb-modal-body">
        <div className="add-images-drop" onDragOver={e => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDrop={onDropFiles}>
          <div><b>Drop images here, or choose them</b><p className="show-help">PNG, JPG or WebP, up to 20 MB each and {imageMaxAtOnce} at a time. Export your slides at 1920 by 1080 so they fill the TV.</p></div>
          <label className="show-button" htmlFor="add-images-file"><Upload size={16} aria-hidden="true" />Choose images
            <input ref={file} id="add-images-file" className="sr-only" type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={e => choose(e.target.files)} /></label>
        </div>
        {note && <p className="show-help" role="status">{note}</p>}
        {items.length > 0 && <>
          <div className="add-images-bar"><b>{items.length} {items.length === 1 ? "image" : "images"}, in this order</b><span className="show-help">Drag to reorder. Each image becomes one Image step.</span></div>
          <ol className="add-images-grid">{items.map((item, i) => <li key={item.key} className={`add-images-item is-${item.state}${dragKey === item.key ? " is-drag" : ""}`} draggable
            onDragStart={e => { setDragKey(item.key); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragKey(null)} onDragOver={e => { if (dragKey) { e.preventDefault(); drop(item.key); } }}>
            <div className="add-images-item-head"><span className="add-images-num">{i + 1}</span><span className="add-images-name">{item.file.name}</span>
              <button type="button" className="show-button is-icon is-small" aria-label={`Move ${item.file.name} earlier`} disabled={i === 0} onClick={() => move(item.key, -1)}><ArrowLeft size={14} aria-hidden="true" /></button>
              <button type="button" className="show-button is-icon is-small" aria-label={`Move ${item.file.name} later`} disabled={i === items.length - 1} onClick={() => move(item.key, 1)}><ArrowRight size={14} aria-hidden="true" /></button>
              <button type="button" className="show-button is-icon is-small" aria-label={`Remove ${item.file.name}`} onClick={() => remove(item.key)}><X size={14} aria-hidden="true" /></button></div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="add-images-thumb"><img src={item.preview} alt="" /></div>
            <span className="show-help" role={item.state === "failed" ? "alert" : undefined}>{item.state === "uploading" ? "Uploading" : item.state === "failed" ? item.message : item.image?.width && item.image.height
              ? `${item.image.width} by ${item.image.height}${Math.abs(item.image.width / item.image.height - 16 / 9) > 0.02 ? ", letterboxed on the TV" : ""}` : "Ready"}</span>
          </li>)}</ol>
          <label className="add-images-target" htmlFor="add-images-section">Add them to<Select id="add-images-section" value={target} onChange={e => setTarget(e.target.value)}>
            {targets.map(t => <option key={`${t.part}::${t.section}`} value={`${t.part}::${t.section}`}>{t.label}</option>)}</Select>
            <span className="show-help">At the end of the section. You type each step&rsquo;s title in the run of show; until you do, they show as Image 1, Image 2 and so on.</span></label>
        </>}
      </div>
      <div className="rb-modal-foot"><span className="show-help" aria-live="polite">{items.length ? `${items.length} ${items.length === 1 ? "image" : "images"} · ${megabytes} MB${uploading ? ` · uploading ${items.length - uploading} of ${items.length} done` : ""}` : ""}</span>
        <button className="show-button" type="button" onClick={onClose} disabled={uploading > 0}>Cancel</button>
        <button className="show-button is-primary" type="button" disabled={!ready} onClick={() => onAdd(done.map(x => x.image!), { part, section })}><Plus size={16} aria-hidden="true" />{`Add ${done.length || ""} ${done.length === 1 ? "slide" : "slides"}`.replace("  ", " ")}</button></div>
    </div>
  </div>;
}
