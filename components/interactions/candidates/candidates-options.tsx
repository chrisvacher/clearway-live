"use client";
import type { OptionsEditorProps } from "@/components/interactions/option-editors";

// INT-13's settings: whether AI may draft the candidates, and where the cut line starts. The facilitator
// can move the cut line between four and six while the points are open.
export function CandidatesOptions({ value, locked, onChange }: OptionsEditorProps) {
  const cut = value.cut === 4 || value.cut === 6 ? Number(value.cut) : 5;
  return <>
    <label className="is-full" htmlFor="candidates-ai">AI drafting
      <select id="candidates-ai" value={value.ai === false ? "off" : "on"} disabled={locked} onChange={e => onChange({ ...value, ai: e.target.value !== "off" })}>
        <option value="on">Offer Draft candidates with AI</option>
        <option value="off">Write the candidates by hand</option>
      </select>
      <span className="show-help">AI reads the lens wall and proposes six to ten candidates. Only you see them until you send them to the screen.</span></label>
    <label className="is-full" htmlFor="candidates-cut">Cut line starts at
      <select id="candidates-cut" value={cut} disabled={locked} onChange={e => onChange({ ...value, cut: Number(e.target.value) })}>
        <option value={4}>4</option><option value={5}>5</option><option value={6}>6</option>
      </select>
      <span className="show-help">The counts show where the room is. You mark the provisional Vision Outcomes.</span></label>
  </>;
}
