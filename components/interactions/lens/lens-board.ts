// INT-12 on the TV: the lens wall, evolving in place (pass 4 LensWall, motion spec 1).
//  * Every sentence lands in the column on the right the moment it is sent (the answer path, as
//    for every kind); clustering never holds it. Seeded sentences, written since the pre-call, arrive
//    first, in a steady flow, when the lens opens.
//  * AI on: once AI groups a sentence, a copy drifts from its row into its cluster (cwl-dur-cluster-drift
//    on cwl-ease-calm, cwl-delay-regroup-step apart, twelve at most), the row takes the cluster's number,
//    and the cluster's label grows (cwl-dur-cluster-label, from cwl-delay-label-after-drift). Every
//    cluster takes the wall's group styling, one color for all. Clusters keep their order of first appearance.
//  * AI off: no clusters; every sentence in arrival order across the screen.
// Reduced motion: no drift; the number, count and label size change at once. Every count is the server's.
import { ArrivalOrder, Feed, reducedMotion, tokenMs } from "@/lib/tv/board";
import type { Shown } from "@/lib/tv/flow";
import type { LiveSnapshot } from "@/lib/live/types";
import { clusterGrowth, driftSteps, lensOf } from "@/lib/interactions/lens";
import { shownGroups, type WallGroup } from "@/lib/interactions/ai";
import { AiChanges, aiMarkEl, sweepAi } from "@/components/interactions/ai/ai-dom";

const make = (tag: string, className: string, text?: string) => { const el = document.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el; };
type Cluster = { el: HTMLElement; num: HTMLElement; label: HTMLElement; count: HTMLElement; latest: HTMLElement };

