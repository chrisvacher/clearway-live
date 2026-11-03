"use client";
import type { LiveSnapshot } from "@/lib/live/types";
import type { TvFlow } from "@/lib/tv/flow";
import { signaturePath, signersOf, sigHeight, sigWidth, strokesOf, wallLayout } from "@/lib/interactions/grid-form-sign";
import { LiveView, make, spring, step, useLiveView, type Spring } from "./view-base";
import "./grid-form-sign.css";

type Card = { el: HTMLElement; x: Spring; y: Spring; o: Spring; going: boolean; inked: boolean; still?: boolean };

// A count that climbs on the make-room spring, never restarting a tick.
export class Count {
  private s = spring(0); private shown = -1;
  constructor(private el: HTMLElement) {}
  set(n: number, instant: boolean) { this.s.t = n; if (instant) { this.s.x = n; this.s.v = 0; } }
  // True while the count is still climbing.
  frame(rate: number, dt: number, snap: boolean) {
    const done = step(this.s, rate, dt, snap);
    const n = Math.round(this.s.x);
    if (n !== this.shown) { this.shown = n; this.el.textContent = String(n); }
    return !done;
  }
}

// INT-10 on the TV (pass 3 change 13). The text's title is the headline; each signature
// arrives on its own with the name under it, one at a time in the arrival flow, and the
// count climbs. Hide fades a name and the rest close the gap. When the wall is full and
// nothing has arrived for cwl-delay-quiet, it rolls slowly, one row per cwl-dur-roll-row,
// down to the newest row and back, never jumping. Reduced motion: no roll, newest in view.
class SignWall extends LiveView {
  private box: HTMLElement; private names: HTMLElement; private wait: HTMLElement; private of: HTMLElement; private how: HTMLElement;
  private count: Count; private cards = new Map<string, Card>();
  private roll = spring(0); private over = 0; private rowStep = 0; private lastArrival = -Infinity; private dir = 1; private pauseUntil = 0; private rolling = false; private rolled = "";
  constructor(root: HTMLElement, session: string) {
    super(root, session);
    root.classList.add("gfs-sign");
    root.innerHTML = '<div class="gfs-names-box"><p class="gfs-wait">Waiting for the first signature</p><div class="gfs-names"></div></div>'
      + '<div class="gfs-sign-side"><p class="gfs-big" aria-live="polite">0</p><p class="gfs-of"></p><p class="gfs-how"></p></div>';
    this.box = root.querySelector(".gfs-names-box")!; this.names = root.querySelector(".gfs-names")!; this.wait = root.querySelector(".gfs-wait")!;
    this.of = root.querySelector(".gfs-of")!; this.how = root.querySelector(".gfs-how")!;
    this.count = new Count(root.querySelector(".gfs-big")!);
  }
  protected draw(frame: LiveSnapshot, fresh: string | null, instant: boolean) {
    const signers = signersOf(frame.state.results), floor = this.floor();
    const strokes = new Map(frame.answers.map(a => [a.id, strokesOf(a.value)]));
    const W = this.box.clientWidth || 1200, gapX = floor * 1.1, gapY = floor * 0.8, rowH = floor * 5.2;
    const cells = wallLayout(signers.length, W, 3, rowH, gapX, gapY);
    signers.forEach((signer, i) => {
      const cell = cells[i];
      let card = this.cards.get(signer.id);
      if (!card || card.going) {
        card?.el.remove();
        const el = make("div", "gfs-name");
        el.innerHTML = '<svg aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" /></svg><span class="nm"></span>';
        el.querySelector("svg")!.setAttributeNS(null, "viewBox", `0 0 ${sigWidth} ${sigHeight}`);
        this.names.appendChild(el);
        card = { el, x: spring(cell.x), y: spring(cell.y), o: spring(instant ? 1 : 0), going: false, inked: false };
        this.cards.set(signer.id, card);
      }
      const ink = strokes.get(signer.id) ?? [];
      // A signature unhidden since this screen last read it comes back as its name until the
      // next snapshot carries its strokes.
      if (ink.length) { card.el.querySelector("path")!.setAttribute("d", signaturePath(ink)); card.inked = true; }
      card.el.classList.toggle("is-sig", card.inked);
      card.el.querySelector(".nm")!.textContent = signer.name;
      card.el.setAttribute("role", "img"); card.el.setAttribute("aria-label", `${signer.name}, signed`);
      card.el.style.width = `${cell.w}px`; card.el.style.height = `${rowH}px`;
      card.x.t = cell.x; card.y.t = cell.y; card.o.t = 1; card.going = false;
    });
    for (const [id, card] of this.cards) if (!signers.some(s => s.id === id) && !card.going) { card.o.t = 0; card.going = true; }
    for (const card of this.cards.values()) card.still = false;
    const rows = Math.ceil(signers.length / 3);
    this.rowStep = rowH + gapY;
    this.over = Math.max(0, rows * rowH + Math.max(0, rows - 1) * gapY - (this.box.clientHeight || 600) + floor);
    this.names.style.height = `${rows * this.rowStep}px`;
    this.wait.classList.toggle("is-off", signers.length > 0);
    const n = Number(frame.state.results.people) || signers.length, here = Math.max(frame.presence?.count ?? 0, n);
    this.count.set(signers.length, instant);
    this.of.textContent = here ? `of ${here} signed` : "signed";
    const closed = frame.session?.state === "closed";
    this.how.textContent = closed ? "Signing closed" : "Sign on your phone";
    // A new name brings the newest row into view; the slow roll waits for quiet.
    if (fresh && this.cards.has(fresh)) { this.lastArrival = performance.now(); this.rolling = false; this.roll.t = this.over; this.moment([this.cards.get(fresh)!.el]); }
    else if (instant || !this.rolling) this.roll.t = this.over;
    if (instant) { this.roll.x = this.roll.t; this.roll.v = 0; }
  }
  protected frame(dt: number, now: number, snap: boolean) {
    const w = this.rate("cwl-dur-make-room");
    let busy = this.count.frame(w, dt, snap);
    for (const [id, card] of this.cards) {
      const done = [step(card.x, w, dt, snap), step(card.y, w, dt, snap), step(card.o, w, dt, snap)].every(Boolean);
      if (done && card.still) continue;
      card.still = done; busy = true;
      card.el.style.transform = `translate(${card.x.x.toFixed(2)}px,${card.y.x.toFixed(2)}px)`;
      card.el.style.opacity = card.o.x >= 0.999 ? "" : Math.max(0, card.o.x).toFixed(3);
      if (card.going && card.o.x < 0.02) { card.el.remove(); this.cards.delete(id); }
    }
    const quiet = this.ms("cwl-delay-quiet", 3000);
    // A full wall keeps the loop awake: it waits for quiet, then rolls.
    if (this.over > 0 && !snap) busy = true;
    if (this.over <= 0 || snap) { this.rolling = false; this.roll.t = this.over; step(this.roll, w, dt, true); }
    else if (now - this.lastArrival > quiet) {
      // The slow roll: one row per cwl-dur-roll-row, a quiet pause at each end.
      if (!this.rolling) { this.rolling = true; this.roll.t = this.roll.x; this.roll.v = 0; this.dir = this.roll.x >= this.over - 1 ? -1 : 1; this.pauseUntil = now + quiet; }
      if (now >= this.pauseUntil) {
        const speed = this.rowStep / (this.ms("cwl-dur-roll-row", 6000) / 1000);
        this.roll.x = Math.max(0, Math.min(this.over, this.roll.x + this.dir * speed * dt)); this.roll.t = this.roll.x;
        if (this.roll.x <= 0 || this.roll.x >= this.over) { this.dir = -this.dir; this.pauseUntil = now + quiet; }
      }
    } else if (!step(this.roll, w, dt, false)) busy = true;
    const rolled = `translateY(${(-this.roll.x).toFixed(2)}px)`;
    if (rolled !== this.rolled) { this.rolled = rolled; this.names.style.transform = rolled; }
    return busy;
  }
}

