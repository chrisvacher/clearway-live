"use client";
import { useState } from "react";
import { Check, EyeOff, Info, Pencil, Pin, PinOff, Redo2, TriangleAlert, Undo2, X } from "lucide-react";
import { GeneralItems, type Room } from "@/components/control/live-controls";
import { ago, aiNotice, dollars, isAiKind, seconds, type AiGroupRow, type AiStatus } from "@/lib/interactions/ai";
import { AiIcon, AiMark, useAiSweep } from "./ai-icon";
import { useAiStatus } from "./use-ai-status";
import "./ai.css";

const stateText = (s: AiStatus) => {
  const session = s.session!;
  if (!s.engagement_ai) return "Off for this engagement";
  if (!session.ai) return session.interaction === "wall" || session.interaction === "lens" ? "Off: the wall shows arrival order" : "Switched off for this session";
  if (s.state?.failing) return "Not responding: arrival order for now";
  if (s.state?.slow) return `Slow: ${seconds(s.state.running_ms ?? s.state.last_ms)} to ${session.interaction === "wall" || session.interaction === "lens" ? "group" : session.interaction === "qa" ? "fold" : "combine"}`;
  if (session.interaction === "word_cloud") return (s.different ?? 0) < (s.threshold ?? 30) ? `Combines once there are about ${s.threshold ?? 30} different answers` : "Combines near-duplicates as answers arrive";
  return session.interaction === "wall" ? "Groups as answers arrive" : session.interaction === "lens" ? "Groups sentences by theme as they arrive" : "Folds near-duplicate questions as they arrive";
};

// FAIL-09 and the AI controls for the step on the TV (laptop): what AI is doing, its switch,
// Undo last AI change, Show summary, and what AI has cost this engagement. Only you see this.
export function AiPanel({ room }: { room: Room }) {
  const { status, busy, message, press } = useAiStatus(room);
  const s = status?.session;
  // Each new AI run that changed the room sweeps the panel's AI icon once. Undo goes back to a run already seen.
  const sweep = useAiSweep<HTMLDivElement>(status?.last_change ? [status.last_change.run] : [], s?.id ?? null);
  if (!status || !s || !isAiKind(s.interaction)) return null;
  const notice = aiNotice(status), wall = s.interaction === "wall", grouping = wall || s.interaction === "lens";
  const live = status.combines?.filter(c => !c.undone).length ?? 0, folds = status.folds?.filter(f => !f.undone).length ?? 0;
  const meter: [string, string][] = s.interaction === "word_cloud" ? [[String(status.different ?? 0), "Different answers"], [s.ai ? String(live) : "Off", "AI combines"], [seconds(status.state?.last_ms), "AI response"]]
    : grouping ? [[String(status.answers ?? 0), s.interaction === "lens" ? "Sentences" : "Answers"], [s.ai ? `${status.grouped ?? 0} of ${status.answers ?? 0}` : "Off", "Grouped by AI"], [seconds(status.state?.running_ms ?? status.state?.last_ms), "AI response"]]
    : [[s.ai ? String(folds) : "Off", "Folded by AI"], [String(status.cost.runs), "AI calls"], [seconds(status.state?.last_ms), "AI response"]];
  return <section className="ctl-private" aria-label="AI, only you see this" data-ai-panel>
    <div className="show-private"><EyeOff size={16} aria-hidden="true" />Only you see this<span>AI for this session</span></div>
    <div className="ctl-private-body ai-panel">
      {notice && <div className={`ai-notice is-${notice.kind}`} role="status" data-ai-notice={notice.kind}>{notice.kind === "warning" ? <TriangleAlert size={18} aria-hidden="true" /> : <Info size={18} aria-hidden="true" />}
        <div><strong>{notice.title}</strong> {notice.text}</div></div>}
      <div className="ai-state" ref={sweep}><span><AiMark /><b>{s.ai ? "On" : "Off"}</b> · {stateText(status)}</span>
        <button type="button" className="ai-switch" role="switch" aria-checked={s.ai} aria-label="AI for this session" disabled={busy || (!status.engagement_ai && !s.ai)}
          onClick={() => void press(s.ai ? "ai_off" : "ai_on", { session: s.id })} /></div>
      <div className="ai-tools">
        <button className="show-button is-small" disabled={busy || !status.last_change || !s.ai} onClick={() => void press("undo_last", { session: s.id })}><Undo2 size={16} aria-hidden="true" />Undo last AI change</button>
        <button className="show-button is-small" disabled={busy || (!status.engagement_ai && !s.ai)} onClick={() => void press(s.ai ? "ai_off" : "ai_on", { session: s.id })}><AiIcon />{s.ai ? "Turn AI off" : "Turn AI on"}</button>
        {wall && <button className={`show-button is-small${s.summary_shown ? "" : " is-primary"}`} disabled={busy || (!s.summary_shown && !s.summary_available)}
          onClick={() => void press(s.summary_shown ? "hide_summary" : "show_summary", { session: s.id })}><AiIcon />{s.summary_shown ? "Hide summary" : "Show summary"}</button>}
      </div>
      <div className="ai-meter">{meter.map(([n, label]) => <div key={label}><b>{n}</b><span>{label}</span></div>)}</div>
      {wall && s.summary_shown && <div data-ai-summary>
        <p className="ctl-label">AI summary</p>
        <p className="ctl-notes ai-summary-preview">{status.summary?.text ?? "Writing the summary. It shows on the TV as soon as it is ready."}</p>
        <p className="ai-note">On the TV · refreshes after 8 new answers or 75 seconds</p></div>}
      <p className="ai-note">AI cost for this engagement: {dollars(status.cost.usd)} across {status.cost.runs} {status.cost.runs === 1 ? "call" : "calls"}</p>
      {message && <p className="show-message is-error" role="alert">{message}</p>}
    </div>
  </section>;
}

