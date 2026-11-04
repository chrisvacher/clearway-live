"use client";
import { ArrowUp, Plus, Trash2 } from "lucide-react";
import type { OptionsEditorProps } from "@/components/interactions/option-editors";
import { formOf, gridColor, gridOf, gridPresets, maxGridItems, maxQuestions, newKey, premortemPrompt, type GridOptions } from "@/lib/interactions/grid-form-sign";
import "./grid-form-sign.css";

// A list of short lines the facilitator writes: items on a grid, questions on a form.
function Lines({ id, label, items, max, maxLength, numbered, add, help, locked, onChange }: { id: string; label: string; items: { key: string; text: string }[]; max: number; maxLength: number;
  numbered?: boolean; add: string; help: string; locked: boolean; onChange: (items: { key: string; text: string }[]) => void }) {
  const set = (i: number, text: string) => onChange(items.map((item, k) => k === i ? { ...item, text } : item));
  const up = (i: number) => { const next = [...items]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; onChange(next); };
  return <fieldset className="is-full gfs-lines" aria-describedby={`${id}-help`}>
    <legend>{label}</legend>
    <ol>{items.map((item, i) => <li key={item.key}>
      {numbered && <span className={`gfs-line-num ${gridColor(i + 1)}`} aria-hidden="true">{i + 1}</span>}
      <input id={`${id}-${i}`} aria-label={`${label} ${i + 1}`} maxLength={maxLength} value={item.text} disabled={locked} onChange={e => set(i, e.target.value)} />
      <button type="button" className="show-button is-icon" aria-label={`Move ${item.text || `${label} ${i + 1}`} up`} disabled={locked || i === 0} onClick={() => up(i)}><ArrowUp size={16} aria-hidden="true" /></button>
      <button type="button" className="show-button is-icon" aria-label={`Remove ${item.text || `${label} ${i + 1}`}`} disabled={locked} onClick={() => onChange(items.filter((_, k) => k !== i))}><Trash2 size={16} aria-hidden="true" /></button>
    </li>)}</ol>
    <button type="button" className="show-button" disabled={locked || items.length >= max} onClick={() => onChange([...items, { key: newKey(), text: "" }])}><Plus size={16} aria-hidden="true" />{add}</button>
    <span id={`${id}-help`} className="show-help">{items.length >= max ? `That’s the most: ${help}` : help}</span>
  </fieldset>;
}

// INT-08's settings: the two axes and their end labels, the items, and the pre-mortem preset.
export function GridOptionsEditor({ value, locked, onChange, setPrompt }: OptionsEditorProps) {
  const o = gridOf(value);
  const set = (patch: Partial<GridOptions>) => onChange({ ...value, items: o.items, ...patch });
  const raw = (key: keyof GridOptions) => value[key] === undefined ? String(o[key]) : String(value[key] ?? "");
  const field = (key: keyof Omit<GridOptions, "preset" | "items">, label: string, max: number, full = false) =>
    <label className={full ? "is-full" : ""} htmlFor={`grid-${key}`}>{label}<input id={`grid-${key}`} maxLength={max} value={raw(key)} disabled={locked} onChange={e => set({ [key]: e.target.value })} /></label>;
  return <>
    <label className="is-full" htmlFor="grid-preset">Axes<select id="grid-preset" value={o.preset} disabled={locked} onChange={e => { const preset = e.target.value as GridOptions["preset"]; set({ preset, ...gridPresets[preset] }); if (preset === "pre_mortem") setPrompt?.(premortemPrompt); }}>
      <option value="custom">Your own axes</option><option value="pre_mortem">Pre-mortem: likelihood and impact</option></select></label>
    {field("x_label", "Across (x axis)", 40)}{field("y_label", "Up (y axis)", 40)}
    {field("x_low", "Left end", 30)}{field("x_high", "Right end", 30)}
    {field("y_low", "Bottom end", 30)}{field("y_high", "Top end", 30)}
    {field("legend", "Legend title", 40, true)}
    <Lines id="grid-item" label="Item" items={o.items} max={maxGridItems} maxLength={120} numbered add="Add an item" locked={locked}
      help="A grid holds ten items at most, so every item keeps its own color." onChange={items => set({ items })} />
  </>;
}

// INT-09's settings: up to eight questions, answered in words.
export function FormOptionsEditor({ value, locked, onChange }: OptionsEditorProps) {
  return <Lines id="form-question" label="Question" items={formOf(value)} max={maxQuestions} maxLength={300} add="Add a question" locked={locked}
    help="Up to eight. Answers go only to the facilitators, never to the screen." onChange={questions => onChange({ questions })} />;
}

// INT-10's settings: the full text people read before they sign.
export function SignOptionsEditor({ value, locked, onChange }: OptionsEditorProps) {
  return <label className="is-full" htmlFor="sign-text">The text to sign<textarea id="sign-text" rows={8} maxLength={20000} value={String(value.text ?? "")} disabled={locked}
    onChange={e => onChange({ text: e.target.value })} /><span className="show-help">The prompt is its title on the TV. Start a line with ## and a title to make a section people can open on their phones.</span></label>;
}
