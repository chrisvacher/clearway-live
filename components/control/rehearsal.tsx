"use client";
import { useState } from "react";
import { Download, FlaskConical, RotateCcw } from "lucide-react";
import type { useControlRoom } from "./use-control-room";
import { useSecondTap } from "./live-controls";
import { stateLabels } from "@/lib/control/policy";
import { answerCount, canClearTests, clearedParts, freshMessage, joinParts, rehearsalMessage, testAnswersLabel, selfPacedState, windowLabel, type RehearsalAction, type RehearsalResult } from "@/lib/run-of-show/self-paced";
import { practiceId } from "@/lib/room/practice";
import { SeedCounts } from "@/components/interactions/lens/lens-panel";
import { pressId } from "@/lib/control/own-presses";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import "./self-paced.css";

type Room = ReturnType<typeof useControlRoom>;
const selfLabels: Record<string, string> = { ...stateLabels, ready: "Opens later", open: "Open", closed: "Closed" };

// Self-paced sessions in the run of show: open on phones between two times, outside the
// live room. Next and Back skip them; their state follows the clock, read on the server.
export function SelfPacedList({ room, timezone }: { room: Room; timezone: string }) {
  const list = room.status?.self_paced ?? [];
  if (!list.length) return null;
  const now = room.now + room.clockOffset;
  return <section className="ctl-part sp-list" aria-labelledby="sp-list-title">
    <h3 id="sp-list-title">Self-paced</h3>
    <ol className="ctl-run-list">{list.map(s => {
      const state = selfPacedState({ ...s, mode: "self_paced" }, now);
      return <li key={s.id} className={state === "open" ? "is-open" : ""}>
        <span className="ctl-time">{s.part}</span>
        <span className="ctl-run-title"><strong>{s.title}</strong><small>{windowLabel({ ...s, mode: "self_paced" }, timezone, now)}</small><small>{s.answered} answered</small></span>
        <span className="ctl-run-meta"><span className={`show-state is-${state}`}>{selfLabels[state] ?? state}</span>
          {s.interaction !== "content" && <a className="show-button is-small" href={`/api/control/${room.show.context.id}/export?session=${s.id}`} download aria-label={`Export answers for ${s.title}`}><Download size={14} aria-hidden="true" />CSV</a>}</span>
      </li>;
    })}</ol>
    {list.some(s => s.interaction === "lens") && <SeedCounts room={room} />}
  </section>;
}

// Export the shown session's input as CSV, from the control surface (INT-09's Export answers).
export function ExportAnswers({ room }: { room: Room }) {
  const session = room.frame?.session;
  if (!session || session.interaction === "content") return null;
  return <a className="show-button is-small" href={`/api/control/${room.show.context.id}/export?session=${session.id}`} download><Download size={16} aria-hidden="true" />Export answers</a>;
}

