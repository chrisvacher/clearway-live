"use client";
import { useState } from "react";
import { MonitorOff } from "lucide-react";
import type { Room } from "./live-controls";
import { quoteMessages } from "@/lib/quote/promoted";

// The remote's one control for a promoted quote: it shows only while a quote is on the TV, with its words
// (no speaker, no scribe) and one press to take it off. The TV goes back to the live step exactly as it is.
export function QuoteOnTv({ room }: { room: Room }) {
  const engagement = room.frame?.state.engagement_id ?? "", quote = room.frame?.promoted_quote ?? null;
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  if (!quote) return null;
  async function takeDown() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/control/${engagement}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "take_down" }) });
      const data = await response.json().catch(() => ({})) as { status?: string };
      if (!response.ok || !["ok", "unchanged"].includes(data.status ?? "")) setMessage(quoteMessages[data.status ?? ""] ?? "That didn’t go through. Try again.");
    } catch { setMessage("That didn’t go through. Try again."); }
    setBusy(false);
  }
  return <section className="ctl-decision" aria-label="Quote on the TV" data-testid="quote-on-tv">
    <div className="ctl-decision-head"><b>Quote on the TV</b></div>
    <p className="ctl-notes">“{quote.text}”</p>
    <button className="ctl-r-btn" disabled={busy} onClick={() => void takeDown()}><MonitorOff size={18} aria-hidden="true" />Take off the TV</button>
    {message && <p role="alert" className="show-help">{message}</p>}
  </section>;
}
