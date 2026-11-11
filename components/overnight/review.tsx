"use client";
import { useEffect, useState } from "react";
import { BadgeCheck, Bell, CircleAlert, EyeOff, Keyboard, ListChecks, Telescope, TriangleAlert, Undo2 } from "lucide-react";
import type { FileFact, OvernightState } from "./types";
import { useOvernight } from "./use-overnight";
import { OutcomeView } from "./outcome";
import { StatusChip } from "./chips";
import { PublishView } from "./publish";
import { blockers, clock, counted, minutesBetween } from "@/lib/overnight/policy";
import { Photo } from "./photo";
import "./overnight.css";

type Ok = Extract<OvernightState, { status: "ok" }>;
export type Api = ReturnType<typeof useOvernight>;

export function Presence({ state }: { state: Ok }) {
  const people = [...new Map(state.presence.map(p => [p.user, p])).values()];
  return <div className="ovr-pres" aria-label="Who is in the review">{people.map(p => <span key={p.user} className={`ovr-who${p.you ? " is-you" : ""}`}><span className="ovr-avatar" aria-hidden="true">{p.name.slice(0, 1)}</span><b>{p.you ? "You" : p.name}</b>{p.editing ? " · editing" : ""}</span>)}</div>;
}
// Photos the draft could not read: type what each says so it can count as a source.
function Unreadable({ state, api, engagement }: { state: Ok; api: Api; engagement: string }) {
  const ids = [...new Set([...state.round.unreadable, ...state.outcomes.flatMap(o => o.unreadable)])].filter(id => state.files[id] && !state.files[id].typed);
  const [typing, setTyping] = useState<string | null>(null), [text, setText] = useState("");
  if (!ids.length) return null;
  return <div className="ovr-banner is-warning" role="status" data-testid="ovn-unreadable"><CircleAlert aria-hidden="true" /><div>
    <strong>{ids.length === 1 ? "The draft couldn’t read 1 easel photo." : `The draft couldn’t read ${ids.length} easel photos.`}</strong> Type what each says so it can count as a source.
    <div className="ovr-photos">{ids.map(id => { const f: FileFact = state.files[id]; return <div key={id} className="ovr-photo-card">
      {f.type.startsWith("image/") && f.type !== "image/heic" ? <Photo engagement={engagement} file={id} name={f.name} /> : <span className="ovr-muted">{f.name}</span>}
      <span className="ovr-muted">{f.name} · {f.step}</span>
      {typing === id ? <>
        <textarea className="ovr-input" aria-label={`What ${f.name} says`} value={text} onChange={e => setText(e.target.value)} maxLength={2000} rows={3} />
        <div className="ovr-row"><button type="button" className="ovr-btn is-primary is-sm" disabled={!text.trim() || api.busy} onClick={() => void api.act({ action: "photo_text", file: id, text }).then(r => { if (r.status === "ok") { setTyping(null); setText(""); } })}>Save what it says</button>
          <button type="button" className="ovr-btn is-sm" onClick={() => setTyping(null)}>Cancel</button></div></>
        : <button type="button" className="ovr-btn is-sm" onClick={() => { setTyping(id); setText(""); }}><Keyboard aria-hidden="true" />Type what it says</button>}
    </div>; })}</div></div></div>;
}

