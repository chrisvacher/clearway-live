"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { reducedMotion, tokenMs } from "@/lib/tv/board";
import { AiMark, useAiSweep } from "@/components/interactions/ai/ai-icon";
import { cardsIn, groupedLine, listKeys, listNames, moreOnPhones, shownPerList, type FourListsResults } from "@/lib/interactions/four-lists";
import { FourListsCard } from "./four-lists-card";
import "./four-lists.css";

type Spot = { x: number; y: number; w: number; text: string; col: string };
// Layout positions inside the board (offsets), so the stage's scale and any card still in flight never skew them.
const spotOf = (el: HTMLElement, root: HTMLElement): Spot => {
  let x = 0, y = 0, node: HTMLElement | null = el;
  while (node && node !== root) { x += node.offsetLeft; y += node.offsetTop; node = node.offsetParent as HTMLElement | null; }
  return { x, y, w: el.offsetWidth, text: el.querySelector(".fl-tx")?.textContent ?? "", col: el.closest<HTMLElement>("[data-col]")?.dataset.col ?? "" };
};

// Where a card is drawn now relative to where it is laid out: a glide still in flight. A card that moves again before its glide ends
// starts the next one from where it is drawn, not from where it was laid out, so it never leaps.
const inFlight = (el: HTMLElement) => {
  const value = getComputedStyle(el).transform;
  if (!value || value === "none") return { x: 0, y: 0 };
  const m = new DOMMatrixReadOnly(value);
  return { x: m.m41, y: m.m42 };
};

// The glide: the card is drawn at its old place at once (an inline transform, so the first frame is already right), then the
// browser carries it home. The inline start is cleared as the glide ends.
function glide(el: HTMLElement, dx: number, dy: number, ms: number) {
  el.getAnimations().forEach(a => a.cancel());
  const start = `translate(${dx}px, ${dy}px)`;
  el.style.transform = start;
  const run = el.animate([{ transform: start }, { transform: "none" }], { duration: ms, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "forwards" });
  const done = () => { if (el.style.transform === start) el.style.transform = ""; };
  run.onfinish = () => { done(); run.cancel(); };
  run.oncancel = done;
}

