import { readAll } from "@/lib/server/read-all";
import { notFound } from "next/navigation";

import { requireFacilitator } from "@/lib/server/facilitator";
import Link from "next/link";
import { DoorList, DoorKeepUp } from "@/components/facilitator/door-list";
import { uuid } from "@/lib/room/policy";

export default async function DoorPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params; if(!uuid(id)) notFound(); const {client}=await requireFacilitator();
  const {data:engagement}=await client.from("engagements").select("id,title,type,settings,church:churches!engagements_church_id_fkey(name)").eq("id",id).eq("deleted",false).maybeSingle(); if(!engagement) notFound();
  const [{data:requests},attendees,{data:presence}]=await Promise.all([
    client.from("join_requests").select("id,name,email").eq("engagement_id",id).eq("status","pending").eq("deleted",false).order("requested_at"),
    readAll(after=>{const q=client.from("attendees").select("id,name,email,room_role").eq("engagement_id",id).eq("deleted",false).order("id").limit(500);return after?q.gt("id",after):q;}),
    client.rpc("room_presence",{p_engagement:id}),
  ]);
  attendees.sort((a,b)=>a.name.localeCompare(b.name));
  const signedIn=new Map<string,{attendee_id:string;device_count:number;present:boolean}>((presence || []).map((p:{attendee_id:string;device_count:number;present:boolean})=>[p.attendee_id,p]));
  const church=(engagement.church as unknown as {name:string}|null)?.name ?? "Church not named";
  const open=engagement.type==="team_workshop" && ((engagement.settings ?? {}) as {open_join?:boolean}).open_join===true;
  const guest=(email:string)=>/@guest\.clearway\.invalid$/i.test(email);
  const listed=attendees.some(a=>!guest(a.email));
  return <><main id="main" className="admin-page"><DoorKeepUp /><header className="admin-heading"><div><div className="admin-kicker">{church} · {engagement.title}</div><h1>Door list</h1><p>See who’s here and help people join the room.</p></div></header>
    <div className="admin-columns"><div className="admin-panel"><h2>{open?"In the room":"On the list"}</h2>
      {!attendees.length&&(open?<p>No one has joined yet. People appear here as they join.</p>:<p>No one is on the list yet. Add people on <Link href={`/setup/${id}/joining`}>People and joining</Link>.</p>)}
      {open&&attendees.length>0&&<p className="admin-lead">Everyone who has joined, in alphabetical order.</p>}
      <ul className="plain-list">{attendees.map(a=><li key={a.id}><strong>{a.name}</strong><p>{guest(a.email) ? "Joined by name" : a.room_role === "scribe" ? "Scribe" : "Participant"}{!guest(a.email)&&<> · {signedIn.has(a.id) ? "Signed in" : "Not signed in"}</>}{signedIn.get(a.id)?.present ? " · Here now" : ""}</p></li>)}</ul></div>
    <div className="admin-panel"><DoorList engagement={id} requests={requests||[]} attendees={attendees} listed={!open||listed} /></div></div>
  </main></>;
}
