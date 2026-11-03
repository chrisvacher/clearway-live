"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./bars.css";
import { reducedMotion, tokenMs } from "@/lib/tv/board";
import type { TvFlow } from "@/lib/tv/flow";
import { springRate, springStep } from "@/lib/tv/motion";
import type { LiveResults, LiveSnapshot } from "@/lib/live/types";
import { barValue, barsOf, scaleOf, type Bar, type BarKind } from "@/lib/interactions/bars";

// The live bar (pass 3 changes 3 and 4): one component for choice, ranking, 100 points and
// statements. Each row's place and each bar's length run on their own spring that
// retargets from where it is without losing speed: rows glide on cwl-dur-bar-trade, bars grow
// on cwl-dur-bar-grow, the cut line slides on cwl-dur-cut-line. Bars grow from zero only on
// the session's first appearance. The value sits beside the bar, never inside it. Every
// number comes from the server. On the TV it follows the arrival flow; a mirror or a phone's
// TV view draws each frame as it comes (and the mirror's reduced motion puts it in place).
type Spring = { x: number; v: number; t: number };
type Row = { y: Spring; w: Spring; el: HTMLDivElement | null; fill: HTMLElement | null };
const spring = (x: number): Spring => ({ x, v: 0, t: x });
function step(s: Spring, omega: number, dt: number, snap: boolean, eps: number) {
  if (snap || (Math.abs(s.x - s.t) < eps && Math.abs(s.v) < eps)) { s.x = s.t; s.v = 0; return true; }
  [s.x, s.v] = springStep(s.x, s.v, s.t, omega, dt); return false;
}

// The results this view shows: the arrival flow's current frame on the TV, else the frame.
function useResults(session: string, frame: LiveSnapshot | null, flow?: TvFlow | null) {
  const pick = (f: LiveSnapshot | null | undefined) => f && f.state.live_session_id === session && f.session?.id === session ? f : null;
  const [shown, setShown] = useState<LiveSnapshot | null>(() => pick(flow ? flow.current?.frame : frame));
  useEffect(() => {
    if (!flow) return;
    if (flow.current) { const f = pick(flow.current.frame); if (f) setShown(f); }
    return flow.subscribe(next => { const f = pick(next.frame); if (f) setShown(f); });
  }, [flow, session]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!flow) { const f = pick(frame); if (f) setShown(f); } }, [flow, frame, session]); // eslint-disable-line react-hooks/exhaustive-deps
  return shown;
}

// The board's height and the room's type floor, read from the page.
function useBox(host: React.RefObject<HTMLDivElement | null>) {
  const [box, setBox] = useState({ h: 0, floor: 36 });
  useLayoutEffect(() => {
    const el = host.current; if (!el) return;
    const read = () => setBox(b => { const h = el.clientHeight, floor = parseFloat(getComputedStyle(el).fontSize) || 36; return b.h === h && b.floor === floor ? b : { h, floor }; });
    read();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(read); observer.observe(el); return () => observer.disconnect();
  }, [host]);
  return box;
}

