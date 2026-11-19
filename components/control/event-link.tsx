"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Check, Copy, KeyRound, RefreshCw } from "lucide-react";

type State = { status: "loading" | "ready" | "hidden" | "failed"; url: string | null };

// An event's admin link (November 19): a link anyone can open to run this event without signing in, as the event's link
// guest (a co-facilitator of this event only). Only a signed-in Clearway person sees it. Make a new link retires the old
// code at once: every browser that came in by it loses access. Two taps, so it is never replaced by accident.
export function EventLink({ engagement, compact = false, wrap }: { engagement: string; compact?: boolean; wrap?: (body: ReactNode) => ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading", url: null });
  const [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [armed, setArmed] = useState(false), [note, setNote] = useState("");
  const call = useCallback(async (action: "read" | "create" | "cycle") => {
    const response = await fetch(`/api/facilitator/${engagement}/event-link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (response.status === 401 || response.status === 403) return { hidden: true as const };
    const data = await response.json().catch(() => null) as { ok?: boolean; url?: string | null } | null;
    if (!response.ok || !data?.ok) throw new Error("event link");
    return { url: data.url ?? null };
  }, [engagement]);
  useEffect(() => {
    let live = true;
    call("read").then(r => { if (live) setState("hidden" in r ? { status: "hidden", url: null } : { status: "ready", url: r.url }); })
      .catch(() => { if (live) setState({ status: "failed", url: null }); });
    return () => { live = false; };
  }, [call]);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  if (state.status === "hidden") return null;
  async function act(action: "create" | "cycle") {
    setBusy(true); setNote("");
    try {
      const r = await call(action);
      if ("hidden" in r) { setState({ status: "hidden", url: null }); return; }
      setState({ status: "ready", url: r.url }); setCopied(false);
      setNote(action === "cycle" ? "New link made. The old link no longer works." : "Link made. Copy it and send it to anyone who should run this event.");
    } catch { setNote("We couldn’t change the link. Please try again."); }
    finally { setBusy(false); setArmed(false); }
  }
  async function copy() {
    if (!state.url) return;
    try { await navigator.clipboard.writeText(state.url); setCopied(true); setNote("Link copied."); setTimeout(() => setCopied(false), 2500); }
    catch { setNote("Select the link and copy it."); }
  }
  const Heading = compact ? "h3" : "h2";
  const body = <section className={compact ? "event-link is-compact" : "admin-panel event-link"} aria-labelledby={`event-link-${engagement}`} data-event-link>
    <Heading id={`event-link-${engagement}`}><KeyRound size={18} aria-hidden="true" />Admin link</Heading>
    <p className="show-help">Anyone with this link can run this event without signing in: the run of show, the live room, people and results. Only this event. Send it only to people who should have that.</p>
    {state.status === "loading" ? <p className="show-help" role="status">Loading the link</p>
      : state.status === "failed" ? <p className="show-help" role="status">We couldn’t load the link. Please refresh.</p>
      : state.url ? <>
        <div className="event-link-row"><input className="event-link-url" readOnly value={state.url} aria-label="Admin link for this event" onFocus={e => e.currentTarget.select()} data-testid="event-link-url" />
          <button type="button" className="show-button" onClick={() => void copy()}>{copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}{copied ? "Copied" : "Copy link"}</button></div>
        <button type="button" className="show-button" disabled={busy} onClick={() => armed ? void act("cycle") : setArmed(true)}><RefreshCw size={18} aria-hidden="true" />{armed ? "Tap again: the old link stops working" : "Make a new link"}</button>
      </> : <button type="button" className="show-button" disabled={busy} onClick={() => void act("create")}><KeyRound size={18} aria-hidden="true" />Make an admin link</button>}
    {note && <p className="show-help" role="status">{note}</p>}
  </section>;
  return <>{wrap ? wrap(body) : body}</>;
}
