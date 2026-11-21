"use client";
import { useRef, useState } from "react";
import { Check, Monitor, WifiOff } from "lucide-react";
import type { PhoneInputProps } from "@/components/interactions/phone-inputs";
import type { OwnAnswer } from "@/lib/phone/types";
import { beforeAfterOptions } from "@/lib/interactions/before-after";
import { useAutoSend } from "@/components/interactions/use-auto-send";
import "./before-after.css";

type Pair = { before?: number; after?: number };
type Props = PhoneInputProps & { sourceAnswers?: OwnAnswer[] };
export function BeforeAfterInput(props: Props) { return <Input key={props.step.id} {...props} />; }
function Input({ step, mine, open, send, sourceAnswers }: Props) {
  const o = beforeAfterOptions(step.options), sent = mine.at(-1), value = (sent?.value ?? {}) as Pair;
  const [draft, setDraft] = useState<Pair | null>(null);
  const pointer = useRef<{ id: number; changed?: Pair } | null>(null);
  const pair = draft ?? value;
  const auto = useAutoSend(value, (next: Pair) => send({ text: `${o.before_label}: ${next.before ?? ""}; ${o.after_label}: ${next.after ?? ""}`, value: next }), open);
  const source = (id: string | undefined) => {
    const own = sourceAnswers?.filter(a => a.session_id === id && !a.withdrawn && !a.replaced).at(-1);
    return (own?.value as { value?: number } | undefined)?.value;
  };
  if (o.mode === "steps") return <div className="ba-phone">
    <div className="ba-own">{([{ label: o.before_label, value: source(o.before_session) }, { label: o.after_label, value: source(o.after_session) }]).map((item, i) => <div key={i}><span>{item.label}</span><b>{item.value ?? "-"}</b><small>Your answer</small></div>)}</div>
    <p className="ba-watch"><Monitor size={28} aria-hidden="true" />Look at the screen to see how the room moved.</p>
  </div>;
  return <div className="ba-phone"><p className="ph-note">Rate both now. Think back to before today for the first one.</p>
    {(["before", "after"] as const).map(field => <div className="ba-slider" key={field}>
      <div className="ph-slider-row"><label htmlFor={`ba-${step.id}-${field}`}>{field === "before" ? o.before_label : o.after_label}</label><b className="ph-slider-value">{pair[field] ?? "·"}</b></div>
      <input id={`ba-${step.id}-${field}`} className="ph-slider" type="range" min={1} max={o.max} step={1} value={pair[field] ?? Math.ceil(o.max / 2)} disabled={!open}
        onPointerDown={e => { pointer.current = { id: e.pointerId }; }}
        onPointerUp={e => {
          if (pointer.current?.id !== e.pointerId) return;
          if (pointer.current.changed) auto.schedule(pointer.current.changed);
          pointer.current = null;
        }}
        onPointerCancel={e => { if (pointer.current?.id === e.pointerId) pointer.current = null; }}
        onChange={e => {
          const next = { ...pair, [field]: Number(e.target.value) };
          setDraft(next);
          if (pointer.current) pointer.current.changed = next;
          else auto.schedule(next);
        }} />
    </div>)}
    <div className="ph-ends"><span><b>1</b><br />{o.low}</span><span><b>{o.max}</b><br />{o.high}</span></div>
    <p className="ph-note" role="status">{sent?.status === "saved" ? <><WifiOff size={16} aria-hidden="true" />Saved on this phone.</> : sent?.status === "failed" ? sent.reason || "Not sent. Try again." : sent?.status === "sending" ? "Sending" : sent ? <><Check size={16} aria-hidden="true" />Sent. Slide either one to change it.</> : "It sends when you let go."}</p>
  </div>;
}
