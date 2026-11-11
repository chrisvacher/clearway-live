import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/policy";
import { governanceWord } from "@/lib/discover/policy";
import { readDiscover } from "@/lib/discover/server";
import type { ThemesState } from "@/lib/discover/themes";
import type { HeardState } from "@/lib/discover/heard";
import { Discover } from "@/components/discover/discover";

// Discover for one engagement: the survey report's findings, interview and input-conversation notes, and themes.
// Facilitators of the engagement only. If the database does not have the Discover functions yet, the page says so
// and the rest of setup is unchanged.
export default async function DiscoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const { client } = await requireFacilitator();
  const { data: engagement } = await client.from("engagements").select("id,title,status,church_id").eq("id", id).eq("deleted", false).maybeSingle();
  if (!engagement) notFound();
  const { data: church } = await client.from("churches").select("governance_body_name").eq("id", engagement.church_id).maybeSingle();
  const { state, missing } = await readDiscover(client, id);
  if (!state) return <><main id="main" className="admin-page"><section className="admin-panel"><h1>Discover</h1>
    <p>{missing ? "Discover isn’t available yet. Please try again later." : "Only the facilitators of this engagement can use Discover."}</p>
    <Link className="text-link" href={`/setup/${id}`}>Back to the engagement</Link></section></main></>;
  const { data: themes, error: themesError } = await client.rpc("discover_themes_state", { p_engagement: id });
  const initialThemes = !themesError && themes?.status === "ok" ? ({ ...themes, slow_after_ms: undefined } as ThemesState) : null;
  // What We Heard: if its functions are not in the database yet, the section is left out and nothing else changes.
  const { data: heard, error: heardError } = await client.rpc("discover_heard_state", { p_engagement: id });
  const initialHeard = !heardError && heard?.status === "ok" ? ({ ...heard, slow_after_ms: undefined } as HeardState) : null;
  return <><Discover engagement={id} title={engagement.title} initial={state} closed={engagement.status === "closed"} governance={governanceWord(church?.governance_body_name)} initialThemes={initialThemes} initialHeard={initialHeard} /></>;
}
