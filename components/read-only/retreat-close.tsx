"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Undo2 } from "lucide-react";
import { longDate } from "@/lib/check-ins/policy";

// Mark the retreat closed, for when Day 2 was not closed with Close the day in the app, and Undo for a mistaken mark. It asks inside the panel first.
export function RetreatClose({ engagement, closed, closedOn, canReopen, onChange }: { engagement: string; closed: boolean; closedOn: string | null; canReopen: boolean; onChange?: () => void | Promise<void> }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false), [busy, setBusy] = useState(false), [say, setSay] = useState<string | null>(null);
  const act = async (action: "mark_closed" | "reopen") => {
    setBusy(true); setSay(null);
    try {
      const response = await fetch(`/api/control/${engagement}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const out = await response.json().catch(() => ({ status: "unavailable" })) as { status: string };
      if (out.status === "ok" || out.status === "already") { setAsking(false); await onChange?.(); router.refresh(); }
      else setSay(out.status === "checkins_started" ? "A check-in has already gone out, so this can't be undone." : out.status === "too_late" ? "It's been more than an hour, so this can't be undone here." : out.status === "too_early" ? "The retreat isn't under way yet. Set the engagement to Retreat, or set its start date, then mark it closed." : out.status === "not_available" ? "This kind of engagement has no retreat to close." : "That didn't work. Nothing changed, so try again.");
    } finally { setBusy(false); }
  };
  return <div className="shr-row" data-testid="retreat-close">
    {closed ? <>
      <span className="shr-chip is-on" data-testid="retreat-closed"><CalendarCheck size={14} aria-hidden="true" />The retreat closed{closedOn ? ` on ${longDate(closedOn)}` : ""}</span>
      {canReopen && !asking && <button type="button" className="show-button" disabled={busy} onClick={() => setAsking(true)} data-testid="retreat-undo"><Undo2 size={16} aria-hidden="true" />Undo</button>}
    </> : !asking && <button type="button" className="show-button is-primary" disabled={busy} onClick={() => setAsking(true)} data-testid="retreat-mark"><CalendarCheck size={16} aria-hidden="true" />Mark the retreat closed</button>}
    {asking && <div className="shr-confirm" role="group" aria-label={closed ? "Undo the close" : "Mark the retreat closed"}>
      {closed ? <p><strong>Undo the close?</strong> The check-in dates made from it are taken away, and links stop opening until you close the retreat again.</p>
        : <p><strong>Mark the retreat closed?</strong> Links for the elders can then be made, and the 30, 60 and 90-day check-ins are set up from today unless the retreat end date is set. You can undo this for an hour.</p>}
      <div className="shr-row"><button type="button" className="show-button is-primary" disabled={busy} onClick={() => void act(closed ? "reopen" : "mark_closed")} data-testid="retreat-confirm">{closed ? "Undo the close" : "Mark it closed"}</button>
        <button type="button" className="show-button" onClick={() => setAsking(false)}>Cancel</button></div></div>}
    {say && <p className="shr-banner is-warn" role="status">{say}</p>}
  </div>;
}
