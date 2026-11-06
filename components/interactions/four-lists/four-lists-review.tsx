"use client";
import "./four-lists.css";
import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowUp, Check, Merge, Pencil, Undo2, X } from "lucide-react";
import { canFeedTensions, listKeys, listNames, mergedInto, reviewCounts, reviewMessages, reviewOf, standing, type ListKey, type Review, type ReviewCard } from "@/lib/interactions/four-lists";
import { AiMark } from "@/components/interactions/ai/ai-icon";

// SET-05: the review after the session. Four columns, one card each, with the agreement count. A facilitator edits the words
// (the original stays on record), merges cards of one list into one, keeps a card or sets it aside, and marks which cards feed What
// We Heard and which feed Strategic Tensions. Every press saves at once; the marks wait for step 4 (What We Heard).
export function FourListsReview({ engagement, initial }: { engagement: string; initial: Review }) {
  const [review, setReview] = useState(initial), [picked, setPicked] = useState<string[]>([]), [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [saved, setSaved] = useState("");
  const cards = review.cards, counts = reviewCounts(cards);
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/control/${engagement}/lists?session=${review.session}`, { cache: "no-store" });
    const next = response.ok ? reviewOf(await response.json()) : null;
    if (next) setReview(next);
  }, [engagement, review.session]);
  async function press(body: Record<string, unknown>, done: string) {
    setBusy(true); setMessage(""); setSaved("");
    try {
      const response = await fetch(`/api/control/${engagement}/lists`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session: review.session, ...body }) });
      const data = await response.json().catch(() => ({ status: "unavailable" })) as { status: string };
      if (data.status === "ok") { setSaved(done); await refresh(); return true; }
      setMessage(reviewMessages[data.status] ?? reviewMessages.unavailable); return false;
    } catch { setMessage(reviewMessages.unavailable); return false; } finally { setBusy(false); }
  }
  const pickedCol = picked.length ? cards.find(c => c.id === picked[0])?.col : null;
  const toggle = (card: ReviewCard) => setPicked(list => list.includes(card.id) ? list.filter(id => id !== card.id) : card.col === pickedCol || !list.length ? [...list, card.id] : [card.id]);
  // A mark shows at once and is put back if the room says no.
  const mark = async (card: ReviewCard, heard: boolean, tensions: boolean) => {
    const was = review;
    setReview({ ...review, cards: review.cards.map(c => c.id === card.id ? { ...c, heard, tensions } : c) });
    if (!await press({ action: "mark", card: card.id, heard, tensions }, "Marks saved.")) setReview(was);
  };

  const card = (card: ReviewCard) => {
    const merged = mergedInto(cards, card.id), on = picked.includes(card.id), isEditing = editing?.id === card.id;
    return <li key={card.id} className={`fl-rcard${on ? " is-selected" : ""}${card.kept ? "" : " is-aside"}`} data-card={card.id}>
      {isEditing ? <form onSubmit={e => { e.preventDefault(); void press({ action: "edit", card: card.id, text: editing!.text }, "Words saved.").then(ok => { if (ok) setEditing(null); }); }}>
        <label className="ph-label" htmlFor={`fl-e-${card.id}`}>Words for this card</label>
        <textarea id={`fl-e-${card.id}`} value={editing!.text} maxLength={200} autoFocus onChange={e => setEditing({ id: card.id, text: e.target.value })} />
        <div className="to"><button className="show-button is-small is-primary" disabled={busy || !editing!.text.trim()}><Check size={16} aria-hidden="true" />Save words</button>
          <button type="button" className="show-button is-small" onClick={() => setEditing(null)}><X size={16} aria-hidden="true" />Cancel</button></div>
      </form> : <div className="top"><b>{card.text}</b><span className="ag" aria-label={`${card.agree} agree`}><ArrowUp aria-hidden="true" />{card.agree}</span></div>}
      {card.edited && !isEditing && <p className="sub">Edited. Original: {card.original}</p>}
      {card.hidden && <p className="sub">Hidden from the TV during the session.</p>}
      {merged.length > 0 && <ul className="merged" aria-label="Merged into this card">{merged.map(m => <li key={m.id}>{m.text}
        <button type="button" className="show-button is-small" disabled={busy} onClick={() => void press({ action: "unmerge", card: m.id }, "Card taken out.")}><Undo2 size={14} aria-hidden="true" />Take out</button></li>)}</ul>}
      {!isEditing && <div className="to">
        <label className="fl-mark"><input type="checkbox" checked={on} onChange={() => toggle(card)} />Select to merge</label>
        <button type="button" className="show-button is-small" disabled={busy} onClick={() => setEditing({ id: card.id, text: card.text })}><Pencil size={14} aria-hidden="true" />Edit words</button>
        <button type="button" className="show-button is-small" disabled={busy} onClick={() => void press({ action: "keep", card: card.id, kept: !card.kept }, card.kept ? "Card set aside." : "Card kept.")}>{card.kept ? "Set aside" : "Keep"}</button>
      </div>}
      {card.kept && !isEditing && <div className="to">
        <label className="fl-mark"><input type="checkbox" checked={card.heard} disabled={busy} onChange={e => void mark(card, e.target.checked, card.tensions)} />Feeds What We Heard</label>
        {canFeedTensions(card.col) && <label className="fl-mark"><input type="checkbox" checked={card.tensions} disabled={busy} onChange={e => void mark(card, card.heard, e.target.checked)} />Feeds Strategic Tensions</label>}
      </div>}
    </li>;
  }

  return <main className="fl-review" data-review="four_lists">
    <div className="fl-review-top">
      <div><h1>{review.title || "Four Helpful Lists"}: review</h1>
        <p className="fl-review-meta">{review.took_part} {review.took_part === 1 ? "person" : "people"} took part · {counts.kept} cards kept{counts.aside ? ` · ${counts.aside} set aside` : ""} · {counts.heard} feed What We Heard · {counts.tensions} feed Strategic Tensions</p></div>
      <div className="fl-review-actions">
        {review.ai && <span className="fl-ai"><AiMark label="AI" />Grouping was on in the room. Merging here is yours.</span>}
        <button type="button" className="show-button is-primary" disabled={busy || picked.length < 2} onClick={() => void press({ action: "merge", cards: picked }, "Cards merged.").then(ok => { if (ok) setPicked([]); })}><Merge size={16} aria-hidden="true" />Merge {picked.length > 1 ? `${picked.length} selected` : "selected"}</button>
        <Link className="show-button" href={`/control/${engagement}`}>Back to the control surface</Link>
      </div>
    </div>
    <p className="show-help">Only you see this. The first selected card keeps its words; the others join it and their agreement adds. The marks are saved for What We Heard.</p>
    {message && <p className="show-message is-error" role="alert">{message}</p>}
    <p className="show-help" role="status" aria-live="polite">{saved}</p>
    <div className="fl-review-grid">
      {listKeys.map((key: ListKey) => {
        const here = cards.filter(c => c.col === key && !c.merged_into);
        return <section key={key} className="fl-rcol" data-col={key} aria-labelledby={`fl-r-${key}`}>
          <h2 id={`fl-r-${key}`}><span>{listNames[key]}</span><span>{standing(cards).filter(c => c.col === key).length}</span></h2>
          {here.length ? <ul className="fl-rlist">{here.map(c => card(c))}</ul> : <p className="show-empty">No cards.</p>}
        </section>;
      })}
    </div>
  </main>;
}
