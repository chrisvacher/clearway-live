"use client";
import type { OptionsEditorProps } from "@/components/interactions/option-editors";
import { AiCheck } from "@/components/interactions/ai/ai-options";

// D2-03's settings: the only one is whether AI places a correction that names no line. The items themselves are read when the step
// goes on air: the five signed-off lens summaries, then the reviewed outcomes from the latest overnight publication.
export function ReadBackOptions({ value, locked, onChange }: OptionsEditorProps) {
  return <AiCheck id="rbk-ai" field="ai" value={value} locked={locked} onChange={onChange} label="AI places a correction that names no line"
    help="The step reads each signed-off lens summary, then each reviewed outcome with its 3-year Vision bullets. A correction that names a line folds in without AI. One that names no line goes to AI, which changes or adds one line and keeps every other line word for word. Off, you name the line yourself." />;
}