function Overview({ state, api, zone, engagement, open }: { state: Ok; api: Api; zone: string; engagement: string; open: (view: string) => void }) {
  const r = state.round, total = state.outcomes.length;
  const tidied = state.outcomes.filter(o => o.tidy !== "waiting").length, reviewed = state.outcomes.filter(o => o.reviewed).length;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
  const running = r.status === "pending" || r.status === "drafting";
  const mins = running ? minutesBetween(r.day_closed_at, now) : r.ready_at ? minutesBetween(r.day_closed_at, r.ready_at) : 0;
  const thin = state.outcomes.filter(o => o.thin && !o.thin_ack && o.tidy !== "waiting");
  const hand = state.outcomes.filter(o => o.tidy === "by_hand").length;
  return <>
    {running && <div className="ovr-progress" data-testid="ovn-progress"><div className="row"><span><b>Tidying</b> · started when Day 1 closed at {clock(r.day_closed_at, zone)}</span>
      <span className="ovr-muted">{counted(mins, "minute")} so far · usually under 30</span></div>
      <progress className="ovr-bar" value={tidied} max={Math.max(total, 1)} aria-label="Progress" />
      <div className="row"><span className="ovr-muted">{tidied} of {total} outcomes tidied. Working from {counted(r.inputs.bullets ?? 0, "bullet")}, {counted(r.inputs.cards ?? 0, "scribe card")} and {counted(r.inputs.photos ?? 0, "easel photo")}.</span>
        <button type="button" className="ovr-btn is-sm" disabled={api.busy} onClick={() => void api.act({ action: "by_hand" })}>Write it by hand instead</button></div></div>}
    {running && r.attempts > 0 && <div className="ovr-banner is-warning" role="status" data-testid="ovn-retry"><TriangleAlert aria-hidden="true" /><div><strong>The draft hit a problem and is trying again.</strong> You don’t have to wait: write the outcomes by hand from the room’s bullets and the scribe’s cards.</div></div>}
    {running && mins >= 30 && <div className="ovr-banner is-warning" role="status" data-testid="ovn-slow"><TriangleAlert aria-hidden="true" /><div><strong>The draft is taking longer than 30 minutes.</strong> Write the outcomes by hand if you want to start now. A late draft will not overwrite what you write.</div></div>}
    {r.status === "failed" && <div className="ovr-banner is-warning" role="alert" data-testid="ovn-failed"><TriangleAlert aria-hidden="true" /><div><strong>{hand > 0 || r.error ? "The draft didn’t finish, so the outcomes are yours to write." : "The draft didn’t finish."}</strong> Write each outcome from the room’s bullets and the scribe’s cards, with a source for every line.
      <div className="ovr-row"><button type="button" className="ovr-btn is-sm" disabled={api.busy} onClick={() => void api.act({ action: "start" })}><Undo2 aria-hidden="true" />Try the draft again</button></div></div></div>}
    {r.status === "ai_off" && <div className="ovr-banner" role="status" data-testid="ovn-ai-off"><CircleAlert aria-hidden="true" /><div><strong>AI is off for this engagement.</strong> There is no tidy draft. Write each outcome from the room’s own bullets and the scribe’s cards.</div></div>}
    {(r.status === "ready" || r.status === "failed" || r.status === "ai_off") && <div className="ovr-progress"><div className="row"><span><b>{reviewed} of {total} reviewed</b>{r.ready_at ? ` · drafts ready at ${clock(r.ready_at, zone)}, ${counted(mins, "minute")} after Day 1 closed` : ""}</span>
      <span className="ovr-muted">About 45 minutes to review</span></div><progress className="ovr-bar" value={reviewed} max={Math.max(total, 1)} aria-label="Progress" /></div>}
    {thin.length > 0 && <div className="ovr-banner is-warning" role="status" data-testid="ovn-thin"><TriangleAlert aria-hidden="true" /><div><strong>{thin.length === 1 ? "1 outcome has no bullets." : `${thin.length} outcomes have no bullets.`}</strong> Acknowledge each one before publishing; it then shows as thin on Day 2. The draft never invents bullets.</div></div>}
    <Unreadable state={state} api={api} engagement={engagement} />
    <div className="ovr-list" data-testid="ovn-list"><div className="ovr-list-h"><span>Provisional Vision Outcomes and the 3-year Vision first pass</span><span>{r.published_at ? `Published ${clock(r.published_at, zone)}` : r.status === "ready" ? `Ready ${clock(r.ready_at, zone)}` : running ? `Started ${clock(r.day_closed_at, zone)}` : ""}</span></div>
      {state.outcomes.map(o => <button type="button" key={o.id} className="ovr-row-btn" onClick={() => open(o.id)} data-testid="ovn-row">
        <span className="ic"><ListChecks aria-hidden="true" /></span>
        <span className="t"><b>{o.name}</b><span>{o.tidy === "waiting" ? "Tidying from Day 1" : `${counted(o.bullets.filter(b => !b.removed).length, "bullet")}${o.voices.length ? ` · ${counted(o.voices.length, "voice")} not to lose` : ""}${o.tensions.length ? ` · ${counted(o.tensions.length, "tension")}` : ""}`}</span></span>
        <StatusChip draft={o} /></button>)}
      <div className="ovr-row-btn is-static"><span className="ic"><Telescope aria-hidden="true" /></span><span className="t"><b>10-year Future, five lenses</b><span>Decided by the room on Day 1. Not redrafted overnight</span></span>
        <span className="ovr-st is-reviewed"><BadgeCheck aria-hidden="true" />Signed off on Day 1</span></div></div>
    {state.unplaced.length > 0 && <p className="ovr-muted" data-testid="ovn-unplaced">{state.unplaced.length} scribe {state.unplaced.length === 1 ? "card isn’t" : "cards aren’t"} used in any draft. They are listed under Sources in each outcome.</p>}
    <div className="ovr-row is-between"><span className="ovr-muted">Nothing here reaches the TV or any phone until you publish.</span>
      <button type="button" className="ovr-btn is-primary" onClick={() => open("publish")}>Go to publish</button></div>
  </>;
}

