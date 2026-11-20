"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChartColumn, Copy, EyeOff, NotebookPen, PanelRight, Repeat, Smartphone, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StageChip, StepChip } from "@/components/ui/chips";
import { useToast } from "@/components/ui/toast";
import type { Stage } from "@/lib/setup/stage";
import { neighbours } from "@/lib/control/policy";
import { kindLabels } from "@/lib/interactions/kinds";
import { fillYears } from "@/lib/run-of-show/policy";
import type { RunOfShow, ShowContext, ShowSession } from "@/lib/run-of-show/types";
import { TvMirror } from "@/components/tv/tv-mirror";
import { imageShowFor } from "@/components/tv/image-stage";
import { loopIndex, loopNextIn } from "@/lib/images/loop";
import { serverNow } from "@/lib/live/protocol";
import { controlPanels } from "@/components/interactions/control-panels";
import { AiPanel } from "@/components/interactions/ai/ai-panel";
import { SignalPanel } from "@/components/interactions/signal/signal-panel";
import { useControlRoom } from "./use-control-room";
import { usePreview } from "./use-preview";
import { Banners, ItemList, ReloadNotice, Toasts, type Room } from "./live-controls";
import { StepControls, Transport, useRoomKeys } from "./step-controls";
import { ExportAnswers } from "./rehearsal";
import { TimerChip } from "./timer-panel";
import { RemoteLink } from "./remote-link";
import { EndWorkshop } from "./end-workshop";
import { HeaderMore } from "./header-more";
import { RoomAdmin, type AdminTab, type DrawerPhase } from "./room-admin";
import { RunList } from "./run-list";
import { StatusStrip } from "./status-strip";
import { usePressFlash } from "./press-flash";

export type RoomIdentity = { host: string; origin: string; name: string; code: string; brand: string };
type InitialTimes = Record<string, { starts: string | null; label: string }>;

const screenNames: Record<string, string> = { blackout: "Blackout", join: "Join screen", holding: "Home screen", screen_check: "Screen check" };
const sideKey = "clearway-live.room-admin";

function useRoomAdmin() {
  const [phase, setPhase] = useState<DrawerPhase>("closed");
  const [tab, setTab] = useState<AdminTab>("room");
  const toggle = useRef<HTMLButtonElement>(null), close = useRef<HTMLButtonElement>(null);
  const focusOpened = useRef(false);
  const open = phase === "opening" || phase === "open";

  useEffect(() => {
    try { if (localStorage.getItem(sideKey) === "open") setPhase("open"); } catch { /* Storage can be unavailable. */ }
  }, []);
  useEffect(() => {
    if (phase === "opening") {
      let stopped = false;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (stopped) return;
        setPhase("open");
        if (focusOpened.current) close.current?.focus({ preventScroll: true });
      }));
      return () => { stopped = true; };
    }
    if (phase === "closing") {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const timer = setTimeout(() => setPhase("closed"), reduced ? 0 : 220);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  const mounted = phase !== "closed";
  useEffect(() => {
    if (!mounted) return;
    const drawer = document.getElementById("ctl-side");
    const centre = document.getElementById("main");
    const transport = document.getElementById("ctl-transport");
    if (!drawer || !centre || !transport) return;
    const overlay = window.matchMedia("(min-width: 901px) and (max-width: 1599px)");
    function fit() {
      if (!overlay.matches || !drawer || !transport) {
        drawer?.style.removeProperty("max-height");
        return;
      }
      // The overlay covers the right side of the monitors. The transport stays
      // visible and clickable across its full width, even while the drawer scrolls.
      const available = transport.getBoundingClientRect().top - drawer.getBoundingClientRect().top;
      drawer.style.maxHeight = `${Math.max(0, available - 8)}px`;
    }
    const changes = new ResizeObserver(fit);
    changes.observe(centre);
    changes.observe(transport);
    for (const child of centre.children) changes.observe(child);
    centre.addEventListener("scroll", fit, { passive: true });
    window.addEventListener("resize", fit);
    fit();
    return () => {
      changes.disconnect();
      centre.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
      drawer.style.removeProperty("max-height");
    };
  }, [mounted]);

  function set(next: boolean, nextTab?: AdminTab) {
    if (nextTab) setTab(nextTab);
    if (next && open) return;
    focusOpened.current = next;
    setPhase(current => next ? "opening" : current === "closed" ? "closed" : "closing");
    if (!next) toggle.current?.focus({ preventScroll: true });
    try { localStorage.setItem(sideKey, next ? "open" : "closed"); } catch { /* Storage can be unavailable. */ }
  }
  return { phase, open, tab, setTab, set, toggle, close };
}

