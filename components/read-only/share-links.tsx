"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, Link2Off, Plus } from "lucide-react";
import { stamp, type ShareLink, type ShareState } from "@/lib/read-only/policy";
import { RetreatClose } from "./retreat-close";
import "./read-only.css";

type Ok = Extract<ShareState, { status: "ok" }>;

// AFT-03, the facilitator's side: Day 2 must have closed, then named links, each shown once when it is made and turned off with one confirmation.
export function ShareLinks({ engagement, church, title, initial }: { engagement: string; church: string; title: string; initial: Ok }) {
  const [state, setState] = useState(initial);
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), [asking, setAsking] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ name: string; link: string } | null>(null), [copied, setCopied] = useState(false), [say, setSay] = useState<string | null>(null);
  const read = useCallback(async () => {
    try {
      const response = await fetch(`/api/control/${engagement}/share`, { cache: "no-store" });
      if (!response.ok) return;
      const next = await response.json() as ShareState;
      if (next.status === "ok") setState(next);
    } catch { /* Keep what is on the screen. */ }
  }, [engagement]);
  // Opens arrive as people read. The page follows without being asked.
  useEffect(() => { const timer = setInterval(() => void read(), 8000); return () => clearInterval(timer); }, [read]);
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/control/${engagement}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = await response.json().catch(() => ({ status: "unavailable" })) as Record<string, unknown>;
      await read();
      return out;
    } finally { setBusy(false); }
  };
  const make = async () => {
    const label = name.trim();
    const out = await post({ action: "create", name: label });
    if (out.status === "ok" && typeof out.link === "string") { setFresh({ name: label, link: out.link }); setCopied(false); setName(""); setSay(null); }
    else setSay(out.status === "not_closed" ? "Links are available once Day 2 closes." : out.status === "invalid_request" ? "Give the link a name of up to 80 characters." : "The link could not be made. Nothing was lost, so try again.");
  };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setSay("Copying didn't work here. Select the link and copy it."); } };
  const revoke = async (l: ShareLink) => { const out = await post({ action: "revoke", link: l.id }); setAsking(null); setSay(out.status === "ok" || out.status === "already" ? `${l.name} is turned off. It no longer opens.` : "That link could not be turned off. Try again."); };
  const active = state.links.filter(l => l.state === "active");

  return <main id="main" className="tv-manager recap">
    
    <div className="tv-manager-heading"><p className="ctl-eyebrow">{church} · {title}</p><h1>Share</h1>
      <p className="show-help">Make a link for the elders, the board or anyone who should see the plan and how its goals stand. They can&rsquo;t change anything, and you can turn a link off at any time.</p></div>
    <div className="shr" data-theme="light">
      {say && <p className="shr-banner" role="status">{say}</p>}
      {!state.eligible && <p className="shr-banner">This kind of engagement has no read-only copy.</p>}
      {state.eligible && !state.closed && <section className="shr-card" data-testid="share-waiting"><h2>Available once Day 2 closes</h2>
        <p>The copy waits for the retreat to end. Pressing Close Day 2 on the control surface opens it. A day and a half closes the same way, because its half day is Day 2. If you ended the retreat another way, mark it closed here.</p>
        <RetreatClose engagement={engagement} closed={false} closedOn={null} canReopen={false} onChange={read} /></section>}
      {state.eligible && state.closed && <>
        <section className="shr-card"><div className="shr-head"><div><p className="ctl-eyebrow">Read-only copy</p><h2>Share the plan with the elders</h2></div>
          <RetreatClose engagement={engagement} closed closedOn={state.closed_on} canReopen={state.can_reopen} onChange={read} /></div>
          {fresh && <div className="shr-new" role="status" data-testid="share-new"><p><strong>{fresh.name} is ready.</strong> Copy the link now. It is shown only this once, and you can make another if you lose it.</p>
            <code className="shr-url" data-testid="share-url">{fresh.link}</code>
            <div className="shr-row"><button type="button" className="show-button is-primary" onClick={() => void copy(fresh.link)} data-testid="share-copy">{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{copied ? "Copied" : "Copy link"}</button>
              <button type="button" className="show-button" onClick={() => setFresh(null)}>Hide the link</button></div></div>}
          <div className="shr-row"><label className="shr-field">Name this link<input value={name} maxLength={80} placeholder="Elders, board or a person" onChange={e => setName(e.target.value)} data-testid="share-name" /></label>
            <button type="button" className="show-button is-primary" disabled={busy || !name.trim()} onClick={() => void make()} data-testid="share-make"><Plus size={16} aria-hidden="true" />Make a link</button></div>
          <div className="shr-quiet"><p>The copy shows the Clearway Map, the Vision Outcomes with their indicators, the 1-year goals with owners, dates and the status each owner last gave, and the commander&rsquo;s intent cards. Never raw answers, scribe cards or drafts. {state.report
            ? <>The report is on it as version {state.report.n}.{state.report.stale ? " You've changed the report since. The link keeps showing version " + state.report.n + " until you sign it off again." : ""}</>
            : "The report is added once you sign it off."}</p></div>
        </section>
        <section className="shr-card" aria-label="Links"><h2>{state.links.length === 0 ? "No links yet" : `${active.length} on, ${state.links.length - active.length} off`}</h2>
          {state.links.map(l => <div key={l.id}>
            <div className={`shr-link${l.state === "revoked" ? " is-revoked" : ""}`} data-testid="share-link" data-state={l.state}>
              <div className="t"><b>{l.name}</b>
                <span>Made by {l.made_by ?? "a facilitator"} on {stamp(l.created_at, state.timezone)}</span>
                <span>{l.opens === 0 ? "Not opened yet" : `Opened ${l.opens} ${l.opens === 1 ? "time" : "times"}, last ${stamp(l.last_opened_at, state.timezone)}`}</span>
                {l.state === "revoked" && <span>Turned off {stamp(l.revoked_at, state.timezone)}. It no longer opens.</span>}</div>
              {l.state === "revoked" ? <span className="shr-chip"><Link2Off size={14} aria-hidden="true" />Turned off</span>
                : <div className="shr-row"><span className="shr-chip is-on"><Link2 size={14} aria-hidden="true" />On</span>
                  {asking !== l.id && <button type="button" className="show-button" disabled={busy} onClick={() => setAsking(l.id)} data-testid="share-revoke"><Link2Off size={16} aria-hidden="true" />Turn it off</button>}</div>}
            </div>
            {asking === l.id && <div className="shr-confirm" role="group" aria-label={`Turn off ${l.name}`} data-testid="share-confirm"><p><strong>Anyone with this link will lose access at once.</strong> You can make a new link later.</p>
              <div className="shr-row"><button type="button" className="show-button is-primary" disabled={busy} onClick={() => void revoke(l)} data-testid="share-revoke-yes">Turn it off</button><button type="button" className="show-button" onClick={() => setAsking(null)}>Keep it</button></div></div>}
          </div>)}
        </section></>}
    </div>
  </main>;
}
