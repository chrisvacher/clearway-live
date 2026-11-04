"use client";
import type { LiveSnapshot } from "@/lib/live/types";
import type { TvFlow } from "@/lib/tv/flow";
import { fitWall, signaturePath, signersOf, sigHeight, sigWidth, strokesOf, wallLayout } from "@/lib/interactions/grid-form-sign";
import { LiveView, make, spring, step, useLiveView, type Spring } from "./view-base";
import { reducedMotion } from "@/lib/tv/board";
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

// The 1080p TV minimum in stage pixels: names never shrink below it (Design system, TV type).
const tvMinimum = 36;
// The most a card, or the rolling wall, travels in one frame (stage pixels). A reflow can send a
// card many rows away; it still glides there on its spring, only never faster than this, so
// nothing on the wall jumps however far it goes or however slow a frame is.
const maxStep = 48;
// One spring step (or a pair, moving together), its travel this frame held to maxStep.
function glide(springs: Spring[], rate: number, dt: number, snap: boolean) {
  const from = springs.map(s => s.x);
  const done = springs.map(s => step(s, rate, dt, snap)).every(Boolean);
  if (snap) return done;
  const moved = Math.hypot(...springs.map((s, i) => s.x - from[i]));
  if (moved <= maxStep) return done;
  const k = maxStep / moved;
  springs.forEach((s, i) => { s.x = from[i] + (s.x - from[i]) * k; s.v *= k; });
  return false;
}