// INT-11 on the TV: four lists side by side, told apart by heading and position. Cards keep their elements, so each
// glides to its place as agreement re-orders a list; a new card arrives where it lands; AI grouping slides the cards it
// absorbs into the one that stays. Each list shows as many whole cards as fit (largest agreement first); the rest wait
// on phones. The type steps from the body size to the room minimum before any card is held back, and never steps back up.
export function FourListsBoard({ results }: { results: FourListsResults }) {
  const root = useRef<HTMLDivElement>(null), lists = useRef(new Map<string, HTMLDivElement>()), mores = useRef(new Map<string, HTMLParagraphElement>());
  const before = useRef<Map<string, Spot> | null>(null), size = useRef<"body" | "floor">("body"), hold = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [newest, setNewest] = useState<string | null>(null), [settling, setSettling] = useState<string | null>(null);
  const known = useRef<Set<string> | null>(null);
  const sweep = useAiSweep<HTMLParagraphElement>(results.cards.filter(c => c.ai).flatMap(c => c.ids.map(id => `${c.id}\u0001${id}`)), "four_lists");

  useLayoutEffect(() => {
    const host = root.current!;
    // Fit: every card shows, then each list keeps the whole cards that fit its height. Body type first, then the room minimum.
    const fit = () => {
      const kept: Record<string, number> = {};
      for (const key of listKeys) {
        const list = lists.current.get(key); if (!list) continue;
        const cards = [...list.querySelectorAll<HTMLElement>(":scope > .fl-card")];
        cards.forEach(c => c.removeAttribute("data-over"));
        const gap = parseFloat(getComputedStyle(list).rowGap) || 0, room = list.clientHeight;
        let used = 0, n = 0;
        for (const c of cards) { const next = used + (n ? gap : 0) + c.offsetHeight; if (next > room + 0.5 && n >= 1) break; used = next; n++; }
        cards.slice(n).forEach(c => c.setAttribute("data-over", ""));
        kept[key] = n;
      }
      return kept;
    };
    host.dataset.size = size.current;
    let kept = fit();
    // A list holding fewer than three cards while more are ready steps the type down once (never back up).
    const short = () => listKeys.some(key => { const total = cardsIn(results, key).length; return total > 0 && (kept[key] ?? 0) < Math.min(3, total); });
    if (size.current === "body" && short()) { size.current = "floor"; host.dataset.size = "floor"; kept = fit(); }
    for (const key of listKeys) {
      const more = mores.current.get(key), column = results.columns[key];
      // Cards past the eight the server sends are counted by the server; the rest wait on phones too.
      if (more) more.textContent = moreOnPhones(column, Math.min(kept[key] ?? 0, shownPerList));
    }

    // Where every visible card stands now, against where it stood: the spring is the browser's, from the old place.
    const after = new Map<string, Spot>();
    host.querySelectorAll<HTMLElement>(".fl-card[data-card]:not([data-over])").forEach(el => after.set(el.dataset.card!, spotOf(el, host)));
    const prior = before.current, reduced = reducedMotion(host);
    if (prior && !reduced) {
      const move = tokenMs(host, "cwl-dur-regroup");
      const taken = new Set<string>();
      after.forEach((spot, id) => {
        const was = prior.get(id), el = host.querySelector<HTMLElement>(`[data-card="${id}"]`)!;
        if (!was) { if (known.current && !known.current.has(id)) el.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: tokenMs(host, "cwl-dur-arrive"), easing: "cubic-bezier(0, 0, 0.25, 1)" }); return; }
        const flight = inFlight(el), dx = was.x + flight.x - spot.x, dy = was.y + flight.y - spot.y;
        if (Math.abs(was.x - spot.x) > 1 || Math.abs(was.y - spot.y) > 1) glide(el, dx, dy, move);
      });
      // A card AI folded into another slides into it and fades; a card that simply left (hidden, withdrawn) fades where it stood.
      prior.forEach((was, id) => {
        if (after.has(id)) return;
        const into = results.cards.find(c => c.id !== id && c.ids.includes(id) && after.has(c.id)), to = into ? after.get(into.id)! : null;
        if (taken.has(id)) return; taken.add(id);
        const ghost = document.createElement("div");
        ghost.className = "fl-card fl-ghost"; ghost.setAttribute("aria-hidden", "true");
        Object.assign(ghost.style, { left: `${was.x}px`, top: `${was.y}px`, width: `${was.w}px` });
        const tx = document.createElement("span"); tx.className = "fl-tx"; tx.textContent = was.text; ghost.appendChild(tx);
        host.appendChild(ghost);
        const out = ghost.animate([{ transform: "none", opacity: 1 }, { transform: to ? `translate(${to.x - was.x}px, ${to.y - was.y}px) scale(0.92)` : "scale(0.96)", opacity: 0 }],
          { duration: to ? move : tokenMs(host, "cwl-dur-hide"), easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "forwards" });
        out.onfinish = () => ghost.remove();
      });
    }
    // The card that has just arrived keeps the Lime moment, then settles.
    const ids = new Set(results.cards.map(c => c.id));
    if (known.current && prior) {
      const fresh = results.cards.filter(c => !known.current!.has(c.id) && after.has(c.id));
      if (fresh.length) {
        const last = fresh[fresh.length - 1].id; clearTimeout(hold.current);
        setNewest(last); setSettling(null);
        hold.current = setTimeout(() => { setNewest(null); setSettling(last); }, tokenMs(host, "cwl-dur-new-hold"));
      }
    }
    known.current = new Set([...(known.current ?? []), ...ids]);
    before.current = after;
  }, [results]);
  useLayoutEffect(() => () => clearTimeout(hold.current), []);

  const total = results.cards.length;
  return <div className="fl-tv" data-board="four_lists">
    <div ref={root} className="tv-board fl-board" data-empty={String(!results.total)} data-newest={newest ? "on" : "off"}>
      {listKeys.map((key, i) => {
        const cards = cardsIn(results, key);
        return <section key={key} className={`fl-col${cards.length ? "" : " is-empty"}`} data-col={key} aria-labelledby={`fl-h-${key}`}>
          <header><span className="fl-ix" aria-hidden="true">{i + 1}</span><h2 className="fl-name" id={`fl-h-${key}`}>{listNames[key]}</h2></header>
          <div className="fl-list" ref={el => { if (el) lists.current.set(key, el); else lists.current.delete(key); }}>
            {cards.map(c => <FourListsCard key={c.id} card={c} newest={newest === c.id} settling={settling === c.id} />)}
          </div>
          <p className="fl-more" ref={el => { if (el) mores.current.set(key, el); else mores.current.delete(key); }} />
        </section>;
      })}
    </div>
    <p ref={sweep} className="fl-foot" data-ai-foot={results.ai && total ? "on" : undefined}>{results.ai && total > 0 && <><AiMark label="AI" /><span>{groupedLine}</span></>}</p>
  </div>;
}
