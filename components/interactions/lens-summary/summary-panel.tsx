"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, EyeOff, Pause, Play, Plus, Redo2, Trash2, Undo2, Zap } from "lucide-react";
import type { ControlPanelProps } from "@/components/interactions/control-panels";
import { AiIcon, AiMark } from "@/components/interactions/ai/ai-icon";
import { pressMessages } from "@/lib/interactions/goals";
import { aiStateLine, facilitatorState, maxLines, summaryLimit, type FacilitatorState } from "@/lib/interactions/lens-summary";
import { pressId } from "@/lib/control/own-presses";
import { lensDecisionField } from "@/components/control/mark-decision";
import "@/components/interactions/ai/ai.css";
import "./lens-summary.css";

// INT-18 on the control surface: the lens, the summary on the TV (editable while it is up), the room's
// suggestions, what AI is doing, every version, and Mark a decision. Counts show where the room is; the
// facilitator decides. The sources behind each line, the AI's pace and the versions are private.
const typeBatchMs = 120, beatMs = 10000, pollMs = 3000;
const messages: Record<string, string> = { ...pressMessages, locked: "Someone else is editing this summary right now.", decided: "This lens is already decided. Take it back to the screen to change it.", engagement_off: "AI is off for this engagement. Turn it on in setup." };
const Private = ({ title, children }: { title: string; children: React.ReactNode }) =>
  <section className="ctl-private lsm-panel" aria-label={`${title}, only you see this`} data-lens-summary-panel><div className="show-private"><EyeOff size={16} aria-hidden="true" />Only you see this<span>{title}</span></div><div className="ctl-private-body">{children}</div></section>;

