"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Hand, Link2, RotateCcw, Undo2 } from "lucide-react";
import type { Room } from "@/components/control/live-controls";
import { followupLabels, followupManageText, followupStatusText, followupWindow, type FollowupState } from "@/lib/interactions/intent";
import { post, type RemoteState } from "./use-intent";
import { pressId } from "@/lib/control/own-presses";
import "./handover.css";

type Person = { id: string; first: string };
type Access = { id: string; state: FollowupState; attendee: string; first?: string; email?: string; opens_at: string; closes_at: string; tv?: boolean; remote?: boolean };
type Panel = { status: string; remote: RemoteState; followup: { status: string; access: Access | null }; people: Person[] };
const messages: Record<string, string> = { ...followupStatusText, ...followupManageText, moved: "The room moved on. Check what is live and try again.", missing: "That person or step is not available.", invalid_state: "Go live on the first step of the block, then hand over.", denied: "Only the lead facilitator can do that.", exists: "A follow-up is already issued. Revoke it or reissue it.",
  unavailable: "The room didn’t answer. Try again." };
const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// The lead's side of the remote changing hands (D2-11): who holds it, Take back, Hand over, and the
// follow-up link and code for a block run over video. Taking the remote back never changes the TV.
export function HandoverPanel({ room }: { room: Room }) {
  const engagement = room.frame?.state.engagement_id ?? "", live = room.frame?.state.live_session_id ?? null;
  const [data, setData] = useState<Panel | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [who, setWho] = useState(""), [issued, setIssued] = useState<{ link: string; code: string; emailed: boolean; first: string } | null>(null);
  const reading = useRef(false);
  const read = useCallback(async () => {
    if (!engagement || reading.current) return; reading.current = true;
    try { const r = await fetch(`/api/control/${engagement}/handover`, { cache: "no-store" }); const d = await r.json().catch(() => null); if (d?.status === "ok") setData(d); } catch { /* Next read tries again. */ } finally { reading.current = false; }
  }, [engagement]);
  useEffect(() => { void read(); const t = setInterval(() => void read(), 5000); return () => clearInterval(t); }, [read]);
  useEffect(() => { void read(); }, [room.frame?.version, read]);
  const act = async (action: "give" | "take_back" | "end", p: Record<string, unknown> = {}) => {
    setBusy(true); setMessage("");
    const out = await post(`/api/control/${engagement}/handover`, { id: pressId(), action, p: { from: live, ...p } });
    setBusy(false); void read();
    if (!["ok", "unchanged", "duplicate"].includes(out.status)) setMessage(messages[out.status] ?? messages.unavailable);
  };
  const manage = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(true); setMessage("");
    const out = await post(`/api/control/${engagement}/followup`, { action, ...body });
    setBusy(false); void read();
    if (out.status !== "ok") { setMessage(messages[out.status] ?? messages.unavailable); return; }
    if (typeof out.link === "string") setIssued({ link: out.link, code: String(out.code), emailed: out.emailed === true, first: String(out.first ?? "") });
    if (action === "revoke") setIssued(null);
  };
  if (!data) return null;
  const r = data.remote, access = data.followup.access, people = data.people;
  const teamHolds = r.active && r.holder === "team", leadHolds = r.active && r.holder === "lead";
  return <section className="hi-panel" aria-label="Hand over the remote" data-handover>
    <p className="ctl-eyebrow">The remote</p>
    {message && <p className="show-message is-error" role="alert">{message}</p>}
    {teamHolds ? <div className="hi-banner is-held" role="status"><span><b>{r.designee}</b> has the remote{r.via === "followup" ? " on the video follow-up" : ""}.</span>
      <span className="hi-row"><button type="button" className="show-button is-primary" disabled={busy} onClick={() => void act("take_back")}><Undo2 size={16} aria-hidden="true" />Take it back</button>
        <button type="button" className="show-button" disabled={busy} onClick={() => void act("end")}>End the handover</button></span></div>
    : leadHolds ? <div className="hi-banner is-lead" role="status"><span>You have the remote. {r.designee}’s block is still set. It returns to you after the block.</span>
      <span className="hi-row"><button type="button" className="show-button" disabled={busy} onClick={() => void act("give", { attendee: r.designee_id })}><Hand size={16} aria-hidden="true" />Hand it back to {r.designee}</button>
        <button type="button" className="show-button" disabled={busy} onClick={() => void act("end")}>End the handover</button></span></div>
    : <div className="hi-banner"><span>You have the remote.</span>
      <span className="hi-row"><label className="sr-only" htmlFor="hi-who">Team facilitator</label>
        <select id="hi-who" value={who} onChange={e => setWho(e.target.value)} disabled={busy}><option value="">Pick a team facilitator</option>{people.map(p => <option key={p.id} value={p.id}>{p.first}</option>)}</select>
        <button type="button" className="show-button is-primary" disabled={busy || !who || !live} onClick={() => void act("give", { attendee: who })}><Hand size={16} aria-hidden="true" />Hand over</button></span></div>}
    <p className="show-help">The team facilitator sees the steps in their block and the controls for them. Not the alignment signal, presenter notes or Discover data.</p>

    <p className="ctl-eyebrow">Video follow-up</p>
    {!access || access.state === "expired" || access.state === "revoked" ? <FollowupIssue people={people} steps={room.show.sessions.filter(x => x.mode === "live")} disabled={busy} issue={body => manage("issue", body)} previous={access?.state ?? null} />
    : <div className="hi-banner">
      <span><b>{followupLabels[access.state]}</b> for {access.first ?? "the team facilitator"}. Open {when(access.opens_at)}, ends {when(access.closes_at)}.{access.tv ? " TV view paired." : ""}</span>
      <span className="hi-row">
        <button type="button" className="show-button is-small" disabled={busy} onClick={() => void manage("extend")}>Extend by an hour</button>
        <button type="button" className="show-button is-small" disabled={busy} onClick={() => void manage("reissue")}><RotateCcw size={14} aria-hidden="true" />Reissue</button>
        <button type="button" className="show-button is-small" disabled={busy} onClick={() => void manage("revoke")}>Revoke</button></span></div>}
    {issued && <div className="hi-banner" role="status"><span>Link for {issued.first}: <span className="hi-link">{issued.link}</span><br />Code: <span className="hi-code">{issued.code}</span><br />
      {issued.emailed ? "The link was emailed. Tell them the code yourself." : "Send them the link and tell them the code. This is the only time the code shows."}</span></div>}
  </section>;
}

