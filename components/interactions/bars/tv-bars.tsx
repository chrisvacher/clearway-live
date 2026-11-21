"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./bars.css";
import { reducedMotion, tokenMs } from "@/lib/tv/board";
import { npsSummary, scaleDotLayout, signedScore, type ScaleDot } from "@/lib/interactions/scale";
import type { TvFlow } from "@/lib/tv/flow";
import { springRate, springStep } from "@/lib/tv/motion";
import type { LiveResults, LiveSnapshot } from "@/lib/live/types";
import { barValue, barsOf, scaleOf, widestValues, type Bar, type BarKind } from "@/lib/interactions/bars";

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
  // The last row keeps room under it for descenders ("agree"), so the board never cuts them.
  const n = Math.max(bars.length, 1), rowH = h ? Math.min(104 * s, (h - floor * 0.25) / n) : 104 * s;
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

  // The value column is at least as wide as the widest value this kind can show, measured in
  // the TV's own type (a hidden ruler), and as any value now showing; the label column gives
  // way to it. So a narrow board (the join strip, a larger room size) wraps or ends a label,
  // never clips a value.
  const widest = widestValues(kind, people);
  useLayoutEffect(() => {
    const el = host.current; if (!el) return;
    const fit = () => {
      // Measured on screen, then back in stage pixels: the TV's stage is scaled to fit its screen.
      const range = document.createRange(), scale = el.getBoundingClientRect().width / (el.offsetWidth || 1) || 1;
      const natural = (node: Element) => { range.selectNodeContents(node); return range.getBoundingClientRect().width / scale; };
      const need = Math.max(0, ...[...el.querySelectorAll(".tv-bar-ruler > span, .tv-bar:not(.is-leaving) .tv-bar-value")].map(natural));
      const next = `${Math.ceil(need) + 2}px`;
      if (el.style.getPropertyValue("--bars-value-fit") !== next) el.style.setProperty("--bars-value-fit", next);
    };
    fit();
    let live = true;
    void document.fonts?.ready.then(() => { if (live) fit(); });
    return () => { live = false; };
  }, [results, floor, kind, people]);

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
    <div className="tv-bar-ruler" aria-hidden="true">
      {widest.map((value, i) => <span key={i}>{value.main}{value.small && <small>{value.main ? " " : ""}{value.small}</small>}</span>)}
    </div>
  </div>;
}

