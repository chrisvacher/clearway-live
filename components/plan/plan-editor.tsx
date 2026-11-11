"use client";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BadgeCheck, CalendarClock, ChevronRight, CircleAlert, FileText, Loader, PenLine, Plus, RefreshCw, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import { AiMark } from "@/components/interactions/ai/ai-icon";
import { SourceCard } from "@/components/report/sources-panel";
import { afterPublic, inOutwardOrder, plural, roundView, blankedText, missingStages, rowsLeft, stageNames, stageOrder, statusNames, whenText, type PlanRowState, type Stage } from "@/lib/plan/policy";
import { usePlan, type Api } from "./use-plan";
import "./plan.css";

type Field = "who" | "when" | "by_whom" | "what_they_hear" | "risk";
type Editing = { row: string; field: Field; stage: Stage; text: string; date: string } | null;
const orderNames = ["Lead pastor", "Retreat participants", "Board or elders", "Staff", "Members and key leaders", "Congregation"];

// The six stages in the outward order. Once the plan has been drafted, a stage with no row says so.
function Order({ missing }: { missing: Stage[] }) {
  return <div className="cwl-vp-order" data-testid="vp-order" aria-label="The order the plan works outward">{orderNames.map((s, i) => {
    const none = missing.includes(stageOrder[i]);
    return <Fragment key={s}>{i > 0 && <ChevronRight aria-hidden="true" />}<span data-testid="vp-stage" data-stage={stageOrder[i]} data-missing={none ? "yes" : "no"}><b>{i + 1}</b>{s}{none && <em className="cwl-vp-missing" data-testid="vp-stage-missing">No row yet</em>}</span></Fragment>;
  })}</div>;
}

// The public moment and its date. Editable; the plan works back from it.
function Moment({ moment, date, api, locked }: { moment: string; date: string | null; api: Api; locked: boolean }) {
  const [name, setName] = useState(moment), [when, setWhen] = useState(date ?? "");
  useEffect(() => { setName(moment); setWhen(date ?? ""); }, [moment, date]);
  const dirty = name.trim() !== moment || when !== (date ?? "");
  return <div className="cwl-vp-moment" data-testid="vp-moment">
    <label>The most public moment<input className="ovr-input" value={name} maxLength={80} disabled={locked} onChange={e => setName(e.target.value)} data-testid="vp-moment-name" /></label>
    <label>Its date<input className="ovr-input" type="date" value={when} disabled={locked} onChange={e => setWhen(e.target.value)} data-testid="vp-moment-date" /></label>
    <button type="button" className="ovr-btn is-sm" disabled={locked || api.busy || !dirty || !name.trim()} onClick={() => void api.act({ action: "set", moment: name, date: when || null })} data-testid="vp-moment-save"><CalendarClock aria-hidden="true" />Save the moment</button>
  </div>;
}

