import { NextResponse,type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig,sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { teamHubReader } from "@/lib/server/team-hub";
import { serviceClient } from "@/lib/server/supabase";
import { sendEmailBatch } from "@/lib/server/email";
import { invitationMessages,type InvitationSnapshot } from "@/lib/setup/invitation";
import { parseCsv,parsePasted,setupInput,validatePeople } from "@/lib/setup/policy";
import { clearwayEmail } from "@/lib/auth/policy";
import { fictionalEmail, practiceId } from "@/lib/room/practice";
import { uuid } from "@/lib/room/policy";
const answer=(data:Record<string,unknown>,status=200)=>privateResponse(NextResponse.json(data,{status}));
type InviteBatch={id:string;status:string;payload:InvitationSnapshot};
async function deliverInvites(engagement:string,batch:InviteBatch,origin:string){
  if(batch.status!=="sent"){
    await sendEmailBatch(batch.id,invitationMessages(engagement,batch.payload,origin));
    const {error}=await serviceClient().rpc("mark_invites_sent",{p_batch:batch.id});
    if(error)throw new Error("save");
  }
  return batch.payload.people.length;
}
export async function POST(request:NextRequest){
  const config=authConfig();if(!config||!sameOrigin(request,config.origin))return answer({ok:false},403);
  const fac=await getFacilitator();if(!fac)return answer({ok:false},401);
  try {
    const body=await limitedJson(request,262144),{client,profile}=fac,action=body.action;
    const scoped=async()=>{if(!uuid(body.id))throw new Error("missing");const {data,error}=await client.from("engagements").select("*").eq("id",body.id).eq("deleted",false).maybeSingle();if(error||!data)throw new Error("missing");return data;};
    const admin=()=>{if(!profile.is_admin)throw new Error("denied");};
    const rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error}=await client.rpc(name,args);if(error)throw new Error("save");return data;};
    if(action==="hub_clients"){admin();return answer({ok:true,clients:await teamHubReader().searchClients(typeof body.search==="string"?body.search:"")});}
    if(action==="hub_engagements"){admin();if(!uuid(body.client))return answer({ok:false},400);const hub=teamHubReader();return answer({ok:true,client:await hub.client(body.client),engagements:await hub.engagements(body.client)});}
    if(action==="hub_members"){admin();return answer({ok:true,members:(await teamHubReader().members()).filter(m=>clearwayEmail(m.email))});}
    if(action==="add_clearway_user"){
      admin();if(!uuid(body.member))return answer({ok:false},400);const m=(await teamHubReader().members()).find(m=>m.id===body.member&&clearwayEmail(m.email));if(!m)return answer({ok:false},400);
      const {error}=await client.from("clearway_users").insert({name:m.name,email:m.email,team_hub_team_member_id:m.id,is_admin:false});if(error)return answer({ok:false,message:"That person may already be a Clearway user."},400);return answer({ok:true});
    }
    if(action==="create"||action==="save"){
      const input=setupInput(body);let id:string|null=null,linkedClient:string|null=null,linkedEngagement:string|null=null;
      if(action==="create"){
        admin();if(!uuid(body.hub_client)||!uuid(body.hub_engagement))return answer({ok:false,message:"Choose a church and engagement from Team Hub."},400);
        const hub=teamHubReader();const [c,e]=await Promise.all([hub.client(body.hub_client),hub.engagement(body.hub_engagement,body.hub_client)]);if(!c||!e)return answer({ok:false},400);linkedClient=c.id;linkedEngagement=e.id;
      }else{const existing=await scoped();id=existing.id;linkedClient=existing.team_hub_client_id;linkedEngagement=existing.team_hub_engagement_id;}
      const saved=await rpc("save_engagement",{p_id:id,p_church:input.church,p_engagement:input.engagement,p_lead:uuid(body.lead)?body.lead:null,p_co:uuid(body.co)?body.co:null,p_client:linkedClient,p_hub_engagement:linkedEngagement});return answer({ok:true,id:saved});
    }
    if(action==="hub_people"||action==="hub_refresh"){
      const e=await scoped();if(!e.team_hub_client_id||!e.team_hub_engagement_id)return answer({ok:false,message:"This fictional engagement has no Team Hub link."},400);
      const hub=teamHubReader();if(!await hub.engagement(e.team_hub_engagement_id,e.team_hub_client_id))return answer({ok:false},404);
      if(action==="hub_people")return answer({ok:true,people:await hub.people(e.team_hub_client_id)});
      const [c,linked,elements,events]=await Promise.all([hub.client(e.team_hub_client_id),hub.engagement(e.team_hub_engagement_id,e.team_hub_client_id),hub.elements(e.team_hub_engagement_id,e.team_hub_client_id),hub.events(e.team_hub_engagement_id,e.team_hub_client_id)]);return answer({ok:true,client:c,engagement:linked,elements,events});
    }
    if(action==="preview_import"||action==="import"||action==="import_and_invite"){
      const e=await scoped();let preview;
      if(body.source==="person")preview=validatePeople([body.person]);
      else if(body.source==="csv"&&typeof body.text==="string")preview=parseCsv(body.text);
      else if(body.source==="paste"&&typeof body.text==="string")preview=parsePasted(body.text);
      else if(body.source==="hub"){
        if(!e.team_hub_client_id||!e.team_hub_engagement_id||!Array.isArray(body.ids)||body.ids.length>500||!body.ids.every(uuid))return answer({ok:false},400);
        const hub=teamHubReader();if(!await hub.engagement(e.team_hub_engagement_id,e.team_hub_client_id))return answer({ok:false},404);
        const chosen=new Set(body.ids),people=(await hub.people(e.team_hub_client_id)).filter(p=>chosen.has(p.id));
        if(people.length!==chosen.size)return answer({ok:false,message:"Choose people with a name and email."},400);
        preview=validatePeople(people.map(p=>({name:[p.first_name,p.last_name].filter(Boolean).join(" "),email:p.email,role_at_church:p.organization_role||p.role||"",team_hub_person_id:p.id})));
      }else return answer({ok:false},400);
      if(action==="preview_import")return answer({ok:true,...preview});
      if(action==="import_and_invite"){
        if(!uuid(body.batch))return answer({ok:false},400);
        if(!preview.people.length||preview.people.length>50)throw new Error("Choose up to 50 people to add and invite at once.");
        if(preview.people.some(p=>fictionalEmail(p.email)))throw new Error("Use real email addresses to send invites.");
        const batch=await rpc("import_and_queue_invites",{p_engagement:e.id,p_batch:body.batch,p_people:preview.people}) as InviteBatch;
        const count=await deliverInvites(e.id,batch,config.origin);
        return answer({ok:true,count,duplicates:preview.duplicates});
      }
      const count=await rpc("import_attendees",{p_engagement:e.id,p_people:preview.people});return answer({ok:true,count,duplicates:preview.duplicates});
    }
    if(action==="edit_attendee"||action==="remove_attendee"){
      const e=await scoped();if(!uuid(body.attendee))return answer({ok:false},400);
      const person=action==="edit_attendee"?validatePeople([body.person]).people[0]:null;
      const {error}=await client.from("attendees").update(person?{name:person.name,email:person.email,role_at_church:person.role_at_church,room_role:person.room_role||"participant"}:{deleted:true}).eq("id",body.attendee).eq("engagement_id",e.id).eq("deleted",false);if(error)throw new Error("save");const notice=await serviceClient().rpc("tv_presence_sync",{p_engagement:e.id});if(notice.error)console.error("TV roster notification unavailable",{code:notice.error.code});return answer({ok:true});
    }
    if(action==="reset_practice"){
      const e=await scoped();if(e.id!==practiceId)return answer({ok:false},400);
      return answer({ok:(await rpc("reset_practice_room",{}))===true});
    }
    if(action==="invite"||action==="prepare_invites"){
      const e=await scoped();if(!uuid(body.batch)||!Array.isArray(body.attendees)||!body.attendees.every(uuid))return answer({ok:false},400);
      const batch=await rpc("queue_engagement_invites",{p_engagement:e.id,p_batch:body.batch,p_attendees:body.attendees}) as InviteBatch;
      if(action==="prepare_invites")return answer({ok:true,batch:batch.id,payload:batch.payload,preview:invitationMessages(e.id,batch.payload,config.origin)[0]?.text});
      return answer({ok:true,count:await deliverInvites(e.id,batch,config.origin)});
    }
    return answer({ok:false},400);
  }catch(error){
    const message=error instanceof Error?error.message:"";
    if(message==="denied")return answer({ok:false},403);if(message==="missing")return answer({ok:false},404);
    const allowed=/^(Use |Choose |Check |Each |The (end|CSV)|Give |Add a CSV|Close every|Import up to|Paste up to|Name all|That local|Keep the)/.test(message);
    return answer({ok:false,message:allowed?message:"We couldn’t finish that. Check the connection and try again."},allowed?400:503);
  }
}
