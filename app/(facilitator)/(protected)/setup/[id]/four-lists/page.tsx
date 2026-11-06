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
  if (fourListsMissing(error)) return <main id="main" className="page-width"><div className="hero"><div className="eyebrow-live">Only you see this</div><h1>Four Helpful Lists</h1>
    <Link className="text-link" href={`/setup/${id}/run-of-show`}>Back to the run of show</Link></div><p className="show-empty">Four Helpful Lists isn’t available yet. It arrives with the next update.</p></main>;
  if (error || !data || data.status === "missing") notFound();
  const review = data.status === "ok" ? data as FourReview : null;
  return <main id="main" className="page-width"><div className="hero"><div className="eyebrow-live">Only you see this</div><h1>Four Helpful Lists</h1>{review && <p>{review.engagement.title}</p>}
    <Link className="text-link" href={`/setup/${id}/run-of-show`}>Back to the run of show</Link></div>
    {review ? <FourListsReview review={review} engagement={id} /> : <p className="show-empty">You’re not assigned to this engagement.</p>}
  </main>;
}
