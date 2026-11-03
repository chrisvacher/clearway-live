"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Board, reducedMotion, tokenMs, type BoardKind } from "@/lib/tv/board";
import type { TvFlow } from "@/lib/tv/flow";
import { springRate, springStep } from "@/lib/tv/motion";
import type { LiveResults, LiveSnapshot } from "@/lib/live/types";
import { countOf, countUnit, type InteractionKind, type KindInfo } from "@/lib/interactions/kinds";
import { spotlights } from "@/components/interactions/spotlights";

// D1-03: the word cloud or the response wall for one session layer. On the TV
// it follows the arrival flow; a mirror or phone shows each frame at once.
export function LiveBoard({ kind, session, frame, flow }: { kind: BoardKind; session: string; frame: LiveSnapshot | null; flow?: TvFlow | null }) {
  const host = useRef<HTMLDivElement>(null), board = useRef<Board | null>(null);
  useEffect(() => {
    const root = host.current!, next = new Board(root, kind, session);
    board.current = next;
    const off = flow ? flow.subscribe(shown => next.show(shown)) : undefined;
    if (flow?.current) next.show(flow.current);
    return () => { off?.(); next.destroy(); board.current = null; root.replaceChildren(); };
  }, [kind, session, flow]);
  useEffect(() => { if (!flow && frame && board.current) board.current.show({ frame, fresh: [], lone: false, replay: true }); }, [flow, frame]);
  return <div ref={host} className="tv-board" />;
}

// The count climbs on the same gentle spring as the board, in step with the
// answers the TV is showing, never restarting a tick with each batch. It sits in the
// bottom right corner: "8 answering" for one-answer-per-person kinds, "23 answers" for text.
export function Tally({ flow, results, counts, kind }: { flow?: TvFlow | null; results: LiveResults; counts?: KindInfo["counts"]; kind?: InteractionKind }) {
  const el = useRef<HTMLSpanElement>(null), mode = useRef(counts), named = useRef(kind);
  mode.current = counts; named.current = kind;
  const write = (node: HTMLElement, n: number) => { node.replaceChildren(Object.assign(document.createElement("b"), { textContent: String(n) }), ` ${countUnit(n, mode.current, named.current)}`); };
  const total = countOf(results, counts);
  useLayoutEffect(() => {
    const node = el.current; if (!node || !flow) return;
    const read = (r: LiveResults) => countOf(r, mode.current);
    let value = flow.current ? read(flow.current.frame.state.results) : total, target = value, velocity = 0, raf = 0, last = performance.now();
    write(node, value);
    const run = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
      if (reducedMotion(node)) { value = target; velocity = 0; }
      else [value, velocity] = springStep(value, velocity, target, springRate(tokenMs(node, "cwl-dur-make-room")), dt);
      const done = Math.abs(value - target) < 0.3 && Math.abs(velocity) < 0.3;
      write(node, done ? target : Math.round(value));
      raf = done ? 0 : requestAnimationFrame(run);
    };
    const off = flow.subscribe(shown => {
      target = read(shown.frame.state.results);
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(run); }
    });
    return () => { off(); cancelAnimationFrame(raf); };
  }, [flow, counts, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={el} className="tv-tally">{flow ? null : <><b>{total}</b> {countUnit(total, counts, kind)}</>}</span>;
}

type Spot = { key: string; text: string; meta: string };
function spotOf(frame: LiveSnapshot | null): Spot | null {
  const key = frame?.state.spotlight_key;
  if (!frame || !key || frame.state.tv_content !== "session") return null;
  const own = frame.session ? spotlights[frame.session.interaction] : undefined;
  if (own) { const spot = own(frame, key); return spot ? { key, ...spot } : null; }
  if (frame.session?.interaction === "word_cloud") {
    const word = frame.state.results.words.find(item => item.key === key);
    return word ? { key, text: word.text, meta: `${word.count} ${word.count === 1 ? "mention" : "mentions"}` } : null;
  }
  const answer = frame.answers.find(item => item.id === key);
  return answer ? { key, text: answer.text, meta: "From the answers" } : null;
}

// Spotlight: the Navy scrim rises and the item lifts in a Sunrise block.
// Clearing it plays the reverse. The leading word takes its normal color meanwhile.
export function Spotlight({ frame }: { frame: LiveSnapshot | null }) {
  const spot = spotOf(frame), [last, setLast] = useState<Spot | null>(spot);
  useEffect(() => { if (spot) setLast(spot); }, [spot?.key, spot?.text, spot?.meta]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = spot ?? last;
  return <>
    <div className={`tv-scrim${spot ? " is-on" : ""}`} aria-hidden="true" />
    <div className={`tv-spot${spot ? " is-on" : ""}`} aria-hidden={!spot} role={spot ? "status" : undefined}>
      {shown && <><p className="tv-spot-eyebrow">Spotlight</p><p className="tv-spot-text">{shown.text}</p><p className="tv-spot-meta">{shown.meta}</p></>}
    </div>
  </>;
}
