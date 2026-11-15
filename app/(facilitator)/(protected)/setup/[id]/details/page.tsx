import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { SetupEditor } from "@/components/facilitator/setup-editor";
import { setupFormFromRows } from "@/lib/setup/form";
import { teamHubConfigured } from "@/lib/server/team-hub";
import { brandFor,skins } from "@/lib/brand";
import { uuid } from "@/lib/room/policy";
export const metadata = { title: "Details" };
export default async function EditEngagement({params}:{params:Promise<{id:string}>}){
  const {id}=await params;if(!uuid(id))notFound();const {client,profile}=await requireFacilitator();
  const {data:e}=await client.from("engagements").select("*").eq("id",id).eq("deleted",false).maybeSingle();if(!e)notFound();
  const [{data:c},{data:members},{data:assignments}]=await Promise.all([
    client.from("churches").select("*").eq("id",e.church_id).eq("deleted",false).maybeSingle(),
    client.from("clearway_users").select("id,name,email").eq("deleted",false).order("name"),
    client.from("engagement_facilitators").select("clearway_user_id,role").eq("engagement_id",id).eq("deleted",false),
  ]);if(!c)notFound();
  return <><main id="main" className="admin-page"><header className="admin-heading"><div><div className="admin-kicker">{c.name} · {e.title}</div><h1>Details</h1><p>The event, the church and how the room works. Each card saves on its own.</p></div></header>
    <SetupEditor id={id} roomPath={e.link_name??e.room_code} hosts={Object.fromEntries(skins.map(s=>[s,brandFor(s).host]))} admin={profile.is_admin} hubConfigured={teamHubConfigured()} members={members||[]} initial={setupFormFromRows(e,c,assignments)} />
  </main></>;
}