function Cell({ row, field, editing, setEditing, api, locked, publicDate }: { row: PlanRowState; field: Field; editing: Editing; setEditing: (e: Editing) => void; api: Api; locked: boolean; publicDate: string | null }) {
  const value = field === "when" ? whenText(row) : field === "who" ? row.who : row[field];
  const mine = editing && editing.row === row.id && editing.field === field ? editing : null;
  const start = () => { if (!locked) setEditing({ row: row.id, field, stage: row.stage, text: field === "when" ? row.when_text : value, date: row.when_date ?? "" }); };
  const save = async () => {
    if (!mine) return;
    const cells = field === "who" ? { who: mine.text, stage: mine.stage } : field === "when" ? { when_text: mine.text, when_date: mine.date || null } : { [field]: mine.text };
    const r = await api.act({ action: "edit", row: row.id, cells });
    if (r.status === "ok" || r.status === "unchanged") setEditing(null);
  };
  if (mine) return <div className="cwl-vp-edit">
    {field === "who" && <select className="ovr-input cwl-vp-select" aria-label="Who hears it" value={mine.stage} onChange={e => setEditing({ ...mine, stage: e.target.value as Stage })} data-testid="vp-edit-stage">
      {[...stageOrder, "other" as Stage].map(s => <option key={s} value={s}>{stageNames[s]}</option>)}</select>}
    <textarea className="ovr-input" aria-label={`Edit ${field.replace("_", " ")}`} rows={3} autoFocus value={mine.text} maxLength={field === "what_they_hear" ? 600 : field === "risk" ? 400 : field === "when" ? 120 : 200} onChange={e => setEditing({ ...mine, text: e.target.value })} data-testid="vp-edit-text" />
    {field === "when" && <input className="ovr-input" type="date" aria-label="Date" value={mine.date} onChange={e => setEditing({ ...mine, date: e.target.value })} data-testid="vp-edit-date" />}
    <div className="ovr-row"><button type="button" className="ovr-btn is-primary is-sm" disabled={api.busy || (field === "who" && !mine.text.trim())} onClick={() => void save()} data-testid="vp-edit-save">Save the cell</button>
      <button type="button" className="ovr-btn is-sm" onClick={() => setEditing(null)}>Cancel</button></div></div>;
  return <>
    <button type="button" className={`cwl-vp-cell${value ? "" : " is-empty"}`} disabled={locked} onClick={start} data-testid={`vp-cell-${field}`} aria-label={`Edit ${field.replace("_", " ")}: ${value || "empty"}`}>
      {field === "who" ? <b>{value}</b> : value || "Add"}</button>
    {field === "when" && afterPublic(row.when_date, publicDate) && <div className="cwl-vp-flag" data-testid="vp-after-public"><TriangleAlert aria-hidden="true" /><span>This is after the public date.</span></div>}
  </>;
}

function Panel({ row, api, locked, pos, count }: { row: PlanRowState | null; api: Api; locked: boolean; pos: number; count: number }) {
  const [ask, setAsk] = useState(false);
  useEffect(() => { setAsk(false); }, [row?.id]);
  return <aside className="cwl-vp-src cwl-vp-side" aria-label="Sources" data-testid="vp-panel">
    <div className="cwl-vp-src-h">Sources</div>
    {!row && <p className="ovr-muted">Choose a row to see the words it rests on.</p>}
    {row && <>
      <div className="cwl-vp-src-sent" data-testid="vp-panel-row">{stageNames[row.stage]}: {row.who}</div>
      {row.needs_source && <div className="ovr-banner is-warning" role="status"><TriangleAlert aria-hidden="true" /><div><strong>No source.</strong> Edit the row into your own words, or draft the plan again.</div></div>}
      {row.origin === "facilitator" && row.sources.length === 0 && <p className="ovr-muted" data-testid="vp-yours">You added this row. It needs no source.</p>}
      <div className="cwl-vp-srclist" data-testid="vp-sources">{row.sources.map(s => <SourceCard key={s.id} source={{ ...s, kind: s.kind as never, room: false }} onRemove={null} />)}</div>
      {!locked && <div className="cwl-vp-tools">
        <button type="button" className="ovr-btn is-sm" disabled={api.busy || pos === 0} onClick={() => void api.act({ action: "move", row: row.id, direction: "up" })} data-testid="vp-up"><ArrowUp aria-hidden="true" />Move up</button>
        <button type="button" className="ovr-btn is-sm" disabled={api.busy || pos === count - 1} onClick={() => void api.act({ action: "move", row: row.id, direction: "down" })} data-testid="vp-down"><ArrowDown aria-hidden="true" />Move down</button>
        <button type="button" className="ovr-btn is-sm is-ghost" disabled={api.busy} onClick={() => setAsk(true)} data-testid="vp-remove"><Trash2 aria-hidden="true" />Remove</button></div>}
      {ask && <div className="cwl-vp-ask" role="alertdialog" aria-label="Remove this row" data-testid="vp-remove-ask">
        <span><strong>Remove this row?</strong> It and its sources leave the plan and the report&apos;s Make the Vision Visible section the next time it is refreshed.</span>
        <div className="ovr-row"><button type="button" className="ovr-btn is-primary is-sm" disabled={api.busy} onClick={() => void api.act({ action: "remove", row: row.id }).then(() => setAsk(false))} data-testid="vp-remove-yes">Remove the row</button>
          <button type="button" className="ovr-btn is-sm" onClick={() => setAsk(false)} data-testid="vp-remove-no">Keep it</button></div></div>}
    </>}
  </aside>;
}

