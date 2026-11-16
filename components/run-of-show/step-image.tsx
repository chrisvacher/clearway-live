"use client";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, ImageUp, Trash2 } from "lucide-react";
import { imageUrl, stepImage, type EngagementImage, type StepImage } from "@/lib/images/shared";
import { listImages, uploadImage } from "@/lib/images/upload";
import { Select } from "@/components/ui/select";

// One image on a step (TC-3), or the Image step's own image (TC-2). Fill takes the whole TV as a single slide and is offered on
// content screens; interaction steps show it In place beside the question, so the live results keep the screen.
export function StepImageField({ engagement, value, onChange, locked, fillOnly = false, canFill, id = "step-image" }: {
  engagement: string; value: Record<string, unknown>; onChange: (options: Record<string, unknown>) => void; locked: boolean; fillOnly?: boolean; canFill: boolean; id?: string;
}) {
  const image = stepImage(value);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [library, setLibrary] = useState<EngagementImage[] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const set = (next: StepImage | null) => { const { image: _old, ...rest } = value; void _old; onChange(next ? { ...rest, image: next } : rest); };
  useEffect(() => { if (library === null) void listImages(engagement).then(setLibrary); }, [engagement, library]);
  async function choose(f: File | undefined) {
    if (!f) return;
    setBusy(true); setMessage("Uploading the image...");
    try {
      const added = await uploadImage(engagement, f);
      set({ id: added.id, display: fillOnly ? "fill" : image?.display ?? (canFill ? "fill" : "place") });
      setLibrary(list => [added, ...(list ?? []).filter(i => i.id !== added.id)]);
      setMessage("Image added. Press Done to put it in the run of show.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "We couldn’t add that image."); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  }
  const others = (library ?? []).filter(i => i.id !== image?.id);
  return <div className="is-full show-media step-image" data-step-image={image ? image.display : "none"}>
    {image && <figure className="step-image-thumb">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl(engagement, image.id, "control")} alt="The image on this step" />
    </figure>}
    <div className="step-image-tools">
      <label className="show-button" htmlFor={`${id}-file`}>{image ? <ImageUp size={16} aria-hidden="true" /> : <ImagePlus size={16} aria-hidden="true" />}{image ? "Choose another image" : "Add an image"}
        <input ref={file} id={`${id}-file`} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || locked} onChange={e => void choose(e.target.files?.[0])} /></label>
      {others.length > 0 && <Select aria-label="Use an image already added" value="" disabled={busy || locked} onChange={e => { const pick = e.target.value; if (pick) set({ id: pick, display: fillOnly ? "fill" : image?.display ?? (canFill ? "fill" : "place") }); }}>
        <option value="">Use an image already added</option>{others.map(i => <option key={i.id} value={i.id}>{i.name || "Image"}{i.width && i.height ? ` (${i.width} by ${i.height})` : ""}</option>)}</Select>}
      {image && !fillOnly && <button className="show-button" type="button" disabled={busy || locked} onClick={() => set(null)}><Trash2 size={16} aria-hidden="true" />Remove image</button>}
    </div>
    {image && !fillOnly && <div className="step-image-display" role="radiogroup" aria-label="Display on the TV">
      <span className="show-help">Display on the TV</span>
      <div className="rb-mode">{(["fill", "place"] as const).map(d => <button key={d} type="button" role="radio" aria-checked={image.display === d} className={image.display === d ? "is-on" : ""}
        disabled={locked || busy || (d === "fill" && !canFill)} onClick={() => set({ id: image.id, display: d })}>{d === "fill" ? "Fill" : "In place"}</button>)}</div>
    </div>}
    <span className="show-help" role="status">{message || (fillOnly ? "A slide or picture, shown whole on the TV. PNG, JPG or WebP up to 20 MB. Export slides at 1920 by 1080 so they fill the screen."
      : canFill ? "Fill takes the whole TV as a single slide. In place shows it beside the headline. Images are never cropped."
      : "Interaction steps show the image in place, beside the question, so the live results keep the screen.")}</span>
  </div>;
}
