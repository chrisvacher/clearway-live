import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { SetupEditor } from "@/components/facilitator/setup-editor";
import { consensus } from "@/lib/setup/policy";
import { teamHubConfigured } from "@/lib/server/team-hub";
export default async function NewEngagement(){
  const {profile,client}=await requireFacilitator();if(!profile.is_admin)notFound();
  const {data}=await client.from("clearway_users").select("id,name,email").eq("deleted",false).order("name");
  return <main id="main" className="page-width setup-width"><h1>Create an engagement</h1><SetupEditor admin hubConfigured={teamHubConfigured()} members={data||[]} initial={{church:{name:"",timezone:"America/Toronto",logo_url:"",mission:"",purpose:"",values:"",strategy:"",leadership_rhythms:"",governance_body_name:""},engagement:{title:"",type:"wayfinding",status:"setup",start_date:"",end_date:"",retreat_start_date:"",retreat_end_date:"",pre_call_local:"",base_year:"",lens_names:["Congregation","Community","Leadership","Operations","Learning"],how_the_room_decides:consensus,settings:{ai_enabled:false,scripture_translation:"",tv_theme:"dark",texture:true,room_size:"very_small",neutral_join_message:false}},lead:profile.id,co:"",hub_client:"",hub_engagement:""}} /></main>;
}
