"use client";
import { useEffect, useState } from "react";
import type { TvViewProps } from "@/components/interactions/tv-views";
import type { LiveSnapshot } from "@/lib/live/types";
import { fourListsOf } from "@/lib/interactions/four-lists";
import { FourListsBoard } from "./four-lists-board";
import "./four-lists.css";

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

// INT-11's TV view. Every card is on screen the moment it is stored; AI is never in this path (grouping arrives later, as a
// separate event). Before the first card the four lists stand empty under their headings.
export function FourListsView({ session, frame, flow }: TvViewProps) {
  const shown = useShown(session, frame, flow);
  return <FourListsBoard results={fourListsOf(shown?.state.results)} />;
}
