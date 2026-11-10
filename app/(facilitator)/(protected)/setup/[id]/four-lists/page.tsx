import { RefreshPage } from "@/app/(facilitator)/_components/refresh-page";
import { EngagementNavigation } from "@/app/(facilitator)/_components/engagement-navigation";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireFacilitator } from "@/lib/server/facilitator";
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
  const { data, error } = await client.rpc("four_lists_review", { p_engagement: id });
  if (fourListsMissing(error)) return <><EngagementNavigation id={id} /><main id="main" className="admin-page"><header className="admin-heading"><div><div className="admin-kicker">Private to the facilitators</div><h1>Four Helpful Lists</h1>
    <Link className="text-link" href={`/setup/${id}/run-of-show`}>Back to the run of show</Link></div><RefreshPage label="Refresh lists" /></header><p className="show-empty">Four Helpful Lists isn’t available yet. Please try again later.</p></main></>;
  if (error || !data || data.status !== "ok") notFound();
  const review = data as FourReview;
  return <><EngagementNavigation id={id} /><main id="main" className="admin-page"><header className="admin-heading"><div><div className="admin-kicker">Private to the facilitators</div><h1>Four Helpful Lists</h1><p>{review.engagement.title}</p>
    <Link className="text-link" href={`/setup/${id}/run-of-show`}>Back to the run of show</Link></div><RefreshPage label="Refresh lists" /></header>
    <FourListsReview review={review} engagement={id} />
  </main></>;
}
