"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, Monitor, Smartphone } from "lucide-react";
import { followupStatusText, followupTakeText, normalizeCode, validCode } from "@/lib/interactions/intent";
import { TeamRemote, type TeamBlockStep, type TeamRoom } from "@/components/interactions/intent/team-remote";
import { post } from "@/components/interactions/intent/use-intent";
import "@/components/interactions/intent/handover.css";

type Snapshot = { status: string; kind: "tv" | "remote" | null; first?: string; church?: string; closes_at?: string; opens_at?: string; holder?: "team" | "lead" | null; lead?: string; block?: TeamBlockStep[]; room?: { state?: TeamRoom }; pairs?: { card: string; people: string[] }[] };

// The page behind the follow-up link (Chris's November 3 decision). The team's own facilitator enters
// the code, then pairs the shared TV view in a tab and takes the remote on a phone. No Clearway sign-in.
// What the remote shows and never shows is on the page, so no one has to guess.
export function FollowupClient({ token, as }: { token: string; as: "tv" | "remote" }) {
  const [snap, setSnap] = useState<Snapshot | null>(null), [code, setCode] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [checked, setChecked] = useState(false);
  const read = useCallback(async () => {
    const out = await post("/api/followup", { action: "snapshot", as }) as unknown as Snapshot;
    setChecked(true); setSnap(out.status === "ok" ? out : null);
    if (!["ok", "denied"].includes(out.status)) setMessage(followupStatusText[out.status] ?? "");
  }, [as]);
  useEffect(() => { void read(); }, [read]);
  const entered = snap?.status === "ok", gone = useRef(false);
  useEffect(() => { if (!entered) return; const t = setInterval(() => void read(), 2500); return () => clearInterval(t); }, [entered, read]);
  const enter = async () => {
    const value = normalizeCode(code);
    if (!validCode(value)) { setMessage("The code is five letters and four numbers, like MAPLE 4821."); return; }
    setBusy(true); setMessage("");
    const out = await post("/api/followup", { action: "enter", token, code: value, as });
    setBusy(false);
    if (out.status !== "ok") { setMessage(followupStatusText[out.status] ?? followupStatusText.denied); return; }
    await read();
  };
  const send = useCallback(async (action: string, p: Record<string, unknown>) => post("/api/followup", { action: "press", as, press: { id: crypto.randomUUID(), action, p } }), [as]);
  const take = async () => { setBusy(true); setMessage(""); const out = await post("/api/followup", { action: "take", as }); setBusy(false); if (out.status !== "ok") setMessage(followupTakeText(out.status, snap?.lead)); void read(); };
  const ask = async () => { setBusy(true); const out = await post("/api/followup", { action: "ask", as }); setBusy(false); setMessage(out.status === "ok" ? "Asked. The lead facilitator has your message." : followupStatusText[out.status] ?? followupStatusText.unavailable); };
  void gone;
  if (!checked) return <main className="fu"><p className="ph-text">One moment.</p></main>;
  if (!entered) return <main className="fu" id="main">
    <h1>Your follow-up</h1>
    <p className="show-help">Enter the code your facilitator gave you. This link works only for your block, and only for a short time.</p>
    {message && <p className="show-message is-error" role="alert">{message}</p>}
    <form className="hi-banner" onSubmit={e => { e.preventDefault(); void enter(); }}>
      <label className="hi-field" htmlFor="fu-code">Code<input id="fu-code" className="ph-input" autoComplete="one-time-code" autoCapitalize="characters" inputMode="text" value={code} maxLength={12} onChange={e => setCode(e.target.value)} placeholder="MAPLE 4821" /></label>
      <button type="submit" className="show-button is-primary" disabled={busy || !code.trim()}><KeyRound size={16} aria-hidden="true" />Enter</button>
    </form>
  </main>;
  const holds = snap.holder === "team" && snap.kind === "remote";
  return <main className="fu" id="main" data-followup={snap.kind ?? "new"}>
    <header><p className="ctl-eyebrow">{snap.church}</p><h1>Hello{snap.first ? `, ${snap.first}` : ""}</h1></header>
    {message && <p className="show-message" role="status">{message}</p>}
    {as === "tv" ? <section aria-label="Show the TV view">
      <p className="show-help">Open this on the computer you share in the video call. The room’s TV view opens in this tab, with private notes left out.</p>
      <TvPair onMessage={setMessage} />
    </section> : <>
      {snap.kind !== "remote" ? <section aria-label="Take the remote">
        <p className="show-help">Take the remote on this phone for your block{snap.lead ? `. ${snap.lead} stays in the room and can take it back` : ""}.</p>
        <button type="button" className="show-button is-primary" disabled={busy} onClick={() => void take()}><Smartphone size={16} aria-hidden="true" />Take the remote</button>
      </section> : <>
        <TeamRemote block={snap.block ?? []} room={snap.room?.state ?? null} holds={holds} send={send} ends={snap.closes_at} pairs={snap.pairs} />
        {!holds && <button type="button" className="show-button" disabled={busy} onClick={() => void ask()}>Ask for the remote</button>}
        {!holds && <button type="button" className="show-button" disabled={busy} onClick={() => void take()}>Take the remote</button>}
      </>}
      <p className="show-help">To show the TV view, open this link with /tv on the end on the computer you share in the video call: <span className="hi-link">{typeof window === "undefined" ? "" : `${window.location.origin}/f/${token}/tv`}</span></p>
      <aside className="hi-scope"><b>This remote shows</b><ul className="hi-scope"><li>The steps in your block and what is live</li><li>Go live, Next, Back, Phones down, Open phones</li><li>Pairs by first name and Present for each card</li></ul>
        <b>It never shows</b><ul className="hi-scope"><li>The alignment signal</li><li>Presenter notes</li><li>Discover data</li><li>Any step outside your block</li></ul></aside>
    </>}
    {/* The team remote says when the access ends; the page says it only where the remote is not shown. */}
    {!(as === "remote" && snap.kind === "remote" && snap.closes_at) && <p className="show-help">This access ends {snap.closes_at ? new Date(snap.closes_at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : "soon"}.</p>}
  </main>;
}

// Pair this tab as the shared TV view: the tab gets its own TV device, then the server ties that
// device to this access. After that the normal TV screen takes over in this tab.
function TvPair({ onMessage }: { onMessage: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const pair = async () => {
    setBusy(true); onMessage("");
    try {
      await fetch("/api/tv", { method: "POST" });
      const out = await post("/api/followup", { action: "pair_tv", as: "tv" });
      if (out.status !== "ok") { onMessage(followupStatusText[out.status] ?? followupStatusText.unavailable); setBusy(false); return; }
      window.location.assign("/tv");
    } catch { onMessage(followupStatusText.unavailable); setBusy(false); }
  };
  return <button type="button" className="show-button is-primary" disabled={busy} onClick={() => void pair()}><Monitor size={16} aria-hidden="true" />Show the TV view</button>;
}
