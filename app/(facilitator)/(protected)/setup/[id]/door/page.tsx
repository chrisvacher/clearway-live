import { RefreshPage } from "@/app/(facilitator)/_components/refresh-page";
import { readAll } from "@/lib/server/read-all";
import { notFound } from "next/navigation";

import { requireFacilitator } from "@/lib/server/facilitator";
import { DoorList } from "@/components/facilitator/door-list";
import { uuid } from "@/lib/room/policy";

export default async function DoorPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params; if(!uuid(id)) notFound(); const {client}=await requireFacilitator();
  const {data:engagement}=await client.from("engagements").select("id,title").eq("id",id).eq("deleted",false).maybeSingle(); if(!engagement) notFound();
  const [{data:requests},attendees,{data:presence}]=await Promise.all([
    client.from("join_requests").select("id,name,email").eq("engagement_id",id).eq("status","pending").eq("deleted",false).order("requested_at"),
    readAll(after=>{const q=client.from("attendees").select("id,name,email,room_role").eq("engagement_id",id).eq("deleted",false).order("id").limit(500);return after?q.gt("id",after):q;}),
    client.rpc("room_presence",{p_engagement:id}),
  ]);
  attendees.sort((a,b)=>a.name.localeCompare(b.name));
  const signedIn=new Map<string,{attendee_id:string;device_count:number;present:boolean}>((presence || []).map((p:{attendee_id:string;device_count:number;present:boolean})=>[p.attendee_id,p]));
  return <><main id="main" className="admin-page"><header className="admin-heading"><div><h1>The door list</h1><p>See who’s here and help people join the room.</p></div><RefreshPage label="Refresh door list" /></header>
    <div className="admin-columns"><div className="admin-panel"><h2>On the list</h2>{!attendees.length&&<p>No one is on the list yet. Add people in setup to prepare their sign-in.</p>}<ul className="plain-list">{(attendees||[]).map(a=><li key={a.id}><strong>{a.name}</strong><p>{/@guest\.clearway\.invalid$/i.test(a.email) ? "Joined by name" : a.room_role === "scribe" ? "Scribe" : "Participant"}{!/@guest\.clearway\.invalid$/i.test(a.email)&&<> · {signedIn.has(a.id) ? "Signed in" : "Not signed in"}{signedIn.get(a.id)?.present ? " · Here now" : ""}</>}</p></li>)}</ul></div>
    <div className="admin-panel"><DoorList engagement={id} requests={requests||[]} attendees={attendees||[]} /></div></div>
  </main></>;
}
