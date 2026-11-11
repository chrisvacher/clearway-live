import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import { readShow } from "@/lib/run-of-show/server";
import { AfterHub, type AfterSummary } from "@/components/report/after-hub";
import type { ReportState } from "@/lib/report/policy";
import { shareLine, type ShareState } from "@/lib/read-only/policy";
import type { PlanState } from "@/lib/plan/policy";
import { checkInLine, type CheckInState } from "@/lib/check-ins/policy";

export const metadata = { title: "After the retreat", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// The hub for everything after the retreat. The report tile reads the report's state; if the report's functions are not in the database yet, it says so.
export default async function AfterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const { client } = await requireFacilitator();
  const show = await readShow(client, id); if (!show) notFound();
  let summary: AfterSummary = { available: false, draft: false, reviewed: 0, total: 14, signed: null };
  try {
    const { data, error } = await client.rpc("report_state", { p_engagement: id });
    const state = data as ReportState | null;
    if (!error && state?.status === "ok") summary = { available: true, draft: state.draft, reviewed: state.sections.filter(s => s.status === "reviewed").length, total: state.sections.length || 14, signed: state.signed && !state.signed.stale ? state.signed.n : null };
  } catch { /* The report is not here yet. */ }
  // The visibility plan tile, the same way: it says so quietly when the plan's functions are not in the database yet.
  try {
    const { data, error } = await client.rpc("visibility_plan_state", { p_engagement: id });
    const plan = data as PlanState | null;
    if (!error && plan?.status === "ok") summary.plan = { available: true, rows: plan.rows.length, reviewed: plan.rows.filter(r => r.reviewed).length, date: plan.plan?.public_date ?? null, status: plan.plan?.status ?? null };
    else summary.plan = { available: false, rows: 0, reviewed: 0, date: null };
  } catch { summary.plan = { available: false, rows: 0, reviewed: 0, date: null }; }
  // The check-ins tile shows the next round's status. Before the check-ins migration is applied the call fails and the tile says so, quietly.
  try {
    const { data, error } = await client.rpc("check_in_state", { p_engagement: id });
    const state = data as CheckInState | null;
    if (!error && state?.status === "ok") summary = { ...summary, checkIns: { available: true, line: checkInLine(state) } };
  } catch { /* The check-ins are not here yet. */ }
  // The Share tile shows whether Day 2 has closed and how the links stand. Before this step's migration is applied the call fails and the tile says so, quietly.
  try {
    const { data, error } = await client.rpc("share_state", { p_engagement: id });
    const state = data as ShareState | null;
    if (!error && state?.status === "ok") summary = { ...summary, share: { available: true, line: shareLine(state), closed: state.closed, closedOn: state.closed_on, canReopen: state.can_reopen, eligible: state.eligible } };
  } catch { /* Sharing is not here yet. */ }
  return <div className="admin-after"><AfterHub engagement={id} church={show.context.church} title={show.context.title} summary={summary} /></div>;
}
