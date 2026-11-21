"use client";
import { signedScore } from "@/lib/interactions/scale";
import { useLayoutEffect, useRef } from "react";
import { reducedMotion, tokenMs } from "@/lib/tv/board";
import { springRate, springStep } from "@/lib/tv/motion";
import { FormAnswers } from "@/components/interactions/grid-form-sign/control";
import { Lock } from "lucide-react";
import { isPrivateStep } from "@/lib/interactions/visibility";
import type { ControlItem } from "@/lib/control/types";
import type { Room } from "./live-controls";
import { ResponsesList } from "./responses";
import { PrivateBars } from "@/components/interactions/bars/control-bars";

const bars = new Set(["choice", "ranking", "points", "statements", "grid"]);
const text = new Set(["word_cloud", "wall", "qa", "form", "sign"]);
export function PrivateResults({ room, compact = false }: { room: Room; compact?: boolean }) {
  const step = room.frame?.session;
  if (!step || !isPrivateStep(step)) return null;
  const status = room.status?.live_session_id === step.id ? room.status : null;
  const items = status?.items ?? [];
  const scoped = { ...room, status };
  return <section className="ctl-private-results" aria-label="Private results" data-private-results>
    <header><h2>Results</h2><span className="cwl-private-tag"><Lock size={13} aria-hidden="true" />Facilitators only</span></header>
    {step.interaction === "scale" && <ScaleResults items={items} options={step.options} compact={compact} />}
    {bars.has(step.interaction) && <PrivateBars items={items} compact={compact} />}
    {text.has(step.interaction) && (compact
      ? <ul className="ctl-private-answer-list">{(status?.recent_items ?? []).map(item => <li key={item.key}>{item.text}</li>)}</ul>
      : step.interaction === "form" ? <FormAnswers room={scoped} /> : <ResponsesList room={scoped} title="Answers" />)}
  </section>;
}

function ScaleResults({ items, options, compact }: { items: ControlItem[]; options?: Record<string, unknown>; compact: boolean }) {
  const max = typeof options?.max === "number" ? options.max : 5;
  const columns = Array.from({ length: max }, (_, i) => items.find(item => item.key === String(i + 1))?.count ?? 0);
  const num = columns.reduce((acc, count) => acc + count, 0);
  const avg = num ? columns.reduce((acc, count, i) => acc + (i + 1) * count, 0) / num : null;
  const highest = Math.max(1, ...columns);
  const low = columns.slice(0, 6).reduce((a, b) => a + b, 0), middle = columns.slice(6, 8).reduce((a, b) => a + b, 0), high = columns.slice(8).reduce((a, b) => a + b, 0);
  const score = num ? Math.sign(high - low) * Math.round(Math.abs(high - low) * 100 / num) || 0 : null;
  return <div className="ctl-private-scale">
    {max === 10 && options?.nps === true && <p>NPS-style score {score === null ? "No answers yet" : signedScore(score)} · 1 to 6: {low} · 7 or 8: {middle} · 9 or 10: {high}</p>}
    <div className="ctl-private-average"><Average value={avg} /><span>average of {num} {num === 1 ? "answer" : "answers"}</span></div>
    {!compact && <><ol className="ctl-private-columns" ref={el => { if (el) el.style.gridTemplateColumns = `repeat(${max}, minmax(0, 1fr))`; }}>
      {columns.map((count, i) => <li key={i}><span>{count}</span><div ref={el => { if (el) el.style.height = `${Math.max(3, count / highest * 120)}px`; }} /><b>{i + 1}</b></li>)}
    </ol><div className="ctl-row is-between ctl-private-scale-labels"><span>1 · {String(options?.low ?? "")}</span><span>{max} · {String(options?.high ?? "")}</span></div></>}
  </div>;
}

function Average({ value }: { value: number | null }) {
  const el = useRef<HTMLElement>(null);
  const position = useRef(value), velocity = useRef(0);
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    if (value === null || position.current === null || reducedMotion(node)) {
      position.current = value; velocity.current = 0;
      node.textContent = value === null ? "No answers yet" : value.toFixed(1);
      return;
    }
    const omega = springRate(tokenMs(node, "cwl-dur-bar-trade"));
    let last = performance.now(), id = 0;
    const paint = (now: number) => {
      const dt = Math.min(.05, (now - last) / 1000);
      last = now;
      const [next, speed] = springStep(position.current!, velocity.current, value, omega, dt);
      const done = Math.abs(next - value) < .002 && Math.abs(speed) < .02;
      position.current = done ? value : next; velocity.current = done ? 0 : speed;
      node.textContent = position.current.toFixed(1);
      if (!done) id = requestAnimationFrame(paint);
    };
    paint(last);
    return () => cancelAnimationFrame(id);
  }, [value]);
  return <strong ref={el}>{value === null ? "No answers yet" : value.toFixed(1)}</strong>;
}
