"use client";
import { useState } from "react";
import { Download, FlaskConical } from "lucide-react";
import type { useControlRoom } from "./use-control-room";
import { useSecondTap } from "./live-controls";
import { stateLabels } from "@/lib/control/policy";
import { rehearsalMessage, selfPacedState, windowLabel, type RehearsalAction } from "@/lib/run-of-show/self-paced";
import "./self-paced.css";

type Room = ReturnType<typeof useControlRoom>;
const selfLabels: Record<string, string> = { ...stateLabels, ready: "Opens later", open: "Open" };

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
        <span className="ctl-run-title"><strong>{s.title}</strong><small>{windowLabel({ ...s, mode: "self_paced" }, timezone, now)}</small></span>
        <span className="ctl-run-meta"><span className={`show-state is-${state}`}>{selfLabels[state] ?? state}</span>
          <span className="sp-meta">{s.answered} answered{s.interaction !== "content" && <a className="show-button is-small" href={`/api/control/${room.show.context.id}/export?session=${s.id}`} download aria-label={`Export answers for ${s.title}`}><Download size={14} aria-hidden="true" />CSV</a>}</span></span>
      </li>;
    })}</ol>
  </section>;
}

// Export the shown session's input as CSV, from the control surface (INT-09's Export answers).
export function ExportAnswers({ room }: { room: Room }) {
  const session = room.frame?.session;
  if (!session || session.interaction === "content") return null;
  return <a className="show-button is-small" href={`/api/control/${room.show.context.id}/export?session=${session.id}`} download><Download size={16} aria-hidden="true" />Export answers</a>;
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
      const response = await fetch(`/api/control/${engagement}/rehearsal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), action }) });
      const result = await response.json() as { status: string; answers?: number; sessions?: number; title?: string };
      const text = rehearsalMessage(result);
      setNote(text ? { text, error: !["ok", "duplicate", "unchanged"].includes(result.status) } : null);
    } catch { setNote({ text: rehearsalMessage({ status: "unavailable" }), error: true }); }
    finally { setBusy(null); room.refresh(); }
  }
  const when = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: room.show.context.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  return <div className="sp-rehearsal" data-rehearsing={on ? "on" : "off"}>
    {on ? <p className="ctl-banner is-warning" role="status"><FlaskConical size={18} aria-hidden="true" /><span><strong>Rehearsing.</strong> Answers from every phone are test answers until you end the rehearsal or clear them.</span></p>
      : <p className="ctl-notes">Rehearse this run of show here, then clear the test answers before the real session.</p>}
    <p className="ctl-label" aria-live="polite">{tests} test {tests === 1 ? "answer" : "answers"}</p>
    <div className="ctl-row">
      {on ? <button className="show-button is-small" disabled={Boolean(busy) || closed} onClick={() => void send("end")}>End rehearsal</button>
        : <button className="show-button is-small" disabled={Boolean(busy) || closed} onClick={() => void send("start")}>Start rehearsal</button>}
      <button className="show-button is-small sp-clear" disabled={Boolean(busy) || closed || live || (!tests && !on)} aria-describedby={live ? "sp-clear-why" : undefined}
        onClick={() => confirm.tap("clear", () => void send("clear"))}>{busy === "clear" ? "Clearing..." : confirm.armed === "clear" ? `Tap again to clear ${tests}` : "Clear test answers"}</button>
    </div>
    {live && <p id="sp-clear-why" className="show-help">Choose Nothing live first. Test answers can’t be cleared while a session is live.</p>}
    {note && <p className={`show-help${note.error ? " is-error" : ""}`} role={note.error ? "alert" : "status"}>{note.text}</p>}
    {rehearsal?.last_clear && <p className="show-help">Last cleared {when(rehearsal.last_clear.at)}{rehearsal.last_clear.by ? ` by ${rehearsal.last_clear.by}` : ""}: {rehearsal.last_clear.answers} test {rehearsal.last_clear.answers === 1 ? "answer" : "answers"}.</p>}
  </div>;
}
