"use client";
import { useEffect, useState } from "react";
import { Check, Lock, WifiOff } from "lucide-react";
import type { PhoneInputProps } from "@/components/interactions/phone-inputs";
import { browserStore } from "@/lib/phone/outbox";
import { formAnswer, formAnswersOf, formOf, maxFormAnswer } from "@/lib/interactions/grid-form-sign";
import "./grid-form-sign.css";

// INT-09 on the phone: questions answered privately, in words. Only the facilitators read
// the answers, with the person's name; they never reach the screen or another phone. The
// draft survives phones down, a refresh and the phone going to sleep.
export function FormInput(props: PhoneInputProps) { return <FormStep key={props.step.id} {...props} />; }
function FormStep({ step, mine, open, send, change }: PhoneInputProps) {
  const questions = formOf(step.options), own = mine[0] ?? null, store = `cw-form-${step.id}`;
  const sentAnswers = JSON.stringify(formAnswersOf(own?.value));
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    try { const saved = JSON.parse(browserStore.get(store) || "null"); if (saved && typeof saved === "object") return saved; } catch { /* Start from the sent answers. */ }
    return formAnswersOf(own?.value);
  });
  const [editing, setEditing] = useState(!own);
  // A just-settled answer carries no value until the room reloads: keep what is shown.
  useEffect(() => { if (own?.value && !editing) setDrafts(JSON.parse(sentAnswers)); }, [sentAnswers]); // eslint-disable-line react-hooks/exhaustive-deps
  const write = (key: string, value: string) => setDrafts(d => { const next = { ...d, [key]: value }; browserStore.set(store, JSON.stringify(next)); return next; });
  const answer = formAnswer(drafts, questions);
  const sentNow = sentAnswers === JSON.stringify(answer.value.answers);
  function submit() {
    if (!open || !answer.ok) return;
    if (own) change(own.id, answer); else send(answer);
    browserStore.set(store, "null"); setEditing(false);
  }
  if (!questions.length) return <p className="ph-text">The facilitator hasn’t added the questions yet.</p>;
  const locked = !open || (own !== null && !editing);
  return <div className="gfs-ph-form">
    {questions.map(q => {
      const length = [...(drafts[q.key] ?? "")].length;
      return <div key={q.key} className="gfs-q">
        <label className="gfs-q-label" htmlFor={`gfs-q-${q.key}`}>{q.text}</label>
        <textarea id={`gfs-q-${q.key}`} className="ph-input" rows={3} value={drafts[q.key] ?? ""} readOnly={locked} aria-invalid={length > maxFormAnswer}
          onChange={e => write(q.key, e.target.value)} onInput={e => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }} />
        {!locked && length > maxFormAnswer * 0.8 && <span className="ph-muted">{length} / {maxFormAnswer}</span>}
      </div>;
    })}
    {own && <p className="ph-note">{own.status === "saved" ? <><WifiOff size={14} aria-hidden="true" />Saved on this phone. It sends privately when you’re back online.</>
      : <><Check size={14} aria-hidden="true" />Sent privately. Only the facilitators read it.</>}</p>}
    {open && (locked
      ? <button type="button" className="ph-secondary" onClick={() => setEditing(true)}>Change my answers</button>
      : <div className="ph-actions">{own && <button type="button" className="ph-secondary" onClick={() => { setDrafts(JSON.parse(sentAnswers)); setEditing(false); }}>Cancel</button>}
        <button type="button" className="ph-send" disabled={!answer.ok || (Boolean(own) && sentNow)} onClick={submit}><Lock size={18} aria-hidden="true" />{own ? "Save privately" : "Send privately"}</button></div>)}
  </div>;
}
