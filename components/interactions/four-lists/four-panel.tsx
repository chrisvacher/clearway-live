"use client";
import "./four-lists.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Eye, EyeOff, Pin, PinOff, Undo2, X } from "lucide-react";
import type { Room } from "@/components/control/live-controls";
import { agreeLabel, columnLabels, fourColumns, fourMessage, type FourAction, type FourCard } from "@/lib/interactions/four-lists";
import { pressId } from "@/lib/control/own-presses";
import { AiMark } from "@/components/interactions/ai/ai-icon";

type Status = { status: string; version: number; session: { id: string; title: string; state: string; live: boolean } | null; cards: FourCard[]; counts?: { cards: number; folded: number; hidden: number } };
const foldLabel = { words: "Matching words", ai: "Combined by AI" } as const;

// The control surface's Four Helpful Lists panel (private): every list with its cards by rank, the folds with Undo fold, Pin
// to keep a card as it is, Hide for a card that should not be on the screen. It follows the room; if the server can't answer
// (an older database) the panel is simply not drawn. Every press is one server mutation.
export function FourListsPanel({ room, onClose, headingId = "fl-ctl-title" }: { room: Room; onClose?: () => void; headingId?: string }) {
  const engagement = room.show.context.id, version = room.frame?.version, live = room.frame?.state.live_session_id ?? null;
  const [status, setStatus] = useState<Status | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const load = useRef<() => void>(() => {});
  useEffect(() => {
    let stopped = false, running = false, again = false;
    async function read() {
      if (running) { again = true; return; } running = true;
      try {
        const response = await fetch(`/api/control/${engagement}/four-lists${live ? `?session=${live}` : ""}`, { cache: "no-store" });
        if (response.ok && !stopped) setStatus(await response.json() as Status);
      } catch { /* Keep the last list. */ } finally { running = false; if (again && !stopped) { again = false; void read(); } }
    }
    load.current = () => void read(); void read();
    const timer = setInterval(() => void read(), 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [engagement, live]);
  useEffect(() => { if (version === undefined) return; const t = setTimeout(() => load.current(), 150); return () => clearTimeout(t); }, [version]);
  const press = useCallback(async (action: FourAction, extra: Record<string, unknown>) => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/control/${engagement}/four-lists`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: pressId(), action, ...extra }) });
      const data = await response.json() as { status: string };
      setMessage(fourMessage(data.status)); load.current();
    } catch { setMessage(fourMessage("unavailable")); }
    finally { setBusy(false); }
  }, [engagement]);
  const s = status?.session, cards = status?.cards ?? [];
  if (!s) return null;
  const card = (c: FourCard) => <li key={c.id} className={`fl-rcard${c.hidden ? " is-hidden" : ""}`} data-fl-card={c.id}>
    <div className="fl-rtop"><b>{c.text}</b>{!c.hidden && <span className="fl-rag" aria-label={agreeLabel(c.agree)}><ArrowUp aria-hidden="true" />{c.agree}</span>}</div>
    <p className="fl-rmeta">{c.hidden ? <span>Hidden</span> : null}{c.pinned ? <span>Pinned</span> : null}{c.rank > 4 && !c.hidden ? <span>On phones only</span> : null}
      {c.folded > 0 && <span>{c.ai ? <><AiMark label="Combined by AI" />{" "}</> : null}{c.folded + 1} cards</span>}</p>
    {c.members && c.members.length > 0 && <ul className="fl-rmembers" aria-label="Folded into this card">{c.members.map(m => <li key={m.id}>
      <span>{m.by === "ai" && <AiMark label="Combined by AI" />} {foldLabel[m.by] ?? "Folded"}: {m.text}</span>
      <button className="show-button is-small" disabled={busy} onClick={() => void press("undo_fold", { merge: m.merge })}><Undo2 size={16} aria-hidden="true" />Undo fold</button></li>)}</ul>}
    <div className="fl-ractions">
      {c.hidden ? <button className="show-button is-small" disabled={busy} onClick={() => void press("unhide", { card: c.id })}><Eye size={16} aria-hidden="true" />Unhide</button>
        : <>
          <button className="show-button is-small" disabled={busy} onClick={() => void press(c.pinned ? "unpin" : "pin", { card: c.id })}>{c.pinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}{c.pinned ? "Unpin" : "Pin"}</button>
          <button className="show-button is-small" disabled={busy} onClick={() => void press("hide", { card: c.id })}><EyeOff size={16} aria-hidden="true" />Hide</button></>}
    </div>
  </li>;
  return <section className="ctl-items" aria-labelledby={headingId} data-fl-panel>
    <div className="ctl-row is-between"><h2 id={headingId}>Cards by list</h2>{onClose && <button className="show-button is-icon" aria-label="Close cards" onClick={onClose}><X size={20} aria-hidden="true" /></button>}</div>
    <p className="show-help">{s.title}{s.live ? " · on the TV" : ""}. Names never show. Pin keeps a card as it is, so AI never folds it.</p>
    {status?.counts && <div className="fl-meter"><span><b>{status.counts.cards}</b> cards</span><span><b>{status.counts.folded}</b> folded</span>{status.counts.hidden > 0 && <span><b>{status.counts.hidden}</b> hidden</span>}</div>}
    {message && <p className="show-message is-error" role="alert">{message}</p>}
    {cards.length ? <div className="fl-ctl-cols">{fourColumns.map(col => {
      const mine = cards.filter(c => c.column === col && !c.hidden);
      return <div key={col} className="fl-rcol"><h3>{columnLabels[col]}<span>{mine.length}</span></h3><ul className="fl-rcol">{mine.map(card)}</ul></div>;
    })}</div> : <p className="show-empty">No cards yet.</p>}
    {cards.some(c => c.hidden) && <><h3 className="fl-sub">Hidden</h3><ul className="fl-rcol">{cards.filter(c => c.hidden).map(card)}</ul></>}
  </section>;
}
