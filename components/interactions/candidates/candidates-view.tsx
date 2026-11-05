"use client";
import "./candidates.css";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TvViewProps } from "@/components/interactions/tv-views";
import { LiveBars } from "@/components/interactions/bars/tv-bars";
import type { LiveSnapshot } from "@/lib/live/types";
import { candidatesOf, type Candidate } from "@/lib/interactions/candidates";
import { reducedMotion, tokenMs } from "@/lib/tv/board";

// The frame the TV is showing for this step: the arrival flow's, or the latest when there is none.
function useShown(session: string, frame: LiveSnapshot | null, flow?: TvViewProps["flow"]) {
  const [shown, setShown] = useState<LiveSnapshot | null>(() => flow?.current?.frame ?? frame);
  useEffect(() => {
    if (!flow) { setShown(frame); return; }
    if (flow.current) setShown(flow.current.frame);
    return flow.subscribe(next => setShown(next.frame));
  }, [flow, frame]);
  return shown?.session?.id === session ? shown : null;
}

// A title that changes in place: the old words fade out as the new ones fade in, on the same line,
// so an accepted rename never moves the card.
function Title({ text }: { text: string }) {
  const was = useRef(text), [old, setOld] = useState<{ text: string; key: number } | null>(null), key = useRef(0);
  useEffect(() => {
    if (was.current === text) return;
    const before = was.current; was.current = text; key.current += 1;
    setOld({ text: before, key: key.current });
    const timer = setTimeout(() => setOld(null), 700);
    return () => clearTimeout(timer);
  }, [text]);
  return <span className="cd-title"><span key={`now-${key.current}`} className={old ? "cd-in" : ""}>{text}</span>{old && <span key={`old-${old.key}`} className="cd-out" aria-hidden="true">{old.text}</span>}</span>;
}

// D1-07, D1-09 and D1-10 on the TV. Candidate priorities show a number and a title only: the sources, the
// lenses and the AI badge stay on the control surface. One color for every card. While the facilitator
// reviews, the TV waits. A merge glides the leaving card onto the one it joins; a rename changes in place;
// a new card arrives; the rest move to their new places. Then the 100 points use the same bars as INT-07,
// and the marked ones stand alone, outlined, as the provisional Vision Outcomes.
export function CandidatesView({ session, frame, flow }: TvViewProps) {
  const shown = useShown(session, frame, flow), data = candidatesOf(shown?.state.results);
  if (!shown) return <div className="tv-board tv-cd"><p className="cd-note">Waiting for the candidates.</p></div>;
  if (data.phase === "points") return <LiveBars kind="points" session={session} frame={shown} flow={flow} />;
  if (data.phase === "review" || !data.candidates.length) return <div className="tv-board tv-cd" data-phase="review"><p className="cd-note">The facilitator is reviewing the candidates. They will be here in a moment.</p></div>;
  return <Cards data={data} />;
}

type Box = { x: number; y: number; w: number; h: number };
// Layout positions inside the board (offsets), so the stage's scale and any card still in flight never skew them.
const boxOf = (el: HTMLElement): Box => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });

