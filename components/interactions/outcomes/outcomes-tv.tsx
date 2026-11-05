"use client";
import { useFitCount } from "@/components/tv/use-fit-count";
import "./outcomes.css";
import { useEffect, useRef, useState } from "react";
import { CircleAlert, Check, Hand, List, PencilLine } from "lucide-react";
import type { TvViewProps } from "@/components/interactions/tv-views";
import type { LiveSnapshot } from "@/lib/live/types";
import { bulletsOf, confirmOf, type ConfirmRow } from "@/lib/interactions/outcomes";
import { reducedMotion, tokenMs } from "@/lib/tv/board";

const none: never[] = [];
const ms = (name: string, fallback: number) => tokenMs(document.documentElement, name) || fallback;

// The frame the TV is showing for this step: the arrival flow's, or the latest when there is none
// (a mirror or a phone). A typed update carries no new answer, so the flow shows it at once.
function useShown(session: string, frame: LiveSnapshot | null, flow?: TvViewProps["flow"]) {
  const [shown, setShown] = useState<LiveSnapshot | null>(() => flow?.current?.frame ?? frame);
  useEffect(() => {
    if (!flow) { setShown(frame); return; }
    if (flow.current) setShown(flow.current.frame);
    return flow.subscribe(next => setShown(next.frame));
  }, [flow, frame]);
  return shown?.session?.id === session ? shown : null;
}

// Text that grows in place as it is typed: the characters that just arrived fade in at the end of
// the line; a rewrite crossfades. Nothing is redrawn and the line never jumps.
function Typed({ text }: { text: string }) {
  const before = useRef(text), [parts, setParts] = useState({ kept: text, added: "", key: 0 });
  useEffect(() => {
    const was = before.current; before.current = text;
    if (text === was) return;
    setParts(p => text.startsWith(was) && was.length > 0 ? { kept: was, added: text.slice(was.length), key: p.key + 1 } : { kept: "", added: text, key: p.key + 1 });
  }, [text]);
  const settled = parts.kept + parts.added === text;
  return settled
    ? <span className="oc-line">{parts.kept}<span key={parts.key} className={parts.kept ? "oc-grow" : "oc-swap"}>{parts.added}</span></span>
    : <span className="oc-line">{text}</span>;
}

// D1-11, D1-12 on the TV: "In 2029, what's true?" for one Vision Outcome at a time, the bullets
// appearing letter by letter as people type, and the rail of every outcome. An outcome with no
// bullets stays outlined in Sunrise until it has one (the server says which).
export function BulletsTv({ session, frame, flow }: TvViewProps) {
  const shown = useShown(session, frame, flow), data = bulletsOf(shown?.state.results);
  const current = data.current, bullets = current ? current.bullets : none;
  const seen = useRef<Set<string> | null>(null), [newest, setNewest] = useState<string | null>(null);
  useEffect(() => {
    const ids = new Set(bullets.map(b => b.id));
    if (seen.current) { const fresh = bullets.filter(b => !seen.current!.has(b.id)).pop(); if (fresh) setNewest(fresh.id); }
    seen.current = ids;
  }, [bullets]);
  useEffect(() => {
    if (!newest) return;
    const timer = setTimeout(() => setNewest(null), ms("cwl-dur-new-hold", 1200));
    return () => clearTimeout(timer);
  }, [newest]);
  // The newest bullets that fit above the "+ N earlier" line; the older ones are counted on it.
  const list = useRef<HTMLDivElement>(null), fit = useFitCount(list, bullets.length, "end");
  if (!current) return <div className="tv-board tv-oc"><p className="oc-note">Waiting for the Vision Outcomes.</p></div>;
  const floor = bullets.length > 4, out = bullets.length - fit, earlier = current.earlier + out;
  return <div className="tv-board tv-oc"><div className="oc-bullets" data-screen="outcome-bullets">
    <div className="oc-main">
      <div className="oc-title"><span className="oc-num">{current.number}</span><span className="oc-t">{current.title}</span></div>
      <div className="oc-blist" role="list" aria-label="Bullets" ref={list}>
        {bullets.length === 0 && <div className="oc-empty is-flagged" role="listitem">
          <span className="oc-flag"><CircleAlert aria-hidden="true" />Needs a bullet</span>
          <span className="oc-empty-note">No one has said what&rsquo;s true in {data.year ?? "this year"} yet.</span></div>}
        {bullets.map((b, i) => <div key={b.id} role="listitem" aria-hidden={i < out ? true : undefined} className={`oc-bullet${floor ? " is-floor" : ""}${newest === b.id ? " is-newest" : ""}${b.typing ? " is-typing" : ""}${i < out ? " is-out" : ""}`} data-newest={newest === b.id ? "true" : undefined}>
          <span><Typed text={b.text} /></span></div>)}
      </div>
      <p className="oc-more">{earlier > 0 ? `+ ${earlier} earlier ${earlier === 1 ? "bullet" : "bullets"} on your phones` : ""}</p>
    </div>
    <aside className={`oc-rail${data.outcomes.length > 4 ? " is-dense" : ""}`} aria-label="Vision Outcomes">
      <div className="oc-rail-head">Vision Outcomes</div>
      {data.outcomes.map(o => <div key={o.id} className={`oc-orow${o.id === current.id ? " is-current" : ""}${o.empty ? " is-flagged" : ""}`}
        aria-label={`${o.title}, ${o.count ? `${o.count} ${o.count === 1 ? "bullet" : "bullets"}` : "no bullets yet"}`}>
        <span className="oc-num">{o.number}</span><span className="oc-t">{o.title}</span>
        <span className="oc-k">{o.count ? <><List aria-hidden="true" />{o.count}</> : <span className="oc-flag" title="Empty"><CircleAlert aria-hidden="true" /><span className="sr-only">Empty</span></span>}</span>
      </div>)}
    </aside>
  </div></div>;
}

