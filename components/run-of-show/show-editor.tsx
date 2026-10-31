"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, DoorOpen, EyeOff, LayoutDashboard, ListOrdered, Plus, Printer, Users } from "lucide-react";
import { parts, type RunOfShow, type SessionInput, type ShowSession } from "@/lib/run-of-show/types";
import { SessionForm } from "./session-form";

function newSession(id: string): ShowSession {
  return { id: crypto.randomUUID(), engagement_id: id, title: "", part: "Day 1", position: 0, planned_start: null, planned_minutes: 5, mode: "live", opens_at: null, closes_at: null,
    interaction: "word_cloud", prompt: "", phone_depth: "", notes: "", lands_in: "", state: "draft", max_sends: 3, max_characters: 28, max_words: 3, revision: 0, settings: { anonymous: true, burst_minutes: 4, join_strip: false } };
}
const messages: Record<string, string> = {
  conflict: "Someone changed this session or its order. Your edits are still here. Reload the run of show, then reopen the session before editing.",
  running: "This session is running or already has answers. Keep its mode and interaction, or choose Nothing live before removing it.",
  closed: "This engagement has closed. Reopen it in setup before editing sessions.", denied: "Your access has changed. Sign in again to continue.",
  invalid_state: "Use the live room controls to open or close a session.", unavailable: "We couldn’t save that. Your edits are still here. Please try again.",
};
export function ShowEditor({ initial }: { initial: RunOfShow }) {
  const [show, setShow] = useState(initial), [editing, setEditing] = useState<{ session: ShowSession; fresh: boolean } | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(false), [reloadNeeded, setReloadNeeded] = useState(false);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const base = `/setup/${show.context.id}`, endpoint = `/api/run-of-show/${show.context.id}`;
  async function refresh() {
    const response = await fetch(endpoint, { cache: "no-store" }); if (!response.ok) throw new Error("load");
    const next = await response.json() as RunOfShow; setShow(next); return next;
  }
  const close = () => { setEditing(null); requestAnimationFrame(() => returnFocus.current?.focus()); };
  async function mutate(action: string, input: unknown) {
    setBusy(true); setMessage(""); setError(false);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, input }) });
      const result = await response.json();
      if (!response.ok || result.status !== "ok") { setError(true); setMessage(result.message || messages[result.status] || "Check the session details and try again."); return; }
      try { await refresh(); setMessage(action === "remove" ? "Session removed." : action === "reorder" ? "Session order saved." : "Session saved."); close(); }
      catch { setReloadNeeded(true); setMessage("Saved. Reload the run of show to see your changes."); }
    } catch { setError(true); setMessage(messages.unavailable); }
    finally { setBusy(false); }
  }
  async function reload() {
    setBusy(true);
    try { await refresh(); setReloadNeeded(false); setMessage("Run of show reloaded. Close and reopen the session to load its latest edits."); setError(false); }
    catch { setError(true); setMessage("We couldn’t load the run of show. Please try again."); }
    finally { setBusy(false); }
  }
  const open = (button: HTMLButtonElement, session: ShowSession, fresh = false) => { returnFocus.current = button; setEditing({ session, fresh }); setMessage(""); };
  function move(part: string, sessions: ShowSession[], index: number, delta: number) {
    const order = [...sessions]; [order[index], order[index + delta]] = [order[index + delta], order[index]];
    void mutate("reorder", { part, order: order.map(s => ({ id: s.id, revision: s.revision })) });
  }
  const time = (v: string | null) => v ? new Intl.DateTimeFormat("en-CA", { timeZone: show.context.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(v)) : "Set time";
  return <main id="main" className="show-app">
    <nav className="show-sidebar" aria-label="Engagement">
      <p className="show-brand">Clearway</p>
      <Link href={base}><LayoutDashboard aria-hidden="true" size={18} />Overview</Link>
      <Link href={`${base}#attendees`}><Users aria-hidden="true" size={18} />Attendees</Link>
      <Link href={`${base}/run-of-show`} aria-current="page"><ListOrdered aria-hidden="true" size={18} />Run of show</Link>
      <Link href={`${base}/door`}><DoorOpen aria-hidden="true" size={18} />Door list</Link>
      <Link href={`${base}/run-of-show/print`}><Printer aria-hidden="true" size={18} />Printouts</Link>
      <Link href="/setup">View engagements</Link>
    </nav>
    <div className="show-workspace">
      <div className="show-private"><EyeOff size={15} aria-hidden="true" />Only you see this</div>
      <header className="show-header"><div><p className="show-eyebrow">{show.context.church} · {show.context.title}</p><h1>Run of show</h1></div><div className="show-actions">
        <Link className="show-button" href={`${base}/run-of-show/print`}><Printer size={18} aria-hidden="true" />Print run of show</Link>
        <button className="show-button is-primary" disabled={busy || Boolean(editing) || reloadNeeded || show.context.closed} onClick={e => open(e.currentTarget, newSession(show.context.id), true)}><Plus size={18} aria-hidden="true" />Add session</button>
      </div></header>
      <div className="show-toolbar"><span>Times in {show.context.timezone}</span><button className="show-button" disabled={busy} onClick={() => void reload()}>Reload run of show</button></div>
      {message && !editing && <div className={`show-message${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>{message}</div>}
      {show.context.closed && <p className="show-message">This engagement has closed. You can read and print its run of show.</p>}
      <div className={`show-body${editing ? " has-panel" : ""}`}>
        <div className="show-parts">{parts.map(part => {
          const group = show.sessions.filter(s => s.part === part);
          return <section key={part} className="show-part"><h2>{part}<span>{group.length} {group.length === 1 ? "session" : "sessions"}</span></h2>
            {group.length ? <ol className="show-list">{group.map((s, index) => <li className={s.id === editing?.session.id ? "is-current" : ""} key={s.id}>
              <div className="show-order"><button className="show-button is-icon" aria-label={`Move ${s.title} up`} disabled={index === 0 || busy || Boolean(editing) || reloadNeeded || show.context.closed} onClick={() => move(part, group, index, -1)}><ArrowUp size={16} aria-hidden="true" /></button><button className="show-button is-icon" aria-label={`Move ${s.title} down`} disabled={index === group.length - 1 || busy || Boolean(editing) || reloadNeeded || show.context.closed} onClick={() => move(part, group, index, 1)}><ArrowDown size={16} aria-hidden="true" /></button></div>
              <div className="show-time">{time(s.planned_start)}</div><div className="show-session-title"><strong>{s.title}</strong><div className="show-muted">{s.interaction === "word_cloud" ? "Word cloud" : s.interaction === "wall" ? "Open text wall" : "Content"} · {s.mode === "live" ? "Live" : "Self-paced"} · {s.planned_minutes} min</div></div>
              <span className={`show-state is-${s.state}`}>{s.state.replaceAll("_", " ")}</span><button className="show-button" disabled={busy || Boolean(editing)} onClick={e => open(e.currentTarget, s)}>Edit session</button>
            </li>)}</ol> : <p className="show-empty">No sessions yet.</p>}
          </section>;
        })}</div>
        {editing && <SessionForm key={editing.session.id} {...editing} context={show.context} busy={busy} blocked={reloadNeeded} feedback={message} failed={error} onSave={async (value: SessionInput) => mutate("save", value)} onClose={close} onRemove={() => void mutate("remove", { id: editing.session.id, revision: editing.session.revision })} />}
      </div>
    </div>
  </main>;
}
