"use client";
import { useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import { pressMessages } from "@/lib/interactions/goals";
import "./goals.css";

// Pre-mortem on the phone: a person adds a reason the plan failed. It becomes a numbered item
// on the grid for everyone to place (D2-07). The id is made here, so a retry never adds twice.
export function ReasonAdd({ engagement, session, open }: { engagement?: string; session: string; open: boolean }) {
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [note, setNote] = useState(""), [ok, setOk] = useState(false);
  const id = useRef(crypto.randomUUID());
  if (!open || !engagement) return null;
  async function submit() {
    const t = text.trim(); if (!t || busy) return;
    setBusy(true); setNote(""); setOk(false);
    try {
      const r = await fetch(`/api/live/${engagement}/reason`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id.current, session, text: t }) });
      const out = await r.json().catch(() => ({ status: "unavailable" })) as { status: string };
      if (["accepted", "duplicate"].includes(out.status)) { id.current = crypto.randomUUID(); setText(""); setOk(true); }
      else setNote(out.status === "limit" ? "You’ve added three reasons. Place the ones on the grid." : out.status === "exists" ? "Someone has already added that one." : pressMessages[out.status] ?? pressMessages.unavailable);
    } catch { setNote(pressMessages.unavailable); } finally { setBusy(false); }
  }
  return <form className="gl-ph-reason" onSubmit={e => { e.preventDefault(); void submit(); }} aria-label="Add a reason">
    <label>Add a reason this plan could fail<input className="ph-input" maxLength={120} value={text} onChange={e => setText(e.target.value)} placeholder="One short reason" /></label>
    {note && <p className="ph-error" role="alert">{note}</p>}
    {ok && <p className="ph-note" role="status"><Check size={14} aria-hidden="true" />Your reason is on the screen.</p>}
    <button type="submit" className="ph-send" disabled={!text.trim() || busy}><Plus size={18} aria-hidden="true" />Add reason</button>
  </form>;
}
