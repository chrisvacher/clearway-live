"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, CircleDashed, Info, Plus, RefreshCw, Send, WifiOff } from "lucide-react";
import "./bars.css";
import type { PhoneInputProps } from "@/components/interactions/phone-inputs";
import { allocate, budget, optionItems, pointsKey, rankTap, rankUp, scaleUsesSlider, valueOf, type OptionItem } from "@/lib/interactions/bars";

// The phone inputs for the bar family. Each sends through the phone's outbox with
// { text, value }; the server keeps one answer per person, so a new send replaces the
// earlier one. Each shows the person's own standing answer from `mine`, and its state:
// sent, saved on this phone, sending, or not sent.
type Answer = PhoneInputProps["mine"][number];
function Status({ answer, hint }: { answer: Answer | undefined; hint?: string }) {
  if (!answer) return hint ? <p className="ph-note"><Info size={16} aria-hidden="true" />{hint}</p> : null;
  if (answer.status === "failed") return <p className="ph-note" role="alert"><Info size={16} aria-hidden="true" />{answer.reason || "Not sent."}</p>;
  if (answer.status === "saved") return <p className="ph-note" role="status"><WifiOff size={16} aria-hidden="true" />Saved on this phone. It sends when you’re back online.</p>;
  if (answer.status === "sending") return <p className="ph-note" role="status"><RefreshCw size={16} aria-hidden="true" />Sending</p>;
  return <p className="ph-note" role="status"><Check size={16} aria-hidden="true" />Sent. You can change it until the session closes.</p>;
}
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const label = (items: OptionItem[], keys: string[]) => keys.map(k => items.find(o => o.key === k)?.text ?? k).join(", ");

// INT-04: pick one, or pick any (a setting). Answers change until the session closes.
export function ChoiceInput({ step, mine, open, send }: PhoneInputProps) {
  const items = optionItems(step.options), many = (step.options as { multiple?: boolean } | undefined)?.multiple === true;
  const sent = mine[mine.length - 1], sentPicks = valueOf<string[]>(sent?.value, "choices") ?? [];
  const [draft, setDraft] = useState<string[] | null>(null);
  const picks = (draft ?? sentPicks).filter(k => items.some(o => o.key === k));
  const changed = draft !== null && !same([...draft].sort(), [...sentPicks].sort());
  const tap = (key: string) => { if (!open) return; setDraft(many ? (picks.includes(key) ? picks.filter(k => k !== key) : [...picks, key]) : [key]); };
  const go = () => { if (!picks.length) return; send({ text: label(items, picks), value: { choices: items.filter(o => picks.includes(o.key)).map(o => o.key) } }); setDraft(null); };
  return <div className="ph-bars">
    <p className="ph-sec" id={`ph-choice-${step.id}`}>{many ? "Pick any that apply" : "Pick one"}</p>
    <div className="ph-bars" role={many ? "group" : "radiogroup"} aria-labelledby={`ph-choice-${step.id}`}>
      {items.map(o => <button key={o.key} type="button" role={many ? "checkbox" : "radio"} aria-checked={picks.includes(o.key)} disabled={!open}
        className={`ph-opt${many ? " is-any" : ""}`} onClick={() => tap(o.key)}>
        <span className="ph-tick">{picks.includes(o.key) && <Check size={16} aria-hidden="true" />}</span><span className="ph-opt-text">{o.text}</span>
      </button>)}
    </div>
    <div className="ph-bars-foot">
      <Status answer={changed ? undefined : sent} />
      {open && <button type="button" className="ph-send" disabled={!picks.length || (Boolean(sent) && !changed)} onClick={go}><Send size={18} aria-hidden="true" />{sent ? "Change my answer" : "Send"}</button>}
    </div>
  </div>;
}

