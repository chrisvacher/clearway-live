"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Presentation, Radio, Shuffle, Smartphone, SmartphoneNfc } from "lucide-react";
import { cardsOf } from "@/lib/interactions/intent";
import { followupStatusText } from "@/lib/interactions/intent";
import "./handover.css";

// The team remote: the controls the team's own facilitator holds for their block. It shows the block's
// steps and the room, nothing else: no alignment signal, no presenter notes, no Discover data and
// no other sessions. The database refuses anything outside this list, so a hidden button is not the only guard.
export type TeamRoom = { live_session_id?: string | null; phones_down?: boolean; spotlight_key?: string | null; results?: unknown };
export type TeamBlockStep = { id: string; title: string; interaction: string; state: string };
export type TeamSend = (action: string, p: Record<string, unknown>) => Promise<{ status: string }>;

export function TeamRemote({ block, room, holds, send, ends, pairs }: { block: TeamBlockStep[]; room: TeamRoom | null; holds: boolean; send: TeamSend; ends?: string | null; pairs?: { card: string; people: string[] }[] }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const live = room?.live_session_id ?? null, now = block.find(s => s.id === live) ?? null, i = block.findIndex(s => s.id === live);
  const cards = cardsOf(room?.results), spot = room?.spotlight_key ?? null;
  const go = async (action: string, p: Record<string, unknown> = {}) => {
    setBusy(true); setMessage("");
    const out = await send(action, { from: live, ...p });
    setBusy(false);
    if (!["ok", "unchanged", "duplicate"].includes(out.status)) setMessage(followupStatusText[out.status] ?? (out.status === "moved" ? "The room moved on. Check what is live and try again." : "That didn’t work. Try again."));
  };
  const off = busy || !holds;
  return <section className="hi-remote" aria-label="Team remote">
    {!holds && <p className="show-message" role="status">The lead facilitator has the remote. Ask for it back when you are ready.</p>}
    {message && <p className="show-message is-error" role="alert">{message}</p>}
    <p className="ctl-eyebrow">On the TV now</p>
    <p className="ctl-label">{now ? now.title : "Not in your block yet"}</p>
    <div className="hi-row">
      <button type="button" className="show-button" disabled={off || i < 1} onClick={() => void go("back")}><ChevronLeft size={18} aria-hidden="true" />Back</button>
      <button type="button" className="show-button is-primary" disabled={off || block.length === 0 || i >= block.length - 1} onClick={() => void go("next")}>Next<ChevronRight size={18} aria-hidden="true" /></button>
      <button type="button" className="show-button" disabled={off || !now} onClick={() => void go(room?.phones_down ? "open_phones" : "phones_down")}>{room?.phones_down ? <><SmartphoneNfc size={18} aria-hidden="true" />Open phones</> : <><Smartphone size={18} aria-hidden="true" />Phones down</>}</button>
    </div>
    {now?.interaction === "intent" && <>
      <div className="hi-row">
        <button type="button" className="show-button is-small" disabled={off} onClick={() => void go("intent_auto")}><Shuffle size={16} aria-hidden="true" />Pair everyone</button>
        <button type="button" className="show-button is-small" disabled={off} onClick={() => void go("intent_clear")}>Clear pairs</button>
        {spot && <button type="button" className="show-button is-small" disabled={off} onClick={() => void go("intent_present", { card: null })}>Show all cards</button>}
      </div>
      <ul className="hi-list">{cards.map(c => <li key={c.id} className="hi-item"><div><b>{c.number}. {c.title}</b><small>{pairs?.find(x => x.card === c.id)?.people.join(", ") || "No one yet"}</small></div>
        <button type="button" className="show-button is-small" disabled={off || spot === c.id} onClick={() => void go("intent_present", { card: c.id })}><Presentation size={16} aria-hidden="true" />{spot === c.id ? "On the TV" : "Present"}</button></li>)}</ul>
    </>}
    <p className="ctl-eyebrow">Your block</p>
    <ol className="hi-list">{block.map(s => <li key={s.id} className="hi-item"><div><b>{s.title}</b>{s.id === live && <small><Radio size={12} aria-hidden="true" /> Live now</small>}</div>
      <button type="button" className="show-button is-small" disabled={off || s.id === live} onClick={() => void go("go_live", { session: s.id })}>Go live</button></li>)}</ol>
    {ends && <p className="show-help">This access ends {new Date(ends).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}.</p>}
  </section>;
}
