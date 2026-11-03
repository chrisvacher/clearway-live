"use client";
import { ArrowUp, Plus, X } from "lucide-react";
import "./bars.css";
import type { OptionsEditorProps } from "@/components/interactions/option-editors";
import { newKey, optionItems, type OptionItem } from "@/lib/interactions/bars";

// The run of show's options for the bar family. Each writes session.options only; the
// database's options_<kind> trims, checks and keeps each option's key on Save, so answers
// and Spotlight keep pointing at the same option when its words are edited.
function OptionList({ id, title, noun, items, min, max, length, locked, onChange }: { id: string; title: string; noun: string; items: OptionItem[]; min: number; max: number; length: number; locked: boolean; onChange: (items: OptionItem[]) => void }) {
  const set = (i: number, patch: Partial<OptionItem>) => onChange(items.map((item, j) => j === i ? { ...item, ...patch } : item));
  const up = (i: number) => { const next = items.slice(); [next[i - 1], next[i]] = [next[i], next[i - 1]]; onChange(next); };
  const empty = items.some(item => !item.text.trim());
  return <div className="is-full bars-options" role="group" aria-labelledby={`${id}-title`}>
    <div className="bars-options-head"><span id={`${id}-title`}>{title}</span><span className="show-help">{items.length} of {max}</span></div>
    <ol className="bars-option-list">{items.map((item, i) => <li key={item.key} className="bars-option">
      <span aria-hidden="true">{i + 1}</span>
      <input id={`${id}-${i}`} aria-label={`${noun} ${i + 1}`} maxLength={length} value={item.text} placeholder={`${noun} ${i + 1}`} disabled={locked} onChange={e => set(i, { text: e.target.value })} />
      <button type="button" className="show-button is-icon" aria-label={`Move ${noun.toLowerCase()} ${i + 1} up`} disabled={locked || i === 0} onClick={() => up(i)}><ArrowUp size={16} aria-hidden="true" /></button>
      <button type="button" className="show-button is-icon" aria-label={`Remove ${noun.toLowerCase()} ${i + 1}`} disabled={locked || items.length <= min} onClick={() => onChange(items.filter((_, j) => j !== i))}><X size={16} aria-hidden="true" /></button>
    </li>)}</ol>
    {items.length < max && <button type="button" className="show-button" disabled={locked} onClick={() => onChange([...items, { key: newKey(), text: "" }])}><Plus size={16} aria-hidden="true" />Add {noun.toLowerCase()}</button>}
    <span className="show-help" role={empty ? "status" : undefined}>{empty ? `Give every ${noun.toLowerCase()} a few words before you save.` : `Between ${min} and ${max}. Edit the words any time; answers stay with their ${noun.toLowerCase()}.`}</span>
  </div>;
}
const check = (id: string, label: string, checked: boolean, locked: boolean, onChange: (v: boolean) => void, help?: string) =>
  <label className="show-check is-full" htmlFor={id}><input id={id} type="checkbox" checked={checked} disabled={locked} onChange={e => onChange(e.target.checked)} />{label}{help && <span className="show-help">&nbsp;{help}</span>}</label>;
const ends = (value: Record<string, unknown>, set: (patch: Record<string, unknown>) => void, locked: boolean, low: string, high: string, prefix: string) => <>
  <label htmlFor={`${prefix}-low`}>Low end label<input id={`${prefix}-low`} maxLength={80} value={String(value.low ?? "")} placeholder={low} disabled={locked} onChange={e => set({ low: e.target.value })} /></label>
  <label htmlFor={`${prefix}-high`}>High end label<input id={`${prefix}-high`} maxLength={80} value={String(value.high ?? "")} placeholder={high} disabled={locked} onChange={e => set({ high: e.target.value })} /></label>
</>;

// INT-04
export function ChoiceOptions({ value, locked, onChange }: OptionsEditorProps) {
  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });
  return <>
    <OptionList id="choice-options" title="Choices" noun="Choice" items={optionItems(value)} min={2} max={12} length={200} locked={locked} onChange={items => set({ items })} />
    {check("choice-multiple", "Pick any", value.multiple === true, locked, v => set({ multiple: v }), "People can choose more than one. Percentages are of people answering.")}
  </>;
}
// INT-05
export function ScaleOptions({ value, locked, onChange }: OptionsEditorProps) {
  const set = (patch: Record<string, unknown>) => { const next = { ...value, ...patch }; delete next.items; onChange(next); };
  const max = typeof value.max === "number" ? value.max : 5;
  return <>
    <label htmlFor="scale-max">Range<select id="scale-max" value={max} disabled={locked} onChange={e => set({ max: Number(e.target.value) })}>
      {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>1 to {n}{n > 7 ? ", a slider on phones" : ""}</option>)}</select></label>
    <span className="show-help bars-end">Up to seven numbers show as buttons on phones.</span>
    {ends(value, set, locked, "Not at all", "Completely", "scale")}
  </>;
}
// INT-06
export function RankingOptions({ value, locked, onChange }: OptionsEditorProps) {
  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });
  return <>
    <OptionList id="ranking-options" title="Options to rank" noun="Option" items={optionItems(value)} min={2} max={12} length={120} locked={locked} onChange={items => set({ items })} />
    {check("ranking-suggest", "Add an option", value.suggest === true, locked, v => set({ suggest: v }), "People can suggest a missing option. You add it from the control surface.")}
  </>;
}
// INT-07
const words = ["one", "two", "three", "four", "five", "six", "seven"];
export function PointsOptions({ value, locked, onChange }: OptionsEditorProps) {
  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });
  const items = optionItems(value), cut = typeof value.cut === "number" ? value.cut : 0;
  return <>
    <OptionList id="points-options" title="Options for the 100 points" noun="Option" items={items} min={2} max={8} length={120} locked={locked}
      onChange={next => set({ items: next, cut: Math.min(cut, Math.max(0, next.length - 1)) })} />
    <label htmlFor="points-cut">Cut line<select id="points-cut" value={cut} disabled={locked} onChange={e => set({ cut: Number(e.target.value) })}>
      <option value={0}>No cut line</option>{items.slice(0, -1).map((_, i) => <option key={i} value={i + 1}>After the top {words[i] ?? i + 1}</option>)}</select></label>
    <span className="show-help bars-end">A line on the TV that bars slide across. Points count once all 100 are placed.</span>
  </>;
}
// INT-17
export function StatementsOptions({ value, locked, onChange }: OptionsEditorProps) {
  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });
  return <>
    <OptionList id="statements-options" title="Statements" noun="Statement" items={optionItems(value)} min={1} max={8} length={200} locked={locked} onChange={items => set({ items })} />
    {ends(value, set, locked, "Strongly disagree", "Strongly agree", "statements")}
    {check("statements-divided", "Flag divided statements", value.flag_divided !== false, locked, v => set({ flag_divided: v }), "On your control surface only, never on the TV.")}
  </>;
}

const blank = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `o${i + 1}`, text: "" }));
export const barDefaults = {
  choice: { options: { items: blank(3), multiple: false } },
  scale: { options: { max: 5, low: "Not at all", high: "Completely" } },
  ranking: { options: { items: blank(4), suggest: false } },
  points: { options: { items: blank(5), cut: 0 } },
  statements: { options: { items: blank(3), low: "Strongly disagree", high: "Strongly agree", flag_divided: true } },
};