function AddRow({ api, onDone }: { api: Api; onDone: () => void }) {
  const [v, setV] = useState({ stage: "other" as Stage, who: "", when_text: "", when_date: "", by_whom: "", what_they_hear: "", risk: "" });
  const set = (k: keyof typeof v, value: string) => setV({ ...v, [k]: value });
  const save = async () => { const r = await api.act({ action: "add", cells: { ...v, when_date: v.when_date || undefined } }); if (r.status === "ok") onDone(); };
  return <div className="cwl-vp-form" data-testid="vp-add-form">
    <label>Who hears it<select className="ovr-input cwl-vp-select" value={v.stage} onChange={e => set("stage", e.target.value)} data-testid="vp-add-stage">{[...stageOrder, "other" as Stage].map(s => <option key={s} value={s}>{stageNames[s]}</option>)}</select></label>
    <label>Who, in words<input className="ovr-input" value={v.who} maxLength={200} onChange={e => set("who", e.target.value)} data-testid="vp-add-who" /></label>
    <label>When<input className="ovr-input" value={v.when_text} maxLength={120} onChange={e => set("when_text", e.target.value)} data-testid="vp-add-when" /></label>
    <label>Date<input className="ovr-input" type="date" value={v.when_date} onChange={e => set("when_date", e.target.value)} /></label>
    <label>Who tells them<input className="ovr-input" value={v.by_whom} maxLength={200} onChange={e => set("by_whom", e.target.value)} /></label>
    <label className="is-wide">What they hear<textarea className="ovr-input" rows={2} value={v.what_they_hear} maxLength={600} onChange={e => set("what_they_hear", e.target.value)} data-testid="vp-add-hear" /></label>
    <label className="is-wide">The risk it answers<textarea className="ovr-input" rows={2} value={v.risk} maxLength={400} onChange={e => set("risk", e.target.value)} /></label>
    <div className="ovr-row is-wide"><button type="button" className="ovr-btn is-primary is-sm" disabled={api.busy || !v.who.trim()} onClick={() => void save()} data-testid="vp-add-save">Add the row</button>
      <button type="button" className="ovr-btn is-sm" onClick={onDone}>Cancel</button></div></div>;
}

