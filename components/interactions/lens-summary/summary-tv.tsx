"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { TvViewProps } from "@/components/interactions/tv-views";
import { AiMark, useAiSweep } from "@/components/interactions/ai/ai-icon";
import { LensHeading } from "@/components/wayfinding/lens-icon";
import { caretMs, leaveMs, moreOnPhones, reconcile, shownLines, shownSuggestions, struckHoldMs, summaryOf, type Part, type Row } from "@/lib/interactions/lens-summary";
import "@/components/interactions/ai/ai.css";
import "./lens-summary.css";

// INT-18's TV view: one lens's 10-year Future summary on one screen. It is alive. A line the facilitator
// types replaces itself in place in small batches; a fold arrives as a tracked change (underlined words in,
// struck words out after a beat) while the lines glide; a new suggestion lands as an anonymous card. Rows keep
// their place in the page across versions (reconcile), so nothing redraws, resets or waits for a reveal.
const stateLine = { drafting: "AI is drafting the summary", folding: "AI is folding in suggestions" } as const;

function Words({ parts, text, leave }: { parts: Part[] | null; text: string; leave: boolean }) {
  if (!parts) return <>{text}</>;
  return <>{parts.map((p, i) => p.k === "keep" ? <span key={i}>{p.t} </span> : <span key={i} className={`lsm-${p.k}${p.k === "del" && leave ? " is-leaving" : ""}`} data-tc={p.k}>{p.t} </span>)}</>;
}

export function LensSummaryView({ frame }: TvViewProps) {
  const res = useMemo(() => summaryOf(frame?.state.results), [frame?.state.results]);
  const summary = res.summary, shown = summary ? shownLines(summary) : [], versionId = summary?.versionId ?? "";
  const keys = useRef(0), [rows, setRows] = useState<Row[]>([]), [leave, setLeave] = useState(false), [caret, setCaret] = useState<string | null>(null);
  // The signature of what is on screen: the version, and every line's text (a facilitator's edit keeps the version).
  const sign = shown.map(l => `${l.id}:${l.text}`).join("\u0001");
  useEffect(() => {
    if (!summary) { setRows([]); return; }
    setRows(prev => reconcile(prev, shown.map(l => ({ id: l.id, text: l.text })), summary.changes, summary.tracked, () => `r${++keys.current}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId, sign]);
  // Struck words stay readable for a beat, then leave while the paragraph reflows.
  useEffect(() => {
    setLeave(false);
    if (!versionId) return;
    const a = setTimeout(() => setLeave(true), struckHoldMs), b = setTimeout(() => setRows(r => r.some(x => x.state === "gone") ? r.filter(x => x.state !== "gone") : r), struckHoldMs + leaveMs);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [versionId]);
  // The caret follows the line the facilitator is typing and clears itself when they stop.
  useEffect(() => {
    if (!res.typing) return;
    setCaret(res.typing);
    const t = setTimeout(() => setCaret(null), caretMs);
    return () => clearTimeout(t);
  }, [res.typing, sign]);
  const sweep = useAiSweep<HTMLDivElement>(res.aiState === "drafting" || res.aiState === "folding" ? [`${res.aiState}:${versionId}`] : summary?.author === "ai" ? [versionId] : [], res.lens ? String(res.lens) : null);
  const names = res.lens ? Object.assign([] as string[], { [res.lens - 1]: res.lensName }) : null;
  const cards = res.suggestions.slice(0, shownSuggestions), further = Math.max(0, res.tally.suggest - cards.length);
  return <div className="lsm-tv" data-lens-summary data-ai-state={res.aiState} data-signed={summary?.signed ? "true" : "false"}>
    <header className="lsm-head">
      {res.lens && <LensHeading lens={res.lens} names={names} />}
      <ol className="lsm-steps" aria-label="The five lenses">
        {res.lenses.map(l => <li key={l.lens} data-state={l.state} aria-current={l.state === "now" ? "step" : undefined}>{l.state === "signed" ? <Check size={20} aria-hidden="true" /> : null}<span>{l.name}</span></li>)}
      </ol>
    </header>
    <div className="lsm-body">
      <section className="lsm-sheet" aria-label="10-year Future summary">
        <div className="lsm-band" ref={sweep}>
          {summary ? <>
            <span className="lsm-who">{summary.author === "ai" ? <><AiMark /> Drafted by AI</> : "Edited by the facilitator"}</span>
            <span className="lsm-ver">Version {summary.version}</span>
            {summary.signed && <span className="lsm-signed"><Check size={22} aria-hidden="true" /> {summary.decision || "Decided"}</span>}
          </> : <span className="lsm-who"><AiMark /> 10-year Future</span>}
          {(res.aiState === "drafting" || res.aiState === "folding") && summary && <span className="lsm-busy" role="status">{stateLine[res.aiState]}</span>}
        </div>
        {summary ? <ol className="lsm-lines">
          {rows.map(r => <li key={r.key} className={`lsm-line is-${r.state}${r.state === "gone" && leave ? " is-leaving" : ""}`} data-line={r.id} data-state={r.state}>
            <div className="lsm-line-in"><span key={r.rev} className="lsm-text"><Words parts={r.parts} text={r.text} leave={leave} /></span>{caret === r.id && r.state !== "gone" && <span className="lsm-caret" aria-hidden="true" />}</div>
          </li>)}
        </ol> : <p className="lsm-empty" role="status">{stateLine[res.aiState as keyof typeof stateLine] ?? "The summary for this lens is coming up"}{res.lensName ? ` for ${res.lensName}` : ""}</p>}
        {summary && summary.more > 0 && <p className="lsm-more" data-more>{moreOnPhones(summary.more)}</p>}
      </section>
      <aside className="lsm-side" aria-label="What the room says">
        <dl className="lsm-tally" aria-live="polite">
          <div><dt>Approved</dt><dd data-tally="approve">{res.tally.approve}</dd></div>
          <div><dt>Suggested a change</dt><dd data-tally="suggest">{res.tally.suggest}</dd></div>
        </dl>
        <ul className="lsm-cards">
          {cards.map(c => <li key={c.id} className="lsm-card" data-suggestion>{c.text}</li>)}
        </ul>
        {further > 0 && <p className="lsm-more" data-more-suggestions>{moreOnPhones(further)}</p>}
      </aside>
    </div>
  </div>;
}
