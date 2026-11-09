"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, EyeOff, Plus, RefreshCw, Undo2 } from "lucide-react";
import type { ControlPanelProps } from "@/components/interactions/control-panels";
import { AiIcon, AiMark } from "@/components/interactions/ai/ai-icon";
import { pressMessages } from "@/lib/interactions/goals";
import { aiLine, changeText, correctionLimit, decisionHint, failureLine, missingText, readBackState, reasonLimit, yesText, type Correction, type ReadBackState } from "@/lib/interactions/read-back";
import { pressId } from "@/lib/control/own-presses";
import "@/components/interactions/ai/ai.css";
import "@/components/interactions/lens-summary/lens-summary.css";
import "./read-back.css";

// D2-03 and INT-14 on the control surface (CorrectionQueue, private): Previous and Next item and the item chips, the tally, the
// "It needs a change" texts and the "What's missing?" answers (anonymous), the correction queue with Accept, Edit and Dismiss,
// Undo the last fold, and Mark a decision for the item, which settles it. Counts show where the room is. The facilitator decides.
// The scribe's reasons stay here; they never reach the TV or a phone.
const pollMs = 3000;
export const readBackDecisionField = "rbk-decision";
const messages: Record<string, string> = { ...pressMessages, decided: "This item is already settled. Take it back to the screen to change it.", engagement_off: "AI is off for this engagement. Turn it on in setup.",
  ai_off: "AI is off, so name the line and accept again.", stale: "That line has changed. Pick the line again.", too_many: "That would be more than 8 lines. Edit an existing line instead.", conflict: "That press was already used.",
  limit: "The item is too long for one screen. Shorten the wording." };
const Private = ({ title, children }: { title: string; children: React.ReactNode }) =>
  <section className="ctl-private lsm-panel" aria-label={`${title}, only you see this`} data-read-back-panel><div className="show-private"><EyeOff size={16} aria-hidden="true" />Only you see this<span>{title}</span></div><div className="ctl-private-body">{children}</div></section>;

async function post(engagement: string, body: Record<string, unknown>) {
  try {
    const r = await fetch(`/api/control/${engagement}/read-back`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: pressId(), ...body }) });
    const out = await r.json().catch(() => ({})) as { status?: string };
    return out.status ?? "unavailable";
  } catch { return "unavailable"; }
}
export function useReadBack(engagement: string, live: boolean, version: number | undefined) {
  const [data, setData] = useState<ReadBackState | null>(null), running = useRef(false), again = useRef(false);
  const load = useCallback(async () => {
    if (running.current) { again.current = true; return; } running.current = true;
    try { const r = await fetch(`/api/control/${engagement}/read-back`, { cache: "no-store" }); if (r.ok) { const next = readBackState(await r.json()); if (next) setData(next); } }
    catch { /* keep the last read */ }
    finally { running.current = false; if (again.current) { again.current = false; void load(); } }
  }, [engagement]);
  useEffect(() => { if (live) void load(); }, [live, load, version]);
  useEffect(() => { if (!live) return; const t = setInterval(() => void load(), pollMs); return () => clearInterval(t); }, [live, load]);
  return { data, load };
}

