"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Board, reducedMotion, tokenMs, type BoardKind } from "@/lib/tv/board";
import type { TvFlow } from "@/lib/tv/flow";
import { springRate, springStep } from "@/lib/tv/motion";
import type { LiveResults, LiveSnapshot } from "@/lib/live/types";
import { countLabel, type InteractionKind, type KindInfo } from "@/lib/interactions/kinds";
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

// The count badges (Chris, November 4 2026): top left, beside the church's badge, numbers only.
// People who have responded (users icon) on every live result screen; on a kind where one person
// can send several (counts "answers": word cloud, open text, Q&A, lens wall, bullets) a second badge
// counts the submissions (send icon, the phone's Send). A one-response kind counts each person once,
// however many items they touch. Each number climbs on the same gentle spring as the board, in step
// with the answers the TV is showing, never restarting a tick with each batch.
const usersIcon = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
const sendIcon = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';
export function Tally({ flow, results, counts, kind }: { flow?: TvFlow | null; results: LiveResults; counts?: KindInfo["counts"]; kind?: InteractionKind }) {
  const el = useRef<HTMLSpanElement>(null), mode = useRef(counts), named = useRef(kind);
  mode.current = counts; named.current = kind;
  const several = counts === "answers";
  const write = (node: HTMLElement, people: number, total: number) => {
    node.querySelector(".tv-count-people b")!.textContent = String(people);
    node.querySelector(".tv-count-sent b")!.textContent = String(total);
    node.setAttribute("aria-label", countLabel(people, total, mode.current, named.current));
  };
  useLayoutEffect(() => {
    const node = el.current; if (!node) return;
    node.querySelector(".tv-count-people i")!.innerHTML = usersIcon;
    node.querySelector(".tv-count-sent i")!.innerHTML = sendIcon;
    const read = (r: LiveResults): [number, number] => [r.people, r.total];
    let [p, t] = flow?.current ? read(flow.current.frame.state.results) : read(results);
    let tp = p, tt = t, vp = 0, vt = 0, raf = 0, last = performance.now();
    write(node, p, t);
    if (!flow) return;
    const run = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
      if (reducedMotion(node)) { p = tp; t = tt; vp = vt = 0; }
      else { const w = springRate(tokenMs(node, "cwl-dur-make-room")); [p, vp] = springStep(p, vp, tp, w, dt); [t, vt] = springStep(t, vt, tt, w, dt); }
      const done = Math.abs(p - tp) < 0.3 && Math.abs(vp) < 0.3 && Math.abs(t - tt) < 0.3 && Math.abs(vt) < 0.3;
      write(node, done ? tp : Math.round(p), done ? tt : Math.round(t));
      raf = done ? 0 : requestAnimationFrame(run);
    };
    const off = flow.subscribe(shown => {
      [tp, tt] = read(shown.frame.state.results);
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(run); }
    });
    return () => { off(); cancelAnimationFrame(raf); };
  }, [flow, counts, kind, flow ? 0 : results.people, flow ? 0 : results.total]); // eslint-disable-line react-hooks/exhaustive-deps
  // On the TV the numbers follow the arrival flow and are written by the effect above, never by
  // React: a re-render with the server's newest count would run ahead of the answers on screen.
  return <span ref={el} className={`tv-tally tv-counts${several ? " is-several" : ""}`} role="status" aria-label={flow ? undefined : countLabel(results.people, results.total, counts, kind)}>
    <span className="tv-count tv-count-people"><i /><b>{flow ? null : results.people}</b></span>
    <span className="tv-count tv-count-sent"><i /><b>{flow ? null : results.total}</b></span>
  </span>;
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
