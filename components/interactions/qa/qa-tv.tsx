"use client";
import "./qa.css";
import { useEffect, useRef } from "react";
import { MessageCircleQuestion } from "lucide-react";
import type { TvViewProps } from "@/components/interactions/tv-views";
import type { LiveSnapshot } from "@/lib/live/types";
import { questionsOf } from "@/lib/interactions/qa";
import { QaRows } from "./qa-rows";

// INT-03 on the TV. It follows the arrival flow; a mirror or phone shows each frame at once.
export function QaTv({ session, frame, flow }: TvViewProps) {
  const host = useRef<HTMLDivElement>(null), rows = useRef<QaRows | null>(null);
  useEffect(() => {
    const root = host.current!, next = new QaRows(root);
    rows.current = next;
    const off = flow?.subscribe(shown => { if (shown.frame.session?.id === session) next.set(questionsOf(shown.frame.state.results), { fresh: shown.lone ? shown.fresh : [] }); });
    if (flow?.current?.frame.session?.id === session) next.set(questionsOf(flow.current.frame.state.results), { instant: true });
    return () => { off?.(); next.destroy(); rows.current = null; root.replaceChildren(); };
  }, [session, flow]);
  useEffect(() => { if (!flow && frame && rows.current && frame.session?.id === session) rows.current.set(questionsOf(frame.state.results), { instant: true }); }, [flow, frame, session]);
  return <div ref={host} className="tv-board tv-qa" />;
}

// Questions any time: while another step is on, the TV notes the waiting count quietly.
// The questions stay off the screen until the facilitator shows them.
export function QaWaiting({ frame }: { frame: LiveSnapshot | null }) {
  const pool = frame?.qa?.pool;
  if (!pool || !pool.waiting || frame?.state.live_session_id === pool.session_id) return null;
  return <span className="qa-waiting"><MessageCircleQuestion aria-hidden="true" />Questions any time: {pool.waiting} waiting</span>;
}
