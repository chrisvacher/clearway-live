import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { RoomStream } from "../../lib/live/stream";
import { sessionId } from "../../lib/room/policy";
import type { LiveRead, LiveSnapshot } from "../../lib/live/types";

async function main() {
 const raw=execFileSync("supabase",["status","-o","env"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]});
 const env=Object.fromEntries([...raw.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map(m=>[m[1],m[2]]));
 assert.equal(new URL(env.API_URL).hostname,"127.0.0.1");assert.equal(new URL(env.DB_URL).hostname,"127.0.0.1");
 const db=new Pool({connectionString:env.DB_URL,max:4}),clients:SupabaseClient[]=[],streams:RoomStream[]=[];
 const admin=createClient(env.API_URL,env.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
 async function rpc(client:SupabaseClient,name:string,args:Record<string,unknown>={}) {const {data,error}=await client.rpc(name,args);assert.equal(error,null,name);return data;}
 async function identity(email:string) {
  const client=createClient(env.API_URL,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(client);
  const generated=await admin.auth.admin.generateLink({type:"magiclink",email});assert.equal(generated.error,null);
  const type=generated.data.properties!.verification_type;assert.ok(type==="magiclink"||type==="signup");
  const verified=await client.auth.verifyOtp({token_hash:generated.data.properties!.hashed_token,type});assert.equal(verified.error,null);assert.ok(verified.data.session);assert.ok(verified.data.user);
  return {client,user:verified.data.user,auth:verified.data.session,sid:sessionId(verified.data.session.access_token)!};
 }
 async function until(check:()=>boolean,label:string) {for(let i=0;i<100&&!check();i++)await delay(50);assert.ok(check(),label);}
 try {
  const room=randomUUID(),otherRoom=randomUUID(),church=randomUUID(),facId=randomUUID();
  const fac=await identity(`tv-fac-${randomUUID()}@clearway.co`),phone=await identity(`tv-phone-${randomUUID()}@example.org`);
  await db.query("insert into public.churches(id,name,timezone) values($1,'Native TV church','America/Toronto')",[church]);
  await db.query("insert into public.engagements(id,church_id,title,status) values($1,$2,'Native TV engagement','pre_call'),($3,$2,'Other TV engagement','pre_call')",[room,church,otherRoom]);
  await db.query("insert into auth.identities(user_id,provider,provider_id,identity_data) values($1::uuid,'google',$1::uuid::text,jsonb_build_object('email',$2::text,'email_verified',true))",[fac.user.id,fac.user.email]);
  await db.query("insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),$1,now(),now(),'oauth')",[fac.sid]);
  await db.query("insert into public.clearway_users(id,auth_user_id,name,email,team_hub_team_member_id) values($1,$2,'Native facilitator',$3,gen_random_uuid())",[facId,fac.user.id,fac.user.email]);
  await db.query("insert into public.engagement_facilitators(engagement_id,clearway_user_id,role) values($1,$2,'lead')",[room,facId]);
  const manage=(action:string,p:Record<string,unknown>={})=>rpc(fac.client,"tv_manage",{p_engagement:room,p_action:action,p});
  const device=()=>({device:randomUUID(),proof:hash(randomUUID()),code_hash:hash(randomUUID()),rate:hash("native-tv-ci"),browser:"Native CI browser"});
  const first=device(),second=device();
  assert.equal((await rpc(admin,"tv_device",{p_action:"sync",p:first})).status,"pair");
  assert.equal((await rpc(admin,"tv_device",{p_action:"prepare",p:first})).status,"denied");
  assert.ok((await phone.client.rpc("tv_device",{p_action:"sync",p:first})).error,"Low privilege client cannot perform server exchange");
  assert.equal((await rpc(phone.client,"tv_manage",{p_engagement:room,p_action:"pair",p:{code_hash:first.code_hash,label:"Forged"}})).status,"denied");
  assert.equal((await rpc(fac.client,"tv_manage",{p_engagement:otherRoom,p_action:"pair",p:{code_hash:first.code_hash,label:"Other"}})).status,"denied");
  await db.query("update private.tv_devices set code_expires_at=now()-interval '1 second' where id=$1",[first.device]);
  assert.equal((await manage("pair",{code_hash:first.code_hash,label:"Front TV"})).status,"invalid_code");
  first.code_hash=hash(randomUUID());assert.equal((await rpc(admin,"tv_device",{p_action:"sync",p:first})).status,"pair");
  async function pair(d:ReturnType<typeof device>,label:string) {
   await rpc(admin,"tv_device",{p_action:"sync",p:d});assert.equal((await manage("pair",{code_hash:d.code_hash,label})).status,"ok");
   assert.equal((await manage("pair",{code_hash:d.code_hash,label})).status,"invalid_code");
   const claim=await rpc(admin,"tv_device",{p_action:"prepare",p:d});assert.equal(claim.status,"claim");
   const tv=await identity(claim.email);const bound=await rpc(admin,"tv_device",{p_action:"bind",p:{...d,claim:claim.claim,user:tv.user.id,session:tv.sid}});assert.equal(bound.status,"paired");
   return tv;
  }
  const one=await pair(first,"Front TV"),two=await pair(second,"Back TV");
  assert.equal((await manage("list")).screens.length,2);
  const restored=createClient(env.API_URL,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(restored);
  assert.equal((await restored.auth.setSession({access_token:one.auth.access_token,refresh_token:one.auth.refresh_token})).error,null);
  assert.equal((await rpc(restored,"tv_current")).engagement,room,"A new browser client resumes without re-pairing");
  assert.deepEqual((await one.client.from("sessions").select("*")).data,[]);assert.deepEqual((await one.client.from("attendees").select("*")).data,[]);
  assert.equal((await rpc(one.client,"show_read",{p_engagement:room})).status,"denied");
  assert.equal((await rpc(one.client,"live_snapshot",{p_engagement:otherRoom})).status,"denied");
  const frame=await rpc(one.client,"live_snapshot",{p_engagement:room});
  // Probe fresh private transport before one-send application assertions.
  let ready=false;const marker=randomUUID();await one.client.realtime.setAuth();
  const channel=one.client.channel(frame.topic,{config:{private:true}}).on("broadcast",{event:"test_ready"},v=>{if(v.payload.marker===marker)ready=true;});
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("TV subscription timed out")),10000);channel.subscribe(status=>{if(status==="SUBSCRIBED"){clearTimeout(timer);resolve();}else if(status==="CHANNEL_ERROR"){clearTimeout(timer);reject(new Error("TV subscription denied"));}});});
  for(let n=0;n<30&&!ready;n++){await db.query("select private.live_send($1,'test_ready',$2::jsonb)",[frame.topic,JSON.stringify({marker})]);await delay(100);}assert.ok(ready);
  const views:LiveSnapshot[][]=[[],[]],modes=["",""],receipts=new Map<string,string>();
  for(const [index,tv] of [one,two].entries()) {
   const stream=new RoomStream({read:async()=>({...await rpc(tv.client,"live_snapshot",{p_engagement:room}),connection:{url:env.API_URL,key:env.ANON_KEY,token:tv.auth.access_token}} as LiveRead),render:value=>views[index].push(value),mode:value=>{modes[index]=value;},received:(event,at)=>{if(index===1&&event.answer)receipts.set(event.answer.id,new Date(at).toISOString());}});streams.push(stream);stream.start();
  }
  await until(()=>modes.every(m=>m==="realtime"),"Both production TV receivers joined");
  assert.equal((await manage("screen",{content:"join"})).status,"ok");await until(()=>views.every(v=>v.at(-1)?.state.tv_content==="join"),"Both TVs show the selected join screen");
  const attendee=randomUUID();await db.query("insert into public.attendees(id,engagement_id,auth_user_id,name,email,verified_at) values($1,$2,$3,'Ruth Confidential Surname',$4,now())",[attendee,room,phone.user.id,phone.user.email]);
  await db.query("insert into public.device_sessions(engagement_id,attendee_id,auth_session_id) values($1,$2,$3)",[room,attendee,phone.sid]);
  assert.equal(await rpc(admin,"tv_presence_sync",{p_engagement:room}),true);
  await until(()=>views.every(v=>v.at(-1)?.presence?.count===1),"Names arrive on both TVs without reload");
  const publicFrame=views[1].at(-1)!;assert.equal(publicFrame.presence!.names[0].name,"Ruth");assert.ok(!JSON.stringify(publicFrame).includes("Confidential"));assert.ok(!JSON.stringify(publicFrame).includes(phone.user.email!));assert.ok(!JSON.stringify(publicFrame).includes(attendee));
  const phone2=await identity(phone.user.email!);await db.query("insert into public.device_sessions(engagement_id,attendee_id,auth_session_id) values($1,$2,$3)",[room,attendee,phone2.sid]);assert.equal(await rpc(admin,"tv_presence_sync",{p_engagement:room}),false,"A second device does not duplicate the person");
  const session=randomUUID();await db.query("insert into public.sessions(id,engagement_id,title,state) values($1,$2,'TV receipt test','live')",[session,room]);await db.query("insert into private.session_notes(session_id,engagement_id,notes) values($1,$2,'PRIVATE-TV-TEST-NOTES')",[session,room]);await db.query("update public.room_states set live_session_id=$1,tv_content='session' where engagement_id=$2",[session,room]);
  await until(()=>views.every(v=>v.at(-1)?.session?.id===session),"TVs follow live session state");
  const answerIds=[randomUUID(),randomUUID()];for(const id of answerIds){assert.equal((await rpc(phone.client,"live_submit",{p_engagement:room,p_session:session,p_id:id,p_revision:0,p_action:"submit",p_text:"Hope",p_sent:new Date().toISOString(),p_uncertainty:1})).status,"accepted");await delay(20);}
  await until(()=>answerIds.every(id=>receipts.has(id)),"Native TV records original event receive timestamps");
  const version=views[1].at(-1)!.version;
  assert.equal(await rpc(two.client,"live_ack",{p_engagement:room,p_version:version,p_received:new Date().toISOString(),p_uncertainty:8,p_answers:answerIds.map(id=>({id,revision:0,received_at:receipts.get(id),uncertainty_ms:2}))}),true);
  const logged=await db.query("select submission_id,tv_received_at,clock_uncertainty_ms from private.latency_logs where tv_session_id=(select id from private.live_tv_sessions where auth_session_id=$1) order by submission_id",[two.sid]);assert.equal(logged.rows.length,2);
  for(const row of logged.rows){assert.equal(row.tv_received_at.toISOString(),receipts.get(row.submission_id));assert.equal(row.clock_uncertainty_ms,3);}
  assert.ok(!JSON.stringify(views[1].at(-1)).includes("PRIVATE-TV-TEST-NOTES"));
  assert.equal((await manage("unpair",{device:first.device})).status,"ok");await until(()=>modes[0]==="denied","Unpaired TV's cached private channel stops reading");
  assert.equal((await rpc(one.client,"live_snapshot",{p_engagement:room})).status,"denied");assert.ok((await one.client.auth.refreshSession()).error,"Unpair invalidates refresh tokens");
  assert.equal((await rpc(admin,"tv_device",{p_action:"sync",p:{...first,code_hash:hash(randomUUID())}})).status,"pair");assert.equal((await rpc(admin,"tv_device",{p_action:"prepare",p:first})).status,"denied");
  assert.equal((await manage("display",{room_size:"medium",theme:"light",texture:false,reduced_motion:true})).status,"ok");await until(()=>views[1].at(-1)?.display?.theme==="light","Remaining TV resubscribes after access rotation and receives display settings");
  const code=(await fac.client.from("engagements").select("room_code").eq("id",room).single()).data!.room_code;assert.equal(await rpc(admin,"tv_room_link",{p_code:code}),room);
  await db.query("update public.engagements set status='closed' where id=$1",[room]);assert.ok((await two.client.auth.refreshSession()).error);await db.query("update public.engagements set status='pre_call' where id=$1",[room]);assert.equal((await rpc(admin,"tv_device",{p_action:"sync",p:{...second,code_hash:hash(randomUUID())}})).status,"pair");
  console.log("Native TV: expiring one-use codes, facilitator approval, two TVs, browser-client resume, native role isolation, first-name arrivals, duplicate-device counting, per-answer receipt times, cached-channel unpair/rekey, display settings and closure/reopen revocation passed. No production services or venue hardware used.");
 } finally {streams.forEach(s=>s.stop());await Promise.all(clients.map(c=>c.removeAllChannels()));await db.end();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
