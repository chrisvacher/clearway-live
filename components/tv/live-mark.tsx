"use client";
import Image from "next/image";
import type { TvAppearance } from "@/lib/tv/types";
import { NoveteraLockup } from "@/components/brand/novetera-lockup";
import { NoveteraMark } from "@/components/brand/novetera-mark";
import { screensFor } from "@/lib/brand/screens";
import type { Skin } from "@/lib/brand";

// Design pass 3, changes 7, 8 and 10 (Chris, November 2): the LIVE marker is the
// Clearway mark. Lime while live (Off-White while a newest arrival holds the screen's
// Lime moment; Navy on a Lime disc on light screens). Not live: the quiet Sky mark,
// alone for Phones down, beside the word Closed when a step is closed. Offline and
// reconnecting: the gray mark, breathing slowly, with no word.
export type MarkState = "live" | "down" | "closed" | null;
// The Novetera skin draws the N mark here instead (the same slot, the same states): the second stroke turns oxblood while live,
// the mark is quiet when nothing is live, steady-and-grey breathing when offline, and beside the word Closed when a step is
// closed. On the TV's join screen the slot holds the full lockup (`lockup`).
function NoveteraLiveMark({ state, reconnecting, phone, label, lockup }: { state: MarkState; reconnecting: boolean; phone: boolean; label: string; lockup: boolean }) {
  const base = phone ? "ph" : "tv", words = screensFor("novetera"), size = phone ? "phone" : "tv";
  const live = !reconnecting && state === "live", down = !reconnecting && state === "down", closed = !reconnecting && state === "closed";
  return <span className={`${base}-mark-slot nvt-slot`}>
    {reconnecting ? <span className="nvt-state is-offline" role="status"><NoveteraMark offline size={size} label={null} /><span className="sr-only">{label}</span></span>
      : lockup && !state ? <span className="nvt-join-lockup"><NoveteraLockup size="tv" tone="join" label={words.markLabel.plain} /></span>
      : closed ? <span className={`${base}-live is-closed nvt-closed`}><NoveteraMark size={size} label={null} />{words.closed}</span>
      : <span className={`nvt-state${down ? " is-down" : ""}`}><NoveteraMark live={live} size={size} label={words.markLabel[live ? "live" : down ? "down" : "quiet"]} /></span>}
  </span>;
}
export function LiveMark({ state, reconnecting, phone = false, label = "Reconnecting", skin = "clearway", lockup = false }: { state: MarkState; reconnecting: boolean; phone?: boolean; label?: string; skin?: Skin; lockup?: boolean }) {
  if (skin === "novetera") return <NoveteraLiveMark state={state} reconnecting={reconnecting} phone={phone} label={label} lockup={lockup} />;
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
