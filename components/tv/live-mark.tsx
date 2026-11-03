"use client";
import Image from "next/image";
import type { TvAppearance } from "@/lib/tv/types";

// Design pass 3, changes 7, 8 and 10 (Chris, November 2): the LIVE marker is the
// Clearway mark. Lime while live (Off-White while a newest arrival holds the screen's
// Lime moment; Navy on a Lime disc on light screens). Not live: the quiet Sky mark,
// alone for Phones down, beside the word Closed when a step is closed. Offline and
// reconnecting: the gray mark, breathing slowly, with no word.
export type MarkState = "live" | "down" | "closed" | null;
export function LiveMark({ state, reconnecting, phone = false, label = "Reconnecting" }: { state: MarkState; reconnecting: boolean; phone?: boolean; label?: string }) {
  const base = phone ? "ph" : "tv";
  return <span className={`${base}-mark-slot`}>
    {state === "live" && <span className={`${base}-live cwl-mark is-live`} role="img" aria-label="Live"><span className="sr-only">Live</span></span>}
    {state === "down" && <span className={`${base}-live cwl-mark is-down`} role="img" aria-label="Phones down"><span className="sr-only">Phones down</span></span>}
    {state === "closed" && <span className={`${base}-live is-closed`}><span className="cwl-mark is-quiet" aria-hidden="true" />Closed</span>}
    <span className={`${base}-reconnecting cwl-mark is-offline${reconnecting ? " is-on" : ""}`} role={reconnecting ? "status" : undefined} aria-hidden={!reconnecting}>
      {reconnecting && <span className="sr-only">{label}</span>}
    </span>
  </span>;
}

// The top left of the TV carries only the church's logo or name (change 8): a monogram
// tile until the church's own logo is read from Team Hub.
export function ChurchLockup({ display }: { display: TvAppearance }) {
  const short = display.church.split(/\s+/)[0] || display.church;
  return <span className={`tv-church-logo${display.logo_url ? " has-logo" : ""}`}>
    {display.logo_url ? <Image unoptimized src={display.logo_url} alt={display.church} width={180} height={56} />
      : <><span className="tv-church-mono" aria-hidden="true">{short.charAt(0)}</span><span role="img" aria-label={display.church}>{short}</span></>}
  </span>;
}
