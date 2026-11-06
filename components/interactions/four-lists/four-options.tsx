"use client";
import type { OptionsEditorProps } from "@/components/interactions/option-editors";
import { AiCheck } from "@/components/interactions/ai/ai-options";

// INT-11's one setting. With it on, AI folds near-duplicate cards inside one list, marked as AI. Every fold can be undone, and a
// card can be pinned so it never folds. Off, only cards with the same words combine.
export function FourListsOptions({ value, locked, onChange }: OptionsEditorProps) {
  return <AiCheck id="fl-ai" field="ai" value={value} locked={locked} onChange={onChange} label="AI folds similar cards"
    help="Inside one list, AI folds cards that say the same thing in different words, marked as AI with a count. It never folds across lists. Undo any fold, pin a card, or turn AI off from the control surface." />;
}
