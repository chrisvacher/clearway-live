import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import { reviewOf } from "@/lib/interactions/four-lists";
import { FourListsReview } from "@/components/interactions/four-lists/four-lists-review";

export const metadata = { title: "Review the four lists", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// SET-05: after the session, a facilitator edits the words, merges, keeps or sets aside, and marks which cards feed What We Heard
// and which feed Strategic Tensions. Facilitators only; no card carries a name.
export default async function ListsReviewPage({ params }: { params: Promise<{ id: string; session: string }> }) {
  const { id, session } = await params; if (!uuid(id) || !uuid(session)) notFound();
  const { client } = await requireFacilitator();
  const { data, error } = await client.rpc("four_lists_review_read", { p_engagement: id, p_session: session });
  const review = error ? null : reviewOf(data);
  if (!review) notFound();
  return <FourListsReview engagement={id} initial={review} />;
}
