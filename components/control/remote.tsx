"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, EyeOff, House, ListOrdered, MoreHorizontal, Play, Plus, Smartphone, Square, Sun, SunDim, Timer, X } from "lucide-react";
import type { RunOfShow, ShowSession } from "@/lib/run-of-show/types";
import type { RoomSize } from "@/lib/control/types";
import { liveSteps, stateLabels } from "@/lib/control/policy";
import { kindOf } from "@/lib/interactions/kinds";
import { useControlRoom } from "./use-control-room";
import { TimerCard } from "./timer-panel";
import { Banners, ItemList, PreviewCard, ReloadNotice, SyncChip, Toasts, burstLeft, roomSizes, useSecondTap } from "./live-controls";
import { AnswersToggle } from "./answers-toggle";
import { MarkDecision } from "./mark-decision";
import { JoinBannerButton } from "./join-banner";
import { TvMirror } from "@/components/tv/tv-mirror";
import { QaAnyTime } from "@/components/interactions/qa/qa-panel";
import { HandoverPanel } from "@/components/interactions/intent/handover";
import { AiRemote } from "@/components/interactions/ai/ai-panel";
import { SignalList } from "@/components/interactions/signal/signal-panel";
import { OvernightCard } from "@/components/overnight/overnight-card";
import { QuoteOnTv } from "./quote-on-tv";
import { ReadBackRemote } from "@/components/interactions/read-back/read-back-panel";
import "./remote.css";

type Sheet = "steps" | "items" | "timer" | "more" | "size" | { preview: ShowSession } | null;

