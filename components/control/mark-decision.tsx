"use client";
import { useEffect, useRef, useState } from "react";
import { Gavel, X } from "lucide-react";
import type { Decision } from "@/lib/wayfinding/decision";
import type { Room } from "./live-controls";
import { pressId as newPressId } from "@/lib/control/own-presses";

// The lens summary panel's own decision field, which the toolbar's Mark a decision goes to.
export const lensDecisionField = "lsm-decision";

// Mark a decision (PRD "The room decides by consensus"). Counts and votes show where the room
// is; the facilitator records what the room decided and why. One press is one record, by a
// client-made id, so a retried press never writes twice.
export function MarkDecision({ room, variant }: { room: Room; variant: "laptop" | "remote" }) {
  const engagement = room.show.context.id, live = room.frame?.session;
  const [open, setOpen] = useState(false), [decision, setDecision] = useState(""), [reasons, setReasons] = useState("");
  const [state, setState] = useState<{ busy: boolean; message: string }>({ busy: false, message: "" });
  const [recent, setRecent] = useState<Decision[]>([]);
  const pressId = useRef<string | null>(null);
  const btn = variant === "remote" ? "ctl-r-btn" : "show-button";
  async function load() {
    try {
      const response = await fetch(`/api/control/${engagement}/decision`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(data.decisions)) setRecent(data.decisions.slice(0, 3));
    } catch { /* The list is a convenience; the press still works. */ }
  }
  useEffect(() => { if (open) void load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    if (!decision.trim() || state.busy) return;
    pressId.current ??= newPressId();
    setState({ busy: true, message: "" });
    try {
      const response = await fetch(`/api/control/${engagement}/decision`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pressId.current, decision, reasons, label: live?.title ?? "", subject: "step" }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !["ok", "duplicate"].includes(data.status)) throw new Error(data.status === "invalid_request" ? "Check the decision and the reasons." : "We couldn’t save that. Try again.");
      pressId.current = null; setDecision(""); setReasons(""); setState({ busy: false, message: "Decision marked." }); void load();
    } catch (error) { setState({ busy: false, message: error instanceof Error ? error.message : "We couldn’t save that. Try again." }); }
  }
  // A lens summary records its own decision (it signs off the lens), in its panel on the laptop. While one
  // is live there is one Mark a decision: this button goes to the lens's own, and the remote leaves it to the laptop.
  if (live?.interaction === "lens_summary") {
    if (variant === "remote") return null;
    return <button className={btn} disabled={!room.frame} onClick={() => {
      const field = document.getElementById(lensDecisionField);
      field?.scrollIntoView({ block: "center", behavior: "smooth" }); field?.focus({ preventScroll: true });
    }}><Gavel size={18} aria-hidden="true" />Mark a decision</button>;
  }
  if (!open) return <button className={btn} disabled={!room.frame} onClick={() => setOpen(true)}><Gavel size={18} aria-hidden="true" />Mark a decision</button>;
  return <section className="ctl-decision" aria-label="Mark a decision">
    <div className="ctl-decision-head"><b>Mark a decision</b><button className="show-button is-icon" onClick={() => setOpen(false)} aria-label="Close"><X size={16} aria-hidden="true" /></button></div>
    <label className="is-full" htmlFor={`decision-${variant}`}>What the room decided<textarea id={`decision-${variant}`} rows={2} maxLength={400} value={decision} onChange={e => { setDecision(e.target.value); pressId.current = null; }} /></label>
    <label className="is-full" htmlFor={`reasons-${variant}`}>Why (optional)<textarea id={`reasons-${variant}`} rows={2} maxLength={1000} value={reasons} onChange={e => { setReasons(e.target.value); pressId.current = null; }} /></label>
    <button className={`${btn} is-primary`} disabled={state.busy || !decision.trim()} onClick={() => void save()}>Save decision</button>
    {state.message && <p role="status" className="show-help">{state.message}</p>}
    {recent.length > 0 && <ul className="ctl-decision-list">{recent.map(d => <li key={d.id}><b>{d.decision}</b>{d.reasons && <span>{d.reasons}</span>}</li>)}</ul>}
  </section>;
}