// INT-10 on the TV (pass 3 change 13). The text's title is the headline; each signature
// arrives on its own with the name under it, one at a time in the arrival flow, and the
// count climbs. Every signer has a place: as names arrive the cards reflow into more
// columns and shrink toward the TV minimum, gliding and resizing on the make-room spring.
// Past what the wall holds at the minimum, it counts the rest ("+ 4 more") and, once nothing
// has arrived for cwl-delay-quiet, rolls slowly, one row per cwl-dur-roll-row, down to the
// newest row and back, never jumping. Hide fades a name and the rest close the gap.
// Reduced motion: no roll, newest in view.
class SignWall extends LiveView {
  private box: HTMLElement; private clip: HTMLElement; private names: HTMLElement; private wait: HTMLElement; private more: HTMLElement;
  private of: HTMLElement; private how: HTMLElement;
  private count: Count; private cards = new Map<string, Card>();
  // The card's width, row height and type size, shared by every card so they resize together.
  private size = { w: spring(0), h: spring(0), f: spring(0) }; private sized = "";
  private roll = spring(0); private over = 0; private rowStep = 0; private lastArrival = -Infinity; private dir = 1; private pauseUntil = 0; private rolling = false; private rolled = "";
  private last: LiveSnapshot | null = null; private observer: ResizeObserver | null = null; private ruler: CanvasRenderingContext2D | null = null;
  constructor(root: HTMLElement, session: string) {
    super(root, session);
    root.classList.add("gfs-sign");
    root.innerHTML = '<div class="gfs-names-box"><div class="gfs-names-clip"><p class="gfs-wait">Waiting for the first signature</p><div class="gfs-names"></div></div><p class="gfs-more" aria-live="polite"></p></div>'
      + '<div class="gfs-sign-side"><p class="gfs-big" aria-live="polite">0</p><p class="gfs-of"></p><p class="gfs-how"></p></div>';
    this.box = root.querySelector(".gfs-names-box")!; this.clip = root.querySelector(".gfs-names-clip")!; this.names = root.querySelector(".gfs-names")!;
    this.wait = root.querySelector(".gfs-wait")!; this.more = root.querySelector(".gfs-more")!;
    this.of = root.querySelector(".gfs-of")!; this.how = root.querySelector(".gfs-how")!;
    this.count = new Count(root.querySelector(".gfs-big")!);
    // The wall refits when its space changes (room size, a join strip, the screen's fit).
    if (typeof ResizeObserver === "function") { this.observer = new ResizeObserver(() => this.refit()); this.observer.observe(this.box); }
    void document.fonts?.ready.then(() => this.refit());
  }
  destroy() { this.observer?.disconnect(); super.destroy(); }
  private refit() { if (this.last && this.root.isConnected) { this.place(this.last, false); if (!this.rolling) this.roll.t = this.over; this.wake(); } }
  // How the names set at a size and width, measured with the TV's own typeface.
  private measure(names: string[]) {
    const style = getComputedStyle(this.root);
    this.ruler ??= document.createElement("canvas").getContext("2d");
    const ruler = this.ruler;
    return (font: number, width: number) => {
      if (!ruler) return { lines: 1, words: true, over: 0 };
      ruler.font = `${style.getPropertyValue("--fw-semibold").trim() || 600} ${font}px ${style.fontFamily}`;
      const space = ruler.measureText(" ").width;
      let lines = 1, words = true, over = 0;
      for (const name of names) {
        let n = 1, used = 0;
        // A name wraps at spaces and after hyphens, as the browser sets it.
        for (const word of name.split(/\s+|(?<=-)/).filter(Boolean)) {
          const wide = ruler.measureText(word).width;
          // A word wider than the card breaks inside itself, over as many lines as it needs.
          if (wide > width) { words = false; n += (used ? 1 : 0) + Math.ceil(wide / width) - 1; used = wide % width; continue; }
          if (used && used + space + wide > width) { n++; used = wide; } else used += (used ? space : 0) + wide;
        }
        lines = Math.max(lines, n); if (n > 2) over++;
      }
      return { lines, words, over };
    };
  }
  protected draw(frame: LiveSnapshot, fresh: string | null, instant: boolean) {
    this.last = frame;
    this.place(frame, instant);
    const signers = signersOf(frame.state.results);
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
  // Every signer's card, at the size and place the wall's fit gives it.
  private place(frame: LiveSnapshot, instant: boolean) {
    const signers = signersOf(frame.state.results), floor = this.floor();
    const strokes = new Map(frame.answers.map(a => [a.id, strokesOf(a.value)]));
    const W = this.clip.clientWidth || 1200, H = this.box.clientHeight || 600;
    const fit = fitWall(signers.length, W, H, floor, Math.min(floor, tvMinimum), this.measure(signers.map(s => s.name)));
    const cells = wallLayout(signers.length, W, fit.cols, fit.rowH, fit.gapX, fit.gapY);
    const first = !this.size.f.t;
    this.size.w.t = fit.w; this.size.h.t = fit.rowH; this.size.f.t = fit.font;
    if (instant || first) for (const s of Object.values(this.size)) { s.x = s.t; s.v = 0; }
    signers.forEach((signer, i) => {
      const cell = cells[i];
      let card = this.cards.get(signer.id);
      if (!card || card.going) {
        card?.el.remove();
        const el = make("div", "gfs-name");
        el.innerHTML = '<svg aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" /></svg><span class="nm"></span>';
        el.querySelector("svg")!.setAttributeNS(null, "viewBox", `0 0 ${sigWidth} ${sigHeight}`);
        // The signature sits on its line, above the name, at the name's left edge.
        el.querySelector("svg")!.setAttributeNS(null, "preserveAspectRatio", "xMinYMax meet");
        this.sizeCard(el);
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
      card.x.t = cell.x; card.y.t = cell.y; card.o.t = 1; card.going = false;
      if (instant) { card.x.x = cell.x; card.y.x = cell.y; card.x.v = card.y.v = 0; }
    });
    for (const [id, card] of this.cards) if (!signers.some(s => s.id === id) && !card.going) { card.o.t = 0; card.going = true; }
    for (const card of this.cards.values()) card.still = false;
    this.sized = "";
    this.rowStep = fit.rowH + fit.gapY;
    const height = fit.rows * fit.rowH + Math.max(0, fit.rows - 1) * fit.gapY;
    // The "+ 4 more" line sits under a wall that rolls, at the names' size.
    this.box.classList.toggle("is-full", fit.more > 0); this.box.dataset.hold = String(fit.capacity);
    this.more.style.fontSize = `${fit.font.toFixed(2)}px`;
    this.more.textContent = fit.more ? `+ ${fit.more} more` : "";
    this.over = fit.more ? Math.max(0, height - this.clip.clientHeight) : 0;
    this.names.style.height = `${height}px`; this.names.style.setProperty("--gfs-name-lines", String(fit.lines));
    this.wait.classList.toggle("is-off", signers.length > 0);
  }
  private sizeCard(el: HTMLElement) {
    el.style.width = `${this.size.w.x.toFixed(2)}px`; el.style.height = `${this.size.h.x.toFixed(2)}px`; el.style.fontSize = `${this.size.f.x.toFixed(2)}px`;
  }
  protected frame(dt: number, now: number, snap: boolean) {
    const w = this.rate("cwl-dur-make-room");
    let busy = this.count.frame(w, dt, snap);
    // The cards grow and shrink together, on the same spring as their glide.
    const resized = !Object.values(this.size).map(s => step(s, w, dt, snap)).every(Boolean);
    const sized = `${this.size.w.x.toFixed(2)} ${this.size.h.x.toFixed(2)} ${this.size.f.x.toFixed(2)}`;
    if (sized !== this.sized) { this.sized = sized; for (const card of this.cards.values()) this.sizeCard(card.el); }
    if (resized) busy = true;
    for (const [id, card] of this.cards) {
      const done = [glide([card.x, card.y], w, dt, snap), step(card.o, w, dt, snap)].every(Boolean);
      if (done && card.still) continue;
      card.still = done; busy = true;
      card.el.style.transform = `translate(${card.x.x.toFixed(2)}px,${card.y.x.toFixed(2)}px)`;
      card.el.style.opacity = card.o.x >= 0.999 ? "" : Math.max(0, card.o.x).toFixed(3);
      if (card.going && card.o.x < 0.02) { card.el.remove(); this.cards.delete(id); }
    }
    const quiet = this.ms("cwl-delay-quiet", 3000);
    // A full wall keeps the loop awake: it waits for quiet, then rolls.
    if (this.over > 0 && !snap) busy = true;
    if (snap) { this.rolling = false; this.roll.t = this.over; step(this.roll, w, dt, true); }
    // A wall that no longer rolls, or a roll left past a shorter wall's end, glides back.
    else if (this.over <= 0 || this.roll.x > this.over + 0.5) { this.rolling = false; this.roll.t = Math.max(0, this.over); if (!glide([this.roll], w, dt, false)) busy = true; }
    else if (now - this.lastArrival > quiet) {
      // The slow roll: one row per cwl-dur-roll-row, a quiet pause at each end.
      if (!this.rolling) { this.rolling = true; this.roll.t = this.roll.x; this.roll.v = 0; this.dir = this.roll.x >= this.over - 1 ? -1 : 1; this.pauseUntil = now + quiet; }
      if (now >= this.pauseUntil) {
        const speed = this.rowStep / (this.ms("cwl-dur-roll-row", 6000) / 1000);
        this.roll.x = Math.max(0, Math.min(this.over, this.roll.x + this.dir * speed * dt)); this.roll.t = this.roll.x;
        if (this.roll.x <= 0 || this.roll.x >= this.over) { this.dir = -this.dir; this.pauseUntil = now + quiet; }
      }
    } else if (!glide([this.roll], w, dt, false)) busy = true;
    const rolled = `translateY(${(-this.roll.x).toFixed(2)}px)`;
    if (rolled !== this.rolled) { this.rolled = rolled; this.names.style.transform = rolled; }
    return busy;
  }
}

export function SignView({ session, frame, flow }: { session: string; frame: LiveSnapshot; flow?: TvFlow | null }) {
  const host = useLiveView((root, id) => new SignWall(root, id), session, frame, flow);
  return <div ref={host} className="tv-board" />;
}

// INT-09 on the TV (redrawn, Chris, November 4 2026): one mark for each person present, open until
// they answer, then filled, with "6 of 8 answered" and one line saying who reads the answers. Marks
// fill in the order answers arrive, never by seat or name, so a mark can't be traced to a person.
// The answers never reach this screen; the database keeps them out of every snapshot and event.
// The marks, the count and the line are one block centred under the prompt; the marks take the
// largest size from cwl-private-mark-max down to cwl-private-mark-min that fits. Past
// cwl-private-marks-max people the marks step aside and the count stands alone.
const lockSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
class FormCount extends LiveView {
  private count: Count; private n: HTMLElement; private of: HTMLElement; private marks: HTMLElement; private line: HTMLElement;
  private total = 0; private answered = 0; private observer?: ResizeObserver;
  constructor(root: HTMLElement, session: string) {
    super(root, session);
    root.classList.add("gfs-form");
    root.innerHTML = `<div class="gfs-marks" role="img"></div><p class="gfs-count"><b class="gfs-n" aria-live="polite">0</b><span class="gfs-of"></span></p><p class="gfs-lock">${lockSvg}Only the facilitators will read what you write. This screen just counts.</p>`;
    this.marks = root.querySelector(".gfs-marks")!; this.n = root.querySelector(".gfs-n")!; this.of = root.querySelector(".gfs-of")!; this.line = root.querySelector(".gfs-count")!;
    this.count = new Count(this.n);
    if (typeof ResizeObserver === "function") { let w = 0, h = 0; this.observer = new ResizeObserver(() => { if (root.clientWidth !== w || root.clientHeight !== h) { w = root.clientWidth; h = root.clientHeight; this.layout(); } }); this.observer.observe(root); }
  }
  destroy() { this.observer?.disconnect(); super.destroy(); }
  // The largest mark that fits every person, in 2px steps; gap 28% of the mark (8px at least).
  private layout() {
    const root = this.root, cap = this.level("cwl-private-marks-max", 500), total = this.total;
    const countOnly = total > cap;
    root.classList.toggle("is-count-only", countOnly);
    if (countOnly || !total) { this.marks.style.height = "0px"; return; }
    const style = getComputedStyle(root), padT = parseFloat(style.paddingTop) || 0, gapY = parseFloat(style.rowGap) || 36;
    const W = this.marks.clientWidth || root.clientWidth || 1600;
    const H = Math.max(120, root.clientHeight - padT - this.line.offsetHeight - (root.querySelector<HTMLElement>(".gfs-lock")?.offsetHeight ?? 0) - 2 * gapY - 8);
    const lo = this.level("cwl-private-mark-min", 16);
    let d = this.level("cwl-private-mark-max", 144);
    const fits = (dd: number) => { const g = Math.max(8, Math.round(dd * 0.28)), cols = Math.max(1, Math.floor((W + g) / (dd + g))); return Math.ceil(total / cols) * (dd + g) - g <= H; };
    while (d > lo && !fits(d)) d -= 2;
    const g = Math.max(8, Math.round(d * 0.28)), cols = Math.max(1, Math.min(total, Math.floor((W + g) / (d + g))));
    this.marks.style.setProperty("--gfs-d", `${d}px`); this.marks.style.setProperty("--gfs-g", `${g}px`); this.marks.style.setProperty("--gfs-cols", String(cols));
    this.marks.style.height = `${Math.ceil(total / cols) * (d + g) - g}px`;
  }
  protected draw(frame: LiveSnapshot, fresh: string | null, instant: boolean) {
    const n = Number(frame.state.results.people) || 0, total = Math.max(frame.presence?.count ?? 0, n), before = this.answered;
    if (total !== this.total) {
      // Someone arrives or leaves: marks are added or removed at the end and the rest make room (FLIP).
      const kids = [...this.marks.children] as HTMLElement[], from = instant ? [] : kids.map(el => el.getBoundingClientRect());
      this.total = total;
      while (this.marks.children.length < total) this.marks.appendChild(make("i", "gfs-mark"));
      while (this.marks.children.length > total) this.marks.lastElementChild!.remove();
      this.layout();
      if (!instant && !reducedMotion(this.root)) kids.forEach((el, i) => {
        if (!el.isConnected) return;
        const a = from[i], b = el.getBoundingClientRect();
        if (Math.abs(a.left - b.left) + Math.abs(a.top - b.top) > 0.5) el.animate([{ transform: `translate(${a.left - b.left}px,${a.top - b.top}px)` }, { transform: "none" }], { duration: this.ms("cwl-dur-make-room", 700), easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      });
    }
    const marks = [...this.marks.children] as HTMLElement[];
    marks.forEach((el, i) => {
      const done = i < n;
      if (done && !el.classList.contains("is-done") && instant) { el.classList.add("is-instant"); requestAnimationFrame(() => el.classList.remove("is-instant")); }
      el.classList.toggle("is-done", done);
    });
    // A lone answer's mark takes the screen's Lime moment, then settles.
    if (fresh && !instant && n === before + 1 && marks[n - 1]) this.moment([marks[n - 1]]);
    this.answered = n;
    this.marks.setAttribute("aria-label", `${n} of ${total} answered`);
    const all = n > 0 && n === total;
    this.n.style.display = all ? "none" : "";
    this.of.textContent = all ? `All ${total} answered` : ` of ${total} answered`;
    this.count.set(n, instant);
  }
  protected frame(dt: number, _now: number, snap: boolean) { return this.count.frame(this.rate("cwl-dur-make-room"), dt, snap); }
}
export function FormView({ session, frame, flow }: { session: string; frame: LiveSnapshot; flow?: TvFlow | null }) {
  const host = useLiveView((root, id) => new FormCount(root, id), session, frame, flow);
  return <div ref={host} className="tv-board" />;
}
