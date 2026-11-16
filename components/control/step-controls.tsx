"use client";
import { useEffect } from "react";
import { ChevronLeft, ChevronRight, House, MonitorOff, Plus, QrCode, Send, Smartphone, Square, Sun, SunDim, EyeOff, Timer } from "lucide-react";
import { kindOf } from "@/lib/interactions/kinds";
import type { ShowContext, ShowSession } from "@/lib/run-of-show/types";
import type { TvScreen } from "@/lib/control/types";
import { MarkDecision } from "./mark-decision";
import { burstLeft, type Room } from "./live-controls";
import { AnswersToggle } from "./answers-toggle";

// The live room's centre column, in fixed bands (November 15, "Live room centre column" research): the screens, a pinned
// transport bar, the step controls in fixed slots, then the step panel. The screens and transport bar never move or
// change size from step to step; the step controls keep their slots and change only with the live step's kind.

const Key = ({ k }: { k: string }) => <kbd className="ctl-kbd" aria-hidden="true">{k}</kbd>;

// 3. The transport bar: Back, Go live with what&apos;s in preview, Next, then the screens the TV can show in place of a step.
const screenButtons: { screen: TvScreen; label: string; key: string; Icon: typeof House }[] = [
  { screen: "blackout", label: "Blackout", key: "B", Icon: MonitorOff },
  { screen: "join", label: "Join", key: "J", Icon: QrCode },
  { screen: "holding", label: "Home", key: "H", Icon: House },
];
export function Transport({ room, context, previewing, onGoLive }: { room: Room; context: ShowContext; previewing: ShowSession | null; onGoLive: (s: ShowSession) => void }) {
  const { frame, steps, pending, press } = room;
  const busy = Boolean(pending) || !frame || context.closed;
  const liveId = frame?.state.live_session_id ?? null, content = frame?.state.tv_content ?? "holding";
  const isLive = Boolean(previewing && liveId === previewing.id);
  const blocked = !previewing || busy || isLive || previewing.state === "draft";
  return <div className="ctl-transport" role="group" aria-label="Transport">
    <div className="ctl-steps">
      <button className="show-button ctl-tp-back" disabled={busy || !steps.back} onClick={() => void press("back")} title={steps.back?.title} aria-keyshortcuts="ArrowLeft"><ChevronLeft size={20} aria-hidden="true" />Back<Key k="←" /></button>
      <button type="button" className="ctl-take" disabled={blocked} onClick={() => previewing && onGoLive(previewing)} aria-keyshortcuts="Enter"
        aria-label={!previewing ? "Nothing in preview" : isLive ? `${previewing.title} is live` : `Go live: ${previewing.title}`}
        title={previewing?.state === "draft" ? "Mark this step ready in setup before it goes live" : undefined}>
        <Send size={20} aria-hidden="true" />{isLive ? "Live now" : "Go live"}<Key k="↵" /></button>
      <button className="show-button ctl-tp-next" disabled={busy || !steps.next} onClick={() => void press("next")} title={steps.next?.title} aria-keyshortcuts="ArrowRight">Next<ChevronRight size={20} aria-hidden="true" /><Key k="→" /></button>
    </div>
    <div className="ctl-screen-bar" role="group" aria-label="TV screen">
      {screenButtons.map(({ screen, label, key, Icon }) => {
        const on = !liveId && content === screen;
        return <button key={screen} type="button" className={`ctl-screen-btn is-${screen}`} aria-pressed={on} disabled={busy || on} aria-keyshortcuts={key}
          onClick={() => void press("tv_screen", { screen })}><Icon size={16} aria-hidden="true" />{label}<Key k={key} /></button>;
      })}
    </div>
  </div>;
}

