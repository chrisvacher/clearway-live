"use client";
import { useEffect, useState } from "react";
import { Check, Send } from "lucide-react";
import { correctionLimit, reasonLimit, type ScribeRead } from "@/lib/interactions/read-back";
import "./scribe.css";

// SCR-01's correction composer, shown while the Day 2 read-back is live: pick the line (or a new line, or none), write the wording
// the room agreed and why. It goes into the scribe's outbox first, so it survives a dropped connection, then to the facilitator's
// queue. The reason stays between the scribe and the facilitator; it never reaches the TV or a phone.
export function CorrectionComposer({ read, onSend }: { read: ScribeRead; onSend: (input: { item: string; line: string | null; wording: string; reason: string }) => void }) {
  const item = read.item;
  const [line, setLine] = useState(""), [wording, setWording] = useState(""), [reason, setReason] = useState(""), [sent, setSent] = useState(false);
  useEffect(() => { setLine(""); setSent(false); }, [item?.id, item?.versionId]);
  useEffect(() => { if (!sent) return; const t = setTimeout(() => setSent(false), 4000); return () => clearTimeout(t); }, [sent]);
  if (!item) return <section className="scr-comp" aria-label="Correction" data-testid="correction-composer"><span className="scr-eyebrow">Correction</span><p className="scr-muted">The first item is coming up.</p></section>;
  const off = item.settled, ok = wording.trim().length > 0 && wording.trim().length <= correctionLimit;
  function send() {
    if (!item || off || !ok) return;
    onSend({ item: item.id, line: line === "" ? null : line, wording: wording.trim(), reason: reason.trim() });
    setWording(""); setReason(""); setSent(true);
  }
  return <section className="scr-comp" aria-label="Correction" data-testid="correction-composer">
    <span className="scr-eyebrow">Correction · {item.heading}</span>
    {off ? <p className="scr-muted" role="status">The facilitator has settled this one. Corrections for the next item open when it is on the TV.</p> : null}
    <div className="scr-field"><label className="scr-flabel" htmlFor="scr-cr-line">Which line</label>
      <select id="scr-cr-line" className="scr-input" value={line} disabled={off} onChange={e => setLine(e.target.value)}>
        <option value="">The room did not name a line</option>
        {item.lines.map(l => <option key={l.id} value={l.id}>{`Line ${l.pos}: ${l.text.length > 70 ? `${l.text.slice(0, 70)}...` : l.text}`}</option>)}
        <option value="new">A new line</option>
      </select></div>
    <div className="scr-field"><label className="scr-flabel" htmlFor="scr-cr-wording">The wording the room agreed</label>
      <textarea id="scr-cr-wording" className="scr-input" rows={3} maxLength={correctionLimit} value={wording} disabled={off} placeholder="Write it the way it should read" onChange={e => setWording(e.target.value)} /></div>
    <div className="scr-field"><label className="scr-flabel" htmlFor="scr-cr-reason">Why</label>
      <textarea id="scr-cr-reason" className="scr-input" rows={2} maxLength={reasonLimit} value={reason} disabled={off} placeholder="What you heard that led to it. Only the facilitator sees this." onChange={e => setReason(e.target.value)} /></div>
    <div className="scr-row">
      <button type="button" className="scr-btn is-primary" disabled={off || !ok} onClick={send} data-testid="correction-send"><Send className="scr-icon" aria-hidden="true" />Send to the facilitator</button>
      {sent ? <span className="scr-muted" role="status" data-testid="correction-sent"><Check className="scr-icon" aria-hidden="true" />Saved. It goes to the facilitator’s queue.</span> : null}
    </div>
  </section>;
}
