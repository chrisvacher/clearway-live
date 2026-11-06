"use client";
import "./four-lists.css";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Check, Plus, RefreshCw, WifiOff } from "lucide-react";
import type { PhoneInputProps } from "@/components/interactions/phone-inputs";
import { agreeMessages, agreeWords, cardValue, cardsLeft, checkCard, columnOf, limitLine, listHints, listKeys, listNames, phoneCardsOf, withAgreement,
  type ListKey, type PhoneCard } from "@/lib/interactions/four-lists";

const statusLabel = { sent: "Sent", saved: "Saved on this phone", sending: "Sending", failed: "Not sent" } as const;

// Everyone's cards for the step, read from the server (never through AI): again on each room version and on a slow
// backstop, so a self-paced step follows too. Agreeing sets one state, shown at once and put back if the room says no.
function useLists(engagement: string | null | undefined, session: string, version: number | undefined) {
  const [cards, setCards] = useState<PhoneCard[]>([]), [ready, setReady] = useState(false), [notice, setNotice] = useState("");
  const busy = useRef(false), again = useRef(false), pending = useRef(new Map<string, boolean>());
  const read = useCallback(async () => {
    if (!engagement) return;
    if (busy.current) { again.current = true; return; }
    busy.current = true;
    try {
      const response = await fetch(`/api/live/${engagement}/lists?session=${session}`, { cache: "no-store" });
      if (response.ok) {
        const next = phoneCardsOf(await response.json());
        // A tap the room has not answered yet stays as the person made it.
        setCards(next.map(c => pending.current.has(c.id) && c.mine !== pending.current.get(c.id) ? withAgreement([c], c.id, pending.current.get(c.id)!)[0] : c)); setReady(true);
      }
    } catch { /* Keep what is shown. */ } finally {
      busy.current = false;
      if (again.current) { again.current = false; void read(); }
    }
  }, [engagement, session]);
  useEffect(() => { void read(); const timer = setInterval(() => void read(), 6000); return () => clearInterval(timer); }, [read]);
  useEffect(() => { if (version === undefined) return; const timer = setTimeout(() => void read(), 150); return () => clearTimeout(timer); }, [version, read]);
  const agree = useCallback(async (card: PhoneCard) => {
    if (!engagement || pending.current.has(card.id)) return;
    const on = !card.mine; pending.current.set(card.id, on); setNotice("");
    setCards(list => withAgreement(list, card.id, on));
    try {
      const response = await fetch(`/api/live/${engagement}/agree`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card: card.id, on }) });
      const data = await response.json().catch(() => ({ status: "unavailable" })) as { status: string; count?: number };
      pending.current.delete(card.id);
      if (data.status === "accepted") setCards(list => list.map(c => c.id === card.id ? { ...c, mine: on, agree: typeof data.count === "number" ? data.count : c.agree } : c));
      else { setCards(list => withAgreement(list, card.id, !on)); setNotice(agreeMessages[data.status] ?? agreeMessages.unavailable); }
    } catch {
      pending.current.delete(card.id); setCards(list => withAgreement(list, card.id, !on)); setNotice(agreeMessages.unavailable);
    }
  }, [engagement]);
  return { cards, ready, notice, agree };
}

// INT-11 on the phone: pick a list, write a card (200 characters, anonymous), then see everyone's cards by list and tap to
// agree with the ones you share. One agreement per person per card, undone with a second tap, never on your own card.
// Cards go through the phone's outbox like every answer, so a lost connection loses nothing.
export function FourListsComposer({ step, mine, open, send, engagement, frame }: PhoneInputProps) {
  const lists = useLists(engagement ?? frame?.state.engagement_id, step.id, frame?.session?.id === step.id ? frame.version : undefined);
  const [column, setColumn] = useState<ListKey>("right"), [draft, setDraft] = useState("");
  const max = Math.min(step.max_characters || 200, 200), check = checkCard(draft, max);
  const own = mine.filter(a => !a.withdrawn), used = own.length, left = cardsLeft(used, step.max_sends), atLimit = left === 0;
  const unseen = own.filter(a => !lists.cards.some(c => c.id === a.id));
  function add(event: FormEvent) {
    event.preventDefault();
    if (!open || !check.ok || atLimit) return;
    send({ text: draft.trim(), value: cardValue(column) }); setDraft("");
  }
  return <div className="fl-ph">
    {open && <form className="fl-ph" onSubmit={add} aria-label="Add a card">
      <fieldset className="fl-pick"><legend>Which list?</legend>
        {listKeys.map(key => <label key={key}><input type="radio" name="fl-list" value={key} checked={column === key} onChange={() => setColumn(key)} />{column === key && <Check size={16} aria-hidden="true" />}{listNames[key]}</label>)}
      </fieldset>
      <p className="fl-hint">{listHints[column]}</p>
      <label className="ph-label" htmlFor="fl-card">Your card</label>
      <textarea id="fl-card" className="ph-input" rows={2} value={draft} placeholder="One thing, a few words" disabled={atLimit} aria-invalid={Boolean(check.message)} aria-describedby="fl-count" onChange={e => setDraft(e.target.value)} />
      <p className="ph-count" id="fl-count" aria-live="polite"><span>{check.message || limitLine(used, step.max_sends)}</span><span>{check.count}/{max}</span></p>
      <div className="ph-actions"><button className="ph-send" disabled={!check.ok || atLimit}><Plus size={18} aria-hidden="true" />Add to list</button></div>
    </form>}
    {!open && <p className="ph-muted" role="status">This step is not taking new cards. You can still read them.</p>}
    {lists.notice && <p className="ph-muted" role="status">{lists.notice}</p>}
    {unseen.length > 0 && <ul className="fl-others" aria-label="Your cards waiting to send">{unseen.map(a => <li key={a.id} className="fl-row"><span className="fl-rt">{a.text}<small>{columnOf(a.value) ? listNames[columnOf(a.value)!] : ""}</small></span>
      <span className="fl-mine">{a.status === "saved" ? <WifiOff size={14} aria-hidden="true" /> : a.status === "sending" ? <RefreshCw size={14} aria-hidden="true" /> : null}Yours · {statusLabel[a.status]}</span></li>)}</ul>}
    {listKeys.map(key => {
      const cards = lists.cards.filter(c => c.col === key);
      return <section key={key} aria-labelledby={`fl-p-${key}`}>
        <p className="fl-others-head" id={`fl-p-${key}`}>{listNames[key]} · {cards.length}</p>
        {cards.length > 0 ? <ul className="fl-others">{cards.map(c => <li key={c.id} className="fl-row" data-card={c.id}>
          <span className="fl-rt">{c.text}<small>{c.own ? `Yours · ${agreeWords(c.agree)}` : agreeWords(c.agree)}</small></span>
          {!c.own && <button type="button" className="fl-agree-btn" aria-pressed={c.mine} disabled={!open} aria-label={`${c.mine ? "Take back your agreement with" : "Agree with"} ${c.text}`} onClick={() => void lists.agree(c)}>
            {c.mine ? <Check aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}{c.mine ? "Agreed" : "Agree"}</button>}
        </li>)}</ul> : <p className="ph-muted">{lists.ready ? "No cards yet." : "Loading the cards."}</p>}
      </section>;
    })}
  </div>;
}
