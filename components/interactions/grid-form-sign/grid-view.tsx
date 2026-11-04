"use client";
import type { LiveSnapshot } from "@/lib/live/types";
import type { TvFlow } from "@/lib/tv/flow";
import { dotRadius, gridColor, gridOf, gridResults, separate, type GridResult } from "@/lib/interactions/grid-form-sign";
import { LiveView, make, spring, step, useLiveView, type Spring } from "./view-base";
import "./grid-form-sign.css";

// still: settled and already drawn there, so the frame loop leaves it alone.
type DotEl = { el: HTMLElement; x: Spring; y: Spring; r: Spring; o: Spring; going: boolean; still?: boolean };
type Faint = { el: HTMLElement; x: Spring; y: Spring; o: Spring; going: boolean; still?: boolean };
type Row = { el: HTMLElement; y: Spring; o: Spring; going: boolean; still?: boolean };

// INT-08 on the TV (pass 3 changes 12 and 16). Exactly one large numbered dot per item, at
// the mean of everyone's placements (computed on the server), sized by how many placed it,
// in the item's own color; one faint dot per placement once two people have placed it.
// A dot is nudged only as far as needed to stop two items overlapping. Averages glide on
// the regroup spring; a merged duplicate glides into its survivor and fades while the
// survivor grows. The legend beside the plot keeps labels off it.
// Writes only what changed, so a busy room never restyles what stands still.
function put<K extends "className" | "textContent">(el: HTMLElement, key: K, value: string) { if (el[key] !== value) el[key] = value; }
// Gives a spring a new target; true when it moved.
function aim(s: Spring, target: number) { if (s.t === target) return 0; s.t = target; return 1; }

