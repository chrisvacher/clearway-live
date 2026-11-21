"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { TvViewProps } from "@/components/interactions/tv-views";
import { beforeAfterOf, beforeAfterOptions, beforeAfterSummary, changeLabel } from "@/lib/interactions/before-after";
import { reducedMotion, tokenMs } from "@/lib/tv/board";
import { springRate, springStep } from "@/lib/tv/motion";
import "./before-after.css";

// This view accepts aggregate counts only. Slot keys encode side/value/stack, never a person or pair.
export function BeforeAfterTv({ session, frame, flow }: TvViewProps) {
  const [shown, setShown] = useState(frame);
  useEffect(() => {
    if (!flow) { setShown(frame); return; }
    if (flow.current?.frame.session?.id === session) setShown(flow.current.frame);
    return flow.subscribe(next => { if (next.frame.session?.id === session) setShown(next.frame); });
  }, [flow, frame, session]);
  const o = beforeAfterOptions(shown.session?.options), result = beforeAfterOf(shown.state.results) ?? beforeAfterSummary([], [], o.max);
  const host = useRef<HTMLDivElement>(null), plot = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(440), [floor, setFloor] = useState(36);
  useLayoutEffect(() => { const el = plot.current; if (!el) return; const read = () => { setHeight(el.clientHeight); setFloor(parseFloat(getComputedStyle(el).fontSize) || 36); }; read(); const observer = new ResizeObserver(read); observer.observe(el); return () => observer.disconnect(); }, []);
  const topCount = Math.max(1, ...result.before.columns, ...result.after.columns);
  const diameter = Math.min(56, (height - 150 - Math.max(0, topCount - 1) * 10) / topCount), columns = diameter < floor;
  const size = Math.max(floor, diameter), pitch = size + 10;
  const [motion, setMotion] = useState({ before: result.before.average, after: result.after.average });
  const spring = useRef({ before: { x: result.before.average ?? 1, v: 0 }, after: { x: result.after.average ?? 1, v: 0 } });
  useEffect(() => {
    const el = host.current; if (!el) return;
    if (reducedMotion(el)) { setMotion({ before: result.before.average, after: result.after.average }); return; }
    let raf = 0, last = performance.now(); const rate = springRate(tokenMs(el, "cwl-dur-bar-trade") || 700);
    const tick = (now: number) => {
      const dt = Math.min(.05, (now - last) / 1000); last = now; let done = true;
      (["before", "after"] as const).forEach(side => { const target = result[side].average; if (target === null) return; const s = spring.current[side];
        [s.x, s.v] = springStep(s.x, s.v, target, rate, dt); if (Math.abs(s.x - target) > .001 || Math.abs(s.v) > .001) done = false; else { s.x = target; s.v = 0; } });
      setMotion({ before: result.before.average === null ? null : spring.current.before.x, after: result.after.average === null ? null : spring.current.after.x });
      if (!done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [result.before.average, result.after.average]); // eslint-disable-line react-hooks/exhaustive-deps
  const percent = (value: number) => (value - 1) * 100 / Math.max(1, result.max - 1);
  const direction = (result.change ?? 0) < 0 ? TrendingDown : TrendingUp, Trend = direction;
  return <div ref={host} className="tv-board ba-tv" data-kind="before_after" data-empty={String(!result.before.count && !result.after.count)} data-aggregate-only="true" data-layout={columns ? "columns" : "dots"}>
    {o.show_change && result.change !== null && <div className="ba-change"><Trend aria-hidden="true" />{changeLabel(result.change)}</div>}
    <div className="ba-key">{(["after", "before"] as const).map(side => <span key={side}><i className={`ba-dot is-${side}`} /><span>{side === "before" ? o.before_label : o.after_label} <b>{result[side].average?.toFixed(1) ?? "·"}</b></span></span>)}</div>
    <div ref={plot} className="ba-plot">
      <div className="ba-track" />
      {motion.before !== null && motion.after !== null && <div className="ba-move" ref={el => { if (el && motion.before !== null && motion.after !== null) { el.style.left = `${percent(Math.min(motion.before, motion.after))}%`; el.style.width = `${Math.abs(motion.after - motion.before) * 100 / (result.max - 1)}%`; } }} />}
      {Array.from({ length: result.max }, (_, i) => <span className="ba-tick" key={i} ref={el => { if (el) el.style.left = `${percent(i + 1)}%`; }}><i />{i + 1}</span>)}
      {(["before", "after"] as const).flatMap(side => result[side].columns.flatMap((count, index) => columns ? [<div key={`${side}-${index}`} className={`ba-column is-${side}`} ref={el => { if (el) { el.style.left = `calc(${percent(index + 1)}% + ${side === "before" ? -20 : 20}px)`; el.style.height = `${Math.max(0, height - 170) * count / topCount}px`; } }}><b>{count}</b></div>]
        : Array.from({ length: count }, (_, level) => <i key={`${side}-${index}-${level}`} className={`ba-dot ba-plot-dot is-${side}`} ref={el => { if (el) { el.style.left = `calc(${percent(index + 1)}% + ${side === "before" ? -32 : 32}px)`; el.style.bottom = `${88 + level * pitch}px`; el.style.width = `${size}px`; el.style.height = `${size}px`; } }} />)))}
      {(["before", "after"] as const).map(side => motion[side] === null ? null : <div key={side} className={`ba-average is-${side}`} ref={el => { if (el) el.style.left = `${percent(motion[side]!)}%`; }}><span>{side === "before" ? o.before_label : o.after_label} {motion[side]!.toFixed(1)}</span></div>)}
    </div>
  </div>;
}
