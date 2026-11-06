"use client";
import { useEffect, useRef, useState } from "react";
import { EyeOff, Info, MessageCircleQuestion, Undo2, VolumeX } from "lucide-react";
import type { Room } from "@/components/control/live-controls";
import { signalKinds, type SignalCardData, type SignalState } from "@/lib/interactions/signal";
import { SignalCard, SignalDisc } from "./signal-card";
import { SignalDetail } from "./signal-detail";
import { useSignal } from "./use-signal";
import "./signal.css";

// How long a dismissed card takes to fade and close up (the design's cwl-dur-hide), read from the token so one number rules.
const hideMs = () => { const v = typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue("--cwl-dur-hide").trim(); const n = parseFloat(v); return Number.isFinite(n) ? (v.endsWith("ms") ? n : n * 1000) : 400; };

// The cards on show: the server's list, plus a dismissed card that is still fading out, so the list closes up after it, not before.
function useCards(status: SignalState | null) {
  const cards = status?.signals ?? [];
  const known = useRef<Set<string> | null>(null), arrived = useRef<Set<string>>(new Set());
  const [ghosts, setGhosts] = useState<{ card: SignalCardData; index: number }[]>([]);
  const ids = cards.map(c => c.id).join(",");
  // Only a card that comes in after the panel was first read arrives with the soft rise; what was there already is just there.
  if (status && known.current) for (const c of cards) if (!known.current.has(c.id)) arrived.current.add(c.id);
  useEffect(() => { if (status) known.current = new Set([...(known.current ?? []), ...cards.map(c => c.id)]); }, [status, ids]); // eslint-disable-line react-hooks/exhaustive-deps
  const leave = (card: SignalCardData) => {
    const index = cards.findIndex(c => c.id === card.id);
    setGhosts(g => [...g.filter(x => x.card.id !== card.id), { card, index: Math.max(0, index) }]);
    setTimeout(() => setGhosts(g => g.filter(x => x.card.id !== card.id)), hideMs() + 60);
  };
  const shown = cards.map(card => ({ card, leaving: ghosts.some(g => g.card.id === card.id) }));
  for (const g of [...ghosts].sort((a, b) => a.index - b.index)) if (!cards.some(c => c.id === g.card.id)) shown.splice(Math.min(g.index, shown.length), 0, { card: g.card, leaving: true });
  return { shown, arrived: arrived.current, leave };
}

export function QuestionStrip({ status, busy, press }: { status: SignalState; busy: boolean; press: ReturnType<typeof useSignal>["press"] }) {
  if (!status.ask) return null;
  return <div className="cwl-sg-onTv" role="status" data-signal-ask><MessageCircleQuestion className="cwl-icon" aria-hidden="true" />
    <span>Question on the TV: {status.ask.text}</span>
    <button type="button" className="show-button is-small" disabled={busy} onClick={() => void press("back")}><Undo2 size={16} aria-hidden="true" />Back to the session</button></div>;
}