function Queue({ c, lines, busy, act }: { c: Correction; lines: ReadBackState["item"] extends infer I ? (I extends { lines: infer L } ? L : never) : never; busy: boolean; act: (body: Record<string, unknown>) => Promise<string> }) {
  const own = c.newLine ? "new" : c.lineId ?? "";
  const [pick, setPick] = useState<string | null>(null), [editing, setEditing] = useState(false), [wording, setWording] = useState(c.wording), [reason, setReason] = useState(c.reason);
  const line = pick ?? own, open = c.state === "queued" || c.state === "failed";
  const named = (id: string) => lines.find(l => l.id === id);
  const accept = () => void act({ action: "accept", correction: c.id, ...(pick !== null ? { line: pick } : {}), ...(editing ? { wording, reason } : {}) });
  return <li className="rbk-corr" data-correction={c.id} data-state={c.state}>
    <p className="lsm-ph-meta rbk-flush"><b>{c.state === "queued" ? "Waiting" : c.state === "folding" ? "AI is folding it in" : c.state === "folded" ? "Folded in" : c.state === "dismissed" ? "Dismissed" : "Needs a line"}</b> · {c.source === "scribe" ? "Scribe" : "You"}{c.by ? ` (${c.by})` : ""}</p>
    {editing ? <textarea aria-label="Agreed wording" rows={3} maxLength={correctionLimit} value={wording} onChange={e => setWording(e.target.value)} /> : <p className="rbk-flush" data-correction-wording>{c.wording}</p>}
    {editing ? <textarea aria-label="Reason" rows={2} maxLength={reasonLimit} value={reason} onChange={e => setReason(e.target.value)} /> : c.reason ? <p className="rbk-corr-why" data-correction-reason>Why: {c.reason}</p> : null}
    {c.state === "failed" && c.failure ? <p className="show-message is-error" role="status">{failureLine[c.failure] ?? "AI could not place it. Pick the line and accept again."}</p> : null}
    {open && <select aria-label="Which line" value={line} onChange={e => setPick(e.target.value)}>
      <option value="">No line named (AI places it)</option>
      {lines.map(l => <option key={l.id} value={l.id}>{`Line ${l.pos}: ${l.text.length > 60 ? `${l.text.slice(0, 60)}...` : l.text}`}</option>)}
      <option value="new">A new line</option>
    </select>}
    {c.state === "folded" && c.lineId && named(c.lineId) ? <p className="rbk-corr-why">Went to line {named(c.lineId)?.pos}.</p> : null}
    {open && <div className="rbk-corr-acts">
      <button type="button" className="show-button is-small is-primary" disabled={busy || !wording.trim()} onClick={accept} data-accept>Accept</button>
      <button type="button" className="show-button is-small" disabled={busy} onClick={() => setEditing(!editing)} aria-pressed={editing} data-edit>{editing ? "Stop editing" : "Edit"}</button>
      <button type="button" className="show-button is-small" disabled={busy} onClick={() => void act({ action: "dismiss", correction: c.id })} data-dismiss>Dismiss</button>
    </div>}
    {c.state === "folding" && <div className="rbk-corr-acts"><button type="button" className="show-button is-small" disabled={busy} onClick={() => void act({ action: "dismiss", correction: c.id })}>Dismiss</button></div>}
  </li>;
}

