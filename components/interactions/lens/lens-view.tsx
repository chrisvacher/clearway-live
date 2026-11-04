"use client";
import { useEffect, useRef } from "react";
import type { TvViewProps } from "@/components/interactions/tv-views";
import { LensHeading } from "@/components/wayfinding/lens-icon";
import { lensOf } from "@/lib/interactions/lens";
import { LensBoard } from "./lens-board";
import "@/components/interactions/ai/ai.css";
import "./lens.css";

// INT-12's TV view: the lens heading (the lens's icon and the engagement's name for it) above the wall.
// On the TV it follows the arrival flow; a mirror or phone shows each frame at once.
export function LensView({ session, frame, flow }: TvViewProps) {
  const host = useRef<HTMLDivElement>(null), board = useRef<LensBoard | null>(null);
  useEffect(() => {
    const root = host.current!, next = new LensBoard(root, session);
    board.current = next;
    const off = flow ? flow.subscribe(shown => next.show(shown)) : undefined;
    if (flow?.current) next.show(flow.current);
    return () => { off?.(); next.destroy(); board.current = null; root.replaceChildren(); };
  }, [session, flow]);
  useEffect(() => { if (!flow && frame && board.current) board.current.show({ frame, fresh: [], lone: false, replay: true }); }, [flow, frame]);
  const res = lensOf(frame?.state.results), names = res.lens ? Object.assign([] as string[], { [res.lens - 1]: res.lensName }) : null;
  return <div className="lens-tv">
    {res.lens && <div className="lens-tv-head"><LensHeading lens={res.lens} names={names} /></div>}
    <div ref={host} className="tv-board" />
  </div>;
}
