// INT-03 on the TV: the top three questions, ranked by the server. Built once per session
// layer and only ever moves from what is on screen to what arrives: each row's place and
// fade run on one critically damped spring each, retargeted without losing speed (pass 3
// change 4). Rows glide, never swap. A question rising from the phones slides up from below;
// one pushed out slides down as it fades; a fold glides into its survivor and fades;
// Answered fades where it stands. Reduced motion puts everything in place at once.
import { reducedMotion, tokenMs } from "@/lib/tv/board";
import { springRate, springStep } from "@/lib/tv/motion";
import { askedBy, foldedInto, moreLine, topQuestions, type QaQuestion } from "@/lib/interactions/qa";

const svg = (paths: string) => `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
export const arrowUp = svg('<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>');
const phoneIcon = svg('<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>');

type Spring = { x: number; v: number };
type Row = { id: string; el: HTMLElement; y: Spring; o: Spring; ty: number; to: number; going: boolean; fade: "cwl-dur-make-room" | "cwl-dur-hide"; rest: boolean };
const make = (tag: string, className: string) => { const el = document.createElement(tag); el.className = className; return el; };

export class QaRows {
  private rows = new Map<string, Row>();
  private known = new Set<string>();
  private last: QaQuestion[] = [];
  private raf = 0;
  private at = 0;
  private moment?: ReturnType<typeof setTimeout>;
  private observer?: ResizeObserver;
  readonly list: HTMLElement;
  private more: HTMLElement;
  private note: HTMLElement;
  constructor(private root: HTMLElement) {
    this.list = make("div", "qa-rows"); this.more = make("p", "qa-more"); this.note = make("p", "qa-note tv-muted");
    this.note.textContent = "Waiting for questions";
    root.append(this.list, this.more, this.note);
    root.dataset.empty = "true";
    if (typeof ResizeObserver === "function") {
      let h = 0;
      this.observer = new ResizeObserver(() => { if (this.list.clientHeight !== h) { h = this.list.clientHeight; this.set(this.last, { instant: true }); } });
      this.observer.observe(this.list);
    }
  }
  destroy() { cancelAnimationFrame(this.raf); clearTimeout(this.moment); this.observer?.disconnect(); }
  element(id: string) { const r = this.rows.get(id); return r && !r.going ? r.el : null; }
  set(list: QaQuestion[], o: { instant?: boolean; fresh?: string[] } = {}) {
    this.last = list;
    const H = this.list.clientHeight, { shown, rest } = topQuestions(list), snap = Boolean(o.instant) || reducedMotion(this.root);
    const rowH = Math.max(1, Math.floor(H / 3));
    this.root.style.setProperty("--qa-row-h", `${rowH}px`);
    this.root.classList.toggle("is-compact", rowH < 200);
    shown.forEach((q, i) => {
      let r = this.rows.get(q.id);
      const ty = i * rowH;
      // A row on its way out that comes back turns around from where it is.
      if (!r) {
        const el = make("div", "qa-row");
        el.dataset.id = q.id;
        el.innerHTML = `<div class="qa-votes">${arrowUp}<b></b></div><div class="qa-body"><p class="qa-text"></p><p class="qa-meta"></p></div>`;
        this.list.appendChild(el);
        // A question already waiting on phones rises from below; a new one fades in where it lands.
        r = { id: q.id, el, y: { x: this.known.has(q.id) && !snap ? H : ty, v: 0 }, o: { x: snap ? 1 : 0, v: 0 }, ty, to: 1, going: false, fade: "cwl-dur-make-room", rest: false };
        this.rows.set(q.id, r);
      }
      r.ty = ty; r.to = 1; r.going = false; r.fade = "cwl-dur-make-room"; r.rest = false;
      if (snap) { r.y = { x: ty, v: 0 }; r.o = { x: 1, v: 0 }; }
      r.el.classList.toggle("is-first", i === 0);
      r.el.querySelector("b")!.textContent = String(q.people);
      r.el.querySelector(".qa-text")!.textContent = q.text;
      const meta = r.el.querySelector(".qa-meta")!;
      meta.replaceChildren();
      if (q.askers > 1) {
        if (q.ai) meta.append(Object.assign(make("span", "qa-ai"), { textContent: "Combined" }), " · ");
        meta.append(askedBy(q));
      }
      r.el.setAttribute("aria-label", `${q.text}. ${q.people} ${q.people === 1 ? "person" : "people"}${q.askers > 1 ? `, ${askedBy(q)}` : ""}`);
    });
    this.fit(rowH);
    const keep = new Set(shown.map(q => q.id));
    this.rows.forEach((r, id) => {
      if (keep.has(id) || r.going) return;
      r.going = true; r.to = 0; r.rest = false;
      const q = list.find(x => x.id === id), into = q ? null : foldedInto(id, list);
      if (into && this.rows.has(into) && keep.has(into)) r.ty = this.rows.get(into)!.ty;
      else if (q?.answered) r.fade = "cwl-dur-hide";
      else if (q) r.ty = H;
      if (snap) { r.el.remove(); this.rows.delete(id); }
    });
    this.known = new Set(list.filter(q => !q.answered).map(q => q.id));
    this.more.innerHTML = rest ? `${phoneIcon}<span>${moreLine(rest)}</span>` : "";
    this.more.classList.toggle("is-on", rest > 0);
    this.root.dataset.empty = shown.length ? "false" : "true";
    // A lone arrival takes the screen's Lime moment; the LIVE mark turns Off-White meanwhile.
    const fresh = o.fresh ?? [], hit = fresh.length === 1 ? shown.find(q => q.ids.includes(fresh[0])) : undefined;
    if (hit && !snap) {
      const el = this.rows.get(hit.id)!.el;
      this.rows.forEach(r => r.el.classList.remove("is-new"));
      el.classList.add("is-new"); this.root.dataset.newest = "on";
      clearTimeout(this.moment);
      this.moment = setTimeout(() => { el.classList.remove("is-new"); this.root.dataset.newest = "off"; }, tokenMs(this.root, "cwl-dur-new-hold") || 1200);
    }
    this.step(0);
    if (!this.raf && !snap) { this.at = performance.now(); this.raf = requestAnimationFrame(this.frame); }
  }
  // Questions clamp to two lines on the TV, and to one when a row can't hold two lines and
  // its "asked by" line at the room's type sizes; a row that can't hold even one line with
  // "asked by" beneath puts it beside the question. Type never steps below the floor.
  private fit(rowH: number) {
    const sample = [...this.rows.values()].find(r => !r.going);
    if (!sample || typeof getComputedStyle !== "function") return;
    // Measure "asked by" where it sits beneath the question, whatever the sample row does now.
    sample.el.classList.remove("is-tight");
    const text = sample.el.querySelector<HTMLElement>(".qa-text")!, meta = sample.el.querySelector<HTMLElement>(".qa-meta")!;
    const row = getComputedStyle(sample.el), m = getComputedStyle(meta);
    const pad = parseFloat(row.paddingTop) + parseFloat(row.paddingBottom), line = parseFloat(getComputedStyle(text).lineHeight) || parseFloat(getComputedStyle(text).fontSize) * 1.2;
    const metaH = (parseFloat(m.lineHeight) || parseFloat(m.fontSize) * 1.2) + (parseFloat(m.marginTop) || 0);
    this.rows.forEach(r => {
      if (r.going) return;
      const hasMeta = Boolean(r.el.querySelector(".qa-meta")!.textContent), room = rowH - pad;
      // A row too short for a line and its "asked by" line beneath carries "asked by" beside the question.
      const tight = hasMeta && room < line + metaH;
      r.el.classList.toggle("is-tight", tight);
      r.el.querySelector<HTMLElement>(".qa-text")!.style.setProperty("-webkit-line-clamp", String(tight ? 1 : Math.max(1, Math.min(2, Math.floor((room - (hasMeta ? metaH : 0)) / line)))));
    });
  }
  private frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - this.at) / 1000)); this.at = now;
    const busy = this.step(dt);
    this.raf = busy ? requestAnimationFrame(this.frame) : 0;
  };
  // One spring step for every row. Returns whether anything is still moving.
  step(dt: number) {
    const reduced = reducedMotion(this.root), wy = springRate(tokenMs(this.root, "cwl-dur-bar-trade") || 700);
    let busy = false;
    this.rows.forEach((r, id) => {
      if (reduced) { r.y.x = r.ty; r.o.x = r.to; r.y.v = r.o.v = 0; }
      else if (dt > 0) {
        [r.y.x, r.y.v] = springStep(r.y.x, r.y.v, r.ty, wy, dt);
        const [x, v] = springStep(r.o.x, r.o.v, r.to, springRate(tokenMs(this.root, r.fade) || 600), dt); r.o.x = Math.max(0, Math.min(1, x)); r.o.v = v;
      }
      if (r.going && r.o.x < 0.02) { r.el.remove(); this.rows.delete(id); return; }
      const settled = Math.abs(r.y.x - r.ty) < 0.3 && Math.abs(r.y.v) < 0.3 && Math.abs(r.o.x - r.to) < 0.002;
      if (settled) { r.y.x = r.ty; r.y.v = 0; r.o.x = r.to; r.o.v = 0; }
      if (settled && r.rest) return;
      r.rest = settled; busy = busy || !settled;
      r.el.style.transform = `translateY(${r.y.x.toFixed(2)}px)`;
      r.el.style.opacity = r.o.x >= 0.999 ? "" : r.o.x.toFixed(3);
    });
    return busy;
  }
}
