"use client";
import { useEffect, useState } from "react";
import type { OptionsEditorProps } from "@/components/interactions/option-editors";
import type { ShowSession } from "@/lib/run-of-show/types";
import { parts } from "@/lib/run-of-show/types";
import { beforeAfterOptions } from "@/lib/interactions/before-after";
import "./before-after.css";
export function BeforeAfterOptions({ value, session, context, locked, onChange }: OptionsEditorProps) {
  const o = beforeAfterOptions(value), [steps, setSteps] = useState<ShowSession[]>([]);
  useEffect(() => { let active = true; void fetch(`/api/run-of-show/${context.id}`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => { if (active && data?.sessions) setSteps(data.sessions); }).catch(() => {}); return () => { active = false; }; }, [context.id]);
  const earlier = steps.filter(s => s.interaction === "scale" && (parts.indexOf(s.part) < parts.indexOf(session.part) || (s.part === session.part && s.position < session.position)));
  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });
  const picked = earlier.find(s => s.id === o.before_session);
  return <>
    <fieldset className="ba-mode is-full" disabled={locked}>
      <legend>How people answer</legend>
      {([
        ["paired", "Ask both on one screen (recommended)", "At the end, each phone shows two sliders: Before today and After today. Each person compares themselves, not the room."],
        ["steps", "Read two scale steps", "Picks two earlier scale steps with the same range."],
      ] as const).map(([mode, label, help]) => <label key={mode}>
        <input type="radio" name="ba-mode" checked={o.mode === mode} onChange={() => set({ mode })} />
        <span>{label}<small>{help}</small></span>
      </label>)}
    </fieldset>
    {o.mode === "paired" ? <>
      <label className="is-full" htmlFor="ba-question">Question<input id="ba-question" maxLength={4000} value={o.question ?? ""} disabled={locked} onChange={e => set({ question: e.target.value })} /></label>
      <label htmlFor="ba-range">Scale<select id="ba-range" value={o.max} disabled={locked} onChange={e => set({ max: Number(e.target.value) })}>{[5, 7, 10].map(n => <option key={n} value={n}>1 to {n}</option>)}</select></label>
      <label htmlFor="ba-low">Low end<input id="ba-low" maxLength={100} value={o.low} disabled={locked} onChange={e => set({ low: e.target.value })} /></label>
      <label htmlFor="ba-high">High end<input id="ba-high" maxLength={100} value={o.high} disabled={locked} onChange={e => set({ high: e.target.value })} /></label>
    </> : (["before", "after"] as const).map(field => <label key={field} htmlFor={`ba-source-${field}`}>{field === "before" ? "Before step" : "After step"}<select id={`ba-source-${field}`} disabled={locked} value={o[`${field}_session`] ?? ""} onChange={e => { const s = earlier.find(s => s.id === e.target.value); set({ [`${field}_session`]: e.target.value, ...(s ? { max: s.options.max, low: s.options.low, high: s.options.high } : {}) }); }}><option value="">Choose a scale step</option>{earlier.filter(s => field === "before" || !picked || s.options.max === picked.options.max).map(s => <option key={s.id} value={s.id}>{s.title} · 1 to {String(s.options.max)}</option>)}</select></label>)}
    <label htmlFor="ba-before-label">Before label<input id="ba-before-label" maxLength={60} disabled={locked} value={o.before_label} onChange={e => set({ before_label: e.target.value })} /></label>
    <label htmlFor="ba-after-label">After label<input id="ba-after-label" maxLength={60} disabled={locked} value={o.after_label} onChange={e => set({ after_label: e.target.value })} /></label>
    <label className="ba-change-option is-full">Show the change as a number<input type="checkbox" role="switch" checked={o.show_change} disabled={locked} onChange={e => set({ show_change: e.target.checked })} /></label>
    <p className="show-help is-full">Either way, the TV shows both sets of answers above one line, with both averages and the change. It never shows how any one person moved.</p>
  </>;
}
