// INT-11 on the TV: four lists side by side, each holding its top cards in the server's rank (agreement, then arrival).
// Built once per session layer and only ever moves from what is on screen to what arrives, the same way the Q&A rows do:
// each card's place and fade run on one critically damped spring each, retargeted without losing speed (motion item 4).
//  * A card slides in where it lands; a lone arrival takes the screen's Lime moment.
//  * A similar card folds into its survivor: it glides into it and fades while the survivor's AI mark and count update.
//  * Counts tick to their new value over cwl-dur-count; the card swells once over cwl-dur-swell.
//  * Cards glide up and down their column as agreement trades their places. A card pushed out slides down as it fades.
// Reduced motion: a 150ms fade for arrivals and departures, and everything else trades in place.
import { reducedMotion, tokenMs } from "@/lib/tv/board";
import { springRate, springStep } from "@/lib/tv/motion";
import { cardLabel, columnLabels, columnTotals, fourColumns, foldedCount, foldedInto, moreLine, topOf, type FourCard, type FourColumn } from "@/lib/interactions/four-lists";
import { AiChanges, aiMarkEl, sweepAi } from "@/components/interactions/ai/ai-dom";

const svg = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>';
type Spring = { x: number; v: number };
type Slot = { id: string; column: FourColumn; el: HTMLElement; card: HTMLElement; y: Spring; o: Spring; ty: number; to: number; h: number; placed: boolean; going: boolean; fade: "cwl-dur-arrive" | "cwl-dur-make-room" | "cwl-dur-regroup"; rest: boolean; text: string; sign: string };
const make = (tag: string, className: string) => { const el = document.createElement(tag); el.className = className; return el; };
const slideIn = 40; // px: where an arrival starts below its place

export class FourBoard {
  private slots = new Map<string, Slot>();
  private last: { cards: FourCard[]; results: unknown } = { cards: [], results: null };
  private raf = 0;
  private at = 0;
  private moment?: ReturnType<typeof setTimeout>;
  private observer?: ResizeObserver;
  private ticks = new WeakMap<HTMLElement, number>();
  private aiChanges = new AiChanges();
  readonly board: HTMLElement;
  private lists = new Map<FourColumn, HTMLElement>();
  private mores = new Map<FourColumn, HTMLElement>();
  private cols = new Map<FourColumn, HTMLElement>();
  constructor(private root: HTMLElement) {
    this.board = make("div", "fl-board");
    fourColumns.forEach((column, i) => {
      const section = make("section", "fl-col is-empty"), head = make("header", ""), ix = make("span", "fl-ix"), q = make("span", "fl-q"), list = make("div", "fl-list"), more = make("p", "fl-more");
      section.dataset.col = column; section.setAttribute("aria-label", columnLabels[column]);
      ix.textContent = String(i + 1); q.textContent = columnLabels[column]; more.setAttribute("aria-live", "off");
      head.append(ix, q); section.append(head, list, more); this.board.append(section);
      this.lists.set(column, list); this.mores.set(column, more); this.cols.set(column, section);
    });
    root.append(this.board);
    root.dataset.empty = "true";
    if (typeof ResizeObserver === "function") {
      let h = 0, w = 0;
      this.observer = new ResizeObserver(() => { if (this.board.clientHeight !== h || this.board.clientWidth !== w) { h = this.board.clientHeight; w = this.board.clientWidth; this.set(this.last.results, { instant: true }); } });
      this.observer.observe(this.board);
    }
    void document.fonts?.ready.then(() => { if (this.root.isConnected) this.set(this.last.results, { instant: true }); });
  }
  destroy() { cancelAnimationFrame(this.raf); clearTimeout(this.moment); this.observer?.disconnect(); }
  element(id: string) { const s = this.slots.get(id); return s && !s.going ? s.el : null; }