// One confirm row. It confirms once: Lime sweeps across it, holds, and settles to the quiet
// Confirmed mark, so the screen keeps one Lime moment.
function Row({ row, crowded }: { row: ConfirmRow; crowded: boolean }) {
  const decided = row.decision, was = useRef(decided), [phase, setPhase] = useState<"" | "confirming" | "settling">("");
  useEffect(() => {
    if (!decided || was.current) { was.current = decided; return; }
    was.current = decided;
    if (reducedMotion(document.documentElement)) return;
    const sweep = ms("cwl-dur-outcome-confirm", 700), hold = ms("cwl-dur-new-hold", 1200) * 0.4, settle = ms("cwl-dur-settle-color", 600);
    setPhase("confirming");
    const a = setTimeout(() => setPhase("settling"), sweep + hold), b = setTimeout(() => setPhase(""), sweep + hold + settle);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [decided]);
  const challenged = row.challenged && !decided;
  return <div className={`oc-crow${crowded ? " is-crowded" : ""}${challenged ? " is-challenged" : ""}${decided ? " is-decided" : ""}${phase ? ` is-${phase}` : ""}`} data-outcome={row.id}>
    <span className="oc-num">{row.number}</span>
    <div className="oc-nm">{row.title}{decided === "renamed" && row.was && <s>{row.was}</s>}</div>
    <div className="oc-tail">
      <span className="oc-chal"><Hand aria-hidden="true" />Challenged</span>
      <span className="oc-cnts"><span title="Confirm"><Check aria-hidden="true" />{row.c}</span><span title="Rename"><PencilLine aria-hidden="true" />{row.r}</span><span title="Challenge"><Hand aria-hidden="true" />{row.x}</span></span>
      <span className="oc-dec">{decided === "renamed" ? <><PencilLine aria-hidden="true" />Renamed</> : <><Check aria-hidden="true" />Confirmed</>}</span>
    </div>
  </div>;
}

// D2-05, D2-06 on the TV: where the room is on each provisional outcome. Counts only, no bars and
// no winner; a challenged outcome gets a soft highlight until the room decides.
export function ConfirmTv({ session, frame, flow }: TvViewProps) {
  const shown = useShown(session, frame, flow), data = confirmOf(shown?.state.results);
  if (!data.outcomes.length) return <div className="tv-board tv-oc"><p className="oc-note">Waiting for the Vision Outcomes.</p></div>;
  return <div className="tv-board tv-oc"><div className="oc-confirm" data-screen="outcome-confirm" role="list" aria-label="Vision Outcomes">
    {data.outcomes.map(row => <div key={row.id} role="listitem" className="oc-crow-host"><Row row={row} crowded={data.outcomes.length > 6} /></div>)}
  </div></div>;
}