// INT-01's list: every combine with Undo, then the words with Spotlight and Hide.
export function AiWordsPanel({ room, onClose }: { room: Room; onClose?: () => void }) {
  const { status, busy, message, press } = useAiStatus(room);
  const combines = status?.combines ?? [], on = Boolean(status?.session?.ai);
  return <>
    <section className="ctl-items" aria-labelledby="ai-combines-title" data-ai-combines>
      <div className="ctl-row is-between"><h2 id="ai-combines-title">AI combines</h2><span className="ai-note">{on ? "Undo puts both words back on the TV" : "AI is off: no combining"}</span></div>
      {combines.length ? <ul className="ai-rows">{combines.map(c => <li key={c.id} className={c.undone ? "is-undone" : ""} data-combine={c.member}>
        <span className="ai-row-text"><span className="ai-row-title">{c.member_text}  →  {c.survivor_text}</span>
          <span className="ai-row-sub">{c.undone ? "Undone · both words are back on the TV" : <><AiMark />Combined · {c.member_count} {c.member_count === 1 ? "answer" : "answers"} joined {c.survivor_count} · {ago(c.at)}</>}</span></span>
        {!c.undone && <span className="ai-row-actions"><button className="show-button is-small" disabled={busy} onClick={() => void press("undo_combine", { merge: c.id })}><Undo2 size={16} aria-hidden="true" />Undo</button></span>}
      </li>)}</ul> : <p className="show-empty">{on ? "Nothing combined yet." : "Nothing combined."}</p>}
      {message && <p className="show-message is-error" role="alert">{message}</p>}
    </section>
    <GeneralItems room={room} onClose={onClose} title="Words on the TV" />
  </>;
}

function GroupRow({ g, busy, press }: { g: AiGroupRow; busy: boolean; press: ReturnType<typeof useAiStatus>["press"] }) {
  const [editing, setEditing] = useState<string | null>(null);
  return <li className={g.undone ? "is-undone" : ""} data-group={g.label}>
    <span className="ai-row-n">{g.members.length}</span>
    {editing !== null ? <form className="ai-rename" onSubmit={e => { e.preventDefault(); void press("rename_group", { group: g.id, label: editing }).then(r => { if (["ok", "unchanged"].includes(r.status)) setEditing(null); }); }}>
      <input aria-label={`Rename ${g.label}`} value={editing} maxLength={40} autoFocus onChange={e => setEditing(e.target.value)} />
      <button className="show-button is-small is-primary" disabled={busy || !editing.trim()}><Check size={16} aria-hidden="true" />Save</button>
      <button type="button" className="show-button is-small is-icon" aria-label="Cancel rename" onClick={() => setEditing(null)}><X size={16} aria-hidden="true" /></button>
    </form> : <span className="ai-row-text"><span className="ai-row-title">{g.label}</span>
      <span className="ai-row-sub">{g.undone ? "Undone · its answers are back in arrival order" : <><AiMark />Grouped{g.pinned ? " · Pinned" : ""}{g.renamed ? " · Renamed by you" : ""}</>}</span></span>}
    {editing === null && <span className="ai-row-actions">{g.undone
      ? <button className="show-button is-small" disabled={busy} onClick={() => void press("redo_group", { group: g.id })}><Redo2 size={16} aria-hidden="true" />Redo</button>
      : <>
        <button className="show-button is-small is-icon" aria-label={`Rename ${g.label}`} title="Rename" disabled={busy} onClick={() => setEditing(g.label)}><Pencil size={16} aria-hidden="true" /></button>
        <button className="show-button is-small" disabled={busy} onClick={() => void press(g.pinned ? "unpin_group" : "pin_group", { group: g.id })}>{g.pinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}{g.pinned ? "Unpin" : "Pin"}</button>
        <button className="show-button is-small" disabled={busy} onClick={() => void press("undo_group", { group: g.id })}><Undo2 size={16} aria-hidden="true" />Undo</button>
      </>}</span>}
  </li>;
}

