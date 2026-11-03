"use client";
import type { OptionsEditorProps } from "@/components/interactions/option-editors";
import { AiCheck } from "@/components/interactions/ai/ai-options";

// INT-03's one setting. With it on, every session's phone screen carries an Ask button and
// the questions go to this step: one list for the whole engagement.
export function QaOptions({ value, locked, onChange }: OptionsEditorProps) {
  return <><label className="show-check is-full" htmlFor="qa-any-time">
    <input id="qa-any-time" type="checkbox" disabled={locked} checked={value.any_time === true} onChange={e => onChange({ ...value, any_time: e.target.checked })} />
    Take questions any time
    <span className="show-help">Adds an Ask button to every session’s phone screen. The questions wait in this step, one list for the whole engagement. If more than one Q&amp;A step has this on, the first in the run of show takes them.</span>
  </label>
  <AiCheck id="qa-ai" field="ai" value={value} locked={locked} onChange={onChange} label="AI folds near-duplicate questions"
    help="After matching words, AI folds questions that ask the same thing, marked as AI. Every fold can be undone." /></>;
}
