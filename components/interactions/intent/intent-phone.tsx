"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, Plus, Trash2, UserMinus, UserPlus } from "lucide-react";
import type { PhoneInputProps } from "@/components/interactions/phone-inputs";
import { cardsOf, intentFields, maxFieldLength, maxPeople, maxSteps, maxStepLength, needsText, type IntentCard, type IntentField } from "@/lib/interactions/intent";
import { post, useIntent, type IntentCardState } from "./use-intent";
import "./intent-phone.css";

const messages: Record<string, string> = {
  locked: "Someone is typing in that line. Try again in a moment.", full: "That card already has three people.", closed: "This step has closed.",
  unavailable: "The room didn’t answer. Try again.", denied: "You can’t edit that card.", moved: "The room moved on.",
};

// INT-16 on the phone: pick a card (or be paired to one from the remote), then write its lines.
// One person types in a line at a time; the line goes to the TV as it is typed and replaces the old one.
export function IntentInput(props: PhoneInputProps) { return <IntentStep key={props.step.id} {...props} />; }
function IntentStep({ step, open, engagement, frame }: PhoneInputProps) {
  const base = `/api/live/${engagement}/intent`;
  const { view, read } = useIntent(base, frame?.version);
  const cards = cardsOf(frame?.state.results), [message, setMessage] = useState("");
  const mine = view?.cards.find(c => c.pair.some(p => p.id === view.me)) ?? null;
  const call = async (body: Record<string, unknown>) => { const out = await post(base, body); if (!["ok", "unchanged", "duplicate"].includes(out.status)) setMessage(messages[out.status] ?? messages.unavailable); else setMessage(""); void read(); return out; };
  const card = mine ? cards.find(c => c.id === mine.id) : null;
  return <div className="hi-ph">
    {message && <p className="ph-note" role="alert">{message}</p>}
    {card && mine ? <>
      <h2 className="hi-ph-title">{card.number}. {card.title}</h2>
      <CardEditor card={card} state={mine} people={view?.people ?? []} open={open && step.state === "live"} call={call} />
      <button type="button" className="ph-secondary" onClick={() => void call({ kind: "leave", card: card.id })}><UserMinus size={16} aria-hidden="true" />Leave this card</button>
    </> : <>
      <p className="ph-text">{open ? "Pick the outcome you will work on. Up to three people can work a card together." : "Cards are not open to join."}</p>
      <ul className="hi-ph-cards">{cards.map(c => {
        const state = view?.cards.find(x => x.id === c.id), full = (state?.pair.length ?? 0) >= maxPeople;
        return <li key={c.id}><span><b>{c.number}. {c.title}</b>{state && state.pair.length > 0 && <small>{state.pair.map(p => p.first).join(", ")}</small>}</span>
          <button type="button" className="ph-secondary" disabled={!open || full} onClick={() => void call({ kind: "join", card: c.id })}><UserPlus size={16} aria-hidden="true" />{full ? "Full" : "Join"}</button></li>;
      })}</ul>
    </>}
  </div>;
}

function CardEditor({ card, state, people, open, call }: { card: IntentCard; state: IntentCardState; people: { id: string; first: string }[]; open: boolean; call: (body: Record<string, unknown>) => Promise<{ status: string }> }) {
  const year = null;
  return <div className="hi-ph-editor">
    {intentFields.map(f => <Line key={f.key} id={`${card.id}-${f.key}`} label={f.label} help={f.ask(year)} value={card[f.key as IntentField]} max={maxFieldLength}
      lock={state.locks.find(l => l.field === f.key && !l.mine)?.by ?? null} open={open}
      change={text => call({ kind: "edit", card: card.id, op: "set", p: { field: f.key, text } })} done={() => call({ kind: "edit", card: card.id, op: "release", p: { field: f.key } })} />)}
    <h3 className="hi-ph-sub">Next 30 days</h3>
    <ul className="hi-ph-steps">{card.steps.map(s => <li key={s.id} className={s.missing.length ? "is-flagged" : ""}>
      <Line id={`step-${s.id}`} label="First step" value={s.text} max={maxStepLength} open={open} lock={state.locks.find(l => l.field === `step:${s.id}` && !l.mine)?.by ?? null}
        change={text => text.trim() ? call({ kind: "edit", card: card.id, op: "step_set", p: { step: s.id, text } }) : undefined} done={() => call({ kind: "edit", card: card.id, op: "release", p: { field: `step:${s.id}` } })} />
      <div className="hi-ph-who">
        <label>Owner<select disabled={!open} value={people.find(p => p.first === s.owner)?.id ?? ""} onChange={e => void call({ kind: "edit", card: card.id, op: "step_set", p: { step: s.id, owner: e.target.value || null } })}>
          <option value="">No owner</option>{people.map(p => <option key={p.id} value={p.id}>{p.first}</option>)}</select></label>
        <label><CalendarDays size={14} aria-hidden="true" />Date<input type="date" disabled={!open} value={s.date ?? ""} onChange={e => void call({ kind: "edit", card: card.id, op: "step_set", p: { step: s.id, date: e.target.value || null } })} /></label>
        <button type="button" className="ph-secondary" disabled={!open} aria-label="Remove this step" onClick={() => void call({ kind: "edit", card: card.id, op: "step_remove", p: { step: s.id } })}><Trash2 size={16} aria-hidden="true" /></button>
      </div>
      {s.missing.length > 0 && <p className="hi-ph-flag">{needsText(s.missing)}</p>}
    </li>)}</ul>
    <AddStep disabled={!open || card.steps.length >= maxSteps} add={text => call({ kind: "edit", card: card.id, op: "step_add", p: { text } })} />
  </div>;
}

function AddStep({ disabled, add }: { disabled: boolean; add: (text: string) => Promise<{ status: string }> }) {
  const [text, setText] = useState("");
  return <form className="hi-ph-add" onSubmit={e => { e.preventDefault(); const t = text.trim(); if (!t) return; void add(t).then(out => { if (out.status === "ok") setText(""); }); }}>
    <label className="hi-ph-line" htmlFor="hi-add-step">New first step<input id="hi-add-step" className="ph-input" maxLength={maxStepLength} value={text} disabled={disabled} onChange={e => setText(e.target.value)} /></label>
    <button type="submit" className="ph-secondary" disabled={disabled || !text.trim()}><Plus size={16} aria-hidden="true" />Add this step</button>
  </form>;
}

// One line. Typing is sent a moment after each keystroke so the TV follows the words; leaving
// the line lets the other person in at once. A line another phone holds is read-only here.
function Line({ id, label, help, value, max, lock, open, change, done }: { id: string; label: string; help?: string; value: string; max: number; lock: string | null; open: boolean; change: (t: string) => unknown; done: () => unknown }) {
  const [text, setText] = useState(value), focus = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { if (!focus.current) setText(value); }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <label className="hi-ph-line" htmlFor={id}>{label}{help && <span className="show-help">{help}</span>}
    <textarea id={id} className="ph-input" rows={2} maxLength={max} value={text} disabled={!open || Boolean(lock)}
      onFocus={() => { focus.current = true; }}
      onChange={e => { const t = e.target.value; setText(t); clearTimeout(timer.current); timer.current = setTimeout(() => void change(t), 200); }}
      onBlur={() => { focus.current = false; clearTimeout(timer.current); void Promise.resolve(change(text)).then(() => done()); }} />
    <span className="ph-count"><span>{lock ? `${lock} is typing here` : ""}</span><span>{text.length}/{max}</span></span></label>;
}
