"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, CircleCheck, CircleDashed, CircleX, HandHelping, Loader, Send, TrendingUp, TriangleAlert, WifiOff } from "lucide-react";
import { answerLabel, dayInZone, goalAnswers, longDate, noteLimit, shortDate, stepAnswers, type PhoneItem, type PhoneView } from "@/lib/check-ins/policy";
import "./check-ins.css";

type Ok = Extract<PhoneView, { status: "ok" }>;
type Save = { kind: "step" | "goal" | "help" | "finish"; item: string | null; answer: string | null; note: string | null };
type Item = { kind: "step" | "goal"; id: string; text: string; when: string | null; answer: string | null; note: string };

const icons: Record<string, ReactNode> = {
  done: <Check size={18} aria-hidden="true" />, under_way: <Loader size={18} aria-hidden="true" />, stuck: <HandHelping size={18} aria-hidden="true" />,
  not_started: <CircleDashed size={18} aria-hidden="true" />, on_track: <TrendingUp size={18} aria-hidden="true" />, at_risk: <TriangleAlert size={18} aria-hidden="true" />, off_track: <CircleX size={18} aria-hidden="true" />,
};
const goalIcons: Record<string, ReactNode> = { ...icons, done: <CircleCheck size={18} aria-hidden="true" /> };
const firstOpen = (list: Item[]) => { const at = list.findIndex(i => !i.answer); return at < 0 ? Math.max(0, list.length - 1) : at; };
const keyOf = (s: Save) => `${s.kind}:${s.item ?? ""}`;

