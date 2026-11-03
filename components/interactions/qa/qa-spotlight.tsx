"use client";
import "./qa.css";
import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import type { LiveSnapshot } from "@/lib/live/types";
import type { QaSpot } from "@/lib/interactions/qa";

// Spotlight over any session: one question large on the TV, in Sunrise over the Navy scrim,
// whatever step is on (or none). Clearing it, or Answered, plays the reverse.
export function QaSpotlight({ frame }: { frame: LiveSnapshot | null }) {
  const spot = frame?.qa?.spotlight ?? null, [last, setLast] = useState<QaSpot | null>(spot);
  useEffect(() => { if (spot) setLast(spot); }, [spot?.id, spot?.text, spot?.people, spot?.askers]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = spot ?? last;
  return <>
    <div className={`tv-scrim${spot ? " is-on" : ""}`} aria-hidden="true" />
    <div className={`tv-spot qa-spot${spot ? " is-on" : ""}`} aria-hidden={!spot} role={spot ? "status" : undefined}>
      {shown && <><p className="tv-spot-eyebrow">Question from the room</p><p className="tv-spot-text qa-spot-text">{shown.text}</p>
        <p className="tv-spot-meta qa-spot-meta"><ArrowUp aria-hidden="true" /><span>{shown.people}{shown.askers > 1 ? ` · ${shown.ai ? "Combined · " : ""}asked by ${shown.askers}` : ""}</span></p></>}
    </div>
  </>;
}