export function ControlSurface({ initial, door, workshop = false, handover = false, identity, initialStage = "setup", initialTimes }: {
  initial: RunOfShow;
  door: React.ReactNode;
  workshop?: boolean;
  handover?: boolean;
  identity?: RoomIdentity;
  initialStage?: Stage;
  initialTimes: InitialTimes;
}) {
  const engagement = initial.context.id;
  const router = useRouter(), toast = useToast();
  const room = useControlRoom(engagement, initial);
  const { show, frame, current } = room;
  const context = show.context;
  const shownId = frame?.state.live_session_id ?? null;
  const [chosen, setChosen] = useState<string | null>(null);
  const [lastTake, setLastTake] = useState<{ id: string; version: number } | null>(null);
  const [askingEnd, setAskingEnd] = useState(false);
  const [picked, setMinutes] = useState<3 | 4 | 5 | null>(null);
  const [timerOpen, setTimerOpen] = useState(false), [notesOpen, setNotesOpen] = useState(false);
  const side = useRoomAdmin(), pressFlash = usePressFlash();
  const selected = chosen ? show.sessions.find(step => step.id === chosen) : undefined;
  // The press can succeed before the room stream delivers its new live step.
  const next = lastTake && lastTake.version > (frame?.version ?? -1)
    ? neighbours(show.sessions, lastTake.id, null).next
    : room.steps.next;
  const previewing = selected ?? next;
  const KindPanel = frame?.session ? controlPanels[frame.session.interaction] : undefined;
  const minutes = picked ?? ([3, 4, 5].includes(Number(current?.settings?.burst_minutes)) ? Number(current?.settings?.burst_minutes) as 3 | 4 | 5 : 4);
  const stage = context.closed ? workshop ? "done" : "closed" : shownId ? "live" : (initialStage === "done" || initialStage === "closed" || (frame && initialStage === "live")) ? "setup" : initialStage;

  // Join requests arrive while the session runs. Refresh the server-rendered door while the facilitator is here.
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 15000);
    return () => clearInterval(timer);
  }, [router]);
  useEffect(() => setMinutes(null), [shownId]);

  const goLive = (step: ShowSession) => void room.press("go_live", { session: step.id }).then(result => {
    if (result.status !== "ok") return;
    pressFlash.flash();
    if (result.version !== undefined) setLastTake({ id: step.id, version: result.version });
    setChosen(id => id === chosen ? null : id);
  });
  useRoomKeys({ room, previewing, onGoLive: goLive, minutes });
  function openPanel() {
    if (side.open && side.tab === "responses") {
      document.getElementById("cwl-panel-responses")?.focus();
      return;
    }
    const el = document.getElementById("ctl-step-panel");
    el?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    el?.focus({ preventScroll: true });
  }

  async function copyRoomLink() {
    if (!identity) return;
    try {
      await navigator.clipboard.writeText(`${identity.origin}/${identity.name}`);
      toast(`Link copied: ${identity.host}/${identity.name}`);
    } catch { toast("Couldn't copy the room link. Try again."); }
  }

  return <div className="ctl-app ctl-pass10" data-room-version={frame?.version} onKeyDown={event => {
    if (event.key === "Escape" && !event.defaultPrevented && side.open && !document.querySelector("dialog[open], [role='alertdialog']")) side.set(false);
  }}>
    <div className="ctl-remote-notice"><span>This is easier on the remote.</span>
      <Button variant="primary" href={`/remote/${engagement}`}><Smartphone size={16} aria-hidden="true" />Open the remote</Button>
    </div>
    <div className="show-private" id="ctl-privacy"><EyeOff size={16} aria-hidden="true" />Only you see this</div>
    <header className="ctl-head">
      <div className="ctl-heading">
        <Button href={`/admin/${engagement}`} variant="quiet" iconOnly aria-label="Back to the engagement" title="Back to the engagement" data-testid="back-to-engagement"><ArrowLeft size={16} aria-hidden="true" /></Button>
        <div className="ctl-event-label">
          <span className="ctl-church">{context.church}</span>
          <div className="ctl-event-title"><h1 title={context.title}>{context.title}</h1><StageChip stage={stage} compact /></div>
        </div>
      </div>
      <StatusStrip room={room} onPhones={() => {
        side.set(true, "room");
        requestAnimationFrame(() => document.getElementById("ctl-door")?.scrollIntoView({ block: "start" }));
      }} />
      <div className="ctl-row ctl-actions">
        {identity && <div className="ctl-room-link" data-testid="room-identity">
          <a href={`${identity.origin}/${identity.name}`} target="_blank" rel="noreferrer" title={`Room code ${identity.code} · ${identity.brand}`}>{identity.host}/{identity.name}</a>
          <Button variant="quiet" iconOnly size="small" aria-label="Copy room link" onClick={() => void copyRoomLink()}><Copy size={16} aria-hidden="true" /></Button>
        </div>}
        <RemoteLink engagement={engagement} small />
        <Button size="small" href={`/control/${engagement}/recap`}><ChartColumn size={16} aria-hidden="true" />Results</Button>
        <HeaderMore engagement={engagement} closed={context.closed} onEnd={workshop ? () => setAskingEnd(true) : undefined} />
        <Button type="button" size="small" ref={side.toggle} className={`ctl-side-toggle${side.open ? " is-on" : ""}`}
          aria-expanded={side.open} aria-controls="ctl-side" onClick={() => side.set(!side.open)}><PanelRight size={16} aria-hidden="true" />Room admin</Button>
      </div>
    </header>
    {workshop && <div className="ctl-workshop-state"><EndWorkshop engagement={engagement} closed={context.closed} viaMenu={{ open: askingEnd, onClose: () => setAskingEnd(false) }} /></div>}
    <div className={`ctl-cols${side.phase !== "closed" ? " has-side" : ""}${side.phase === "opening" || side.phase === "closing" ? " is-side-off" : ""}`}>
      <RunList room={room} initialTimes={initialTimes} preview={previewing} onPreview={step => setChosen(step.id)} onGoLive={goLive} />
      <main id="main" className="ctl-col ctl-centre">
        <ReloadNotice room={room} />
        <Banners room={room} />
        {room.message && <p className="show-message is-error" role="alert">{room.message}</p>}
        <div className="ctl-screens">
          <PreviewScreen room={room} session={previewing} context={context} chosen={Boolean(selected)} />
          <LiveScreen room={room} flashing={pressFlash.flashing} />
        </div>
        <Transport room={room} context={context} previewing={previewing} onGoLive={goLive} flashing={pressFlash.flashing} />
        <section id="ctl-step-panel" className="ctl-step-panel" aria-label="Live step" tabIndex={-1}>
          <div className="ctl-live-step-head" data-answer-count={room.status?.counts.answers}>
            <div><h2>{current ? `Live step: ${current.title}` : "No live step"}</h2>
              {current && <p className="show-help">{context.kinds?.find(kind => kind.kind === current.interaction)?.label ?? kindLabels[current.interaction]} · {current.planned_minutes} min</p>}</div>
            <div className="ctl-row">
              <Button size="small" aria-expanded={timerOpen} aria-controls="ctl-step-timer" onClick={() => {
                if (!frame?.state.timer) { side.set(true, "room"); requestAnimationFrame(() => document.querySelector("[data-timer-card]")?.scrollIntoView({ block: "nearest" })); }
                else setTimerOpen(value => !value);
              }}><Timer size={16} aria-hidden="true" />Timer</Button>
              {current && <Button size="small" aria-expanded={notesOpen} aria-controls="ctl-live-notes" onClick={() => setNotesOpen(value => !value)}><NotebookPen size={16} aria-hidden="true" />Presenter notes</Button>}
            </div>
          </div>
          <div id="ctl-step-timer" hidden={!timerOpen}><TimerChip room={room} engagement={engagement} /></div>
          {current && <p className="ctl-notes" id="ctl-live-notes" hidden={!notesOpen}>{current.notes || "No presenter notes."}</p>}
          {room.status?.rehearsal?.since && <span className="ctl-chip sp-rehearsing">Rehearsing</span>}
          <StepControls room={room} minutes={minutes} setMinutes={setMinutes} onPanel={openPanel} workshop={workshop} />
          <div id="ctl-decision-host" />
          {(!side.open || side.tab !== "responses") && <ItemList room={room} />}
          {KindPanel && <KindPanel room={room} />}
          <ExportAnswers room={room} />
          <AiPanel room={room} />
          {!workshop && <SignalPanel room={room} />}
        </section>
      </main>
      <RoomAdmin room={room} phase={side.phase} tab={side.tab} onTab={side.setTab} onClose={() => side.set(false)}
        closeRef={side.close} workshop={workshop} handover={handover} door={door} onEnd={() => setAskingEnd(true)} />
    </div>
    <Toasts room={room} />
  </div>;
}

