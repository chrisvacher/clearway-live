"use client";
import "./qa.css";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, MessageCircleQuestion, RefreshCw, WifiOff, X } from "lucide-react";
import type { LiveSnapshot } from "@/lib/live/types";
import type { OwnAnswer } from "@/lib/phone/types";
import { checkQuestion, isAsk, showsAsk } from "@/lib/interactions/qa";
import { useQaPhone } from "./use-qa-phone";

// Questions any time: an Ask button on every session's phone screen and a sheet to ask in.
// Anonymous, and every question goes to one list for the whole engagement.
export function QaAsk({ frame, viewing, answers }: { frame: LiveSnapshot | null; viewing: string | null; answers: OwnAnswer[] }) {
  const pool = frame?.qa?.pool ?? null;
  const qa = useQaPhone(frame?.state.engagement_id ?? null);
  const [open, setOpen] = useState(false), [draft, setDraft] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { if (!open) return; const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [open]);
  if (!showsAsk(pool, viewing)) return null;
  const max = Math.min(pool.max_characters || 200, 280), check = checkQuestion(draft, max);
  const pending = qa.entries.filter(e => isAsk(e.request) && e.request.session === pool.session_id);
  const sent = [...answers.filter(a => a.session_id === pool.session_id && !a.withdrawn).map(a => ({ id: a.id, text: a.text })),
    ...qa.asked.filter(a => a.session === pool.session_id && !answers.some(x => x.id === a.id))];
  const used = new Set([...sent.map(a => a.id), ...pending.filter(e => e.state !== "failed").map(e => e.request.id)]).size, atLimit = used >= pool.max_sends;
  function ask(event: FormEvent) {
    event.preventDefault();
    if (!check.ok || atLimit || !pool) return;
    qa.ask(draft.trim(), pool.session_id); setDraft("");
  }
  return <>
    <button type="button" className="qa-ask-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><MessageCircleQuestion size={16} aria-hidden="true" />Ask</button>
    {open && <div className="qa-sheet-scrim" onClick={() => setOpen(false)}>
      <form className="qa-sheet" role="dialog" aria-modal="true" aria-labelledby="qa-sheet-title" onClick={e => e.stopPropagation()} onSubmit={ask}>
        <div className="qa-sheet-head"><h2 id="qa-sheet-title">Ask a question</h2><button type="button" className="qa-sheet-close" aria-label="Close" onClick={() => setOpen(false)}><X size={20} aria-hidden="true" /></button></div>
        <p className="qa-sheet-note">Anonymous. It goes to one list for the whole engagement.</p>
        <label className="sr-only" htmlFor="qa-any-question">Your question</label>
        <textarea ref={input} id="qa-any-question" className="ph-input" rows={3} value={draft} aria-invalid={Boolean(check.message)} aria-describedby="qa-any-count" onChange={e => setDraft(e.target.value)} />
        <p className="ph-count qa-sheet-count" id="qa-any-count" aria-live="polite"><span>{check.message || (atLimit ? `You’ve asked ${used} of ${pool.max_sends}.` : "One question")}</span><span>{check.count}</span></p>
        <div className="ph-actions"><button className="ph-send" disabled={!check.ok || atLimit}><MessageCircleQuestion size={18} aria-hidden="true" />Ask</button></div>
        {(pending.length > 0 || sent.length > 0) && <ul className="qa-sheet-list" aria-label="Your questions">
          {pending.map(e => <li key={e.request.id}><span>{e.request.text}</span><span className="qa-status">{e.state === "failed" ? <>Not sent <button type="button" onClick={() => qa.dismiss(e.request.id, e.request.revision)}>Dismiss</button></>
            : e.request.queuedAt ? <>{e.state === "sending" ? <RefreshCw size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}{e.state === "sending" ? "Sending" : "Saved on this phone"}</> : <><Check size={14} aria-hidden="true" />Sent</>}</span></li>)}
          {sent.filter(a => !pending.some(e => e.request.id === a.id)).map(a => <li key={a.id}><span>{a.text}</span><span className="qa-status"><Check size={14} aria-hidden="true" />Sent</span></li>)}
        </ul>}
      </form>
    </div>}
  </>;
}
