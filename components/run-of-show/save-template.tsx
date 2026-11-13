"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Copy, X } from "lucide-react";

// Save as template (SET-08), from any run of show. What it copies is said plainly: the
// sessions with their prompts, settings, timings and notes, never answers or people.
// With sessions, it saves a block: those sessions only, to add to any run from Saved blocks.
export function SaveTemplate({ engagement, name, count, sessions, onClose }: { engagement: string; name: string; count: number; sessions?: string[]; onClose: (saved?: string) => void }) {
  const block = Boolean(sessions), noun = block ? "block" : "template";
  const [value, setValue] = useState(name), [shared, setShared] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [saved, setSaved] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  // The name starts as a suggestion. Opening focuses it with the text selected, and the first click selects it all again (a click would drop the selection), so click once and type replaces it. Later clicks place the caret.
  const picked = useRef(false);
  useEffect(() => { first.current?.focus(); first.current?.select(); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [busy, onClose]);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", input: { engagement, name: value, shared, ...(sessions ? { sessions } : {}) } }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.status !== "ok") { setMessage(result.message || `We couldn’t save the ${noun}. Please try again.`); return; }
      setSaved(true); setMessage(`Saved ${value.trim()} with ${result.count} ${result.count === 1 ? "session" : "sessions"}.`);
    } catch { setMessage(`We couldn’t save the ${noun}. Please try again.`); }
    finally { setBusy(false); }
  }
  return <div className="rb-scrim" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <form className="rb-modal" role="dialog" aria-modal="true" aria-labelledby="save-template-title" onSubmit={save}>
      <div className="rb-modal-head"><h2 id="save-template-title">{block ? "Save as a block" : "Save as template"}</h2><button type="button" className="show-button is-icon" aria-label="Close" disabled={busy} onClick={() => onClose()}><X size={20} aria-hidden="true" /></button></div>
      <div className="rb-modal-body">
        {saved ? (block ? <p role="status">{message} Add it to any run of show from Saved blocks.</p> : <p role="status">{message} Start an engagement from it in <Link className="text-link" href="/setup/templates">Templates</Link>.</p>) : <>
          <label htmlFor="template-name">Name<input ref={first} id="template-name" required maxLength={120} value={value} onMouseDown={e => { if (picked.current) return; picked.current = true; e.preventDefault(); e.currentTarget.focus(); e.currentTarget.select(); }} onChange={e => { picked.current = true; setValue(e.target.value); }} /></label>
          <div><p className="show-help"><b>What it copies</b></p><p className="show-muted">{count} {count === 1 ? "session" : "sessions"} with their prompts, interaction settings, timings and presenter notes. Answers, attendees and dates are never copied.</p></div>
          <label className="show-check" htmlFor="template-shared">Share with the Clearway team<input id="template-shared" type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} /></label>
          {message && <p className="show-message is-error" role="alert">{message}</p>}
        </>}
      </div>
      <div className="rb-modal-foot">{saved ? <button type="button" className="show-button is-primary" onClick={() => onClose(block ? `${message} Find it in Saved blocks.` : `${message} Find it in Templates.`)}>Close</button> : <>
        <button type="button" className="show-button" disabled={busy} onClick={() => onClose()}>Cancel</button>
        <button type="submit" className="show-button is-primary" disabled={busy || !value.trim()}><Copy size={18} aria-hidden="true" />{busy ? "Saving..." : block ? "Save block" : "Save template"}</button></>}</div>
    </form>
  </div>;
}
