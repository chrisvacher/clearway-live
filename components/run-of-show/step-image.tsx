"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, ImageUp, Trash2 } from "lucide-react";
import { imageUrl, stepImage, type EngagementImage, type StepImage } from "@/lib/images/shared";
import { listImages, uploadImage } from "@/lib/images/upload";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

// One image on a step (TC-3), or the Image step's own image (TC-2). Fill takes the whole TV as a single slide and is offered on
// content screens; interaction steps show it In place beside the question, so the live results keep the screen.
export function StepImageField({ engagement, value, onChange, locked, fillOnly = false, canFill, id = "step-image" }: {
  engagement: string; value: Record<string, unknown>; onChange: (options: Record<string, unknown>) => void; locked: boolean; fillOnly?: boolean; canFill: boolean; id?: string;
}) {
  const image = stepImage(value);
  const [picker, setPicker] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [library, setLibrary] = useState<EngagementImage[] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const set = (next: StepImage | null) => { const { image: _old, ...rest } = value; void _old; onChange(next ? { ...rest, image: next } : rest); };
  useEffect(() => {
    if (!picker || library !== null) return;
    let current = true;
    void listImages(engagement).then(items => { if (current) setLibrary(items); }).catch(() => {
      if (current) { setLibrary([]); setMessage("Couldn't load existing images."); }
    });
    return () => { current = false; };
  }, [engagement, library, picker]);
  async function choose(f: File | undefined) {
    if (!f) return;
    setBusy(true); setMessage("Uploading the image...");
    try {
      const added = await uploadImage(engagement, f);
      set({ id: added.id, display: fillOnly ? "fill" : image?.display ?? (canFill ? "fill" : "place") });
      setLibrary(list => [added, ...(list ?? []).filter(i => i.id !== added.id)]);
      setMessage("Image added.");
      setPicker(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "We couldn’t add that image."); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  }
  const others = (library ?? []).filter(i => i.id !== image?.id);
  return <div className="is-full show-media step-image" data-step-image={image ? image.display : "none"}>
    <div className="step-image-strip">
      {image && <button type="button" className="step-image-thumb step-image-chosen" aria-label="Choose another image" aria-haspopup="dialog"
        onClick={() => setPicker(true)} disabled={locked || busy}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl(engagement, image.id, "control")} alt="" />
      </button>}
      <button type="button" className="step-image-add" aria-label="Add an image" aria-haspopup="dialog" disabled={locked || busy} onClick={() => setPicker(true)}><Plus size={16} aria-hidden="true" /></button>
      {image && !fillOnly && <Button size="small" variant="quiet" disabled={busy || locked} onClick={() => set(null)}><Trash2 />Remove image</Button>}
    </div>
    <Dialog open={picker} onClose={() => setPicker(false)} label="Choose an image" className="rb-image-picker">
      <h2>Choose an image</h2>
      <label className="show-button" htmlFor={`${id}-file`}><ImageUp size={16} aria-hidden="true" />Upload an image
        <input ref={file} id={`${id}-file`} type="file" className="sr-only" accept="image/png,image/jpeg,image/webp"
          disabled={busy || locked} onChange={event => void choose(event.target.files?.[0])} />
      </label>
      {library === null && <p role="status">Loading images…</p>}
      {others.length > 0 && <div className="rb-image-library" aria-label="Images already added">
        {others.map(item => <button type="button" key={item.id} disabled={busy || locked} onClick={() => {
          set({ id: item.id, display: fillOnly ? "fill" : image?.display ?? (canFill ? "fill" : "place") });
          setPicker(false);
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl(engagement, item.id, "control")} alt="" />
          <span>{item.name || "Image"}</span>
        </button>)}
      </div>}
      <Button onClick={() => setPicker(false)}>Cancel</Button>
    </Dialog>
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