export function SignView({ session, frame, flow }: { session: string; frame: LiveSnapshot; flow?: TvFlow | null }) {
  const host = useLiveView((root, id) => new SignWall(root, id), session, frame, flow);
  return <div ref={host} className="tv-board" />;
}

// INT-09 on the TV: only the count of responses, as a still structure. The answers never
// reach this screen; the database keeps them out of every snapshot and event.
class FormCount extends LiveView {
  private count: Count; private of: HTMLElement;
  constructor(root: HTMLElement, session: string) {
    super(root, session);
    root.classList.add("gfs-form");
    root.innerHTML = '<p class="gfs-big" aria-live="polite">0</p><p class="gfs-of"></p><p class="gfs-lock"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>Answers stay private. They never appear on this screen.</p>';
    this.count = new Count(root.querySelector(".gfs-big")!); this.of = root.querySelector(".gfs-of")!;
  }
  protected draw(frame: LiveSnapshot, _fresh: string | null, instant: boolean) {
    const n = Number(frame.state.results.people) || 0, here = Math.max(frame.presence?.count ?? 0, n);
    this.count.set(n, instant);
    this.of.textContent = here ? `of ${here} ${here === 1 ? "has" : "have"} answered` : "answered";
  }
  protected frame(dt: number, _now: number, snap: boolean) { return this.count.frame(this.rate("cwl-dur-make-room"), dt, snap); }
}
export function FormView({ session, frame, flow }: { session: string; frame: LiveSnapshot; flow?: TvFlow | null }) {
  const host = useLiveView((root, id) => new FormCount(root, id), session, frame, flow);
  return <div ref={host} className="tv-board" />;
}
