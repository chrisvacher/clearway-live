"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, ListChecks, MessageSquare, Printer, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/menu";
import { PageHeader } from "@/components/ui/page-header";
import { countOf } from "@/lib/interactions/kinds";
import { TvMirror } from "@/components/tv/tv-mirror";
import { recapCount, recapFrame, recapKey, type Recap, type RecapEntry } from "@/lib/export/recap";
import { lensOf, lensOptions } from "@/lib/interactions/lens";
import { windowLabel } from "@/lib/run-of-show/self-paced";
import { type ShowContext } from "@/lib/run-of-show/types";
import type { LiveSnapshot } from "@/lib/live/types";
import { WorkshopSummary } from "./workshop-summary";
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
      <Button variant="quiet" size="small" href={`/api/control/${engagement}/export?session=${s.id}`} download aria-label="Download CSV">CSV</Button></div>
  </article>;
}, (a, b) => a.frame === b.frame && a.entry.csv_rows === b.entry.csv_rows && a.zone === b.zone && (a.entry.mode !== "self_paced" || Math.floor(a.now / 60000) === Math.floor(b.now / 60000)));

// Results follow the room every five seconds, keeping each unchanged TV mirror mounted.
export function RecapView({ engagement, context, initial, people, sections, workshop = false }: {
  engagement: string;
  context: ShowContext;
  initial: Recap;
  people: number;
  sections: Record<string, string>;
  workshop?: boolean;
}) {
  const [recap, setRecap] = useState(initial);
  const [section, setSection] = useState<string | null>(null);
  const [hasSummary, setHasSummary] = useState(false);
  useEffect(() => {
    let stopped = false;
    async function read() {
      try {
        const response = await fetch(`/api/control/${engagement}/recap`, { cache: "no-store" });
        if (!response.ok || stopped) return;
        const next = await response.json() as Recap;
        if (!stopped && next.status === "ok") setRecap(next);
      } catch { /* Keep the last results. */ }
    }
    const timer = setInterval(() => void read(), 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [engagement]);

  const frames = useRef(new Map<string, { key: string; frame: LiveSnapshot }>());
  const cards = useMemo(() => recap.sessions.map(entry => {
    const key = recapKey(entry);
    const known = frames.current.get(entry.session.id);
    const frame = known?.key === key ? known.frame : recapFrame(recap, entry);
    frames.current.set(entry.session.id, { key, frame });
    return { entry, frame };
  }), [recap]);
  const groups = [...new Set(cards.map(({ entry }) => sections[entry.session.id] ?? entry.part))];
  const shown = section ? cards.filter(({ entry }) => (sections[entry.session.id] ?? entry.part) === section) : cards;
  const answers = recap.sessions.reduce((sum, entry) => sum + (entry.csv_rows ?? countOf(entry.results, "answers")), 0);
  const exportUrl = `/api/control/${engagement}/export`;
  const downloads = [
    ...(workshop ? [{ label: "Summary as Word", disabled: !hasSummary, onSelect: () => window.location.assign(`/api/control/${engagement}/summary?format=docx`) }] : []),
    { label: "Every answer as CSV", onSelect: () => window.location.assign(`${exportUrl}?session=all`) },
    { label: "Everything, for our records", onSelect: () => window.location.assign(`${exportUrl}?format=json`) },
  ];
  return <main id="main" className="admin-page recap cwl-g-results">
    <PageHeader kicker={context.church} title="Results"
      facts={[
        { icon: <Users aria-hidden="true" />, text: `${people} ${people === 1 ? "person" : "people"}` },
        { icon: <ListChecks aria-hidden="true" />, text: `${cards.length} ${cards.length === 1 ? "step" : "steps"} took answers` },
        { icon: <MessageSquare aria-hidden="true" />, text: `${answers} ${answers === 1 ? "answer" : "answers"}` },
      ]}
      lead={<small>Late answers still arrive until you close the engagement.</small>}
      secondary={<Button onClick={() => window.print()}><Printer aria-hidden="true" />Print or save as PDF</Button>}
      primary={<Menu label="Download" className="cwl-g-download" trigger={<><Download aria-hidden="true" />Download<ChevronDown aria-hidden="true" /></>} items={downloads} />}
    />
    {workshop && <WorkshopSummary engagement={engagement} answers={answers > 0} onAvailability={setHasSummary} />}
    <section aria-labelledby="recap-results-title" className="recap-part">
      <div className="cwl-g-section-head">
        <div><h2 id="recap-results-title">Session by session</h2><p>In run of show order</p></div>
        {groups.length > 0 && <Menu label="Filter by section" trigger={<>{section ?? "All sections"}<ChevronDown aria-hidden="true" /></>}
          items={[{ label: "All sections", onSelect: () => setSection(null) }, ...groups.map(label => ({ label, onSelect: () => setSection(label) }))]} />}
      </div>
      {!cards.length && <p className="recap-empty">No step has taken answers yet.</p>}
      <div className="recap-grid">{shown.map(({ entry, frame }) =>
        <Card key={entry.session.id} entry={entry} frame={frame} engagement={engagement} zone={context.timezone} now={Date.parse(recap.server_time)} />
      )}</div>
    </section>
  </main>;
}