// FAC-02 on the laptop: the alignment signal for the step on the TV. Private to the lead and the co-facilitator. If the read
// is not there it renders nothing, so the control surface is as it was.
export function SignalPanel({ room }: { room: Room }) {
  const { status, busy, message, press } = useSignal(room);
  const { shown, arrived, leave } = useCards(status);
  const [open, setOpen] = useState<string | null>(null);
  if (!status || !status.session || !status.session.live || !status.session.eligible) return null;
  const s = status.session, detail = status.signals.find(c => c.id === open) ?? null;
  const dismiss = (id: string) => { const card = status.signals.find(c => c.id === id); if (card) leave(card); void press("dismiss", { signal: id }); };
  const body = !status.engagement_ai || !s.ai ? <div className="cwl-sg-empty"><Info className="cwl-icon" aria-hidden="true" /><div><b>The signal is off</b><span>It runs while AI is on for this step.</span></div></div>
    : status.themes === 0 ? <div className="cwl-sg-empty"><Info className="cwl-icon" aria-hidden="true" /><div><b>No accepted themes yet</b><span>The signal starts once themes are accepted in Discover.</span></div></div>
    : detail ? <SignalDetail key={detail.id} card={detail} ask={status.ask} busy={busy} press={press} onBack={() => setOpen(null)} onDismiss={dismiss} />
    : <>
      {shown.length === 0 && <div className="cwl-sg-empty"><Info className="cwl-icon" aria-hidden="true" /><div><b>{status.state.running ? "Reading the room" : "Nothing stands out yet"}</b><span>Cards show when the room lines up with Discover, heads another way, or goes quiet on a strong theme.</span></div></div>}
      {shown.length > 0 && <ul className="cwl-sg-list" aria-label="Signal cards">{shown.map(({ card, leaving }) => <SignalCard key={card.id} card={card} arriving={arrived.has(card.id)} leaving={leaving} onOpen={() => setOpen(card.id)} />)}</ul>}
      {status.held > 0 && <p className="cwl-sg-heldnote"><VolumeX className="cwl-icon" aria-hidden="true" />{status.held === 1 ? "1 silent theme waits" : `${status.held} silent themes wait`} until phones first go down in this step.</p>}
    </>;
  return <section className="ctl-private" aria-label="Alignment signal, only you see this" data-signal-panel>
    <div className="show-private"><EyeOff size={16} aria-hidden="true" />Only you see this<span>Alignment signal</span></div>
    <div className="ctl-private-body cwl-sg-panel">
      <div className="cwl-sg-meta"><span>{s.title}</span><span>{status.signals.length === 1 ? "1 card" : `${status.signals.length} cards`}</span></div>
      {status.team && <p className="cwl-sg-fine"><Info className="cwl-icon" aria-hidden="true" />{status.team} has the remote. The cards stay here.</p>}
      <QuestionStrip status={status} busy={busy} press={press} />
      {body}
      {message && <p className="show-message is-error" role="alert">{message}</p>}
    </div>
  </section>;
}

// FAC-03: a short list on the facilitator's own remote, so the cards work with the laptop closed. Each opens to its line, with
// Put the question up and Dismiss. No evidence view: that is the laptop's.
export function SignalList({ room }: { room: Room }) {
  const { status, busy, message, press } = useSignal(room);
  const { shown, arrived, leave } = useCards(status);
  const [open, setOpen] = useState<string | null>(null);
  if (!status || !status.session || !status.session.live || !status.session.eligible || !status.engagement_ai || !status.session.ai || status.themes === 0) return null;
  const dismiss = (card: SignalCardData) => { leave(card); void press("dismiss", { signal: card.id }); };
  return <section className="ctl-private" aria-label="Alignment signal, only you see this" data-signal-list>
    <div className="show-private"><EyeOff size={16} aria-hidden="true" />Only you see this<span>Alignment signal</span></div>
    <div className="ctl-private-body"><div className="cwl-sg-rlist">
      <div className="cwl-sg-rhead"><Info className="cwl-icon" aria-hidden="true" />Signal<span>{status.signals.length}</span></div>
      <QuestionStrip status={status} busy={busy} press={press} />
      {shown.length === 0 && <p className="cwl-sg-rnone">{status.state.running ? "Reading the room." : "Nothing stands out yet."}</p>}
      {shown.map(({ card, leaving }) => <div key={card.id} className={`cwl-sg-ritem cwl-sg-item is-${card.kind}${arrived.has(card.id) ? " is-arriving" : ""}${leaving ? " is-leaving" : ""}`} data-signal={card.kind} data-signal-id={card.id}>
        <button type="button" className="row" onClick={() => setOpen(open === card.id ? null : card.id)} aria-expanded={open === card.id} disabled={leaving}>
          <SignalDisc kind={card.kind} /><span className="t"><b>{signalKinds[card.kind].label}</b>{card.title}</span></button>
        {open === card.id && <>
          <p className="ln">{card.line}</p>
          <div className="cwl-sg-acts">
            {card.ask && <button type="button" className="show-button is-small is-primary" disabled={busy || (status.ask?.signal === card.id)} onClick={() => void press("ask", { signal: card.id })}><MessageCircleQuestion size={16} aria-hidden="true" />{status.ask?.signal === card.id ? "Question is on the TV" : "Put the question up"}</button>}
            <button type="button" className="show-button is-small" disabled={busy} onClick={() => dismiss(card)}>Dismiss</button>
          </div>
        </>}
      </div>)}
      {message && <p className="show-message is-error" role="alert">{message}</p>}
    </div></div>
  </section>;
}
