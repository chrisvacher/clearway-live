import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import { readShow } from "@/lib/run-of-show/server";
import type { Recap } from "@/lib/export/recap";
import { RecapView } from "@/components/control/recap-view";

export const metadata = { title: "Results recap", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// A facilitator's view of every session's results after the room (PRD "Results recap").
export default async function RecapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const { client } = await requireFacilitator();
  const show = await readShow(client, id); if (!show) notFound();
  const { data, error } = await client.rpc("results_recap", { p_engagement: id });
  if (error || !data || data.status !== "ok") notFound();
  return <div className="admin-after"><RecapView engagement={id} context={show.context} initial={data as Recap} /></div>;
}
