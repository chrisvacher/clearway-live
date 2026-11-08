import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import { readShow } from "@/lib/run-of-show/server";
import { AfterHub, type AfterSummary } from "@/components/report/after-hub";
import type { ReportState } from "@/lib/report/policy";

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
  return <AfterHub engagement={id} church={show.context.church} title={show.context.title} summary={summary} />;
}
