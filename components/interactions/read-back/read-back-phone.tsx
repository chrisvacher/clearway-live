"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, ChevronDown, Send } from "lucide-react";
import type { PhoneInputProps } from "@/components/interactions/phone-inputs";
import { LensIcon } from "@/components/wayfinding/lens-icon";
import { Words } from "@/components/interactions/lens-summary/summary-tv";
import { askText, changeLimit, changeText, checkText, missingLimit, missingText, ownAnswers, phoneOf, readBackOf, yesText, type PhoneRead } from "@/lib/interactions/read-back";
import type { Part } from "@/lib/interactions/read-back";
import type { LensNumber } from "@/lib/wayfinding/lens";
import "./read-back.css";

// D2-04: the phone during the Day 2 confirm. The item's full text with the room's own sentences under each line, then
// "Yes, that's us" or "It needs a change" (a short box), one answer per person for each version and changeable. "What's
// missing?" takes up to 280 characters and may be sent more than once. Settled items stay here to look back at. A correction
// that folds in shows as a tracked change until the item is settled, and the tally starts again for the new version.
export function ReadBackInput({ step, mine, open, send, engagement, frame }: PhoneInputProps) {
  const res = useMemo(() => readBackOf(frame?.state.results), [frame?.state.results]);
  const item = res.item, versionId = item?.versionId, itemId = item?.id ?? "", settled = item?.settled ?? false;
  const [read, setRead] = useState<PhoneRead | null>(null), [draft, setDraft] = useState(""), [boxOpen, setBoxOpen] = useState(false), [missing, setMissing] = useState(""), [shownSources, setShownSources] = useState<string | null>(null);
  // The versions of this item this phone has seen, so a "What's missing?" the person sent on an earlier version still shows.
  const versions = useRef<{ item: string; ids: string[] }>({ item: "", ids: [] });
  if (versions.current.item !== itemId) versions.current = { item: itemId, ids: [] };
  if (versionId && !versions.current.ids.includes(versionId)) versions.current.ids.push(versionId);
  const own = ownAnswers(mine, versionId, versions.current.ids), change = checkText(draft, changeLimit), more = checkText(missing, missingLimit);
  const settledSig = res.items.filter(c => c.state === "settled").map(c => c.id).join(",");
  useEffect(() => {
    if (!engagement || !step.id) return;
    let live = true;
    fetch(`/api/live/${engagement}/read-back?session=${step.id}`, { cache: "no-store" }).then(r => r.json()).then(d => { if (live) setRead(phoneOf(d)); }).catch(() => undefined);
    return () => { live = false; };
  }, [engagement, step.id, versionId, itemId, settledSig]);
  useEffect(() => { setBoxOpen(false); setDraft(""); setShownSources(null); }, [versionId]);
  useEffect(() => { setMissing(""); }, [itemId]);
  const full = read?.item && read.item.versionId === versionId ? read.item : null;
  // The words as the TV shows them: the latest change (struck and inserted words), else the underlines against the first wording.
  const partsFor = useMemo(() => {
    const out = new Map<string, Part[] | null>();
    if (!item || settled) return out;
    item.lines.forEach((l, i) => { const c = item.tracked ? item.changes.find(x => x.at === i + 1 && x.kind !== "remove") : undefined; out.set(l.id, c ? c.parts : l.marks); });
    return out;
  }, [item, settled]);
  const struck = item && !settled && item.tracked ? item.changes.filter(c => c.kind === "remove") : [];
  function yes() { if (open && versionId && !settled) send({ text: yesText, value: { version: versionId, response: "yes" } }); }
  function needsChange(event: FormEvent) {
    event.preventDefault();
    if (!open || !versionId || !change.ok || settled) return;
    send({ text: draft.trim(), value: { version: versionId, response: "change" } });
    setBoxOpen(false); setDraft("");
  }
  function addMissing(event: FormEvent) {
    event.preventDefault();
    if (!open || !versionId || !more.ok || settled) return;
    send({ text: missing.trim(), value: { version: versionId, response: "missing" } });
    setMissing("");
  }
  if (!item) return <div className="rbk-phone" data-read-back-phone data-version=""><p className="ph-muted" role="status">The next item is coming up. It shows here and on the TV.</p></div>;
  const lines = full?.lines ?? item.lines.map(l => ({ id: l.id, text: l.text, sources: [] as string[] }));
  const index = res.items.findIndex(c => c.id === item.id) + 1;
  return <div className="rbk-phone" data-read-back-phone data-version={versionId ?? ""} data-settled={settled ? "true" : "false"}>
    <h2 className="rbk-ph-h">{item.kind === "lens" && item.lens ? <LensIcon lens={item.lens as LensNumber} size={22} /> : null}<span>{item.heading}</span></h2>
    <p className="rbk-ph-meta">{index > 0 ? `Item ${index} of ${res.count} · ` : ""}{item.horizon}{item.version > 1 ? ` · Changed in this confirm` : ""}{settled ? ` · ${item.decision || "Confirmed"}` : ""}</p>
    <ol className="lsm-ph-lines">
      {lines.map(l => {
        const on = shownSources === l.id, from = l.sources;
        return <li key={l.id} className="rbk-ph-line" data-line={l.id}>
          <p><Words parts={partsFor.get(l.id) ?? null} text={l.text} leave={false} /></p>
          {from.length > 0 && <button type="button" className="lsm-ph-from" aria-expanded={on} onClick={() => setShownSources(on ? null : l.id)}>
            {from.length === 1 ? "From 1 sentence" : `From ${from.length} sentences`}<ChevronDown size={14} aria-hidden="true" /></button>}
          {on && <ul className="lsm-ph-sources">{from.map((t, i) => <li key={i}>{t}</li>)}</ul>}
        </li>;
      })}
      {struck.map(c => <li key={c.id} className="rbk-ph-line" data-removed><p><Words parts={c.parts} text="" leave={false} /></p></li>)}
    </ol>
    {settled ? <p className="ph-who" role="status"><Check size={16} aria-hidden="true" /> The room has confirmed this one.</p> : <>
      <p className="rbk-ph-ask">{askText}</p>
      {own.response && <p className="ph-who" role="status" data-own-reply={own.response}><Check size={16} aria-hidden="true" />{own.response === "yes" ? `You said: ${yesText}.` : <>You said it needs a change: {own.change}</>}</p>}
      <div className="rbk-ph-choice">
        <button type="button" className="ph-send" aria-pressed={own.response === "yes"} disabled={!open} onClick={yes}><Check size={18} aria-hidden="true" />{yesText}</button>
        <button type="button" className="ph-send rbk-alt" aria-pressed={own.response === "change" || boxOpen} aria-expanded={boxOpen} disabled={!open} onClick={() => setBoxOpen(!boxOpen)}>{own.response === "change" ? "Change my answer" : changeText}</button>
      </div>
      {open && boxOpen && <form className="lens-form" onSubmit={needsChange}>
        <label className="ph-label" htmlFor="rbk-change">What needs to change?</label>
        <textarea id="rbk-change" className="ph-input" rows={3} value={draft} placeholder="Say it in a short sentence" aria-invalid={Boolean(change.message)} aria-describedby="rbk-change-count" onChange={e => setDraft(e.target.value)} />
        <p className="ph-count" id="rbk-change-count" aria-live="polite"><span>{change.message || "The facilitator reads these. Nobody sees your name."}</span><span>{change.count}</span></p>
        <div className="ph-actions"><button type="button" className="ph-secondary" onClick={() => { setBoxOpen(false); setDraft(""); }}>Cancel</button>
          <button className="ph-send" disabled={!change.ok}><Send size={18} aria-hidden="true" />Send</button></div>
      </form>}
      <form className="lens-form" onSubmit={addMissing}>
        <label className="ph-label" htmlFor="rbk-missing">{missingText}</label>
        <textarea id="rbk-missing" className="ph-input" rows={2} value={missing} disabled={!open} placeholder="Anything we left out" aria-invalid={Boolean(more.message)} aria-describedby="rbk-missing-count" onChange={e => setMissing(e.target.value)} />
        <p className="ph-count" id="rbk-missing-count" aria-live="polite"><span>{more.message || "It shows on the TV without your name."}</span><span>{more.count}</span></p>
        <div className="ph-actions"><button className="ph-send" disabled={!open || !more.ok}><Send size={18} aria-hidden="true" />Send</button></div>
      </form>
      {own.missing.length > 0 && <ul className="rbk-ph-mine" aria-label="What you added">{own.missing.map(m => <li key={m.id}><Check size={14} aria-hidden="true" /> {m.text}</li>)}</ul>}
    </>}
    {read && read.settled.length > 0 && <details className="rbk-ph-settled" data-settled-items>
      <summary>Settled so far ({read.settled.length})</summary>
      {read.settled.map(s => <div key={s.id} className="rbk-ph-look" data-settled-item={s.id}><b>{s.heading}{s.changed ? " · changed" : ""}</b>{s.lines.map((t, i) => <p key={i}>{t}</p>)}</div>)}
    </details>}
  </div>;
}
