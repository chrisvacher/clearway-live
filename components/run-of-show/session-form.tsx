"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, LockKeyhole, Trash2, X } from "lucide-react";
import { localTime, zonedInstant } from "@/lib/setup/policy";
import { fillYears } from "@/lib/run-of-show/policy";
import { defaultWindow, readyState } from "@/lib/run-of-show/builder";
import { parts, type SessionInput, type ShowContext, type ShowSession } from "@/lib/run-of-show/types";
import { contentOf, fallbackKinds, type InteractionKind, type KindInfo } from "@/lib/interactions/kinds";
import { kindDefaults, optionEditors } from "@/components/interactions/option-editors";
import { contentPromptLabel } from "./content-options";

// The builder (SET-07) opens this form in place, in the run ("inline"): Done saves, Remove
// takes the session out, and unsaved edits survive the options sliding closed (draft).
export type FormDraft = { value: ShowSession; start: string; opens: string; closes: string };
type Props = { session: ShowSession; fresh: boolean; context: ShowContext; busy: boolean; blocked: boolean; feedback: string; failed: boolean; onSave: (v: SessionInput) => Promise<void>; onClose: () => void; onRemove: () => void;
  variant?: "panel" | "inline"; revision?: number | null; draft?: FormDraft; onDraft?: (draft: FormDraft, dirty: boolean) => void; startNote?: string; others?: ShowSession[]; fourLists?: boolean };
