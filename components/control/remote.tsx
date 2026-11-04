"use client";
import { useState } from "react";
import { EyeOff, X } from "lucide-react";
import type { RunOfShow } from "@/lib/run-of-show/types";
import type { RoomSize } from "@/lib/control/types";
import { useControlRoom } from "./use-control-room";
import { Banners, ItemList, LiveControls, PreviewCard, ReloadNotice, SyncChip, Toasts, roomSizes } from "./live-controls";
import { TvMirror } from "@/components/tv/tv-mirror";
import { QaAnyTime } from "@/components/interactions/qa/qa-panel";
import { AiRemote } from "@/components/interactions/ai/ai-panel";
import { OvernightCard } from "@/components/overnight/overnight-card";

// FAC-03: the live controls in the facilitator's hand. It holds its own
// connection and needs nothing from the laptop.
export function Remote({ initial }: { initial: RunOfShow }) {
  const room = useControlRoom(initial.context.id, initial);
  const [sheet, setSheet] = useState<"items" | "size" | "preview" | null>(null);
  const { frame, show, upNext } = room;
  const confirmed = room.mirror;
  const shown = confirmed?.session;
  const pill = !shown ? null : shown.state === "closed" ? <span className="ctl-chip">Closed · read-only</span>
    : confirmed?.state.phones_down ? <span className="ctl-chip">Phones down</span> : ["live"].includes(shown.state) ? <span className="ctl-live">Live</span> : null;
  return <main id="main" className="ctl-remote" data-room-version={frame?.version}>
    <header className="ctl-remote-head"><span className="ctl-label">{show.context.church}</span><SyncChip room={room} /></header>
    <div className="ctl-remote-body">
      <ReloadNotice room={room} />
      <TvMirror frame={confirmed} />
      <div className="ctl-row is-between"><div><p className="ctl-eyebrow">On the TV now</p><p className="ctl-label">{shown?.title ?? (confirmed?.state.tv_content === "join" ? "Join screen" : "Holding screen")}{confirmed?.session && confirmed.session.interaction !== "content" ? ` · ${confirmed.state.results.total} ${confirmed.state.results.total === 1 ? "answer" : "answers"}` : ""}</p></div>{pill}</div>
      <Banners room={room} compact />
      {room.message && <p className="show-message is-error" role="alert">{room.message}</p>}
      <section className="ctl-private" aria-label="Up next, only you see this"><div className="show-private"><EyeOff size={16} aria-hidden="true" />Only you see this<span>Up next</span></div>
        <div className="ctl-private-body">{upNext ? <><p className="ctl-label">{upNext.title}</p><p className="ctl-notes">{upNext.notes || "No presenter notes."}</p>
          <button className="show-button is-small" onClick={() => setSheet("preview")}>Preview</button></> : <p className="ctl-notes">Nothing else is ready.</p>}</div></section>
      <LiveControls room={room} variant="remote" onItems={() => setSheet("items")} onRoomSize={() => setSheet("size")} />
      <AiRemote room={room} />
      <section className="ctl-private" aria-label="Overnight review, only you see this"><div className="show-private"><EyeOff size={16} aria-hidden="true" />Only you see this<span>Overnight review</span></div>
        <div className="ctl-private-body"><OvernightCard engagement={initial.context.id} tick={room.overnightTick} link={false} /></div></section>
    </div>
    {sheet && <div className="ctl-sheet-scrim" onClick={() => setSheet(null)}>
      <div className="ctl-sheet" role="dialog" aria-modal="true" aria-label={sheet === "items" ? "Items on the TV" : sheet === "size" ? "Room size" : "Preview"} onClick={e => e.stopPropagation()}>
        {sheet === "items" && <><ItemList room={room} onClose={() => setSheet(null)} /><QaAnyTime room={room} /></>}
        {sheet === "preview" && upNext && <PreviewCard session={upNext} context={show.context} room={room} onClose={() => setSheet(null)} />}
        {sheet === "size" && <section>
          <div className="ctl-row is-between"><h2>Room size</h2><button className="show-button is-icon" aria-label="Close room size" onClick={() => setSheet(null)}><X size={20} aria-hidden="true" /></button></div>
          <div className="ctl-size-list" role="radiogroup" aria-label="Room size">{roomSizes.map(([value, label]) => <button key={value} role="radio" aria-checked={frame?.display?.room_size === value} className="ctl-r-btn" disabled={Boolean(room.pending)}
            onClick={() => void room.press("room_size", { size: value as RoomSize }).then(() => setSheet(null))}>{label}</button>)}</div>
          <p className="show-help">Scales all TV type at once.</p>
        </section>}
      </div>
    </div>}
    <Toasts room={room} />
  </main>;
}
