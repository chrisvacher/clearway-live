"use client";
import { useEffect, useRef } from "react";
import type { LiveSnapshot } from "@/lib/live/types";
import type { Shown, TvFlow } from "@/lib/tv/flow";
import { springRate, springStep } from "@/lib/tv/motion";
import { reducedMotion, tokenMs } from "@/lib/tv/board";

// One value on a critically damped spring. A new target bends the motion already under
// way: velocity carries over, so retargeting never restarts it (pass 3 change 4).
export type Spring = { x: number; v: number; t: number };
export const spring = (x: number): Spring => ({ x, v: 0, t: x });
export function step(s: Spring, rate: number, dt: number, snap: boolean) {
  if (snap || (Math.abs(s.x - s.t) < 0.05 && Math.abs(s.v) < 0.05)) { s.x = s.t; s.v = 0; return true; }
  [s.x, s.v] = springStep(s.x, s.v, s.t, rate, dt);
  return false;
}
export function make(tag: string, className: string, text?: string) {
  const el = document.createElement(tag); el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// An imperative view drawn from the server's results, one per session layer. It keeps
// its own frame loop and only ever moves from what is on screen to what arrives. The loop
// sleeps once everything has settled and wakes with the next change, so a still screen
// costs the TV nothing.
export abstract class LiveView {
  private raf = 0; private lastTick = 0; private settle?: ReturnType<typeof setTimeout>;
  private tokens = new Map<string, number>(); private stopped = false;
  protected first = true;
  private readonly tick = (now: number) => {
    this.raf = 0;
    if (this.stopped || !this.root.isConnected) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTick) / 1000)); this.lastTick = now;
    if (this.frame(dt, now, reducedMotion(this.root))) this.raf = requestAnimationFrame(this.tick);
  };
  constructor(protected root: HTMLElement, protected session: string) { this.wake(); }
  destroy() { this.stopped = true; cancelAnimationFrame(this.raf); clearTimeout(this.settle); }
  // Starts the frame loop again after a change; a loop already running carries on.
  protected wake() {
    if (this.raf || this.stopped) return;
    this.lastTick = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }
  show(shown: Shown) {
    const frame = shown.frame;
    if (frame.state.live_session_id !== this.session || frame.session?.id !== this.session) return;
    const instant = this.first; this.first = false;
    // A flow starting during a newest-arrival moment ends it, so Lime never hops.
    const fresh = shown.lone && !shown.replay ? shown.fresh[shown.fresh.length - 1] ?? null : null;
    if (!fresh && shown.fresh.length && this.root.dataset.newest === "on") this.endMoment();
    this.root.dataset.empty = String(!frame.state.results.total);
    this.draw(frame, fresh, instant, shown);
    this.wake();
  }
  // Timing tokens, read once: reading computed style every frame forces a style pass,
  // which on a busy TV delays the next arrival.
  protected ms(name: string, fallback: number) {
    let value = this.tokens.get(name);
    if (value === undefined) { value = tokenMs(this.root, name) || fallback; this.tokens.set(name, value); }
    return value;
  }
  protected rate(name: string) { return springRate(this.ms(name, 600)); }
  protected level(name: string, fallback: number) {
    let value = this.tokens.get(name);
    if (value === undefined) { value = parseFloat(getComputedStyle(this.root).getPropertyValue(`--${name}`)) || fallback; this.tokens.set(name, value); }
    return value;
  }
  // The floor of TV type in stage pixels, following room size.
  protected floor() { return parseFloat(getComputedStyle(this.root).fontSize) || 36; }
  // The newest-arrival moment: Lime held for cwl-dur-new-hold, the LIVE mark meanwhile Off-White.
  protected moment(els: HTMLElement[]) {
    if (!els.length) return;
    clearTimeout(this.settle);
    this.root.querySelectorAll(".is-new").forEach(el => el.classList.remove("is-new"));
    els.forEach(el => el.classList.add("is-new"));
    this.root.dataset.newest = "on";
    this.settle = setTimeout(() => this.endMoment(), this.ms("cwl-dur-new-hold", 1200));
  }
  protected endMoment() {
    clearTimeout(this.settle);
    this.root.querySelectorAll(".is-new").forEach(el => el.classList.remove("is-new"));
    this.root.dataset.newest = "off";
  }
  protected abstract draw(frame: LiveSnapshot, fresh: string | null, instant: boolean, shown: Shown): void;
  // One frame of motion. True while anything is still moving (or waiting to move).
  protected abstract frame(dt: number, now: number, snap: boolean): boolean;
}

// On the TV the view follows the arrival flow; a mirror or a phone's TV view draws each frame at once.
export function useLiveView(make: (root: HTMLElement, session: string) => LiveView, session: string, frame: LiveSnapshot | null, flow?: TvFlow | null) {
  const host = useRef<HTMLDivElement>(null), view = useRef<LiveView | null>(null), build = useRef(make);
  useEffect(() => {
    const root = host.current!, next = build.current(root, session);
    view.current = next;
    const off = flow ? flow.subscribe(shown => next.show(shown)) : undefined;
    if (flow?.current) next.show(flow.current);
    return () => { off?.(); next.destroy(); view.current = null; root.replaceChildren(); };
  }, [session, flow]);
  useEffect(() => { if (!flow && frame && view.current) view.current.show({ frame, fresh: [], lone: false, replay: true }); }, [flow, frame]);
  return host;
}