export function SessionForm({ session, fresh, context, busy, blocked, feedback, failed, onSave, onClose, onRemove, variant = "panel", revision, draft, onDraft, startNote, others = [], fourLists = true }: Props) {
  const inline = variant === "inline";
  const [value, setValue] = useState(() => draft?.value ?? session);
  const [start, setStart] = useState(() => draft?.start ?? localTime(session.planned_start, context.timezone));
  const [opens, setOpens] = useState(() => draft?.opens ?? localTime(session.opens_at, context.timezone));
  const [closes, setCloses] = useState(() => draft?.closes ?? localTime(session.closes_at, context.timezone));
  const [timeError, setTimeError] = useState("");
  const [teamLed, setTeamLed] = useState(Boolean(session.team_led));
  const [teamLedNote, setTeamLedNote] = useState("");
  const first = useRef<HTMLInputElement>(null), panel = useRef<HTMLElement>(null);
  useEffect(() => { first.current?.focus({ preventScroll: true }); if (!inline && window.matchMedia("(max-width: 900px)").matches) panel.current?.scrollIntoView({ block: "start" }); }, [inline]);
  const dirty = JSON.stringify(value) !== JSON.stringify(session) || start !== localTime(session.planned_start, context.timezone) || opens !== localTime(session.opens_at, context.timezone) || closes !== localTime(session.closes_at, context.timezone);
  const report = useRef(onDraft); report.current = onDraft;
  useEffect(() => { report.current?.({ value, start, opens, closes }, dirty); }, [value, start, opens, closes, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const close = () => { if (!dirty || window.confirm("Discard your unsaved edits?")) onClose(); };
  const change = <K extends keyof ShowSession>(key: K, v: ShowSession[K]) => setValue(previous => ({ ...previous, [key]: v }));
  const setting = <K extends keyof ShowSession["settings"]>(key: K, v: ShowSession["settings"][K]) => change("settings", { ...value.settings, [key]: v });
 const seedable = others.filter(s => s.id !== session.id && s.interaction === value.interaction && s.seeded_from !== session.id);
  const running = !["draft", "ready"].includes(session.state);
  // Remove is offered for every step that is not on air (a closed step too: the database refuses only the current, live, open or phones-down
  // one). A step that has been on air asks first, here in the panel: a browser's own confirm box is dismissed by some browsers and
  // tools without a word, which left Remove looking dead.
  const onAir = ["live", "open", "phones_down"].includes(session.state), canRemove = !onAir && !context.closed;
  const [asking, setAsking] = useState(false);
  const askRemove = () => { if (session.state === "draft") onRemove(); else setAsking(true); };
  const removeBox = (cls: string) => <span className={cls} role="alert" data-remove-confirm>Remove {session.title} from the run of show?{" "}
    <button className="show-button is-small" type="button" disabled={busy || blocked} onClick={() => { setAsking(false); onRemove(); }}>Remove session</button>{" "}
    <button className="show-button is-small" type="button" onClick={() => setAsking(false)}>Keep it</button></span>;
  // The kinds this server can run, in the library's order. A session keeps its own kind.
  const kinds: KindInfo[] = context.kinds?.length ? context.kinds : Object.values(fallbackKinds);
  const kind = kinds.find(k => k.kind === value.interaction) ?? fallbackKinds[value.interaction] ?? null;
  const Editor = optionEditors[value.interaction];
  const text = value.interaction === "word_cloud" || value.interaction === "wall";
  const choose = (next: InteractionKind) => {
    const info = kinds.find(k => k.kind === next), defaults = kindDefaults[next] ?? {};
    setValue(v => ({ ...v, interaction: next, options: {}, ...defaults,
      settings: { ...v.settings, anonymous: info?.named === "always" ? false : info?.named === "never" ? true : v.settings.anonymous } }));
  };
  // The team-led flag saves on its own, at once, so the scribe console follows the run of show without waiting for Done.
  async function changeTeamLed(next: boolean) {
    setTeamLed(next); setTeamLedNote("");
    try {
      const response = await fetch(`/api/run-of-show/${context.id}/team-led`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session: session.id, value: next }) });
      if (!response.ok) throw new Error("save");
      setTeamLedNote(next ? "The scribe console will be off for this step." : "The scribe console will be on for this step.");
    } catch { setTeamLed(!next); setTeamLedNote("That didn’t save. Try again."); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setTimeError("");
    // Inline, Done marks the session Ready and Save as draft keeps it a Draft.
    const intent = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
    // A Scripture, Headline or Image step with no words or image stays a Draft (docs/templates.md).
    const wanted = inline && !running && (intent === "ready" || intent === "draft") ? intent : value.state;
    const state = running ? wanted : readyState(value, wanted) as ShowSession["state"];
    try {
      const instant = (v: string) => { try { return zonedInstant(v, context.timezone); } catch { throw new Error("Check the session times. During a daylight saving clock change, choose a different time."); } };
      await onSave({ ...value, state, revision: fresh ? null : revision !== undefined ? revision : session.revision, planned_start: instant(start), opens_at: instant(opens), closes_at: instant(closes) });
    } catch (error) { setTimeError(error instanceof Error ? error.message : "Check the session details."); }
  }
  const Wrap = inline ? "div" : "aside";
  return <Wrap ref={panel as never} className={inline ? "show-panel is-inline" : "show-panel"} aria-labelledby={inline ? undefined : "session-editor-title"} aria-label={inline ? `Options for ${session.title}` : undefined}>
    {!inline && <><div className="show-private"><LockKeyhole size={15} aria-hidden="true" />Only you see this</div>
    <div className="show-panel-head"><h2 id="session-editor-title">{fresh ? "Add session" : "Edit session"}</h2><button className="show-button is-icon" aria-label="Close session editor" disabled={busy} onClick={close}><X size={20} aria-hidden="true" /></button></div></>}
    <form onSubmit={save} className="show-form">
      <fieldset disabled={busy || blocked || context.closed}>
        <div className="show-fields">
          <h3 className="is-full show-group">Basics</h3>
          <label className="is-full" htmlFor="session-title">Title<input ref={first} id="session-title" required maxLength={200} value={value.title} onChange={e => change("title", e.target.value)} /></label>
          <label className="is-full" htmlFor="session-segment">Segment<input id="session-segment" maxLength={100} value={value.segment ?? ""} onChange={e => change("segment", e.target.value)} /><span className="show-help">Steps in the same segment, like Five Lenses, keep taking answers until the room moves on from the segment.</span></label>
          <label htmlFor="session-section">Section<input id="session-section" maxLength={100} list="session-sections" value={value.section ?? ""} onChange={e => change("section", e.target.value)} />
            <datalist id="session-sections">{[...new Set(others.filter(s => s.part === value.part).map(s => (s.section ?? "").trim()).filter(Boolean))].map(name => <option key={name} value={name} />)}</datalist>
            <span className="show-help">The named group it sits in on the run of show. Leave it empty for none.</span></label>
          <label htmlFor="session-part">Part<select id="session-part" value={value.part} onChange={e => change("part", e.target.value as ShowSession["part"])}>{parts.filter(part => part !== "Discover" || fourLists || session.part === "Discover").map(part => <option key={part}>{part}</option>)}</select></label>
          <label htmlFor="session-mode">Mode<select id="session-mode" disabled={running} value={value.mode} onChange={e => { const mode = e.target.value as ShowSession["mode"]; change("mode", mode); if (mode === "self_paced" && !opens && !closes) { const w = defaultWindow(Date.now()); setOpens(localTime(w.opens_at, context.timezone)); setCloses(localTime(w.closes_at, context.timezone)); } }}><option value="live">Live, in the room</option><option value="self_paced">Self-paced</option></select></label>
          {startNote !== undefined ? <p className="show-help" id="session-start">{startNote}</p> : <label htmlFor="session-start">Planned start<input id="session-start" type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label>}
          <label htmlFor="session-length">Length in minutes<input id="session-length" type="number" min={1} max={1440} required value={value.planned_minutes} onChange={e => change("planned_minutes", Number(e.target.value))} /></label>
          <p className="show-help is-full">All times in {context.timezone}. Planned times stay private.</p>
          {value.mode === "self_paced" && <><label htmlFor="session-opens">Opens<input id="session-opens" type="datetime-local" required value={opens} onChange={e => setOpens(e.target.value)} /></label><label htmlFor="session-closes">Closes<input id="session-closes" type="datetime-local" required value={closes} onChange={e => setCloses(e.target.value)} /></label><p className="show-help is-full">It opens and closes on phones at these times, outside the live room. Next and Back skip it, and invite emails link to it.</p></>}
          <h3 className="is-full show-group">On the TV and phones</h3>
          <label className="is-full" htmlFor="session-interaction">Interaction<select id="session-interaction" disabled={running} value={value.interaction} onChange={e => choose(e.target.value as InteractionKind)}>
            {kinds.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
            {!kinds.some(k => k.kind === value.interaction) && <option value={value.interaction}>{value.interaction}</option>}</select></label>
          {seedable.length > 0 && <label className="is-full" htmlFor="session-seeded">Seeded from<select id="session-seeded" value={value.seeded_from ?? ""} onChange={e => change("seeded_from", e.target.value || null)}>
            <option value="">Nothing, start empty</option>{seedable.map(s => <option key={s.id} value={s.id}>{s.part}: {s.title}</option>)}</select>
            <span className="show-help">Starts this step from the earlier step’s answers, so the room does not begin from nothing.</span></label>}
          {Editor && <Editor session={session} value={value.options ?? {}} context={context} fresh={fresh} locked={busy || blocked || context.closed} onChange={options => change("options", options)} setPrompt={prompt => change("prompt", prompt)} />}
          <label className="is-full" htmlFor="session-prompt">{value.interaction === "content" ? contentPromptLabel[contentOf(value.options).screen] : "Prompt on the TV and phones"}<textarea id="session-prompt" maxLength={4000} rows={4} value={value.prompt} onChange={e => change("prompt", e.target.value)} /></label>
          <p className="show-help is-full">Use {"{base year + 10}"}, {"{base year + 3}"} or {"{base year + 1}"} to fill in the year.</p>
          {value.prompt.includes("{base year") && <div className="show-preview is-full"><span className="show-help">Prompt preview</span><p>{fillYears(value.prompt, context.base_year)}</p></div>}
          <label className="is-full" htmlFor="session-depth">Phone depth<textarea id="session-depth" maxLength={20000} rows={4} value={value.phone_depth} onChange={e => change("phone_depth", e.target.value)} /><span className="show-help">Detail, sources or Scripture for phones only.</span></label>
          {kind?.input && <>
            <h3 className="is-full show-group">Settings and limits</h3>
            {kind.named === "setting" ? <label className="show-check is-full" htmlFor="session-anonymous"><input id="session-anonymous" type="checkbox" checked={value.settings.anonymous} onChange={e => setting("anonymous", e.target.checked)} />Anonymous on the screen</label>
              : <p className="show-help is-full">{kind.named === "always" ? "Named by design: names show on the screen." : "Answers are anonymous on the screen."}</p>}
            <label className="show-check is-full" htmlFor="session-join"><input id="session-join" type="checkbox" checked={value.settings.join_strip} onChange={e => setting("join_strip", e.target.checked)} />Show the join strip on the TV</label>
            <label htmlFor="session-burst">Burst length<select id="session-burst" value={value.settings.burst_minutes} onChange={e => setting("burst_minutes", Number(e.target.value))}>{[3, 4, 5].map(n => <option key={n} value={n}>{n} minutes</option>)}</select></label>
            {!kind.one_per_person && <label htmlFor="session-sends">Answers per person<input id="session-sends" type="number" min={1} max={100} required value={value.max_sends} onChange={e => change("max_sends", Number(e.target.value))} /></label>}
            {text && <><label htmlFor="session-characters">Characters per answer<input id="session-characters" type="number" min={1} max={280} required value={value.max_characters} onChange={e => change("max_characters", Number(e.target.value))} /></label>
              <label htmlFor="session-words">Words per answer<input id="session-words" type="number" min={1} max={50} required value={value.max_words} onChange={e => change("max_words", Number(e.target.value))} /></label></>}
          </>}
          <h3 className="is-full show-group">Your notes</h3>
          <label className="is-full" htmlFor="session-notes"><span><LockKeyhole size={15} aria-hidden="true" /> Presenter notes</span><textarea id="session-notes" maxLength={30000} rows={5} value={value.notes} onChange={e => change("notes", e.target.value)} /><span className="show-help">Only facilitators see these. They never reach the TV or phones.</span></label>
          <label className="is-full" htmlFor="session-lands">Lands in<input id="session-lands" maxLength={200} value={value.lands_in} onChange={e => change("lands_in", e.target.value)} /></label>
          {!fresh && <label className="show-check is-full" htmlFor="session-team-led"><input id="session-team-led" type="checkbox" checked={teamLed} disabled={context.closed} onChange={e => void changeTeamLed(e.target.checked)} />Team-led step: turn the scribe console off while this step is live{teamLedNote && <span className="show-help" role="status"> {teamLedNote}</span>}</label>}
          {!inline && <label className="is-full" htmlFor="session-state">State<select id="session-state" disabled={running} value={value.state} onChange={e => change("state", e.target.value)}>{running ? <option value={session.state}>{session.state.replaceAll("_", " ")}</option> : <><option value="draft">Draft</option><option value="ready">Ready</option></>}</select></label>}
        </div>
      </fieldset>
      {inline ? <div className="show-panel-foot">{(timeError || feedback) && <p className={`show-panel-feedback${timeError || failed ? " is-error" : ""}`} role={timeError || failed ? "alert" : "status"}>{timeError || feedback}</p>}
        <span className="show-help">Every setting has a default. Finish now or come back later; edits go out when you press Done.</span>
        {dirty && <button className="show-button" type="button" disabled={busy} onClick={() => { setValue(session); setStart(localTime(session.planned_start, context.timezone)); setOpens(localTime(session.opens_at, context.timezone)); setCloses(localTime(session.closes_at, context.timezone)); }}>Discard changes</button>}
        {canRemove && (asking ? removeBox("show-help show-remove-ask") : <button className="show-button" type="button" disabled={busy || blocked} onClick={askRemove}><Trash2 size={16} aria-hidden="true" />Remove</button>)}
        {onAir && !context.closed && <span className="show-help" data-remove-note>This step is on air. Choose Nothing live in the live room, then remove it.</span>}
        {!running && <button className="show-button" type="submit" name="intent" value="draft" disabled={busy || blocked || context.closed}>Save as draft</button>}
        <button className="show-button is-primary" type="submit" name="intent" value="ready" disabled={busy || blocked || context.closed}><Check size={16} aria-hidden="true" />{busy ? "Saving..." : "Done"}</button></div>
      : <><div className="show-panel-foot">{(timeError || feedback) && <p className={`show-panel-feedback${timeError || failed ? " is-error" : ""}`} role={timeError || failed ? "alert" : "status"}>{timeError || feedback}</p>}<span className="show-help">Edits go out when you save.</span><button className="show-button" type="button" disabled={busy} onClick={close}>Cancel</button><button className="show-button is-primary" type="submit" disabled={busy || blocked || context.closed}>{busy ? "Saving..." : "Save"}</button></div>
      {!fresh && canRemove && (asking ? removeBox("show-remove show-remove-ask") : <button className="show-remove" type="button" disabled={busy || blocked} onClick={askRemove}>Remove session</button>)}
      {!fresh && onAir && !context.closed && <span className="show-help" data-remove-note>This step is on air. Choose Nothing live in the live room, then remove it.</span>}</>}
    </form>
  </Wrap>;
}
