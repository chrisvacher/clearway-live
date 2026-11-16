"use client";
import { HandoverPanel } from "@/components/interactions/intent/handover";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Circle, Clock, Eye, EyeOff, Inbox, LayoutGrid, Lock, Map as MapIcon, MonitorSmartphone, PanelRightClose, PanelRightOpen, PencilLine, Play, Printer, Radio, RefreshCw, Smartphone } from "lucide-react";
import { actionNames, stateLabels, timing } from "@/lib/control/policy";
import { fillYears } from "@/lib/run-of-show/policy";
import { parts, type RunOfShow, type ShowContext, type ShowSession } from "@/lib/run-of-show/types";
import { partOpen } from "@/lib/run-of-show/self-paced";
import type { RoomSize } from "@/lib/control/types";
import { useControlRoom } from "./use-control-room";
import { usePreview } from "./use-preview";
import { Banners, ItemList, ReloadNotice, SyncChip, Toasts, roomSizes, useSecondTap, type Room } from "./live-controls";
import { StepControls, Transport, useRoomKeys } from "./step-controls";
import { TvMirror } from "@/components/tv/tv-mirror";
import { controlPanels } from "@/components/interactions/control-panels";
import { QaAnyTime } from "@/components/interactions/qa/qa-panel";
import { ExportAnswers, RehearsalPanel, SelfPacedList } from "./rehearsal";
import { AiPanel } from "@/components/interactions/ai/ai-panel";
import { SignalPanel } from "@/components/interactions/signal/signal-panel";
import { aiPressNames } from "@/lib/interactions/ai";
import { ScribeFeed } from "@/components/scribe/scribe-feed";
import { OvernightCard } from "@/components/overnight/overnight-card";
import { AfterLink } from "@/components/report/after-link";
import { RemoteLink } from "./remote-link";
import { EndWorkshop } from "./end-workshop";
import { OpenTvWindow } from "./open-tv-window";
import { HeaderMore, useWide } from "./header-more";

// Where this room lives: the address people type, the code, and whose brand the room wears. Facilitator screens stay Clearway Live.
export type RoomIdentity = { host: string; origin: string; name: string; code: string; brand: string };

function Private({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return <section id={id} className="ctl-private" aria-label={`${title}, only you see this`}><div className="show-private"><EyeOff size={16} aria-hidden="true" />Only you see this<span>{title}</span></div><div className="ctl-private-body">{children}</div></section>;
}
const time = (iso: string | null, zone: string) => iso ? new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone: zone }).format(new Date(iso)) : "";

// A step's state as one small icon, named for screen readers and on hover, so the row keeps its room for Preview and Go live.
const stateIcons: Record<string, typeof Circle> = { draft: PencilLine, ready: Circle, live: Radio, phones_down: Smartphone, open: Inbox, closed: Lock };
const stateHelp: Record<string, string> = {
  draft: "Draft: mark it ready in setup before it goes live",
  ready: "Ready to go live",
  live: "Live on the TV",
  phones_down: "Live, phones down",
  open: "Taking late answers while its segment runs",
  closed: "Closed: goes live read-only until you reopen it",
};
function StateIcon({ state }: { state: string }) {
  const Icon = stateIcons[state] ?? Circle, label = stateHelp[state] ?? stateLabels[state] ?? state;
  return <span className={`ctl-state-icon is-${state}`} title={label} data-state={state}><Icon size={16} aria-hidden="true" /><span className="sr-only">{label}</span></span>;
}

const screenNames: Record<string, string> = { blackout: "Blackout", join: "Join screen", holding: "Home screen", screen_check: "Screen check" };

