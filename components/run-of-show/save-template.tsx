"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Copy, X } from "lucide-react";

// Save as template (SET-08), from any run of show. What it copies is said plainly: the
// sessions with their prompts, settings, timings and notes, never answers or people.
export function SaveTemplate({ engagement, name, count, onClose }: { engagement: string; name: string; count: number; onClose: (saved?: string) => void }) {
  const [value, setValue] = useState(name), [shared, setShared] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [saved, setSaved] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.select(); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [busy, onClose]);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", input: { engagement, name: value, shared } }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.status !== "ok") { setMessage(result.message || "We couldn’t save the template. Please try again."); return; }
      setSaved(true); setMessage(`Saved ${value.trim()} with ${result.count} ${result.count === 1 ? "session" : "sessions"}.`);
    } catch { setMessage("We couldn’t save the template. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="rb-scrim" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <form className="rb-modal" role="dialog" aria-modal="true" aria-labelledby="save-template-title" onSubmit={save}>
      <div className="rb-modal-head"><h2 id="save-template-title">Save as template</h2><button type="button" className="show-button is-icon" aria-label="Close" disabled={busy} onClick={() => onClose()}><X size={20} aria-hidden="true" /></button></div>
      <div className="rb-modal-body">
        {saved ? <p role="status">{message} Start an engagement from it in <Link className="text-link" href="/setup/templates">Templates</Link>.</p> : <>
          <label htmlFor="template-name">Name<input ref={first} id="template-name" required maxLength={120} value={value} onChange={e => setValue(e.target.value)} /></label>
          <div><p className="show-help"><b>What it copies</b></p><p className="show-muted">{count} {count === 1 ? "session" : "sessions"} with their prompts, interaction settings, timings and presenter notes. Answers, attendees and dates are never copied.</p></div>
          <label className="show-check" htmlFor="template-shared">Share with the Clearway team<input id="template-shared" type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} /></label>
          {message && <p className="show-message is-error" role="alert">{message}</p>}
        </>}
      </div>
      <div className="rb-modal-foot">{saved ? <button type="button" className="show-button is-primary" onClick={() => onClose(`${message} Find it in Templates.`)}>Close</button> : <>
        <button type="button" className="show-button" disabled={busy} onClick={() => onClose()}>Cancel</button>
        <button type="submit" className="show-button is-primary" disabled={busy || !value.trim()}><Copy size={18} aria-hidden="true" />{busy ? "Saving..." : "Save template"}</button></>}</div>
    </form>
  </div>;
}