export class LensBoard {
  private feed: Feed;
  private arrivals = new ArrivalOrder();
  private clusters = new Map<string, Cluster>();
  private order: string[] = [];
  private grouped = new Map<string, string>();
  private aiChanges = new AiChanges();
  private wall: HTMLElement;
  private list: HTMLElement;
  private empty: HTMLElement;
  private head: HTMLElement;
  private raf = 0;
  private first = true;
  private shown = 0;
  private drip?: ReturnType<typeof setInterval>;
  private last: LiveSnapshot | null = null;
  constructor(private root: HTMLElement, private session: string) {
    root.dataset.board = "lens";
    this.wall = make("div", "lens-wall"); this.wall.dataset.ai = "off";
    const clusters = make("section", "lens-clusters"), head = this.head = make("p", "lens-clusters-head");
    clusters.setAttribute("aria-label", "Clusters");
    head.append(aiMarkEl(), make("span", "", "Clustered from sentences"));
    this.empty = make("p", "lens-empty", "Clustering as sentences arrive");
    this.list = make("div", "lens-cluster-list");
    clusters.append(head, this.empty, this.list);
    const column = make("section", "tv-feed lens-feed"), rows = make("div", "tv-feed-list");
    column.setAttribute("aria-label", "Sentences");
    column.append(make("p", "tv-feed-head", "Sentences · newest first"), rows);
    this.wall.append(clusters, column);
    root.appendChild(this.wall);
    this.feed = new Feed(rows);
    let prior = performance.now();
    const tick = (now: number) => {
      if (!root.isConnected) return;
      const dt = Math.min(0.05, Math.max(0, (now - prior) / 1000)); prior = now;
      this.feed.step(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  destroy() { cancelAnimationFrame(this.raf); clearInterval(this.drip); }
  element(key: string) { return this.feed.element(key) ?? this.clusters.get(key)?.el ?? null; }
  show(shown: Shown) {
    const frame = shown.frame;
    if (frame.state.live_session_id !== this.session || frame.session?.id !== this.session) return;
    const instant = this.first; this.first = false;
    this.root.dataset.empty = String(!frame.state.results.total);
    this.render(frame, instant);
  }
  private render(frame: LiveSnapshot, instant: boolean) {
    this.last = frame;
    const res = lensOf(frame.state.results), reduced = reducedMotion(this.root), still = instant || reduced;
    this.wall.dataset.ai = res.ai ? "on" : "off";
    // Seeded sentences flow in one after another when the lens opens; a screen that opens on them shows them at once.
    if (still) this.shown = res.seeded.length;
    else if (this.shown < res.seeded.length && !this.drip) {
      this.drip = setInterval(() => {
        this.shown = Math.min(this.shown + 1, this.last ? lensOf(this.last.state.results).seeded.length : 0);
        if (this.last) this.render(this.last, false);
        if (!this.last || this.shown >= lensOf(this.last.state.results).seeded.length) { clearInterval(this.drip); this.drip = undefined; }
      }, 140);
    }
    this.shown = Math.min(this.shown, res.seeded.length);
    const live = this.arrivals.order(frame.answers.filter(a => a.session_id === this.session)).map(a => ({ id: a.id, text: a.text }));
    const seeded = res.seeded.slice(0, this.shown);
    const rows = [...live, ...[...seeded].reverse()];
    this.feed.set(rows, still);
    const text = new Map(rows.map(r => [r.id, r.text])), seededIds = new Set(seeded.map(s => s.id));
    for (const row of rows) this.feed.element(row.id)?.classList.toggle("is-seeded", seededIds.has(row.id));
    const groups = res.ai ? res.groups : [];
    this.renderClusters(groups, text, still);
  }
  private renderClusters(groups: WallGroup[], text: Map<string, string>, still: boolean) {
    for (const g of groups) if (!this.order.includes(g.id)) this.order.push(g.id);
    const { shown } = shownGroups(groups, false), standing = new Set(shown.map(g => g.id));
    const byId = new Map(shown.map(g => [g.id, g]));
    const number = (id: string) => this.order.indexOf(id) + 1;
    this.empty.classList.toggle("is-off", shown.length > 0);
    // Clusters that left (undone, or AI off) fade out; the rest update in place.
    for (const [id, c] of this.clusters) if (!standing.has(id)) {
      this.clusters.delete(id); c.el.classList.add("is-going");
      setTimeout(() => c.el.remove(), reducedMotion(this.root) ? 0 : tokenMs(this.root, "cwl-dur-hide"));
    }
    const now = new Map<string, string>();
    for (const id of this.order.filter(id => standing.has(id))) {
      const g = byId.get(id)!;
      let c = this.clusters.get(id);
      if (!c) {
        const el = make("div", "lens-cluster is-new"); el.dataset.key = id;
        c = { el, num: make("span", "lens-num"), label: make("span", "lens-label"), count: make("span", "lens-count"), latest: make("p", "lens-latest") };
        const top = make("div", "lens-cluster-top"); top.append(c.num, c.label, c.count);
        el.append(top, c.latest); this.clusters.set(id, c);
        requestAnimationFrame(() => el.classList.remove("is-new"));
      }
      this.list.appendChild(c.el);
      c.num.textContent = String(number(id));
      c.label.textContent = g.label;
      c.count.textContent = String(g.count);
      c.latest.textContent = text.get(g.ids[g.ids.length - 1]) ?? "";
      c.el.style.setProperty("--grow", String(clusterGrowth(g.count)));
      c.el.classList.toggle("is-pinned", g.pinned);
      c.el.setAttribute("aria-label", `Cluster ${number(id)}, ${g.label}, ${g.count} sentences${g.pinned ? ", pinned" : ""}`);
      for (const sentence of g.ids) now.set(sentence, id);
    }
    // Rows take their cluster's number; a row newly grouped sends a copy drifting there.
    const drifting: { id: string; to: string }[] = [];
    for (const [sentence, cluster] of now) {
      const row = this.feed.element(sentence);
      if (row) row.dataset.cluster = String(number(cluster));
      if (this.grouped.get(sentence) !== cluster) drifting.push({ id: sentence, to: cluster });
    }
    for (const row of this.root.querySelectorAll<HTMLElement>(".tv-feed-row[data-cluster]")) if (!now.has(row.dataset.key!)) delete row.dataset.cluster;
    this.grouped = now;
    // AI regrouping sweeps the one AI icon above the clusters once, as the sentences drift. The first frame is where it starts.
    const joined = this.aiChanges.next([...now].map(([s, c]) => `${c}\u0001${s}`));
    if (joined.length && !still) sweepAi(this.head);
    if (!still) this.drift(drifting.slice(-driftSteps));
  }
  private drift(moves: { id: string; to: string }[]) {
    const rootBox = this.root.getBoundingClientRect(), scale = this.root.offsetWidth ? rootBox.width / this.root.offsetWidth : 1;
    const duration = tokenMs(this.root, "cwl-dur-cluster-drift"), step = tokenMs(this.root, "cwl-delay-regroup-step");
    const easing = getComputedStyle(this.root).getPropertyValue("--cwl-ease-calm").trim() || "ease-in-out";
    moves.forEach(({ id, to }, index) => {
      const row = this.feed.element(id), target = this.clusters.get(to)?.el;
      if (!row || !target || typeof row.animate !== "function") return;
      const a = row.getBoundingClientRect(), b = target.getBoundingClientRect();
      if (!a.width || !b.width) return;
      const ghost = row.cloneNode(true) as HTMLElement;
      ghost.classList.add("lens-ghost"); ghost.removeAttribute("data-key"); ghost.setAttribute("aria-hidden", "true");
      Object.assign(ghost.style, { left: `${(a.left - rootBox.left) / scale}px`, top: `${(a.top - rootBox.top) / scale}px`, width: `${a.width / scale}px` });
      this.root.appendChild(ghost);
      const dx = (b.left + b.width / 2 - (a.left + a.width / 2)) / scale, dy = (b.top + b.height / 2 - (a.top + a.height / 2)) / scale;
      const run = ghost.animate([{ transform: "translate(0,0)", opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: `translate(${dx}px,${dy}px) scale(0.6)`, opacity: 0 }],
        { duration, delay: index * step, easing, fill: "backwards" });
      run.onfinish = run.oncancel = () => ghost.remove();
    });
  }
}
