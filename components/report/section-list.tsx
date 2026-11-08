"use client";
import { BadgeCheck } from "lucide-react";
import { statusNames, type ReportSection } from "@/lib/report/policy";

// The report's 14 sections in order, each with where it stands. A section being drafted shows it; a finished one shows its status.
export function SectionList({ sections, current, pick }: { sections: ReportSection[]; current: string | null; pick: (key: string) => void }) {
  return <nav className="ovr-list rpt-list" aria-label="Report sections" data-testid="rpt-list">
    <div className="ovr-list-h"><span>Sections</span><span>{sections.filter(s => s.status === "reviewed").length} of {sections.length || 14} reviewed</span></div>
    {sections.map(s => <button key={s.key} type="button" className="rpt-li" aria-current={s.key === current} onClick={() => pick(s.key)} data-testid={`rpt-section-${s.key}`} data-status={s.status}>
      <span className="n">{s.position}</span>
      <span className="h"><span>{s.heading}</span><small className="ovr-muted" data-testid={`rpt-status-${s.key}`}>{statusNames[s.status]}</small></span>
      {s.status === "reviewed" ? <BadgeCheck aria-hidden="true" className="rpt-done" /> : <span className={`rpt-dot is-${s.status}`} aria-hidden="true" />}
    </button>)}
  </nav>;
}
