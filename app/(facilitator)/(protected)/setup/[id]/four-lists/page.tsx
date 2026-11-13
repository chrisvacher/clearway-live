import { RefreshPage } from "@/app/(facilitator)/_components/refresh-page";
import { Download } from "lucide-react";
import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { wayfindingOnly } from "@/lib/server/shell";
import { uuid } from "@/lib/room/identity";
import { fourListsMissing } from "@/lib/interactions/four-lists-server";
import { FourListsReview } from "@/components/interactions/four-lists/four-review";
import type { FourReview } from "@/lib/interactions/four-lists";

export const metadata = { title: "Four Helpful Lists" };
export const dynamic = "force-dynamic";
// SET-05: the facilitator's read-only review of every card, by list, with agreement and folds.
export default async function FourListsReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const { client } = await requireFacilitator();
  await wayfindingOnly(client, id, `/setup/${id}`);
  const { data, error } = await client.rpc("four_lists_review", { p_engagement: id });
  const lead = "Read only. Names never show. Pin, hide and undo a fold on the live control surface.";
  if (fourListsMissing(error)) return <><main id="main" className="admin-page"><header className="admin-heading"><div><h1>Four Helpful Lists</h1><p>{lead}</p></div><div className="admin-actions"><RefreshPage label="Refresh lists" /></div></header><p className="show-empty">Four Helpful Lists isn’t available yet. Please try again later.</p></main></>;
  if (error || !data || data.status !== "ok") notFound();
  const review = data as FourReview;
  const { data: church } = await client.from("engagements").select("church:churches!engagements_church_id_fkey(name)").eq("id", id).maybeSingle();
  const churchName = (church?.church as unknown as { name: string } | null)?.name ?? "Church not named";
  return <><main id="main" className="admin-page"><header className="admin-heading"><div><div className="admin-kicker">{churchName} · {review.engagement.title}</div><h1>Four Helpful Lists</h1><p>{lead}</p></div>
    <div className="admin-actions"><RefreshPage label="Refresh lists" />{review.sessions.length > 0 && <a className="admin-button" href={`/api/control/${id}/four-lists/export`} download><Download size={18} aria-hidden="true" />Download CSV</a>}</div></header>
    <FourListsReview review={review} />
  </main></>;
}