// INT-02's list: the AI groups with Rename, Pin and Undo (or Redo), then the answers.
export function AiWallPanel({ room, onClose }: { room: Room; onClose?: () => void }) {
  const { status, busy, message, press } = useAiStatus(room);
  const groups = status?.groups ?? [], on = Boolean(status?.session?.ai);
  return <>
    <section className="ctl-items" aria-labelledby="ai-groups-title" data-ai-groups>
      <div className="ctl-row is-between"><h2 id="ai-groups-title">{on ? "AI groups" : "Answers in arrival order"}</h2><span className="ai-note">{on ? "Pin keeps a group as it is. Undo dissolves it." : "Groups come back when AI is on"}</span></div>
      {on && (groups.length ? <ul className="ai-rows">{groups.map(g => <GroupRow key={g.id} g={g} busy={busy} press={press} />)}</ul> : <p className="show-empty">Grouping as answers arrive.</p>)}
      {message && <p className="show-message is-error" role="alert">{message}</p>}
    </section>
    <GeneralItems room={room} onClose={onClose} title="Answers on the TV" />
  </>;
}

// FAIL-09 on the remote: every AI control is here too, for when the laptop is closed.
export function AiRemote({ room }: { room: Room }) {
  const { status, busy, message, press } = useAiStatus(room);
  const s = status?.session;
  if (!status || !s || !isAiKind(s.interaction) || !s.live) return null;
  const notice = aiNotice(status), wall = s.interaction === "wall", grouping = wall || s.interaction === "lens";
  const pinAll = async () => { for (const g of (status.groups ?? []).filter(x => !x.undone && !x.pinned)) await press("pin_group", { group: g.id }); };
  return <section className="ai-remote" aria-label="AI for this session" data-ai-remote>
    <p className="ctl-eyebrow">AI for this session</p>
    {notice && <div className={`ai-notice is-${notice.kind}`} role="status">{notice.kind === "warning" ? <TriangleAlert size={18} aria-hidden="true" /> : <Info size={18} aria-hidden="true" />}<div>{notice.short}</div></div>}
    <div className="ctl-grid">
      <button className="ctl-r-btn" disabled={busy || !status.last_change || !s.ai} onClick={() => void press("undo_last", { session: s.id })}><Undo2 size={18} aria-hidden="true" />Undo last</button>
      <button className="ctl-r-btn is-primary" disabled={busy || (!status.engagement_ai && !s.ai)} onClick={() => void press(s.ai ? "ai_off" : "ai_on", { session: s.id })}><AiIcon />{s.ai ? "AI off" : "AI on"}</button>
    </div>
    {grouping && <div className="ctl-grid">
      <button className="ctl-r-btn" disabled={busy || !s.ai || !(status.groups ?? []).some(g => !g.undone && !g.pinned)} onClick={() => void pinAll()}><Pin size={18} aria-hidden="true" />Pin groups</button>
      {wall && <button className="ctl-r-btn" disabled={busy || (!s.summary_shown && !s.summary_available)} onClick={() => void press(s.summary_shown ? "hide_summary" : "show_summary", { session: s.id })}><AiIcon />{s.summary_shown ? "Hide summary" : "Summary"}</button>}
    </div>}
    {message && <p className="show-message is-error" role="alert">{message}</p>}
  </section>;
}
