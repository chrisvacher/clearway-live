"use client";
import { useRef, useState } from "react";
import { Check, Merge, Pencil, Plus } from "lucide-react";
import type { PhoneInputProps } from "@/components/interactions/phone-inputs";
import { PointsInput } from "@/components/interactions/bars/phone-bars";
import { candidatesOf, nameMax, pointsOptions, pressMessages, type Candidate } from "@/lib/interactions/candidates";
import "./candidates.css";

// D1-08 on the phone (pass 4): while the candidates are on the TV, each one can be renamed or merged
// into another, and a new one can be suggested. A suggestion goes to the facilitator, who accepts it
// with one tap; nothing here changes the screen. Then the 100 points, with the same faders as INT-07.
export function CandidatesInput(props: PhoneInputProps) {
  const data = candidatesOf(props.frame?.state.results);
  if (data.phase === "points") return <PointsInput {...props} key={data.candidates.map(c => c.id).join()} step={{ ...props.step, options: pointsOptions(data.candidates) }} />;
  if (data.phase === "review" || !data.candidates.length) return <p className="ph-text" role="status">The facilitator is getting the candidates ready. They will show here and on the screen.</p>;
  if (data.phase === "marked") return <div className="cd-ph"><h4>Provisional Vision Outcomes</h4>
    <ul className="cd-ph-list">{data.candidates.map(c => <li key={c.id} className="cd-ph-row"><span className="cd-num">{c.num}</span><span>{c.name}</span><span /></li>)}</ul></div>;
  return <Suggest {...props} candidates={data.candidates} />;
}

type Mode = { kind: "rename" | "merge"; candidate: Candidate } | { kind: "add" } | null;
function Suggest({ step, open, engagement, candidates }: PhoneInputProps & { candidates: Candidate[] }) {
  const [mode, setMode] = useState<Mode>(null), [text, setText] = useState(""), [into, setInto] = useState(""), [busy, setBusy] = useState(false), [note, setNote] = useState(""), [done, setDone] = useState("");
  const pressId = useRef(crypto.randomUUID());
  const start = (m: Mode) => { setMode(m); setNote(""); setDone(""); setText(m?.kind === "rename" ? m.candidate.name : ""); setInto(""); };
  const valid = mode?.kind === "merge" ? Boolean(into) : text.trim().length > 0 && (mode?.kind !== "rename" || text.trim() !== mode.candidate.name);
  async function submit() {
    if (!mode || !engagement || !open || !valid || busy) return;
    setBusy(true); setNote("");
    const body = mode.kind === "add" ? { kind: "add", text: text.trim() } : mode.kind === "rename" ? { kind: "rename", candidate: mode.candidate.id, text: text.trim() } : { kind: "merge", candidate: mode.candidate.id, into, ...(text.trim() ? { text: text.trim() } : {}) };
    try {
      const r = await fetch(`/api/live/${engagement}/candidate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: pressId.current, session: step.id, ...body }) });
      const out = await r.json().catch(() => ({ status: "unavailable" })) as { status: string };
      if (["accepted", "duplicate"].includes(out.status)) { pressId.current = crypto.randomUUID(); setMode(null); setText(""); setDone("Sent to the facilitator."); }
      else setNote(out.status === "exists" ? "You or someone else already suggested that." : pressMessages[out.status] ?? pressMessages.unavailable);
    } catch { setNote(pressMessages.unavailable); } finally { setBusy(false); }
  }
  return <div className="cd-ph">
    <ul className="cd-ph-list" aria-label="Candidate priorities">{candidates.map(c => <li key={c.id} className="cd-ph-row">
      <span className="cd-num">{c.num}</span><span>{c.name}</span>
      {open && <span className="cd-ph-actions">
        <button type="button" aria-label={`Rename ${c.name}`} onClick={() => start({ kind: "rename", candidate: c })}><Pencil size={18} aria-hidden="true" /></button>
        <button type="button" aria-label={`Merge ${c.name} into another`} onClick={() => start({ kind: "merge", candidate: c })}><Merge size={18} aria-hidden="true" /></button></span>}
    </li>)}</ul>
    {done && <p className="ph-note" role="status"><Check size={14} aria-hidden="true" />{done}</p>}
    {open && !mode && <button type="button" className="ph-secondary" onClick={() => start({ kind: "add" })}><Plus size={18} aria-hidden="true" />Suggest a new one</button>}
    {open && mode && <form className="cd-ph-form" onSubmit={e => { e.preventDefault(); void submit(); }} aria-label={mode.kind === "add" ? "Suggest a new candidate" : mode.kind === "rename" ? "Rename a candidate" : "Merge a candidate"}>
      <h4>{mode.kind === "add" ? "Suggest a new one" : mode.kind === "rename" ? `Rename “${mode.candidate.name}”` : `Merge “${mode.candidate.name}” into`}</h4>
      {mode.kind === "merge" && <fieldset className="cd-ph-merge"><legend className="ph-muted">Choose the one to join</legend>
        {candidates.filter(c => c.id !== mode.candidate.id).map(c => <label key={c.id}><input type="radio" name="into" value={c.id} checked={into === c.id} onChange={() => setInto(c.id)} /> {c.num}. {c.name}</label>)}</fieldset>}
      <label>{mode.kind === "merge" ? "New name, if it needs one" : "Name"}<input className="ph-input" maxLength={nameMax} value={text} onChange={e => setText(e.target.value)} placeholder={mode.kind === "add" ? "A priority we are missing" : "A few plain words"} /></label>
      {note && <p className="ph-error" role="alert">{note}</p>}
      <button type="submit" className="ph-send" disabled={!valid || busy}>{mode.kind === "rename" ? "Suggest this name" : mode.kind === "merge" ? "Suggest merging" : "Suggest this one"}</button>
      <button type="button" className="ph-secondary" onClick={() => start(null)}>Cancel</button>
    </form>}
    {!open && <p className="ph-text">The step is closed for suggestions.</p>}
  </div>;
}
