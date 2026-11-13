import Link from "next/link";
import { BadgeCheck, BarChart3, FileText, MessageSquareQuote, Send, UserCheck } from "lucide-react";
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

// After the retreat (milestone 7): results, the report, the visibility plan, the read-only copy and the check-ins, each a card with its status and one button.
// A card is one link, so a click anywhere opens it and a test can read its status line and its href from the same element.
const Open = ({ label }: { label: string }) => <span className="admin-button is-small rpt-open">{label}</span>;
export function AfterHub({ engagement, church, title, summary }: { engagement: string; church: string; title: string; summary: AfterSummary }) {
  return <main id="main" className="admin-page" data-surface="after" data-theme="light" data-testid="after-hub">
    <header className="admin-heading"><div><div className="admin-kicker">{church} · {title}</div><h1>After the retreat</h1><p>Everything that follows the retreat, in the order you will want it.</p></div>
      {summary.share?.available && summary.share.eligible && <div className="admin-actions" data-testid="after-retreat"><RetreatClose engagement={engagement} closed={summary.share.closed} closedOn={summary.share.closedOn} canReopen={summary.share.canReopen} secondary /></div>}</header>
    <div className="rpt-hub">
      <Link className="rpt-tile" href={`/control/${engagement}/recap`} data-testid="after-results"><h2><BarChart3 aria-hidden="true" />Results</h2><span>Every session that took answers, as it appeared on the TV.</span><Open label="Open results" /></Link>
      {summary.available
        ? <Link className="rpt-tile" href={`/control/${engagement}/report`} data-testid="after-report"><h2><FileText aria-hidden="true" />Report</h2>
            <span>{!summary.draft ? "Not drafted yet. Draft it from the records the room made." : summary.signed ? `Signed off as version ${summary.signed}.` : `${summary.reviewed} of ${summary.total} sections reviewed.`}</span>
            {summary.signed ? <span className="ovr-st is-reviewed"><BadgeCheck aria-hidden="true" />Signed off</span> : null}<Open label="Open the report" /></Link>
        : <div className="rpt-tile is-soon" data-testid="after-report"><h2><FileText aria-hidden="true" />Report</h2><span>The report isn’t available yet.</span></div>}
      {summary.plan?.available
        ? <Link className="rpt-tile" href={`/control/${engagement}/plan`} data-testid="after-visibility"><h2><UserCheck aria-hidden="true" />Visibility plan</h2>
            <span>{planLine(summary.plan)}</span>
            {summary.plan.rows > 0 && summary.plan.reviewed === summary.plan.rows ? <span className="ovr-st is-reviewed"><BadgeCheck aria-hidden="true" />Reviewed</span> : null}<Open label="Open the plan" /></Link>
        : <div className="rpt-tile is-soon" data-testid="after-visibility"><h2><UserCheck aria-hidden="true" />Visibility plan</h2><span>{summary.plan ? "The visibility plan isn’t available yet." : "Coming in this milestone."}</span></div>}
      {summary.share?.available
        ? <Link className="rpt-tile" href={`/control/${engagement}/share`} data-testid="after-share"><h2><Send aria-hidden="true" />Read-only copy</h2><span>{summary.share.line}</span><Open label="Open the read-only copy" /></Link>
        : <div className="rpt-tile is-soon" data-testid="after-share"><h2><Send aria-hidden="true" />Read-only copy</h2><span>Sharing isn’t available yet.</span></div>}
      {summary.checkIns?.available
        ? <Link className="rpt-tile" href={`/control/${engagement}/check-ins`} data-testid="after-checkins"><h2><MessageSquareQuote aria-hidden="true" />Check-ins</h2><span>{summary.checkIns.line}</span><Open label="Open check-ins" /></Link>
        : <div className="rpt-tile is-soon" data-testid="after-checkins"><h2><MessageSquareQuote aria-hidden="true" />Check-ins</h2><span>The check-ins aren’t available yet.</span></div>}
    </div>
  </main>;
}
