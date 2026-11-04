"use client";
import type { OptionsEditorProps } from "@/components/interactions/option-editors";
import { AiCheck } from "@/components/interactions/ai/ai-options";
import { defaultLensNames, lensName, lensNumbers, type LensNumber } from "@/lib/wayfinding/lens";
import { lensOptions } from "@/lib/interactions/lens";

// INT-12's settings: the pre-call seeding step (self-paced, all five lenses, with the recording link for
// someone who missed the call) or one lens's wall. Lens names come from the engagement.
export function LensOptions({ value, context, locked, onChange }: OptionsEditorProps) {
  const o = lensOptions(value), names = context.lens_names ?? [...defaultLensNames];
  const mode = o.seed ? "seed" : String(o.lens ?? 1);
  const pick = (next: string) => {
    const ai = value.ai === undefined ? {} : { ai: value.ai };
    onChange(next === "seed" ? { seed: true, ...(o.recording ? { recording: o.recording } : {}) } : { lens: Number(next) as LensNumber, ...ai });
  };
  return <>
    <label className="is-full" htmlFor="lens-mode">Used for<select id="lens-mode" value={mode} disabled={locked} onChange={e => pick(e.target.value)}>
      <option value="seed">Pre-call seeding, all five lenses</option>
      {lensNumbers.map(n => <option key={n} value={n}>{`Lens wall: ${lensName(n, names)}`}</option>)}
    </select></label>
    {o.seed ? <>
      <label className="is-full" htmlFor="lens-recording">Recording link for someone who missed the call
        <input id="lens-recording" type="url" inputMode="url" maxLength={300} placeholder="https://" disabled={locked} value={o.recording}
          onChange={e => { const { recording: _drop, ...rest } = value; void _drop; onChange(e.target.value.trim() ? { ...rest, recording: e.target.value.trim() } : rest); }} />
        <span className="show-help">Shows at the top of the phone’s seeding screen. It starts with https://.</span></label>
      <span className="show-help is-full">Make this step self-paced, opening at the pre-call and closing when Day 1 starts. Sentences stay hidden from everyone, you included, until each lens opens. You see how many have been written.</span>
    </> : <AiCheck id="lens-ai" field="ai" value={value} locked={locked} onChange={onChange} label="AI clusters the sentences"
      help="Similar sentences lean together into clusters under short labels, marked as AI. Rename, pin, undo and off from the control surface. Off, the wall shows sentences in arrival order." />}
  </>;
}
