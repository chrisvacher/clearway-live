"use client";
import Image from "next/image";
import { contentLabels, contentOf, contentScreens, type ContentScreen } from "@/lib/interactions/kinds";
import { mediaUrl } from "@/lib/interactions/media";
import type { OptionsEditorProps } from "@/components/interactions/option-editors";
import { StepImageField } from "./step-image";
import { LoopOptions } from "./loop-options";
import { stepImage } from "@/lib/images/shared";
import { Select } from "@/components/ui/select";

export function ContentOptions({ session, value, context, fresh, locked, onChange }: OptionsEditorProps) {
  const o = contentOf(value);
  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });
  const text = (key: "number" | "source" | "reference" | "translation" | "line", label: string, max: number, help?: string, placeholder?: string) =>
    <label className="is-full" htmlFor={`content-${key}`}>{label}<input id={`content-${key}`} maxLength={max} value={String(value[key] ?? "")} placeholder={placeholder} onChange={e => set({ [key]: e.target.value })} />{help && <span className="show-help">{help}</span>}</label>;
  return <>
    <label className="is-full" htmlFor="content-screen">Screen<Select id="content-screen" value={o.screen} onChange={e => onChange({ screen: e.target.value as ContentScreen, ...(value.media ? { media: value.media } : {}) })}>
      {contentScreens.map(screen => <option key={screen} value={screen}>{contentLabels[screen]}</option>)}</Select></label>
    {o.screen === "headline" && <>{text("number", "Big number (optional)", 12, "A number or short figure beside the headline, like 45%.")}{text("source", "Source", 200, "Shown small under the headline.", "Congregational survey · 87 answers")}</>}
    {o.screen === "scripture" && <>{text("reference", "Reference", 100, undefined, "Habakkuk 2:2")}{text("translation", "Translation", 100, "Defaults from the engagement.", context.scripture_translation || "NIV")}
      <label className="is-full" htmlFor="content-size">Text size<Select id="content-size" value={o.size ?? ""} onChange={e => set({ size: e.target.value === "body" ? "body" : undefined })}><option value="">Headline size</option><option value="body">Body size, beside the join link</option></Select></label></>}
    {o.screen === "holding" && <>{text("line", "Line under the welcome (optional)", 200, undefined, "Coffee is at the back. We start at 9:00.")}
      <label className="is-full" htmlFor="content-outline">The day’s outline (optional)<textarea id="content-outline" rows={5} maxLength={1000} value={String(value.outline ?? "")} onChange={e => set({ outline: e.target.value })} />
        <span className="show-help">One item per line, a time first if you like: 9:00 Welcome and prayer. Up to twelve lines; seven or more show in two columns. Shown in place of the line.</span></label></>}
    {o.screen === "loop" && <LoopOptions session={session} value={value} context={context} fresh={fresh} locked={locked} onChange={onChange} />}
    {o.screen === "image" && <>
      {o.media && !stepImage(value) && <div className="is-full show-media">
        <Image unoptimized src={mediaUrl(context.id, o.media, "control")} alt="The image on the TV" width={320} height={180} className="show-media-preview" />
        <span className="show-help">An image added before November 16. Choose a new one below to replace it.</span></div>}
      <StepImageField id="content" engagement={context.id} value={value} fillOnly canFill locked={locked} onChange={next => onChange({ ...next, ...(stepImage(next) ? { media: undefined } : {}) })} />
    </>}
  </>;
}
// The prompt's label for each content screen.
export const contentPromptLabel: Record<ContentScreen, string> = {
  headline: "Headline on the TV", scripture: "Passage", prayer: "Line on the screen (optional)", image: "Caption (for screen readers)", holding: "Welcome line (optional)", screen_check: "Note (not shown)", loop: "Note (not shown)",
};