export function OvernightReview({ engagement, church, title, timezone }: { engagement: string; church: string; title: string; timezone: string }) {
  const api = useOvernight(engagement);
  const { state } = api;
  const [view, setView] = useState("overview");
  const open = (next: string) => { setView(next); void api.move(next, false); };
  const ok = state?.status === "ok" ? state : null;
  const current = ok && view !== "overview" && view !== "publish" ? ok.outcomes.find(o => o.id === view) ?? null : null;
  const effective = view === "overview" || view === "publish" || current ? view : "overview";
  useEffect(() => { if (view !== effective) setView(effective); }, [view, effective]);
  const ready = ok && ok.round.status !== "pending" && ok.round.status !== "drafting";
  return <div className="ovr" data-surface="review" data-theme="light" data-testid="overnight-review">
    <nav className="ovr-nav" aria-label="Overnight review">
      <button type="button" className={effective !== "publish" ? "is-on" : ""} onClick={() => open("overview")}><ListChecks aria-hidden="true" />Overnight review</button>
      <button type="button" className={effective === "publish" ? "is-on" : ""} onClick={() => open("publish")} disabled={!ok}><BadgeCheck aria-hidden="true" />Publish for Day 2</button></nav>
    <main id="main" className="ovr-main">
      <header className="ovr-head"><div className="grow"><div className="ovr-eyebrow">{church} · {title} · after Day 1 · confirm Day 2 at 9:00</div><h1>Overnight review</h1></div>
        {ok && <Presence state={ok} />}<span className="ovr-private"><EyeOff aria-hidden="true" />Private until published</span></header>
      <div className="ovr-body">
        {api.message && <p className="ovr-banner is-warning" role="alert" data-testid="ovn-message"><TriangleAlert aria-hidden="true" /><span>{api.message}</span></p>}
        {!state && <p className="ovr-muted">Reading the review.</p>}
        {state?.status === "denied" && <p className="ovr-banner is-warning" role="alert"><TriangleAlert aria-hidden="true" />Only the facilitators of this engagement can review the drafts.</p>}
        {state?.status === "unavailable" && <p className="ovr-banner is-warning" role="alert"><TriangleAlert aria-hidden="true" />The review is unavailable right now. It tries again on its own.</p>}
        {state?.status === "none" && <div className="ovr-empty" data-testid="ovn-none"><Bell aria-hidden="true" /><div><strong>No drafts yet.</strong> They start when Day 1 closes, from the room’s bullets, the scribe’s cards and the easel photos.
          <div className="ovr-row"><button type="button" className="ovr-btn is-primary is-sm" disabled={api.busy} onClick={() => void api.act({ action: "start" })}>Start the draft now</button></div></div></div>}
        {ok && effective === "overview" && <Overview state={ok} api={api} zone={timezone} engagement={engagement} open={open} />}
        {ok && current && <OutcomeView state={ok} draft={current} api={api} engagement={engagement} back={() => open("overview")} />}
        {ok && effective === "publish" && <PublishView state={ok} api={api} zone={timezone} blockers={blockers(ok)} ready={Boolean(ready)} back={() => open("overview")} />}
      </div>
    </main>
  </div>;
}
