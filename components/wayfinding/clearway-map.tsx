"use client";
import { useEffect, useState } from "react";
import { CircleDashed, Download, Printer } from "lucide-react";
import type { MapDraft, MapField, MapGoal } from "@/lib/wayfinding/map";
import "./clearway-map.css";

// An empty field says it is empty and why. Nothing is invented.
const Field = ({ label, f }: { label: string; f: MapField }) => <div className={`map-f${f.empty ? " is-empty" : ""}`}>
  <b>{label}</b>
  {f.empty ? <p><CircleDashed size={14} aria-hidden="true" />{f.why}</p> : f.items ? <ul>{f.items.map(i => <li key={i}>{i}</li>)}</ul> : <p>{f.text}</p>}
</div>;
const Empty = ({ why }: { why?: string }) => <p className="map-empty"><CircleDashed size={14} aria-hidden="true" />{why}</p>;
const Goals = ({ goals }: { goals: MapGoal[] }) => <ul className="map-goals">{goals.map(g => <li key={g.id}><strong>{g.title}</strong>{g.result && <span>{g.result}</span>}
  <small>{[g.owner, g.end_date].filter(Boolean).join(" · ")}</small></li>)}</ul>;

// The draft Map on the control surface. Facilitators only: it is never sent to the TV or phones.
export function ClearwayMap({ engagement, initial }: { engagement: string; initial: MapDraft }) {
  const [draft, setDraft] = useState(initial);
  // The Map follows the records while it is open.
  useEffect(() => {
    let stopped = false;
    const read = async () => {
      try {
        const response = await fetch(`/api/control/${engagement}/map`, { cache: "no-store" });
        if (!response.ok || stopped) return;
        const next = await response.json() as MapDraft;
        if (next.status === "ok") setDraft(current => next.version === current.version ? current : next);
      } catch { /* the Map stays as it was */ }
    };
    const timer = setInterval(read, 10000);
    return () => { stopped = true; clearInterval(timer); };
  }, [engagement]);
  const p = draft.pages, a = p.page1, b = p.page2;
  return <div className="map-app">
    <header className="map-head">
      <div><p className="ctl-eyebrow">{p.church} · {p.title}</p><h1>Draft Clearway Map</h1><p className="map-version">Version {draft.version}. Only facilitators see this.</p></div>
      <div className="ctl-row map-actions">
        <button className="show-button" onClick={() => window.print()}><Printer size={18} aria-hidden="true" />Print or save as PDF</button>
        <a className="show-button" href={`/api/control/${engagement}/map?format=md`} download><Download size={18} aria-hidden="true" />Download text</a>
      </div>
    </header>
    <div className="map-doc" data-version={draft.version}>
      <section className="map-page" aria-label="Page 1, Identity and direction">
        <h2>Identity and direction</h2>
        <Field label="Mission" f={a.mission} /><Field label="Purpose" f={a.purpose} /><Field label="Values" f={a.values} /><Field label="Strategy" f={a.strategy} />
        <div className="map-f"><b>10-year Future · {a.future.year}</b>
          {a.future.lenses.map(l => <div key={l.lens} className={`map-lens${l.state === "signed_off" ? "" : " is-empty"}`} data-lens={l.lens}>
            <h3>{l.name}</h3>{l.state === "signed_off" ? <ul>{l.lines.map(x => <li key={x}>{x}</li>)}</ul> : <Empty why={l.why} />}</div>)}</div>
        <div className="map-f"><b>3-year Vision · {a.vision.year}</b>
          {a.vision.empty ? <Empty why={a.vision.why} /> : <ol className="map-outcomes">{a.vision.outcomes.map(o => <li key={o.id}>
            <strong>{o.title}</strong>{o.status !== "confirmed" && <span className="map-tag">Provisional</span>}
            {o.description && <p>{o.description}</p>}{o.indicators.length > 0 && <ul>{o.indicators.map(i => <li key={i}>{i}</li>)}</ul>}</li>)}</ol>}</div>
      </section>
      <section className="map-page" aria-label="Page 2, Action">
        <h2>Action</h2>
        <div className="map-f is-empty"><b>This Year&apos;s Priorities</b><p><CircleDashed size={14} aria-hidden="true" />{b.priorities.why}</p></div>
        <div className="map-f"><b>1-year Outlook · {b.outlook.year}</b>
          {b.outlook.empty ? <Empty why={b.outlook.why} /> : <Goals goals={b.outlook.goals} />}
          {b.outlook.unmet > 0 && <p className="map-note">{b.outlook.unmet} {b.outlook.unmet === 1 ? "goal does" : "goals do"} not meet CORE yet and {b.outlook.unmet === 1 ? "is" : "are"} left off.</p>}</div>
        <div className="map-f"><b>Key metrics</b>{b.outlook.metrics.empty ? <Empty why={b.outlook.metrics.why} /> : <ol>{b.outlook.metrics.items.map(m => <li key={m.text}>{m.text}</li>)}</ol>}</div>
        <div className="map-f"><b>Celebrations</b>{b.outlook.celebrations.empty ? <Empty why={b.outlook.celebrations.why} /> : <ul>{b.outlook.celebrations.items.map(m => <li key={m.text}>{m.text}</li>)}</ul>}</div>
        <div className="map-f"><b>This Season&apos;s Goals{b.season.label ? ` · ${b.season.label}` : ""}</b>{b.season.empty ? <Empty why={b.season.why} /> : <Goals goals={b.season.goals} />}</div>
        <Field label="Leadership Rhythms" f={b.rhythms} />
        <div className="map-f"><b>Key Issues</b>{b.issues.empty ? <Empty why={b.issues.why} /> : <ul className="map-issues">{b.issues.items.map((i, n) => <li key={n}><span className="map-tag">{i.kind === "risk" ? "Risk" : i.kind === "tension" ? "Tension" : "Question"}</span>{i.text}
          {i.mitigations && i.mitigations.length > 0 && <small>{i.mitigations.join("; ")}</small>}</li>)}</ul>}</div>
      </section>
    </div>
  </div>;
}
