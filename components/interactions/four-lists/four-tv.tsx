"use client";
import "./four-lists.css";
import { useEffect, useRef } from "react";
import type { TvViewProps } from "@/components/interactions/tv-views";
import { FourBoard } from "./four-board";

// INT-11 on the TV. It follows the arrival flow; a mirror or phone shows each frame at once. A card appears the moment it
// is sent. An agree, a fold or an Undo is not an answer, so the flow brings it in at once with every card waiting.
export function FourListsView({ session, frame, flow }: TvViewProps) {
  const host = useRef<HTMLDivElement>(null), board = useRef<FourBoard | null>(null);
  useEffect(() => {
    const root = host.current!, next = new FourBoard(root);
    board.current = next;
    const off = flow?.subscribe(shown => { if (shown.frame.session?.id === session) next.set(shown.frame.state.results, { fresh: shown.lone ? shown.fresh : [] }); });
    if (flow?.current?.frame.session?.id === session) next.set(flow.current.frame.state.results, { instant: true });
    return () => { off?.(); next.destroy(); board.current = null; root.replaceChildren(); };
  }, [session, flow]);
  useEffect(() => { if (!flow && frame && board.current && frame.session?.id === session) board.current.set(frame.state.results, { instant: true }); }, [flow, frame, session]);
  return <div ref={host} className="tv-board tv-fl" data-board="four_lists" />;
}
