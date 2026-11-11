import Link from "next/link";
import { BadgeCheck, FileText, MessageSquareQuote, Send, UserCheck } from "lucide-react";
import { RetreatClose } from "@/components/read-only/retreat-close";
import "../read-only/read-only.css";
import "./report.css";

export type PlanSummary = { available: boolean; rows: number; reviewed: number; date: string | null; status?: string | null };
// What the tile says: the plan's own status, not only whether it has rows.
function planLine(p: PlanSummary): string {
  if (p.status === "drafting") return "Drafting. Rows appear as soon as they are ready.";
  if (!p.rows) {
    if (p.status === "thin") return "Nothing said about it in the room’s records. Add the rows by hand.";
    if (p.status === "needs_attention") return "Needs attention. Open it to add rows by hand or draft it again.";
    return "Not drafted yet. Draft it from what the room said.";
  }
  const reviewed = p.reviewed === p.rows ? "Every row is reviewed." : `${p.reviewed} of ${p.rows} rows reviewed.`;
  return p.status === "needs_attention" ? `Needs attention. ${reviewed}` : reviewed;
}
export type AfterSummary = { available: boolean; draft: boolean; reviewed: number; total: number; signed: number | null; plan?: PlanSummary; checkIns?: { available: boolean; line: string }; share?: { available: boolean; line: string; closed: boolean; closedOn: string | null; canReopen: boolean; eligible: boolean } };

// After the retreat (milestone 7): the report, the visibility plan, what is shared with the church, and the check-ins. The report, the visibility plan and the check-ins are here.
export function AfterHub({ engagement, church, title, summary }: { engagement: string; church: string; title: string; summary: AfterSummary }) {
  return <div className="ovr" data-surface="after" data-theme="light" data-testid="after-hub">
    <main id="main" className="ovr-main">
      <header className="ovr-head"><div className="grow"><div className="ovr-eyebrow">{church} · {title}</div><h1>After the retreat</h1></div></header>
      <div className="ovr-body"><div className="rpt-hub">
        {summary.available
          ? <Link className="rpt-tile" href={`/control/${engagement}/report`} data-testid="after-report"><h2><FileText aria-hidden="true" />Report</h2>
              <span>{!summary.draft ? "Not drafted yet. Draft it from the records the room made." : summary.signed ? `Signed off as version ${summary.signed}.` : `${summary.reviewed} of ${summary.total} sections reviewed.`}</span>
              {summary.signed ? <span className="ovr-st is-reviewed"><BadgeCheck aria-hidden="true" />Signed off</span> : null}</Link>
          : <div className="rpt-tile is-soon" data-testid="after-report"><h2><FileText aria-hidden="true" />Report</h2><span>The report isn’t available yet.</span></div>}
        {summary.plan?.available
          ? <Link className="rpt-tile" href={`/control/${engagement}/plan`} data-testid="after-visibility"><h2><UserCheck aria-hidden="true" />Visibility plan</h2>
              <span>{planLine(summary.plan)}</span>
              {summary.plan.rows > 0 && summary.plan.reviewed === summary.plan.rows ? <span className="ovr-st is-reviewed"><BadgeCheck aria-hidden="true" />Reviewed</span> : null}</Link>
          : <div className="rpt-tile is-soon" data-testid="after-visibility"><h2><UserCheck aria-hidden="true" />Visibility plan</h2><span>{summary.plan ? "The visibility plan isn’t available yet." : "Coming in this milestone."}</span></div>}
        {summary.share?.available
          ? <Link className="rpt-tile" href={`/control/${engagement}/share`} data-testid="after-share"><h2><Send aria-hidden="true" />Share</h2><span>{summary.share.line}</span></Link>
          : <div className="rpt-tile is-soon" data-testid="after-share"><h2><Send aria-hidden="true" />Share</h2><span>Sharing isn’t available yet.</span></div>}
        {summary.checkIns?.available
          ? <Link className="rpt-tile" href={`/control/${engagement}/check-ins`} data-testid="after-checkins"><h2><MessageSquareQuote aria-hidden="true" />Check-ins</h2><span>{summary.checkIns.line}</span></Link>
          : <div className="rpt-tile is-soon" data-testid="after-checkins"><h2><MessageSquareQuote aria-hidden="true" />Check-ins</h2><span>The check-ins aren’t available yet.</span></div>}
      </div>
        {summary.share?.available && summary.share.eligible && <div className="shr" data-testid="after-retreat"><RetreatClose engagement={engagement} closed={summary.share.closed} closedOn={summary.share.closedOn} canReopen={summary.share.canReopen} /></div>}</div>
    </main>
  </div>;
}
