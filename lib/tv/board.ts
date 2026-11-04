// The TV's live board: the word cloud and the response wall, evolving in place.
// Ported from design pass 2 (Field, Chips and Feed in pass-2/live-room.js).
// Durations and easing are read from the Clearway Live tokens on the page.
import type { LiveAnswer, LiveSnapshot } from "../live/types";
import type { Shown } from "./flow";
import { fitScale, planField, springRate, springStep } from "./motion";
import { absorbedInto, type AiWord } from "../interactions/ai";
import { AiChanges, aiMarkEl, sweepAi } from "@/components/interactions/ai/ai-dom";

export function tokenMs(el: Element, name: string) {
  const value = getComputedStyle(el).getPropertyValue(`--${name}`).trim();
  if (!value) return 0;
  return value.endsWith("ms") ? parseFloat(value) : parseFloat(value) * 1000;
}
const token = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(`--${name}`).trim();
// The TV has its own setting; phones and mirrors follow the system setting.
export function reducedMotion(el: Element) {
  const setting = el.closest("[data-motion]")?.getAttribute("data-motion");
  if (setting === "reduced") return true;
  if (setting === "full") return false;
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function make(tag: string, className: string, text?: string) {
  const el = document.createElement(tag); el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

type FieldItem = { key: string; el: HTMLElement; x: number; y: number; vx: number; vy: number; fs: number; vfs: number; o: number; vo: number;
  tx: number; ty: number; tfs: number; tw: number; th: number; placed: boolean; going: boolean; fresh: boolean; born: number; rest: boolean };
export type FieldEntry = { key: string; size: number; update: (el: HTMLElement) => void };

// Each item keeps its own place. Larger items are placed first and keep their
// spot if it is still free; new items take the free spot nearest the middle.
// Every item glides and grows on one spring that settles over cwl-dur-regroup
// and never resets its speed. Sizes step down together if crowded, never
// below the room's type floor.
export class Field {
  private items = new Map<string, FieldItem>();
  private last: FieldEntry[] | null = null;
  private observer?: ResizeObserver;
  constructor(private root: HTMLElement, private create: (key: string) => HTMLElement,
    private opt: { gapX: number; gapY: number; fill: number; floor: () => number; maxWidth: number; onResize?: () => void }) {
    let width = 0, height = 0;
    if (typeof ResizeObserver === "function") {
      this.observer = new ResizeObserver(() => {
        if (root.clientWidth !== width || root.clientHeight !== height) { width = root.clientWidth; height = root.clientHeight; this.replan(); }
      });
      this.observer.observe(root);
    }
    void document.fonts?.ready.then(() => this.replan());
  }
  // A field that may show fewer items when space shrinks (the wall's groups) decides again itself.
  replan() { if (!this.last || !this.root.isConnected) return; if (this.opt.onResize) this.opt.onResize(); else this.set(this.last); }
  destroy() { this.observer?.disconnect(); }
  element(key: string) { const it = this.items.get(key); return it && !it.going ? it.el : null; }
  // AI combines: a word leaving glides into its survivor's place as it fades (pass 3, INT-01).
  glideInto(key: string, into: string) {
    const it = this.items.get(key), to = this.items.get(into);
    if (it?.going && to && !reducedMotion(this.root)) { it.tx = to.tx; it.ty = to.ty; it.rest = false; }
  }
  // Undo plays it backwards: the word leaves the survivor's place for one of its own.
  startFrom(key: string, from: string) {
    const it = this.items.get(key), at = this.items.get(from);
    if (it && at && !it.going && !reducedMotion(this.root)) { it.x = at.x; it.y = at.y; it.o = Math.min(it.o, 0.4); it.rest = false; }
  }
  private measure(it: FieldItem, size: number) {
    const keep = it.el.style.fontSize; it.el.style.fontSize = `${size}px`;
    const box = { w: it.el.offsetWidth, h: it.el.offsetHeight }; it.el.style.fontSize = keep; return box;
  }
  // Returns whether every item found a place of its own (the caller may show fewer).
  set(list: FieldEntry[], instant = false): boolean {
    const root = this.root, width = root.clientWidth, height = root.clientHeight, snap = instant || reducedMotion(root);
    const want = new Set(list.map(entry => entry.key));
    this.items.forEach((it, key) => { if (!want.has(key)) it.going = true; });
    for (const entry of list) {
      let it = this.items.get(entry.key);
      if (it?.going) { it.el.remove(); this.items.delete(entry.key); it = undefined; }
      if (!it) {
        const el = this.create(entry.key);
        Object.assign(el.style, { position: "absolute", left: "0", top: "0", whiteSpace: "nowrap", opacity: "0" });
        root.appendChild(el);
        it = { key: entry.key, el, x: 0, y: 0, vx: 0, vy: 0, fs: entry.size, vfs: 0, o: 0, vo: 0, tx: 0, ty: 0, tfs: entry.size, tw: 0, th: 0,
          placed: false, going: false, fresh: true, born: 0, rest: false };
        this.items.set(entry.key, it);
      }
      entry.update(it.el);
    }
    this.last = list;
    if (width < 40 || height < 40) return true;
    const { gapX, gapY, fill, maxWidth } = this.opt, floor = this.opt.floor();
    let area = 0;
    for (const entry of list) { const box = this.measure(this.items.get(entry.key)!, entry.size); area += (box.w + gapX) * (box.h + gapY); }
    let k = fitScale(area, width, height, fill), plan = { ok: true, placed: [] as { x: number; y: number }[] };
    const live = list.map(entry => this.items.get(entry.key)!);
    for (let attempt = 0; attempt < 10; attempt++) {
      const boxes = list.map((entry, i) => {
        const it = live[i];
        it.tfs = Math.max(floor, entry.size * k);
        let box = this.measure(it, it.tfs);
        // No word wider than the field's limit: it shrinks alone, never below the floor.
        if (box.w > maxWidth) { it.tfs = Math.max(floor, it.tfs * maxWidth / box.w); box = this.measure(it, it.tfs); }
        it.tw = box.w; it.th = box.h;
        return { key: it.key, w: box.w, h: box.h, x: it.placed ? it.tx : undefined, y: it.placed ? it.ty : undefined };
      });
      plan = planField(boxes, width, height, gapX, gapY);
      if (plan.ok || live.every(it => it.tfs <= floor)) break;
      k *= 0.9;
    }
    const now = performance.now();
    live.forEach((it, i) => {
      it.tx = plan.placed[i].x; it.ty = plan.placed[i].y; it.placed = true; it.rest = false;
      if (it.fresh) { it.fresh = false; it.x = it.tx; it.y = it.ty + (snap ? 0 : 8); it.fs = snap ? it.tfs : it.tfs * 0.92; it.o = 0; it.born = now; }
      if (snap) { it.x = it.tx; it.y = it.ty; it.fs = it.tfs; it.vx = it.vy = it.vfs = 0; if (instant) it.o = 1; }
    });
    this.step(0);
    return plan.ok;
  }
  step(dt: number) {
    const root = this.root, reduced = reducedMotion(root), now = performance.now();
    const wSize = springRate(tokenMs(root, "cwl-dur-regroup")), wFade = springRate(tokenMs(root, "cwl-dur-make-room")), still = tokenMs(root, "cwl-dur-reduced");
    this.items.forEach((it, key) => {
      if (reduced) {
        it.x = it.tx; it.y = it.ty; it.fs = it.tfs;
        it.o = it.going ? 0 : Math.min(1, still ? (now - it.born) / still : 1);
      } else if (dt > 0) {
        [it.x, it.vx] = springStep(it.x, it.vx, it.tx, wSize, dt);
        [it.y, it.vy] = springStep(it.y, it.vy, it.ty, wSize, dt);
        [it.fs, it.vfs] = springStep(it.fs, it.vfs, it.going ? it.fs : it.tfs, wSize, dt);
        const [o, vo] = springStep(it.o, it.vo, it.going ? 0 : 1, wFade, dt); it.o = Math.max(0, Math.min(1, o)); it.vo = vo;
      }
      if (it.going && it.o < 0.02) { it.el.remove(); this.items.delete(key); return; }
      const settled = Math.abs(it.x - it.tx) < 0.2 && Math.abs(it.y - it.ty) < 0.2 && Math.abs(it.fs - it.tfs) < 0.05 && it.o > 0.999 && !it.going;
      if (settled && it.rest) return;
      it.rest = settled;
      const w = it.tw * (it.fs / (it.tfs || 1)), h = it.th * (it.fs / (it.tfs || 1));
      it.el.style.fontSize = `${it.fs.toFixed(2)}px`;
      it.el.style.transform = `translate(${(it.x - w / 2).toFixed(2)}px,${(it.y - h / 2).toFixed(2)}px)`;
      it.el.style.opacity = it.o >= 0.999 ? "" : it.o.toFixed(3);
    });
  }
}

// Single mentions: one row that slides as a unit. New chips join at the right;
// once the row is full it eases left so the newest stay in view, and the
// oldest fade off the left edge.
export class Chips {
  readonly track: HTMLElement;
  private off = 0;
  private v = 0;
  private retired = new Set<string>();
  constructor(private row: HTMLElement) { this.track = make("div", "tv-chips-track"); row.appendChild(this.track); }
  element(key: string) { return this.track.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]:not(.is-going)`); }
  private target() { const tw = this.track.scrollWidth, rw = this.row.clientWidth; return tw > rw ? tw - rw : -(rw - tw) / 2; }
  set(words: { key: string; text: string; isNew: boolean }[], instant = false) {
    const keep = new Set(words.map(word => word.key)), reduced = reducedMotion(this.row), track = this.track;
    for (const key of [...this.retired]) if (!keep.has(key)) this.retired.delete(key);
    for (const el of [...track.children] as HTMLElement[]) {
      if (keep.has(el.dataset.key!) || el.classList.contains("is-going")) continue;
      el.classList.add("is-going");
      const fade = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: tokenMs(track, reduced ? "cwl-dur-reduced" : "cwl-dur-hide"), easing: token(track, "cwl-ease-exit"), fill: "forwards" });
      fade.onfinish = () => {
        if (reduced) { el.remove(); return; }
        const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
        el.animate([{ width: `${el.offsetWidth}px`, marginRight: "0px" }, { width: "0px", marginRight: `${-gap}px` }],
          { duration: tokenMs(track, "cwl-dur-make-room"), easing: token(track, "cwl-ease-signature"), fill: "forwards" }).onfinish = () => el.remove();
      };
    }
    for (const word of words) {
      if (this.retired.has(word.key)) continue;
      let el = this.element(word.key);
      if (!el) {
        el = make("span", "tv-word is-single", word.text); el.dataset.key = word.key; track.appendChild(el);
        if (!instant) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: tokenMs(track, reduced ? "cwl-dur-reduced" : "cwl-dur-make-room"), easing: token(track, "cwl-ease-arrive"), fill: "backwards" });
      }
      el.textContent = word.text;
      el.classList.toggle("is-new", word.isNew);
    }
    if (instant) this.off = this.target();
  }
  step(dt: number) {
    const target = this.target();
    if (reducedMotion(this.row)) { this.off = target; this.v = 0; }
    else if (dt > 0) [this.off, this.v] = springStep(this.off, this.v, target, springRate(tokenMs(this.row, "cwl-dur-regroup")), dt);
    // Retire a chip that has slid fully past the left edge, keeping the picture still: the
    // offset and the removal land in the same frame as the transform that accounts for them,
    // so the row never shows one frame shifted by the retired chip's width.
    const first = this.track.firstElementChild as HTMLElement | null;
    if (first && this.track.children.length > 1 && first.offsetLeft + first.offsetWidth < this.off - 4) {
      const gap = parseFloat(getComputedStyle(this.track).columnGap) || 0;
      this.off -= first.offsetWidth + gap; if (first.dataset.key) this.retired.add(first.dataset.key); first.remove();
    }
    this.track.style.transform = `translateX(${(-this.off).toFixed(2)}px)`;
  }
}

// The answer column: answers arrive at the top and the whole column slides
// down as one piece, so rows never overlap. Hidden or withdrawn rows fade and
// their space closes; older answers fade out at the foot.
export class Feed {
  readonly track: HTMLElement;
  private off = 0;
  private v = 0;
  constructor(private list: HTMLElement, private limit = 40) { this.track = make("div", "tv-feed-track"); list.appendChild(this.track); }
  element(id: string) { return this.track.querySelector<HTMLElement>(`[data-key="${CSS.escape(id)}"]:not(.is-going)`); }
  private rows() { return [...this.track.querySelectorAll<HTMLElement>(".tv-feed-row:not(.is-going)")]; }
  set(answers: { id: string; text: string }[], instant = false) {
    const list = this.list, reduced = reducedMotion(list), wanted = answers.slice(0, this.limit), keep = new Set(wanted.map(a => a.id));
    const all = new Set(answers.map(a => a.id));
    for (const row of this.rows()) {
      if (keep.has(row.dataset.key!)) continue;
      // Pushed past the foot by newer answers: it leaves under the fade.
      if (all.has(row.dataset.key!) || instant) { row.remove(); continue; }
      this.remove(row, reduced);
    }
    const present = new Map(this.rows().map(row => [row.dataset.key!, row]));
    wanted.forEach(answer => { const row = present.get(answer.id); if (row && row.textContent !== answer.text) row.textContent = answer.text; });
    const firstKept = wanted.findIndex(answer => present.has(answer.id));
    const top = (firstKept < 0 ? wanted : wanted.slice(0, firstKept)).map(answer => this.row(answer));
    if (top.length) this.prepend(top, instant || reduced, instant);
    wanted.forEach((answer, index) => {
      if (index < (firstKept < 0 ? wanted.length : firstKept) || present.has(answer.id)) return;
      this.insertAt(this.row(answer), index, instant || reduced);
    });
  }
  private row(answer: { id: string; text: string }) { const el = make("div", "tv-feed-row", answer.text); el.dataset.key = answer.id; return el; }
  private prepend(rows: HTMLElement[], still: boolean, instant: boolean) {
    const track = this.track;
    for (const row of [...rows].reverse()) track.insertBefore(row, track.firstChild);
    if (still) {
      if (!instant) rows.forEach(row => row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: tokenMs(track, "cwl-dur-reduced") }));
    } else {
      this.off += rows.reduce((sum, row) => sum + row.offsetHeight, 0);
      track.style.transform = `translateY(${(-this.off).toFixed(2)}px)`;
      rows.forEach(row => row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: tokenMs(track, "cwl-dur-make-room"), easing: token(track, "cwl-ease-arrive"), fill: "backwards" }));
    }
    const children = track.children;
    for (let i = children.length - 1; i >= this.limit + 4; i--) children[i].remove();
  }
  private insertAt(row: HTMLElement, index: number, still: boolean) {
    const rows = this.rows();
    this.track.insertBefore(row, rows[index] || null);
    if (still) return;
    const height = row.offsetHeight, style = getComputedStyle(row);
    row.animate([{ height: "0px", paddingTop: "0px", paddingBottom: "0px", opacity: 0 }, { height: `${height}px`, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, opacity: 1 }],
      { duration: tokenMs(row, "cwl-dur-make-room"), easing: token(row, "cwl-ease-signature") });
  }
  private remove(row: HTMLElement, reduced: boolean) {
    row.classList.add("is-going");
    const fade = row.animate([{ opacity: 1 }, { opacity: 0 }], { duration: tokenMs(row, reduced ? "cwl-dur-reduced" : "cwl-dur-hide"), easing: token(row, "cwl-ease-exit"), fill: "forwards" });
    fade.onfinish = () => {
      if (reduced) { row.remove(); return; }
      const style = getComputedStyle(row);
      row.animate([{ height: `${row.offsetHeight}px`, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom }, { height: "0px", paddingTop: "0px", paddingBottom: "0px" }],
        { duration: tokenMs(row, "cwl-dur-make-room"), easing: token(row, "cwl-ease-signature"), fill: "forwards" }).onfinish = () => row.remove();
    };
  }
  step(dt: number) {
    if (reducedMotion(this.list)) { this.off = 0; this.v = 0; }
    else if (Math.abs(this.off) > 0.2 || Math.abs(this.v) > 0.2) [this.off, this.v] = springStep(this.off, this.v, 0, springRate(tokenMs(this.list, "cwl-dur-regroup")), dt);
    else { this.off = 0; this.v = 0; }
    this.track.style.transform = this.off ? `translateY(${(-this.off).toFixed(2)}px)` : "";
  }
}

// Wall answers keep the order they arrived in: a TV that opens mid-session
// orders what it finds by time, and anything after that joins at the top.
export class ArrivalOrder {
  private seen = new Map<string, number>();
  private next = 0;
  order(answers: LiveAnswer[]) {
    const fresh = answers.filter(answer => !this.seen.has(answer.id))
      .sort((a, b) => (a.created_at ? Date.parse(a.created_at) : Infinity) - (b.created_at ? Date.parse(b.created_at) : Infinity) || a.id.localeCompare(b.id));
    for (const answer of fresh) this.seen.set(answer.id, this.next++);
    return [...answers].sort((a, b) => this.seen.get(b.id)! - this.seen.get(a.id)!);
  }
}

// A combined word carries the gradient AI icon beside it (pass 3 change 14; gradient ink, November 3); built only when it changes.
function wordContent(el: HTMLElement, word: AiWord) {
  const sign = `${word.ai ? "ai" : ""}|${word.text}`;
  if (word.ai) el.setAttribute("aria-label", `${word.text}, ${word.count}, combined by AI`); else el.removeAttribute("aria-label");
  if (el.dataset.content === sign) return;
  el.dataset.content = sign;
  if (word.ai) {
    const wrap = document.createElement("span"); wrap.className = "ai-word";
    wrap.append(document.createTextNode(word.text), aiMarkEl());
    el.replaceChildren(wrap);
  } else el.textContent = word.text;
}

export type BoardKind = "word_cloud" | "wall";
// One board per session layer. It shows frames for its own session only, so a
// leaving layer keeps its last picture while the next one cross-fades in.
export class Board {
  private field?: Field;
  private chips?: Chips;
  private feed?: Feed;
  private arrivals = new ArrivalOrder();
  private raf = 0;
  private settle?: ReturnType<typeof setTimeout>;
  private first = true;
  private absorbed = new Map<string, string>();
  private aiChanges = new AiChanges();
  constructor(private root: HTMLElement, private kind: BoardKind, private session: string) {
    root.dataset.board = kind;
    if (kind === "word_cloud") {
      const field = make("div", "tv-field"), row = make("div", "tv-chips");
      root.append(field, row);
      this.field = new Field(field, key => { const el = make("span", "tv-word"); el.dataset.key = key; return el; },
        { gapX: 40, gapY: 6, fill: 0.55, maxWidth: 1280, floor: () => this.floor() });
      this.chips = new Chips(row);
    } else {
      root.innerHTML = '<div class="tv-wall"><section class="tv-groups"><p class="tv-groups-empty">Grouping as answers arrive</p></section>'
        + '<section class="tv-feed"><p class="tv-feed-head">Answers · newest first</p><div class="tv-feed-list"></div></section></div>';
      this.feed = new Feed(root.querySelector(".tv-feed-list")!);
    }
    let last = performance.now();
    const tick = (now: number) => {
      if (!root.isConnected) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
      this.field?.step(dt); this.chips?.step(dt); this.feed?.step(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  destroy() { cancelAnimationFrame(this.raf); clearTimeout(this.settle); this.field?.destroy(); }
  // The room's type floor in stage pixels: the board's font size is the
  // cwl-fs-tv-floor token, so it follows room size and the fit step.
  private floor() { return parseFloat(getComputedStyle(this.root).fontSize) || 36; }
  element(key: string) { return this.field?.element(key) ?? this.chips?.element(key) ?? this.feed?.element(key) ?? null; }
  show(shown: Shown) {
    const frame = shown.frame;
    if (frame.state.live_session_id !== this.session || frame.session?.id !== this.session) return;
    const instant = this.first; this.first = false;
    const fresh = shown.lone && !shown.replay ? shown.fresh[shown.fresh.length - 1] : null;
    // A flow starting during a newest-arrival moment ends it, so Lime never
    // sits on one item while others stream in.
    if (!fresh && shown.fresh.length && this.root.dataset.newest === "on") this.endMoment();
    this.root.dataset.empty = String(!frame.state.results.total);
    if (this.kind === "word_cloud") this.cloud(frame, fresh, instant); else this.wall(frame, fresh, instant);
  }
  private newKeys(frame: LiveSnapshot, id: string | null) {
    const answer = id ? frame.answers.find(a => a.id === id) : null;
    return new Set(answer?.answers.map(item => item.key) ?? []);
  }
  private cloud(frame: LiveSnapshot, fresh: string | null, instant: boolean) {
    const words = frame.state.results.words, scale = this.floor() / 36, isNew = this.newKeys(frame, fresh);
    const repeated = words.filter(word => word.count > 1).sort((a, b) => b.count - a.count);
    const singles = words.filter(word => word.count === 1).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.key.localeCompare(b.key));
    // A lone arrival's word shows Lime for a moment; the leader keeps Sunrise.
    const moment = words.some(word => isNew.has(word.key) && word.level !== "leader");
    this.chips!.set(singles.map(word => ({ key: word.key, text: word.text, isNew: isNew.has(word.key) })), instant);
    this.field!.set(repeated.map(word => ({ key: word.key, size: word.size * scale, update: el => {
      wordContent(el, word);
      el.className = `tv-word ${word.level === "leader" ? "is-leader" : "is-repeated"}${isNew.has(word.key) && word.level !== "leader" ? " is-new" : ""}`;
    } })), instant);
    // AI combines and their undo animate between where the words were and where they go.
    const absorbed = new Map<string, string>();
    for (const word of words as AiWord[]) for (const key of word.merged ?? []) absorbed.set(key, word.key);
    if (!instant) {
      for (const [key, into] of absorbed) if (this.absorbed.get(key) !== into) this.field!.glideInto(key, absorbedInto(key, words as AiWord[]) ?? into);
      for (const [key, from] of this.absorbed) if (!absorbed.has(key)) this.field!.startFrom(key, from);
    }
    this.absorbed = absorbed;
    // A combine sweeps the survivor's AI icon once, as the absorbed word glides into it.
    // The first frame a board sees is where it starts: a TV opening on earlier combines never sweeps.
    const joins = this.aiChanges.next([...absorbed].map(([key, into]) => `${into}\u0001${key}`));
    if (!instant) for (const join of joins) sweepAi(this.field!.element(join.split("\u0001")[0]));
    if (moment) this.moment();
  }
  private wall(frame: LiveSnapshot, fresh: string | null, instant: boolean) {
    const answers = this.arrivals.order(frame.answers.filter(answer => answer.session_id === this.session));
    this.feed!.set(answers.map(answer => ({ id: answer.id, text: answer.text })), instant);
    this.feed!.track.querySelectorAll(".is-newest").forEach(row => row.classList.remove("is-newest"));
    if (fresh) { this.feed!.element(fresh)?.classList.add("is-newest"); this.moment(); }
  }
  // The newest-arrival moment: held cwl-dur-new-hold, then the color settles.
  // While it shows, the LIVE marker takes its outline form.
  private moment() {
    clearTimeout(this.settle);
    this.root.dataset.newest = "on";
    this.settle = setTimeout(() => this.endMoment(), tokenMs(this.root, "cwl-dur-new-hold"));
  }
  private endMoment() {
    clearTimeout(this.settle);
    this.root.dataset.newest = "off";
    this.root.querySelectorAll(".is-new, .is-newest").forEach(el => { el.classList.add("is-settling"); el.classList.remove("is-new", "is-newest"); });
  }
}
