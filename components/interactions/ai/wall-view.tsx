"use client";
import { useEffect, useRef } from "react";
import type { TvViewProps } from "@/components/interactions/tv-views";
import { WallBoard } from "./wall-board";
import "./ai.css";

// INT-02's TV view. On the TV it follows the arrival flow; a mirror or phone shows each frame at once.
export function WallView({ session, frame, flow }: TvViewProps) {
  const host = useRef<HTMLDivElement>(null), board = useRef<WallBoard | null>(null);
  useEffect(() => {
    const root = host.current!, next = new WallBoard(root, session);
    board.current = next;
    const off = flow ? flow.subscribe(shown => next.show(shown)) : undefined;
    if (flow?.current) next.show(flow.current);
    return () => { off?.(); next.destroy(); board.current = null; root.replaceChildren(); };
  }, [session, flow]);
  useEffect(() => { if (!flow && frame && board.current) board.current.show({ frame, fresh: [], lone: false, replay: true }); }, [flow, frame]);
  return <div ref={host} className="tv-board" />;
}