// INT-05: up to seven numbers as buttons (a tap sends, another tap changes it); wider
// ranges as a slider that sends when it comes to rest.
export function ScaleInput({ step, mine, open, send }: PhoneInputProps) {
  const o = (step.options ?? {}) as { max?: number; low?: string; high?: string };
  const max = typeof o.max === "number" ? o.max : 5, sent = mine[mine.length - 1], value = valueOf<number>(sent?.value, "value");
  const choose = (n: number) => { if (open && n !== value) send({ text: String(n), value: { value: n } }); };
  const [slide, setSlide] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const ends = <div className="ph-ends" aria-hidden="true"><span>1 · {o.low ?? "Not at all"}</span><span>{max} · {o.high ?? "Completely"}</span></div>;
  if (scaleUsesSlider(max)) {
    const shown = slide ?? value ?? Math.ceil(max / 2);
    const settle = (n: number) => { setSlide(n); clearTimeout(timer.current); timer.current = setTimeout(() => { choose(n); setSlide(null); }, 600); };
    return <div className="ph-bars">
      <div className="ph-slider-row"><span className="ph-sec">Your answer</span><span className="ph-slider-value" aria-hidden="true">{value === undefined && slide === null ? "·" : shown}</span></div>
      <input className="ph-slider" type="range" min={1} max={max} step={1} value={shown} disabled={!open} aria-label={`From 1, ${o.low ?? "Not at all"}, to ${max}, ${o.high ?? "Completely"}`}
        aria-valuetext={String(shown)} onChange={e => settle(Number(e.target.value))} />
      {ends}
      <Status answer={slide !== null ? undefined : sent} hint="Slide to your number. It sends when you let go." />
    </div>;
  }
  return <div className="ph-bars">
    <div className="ph-scale-btns" role="radiogroup" aria-label={`From 1, ${o.low ?? "Not at all"}, to ${max}, ${o.high ?? "Completely"}`}>
      {Array.from({ length: max }, (_, i) => i + 1).map(n => <button key={n} type="button" role="radio" aria-checked={value === n} disabled={!open} onClick={() => choose(n)}>{n}</button>)}
    </div>
    {ends}
    <Status answer={sent} hint="Tap a number to send it. Tap another to change it." />
  </div>;
}