// 4. The step controls: fixed slots (burst, phones, spotlight, hide, answers, mark a decision). A slot the step doesn't use
// stays empty, so each control is always in the same place.
export function StepControls({ room, minutes, setMinutes, onPanel, workshop }: { room: Room; minutes: 3 | 4 | 5; setMinutes: (n: 3 | 4 | 5) => void; onPanel: () => void; workshop: boolean }) {
  const { frame, pending, press } = room;
  const session = frame?.session, busy = Boolean(pending) || !frame;
  const burst = burstLeft(room), down = Boolean(frame?.state.phones_down), spotlit = frame?.state.spotlight_key;
  if (!session) return <div className="ctl-stepctl is-quiet"><p>Nothing live on the TV. Go live with what&apos;s in preview, or press Back to return to the last step.</p></div>;
  if (session.state === "closed") return <div className="ctl-stepctl is-quiet"><p>Answers for this step are stopped. Phones show it without taking answers.</p>
    <div className="ctl-slot is-answers"><AnswersToggle room={room} /></div></div>;
  if (session.interaction === "content") return <div className="ctl-stepctl is-quiet"><p>Reading along. Nothing to run on this screen.</p>
    {!workshop && <div className="ctl-slot is-decision"><MarkDecision room={room} variant="laptop" host="ctl-decision-host" /></div>}</div>;
  const spotlightKind = (kindOf(session)?.spotlight ?? "none") !== "none";
  return <div className="ctl-stepctl">
    <div className="ctl-slot is-burst">{burst
      ? <div className="ctl-burst-on" role="timer" aria-label={`Burst, ${burst.label} left`}><Timer size={18} aria-hidden="true" /><b>{burst.label}</b>
        <button className="show-button" disabled={busy} onClick={() => void press("extend_burst")}><Plus size={16} aria-hidden="true" />1 min</button>
        <button className="show-button" disabled={busy} onClick={() => void press("end_burst")}><Square size={16} aria-hidden="true" />End burst</button></div>
      : <div className="ctl-burst-off">
        <button className="show-button is-primary" disabled={busy} onClick={() => void press("start_burst", { minutes })} aria-keyshortcuts="3 4 5"><Timer size={18} aria-hidden="true" />Start burst</button>
        <div className="ctl-seg" role="radiogroup" aria-label="Burst length in minutes">{([3, 4, 5] as const).map(n => <button key={n} role="radio" aria-checked={minutes === n} aria-label={`${n} minutes`} onClick={() => setMinutes(n)}>{n}</button>)}</div></div>}
    </div>
    <div className="ctl-slot is-phones">{down
      ? <button className="show-button" disabled={busy} onClick={() => void press("open_phones")} aria-keyshortcuts="P"><Smartphone size={18} aria-hidden="true" />Open phones<Key k="P" /></button>
      : <button className="show-button" disabled={busy} onClick={() => void press("phones_down")} aria-keyshortcuts="P"><Smartphone size={18} aria-hidden="true" />Phones down<Key k="P" /></button>}</div>
    <div className="ctl-slot is-spotlight">{spotlightKind && (spotlit
      ? <button className="show-button" disabled={busy} onClick={() => void press("clear_spotlight")}><SunDim size={18} aria-hidden="true" />Clear spotlight</button>
      : <button className="show-button" disabled={busy} onClick={onPanel}><Sun size={18} aria-hidden="true" />Spotlight</button>)}</div>
    <div className="ctl-slot is-hide">{spotlightKind && <button className="show-button" disabled={busy} onClick={onPanel}><EyeOff size={18} aria-hidden="true" />Hide</button>}</div>
    <div className="ctl-slot is-answers"><AnswersToggle room={room} /></div>
    <div className="ctl-slot is-decision">{!workshop && <MarkDecision room={room} variant="laptop" host="ctl-decision-host" />}</div>
  </div>;
}

// Single keys for the transport bar and the step controls, so the facilitator can run the room without looking down.
// Off while typing, while a key is held, with a modifier, and on a focused button or link (Enter presses it as usual).
export function useRoomKeys({ room, previewing, onGoLive, minutes }: { room: Room; previewing: ShowSession | null; onGoLive: (s: ShowSession) => void; minutes: 3 | 4 | 5 }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='dialog'], [role='radiogroup']")) return;
      const frame = room.frame;
      if (!frame || room.pending || room.show.context.closed) return;
      const session = frame.session, liveId = frame.state.live_session_id, content = frame.state.tv_content;
      const input = Boolean(session && session.interaction !== "content" && session.state !== "closed");
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      let act: (() => void) | null = null;
      if (key === "ArrowRight" && room.steps.next) act = () => void room.press("next");
      else if (key === "ArrowLeft" && room.steps.back) act = () => void room.press("back");
      else if (key === "Enter" && !target?.closest("button, a, summary") && previewing && previewing.id !== liveId && previewing.state !== "draft") act = () => onGoLive(previewing);
      else if (key === "b" && !(!liveId && content === "blackout" && !room.steps.back)) act = () => void (!liveId && content === "blackout" ? room.press("back") : room.press("tv_screen", { screen: "blackout" }));
      else if (key === "j" && (liveId || content !== "join")) act = () => void room.press("tv_screen", { screen: "join" });
      else if (key === "h" && (liveId || content !== "holding")) act = () => void room.press("tv_screen", { screen: "holding" });
      else if (key === "p" && input) act = () => void room.press(frame.state.phones_down ? "open_phones" : "phones_down");
      else if ((key === "3" || key === "4" || key === "5") && input && !burstLeft(room)) act = () => void room.press("start_burst", { minutes: Number(key) as 3 | 4 | 5 });
      if (!act) return;
      e.preventDefault(); act();
    };
    // A mouse click leaves the button focused, and Enter would press it again (Preview, Next) instead of Go live. A click
    // with the mouse lets go of the run of show and transport buttons; keyboard presses keep their focus.
    const onClick = (e: MouseEvent) => {
      if (e.detail === 0) return;
      const button = e.target instanceof Element ? e.target.closest<HTMLButtonElement>(".ctl-run-actions button, .ctl-transport button, .ctl-stepctl button") : null;
      if (button && document.activeElement === button) button.blur();
    };
    window.addEventListener("keydown", onKey); window.addEventListener("click", onClick);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("click", onClick); };
  }, [room, previewing, onGoLive, minutes]);
}
