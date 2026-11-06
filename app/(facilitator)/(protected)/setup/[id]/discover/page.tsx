import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/policy";
import { readDiscover } from "@/lib/discover/server";
import { Discover } from "@/components/discover/discover";

// Discover for one engagement: the survey report's findings, interview and input-conversation notes, and themes.
// Facilitators of the engagement only. If the database does not have the Discover functions yet, the page says so
// and the rest of setup is unchanged.
export default async function DiscoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const { client } = await requireFacilitator();
  const { data: engagement } = await client.from("engagements").select("id,title,status").eq("id", id).eq("deleted", false).maybeSingle();
  if (!engagement) notFound();
  const { state, missing } = await readDiscover(client, id);
  if (!state) return <main id="main" className="page-width"><div className="hero"><div className="eyebrow-live">Only you see this</div><h1>Discover</h1>
    <p>{missing ? "Discover isn't ready yet. It turns on when the database update is applied." : "Only the facilitators of this engagement can use Discover."}</p>
    <Link className="text-link" href={`/setup/${id}`}>Back to the engagement</Link></div></main>;
  return <Discover engagement={id} title={engagement.title} initial={state} closed={engagement.status === "closed"} />;
}