type Step = { id: string; title: string; planned_start: string | null; planned_minutes: number };
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
function FollowupIssue({ people, steps, disabled, issue, previous }: { people: Person[]; steps: Step[]; disabled: boolean; issue: (body: Record<string, unknown>) => void; previous: string | null }) {
  const [who, setWho] = useState(""), [picked, setPicked] = useState<string[]>([]), [from, setFrom] = useState(""), [to, setTo] = useState("");
  // The window opens an hour before the first step and ends two hours after the last. Both can be changed.
  const choose = (id: string) => {
    const next = picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id], chosen = steps.filter(x => next.includes(x.id) && x.planned_start);
    setPicked(next);
    if (chosen.length) {
      const starts = chosen.map(x => new Date(x.planned_start as string).getTime()), ends = chosen.map(x => new Date(x.planned_start as string).getTime() + x.planned_minutes * 60000);
      const w = followupWindow(new Date(Math.min(...starts)), new Date(Math.max(...ends)));
      setFrom(local(w.opens)); setTo(local(w.closes));
    }
  };
  // Why Issue link and code is off, in the order a person fills the form.
  const why = people.length === 0 ? "No one has signed in on a phone yet, so there is no team facilitator to pick." : !picked.length ? "Pick the steps in the block first." : !who ? "Pick a team facilitator to issue the link." : !from || !to ? "Set when the link opens and ends." : "";
  return <form className="hi-banner" onSubmit={e => { e.preventDefault(); if (who && picked.length && from && to) issue({ attendee: who, sessions: steps.filter(x => picked.includes(x.id)).map(x => x.id), opens_at: new Date(from).toISOString(), closes_at: new Date(to).toISOString() }); }}>
    <span>{previous === "revoked" ? "The last access was revoked." : previous === "expired" ? "The last access ended." : "No follow-up link yet."} Issue one for the block run over video.</span>
    <fieldset className="hi-field"><legend>Steps in the block</legend>{steps.map(x => <label key={x.id} className="show-radio"><input type="checkbox" checked={picked.includes(x.id)} disabled={disabled} onChange={() => choose(x.id)} />{x.title}</label>)}</fieldset>
    <span className="hi-row">
      <select aria-label="Team facilitator" value={who} onChange={e => setWho(e.target.value)} disabled={disabled}><option value="">Pick a team facilitator</option>{people.map(p => <option key={p.id} value={p.id}>{p.first}</option>)}</select>
      <label className="hi-field">Opens<input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} disabled={disabled} /></label>
      <label className="hi-field">Ends<input type="datetime-local" value={to} onChange={e => setTo(e.target.value)} disabled={disabled} /></label>
      <button type="submit" className="show-button is-primary" disabled={disabled || Boolean(why)} aria-describedby={why ? "hi-issue-why" : undefined}><Link2 size={16} aria-hidden="true" />Issue link and code</button></span>
    {why && <p className="show-help" id="hi-issue-why">{why}</p>}
  </form>;
}
