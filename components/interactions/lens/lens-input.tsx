"use client";
import { useState, type FormEvent } from "react";
import { Check, ExternalLink, Lock, RefreshCw, Send, Sprout, WifiOff } from "lucide-react";
import type { PhoneInputProps } from "@/components/interactions/phone-inputs";
import { LensHeading } from "@/components/wayfinding/lens-icon";
import { checkSentence, futureTense, heldText, lensOptions, presentTenseNudge, seededByLens } from "@/lib/interactions/lens";
import { lensNumbers, type LensNumber } from "@/lib/wayfinding/lens";
import type { OwnShown } from "@/lib/phone/types";

const statusLabel = { sent: "Sent", saved: "Saved on this phone", sending: "Sending", failed: "Not sent" } as const;
function Status({ status }: { status: OwnShown["status"] }) {
  const Icon = status === "sent" ? Check : status === "saved" ? WifiOff : status === "sending" ? RefreshCw : null;
  return <span className="ph-answer-note">{Icon && <Icon size={14} aria-hidden="true" />}{statusLabel[status]}</span>;
}

// INT-12 on the phone. Two shapes of one kind:
//  * Seeding (PRE-10, PRE-11): self-paced from the pre-call until Day 1. Pick a lens, write present-tense
//    sentences. They are hidden from everyone, the facilitator included, until the lens opens; this phone shows
//    that they are waiting, never the words. The recording link is for someone who missed the call.
//  * The lens wall (D1-05): several sentences per person, a gentle present-tense reminder.
export function LensInput({ step, mine, open, send, change, withdraw }: PhoneInputProps) {
  const options = lensOptions(step.options), [draft, setDraft] = useState(""), [pick, setPick] = useState<LensNumber>(options.lens ?? 1), [editing, setEditing] = useState<string | null>(null);
  const standing = mine.filter(a => !a.withdrawn), check = checkSentence(draft, step.max_characters), used = mine.length, atLimit = !editing && used >= step.max_sends;
  const nudge = futureTense(draft), counts = seededByLens(standing);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!open || !check.ok || atLimit) return;
    const answer = { text: draft.trim(), ...(options.seed ? { value: { lens: pick } } : {}) };
    if (editing) change(editing, answer); else send(answer);
    setDraft(""); setEditing(null);
  }
  const name = (lens: LensNumber) => options.names[lens - 1] || undefined;
  return <div className="lens-phone" data-lens-phone={options.seed ? "seed" : "wall"}>
    {options.seed && <>
      <p className="ph-who"><span className="ph-marker"><Lock size={14} aria-hidden="true" />Hidden</span>
        <span><strong>Who sees my sentences?</strong> No one, until each lens opens on Day 1. Not even the facilitator.</span></p>
      {options.recording && <p className="ph-text"><a className="lens-recording" href={options.recording} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" />Missed the pre-call? Watch the recording first.</a></p>}
      <div className="lens-picker" role="group" aria-label="Lens">
        {lensNumbers.map(lens => <button key={lens} type="button" className={`lens-pick${pick === lens ? " is-on" : ""}`} aria-pressed={pick === lens} onClick={() => setPick(lens)}>
          <LensHeading lens={lens} names={options.names} size="small" /><span className="lens-pick-n">{counts[lens]} written</span></button>)}
      </div>
    </>}
    {!options.seed && options.lens && <p className="ph-text"><LensHeading lens={options.lens} names={options.names} size="small" /></p>}
    {standing.length > 0 && <ul className="ph-answers" aria-label="Your sentences">
      {standing.map(a => {
        const lens = (a.value as { lens?: LensNumber } | undefined)?.lens;
        return <li key={a.id} className="ph-answer" data-lens-own>
          {options.seed ? <p className="lens-own-held"><Sprout size={16} aria-hidden="true" />{lens ? <>{name(lens) ?? `Lens ${lens}`} · </> : null}{heldText}</p> : <p>{a.text}</p>}
          <Status status={a.status} />
          {open && <div className="ph-answer-actions">
            {!options.seed && <button type="button" onClick={() => { setEditing(a.id); setDraft(a.text); }}>Change</button>}
            <button type="button" onClick={() => withdraw(a.id)}>Withdraw</button></div>}
        </li>;
      })}
    </ul>}
    {open && <form className="lens-form" onSubmit={submit}>
      <label className="ph-label" htmlFor="lens-sentence">{editing ? "Change your sentence" : options.seed ? `A sentence for ${name(pick) ?? `lens ${pick}`}` : "Your sentence"}</label>
      <textarea id="lens-sentence" className="ph-input" rows={3} value={draft} placeholder="We…" aria-invalid={Boolean(check.message)} aria-describedby="lens-count" onChange={e => setDraft(e.target.value)} />
      {nudge && <p className="ph-muted lens-nudge" role="status">{presentTenseNudge}</p>}
      <p className="ph-count" id="lens-count" aria-live="polite"><span>{check.message || (atLimit ? `You’ve sent ${used} of ${step.max_sends}.` : `Present tense, as if it is true today. ${used} of ${step.max_sends} sent.`)}</span><span>{check.count}</span></p>
      <div className="ph-actions">{editing && <button type="button" className="ph-secondary" onClick={() => { setEditing(null); setDraft(""); }}>Cancel</button>}
        <button className="ph-send" disabled={!check.ok || atLimit}><Send size={18} aria-hidden="true" />{editing ? "Save change" : "Send"}</button></div>
    </form>}
  </div>;
}
