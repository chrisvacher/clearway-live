"use client";
import { fictionalEmail } from "@/lib/room/practice";
import { useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { setupRequest } from "./setup-editor";
import type { Attendee } from "@/lib/setup/types";
import type { InvitationSnapshot } from "@/lib/setup/invitation";
import { AddPeople } from "./add-people";
export function AttendeeEditor({id,attendees,linked,hubConfigured,closed}:{id:string;attendees:Attendee[];linked:boolean;hubConfigured:boolean;closed:boolean}){
 const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[selected,setSelected]=useState<string[]>([]),[editing,setEditing]=useState<Attendee|null>(null),[batch,setBatch]=useState<{id:string;payload:InvitationSnapshot;preview:string}|null>(null),[removing,setRemoving]=useState<string|null>(null),[sent,setSent]=useState<string[]>([]);
 const inviteRequests=useRef(new Map<string,string>());
 async function perform(action:()=>Promise<void>){setBusy(true);setMessage("");try{await action();}catch(e){setMessage(e instanceof Error?e.message:"Please try again.");}finally{setBusy(false);}}
 const selection=(person:string)=>{setSelected(s=>s.includes(person)?s.filter(x=>x!==person):[...s,person]);setBatch(null);};
 const requestId=(ids:string[])=>{const key=[...ids].sort().join(",");let value=inviteRequests.current.get(key);if(!value){value=crypto.randomUUID();inviteRequests.current.set(key,value);}return {key,batch:value};};
 async function sendInvites(ids:string[]){
  const request=requestId(ids),r=await setupRequest({action:"invite",id,batch:request.batch,attendees:ids});
  inviteRequests.current.delete(request.key);setSent(current=>[...new Set([...current,...ids])]);setMessage(`Sent ${r.count} ${r.count===1?"invite":"invites"}.`);setSelected([]);setBatch(null);router.refresh();
 }
 return <section id="attendees" className="setup-section"><h2>The attendee list</h2><p>Add people from Team Hub, a CSV, or a pasted list. Each person has one place on the list, matched by email.</p>
  {closed?<p>This engagement is closed. Reopen it before importing people or sending invites.</p>:<AddPeople id={id} linked={linked} hubConfigured={hubConfigured} busy={busy} run={perform} onSaved={text=>{setMessage(text);setBatch(null);setSent([]);inviteRequests.current.clear();router.refresh();}} />}
  <div className="roster"><div className="roster-heading"><strong>{attendees.length} {attendees.length===1?"person":"people"}</strong>{!closed&&<button className="text-link" disabled={busy} onClick={()=>{setSelected(attendees.filter(a=>!fictionalEmail(a.email)).slice(0,50).map(a=>a.id));setBatch(null);}}>{attendees.filter(a=>!fictionalEmail(a.email)).length>50?"Select the first 50 for invites":"Select all for invites"}</button>}</div>
   {attendees.length===0?<p>No one is on the list yet.</p>:attendees.map(a=><article className="roster-row" key={a.id}><label className="check-row"><input type="checkbox" aria-label={`Invite ${a.name}`} disabled={busy||closed||fictionalEmail(a.email)} checked={selected.includes(a.id)} onChange={()=>selection(a.id)} /><span><strong>{a.name}</strong><br />{a.email}<br />{a.room_role==="scribe"?"Scribe":"Participant"}{a.role_at_church?` · ${a.role_at_church}`:""}</span></label>
    <div className="actions">{!closed&&!fictionalEmail(a.email)&&<button className="button-link secondary" aria-label={`${sent.includes(a.id)?"Resend":"Send"} invite to ${a.name}`} disabled={busy} onClick={()=>void perform(()=>sendInvites([a.id]))}>{sent.includes(a.id)?"Send again":"Send invite"}</button>}<button className="text-link" disabled={busy} onClick={()=>{setEditing({...a});setRemoving(null);}}>Edit person</button><button className="text-link" disabled={busy} onClick={()=>{setRemoving(a.id);setEditing(null);}}>Remove person</button>{sent.includes(a.id)&&<span role="status">Invite sent</span>}</div>
    {Object.keys(a.extra_fields||{}).length>0&&<details><summary>View additional fields</summary><dl>{Object.entries(a.extra_fields).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></details>}
    {removing===a.id&&<div className="notice"><p>Remove {a.name} from this engagement? Their signed-in devices will lose access.</p><button className="button-link" disabled={busy} onClick={()=>perform(async()=>{await setupRequest({action:"remove_attendee",id,attendee:a.id});setRemoving(null);setSelected(s=>s.filter(x=>x!==a.id));setBatch(null);router.refresh();})}>Confirm removal</button><button className="text-link" onClick={()=>setRemoving(null)}>Keep person</button></div>}
   </article>)}
  </div>
  {editing&&<form className="form-stack notice" onSubmit={e=>{e.preventDefault();void perform(async()=>{await setupRequest({action:"edit_attendee",id,attendee:editing.id,person:editing});setEditing(null);setBatch(null);setMessage("Person saved.");router.refresh();});}}><h3>Edit person</h3>{([['name','Name'],['email','Email'],['role_at_church','Role at the church']] as const).map(([key,label])=><label key={key}>{label}<input required={key!=="role_at_church"} type={key==="email"?"email":"text"} maxLength={key==="email"?254:200} value={editing[key]} onChange={e=>setEditing(p=>p?{...p,[key]:e.target.value}:null)} /></label>)}<label>Room role<select value={editing.room_role} onChange={e=>setEditing(p=>p?{...p,room_role:e.target.value as Attendee["room_role"]}:null)}><option value="participant">Participant</option><option value="scribe">Scribe</option></select></label><p>Changing an email signs out the person’s devices. They’ll use the new email to sign in again.</p><button className="button-link" disabled={busy}>Save person</button><button type="button" className="text-link" onClick={()=>setEditing(null)}>Keep current details</button></form>}
  {!closed&&<section className="notice"><h3>Invite the team</h3><p>Select people above to invite them together. Each email includes the room link, dates, and How the room decides.</p>
   <div className="actions"><button className="button-link" disabled={busy||!selected.length||selected.length>50} onClick={()=>void perform(()=>sendInvites(selected))}>Send {selected.length} {selected.length===1?"invite":"invites"}</button><button className="text-link" disabled={busy||!selected.length||selected.length>50} onClick={()=>void perform(async()=>{const request=requestId(selected),r=await setupRequest({action:"prepare_invites",id,batch:request.batch,attendees:selected});setBatch({id:r.batch,payload:r.payload,preview:r.preview});})}>Preview email</button></div>
   {selected.length>50&&<p>Choose up to 50 people at a time.</p>}
   {batch&&<details open><summary>Read the email</summary><ul>{batch.payload.people.map(p=><li key={p.id}>{p.name} ({p.email})</li>)}</ul><pre className="email-preview">{batch.preview}</pre></details>}
  </section>}
  <p role="status" aria-live="polite">{message}</p>
 </section>;
}
