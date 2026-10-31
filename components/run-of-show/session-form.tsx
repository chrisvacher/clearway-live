"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LockKeyhole, X } from "lucide-react";
import { localTime, zonedInstant } from "@/lib/setup/policy";
import { fillYears } from "@/lib/run-of-show/policy";
import { parts, type SessionInput, type ShowContext, type ShowSession } from "@/lib/run-of-show/types";

type Props = { session: ShowSession; fresh: boolean; context: ShowContext; busy: boolean; blocked: boolean; feedback: string; failed: boolean; onSave: (v: SessionInput) => Promise<void>; onClose: () => void; onRemove: () => void };
export function SessionForm({ session, fresh, context, busy, blocked, feedback, failed, onSave, onClose, onRemove }: Props) {
  const [value, setValue] = useState(session);
  const [start, setStart] = useState(() => localTime(session.planned_start, context.timezone));
  const [opens, setOpens] = useState(() => localTime(session.opens_at, context.timezone));
  const [closes, setCloses] = useState(() => localTime(session.closes_at, context.timezone));
  const [timeError, setTimeError] = useState("");
  const first = useRef<HTMLInputElement>(null), panel = useRef<HTMLElement>(null);
  useEffect(() => { first.current?.focus({ preventScroll: true }); if (window.matchMedia("(max-width: 900px)").matches) panel.current?.scrollIntoView({ block: "start" }); }, []);
  const dirty = JSON.stringify(value) !== JSON.stringify(session) || start !== localTime(session.planned_start, context.timezone) || opens !== localTime(session.opens_at, context.timezone) || closes !== localTime(session.closes_at, context.timezone);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const close = () => { if (!dirty || window.confirm("Discard your unsaved edits?")) onClose(); };
  const change = <K extends keyof ShowSession>(key: K, v: ShowSession[K]) => setValue(previous => ({ ...previous, [key]: v }));
  const setting = <K extends keyof ShowSession["settings"]>(key: K, v: ShowSession["settings"][K]) => change("settings", { ...value.settings, [key]: v });
  const running = !["draft", "ready"].includes(session.state);
  async function save(event: FormEvent) {
    event.preventDefault(); setTimeError("");
    try {
      const instant = (v: string) => { try { return zonedInstant(v, context.timezone); } catch { throw new Error("Check the session times. During a daylight saving clock change, choose a different time."); } };
      await onSave({ ...value, revision: fresh ? null : session.revision, planned_start: instant(start), opens_at: instant(opens), closes_at: instant(closes) });
    } catch (error) { setTimeError(error instanceof Error ? error.message : "Check the session details."); }
  }
  return <aside ref={panel} className="show-panel" aria-labelledby="session-editor-title">
    <div className="show-private"><LockKeyhole size={15} aria-hidden="true" />Only you see this</div>
    <div className="show-panel-head"><h2 id="session-editor-title">{fresh ? "Add session" : "Edit session"}</h2><button className="show-button is-icon" aria-label="Close session editor" disabled={busy} onClick={close}><X size={20} aria-hidden="true" /></button></div>
    <form onSubmit={save} className="show-form">
      <fieldset disabled={busy || blocked || context.closed}>
        <div className="show-fields">
          <label className="is-full" htmlFor="session-title">Title<input ref={first} id="session-title" required maxLength={200} value={value.title} onChange={e => change("title", e.target.value)} /></label>
          <label htmlFor="session-part">Part<select id="session-part" value={value.part} onChange={e => change("part", e.target.value as ShowSession["part"])}>{parts.map(part => <option key={part}>{part}</option>)}</select></label>
          <label htmlFor="session-mode">Mode<select id="session-mode" disabled={running} value={value.mode} onChange={e => change("mode", e.target.value as ShowSession["mode"])}><option value="live">Live, in the room</option><option value="self_paced">Self-paced</option></select></label>
          <label htmlFor="session-start">Planned start<input id="session-start" type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label>
          <label htmlFor="session-length">Length in minutes<input id="session-length" type="number" min={1} max={1440} required value={value.planned_minutes} onChange={e => change("planned_minutes", Number(e.target.value))} /></label>
          <p className="show-help is-full">All times in {context.timezone}. Planned times stay private.</p>
          {value.mode === "self_paced" && <><label htmlFor="session-opens">Opens<input id="session-opens" type="datetime-local" required value={opens} onChange={e => setOpens(e.target.value)} /></label><label htmlFor="session-closes">Closes<input id="session-closes" type="datetime-local" required value={closes} onChange={e => setCloses(e.target.value)} /></label><p className="show-help is-full">Self-paced times are saved here. Scheduled opening follows with the interaction library.</p></>}
          <label className="is-full" htmlFor="session-interaction">Interaction<select id="session-interaction" disabled={running} value={value.interaction} onChange={e => {
            const kind = e.target.value as ShowSession["interaction"]; setValue(v => ({ ...v, interaction: kind, max_characters: kind === "wall" ? 280 : 28, max_words: kind === "wall" ? 50 : 3 }));
          }}><option value="word_cloud">Word cloud</option><option value="wall">Open text wall</option><option value="content">Content screen</option></select></label>
          <label className="is-full" htmlFor="session-prompt">Prompt on the TV and phones<textarea id="session-prompt" maxLength={4000} rows={4} value={value.prompt} onChange={e => change("prompt", e.target.value)} /></label>
          <p className="show-help is-full">Use {"{base year + 10}"}, {"{base year + 3}"} or {"{base year + 1}"} to fill in the year.</p>
          {value.prompt.includes("{base year") && <div className="show-preview is-full"><span className="show-help">Prompt preview</span><p>{fillYears(value.prompt, context.base_year)}</p></div>}
          <label className="is-full" htmlFor="session-depth">Phone depth<textarea id="session-depth" maxLength={20000} rows={4} value={value.phone_depth} onChange={e => change("phone_depth", e.target.value)} /><span className="show-help">Detail, sources or Scripture for phones only.</span></label>
          <h3 className="is-full">Settings</h3>
          <p className="show-help is-full">Answers are anonymous on the screen. AI grouping arrives in milestone 3.</p>
          <label className="show-check is-full" htmlFor="session-join"><input id="session-join" type="checkbox" checked={value.settings.join_strip} onChange={e => setting("join_strip", e.target.checked)} />Show the join strip on the TV</label>
          <label htmlFor="session-burst">Burst length<select id="session-burst" value={value.settings.burst_minutes} onChange={e => setting("burst_minutes", Number(e.target.value))}>{[3, 4, 5].map(n => <option key={n} value={n}>{n} minutes</option>)}</select></label>
          <label htmlFor="session-sends">Answers per person<input id="session-sends" type="number" min={1} max={100} required value={value.max_sends} onChange={e => change("max_sends", Number(e.target.value))} /></label>
          <label htmlFor="session-characters">Characters per answer<input id="session-characters" type="number" min={1} max={280} required value={value.max_characters} onChange={e => change("max_characters", Number(e.target.value))} /></label>
          <label htmlFor="session-words">Words per answer<input id="session-words" type="number" min={1} max={50} required value={value.max_words} onChange={e => change("max_words", Number(e.target.value))} /></label>
          <label className="is-full" htmlFor="session-notes"><span><LockKeyhole size={15} aria-hidden="true" /> Presenter notes</span><textarea id="session-notes" maxLength={30000} rows={5} value={value.notes} onChange={e => change("notes", e.target.value)} /><span className="show-help">Only facilitators see these. They never reach the TV or phones.</span></label>
          <label className="is-full" htmlFor="session-lands">Lands in<input id="session-lands" maxLength={200} value={value.lands_in} onChange={e => change("lands_in", e.target.value)} /></label>
          <label className="is-full" htmlFor="session-state">State<select id="session-state" disabled={running} value={value.state} onChange={e => change("state", e.target.value)}>{running ? <option value={session.state}>{session.state.replaceAll("_", " ")}</option> : <><option value="draft">Draft</option><option value="ready">Ready</option></>}</select></label>
        </div>
      </fieldset>
      <div className="show-panel-foot">{(timeError || feedback) && <p className={`show-panel-feedback${timeError || failed ? " is-error" : ""}`} role={timeError || failed ? "alert" : "status"}>{timeError || feedback}</p>}<span className="show-help">Edits go out when you save.</span><button className="show-button" type="button" disabled={busy} onClick={close}>Cancel</button><button className="show-button is-primary" type="submit" disabled={busy || blocked || context.closed}>{busy ? "Saving..." : "Save"}</button></div>
      {!fresh && !running && !context.closed && <button className="show-remove" type="button" disabled={busy || blocked} onClick={() => { if (window.confirm(`Remove ${session.title} from the run of show?`)) onRemove(); }}>Remove session</button>}
    </form>
  </aside>;
}
