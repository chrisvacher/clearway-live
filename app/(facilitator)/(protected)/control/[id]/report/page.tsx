import { EngagementNavigation } from "@/app/(facilitator)/_components/engagement-navigation";
import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import { readShow } from "@/lib/run-of-show/server";
import { ReportEditor } from "@/components/report/report-editor";

export const metadata = { title: "Wayfinding report", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// AFT-01: the Wayfinding report, drafted from the records and signed off by the lead (milestone 7, step 1).
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const { client } = await requireFacilitator();
  const show = await readShow(client, id); if (!show) notFound();
  return <div className="admin-after"><EngagementNavigation id={id} /><ReportEditor engagement={id} church={show.context.church} title={show.context.title} timezone={show.context.timezone} /></div>;
}
