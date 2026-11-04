"use client";
import { useState } from "react";
import { BadgeCheck, Check, TriangleAlert, Undo2 } from "lucide-react";
import type { OvernightState } from "./types";
import type { Api } from "./review";
import { clock, liveBullets } from "@/lib/overnight/policy";

type Ok = Extract<OvernightState, { status: "ok" }>;

// OVN-03: what Publish does, the checklist, and Publish. Publishing makes the reviewed outcomes the lists the room
// confirms on Day 2; until then the TV and phones show nothing from them.
export function PublishView({ state, api, zone, blockers, ready, back }: { state: Ok; api: Api; zone: string; blockers: string[]; ready: boolean; back: () => void }) {
  const [id] = useState(() => crypto.randomUUID());
  const { check, round } = state, published = round.published_at !== null;
  const row = (kind: "ok" | "todo" | "flag", title: string, sub?: React.ReactNode) => <div className={`c is-${kind}`}><span className="d">{kind === "ok" ? <Check aria-hidden="true" /> : kind === "flag" ? <TriangleAlert aria-hidden="true" /> : null}</span><div className="t">{title}{sub ? <span>{sub}</span> : null}</div></div>;
  const bullets = state.outcomes.reduce((n, o) => n + liveBullets(o).length, 0);
  return <div className="ovr-pub" data-testid="ovn-publish">
    <div className="ovr-preview"><span className="ovr-eyebrow">What the room confirms on Day 2</span>
      <div className="ovr-pv">{state.outcomes.map(o => <section key={o.id}><h4>{o.name}</h4>
        {liveBullets(o).length ? <ul>{liveBullets(o).map(b => <li key={b.id}>{b.text}</li>)}</ul> : <p className="ovr-muted">No bullets yet. {o.thin_ack ? "Shows as thin." : "Acknowledge that it shows as thin."}</p>}</section>)}</div>
      <p className="ovr-muted">The 10-year Future needs nothing here: the room decided it on Day 1. Day 2 starts with a short confirm.</p></div>
    <div className="ovr-preview"><span className="ovr-eyebrow">Checklist</span>
      <div className="ovr-check-list" data-testid="ovn-checklist">
        {row(check.drafting ? "todo" : "ok", check.drafting ? "The draft is still being written" : round.status === "failed" ? "The draft didn’t finish; the outcomes are written by hand" : round.status === "ai_off" ? "AI is off; the outcomes are written by hand" : "Drafts are ready")}
        {row(check.reviewed === check.total && check.total > 0 ? "ok" : "todo", `${check.reviewed} of ${check.total} outcomes reviewed`, check.unreviewed.length ? check.unreviewed.join(", ") : `${bullets} ${bullets === 1 ? "bullet" : "bullets"}, every one with a source`)}
        {row(check.editing.length ? "todo" : "ok", check.editing.length ? "Someone is still editing" : "No one is editing", check.editing.map(e => `${e.by} in ${e.name}`).join(", "))}
        {check.thin.map(t => row(t.acknowledged ? "ok" : "flag", t.acknowledged ? `${t.name} shows as thin in the morning` : `Flag not acknowledged: ${t.name} has no bullets`,
          t.acknowledged ? undefined : <label className="ovr-check"><input type="checkbox" onChange={e => { const o = state.outcomes.find(x => x.name === t.name); if (o) void api.act({ action: "ack_thin", outcome: o.id, value: e.target.checked }); }} />Show it in the morning as thin</label>))}
        {row("ok", "The 10-year Future needs nothing", "Decided by the room on Day 1. Not redrafted overnight")}
      </div></div>
    <div className="ovr-preview ovr-act">
      {published ? <><div className="ovr-published" role="status" data-testid="ovn-published"><BadgeCheck aria-hidden="true" />Published at {clock(round.published_at, zone)} by {round.published_by}. The confirm opens when you go live on Day 2 at 9:00, and the outcomes at 9:30. Until then the TV and phones show nothing from it.</div>
        <button type="button" className="ovr-btn" disabled={!state.lead || api.busy} onClick={() => void api.act({ action: "unpublish" })}><Undo2 aria-hidden="true" />Unpublish</button>
        {!state.lead && <p className="ovr-muted">Only the lead facilitator can unpublish.</p>}</>
        : <><button type="button" className="ovr-btn is-lime" disabled={!ready || blockers.length > 0 || !state.lead || api.busy} onClick={() => void api.act({ action: "publish", id })} data-testid="ovn-publish-button"><BadgeCheck aria-hidden="true" />Publish for Day 2</button>
          {!state.lead && <p className="ovr-muted">Only the lead facilitator publishes. Tell them when the checklist is clear.</p>}
          {state.lead && blockers.length > 0 && <ul className="ovr-blockers" data-testid="ovn-blockers">{blockers.map(b => <li key={b}>{b}</li>)}</ul>}
          {state.lead && blockers.length === 0 && <p className="ovr-muted">Nothing is in the way. Publishing keeps every version, and you can unpublish.</p>}</>}
      <button type="button" className="ovr-btn is-ghost is-sm" onClick={back}>Back to the outcomes</button>
    </div>
  </div>;
}
