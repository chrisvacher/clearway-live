import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import type { MapDraft } from "@/lib/wayfinding/map";
import { ClearwayMap } from "@/components/wayfinding/clearway-map";

export const metadata = { title: "Draft Clearway Map", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// A facilitator's view of the draft Clearway Map, assembled from the engagement's records (D2-15).
export default async function MapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const { client } = await requireFacilitator();
  const { data, error } = await client.rpc("map_draft_read", { p_engagement: id });
  if (error || !data || data.status !== "ok") notFound();
  return <div className="admin-after"><main id="main" className="admin-map"><ClearwayMap engagement={id} initial={data as MapDraft} /></main></div>;
}