const sideKey = "clearway-live.room-admin";
function useRoomAdmin() {
  const [open, setOpen] = useState(false);
  // The drawer animates both ways: "opening" draws it at nothing for a frame and "closing" shrinks it away before it hides.
  const [phase, setPhase] = useState<"closed" | "opening" | "open" | "closing">("closed");
  // A light per-browser convenience: the drawer stays as the facilitator left it.
  useEffect(() => { try { if (localStorage.getItem(sideKey) === "open") { setOpen(true); setPhase("open"); } } catch { /* Storage can be unavailable. */ } }, []);
  useEffect(() => {
    if (phase === "opening") {
      let stopped = false; requestAnimationFrame(() => requestAnimationFrame(() => { if (!stopped) setPhase("open"); }));
      return () => { stopped = true; };
    }
    if (phase === "closing") {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const t = setTimeout(() => setPhase("closed"), still ? 0 : 320);
      return () => clearTimeout(t);
    }
  }, [phase]);
  const set = (next: boolean) => {
    setOpen(next); setPhase(p => next ? (p === "closed" ? "opening" : "open") : (p === "closed" ? "closed" : "closing"));
    try { localStorage.setItem(sideKey, next ? "open" : "closed"); } catch { /* Storage can be unavailable. */ }
  };
  return { open, set, phase };
}

