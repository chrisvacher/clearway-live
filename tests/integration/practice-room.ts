import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { hash,newDevice,sessionId,digest } from "../../lib/room/policy";
import { practiceId,riversideId } from "../../lib/room/practice";
async function main(){
 const output=execFileSync("supabase",["status","-o","env"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]});
 const env=Object.fromEntries([...output.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map(m=>[m[1],m[2]]));assert.equal(new URL(env.API_URL).hostname,"127.0.0.1");assert.equal(new URL(env.DB_URL).hostname,"127.0.0.1");
 const sql=(query:string)=>execFileSync("psql",[env.DB_URL,"-X","-q","-v","ON_ERROR_STOP=1","-c",query],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
 const seed=()=>execFileSync("psql",[env.DB_URL,"-X","-q","-v","ON_ERROR_STOP=1","-f","supabase/seed.sql"],{stdio:["ignore","pipe","pipe"]});seed();seed();
 const admin=createClient(env.API_URL,env.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),phone=createClient(env.API_URL,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 async function result<T>(op:PromiseLike<{data:T;error:unknown}>){const {data,error}=await op;assert.equal(error,null);return data;}
 const roster=await result(admin.from("attendees").select("id,room_role").eq("engagement_id",riversideId).eq("deleted",false));assert.equal(roster!.length,8);assert.equal(roster!.filter(a=>a.room_role==="scribe").length,1);
 const device=newDevice(),p={engagement:practiceId,device:device.id,proof:hash(device.secret),device_code:device.code,rate_ip:digest("fixture","practice",device.id),rate_device:digest("fixture","practice-device",device.id)};
 assert.equal((await result(admin.rpc("room_auth",{p_action:"init",p}))).status,"ready");assert.ok((await phone.rpc("practice_guest",{p})).error);
 assert.equal((await result(admin.rpc("practice_guest",{p:{...p,name:"Practice guest"}}))).status,"approved");
 const claim=await result(admin.rpc("room_auth",{p_action:"prepare_claim",p}));assert.equal(claim.status,"claim");assert.equal(claim.email,device.id+"@practice.clearway.invalid");
 const generated=await admin.auth.admin.generateLink({type:"magiclink",email:claim.email});assert.equal(generated.error,null);const type=generated.data.properties!.verification_type;assert.ok(type==="signup"||type==="magiclink");
 const signed=await phone.auth.verifyOtp({token_hash:generated.data.properties!.hashed_token,type});assert.equal(signed.error,null);assert.ok(signed.data.session);
 assert.equal((await result(admin.rpc("room_auth",{p_action:"bind",p:{...p,claim:claim.claim,user:signed.data.user!.id,session:sessionId(signed.data.session.access_token)}}))).status,"signed_in");
 assert.equal((await result(phone.from("attendees").select("id").eq("engagement_id",practiceId)))!.length,1);assert.deepEqual(await result(phone.from("engagements").select("id")),[]);
 assert.equal(await result(phone.rpc("reset_practice_room",{})),false);
 // Only this disposable database gets a Google-session fixture for the reset actor.
 const actor=randomUUID(),sid=randomUUID(),profile=randomUUID();
 sql(`insert into auth.users(id,email,email_confirmed_at) values('${actor}','reset-fac@clearway.co',now());insert into auth.identities(user_id,provider,provider_id,identity_data) values('${actor}','google','${actor}','{"email":"reset-fac@clearway.co","email_verified":true}');insert into auth.sessions(id,user_id) values('${sid}','${actor}');insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),'${sid}',now(),now(),'oauth');insert into public.clearway_users(id,auth_user_id,name,email,team_hub_team_member_id,is_admin) values('${profile}','${actor}','Disposable reset facilitator','reset-fac@clearway.co',gen_random_uuid(),true);`);
 const reset=sql(`begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"${actor}","session_id":"${sid}","role":"authenticated"}',true);select public.reset_practice_room();commit;`);assert.match(reset,/\bt\b/);
 assert.deepEqual(await result(phone.from("attendees").select("id").eq("engagement_id",practiceId)),[]);assert.ok((await phone.auth.refreshSession()).error,"Reset deletes only the bound Auth sessions, invalidating refresh");
 assert.equal((await result(admin.rpc("room_auth",{p_action:"bind",p:{...p,claim:claim.claim,user:signed.data.user!.id,session:sessionId(signed.data.session.access_token)}}))).status,"device_missing");
 assert.equal((await result(admin.from("attendees").select("id").eq("engagement_id",riversideId).eq("deleted",false)))!.length,8);
 const untouched=sql(`select count(*) from auth.sessions where id='${sid}'`);assert.match(untouched,/\b1\b/);
 const next=newDevice(),fresh={...p,device:next.id,proof:hash(next.secret),device_code:next.code};assert.equal((await result(admin.rpc("room_auth",{p_action:"init",p:fresh}))).status,"ready");assert.equal((await result(admin.rpc("practice_guest",{p:{...fresh,name:"Fresh practice guest"}}))).status,"approved");
 console.log("Practice: idempotent seeds, Riverside eight people/one scribe, no-email native sign-in, private-data isolation, guarded reset, Auth refresh revocation, old-proof denial and fresh rejoin passed.");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