export function ReadBackPanel({ room }: ControlPanelProps) {
  const engagement = room.show.context.id, session = room.frame?.session, live = session?.interaction === "read_back";
  const { data, load } = useReadBack(engagement, live, room.frame?.version);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [word, setWord] = useState(""), [reasons, setReasons] = useState("");
  const [nLine, setNLine] = useState(""), [nWording, setNWording] = useState(""), [nReason, setNReason] = useState("");
  async function act(body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    const status = await post(engagement, { session: session?.id, ...body });
    if (!["ok", "duplicate", "unchanged"].includes(status)) setMessage(messages[status] ?? messages.unavailable);
    setBusy(false); void load(); return status;
  }
  if (!live || !session) return null;
  const it = data?.item ?? null, settled = it?.settled ?? false, ai = data?.ai, queue = (data?.corrections ?? []), room_ = data?.room;
  const index = data?.items.findIndex(c => c.id === data.item?.id) ?? -1;
  const jump = (to: string) => void act({ action: "show", to });
  const tally = room_?.tally ?? { yes: 0, change: 0 };
  return <Private title="Read-back">
    <div className="lsm-nav">
      <button type="button" className="show-button is-small" disabled={busy || index <= 0} onClick={() => jump("prev")} data-prev><ChevronLeft size={16} aria-hidden="true" />Previous item</button>
      <ol className="lsm-nav-chips" aria-label="Items in this confirm">
        {(data?.items ?? []).map(c => <li key={c.id}><button type="button" className="lsm-chip" data-state={c.state} data-chip={c.id} aria-current={c.id === data?.item?.id ? "step" : undefined} disabled={busy} onClick={() => c.id !== data?.item?.id && jump(c.id)}>
          {c.state === "settled" && <Check size={14} aria-hidden="true" />}{c.label}<small>{c.state === "settled" ? "Settled" : c.id === data?.item?.id ? "On the TV" : `${c.queued} waiting`}</small></button></li>)}
      </ol>
      <button type="button" className="show-button is-small" disabled={busy || index < 0 || index >= (data?.items.length ?? 0) - 1} onClick={() => jump("next")} data-next>Next item<ChevronRight size={16} aria-hidden="true" /></button>
    </div>
    {data && !data.published.any && <p className="show-message" role="status" data-unpublished>The overnight drafts aren’t published yet. Only the lens summaries are loaded. Publish the drafts, then press Reload items.</p>}
    {data?.published.newer && <p className="show-message" role="status" data-newer>A newer overnight publication is out. Reload items to read it. An item nobody has touched is rewritten; a touched one is kept.</p>}
    {data && data.notSigned.length > 0 && <p className="show-message is-error" role="status" data-not-signed>Not signed off on Day 1: {data.notSigned.join(", ")}. Those lenses are not in this confirm.</p>}
    <div className="ctl-row"><button type="button" className="show-button is-small" disabled={busy} onClick={() => void act({ action: "reload" })} data-reload><RefreshCw size={16} aria-hidden="true" />Reload items</button></div>

    {it ? <>
      <p className="ctl-label">{it.heading} · what the TV shows · Version {it.version}{settled ? " · Settled" : ""}</p>
      <ol className="rbk-lines-private" aria-label="Lines">{it.lines.map(l => <li key={l.id} data-line={l.id}>{l.text}
        {l.sources.length > 0 && <details className="lsm-sources"><summary>From {l.sources.length} {l.sources.length === 1 ? "sentence" : "sentences"}</summary><ul>{l.sources.map((t, k) => <li key={k}>{t}</li>)}</ul></details>}</li>)}</ol>
      {it.landed && <p className="show-help">This change is now the signed-off {it.kind === "lens" ? "lens summary" : "text the Map reads"}.</p>}
    </> : <p className="show-help" role="status">{data ? "No item is loaded. Press Reload items." : "Reading the confirm."}</p>}

    <p className="ctl-label">What the room says</p>
    <p className="ai-note" data-tally>{tally.yes} said {yesText} · {tally.change} said {changeText} · of {room_?.of ?? 0} here. Counts show where the room is. You decide.</p>
    <p className="ctl-label">{changeText}, anonymous</p>
    {data?.changes.length ? <ul className="rbk-answers" aria-label="Needs a change, anonymous" data-changes>{data.changes.map(c => <li key={c.id}>{c.text}</li>)}</ul> : <p className="show-help">No one has asked for a change on this version.</p>}
    <p className="ctl-label">{missingText}, anonymous</p>
    {data?.missing.length ? <ul className="rbk-answers" aria-label="What's missing, anonymous" data-missing-answers>{data.missing.map(c => <li key={c.id}>{c.text}</li>)}</ul> : <p className="show-help">Nothing is missing so far.</p>}

    <p className="ctl-label">Corrections</p>
    <div className="lsm-ai" data-ai-state={ai?.state}>
      <p className="lsm-ai-state" role="status"><AiMark /><span><b>{ai?.on ? "On" : "Off"}</b> · {ai ? aiLine[ai.state] : ""}{ai?.failing ? " AI is not responding, so name the line yourself." : ""}</span></p>
      <div className="ctl-row">
        <button type="button" className="show-button is-small" disabled={busy || settled || !it || it.version <= 1} onClick={() => void act({ action: "undo" })} data-undo><Undo2 size={16} aria-hidden="true" />Undo the last fold</button>
        <button type="button" className="show-button is-small" disabled={busy || (!ai?.engagement && !ai?.on)} onClick={() => void act({ action: ai?.on ? "ai_off" : "ai_on" })}><AiIcon />{ai?.on ? "Turn AI off" : "Turn AI on"}</button>
      </div>
    </div>
    {queue.length ? <ul className="rbk-corrections" aria-label="Correction queue" data-queue>{queue.map(c => <Queue key={`${c.id}:${c.state}`} c={c} lines={it?.lines ?? []} busy={busy} act={act} />)}</ul> : <p className="show-help" data-queue-empty>No corrections for this item. The scribe sends them here, or write one below.</p>}
    {!settled && it && <form className="rbk-new-corr" onSubmit={e => { e.preventDefault(); if (!nWording.trim()) return; void act({ action: "correct", line: nLine, wording: nWording, reason: nReason }).then(s => { if (["ok", "duplicate"].includes(s)) { setNWording(""); setNReason(""); } }); }}>
      <p className="ctl-label">Write a correction</p>
      <select aria-label="Which line for a new correction" value={nLine} onChange={e => setNLine(e.target.value)}>
        <option value="">No line named</option>{it.lines.map(l => <option key={l.id} value={l.id}>{`Line ${l.pos}: ${l.text.length > 60 ? `${l.text.slice(0, 60)}...` : l.text}`}</option>)}<option value="new">A new line</option>
      </select>
      <textarea aria-label="Agreed wording for a new correction" rows={2} maxLength={correctionLimit} value={nWording} placeholder="The wording the room agreed" onChange={e => setNWording(e.target.value)} />
      <textarea aria-label="Reason for a new correction" rows={1} maxLength={reasonLimit} value={nReason} placeholder="Why (optional)" onChange={e => setNReason(e.target.value)} />
      <button type="submit" className="show-button is-small" disabled={busy || !nWording.trim()}><Plus size={16} aria-hidden="true" />Add to the queue</button>
    </form>}

    <div className="lsm-decide">
      <p className="ctl-label">Mark a decision</p>
      {settled && it?.decision ? <>
        <p role="status" data-decision><Check size={16} aria-hidden="true" /> {it.decision.decision}{it.decision.reasons ? <small> · {it.decision.reasons}</small> : null}</p>
        <button type="button" className="show-button is-small" disabled={busy} onClick={() => void act({ action: "undecide" })}><Undo2 size={16} aria-hidden="true" />Take back to the screen</button>
      </> : <>
        <label className="lsm-field">What the room decided<input id={readBackDecisionField} maxLength={400} value={word} placeholder={decisionHint(it)} onChange={e => setWord(e.target.value)} /></label>
        <label className="lsm-field">Reasons, if any<textarea rows={2} maxLength={1000} value={reasons} onChange={e => setReasons(e.target.value)} /></label>
        <button type="button" className="show-button is-primary" disabled={busy || !it} onClick={() => void act({ action: "decide", decision: word, reasons }).then(s => { if (s === "ok") { setReasons(""); setWord(""); } })} data-decide><Check size={18} aria-hidden="true" />Mark a decision</button>
        <p className="ai-note">A decision works with any count. It settles this item and the underlines become plain words.</p>
      </>}
    </div>
    {message && <p className="show-message is-error" role="alert">{message}</p>}
  </Private>;
}

