"use client";
import type { OptionsEditorProps } from "@/components/interactions/option-editors";
import { AiCheck } from "@/components/interactions/ai/ai-options";
import { defaultLensNames, lensName, lensNumbers } from "@/lib/wayfinding/lens";

// INT-18's settings: which lens the step opens on (the facilitator moves through the five from the control
// surface) and whether AI drafts and folds. Lens names come from the engagement.
export function LensSummaryOptions({ value, context, locked, onChange }: OptionsEditorProps) {
  const names = context.lens_names ?? [...defaultLensNames], lens = typeof value.lens === "number" ? value.lens : 1;
  return <>
    <label className="is-full" htmlFor="lsm-lens">Opens on<select id="lsm-lens" value={lens} disabled={locked} onChange={e => onChange({ ...value, lens: Number(e.target.value) })}>
      {lensNumbers.map(n => <option key={n} value={n}>{lensName(n, names)}</option>)}
    </select>
    <span className="show-help">Move through the five lenses from the control surface. Each lens’s summary is drafted from its sentences and goes straight to the TV.</span></label>
    <AiCheck id="lsm-ai" field="ai" value={value} locked={locked} onChange={onChange} label="AI drafts and folds in suggestions"
      help="AI drafts each lens’s 10-year Future summary in the present tense, then folds the room’s suggestions into a new version after a quiet moment. Marked as AI. Fold in now, Hold and Undo are on the control surface. Off, you write the summary." />
  </>;
}
