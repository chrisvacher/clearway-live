"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import type { PhoneInputProps } from "@/components/interactions/phone-inputs";
import { dateLabel, flagsOf, goalsForm, goalsResults, needs, pressMessages, type GoalFields, type GoalsForm } from "@/lib/interactions/goals";
import "./goals.css";

// INT-15 on the phone (pass 4 CoreGoalBuilder): the outcome and its 3-year Vision bullets, the
// goals so far with what each still needs, and a form to propose one. A goal needs a title;
// the owner, the result, the end date and the risk it answers can follow, and the goal stays
// flagged on the screen until all four CORE letters are met. The owner comes from the people in
// the room, or is a person added by name and email. The end date offers the next season ends.
export function GoalsInput(props: PhoneInputProps) { return <GoalsStep key={props.step.id} {...props} />; }

type Draft = { title: string; result: string; owner: string; name: string; email: string; end: string; risks: string[] };
const blank = (form: GoalsForm | null): Draft => ({ title: "", result: "", owner: "", name: "", email: "", end: form?.season_ends[0]?.date ?? "", risks: [] });
const someone = "other";

function GoalsStep({ step, open, engagement, frame }: PhoneInputProps) {
  const [form, setForm] = useState<GoalsForm | null>(null), [problem, setProblem] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => blank(null)), [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [sent, setSent] = useState(false);
  const pressId = useRef<string>(crypto.randomUUID());
  const results = goalsResults(frame?.state.results), required = results.risk_links === "required";
  const load = useCallback(async () => {
    if (!engagement) return;
    try {
      const r = await fetch(`/api/live/${engagement}/goal?session=${step.id}`, { cache: "no-store" });
      const out = goalsForm(await r.json().catch(() => null));
      if (out) { setForm(out); setProblem(false); setDraft(d => d.end ? d : { ...d, end: out.season_ends[0]?.date ?? "" }); } else setProblem(true);
    } catch { setProblem(true); }
  }, [engagement, step.id]);
  // The people and risks change as the room does; follow the outcome on show.
  useEffect(() => { void load(); }, [load, results.outcome?.id, results.total]);
  const set = (patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch }));
  const ownerFields = (): GoalFields["owner"] | undefined => {
    if (!draft.owner) return undefined;
    return draft.owner === someone ? { name: draft.name.trim(), email: draft.email.trim() } : { attendee: draft.owner };
  };
  const valid = draft.title.trim().length > 0 && (draft.owner !== someone || (draft.name.trim().length > 0 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email.trim())));
  async function submit() {
    if (!open || !valid || busy) return;
    setBusy(true); setMessage(""); setSent(false);
    const owner = ownerFields();
    const fields: GoalFields = { title: draft.title.trim(), result: draft.result.trim(), ...(owner ? { owner } : editing ? { owner: null } : {}), end_date: draft.end || null, risks: draft.risks };
    try {
      const r = await fetch(`/api/live/${engagement}/goal`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pressId.current, session: step.id, ...(editing ? { goal: editing } : {}), fields }) });
      const out = await r.json().catch(() => ({ status: "unavailable" })) as { status: string };
      if (["accepted", "duplicate"].includes(out.status)) {
        pressId.current = crypto.randomUUID(); setDraft(blank(form)); setEditing(null); setSent(true); void load();
      } else setMessage(out.status === "limit" ? "That’s six goals from you for this outcome. Ask the facilitator to add more." : pressMessages[out.status] ?? pressMessages.unavailable);
    } catch { setMessage(pressMessages.unavailable); } finally { setBusy(false); }
  }
  function edit(id: string) {
    const g = results.goals.find(x => x.id === id); if (!g) return;
    setEditing(id); setSent(false);
    setDraft({ title: g.title, result: g.result, owner: "", name: "", email: "", end: g.end_date || (form?.season_ends[0]?.date ?? ""), risks: [] });
  }
  const mine = new Set(form?.mine ?? []);
  return <div className="gl-ph">
    <section className="gl-ph-vision" aria-label="3-year Vision">
      <p className="ph-muted">{results.outcome ? `Outcome ${results.outcome.number} of ${results.outcome.of}` : "Outcome"}</p>
      <h3>{results.outcome?.title ?? "No outcome yet"}</h3>
      {results.bullets.length > 0 && <ul>{results.bullets.map(b => <li key={b}>{b}</li>)}</ul>}
    </section>
    <section aria-label="Goals so far">
      <h4>1-year goals</h4>
      {results.goals.length ? <ul className="gl-ph-goals">{results.goals.map(g => { const flags = flagsOf(g); return <li key={g.id} className={flags.length ? "is-flagged" : ""}>
        <strong>{g.title}</strong>
        <span className="gl-ph-letters" aria-label={flags.length ? `Needs: ${flags.map(f => needs[f]).join(", ")}` : "All four CORE letters met"}>{(["C", "O", "R", "E"] as const).map(l => <i key={l} className={g.letters[l] ? "" : "is-missing"}>{l}</i>)}</span>
        {flags.length > 0 && <small>{flags.map(f => needs[f]).join(" · ")}</small>}
        {g.end_date && <small>Ends {dateLabel(g.end_date)}</small>}
        {open && mine.has(g.id) && <button type="button" className="ph-secondary" onClick={() => edit(g.id)}>Change my goal</button>}
      </li>; })}</ul> : <p className="ph-text">No goals yet. Propose the first one.</p>}
    </section>
    {open ? <form className="gl-ph-form" onSubmit={e => { e.preventDefault(); void submit(); }} aria-label={editing ? "Change your goal" : "Propose a goal"}>
      <h4>{editing ? "Change your goal" : "Propose a goal"}</h4>
      <label>Goal<input className="ph-input" maxLength={200} value={draft.title} onChange={e => set({ title: e.target.value })} placeholder="What will we do?" /></label>
      <label>Result<textarea className="ph-input" rows={2} maxLength={400} value={draft.result} onChange={e => set({ result: e.target.value })} placeholder="What will be true when it’s done?" /></label>
      <label>Owner
        <select className="ph-input" value={draft.owner} onChange={e => set({ owner: e.target.value })}>
          <option value="">Not decided yet</option>
          {(form?.people ?? []).map(p => <option key={p.id} value={p.id}>{p.name}{p.id === form?.me ? " (me)" : ""}</option>)}
          <option value={someone}>Someone who isn’t here</option>
        </select></label>
      {draft.owner === someone && <div className="gl-ph-pair">
        <label>Their name<input className="ph-input" maxLength={200} value={draft.name} onChange={e => set({ name: e.target.value })} autoComplete="off" /></label>
        <label>Their email<input className="ph-input" type="email" inputMode="email" maxLength={254} value={draft.email} onChange={e => set({ email: e.target.value })} autoComplete="off" /></label></div>}
      <fieldset className="gl-ph-seasons"><legend>End date</legend>
        <div role="radiogroup" aria-label="End date">{(form?.season_ends ?? []).map(s => <button key={s.date} type="button" role="radio" aria-checked={draft.end === s.date} className={draft.end === s.date ? "is-on" : ""} onClick={() => set({ end: s.date })}>{s.label}<small>{dateLabel(s.date)}</small></button>)}
          <button type="button" role="radio" aria-checked={draft.end === ""} className={draft.end === "" ? "is-on" : ""} onClick={() => set({ end: "" })}>Not decided yet</button></div></fieldset>
      {(form?.risks.length ?? 0) > 0 && <fieldset className="gl-ph-risks"><legend>{required ? "The risk this answers" : "The risk this answers (you can add it later)"}</legend>
        {form!.risks.map(r => <label key={r.id} className="gl-ph-check"><input type="checkbox" checked={draft.risks.includes(r.id)} onChange={e => set({ risks: e.target.checked ? [...draft.risks, r.id].slice(0, 6) : draft.risks.filter(x => x !== r.id) })} />Risk {r.n}: {r.text}</label>)}</fieldset>}
      {message && <p className="ph-error" role="alert">{message}</p>}
      {sent && <p className="ph-note" role="status"><Check size={14} aria-hidden="true" />Your goal is on the screen.</p>}
      <div className="ph-actions">
        {editing && <button type="button" className="ph-secondary" onClick={() => { setEditing(null); setDraft(blank(form)); }}>Cancel</button>}
        <button type="submit" className="ph-send" disabled={!valid || busy}><Plus size={18} aria-hidden="true" />{editing ? "Save my goal" : "Add this goal"}</button></div>
      {problem && <p className="ph-note">The form didn’t load. Check your connection.</p>}
    </form> : <p className="ph-text">Goals are closed for now.</p>}
  </div>;
}
