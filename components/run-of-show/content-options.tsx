"use client";
import { useState } from "react";
import Image from "next/image";
import { ImageUp } from "lucide-react";
import { contentLabels, contentOf, contentScreens, type ContentScreen } from "@/lib/interactions/kinds";
import { fitSize, maxMediaBytes, mediaUrl } from "@/lib/interactions/media";
import type { OptionsEditorProps } from "@/components/interactions/option-editors";

// Fit the image to the TV in the browser, then send it once. A page keeps PNG (sharp
// type); a photo becomes JPEG. Either way it stays under the database's 4 MB limit.
async function prepare(file: File) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height); bitmap.close();
  const encode = (type: string, quality?: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("encode")), type, quality));
  let blob = await encode(file.type === "image/png" ? "image/png" : "image/jpeg", 0.88);
  if (blob.size > maxMediaBytes) blob = await encode("image/jpeg", 0.8);
  if (blob.size > maxMediaBytes) throw new Error("That image is too large. Try a smaller one.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { mime: blob.type, width, height, data: btoa(binary) };
}

export function ContentOptions({ session, value, context, fresh, locked, onChange }: OptionsEditorProps) {
  const o = contentOf(value);
  const [upload, setUpload] = useState<{ busy: boolean; message: string }>({ busy: false, message: "" });
  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });
  const text = (key: "number" | "source" | "reference" | "translation" | "line", label: string, max: number, help?: string, placeholder?: string) =>
    <label className="is-full" htmlFor={`content-${key}`}>{label}<input id={`content-${key}`} maxLength={max} value={String(value[key] ?? "")} placeholder={placeholder} onChange={e => set({ [key]: e.target.value })} />{help && <span className="show-help">{help}</span>}</label>;
  async function choose(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setUpload({ busy: false, message: "Choose a PNG, JPEG or WebP image. Export a document page as an image first." }); return; }
    setUpload({ busy: true, message: "Adding the image..." });
    try {
      const body = await prepare(file);
      const response = await fetch(`/api/run-of-show/${context.id}/media`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session: session.id, ...body }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status !== "ok") throw new Error(data.message || "We couldn’t add that image. Please try again.");
      set({ media: data.id }); setUpload({ busy: false, message: "Image added. Save to put it in the run of show." });
    } catch (error) { setUpload({ busy: false, message: error instanceof Error ? error.message : "We couldn’t add that image." }); }
  }
  return <>
    <label className="is-full" htmlFor="content-screen">Screen<select id="content-screen" value={o.screen} onChange={e => onChange({ screen: e.target.value as ContentScreen, ...(value.media ? { media: value.media } : {}) })}>
      {contentScreens.map(screen => <option key={screen} value={screen}>{contentLabels[screen]}</option>)}</select></label>
    {o.screen === "headline" && <>{text("number", "Big number (optional)", 12, "A number or short figure beside the headline, like 45%.")}{text("source", "Source", 200, "Shown small under the headline.", "Congregational survey · 87 answers")}</>}
    {o.screen === "scripture" && <>{text("reference", "Reference", 100, undefined, "Habakkuk 2:2")}{text("translation", "Translation", 100, "Defaults from the engagement.", context.scripture_translation || "NIV")}
      <label className="is-full" htmlFor="content-size">Text size<select id="content-size" value={o.size ?? ""} onChange={e => set({ size: e.target.value === "body" ? "body" : undefined })}><option value="">Headline size</option><option value="body">Body size, beside the join link</option></select></label></>}
    {o.screen === "holding" && <>{text("line", "Line under the welcome (optional)", 200, undefined, "Coffee is at the back. We start at 9:00.")}
      <label className="is-full" htmlFor="content-outline">The day’s outline (optional)<textarea id="content-outline" rows={5} maxLength={1000} value={String(value.outline ?? "")} onChange={e => set({ outline: e.target.value })} />
        <span className="show-help">One item per line, a time first if you like: 9:00 Welcome and prayer. Up to twelve lines; seven or more show in two columns. Shown in place of the line.</span></label></>}
    {o.screen === "image" && <div className="is-full show-media">
      {o.media && <Image unoptimized src={mediaUrl(context.id, o.media, "control")} alt="The image on the TV" width={320} height={180} className="show-media-preview" />}
      {fresh ? <p className="show-help">Save the session once, then add its image.</p>
        : <label className="show-button" htmlFor="content-file"><ImageUp size={16} aria-hidden="true" />{o.media ? "Choose another image" : "Choose an image"}
          <input id="content-file" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={upload.busy || locked} onChange={e => choose(e.target.files?.[0])} /></label>}
      <span className="show-help" role="status">{upload.message || "A photo, slide or document page, shown at its own shape. PNG, JPEG or WebP."}</span>
    </div>}
  </>;
}
// The prompt's label for each content screen.
export const contentPromptLabel: Record<ContentScreen, string> = {
  headline: "Headline on the TV", scripture: "Passage", prayer: "Line on the screen (optional)", image: "Caption (for screen readers)", holding: "Welcome line (optional)", screen_check: "Note (not shown)",
};