// Preview: what a step will look like on the TV before it goes there. Go live on the screen itself sends it to the live screen.
function PreviewScreen({ room, session, context, chosen }: { room: Room; session: ShowSession | null; context: ShowContext; chosen: boolean }) {
  const preview = usePreview(context.id, session?.id ?? null, { mirror: room.mirror, version: room.frame?.version });
  return <section className="ctl-screen is-preview" aria-labelledby="ctl-preview-title">
    <div className="ctl-screen-head">
      <StepChip state="preview" compact />
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

// A running image loop, live or as Home (LP-1): which image is up and when the next comes, from the room's clock.
function LoopLine({ room }: { room: Room }) {
  const show = imageShowFor(room.frame), [now, setNow] = useState(() => serverNow());
  const running = Boolean(show && show.images.length > 1 && show.seconds);
  useEffect(() => { if (!running) return; const t = setInterval(() => setNow(serverNow()), 500); return () => clearInterval(t); }, [running]);
  if (!show || !show.seconds) return null;
  const home = room.frame?.state.tv_content === "holding" ? room.show.sessions.find(s => s.id === room.frame?.state.home?.session) : null;
  const next = loopNextIn(show, now);
  return <div className="ctl-loop-line" data-loop-line>
    <span><Repeat size={15} aria-hidden="true" />{home ? `Home: ${home.title}` : "Image loop"}</span>
    <span className="show-muted">{show.images.length > 1 ? `Image ${loopIndex(show, now) + 1} of ${show.images.length}${next ? ` · next in ${next}s` : ""}` : "1 image"}</span>
  </div>;
}

// Live: what the TV has confirmed it shows, kept smaller as a confidence monitor; the TV itself is in the room.
function LiveScreen({ room, flashing }: { room: Room; flashing: boolean }) {
  const { frame, current } = room;
  const content = frame?.state.tv_content ?? "holding";
  return <section className="ctl-screen is-live ctl-tv" aria-labelledby="ctl-live-title">
    <div className="ctl-screen-head">
      <StepChip state="live" compact />
      <h2 id="ctl-live-title" className="ctl-screen-title">{current ? current.title : screenNames[content] ?? "Home screen"}</h2>
    </div>
    <div className={`ctl-screen-frame ctl-live-monitor${flashing ? " is-flashing" : ""}`}><TvMirror frame={room.mirror} /></div>
    <LoopLine room={room} />
  </section>;
}
