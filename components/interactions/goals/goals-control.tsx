"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, EyeOff, Pencil, Plus, Trash2, Undo2, X } from "lucide-react";
import type { ControlPanelProps } from "@/components/interactions/control-panels";
import { dateLabel, flagsOf, goalsResults, needs, pressMessages } from "@/lib/interactions/goals";
import { pressId } from "@/lib/control/own-presses";
import "./goals.css";

// The facilitator's private side of the pre-mortem and the goal builder. Nothing here reaches the TV
// or a phone: mitigations are recorded here (the scribe can tag them later), goals can be added,
// changed, marked clear or removed, and the outcome on show moves with Previous and Next.
const Private = ({ title, children }: { title: string; children: React.ReactNode }) =>
  <section className="ctl-private gl-panel" aria-label={`${title}, only you see this`}><div className="show-private"><EyeOff size={16} aria-hidden="true" />Only you see this<span>{title}</span></div><div className="ctl-private-body">{children}</div></section>;

async function send(engagement: string, route: "goals" | "reasons", body: Record<string, unknown>) {
  try {
    const r = await fetch(`/api/control/${engagement}/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: pressId(), ...body }) });
    const out = await r.json().catch(() => ({})) as { status?: string };
    return out.status ?? "unavailable";
  } catch { return "unavailable"; }
}
const said = (status: string) => ["ok", "duplicate", "unchanged"].includes(status) ? "" : pressMessages[status] ?? pressMessages.unavailable;

function useState_<T>(engagement: string, route: "goals" | "reasons", live: boolean, version: unknown) {
  const [data, setData] = useState<T | null>(null), running = useRef(false), again = useRef(false);
  const load = useCallback(async () => {
    if (running.current) { again.current = true; return; } running.current = true;
    try { const r = await fetch(`/api/control/${engagement}/${route}`, { cache: "no-store" }); if (r.ok) setData(await r.json() as T); }
    catch { /* keep the last read */ }
    finally { running.current = false; if (again.current) { again.current = false; void load(); } }
  }, [engagement, route]);
  useEffect(() => { if (live) void load(); }, [live, load, version]);
  useEffect(() => { if (!live) return; const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [live, load]);
  return { data, load };
}

// ---------- Pre-mortem (D2-07, D2-08, D2-10) ----------
type Reason = { key: string; text: string; num: number; into?: string; by_ai?: boolean; likelihood?: number; impact?: number; mitigations: { id: string; text: string; by: string }[] };
type ReasonsState = { status: string; session?: string; full?: boolean; reasons: Reason[]; ai_merges: number };
export function PremortemPanel({ room }: ControlPanelProps) {
  const engagement = room.show.context.id, session = room.frame?.session;
  const live = session?.interaction === "grid" && (session.options as { preset?: string } | undefined)?.preset === "pre_mortem";
  const { data, load } = useState_<ReasonsState>(engagement, "reasons", live, room.frame?.version);
  const [drafts, setDrafts] = useState<Record<string, string>>({}), [fresh, setFresh] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  if (!live || !session) return null;
  const reasons = data?.session === session.id ? data.reasons : [];
  async function act(body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    const s = await send(engagement, "reasons", { kind: "reasons", from: session!.id, ...body });
    setMessage(s === "limit" ? "Three mitigations is the most for one reason." : said(s)); setBusy(false); void load(); return s;
  }
  return <Private title="Pre-mortem">
    <p className="show-help">Record what the room says it will do about each reason. Merged reasons carry their mitigations with the one they join.</p>
    {(data?.ai_merges ?? 0) > 0 && <div className="ctl-row"><button className="show-button" disabled={busy} onClick={() => void act({ action: "undo_ai" })}><Undo2 size={16} aria-hidden="true" />Undo AI merges ({data!.ai_merges})</button></div>}
    {reasons.length > 0 && <ul className="gl-reasons">{reasons.map(r => <li key={r.key}>
      <strong>{r.num}. {r.text}</strong>{r.by_ai && <small> · merged by AI</small>}{r.into && <small> · merged into another reason</small>}
      {!r.into && <>
        {r.mitigations.length > 0 && <ul>{r.mitigations.map(m => <li key={m.id}>{m.text}<small> · {m.by}</small> <button className="show-button" disabled={busy} aria-label={`Remove mitigation ${m.text}`} onClick={() => void act({ action: "unmitigate", mitigation: m.id })}><X size={14} aria-hidden="true" /></button></li>)}</ul>}
        <form onSubmit={e => { e.preventDefault(); const t = (drafts[r.key] ?? "").trim(); if (t) void act({ action: "mitigate", item: r.key, text: t }).then(s => { if (s === "ok") setDrafts(d => ({ ...d, [r.key]: "" })); }); }}>
          <input aria-label={`Mitigation for ${r.text}`} maxLength={300} placeholder="What will we do about it?" value={drafts[r.key] ?? ""} onChange={e => setDrafts(d => ({ ...d, [r.key]: e.target.value }))} />
          <button type="submit" className="show-button" disabled={busy || !(drafts[r.key] ?? "").trim()}><Plus size={16} aria-hidden="true" />Record</button>
        </form></>}
    </li>)}</ul>}
    <form className="gl-row" onSubmit={e => { e.preventDefault(); const t = fresh.trim(); if (t) void act({ action: "add_reason", text: t }).then(s => { if (s === "ok") setFresh(""); }); }}>
      <input aria-label="Add a reason" maxLength={120} placeholder="Add a reason yourself" value={fresh} onChange={e => setFresh(e.target.value)} disabled={data?.full} />
      <button type="submit" className="show-button" disabled={busy || !fresh.trim() || data?.full}><Plus size={16} aria-hidden="true" />Add reason</button>
    </form>
    {data?.full && <p className="show-help">The grid holds ten reasons, the most it can.</p>}
    {message && <p className="show-message is-error" role="alert">{message}</p>}
  </Private>;
}

// ---------- CORE goal builder (INT-15) ----------
type Owner = { attendee?: string; name?: string; email?: string };
type GoalRow = { id: string; title: string; result?: string; clear: boolean; end_date?: string; owner?: Owner; core: { met: boolean; missing?: string[] }; risks: string[]; by: string };
type GoalsState = { status: string; session?: string; outcome?: string; risk_links: "required" | "later"; season_ends: { date: string; label: string }[];
  outcomes: { id: string; title: string }[]; people: { id: string; name: string }[]; risks: { id: string; n: number; text: string }[]; goals: GoalRow[] };
const someone = "other";
export function GoalsPanel({ room }: ControlPanelProps) {
  const engagement = room.show.context.id, session = room.frame?.session, live = session?.interaction === "goals";
  const { data, load } = useState_<GoalsState>(engagement, "goals", live, room.frame?.version);
  const [editing, setEditing] = useState<string | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [d, setD] = useState({ title: "", result: "", owner: "", name: "", email: "", end: "", risks: [] as string[] });
  if (!live || !session) return null;
  const view = goalsResults(room.frame?.state.results), ready = data?.session === session.id ? data : null;
  const ends = ready?.season_ends ?? [], end = d.end || (editing ? "" : ends[0]?.date ?? "");
  const valid = d.title.trim().length > 0 && (d.owner !== someone || (d.name.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim())));
  async function act(body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    const s = await send(engagement, "goals", { kind: "goals", from: session!.id, ...body });
    setMessage(s === "limit" ? "That outcome holds thirty goals." : said(s)); setBusy(false); void load(); return s;
  }
  const reset = () => { setEditing(null); setD({ title: "", result: "", owner: "", name: "", email: "", end: "", risks: [] }); };
  function fields() {
    const owner = d.owner === someone ? { name: d.name.trim(), email: d.email.trim() } : d.owner ? { attendee: d.owner } : null;
    return { title: d.title.trim(), result: d.result.trim(), owner, end_date: end || null, risks: d.risks };
  }
  function edit(g: GoalRow) {
    setEditing(g.id);
    setD({ title: g.title, result: g.result ?? "", owner: g.owner?.attendee ?? (g.owner?.email ? someone : ""), name: g.owner?.attendee ? "" : g.owner?.name ?? "", email: g.owner?.email ?? "", end: g.end_date ?? "", risks: g.risks });
  }
  return <Private title="Goal builder">
    <div className="ctl-row gl-outcome">
      <button className="show-button" disabled={busy} onClick={() => void act({ action: "outcome", to: "prev" })}><ChevronLeft size={16} aria-hidden="true" />Previous outcome</button>
      <span>{view.outcome ? `Outcome ${view.outcome.number} of ${view.outcome.of}: ${view.outcome.title}` : "No outcome"}</span>
      <button className="show-button" disabled={busy} onClick={() => void act({ action: "outcome", to: "next" })}>Next outcome<ChevronRight size={16} aria-hidden="true" /></button>
    </div>
    {(ready?.goals.length ?? 0) > 0 && <ul className="gl-reasons">{ready!.goals.map(g => { const flags = flagsOf({ letters: { C: !g.core.missing?.includes("connected"), O: !g.core.missing?.includes("owned"), R: !g.core.missing?.includes("result"), E: !g.core.missing?.includes("end_date") }, needs_risk: ready!.risk_links === "required" && g.risks.length === 0 }); return <li key={g.id}>
      <strong>{g.title}</strong><small> · {g.owner?.name ?? "No owner"}{g.end_date ? ` · ${dateLabel(g.end_date)}` : ""} · {g.by === "phone" ? "from a phone" : "added here"}</small>
      <small>{flags.length ? ` Needs: ${flags.map(f => needs[f].replace(/^Needs (an? )?/, "")).join(", ")}` : " All four CORE letters met"}</small>
      <span className="ctl-row">
        <button className="show-button" disabled={busy || !g.result} onClick={() => void act({ action: "clear", goal: g.id, clear: !g.clear })}>{g.clear ? "Result not clear yet" : "Result is clear"}</button>
        <button className="show-button" disabled={busy} onClick={() => edit(g)}><Pencil size={14} aria-hidden="true" />Edit</button>
        <button className="show-button" disabled={busy} onClick={() => void act({ action: "remove", goal: g.id })}><Trash2 size={14} aria-hidden="true" />Remove</button>
      </span></li>; })}</ul>}
    <form className="gl-form" onSubmit={e => { e.preventDefault(); if (valid) void act(editing ? { action: "edit", goal: editing, fields: fields() } : { action: "add", fields: fields() }).then(s => { if (s === "ok") reset(); }); }}>
      <input aria-label="Goal" maxLength={200} placeholder="Goal" value={d.title} onChange={e => setD({ ...d, title: e.target.value })} />
      <input aria-label="Result" maxLength={400} placeholder="Result" value={d.result} onChange={e => setD({ ...d, result: e.target.value })} />
      <select aria-label="Owner" value={d.owner} onChange={e => setD({ ...d, owner: e.target.value })}><option value="">No owner yet</option>
        {(ready?.people ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}<option value={someone}>Add by name and email</option></select>
      {d.owner === someone && <><input aria-label="Owner name" maxLength={200} placeholder="Name" value={d.name} onChange={e => setD({ ...d, name: e.target.value })} />
        <input aria-label="Owner email" type="email" maxLength={254} placeholder="Email" value={d.email} onChange={e => setD({ ...d, email: e.target.value })} /></>}
      <select aria-label="End date" value={end} onChange={e => setD({ ...d, end: e.target.value })}><option value="">No end date yet</option>
        {ends.map(s => <option key={s.date} value={s.date}>{s.label}: {dateLabel(s.date)}</option>)}</select>
      {(ready?.risks.length ?? 0) > 0 && <fieldset><legend>Risk it answers</legend>{ready!.risks.map(r => <label key={r.id}><input type="checkbox" checked={d.risks.includes(r.id)}
        onChange={e => setD({ ...d, risks: e.target.checked ? [...d.risks, r.id].slice(0, 6) : d.risks.filter(x => x !== r.id) })} />Risk {r.n}: {r.text}</label>)}</fieldset>}
      <span className="ctl-row"><button type="submit" className="show-button is-primary" disabled={busy || !valid}><Plus size={16} aria-hidden="true" />{editing ? "Save goal" : "Add goal"}</button>
        {editing && <button type="button" className="show-button" onClick={reset}>Cancel</button>}</span>
    </form>
    {message && <p className="show-message is-error" role="alert">{message}</p>}
  </Private>;
}
