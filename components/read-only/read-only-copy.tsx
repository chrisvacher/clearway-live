import { CircleDashed, Eye, FileText } from "lucide-react";
import { LiveWordmark } from "@/components/brand/live-wordmark";
import { mapDate } from "@/lib/wayfinding/map";
import { seasonCells } from "@/lib/report/policy";
import { goalStatusLine, type RoField, type RoGoal, type RoSection, type RoView } from "@/lib/read-only/policy";
import { PrintButton } from "./print-button";

// An empty field is left out of the copy. The facilitator's own views keep their prompts to fill it ("Add it in setup"), but this goes to people outside Clearway.
const Field = ({ label, f }: { label: string; f: RoField }) => f.empty ? null : <div className="ro-mf">
  <span className="ro-eyebrow">{label}</span>
  {f.items ? <ul>{f.items.map(i => <li key={i}>{i}</li>)}</ul> : <p>{f.text}</p>}
</div>;
const filled = (f: { empty?: boolean }) => !f.empty;

// What the owner said in their newest check-in: a label and the day, never the note. Nothing before the first check-in.
const Status = ({ goal }: { goal: RoGoal }) => {
  const s = goalStatusLine(goal);
  return s ? <span className={`ro-status is-${goal.status}`} data-testid="ro-goal-status"><b>{s.label}</b>{s.on ? <span>, {s.on}</span> : null}</span> : null;
};

