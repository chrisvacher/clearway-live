"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PowerOff } from "lucide-react";

// End the workshop: sets the same closed status Details sets, through the same save. It asks first and says what happens.
export function EndWorkshop({ engagement, closed, className = "show-button" }: { engagement: string; closed: boolean; className?: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false), [busy, setBusy] = useState(false), [ended, setEnded] = useState(false), [error, setError] = useState("");
  const keep = useRef<HTMLButtonElement>(null), opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!asking) return;
    keep.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) setAsking(false); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [asking, busy]);
  async function end() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ action: "end_workshop", id: engagement }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.message || "We couldn’t end the workshop. Please try again.");
      setEnded(true); setAsking(false); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "We couldn’t end the workshop. Please try again."); }
    finally { setBusy(false); }
  }
  if (closed || ended) return <span className="ctl-chip" role="status" data-testid="workshop-ended"><PowerOff size={14} aria-hidden="true" />Workshop ended</span>;
  return <>
    <button ref={opener} type="button" className={className} onClick={() => setAsking(true)} data-testid="end-workshop"><PowerOff size={18} aria-hidden="true" />End the workshop</button>
    {asking && <div className="ctl-dialog-scrim" onClick={() => !busy && setAsking(false)}>
      <div className="ctl-dialog" role="alertdialog" aria-modal="true" aria-labelledby="end-workshop-title" aria-describedby="end-workshop-text" onClick={e => e.stopPropagation()}>
        <h2 id="end-workshop-title">End the workshop?</h2>
        <p id="end-workshop-text">Phones are signed out and answers close. Results stay here to read and download. To open the room again, change the status on Details.</p>
        {error && <p className="show-message is-error" role="alert">{error}</p>}
        <div className="ctl-row">
          <button type="button" className="show-button is-primary" disabled={busy} onClick={() => void end()} data-testid="end-workshop-confirm">{busy ? "Ending…" : "End the workshop"}</button>
          <button ref={keep} type="button" className="show-button" disabled={busy} onClick={() => { setAsking(false); opener.current?.focus(); }}>Keep the workshop going</button>
        </div>
      </div>
    </div>}
  </>;
}
