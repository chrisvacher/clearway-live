"use client";
import type { OptionsEditorProps } from "@/components/interactions/option-editors";
import { AiCheck } from "@/components/interactions/ai/ai-options";

// INT-11's settings. The four lists are fixed (What's right?, What's wrong?, What's missing?, What's confused?), so the only choice
// is AI grouping: similar cards inside one list gather into a single card with a count, marked as AI. It never sits between a
// phone and the TV, and Undo, Pin and off are on the control surface.
export function FourListsOptions({ value, locked, onChange }: OptionsEditorProps) {
  return <AiCheck id="ai-four-lists" field="ai" value={value} locked={locked} onChange={onChange} label="AI grouping"
    help="Gathers similar cards inside one list under the first card, marked as AI. Undo, pin and off from the control surface. Off, every card stands on its own." />;
}
