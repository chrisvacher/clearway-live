import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import { readShow } from "@/lib/run-of-show/server";
import { OvernightReview } from "@/components/overnight/review";

export const metadata = { title: "Overnight review", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// OVN-01 to OVN-03: the overnight drafts, reviewed on the laptop by the facilitators (PRD "Overnight review and the read-back").
export default async function OvernightReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const { client } = await requireFacilitator();
  const show = await readShow(client, id); if (!show) notFound();
  return <div className="admin-after"><OvernightReview engagement={id} church={show.context.church} title={show.context.title} timezone={show.context.timezone} /></div>;
}
