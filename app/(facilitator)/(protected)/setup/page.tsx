import type { Metadata } from "next";
import Link from "next/link";
import "@/components/facilitator/admin.css";
import { LockKeyhole } from "lucide-react";
import { requireFacilitator } from "@/lib/server/facilitator";
import { teamHubConfigured, teamHubReader } from "@/lib/server/team-hub";
import { compareEngagements, statusName, eventDate, place, typeName, type HubPlace, type ListedEngagement } from "@/lib/setup/listing";

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
    .select("id,title,type,status,start_date,end_date,retreat_start_date,retreat_end_date,pre_call_at,team_hub_client_id,church:churches!engagements_church_id_fkey(name,timezone)")
    .eq("deleted", false).order("created_at", { ascending: false });
  const engagements = ((data ?? []) as unknown as ListedEngagement[]).sort((a,b) => compareEngagements(a,b));
  const where = await places(engagements);
  return <main id="main" className="admin-page">
    <header className="admin-heading"><div><div className="admin-kicker"><LockKeyhole size={18} aria-hidden="true" /> Private to the facilitators</div><h1>Your engagements</h1><p>Prepare your next engagement, open the room or follow up with the team.</p></div>
    <div className="admin-actions"><Link className="admin-button" href="/setup/templates">Browse templates</Link>{profile.is_admin && <><Link className="admin-button" href="/setup/users">Manage Clearway users</Link><Link className="admin-button is-primary" href="/setup/new">Create an engagement</Link></>}</div></header>
    {error ? <section className="admin-panel" role="status"><h2>Engagements unavailable</h2><p>We couldn’t load your engagements. Please try again.</p><Link className="admin-button" href="/setup">Try again</Link></section> : engagements.length
      ? <ul className="admin-list">{engagements.map(e => {
          const when = eventDate(e, e.church?.timezone), at = place(e.team_hub_client_id ? where.get(e.team_hub_client_id) : null);
          return <li key={e.id} className="admin-card"><div><div className="admin-kicker">{e.church?.name ?? "Church not named"}</div><h3>{e.title}</h3><p className="admin-meta">{[typeName(e.type), when ?? "No date yet", at].filter(Boolean).join(" · ")}</p><span className="admin-status">{statusName(e.status)}</span></div>
          <div className="admin-actions" role="group" aria-label={`${e.title} for ${e.church?.name ?? "this church"}`}><Link className="admin-button is-primary" href={`/control/${e.id}`}>Open the live room</Link><Link className="admin-button" href={`/setup/${e.id}`}>Edit setup</Link><Link className="admin-button" href={`/setup/${e.id}/run-of-show`}>Open run of show</Link><Link className="admin-button" href={`/setup/${e.id}/door`}>Open door list</Link><Link className="admin-button" href={`/control/${e.id}/after`}>Open After the retreat</Link></div></li>;
        })}</ul>
      : <section className="admin-panel"><h2>No engagements yet</h2><p>{profile.is_admin ? "Create an engagement from Team Hub to prepare the room." : "Your engagements will appear here when you’re assigned as a facilitator."}</p></section>}
    <footer className="admin-actions"><p>Signed in as {profile.name} ({profile.email}).</p><form action="/auth/sign-out" method="post"><button className="admin-button" type="submit">Sign out</button></form></footer>
  </main>;
}
