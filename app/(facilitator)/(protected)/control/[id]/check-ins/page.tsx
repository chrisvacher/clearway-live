import { EngagementNavigation } from "@/app/(facilitator)/_components/engagement-navigation";
import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import { readShow } from "@/lib/run-of-show/server";
import type { CheckInState } from "@/lib/check-ins/policy";
import { CheckInResults } from "@/components/check-ins/check-in-results";

export const metadata = { title: "Check-ins", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// AFT-05: what each owner said at 30, 60 and 90 days, the follow-ups and who hasn't answered. Facilitators only.
export default async function CheckInsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const { client } = await requireFacilitator();
  const show = await readShow(client, id); if (!show) notFound();
  // A database without this step's function yet shows nothing here instead of an error.
  const { data, error } = await client.rpc("check_in_state", { p_engagement: id });
  if (error || !data || data.status !== "ok") notFound();
  return <div className="admin-after"><EngagementNavigation id={id} /><CheckInResults engagement={id} church={show.context.church} title={show.context.title} initial={data as CheckInState} /></div>;
}
