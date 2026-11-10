import { EngagementNavigation } from "@/app/(facilitator)/_components/engagement-navigation";
import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import { readShow } from "@/lib/run-of-show/server";
import type { ShareState } from "@/lib/read-only/policy";
import { ShareLinks } from "@/components/read-only/share-links";

export const metadata = { title: "Share", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// AFT-03: the named links for the elders. Facilitators only. A database without this step's function shows nothing here instead of an error.
export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const { client } = await requireFacilitator();
  const show = await readShow(client, id); if (!show) notFound();
  const { data, error } = await client.rpc("share_state", { p_engagement: id });
  if (error || !data || data.status !== "ok") notFound();
  return <div className="admin-after"><EngagementNavigation id={id} /><ShareLinks engagement={id} church={show.context.church} title={show.context.title} initial={data as ShareState & { status: "ok" }} /></div>;
}
