"use client";
import type { OptionsEditorProps } from "@/components/interactions/option-editors";

// The run of show's AI settings (SET-07). On by default; the engagement's own AI switch
// (setup) comes first, and the control surface can switch a session off or on live.
export function AiCheck({ id, value, locked, onChange, field, label, help }: Pick<OptionsEditorProps, "value" | "locked" | "onChange"> & { id: string; field: string; label: string; help: string }) {
  return <label className="show-check is-full" htmlFor={id}>
    <input id={id} type="checkbox" disabled={locked} checked={value[field] !== false} onChange={e => onChange({ ...value, [field]: e.target.checked })} />
    {label}
    <span className="show-help">{help}</span>
  </label>;
}
export function WordCloudOptions({ value, locked, onChange }: OptionsEditorProps) {
  return <AiCheck id="ai-combine" field="ai" value={value} locked={locked} onChange={onChange} label="AI combines near-duplicates"
    help="Once there are about 30 different answers, AI combines words that mean the same, marked as AI. Undo any combine from the control surface." />;
}
export function WallOptions({ value, locked, onChange }: OptionsEditorProps) {
  return <>
    <AiCheck id="ai-grouping" field="ai" value={value} locked={locked} onChange={onChange} label="AI grouping"
      help="Groups drift together under short labels, marked as AI. Undo, pin, rename and off from the control surface. Off, the wall shows answers in arrival order." />
    <AiCheck id="ai-summary" field="summary" value={value} locked={locked} onChange={onChange} label="AI summary available"
      help="Shown on the TV only after you tap Show summary." />
  </>;
}