function Report({ report }: { report: NonNullable<RoView["report"]> }) {
  const Section = ({ s }: { s: RoSection }) => {
  // The scribe's action cards stand under the table as their own list, as they do in the Word and PDF export: they have no who, when or who tells them.
  const rows = s.table?.rows ?? [], actions = rows.filter(r => r.group === "actions" && r.parts.some(p => p.text)), plan = rows.filter(r => r.group !== "actions");
  return <section className="ro-rsec" data-key={s.key}>
    <h3>{s.heading}</h3>
    {s.sentences.map((x, i) => x.quote
      ? <blockquote key={i} className="ro-quote">{x.text}{x.thin ? <span className="ro-thin">{x.thin}</span> : null}</blockquote>
      : <p key={i}>{x.text}{x.thin ? <span className="ro-thin">{x.thin}</span> : null}</p>)}
    {plan.length > 0 && s.table && <div className="ro-scroll"><table className="ro-table">
      {s.table.columns.length > 0 && <thead><tr>{s.table.columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>}
      <tbody>{plan.map((r, i) => r.cells.length
        ? <tr key={i}>{seasonCells(s.table!.columns, r.cells).map((c, j) => <td key={j}>{c.split("\n").map((line, k) => <span key={k} className="ro-line">{line}</span>)}</td>)}</tr>
        : <tr key={i}><td colSpan={Math.max(s.table!.columns.length, 1)}>{r.title ? <b>{r.title}</b> : null}
            {r.parts.map((p, k) => <span key={k} className="ro-line">{p.text}{p.owner ? ` (${p.owner}${p.due ? `, ${mapDate(p.due)}` : ""})` : p.due ? ` (${mapDate(p.due)})` : ""}</span>)}</td></tr>)}</tbody></table></div>}
    {actions.length > 0 && <div className="ro-actions" data-testid="ro-actions"><h4>Actions the room named</h4>
      <ul>{actions.map((r, i) => <li key={i}>{r.parts.find(p => p.text)?.text}</li>)}</ul></div>}
  </section>;
  };
  return <section className="ro-sec" id="report" data-testid="ro-report">
    <h2>The report</h2>
    <p className="ro-note">Signed off on {mapDate(report.signed_at.slice(0, 10))}. This is the version as it was signed.</p>
    <div className="ro-report">{report.sections.map(s => <Section key={s.key} s={s} />)}</div>
  </section>;
}

// The read-only copy: reading only. No inputs, no edit links. The one button prints.
export function ReadOnlyCopy({ view }: { view: RoView }) {
  const a = view.map.page1, b = view.map.page2, signedLenses = a.future.lenses.filter(l => l.state === "signed_off" && l.lines.length > 0);
  return <div className="ro" data-surface="setup" data-theme="light" data-testid="ro-page">
    <header className="ro-head"><LiveWordmark theme="light" /><span className="ro-badge"><Eye size={14} aria-hidden="true" />Read-only</span></header>
    <main id="main" className="ro-main">
      <div className="ro-title"><span className="ro-eyebrow">{view.church} · {view.title}</span>
        <h1>The plan for {view.years.outlook} to {view.years.vision}</h1>
        <PrintButton /></div>
      <nav className="ro-jump" aria-label="On this page"><a href="#map">The Map</a><a href="#outcomes">Vision Outcomes</a><a href="#intent">Commander&rsquo;s intent</a>{view.report ? <a href="#report">Report</a> : null}</nav>

      <section className="ro-sec" id="map"><h2>The Clearway Map</h2>
        <div className="ro-page" aria-label="Page 1, Identity and direction"><h3>Identity and direction</h3>
          {[a.mission, a.purpose, a.values, a.strategy].some(filled) && <div className="ro-map"><Field label="Mission" f={a.mission} /><Field label="Purpose" f={a.purpose} /><Field label="Values" f={a.values} /><Field label="Strategy" f={a.strategy} /></div>}
          {signedLenses.length > 0 && <div className="ro-mf is-wide"><span className="ro-eyebrow">10-year Future · {a.future.year}</span>
            {signedLenses.map(l => <div key={l.lens} className="ro-lens"><h4>{l.name}</h4><ul>{l.lines.map(x => <li key={x}>{x}</li>)}</ul></div>)}</div>}
          {!a.vision.empty && <div className="ro-mf is-wide"><span className="ro-eyebrow">3-year Vision · {a.vision.year}</span>
            <ol>{a.vision.outcomes.map(o => <li key={o.n}>{o.title}{o.status !== "confirmed" ? <span className="ro-tag">Provisional</span> : null}</li>)}</ol></div>}</div>
        <div className="ro-page" aria-label="Page 2, Action"><h3>Action</h3>
          <div className="ro-mf is-wide is-empty"><span className="ro-eyebrow">This Year&rsquo;s Priorities</span><p><CircleDashed size={14} aria-hidden="true" /> {b.priorities.why}</p></div>
          <div className="ro-mf is-wide"><span className="ro-eyebrow">1-year Outlook · {b.outlook.year}</span><p>The goals are listed under each Vision Outcome below.</p></div>
          {[b.outlook.metrics, b.outlook.celebrations, b.rhythms, b.issues].some(filled) && <div className="ro-map">
            {!b.outlook.metrics.empty && <div className="ro-mf"><span className="ro-eyebrow">Key metrics</span><ol>{b.outlook.metrics.items?.map(m => <li key={m.text}>{m.text}</li>)}</ol></div>}
            {!b.outlook.celebrations.empty && <div className="ro-mf"><span className="ro-eyebrow">Celebrations</span><ul>{b.outlook.celebrations.items?.map(m => <li key={m.text}>{m.text}</li>)}</ul></div>}
            <Field label="Leadership Rhythms" f={b.rhythms} />
            {!b.issues.empty && <div className="ro-mf"><span className="ro-eyebrow">Key Issues</span>
              <ul>{b.issues.items?.map((i, n) => <li key={n}><span className="ro-tag">Risk</span>{i.text}{i.mitigations?.length ? <small>{i.mitigations.join(", ")}</small> : null}</li>)}</ul></div>}</div>}</div>
      </section>

      <section className="ro-sec" id="outcomes"><h2>Vision Outcomes and 1-year goals</h2>
        {view.outcomes.length === 0 ? <p className="ro-note">No Vision Outcomes have been recorded yet.</p> : view.outcomes.map(o => <article key={o.n} className="ro-card" data-testid="ro-outcome">
          <h3>{o.n}. {o.title}{o.status !== "confirmed" ? <span className="ro-tag">Provisional</span> : null}</h3>
          {o.description ? <p className="ro-muted">{o.description}</p> : null}
          {o.indicators.length > 0 && <><span className="ro-eyebrow">Indicators</span><ul className="ro-list">{o.indicators.map(i => <li key={i}>{i}</li>)}</ul></>}
          {o.stop ? <><span className="ro-eyebrow">What we&rsquo;ll stop</span><p>{o.stop}</p></> : null}
          {o.goals.length > 0 && <><span className="ro-eyebrow">1-year goals</span>
            {o.goals.map((g, i) => <div key={i} className="ro-goal" data-testid="ro-goal"><div className="t"><b>{g.title}</b>{g.result ? <span>{g.result}</span> : null}
              <small>{[g.owner ?? "No owner yet", g.end_date ? `ends ${mapDate(g.end_date)}` : "No end date yet"].join(" · ")}</small></div><Status goal={g} /></div>)}</>}
        </article>)}
      </section>

      <section className="ro-sec" id="intent"><h2>Commander&rsquo;s intent</h2>
        {view.intents.length === 0 ? <p className="ro-note">No commander&rsquo;s intent cards have been recorded yet.</p> : view.intents.map(c => <article key={c.n} className="ro-card" data-testid="ro-intent">
          <h3>{c.outcome}</h3>
          <dl>{c.intent ? <><dt>Commander&rsquo;s intent</dt><dd>{c.intent}</dd></> : null}{c.must_do ? <><dt>The must-do</dt><dd>{c.must_do}</dd></> : null}{c.stop ? <><dt>What we&rsquo;ll stop</dt><dd>{c.stop}</dd></> : null}
            {c.steps.length > 0 && <><dt>First steps</dt><dd><ul>{c.steps.map((s, i) => <li key={i}>{s.text} <span>{[s.owner, s.due ? mapDate(s.due) : ""].filter(Boolean).join(", ")}</span></li>)}</ul></dd></>}</dl>
        </article>)}
      </section>

      {view.report ? <Report report={view.report} />
        : <section className="ro-sec" id="report"><h2>The report</h2><p className="ro-note" data-testid="ro-no-report"><FileText size={14} aria-hidden="true" /> The report will appear here once Clearway has signed it off.</p></section>}

      <footer className="ro-foot"><Eye size={14} aria-hidden="true" /><span>This copy can&rsquo;t be edited. It shows the plan as Clearway has it, and each goal&rsquo;s status as its owner last reported it. The link can be turned off at any time.</span></footer>
    </main>
  </div>;
}