class GridBoard extends LiveView {
  private plot: HTMLElement; private legend: HTMLElement; private head: HTMLElement; private more: HTMLElement;
  private labels: Record<string, HTMLElement> = {};
  private dots = new Map<string, DotEl>(); private faint = new Map<string, Faint>(); private rows = new Map<string, Row>();
  private last: { frame: LiveSnapshot } | null = null;
  private observer: ResizeObserver;
  constructor(root: HTMLElement, session: string) {
    super(root, session);
    root.classList.add("gfs-grid");
    root.innerHTML = '<div class="gfs-plotwrap"><div class="gfs-yname"><span data-l="y_low"></span><span class="n" data-l="y_label"></span><span data-l="y_high"></span></div>'
      + '<div class="gfs-plot"><div class="gfs-mid-x"></div><div class="gfs-mid-y"></div><div class="gfs-faints"></div><div class="gfs-dots"></div></div>'
      + '<div class="gfs-xname"><span data-l="x_low"></span><span class="n" data-l="x_label"></span><span data-l="x_high"></span></div></div>'
      + '<div class="gfs-legend"><p class="gfs-legend-head"></p><div class="gfs-legend-rows"></div><p class="gfs-legend-more"></p></div>';
    this.plot = root.querySelector(".gfs-plot")!; this.legend = root.querySelector(".gfs-legend-rows")!;
    this.head = root.querySelector(".gfs-legend-head")!; this.more = root.querySelector(".gfs-legend-more")!;
    root.querySelectorAll<HTMLElement>("[data-l]").forEach(el => { this.labels[el.dataset.l!] = el; });
    this.observer = new ResizeObserver(() => { if (this.last) { this.draw(this.last.frame, null, true); this.wake(); } });
    this.observer.observe(this.plot);
  }
  destroy() { super.destroy(); this.observer.disconnect(); }
  protected draw(frame: LiveSnapshot, fresh: string | null, instant: boolean) {
    this.last = { frame };
    const o = gridOf(frame.session?.options);
    for (const [key, el] of Object.entries(this.labels)) el.textContent = String(o[key as keyof typeof o] ?? "");
    this.head.textContent = o.legend;
    this.plot.setAttribute("aria-label", `${o.y_label} by ${o.x_label}`);
    const items = gridResults(frame.state.results), spot = frame.state.spotlight_key ?? null;
    const W = this.plot.clientWidth || 1000, H = this.plot.clientHeight || 560, floor = this.floor();
    const live = items.filter(i => i.count > 0 && !i.into && i.x !== undefined && i.y !== undefined);
    // The dot for one person is the TV floor's size, but never more than the plot can hold
    // ten of: on a large room size the plot shrinks while the type grows.
    const maxCount = Math.max(1, ...live.map(i => i.count)), base = Math.min(floor * 0.95, Math.min(W, H) * 0.075);
    const placed = separate(live.map(i => ({ key: i.key, x: i.x! * W, y: (1 - i.y!) * H, r: dotRadius(i.count, maxCount, base, base * 0.75) })), W, H, floor * 0.25);
    const at = new Map(placed.map(d => [d.key, d]));
    // The newest arrival's own items take the Lime moment when their dot first appears.
    const answer = fresh ? frame.answers.find(a => a.id === fresh) : null, newKeys = new Set(answer?.answers.map(a => a.key) ?? []);
    const born: HTMLElement[] = [];
    const layer = this.plot.querySelector(".gfs-dots")!, faints = this.plot.querySelector(".gfs-faints")!;
    for (const item of live) {
      const p = at.get(item.key)!;
      let d = this.dots.get(item.key);
      if (!d || d.going) {
        d?.el.remove();
        const el = make("div", "gfs-dot");
        layer.appendChild(el);
        d = { el, x: spring(p.x), y: spring(p.y), r: spring(instant ? p.r : p.r * 0.6), o: spring(instant ? 1 : 0), going: false };
        this.dots.set(item.key, d);
        if (newKeys.has(item.key)) born.push(el);
      }
      put(d.el, "textContent", String(item.num));
      put(d.el, "className", `gfs-dot ${gridColor(item.num)}${spot === item.key ? " is-spot" : spot ? " is-dim" : ""}${d.el.classList.contains("is-new") ? " is-new" : ""}`);
      d.el.setAttribute("aria-label", `${item.num}. ${item.text}, placed by ${item.count}`);
      if (aim(d.x, p.x) | aim(d.y, p.y) | aim(d.r, p.r) | aim(d.o, 1)) d.still = false;
      d.going = false;
    }
    // A merged duplicate glides into its survivor and fades; a hidden item fades where it is.
    for (const [key, d] of this.dots) {
      if (at.has(key) || d.going) continue;
      const item = items.find(i => i.key === key), into = item?.into ? at.get(item.into) : undefined;
      if (into) { d.x.t = into.x; d.y.t = into.y; d.r.t = d.r.x * 0.5; }
      d.o.t = 0; d.going = true; d.still = false;
    }
    // Faint placements: one per person, keyed by the answer, in the item's color.
    const keepF = new Set<string>(), fr = floor * 0.3;
    for (const item of live) for (const [id, x, y] of item.places ?? []) {
      const key = `${item.key}:${id}`, fx = Math.max(fr, Math.min(W - fr, x * W)), fy = Math.max(fr, Math.min(H - fr, (1 - y) * H));
      keepF.add(key);
      let f = this.faint.get(key);
      if (!f || f.going) { f?.el.remove(); const el = make("div", "gfs-faint"); faints.appendChild(el); f = { el, x: spring(fx), y: spring(fy), o: spring(instant ? 1 : 0), going: false }; this.faint.set(key, f); }
      put(f.el, "className", `gfs-faint ${gridColor(item.num)}${spot && spot !== item.key ? " is-dim" : ""}`);
      if (aim(f.x, fx) | aim(f.y, fy) | aim(f.o, 1)) f.still = false;
      f.going = false;
    }
    for (const [key, f] of this.faint) {
      if (keepF.has(key) || f.going) continue;
      const item = items.find(i => i.key === key.split(":")[0]), into = item?.into ? at.get(item.into) : undefined;
      if (into) { f.x.t = into.x; f.y.t = into.y; }
      f.o.t = 0; f.going = true; f.still = false;
    }
    // The Pre-mortem lists every reason at once, placed or not, so a reason a phone adds reaches the
    // TV the moment it is sent; its dot follows when the room places it.
    this.legendRows(o.preset === "pre_mortem" ? items.filter(i => !i.into) : live, spot, newKeys, born, instant, floor);
    if (born.length) this.moment(born);
  }
  // One legend row per item on the plot, in number order. Rows that would not fit leave
  // a line: "+ 2 more on your phones". Rows glide to close a gap. Text is written for
  // every row first and the heights read after, so the layout is worked out once.
  private legendRows(live: GridResult[], spot: string | null, newKeys: Set<string>, born: HTMLElement[], instant: boolean, floor: number) {
    const rows = [...live].sort((a, b) => a.num - b.num), room = this.legend.clientHeight || 600, gap = floor * 0.25;
    const placed: { item: GridResult; row: Row }[] = [];
    for (const item of rows) {
      let row = this.rows.get(item.key);
      const fresh = !row || row.going;
      if (fresh) {
        row?.el.remove();
        const el = make("div", "gfs-leg"); el.innerHTML = "<i></i><span></span><small></small><em class=\"gfs-mit\"></em>";
        this.legend.appendChild(el);
        row = { el, y: spring(-1), o: spring(instant ? 1 : 0), going: false }; this.rows.set(item.key, row);
      }
      const r = row!;
      const [dot, label, count] = [r.el.querySelector("i")!, r.el.querySelector("span")!, r.el.querySelector("small")!];
      put(dot, "className", gridColor(item.num)); put(dot, "textContent", String(item.num));
      put(label, "textContent", item.text); put(count, "textContent", item.count ? `× ${item.count}` : "");
      // Mitigations the facilitator recorded sit under the reason (Pre-mortem).
      const mit = r.el.querySelector("em")!;
      put(mit, "textContent", item.mitigations?.length ? `Mitigation: ${item.mitigations.join("; ")}` : "");
      count.setAttribute("aria-label", `placed by ${item.count}`);
      r.el.classList.toggle("is-spot", spot === item.key); r.el.classList.toggle("is-dim", Boolean(spot && spot !== item.key));
      if (fresh && newKeys.has(item.key)) born.push(r.el);
      placed.push({ item, row: r });
    }
    const heights = placed.map(({ row }) => row.el.offsetHeight || floor * 1.6);
    let y = 0, full = false;
    const keep = new Set<string>();
    placed.forEach(({ item, row }, i) => {
      const h = heights[i];
      // A row that does not fit, and every row after it, waits off the legend.
      if (full || (y + h > room && keep.size > 0)) full = true;
      if (row.y.x < 0) { row.y.x = row.y.t = y; }
      row.going = false;
      if (aim(row.y, y) | aim(row.o, full ? 0 : 1)) row.still = false;
      if (full) { row.el.setAttribute("aria-hidden", "true"); return; }
      row.el.removeAttribute("aria-hidden");
      keep.add(item.key); y += h + gap;
    });
    for (const [key, r] of this.rows) if (!rows.some(i => i.key === key) && !r.going) { r.o.t = 0; r.going = true; r.still = false; }
    const extra = rows.length - keep.size;
    this.more.textContent = extra > 0 ? `+ ${extra} more on your phones` : "";
  }
  protected frame(dt: number, _now: number, snap: boolean) {
    const w = this.rate("cwl-dur-regroup"), wo = this.rate("cwl-dur-make-room"), faintLevel = this.level("cwl-faint", 0.32);
    let busy = false;
    for (const [key, d] of this.dots) {
      const done = [step(d.x, w, dt, snap), step(d.y, w, dt, snap), step(d.r, w, dt, snap), step(d.o, wo, dt, snap)].every(Boolean);
      if (done && d.still) continue;
      d.still = done; busy = true;
      const r = Math.max(1, d.r.x);
      d.el.style.width = d.el.style.height = `${(2 * r).toFixed(2)}px`;
      d.el.style.transform = `translate(${(d.x.x - r).toFixed(2)}px,${(d.y.x - r).toFixed(2)}px)`;
      d.el.style.opacity = d.o.x >= 0.999 ? "" : Math.max(0, d.o.x).toFixed(3);
      if (d.going && d.o.x < 0.02) { d.el.remove(); this.dots.delete(key); }
    }
    for (const [key, f] of this.faint) {
      const done = [step(f.x, w, dt, snap), step(f.y, w, dt, snap), step(f.o, wo, dt, snap)].every(Boolean);
      if (done && f.still) continue;
      f.still = done; busy = true;
      f.el.style.transform = `translate(${f.x.x.toFixed(2)}px,${f.y.x.toFixed(2)}px)`;
      f.el.style.opacity = (Math.max(0, f.o.x) * faintLevel).toFixed(3);
      if (f.going && f.o.x < 0.02) { f.el.remove(); this.faint.delete(key); }
    }
    for (const [key, r] of this.rows) {
      const done = [step(r.y, wo, dt, snap), step(r.o, wo, dt, snap)].every(Boolean);
      if (done && r.still) continue;
      r.still = done; busy = true;
      r.el.style.transform = `translateY(${r.y.x.toFixed(2)}px)`;
      r.el.style.opacity = r.o.x >= 0.999 ? "" : Math.max(0, r.o.x).toFixed(3);
      if (r.going && r.o.x < 0.02) { r.el.remove(); this.rows.delete(key); }
    }
    return busy;
  }
}

export function GridView({ session, frame, flow }: { session: string; frame: LiveSnapshot; flow?: TvFlow | null }) {
  const host = useLiveView((root, id) => new GridBoard(root, id), session, frame, flow);
  return <div ref={host} className="tv-board" role="img" aria-label="The room's grid" />;
}
