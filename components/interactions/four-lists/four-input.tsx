"use client";
import "./four-lists.css";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowUp, Check, RefreshCw, Send, WifiOff } from "lucide-react";
import type { PhoneInputProps } from "@/components/interactions/phone-inputs";
import { agreeOptions, cardsOf, checkCard, columnLabels, fourColumns, isFourColumn, type FourCard, type FourColumn } from "@/lib/interactions/four-lists";
import type { OwnShown } from "@/lib/phone/types";
import { useFourListsPhone } from "./use-four-lists-phone";

const statusLabel = { sent: "Sent", saved: "Saved on this phone", sending: "Sending", failed: "Not sent" } as const;
function Status({ status }: { status: OwnShown["status"] }) {
  const Icon = status === "sent" ? Check : status === "saved" ? WifiOff : status === "sending" ? RefreshCw : null;
  return <span className="ph-answer-note">{Icon && <Icon size={14} aria-hidden="true" />}{statusLabel[status]}</span>;
}
const columnOf = (value: unknown): FourColumn | null => { const c = value && typeof value === "object" ? (value as { column?: unknown }).column : null; return isFourColumn(c) ? c : null; };

// INT-11 on the phone: pick a list, write a card in a few words, send; then agree with others' cards with one tap.
// Several cards per person. Agreeing is its own write (one tap on, one tap off, never on your own card). Cards ride the phone's
// outbox like every answer; agrees ride their own outbox. The cards to agree with are every standing card of the step, read from
// the server (the TV shows only the top few); in the live room a new frame from the room has the phone read them again.
export function FourListsComposer({ step, mine, open, send, change, withdraw, engagement, frame }: PhoneInputProps) {
  const live = frame?.session?.id === step.id, room = engagement ?? frame?.state.engagement_id ?? null;
  const four = useFourListsPhone(room, step.id), version = frame?.state.version, refresh = four.refresh;
  useEffect(() => { if (live) refresh(); }, [live, version, refresh]);
  const [column, setColumn] = useState<FourColumn>("right"), [draft, setDraft] = useState(""), [editing, setEditing] = useState<string | null>(null);
  const standing = mine.filter(a => !a.withdrawn), check = checkCard(draft, step.max_characters, step.max_words), used = mine.length, atLimit = !editing && used >= step.max_sends;
  const cards: FourCard[] = four.cards ?? (live ? cardsOf(frame!.state.results) : []);
  // The phone's own cards (and any folded under another card) are never offered back to agree with.
  const own = new Set(standing.map(a => a.id)), others = agreeOptions(cards, column, own);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!open || !check.ok || atLimit) return;
    const answer = { text: draft.trim(), value: { column } };
    if (editing) change(editing, answer); else send(answer);
    setDraft(""); setEditing(null);
  }
  return <div className="fl-phone" data-fl-phone>
    {standing.length > 0 && <ul className="ph-answers" aria-label="Your cards">
      {standing.map(a => {
        const c = columnOf(a.value);
        return <li key={a.id} className="ph-answer" data-fl-own>
          {c && <p className="ph-answer-note">{columnLabels[c]}</p>}<p>{a.text}</p><Status status={a.status} />
          {open && <div className="ph-answer-actions">
            <button type="button" onClick={() => { setEditing(a.id); setDraft(a.text); if (c) setColumn(c); }}>Change</button>
            <button type="button" onClick={() => withdraw(a.id)}>Withdraw</button></div>}
        </li>;
      })}
    </ul>}
    {open && <form className="fl-form" onSubmit={submit}>
      <fieldset className="fl-pick" role="radiogroup" aria-label="Which list">
        {fourColumns.map(c => <button key={c} type="button" role="radio" aria-checked={column === c} onClick={() => setColumn(c)}>{column === c && <Check aria-hidden="true" />}{columnLabels[c]}</button>)}
      </fieldset>
      <label className="ph-label" htmlFor="fl-card">{editing ? "Change your card" : "One thing, a few words"}</label>
      <textarea id="fl-card" className="ph-input" rows={2} value={draft} placeholder="One thing, a few words" aria-invalid={Boolean(check.message)} aria-describedby="fl-count" onChange={e => setDraft(e.target.value)} />
      <p className="ph-count" id="fl-count" aria-live="polite"><span>{check.message || (atLimit ? `You’ve sent ${used} of ${step.max_sends}.` : `${used} of ${step.max_sends} sent. Anonymous.`)}</span><span>{check.count}</span></p>
      <div className="ph-actions">{editing && <button type="button" className="ph-secondary" onClick={() => { setEditing(null); setDraft(""); }}>Cancel</button>}
        <button className="ph-send" disabled={!check.ok || atLimit}><Send size={18} aria-hidden="true" />{editing ? "Save change" : "Send"}</button></div>
    </form>}
    {four.notice && <p className="ph-muted" role="status">{four.notice}</p>}
    {others.length > 0 && <>
      <p className="fl-section">Agree with others · {columnLabels[column]}</p>
      <ul className="fl-agrees" aria-label={`Cards to agree with in ${columnLabels[column]}`}>
        {others.map(c => { const a = four.agrees.get(c.id), on = Boolean(a?.agreed);
          return <li key={c.id} className={`fl-arow${on ? " is-on" : ""}`}><p>{c.text}</p>
            <button type="button" aria-pressed={on} disabled={!open || Boolean(a?.pending)} onClick={() => four.agree(c.id, step.id)}>
              {on ? <Check aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}{on ? "Take back" : "Agree"}</button></li>; })}
      </ul></>}
  </div>;
}