function Cards({ data }: { data: ReturnType<typeof candidatesOf> }) {
  const host = useRef<HTMLDivElement>(null), boxes = useRef(new Map<string, Box>()), seen = useRef<Set<string> | null>(null), last = useRef<Candidate[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set()), [ghosts, setGhosts] = useState<{ c: Candidate; from: Box; to: string }[]>([]);
  const marked = data.phase === "marked";

  // New cards arrive. A card that left because of a merge becomes a ghost that glides onto its target.
  useLayoutEffect(() => {
    const ids = new Set(data.candidates.map(c => c.id));
    if (seen.current) {
      setFresh(new Set(data.candidates.filter(c => !seen.current!.has(c.id)).map(c => c.id)));
      const gone = last.current.filter(c => !ids.has(c.id) && boxes.current.has(c.id));
      const joins = gone.flatMap(c => { const m = data.merges.find(x => x.from === c.id && ids.has(x.into)); return m ? [{ c, from: boxes.current.get(c.id)!, to: m.into }] : []; });
      if (joins.length) setGhosts(g => [...g, ...joins]);
    }
    seen.current = ids; last.current = data.candidates;
  }, [data.candidates, data.merges]);

  // Fit: rows size to their names. If the cards pass the board, the type steps down (never below the room minimum, 36px) until every card sits on one screen.
  useLayoutEffect(() => {
    const el = host.current; if (!el) return;
    // The room minimum is 36px on a 1080p TV (the token floor at scale 1), so the type may step down to it and no further.
    const card = el.querySelector<HTMLElement>(".cd-card"); el.style.setProperty("--cd-fit", "1");
    const px = card ? parseFloat(getComputedStyle(card).fontSize) || 0 : 0, min = px > 36 ? 36 / px : 1;
    let fit = 1;
    while (el.scrollHeight > el.clientHeight + 1 && fit > min) { fit = Math.max(min, fit - 0.04); el.style.setProperty("--cd-fit", String(fit)); }
    // Only when the cards change: the TV's parent re-renders about every frame, and a forced layout each time would slow the names arriving.
  }, [data.candidates, data.merges]);

  // Every card keeps its element (keyed by candidate). When its place changes, it glides from where it was
  // seen (a card already moving continues from where it is) in the same commit, so no frame shows it jumping.
  useLayoutEffect(() => {
    const el = host.current; if (!el) return;
    const next = new Map<string, Box>();
    el.querySelectorAll<HTMLElement>("[data-cid]").forEach(card => {
      const id = card.dataset.cid!, now = boxOf(card), before = boxes.current.get(id);
      next.set(id, now);
      if (before && !reducedMotion(el) && (Math.abs(before.x - now.x) > 1 || Math.abs(before.y - now.y) > 1)) {
        const m = new DOMMatrixReadOnly(getComputedStyle(card).transform), dx = before.x - now.x + (m.m41 || 0), dy = before.y - now.y + (m.m42 || 0);
        const dur = tokenMs(el, "cwl-dur-regroup") || 600;
        card.getAnimations().forEach(a => a.cancel());
        card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: dur, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" });
      }
    });
    boxes.current = next;
  });
  // A change of size with no new data (fonts arriving, the stage fitting) moves cards without a glide: note it quietly.
  useEffect(() => {
    const el = host.current; if (!el || typeof ResizeObserver === "undefined") return;
    const note = () => { const next = new Map<string, Box>(); el.querySelectorAll<HTMLElement>("[data-cid]").forEach(c => next.set(c.dataset.cid!, boxOf(c))); boxes.current = next; };
    const ro = new ResizeObserver(note); ro.observe(el); el.querySelectorAll("[data-cid]").forEach(c => ro.observe(c));
    return () => ro.disconnect();
  });

  return <div className="tv-board tv-cd" data-phase={data.phase}>
    {marked && <p className="cd-head">Provisional Vision Outcomes</p>}
    <div className="cd-grid" ref={host} role="list" aria-label={marked ? "Provisional Vision Outcomes" : "Candidate priorities"}>
      {data.candidates.map(c => <div key={c.id} role="listitem" data-cid={c.id} className={`cd-card${fresh.has(c.id) ? " is-new" : ""}${marked ? " is-marked" : ""}`}>
        <span className="cd-num">{c.num}</span><Title text={c.name} />
      </div>)}
    </div>
    {ghosts.map(g => <Ghost key={g.c.id} ghost={g} host={host} done={() => setGhosts(list => list.filter(x => x.c.id !== g.c.id))} />)}
  </div>;
}

// The leaving card, drawn where it was, gliding onto its target and fading as it lands.
function Ghost({ ghost, host, done }: { ghost: { c: Candidate; from: Box; to: string }; host: React.RefObject<HTMLDivElement | null>; done: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = el.current, grid = host.current; if (!node || !grid) { done(); return; }
    node.style.setProperty("left", `${ghost.from.x}px`); node.style.setProperty("top", `${ghost.from.y}px`);
    node.style.setProperty("width", `${ghost.from.w}px`); node.style.setProperty("height", `${ghost.from.h}px`);
    const target = grid.querySelector<HTMLElement>(`[data-cid="${ghost.to}"]`);
    if (!target || reducedMotion(grid)) { done(); return; }
    const dur = tokenMs(grid, "cwl-dur-regroup") || 600;
    const move = node.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${target.offsetLeft - ghost.from.x}px, ${target.offsetTop - ghost.from.y}px)`, opacity: 0 }], { duration: dur, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "forwards" });
    move.onfinish = done;
    return () => move.cancel();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={el} className="cd-card cd-ghost" aria-hidden="true">
    <span className="cd-num">{ghost.c.num}</span><span className="cd-title">{ghost.c.name}</span></div>;
}
