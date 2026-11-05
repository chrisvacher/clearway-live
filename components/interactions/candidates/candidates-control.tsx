"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { EyeOff, Merge, Pencil, Plus, Send, Sparkles, Trash2, Undo2, X, Check } from "lucide-react";
import type { ControlPanelProps } from "@/components/interactions/control-panels";
import { candidatesOf, cutRange, markWarning, pressMessages, sentenceCount, stateOf, suggestionLine, type CandidateRow, type CandidatesState } from "@/lib/interactions/candidates";
import "./candidates.css";

// The facilitator's side of the candidate priorities (D1-07 to D1-10). The AI's candidates, the sentences
// behind each one, the suggestions from phones and the lens wall to write from all live here and nowhere
// else: the TV shows a number and a title only. Each phone suggestion is accepted with one tap. AI is
// optional; with it off or failing, the candidates are written by hand and everything else works.
const Private = ({ title, children }: { title: string; children: React.ReactNode }) =>
  <section className="ctl-private cd-ctl" aria-label={`${title}, only you see this`}><div className="show-private"><EyeOff size={16} aria-hidden="true" />Only you see this<span>{title}</span></div><div className="ctl-private-body">{children}</div></section>;

async function press(engagement: string, body: Record<string, unknown>) {
  try {
    const r = await fetch(`/api/control/${engagement}/candidates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), ...body }) });
    const out = await r.json().catch(() => ({})) as { status?: string };
    return out.status ?? "unavailable";
  } catch { return "unavailable"; }
}
const said = (status: string) => ["ok", "duplicate", "unchanged"].includes(status) ? "" : pressMessages[status] ?? pressMessages.unavailable;

function useCandidates(engagement: string, live: boolean, version: unknown, fast: boolean) {
  const [data, setData] = useState<CandidatesState | null>(null), running = useRef(false), again = useRef(false);
  const load = useCallback(async () => {
    if (running.current) { again.current = true; return; } running.current = true;
    try { const r = await fetch(`/api/control/${engagement}/candidates`, { cache: "no-store" }); if (r.ok) setData(stateOf(await r.json())); }
    catch { /* keep the last read */ }
    finally { running.current = false; if (again.current) { again.current = false; void load(); } }
  }, [engagement]);
  useEffect(() => { if (live) void load(); }, [live, load, version]);
  useEffect(() => { if (!live) return; const t = setInterval(() => void load(), fast ? 1500 : 5000); return () => clearInterval(t); }, [live, load, fast]);
  return { data, load };
}

export function CandidatesPanel({ room }: ControlPanelProps) {
  const engagement = room.show.context.id, session = room.frame?.session, live = session?.interaction === "candidates";
  const results = candidatesOf(room.frame?.state.results), bars = (room.frame?.state.results as { bars?: { key: string }[] } | undefined)?.bars ?? [];
  const [fast, setFast] = useState(false);
  const { data, load } = useCandidates(engagement, live, room.frame?.version, fast);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [fresh, setFresh] = useState(""), [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [joining, setJoining] = useState<string | null>(null), [reasons, setReasons] = useState(""), [chosen, setChosen] = useState<string[] | null>(null);
  useEffect(() => { setFast(Boolean(data?.ai.requested || data?.ai.running)); }, [data?.ai.requested, data?.ai.running]);
  if (!live || !session) return null;
  const ok = data?.session === session.id ? data : null;
  async function act(body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    const s = await press(engagement, { from: session!.id, ...body });
    setMessage(said(s)); setBusy(false); void load(); return s;
  }
  if (!ok) return <Private title="Candidate priorities"><p className="show-help">Reading the candidates.</p></Private>;
  const ai = ok.ai, phase = ok.phase, rows = ok.candidates;
  // Marking defaults to the candidates above the cut line, in the order the points put them.
  const top = bars.slice(0, ok.cut).map(b => b.key).filter(k => rows.some(r => r.id === k));
  const picked = chosen ?? top, warn = phase === "points" || phase === "marked" ? markWarning(picked.length) : "";
  const aiLine = !ai.engagement_on ? "AI is off for this engagement. Write the candidates yourself, from the lens wall below."
    : !ai.on ? "AI is off for this step. Write the candidates yourself, from the lens wall below."
    : ai.running || ai.requested ? "AI is drafting from the lens wall. You can keep writing; its candidates join the list when they arrive."
    : ai.failing ? "AI did not answer. Try again, or write the candidates yourself."
    : ai.note === "no_sentences" ? "There are no lens sentences yet. Write the candidates yourself, or draft again once a lens has opened."
    : ai.note === "empty" ? "AI found nothing it could back with sentences. Write the candidates yourself."
    : ai.note === "short" ? "AI proposed fewer than six, because the sentences support no more. Add any you think are missing." : "";
  const hasAi = rows.some(r => r.origin === "ai");
  const rename = async (r: CandidateRow) => { if (!editing || editing.name.trim() === "" || editing.name.trim() === r.name) { setEditing(null); return; } if (await act({ action: "rename", candidate: r.id, name: editing.name.trim() }) === "ok") setEditing(null); };
  return <Private title="Candidate priorities">
    <p className="show-help">{phase === "review" ? "Review these before they go to the screen. Rename, merge or remove any, and add the ones the room would expect." : phase === "sent" ? "The candidates are on the screen. Accept the suggestions you agree with, then open the 100 points." : phase === "points" ? "Counts show where the room is. You choose which to mark." : "The provisional Vision Outcomes are marked."}</p>
    {phase === "review" && <div className="ctl-row">
      <button className="show-button" disabled={busy || !ai.on || ai.running || ai.requested} onClick={() => void act({ action: "draft" })}><Sparkles size={16} aria-hidden="true" />{hasAi ? "Redraft with AI" : "Draft candidates with AI"}</button>
      <button className="show-button is-primary" disabled={busy || ok.standing < 2} onClick={() => void act({ action: "send" })}><Send size={16} aria-hidden="true" />Send to the TV</button></div>}
    {aiLine && <p className="show-help" role="status">{aiLine}</p>}

    {rows.length > 0 ? <ul aria-label="Candidates">{rows.map(r => <li key={r.id} className={`cd-ctl-row${r.marked ? " is-marked" : ""}`}>
      <span className="cd-num">{r.num}</span>
      <div>{editing?.id === r.id
        ? <form className="cd-ctl-add" onSubmit={e => { e.preventDefault(); void rename(r); }}><input aria-label={`New name for ${r.name}`} maxLength={120} value={editing.name} onChange={e => setEditing({ id: r.id, name: e.target.value })} autoFocus />
            <button type="submit" className="show-button is-small" disabled={busy}><Check size={14} aria-hidden="true" />Save name</button>
            <button type="button" className="show-button is-small" onClick={() => setEditing(null)}><X size={14} aria-hidden="true" />Cancel</button></form>
        : <span className="cd-ctl-name">{r.name}</span>}
        <div className="cd-ctl-meta">{r.origin === "ai" ? <span className="cd-badge"><Sparkles size={12} aria-hidden="true" />AI{r.edited ? ", edited" : ""}</span> : r.origin === "phone" ? <span className="cd-badge">From a phone</span> : <span className="cd-badge">You</span>}
          {" "}{r.from > 0 ? sentenceCount(r.from) : "No sentences"}{r.marked ? " · Marked" : ""}</div>
        {joining === r.id && <div className="cd-ctl-add" role="group" aria-label={`Merge ${r.name} into`}>
          {rows.filter(x => x.id !== r.id).map(x => <button key={x.id} type="button" className="show-button is-small" disabled={busy} onClick={() => void act({ action: "merge", candidate: r.id, into: x.id }).then(() => setJoining(null))}>{x.num}. {x.name}</button>)}
          <button type="button" className="show-button is-small" onClick={() => setJoining(null)}>Cancel</button></div>}</div>
      {(phase === "review" || phase === "sent") && <div className="cd-ctl-actions">
        <button className="show-button is-small" disabled={busy} aria-label={`Rename ${r.name}`} onClick={() => setEditing({ id: r.id, name: r.name })}><Pencil size={14} aria-hidden="true" /></button>
        <button className="show-button is-small" disabled={busy || rows.length < 2} aria-label={`Merge ${r.name} into another`} onClick={() => setJoining(joining === r.id ? null : r.id)}><Merge size={14} aria-hidden="true" /></button>
        <button className="show-button is-small" disabled={busy} aria-label={`Remove ${r.name}`} onClick={() => void act({ action: "remove", candidate: r.id })}><Trash2 size={14} aria-hidden="true" /></button></div>}
      {r.sources.length > 0 && <details className="cd-ctl-sources"><summary>Behind it</summary><ul>{r.sources.map(s => <li key={s.id}>{ok.wall.find(w => w.lens === s.lens)?.name ? `${ok.wall.find(w => w.lens === s.lens)!.name}: ` : ""}{s.text}</li>)}</ul></details>}
    </li>)}</ul> : <p className="show-empty">No candidates yet.</p>}

    {(phase === "review" || phase === "sent") && <form className="cd-ctl-add" onSubmit={e => { e.preventDefault(); const t = fresh.trim(); if (t) void act({ action: "add", name: t }).then(s => { if (s === "ok") setFresh(""); }); }}>
      <input aria-label="Add a candidate" maxLength={120} placeholder="Add a candidate yourself" value={fresh} onChange={e => setFresh(e.target.value)} />
      <button type="submit" className="show-button" disabled={busy || !fresh.trim()}><Plus size={16} aria-hidden="true" />Add candidate</button></form>}

    {phase === "sent" && <>
      <h4>Suggestions from phones</h4>
      {ok.suggestions.length ? <ul aria-label="Suggestions">{ok.suggestions.map(g => <li key={g.ids[0]} className="cd-ctl-row">
        <span className="cd-badge">{g.count}</span>
        <div><span className="cd-ctl-name">{suggestionLine(g)}</span><div className="cd-ctl-meta">{g.by.join(", ")}</div></div>
        <div className="cd-ctl-actions">
          <button className="show-button is-small is-primary" disabled={busy} onClick={() => void act({ action: "accept", ids: g.ids })}><Check size={14} aria-hidden="true" />Accept</button>
          <button className="show-button is-small" disabled={busy} onClick={() => void act({ action: "dismiss", ids: g.ids })}><X size={14} aria-hidden="true" />Dismiss</button></div>
      </li>)}</ul> : <p className="show-empty">No suggestions yet.</p>}
      <div className="ctl-row">
        <button className="show-button" disabled={busy} onClick={() => void act({ action: "hold" })}><Undo2 size={16} aria-hidden="true" />Hold back from the TV</button>
        <button className="show-button is-primary" disabled={busy || ok.standing < 2} onClick={() => void act({ action: "open_points" })}>Open 100 points</button></div>
    </>}

    {(phase === "sent" || phase === "points") && <div className="ctl-row" role="group" aria-label="Cut line"><span>Cut line</span>
      {cutRange.map(n => <button key={n} className={`show-button is-small${ok.cut === n ? " is-primary" : ""}`} aria-pressed={ok.cut === n} disabled={busy} onClick={() => void act({ action: "cut", cut: n })}>{n}</button>)}</div>}

    {(phase === "points" || phase === "marked") && <>
      <p className="show-help">{results.people} {results.people === 1 ? "person has" : "people have"} placed points. Counts never decide: choose the ones to mark.</p>
      <fieldset className="cd-ctl-add" aria-label="Candidates to mark">{rows.map(r => <label key={r.id}><input type="checkbox" checked={picked.includes(r.id)} disabled={busy}
        onChange={e => setChosen((chosen ?? top).filter(x => x !== r.id).concat(e.target.checked ? [r.id] : []))} /> {r.num}. {r.name}</label>)}</fieldset>
      {warn && <p className="show-help" role="status">{warn}</p>}
      <label>Why these<textarea rows={2} maxLength={1000} value={reasons} onChange={e => setReasons(e.target.value)} placeholder="The room’s reasons, in a line" /></label>
      <div className="ctl-row">
        {phase === "points" && <button className="show-button" disabled={busy || results.total > 0} onClick={() => void act({ action: "back" })}><Undo2 size={16} aria-hidden="true" />Back to the candidates</button>}
        <button className="show-button is-primary" disabled={busy || picked.length < 1 || picked.length > 8} onClick={() => void act({ action: "mark", ids: picked, ...(reasons.trim() ? { reasons: reasons.trim() } : {}) })}>{phase === "marked" ? "Mark again" : "Mark provisional"}</button></div>
    </>}

    {(phase === "review" || phase === "sent") && ok.wall.some(w => w.clusters.length > 0 || w.loose > 0) && <div className="cd-ctl-wall"><h4>From the lens wall</h4>
      {ok.wall.filter(w => w.clusters.length > 0 || w.loose > 0).map(w => <details key={w.lens}><summary>{w.name || `Lens ${w.lens}`}{w.open ? "" : " (not opened yet)"}</summary>
        <ul>{w.clusters.map(c => <li key={c.label}><strong>{c.label}</strong> <span className="cd-ctl-meta">{sentenceCount(c.count)}</span>{" "}
          <button className="show-button is-small" disabled={busy || rows.some(r => r.name.toLowerCase() === c.label.toLowerCase())} onClick={() => void act({ action: "add", name: c.label, sources: c.sentences.map(s => s.id) })}><Plus size={14} aria-hidden="true" />Use as a candidate</button></li>)}
          {w.loose > 0 && <li className="cd-ctl-meta">{w.loose} more {w.loose === 1 ? "sentence" : "sentences"} not in a group</li>}</ul></details>)}</div>}
    {message && <p className="show-message is-error" role="alert">{message}</p>}
  </Private>;
}