// INT-06: tap options in priority order, tap a ranked one to remove it, or move one up. A
// partial ranking counts. Add an option (a setting) suggests a missing one to the facilitator.
const added = (key: string) => /^a[0-9a-f]{10}$/.test(key);
export function RankingInput({ step, mine, open, send, engagement }: PhoneInputProps) {
  const items = optionItems(step.options), suggest = (step.options as { suggest?: boolean } | undefined)?.suggest === true;
  const sent = mine[mine.length - 1], sentOrder = (valueOf<string[]>(sent?.value, "order") ?? []).filter(k => items.some(o => o.key === k));
  const [draft, setDraft] = useState<string[] | null>(null);
  const order = (draft ?? sentOrder).filter(k => items.some(o => o.key === k)), rest = items.filter(o => !order.includes(o.key));
  const changed = draft !== null && !same(draft, sentOrder);
  const text = (key: string) => items.find(o => o.key === key)?.text ?? key;
  const go = () => { send({ text: order.map((k, i) => `${i + 1}. ${text(k)}`).join(", "), value: { order } }); setDraft(null); };
  return <div className="ph-bars">
    {order.length > 0 && <><p className="ph-sec">Your order</p>
      <ol className="ph-bars ph-list" aria-label="Your order">{order.map((k, i) => <li key={k} className="ph-ranked">
        <button type="button" className="ph-opt is-ranked" disabled={!open} aria-label={`${i + 1}. ${text(k)}. Tap to remove.`} onClick={() => setDraft(rankTap(order, k))}>
          <span className="ph-rank">{i + 1}</span><span className="ph-opt-text">{text(k)}</span></button>
        <button type="button" className="ph-up" disabled={!open || i === 0} aria-label={`Move ${text(k)} up`} onClick={() => setDraft(rankUp(order, k))}><ArrowUp size={20} aria-hidden="true" /></button>
      </li>)}</ol></>}
    {rest.length > 0 && <><p className="ph-sec">{order.length ? "Not ranked yet · counts as the middle" : "Tap in order of priority"}</p>
      <ul className="ph-bars ph-list">{rest.map(o => <li key={o.key}>
        <button type="button" className="ph-opt" disabled={!open} onClick={() => setDraft([...order, o.key])}>
          <span className="ph-rank is-empty" /><span className="ph-opt-text">{o.text}</span>{added(o.key) && <span className="ph-new">New</span>}</button>
      </li>)}</ul></>}
    {suggest && open && engagement && <Suggest engagement={engagement} session={step.id} />}
    <div className="ph-bars-foot">
      <Status answer={changed ? undefined : sent} hint="Partial rankings count." />
      {open && <button type="button" className="ph-send" disabled={!order.length || (Boolean(sent) && !changed)} onClick={go}><Send size={18} aria-hidden="true" />Send my order</button>}
    </div>
  </div>;
}
function Suggest({ engagement, session }: { engagement: string; session: string }) {
  const [openSheet, setOpen] = useState(false), [text, setText] = useState(""), [state, setState] = useState<{ busy: boolean; message: string }>({ busy: false, message: "" });
  const id = useRef<string | null>(null);
  async function go() {
    const value = text.trim(); if (!value) return;
    id.current ??= crypto.randomUUID();
    setState({ busy: true, message: "" });
    try {
      const response = await fetch(`/api/live/${engagement}/suggest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id.current, session, text: value }) });
      const data = await response.json().catch(() => ({})) as { status?: string };
      const message = data.status === "accepted" || data.status === "duplicate" ? "Sent to the facilitator. If it’s added, it appears on everyone’s list."
        : data.status === "limit" ? "You’ve suggested three already." : data.status === "filtered" ? "That can’t go on the screen. Try different words."
        : data.status === "closed" ? "Suggestions are closed for this step." : "Not sent. Try again.";
      if (data.status === "accepted" || data.status === "duplicate") { setText(""); id.current = null; setOpen(false); }
      setState({ busy: false, message });
    } catch { setState({ busy: false, message: "Not sent. Try again when you’re back online." }); }
  }
  if (!openSheet) return <><button type="button" className="ph-suggest" onClick={() => { setOpen(true); setState({ busy: false, message: "" }); }}><Plus size={16} aria-hidden="true" />Suggest an option</button>
    {state.message && <p className="ph-note" role="status"><Info size={16} aria-hidden="true" />{state.message}</p>}</>;
  return <div className="ph-sheet" role="group" aria-labelledby={`ph-suggest-${session}`}>
    <p className="ph-sheet-title" id={`ph-suggest-${session}`}>Suggest an option</p>
    <p className="ph-sheet-help">It goes to the facilitator. If it’s added, it appears on everyone’s list.</p>
    <input className="ph-input" maxLength={80} value={text} aria-label="Your option" onChange={e => { setText(e.target.value); id.current = null; }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void go(); } }} />
    {state.message && <p className="ph-sheet-help" role="status">{state.message}</p>}
    <div className="ph-actions"><button type="button" className="ph-secondary" onClick={() => setOpen(false)}>Cancel</button>
      <button type="button" className="ph-send" disabled={!text.trim() || state.busy} onClick={() => void go()}><Plus size={18} aria-hidden="true" />Suggest</button></div>
  </div>;
}

// INT-07 (pass 3 change 11): one line per option with a circle to drag, all on one screen.
// Dragging past the budget takes the overage from the others in proportion; dragging back only
// frees points. A person's points count once all 100 are placed.
export function PointsInput({ step, mine, open, send }: PhoneInputProps) {
  const items = optionItems(step.options), sent = mine[mine.length - 1];
  const sentPoints = valueOf<Record<string, number>>(sent?.value, "points");
  const fromSent = () => items.map(o => Math.max(0, Number(sentPoints?.[o.key] ?? 0)));
  const [values, setValues] = useState<number[] | null>(null);
  const shown = values ?? fromSent(), left = budget - shown.reduce((a, b) => a + b, 0);
  const changed = values !== null && !same(values.map(String), fromSent().map(String));
  const [dragging, setDragging] = useState<number | null>(null);
  const tracks = useRef<(HTMLDivElement | null)[]>([]);
  const set = (i: number, v: number) => { if (open) setValues(prev => allocate(prev ?? fromSent(), i, v)); };
  const fromX = (i: number, x: number) => {
    const track = tracks.current[i]; if (!track) return shown[i];
    const r = track.getBoundingClientRect(), knob = 34;
    return (x - r.left - knob / 2) / Math.max(1, r.width - knob) * budget;
  };
  const go = () => { send({ text: items.map((o, i) => shown[i] ? `${o.text} ${shown[i]}` : "").filter(Boolean).join(", "), value: { points: Object.fromEntries(items.map((o, i) => [o.key, shown[i]])) } }); setValues(null); };
  return <div className="ph-bars">
    <div className={`ph-left${left === 0 ? " is-done" : ""}`} role="status" aria-live="polite"><span>{left === 0 ? <><Check size={16} aria-hidden="true" /> All 100 placed</> : "Points left"}</span><b>{left}</b></div>
    <div className="ph-faders" role="group" aria-label="Your 100 points">
      {items.map((o, i) => <div key={o.key} className={`ph-fader${dragging === i ? " is-dragging" : ""}`} role="slider" tabIndex={open ? 0 : -1} aria-disabled={!open || undefined}
        aria-label={o.text} aria-valuemin={0} aria-valuemax={budget} aria-valuenow={shown[i]} aria-valuetext={`${shown[i]} points`} ref={el => { el?.style.setProperty("--v", String(shown[i] / budget)); }}
        onKeyDown={e => { const next = pointsKey(e.key, shown[i]); if (next !== null && open) { e.preventDefault(); set(i, next); } }}>
        <div className="ph-fader-top"><span className="ph-fader-label">{o.text}</span><b className="ph-fader-n">{shown[i]}</b></div>
        <div className="ph-fader-track" ref={el => { tracks.current[i] = el; }}
          onPointerDown={e => { if (!open) return; e.currentTarget.setPointerCapture(e.pointerId); setDragging(i); set(i, fromX(i, e.clientX)); e.preventDefault(); }}
          onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) set(i, fromX(i, e.clientX)); }}
          onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)}>
          <i className="ph-fader-fill" /><span className="ph-fader-knob" />
        </div>
      </div>)}
    </div>
    <div className="ph-bars-foot">
      {left ? <p className="ph-note"><Info size={16} aria-hidden="true" />Counts once all 100 are placed.</p> : <Status answer={changed ? undefined : sent} hint="All placed. Send when you’re ready." />}
      {open && <button type="button" className="ph-send" disabled={left !== 0 || (Boolean(sent) && !changed)} onClick={go}>
        {left ? <><CircleDashed size={18} aria-hidden="true" />Place {left} more</> : <><Send size={18} aria-hidden="true" />{sent ? "Send my change" : "Send"}</>}</button>}
    </div>
  </div>;
}

// INT-17: every statement with five numbered buttons on one screen. Each tap sends the
// person's whole set of ratings; tapping another number changes it.
export function StatementsInput({ step, mine, open, send }: PhoneInputProps) {
  const items = optionItems(step.options), o = (step.options ?? {}) as { low?: string; high?: string };
  const sent = mine[mine.length - 1], sentRatings = valueOf<Record<string, number>>(sent?.value, "ratings") ?? {};
  const [local, setLocal] = useState<Record<string, number> | null>(null);
  const ratings = local ?? sentRatings, done = items.filter(s => ratings[s.key]).length;
  const tap = (key: string, n: number) => {
    if (!open || ratings[key] === n) return;
    const next = Object.fromEntries(Object.entries({ ...ratings, [key]: n }).filter(([k]) => items.some(s => s.key === k)));
    setLocal(next); send({ text: `${Object.keys(next).length} of ${items.length} rated`, value: { ratings: next } });
  };
  return <div className="ph-bars">
    <div className="ph-ends"><span>1 · {o.low ?? "Strongly disagree"}</span><span>5 · {o.high ?? "Strongly agree"}</span></div>
    <div className="ph-stmts">{items.map(s => <div key={s.key} className="ph-stmt">
      <p className="ph-stmt-text" id={`ph-stmt-${step.id}-${s.key}`}>{s.text}</p>
      <div className="ph-stmt-btns" role="radiogroup" aria-labelledby={`ph-stmt-${step.id}-${s.key}`}>
        {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" role="radio" aria-checked={ratings[s.key] === n} aria-label={`${n}${n === 1 ? `, ${o.low ?? "Strongly disagree"}` : n === 5 ? `, ${o.high ?? "Strongly agree"}` : ""}`}
          disabled={!open} onClick={() => tap(s.key, n)}>{n}</button>)}
      </div>
    </div>)}</div>
    <div className="ph-bars-foot">
      {sent && done ? <><p className="ph-note">{done} of {items.length} answered</p><Status answer={sent} /></> : <Status answer={undefined} hint="Tap a number to send it. Tap another to change it." />}
    </div>
  </div>;
}
