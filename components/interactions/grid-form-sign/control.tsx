"use client";
import { useState } from "react";
import { Eye, EyeOff, Lock, LockOpen, Merge, Sun, SunDim, Undo2, X } from "lucide-react";
import type { ControlItemsProps } from "@/components/interactions/control-items";
import { gridColor } from "@/lib/interactions/grid-form-sign";
import "./grid-form-sign.css";

type GridItem = { key: string; text: string; num?: number; count: number; hidden: boolean; into?: string };
type FormItem = { key: string; text: string; count: number; at?: string; answers?: { question: string; text: string }[] };
type SignItem = { key: string; text: string; hidden: boolean; at?: string };
const messages: Record<string, string> = {
  moved: "The room moved on. Check what is live and try again.", invalid_state: "That can’t be done on this step now.", missing: "That item is no longer on the grid.",
  denied: "Only facilitators can do that.", unavailable: "The room didn’t answer. Try again.", closed: "This engagement has closed.",
};

// This step's own presses: merge and undo on the grid, close signing. Same rules as the
// engine's controls: the client's id, made against where the room is now.
function useKindPress(room: ControlItemsProps["room"]) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const press = async (kind: "grid" | "sign", action: string, extra: Record<string, string> = {}) => {
    const engagement = room.frame?.state.engagement_id; if (!engagement) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/control/${engagement}/grid-form-sign`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id: crypto.randomUUID(), action, from: room.frame?.state.live_session_id ?? null, ...extra }) });
      const data = await response.json().catch(() => ({ status: "unavailable" })) as { status: string };
      if (!["ok", "duplicate", "unchanged"].includes(data.status)) setMessage(messages[data.status] ?? messages.unavailable);
    } catch { setMessage(messages.unavailable); } finally { setBusy(false); }
  };
  return { busy: busy || Boolean(room.pending), message, press };
}
const Head = ({ title, help, onClose }: { title: string; help: string; onClose?: () => void }) => <>
  <div className="ctl-row is-between"><h2 id="ctl-items-title">{title}</h2>{onClose && <button className="show-button is-icon" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><X size={20} aria-hidden="true" /></button>}</div>
  <p className="show-help">{help}</p></>;

// INT-08: each item with its number and color, Spotlight, Hide, and Merge into another
// item when two turn out to be the same. A merge can be undone.
export function GridItems({ room, onClose }: ControlItemsProps) {
  const items = (room.status?.items ?? []) as unknown as GridItem[], spot = room.frame?.state.spotlight_key;
  const { busy, message, press } = useKindPress(room);
  const label = (key: string) => { const i = items.find(x => x.key === key); return i ? `${i.num}. ${i.text}` : key; };
  return <section className="ctl-items" aria-labelledby="ctl-items-title">
    <Head title="Items on the grid" help="Numbers stay with their item. Merge two that mean the same thing." onClose={onClose} />
    {message && <p className="show-message is-error" role="alert">{message}</p>}
    {items.length ? <ul className="ctl-item-list">{items.map(item => <li key={item.key} className={item.hidden ? "is-hidden" : item.key === spot ? "is-spot" : ""}>
      <span className="ctl-item-text"><span className={`gfs-line-num ${gridColor(item.num ?? 1)}`} aria-hidden="true">{item.num}</span>{item.text}<small> · {item.into ? `merged into ${label(item.into)}` : `placed by ${item.count}`}</small></span>
      {item.into ? <button className="show-button" disabled={busy} onClick={() => void press("grid", "unmerge", { item: item.key })}><Undo2 size={16} aria-hidden="true" />Undo merge</button>
        : item.hidden ? <button className="show-button" disabled={busy} onClick={() => void room.press("unhide", { item: item.key })}><Eye size={16} aria-hidden="true" />Unhide</button>
        : <>
          {item.key === spot ? <button className="show-button" disabled={busy} onClick={() => void room.press("clear_spotlight")}><SunDim size={16} aria-hidden="true" />Clear</button>
            : <button className="show-button" disabled={busy} onClick={() => void room.press("spotlight", { item: item.key }).then(r => { if (r.status === "ok") onClose?.(); })}><Sun size={16} aria-hidden="true" />Spotlight</button>}
          <button className="show-button" disabled={busy} onClick={() => void room.press("hide", { item: item.key })}><EyeOff size={16} aria-hidden="true" />Hide</button>
          <label className="gfs-merge"><Merge size={16} aria-hidden="true" /><span className="sr-only">Merge {item.text} into</span>
            <select value="" disabled={busy} onChange={e => { if (e.target.value) void press("grid", "merge", { item: item.key, into: e.target.value }); }}>
              <option value="">Merge into…</option>
              {items.filter(x => x.key !== item.key && !x.into && !items.some(y => y.into === item.key)).map(x => <option key={x.key} value={x.key}>{x.num}. {x.text}</option>)}
            </select></label>
        </>}
    </li>)}</ul> : <p className="show-empty">No items on this grid yet. Add them in the run of show.</p>}
  </section>;
}

// INT-09: the answers, by person, for the facilitators only. Nothing here reaches the TV.
export function FormAnswers({ room, onClose }: ControlItemsProps) {
  const items = (room.status?.items ?? []) as unknown as FormItem[];
  return <section className="ctl-items" aria-labelledby="ctl-items-title">
    <Head title="Answers" help="Never sent to the TV. Read them at the break, and don’t quote anyone in the room." onClose={onClose} />
    <div className="show-private"><Lock size={16} aria-hidden="true" />Only you see this<span>Answers by person</span></div>
    {items.length ? <ul className="gfs-answers">{items.map(item => <li key={item.key}>
      <p className="ctl-label">{item.text}</p>
      <dl>{(item.answers ?? []).map((a, i) => <div key={i}><dt>{a.question}</dt><dd>{a.text}</dd></div>)}</dl>
    </li>)}</ul> : <p className="show-empty">No answers yet.</p>}
  </section>;
}

// INT-10: the names in the order people signed. Hide takes a name off the TV and keeps
// it in the record, marked hidden. Close signing stops new signatures; Reopen undoes it.
export function SignNames({ room, onClose }: ControlItemsProps) {
  const items = (room.status?.items ?? []) as unknown as SignItem[], spot = room.frame?.state.spotlight_key;
  const { busy, message, press } = useKindPress(room);
  const closed = room.frame?.session?.state === "closed";
  const signed = items.filter(i => !i.hidden).length;
  return <section className="ctl-items" aria-labelledby="ctl-items-title">
    <Head title="Signed" help={`${signed} signed${items.length > signed ? `, ${items.length - signed} hidden` : ""}. Hidden names stay in the record.`} onClose={onClose} />
    {message && <p className="show-message is-error" role="alert">{message}</p>}
    <div className="ctl-row">{closed
      ? <button className="show-button is-primary" disabled={busy} onClick={() => void room.press("reopen")}><LockOpen size={18} aria-hidden="true" />Reopen signing</button>
      : <button className="show-button is-primary" disabled={busy} onClick={() => void press("sign", "close")}><Lock size={18} aria-hidden="true" />Close signing</button>}</div>
    {items.length ? <ul className="ctl-item-list">{items.map(item => <li key={item.key} className={item.hidden ? "is-hidden" : item.key === spot ? "is-spot" : ""}>
      <span className="ctl-item-text">{item.text}<small> · {item.hidden ? "Hidden from the TV" : item.at ? `Signed ${new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit" }).format(new Date(item.at))}` : "Signed"}</small></span>
      {item.hidden ? <button className="show-button" disabled={busy} onClick={() => void press("sign", "unhide", { item: item.key })}><Eye size={16} aria-hidden="true" />Unhide</button>
        : <>{item.key === spot ? <button className="show-button" disabled={busy} onClick={() => void room.press("clear_spotlight")}><SunDim size={16} aria-hidden="true" />Clear</button>
          : <button className="show-button" disabled={busy} onClick={() => void room.press("spotlight", { item: item.key }).then(r => { if (r.status === "ok") onClose?.(); })}><Sun size={16} aria-hidden="true" />Spotlight</button>}
          <button className="show-button" disabled={busy} onClick={() => void room.press("hide", { item: item.key })}><EyeOff size={16} aria-hidden="true" />Hide from the TV</button></>}
    </li>)}</ul> : <p className="show-empty">No one has signed yet.</p>}
  </section>;
}
