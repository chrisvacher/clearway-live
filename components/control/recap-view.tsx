"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Download, Printer } from "lucide-react";
import { TvMirror } from "@/components/tv/tv-mirror";
import { recapCount, recapFrame, recapKey, type Recap, type RecapEntry } from "@/lib/export/recap";
import { lensOf, lensOptions } from "@/lib/interactions/lens";
import { windowLabel } from "@/lib/run-of-show/self-paced";
import { parts, type ShowContext } from "@/lib/run-of-show/types";
import type { LiveSnapshot } from "@/lib/live/types";
import "./self-paced.css";

// One card: the session's type, prompt and count, and the TV's own picture of its results.
// The picture is the TV's view at mirror scale with motion off, so a new number puts the
// card in place without re-animating it.
const Card = memo(function Card({ entry, frame, engagement, zone, now }: { entry: RecapEntry; frame: LiveSnapshot; engagement: string; zone: string; now: number }) {
  const s = entry.session, label = s.kind?.label ?? s.interaction;
  return <article className="recap-card" data-session={s.id} data-kind={s.interaction}>
    <div className="recap-meta"><span className="ctl-eyebrow">{label}{entry.mode === "self_paced" ? " · Self-paced" : ""}</span>
      <span className={`show-state is-${s.state}`}>{entry.mode === "self_paced" ? windowLabel({ ...entry, state: s.state }, zone, now) : s.state === "closed" ? "Closed" : s.state === "open" ? "Taking late answers" : s.state === "live" || s.state === "phones_down" ? "Live" : "Ready"}</span></div>
    <h3>{s.title}</h3>
    {s.prompt && <p className="recap-prompt">{s.prompt}</p>}
    <TvMirror frame={frame} label={`Results for ${s.title}`} />
    {s.interaction === "lens" && !lensOptions(s.options).seed && lensOf(entry.results).seeded.length > 0 && <p className="recap-prompt">The count is this step&rsquo;s own answers. Seeded sentences are counted in the seeding step&rsquo;s CSV.</p>}
    <div className="recap-meta"><span className="recap-count" aria-live="polite">{recapCount(entry)}</span>
      <a className="show-button is-small" href={`/api/control/${engagement}/export?session=${s.id}`} download><Download size={14} aria-hidden="true" />Download CSV</a></div>
  </article>;
}, (a, b) => a.frame === b.frame && a.zone === b.zone && (a.entry.mode !== "self_paced" || Math.floor(a.now / 60000) === Math.floor(b.now / 60000)));

export function RecapView({ engagement, context, initial }: { engagement: string; context: ShowContext; initial: Recap }) {
  const [recap, setRecap] = useState(initial);
  const [offset, setOffset] = useState(() => Date.parse(initial.server_time) - Date.now());
  const [now, setNow] = useState(() => Date.now());
  // The recap follows the room while it is open: read again every 5 seconds.
  useEffect(() => {
    let stopped = false;
    const read = async () => {
      try {
        const response = await fetch(`/api/control/${engagement}/recap`, { cache: "no-store" });
        if (!response.ok || stopped) return;
        const next = await response.json() as Recap;
        if (next.status === "ok") { setRecap(next); setOffset(Date.parse(next.server_time) - Date.now()); setNow(Date.now()); }
      } catch { /* Keep the last recap. */ }
    };
    const timer = setInterval(() => void read(), 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [engagement]);
  // A card's frame changes only when its own results, answers or text change.
  const frames = useRef(new Map<string, { key: string; frame: LiveSnapshot }>());
  const cards = useMemo(() => recap.sessions.map(entry => {
    const key = recapKey(entry), known = frames.current.get(entry.session.id);
    const frame = known && known.key === key ? known.frame : recapFrame(recap, entry);
    frames.current.set(entry.session.id, { key, frame });
    return { entry, frame };
  }), [recap]);
  const serverNow = now + offset;
  return <main id="main" className="tv-manager recap">
    <div className="ctl-row recap-actions">
      <button className="show-button" type="button" onClick={() => window.print()}><Printer size={18} aria-hidden="true" />Print or save as PDF</button>
      <a className="show-button" href={`/api/control/${engagement}/export?session=all`} download><Download size={18} aria-hidden="true" />Download all as CSV</a>
      <a className="show-button" href={`/api/control/${engagement}/export?format=json`} download><Download size={18} aria-hidden="true" />Download engagement JSON</a></div>
    <div className="recap-head"><div className="tv-manager-heading"><p className="ctl-eyebrow">{context.church} · {context.title}</p><h1>Results recap</h1>
      <p>Every session that took answers, with its results as they appeared on the TV. It keeps up as answers arrive.</p></div></div>
    {!cards.length && <p className="recap-empty">No session has taken answers yet. Results appear here once the room reaches a session or a self-paced session opens.</p>}
    {parts.map(part => {
      const list = cards.filter(c => c.entry.part === part);
      if (!list.length) return null;
      return <section key={part} className="recap-part" aria-labelledby={`recap-${part}`}><h2 id={`recap-${part}`}>{part}</h2>
        <div className="recap-grid">{list.map(({ entry, frame }) => <Card key={entry.session.id} entry={entry} frame={frame} engagement={engagement} zone={context.timezone} now={serverNow} />)}</div>
      </section>;
    })}
  </main>;
}
