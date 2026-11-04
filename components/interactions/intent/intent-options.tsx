"use client";
import type { OptionsEditorProps } from "@/components/interactions/option-editors";

// Commander's intent in the run of show: who works each card. From the remote means the
// facilitator pairs people to cards; on phones means people pick a card themselves.
export function IntentOptionsEditor({ value, locked, onChange }: OptionsEditorProps) {
  const assign = value.assign === "phones" ? "phones" : "remote";
  return <fieldset className="is-full" disabled={locked}>
    <legend>Who picks the pairs</legend>
    <label className="show-radio"><input type="radio" name="intent-assign" checked={assign === "remote"} onChange={() => onChange({ assign: "remote" })} />From the remote</label>
    <label className="show-radio"><input type="radio" name="intent-assign" checked={assign === "phones"} onChange={() => onChange({ assign: "phones" })} />On phones</label>
    <span className="show-help">One card for each confirmed Vision Outcome. Up to 3 people work a card together.</span>
  </fieldset>;
}
