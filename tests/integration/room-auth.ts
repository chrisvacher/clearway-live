import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { digest, hash, newDevice, sessionId } from "../../lib/room/policy";

// The only accepted endpoint is the disposable local stack started by CI.
const status = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const env=Object.fromEntries([...status.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map(m=>[m[1],m[2]]));
const origin=env.API_URL;assert.equal(new URL(origin).hostname,"127.0.0.1");
const admin=createClient(origin,env.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const phone=createClient(origin,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const room=randomUUID(),church=randomUUID(),attendee=randomUUID();
const email=`native-${randomUUID()}@example.org`;
async function result<T>(operation:PromiseLike<{data:T;error:unknown}>) {const {data,error}=await operation;assert.equal(error,null);return data;}
await result(admin.from("churches").insert({id:church,name:"Disposable Auth test",timezone:"America/Toronto"}));
await result(admin.from("engagements").insert({id:room,church_id:church,title:"Disposable Auth room",status:"pre_call",settings:{private_note:"must-not-be-in-public-room"}}));
await result(admin.from("attendees").insert({id:attendee,engagement_id:room,name:"Native Auth test",email}));
const publicInfo=await result(admin.rpc("room_public_info",{p_engagement:room}));assert.equal(publicInfo.church,"Disposable Auth test");assert.ok(!JSON.stringify(publicInfo).includes("must-not-be-in-public-room"));
const device=newDevice();const p={engagement:room,device:device.id,proof:hash(device.secret),device_code:device.code,
  rate_ip:digest("fixture","ip",device.id),rate_device:digest("fixture","device",device.id),rate_email:digest("fixture","email",email)};
async function rpc(action:string,payload:Record<string,unknown>=p){return await result(admin.rpc("room_auth",{p_action:action,p:payload}));}
assert.equal((await rpc("init")).status,"ready");
const challenge=randomUUID();const codeHash=digest(env.SERVICE_ROLE_KEY,"code",email,"123456");
assert.equal((await rpc("send",{...p,email,challenge,code_hash:codeHash,link_hash:hash("native-link")})).status,"sent");
assert.equal((await rpc("verify",{...p,email,code_hash:codeHash})).status,"approved");
const claim=await rpc("prepare_claim");assert.equal(claim.status,"claim");
const generated=await admin.auth.admin.generateLink({type:"magiclink",email});assert.equal(generated.error,null);
const type=generated.data.properties!.verification_type;assert.ok(type==="magiclink" || type==="signup");
const verified=await phone.auth.verifyOtp({token_hash:generated.data.properties!.hashed_token,type});assert.equal(verified.error,null);assert.ok(verified.data.session);assert.ok(verified.data.user);
const session=sessionId(verified.data.session.access_token);assert.ok(session);
assert.equal((await rpc("bind",{...p,claim:claim.claim,user:verified.data.user.id,session})).status,"signed_in");
const own=await result(phone.from("attendees").select("id").eq("engagement_id",room));assert.deepEqual(own,[{id:attendee}]);
assert.deepEqual(await result(phone.from("engagements").select("id")),[]);
assert.deepEqual(await result(phone.from("clearway_users").select("id")),[]);
assert.ok((await phone.rpc("room_auth",{p_action:"prepare_claim",p})).error);
assert.equal((await rpc("verify",{...p,email,code_hash:codeHash})).status,"invalid_code");
// Independent device, same Auth identity: sign-in does not revoke the first session.
const second=newDevice();const p2={...p,device:second.id,proof:hash(second.secret),device_code:second.code,rate_device:digest("fixture","device",second.id)};
assert.equal((await rpc("init",p2)).status,"ready");
const challenge2=randomUUID();await rpc("send",{...p2,email,challenge:challenge2,code_hash:codeHash,link_hash:hash("native-link-2")});
await rpc("verify",{...p2,email,code_hash:codeHash});const claim2=await rpc("prepare_claim",p2);
const generated2=await admin.auth.admin.generateLink({type:"magiclink",email});assert.equal(generated2.error,null);
const secondPhone=createClient(origin,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const verified2=await secondPhone.auth.verifyOtp({token_hash:generated2.data.properties!.hashed_token,type:"magiclink"});assert.equal(verified2.error,null);
assert.equal((await rpc("bind",{...p2,claim:claim2.claim,user:verified2.data.user!.id,session:sessionId(verified2.data.session!.access_token)})).status,"signed_in");
assert.deepEqual(await result(phone.from("attendees").select("id").eq("engagement_id",room)),[{id:attendee}]);
assert.deepEqual(await result(secondPhone.from("attendees").select("id").eq("engagement_id",room)),[{id:attendee}]);
await result(admin.from("engagements").update({status:"closed"}).eq("id",room));
assert.deepEqual(await result(phone.from("attendees").select("id").eq("engagement_id",room)),[]);
assert.deepEqual(await result(secondPhone.from("attendees").select("id").eq("engagement_id",room)),[]);
console.log("Native Supabase Auth: new attendee, OTP proof, two devices, private-data isolation, replay and closure passed.");
