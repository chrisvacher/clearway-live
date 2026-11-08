"use client";
import { useState } from "react";
import { BadgeCheck, CircleAlert, Loader, Pencil, Plus, Quote, RefreshCw, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import { markOf, originNames, plural, seasonCells, statusNames, type BlockCell, type ReportSection, type ReportSentence } from "@/lib/report/policy";
import type { Api } from "./use-report";

type Props = { section: ReportSection; api: Api; selected: string | null; select: (id: string | null) => void; ai: boolean; locked: boolean; zone: string; planStale?: boolean };
const stamp = (iso: string, zone: string) => new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

function Tags({ s }: { s: ReportSentence }) {
  const m = markOf(s);
  return <>
    {s.origin === "room" && <span className="rpt-tag is-room"><Quote aria-hidden="true" className="rpt-ico" />{originNames.room}</span>}
    {s.origin === "facilitator" && <span className="rpt-tag">{originNames.facilitator}</span>}
    {s.thin_label && <span className="rpt-tag is-thin" data-testid="rpt-thin">{s.thin_label}</span>}
    <span className="rpt-tag" data-testid="rpt-mark" data-kind={m.kind} title={m.kind === "none" ? "No source" : undefined}>{m.kind === "none" ? "No source" : m.kind === "yours" ? "Yours" : plural(m.n, "source")}</span>
  </>;
}

// One sentence with its tools. Choosing it shows its sources in the panel beside.
function Sentence({ s, api, selected, select, locked, frozen = false }: { s: ReportSentence; api: Api; selected: boolean; select: (id: string | null) => void; locked: boolean; frozen?: boolean }) {
  const [edit, setEdit] = useState<string | null>(null);
  const hasRoom = s.sources.some(x => x.room);
  const save = async () => { if (edit === null) return; const r = await api.act({ action: "edit", sentence: s.id, text: edit }); if (r.status === "ok" || r.status === "unchanged") setEdit(null); };
  return <div className={`rpt-sentence${selected ? " is-selected" : ""}${s.needs_source ? " is-unsourced" : ""}${s.quote ? " is-quote" : ""}`} data-testid="rpt-sentence" data-origin={s.origin}>
    <button type="button" className="main" aria-pressed={selected} onClick={() => select(selected ? null : s.id)}><span className="txt">{s.text}<Tags s={s} /></span></button>
    {selected && frozen && <p className="ovr-muted" data-testid="rpt-frozen">This line is what the room signed off, word for word. Change the lens summaries, then refresh this section.</p>}
    {selected && !frozen && edit === null && !locked && <div className="rpt-tools" data-testid="rpt-tools">
      <button type="button" className="ovr-btn is-sm" disabled={api.busy} onClick={() => setEdit(s.text)} data-testid="rpt-edit"><Pencil aria-hidden="true" />Edit</button>
      {s.origin === "room" && s.can_undo
        ? <button type="button" className="ovr-btn is-sm" disabled={api.busy} onClick={() => void api.act({ action: "undo_room_words", sentence: s.id })}><Undo2 aria-hidden="true" />Go back to the draft wording</button>
        : hasRoom && s.origin !== "room" && <button type="button" className="ovr-btn is-sm" disabled={api.busy} onClick={() => void api.act({ action: "room_words", sentence: s.id })} data-testid="rpt-room-words"><Quote aria-hidden="true" />Use the room’s words</button>}
      <button type="button" className="ovr-btn is-sm is-ghost" disabled={api.busy} onClick={() => void api.act({ action: "remove", sentence: s.id })} data-testid="rpt-remove"><Trash2 aria-hidden="true" />Remove</button>
    </div>}
    {edit !== null && <div className="ovr-edit">
      <textarea className="ovr-input" aria-label="Edit the sentence" value={edit} maxLength={1200} rows={3} autoFocus onChange={e => setEdit(e.target.value)} data-testid="rpt-edit-text" />
      <div className="ovr-row"><span className="ovr-muted">{1200 - edit.length} left</span><span className="grow" />
        <button type="button" className="ovr-btn is-primary is-sm" disabled={!edit.trim() || api.busy} onClick={() => void save()} data-testid="rpt-edit-save">Save the sentence</button>
        <button type="button" className="ovr-btn is-sm" onClick={() => setEdit(null)}>Cancel</button></div></div>}
  </div>;
}

// A record section's table: the records as they stand. A cell that stands for sentences reads their live wording, so an edit or a removal shows here at once.
// A table row stands on its first sentence: when that sentence is gone, so is the row.
function Table({ section, sentences, selected, select }: { section: ReportSection; sentences: Map<string, ReportSentence>; selected: string | null; select: (id: string | null) => void }) {
  const live = (section.blocks?.rows ?? []).filter(row => !row.parts.length || (row.cells.length ? sentences.has(row.parts[0].sentence_id) : row.parts.some(p => sentences.has(p.sentence_id))));
  // The scribe's action cards sit under the table as their own list, as they do in the export: they have no who, when or who tells them.
  const rows = live.filter(r => r.group !== "actions"), actions = live.filter(r => r.group === "actions" && r.parts.length > 0);
  const columns = section.blocks?.columns ?? [];
  if (!live.length) return <p className="ovr-muted" data-testid="rpt-empty-table">Nothing has been recorded for this section yet.</p>;
  const grouped = rows.some(r => r.group);
  const choose = (id: string) => select(id === selected ? null : id);
  const cellView = (cell: BlockCell, text: string) => {
    if (!("s" in cell)) return text;
    const live = cell.s.filter(id => sentences.has(id));
    return live.length === 1 ? sentences.get(live[0])!.text : live.map(id => <span key={id} className="rpt-line is-link" onClick={e => { e.stopPropagation(); choose(id); }} data-testid="rpt-cell-line">{sentences.get(id)!.text}</span>);
  };
  return <>{rows.length > 0 && <div className="rpt-wrap"><table className="rpt-table" data-testid="rpt-table">
    {columns.length > 0 && <thead><tr>{columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>}
    <tbody>{rows.map((row, i) => {
      const lead = row.parts.find(p => sentences.has(p.sentence_id)), isSel = row.parts.some(p => p.sentence_id === selected);
      if (!row.cells.length) return <tr key={i} className={isSel ? "is-selected" : ""} data-testid="rpt-row"><td colSpan={Math.max(columns.length, 1)}><b>{row.title}</b>
        <div className="rpt-parts is-flat">{row.parts.map(p => { const s = sentences.get(p.sentence_id); return s && <button key={p.sentence_id} type="button" className="ovr-btn is-ghost is-sm rpt-part" onClick={() => choose(p.sentence_id)} data-testid="rpt-part">
          <span className="rpt-role">{p.role.replace("_", " ")}</span> {s.text}{p.owner ? <span className="rpt-owner"> · {p.owner}</span> : null}{p.due ? <span className="rpt-owner"> · {p.due}</span> : null}</button>; })}</div></td></tr>;
      // A raw season code in a table built before the season was worded as the Map words it reads as the label.
      const texts = seasonCells(columns, row.cells.map(cell => "t" in cell ? cell.t : ""));
      return <tr key={i} className={isSel ? "is-selected" : ""} data-testid="rpt-row" data-group={grouped ? row.group ?? "" : undefined}>{row.cells.map((cell, c) => {
        const first = "s" in cell ? cell.s.find(id => sentences.has(id)) : undefined;
        return <td key={c} className={first ? "is-link" : ""} onClick={first ? () => choose(first) : lead && c === 0 ? () => choose(lead.sentence_id) : undefined} data-testid={first ? "rpt-cell-sentence" : undefined}>{cellView(cell, texts[c])}</td>;
      })}</tr>;
    })}</tbody></table></div>}
    {actions.length > 0 && <div className="rpt-actions" data-testid="rpt-actions"><h3>Actions the room named</h3>
      <ul>{actions.map(a => { const s = sentences.get(a.parts[0].sentence_id); return s && <li key={a.parts[0].sentence_id} className={a.parts.some(p => p.sentence_id === selected) ? "is-selected" : ""} data-testid="rpt-action">
        <button type="button" className="ovr-btn is-ghost is-sm rpt-part" aria-pressed={a.parts.some(p => p.sentence_id === selected)} onClick={() => choose(a.parts[0].sentence_id)}>{s.text}</button></li>; })}</ul></div>}</>;
}

export function SectionBody({ section, api, selected, select, ai, locked, zone, planStale }: Props) {
  const [adding, setAdding] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ kind: "redraft" | "refresh"; n: number } | null>(null);
  const byId = new Map(section.sentences.map(s => [s.id, s]));
  const inBlock = new Set((section.blocks?.rows ?? []).flatMap(r => r.parts.map(p => p.sentence_id)));
  const prose = section.sentences.filter(s => !inBlock.has(s.id));
  const blockPick = selected && inBlock.has(selected) ? byId.get(selected) ?? null : null;
  const drafting = section.status === "drafting";
  const record = section.kind === "record";
  const redraft = async (confirm: boolean) => {
    const r = await api.act({ action: "draft", id: crypto.randomUUID(), scope: "section", section: section.key, confirm });
    if (r.status === "confirm") setAsk({ kind: "redraft", n: r.kept ?? 0 }); else setAsk(null);
  };
  const refresh = async (confirm: boolean) => {
    const r = await api.act({ action: "refresh", section: section.key, confirm });
    if (r.status === "confirm") setAsk({ kind: "refresh", n: r.edited ?? 0 }); else setAsk(null);
  };
  const addOwn = async () => { if (adding === null) return; const r = await api.act({ action: "add", section: section.id, text: adding }); if (r.status === "ok") setAdding(null); };
  const reviewable = !drafting && (section.status !== "empty") && !(section.status === "needs_attention" && section.sentences.length === 0);
  return <section className="rpt-sec" data-testid="rpt-body" data-key={section.key} data-status={section.status}>
    <div className="ovr-h"><h2>{section.heading}</h2>
      <span className={`ovr-st${drafting ? " is-drafting" : section.status === "reviewed" ? " is-reviewed" : section.status === "needs_attention" ? " is-flag" : section.status === "thin" ? " is-flag" : " is-ready"}`} data-testid="rpt-status">
        {drafting ? <Loader aria-hidden="true" /> : section.status === "reviewed" ? <BadgeCheck aria-hidden="true" /> : null}{statusNames[section.status]}</span>
      <span className="grow" />
      {!locked && !record && <button type="button" className="ovr-btn is-sm" disabled={api.busy || drafting || !ai} title={ai ? undefined : "AI is off for this engagement"} onClick={() => void redraft(false)} data-testid="rpt-redraft"><RefreshCw aria-hidden="true" />{section.sentences.length ? "Redraft section" : "Draft section"}</button>}
      {!locked && record && <>
        <button type="button" className="ovr-btn is-sm" disabled={api.busy || drafting} onClick={() => void refresh(false)} data-testid="rpt-refresh"><RefreshCw aria-hidden="true" />Refresh from the records</button>
        <button type="button" className="ovr-btn is-sm" disabled={api.busy || drafting || !ai} title={ai ? undefined : "AI is off for this engagement"} onClick={() => void redraft(false)} data-testid="rpt-redraft"><Pencil aria-hidden="true" />Redraft the lead</button></>}
    </div>
    {section.key === "visibility" && planStale && <div className="ovr-banner is-warning" role="status" data-testid="rpt-plan-stale"><TriangleAlert aria-hidden="true" /><div><strong>The visibility plan changed since this section was built.</strong> Refresh it from the records.</div></div>}
    {section.status === "needs_attention" && <div className="ovr-banner is-warning" role="status" data-testid="rpt-attention"><TriangleAlert aria-hidden="true" /><div>
      <strong>{section.error ?? (section.dropped > 0 ? `${plural(section.dropped, "sentence")} didn’t meet the checks and ${section.dropped === 1 ? "was" : "were"} left out.` : "This section needs your attention.")}</strong> {section.error ? "Try again, or write the section yourself." : "Read what is here, add what is missing, or redraft the section."}
      {!locked && ai && <div className="ovr-row"><button type="button" className="ovr-btn is-sm" disabled={api.busy} onClick={() => void redraft(false)} data-testid="rpt-retry"><RefreshCw aria-hidden="true" />Try again</button></div>}</div></div>}
    {section.status === "thin" && <div className="ovr-banner" role="status" data-testid="rpt-thin-banner"><CircleAlert aria-hidden="true" /><div><strong>Thin data.</strong> There is little behind this section. It says only what the records hold. Add your own read if you have more to say.</div></div>}
    {drafting && <p className="ovr-muted" role="status" data-testid="rpt-drafting">Drafting this section. It appears here as soon as it is ready.</p>}
    {ask && <div className="rpt-ask" role="alertdialog" aria-label="Keep your changes" data-testid="rpt-ask">
      {ask.kind === "redraft"
        ? <span><strong>This section has {plural(ask.n, "sentence")} you changed.</strong> Redrafting keeps {ask.n === 1 ? "it" : "them"} where {ask.n === 1 ? "it is" : "they are"} and replaces only the sentences you haven’t touched.</span>
        : <span><strong>You changed {plural(ask.n, "line")} in this table.</strong> Refreshing rebuilds it from the records, and those changes are lost.</span>}
      <div className="ovr-row"><button type="button" className="ovr-btn is-primary is-sm" disabled={api.busy} onClick={() => void (ask.kind === "redraft" ? redraft(true) : refresh(true))} data-testid="rpt-ask-yes">{ask.kind === "redraft" ? "Keep them and redraft the rest" : "Refresh and lose those changes"}</button>
        <button type="button" className="ovr-btn is-sm" onClick={() => setAsk(null)} data-testid="rpt-ask-no">Cancel</button></div></div>}
    {record && <Table section={section} sentences={byId} selected={selected} select={select} />}
    {record && blockPick && <div className="rpt-picked" data-testid="rpt-picked"><Sentence key={blockPick.id} s={blockPick} api={api} selected select={select} locked={locked || drafting} frozen={blockPick.origin === "record" && section.key === "future"} /></div>}
    {prose.length > 0 && <div className="rpt-sentences" data-testid="rpt-sentences">{prose.map(s => <Sentence key={s.id} s={s} api={api} selected={s.id === selected} select={select} locked={locked || drafting} />)}</div>}
    {!prose.length && !record && !drafting && section.status !== "needs_attention" && <p className="ovr-muted" data-testid="rpt-empty">{section.status === "thin" ? "Nothing to draft from yet." : ai ? "Not drafted yet. Draft the report, or this section on its own." : "Write this section by hand, or turn AI on to draft it."}</p>}
    {!locked && !drafting && <div className="rpt-add">
      {adding === null ? <div className="ovr-row"><button type="button" className="ovr-btn is-sm" disabled={api.busy} onClick={() => setAdding("")} data-testid="rpt-add-own"><Plus aria-hidden="true" />Add your own read</button></div>
        : <div className="ovr-edit is-flat"><textarea className="ovr-input" aria-label="Your own read" placeholder="Write it in your own words. It needs no source." value={adding} maxLength={1200} rows={3} autoFocus onChange={e => setAdding(e.target.value)} data-testid="rpt-add-text" />
          <div className="ovr-row"><span className="ovr-muted">{1200 - adding.length} left</span><span className="grow" />
            <button type="button" className="ovr-btn is-primary is-sm" disabled={!adding.trim() || api.busy} onClick={() => void addOwn()} data-testid="rpt-add-save">Add it</button>
            <button type="button" className="ovr-btn is-sm" onClick={() => setAdding(null)}>Cancel</button></div></div>}</div>}
    <div className="ovr-row is-between">
      <span className="ovr-muted">{section.reviewed ? `Reviewed by ${section.reviewed.by ?? "a facilitator"}, ${stamp(section.reviewed.at, zone)}` : "Nothing is signed off until every section is reviewed."}</span>
      {section.status === "reviewed"
        ? <button type="button" className="ovr-btn is-sm" disabled={locked || api.busy} onClick={() => void api.act({ action: "reviewed", section: section.id, reviewed: false })} data-testid="rpt-unreview"><Undo2 aria-hidden="true" />Mark as not reviewed</button>
        : <button type="button" className="ovr-btn is-confirm" disabled={locked || api.busy || !reviewable} onClick={() => void api.act({ action: "reviewed", section: section.id, reviewed: true })} data-testid="rpt-review"><BadgeCheck aria-hidden="true" />Mark reviewed</button>}</div>
  </section>;
}
