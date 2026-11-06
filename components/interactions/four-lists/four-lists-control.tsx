"use client";
import Link from "next/link";
import { Eye, EyeOff, ListChecks } from "lucide-react";
import type { Room } from "@/components/control/live-controls";
import { AiGroupsList } from "@/components/interactions/ai/ai-panel";
import { agreeWords, isList, listKeys, listNames, fourListsOf } from "@/lib/interactions/four-lists";
import "./four-lists.css";

type Item = { key: string; text: string; count: number; hidden: boolean; column?: unknown };

// INT-11 on the control surface (laptop and remote): how many cards stand in each list, every card with its agreement count and
// Hide (the same hide as every wall: the card leaves the TV and its count; Unhide puts it back), the AI groups with Pin and
// Undo, and a way into the review for after the session. Only facilitators see this; no card carries a name.
export function FourListsItems({ room }: { room: Room; onClose?: () => void }) {
  const items = (room.status?.items ?? []) as Item[], busy = Boolean(room.pending), session = room.frame?.session;
  const results = fourListsOf(room.frame?.state.results), engagement = room.show.context.id;
  const standing = items.filter(i => !i.hidden), hidden = items.length - standing.length;
  const countIn = (key: string) => standing.filter(i => i.column === key).length;
  return <>
    <section className="ctl-items" aria-labelledby="fl-counts-title" data-fl-counts>
      <div className="ctl-row is-between"><h2 id="fl-counts-title">Cards in each list</h2>
        <span className="ai-note">{results.people} {results.people === 1 ? "person" : "people"} added cards{hidden ? ` · ${hidden} hidden` : ""}</span></div>
      <ul className="fl-ctl-counts">{listKeys.map(key => <li key={key} data-list={key}><b>{countIn(key)}</b><span>{listNames[key]}</span></li>)}</ul>
      {session?.id && <p><Link className="fl-ctl-link" href={`/control/${engagement}/lists/${session.id}`}><ListChecks size={16} aria-hidden="true" />Review the lists</Link></p>}
    </section>
    <AiGroupsList room={room} />
    <section className="ctl-items" aria-labelledby="ctl-items-title" data-fl-items>
      <div className="ctl-row is-between"><h2 id="ctl-items-title">Cards on the TV</h2></div>
      <p className="show-help">Newest first. Names never show. Hide takes a card off the TV.</p>
      {items.length ? <ul className="ctl-item-list">{items.map(item => <li key={item.key} className={item.hidden ? "is-hidden" : ""}>
        <span className="ctl-item-text">{item.text}<small> · {isList(item.column) ? listNames[item.column] : ""} · {agreeWords(item.count)}</small></span>
        {item.hidden
          ? <button className="show-button" disabled={busy} onClick={() => void room.press("unhide", { item: item.key })}><Eye size={16} aria-hidden="true" />Unhide</button>
          : <button className="show-button" disabled={busy} onClick={() => void room.press("hide", { item: item.key })}><EyeOff size={16} aria-hidden="true" />Hide</button>}
      </li>)}</ul> : <p className="show-empty">No cards yet.</p>}
    </section>
  </>;
}