type Shown = Bar & { leaving?: boolean };
export function LiveBars({ kind, session, frame, flow }: { kind: Exclude<BarKind, "scale">; session: string; frame: LiveSnapshot | null; flow?: TvFlow | null }) {
  const host = useRef<HTMLDivElement>(null), rows = useRef(new Map<string, Row>()), cut = useRef<HTMLDivElement>(null), cutY = useRef<Spring | null>(null);
  const raf = useRef(0), wake = useRef<() => void>(() => {});
  const shown = useResults(session, frame, flow), results: LiveResults | null = shown?.state.results ?? null;
  const bars = barsOf(results), people = results?.people ?? 0;
  const cutAt = kind === "points" && typeof results?.cut === "number" && results.cut > 0 && results.cut < bars.length ? results.cut : 0;
  const cutLabel = typeof results?.cut_label === "string" ? results.cut_label : "";
  const { h, floor } = useBox(host), s = floor / 36;
  const n = Math.max(bars.length, 1), rowH = h ? Math.min(104 * s, h / n) : 104 * s;
  const barH = Math.max(36 * s * 0.75, Math.min(76 * s, rowH - 22 * s));
  // Labels wrap to two lines and then end. They sit at tv-body while two lines of it fit the
  // row, else at the floor (statements always, being sentences); a row too short for two
  // floor lines keeps one. Never smaller than the floor.
  const twoLines = (size: number) => size * 1.12 * 2;
  const bodyLabels = kind !== "statements" && rowH >= Math.max(92 * s, twoLines(floor * 44 / 36));
  const lines = rowH >= twoLines(bodyLabels ? floor * 44 / 36 : floor) ? 2 : 1;

  // The row geometry goes to the stylesheet as custom properties, before the first paint.
  useLayoutEffect(() => {
    const el = host.current; if (!el) return;
    el.style.setProperty("--bars-row-h", `${rowH}px`); el.style.setProperty("--bars-bar-h", `${barH}px`); el.style.setProperty("--bars-label-lines", String(lines));
  }, [rowH, barH, lines]);

  // Rows that leave (a hidden option) fade where they stand, then go.
  const [leaving, setLeaving] = useState<Shown[]>([]);
  const last = useRef<Bar[]>([]);
  useLayoutEffect(() => {
    const keys = new Set(bars.map(b => b.key)), gone = last.current.filter(b => !keys.has(b.key));
    last.current = bars;
    if (!gone.length) { if (leaving.some(b => keys.has(b.key))) setLeaving(l => l.filter(b => !keys.has(b.key))); return; }
    setLeaving(l => [...l.filter(b => !keys.has(b.key) && !gone.some(g => g.key === b.key)), ...gone.map(b => ({ ...b, leaving: true }))]);
    const wait = host.current ? tokenMs(host.current, "cwl-dur-hide") + 50 : 450;
    const timer = setTimeout(() => { setLeaving(l => l.filter(b => !gone.some(g => g.key === b.key))); gone.forEach(g => { if (!last.current.some(b => b.key === g.key)) rows.current.delete(g.key); }); }, wait);
    return () => clearTimeout(timer);
  }, [results]); // eslint-disable-line react-hooks/exhaustive-deps

  // Targets: each row's place and each bar's length. A new row starts at its place and its
  // bar grows from zero (a session's first appearance, or an option added later). Nothing
  // else ever restarts: a new target bends the motion already under way.
  const rowOf = (key: string, place: number) => {
    let row = rows.current.get(key);
    if (!row) { row = { y: spring(place * rowH), w: spring(0), el: null, fill: null }; rows.current.set(key, row); }
    return row;
  };
  useLayoutEffect(() => {
    const el = host.current; if (!el || !results) return;
    const snap = reducedMotion(el);
    bars.forEach((bar, i) => {
      const row = rowOf(bar.key, i);
      row.y.t = i * rowH; row.w.t = Math.max(0, Math.min(1, bar.fraction)) * 100;
      if (snap) { row.y.x = row.y.t; row.w.x = row.w.t; row.y.v = row.w.v = 0; }
    });
    if (cutAt) {
      const target = cutAt * rowH;
      if (!cutY.current || snap) cutY.current = spring(target); else cutY.current.t = target;
    } else cutY.current = null;
    wake.current();
  }, [results, rowH]); // eslint-disable-line react-hooks/exhaustive-deps

  // One frame loop while anything moves; it stops when everything has settled.
  useEffect(() => {
    const el = host.current; if (!el) return;
    const rates = { trade: springRate(tokenMs(el, "cwl-dur-bar-trade") || 700), grow: springRate(tokenMs(el, "cwl-dur-bar-grow") || 600), cut: springRate(tokenMs(el, "cwl-dur-cut-line") || 700) };
    let lastAt = performance.now();
    const paint = () => {
      rows.current.forEach(row => {
        if (row.el) row.el.style.transform = `translateY(${row.y.x.toFixed(2)}px)`;
        if (row.fill) row.fill.style.width = `${Math.max(0, Math.min(100, row.w.x)).toFixed(3)}%`;
      });
      if (cut.current && cutY.current) cut.current.style.transform = `translateY(${(cutY.current.x - 2).toFixed(2)}px)`;
    };
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - lastAt) / 1000)); lastAt = now;
      const snap = reducedMotion(el);
      let done = true;
      rows.current.forEach(row => { done = step(row.y, rates.trade, dt, snap, 0.05) && done; done = step(row.w, rates.grow, dt, snap, 0.02) && done; });
      if (cutY.current) done = step(cutY.current, rates.cut, dt, snap, 0.05) && done;
      paint();
      raf.current = done || !el.isConnected ? 0 : requestAnimationFrame(tick);
    };
    wake.current = () => { if (!raf.current) { lastAt = performance.now(); raf.current = requestAnimationFrame(tick); } paint(); };
    wake.current();
    return () => { cancelAnimationFrame(raf.current); raf.current = 0; wake.current = () => {}; };
  }, []);

  const list: Shown[] = [...bars, ...leaving];
  const keys = [...list].sort((a, b) => a.key.localeCompare(b.key));
  return <div ref={host} className={`tv-board tv-bars is-${kind}${cutAt ? " has-cut" : ""}`} data-empty={String(!people)} data-kind={kind} role="list" aria-label="Results">
    {keys.map(bar => {
      const value = barValue(kind, bar, people), place = bars.findIndex(b => b.key === bar.key);
      return <div key={bar.key} role="listitem" data-key={bar.key} data-place={bar.leaving ? undefined : place + 1}
        className={`tv-bar${bar.leader && !bar.leaving ? " is-leader" : ""}${bar.leaving ? " is-leaving" : ""}${bodyLabels ? " is-body" : ""}`}
        ref={el => {
          const row = rowOf(bar.key, place < 0 ? 0 : place); row.el = el; row.fill = el?.querySelector<HTMLElement>(".tv-bar-fill") ?? null;
          if (el) { el.style.transform = `translateY(${row.y.x.toFixed(2)}px)`; if (row.fill) row.fill.style.width = `${Math.max(0, Math.min(100, row.w.x)).toFixed(3)}%`; }
        }}
        aria-hidden={bar.leaving || undefined}>
        {kind === "ranking" && <span className="tv-bar-place">{bar.leaving ? "" : place + 1}</span>}
        <span className="tv-bar-label">{bar.text}</span>
        <span className="tv-bar-track"><span className="tv-bar-fill" /></span>
        <span className="tv-bar-value">{value.main}{value.small && <small>{value.main ? " " : ""}{value.small}</small>}</span>
      </div>;
    })}
    {cutAt > 0 && <div ref={cut} className="tv-cut" aria-label={cutLabel}><span className="tv-cut-label">{cutLabel}</span></div>}
  </div>;
}

