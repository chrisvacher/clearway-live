import { ArrowUp, Download } from "lucide-react";
import { agreeLabel, columnLabels, reviewColumns, type FourReview } from "@/lib/interactions/four-lists";
import { AiMark } from "@/components/interactions/ai/ai-icon";
import "./four-lists.css";

// SET-05: every card of every Four Helpful Lists step, by list, with how many people agree and what was folded into it. Read only:
// changes are made on the live control surface. It names no one: the database never sends a person with a card.
export function FourListsReview({ review, engagement }: { review: FourReview; engagement: string }) {
  return <div className="fl-review" data-fl-review>
    <div className="ctl-row is-between"><p className="show-help">Read only. Names never show. Pin, hide and undo a fold on the live control surface.</p>
      <a className="show-button" href={`/api/control/${engagement}/four-lists/export`} download><Download size={18} aria-hidden="true" />Download CSV</a></div>
    {review.sessions.length === 0 && <p className="show-empty">This engagement has no Four Helpful Lists step yet. Add one from the run of show.</p>}
    {review.sessions.map(s => {
      const total = s.cards.filter(c => !c.hidden).reduce((n, c) => n + 1 + c.folded, 0);
      return <section key={s.id} className="fl-review-step" aria-labelledby={`fl-${s.id}`}>
        <h2 id={`fl-${s.id}`}>{s.title}</h2>
        <p className="show-help">{s.part} · {total} {total === 1 ? "card" : "cards"} from {s.people} {s.people === 1 ? "person" : "people"}</p>
        <div className="fl-review-grid">{reviewColumns(s.cards).map(col => <div key={col.column} className="fl-rcol">
          <h3>{col.label}<span>{col.cards.length}</span></h3>
          {col.cards.length === 0 && <p className="show-empty">No cards.</p>}
          <ul className="fl-rcol" aria-label={columnLabels[col.column]}>{col.cards.map(c => <li key={c.id} className="fl-rcard">
            <div className="fl-rtop"><b>{c.text}</b><span className="fl-rag" aria-label={agreeLabel(c.agree)}><ArrowUp aria-hidden="true" />{c.agree}</span></div>
            {(c.folded > 0 || c.pinned) && <p className="fl-rmeta">{c.pinned ? <span>Pinned</span> : null}{c.folded > 0 && <span>{c.ai ? <AiMark label="Combined by AI" /> : null} {c.folded + 1} cards</span>}</p>}
            {c.members.length > 0 && <ul className="fl-rmembers" aria-label="Folded into this card">{c.members.map(m => <li key={m.id}><span>{m.by === "ai" ? "Combined by AI" : "Matching words"}: {m.text}</span></li>)}</ul>}
          </li>)}</ul>
          {col.hidden.length > 0 && <p className="fl-rmeta">{col.hidden.length} hidden from the TV</p>}
        </div>)}</div>
      </section>;
    })}
  </div>;
}
