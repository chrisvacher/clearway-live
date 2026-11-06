"use client";
import type { LiveSnapshot } from "@/lib/live/types";
import type { TvFlow } from "@/lib/tv/flow";
import { cardNeeds, cardsOf, fieldLockMs, intentFields, lineChange, needsText, shortDate, type IntentCard, type IntentField, type IntentStep } from "@/lib/interactions/intent";
import { LiveView, make, useLiveView } from "@/components/interactions/grid-form-sign/view-base";
import { fitLines } from "@/lib/tv/fit";
import "./intent.css";

// INT-16 on the TV (pass 4 IntentCard). Drafting: every card on the wall, its commander's
// intent written live on each, a bar of how much is filled in, and a flag where a first step
// has no owner or date. Presenting (a card spotlit from the remote): one card at full size.
// An edit replaces its line as it is typed: typing grows or trims the line in place, a
// rewrite crossfades over cwl-dur-line-replace. The field someone is typing in carries a
// quiet underline for cwl-dur-field-lock. Names of who is typing never reach this screen.
type Line = HTMLElement & { _text?: string; _timer?: ReturnType<typeof setTimeout> };

class IntentWall extends LiveView {
  private grid: HTMLElement; private pres: HTMLElement; private empty: HTMLElement;
  private cards = new Map<string, HTMLElement>(); private steps = new Map<string, HTMLElement>(); private presented = "";
  private typed = new Set<string>(); private observer?: ResizeObserver;
  constructor(root: HTMLElement, session: string) {
    super(root, session);
    root.classList.add("int-board");
    root.innerHTML = '<p class="int-empty">Waiting for the first card</p><div class="int-grid"></div><div class="int-present" hidden></div>';
    this.empty = root.querySelector(".int-empty")!; this.grid = root.querySelector(".int-grid")!; this.pres = root.querySelector(".int-present")!;
    // The cards refit their lines when their space changes (room size, the TV's fit, more cards).
    if (typeof ResizeObserver === "function") { this.observer = new ResizeObserver(() => this.fitLines()); this.observer.observe(this.grid); }
    void document.fonts?.ready.then(() => this.fitLines());
  }
  destroy() { this.observer?.disconnect(); super.destroy(); }
  // Each card's intent line shows the whole lines that fit between its title and its progress bar,
  // up to three, and ends in an ellipsis; the bar keeps its own space below it. A line never runs
  // into the bar or is cut through the middle of its letters. When the card has less room than the
  // intent wants (it wraps to more lines than fit), the card tightens (a one-line title, closer
  // rows) to give the intent its lines, and when not even one line fits it tightens to make one.
  private fitLines() {
    if (!this.root.isConnected || this.grid.hidden) return;
    for (const card of this.cards.values()) {
      const line = card.querySelector<HTMLElement>(".int-line")!, hd = card.querySelector<HTMLElement>(".int-hd")!, prog = card.querySelector<HTMLElement>(".int-prog")!;
      const box = getComputedStyle(card), text = getComputedStyle(line), gap = parseFloat(box.rowGap) || 0;
      const lh = parseFloat(text.lineHeight) || parseFloat(text.fontSize) * 1.25;
      const lines = () => fitLines(card.clientHeight - parseFloat(box.paddingTop) - parseFloat(box.paddingBottom) - hd.offsetHeight - prog.offsetHeight - 2 * gap, lh, 3);
      // How many lines the intent wraps to at this width (up to three), measured unclamped.
      const was = line.style.getPropertyValue("--int-lines");
      line.style.setProperty("--int-lines", "3"); line.removeAttribute("data-lines");
      const natural = Math.min(3, Math.max(1, Math.round(line.scrollHeight / lh)));
      if (was) line.style.setProperty("--int-lines", was);
      card.classList.remove("is-tight");
      let n = lines();
      if (n < natural) { card.classList.add("is-tight"); const t = lines(); if (t > n) n = t; else card.classList.remove("is-tight"); }
      if (line.dataset.lines !== String(n)) { line.dataset.lines = String(n); line.style.setProperty("--int-lines", String(n)); }
    }
  }
  // Put a line's text in place. Typing edits it in place; a rewrite crossfades; the first draw is instant.
  private line(el: Line, text: string, instant: boolean, blank = "Not drafted yet") {
    const old = el._text ?? "", change = lineChange(old, text);
    if (change === "same" && el.dataset.ready) return;
    el._text = text; el.dataset.ready = "1";
    el.classList.toggle("is-blank", !text);
    if (!text) { el.textContent = blank; return; }
    if (instant || change === "typing" || change === "new" || this.root.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = text; return; }
    const ms = this.ms("cwl-dur-line-replace", 240);
    const a = make("span", "int-old", old), b = make("span", "int-new", text);
    el.replaceChildren(b, a);
    a.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-0.35em)" }], { duration: ms, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" }).onfinish = () => a.remove();
    b.animate([{ opacity: 0, transform: "translateY(0.35em)" }, { opacity: 1, transform: "none" }], { duration: ms, easing: "cubic-bezier(.2,0,0,1)", fill: "backwards" });
  }
  // The typing underline: restarted by each change in the field, gone after cwl-dur-field-lock.
  private typing(el: Line, on: boolean, key: string, changed: boolean, instant: boolean) {
    const was = this.typed.has(key);
    if (!on || instant) { this.typed.delete(key); el.classList.remove("is-typing"); return; }
    if (was && !changed) return;
    this.typed.add(key);
    el.classList.remove("is-typing"); void el.offsetWidth; el.classList.add("is-typing");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.classList.remove("is-typing"); this.typed.delete(key); }, this.ms("cwl-dur-field-lock", fieldLockMs));
  }
  private card(c: IntentCard, instant: boolean) {
    let el = this.cards.get(c.id);
    if (!el) {
      el = make("article", "int-card"); el.dataset.card = c.id;
      el.innerHTML = '<div class="int-hd"><span class="int-num"></span><span class="int-title"></span></div><div class="int-line"></div><div class="int-prog"></div>';
      this.cards.set(c.id, el); this.grid.appendChild(el);
      if (!instant) el.animate([{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: this.ms("cwl-dur-arrive", 360), easing: "cubic-bezier(.2,0,0,1)" });
    }
    el.querySelector(".int-num")!.textContent = String(c.number);
    el.querySelector(".int-title")!.textContent = c.title;
    const line = el.querySelector<Line>(".int-line")!, before = line._text ?? "";
    this.line(line, c.intent, instant, "Intent not drafted yet");
    this.typing(line, c.typing.includes("intent"), `${c.id}:intent`, before !== c.intent, instant);
    const bad = c.steps.filter(s => s.missing.length);
    el.querySelector(".int-prog")!.innerHTML = [0, 1, 2, 3].map(i => `<i class="${i < c.filled ? "is-on" : ""}"></i>`).join("")
      + (bad.length ? `<span class="int-flag-tag">${cardNeeds(bad)}</span>` : `<span>${c.filled} of 4</span>`);
    el.classList.toggle("is-flagged", bad.length > 0);
    el.style.order = String(c.number);
    return el;
  }
  private present(c: IntentCard, year: number | null, instant: boolean) {
    const p = this.pres;
    if (this.presented !== c.id) {
      this.presented = c.id; this.steps.clear(); this.typed.clear();
      p.innerHTML = `<div class="int-hd"><span class="int-num"></span><span class="int-title"></span></div>${intentFields.map(f => `<div class="int-field" data-f="${f.key}"><div class="int-lb">${f.label}</div><div class="int-tx"></div></div>`).join("")}<div class="int-field" data-f="steps"><div class="int-lb">Next 30 days</div><div class="int-tx int-steps"></div></div>`;
      if (!instant) p.animate([{ opacity: 0, transform: "scale(0.97)" }, { opacity: 1, transform: "none" }], { duration: this.ms("cwl-dur-arrive", 360), easing: "cubic-bezier(.2,0,0,1)" });
    }
    p.querySelector(".int-num")!.textContent = String(c.number); p.querySelector(".int-title")!.textContent = c.title;
    for (const f of intentFields) {
      const tx = p.querySelector<Line>(`[data-f="${f.key}"] .int-tx`)!, before = tx._text ?? "";
      this.line(tx, c[f.key as IntentField], instant);
      this.typing(tx, c.typing.includes(f.key), `${c.id}:${f.key}`, before !== c[f.key as IntentField], instant);
    }
    const box = p.querySelector<HTMLElement>(".int-steps")!;
    const seen = new Set<string>();
    c.steps.forEach((s, i) => { seen.add(s.id); this.step(box, s, i, instant); });
    for (const [id, el] of this.steps) if (!seen.has(id)) { this.steps.delete(id); el.remove(); }
    box.dataset.empty = String(!c.steps.length);
    void year;
  }
  private step(box: HTMLElement, s: IntentStep, i: number, instant: boolean) {
    let el = this.steps.get(s.id);
    if (!el) {
      el = make("div", "int-step"); el.innerHTML = '<span class="int-s"></span><span class="int-w"></span>';
      this.steps.set(s.id, el); box.appendChild(el);
      if (!instant) el.animate([{ opacity: 0, transform: "translateY(0.4em)" }, { opacity: 1, transform: "none" }], { duration: this.ms("cwl-dur-arrive", 360), easing: "cubic-bezier(.2,0,0,1)" });
    }
    const line = el.querySelector<Line>(".int-s")!, before = line._text ?? "";
    this.line(line, s.text, instant);
    this.typing(line, Boolean(s.typing), `step:${s.id}`, before !== s.text, instant);
    el.querySelector(".int-w")!.innerHTML = `<span>${s.owner ? "Owner set" : "No owner"}</span><span>${s.date ? shortDate(s.date) : "No date"}</span>${s.missing.length ? `<span class="int-flag-tag">${needsText(s.missing)}</span>` : ""}`;
    el.classList.toggle("is-flagged", s.missing.length > 0);
    el.style.order = String(i);
  }
  protected draw(frame: LiveSnapshot, _fresh: string | null, instant: boolean) {
    const cards = cardsOf(frame.state.results), spot = typeof frame.state.spotlight_key === "string" ? frame.state.spotlight_key : "";
    const one = spot ? cards.find(c => c.id === spot) : undefined, year = null;
    this.empty.hidden = cards.length > 0;
    const ids = new Set(cards.map(c => c.id));
    for (const [id, el] of this.cards) if (!ids.has(id)) { this.cards.delete(id); el.remove(); }
    this.grid.style.setProperty("--int-cols", String(cards.length <= 1 ? 1 : cards.length === 2 ? 2 : 3));
    for (const c of cards) this.card(c, instant);
    this.grid.hidden = Boolean(one) || cards.length === 0;
    this.pres.hidden = !one;
    if (one) this.present(one, year, instant); else this.presented = "";
    this.fitLines();
  }
  protected frame() { return false; }
}

export function IntentView({ session, frame, flow }: { session: string; frame: LiveSnapshot; flow?: TvFlow | null }) {
  const host = useLiveView((root, id) => new IntentWall(root, id), session, frame, flow);
  return <div ref={host} className="tv-board" />;
}
