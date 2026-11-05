"use client";
import { useState } from "react";
import { Presentation, Shuffle, UserMinus, X } from "lucide-react";
import type { ControlItemsProps } from "@/components/interactions/control-items";
import { cardNeeds, cardsOf, maxPeople } from "@/lib/interactions/intent";
import { post, useIntent } from "./use-intent";
import { pressId } from "@/lib/control/own-presses";
import "./handover.css";

const messages: Record<string, string> = {
  moved: "The room moved on. Check what is live and try again.", invalid_state: "That can’t be done on this step now.", missing: "That card or person is no longer there.",
  denied: "That isn’t yours to press.", unavailable: "The room didn’t answer. Try again.", outside_block: "That is outside your block.", closed: "This engagement has closed.",
};

// The commander's intent cards on the control surface: who works each, Present one card at full size,
// and Affirm together. Pairs are set here or picked on phones, as the step is set up.
export function IntentCards({ room, onClose }: ControlItemsProps) {
  const engagement = room.frame?.state.engagement_id ?? "", cards = cardsOf(room.frame?.state.results);
  const { view, read } = useIntent(`/api/control/${engagement}/intent`, room.frame?.version);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const spot = room.frame?.state.spotlight_key ?? null;
  const signs = room.show.sessions.filter(s => s.interaction === "sign");
  const press = async (action: string, p: Record<string, unknown> = {}) => {
    if (!engagement) return; setBusy(true); setMessage("");
    const out = await post(`/api/control/${engagement}/intent`, { kind: "press", id: pressId(), action: `intent_${action}`, p: { from: room.frame?.state.live_session_id ?? null, ...p } });
    setBusy(false); void read();
    if (!["ok", "unchanged", "duplicate"].includes(out.status)) setMessage(messages[out.status] ?? messages.unavailable);
  };
  const people = view?.people ?? [];
  return <section aria-labelledby="ctl-items-title">
    <div className="ctl-row is-between"><h2 id="ctl-items-title">Outcome cards</h2>{onClose && <button className="show-button is-icon" aria-label="Close outcome cards" onClick={onClose}><X size={20} aria-hidden="true" /></button>}</div>
    <p className="show-help">One card for each Vision Outcome. Pairs are first names, only here and on phones.</p>
    {message && <p className="show-message is-error" role="alert">{message}</p>}
    <div className="hi-row">
      <button type="button" className="show-button is-small" disabled={busy} onClick={() => void press("auto")}><Shuffle size={16} aria-hidden="true" />Pair everyone</button>
      <button type="button" className="show-button is-small" disabled={busy} onClick={() => void press("clear")}><UserMinus size={16} aria-hidden="true" />Clear pairs</button>
      {spot && <button type="button" className="show-button is-small" disabled={busy} onClick={() => void press("present", { card: null })}>Show all cards</button>}
    </div>
    <ul className="hi-list">{cards.map(c => {
      const pair = view?.cards.find(x => x.id === c.id)?.pair ?? [], bad = c.steps.filter(s => s.missing.length);
      return <li key={c.id} className="hi-item">
        <div><b>{c.number}. {c.title}</b><small>{c.filled} of 4 filled{bad.length ? ` · ${cardNeeds(bad)}` : ""}</small></div>
        <div className="hi-pair">{[0, 1, 2].slice(0, maxPeople).map(i => <select key={i} aria-label={`Person ${i + 1} on card ${c.number}`} disabled={busy} value={pair[i]?.id ?? ""}
          onChange={e => { const ids = [...pair.map(x => x.id)]; if (e.target.value) ids[i] = e.target.value; else ids.splice(i, 1); void press("assign", { card: c.id, attendees: [...new Set(ids.filter(Boolean))] }); }}>
          <option value="">No one</option>{people.map(p => <option key={p.id} value={p.id}>{p.first}</option>)}</select>)}</div>
        <button type="button" className="show-button is-small" disabled={busy || spot === c.id} onClick={() => void press("present", { card: c.id })}><Presentation size={16} aria-hidden="true" />{spot === c.id ? "On the TV" : "Present"}</button>
      </li>;
    })}</ul>
    {signs.length > 0 && <div className="hi-row"><p className="show-help">Affirm together signs these cards as one text.</p>
      {signs.map(s => <button key={s.id} type="button" className="show-button is-small" disabled={busy} onClick={() => void press("affirm_text", { session: s.id })}>Fill “{s.title}”</button>)}</div>}
  </section>;
}