  set(results: unknown, o: { instant?: boolean; fresh?: string[] } = {}) {
    const cards = (this.cardsFrom(results)), snap = Boolean(o.instant) || reducedMotion(this.root);
    this.last = { cards, results };
    const totals = columnTotals(results), keep = new Set<string>(), order = new Map<FourColumn, FourCard[]>();
    for (const column of fourColumns) {
      const { shown, rest } = topOf(cards, column, totals[column]);
      order.set(column, shown);
      this.mores.get(column)!.textContent = moreLine(rest);
      this.cols.get(column)!.classList.toggle("is-empty", shown.length === 0);
      for (const card of shown) {
        keep.add(card.id);
        let slot = this.slots.get(card.id);
        if (!slot) { slot = this.build(card, snap); this.slots.set(card.id, slot); this.lists.get(column)!.append(slot.el); }
        slot.going = false; slot.to = 1; slot.fade = "cwl-dur-arrive"; slot.rest = false;
        this.fill(slot, card, snap);
      }
    }
    this.layout(order, snap);
    // AI folding a card into a survivor sweeps that card's AI icon once, as the folded card glides into it.
    for (const key of this.aiChanges.next(cards.filter(c => c.ai).flatMap(c => c.ids.filter(id => id !== c.id).map(id => `${c.id}\u0001${id}`))))
      if (!snap) sweepAi(this.slots.get(key.split("\u0001")[0])?.el);
    this.slots.forEach((slot, id) => {
      if (keep.has(id) || slot.going) return;
      slot.going = true; slot.to = 0; slot.rest = false; slot.fade = "cwl-dur-make-room";
      const into = foldedInto(id, cards), target = into ? this.slots.get(into) : undefined, listH = this.lists.get(slot.column)!.clientHeight;
      if (target && keep.has(into!)) { slot.ty = target.ty; slot.fade = "cwl-dur-regroup"; } // a fold drifts into its survivor at the regrouping pace
      else if (cards.some(c => c.id === id)) { // pushed out of the top: it slides a short way down as it fades
        let end = 0; this.slots.forEach((o, oid) => { if (oid !== id && keep.has(oid) && o.column === slot.column) end = Math.max(end, o.ty + (o.h || 0)); });
        slot.ty = Math.min(listH, end) || slot.ty;
      }
      if (snap) { slot.el.remove(); this.slots.delete(id); }
    });
    this.root.dataset.empty = keep.size ? "false" : "true";
    // A lone arrival takes the screen's Lime moment; the LIVE mark turns Off-White meanwhile.
    const fresh = o.fresh ?? [], hit = fresh.length === 1 ? cards.find(c => keep.has(c.id) && c.ids.includes(fresh[0])) : undefined;
    if (hit && !snap) {
      const el = this.slots.get(hit.id)!.card;
      this.slots.forEach(s => s.card.classList.remove("is-newest"));
      el.classList.add("is-newest"); this.root.dataset.newest = "on";
      clearTimeout(this.moment);
      this.moment = setTimeout(() => { el.classList.remove("is-newest"); this.root.dataset.newest = "off"; }, tokenMs(this.root, "cwl-dur-new-hold") || 1200);
    }
    this.step(0);
    if (!this.raf && !snap) { this.at = performance.now(); this.raf = requestAnimationFrame(this.frame); }
  }
  private cardsFrom(results: unknown) { return (results && typeof results === "object" && Array.isArray((results as { cards?: unknown }).cards)) ? (results as { cards: FourCard[] }).cards.filter(c => c && typeof c.id === "string" && typeof c.text === "string" && fourColumns.includes(c.column)) : []; }