// FAC-01, laid out like a presentation switcher: the run of show left; the preview and live screens side by side in the
// centre with the controls under them; Room admin as a drawer on the right, called when needed and hidden to give the
// screens the room. A workshop leaves out what only a Wayfinding retreat uses: the alignment signal, the scribe feed,
// the overnight review and After the retreat.
export function ControlSurface({ initial, door, workshop = false, identity }: { initial: RunOfShow; door: React.ReactNode; workshop?: boolean; identity?: RoomIdentity }) {
  const engagement = initial.context.id;
  const router = useRouter();
  // Join requests arrive while the room runs; refresh the door list quietly.
  useEffect(() => { const t = setInterval(() => router.refresh(), 15000); return () => clearInterval(t); }, [router]);
  const room = useControlRoom(engagement, initial);
  // The step in preview: the one chosen in the run of show, or up next until one is chosen.
  const [chosen, setChosen] = useState<string | null>(null);
  // On a narrow window the run of show folds away so the live controls come first.
  const [runOpen, setRunOpen] = useState(false);
  const side = useRoomAdmin();
  const confirm = useSecondTap();
  // On a wide window Print and End the workshop sit in a More menu so the header is one row; narrow keeps them inline.
  const wide = useWide();
  const { show, frame, status, current } = room;
  const context = show.context;
  const shownId = frame?.state.live_session_id ?? null;
  // A chosen step that has gone live has done its job: the preview moves on to what's up next.
  useEffect(() => { if (chosen && chosen === shownId) setChosen(null); }, [chosen, shownId]);
  const previewing = (chosen ? show.sessions.find(s => s.id === chosen) : null) ?? room.upNext ?? null;
  const clock = timing(current, room.now);
  const counts = status?.counts;
  const KindPanel = frame?.session ? controlPanels[frame.session.interaction] : undefined;
  const busy = Boolean(room.pending) || !frame;
  const tvOnPhones = Boolean(frame?.state.show_tv_on_phones);
  // Burst length for Start burst and the 3/4/5 keys: the step's own setting until the facilitator picks another.
  const [picked, setMinutes] = useState<3 | 4 | 5 | null>(null);
  useEffect(() => setMinutes(null), [shownId]);
  const minutes = picked ?? ([3, 4, 5].includes(Number(current?.settings?.burst_minutes)) ? Number(current?.settings?.burst_minutes) as 3 | 4 | 5 : 4);
  const openPanel = () => { const el = document.getElementById("ctl-step-panel"); el?.scrollIntoView({ block: "start", behavior: "smooth" }); el?.focus({ preventScroll: true }); };
  const goLive = (s: ShowSession) => void room.press("go_live", { session: s.id }).then(r => { if (r.status === "ok" && chosen === s.id) setChosen(null); });
  useRoomKeys({ room, previewing, onGoLive: goLive, minutes });
  const openDoor = (event: React.MouseEvent) => { if (!side.open) { event.preventDefault(); side.set(true); requestAnimationFrame(() => document.getElementById("ctl-door")?.scrollIntoView({ block: "start" })); } };
  return <div className="ctl-app" data-room-version={frame?.version}>
    <header className="ctl-head">
      <div>
        <div className="ctl-crumb"><Link className="show-button is-small" href={`/setup/${engagement}`} data-testid="back-to-engagement"><ArrowLeft size={16} aria-hidden="true" />Back to the engagement</Link><p className="ctl-eyebrow">{context.church} · {context.title}</p></div>
        <h1>Live room</h1>
        {identity && <p className="ctl-identity" data-testid="room-identity"><a href={`${identity.origin}/${identity.name}`} target="_blank" rel="noreferrer">{identity.host}/{identity.name}</a><span>Room code {identity.code}</span><span>{identity.brand}</span><a href="#ctl-door" onClick={openDoor}>{counts ? `${counts.signed_in} in the room` : "In the room"}</a></p>}
      </div>
      <div className="ctl-row ctl-actions">
        {status?.rehearsal?.since && <span className="ctl-chip sp-rehearsing">Rehearsing</span>}
        {!context.closed && <OpenTvWindow id={engagement} variant="small" />}
        <RemoteLink engagement={engagement} />
        {!wide && <Link className="show-button" href={`/setup/${engagement}/run-of-show/print`} target="_blank" rel="noreferrer"><Printer size={18} aria-hidden="true" />Print run of show</Link>}
        <Link className="show-button" href={`/control/${engagement}/recap`}><LayoutGrid size={18} aria-hidden="true" />{workshop ? "See results" : "See results recap"}</Link>
        {workshop && !wide && <EndWorkshop engagement={engagement} closed={context.closed} />}
        {!workshop && <Link className="show-button" href={`/control/${engagement}/map`}><MapIcon size={18} aria-hidden="true" />Draft Clearway Map</Link>}
        {!workshop && <AfterLink engagement={engagement} />}
        {wide && <HeaderMore engagement={engagement} workshop={workshop} closed={context.closed} />}
        <button type="button" className={`show-button ctl-side-toggle${side.open ? " is-on" : ""}`} aria-expanded={side.open} aria-controls="ctl-side" onClick={() => side.set(!side.open)}>
          {side.open ? <PanelRightClose size={18} aria-hidden="true" /> : <PanelRightOpen size={18} aria-hidden="true" />}Room admin
        </button>
      </div>
    </header>
    <div className={`ctl-cols${side.phase !== "closed" ? " has-side" : ""}${side.phase === "opening" || side.phase === "closing" ? " is-side-off" : ""}`}>
      <nav className={`ctl-col ctl-run${runOpen ? "" : " is-folded"}`} aria-label="Run of show">
        <div className="ctl-row is-between"><h2>Run of show</h2>{clock && <span className={`ctl-chip${clock.onTime ? " is-success" : ""}`}><Clock size={14} aria-hidden="true" />{clock.label}</span>}
          <button type="button" className="show-button is-small ctl-run-toggle" aria-expanded={runOpen} aria-controls="ctl-run-body" onClick={() => setRunOpen(v => !v)}>{runOpen ? "Hide the run of show" : "Show the run of show"}</button></div>
        <div id="ctl-run-body" className="ctl-run-body">
        {parts.map(part => {
          const list = show.sessions.filter(s => s.part === part && s.mode === "live");
          const selfPaced = (status?.self_paced ?? []).map(s => ({ ...s, mode: "self_paced" }));
          const open = partOpen(part, [...list, ...selfPaced], room.now + room.clockOffset);
          if (!list.length && !open) return null;
          return <section key={part} className="ctl-part">
            <div className="ctl-row is-between"><h3>{part}</h3>{open && <button className="show-button is-small" disabled={Boolean(room.pending) || context.closed} onClick={() => confirm.tap(part, () => void room.press("close_part", { part }))}>{confirm.armed === part ? `Tap again to close ${part}` : `Close ${part}`}</button>}</div>
            {list.length > 0 && <ol className="ctl-run-list">{list.map(s => {
              const isLive = s.id === shownId, inPreview = s.id === previewing?.id;
              return <li key={s.id} className={`${isLive ? "is-current" : ""}${inPreview ? " is-preview" : ""}${s.id === room.upNext?.id ? " is-next" : ""}`} data-session={s.id}>
                <span className="ctl-time">{time(s.planned_start, context.timezone)}</span>
                <span className="ctl-run-title"><strong className={(s.options as { untitled?: boolean } | undefined)?.untitled ? "is-untitled" : undefined}>{s.title}</strong><small>{s.segment ? `${s.segment} · ` : ""}{context.kinds?.find(k => k.kind === s.interaction)?.label ?? (s.interaction === "word_cloud" ? "Word cloud" : s.interaction === "wall" ? "Wall" : "Content")} · {s.planned_minutes} min</small></span>
                <StateIcon state={s.state} />
                <span className="ctl-run-actions">
                  <button className="show-button is-small" aria-pressed={inPreview} onClick={() => setChosen(s.id)} aria-label={`Preview ${s.title}`}>Preview</button>
                  <button className={`show-button is-small${isLive ? " is-on-air" : " is-go"}`} disabled={busy || isLive || s.state === "draft" || context.closed} onClick={() => goLive(s)} aria-label={isLive ? `${s.title} is live` : `Go live with ${s.title}`}>{isLive ? <><Radio size={14} aria-hidden="true" />Live</> : <><Play size={14} aria-hidden="true" />Go live</>}</button>
                </span>
              </li>;
            })}</ol>}
          </section>;
        })}
        <SelfPacedList room={room} timezone={context.timezone} />
        </div>
      </nav>
      <main id="main" className="ctl-col ctl-centre">
        <ReloadNotice room={room} />
        <Banners room={room} />
        {room.message && <p className="show-message is-error" role="alert">{room.message}</p>}
        <div className="ctl-screens">
          <PreviewScreen room={room} session={previewing} context={context} chosen={Boolean(chosen)} />
          <LiveScreen room={room} context={context} />
        </div>
        <Transport room={room} context={context} previewing={previewing} onGoLive={goLive} />
        <StepControls room={room} minutes={minutes} setMinutes={setMinutes} onPanel={openPanel} workshop={workshop} />
        <div id="ctl-decision-host" />
        <section id="ctl-step-panel" className="ctl-step-panel" aria-label="Step panel" tabIndex={-1}>
          <ItemList room={room} />
          {KindPanel && <KindPanel room={room} />}
          <QaAnyTime room={room} />
        </section>
      </main>
      <aside id="ctl-side" className="ctl-col ctl-side" aria-label="Room admin" hidden={side.phase === "closed"} inert={side.phase === "closing" || undefined}>
        <div className="ctl-row is-between ctl-side-head"><h2>Room admin</h2><button type="button" className="show-button is-small" onClick={() => side.set(false)}><PanelRightClose size={16} aria-hidden="true" />Hide</button></div>
        {!workshop && <SignalPanel room={room} />}
        <AiPanel room={room} />
        <Private title="Room">
          <div className="ctl-stats">
            <div><b>{counts ? counts.signed_in : "·"}</b><span>Signed in</span></div>
            <div><b>{counts ? counts.answered : "·"}</b><span>Answered this session</span></div>
            <div><b>{counts ? counts.answers : "·"}</b><span>Answers on the TV{counts?.hidden ? `, ${counts.hidden} hidden` : ""}</span></div>
            <div><b>{counts?.latency_p95_ms != null ? `${(counts.latency_p95_ms / 1000).toFixed(2)}s` : "·"}</b><span>Phone to TV, 95th</span></div>
          </div>
          <label className="ctl-size" htmlFor="ctl-room-size">Room size<select id="ctl-room-size" value={frame?.display?.room_size ?? "very_small"} disabled={busy} onChange={e => void room.press("room_size", { size: e.target.value as RoomSize })}>{roomSizes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="show-help">Scales all TV type at once.</span></label>
          <Link className="show-button is-small" href={`/control/${engagement}/latency`}>See the phone to TV report</Link>
        </Private>
        <Private title="TV and phones">
          <div className="ctl-row">
            <button type="button" className="show-button" disabled={busy} aria-pressed={tvOnPhones} onClick={() => void room.press("tv_on_phones", { on: !tvOnPhones })}>{tvOnPhones ? <Eye size={18} aria-hidden="true" /> : <MonitorSmartphone size={18} aria-hidden="true" />}{tvOnPhones ? "Stop the TV view on phones" : "TV view on phones"}</button>
            <button type="button" className="show-button" disabled={busy} onClick={() => confirm.tap("refresh", () => void room.press("refresh_phones"))}><RefreshCw size={18} aria-hidden="true" />{confirm.armed === "refresh" ? "Tap again to refresh phones" : "Refresh phones"}</button>
          </div>
          <p className="show-help">Use the TV view on phones if the TV drops. Refresh phones reloads every phone in the room.</p>
        </Private>
        <HandoverPanel room={room} />
        {!workshop && <Private title="Scribe"><ScribeFeed engagement={engagement} tick={room.scribeTick} live={room.frame?.state.live_session_id ?? null} promoted={room.frame?.promoted_quote?.text ?? null} /></Private>}
        {!workshop && <Private title="Overnight review"><OvernightCard engagement={engagement} tick={room.overnightTick} link /></Private>}
        <Private title="At the door" id="ctl-door"><div className="ctl-door">{door}</div></Private>
        <Private title="Rehearsal"><RehearsalPanel room={room} /></Private>
        {status?.controls.length ? <Private title="Recent presses"><ul className="ctl-log">{status.controls.slice(0, 5).map(c => <li key={c.id}><span>{c.by || "The room"}</span> {(aiPressNames[c.action] ?? actionNames[c.action] ?? c.action.replaceAll("_", " ")).toLowerCase()}</li>)}</ul></Private> : null}
      </aside>
    </div>
    <Toasts room={room} />
  </div>;
}

// Preview: what a step will look like on the TV before it goes there. Go live on the screen itself sends it to the live screen.
function PreviewScreen({ room, session, context, chosen }: { room: Room; session: ShowSession | null; context: ShowContext; chosen: boolean }) {
  const preview = usePreview(context.id, session?.id ?? null, { mirror: room.mirror, version: room.frame?.version });
  return <section className="ctl-screen is-preview" aria-labelledby="ctl-preview-title">
    <div className="ctl-screen-head">
      <span className="ctl-screen-tag">Preview</span>
      <h2 id="ctl-preview-title" className="ctl-screen-title">{session ? session.title : "Nothing to preview"}</h2>
      {session && !chosen && <span className="ctl-screen-note">Up next</span>}
    </div>
    <div className="ctl-screen-frame">
      {preview.frame ? <TvMirror frame={preview.frame} label="Preview" /> : <div className="ctl-screen-empty">{!session ? "Choose Preview on a step in the run of show." : preview.failed ? "We couldn’t load this preview." : "Loading the preview"}</div>}
    </div>
    {session && <div className="ctl-screen-foot">
      {session.state === "draft" && <p className="show-help">Mark this step ready in setup before it goes live.</p>}
      {session.phone_depth && <p className="ctl-screen-line"><span>Phones only</span>{fillYears(session.phone_depth, context.base_year)}</p>}
      <details className="ctl-screen-notes"><summary>Presenter notes</summary><p className="ctl-notes">{session.notes || "No presenter notes."}</p></details>
    </div>}
  </section>;
}

// Live: what the TV has confirmed it shows, kept smaller as a confidence monitor; the TV itself is in the room.
function LiveScreen({ room, context }: { room: Room; context: ShowContext }) {
  const { frame, current } = room;
  const content = frame?.state.tv_content ?? "holding";
  return <section className="ctl-screen is-live ctl-tv" aria-labelledby="ctl-live-title">
    <div className="ctl-screen-head">
      <span className="ctl-screen-tag is-live">Live</span>
      <h2 id="ctl-live-title" className="ctl-screen-title">{current ? current.title : screenNames[content] ?? "Home screen"}</h2>
      <SyncChip room={room} href={`/setup/${context.id}/tv`} />
      <ExportAnswers room={room} />
    </div>
    <div className="ctl-screen-frame"><TvMirror frame={room.mirror} /></div>
    {current && <div className="ctl-screen-foot"><details className="ctl-screen-notes" open><summary>Presenter notes</summary><p className="ctl-notes">{current.notes || "No presenter notes."}</p></details></div>}
  </section>;
}
