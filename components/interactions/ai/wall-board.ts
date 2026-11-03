// INT-02 on the TV: the open text wall, evolving in place.
//  * AI on: AI groups in the main area as short labels sized by how many answers they
//    hold, under one AI badge, with the answers in a column on the right, newest first
//    (pass 2's layout). The AI summary opens at the top of the groups column once the
//    facilitator taps Show summary, and the groups glide down to make room.
//  * AI off: answer cards in arrival order, oldest first, so each card keeps its place as
//    new ones join at the end. A crowded wall steps older cards down to the body size and
//    then the floor, then the oldest take turns, only once nothing new has arrived for
//    cwl-delay-quiet.
// Switching AI on or off cross-fades between the two; neither redraws. Every count is the server's.
import { ArrivalOrder, Feed, Field, reducedMotion, tokenMs } from "@/lib/tv/board";
import type { Shown } from "@/lib/tv/flow";
import { springRate, springStep, wordSize } from "@/lib/tv/motion";
import type { LiveSnapshot } from "@/lib/live/types";
import { moreGroups, shownGroups, wallOf, type WallGroup } from "@/lib/interactions/ai";
import { aiBadgeEl, aiIconEl } from "./ai-dom";

const make = (tag: string, className: string, text?: string) => { const el = document.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el; };
const pinSvg = () => {
  const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"), path = document.createElementNS(ns, "path");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("class", "pin"); svg.setAttribute("aria-hidden", "true");
  path.setAttribute("d", "M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z");
  path.setAttribute("fill", "none"); path.setAttribute("stroke", "currentColor"); path.setAttribute("stroke-width", "2.4"); path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path); return svg;
};

// AI off: cards in arrival order. New cards fade in where they land at the end; cards
// that move (a hide, a step down) glide there on the field spring.
class Cards {
  private cards = new Map<string, { el: HTMLElement; x: number; y: number; vx: number; vy: number; dx: number; dy: number }>();
  private turns: HTMLElement;
  private step = 0;
  private offset = 0;
  private lastArrival = 0;
  private turnAt = 0;
  private stepAt = 0;
  private order: string[] = [];
  constructor(private root: HTMLElement) { this.turns = make("p", "ai-turns"); root.appendChild(this.turns); }
  element(id: string) { return this.cards.get(id)?.el ?? null; }
  private first() { const out = new Map<string, DOMRect>(); this.cards.forEach((c, id) => { if (!c.el.classList.contains("is-resting")) out.set(id, c.el.getBoundingClientRect()); }); return out; }
  // FLIP: measure, change, measure again, and let the spring carry each card from where it was.
  private flip(change: () => void) {
    const before = this.first(); change();
    const snap = reducedMotion(this.root) || !this.visible;
    this.cards.forEach((c, id) => {
      const was = before.get(id);
      // A card that rests (or a hidden wall) takes its place at once: nothing to glide.
      if (!was || snap || c.el.classList.contains("is-resting")) { c.dx = c.dy = c.vx = c.vy = 0; return; }
      const now = c.el.getBoundingClientRect();
      c.dx += was.left - now.left; c.dy += was.top - now.top;
    });
  }
  // Cards follow every frame while AI is on, but out of sight they never animate or step down.
  visible = true;
  set(answers: { id: string; text: string }[], fresh: string | null, instant: boolean) {
    const want = new Set(answers.map(a => a.id)), reduced = reducedMotion(this.root);
    const added = answers.some(a => !this.cards.has(a.id));
    if (added && !instant) { this.lastArrival = performance.now(); this.step = 0; }
    this.flip(() => {
      for (const [id, c] of this.cards) if (!want.has(id)) {
        // A hidden or withdrawn card fades where it stands while the others close the gap.
        this.cards.delete(id);
        Object.assign(c.el.style, { position: "absolute", left: `${c.el.offsetLeft}px`, top: `${c.el.offsetTop}px`, width: `${c.el.offsetWidth}px`, margin: "0" });
        const fade = c.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: tokenMs(this.root, reduced ? "cwl-dur-reduced" : "cwl-dur-hide"), fill: "forwards" });
        fade.onfinish = () => c.el.remove();
      }
      for (const a of answers) {
        let c = this.cards.get(a.id);
        if (!c) {
          const el = make("div", "ai-card", a.text); el.dataset.key = a.id;
          this.root.insertBefore(el, this.turns);
          c = { el, x: 0, y: 0, vx: 0, vy: 0, dx: 0, dy: 0 }; this.cards.set(a.id, c);
          if (!instant) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: tokenMs(this.root, reduced ? "cwl-dur-reduced" : "cwl-dur-make-room"), fill: "backwards" });
        } else if (c.el.textContent !== a.text) c.el.textContent = a.text;
      }
      this.order = answers.map(a => a.id);
      this.layout();
    });
    this.cards.forEach((c, id) => c.el.classList.toggle("is-newest", id === fresh));
  }
  // Crowded: step older cards down, then rest the oldest and give them turns.
  private layout() {
    const cards = this.order.map(id => this.cards.get(id)!).filter(Boolean), keep = 4, older = cards.slice(0, Math.max(0, cards.length - keep));
    for (const c of cards) c.el.classList.remove("is-body", "is-floor", "is-resting");
    for (const c of older) { c.el.classList.toggle("is-body", this.step === 1); c.el.classList.toggle("is-floor", this.step >= 2); }
    let resting = 0;
    if (this.step >= 3 && older.length) {
      // Rest older cards until the rest fit, starting from a rotating offset so every card gets its turn.
      const n = older.length;
      for (let i = 0; i < n && this.root.scrollHeight > this.root.clientHeight + 2; i++) { older[(this.offset + i) % n].el.classList.add("is-resting"); resting++; }
    }
    this.turns.textContent = resting ? `+ ${resting} more, taking turns` : "";
  }
  private over() { return this.root.scrollHeight > this.root.clientHeight + 2; }
  tick(dt: number) {
    const now = performance.now(), quiet = now - this.lastArrival > tokenMs(this.root, "cwl-delay-quiet");
    if (!this.visible) return;
    // One step at a time, each given time to settle: body size, then the floor, then turns.
    if (quiet && this.step < 3 && now - this.stepAt > tokenMs(this.root, "cwl-dur-regroup") && this.over()) { this.step++; this.stepAt = now; this.flip(() => this.layout()); }
    if (this.step >= 3 && now - this.turnAt > tokenMs(this.root, "cwl-dur-turn-hold") && this.turns.textContent) {
      this.turnAt = now; this.offset++; this.flip(() => this.layout());
    }
    const reduced = reducedMotion(this.root), rate = springRate(tokenMs(this.root, "cwl-dur-regroup"));
    this.cards.forEach(c => {
      if (reduced) { c.dx = c.dy = c.vx = c.vy = 0; }
      else if (Math.abs(c.dx) > 0.2 || Math.abs(c.dy) > 0.2 || Math.abs(c.vx) > 0.2 || Math.abs(c.vy) > 0.2) { [c.dx, c.vx] = springStep(c.dx, c.vx, 0, rate, dt); [c.dy, c.vy] = springStep(c.dy, c.vy, 0, rate, dt); }
      else { c.dx = c.dy = c.vx = c.vy = 0; }
      c.el.style.transform = c.dx || c.dy ? `translate(${c.dx.toFixed(2)}px,${c.dy.toFixed(2)}px)` : "";
    });
  }
}