  private build(card: FourCard, snap: boolean): Slot {
    const el = make("div", "fl-slot"), inner = make("div", "fl-card"), tx = make("span", "fl-tx"), ft = make("span", "fl-ft"), ai = make("span", "fl-ai"), agree = make("span", "fl-agree is-zero"), b = document.createElement("b");
    el.dataset.id = card.id; ai.hidden = true; agree.innerHTML = svg; b.dataset.n = "0"; b.textContent = "0"; agree.append(b);
    ft.append(ai, agree); inner.append(tx, ft); el.append(inner);
    // Reduced motion fades an arrival in over cwl-dur-reduced; full motion springs it in.
    const reduced = reducedMotion(this.root);
    const slot: Slot = { id: card.id, column: card.column, el, card: inner, y: { x: 0, v: 0 }, o: { x: snap && !reduced ? 1 : 0, v: 0 }, ty: 0, to: 1, h: 0, placed: false, going: false, fade: "cwl-dur-arrive", rest: false, text: "", sign: "" };
    if (snap && reduced) { el.style.opacity = "0"; }
    return slot;
  }
  private fill(slot: Slot, card: FourCard, snap: boolean) {
    const tx = slot.card.querySelector<HTMLElement>(".fl-tx")!, ai = slot.card.querySelector<HTMLElement>(".fl-ai")!, agree = slot.card.querySelector<HTMLElement>(".fl-agree")!, b = agree.querySelector("b")!;
    if (slot.text !== card.text) { tx.textContent = card.text; slot.text = card.text; }
    // Built only when it changes, so a count never cuts short the AI icon's sweep.
    const sign = card.ai && card.folded > 0 ? `ai|${foldedCount(card)}` : "";
    if (slot.sign !== sign) {
      slot.sign = sign; ai.replaceChildren(); ai.hidden = !sign;
      if (sign) { ai.append(aiMarkEl("Combined by AI"), document.createTextNode(String(foldedCount(card)))); }
    }
    slot.card.setAttribute("aria-label", cardLabel(card));
    const was = Number(b.dataset.n);
    if (was !== card.agree) {
      agree.classList.toggle("is-zero", card.agree === 0);
      this.tick(b, card.agree, snap || !slot.placed);
      if (!snap && slot.placed) this.swell(slot.card);
    }
  }
  // A count ticks to its new value over cwl-dur-count, one whole number at a time.
  private tick(b: HTMLElement, to: number, snap: boolean) {
    cancelAnimationFrame(this.ticks.get(b) ?? 0);
    const from = Number(b.textContent) || 0, ms = tokenMs(this.root, "cwl-dur-count") || 400;
    b.dataset.n = String(to);
    if (snap || from === to) { b.textContent = String(to); return; }
    const start = performance.now(), run = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      b.textContent = String(Math.round(from + (to - from) * t));
      if (t < 1) this.ticks.set(b, requestAnimationFrame(run)); else b.textContent = String(to);
    };
    this.ticks.set(b, requestAnimationFrame(run));
  }
  private swell(el: HTMLElement) {
    if (typeof el.animate !== "function" || reducedMotion(this.root)) return;
    el.animate([{ transform: "scale(1)" }, { transform: "scale(1.04)" }, { transform: "scale(1)" }], { duration: tokenMs(this.root, "cwl-dur-swell") || 400, easing: getComputedStyle(this.root).getPropertyValue("--cwl-ease-signature").trim() || "ease-in-out" });
  }

  // Stack each column's shown cards in rank order. Cards step to the floor size together when a column would overflow.
  private layout(order: Map<FourColumn, FourCard[]>, snap: boolean) {
    const reduced = reducedMotion(this.root);
    const measure = () => {
      let over = false;
      for (const column of fourColumns) {
        const list = this.lists.get(column)!;
        let y = 0;
        for (const card of order.get(column)!) { const slot = this.slots.get(card.id)!; slot.h = slot.el.offsetHeight; y += slot.h; }
        if (y > list.clientHeight + 1) over = true;
      }
      return over;
    };
    this.board.classList.remove("is-tight");
    if (measure()) { this.board.classList.add("is-tight"); measure(); }
    for (const column of fourColumns) {
      let y = 0;
      for (const card of order.get(column)!) {
        const slot = this.slots.get(card.id)!;
        slot.ty = y; y += slot.h;
        if (!slot.placed) { slot.placed = true; slot.y.x = snap || reduced ? slot.ty : slot.ty + slideIn; }
        if (snap) { slot.y = { x: slot.ty, v: 0 }; if (!reduced) slot.o = { x: 1, v: 0 }; }
      }
    }
    if (reduced) this.fadeIn(order);
  }
  // Reduced motion: an arrival fades in over cwl-dur-reduced and nothing else moves.
  private fadeIn(order: Map<FourColumn, FourCard[]>) {
    for (const card of [...order.values()].flat()) {
      const slot = this.slots.get(card.id)!;
      if (slot.o.x === 1) continue;
      slot.o = { x: 1, v: 0 }; slot.y = { x: slot.ty, v: 0 };
      const ms = tokenMs(this.root, "cwl-dur-reduced") || 150;
      slot.el.style.transform = `translateY(${slot.ty}px)`;
      slot.el.style.opacity = "0"; void slot.el.offsetHeight;
      slot.el.style.transition = `opacity ${ms}ms linear`; slot.el.style.opacity = "1";
      setTimeout(() => { slot.el.style.transition = ""; slot.el.style.opacity = ""; }, ms + 20);
    }
  }
  private frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - this.at) / 1000)); this.at = now;
    const busy = this.step(dt);
    this.raf = busy ? requestAnimationFrame(this.frame) : 0;
  };
  // One spring step for every card. Returns whether anything is still moving.
  step(dt: number) {
    const reduced = reducedMotion(this.root), wy = springRate(tokenMs(this.root, "cwl-dur-bar-trade") || 700);
    let busy = false;
    this.slots.forEach((s, id) => {
      if (reduced) {
        s.y.x = s.ty; s.y.v = 0;
        if (s.going) { if (!s.el.dataset.out) { s.el.dataset.out = "1"; const ms = tokenMs(this.root, "cwl-dur-reduced") || 150; s.el.style.transition = `opacity ${ms}ms linear`; s.el.style.opacity = "0"; setTimeout(() => { s.el.remove(); this.slots.delete(id); }, ms + 20); } return; }
        s.el.style.transform = `translateY(${s.ty}px)`; return;
      }
      if (dt > 0) {
        [s.y.x, s.y.v] = springStep(s.y.x, s.y.v, s.ty, s.going && s.fade === "cwl-dur-regroup" ? springRate(tokenMs(this.root, "cwl-dur-regroup") || 1200) : wy, dt);
        const [x, v] = springStep(s.o.x, s.o.v, s.to, springRate(tokenMs(this.root, s.fade) || 600), dt); s.o.x = Math.max(0, Math.min(1, x)); s.o.v = v;
      }
      if (s.going && s.o.x < 0.02) { s.el.remove(); this.slots.delete(id); return; }
      const settled = Math.abs(s.y.x - s.ty) < 0.3 && Math.abs(s.y.v) < 0.3 && Math.abs(s.o.x - s.to) < 0.002;
      if (settled) { s.y.x = s.ty; s.y.v = 0; s.o.x = s.to; s.o.v = 0; }
      if (settled && s.rest) return;
      s.rest = settled; busy = busy || !settled;
      s.el.style.transform = `translateY(${s.y.x.toFixed(2)}px)`;
      s.el.style.opacity = s.o.x >= 0.999 ? "" : s.o.x.toFixed(3);
    });
    return busy;
  }
}