// The visibility plan (AFT-02): drafted from what the room said, working back from the most public moment and moving outward. The facilitators edit every
// cell, add and remove rows, reorder them and review each one. It is the report's Make the Vision Visible section.
export function PlanEditor({ engagement, church, title }: { engagement: string; church: string; title: string }) {
  const api = usePlan(engagement), { state } = api;
  const ok = state?.status === "ok" ? state : null;
  const [selected, setSelected] = useState<string | null>(null), [editing, setEditing] = useState<Editing>(null), [adding, setAdding] = useState(false), [ask, setAsk] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now()), [reporting, setReporting] = useState(false), [starting, setStarting] = useState(false), [reportNote, setReportNote] = useState("");
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t); }, []);
  const rows = useMemo(() => ok?.rows ?? [], [ok]);
  const picked = rows.find(r => r.id === selected) ?? null;
  useEffect(() => { if (selected && !picked) setSelected(null); }, [selected, picked]);
  const plan = ok?.plan ?? null, view = ok ? roundView(ok, now, ok.slow_after_ms) : null;
  const working = plan?.status === "drafting" || view?.kind === "working" || view?.kind === "retry", closed = ok?.closed === true, drafting = working || closed;
  const left = rowsLeft(rows), publicDate = plan?.public_date ?? null;
  // Rebuilds the report's Make the Vision Visible section from the plan as it is now. If sentences there were changed by hand, the report asks first, so the
  // facilitator is sent to the report to decide.
  const refreshReport = async () => {
    setReporting(true); setReportNote("");
    try {
      const response = await fetch(`/api/control/${engagement}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh", section: "visibility", confirm: false }) });
      const data = await response.json() as { status: string };
      if (data.status === "confirm") setReportNote("Some sentences in that section were changed in the report. Open the report to choose whether to keep them.");
      else if (data.status !== "ok" && data.status !== "unchanged") setReportNote("The report couldn’t refresh that section. Open the report and try again.");
    } catch { setReportNote("The report couldn’t refresh that section. Open the report and try again."); }
    setReporting(false); await api.load();
  };
  // The buttons stay off from the press until the page has read the state back, so there is no moment between the answer and the "drafting" state when a second draft could be started.
  const draft = async (confirm: boolean) => { setStarting(true); try { const r = await api.act({ action: "draft", id: crypto.randomUUID(), confirm }); setAsk(r.status === "confirm" ? r.kept ?? 0 : null); } finally { setStarting(false); } };
  return <div className="ovr" data-surface="plan" data-theme="light" data-testid="plan-editor">
    <main id="main" className="ovr-main">
      <header className="ovr-head"><div className="grow"><div className="ovr-eyebrow">{church} · {title} · after the retreat</div><h1>Visibility plan</h1></div></header>
      <div className="ovr-body">
        {api.message && <p className="ovr-banner is-warning" role="alert" data-testid="vp-message"><TriangleAlert aria-hidden="true" /><span>{api.message}</span></p>}
        {!state && <p className="ovr-muted">Reading the plan.</p>}
        {(state?.status === "denied" || state?.status === "closed") && <p className="ovr-banner is-warning" role="alert"><TriangleAlert aria-hidden="true" />Only the facilitators of this engagement can use the visibility plan.</p>}
        {(state?.status === "unavailable" || state?.status === "missing") && <p className="ovr-banner is-warning" role="alert"><TriangleAlert aria-hidden="true" />The visibility plan isn’t available right now. It tries again on its own.</p>}
        {ok && <div className="cwl-vp">
          <section className="cwl-vp-card" data-testid="vp-card" data-status={plan?.status ?? "empty"}>
            <header className="cwl-vp-hd"><div><div className="cwl-vp-eyebrow">Make the Vision Visible</div><h2>Visibility plan</h2></div>
              <div className="ovr-row">
                {rows.some(r => r.origin === "ai") && <span className="cwl-vp-ai" data-testid="vp-ai-note"><AiMark label="Drafted by AI" />{working ? "Drafting" : "Drafted from what the room said"}</span>}
                <span className={`ovr-st${plan?.status === "drafting" ? " is-drafting" : plan?.status === "reviewed" ? " is-reviewed" : plan?.status === "needs_attention" || plan?.status === "thin" ? " is-flag" : " is-ready"}`} data-testid="vp-status">
                  {plan?.status === "drafting" ? <Loader aria-hidden="true" /> : plan?.status === "reviewed" ? <BadgeCheck aria-hidden="true" /> : null}{statusNames[plan?.status ?? "empty"]}</span></div></header>
            {closed && <div className="ovr-banner" role="status" data-testid="vp-closed"><CircleAlert aria-hidden="true" /><div><strong>This engagement is closed.</strong> The visibility plan is read only.</div></div>}
            <Moment moment={plan?.moment ?? "Vision Sunday"} date={publicDate} api={api} locked={drafting} />
            <p className="ovr-muted" data-testid="vp-anchor">{publicDate ? `The plan works back from ${plan?.moment ?? "Vision Sunday"} on ${new Date(`${publicDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}.` : `There is no date for ${plan?.moment ?? "Vision Sunday"} yet. ${rows.some(r => r.when_text || r.when_date) ? "The rows the AI drafts have no when until there is a date, and the whens you gave are left as they are." : "No row has a when."} Add the date and the plan can work back from it.`}</p>
            <Order missing={plan?.drafted_at && !working ? missingStages(rows) : []} />
            {view?.kind === "working" && <div className="ovr-progress is-flat" data-testid="vp-progress"><div className="row"><span><b>Drafting the visibility plan</b></span><span className="ovr-muted">Rows appear as soon as they are ready</span></div><progress className="ovr-bar" aria-label="Progress" /></div>}
            {view?.kind === "working" && view.slow && <div className="ovr-banner is-warning" role="status" data-testid="vp-slow"><TriangleAlert aria-hidden="true" /><div><strong>Drafting is taking longer than usual.</strong> You can add rows by hand while it finishes.</div></div>}
            {view?.kind === "retry" && <div className="ovr-banner is-warning" role="status" data-testid="vp-retry"><TriangleAlert aria-hidden="true" /><div><strong>The draft hit a problem and is trying again.</strong></div></div>}
            {view?.kind === "failed" && <div className="ovr-banner is-warning" role="alert" data-testid="vp-failed"><TriangleAlert aria-hidden="true" /><div><strong>AI couldn’t draft the plan.</strong> Add the rows by hand, or try again. Nothing you have written is lost.
              <div className="ovr-row"><button type="button" className="ovr-btn is-sm" disabled={api.busy || starting || closed || !ok.ai} onClick={() => void draft(false)} data-testid="vp-try-again"><RefreshCw aria-hidden="true" />Try again</button>
                <button type="button" className="ovr-btn is-sm" onClick={() => setAdding(true)} data-testid="vp-add-by-hand"><Plus aria-hidden="true" />Add a row</button></div></div></div>}
            {plan?.status === "needs_attention" && !plan.error && <div className="ovr-banner is-warning" role="status" data-testid="vp-attention"><TriangleAlert aria-hidden="true" /><div><strong>{plural(plan.dropped, "row")} didn’t meet the checks and {plan.dropped === 1 ? "was" : "were"} left out.</strong> Read what is here, add what is missing, or draft the plan again.</div></div>}
            {(plan?.dates_blanked ?? 0) > 0 && <div className="ovr-banner" role="status" data-testid="vp-dates-blank"><CircleAlert aria-hidden="true" /><div><strong>{blankedText(plan!.dates_blanked!)}.</strong> {plan!.dates_blanked === 1 ? "The rest of the row is kept. Set it on the row." : "The rest of each row is kept. Set them on the rows."}</div></div>}
            {plan?.status === "thin" && <div className="ovr-banner" role="status" data-testid="vp-thin"><CircleAlert aria-hidden="true" /><div><strong>The room said little about who needs to hear the Vision.</strong> Start from the date of {plan.moment}, work back from it, and add the rows yourself.</div></div>}
            {!ok.ai && !rows.length && <div className="ovr-banner" role="status" data-testid="vp-ai-off"><CircleAlert aria-hidden="true" /><div><strong>AI is off for this engagement.</strong> Add the rows by hand.</div></div>}
            {ask !== null && <div className="cwl-vp-ask" role="alertdialog" aria-label="Keep your rows" data-testid="vp-ask">
              <span><strong>{plural(ask, "row")} {ask === 1 ? "is" : "are"} yours or reviewed.</strong> Drafting again keeps {ask === 1 ? "it" : "them"} where {ask === 1 ? "it is" : "they are"} and replaces only the rows you haven’t touched.</span>
              <div className="ovr-row"><button type="button" className="ovr-btn is-primary is-sm" disabled={api.busy || starting} onClick={() => void draft(true)} data-testid="vp-ask-yes">Keep them and redraft the rest</button>
                <button type="button" className="ovr-btn is-sm" onClick={() => setAsk(null)} data-testid="vp-ask-no">Cancel</button></div></div>}
            <div className="cwl-vp-grid">
              <div className="cwl-vp-scroll">{rows.length ? <table className="cwl-vp-table" data-testid="vp-table">
                <thead><tr><th scope="col">Who</th><th scope="col">When</th><th scope="col">Who tells them</th><th scope="col">What they hear</th><th scope="col">The risk it answers</th><th scope="col"><span className="cwl-vp-sr">Review</span></th></tr></thead>
                <tbody>{rows.map(r => <tr key={r.id} className={`cwl-vp-row${r.id === selected ? " is-selected" : ""}${r.needs_source ? " is-flag" : ""}`} data-testid="vp-row" data-origin={r.origin} data-stage={r.stage} data-reviewed={r.reviewed ? "yes" : "no"} onClick={() => setSelected(r.id)}>
                  <td className="who"><Cell row={r} field="who" editing={editing} setEditing={setEditing} api={api} locked={drafting} publicDate={publicDate} />
                    <div className="cwl-vp-marks"><span className="cwl-vp-chip">{stageNames[r.stage]}</span>
                      {r.origin === "ai" && <span className="cwl-vp-ai" data-testid="vp-ai-icon"><AiMark label="Drafted by AI" /></span>}
                      {r.origin === "facilitator" ? <span className="cwl-vp-chip" data-testid="vp-mark" data-kind="yours">Yours</span> : <span className="cwl-vp-chip" data-testid="vp-mark" data-kind={r.needs_source ? "none" : "sources"}>{r.needs_source ? "No source" : plural(r.sources.length, "source")}</span>}
                      {r.origin === "ai" && r.touched && <span className="cwl-vp-chip is-edited" data-testid="vp-edited"><PenLine aria-hidden="true" />Edited</span>}</div></td>
                  <td><Cell row={r} field="when" editing={editing} setEditing={setEditing} api={api} locked={drafting} publicDate={publicDate} /></td>
                  <td><Cell row={r} field="by_whom" editing={editing} setEditing={setEditing} api={api} locked={drafting} publicDate={publicDate} /></td>
                  <td><Cell row={r} field="what_they_hear" editing={editing} setEditing={setEditing} api={api} locked={drafting} publicDate={publicDate} /></td>
                  <td className="risk"><Cell row={r} field="risk" editing={editing} setEditing={setEditing} api={api} locked={drafting} publicDate={publicDate} /></td>
                  <td className="rv">{r.reviewed
                    ? <button type="button" className="ovr-st is-reviewed" disabled={drafting || api.busy} onClick={e => { e.stopPropagation(); void api.act({ action: "unreview", row: r.id }); }} data-testid="vp-unreview" aria-label="Clear the review"><BadgeCheck aria-hidden="true" />Clear the review</button>
                    : <button type="button" className="ovr-btn is-confirm is-sm" disabled={drafting || api.busy} onClick={e => { e.stopPropagation(); void api.act({ action: "reviewed", row: r.id }); }} data-testid="vp-review"><BadgeCheck aria-hidden="true" />Mark reviewed</button>}</td></tr>)}</tbody></table>
                : <p className="cwl-vp-empty" data-testid="vp-empty">{working ? "Drafting the plan. Rows appear here as soon as they are ready." : "No rows yet. Draft the plan from what the room said, or add a row by hand."}</p>}</div>
              <Panel row={picked} api={api} locked={drafting} pos={picked ? rows.findIndex(r => r.id === picked.id) : -1} count={rows.length} />
            </div>
            {adding && <AddRow api={api} onDone={() => setAdding(false)} />}
            <div className="cwl-vp-foot">
              <div className="ovr-row">
                <button type="button" className="ovr-btn is-primary" disabled={api.busy || starting || drafting || !ok.ai} title={ok.ai ? undefined : "AI is off for this engagement"} onClick={() => void draft(false)} data-testid="vp-draft"><RefreshCw aria-hidden="true" />{rows.some(r => r.origin === "ai") ? "Redraft the plan" : "Draft the plan"}</button>
                <button type="button" className="ovr-btn" disabled={api.busy || drafting} onClick={() => setAdding(true)} data-testid="vp-add"><Plus aria-hidden="true" />Add a row</button>
                <span className="ovr-muted" data-testid="vp-left">{rows.length ? (left ? `${left} of ${rows.length} rows still need review` : "Every row is reviewed") : "Nothing is reviewed yet"}</span></div>
              {ok.report_draft && ok.report_stale && !closed
                ? <button type="button" className="ovr-btn is-sm" disabled={api.busy || reporting} onClick={() => void refreshReport()} data-testid="vp-report-refresh"><RefreshCw aria-hidden="true" />Refresh Make the Vision Visible in the report</button>
                : <Link className="ovr-btn is-sm is-ghost" href={`/control/${engagement}/report`} data-testid="vp-report-link"><FileText aria-hidden="true" />{ok.report_draft ? "Open Make the Vision Visible in the report" : "Open the report"}</Link>}</div>
            {ok.report_draft && ok.report_stale && <p className="ovr-muted" data-testid="vp-report-stale">The report’s Make the Vision Visible section no longer matches this plan, and it has to be reviewed again once it is refreshed.</p>}
            {reportNote && <p className="ovr-muted" role="status" data-testid="vp-report-note">{reportNote}</p>}
            {rows.length > 0 && !inOutwardOrder(rows) && <p className="ovr-muted" data-testid="vp-order-note"><Undo2 aria-hidden="true" width={14} height={14} /> You moved rows out of the outward order. That is yours to decide.</p>}
          </section>
        </div>}
      </div>
    </main>
  </div>;
}
