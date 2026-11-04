"use client";
import "./outcomes.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, EyeOff, Gavel, Hand, Monitor, PencilLine, Save } from "lucide-react";
import type { ControlPanelProps } from "@/components/interactions/control-panels";
import { bulletsOf, rangeNote } from "@/lib/interactions/outcomes";

const Private = ({ title, children }: { title: string; children: React.ReactNode }) =>
  <section className="ctl-private oc-panel" aria-label={`${title}, only you see this`}><div className="show-private"><EyeOff size={16} aria-hidden="true" />Only you see this<span>{title}</span></div><div className="ctl-private-body">{children}</div></section>;

async function press(engagement: string, body: Record<string, unknown>) {
  const r = await fetch(`/api/control/${engagement}/outcomes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return await r.json().catch(() => ({})) as { status?: string; wait_ms?: number };
}
const failure = (status?: string) => status === "locked" ? "That bullet is being typed. Try again in a moment." : status === "filtered" ? "That wording was held back by the word filter." : status === "decided" ? "The room already decided that one." : "That didn’t go through. Try again.";

// D1-11: pick which Vision Outcome the TV shows, and fix a bullet's wording. A bullet someone is
// typing is locked to them for a moment (the server refuses and says so).
export function BulletsPanel({ room }: ControlPanelProps) {
  const engagement = room.show.context.id, session = room.frame?.session, live = session?.interaction === "bullets";
  const data = bulletsOf(live ? room.frame?.state.results : null);
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [edit, setEdit] = useState<{ id: string; text: string } | null>(null);
  if (!live) return null;
  async function run(body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try { const out = await press(engagement, { id: crypto.randomUUID(), kind: "bullets", ...body }); if (out.status !== "ok" && out.status !== "duplicate" && out.status !== "unchanged") setMessage(failure(out.status)); else if (body.action === "edit") setEdit(null); }
    catch { setMessage(failure()); } finally { setBusy(false); }
  }
  const current = data.current;
  return <Private title="Vision Outcomes">
    <p className="show-help">Choose the outcome the room is on. The screen changes at once. An outcome with no bullet is outlined on the screen until it has one.</p>
    <ul className="oc-phone-list" aria-label="Vision Outcomes">{data.outcomes.map(o => <li key={o.id} className="oc-phone-item">
      <span>{o.number}. {o.title} <b>{o.empty ? "No bullets" : `${o.count} ${o.count === 1 ? "bullet" : "bullets"}`}</b></span>
      <button className="show-button" disabled={busy || o.id === current?.id} onClick={() => void run({ action: "show", outcome: o.id })}><Monitor size={16} aria-hidden="true" />{o.id === current?.id ? "On the screen" : "Show on the screen"}</button></li>)}</ul>
    {current && current.bullets.filter(b => !b.typing).length > 0 && <>
      <p className="show-help">Fix a bullet&rsquo;s wording (a number or a name). The screen updates as you save.</p>
      <ul className="oc-phone-list" aria-label="Bullets">{current.bullets.filter(b => !b.typing).map(b => <li key={b.id} className="oc-phone-item">
        {edit?.id === b.id ? <>
          <input aria-label="Bullet wording" maxLength={280} value={edit.text} onChange={e => setEdit({ id: b.id, text: e.target.value })} />
          <button className="show-button is-primary" disabled={busy || !edit.text.trim()} onClick={() => void run({ action: "edit", bullet: b.id, text: edit.text })}><Save size={16} aria-hidden="true" />Save wording</button></>
          : <><span>{b.text}</span><button className="show-button" onClick={() => setEdit({ id: b.id, text: b.text })}><PencilLine size={16} aria-hidden="true" />Edit bullet</button></>}</li>)}</ul></>}
    {message && <p className="show-message is-error" role="alert">{message}</p>}
  </Private>;
}

type Reason = { c: string; text: string };
type Detail = { id: string; number: number; title: string; was: string | null; description: string; stop: string; status: string; c: number; r: number; x: number;
  challenged: boolean; reasons: Reason[]; renames: { name: string; count: number }[] };
type Confirm = { status: string; session: string | null; outcomes: Detail[]; range: { confirmed: number; note?: "fewer" | "more" | null }; provisional?: number };

function Card({ o, engagement, onDone }: { o: Detail; engagement: string; onDone: () => void }) {
  const [kind, setKind] = useState<"confirm" | "rename" | "remove">("confirm"), [name, setName] = useState(""), [why, setWhy] = useState("");
  const [descr, setDescr] = useState(o.description ?? ""), [stop, setStop] = useState(o.stop ?? ""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const decided = o.status !== "provisional", decide = useRef<string | null>(null), details = useRef<string | null>(null);
  async function run(body: Record<string, unknown>, ref: React.MutableRefObject<string | null>, done: string) {
    ref.current ??= crypto.randomUUID(); setBusy(true); setMessage("");
    try {
      const out = await press(engagement, { id: ref.current, kind: "confirm", outcome: o.id, ...body });
      if (out.status === "ok" || out.status === "duplicate") { ref.current = null; setMessage(done); onDone(); } else setMessage(failure(out.status));
    } catch { setMessage(failure()); } finally { setBusy(false); }
  }
  const dirty = descr !== (o.description ?? "") || stop !== (o.stop ?? "");
  return <li className={`oc-panel-row${o.challenged ? " is-challenged oc-lift" : ""}`}>
    <b>{o.number}. {o.title}</b>
    {o.was && <span className="show-help">Renamed from {o.was}</span>}
    <span>{o.c} confirm, {o.r} rename, {o.x} challenge. Counts show where the room is. They never decide.</span>
    {o.challenged && <span className="show-help"><Hand />Challenged. It is on the screen with a soft highlight until the room decides.</span>}
    {o.reasons.length > 0 && <ul className="oc-reasons" aria-label="Reasons">{o.reasons.map((r, i) => <li key={i}>{r.c === "challenge" ? "Challenge" : "Rename"}: {r.text}</li>)}</ul>}
    {o.renames.length > 0 && <p className="show-help">Suggested names: {o.renames.map(n => `${n.name}${n.count > 1 ? ` (${n.count})` : ""}`).join(", ")}</p>}
    {!decided && <>
      <div className="oc-choices" role="group" aria-label={`The room decided, ${o.title}`}>
        {([["confirm", "Confirmed"], ["rename", "Renamed"], ["remove", "Removed"]] as const).map(([k, label]) => <button key={k} type="button" className="show-button" aria-pressed={kind === k} onClick={() => { setKind(k); decide.current = null; }}>{label}</button>)}
      </div>
      {kind === "rename" && <label className="is-full" htmlFor={`oc-n-${o.id}`}>New name<input id={`oc-n-${o.id}`} maxLength={120} value={name} onChange={e => { setName(e.target.value); decide.current = null; }} /></label>}
      <label className="is-full" htmlFor={`oc-r-${o.id}`}>Why the room decided this (optional)<textarea id={`oc-r-${o.id}`} rows={2} maxLength={1000} value={why} onChange={e => { setWhy(e.target.value); decide.current = null; }} /></label>
    </>}
    <label className="is-full" htmlFor={`oc-d-${o.id}`}>One-line description<input id={`oc-d-${o.id}`} maxLength={200} value={descr} onChange={e => { setDescr(e.target.value); details.current = null; }} /></label>
    <label className="is-full" htmlFor={`oc-s-${o.id}`}>What the church will stop<textarea id={`oc-s-${o.id}`} rows={2} maxLength={400} value={stop} onChange={e => { setStop(e.target.value); details.current = null; }} /></label>
    <div className="ph-actions">
      {!decided && <button className="show-button is-primary" disabled={busy || (kind === "rename" && !name.trim())}
        onClick={() => void run({ action: "decide", decision: kind, ...(kind === "rename" ? { name } : {}), reasons: why, description: descr, stop }, decide, "Decision marked.")}><Gavel size={16} aria-hidden="true" />Mark the room&rsquo;s decision</button>}
      <button className="show-button" disabled={busy || !dirty} onClick={() => void run({ action: "details", description: descr, stop }, details, "Saved.")}><Save size={16} aria-hidden="true" />Save details</button>
    </div>
    {message && <p role="status" className="show-help">{message}</p>}
  </li>;
}

// D2-05, D2-06: what the room said on each provisional outcome, a challenged one lifted to the top,
// and the room's decision recorded with Mark a decision (subject: outcome). Private to the facilitator.
export function ConfirmPanel({ room }: ControlPanelProps) {
  const engagement = room.show.context.id, live = room.frame?.session?.interaction === "confirm";
  const [data, setData] = useState<Confirm | null>(null), running = useRef(false), again = useRef(false);
  const load = useCallback(async () => {
    if (running.current) { again.current = true; return; } running.current = true;
    try { const r = await fetch(`/api/control/${engagement}/outcomes`, { cache: "no-store" }); if (r.ok) setData(await r.json() as Confirm); }
    catch { /* Keep the last list; the next poll tries again. */ }
    finally { running.current = false; if (again.current) { again.current = false; void load(); } }
  }, [engagement]);
  useEffect(() => { if (live) void load(); }, [live, load, room.status, room.frame?.version]);
  useEffect(() => { if (!live) return; const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [live, load]);
  if (!live) return null;
  const list = data?.outcomes ?? [], note = rangeNote(data?.range);
  return <Private title="Confirm outcomes">
    <p className="show-help">Phones confirm, rename or challenge each outcome. The screen shows counts only. You record what the room decides, and why.</p>
    {note && <p className="oc-warning" role="status"><CircleAlert size={16} aria-hidden="true" /> {note} You can still go on.</p>}
    <ul className="oc-phone-list">{list.map(o => <Card key={`${o.id}:${o.status}:${o.title}`} o={o} engagement={engagement} onDone={() => void load()} />)}</ul>
  </Private>;
}