export class WallBoard {
  private feed: Feed;
  private field: Field;
  private cards: Cards;
  private arrivals = new ArrivalOrder();
  private raf = 0;
  private first = true;
  private settle?: ReturnType<typeof setTimeout>;
  private wall: HTMLElement;
  private summary: HTMLElement;
  private summaryText: HTMLElement;
  private empty: HTMLElement;
  private more: HTMLElement;
  private summaryId: string | null = null;
  private split: HTMLElement;
  private head!: HTMLElement;
  constructor(private root: HTMLElement, private session: string) {
    root.dataset.board = "wall";
    this.wall = make("div", "ai-wall"); this.wall.dataset.ai = "off";
    const split = this.split = make("div", "ai-wall-split"), groups = make("section", "ai-groups"), head = make("p", "ai-groups-head");
    head.append(aiBadgeEl(), make("span", "", "Grouped from answers"));
    this.head = head;
    this.summary = make("div", "ai-summary is-off"); this.summary.setAttribute("role", "region"); this.summary.setAttribute("aria-label", "AI summary");
    const clip = make("div", "ai-summary-clip"), box = make("div", "ai-summary-box"), band = make("div", "ai-summary-head");
    band.append(aiIconEl(), document.createTextNode("AI summary"));
    this.summaryText = make("p", "ai-summary-text"); box.append(band, this.summaryText); clip.appendChild(box); this.summary.appendChild(clip);
    const fieldEl = make("div", "ai-group-field");
    this.empty = make("p", "ai-groups-empty", "Grouping as answers arrive");
    this.more = make("p", "ai-more");
    groups.append(head, this.summary, this.empty, fieldEl, this.more);
    const feed = make("section", "tv-feed"), list = make("div", "tv-feed-list");
    feed.append(make("p", "tv-feed-head", "Answers · newest first"), list);
    split.append(groups, feed);
    const cards = make("div", "ai-cards");
    this.wall.append(split, cards);
    root.appendChild(this.wall);
    this.feed = new Feed(list);
    this.field = new Field(fieldEl, key => { const el = make("div", "ai-group"); el.dataset.key = key; el.append(make("span", "lbl"), make("span", "n")); return el; },
      { gapX: 28, gapY: 22, fill: 0.5, maxWidth: 1100, floor: () => this.floor(), onResize: () => this.fitGroups() });
    this.cards = new Cards(cards);
    let last = performance.now();
    const tick = (now: number) => {
      if (!root.isConnected) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
      this.field.step(dt); this.feed.step(dt); this.cards.tick(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  destroy() { cancelAnimationFrame(this.raf); clearTimeout(this.settle); this.field.destroy(); }
  private floor() { return parseFloat(getComputedStyle(this.root).fontSize) || 36; }
  element(key: string) { return this.feed.element(key) ?? this.cards.element(key) ?? this.field.element(key); }
  show(shown: Shown) {
    const frame = shown.frame;
    if (frame.state.live_session_id !== this.session || frame.session?.id !== this.session) return;
    const instant = this.first; this.first = false;
    const fresh = shown.lone && !shown.replay ? shown.fresh[shown.fresh.length - 1] : null;
    if (!fresh && shown.fresh.length && this.root.dataset.newest === "on") this.endMoment();
    this.root.dataset.empty = String(!frame.state.results.total);
    this.render(frame, fresh, instant);
  }
  private render(frame: LiveSnapshot, fresh: string | null, instant: boolean) {
    const { ai, groups, summary } = wallOf(frame.state.results);
    this.wall.dataset.ai = ai ? "on" : "off";
    const answers = this.arrivals.order(frame.answers.filter(answer => answer.session_id === this.session)).map(a => ({ id: a.id, text: a.text }));
    // Both layouts follow every frame, so switching AI on or off only cross-fades.
    this.feed.set(answers, instant);
    this.cards.visible = !ai;
    this.cards.set([...answers].reverse(), ai ? null : fresh, instant || ai);
    this.feed.track.querySelectorAll(".is-newest").forEach(row => row.classList.remove("is-newest"));
    if (fresh && ai) this.feed.element(fresh)?.classList.add("is-newest");
    this.setSummary(ai ? summary : null);
    this.groups = { list: ai ? groups : [], summary: Boolean(ai && summary) };
    this.fitGroups(instant);
    if (fresh) this.moment();
  }
  // Groups never overlap and are never cut: show as many whole groups as fit at the floor,
  // largest first (at least one); the rest wait on the control surface. Run again whenever
  // the field changes size (the summary opening, the answers column narrowing).
  private groups: { list: WallGroup[]; summary: boolean } = { list: [], summary: false };
  private fitGroups(instant = false) {
    const { shown, rest } = shownGroups(this.groups.list, this.groups.summary), summary = this.groups.summary;
    const max = shown.reduce((m, g) => Math.max(m, g.count), 2), scale = this.floor() / 36;
    const entries = shown.map(g => ({ key: g.id, size: wordSize(g.count, max, 44, 72) * scale, update: (el: HTMLElement) => {
      const label = el.querySelector(".lbl")!, n = el.querySelector(".n")!;
      label.replaceChildren(...(g.pinned ? [pinSvg(), document.createTextNode(" ")] : []), document.createTextNode(g.label));
      if (n.textContent !== String(g.count)) n.textContent = String(g.count);
      el.setAttribute("aria-label", `${g.label}, ${g.count} answers${g.pinned ? ", pinned" : ""}`);
    } }));
    // The more line is written first, so the field is measured with its space already taken.
    this.empty.classList.toggle("is-off", shown.length > 0);
    let fit = entries.length;
    for (;;) {
      this.more.textContent = moreGroups(rest + entries.length - fit, summary);
      if (this.field.set(entries.slice(0, fit), instant) || fit <= 1) break;
      fit--;
    }
  }
  // Opening grows its row; a refresh cross-fades the text; hiding closes it.
  private setSummary(summary: { id: string; text: string } | null) {
    const id = summary?.id ?? null;
    if (id === this.summaryId) return;
    const was = this.summaryId; this.summaryId = id;
    this.split.classList.toggle("has-summary", Boolean(summary));
    if (!summary) { this.summary.classList.add("is-off"); return; }
    if (!was || reducedMotion(this.root)) { this.summaryText.textContent = summary.text; this.summary.classList.remove("is-off"); return; }
    this.summaryText.classList.add("is-fading");
    setTimeout(() => { this.summaryText.textContent = summary.text; this.summaryText.classList.remove("is-fading"); }, tokenMs(this.root, "cwl-dur-arrive"));
  }
  private moment() {
    clearTimeout(this.settle);
    this.root.dataset.newest = "on";
    this.settle = setTimeout(() => this.endMoment(), tokenMs(this.root, "cwl-dur-new-hold"));
  }
  private endMoment() {
    clearTimeout(this.settle);
    this.root.dataset.newest = "off";
    this.root.querySelectorAll(".is-newest").forEach(el => { el.classList.add("is-settling"); el.classList.remove("is-newest"); });
  }
}
