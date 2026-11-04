"use client";
import type { OptionsEditorProps } from "@/components/interactions/option-editors";

// INT-15's one setting: whether each goal must answer a risk now. The two-day template links
// goals to risks here; the day-and-a-half template links them after the follow-up session.
export function GoalsOptions({ value, locked, onChange }: OptionsEditorProps) {
  const links = value.risk_links === "later" ? "later" : "required";
  return <label className="is-full" htmlFor="goals-risk-links">Risk links
    <select id="goals-risk-links" value={links} disabled={locked} onChange={e => onChange({ ...value, risk_links: e.target.value })}>
      <option value="required">Each goal answers at least one risk now</option>
      <option value="later">Link risks after the follow-up session</option>
    </select>
    <span className="show-help">The goal builder shows one Vision Outcome at a time. The facilitator moves between outcomes from the control surface.</span></label>;
}
