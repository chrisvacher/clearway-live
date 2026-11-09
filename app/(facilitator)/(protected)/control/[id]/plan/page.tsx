import { EngagementNavigation } from "@/app/(facilitator)/_components/engagement-navigation";
import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import { readShow } from "@/lib/run-of-show/server";
import { PlanEditor } from "@/components/plan/plan-editor";

export const metadata = { title: "Visibility plan", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// AFT-02: the visibility plan, drafted from what the room said and reviewed by the facilitators (milestone 7, step 3).
export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const { client } = await requireFacilitator();
  const show = await readShow(client, id); if (!show) notFound();
  return <div className="admin-after"><EngagementNavigation id={id} /><PlanEditor engagement={id} church={show.context.church} title={show.context.title} /></div>;
}