// Start fresh (November 16): after a rehearsal or a demo, the same engagement starts clean in two taps. Every answer, vote
// and AI or What We Heard state is deleted, every step goes back to Ready and the timer clears. The TV stays paired and
// phones stay signed in (they reload). Export answers sits beside it, first. Refused while a step is live. The practice
// room keeps Reset practice room.
export function StartFresh({ room }: { room: Room }) {
  const engagement = room.show.context.id, closed = room.show.context.closed;
  const [busy, setBusy] = useState(false), [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [asking, setAsking] = useState(false);
  if (engagement === practiceId) return null;
  const live = Boolean(room.frame?.state.live_session_id), total = room.status?.answers_total ?? null;
  async function fresh() {
    setBusy(true); setNote(null); setAsking(false);
    try {
      const response = await fetch(`/api/control/${engagement}/rehearsal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: pressId(), action: "fresh" }) });
      const result = await response.json() as RehearsalResult;
      setNote({ text: freshMessage(result), error: !["ok", "duplicate"].includes(result.status) });
    } catch { setNote({ text: freshMessage({ status: "unavailable" }), error: true }); }
    finally { setBusy(false); room.refresh(); }
  }
  return <div className="sp-fresh" data-testid="start-fresh-panel">
    <div className="ctl-danger-action">
      <div><strong>Start fresh</strong><p className="show-help">Deletes all answers and resets the steps.</p></div>
      <Button variant="danger" size="small" disabled={busy || closed || live} aria-describedby={live ? "sp-fresh-why" : undefined}
        data-testid="start-fresh" onClick={() => setAsking(true)}><RotateCcw size={16} aria-hidden="true" />{busy ? "Starting fresh" : "Start fresh"}</Button>
    </div>
    <a className="show-button is-small" href={`/api/control/${engagement}/export?session=all`} download data-testid="fresh-export"><Download size={16} aria-hidden="true" />Export answers</a>
    <ConfirmDialog open={asking} title="Start fresh?" confirmLabel="Start fresh" onCancel={() => setAsking(false)} onConfirm={() => void fresh()}
      description={<>This deletes every answer{total !== null ? ` (${answerCount(total)})` : ""}, puts the steps back to Ready, and clears the timer. The TV and phones stay connected. You can export the answers before starting fresh.</>} />
    {live && <p id="sp-fresh-why" className="show-help">Choose Home under the live screen first. The room can’t start fresh while a step is live.</p>}
    {note && <p className={`show-help${note.error ? " is-error" : ""}`} role={note.error ? "alert" : "status"}>{note.text}</p>}
  </div>;
}

// Rehearse a church's own run of show in its engagement, then clear it before the real
// session. Every answer made while a rehearsal runs is a test answer. Clearing removes them
// all, is logged, and is refused while a session is live.
export function RehearsalPanel({ room }: { room: Room }) {
  const engagement = room.show.context.id, rehearsal = room.status?.rehearsal;
  const [busy, setBusy] = useState<RehearsalAction | null>(null);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const confirm = useSecondTap();
  const live = Boolean(room.frame?.state.live_session_id), on = Boolean(rehearsal?.since), tests = rehearsal?.test_answers ?? 0;
  const closed = room.show.context.closed;
  async function send(action: RehearsalAction) {
    setBusy(action); setNote(null);
    try {
      const response = await fetch(`/api/control/${engagement}/rehearsal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: pressId(), action }) });
      const result = await response.json() as RehearsalResult;
      const text = rehearsalMessage(result);
      setNote(text ? { text, error: !["ok", "duplicate", "unchanged"].includes(result.status) } : null);
    } catch { setNote({ text: rehearsalMessage({ status: "unavailable" }), error: true }); }
    finally { setBusy(null); room.refresh(); }
  }
  const when = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: room.show.context.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  return <div className="sp-rehearsal" data-rehearsing={on ? "on" : "off"}>
    {on ? <p className="ctl-banner is-warning" role="status"><FlaskConical size={18} aria-hidden="true" /><span><strong>Rehearsing.</strong> Answers from every phone are test answers until you end the rehearsal or clear them.</span></p>
      : <p className="ctl-notes">Rehearse this run of show here, then clear the test answers before the real session.</p>}
    <p className="ctl-label" aria-live="polite">{testAnswersLabel(tests)}</p>
    <div className="ctl-row">
      {on ? <button className="show-button is-small" disabled={Boolean(busy) || closed} onClick={() => void send("end")}>End rehearsal</button>
        : <button className="show-button is-small" disabled={Boolean(busy) || closed} onClick={() => void send("start")}>Start rehearsal</button>}
      <button className="show-button is-small sp-clear" disabled={Boolean(busy) || closed || live || !canClearTests(tests, on)} aria-describedby={live ? "sp-clear-why" : undefined}
        onClick={() => confirm.tap("clear", () => void send("clear"))}>{busy === "clear" ? "Clearing..." : confirm.armed === "clear" ? `Tap again to clear ${testAnswersLabel(tests)}` : "Clear test answers"}</button>
    </div>
    {live && <p id="sp-clear-why" className="show-help">Choose Home under the live screen first. Test answers can’t be cleared while a session is live.</p>}
    {note && <p className={`show-help${note.error ? " is-error" : ""}`} role={note.error ? "alert" : "status"}>{note.text}</p>}
    {rehearsal?.last_clear && <p className="show-help">{rehearsal.last_clear.fresh ? "Started fresh" : "Last cleared"} {when(rehearsal.last_clear.at)}{rehearsal.last_clear.by ? ` by ${rehearsal.last_clear.by}` : ""}: {joinParts(clearedParts(rehearsal.last_clear)) || "0 test answers"}.</p>}
  </div>;
}