// The phone remote: Previous, Next and the tally. Everything else waits for the laptop.
export function ReadBackRemote({ room }: ControlPanelProps) {
  const engagement = room.show.context.id, session = room.frame?.session, live = session?.interaction === "read_back";
  const { data, load } = useReadBack(engagement, live, room.frame?.version);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function act(body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    const status = await post(engagement, { session: session?.id, ...body });
    if (!["ok", "duplicate", "unchanged"].includes(status)) setMessage(messages[status] ?? messages.unavailable);
    setBusy(false); void load();
  }
  if (!live || !session) return null;
  const index = data?.items.findIndex(c => c.id === data.item?.id) ?? -1, tally = data?.room?.tally ?? { yes: 0, change: 0 };
  return <section className="ctl-private" aria-label="Read-back, only you see this" data-read-back-remote><div className="show-private"><EyeOff size={16} aria-hidden="true" />Only you see this<span>Read-back</span></div>
    <div className="ctl-private-body">
      <p className="ctl-label">{data?.item?.heading ?? "Read-back"}{index >= 0 ? ` · ${index + 1} of ${data?.items.length}` : ""}</p>
      <p className="rbk-remote-tally" data-tally>{tally.yes} {yesText} · {tally.change} {changeText}</p>
      <div className="ctl-row">
        <button className="ctl-r-btn" disabled={busy || index <= 0} onClick={() => void act({ action: "show", to: "prev" })}><ChevronLeft size={18} aria-hidden="true" />Previous</button>
        <button className="ctl-r-btn" disabled={busy || index < 0 || index >= (data?.items.length ?? 0) - 1} onClick={() => void act({ action: "show", to: "next" })}>Next<ChevronRight size={18} aria-hidden="true" /></button>
      </div>
      {message && <p className="show-message is-error" role="alert">{message}</p>}
    </div></section>;
}
