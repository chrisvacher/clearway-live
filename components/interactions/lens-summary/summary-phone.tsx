"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, ChevronDown, Send, ThumbsUp } from "lucide-react";
import type { PhoneInputProps } from "@/components/interactions/phone-inputs";
import { AiMark } from "@/components/interactions/ai/ai-icon";
import { LensHeading } from "@/components/wayfinding/lens-icon";
import { approveText, checkSuggestion, ownReply, sourcesOf, summaryOf, type Sources } from "@/lib/interactions/lens-summary";
import "@/components/interactions/ai/ai.css";
import "./lens-summary.css";

// INT-18 on the phone: read the summary on the TV (every line, with the room's sentences it came from),
// then Approve or Suggest a change in a short box. One answer per person for each version. When AI folds
// the suggestions into a new version, the buttons come back for it.
export function LensSummaryInput({ step, mine, open, send, engagement, frame }: PhoneInputProps) {
  const res = useMemo(() => summaryOf(frame?.state.results), [frame?.state.results]);
  const summary = res.summary, versionId = summary?.versionId;
  const [draft, setDraft] = useState(""), [boxOpen, setBoxOpen] = useState(false), [sources, setSources] = useState<Sources>(null), [shownSources, setShownSources] = useState<string | null>(null);
  const reply = ownReply(mine, versionId), check = checkSuggestion(draft);
  // Where each line came from, for this version only (a phone gets it; the TV never does).
  useEffect(() => {
    setSources(null); setShownSources(null);
    if (!engagement || !versionId) return;
    let live = true;
    fetch(`/api/live/${engagement}/summary?session=${step.id}`, { cache: "no-store" }).then(r => r.json()).then(d => { if (live) { const s = sourcesOf(d); setSources(s && s.version === versionId ? s : null); } }).catch(() => undefined);
    return () => { live = false; };
  }, [engagement, step.id, versionId]);
  useEffect(() => { setBoxOpen(false); setDraft(""); }, [versionId]);
  function approve() { if (open && versionId) send({ text: approveText, value: { version: versionId, response: "approve" } }); }
  function suggest(event: FormEvent) {
    event.preventDefault();
    if (!open || !versionId || !check.ok) return;
    send({ text: draft.trim(), value: { version: versionId, response: "suggest" } });
    setBoxOpen(false); setDraft("");
  }
  const names = res.lens ? Object.assign([] as string[], { [res.lens - 1]: res.lensName }) : null;
  return <div className="lsm-phone" data-lens-summary-phone data-version={versionId ?? ""}>
    {res.lens && <p className="ph-text"><LensHeading lens={res.lens} names={names} size="small" /></p>}
    {!summary ? <p className="ph-muted" role="status">{res.aiState === "drafting" ? "AI is drafting the summary. It will show here and on the TV." : "The summary for this lens is coming up."}</p> : <>
      <p className="lsm-ph-meta">{summary.author === "ai" ? <><AiMark /> Drafted by AI</> : "Edited by the facilitator"} · Version {summary.version}{summary.signed ? ` · ${summary.decision || "Decided"}` : ""}</p>
      <ol className="lsm-ph-lines">
        {summary.lines.map(l => {
          const from = sources?.lines[l.id] ?? [], on = shownSources === l.id;
          return <li key={l.id} data-line={l.id}>
            <p>{l.text}</p>
            {from.length > 0 && <button type="button" className="lsm-ph-from" aria-expanded={on} onClick={() => setShownSources(on ? null : l.id)}>
              {from.length === 1 ? "From 1 sentence" : `From ${from.length} sentences`}<ChevronDown size={14} aria-hidden="true" /></button>}
            {on && <ul className="lsm-ph-sources">{from.map((t, i) => <li key={i}>{t}</li>)}</ul>}
          </li>;
        })}
      </ol>
      {summary.note && <p className="ph-muted">{summary.note}</p>}
      {summary.signed ? <p className="ph-who" role="status"><Check size={16} aria-hidden="true" /> The room has decided on this summary.</p> : <>
        {reply && <p className="ph-who" role="status" data-own-reply={reply.response}><Check size={16} aria-hidden="true" />
          {reply.response === "approve" ? "You approved this version." : <>You suggested: {reply.text}</>}</p>}
        {open && <div className="ph-actions lsm-ph-actions">
          <button type="button" className="ph-send" disabled={reply?.response === "approve"} onClick={approve}><ThumbsUp size={18} aria-hidden="true" />{reply?.response === "approve" ? "Approved" : "Approve"}</button>
          <button type="button" className="ph-secondary" aria-expanded={boxOpen} onClick={() => setBoxOpen(!boxOpen)}>{reply?.response === "suggest" ? "Change my suggestion" : "Suggest a change"}</button>
        </div>}
        {open && boxOpen && <form className="lens-form" onSubmit={suggest}>
          <label className="ph-label" htmlFor="lsm-suggest">What would you change?</label>
          <textarea id="lsm-suggest" className="ph-input" rows={3} value={draft} placeholder="Say it in a short sentence" aria-invalid={Boolean(check.message)} aria-describedby="lsm-count" onChange={e => setDraft(e.target.value)} />
          <p className="ph-count" id="lsm-count" aria-live="polite"><span>{check.message || "AI folds suggestions into a new version. Nobody sees your name."}</span><span>{check.count}</span></p>
          <div className="ph-actions"><button type="button" className="ph-secondary" onClick={() => { setBoxOpen(false); setDraft(""); }}>Cancel</button>
            <button className="ph-send" disabled={!check.ok}><Send size={18} aria-hidden="true" />Send</button></div>
        </form>}
      </>}
    </>}
  </div>;
}
