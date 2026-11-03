"use client";
import "./qa.css";
import { useState, type FormEvent } from "react";
import { ArrowUp, Check, MessageCircleQuestion, RefreshCw, WifiOff } from "lucide-react";
import type { PhoneInputProps } from "@/components/interactions/phone-inputs";
import { askedBy, checkQuestion, questionsOf, type QaQuestion } from "@/lib/interactions/qa";
import type { OwnShown } from "@/lib/phone/types";
import { useQaPhone } from "./use-qa-phone";

const statusLabel = { sent: "Sent", saved: "Saved on this phone", sending: "Sending", failed: "Not sent" } as const;
function Status({ status }: { status: OwnShown["status"] }) {
  const Icon = status === "sent" ? Check : status === "saved" ? WifiOff : status === "sending" ? RefreshCw : null;
  return <span className="qa-status">{Icon && <Icon size={14} aria-hidden="true" />}{statusLabel[status]}</span>;
}

// One question on the phone: the whole question, who asked (anonymously), and the vote.
function Question({ q, mine, voted, pending, open, onVote }: { q: QaQuestion; mine?: OwnShown; voted: boolean; pending: boolean; open: boolean; onVote: () => void }) {
  const own = Boolean(mine);
  return <li className={`qa-item${q.answered ? " is-answered" : ""}`}>
    <div className="qa-item-body"><p className="qa-item-text">{q.text}</p>
      <p className="qa-item-meta">{q.answered && <span><Check size={14} aria-hidden="true" />Answered</span>}
        {q.askers > 1 && <span>{q.ai ? "Combined · " : ""}{askedBy(q)}</span>}{own && <span>Yours</span>}{mine && mine.status !== "sent" && <Status status={mine.status} />}
        {pending && <span><WifiOff size={14} aria-hidden="true" />Vote saved on this phone</span>}</p></div>
    {!q.answered && <button type="button" className={`qa-vote${voted ? " is-on" : ""}`} aria-pressed={voted} disabled={own || !open}
      aria-label={own ? `Your question, ${q.people} ${q.people === 1 ? "person" : "people"}` : `${voted ? "Remove your vote" : "Vote"}, ${q.people} ${q.people === 1 ? "person" : "people"}`}
      onClick={onVote}><ArrowUp size={18} aria-hidden="true" /><b>{q.people}</b></button>}
  </li>;
}

// INT-03 on the phone: ask anonymously (up to 200 characters) and upvote others' questions.
// Questions go through the phone's outbox like every answer; votes ride the Q&A outbox.
export function QaPhoneInput({ step, mine, open, send, frame }: PhoneInputProps) {
  const qa = useQaPhone(frame?.state.engagement_id ?? null);
  const [draft, setDraft] = useState("");
  const list = frame?.session?.id === step.id ? questionsOf(frame.state.results) : [];
  const ownIds = new Set([...mine.map(a => a.id), ...qa.asked.map(a => a.id)]);
  const ownOf = (q: QaQuestion) => mine.find(a => q.ids.includes(a.id)) ?? (q.ids.some(id => ownIds.has(id)) ? { id: q.id, text: q.text, revision: 0, status: "sent" as const, withdrawn: false } : undefined);
  const waiting = list.filter(q => !q.answered), answered = list.filter(q => q.answered);
  const unseen = mine.filter(a => !list.some(q => q.ids.includes(a.id)));
  const max = Math.min(step.max_characters || 200, 280), check = checkQuestion(draft, max);
  const used = mine.length, atLimit = used >= step.max_sends;
  function ask(event: FormEvent) {
    event.preventDefault();
    if (!open || !check.ok || atLimit) return;
    send({ text: draft.trim() }); setDraft("");
  }
  return <div className="qa-phone">
    <ul className="qa-list" aria-label="Questions">
      {unseen.map(a => <li key={a.id} className="qa-item is-mine"><div className="qa-item-body"><p className="qa-item-text">{a.text}</p><p className="qa-item-meta"><span>Yours</span><Status status={a.status} /></p></div></li>)}
      {waiting.map(q => { const v = qa.votes.get(q.id); return <Question key={q.id} q={q} mine={ownOf(q)} voted={Boolean(v?.voted)} pending={Boolean(v?.pending)} open={open} onVote={() => qa.vote(q.id, step.id)} />; })}
    </ul>
    {!waiting.length && !unseen.length && <p className="ph-muted">No questions yet. Be the first to ask.</p>}
    {qa.notice && <p className="ph-muted" role="status">{qa.notice}</p>}
    {answered.length > 0 && <><p className="qa-section">Answered</p><ul className="qa-list" aria-label="Answered questions">{answered.map(q => <Question key={q.id} q={q} mine={ownOf(q)} voted={false} pending={false} open={false} onVote={() => {}} />)}</ul></>}
    {open && <form className="qa-ask-form" onSubmit={ask}>
      <label className="ph-label" htmlFor="qa-question">Your question</label>
      <textarea id="qa-question" className="ph-input" rows={2} value={draft} placeholder="Ask anything" aria-invalid={Boolean(check.message)} aria-describedby="qa-count" onChange={e => setDraft(e.target.value)} />
      <p className="ph-count" id="qa-count" aria-live="polite"><span>{check.message || (atLimit ? `You’ve asked ${used} of ${step.max_sends}.` : `Up to ${max} characters. Anonymous.`)}</span><span>{check.count}</span></p>
      <div className="ph-actions"><button className="ph-send" disabled={!check.ok || atLimit}><MessageCircleQuestion size={18} aria-hidden="true" />Ask</button></div>
    </form>}
  </div>;
}
