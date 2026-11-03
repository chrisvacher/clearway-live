"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Clock, EyeOff, LayoutGrid, Printer, Smartphone } from "lucide-react";
import { stateLabels, timing } from "@/lib/control/policy";
import { parts, type RunOfShow, type ShowSession } from "@/lib/run-of-show/types";
import type { RoomSize } from "@/lib/control/types";
import { useControlRoom } from "./use-control-room";
import { Banners, ItemList, LiveControls, PreviewCard, ReloadNotice, SyncChip, Toasts, burstLeft, roomSizes, useSecondTap } from "./live-controls";
import { TvMirror } from "@/components/tv/tv-mirror";
import { controlPanels } from "@/components/interactions/control-panels";
import { QaAnyTime } from "@/components/interactions/qa/qa-panel";
import { ExportAnswers, RehearsalPanel, SelfPacedList } from "./rehearsal";

function Private({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="ctl-private" aria-label={`${title}, only you see this`}><div className="show-private"><EyeOff size={16} aria-hidden="true" />Only you see this<span>{title}</span></div><div className="ctl-private-body">{children}</div></section>;
}
const time = (iso: string | null, zone: string) => iso ? new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone: zone }).format(new Date(iso)) : "";

// FAC-01: run of show left, the confirmed TV and controls centre, private panels right.
export function ControlSurface({ initial, door }: { initial: RunOfShow; door: React.ReactNode }) {
  const engagement = initial.context.id;
  const router = useRouter();
  // Join requests arrive while the room runs; refresh the door list quietly.
  useEffect(() => { const t = setInterval(() => router.refresh(), 15000); return () => clearInterval(t); }, [router]);
  const room = useControlRoom(engagement, initial);
  const [preview, setPreview] = useState<ShowSession | null>(null);
  const confirm = useSecondTap();
  const { show, frame, status, current } = room;
  const context = show.context;
  const shownId = frame?.state.live_session_id ?? null;
  const clock = timing(current, room.now);
  const burst = burstLeft(room);
  const counts = status?.counts;
  const KindPanel = frame?.session ? controlPanels[frame.session.interaction] : undefined;
  const phones = !frame?.session ? "Waiting for the next session" : frame.session.state === "closed" ? "Showing own answers, read-only"
    : frame.session.interaction === "content" ? "Reading along" : frame.state.phones_down ? "Phones down" : burst ? `Input open · burst ${burst.label} left` : "Input open";
  return <div className="ctl-app" data-room-version={frame?.version}>
    <header className="ctl-head">
      <div><p className="ctl-eyebrow">{context.church} · {context.title}</p><h1>Live room</h1></div>
      <div className="ctl-row">{status?.rehearsal?.since && <span className="ctl-chip sp-rehearsing">Rehearsing</span>}<SyncChip room={room} /><Link className="show-button" href={`/remote/${engagement}`}><Smartphone size={18} aria-hidden="true" />Open the remote</Link><Link className="show-button" href={`/setup/${engagement}/run-of-show/print`}><Printer size={18} aria-hidden="true" />Print run of show</Link><Link className="show-button" href={`/control/${engagement}/recap`}><LayoutGrid size={18} aria-hidden="true" />See results recap</Link></div>
    </header>
    <div className="ctl-cols">
      <nav className="ctl-col ctl-run" aria-label="Run of show">
        <div className="ctl-row is-between"><h2>Run of show</h2>{clock && <span className={`ctl-chip${clock.onTime ? " is-success" : ""}`}><Clock size={14} aria-hidden="true" />{clock.label}</span>}</div>
        {parts.map(part => {
          const list = show.sessions.filter(s => s.part === part && s.mode === "live");
          if (!list.length) return null;
          const open = list.some(s => ["live", "phones_down", "open"].includes(s.state));
          return <section key={part} className="ctl-part">
            <div className="ctl-row is-between"><h3>{part}</h3>{open && <button className="show-button is-small" disabled={Boolean(room.pending) || context.closed} onClick={() => confirm.tap(part, () => void room.press("close_part", { part }))}>{confirm.armed === part ? `Tap again to close ${part}` : `Close ${part}`}</button>}</div>
            <ol className="ctl-run-list">{list.map(s => <li key={s.id} className={`${s.id === shownId ? "is-current" : ""}${s.id === room.upNext?.id ? " is-next" : ""}`}>
              <span className="ctl-time">{time(s.planned_start, context.timezone)}</span>
              <span className="ctl-run-title"><strong>{s.title}</strong><small>{s.segment ? `${s.segment} · ` : ""}{context.kinds?.find(k => k.kind === s.interaction)?.label ?? (s.interaction === "word_cloud" ? "Word cloud" : s.interaction === "wall" ? "Wall" : "Content")} · {s.planned_minutes} min</small></span>
              <span className="ctl-run-meta"><span className={`show-state is-${s.state}`}>{stateLabels[s.state] ?? s.state}</span>
                <button className="show-button is-small" onClick={() => setPreview(s)} aria-label={`Preview ${s.title}`}>Preview</button></span>
            </li>)}</ol>
          </section>;
        })}
        <SelfPacedList room={room} timezone={context.timezone} />
        <Private title="Up next">{room.upNext ? <><p className="ctl-label">{room.upNext.title}</p><p className="ctl-notes">{room.upNext.notes || "No presenter notes."}</p></> : <p className="ctl-notes">Nothing else is ready.</p>}</Private>
      </nav>
      <main id="main" className="ctl-col ctl-centre">
        <ReloadNotice room={room} />
        <div className="ctl-row is-between"><span className="ctl-eyebrow">On the TV now</span><SyncChip room={room} /></div>
        <TvMirror frame={room.mirror} />
        <div className="ctl-row is-between"><div><p className="ctl-eyebrow">On phones now</p><p className="ctl-label">{phones}</p></div><ExportAnswers room={room} /></div>
        <Banners room={room} />
        {room.message && <p className="show-message is-error" role="alert">{room.message}</p>}
        {preview ? <PreviewCard session={show.sessions.find(s => s.id === preview.id) ?? preview} context={context} room={room} onClose={() => setPreview(null)} /> : <>
          <LiveControls room={room} variant="laptop" onItems={() => document.getElementById("ctl-items-title")?.scrollIntoView({ block: "start", behavior: "smooth" })} />
          <label className="ctl-size" htmlFor="ctl-room-size">Room size<select id="ctl-room-size" value={frame?.display?.room_size ?? "very_small"} disabled={Boolean(room.pending) || !frame} onChange={e => void room.press("room_size", { size: e.target.value as RoomSize })}>{roomSizes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="show-help">Scales all TV type at once.</span></label>
          <ItemList room={room} />
          <QaAnyTime room={room} />
          {KindPanel && <KindPanel room={room} />}
        </>}
      </main>
      <aside className="ctl-col ctl-side">
        <Private title="Room">
          <div className="ctl-stats">
            <div><b>{counts ? counts.signed_in : "·"}</b><span>Signed in</span></div>
            <div><b>{counts ? counts.answered : "·"}</b><span>Answered this session</span></div>
            <div><b>{counts ? counts.answers : "·"}</b><span>Answers on the TV{counts?.hidden ? `, ${counts.hidden} hidden` : ""}</span></div>
            <div><b>{counts?.latency_p95_ms != null ? `${(counts.latency_p95_ms / 1000).toFixed(2)}s` : "·"}</b><span>Phone to TV, 95th</span></div>
          </div>
          <Link className="show-button is-small" href={`/control/${engagement}/latency`}>See the phone to TV report</Link>
        </Private>
        <Private title="At the door"><div className="ctl-door">{door}</div></Private>
        <Private title="Rehearsal"><RehearsalPanel room={room} /></Private>
        <Private title="Presenter notes">{current ? <><p className="ctl-label">{current.title}</p><p className="ctl-notes">{current.notes || "No presenter notes."}</p></> : <p className="ctl-notes">Nothing is live.</p>}</Private>
        {status?.controls.length ? <Private title="Recent presses"><ul className="ctl-log">{status.controls.slice(0, 5).map(c => <li key={c.id}><span>{c.by || "The room"}</span> {c.action.replaceAll("_", " ")}</li>)}</ul></Private> : null}
      </aside>
    </div>
    <Toasts room={room} />
  </div>;
}
