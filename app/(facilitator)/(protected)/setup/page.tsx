import type { Metadata } from "next";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { requireFacilitator } from "@/lib/server/facilitator";
import { teamHubConfigured, teamHubReader } from "@/lib/server/team-hub";
import { eventDate, place, typeName, type HubPlace, type ListedEngagement } from "@/lib/setup/listing";

export const metadata: Metadata = { title: "Your engagements" };

// Where each church is, from Team Hub. The list still loads, without places, if Team Hub can't be read.
async function places(engagements: ListedEngagement[]): Promise<Map<string, HubPlace>> {
  const ids = engagements.map(e => e.team_hub_client_id).filter((v): v is string => Boolean(v));
  if (!ids.length || !teamHubConfigured()) return new Map();
  try { return new Map((await teamHubReader().clients(ids)).map(c => [c.id, c])); }
  catch { return new Map(); }
}

export default async function SetupPage() {
  const { profile, client } = await requireFacilitator();
  const { data, error } = await client.from("engagements")
    .select("id,title,type,status,start_date,end_date,retreat_start_date,retreat_end_date,pre_call_at,team_hub_client_id,church:churches(name,timezone)")
    .eq("deleted", false).order("created_at", { ascending: false });
  const engagements = (data ?? []) as unknown as ListedEngagement[];
  const where = await places(engagements);
  return <main id="main" className="page-width narrow">
    <div className="eyebrow-live"><LockKeyhole size={18} aria-hidden="true" /> Only you see this</div>
    <h1>Your engagements</h1>
    <p>Signed in as {profile.name} ({profile.email}).</p>
    {profile.is_admin && <Link className="button-link" href="/setup/new">Create an engagement</Link>}
    <div className="notice">
      <h2>{profile.is_admin ? "Clearway admin" : "Clearway facilitator"}</h2>
      {error ? <p role="status">We couldn’t load your engagements. Please try again.</p> : engagements.length
        ? <ul className="engagement-list">{engagements.map(e => {
            const when = eventDate(e, e.church?.timezone), at = place(e.team_hub_client_id ? where.get(e.team_hub_client_id) : null);
            return <li key={e.id} className="engagement-row">
              <p className="engagement-org">{e.church?.name ?? "Church not named"}</p>
              <h3>{e.title}</h3>
              <p className="engagement-meta">{[typeName(e.type), when ?? "No date yet", at].filter(Boolean).join(" · ")}</p>
              <div className="actions"><Link className="text-link" href={`/setup/${e.id}`} aria-label={`Edit ${e.title} for ${e.church?.name ?? "this church"}`}>Edit</Link> <Link className="text-link" href={`/setup/${e.id}/door`}>Open the door list</Link></div>
            </li>;
          })}</ul>
        : <p>You don’t have any engagements yet. They’ll appear here when they’re ready.</p>}
    </div>
    <form action="/auth/sign-out" method="post"><button className="button-link" type="submit">Sign out</button></form>
  </main>;
}