// The person's own check-in. Each tap saves. A save that cannot reach the server waits on this phone and goes when the signal is back.
export function CheckInPhone({ token, view }: { token: string; view: Ok }) {
  const storeKey = `cw-ci:${token.slice(0, 24)}`;
  const initial = useMemo<Item[]>(() => [
    ...view.steps.map((s: PhoneItem): Item => ({ kind: "step", id: s.id, text: s.text ?? "", when: s.due ? `Due ${shortDate(s.due)}` : null, answer: s.answer, note: s.note ?? "" })),
    ...view.goals.map((g: PhoneItem): Item => ({ kind: "goal", id: g.id, text: g.title ?? "", when: g.end ? `Ends ${shortDate(g.end)}` : null, answer: g.answer, note: g.note ?? "" })),
  ], [view]);
  const [items, setItems] = useState<Item[]>(initial);
  const [help, setHelp] = useState(view.help ?? "");
  // A link with some answers saved but not sent opens at the first question left, not at the welcome page.
  const started = initial.some(i => i.answer);
  const [mode, setMode] = useState<"welcome" | "items" | "summary">(!view.editable || view.answered_at ? "summary" : started ? "items" : "welcome");
  const [justSent, setJustSent] = useState(false);
  const [page, setPage] = useState(() => firstOpen(initial));
  const [queued, setQueued] = useState(0);
  const [saved, setSaved] = useState(false);
  const [locked, setLocked] = useState<null | "read_only" | "ended">(view.editable ? null : "read_only");
  const queue = useRef(new Map<string, Save>());
  const flushing = useRef(false);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const persist = useCallback(() => {
    try { if (queue.current.size) localStorage.setItem(storeKey, JSON.stringify([...queue.current.values()])); else localStorage.removeItem(storeKey); } catch { /* Private browsing: the queue lives while the page is open. */ }
    setQueued(queue.current.size);
  }, [storeKey]);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      for (const [key, save] of [...queue.current]) {
        let response: Response;
        try { response = await fetch("/api/check-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, kind: save.kind, item: save.item, answer: save.answer, note: save.note }) }); }
        catch { break; }
        if (response.status >= 500) break;
        // A reply the server means (saved, or a link that no longer takes changes) is final, so the save leaves the queue either way.
        const body = await response.json().catch(() => ({})) as { status?: string };
        if (queue.current.get(key) === save) queue.current.delete(key);
        if (body.status === "read_only") { setLocked("read_only"); setMode("summary"); }
        if (body.status === "ended") { setLocked("ended"); setMode("summary"); }
      }
    } finally { flushing.current = false; persist(); setSaved(queue.current.size === 0); }
  }, [token, persist]);

  const enqueue = useCallback((save: Save) => {
    queue.current.set(keyOf(save), save); setSaved(false); persist(); void flush();
  }, [persist, flush]);

  // The page records that it was opened once it has loaded here. An email scanner that only fetches the page never runs this.
  useEffect(() => {
    void fetch("/api/check-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, kind: "open" }) }).catch(() => undefined);
  }, [token]);

  // What was saved on this phone but not yet sent is shown as chosen, and sent again.
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storeKey) ?? "[]") as Save[];
      for (const s of stored) queue.current.set(keyOf(s), s);
      if (stored.length) {
        setItems(list => { const next = list.map(i => { const q = queue.current.get(`${i.kind}:${i.id}`); return q ? { ...i, answer: q.answer, note: q.note ?? "" } : i; }); setPage(p => p === 0 ? firstOpen(next) : p); return next; });
        const h = queue.current.get("help:"); if (h) setHelp(h.note ?? "");
        setQueued(queue.current.size); setMode(m => m === "welcome" ? "items" : m); void flush();
      }
    } catch { /* Nothing saved. */ }
    const retry = () => void flush();
    window.addEventListener("online", retry);
    const timer = setInterval(() => { if (queue.current.size) void flush(); }, 4000);
    return () => { window.removeEventListener("online", retry); clearInterval(timer); };
  }, [storeKey, flush]);

  const choose = (index: number, answer: string) => {
    setItems(list => list.map((it, i) => i === index ? { ...it, answer } : it));
    const it = items[index];
    enqueue({ kind: it.kind, item: it.id, answer, note: it.note.trim() || null });
  };
  const write = (index: number, note: string) => {
    setItems(list => list.map((it, i) => i === index ? { ...it, note } : it));
    const it = items[index]; if (!it.answer) return;
    const key = `${it.kind}:${it.id}`; clearTimeout(timers.current.get(key));
    timers.current.set(key, setTimeout(() => enqueue({ kind: it.kind, item: it.id, answer: it.answer, note: note.trim() || null }), 600));
  };
  const writeHelp = (note: string) => {
    setHelp(note); clearTimeout(timers.current.get("help:"));
    timers.current.set("help:", setTimeout(() => enqueue({ kind: "help", item: null, answer: null, note: note.trim() || null }), 600));
  };
  const settle = async () => {
    // A note typed a moment ago is saved before the thank you.
    for (const [key, timer] of timers.current) { clearTimeout(timer); timers.current.delete(key); }
    items.forEach(it => { if (it.answer) queue.current.set(`${it.kind}:${it.id}`, { kind: it.kind, item: it.id, answer: it.answer, note: it.note.trim() || null }); });
    if (help.trim() !== (view.help ?? "").trim() || queue.current.has("help:")) queue.current.set("help:", { kind: "help", item: null, answer: null, note: help.trim() || null });
    // Sending is its own save and goes last, so a person counts as answered only once they have pressed Send my check-in.
    queue.current.delete("finish:"); queue.current.set("finish:", { kind: "finish", item: null, answer: null, note: null });
    persist(); await flush(); setJustSent(true); setMode("summary");
  };

  const nextOn = view.next_on ? shortDate(view.next_on) : "";
  const stateLine = queued > 0
    ? <p className="ci-state" role="status"><WifiOff size={16} aria-hidden="true" /><span>Saved on this phone</span></p>
    : <p className="ci-state" role="status">{saved ? <><Check size={16} aria-hidden="true" /><span>Saved</span></> : <span>&nbsp;</span>}</p>;
  const head = <header className="ph-head"><span className="ph-church">{view.church}</span></header>;

  if (mode === "welcome") return <div className="ph-app" data-screen="phone-answering">{head}
    <div className="ph-body"><h1 className="ph-headline">Your {view.day}-day check-in</h1>
      <p className="ph-text">Hi {view.first}. This is your {view.day}-day check-in after the retreat. It takes about two minutes, and it is only about your own first steps and goals.</p>
      <p className="ph-text">Each tap saves. You can come back to this link and change an answer until the next check-in goes out.</p></div>
    <div className="ph-foot"><div className="ph-actions"><button className="ph-send" type="button" onClick={() => setMode("items")}>Open my check-in<ArrowRight size={18} aria-hidden="true" /></button></div></div></div>;

  if (mode === "summary") {
    const answered = items.filter(i => i.answer);
    const newest = view.newest_day && view.newest_day !== view.day;
    return <div className="ph-app" data-screen="phone-answering">{head}
      <div className="ph-body">
        <h1 className="ph-headline">{locked === "ended" ? "This check-in is closed" : justSent ? "Thank you" : locked ? "Your answers" : "You already answered"}</h1>
        {locked === "ended" && <p className="ph-text">{view.church}&rsquo;s engagement has ended, so the check-ins have stopped. Thank you for the work.</p>}
        {locked !== "ended" && locked && <p className="ph-text">{newest ? `This is the ${view.day}-day check-in, and it can no longer be changed. Your ${view.newest_day}-day check-in is open now: use the link in the newest email we sent${view.newest_sent_at ? ` on ${shortDate(dayInZone(view.newest_sent_at, view.timezone))}` : ""}.` : `This check-in can no longer be changed.`}</p>}
        {!locked && <p className="ph-text">Your {view.day}-day check-in is in.{view.day < 90 ? (nextOn ? ` The next one comes by email on ${nextOn}.` : " The next one comes by email.") : " That was the last one, so the check-ins end here. Thank you for the work."}</p>}
        <ul className="ph-answers ci-summary" aria-label="Your answers">
          {answered.length === 0 && <li className="ph-answer"><span className="ph-answer-row">No answers were sent.</span></li>}
          {answered.map(it => <li className="ph-answer" key={`${it.kind}:${it.id}`}><div className="ph-answer-row"><span>{it.text}</span>
            <span className="ph-answer-status">{(it.kind === "step" ? icons : goalIcons)[it.answer!]}{answerLabel[it.answer!]}</span></div>
            {it.note && <p className="ci-note-read">{it.note}</p>}</li>)}
        </ul>
        {help.trim() && <p className="ph-text"><strong>Anything else that would help:</strong> {help}</p>}
        {view.sent_at && <p className="ph-muted">Sent {longDate(dayInZone(view.sent_at, view.timezone))}</p>}
        {stateLine}
      </div>
      <div className="ph-foot">{!locked && <div className="ph-actions"><button className="ph-send" type="button" onClick={() => { setJustSent(false); setPage(0); setMode("items"); }}>Change my answers</button></div>}
        <span className="ph-muted">Your Clearway facilitator reads your answers.</span></div></div>;
  }

  const it = items[page], last = page === items.length - 1, isGoal = it.kind === "goal";
  const options = isGoal ? goalAnswers : stepAnswers;
  const counts = { steps: items.filter(i => i.kind === "step").length, goals: items.filter(i => i.kind === "goal").length };
  const label = isGoal ? (counts.goals > 1 ? `Your goals, ${page - counts.steps + 1} of ${counts.goals}` : "Your goal") : (counts.steps > 1 ? `Your first steps, ${page + 1} of ${counts.steps}` : "Your first step");
  const asks = isGoal ? "What would help?" : it.answer === "stuck" ? "What would help?" : "Add a note, if you like";
  return <div className="ph-app" data-screen="phone-answering">{head}
    <div className="ph-body">
      <div className="ci-progress"><span>Question {page + 1} of {items.length}</span><progress max={items.length} value={page + 1} aria-label="Progress" /></div>
      <h1 className="ph-headline">{label}</h1>
      <div className="ci-card"><p className="ci-title">{it.text}</p>{it.when && <p className="ci-when">{it.when}</p>}
        <div className={`ci-options${isGoal ? " is-list" : ""}`} role="radiogroup" aria-label={it.text}>
          {options.map(a => <button key={a} type="button" role="radio" aria-checked={it.answer === a} className={it.answer === a ? "is-on" : ""} onClick={() => choose(page, a)}>
            {(isGoal ? goalIcons : icons)[a]}<span>{answerLabel[a]}</span></button>)}</div>
        {it.answer && <label className="ci-field"><span>{asks}</span>
          <textarea className="ph-input" rows={3} maxLength={noteLimit} value={it.note} onChange={e => write(page, e.target.value)} onBlur={() => it.answer && enqueue({ kind: it.kind, item: it.id, answer: it.answer, note: it.note.trim() || null })} /></label>}
      </div>
      {last && <label className="ci-field is-plain"><span>Anything else that would help?</span>
        <textarea className="ph-input" rows={3} maxLength={noteLimit} value={help} onChange={e => writeHelp(e.target.value)} /></label>}
      {stateLine}
    </div>
    <div className="ph-foot"><div className="ph-actions">
      {page > 0 && <button className="ci-back" type="button" onClick={() => setPage(page - 1)}><ArrowLeft size={18} aria-hidden="true" />Back</button>}
      {last ? <button className="ph-send" type="button" disabled={!items.every(i => i.answer)} onClick={() => void settle()}><Send size={18} aria-hidden="true" />Send my check-in</button>
        : <button className="ph-send" type="button" disabled={!it.answer} onClick={() => setPage(page + 1)}>Next<ArrowRight size={18} aria-hidden="true" /></button>}
    </div>{last && !items.every(i => i.answer) && <span className="ph-muted">Choose an answer for each one to send.</span>}</div></div>;
}
