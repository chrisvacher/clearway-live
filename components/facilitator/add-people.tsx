"use client";
import { useMemo,useState } from "react";
import { parseCsv,parsePasted,validatePeople,type ImportPreview } from "@/lib/setup/policy";
import { fictionalEmail } from "@/lib/room/practice";
import type { HubPerson } from "@/lib/team-hub/reader";
import { setupRequest } from "./setup-editor";

export function AddPeople({id,linked,hubConfigured,busy,run,onSaved}:{id:string;linked:boolean;hubConfigured:boolean;busy:boolean;run:(action:()=>Promise<void>)=>Promise<void>;onSaved:(message:string)=>void}){
  const [source,setSource]=useState("person"),[name,setName]=useState(""),[email,setEmail]=useState("");
  const [text,setText]=useState(""),[people,setPeople]=useState<HubPerson[]>([]),[ids,setIds]=useState<string[]>([]);
  const [operation,setOperation]=useState<string|null>(null);
  const clearDraft=()=>{setOperation(null);};
  const review=useMemo<{preview:ImportPreview|null;message:string}>(()=>{
    if(source==="person"&&(!name.trim()||!email.trim())||source==="hub"&&!ids.length||["paste","csv"].includes(source)&&!text.trim())return {preview:null,message:""};
    try{
      const preview=source==="person"?validatePeople([{name,email}]):source==="csv"?parseCsv(text):source==="paste"?parsePasted(text):validatePeople(people.filter(p=>ids.includes(p.id)).map(p=>({name:[p.first_name,p.last_name].filter(Boolean).join(" "),email:p.email,role_at_church:p.organization_role||p.role||"",team_hub_person_id:p.id})));
      return {preview,message:""};
    }catch(error){return {preview:null,message:error instanceof Error?error.message:"Check the names and emails."};}
  },[source,name,email,text,people,ids]);
  const count=review.preview?.people.length||0;
  const realEmails=review.preview?.people.every(p=>!fictionalEmail(p.email));
  async function save(invite:boolean){
    const batch=operation||crypto.randomUUID();
    if(invite)setOperation(batch);
    const result=await setupRequest({id,source,person:{name,email},text,ids,action:invite?"import_and_invite":"import",...(invite?{batch}:{})});
    clearDraft();setName("");setEmail("");setText("");setIds([]);
    onSaved(invite?`Saved ${result.count} ${result.count===1?"person":"people"} and sent ${result.count===1?"their invite":"their invites"}.`:`Saved ${result.count} ${result.count===1?"person":"people"}.`);
  }
  return <section className="notice"><h3>Add people</h3><form className="form-stack" onSubmit={event=>{event.preventDefault();void run(()=>save(true));}}>
    <label>Add from<select value={source} disabled={busy} onChange={e=>{setSource(e.target.value);clearDraft();}}><option value="person">One person</option><option value="paste">Pasted list</option><option value="csv">CSV</option><option value="hub" disabled={!linked||!hubConfigured}>Team Hub</option></select></label>
    {source==="person"?<div className="form-grid"><label>Name<input value={name} autoComplete="name" maxLength={200} required disabled={busy} onChange={e=>{setName(e.target.value);clearDraft();}} /></label><label>Email<input value={email} type="email" autoComplete="email" maxLength={254} required disabled={busy} onChange={e=>{setEmail(e.target.value);clearDraft();}} /></label></div>:source==="hub"?<>
      <button type="button" className="button-link secondary" disabled={busy} onClick={()=>void run(async()=>{setPeople((await setupRequest({action:"hub_people",id})).people);setIds([]);clearDraft();})}>Load church people</button>
      <div className="scroll-list">{people.map(p=><label className="check-row" key={p.id}><input type="checkbox" disabled={busy||!p.email} checked={ids.includes(p.id)} onChange={()=>{setIds(current=>current.includes(p.id)?current.filter(x=>x!==p.id):[...current,p.id]);clearDraft();}} />{[p.first_name,p.last_name].filter(Boolean).join(" ")} ({p.email||"No email"})</label>)}</div>
    </>:<>
      {source==="csv"&&<label>Choose a CSV<input type="file" disabled={busy} accept=".csv,text/csv" onChange={e=>{const input=e.currentTarget,file=input.files?.[0];input.value="";if(file)void run(async()=>{if(file.size>131072)throw new Error("Use a CSV smaller than 128 KB.");setText(await file.text());clearDraft();});}} /></label>}
      <label>{source==="csv"?"CSV contents":"Names and emails"}<textarea rows={5} value={text} disabled={busy} onChange={e=>{setText(e.target.value);clearDraft();}} placeholder={source==="csv"?"name,email,role\nAnn Lee,ann@example.org,Pastor":"Ann Lee <ann@example.org>"} /></label>
      <p>{source==="csv"?"Use name and email columns. Role is the person’s role at the church. Other columns are kept as fields. Use room_role only to change Participant or Scribe.":"Use Name <email@example.org> on each line."}</p>
    </>}
    {review.preview&&count>0&&<div><h4>{count} {count===1?"person":"people"} to add</h4><ul className="scroll-list">{review.preview.people.map(p=><li key={p.email}>{p.name} ({p.email}){p.room_role?` · ${p.room_role}`:""}</li>)}</ul>
      {review.preview.duplicates.length>0&&<p>Skipped duplicate emails: {review.preview.duplicates.join(", ")}. The first row is kept.</p>}
      <p>Existing emails update the person already on the list. Their scribe role stays unless you change it.</p>
    </div>}
    {review.message&&<p role="status">{review.message}</p>}
    {count>50&&<p>Add and invite up to 50 people at once. You can add this list without inviting.</p>}
    {count>0&&!realEmails&&<p>Use real email addresses to send invites. You can add these people without inviting.</p>}
    <div className="actions"><button type="submit" className="button-link" disabled={busy||!count||count>50||!realEmails}>{operation?"Retry add and invite":"Add and invite"}</button><button type="button" className="button-link secondary" disabled={busy||!count} onClick={()=>void run(()=>save(false))}>Add without inviting</button></div>
  </form></section>;
}