// FAC-03: the live controls in the facilitator's hand, on one phone screen (November 17). Everything pressed during a
// session fits the screen without scrolling, and every control keeps its place from step to step: a control the live step
// can't use is shown disabled, never removed. Warnings sit over the TV mirror instead of pushing the controls down.
// Anything used now and then (the run of show, items, the timer, the room's other tools) opens in a sheet.
// It holds its own connection and needs nothing from the laptop.
export function Remote({ initial }: { initial: RunOfShow }) {
  const room = useControlRoom(initial.context.id, initial);
  const [sheet, setSheet] = useState<Sheet>(null);
  const { frame, show, upNext, steps, pending, press } = room;
  const confirmed = room.mirror, shown = confirmed?.session;
  const busy = Boolean(pending) || !frame || show.context.closed;
  const session = frame?.session, input = Boolean(session && session.interaction !== "content"), stopped = session?.state === "closed";
  const answerable = Boolean(session && kindOf(session)?.input), canRun = input && !stopped, burst = burstLeft(room), down = Boolean(frame?.state.phones_down);
  const [minutes, setMinutes] = useState<3 | 4 | 5>(4);
  const sessionMinutes = room.current?.settings.burst_minutes;
  useEffect(() => { if (sessionMinutes === 3 || sessionMinutes === 4 || sessionMinutes === 5) setMinutes(sessionMinutes); }, [room.current?.id, sessionMinutes]);
  const close = () => setSheet(null);
  const pill = !shown ? null : stopped ? <span className="ctl-chip">Answers stopped</span>
    : confirmed?.state.phones_down ? <span className="ctl-chip">Phones down</span> : shown.state === "live" ? <span className="ctl-live">Live</span> : null;
  const count = confirmed?.session && confirmed.session.interaction !== "content" ? ` · ${confirmed.state.results.total} ${confirmed.state.results.total === 1 ? "answer" : "answers"}` : "";
  const onTv = shown?.title ?? (confirmed?.state.tv_content === "join" ? "Join screen" : confirmed?.state.tv_content === "blackout" ? "Blackout" : "Home screen");
  return <main id="main" className="ctl-remote is-one-screen" data-room-version={frame?.version}>
    <header className="ctl-remote-head"><span className="ctl-label rm-church">{show.context.church}</span><SyncChip room={room} /></header>
    {/* The stage takes the height the controls leave: the TV mirror, and under it the alignment signal while one is running
        (PRD: the facilitator's own remote shows it, so it works with the laptop closed). The controls below never move. */}
    <div className="rm-stage">
      <div className="rm-mirror"><TvMirror frame={confirmed} />
      {/* Warnings and refusals float over the mirror, so the buttons below never move. */}
      <div className="rm-alerts" aria-live="polite">
        <ReloadNotice room={room} />
        <Banners room={room} compact />
        {room.message && <div className="ctl-banner is-warning rm-message" role="alert"><div>{room.message}</div>
          <button type="button" className="ctl-banner-close" aria-label="Dismiss this message" onClick={() => room.setMessage("")}><X size={18} aria-hidden="true" /></button></div>}
      </div></div>
      <div className="rm-signal"><SignalList room={room} /></div>
    </div>
    <div className="rm-now"><p className="rm-now-text"><span className="ctl-eyebrow">On the TV</span><span className="ctl-label">{onTv}{count}</span></p>{pill}</div>
    <button type="button" className="rm-next" disabled={!upNext} onClick={() => upNext && setSheet({ preview: upNext })}>
      <span className="ctl-eyebrow">Up next</span><span className="rm-next-title">{upNext ? upNext.title : "End of the run of show"}</span>{upNext && <span className="rm-next-hint">Preview<ChevronRight size={16} aria-hidden="true" /></span>}</button>
    <button type="button" className="ctl-r-btn is-live rm-go" disabled={busy || !upNext} onClick={() => upNext && void press("go_live", { session: upNext.id })}>
      <Play size={20} aria-hidden="true" />{upNext ? `Go live: ${upNext.title}` : "Nothing up next"}</button>
    <div className="rm-row is-two">
      <button type="button" className="ctl-r-btn" disabled={busy || !steps.back} onClick={() => void press("back")} title={steps.back?.title}><ChevronLeft size={20} aria-hidden="true" />Back</button>
      <button type="button" className="ctl-r-btn" disabled={busy || !steps.next} onClick={() => void press("next")} title={steps.next?.title}>Next<ChevronRight size={20} aria-hidden="true" /></button>
    </div>
    {/* The burst slot: three lengths that start a burst in one tap, or the countdown with +1 and End while one runs. */}
    <div className="rm-row is-four" role="group" aria-label="Burst and phones">
      {burst ? <>
        <span className="rm-countdown" role="timer" aria-label={`Burst, ${burst.label} left`}><Timer size={16} aria-hidden="true" /><b>{burst.label}</b></span>
        <button type="button" className="ctl-r-btn" disabled={busy} onClick={() => void press("extend_burst")}><Plus size={16} aria-hidden="true" />1 min</button>
        <button type="button" className="ctl-r-btn" disabled={busy} onClick={() => void press("end_burst")}><Square size={16} aria-hidden="true" />End</button>
      </> : ([3, 4, 5] as const).map(n => <button key={n} type="button" className={`ctl-r-btn${minutes === n ? " is-primary" : ""}`} disabled={busy || !canRun}
        aria-label={`Start a ${n} minute burst`} onClick={() => { setMinutes(n); void press("start_burst", { minutes: n }); }}><Timer size={16} aria-hidden="true" />{n} min</button>)}
      {down
        ? <button type="button" className="ctl-r-btn" disabled={busy || !canRun} onClick={() => void press("open_phones")}><Smartphone size={16} aria-hidden="true" />Open phones</button>
        : <button type="button" className="ctl-r-btn" disabled={busy || !canRun} onClick={() => void press("phones_down")}><Smartphone size={16} aria-hidden="true" />Phones down</button>}
    </div>
    <div className="rm-row is-three">
      {answerable ? <AnswersToggle room={room} className="ctl-r-btn" /> : <button type="button" className="ctl-r-btn" disabled>Stop answers</button>}
      <JoinBannerButton room={room} className="ctl-r-btn rm-banner" />
      <button type="button" className="ctl-r-btn" disabled={busy || !frame?.state.live_session_id} onClick={() => void press("nothing_live")}><House size={16} aria-hidden="true" />Home</button>
    </div>
    <nav className="rm-dock" aria-label="More controls">
      <button type="button" className="rm-dock-btn" onClick={() => setSheet("steps")}><ListOrdered size={20} aria-hidden="true" />Steps</button>
      <button type="button" className="rm-dock-btn" disabled={!input} onClick={() => setSheet("items")}>{frame?.state.spotlight_key ? <SunDim size={20} aria-hidden="true" /> : <Sun size={20} aria-hidden="true" />}Items</button>
      <button type="button" className={`rm-dock-btn${frame?.state.timer ? " is-on" : ""}`} onClick={() => setSheet("timer")}><Timer size={20} aria-hidden="true" />Timer</button>
      <button type="button" className="rm-dock-btn" onClick={() => setSheet("more")}><MoreHorizontal size={20} aria-hidden="true" />More</button>
    </nav>
    {sheet && <div className="ctl-sheet-scrim" onClick={close}>
      <div className="ctl-sheet" role="dialog" aria-modal="true" aria-label={sheetLabel(sheet)} onClick={e => e.stopPropagation()}>
        {typeof sheet === "object" && <PreviewCard session={sheet.preview} context={show.context} room={room} onClose={close} />}
        {sheet === "steps" && <StepsSheet room={room} onPreview={s => setSheet({ preview: s })} onClose={close} />}
        {sheet === "items" && <><ItemList room={room} onClose={close} /><QaAnyTime room={room} /></>}
        {sheet === "timer" && <section><SheetHead title="Timer" onClose={close} /><TimerCard room={room} engagement={initial.context.id} compact /></section>}
        {sheet === "more" && <MoreSheet room={room} engagement={initial.context.id} onSize={() => setSheet("size")} onClose={close} />}
        {sheet === "size" && <section><SheetHead title="Room size" onClose={close} />
          <div className="ctl-size-list" role="radiogroup" aria-label="Room size">{roomSizes.map(([value, label]) => <button key={value} role="radio" aria-checked={frame?.display?.room_size === value} className="ctl-r-btn" disabled={Boolean(pending)}
            onClick={() => void press("room_size", { size: value as RoomSize }).then(close)}>{label}</button>)}</div>
          <p className="show-help">Scales all TV type at once.</p></section>}
      </div>
    </div>}
    <Toasts room={room} />
  </main>;
}

