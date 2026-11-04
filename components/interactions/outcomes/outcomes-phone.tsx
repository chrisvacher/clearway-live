"use client";
import "./outcomes.css";
import { useEffect, useState, type FormEvent } from "react";
import { Check, Hand, PencilLine, Plus, Trash2 } from "lucide-react";
import type { PhoneInputProps } from "@/components/interactions/phone-inputs";
import { bulletMax, bulletsOf, checkEntry, confirmOf, confirmText, confirmValue, nameMax, ownConfirm, reasonMax, type Choice, type ConfirmAnswer } from "@/lib/interactions/outcomes";
import { useBulletTyping } from "./use-bullet-typing";

// D1-11 on the phone: add one bullet at a time under the outcome on the TV. What you type reaches
// the TV as you type it; Add keeps it. Your bullets for this outcome can be removed.
export function BulletsInput({ step, mine, open, send, withdraw, engagement, frame }: PhoneInputProps) {
  const data = bulletsOf(frame?.session?.id === step.id ? frame.state.results : null), current = data.current;
  const typing = useBulletTyping(engagement, step.id);
  const max = Math.min(step.max_characters || 200, bulletMax);
  const used = mine.filter(a => !a.withdrawn).length, atLimit = used >= step.max_sends;
  const text = typing.text, length = [...text.trim()].length, ok = length > 0 && length <= max;
  const outcomeId = typing.outcome ?? current?.id ?? null;
  const ownHere = mine.filter(a => !a.withdrawn && (a.value as { outcome?: string } | undefined)?.outcome === current?.id);
  // The room moves to the next outcome: an empty box follows it; text in progress stays with its outcome.
  useEffect(() => { if (!text && typing.outcome && typing.outcome !== current?.id) typing.reset(); }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  function add(event: FormEvent) {
    event.preventDefault();
    if (!open || !ok || atLimit || !outcomeId) return;
    send({ id: typing.id, text: text.trim(), value: { outcome: outcomeId } });
    typing.reset();
  }
  if (!current) return <p className="ph-muted">Waiting for the Vision Outcomes.</p>;
  const title = outcomeId && outcomeId !== current.id ? data.outcomes.find(o => o.id === outcomeId)?.title ?? current.title : current.title;
  return <div className="oc-phone">
    <p className="oc-phone-title">{title}</p>
    {ownHere.length > 0 && <ul className="oc-phone-list" aria-label="Your bullets">{ownHere.map(a => <li key={a.id} className="oc-phone-item"><span>{a.text}</span>
      {open && <button type="button" className="ph-secondary" onClick={() => withdraw(a.id)} aria-label={`Remove: ${a.text}`}><Trash2 size={16} aria-hidden="true" /> Remove</button>}</li>)}</ul>}
    {open && <form onSubmit={add}>
      <label className="ph-label" htmlFor="oc-bullet">What&rsquo;s true</label>
      <textarea id="oc-bullet" className="ph-input" rows={2} value={text} placeholder="One thing that is true" aria-invalid={length > max} aria-describedby="oc-count" onChange={e => typing.type(e.target.value, current.id)} />
      <p className="ph-count" id="oc-count" aria-live="polite"><span>{length > max ? `${length - max} characters over. Keep it to ${max}.` : atLimit ? `You’ve added ${used} of ${step.max_sends}.` : typing.locked ? "Someone else is editing this bullet." : "Appears on the screen as you type. Anonymous."}</span><span>{length} / {max}</span></p>
      <div className="ph-actions"><button className="ph-send" disabled={!ok || atLimit}><Plus size={18} aria-hidden="true" />Add bullet</button></div>
    </form>}
  </div>;
}

const choiceIcon = { confirm: Check, rename: PencilLine, challenge: Hand } as const;
const choiceLabel: Record<Choice, string> = { confirm: "Confirm", rename: "Rename", challenge: "Challenge" };

// D2-05 on the phone: confirm, rename or challenge each provisional outcome, with an optional
// reason. The whole list goes as one answer; sending again replaces it, so changing your mind is one tap.
export function ConfirmInput({ mine, open, send, frame, step }: PhoneInputProps) {
  const outcomes = confirmOf(frame?.session?.id === step.id ? frame.state.results : null).outcomes;
  const last = mine.filter(a => !a.withdrawn).at(-1);
  const [answer, setAnswer] = useState<ConfirmAnswer>(() => ownConfirm(last?.value)), [touched, setTouched] = useState(false), [message, setMessage] = useState("");
  useEffect(() => { if (!touched && last) setAnswer(ownConfirm(last.value)); }, [last, touched]);
  const open_ = outcomes.filter(o => !o.decision);
  function set(id: string, patch: Partial<ConfirmAnswer[string]>) { setTouched(true); setMessage(""); setAnswer(a => ({ ...a, [id]: { ...a[id], c: patch.c ?? a[id]?.c ?? "confirm", ...patch } })); }
  function submit(event: FormEvent) {
    event.preventDefault();
    const chosen: ConfirmAnswer = {};
    for (const o of open_) if (answer[o.id]) {
      const entry = { ...answer[o.id] }, check = checkEntry(entry);
      if (!check.ok) { setMessage(`${o.title}: ${check.message}`); return; }
      if (entry.c !== "rename") delete entry.name;
      if (!entry.reason?.trim()) delete entry.reason; else entry.reason = entry.reason.trim();
      if (entry.name) entry.name = entry.name.trim();
      chosen[o.id] = entry;
    }
    if (!Object.keys(chosen).length) { setMessage("Choose confirm, rename or challenge for at least one outcome."); return; }
    send({ text: confirmText(chosen), value: confirmValue(chosen) }); setTouched(false); setMessage("");
  }
  if (!outcomes.length) return <p className="ph-muted">Waiting for the Vision Outcomes.</p>;
  return <form className="oc-phone" onSubmit={submit}>
    {outcomes.map(o => { const entry = answer[o.id], decided = Boolean(o.decision); return <fieldset key={o.id} className="oc-card" disabled={!open || decided}>
      <h3>{o.number}. {o.title}</h3>
      {decided ? <p className="ph-muted">{o.decision === "renamed" ? "Renamed by the room" : "Confirmed by the room"}</p> : <>
        <div className="oc-choices" role="group" aria-label={`Your answer for ${o.title}`}>
          {(Object.keys(choiceLabel) as Choice[]).map(c => { const Icon = choiceIcon[c]; return <button key={c} type="button" className="ph-secondary" aria-pressed={entry?.c === c} onClick={() => set(o.id, { c })}><Icon size={16} aria-hidden="true" /> {choiceLabel[c]}</button>; })}
        </div>
        {entry?.c === "rename" && <><label className="ph-label" htmlFor={`oc-name-${o.id}`}>New name</label>
          <input id={`oc-name-${o.id}`} className="ph-input" value={entry.name ?? ""} maxLength={nameMax + 40} onChange={e => set(o.id, { name: e.target.value })} /></>}
        {entry && entry.c !== "confirm" && <><label className="ph-label" htmlFor={`oc-why-${o.id}`}>Why? (optional)</label>
          <textarea id={`oc-why-${o.id}`} className="ph-input" rows={2} value={entry.reason ?? ""} maxLength={reasonMax + 40} onChange={e => set(o.id, { reason: e.target.value })} /></>}
      </>}
    </fieldset>; })}
    {message && <p className="ph-muted" role="status">{message}</p>}
    {open && open_.length > 0 && <div className="ph-actions"><button className="ph-send" disabled={Boolean(last) && !touched}><Check size={18} aria-hidden="true" />Send answers</button></div>}
  </form>;
}
