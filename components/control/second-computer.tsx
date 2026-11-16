"use client";
import { useState, type FormEvent } from "react";
import { MonitorCheck } from "lucide-react";
import { pairingCode } from "@/lib/tv/policy";

const refused = (status: string) => status === "invalid_code" ? "That code couldn’t be used. Check the code on the TV and try again."
  : status === "limited" ? "Please wait a few minutes before trying another code."
  : status === "closed" ? "This engagement has closed." : "We couldn’t pair that screen. Please try again.";

// Use a second computer (November 16): the six-digit code a TV shows when it was opened at /tv on another computer, typed
// here in the live room, so pairing never means leaving the room. The same pairing Setup, Screens does.
export function SecondComputer({ engagement, closed }: { engagement: string; closed: boolean }) {
  const [open, setOpen] = useState(false), [code, setCode] = useState(""), [label, setLabel] = useState("Front TV");
  const [busy, setBusy] = useState(false), [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  async function pair(event: FormEvent) {
    event.preventDefault();
    const digits = pairingCode(code); if (!digits || !label.trim()) return;
    setBusy(true); setNote(null);
    try {
      const response = await fetch(`/api/tv/control/${engagement}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pair", code: digits, label: label.trim() }) });
      const result = await response.json().catch(() => ({ status: "unavailable" })) as { status: string };
      if (!response.ok || result.status !== "ok") setNote({ text: refused(result.status), error: true });
      else { setNote({ text: "Paired. The screen joins in a moment.", error: false }); setCode(""); }
    } catch { setNote({ text: refused("unavailable"), error: true }); }
    finally { setBusy(false); }
  }
  if (!open) return <div className="ctl-second">
    <p className="show-help">The TV opens from Open the TV. For a separate computer at the screen, open its /tv page and type the code it shows here.</p>
    <button type="button" className="show-button is-small" disabled={closed} onClick={() => setOpen(true)} data-testid="second-computer">Use a second computer</button>
  </div>;
  return <form className="ctl-second form-stack" onSubmit={pair} data-testid="second-computer-form">
    <label htmlFor="ctl-tv-code">Code on the TV<input id="ctl-tv-code" className="tv-manager-code" inputMode="numeric" autoComplete="off" maxLength={7} value={code} onChange={e => setCode(e.target.value.replace(/[^0-9 ]/g, ""))} required autoFocus /></label>
    <label htmlFor="ctl-tv-label">Name this screen<input id="ctl-tv-label" maxLength={80} value={label} onChange={e => setLabel(e.target.value)} required /></label>
    <div className="ctl-row">
      <button className="show-button is-primary is-small" disabled={busy || closed || !pairingCode(code) || !label.trim()}><MonitorCheck size={16} aria-hidden="true" />{busy ? "Pairing..." : "Pair this TV"}</button>
      <button type="button" className="show-button is-small" onClick={() => { setOpen(false); setNote(null); }}>Done</button>
    </div>
    {note && <p className={`show-help${note.error ? " is-error" : ""}`} role={note.error ? "alert" : "status"}>{note.text}</p>}
  </form>;
}
