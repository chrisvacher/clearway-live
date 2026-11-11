import type { Metadata } from "next";
import Link from "next/link";
import "@/components/facilitator/admin.css";
import { requireFacilitator } from "@/lib/server/facilitator";
import { teamHubConfigured, teamHubReader } from "@/lib/server/team-hub";
import { compareEngagements, statusName, eventDate, place, typeName, listGroup, groupNames, mainAction, type HubPlace, type ListedEngagement, type ListGroup } from "@/lib/setup/listing";
import { CopyLink } from "@/components/facilitator/copy-link";

export const metadata: Metadata = { title: "Engagements" };

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
    .select("id,title,type,status,room_code,link_name,start_date,end_date,retreat_start_date,retreat_end_date,pre_call_at,team_hub_client_id,church:churches!engagements_church_id_fkey(name,timezone)")
    .eq("deleted", false).order("created_at", { ascending: false });
  const engagements = ((data ?? []) as unknown as (ListedEngagement & { room_code: string; link_name: string | null })[]).sort((a,b) => compareEngagements(a,b));
  const where = await places(engagements);
  return <main id="main" className="admin-page">
    <header className="admin-heading"><div><h1>Engagements</h1><p>Prepare your next engagement, open the room or follow up with the team.</p></div>
    <div className="admin-actions">{profile.is_admin && <Link className="admin-button is-primary" href="/setup/new">Create an engagement</Link>}</div></header>
    {error ? <section className="admin-panel" role="status"><h2>Engagements unavailable</h2><p>We couldn’t load your engagements. Please try again.</p><Link className="admin-button" href="/setup">Try again</Link></section> : engagements.length
      ? (["upcoming", "undated", "past", "practice"] as ListGroup[]).map(group => {
          const rows = engagements.filter(e => listGroup(e) === group);
          return rows.length ? <section key={group} aria-labelledby={`group-${group}`}><h2 className="admin-section-name" id={`group-${group}`}>{groupNames[group]}</h2>
            <ul className="admin-list">{rows.map(e => {
              const when = eventDate(e, e.church?.timezone), at = place(e.team_hub_client_id ? where.get(e.team_hub_client_id) : null), main = mainAction(e, group), name = e.link_name ?? e.room_code, link = `live.clearway.co/${name}`;
              const more = [[`/setup/${e.id}`, "Overview"], [`/setup/${e.id}/details`, "Details"], [`/setup/${e.id}/joining`, "People and joining"], [`/setup/${e.id}/run-of-show`, "Run of show"], [`/control/${e.id}`, "Live room"], [`/setup/${e.id}/door`, "Door list"], [`/control/${e.id}/recap`, "Results"]].filter(([href]) => href !== main.href);
              return <li key={e.id} className="admin-card admin-row"><div className="who"><div className="admin-kicker">{e.church?.name ?? "Church not named"}</div><h3>{e.title}</h3><p className="admin-meta">{[typeName(e.type), when ?? "No date yet", at].filter(Boolean).join(" · ")}</p></div>
                <span className="admin-status">{statusName(e.status)}</span>
                <span className="room-link">live.clearway.co/<strong>{name}</strong><CopyLink link={link} label={`Copy the room link for ${e.title}`} /></span>
                <div className="admin-actions" role="group" aria-label={`${e.title} for ${e.church?.name ?? "this church"}`}><Link className="admin-button is-primary" href={main.href}>{main.label}</Link>
                  <details className="admin-more"><summary className="admin-button">More<span className="sr-only"> for {e.title}</span></summary><div className="admin-more-list">{more.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</div></details></div></li>;
            })}</ul></section> : null;
        })
      : <section className="admin-panel"><h2>No engagements yet</h2><p>{profile.is_admin ? "Create an engagement from Team Hub to prepare the room." : "Your engagements will appear here when you’re assigned as a facilitator."}</p></section>}
    <footer className="admin-actions"><p>Signed in as {profile.name} ({profile.email}).</p><form action="/auth/sign-out" method="post"><button className="admin-button" type="submit">Sign out</button></form></footer>
  </main>;
}
