"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CircleAlert, EyeOff, FileText, ListOrdered, Radio, TriangleAlert } from "lucide-react";
import { roundView, plural, type ReportSection } from "@/lib/report/policy";
import { useReport } from "./use-report";
import { SectionList } from "./section-list";
import { SectionBody } from "./section-body";
import { SourcesPanel } from "./sources-panel";
import { SignOffBar } from "./sign-off-bar";
import { ExportPanel } from "./export-panel";
import "./report.css";

// The Wayfinding report (AFT-01): fourteen sections, drafted from the records by the AI and by code, edited and reviewed here by the facilitators, and
// signed off by the lead. Every sentence that is not the facilitator's own rests on sources, shown beside it with the used words lit.
export function ReportEditor({ engagement, church, title, timezone }: { engagement: string; church: string; title: string; timezone: string }) {
  const api = useReport(engagement), { state } = api;
  const ok = state?.status === "ok" ? state : null;
  const [key, setKey] = useState<string | null>(null), [sentence, setSentence] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t); }, []);
  const sections = useMemo(() => ok?.sections ?? [], [ok]);
  const section: ReportSection | null = useMemo(() => sections.find(s => s.key === key) ?? sections[0] ?? null, [sections, key]);
  const picked = section?.sentences.find(s => s.id === sentence) ?? null;
  useEffect(() => { if (sentence && !picked) setSentence(null); }, [sentence, picked]);
  const view = ok ? roundView(ok, now, ok.slow_after_ms) : null;
  const working = view?.kind === "working";
  const drafted = sections.filter(s => s.status !== "empty" && s.status !== "drafting").length;
  // What is missing: an empty section, one that needs attention, and (with AI on) a table that has no lead yet.
  const open = sections.filter(s => s.status === "empty" || s.status === "needs_attention" || (ok?.ai && s.kind === "record" && s.status === "drafted" && !s.sentences.some(x => x.origin !== "record"))).length;
  const locked = false;
  const draftAll = () => void api.act({ action: "draft", id: crypto.randomUUID(), scope: "all", confirm: false });
  return <div className="ovr" data-surface="report" data-theme="light" data-testid="report-editor">
    <nav className="ovr-nav" aria-label="Engagement"><div className="brand">{church}</div>
      <Link href={`/control/${engagement}`}><Radio aria-hidden="true" />Live room</Link>
      <Link href={`/setup/${engagement}/run-of-show`}><ListOrdered aria-hidden="true" />Run of show</Link>
      <Link href={`/control/${engagement}/after`}><CalendarDays aria-hidden="true" />After the retreat</Link>
      <button type="button" className="is-on" aria-current="page"><FileText aria-hidden="true" />Report</button></nav>
    <main id="main" className="ovr-main">
      <header className="ovr-head"><div className="grow"><div className="ovr-eyebrow">{church} · {title} · after the retreat</div><h1>Wayfinding report</h1></div>
        <span className="ovr-private"><EyeOff aria-hidden="true" />Private to the facilitators</span></header>
      <div className="ovr-body">
        {api.message && <p className="ovr-banner is-warning" role="alert" data-testid="rpt-message"><TriangleAlert aria-hidden="true" /><span>{api.message}</span></p>}
        {!state && <p className="ovr-muted">Reading the report.</p>}
        {(state?.status === "denied" || state?.status === "closed") && <p className="ovr-banner is-warning" role="alert"><TriangleAlert aria-hidden="true" />Only the facilitators of this engagement can use the report.</p>}
        {(state?.status === "unavailable" || state?.status === "missing") && <p className="ovr-banner is-warning" role="alert"><TriangleAlert aria-hidden="true" />The report isn’t available right now. It tries again on its own.</p>}
        {ok && <>
          <div className="rpt-bar" data-testid="rpt-draft-bar">
            {working && <div className="ovr-progress is-flat" data-testid="rpt-progress"><div className="row"><span><b>Drafting the report</b> · {plural(drafted, "section")} of {sections.length} done</span>
              <span className="ovr-muted">Every section appears as soon as it is drafted</span></div>
              <progress className="ovr-bar" value={drafted} max={Math.max(sections.length, 1)} aria-label="Progress" /></div>}
            {view?.kind === "working" && view.slow && <div className="ovr-banner is-warning" role="status" data-testid="rpt-slow"><TriangleAlert aria-hidden="true" /><div><strong>Drafting is taking longer than usual.</strong> You can read and edit the sections that are done while the rest finish.</div></div>}
            {ok.round?.status === "pending" && ok.round.attempts > 0 && <div className="ovr-banner is-warning" role="status" data-testid="rpt-retry"><TriangleAlert aria-hidden="true" /><div><strong>A section hit a problem and is trying again.</strong></div></div>}
            {!working && !ok.ai && <div className="ovr-banner" role="status" data-testid="rpt-ai-off"><CircleAlert aria-hidden="true" /><div><strong>AI is off for this engagement.</strong> The tables are built from the records. Write the other sections by hand.</div></div>}
            {!working && ok.round?.status === "ready" && ok.round.dropped > 0 && <div className="ovr-banner is-warning" role="status" data-testid="rpt-dropped"><TriangleAlert aria-hidden="true" /><div><strong>{plural(ok.round.dropped, "sentence")} didn’t meet the checks and {ok.round.dropped === 1 ? "was" : "were"} left out.</strong> The sections they belong to are marked Needs attention.</div></div>}
            <div className="ovr-row is-between"><span className="ovr-muted">{ok.draft ? `${plural(open, "section")} still to draft or fix. Nothing here reaches the room or the church.` : "Nothing here reaches the room or the church. The report is drafted from the records, and you sign it off."}</span>
              <button type="button" className="ovr-btn is-primary" disabled={api.busy || working || (ok.draft && open === 0)} onClick={draftAll} data-testid="rpt-draft">{ok.draft ? (open === sections.length ? "Draft the report" : "Draft what is missing") : "Draft the report"}</button></div>
          </div>
          {ok.draft && <SignOffBar state={ok} api={api} zone={timezone} jump={k => { setKey(k); setSentence(null); }} />}
          {ok.draft && <div className="rpt-grid" data-testid="rpt-grid">
            <SectionList sections={sections} current={section?.key ?? null} pick={k => { setKey(k); setSentence(null); }} />
            <div className="rpt-col">{section && <SectionBody key={section.key} section={section} api={api} selected={sentence} select={setSentence} ai={ok.ai} locked={locked} zone={timezone} />}</div>
            <SourcesPanel section={section} sentence={picked} api={api} locked={locked || section?.status === "drafting"} />
          </div>}
          {ok.draft && <ExportPanel engagement={engagement} signed={ok.signed} stamp={ok.stamp} />}
        </>}
      </div>
    </main>
  </div>;
}