const sheetLabel = (sheet: Exclude<Sheet, null>) => typeof sheet === "object" ? "Preview" : { steps: "Run of show", items: "Items on the TV", timer: "Timer", more: "More controls", size: "Room size" }[sheet];
function SheetHead({ title, onClose }: { title: string; onClose: () => void }) {
  return <div className="ctl-row is-between rm-sheet-head"><h2>{title}</h2><button type="button" className="show-button is-icon" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><X size={20} aria-hidden="true" /></button></div>;
}

// The run of show in the hand: preview any step, or send it live, without walking to the laptop.
function StepsSheet({ room, onPreview, onClose }: { room: ReturnType<typeof useControlRoom>; onPreview: (s: ShowSession) => void; onClose: () => void }) {
  const liveId = room.frame?.state.live_session_id, busy = Boolean(room.pending) || room.show.context.closed;
  return <section><SheetHead title="Run of show" onClose={onClose} />
    <ol className="rm-steps">{liveSteps(room.show.sessions).map(s => <li key={s.id} className={s.id === liveId ? "is-live" : s.id === room.upNext?.id ? "is-next" : ""}>
      <button type="button" className="rm-step" onClick={() => onPreview(s)}><strong>{s.title}</strong><span>{s.id === liveId ? "On the TV" : s.id === room.upNext?.id ? "Up next" : stateLabels[s.state] ?? s.state}</span></button>
      <button type="button" className="show-button" disabled={busy || s.id === liveId || s.state === "draft"} onClick={() => void room.press("go_live", { session: s.id }).then(r => { if (r.status === "ok") onClose(); })}><Play size={16} aria-hidden="true" />Go live</button>
    </li>)}</ol></section>;
}

// The room's other tools: the ones a session uses now and then, kept off the main screen.
function MoreSheet({ room, engagement, onSize, onClose }: { room: ReturnType<typeof useControlRoom>; engagement: string; onSize: () => void; onClose: () => void }) {
  const confirm = useSecondTap(), busy = Boolean(room.pending) || !room.frame, tvOnPhones = Boolean(room.frame?.state.show_tv_on_phones);
  return <section className="rm-more"><SheetHead title="More controls" onClose={onClose} />
    <QuoteOnTv room={room} />
    <div className="ctl-grid">
      <button type="button" className="ctl-r-btn" disabled={busy} aria-pressed={tvOnPhones} onClick={() => void room.press("tv_on_phones", { on: !tvOnPhones })}>{tvOnPhones ? <EyeOff size={18} aria-hidden="true" /> : <Smartphone size={18} aria-hidden="true" />}{tvOnPhones ? "Stop the TV view on phones" : "TV view on phones"}</button>
      <button type="button" className="ctl-r-btn" disabled={busy} onClick={() => confirm.tap("refresh", () => void room.press("refresh_phones"))}>{confirm.armed === "refresh" ? "Tap again to refresh phones" : "Refresh phones"}</button>
      <button type="button" className="ctl-r-btn" disabled={busy} onClick={onSize}>Room size</button>
      <MarkDecision room={room} variant="remote" />
    </div>
    <AiRemote room={room} />
    <ReadBackRemote room={room} />
    <section className="ctl-private" aria-label="Overnight review, only you see this"><div className="show-private"><EyeOff size={16} aria-hidden="true" />Only you see this<span>Overnight review</span></div>
      <div className="ctl-private-body"><OvernightCard engagement={engagement} tick={room.overnightTick} link={false} /></div></section>
    <HandoverPanel room={room} />
  </section>;
}
