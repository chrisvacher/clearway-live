import "@/components/facilitator/admin.css";
import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { readAll } from "@/lib/server/read-all";
import { teamHubConfigured } from "@/lib/server/team-hub";
import { uuid } from "@/lib/room/policy";
import { consensus } from "@/lib/setup/policy";
import { JoiningEditor } from "@/components/facilitator/joining-editor";
import { AttendeeEditor } from "@/components/facilitator/attendee-editor";

export const metadata = { title: "People and joining" };
export const dynamic = "force-dynamic";

export default async function JoiningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const { client, profile } = await requireFacilitator();
  const { data: e } = await client.from("engagements").select("id,title,type,status,room_code,link_name,settings,how_the_room_decides,team_hub_client_id,church:churches!engagements_church_id_fkey(name)").eq("id", id).eq("deleted", false).maybeSingle();
  if (!e) notFound();
  const church = (e.church as unknown as { name: string } | null)?.name ?? "Church not named";
  const settings = (e.settings ?? {}) as { open_join?: boolean; neutral_join_message?: boolean };
  const open = e.type === "team_workshop" && settings.open_join === true;
  const attendees = await readAll(after => { const q = client.from("attendees").select("id,name,email,room_role,role_at_church,extra_fields").eq("engagement_id", id).eq("deleted", false).order("id").limit(500); return after ? q.gt("id", after) : q; });
  return <main id="main" className="admin-page"><header className="admin-heading"><div><div className="admin-kicker">{church} · {e.title}</div><h1>People and joining</h1><p>Choose the link, who can get in and what they read before they join.</p></div></header>
    <JoiningEditor admin={profile.is_admin} church={church} title={e.title} initial={{ id, type: e.type, roomCode: e.room_code, linkName: e.link_name, openJoin: open, neutral: settings.neutral_join_message === true, how: e.how_the_room_decides || consensus, closed: e.status === "closed" }} />
    {open && <p className="admin-panel">Anyone can join by name, so a list isn’t needed. You can still add people below and invite them by email.</p>}
    <AttendeeEditor id={id} attendees={attendees.sort((a, b) => a.name.localeCompare(b.name))} linked={Boolean(e.team_hub_client_id)} hubConfigured={teamHubConfigured()} closed={e.status === "closed"} />
  </main>;
}