// Every answer has a session-local opaque key, so moving a slider moves the same dot.
export function LiveScale({ session, frame, flow }: { session: string; frame: LiveSnapshot | null; flow?: TvFlow | null }) {
  const host = useRef<HTMLDivElement>(null), plot = useRef<HTMLDivElement>(null);
  const shown = useResults(session, frame, flow), results = shown?.state.results ?? null, scale = scaleOf(results);
  const options = (shown?.session?.options ?? frame?.session?.options ?? {}) as { max?: number; low?: string; high?: string; nps?: boolean };
  const max = scale?.max ?? options.max ?? 5, bands = max === 10 && options.nps === true;
  const columns = scale?.columns ?? Array.from({ length: max }, (_, i) => ({ key: String(i + 1), value: i + 1, count: 0, fraction: 0 }));
  const dots: ScaleDot[] = scale?.dots ?? columns.flatMap(c => Array.from({ length: c.count }, (_, i) => ({ key: `${c.value}-${i}`, value: c.value })));
  const summary = scale?.nps ?? npsSummary(dots.map(d => d.value));
  const [box, setBox] = useState({ width: 1600, height: 400, floor: 36 });
  const motion = useRef(new Map<string, { x: Spring; y: Spring; el: HTMLSpanElement | null }>()), average = useRef<Spring | null>(null);
  const marker = useRef<HTMLDivElement>(null), number = useRef<HTMLSpanElement>(null), raf = useRef(0), wake = useRef(() => {});
  const [gone, setGone] = useState<ScaleDot[]>([]), previous = useRef<ScaleDot[]>([]);
  const [newest, setNewest] = useState<string | null>(null);
  const layout = scaleDotLayout(dots, max, box.width, box.height, box.floor, bands);
  useLayoutEffect(() => {
    const el = plot.current; if (!el) return;
    const read = () => { const floor = parseFloat(getComputedStyle(el).fontSize) || 36;
      setBox(old => old.width === el.clientWidth && old.height === el.clientHeight && old.floor === floor ? old : { width: el.clientWidth, height: el.clientHeight, floor }); };
    read(); const observer = new ResizeObserver(read); observer.observe(el); return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const last = previous.current, keys = new Set(dots.map(d => d.key));
    const removed = last.filter(d => !keys.has(d.key));
    previous.current = dots;
    if (removed.length) setGone(old => [...old.filter(d => !keys.has(d.key)), ...removed]);
    const arrival = dots.find(d => !last.some(p => p.key === d.key && p.value === d.value));
    const avgX = scale?.average == null ? null : (scale.average - 1) * box.width / (max - 1);
    // Sunrise's average line keeps its 48px quiet space. A nearby dot skips its live moment.
    const safe = arrival && (bands || avgX === null || Math.abs((arrival.value - 1) * box.width / (max - 1) - avgX) >= 48 + layout.size / 2);
    if (safe) setNewest(arrival.key);
    const hold = host.current ? tokenMs(host.current, "cwl-dur-new-hold") : 1400;
    const timer = setTimeout(() => setNewest(null), hold);
    const hide = setTimeout(() => { setGone([]); removed.forEach(d => motion.current.delete(d.key)); }, host.current ? tokenMs(host.current, "cwl-dur-hide") : 400);
    return () => { clearTimeout(timer); clearTimeout(hide); };
  }, [results]); // eslint-disable-line react-hooks/exhaustive-deps
  const dotMotion = (key: string, x: number, y: number) => {
    let dot = motion.current.get(key);
    if (!dot) { dot = { x: spring(x), y: spring(y), el: null }; motion.current.set(key, dot); }
    return dot;
  };
  useLayoutEffect(() => {
    layout.positions.forEach(p => { const d = dotMotion(p.key, p.x, p.y); d.x.t = p.x; d.y.t = p.y; });
    if (scale?.average == null) average.current = null;
    else if (!average.current) average.current = spring(scale.average);
    else average.current.t = scale.average;
    wake.current();
  }, [results, box, max]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = host.current; if (!el) return;
    const rate = springRate(tokenMs(el, "cwl-dur-bar-trade") || 700); let at = performance.now();
    const paint = () => {
      motion.current.forEach(d => { if (d.el) d.el.style.transform = `translate(${d.x.x.toFixed(2)}px, ${d.y.x.toFixed(2)}px) translate(-50%, -50%)`; });
      if (average.current) {
        if (marker.current && plot.current) marker.current.style.left = `${(average.current.x - 1) * plot.current.clientWidth / (max - 1)}px`;
        if (number.current && !bands) number.current.textContent = average.current.x.toFixed(1);
      }
    };
    const tick = (now: number) => {
      const dt = Math.min(.05, Math.max(0, (now - at) / 1000)); at = now; let done = true; const snap = reducedMotion(el);
      motion.current.forEach(d => { done = step(d.x, rate, dt, snap, .05) && done; done = step(d.y, rate, dt, snap, .05) && done; });
      if (average.current) done = step(average.current, rate, dt, snap, .002) && done;
      paint(); raf.current = done || !el.isConnected ? 0 : requestAnimationFrame(tick);
    };
    wake.current = () => { paint(); if (!raf.current) { at = performance.now(); raf.current = requestAnimationFrame(tick); } }; wake.current();
    return () => { cancelAnimationFrame(raf.current); raf.current = 0; wake.current = () => {}; };
  }, [max, bands]);
  const has = scale?.average != null, total = columns.reduce((n, c) => n + c.count, 0);
  return <div ref={host} className={`tv-board tv-scale${bands ? " has-nps" : ""}`} data-empty={String(!total)} data-kind="scale" data-layout={layout.columns ? "columns" : "dots"}>
    <div className="tv-scale-average" aria-live="off">{has ? <><span ref={bands ? undefined : number} className="tv-scale-number">{bands ? signedScore(summary.score ?? 0) : scale.average!.toFixed(1)}</span><span className="tv-scale-of">{bands ? <>NPS-style<br />score</> : <>average of {total}</>}</span></> : <span className="tv-scale-none">No answers yet</span>}</div>
    <div className="tv-scale-chart">
      <div ref={plot} className="tv-scale-plot">
        {bands && <div className="tv-scale-bands">{[{ count: summary.low, label: "1 to 6", width: 6 }, { count: summary.middle, label: "7 or 8", width: 2 }, { count: summary.high, label: "9 or 10", width: 2 }].map((band, i) => <div key={band.label} className={`tv-scale-band is-band-${i}`}><b>{band.count}</b><span>{band.label}</span></div>)}</div>}
        {layout.columns ? <div className="tv-scale-count-columns">{columns.map(c => <div key={c.key} ref={el => { if (el) { el.style.left = `${(c.value - 1) * 100 / (max - 1)}%`; el.style.height = `${c.fraction * Math.max(0, box.height - (bands ? 150 : 60))}px`; } }}><b>{c.count}</b></div>)}</div>
          : [...layout.positions, ...gone.filter(d => !dots.some(p => p.key === d.key)).map(d => ({ ...d, x: motion.current.get(d.key)?.x.x ?? 0, y: motion.current.get(d.key)?.y.x ?? 0 }))].map(d => {
            const leaving = gone.some(g => g.key === d.key) && !dots.some(g => g.key === d.key);
            return <span key={d.key} data-dot={d.key} data-value={d.value} className={`tv-scale-dot${leaving ? " is-leaving" : ""}${newest === d.key ? " is-new" : ""}`} ref={el => { if (el) { el.style.width = `${layout.size}px`; el.style.height = `${layout.size}px`; } const m = dotMotion(d.key, d.x, d.y); m.el = el; if (el) el.style.transform = `translate(${m.x.x}px, ${m.y.x}px) translate(-50%, -50%)`; }} />;
          })}
        {!bands && has && <div ref={marker} className="tv-scale-average-line tv-scale-marker" aria-hidden="true" />}
      </div>
      <div className="tv-scale-track">{columns.map(c => <i key={c.key} className="tv-col" ref={el => { if (el) el.style.left = `${(c.value - 1) * 100 / (max - 1)}%`; }}><b className="tv-col-count sr-only">{c.count}</b></i>)}</div>
      <div className="tv-scale-axis">{columns.map(c => <span key={c.key} ref={el => { if (el) el.style.left = `${(c.value - 1) * 100 / (max - 1)}%`; }}>{c.value}</span>)}</div>
      <div className="tv-scale-ends"><span>1 · {options.low ?? "Not at all"}</span><span>{max} · {options.high ?? "Completely"}</span></div>
    </div>
  </div>;
}