async function post(engagement: string, body: Record<string, unknown>) {
  try {
    const r = await fetch(`/api/control/${engagement}/lens-summary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: pressId(), ...body }) });
    const out = await r.json().catch(() => ({})) as { status?: string };
    return out.status ?? "unavailable";
  } catch { return "unavailable"; }
}

export function LensSummaryPanel({ room }: ControlPanelProps) {
  const engagement = room.show.context.id, session = room.frame?.session, live = session?.interaction === "lens_summary", version = room.frame?.version;
  const [data, setData] = useState<FacilitatorState | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({}), [fresh, setFresh] = useState(""), [word, setWord] = useState("Signed off"), [reasons, setReasons] = useState("");
  const running = useRef(false), again = useRef(false), latest = useRef<FacilitatorState | null>(null), pending = useRef(new Map<number, string>()), flushing = useRef(false), timer = useRef<ReturnType<typeof setTimeout>>(undefined), beat = useRef<ReturnType<typeof setInterval>>(undefined);
  const load = useCallback(async () => {
    if (running.current) { again.current = true; return; } running.current = true;
    try { const r = await fetch(`/api/control/${engagement}/lens-summary`, { cache: "no-store" }); if (r.ok) { const next = facilitatorState(await r.json()); if (next) { latest.current = next; setData(next); } } }
    catch { /* keep the last read */ }
    finally { running.current = false; if (again.current) { again.current = false; void load(); } }
  }, [engagement]);
  // A read that never waits on another: a first edit makes new line ids, and the next batch needs them.
  const readNow = useCallback(async () => {
    try { const r = await fetch(`/api/control/${engagement}/lens-summary`, { cache: "no-store" }); if (r.ok) { const next = facilitatorState(await r.json()); if (next) { latest.current = next; setData(next); } } } catch { /* keep the last read */ }
  }, [engagement]);
  useEffect(() => { if (live) void load(); }, [live, load, version]);
  useEffect(() => { if (!live) return; const t = setInterval(() => void load(), pollMs); return () => clearInterval(t); }, [live, load]);
  useEffect(() => () => { clearTimeout(timer.current); clearInterval(beat.current); }, []);

  const sm = data?.summary ?? null, locked = Boolean(sm?.lock && !sm.lock.mine), signed = sm?.state === "signed_off";
  async function act(body: Record<string, unknown>, after?: (status: string) => void) {
    setBusy(true); setMessage("");
    const status = await post(engagement, { session: session?.id, ...body });
    if (!["ok", "duplicate", "unchanged"].includes(status)) setMessage(messages[status] ?? messages.unavailable);
    setBusy(false); void load(); after?.(status); return status;
  }
  // Typing goes to the TV in small batches, one at a time: a first edit makes the facilitator's own version, so
  // the next batch reads the new line ids before it goes.
  const flush = useCallback(async () => {
    if (flushing.current) return; flushing.current = true;
    try {
      while (pending.current.size) {
        const [pos, text] = [...pending.current.entries()][0]; pending.current.delete(pos);
        const line = latest.current?.summary?.lines[pos - 1];
        if (!line || !text.trim()) continue;
        const status = await post(engagement, { session: session?.id, action: "edit", op: "text", sentence: line.id, text });
        if (!["ok", "duplicate", "unchanged"].includes(status)) { setMessage(messages[status] ?? messages.unavailable); pending.current.clear(); break; }
        if (status === "ok") await readNow();
      }
    } finally { flushing.current = false; }
  }, [engagement, readNow, session?.id]);
  function type(pos: number, text: string) {
    setDrafts(d => ({ ...d, [pos]: text })); pending.current.set(pos, text);
    clearTimeout(timer.current); timer.current = setTimeout(() => void flush(), typeBatchMs);
  }
  function begin(pos: number) {
    const line = latest.current?.summary?.lines[pos - 1];
    void post(engagement, { session: session?.id, action: "edit_start", ...(line ? { sentence: line.id } : {}) });
    clearInterval(beat.current); beat.current = setInterval(() => void post(engagement, { session: session?.id, action: "edit_beat" }), beatMs);
  }
  async function finish() {
    clearTimeout(timer.current); await flush();
    clearInterval(beat.current);
    await post(engagement, { session: session?.id, action: "edit_done" });
    setDrafts({}); void load();
  }
  if (!live || !session) return null;
  const ai = data?.ai, lines = sm?.lines ?? [], stateLine = ai ? aiStateLine[ai.state] : "";
  const jump = (to: number | "next" | "prev") => void act({ action: "show", to });
  return <Private title="Lens summary">
    <div className="lsm-nav">
      <button type="button" className="show-button is-small" disabled={busy || !data?.lens || data.lens <= 1} onClick={() => jump("prev")}><ChevronLeft size={16} aria-hidden="true" />Previous lens</button>
      <ol className="lsm-nav-chips" aria-label="The five lenses">
        {(data?.lenses ?? []).map(l => <li key={l.lens}><button type="button" className="lsm-chip" data-state={l.state} aria-current={l.lens === data?.lens ? "step" : undefined} disabled={busy || !l.open} onClick={() => l.lens !== data?.lens && jump(l.lens)}>
          {l.state === "signed_off" && <Check size={14} aria-hidden="true" />}{l.name}<small>{l.state === "signed_off" ? "Decided" : l.drafted ? "Drafted" : l.open ? `${l.sentences} sentences` : "Not open"}</small></button></li>)}
      </ol>
      <button type="button" className="show-button is-small" disabled={busy || !data?.lens || data.lens >= 5} onClick={() => jump("next")}>Next lens<ChevronRight size={16} aria-hidden="true" /></button>
    </div>
    {sm?.lock && !sm.lock.mine && <p className="show-message is-error" role="status">{sm.lock.by || "Someone"} is editing this summary. You can read it; editing waits.</p>}

    <p className="ctl-label">{data?.lenses.find(l => l.lens === data.lens)?.name ?? "Lens"} · what the TV shows{sm?.versionId ? <> · Version {sm.versions.find(v => v.current)?.version ?? ""}</> : null}</p>
    {lines.length === 0 ? <p className="show-help" role="status">{ai?.state === "drafting" ? "AI is drafting this lens. It goes straight to the TV." : "No summary yet. AI drafts it from the lens sentences, or write the first line below."}</p> :
      <ol className="lsm-edit" aria-label="Summary lines">
        {lines.map((l, i) => {
          const pos = i + 1, value = drafts[pos] ?? l.text;
          return <li key={pos} data-line={l.id}>
            <textarea aria-label={`Line ${pos}`} rows={2} maxLength={400} value={value} disabled={signed || locked} onFocus={() => begin(pos)} onChange={e => type(pos, e.target.value)} onBlur={() => void finish()} />
            <button type="button" className="show-button is-small is-icon" aria-label={`Remove line ${pos}`} disabled={busy || signed || locked || lines.length <= 1}
              onClick={() => void act({ action: "edit", op: "remove", sentence: l.id })}><Trash2 size={16} aria-hidden="true" /></button>
            {l.sources.length > 0 && <details className="lsm-sources"><summary>From {l.sources.length} {l.sources.length === 1 ? "sentence" : "sentences"}</summary><ul>{l.sources.map((t, k) => <li key={k}>{t}</li>)}</ul></details>}
          </li>;
        })}
      </ol>}
    {!signed && !locked && lines.length < maxLines && <form className="lsm-add" onSubmit={e => { e.preventDefault(); const t = fresh.trim(); if (t) void act({ action: "edit", op: "add", text: t }, s => { if (["ok", "duplicate"].includes(s)) setFresh(""); }); }}>
      <input aria-label="Add a line" maxLength={400} placeholder="Add a line" value={fresh} onChange={e => setFresh(e.target.value)} />
      <button type="submit" className="show-button is-small" disabled={busy || !fresh.trim()}><Plus size={16} aria-hidden="true" />Add line</button></form>}
    <p className="ai-note">One screen is {summaryLimit} characters. Lines past that show as “+ n more on phones”. Edits replace the line on the TV as you type.</p>

    <div className="lsm-ai" data-ai-state={ai?.state}>
      <p className="lsm-ai-state" role="status"><AiMark /><span><b>{ai?.on ? "On" : "Off"}</b> · {stateLine}{ai?.failing ? " AI is not responding, so write the summary yourself." : ""}</span></p>
      <div className="ctl-row">
        <button type="button" className="show-button is-small" disabled={busy || signed || !ai?.on || !sm?.suggestions.length} onClick={() => void act({ action: "fold_now" })}><Zap size={16} aria-hidden="true" />Fold in now</button>
        {sm?.foldHeld ? <button type="button" className="show-button is-small" disabled={busy || signed} onClick={() => void act({ action: "release" })}><Play size={16} aria-hidden="true" />Release</button>
          : <button type="button" className="show-button is-small" disabled={busy || signed} onClick={() => void act({ action: "hold" })}><Pause size={16} aria-hidden="true" />Hold</button>}
        <button type="button" className="show-button is-small" disabled={busy || signed || !sm?.versionId} onClick={() => void act({ action: "undo" })}><Undo2 size={16} aria-hidden="true" />Undo</button>
        <button type="button" className="show-button is-small" disabled={busy || signed || !ai?.on} onClick={() => void act({ action: "redraft" })}><Redo2 size={16} aria-hidden="true" />Write it again</button>
        <button type="button" className="show-button is-small" disabled={busy || (!ai?.engagement && !ai?.on)} onClick={() => void act({ action: ai?.on ? "ai_off" : "ai_on" })}><AiIcon />{ai?.on ? "Turn AI off" : "Turn AI on"}</button>
      </div>
    </div>

    <p className="ctl-label">What the room says</p>
    <p className="ai-note" data-tally>{sm?.tally.approve ?? 0} approved · {sm?.tally.suggest ?? 0} suggested a change · of {sm?.attendees ?? 0} here. Counts show where the room is. You decide.</p>
    {sm?.suggestions.length ? <ul className="lsm-suggestions" aria-label="Suggestions, anonymous">{sm.suggestions.map(s => <li key={s.id}>{s.text}</li>)}</ul> : <p className="show-help">No suggestions on this version.</p>}

    <div className="lsm-decide">
      <p className="ctl-label">Mark a decision</p>
      {signed && sm?.decision ? <>
        <p role="status" data-decision><Check size={16} aria-hidden="true" /> {sm.decision.decision}{sm.decision.reasons ? <small> · {sm.decision.reasons}</small> : null}</p>
        <button type="button" className="show-button is-small" disabled={busy} onClick={() => void act({ action: "undecide" })}><Undo2 size={16} aria-hidden="true" />Take back to the screen</button>
      </> : <>
        <label className="lsm-field">What the room decided<input id={lensDecisionField} maxLength={400} value={word} onChange={e => setWord(e.target.value)} /></label>
        <label className="lsm-field">Reasons, if any<textarea rows={2} maxLength={1000} value={reasons} onChange={e => setReasons(e.target.value)} /></label>
        <button type="button" className="show-button is-primary" disabled={busy || !sm?.versionId || lines.length === 0} onClick={() => void act({ action: "decide", decision: word, reasons })}><Check size={16} aria-hidden="true" />Mark a decision</button>
      </>}
    </div>

    {sm && sm.versions.length > 0 && <details className="lsm-versions"><summary>Versions ({sm.versions.length})</summary>
      <ol>{sm.versions.map(v => <li key={v.id} data-version={v.version}>
        <b>Version {v.version}</b> · {v.author === "ai" ? "AI" : "You"}{v.current ? " · on the TV" : ""}{v.signed ? " · decided" : ""}{v.undone ? " · undone" : ""}{v.tracked ? " · folded from suggestions" : ""}
        <small> · {v.approve} approved · {v.suggest} suggested</small>
        {v.note && <small> · {v.note}</small>}
        <ul>{v.lines.map((t, k) => <li key={k}>{t}</li>)}</ul>
      </li>)}</ol></details>}
    {message && <p className="show-message is-error" role="alert">{message}</p>}
  </Private>;
}
