"use client";
import type { LiveSnapshot } from "@/lib/live/types";
import type { TvFlow } from "@/lib/tv/flow";
import { dateLabel, dateShort, goalColumns, goalPlaces, goalsResults, letters, missing, needsLine, type GoalResult } from "@/lib/interactions/goals";
import { LiveView, make, spring, step, useLiveView, type Spring } from "@/components/interactions/grid-form-sign/view-base";
import "./goals.css";

type Card = { el: HTMLElement; x: Spring; y: Spring; o: Spring; going: boolean; still?: boolean };
function put<K extends "className" | "textContent" | "innerHTML">(el: HTMLElement, key: K, value: string) { if (el[key] !== value) el[key] = value; }
function aim(s: Spring, target: number) { if (s.t === target) return 0; s.t = target; return 1; }
const esc = (text: string) => text.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const tag = (text: string) => `<span class="gl-flag">${esc(text)}</span>`;

// INT-15 on the TV (pass 4 CoreGoalBuilder). One Vision Outcome at a time: its 3-year Vision
// bullets on the left, its 1-year goals on the right. Each goal shows the four CORE letters,
// met or missing (checked in the database), its owner's first name, end date and the risks it
// answers. A goal missing a letter is outlined with what it needs, and turns solid when all four
// are met. A new goal slides in; the others glide to make room and a letter fills in place.
// The goals stand in two columns where the room has the width for them (Medium and smaller type),
// in one column otherwise (the default, largest type), so as many as fit show whole. Each card goes
// in the shorter column in order; cards glide across and down as goals arrive, change and reorder.
// Names of people who wrote a goal never show; only the owner's first name does.
class GoalsBoard extends LiveView {
  private eyebrow: HTMLElement; private name: HTMLElement; private bullets: HTMLElement; private list: HTMLElement; private empty: HTMLElement; private more: HTMLElement;
  private cards = new Map<string, Card>();
  private last: LiveSnapshot | null = null; private observer: ResizeObserver;
  constructor(root: HTMLElement, session: string) {
    super(root, session);
    root.classList.add("gl-board");
    root.innerHTML = '<section class="gl-vision"><div class="ey"></div><div class="nm"></div><ul></ul></section>'
      + '<section class="gl-goals"><p class="gl-empty"></p><div class="gl-list"></div><p class="gl-more"></p></section>';
    this.eyebrow = root.querySelector(".ey")!; this.name = root.querySelector(".nm")!; this.bullets = root.querySelector("ul")!;
    this.list = root.querySelector(".gl-list")!; this.empty = root.querySelector(".gl-empty")!; this.more = root.querySelector(".gl-more")!;
    this.observer = new ResizeObserver(() => { if (this.last) { this.draw(this.last, null, true); this.wake(); } });
    this.observer.observe(this.list);
  }
  destroy() { super.destroy(); this.observer.disconnect(); }
  protected draw(frame: LiveSnapshot, _fresh: string | null, instant: boolean) {
    this.last = frame;
    const r = goalsResults(frame.state.results), base = Number((frame.session as { base_year?: number } | null)?.base_year) || 0;
    put(this.eyebrow, "textContent", base ? `3-year Vision · ${base + 3}` : "3-year Vision");
    put(this.name, "textContent", r.outcome?.title ?? "No outcome yet");
    // Bullets are written in place, so changing outcome never blanks the panel.
    while (this.bullets.children.length > r.bullets.length) this.bullets.lastElementChild!.remove();
    r.bullets.forEach((b, i) => {
      let li = this.bullets.children[i] as HTMLElement | undefined;
      if (!li) { li = make("li", ""); li.appendChild(make("span", "")); this.bullets.appendChild(li); }
      put(li.firstElementChild as HTMLElement, "textContent", b);
    });
    put(this.empty, "textContent", r.goals.length ? "" : `No goals for the 1-year Outlook${base ? ` ${base + 1}` : ""} yet. Propose one on your phone.`);
    const born: HTMLElement[] = [], fresh = new Set<string>();
    const written: { goal: GoalResult; card: Card }[] = [];
    for (const goal of r.goals) {
      let card = this.cards.get(goal.id);
      if (!card || card.going) {
        card?.el.remove();
        const el = make("div", "gl-goal");
        el.innerHTML = '<div class="t"></div><div class="gl-letters">' + letters.map(([l, n]) => `<span class="gl-letter" data-l="${l}" title="${n}">${l}</span>`).join("") + '</div><div class="meta"></div><div class="r"></div>';
        this.list.appendChild(el);
        card = { el, x: spring(-1), y: spring(-1), o: spring(instant ? 1 : 0), going: false };
        this.cards.set(goal.id, card); fresh.add(goal.id);
        if (!instant) born.push(el);
      }
      const el = card.el, miss = missing(goal);
      put(el.querySelector(".t") as HTMLElement, "textContent", goal.title);
      // One line under the letters: what the goal still needs (one Sunrise chip), or its result once it has all four.
      const date = dateLabel(goal.end_date), lack = needsLine(miss, goal.needs_risk);
      put(el.querySelector(".meta") as HTMLElement, "innerHTML",
        (!miss.includes("O") ? `<span title="Owner: ${esc(goal.owner)}">${esc(goal.owner)}</span>` : "") + (!miss.includes("E") ? `<span title="Ends ${esc(date)}">${esc(dateShort(goal.end_date))}</span>` : "")
        + (goal.risks.length ? `<span class="risk" aria-label="Answers risk ${goal.risks.join(" and ")}">Risk ${goal.risks.join(", ")}</span>` : ""));
      put(el.querySelector(".r") as HTMLElement, "innerHTML", lack ? tag(lack) : `Result: ${esc(goal.result)}`);
      for (const [l, n] of letters) {
        const x = el.querySelector(`[data-l="${l}"]`)!;
        x.classList.toggle("is-missing", miss.includes(l)); x.setAttribute("aria-label", `${n}${miss.includes(l) ? ", missing" : ", met"}`);
      }
      el.classList.toggle("is-flagged", miss.length > 0 || goal.needs_risk);
      card.going = false; written.push({ goal, card });
    }
    // The goals that fit stand, in order, in one column or two; the rest wait off the list and are counted.
    const room = this.list.clientHeight || 800, floor = this.floor(), gap = floor * 0.6, width = this.list.clientWidth || 1000;
    const cols = goalColumns(width, floor, gap), colW = (width - (cols - 1) * gap) / cols;
    this.list.style.setProperty("--gl-letter", cols === 1 ? "1.3" : "1"); this.list.classList.toggle("is-single", cols === 1);
    // Widths first: how a card's text wraps decides its height.
    for (const { card } of written) { const w = `${colW.toFixed(2)}px`; if (card.el.style.width !== w) card.el.style.width = w; }
    const heights = written.map(({ card }) => card.el.offsetHeight || floor * 4);
    const places = goalPlaces(heights, cols, gap, room);
    let shown = 0;
    written.forEach(({ card }, i) => {
      const p = places[i], x = p.col * (colW + gap), full = !p.shown;
      if (card.y.x < 0) { card.x.x = card.x.t = x; card.y.x = card.y.t = full ? room : p.y; }
      if (aim(card.x, x) | aim(card.y, full ? room : p.y) | aim(card.o, full ? 0 : 1)) card.still = false;
      card.el.toggleAttribute("aria-hidden", full);
      if (!full) shown++;
    });
    for (const [id, c] of this.cards) if (!r.goals.some(g => g.id === id) && !c.going) { c.o.t = 0; c.going = true; c.still = false; }
    const extra = r.goals.length - shown;
    put(this.more, "textContent", extra > 0 ? `+ ${extra} more goal${extra === 1 ? "" : "s"} on your phones` : "");
    if (born.length) this.moment(born);
  }
  protected frame(dt: number, _now: number, snap: boolean) {
    const wo = this.rate("cwl-dur-make-room");
    let busy = false;
    for (const [id, c] of this.cards) {
      const done = [step(c.x, wo, dt, snap), step(c.y, wo, dt, snap), step(c.o, wo, dt, snap)].every(Boolean);
      if (done && c.still) continue;
      c.still = done; busy = true;
      c.el.style.transform = `translate(${c.x.x.toFixed(2)}px,${c.y.x.toFixed(2)}px)`;
      c.el.style.opacity = c.o.x >= 0.999 ? "" : Math.max(0, c.o.x).toFixed(3);
      if (c.going && c.o.x < 0.02) { c.el.remove(); this.cards.delete(id); }
    }
    return busy;
  }
}

export function GoalsView({ session, frame, flow }: { session: string; frame: LiveSnapshot; flow?: TvFlow | null }) {
  const host = useLiveView((root, id) => new GoalsBoard(root, id), session, frame, flow);
  return <div ref={host} className="tv-board" role="img" aria-label="The CORE goals for this outcome" />;
}