// INT-05: the average large, the spread as live columns beneath, and an average marker
// that slides along the axis. Columns rise from where they are on cwl-dur-bar-grow; the
// marker and the large number ride the same spring.
export function LiveScale({ session, frame, flow }: { session: string; frame: LiveSnapshot | null; flow?: TvFlow | null }) {
  const host = useRef<HTMLDivElement>(null), cols = useRef<HTMLDivElement>(null), raf = useRef(0), wake = useRef<() => void>(() => {});
  const shown = useResults(session, frame, flow), results = shown?.state.results ?? null, scale = scaleOf(results);
  const options = (shown?.session?.options ?? frame?.session?.options ?? {}) as { max?: number; low?: string; high?: string };
  const max = scale?.max ?? options.max ?? 5, people = results?.people ?? 0;
  const heights = useRef<Spring[]>([]), avg = useRef<Spring | null>(null);
  const big = useRef<HTMLSpanElement>(null), chip = useRef<HTMLSpanElement>(null), marker = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = host.current; if (!el) return;
    const snap = reducedMotion(el);
    while (heights.current.length < max) heights.current.push(spring(0));
    heights.current.length = max;
    (scale?.columns ?? []).forEach((c, i) => { const s = heights.current[i]; if (s) { s.t = c.fraction; if (snap) { s.x = s.t; s.v = 0; } } });
    if (scale?.average != null) {
      if (!avg.current || snap) avg.current = spring(scale.average); else avg.current.t = scale.average;
    } else avg.current = null;
    wake.current();
  }, [results, max]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = host.current; if (!el) return;
    const grow = springRate(tokenMs(el, "cwl-dur-bar-grow") || 600);
    let lastAt = performance.now(), text = "";
    const paint = () => {
      const box = cols.current; if (!box) return;
      const items = box.querySelectorAll<HTMLElement>(".tv-col"), room = Math.max(0, box.clientHeight - (parseFloat(getComputedStyle(box).fontSize) || 36) * 2.2);
      items.forEach((col, i) => {
        const px = Math.max(0, heights.current[i]?.x ?? 0) * room;
        (col.querySelector(".tv-col-fill") as HTMLElement).style.height = `${px.toFixed(2)}px`;
        (col.querySelector(".tv-col-count") as HTMLElement).style.transform = `translateY(${(-px).toFixed(2)}px)`;
      });
      if (avg.current && marker.current && items.length) {
        const w = box.clientWidth, gap = items.length > 1 ? (items[1].offsetLeft - items[0].offsetLeft - items[0].offsetWidth) : 0, cw = items[0].offsetWidth;
        const x = (avg.current.x - 1) * (cw + gap) + cw / 2;
        marker.current.style.transform = `translateX(${Math.max(0, Math.min(w, x)).toFixed(2)}px)`;
        const t = avg.current.x.toFixed(1);
        if (t !== text) { text = t; if (big.current) big.current.textContent = t; if (chip.current) chip.current.textContent = t; }
      }
    };
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - lastAt) / 1000)); lastAt = now;
      const snap = reducedMotion(el);
      let done = true;
      heights.current.forEach(s => { done = step(s, grow, dt, snap, 0.002) && done; });
      if (avg.current) done = step(avg.current, grow, dt, snap, 0.002) && done;
      paint();
      raf.current = done || !el.isConnected ? 0 : requestAnimationFrame(tick);
    };
    wake.current = () => { if (!raf.current) { lastAt = performance.now(); raf.current = requestAnimationFrame(tick); } };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => paint()) : null;
    if (cols.current) observer?.observe(cols.current);
    wake.current();
    return () => { cancelAnimationFrame(raf.current); raf.current = 0; wake.current = () => {}; observer?.disconnect(); };
  }, []);

  const columns = scale?.columns ?? Array.from({ length: max }, (_, i) => ({ key: String(i + 1), value: i + 1, count: 0, fraction: 0 }));
  const has = scale?.average != null;
  return <div ref={host} className="tv-board tv-scale" data-empty={String(!people)} data-kind="scale">
    <div className="tv-scale-average" aria-live="off">
      {has ? <><span ref={big} className="tv-scale-number">{scale!.average!.toFixed(1)}</span><span className="tv-scale-of">average of {people}</span></>
        : <span className="tv-scale-none">No average yet</span>}
    </div>
    <div className="tv-scale-chart">
      <div ref={cols} className="tv-scale-cols">
        {columns.map(c => <div key={c.key} className="tv-col" data-value={c.value}><span className="tv-col-fill" /><b className="tv-col-count">{c.count}</b></div>)}
        <div ref={marker} className={`tv-scale-marker${has ? "" : " is-off"}`} aria-hidden="true"><span ref={chip}>{has ? scale!.average!.toFixed(1) : ""}</span></div>
      </div>
      <div className="tv-scale-axis">{columns.map(c => <span key={c.key}>{c.value}</span>)}</div>
      <div className="tv-scale-ends"><span>1 · {options.low ?? "Not at all"}</span><span>{max} · {options.high ?? "Completely"}</span></div>
    </div>
  </div>;
}
