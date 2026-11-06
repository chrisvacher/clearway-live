"use client";
import { useState } from "react";
import { Bookmark, ChevronLeft, Info, MessageCircleQuestion, Undo2, X } from "lucide-react";
import { askMax, roomText, signalKinds, signalSourceLabel, strengthText, weightText, type SignalCardData } from "@/lib/interactions/signal";
import { SignalDisc } from "./signal-card";
import type { useSignal } from "./use-signal";

// The evidence behind one card: the theme with its strength and sources, and the room's input that triggered it. Then the
// facilitator's choices: dismiss, save an aligned card as a citation, or Ask the room (edit the suggested wording first).
export function SignalDetail({ card, ask, busy, press, onBack, onDismiss }: {
  card: SignalCardData; ask: { text: string; signal: string | null } | null; busy: boolean; press: ReturnType<typeof useSignal>["press"]; onBack: () => void; onDismiss: (id: string) => void;
}) {
  const [text, setText] = useState(card.ask ?? "");
  const e = card.evidence, onTv = Boolean(ask) && ask?.signal === card.id;
  return <div className={`cwl-sg-detail is-${card.kind}`} data-signal-detail={card.kind}>
    <button type="button" className="show-button is-small" onClick={onBack}><ChevronLeft size={16} aria-hidden="true" />See all signals</button>
    <div className="cwl-signal"><SignalDisc kind={card.kind} /><div className="b"><span className="cwl-sg-kind">{signalKinds[card.kind].label}</span><span className="cwl-sg-theme">{card.title}</span></div></div>
    <p className="ln">{card.line}</p>
    <p className="cwl-sg-h">Theme from Discover</p>
    <div className="cwl-sg-ev">
      <div className="r"><b>{e.theme.label}</b><span>{weightText(e.theme)} · {strengthText(e.theme)} · {signalSourceLabel(e.theme.source)}</span></div>
      {e.theme.detail && <div className="r"><span>{e.theme.detail}</span></div>}
      {e.theme.quotes.map((q, i) => <div className="r" key={i}><span>{q}</span></div>)}
      {e.also.map(a => <div className="r" key={a.id}><b>Also: {a.label}</b><span>{strengthText(a)} · {signalSourceLabel(a.source)}</span></div>)}
    </div>
    <p className="cwl-sg-h">What the room said</p>
    <div className="cwl-sg-ev"><div className="r is-room"><b>{roomText(e)}</b>{e.room.samples.length === 0 && <span>{e.phones_down ? "Phones are down, and nothing has touched this theme." : "Nothing yet."}</span>}</div></div>
    {e.room.samples.length > 0 && <ul className="cwl-sg-said">{e.room.samples.map((s, i) => <li key={i}>{s}</li>)}</ul>}
    <p className="cwl-sg-fine"><Info className="cwl-icon" aria-hidden="true" />A suggestion from AI, not a correction. Only you see it.</p>
    {card.kind !== "silent" && <p className="cwl-sg-fine">Words from the room are shown as written, with no names.</p>}
    <label className="cwl-sg-h" htmlFor={`sg-ask-${card.id}`}>Ask the room</label>
    <textarea id={`sg-ask-${card.id}`} className="cwl-sg-q" value={text} maxLength={askMax} rows={2} placeholder="Write a neutral question, with no theme or figure in it" onChange={event => setText(event.target.value)} />
    <div className="cwl-sg-acts">
      <button type="button" className="show-button is-small is-primary" disabled={busy || !text.trim() || onTv} onClick={() => void press("ask", { signal: card.id, text })}><MessageCircleQuestion size={16} aria-hidden="true" />{onTv ? "Question is on the TV" : "Put the question up"}</button>
      {onTv && <button type="button" className="show-button is-small" disabled={busy} onClick={() => void press("back")}><Undo2 size={16} aria-hidden="true" />Back to the session</button>}
      {card.kind === "aligned" && <button type="button" className="show-button is-small" disabled={busy || card.saved} onClick={() => void press("save_citation", { signal: card.id })}><Bookmark size={16} aria-hidden="true" />{card.saved ? "Saved as a citation" : "Save as a citation"}</button>}
      <button type="button" className="show-button is-small" disabled={busy} onClick={() => { onDismiss(card.id); onBack(); }}><X size={16} aria-hidden="true" />Dismiss</button>
    </div>
    <p className="cwl-sg-fine">The TV shows only the question: no theme, figure or signal. Phones keep the live step.</p>
  </div>;
}
