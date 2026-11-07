"use client";
import { useEffect, useState } from "react";
import { Lock, Plus, TriangleAlert, X } from "lucide-react";
import { litPart, markOf, type Candidate, type ReportSection, type ReportSentence, type ReportSource } from "@/lib/report/policy";
import type { Api } from "./use-report";

// The words of a source with the part the sentence used lit up (the same lighting the overnight review gives a bullet's source).
export function Lit({ text, part }: { text: string; part?: string | null }) {
  const p = litPart(text, part);
  return p.lit ? <>{p.before}<span className="ovr-hl">{p.lit}</span>{p.after}</> : <>{text}</>;
}

function SourceCard({ source, onRemove }: { source: ReportSource; onRemove: (() => void) | null }) {
  const info = source.info, speaker = typeof info?.speaker === "string" ? info.speaker : null, text = info?.text || source.excerpt;
  return <div className="ovr-scard is-lit" data-testid="rpt-source" data-kind={source.kind}>
    <div className="meta"><span className="ovr-meta-l">{info?.label ?? "Record"}{source.room ? " · the room's own words" : ""}</span>
      {onRemove && <button type="button" className="ovr-btn is-icon is-ghost" aria-label="Take this source off the sentence" onClick={onRemove}><X aria-hidden="true" /></button>}</div>
    <div className={source.room ? "ovr-quote" : ""}><Lit text={text} part={source.excerpt} /></div>
    {speaker && <span className="who"><Lock aria-hidden="true" />{speaker} · for the record, never in the report</span>}
  </div>;
}

// The sources behind one sentence, with the words it used lit, and a way to add a record the section can cite.
export function SourcesPanel({ section, sentence, api, locked }: { section: ReportSection | null; sentence: ReportSentence | null; api: Api; locked: boolean }) {
  const [pool, setPool] = useState<Candidate[] | null>(null);
  const sectionId = section?.id ?? null, count = sentence?.sources.length ?? 0;
  useEffect(() => { setPool(null); }, [sectionId, count]);
  const used = new Set((sentence?.sources ?? []).map(s => `${s.kind}:${s.ref_id}:${s.excerpt}`));
  const choices = (pool ?? []).filter(c => !used.has(`${c.kind}:${c.ref_id}:${c.excerpt}`));
  const open = async () => { if (sectionId && pool === null) setPool(await api.candidates(sectionId)); };
  const add = (value: string) => {
    const c = choices[Number(value)];
    if (sentence && c) void api.act({ action: "source", sentence: sentence.id, kind: c.kind, ref: c.ref_id, excerpt: c.excerpt, add: true });
  };
  const m = sentence ? markOf(sentence) : null;
  return <aside className="ovr-src" aria-label="Sources" data-testid="rpt-sources">
    <div className="ovr-src-h">Sources</div>
    {!sentence && <p className="ovr-muted">Choose a sentence to see the words it rests on.</p>}
    {sentence && <>
      <div className="ovr-src-sent" data-testid="rpt-src-sentence">{sentence.text}</div>
      {sentence.needs_source && <div className="ovr-banner is-warning" role="status" data-testid="rpt-needs-source"><TriangleAlert aria-hidden="true" /><div><strong>No source.</strong> Add a record below, or rewrite the sentence in your own words. A sentence with no source stops sign-off.</div></div>}
      {m?.kind === "yours" && <p className="ovr-muted">These are your own words. They need no source.</p>}
      <div className="ovr-srclist">{sentence.sources.map(s => <SourceCard key={s.id} source={s} onRemove={locked ? null : () => void api.act({ action: "source", sentence: sentence.id, kind: s.kind, ref: s.ref_id, excerpt: s.excerpt, add: false })} />)}</div>
      {!locked && <div className="rpt-src-pick" onMouseEnter={() => void open()} onFocus={() => void open()}>
        <label className="ovr-field">Add a source<select className="ovr-input" value="" disabled={api.busy} onChange={e => add(e.target.value)} data-testid="rpt-add-source" aria-label="Add a source">
          <option value="">{pool === null ? "Choose a record" : choices.length ? "Choose a record" : "No other record to cite"}</option>
          {choices.map((c, i) => <option key={`${c.kind}:${c.ref_id}:${i}`} value={i}>{`${c.label}: ${c.excerpt}`.slice(0, 96)}</option>)}</select></label>
        <span className="ovr-muted"><Plus aria-hidden="true" style={{ width: 12, height: 12, verticalAlign: "middle" }} /> A signal can be cited only when it is aligned and saved as a citation.</span></div>}
    </>}
  </aside>;
}
