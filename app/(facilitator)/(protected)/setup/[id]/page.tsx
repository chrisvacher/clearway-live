import Link from "next/link";
import { readAll } from "@/lib/server/read-all";
import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { SetupEditor } from "@/components/facilitator/setup-editor";
import { AttendeeEditor } from "@/components/facilitator/attendee-editor";
import { consensus,localTime } from "@/lib/setup/policy";
import { teamHubConfigured } from "@/lib/server/team-hub";
import { uuid } from "@/lib/room/policy";
import type { EngagementForm } from "@/lib/setup/types";
export default async function EditEngagement({params}:{params:Promise<{id:string}>}){
  const {id}=await params;if(!uuid(id))notFound();const {client,profile}=await requireFacilitator();
  const {data:e}=await client.from("engagements").select("*").eq("id",id).eq("deleted",false).maybeSingle();if(!e)notFound();
  const [{data:c},{data:members},{data:assignments},attendees]=await Promise.all([
    client.from("churches").select("*").eq("id",e.church_id).eq("deleted",false).maybeSingle(),
    client.from("clearway_users").select("id,name,email").eq("deleted",false).order("name"),
    client.from("engagement_facilitators").select("clearway_user_id,role").eq("engagement_id",id).eq("deleted",false),
    readAll(after=>{const q=client.from("attendees").select("id,name,email,room_role,role_at_church,extra_fields").eq("engagement_id",id).eq("deleted",false).order("id").limit(500);return after?q.gt("id",after):q;}),
  ]);if(!c)notFound();
  const settings=e.settings as Partial<EngagementForm["settings"]>;
  return <main id="main" className="page-width setup-width"><div className="eyebrow-live">Only you see this</div><h1>{e.title}</h1><Link className="button-link" href={`/setup/${id}/run-of-show`}>Edit run of show</Link><Link className="text-link" href={`/setup/${id}/tv`}>Pair a TV</Link>
    <SetupEditor id={id} admin={profile.is_admin} hubConfigured={teamHubConfigured()} members={members||[]} initial={{church:{name:c.name,timezone:c.timezone,logo_url:c.logo_url||"",mission:c.mission,purpose:c.purpose,values:c.values.join("\n"),strategy:c.strategy,leadership_rhythms:c.leadership_rhythms.join("\n"),governance_body_name:c.governance_body_name},engagement:{title:e.title,type:e.type,status:e.status,start_date:e.start_date||"",end_date:e.end_date||"",retreat_start_date:e.retreat_start_date||"",retreat_end_date:e.retreat_end_date||"",pre_call_local:localTime(e.pre_call_at,c.timezone),base_year:String(e.base_year),lens_names:e.lens_names,how_the_room_decides:e.how_the_room_decides||consensus,settings:{neutral_join_message:settings.neutral_join_message===true,ai_enabled:settings.ai_enabled===true,scripture_translation:settings.scripture_translation||"",tv_theme:settings.tv_theme||"dark",texture:settings.texture!==false,room_size:settings.room_size||"very_small"}},lead:assignments?.find(f=>f.role==="lead")?.clearway_user_id||"",co:assignments?.find(f=>f.role==="co_facilitator")?.clearway_user_id||"",hub_client:e.team_hub_client_id||"",hub_engagement:e.team_hub_engagement_id||""}} />
    <AttendeeEditor id={id} attendees={attendees.sort((a,b)=>a.name.localeCompare(b.name))} linked={Boolean(e.team_hub_client_id)} hubConfigured={teamHubConfigured()} closed={e.status==="closed"} />
  </main>;
}
