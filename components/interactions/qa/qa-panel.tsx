"use client";
import { pressId } from "@/lib/control/own-presses";
import "./qa.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Eye, EyeOff, Pencil, RotateCcw, Sun, SunDim, Undo2, X } from "lucide-react";
import type { Room } from "@/components/control/live-controls";
import { askedBy, qaMessage, type QaAction, type QaQuestion } from "@/lib/interactions/qa";
import { AiMark } from "@/components/interactions/ai/ai-icon";

type Status = { status: string; version: number; spotlight: string | null; session: { id: string; title: string; state: string; live: boolean; any_time: boolean } | null;
  questions: QaQuestion[]; counts?: { questions: number; folded: number; answered: number; hidden: number } };
const foldLabel = { words: "Matched words", ai: "Combined by AI", facilitator: "Folded by you" } as const;

// The control surface's Q&A panel (private): questions by rank with their counts, folds
// with Undo, Spotlight over any session, Answered, Edit and Hide. Every press is one server
// mutation; the panel follows what comes back.
export function QaPanel({ room, onClose, headingId = "ctl-items-title", session }: { room: Room; onClose?: () => void; headingId?: string; session?: string | null }) {
  const engagement = room.show.context.id, version = room.frame?.version;
  const [status, setStatus] = useState<Status | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const load = useRef<() => void>(() => {});
  useEffect(() => {
    let stopped = false, running = false, again = false;
    async function read() {
      if (running) { again = true; return; } running = true;
      try {
        const response = await fetch(`/api/control/${engagement}/qa${session ? `?session=${session}` : ""}`, { cache: "no-store" });
        if (response.ok && !stopped) setStatus(await response.json() as Status);
      } catch { /* Keep the last list. */ } finally { running = false; if (again && !stopped) { again = false; void read(); } }
    }
    load.current = () => void read(); void read();
    const timer = setInterval(() => void read(), 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [engagement, session]);
  // Every room version may change the questions; read once it settles.
  useEffect(() => { if (version === undefined) return; const t = setTimeout(() => load.current(), 150); return () => clearTimeout(t); }, [version]);
  const press = useCallback(async (action: QaAction, extra: Record<string, unknown> = {}) => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/control/${engagement}/qa`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: pressId(), action, ...extra }) });
      const data = await response.json() as { status: string };
      setMessage(qaMessage(data.status)); load.current();
      return data.status;
    } catch { setMessage(qaMessage("unavailable")); return "unavailable"; }
    finally { setBusy(false); }
  }, [engagement]);
  const list = status?.questions ?? [], spot = room.frame?.qa?.spotlight ?? null;
  const waiting = list.filter(q => !q.answered && !q.hidden), answered = list.filter(q => q.answered && !q.hidden), hidden = list.filter(q => q.hidden);
  const s = status?.session;
  if (!s && !spot) return null;
  const row = (q: QaQuestion) => {
    const on = spot?.id === q.id, edit = editing?.id === q.id;
    return <li key={q.id} className={`qa-ctl-item${on ? " is-spot" : ""}${q.answered ? " is-answered" : ""}${q.hidden ? " is-hidden" : ""}${q.folded ? " is-folded" : ""}`}>
      <span className="qa-ctl-count" aria-label={`${q.people} ${q.people === 1 ? "person" : "people"}`}>{q.hidden ? "" : q.people}</span>
      <div className="qa-ctl-body">
        {edit ? <form className="qa-ctl-edit" onSubmit={e => { e.preventDefault(); void press("edit", { question: q.id, text: editing.text }).then(r => { if (r === "ok" || r === "unchanged") setEditing(null); }); }}>
          <label className="sr-only" htmlFor={`qa-edit-${q.id}`}>Edit the question</label>
          <textarea id={`qa-edit-${q.id}`} rows={2} maxLength={280} value={editing.text} onChange={e => setEditing({ id: q.id, text: e.target.value })} />
          <div className="ctl-row"><button className="show-button is-primary is-small" disabled={busy || !editing.text.trim()}><Check size={16} aria-hidden="true" />Save the edit</button>
            <button type="button" className="show-button is-small" onClick={() => setEditing(null)}><X size={16} aria-hidden="true" />Cancel</button></div>
        </form> : <p className="qa-ctl-text">{q.text}</p>}
        <p className="qa-ctl-meta">{[q.hidden ? "Hidden" : q.answered ? "Answered" : q.rank && q.rank > 3 ? "On phones only" : on ? "On the TV now" : null,
          q.askers > 1 ? askedBy(q) : null, `${q.votes} ${q.votes === 1 ? "vote" : "votes"}`, q.edited ? "Edited, never refolded" : null].filter(Boolean).join(" · ")}</p>
        {q.edited && q.original && <p className="qa-ctl-meta">Asked as: {q.original}</p>}
        {q.members && q.members.length > 0 && <ul className="qa-ctl-members" aria-label="Folded into this question">{q.members.map(m => <li key={m.id}>
          <span><span className={`qa-fold-by is-${m.by}`}>{m.by === "ai" && <AiMark />}{foldLabel[m.by] ?? "Folded"}</span> {m.text}</span>
          <button className="show-button is-small" disabled={busy} onClick={() => void press("undo_fold", { merge: m.merge })}><Undo2 size={16} aria-hidden="true" />Undo fold</button>
        </li>)}</ul>}
      </div>
      <div className="qa-ctl-actions">
        {q.hidden ? <button className="show-button is-small" disabled={busy} onClick={() => void press("unhide", { question: q.id })}><Eye size={16} aria-hidden="true" />Unhide</button>
          : q.answered ? <button className="show-button is-small" disabled={busy} onClick={() => void press("unanswer", { question: q.id })}><RotateCcw size={16} aria-hidden="true" />Bring back</button>
          : <>
            {on ? <button className="show-button is-small" disabled={busy} onClick={() => void press("clear_spotlight")}><SunDim size={16} aria-hidden="true" />Clear</button>
              : <button className="show-button is-small is-primary" disabled={busy} onClick={() => void press("spotlight", { question: q.id }).then(r => { if (r === "ok") onClose?.(); })}><Sun size={16} aria-hidden="true" />Spotlight</button>}
            <button className="show-button is-small" disabled={busy} onClick={() => void press("answered", { question: q.id })}><Check size={16} aria-hidden="true" />Answered</button>
            <button className="show-button is-small" disabled={busy || edit} onClick={() => setEditing({ id: q.id, text: q.text })}><Pencil size={16} aria-hidden="true" />Edit</button>
            <button className="show-button is-small" disabled={busy} onClick={() => void press("hide", { question: q.id })}><EyeOff size={16} aria-hidden="true" />Hide</button>
          </>}
      </div>
    </li>;
  };
  return <section className="ctl-items qa-ctl" aria-labelledby={headingId}>
    <div className="ctl-row is-between"><h2 id={headingId}>{s?.live ? "Questions by rank" : s?.any_time ? "Questions any time" : "Questions"}</h2>{onClose && <button className="show-button is-icon" aria-label="Close questions" onClick={onClose}><X size={20} aria-hidden="true" /></button>}</div>
    {s && <p className="show-help">{s.title}{s.live ? " · on the TV" : s.any_time ? " · one list for the whole engagement, asked from any session" : ""}. Names never show.</p>}
    {spot && <div className="qa-ctl-spot" role="status"><Sun size={18} aria-hidden="true" /><span><strong>Spotlight on the TV:</strong> {spot.text}</span>
      <button className="show-button is-small" disabled={busy} onClick={() => void press("answered", { question: spot.id })}><Check size={16} aria-hidden="true" />Answered</button>
      <button className="show-button is-small" disabled={busy} onClick={() => void press("clear_spotlight")}><SunDim size={16} aria-hidden="true" />Clear</button></div>}
    {status?.counts && <div className="qa-ctl-meter"><span><b>{status.counts.questions}</b> questions</span><span><b>{status.counts.folded}</b> folded</span><span><b>{status.counts.answered}</b> answered</span>{status.counts.hidden > 0 && <span><b>{status.counts.hidden}</b> hidden</span>}</div>}
    <p className="show-help">Folding by matching words. Each person who asked counts 2, each other voter 1. Edited questions are never refolded.</p>
    {message && <p className="show-message is-error" role="alert">{message}</p>}
    {waiting.length ? <ol className="qa-ctl-list">{waiting.map(row)}</ol> : <p className="show-empty">No questions yet.</p>}
    {answered.length > 0 && <><h3 className="qa-ctl-sub">Answered</h3><ol className="qa-ctl-list">{answered.map(row)}</ol></>}
    {hidden.length > 0 && <><h3 className="qa-ctl-sub">Hidden</h3><ol className="qa-ctl-list">{hidden.map(row)}</ol></>}
  </section>;
}

// Questions any time, or a question still spotlit over another step: the panel follows the
// room even when the live step is not Q&A.
export function QaAnyTime({ room }: { room: Room }) {
  const qa = room.frame?.qa, live = room.frame?.session?.interaction === "qa";
  if (live || (!qa?.pool && !qa?.spotlight)) return null;
  return <QaPanel room={room} headingId="qa-any-title" session={qa.pool ? null : qa.spotlight?.session_id ?? null} />;
}
