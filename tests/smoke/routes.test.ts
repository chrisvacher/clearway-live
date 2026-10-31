import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createServer as createHttpServer, type Server } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { after, before, test } from "node:test";

let server: ChildProcess;
let origin: string;
let output = "";
let authServer: Server;
let authOrigin: string;
let expectedChallenge = "";
const logouts: string[] = [];
const calls: string[] = [];
const roomId = "50000000-0000-4000-8000-000000000010";
const practiceRoom="90000000-0000-4000-8000-000000000010";
let practiceName="Practice guest";
const roomAttendee = "50000000-0000-4000-8000-000000000011";
const emails: { to: string[]; text: string; html: string }[] = [];
const inviteBatches = new Map<string,Record<string,unknown>>();
const sentBatches:string[]=[];
let failedInviteBatch:string|null=null,combinedImports=0;
const roomDevices = new Map<string,{proof:string;code:string;approved:boolean;claim?:string}>();
const roomChallenges = new Map<string,{email:string;code:string;link:string;consumed:boolean}>();
const roomJoins = new Map<string,{id:string;device:string;email:string;name:string;status:string}>();
let showVersion=1,showReadPages=0,showPaging=false,showRestart=false;
const showSessions = new Map<string,Record<string,unknown>>();
const fixtureSession = (id:string, position=0) => ({id,engagement_id:roomId,title:position ? "Five Lenses: Congregation" : "Celebration",part:"Day 1",position,planned_start:"2026-11-14T14:00:00Z",planned_minutes:20,mode:"live",opens_at:null,closes_at:null,interaction:position ? "wall" : "word_cloud",prompt:"It is {base year + 10}. Describe our Congregation.",phone_depth:"Phone-only planning depth",settings:{anonymous:true,burst_minutes:4,join_strip:false},notes:"PRIVATE-PRINT-NOTES",lands_in:"10-year Future",state:"ready",max_sends:3,max_characters:position ? 280 : 28,max_words:position ? 50 : 3,revision:0});
showSessions.set(roomAttendee,fixtureSession(roomAttendee));
showSessions.set(roomId,fixtureSession(roomId,1));
let livePages=0,liveRestart=false;
let roomAuthCalls = 0;
let roomBound = false;
const userId = "50000000-0000-4000-8000-000000000001";
const user = (mode: string) => ({ id: userId, aud: "authenticated", role: "authenticated",
  email: mode === "external" ? "person@example.org" : mode === "room" ? "ann@example.org" : "facilitator@clearway.co",
  email_confirmed_at: "2026-10-01T00:00:00Z", identities: [], app_metadata: {}, user_metadata: {} });
function token(mode: string) {
  return [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"), Buffer.from(JSON.stringify({ sub: userId, session_id:"50000000-0000-4000-8000-000000000003", exp: Math.floor(Date.now()/1000)+3600, mode })).toString("base64url"), "c2lnbmF0dXJl"].join(".");
}
function modeOf(authorization: string | undefined) {
  try { return JSON.parse(Buffer.from((authorization || "").split(".")[1], "base64url").toString()).mode as string; }
  catch { return "invalid"; }
}
const profile = { id: "50000000-0000-4000-8000-000000000002", name: "Test facilitator", email: "facilitator@clearway.co", is_admin: false };
const tripwire = "foundation-server-secret-must-never-ship";

before(async () => {
  await readFile(".next/BUILD_ID");
  const socket = createServer();
  await new Promise<void>(resolve => socket.listen(0, "127.0.0.1", resolve));
  const address = socket.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) => socket.close(err => err ? reject(err) : resolve()));
  origin = `http://127.0.0.1:${port}`;
  // A local HTTP Auth/PostgREST fixture exercises the real SSR SDK and Next routes.
  // Real identity and role decisions are tested separately against Postgres in pgTAP.
  authServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url!, "http://fixture");
    calls.push(url.pathname);
    res.setHeader("Content-Type", "application/json");
    const send = (value: unknown, status = 200) => { res.statusCode = status; res.end(JSON.stringify(value)); };
    const mode = modeOf(req.headers.authorization);
    if (url.pathname === "/auth/v1/authorize") {
      expectedChallenge=url.searchParams.get("code_challenge")!;
      const callback=new URL(url.searchParams.get("redirect_to")!);callback.searchParams.set("code","allowed");
      res.statusCode=303;res.setHeader("Location",callback.toString());return res.end();
    }
    if (url.pathname === "/auth/v1/token") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      if (url.searchParams.get("grant_type") === "refresh_token") {
        if (!["refresh-allowed","refresh-room"].includes(body.refresh_token)) return send({ message: "Invalid refresh token" }, 400);
      } else if (!body.code_verifier || createHash("sha256").update(body.code_verifier).digest("base64url") !== expectedChallenge || body.auth_code === "invalid") {
        return send({ message: "Invalid PKCE code" }, 400);
      }
      const loginMode = body.auth_code || (body.refresh_token==="refresh-room"?"room":"allowed");
      return send({ access_token: token(loginMode), refresh_token: "refresh-" + loginMode,
        expires_in: 3600, token_type: "bearer", user: user(loginMode),
        provider_token: "unused-google-provider-secret" + "p".repeat(5000), provider_refresh_token: "unused-google-refresh-secret" });
    }
    if (url.pathname === "/auth/v1/user") return mode === "invalid" || mode === "revoked"
      ? send({ message: "Invalid session" }, 401) : send(user(mode));
    if (url.pathname === "/auth/v1/logout") { logouts.push(url.searchParams.get("scope") || ""); return send({}); }
    if(url.pathname==="/rest/v1/rpc/show_read") {
      assert.notEqual(req.headers.apikey,tripwire);let raw="";for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);showReadPages++;
      if(mode!=="allowed"||body.p_engagement!==roomId)return send({status:"denied"});
      if(body.p_after&&showRestart){showRestart=false;showVersion++;return send({status:"changed"});}
      if(body.p_version&&body.p_version!==String(showVersion))return send({status:"changed"});
      const id=(n:number)=>"57000000-0000-4000-8000-"+String(n).padStart(12,"0");
      const start=body.p_after?Number(body.p_after.slice(-12)):0;
      return send({status:"ok",version:String(showVersion),context:{id:roomId,title:"Riverside Church Wayfinding",church:"Riverside Church",timezone:"America/Toronto",base_year:2026,closed:false},sessions:showPaging?Array.from({length:Math.min(500,1205-start)},(_,i)=>fixtureSession(id(start+i+1),start+i)): [...showSessions.values()],next:showPaging&&start+500<1205?id(start+500):null});
    }
    if(url.pathname==="/rest/v1/rpc/show_write") {
      assert.notEqual(req.headers.apikey,tripwire);let raw="";for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
      if(mode!=="allowed"||body.p_engagement!==roomId)return send({status:"denied"});
      const input=body.p_input, previous=showSessions.get(input.id);
      if(body.p_action==="save"){
        if(previous&&previous.revision!==input.revision)return send({status:"conflict"});
        showSessions.set(input.id,{...input,engagement_id:roomId,position:previous?.position??showSessions.size,revision:previous?Number(previous.revision)+1:0});
      } else if(body.p_action==="remove")showSessions.delete(input.id);
      else if(body.p_action==="reorder") input.order.forEach((v:{id:string},i:number)=>{const row=showSessions.get(v.id)!;showSessions.set(v.id,{...row,position:i,revision:Number(row.revision)+1});});
      showVersion++;return send({status:"ok",id:input.id});
    }
    if (url.pathname === "/rest/v1/rpc/live_snapshot") {
      assert.notEqual(req.headers.apikey,tripwire);let raw="";for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);livePages++;
      if(!["allowed","room"].includes(mode)||body.p_engagement!==roomId)return send({status:"denied"});
      if(body.p_after&&liveRestart){liveRestart=false;return send({status:"changed",version:42});}
      const start=body.p_after?Number(body.p_after.slice(-12)):0;
      const id=(n:number)=>"56000000-0000-4000-8000-"+String(n).padStart(12,"0");
      const answers=Array.from({length:Math.min(500,1205-start)},(_,i)=>({id:id(start+i+1),session_id:roomId,text:"Hope",answers:[{text:"Hope",key:"hope"}],revision:0}));
      return send({status:"ok",role:mode==="allowed"?"facilitator":"participant",version:42,topic:"live:fixture",server_time:new Date().toISOString(),phone_depth:"Phone-only depth",session:null,state:{engagement_id:roomId,live_session_id:roomId,version:42},answers,next:start+500<1205?id(start+500):null});
    }
    if(url.pathname==="/rest/v1/rpc/live_submit"){
      assert.notEqual(req.headers.apikey,tripwire);let raw="";for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
      return send(mode==="room"&&body.p_engagement===roomId?{status:"accepted",id:body.p_id,revision:body.p_revision,version:43}:{status:"denied"});
    }
    if (url.pathname === "/rest/v1/rpc/claim_clearway_access") return send(mode === "allowed");
    if (url.pathname === "/rest/v1/clearway_users") {
      if(url.searchParams.has("auth_user_id"))assert.equal(url.searchParams.get("auth_user_id"), "eq." + userId);
      return send(mode === "allowed" ? [profile] : []);
    }
    if (url.pathname === "/rest/v1/engagements") {
      if (url.searchParams.get("id") === "eq." + roomId) return send([{ id:roomId,church_id:roomId,title:"Room fixture",team_hub_client_id:null,team_hub_engagement_id:null,base_year:2026,lens_names:["Congregation","Community","Leadership","Operations","Learning"],type:"wayfinding",status:"pre_call",how_the_room_decides:"We decide together.",settings:{neutral_join_message:false,private_note:tripwire},churches:{name:"Fixture church",deleted:false}}]);
      return send([{ id: "engagement-a", title: "Assigned engagement", status: "setup" }]);
    }
    if (url.pathname === "/rest/v1/churches")return send([{id:roomId,name:"Fixture church",timezone:"America/Toronto",mission:"",purpose:"",values:[],strategy:"",leadership_rhythms:[],governance_body_name:""}]);
    if(url.pathname === "/rest/v1/engagement_facilitators")return send([{clearway_user_id:profile.id,role:"lead"}]);
    if (url.pathname === "/rest/v1/attendees") return send((mode === "room" && roomBound) || mode === "allowed" ? [{id:roomAttendee,name:url.searchParams.get("engagement_id")==="eq."+practiceRoom?practiceName:"Ann Lee",email:"ann@example.org",room_role:"participant"}] : []);
    if (url.pathname === "/rest/v1/device_sessions") return send([]);
    if (url.pathname === "/rest/v1/join_requests") return send([...roomJoins.values()].filter(j=>url.searchParams.has("id") ? url.searchParams.get("id") === "eq."+j.id : j.status==="pending"));
    if(url.pathname==="/emails/batch") {
      let raw="";for await(const chunk of req)raw+=chunk;const payload=JSON.parse(raw);assert.equal(payload.length,1);assert.equal(payload[0].to[0],"ann@example.org");assert.match(payload[0].text,/We decide together/);
      if(req.headers["idempotency-key"]===failedInviteBatch){failedInviteBatch=null;return send({message:"Temporary fixture failure"},500);}
      sentBatches.push(String(req.headers["idempotency-key"]));return send({data:[{id:randomUUID()}]});
    }
    if(url.pathname==="/rest/v1/rpc/queue_engagement_invites") {
      let raw="";for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);if(mode!=="allowed")return send({message:"denied"},403);
      if(!inviteBatches.has(body.p_batch))inviteBatches.set(body.p_batch,{id:body.p_batch,status:"pending",payload:{title:"Room fixture",church:"Fixture church",timezone:"America/Toronto",pre_call_at:null,retreat_start_date:null,retreat_end_date:null,consensus:"We decide together.",people:[{id:roomAttendee,name:"Ann Lee",email:"ann@example.org"}]}});return send(inviteBatches.get(body.p_batch));
    }
    if(url.pathname==="/rest/v1/rpc/import_and_queue_invites"){
      let raw="";for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);if(mode!=="allowed")return send({message:"denied"},403);
      if(!inviteBatches.has(body.p_batch)){
        combinedImports++;
        inviteBatches.set(body.p_batch,{id:body.p_batch,status:"pending",payload:{title:"Room fixture",church:"Fixture church",timezone:"America/Toronto",pre_call_at:null,retreat_start_date:null,retreat_end_date:null,consensus:"We decide together.",people:body.p_people.map((p:{name:string;email:string})=>({id:roomAttendee,name:p.name,email:p.email}))}});
      }
      return send(inviteBatches.get(body.p_batch));
    }
    if(url.pathname==="/rest/v1/rpc/mark_invites_sent") {
      assert.equal(req.headers.apikey,tripwire);let raw="";for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);inviteBatches.get(body.p_batch)!.status="sent";return send(null);
    }
    if(url.pathname==="/rest/v1/rpc/import_attendees") {let raw="";for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);assert.equal(mode,"allowed");return send(body.p_people.length);}
    if (url.pathname === "/emails") {
      let raw="";for await(const chunk of req)raw+=chunk;
      if(process.env.CLEARWAY_SMOKE_HOLD === "1")await delay(2000);
      assert.equal(req.headers.authorization,"Bearer "+tripwire);emails.push(JSON.parse(raw));if(process.env.CLEARWAY_SMOKE_HOLD === "1")console.log("Fixture email: "+JSON.parse(raw).text);return send({id:randomUUID()});
    }
    if (url.pathname === "/auth/v1/admin/generate_link") {
      roomAuthCalls++;let raw="";for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
      assert.equal(req.headers.apikey,tripwire);assert.equal(body.email,"ann@example.org");
      return send({action_link:"unused",email_otp:"unused",hashed_token:"server-only-magic-token",verification_type:"magiclink",id:userId,email:body.email});
    }
    if (url.pathname === "/auth/v1/verify") {
      let raw="";for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
      assert.equal(body.token_hash,"server-only-magic-token");
      return send({access_token:token("room"),refresh_token:"refresh-room",expires_in:3600,token_type:"bearer",user:user("room")});
    }
    if (url.pathname === "/rest/v1/rpc/room_public_info") {
      let raw="";for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
      if(body.p_engagement===practiceRoom)return send({id:practiceRoom,title:"Practice room",type:"practice",church:"Clearway practice",closed:false,howTheRoomDecides:"We decide together.",neutral:false});
      return send(body.p_engagement===roomId ? {id:roomId,church_id:roomId,title:"Room fixture",team_hub_client_id:null,team_hub_engagement_id:null,base_year:2026,lens_names:["Congregation","Community","Leadership","Operations","Learning"],type:"wayfinding",church:"Fixture church",closed:false,howTheRoomDecides:"We decide together.",neutral:false}:null);
    }
    if (url.pathname === "/rest/v1/rpc/room_presence") return send(roomBound?[{attendee_id:roomAttendee,device_count:2,present:true}]:[]);
    if(url.pathname==="/rest/v1/rpc/practice_guest"){
      assert.equal(req.headers.apikey,tripwire);let raw="";for await(const chunk of req)raw+=chunk;const {p}=JSON.parse(raw);if(p.engagement!==practiceRoom)return send({status:"invalid_request"});const device=roomDevices.get(p.device);if(!device||device.proof!==p.proof)return send({status:"device_missing"});practiceName=p.name;device.approved=true;return send({status:"approved"});
    }
    if (url.pathname === "/rest/v1/rpc/room_auth") {
      assert.equal(req.headers.apikey,tripwire);
      let raw="";for await(const chunk of req)raw+=chunk;const {p_action:action,p}=JSON.parse(raw);
      assert.ok([roomId,practiceRoom].includes(p.engagement));const device=roomDevices.get(p.device);
      if(action==="init") {roomDevices.set(p.device,{proof:p.proof,code:p.device_code,approved:false});return send({status:"ready",device_code:p.device_code});}
      if(!device || device.proof!==p.proof)return send({status:"device_missing"});
      if(action==="status")return send({status:[...roomJoins.values()].find(j=>j.device===p.device)?.status||"ready",device_code:device.code,can_claim:device.approved});
      if(action==="send") {
        if(p.email!=="ann@example.org")return send({status:"not_listed"});
        roomChallenges.set(p.challenge,{email:p.email,code:p.code_hash,link:p.link_hash,consumed:false});return send({status:"sent",name:"Ann Lee"});
      }
      if(action==="verify") {
        const challenge=p.challenge ? roomChallenges.get(p.challenge) : [...roomChallenges.values()].reverse().find(c=>c.email===p.email);
        if(!challenge || challenge.consumed || !(challenge.code===p.code_hash || challenge.link===p.link_hash))return send({status:"invalid_code"});
        challenge.consumed=true;device.approved=true;return send({status:"approved"});
      }
      if(action==="prepare_claim") {
        if(!device.approved)return send({status:"waiting"});device.claim=randomUUID();return send({status:"claim",claim:device.claim,email:"ann@example.org",attendee:roomAttendee});
      }
      if(action==="bind") {assert.equal(p.claim,device.claim);assert.equal(p.user,userId);device.approved=false;roomBound=true;return send({status:"signed_in"});}
      if(action==="join") {const id=randomUUID();roomJoins.set(id,{id,device:p.device,email:p.email,name:p.name,status:"pending"});return send({status:"pending"});}
      return send({status:"waiting"});
    }
    if(url.pathname === "/rest/v1/rpc/decide_room_join" || url.pathname === "/rest/v1/rpc/sign_in_room_device") {
      let raw="";for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
      if(mode!=="allowed")return send(false);
      if(body.p_request) {const j=roomJoins.get(body.p_request);if(!j)return send(false);j.status=body.p_approve?"approved":"declined";roomDevices.get(j.device)!.approved=body.p_approve;return send(true);}
      const d=[...roomDevices.values()].find(d=>d.code===body.p_code.replaceAll(" ",""));if(d && body.p_engagement===roomId && body.p_attendee===roomAttendee) {d.approved=true;return send(true);}return send(false);
    }
    return send({ message: "Unexpected fixture route" }, 404);
  });
  await new Promise<void>(resolve => authServer.listen(0, "127.0.0.1", resolve));
  const authAddress = authServer.address();
  assert.ok(authAddress && typeof authAddress !== "string");
  authOrigin = `http://127.0.0.1:${authAddress.port}`;
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, APP_ORIGIN: origin, SUPABASE_URL: authOrigin, SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture", SUPABASE_SERVICE_ROLE_KEY: tripwire, TEAM_HUB_DATABASE_URL: tripwire, RESEND_API_KEY: tripwire, EMAIL_FROM: "Clearway <hello@clearway.co>", RESEND_API_URL: authOrigin },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", chunk => { output += chunk; });
  server.stderr?.on("data", chunk => { output += chunk; });
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch { /* Wait for the production server to bind. */ }
    if (server.exitCode !== null) throw new Error(output);
    await delay(250);
  }
  throw new Error(`Production server did not become ready: ${output}`);
}, { timeout: 30000 });
after(async () => {
  if (process.env.CLEARWAY_SMOKE_HOLD === "1") {
    console.log(`Browser fixture ready at ${origin}; room /room/${roomId}`);
    await new Promise<void>(resolve => process.once("SIGTERM", resolve));
  }
  if (server && server.exitCode === null) {
    const exited = new Promise<void>(resolve => server.once("exit", () => resolve()));
    server.kill("SIGTERM");
    await exited;
  }
  if (authServer) await new Promise<void>(resolve => authServer.close(() => resolve()));
});

for (const [route, heading, surface] of [
  ["/", "Good work begins", "control"],
  ["/sign-in", "Prepare the room.", "control"],
  ["/room", "Your place in the room.", "phone"],
]) {
  test(`${route} serves a complete production page with the correct surface`, async () => {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
    if (route === "/sign-in") assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin", "Native POST forms must preserve their same-origin Origin header");
    const html = await response.text();
    assert.ok(html.includes(heading));
    assert.ok(html.includes(`data-surface="${surface}"`));
    assert.match(html, /lang="en"/);
    assert.match(html, /id="main"/);
    assert.doesNotMatch(html, /maximum-scale|user-scalable=no/);
    assert.ok(!html.includes(tripwire));
  });
}

test("home links lead to real routes", async () => {
  const html = await (await fetch(origin)).text();
  for (const route of ["/sign-in", "/room"]) assert.ok(html.includes(`href="${route}"`));
});

test("unbuilt private and live surfaces serve no engagement data", async () => {
  for (const route of ["/tv", "/remote", "/room/nonexistent"]) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 404, route);
    assert.match(await response.text(), /Check the room link with your facilitator/);
  }
});

test("production CSS and every bundled local font are reachable", async () => {
  const html = await (await fetch(origin)).text();
  const cssPaths = [...html.matchAll(/href="([^\"]+\.css(?:\?[^\"]*)?)"/g)].map(m => m[1].replaceAll("&amp;", "&"));
  assert.ok(cssPaths.length > 0);
  let css = "";
  for (const path of cssPaths) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    css += await response.text();
  }
  assert.ok(css.includes("--cwl-surface"));
  assert.ok(css.includes("Plus Jakarta Sans"));
  const fonts = [...css.matchAll(/url\(["']?([^)'\"]+\.ttf)["']?\)/g)].map(m => m[1]);
  assert.ok(fonts.length >= 5);
  for (const path of new Set(fonts)) {
    const response = await fetch(new URL(path, origin + cssPaths[0]));
    assert.equal(response.status, 200, path);
    assert.ok((await response.arrayBuffer()).byteLength > 1000);
  }
});

test("no secret tripwire is present in browser JS or CSS", async () => {
  async function inspect(dir: string): Promise<void> {
    for (const file of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, file.name);
      if (file.isDirectory()) await inspect(path);
      else if (/\.(js|css)$/.test(path)) assert.ok(!(await readFile(path, "utf8")).includes(tripwire), path);
    }
  }
  await inspect(".next/static");
});


function applyCookies(jar: Map<string, string>, response: Response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(";");
    const index = pair.indexOf("=");
    const name = pair.slice(0, index);
    if (/max-age=0(?:;|$)/i.test(header)) jar.delete(name);
    else jar.set(name, pair.slice(index + 1));
  }
}
function cookieHeader(jar: Map<string, string>) { return [...jar].map(([k,v]) => `${k}=${v}`).join("; "); }
async function startLogin(next = "/setup") {
  const jar = new Map<string,string>();
  const response = await fetch(origin + "/auth/google?next=" + encodeURIComponent(next), {
    method: "POST", headers: { origin }, redirect: "manual",
  });
  assert.equal(response.status, 303);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const target = new URL(response.headers.get("location")!);
  assert.equal(target.origin, authOrigin);
  assert.equal(target.searchParams.get("provider"), "google");
  assert.equal(target.searchParams.get("hd"), "clearway.co");
  assert.equal(target.searchParams.get("prompt"), "select_account");
  assert.equal(target.searchParams.get("login_hint"), null);
  assert.equal(target.searchParams.get("authuser"), null);
  assert.equal(target.searchParams.get("code_challenge_method"), "s256");
  expectedChallenge = target.searchParams.get("code_challenge")!;
  assert.ok(expectedChallenge);
  applyCookies(jar, response);
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/i);
  return { jar, callback: new URL(target.searchParams.get("redirect_to")!) };
}
async function finishLogin(mode: string, next = "/setup") {
  const { jar, callback } = await startLogin(next);
  callback.searchParams.set("code", mode);
  const response = await fetch(callback, { headers: { cookie: cookieHeader(jar) }, redirect: "manual" });
  applyCookies(jar, response);
  return { jar, response };
}

test("signed-out requests and forged middleware headers cannot load private routes", async () => {
  for (const route of ["/setup", "/control", "/setup?_rsc=spoof"]) {
    const response = await fetch(origin + route, { redirect: "manual", headers: { "x-middleware-subrequest": "middleware:middleware:middleware:middleware:middleware" } });
    assert.equal(response.status, 307);
    assert.ok(response.headers.get("location")!.endsWith("/sign-in"));
    assert.doesNotMatch(await response.text(), /Assigned engagement|Test facilitator/);
    assert.match(response.headers.get("cache-control")!, /no-store/);
  }
});

test("OAuth uses PKCE, then a verified allowlist claim opens setup and control", async () => {
  const { jar, response } = await finishLogin("allowed");
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), origin + "/setup");
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.ok(![...jar.keys()].some(k => k.includes("code-verifier")));
  const appCookie = decodeURIComponent(jar.get("cw-facilitator")!);
  assert.ok(appCookie.startsWith("base64-"));
  const sessionJson = Buffer.from(appCookie.slice(7), "base64url").toString();
  assert.doesNotMatch(sessionJson, /provider_token|provider_refresh_token|unused-google/);
  assert.ok(![...jar.keys()].some(k => /^cw-facilitator\.\d+$/.test(k)), "Old provider-token chunks are removed");
  for (const [path, text] of [["/setup", "Assigned engagement"], ["/control", "Prepare your engagement."]]) {
    const page = await fetch(origin + path, { headers: { cookie: cookieHeader(jar) }, redirect: "manual" });
    assert.equal(page.status, 200);
    assert.match(page.headers.get("cache-control")!, /no-store/);
    const html = await page.text();
    assert.ok(html.includes(text));
    assert.ok(!html.includes("refresh-allowed"));
    assert.ok(!html.includes(tripwire));
  }
});

test("unlisted Google, external-domain and participant sessions cannot enter", async () => {
  for (const mode of ["unlisted", "external", "participant"]) {
    const { jar, response } = await finishLogin(mode);
    assert.equal(response.headers.get("location"), origin + "/sign-in?error=access");
    assert.equal(jar.size, 0, mode);
    // Also exercise a directly supplied, valid Auth cookie without the callback.
    const session = { access_token: token(mode), refresh_token: "refresh-"+mode, expires_at: Math.floor(Date.now()/1000)+3600, user: user(mode) };
    const cookie = "cw-facilitator=" + "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
    for (const path of ["/setup", "/control"]) {
      const denied = await fetch(origin + path, { headers: { cookie }, redirect: "manual" });
      assert.equal(denied.status, 307, mode + path);
      assert.doesNotMatch(await denied.text(), /Assigned engagement|Test facilitator/);
    }
  }
  assert.ok(logouts.length >= 3);
  assert.ok(logouts.every(scope => scope === "local"));
});

test("callback fails closed for missing, wrong or cancelled PKCE, and clamps return paths", async () => {
  for (const query of ["", "?code=allowed", "?error=access_denied&error_description=untrusted"]) {
    const response = await fetch(origin + "/auth/callback" + query, { redirect: "manual" });
    assert.equal(response.headers.get("location"), origin + "/sign-in?error=access");
    assert.match(response.headers.get("cache-control")!, /no-store/);
  }
  const failed = await finishLogin("invalid");
  assert.equal(failed.jar.size, 0);
  const { response } = await finishLogin("allowed", "https://evil.example/steal");
  assert.equal(response.headers.get("location"), origin + "/setup");
  const control = await finishLogin("allowed", "/control");
  assert.equal(control.response.headers.get("location"), origin + "/control");
});

test("sign-in and sign-out reject cross-site requests and GET mutations", async () => {
  for (const path of ["/auth/google", "/auth/sign-out"]) {
    for (const attemptedOrigin of ["https://evil.example", "null", ""]) {
      const response = await fetch(origin + path, { method: "POST", headers: { origin: attemptedOrigin }, redirect: "manual" });
      assert.equal(response.status, 403, path + attemptedOrigin);
    }
    assert.equal((await fetch(origin + path, { redirect: "manual" })).status, 405);
  }
});

test("session refresh persists cookies and sign-out revokes only this session", async () => {
  const { jar } = await finishLogin("allowed");
  const stale = { access_token: token("allowed"), refresh_token: "refresh-allowed", expires_at: Math.floor(Date.now()/1000)-100, user: user("allowed") };
  jar.set("cw-facilitator", "base64-" + Buffer.from(JSON.stringify(stale)).toString("base64url"));
  const refreshed = await fetch(origin + "/setup", { headers: { cookie: cookieHeader(jar) }, redirect: "manual" });
  assert.equal(refreshed.status, 200);
  assert.match(refreshed.headers.get("set-cookie")!, /cw-facilitator=/);
  applyCookies(jar, refreshed);
  const signedOut = await fetch(origin + "/auth/sign-out", { method: "POST", headers: { origin, cookie: cookieHeader(jar) }, redirect: "manual" });
  assert.equal(signedOut.status, 303);
  applyCookies(jar, signedOut);
  assert.equal(jar.size, 0);
  assert.equal(logouts.at(-1), "local");
  const denied = await fetch(origin + "/setup", { headers: { cookie: cookieHeader(jar) }, redirect: "manual" });
  assert.equal(denied.status, 307);
  assert.ok(calls.includes("/rest/v1/rpc/claim_clearway_access"));
});

test("a revoked session is rejected even when its cookie has not expired", async () => {
  const session = { access_token: token("revoked"), refresh_token: "refresh-revoked", expires_at: Math.floor(Date.now()/1000)+3600, user: user("revoked") };
  const response = await fetch(origin + "/setup", { redirect: "manual", headers: { cookie: "cw-facilitator=base64-" + Buffer.from(JSON.stringify(session)).toString("base64url") } });
  assert.equal(response.status, 307);
});


test("unsolicited callback errors do not sign out an existing facilitator", async () => {
  const { jar } = await finishLogin("allowed");
  const before = logouts.length;
  const response = await fetch(origin + "/auth/callback?error=access_denied", { headers: { cookie: cookieHeader(jar) }, redirect: "manual" });
  applyCookies(jar, response);
  assert.equal(logouts.length, before);
  const page = await fetch(origin + "/setup", { headers: { cookie: cookieHeader(jar) }, redirect: "manual" });
  assert.equal(page.status, 200);
});


async function roomPost(action: string, jar: Map<string,string>, data: Record<string,unknown> = {}) {
  const response=await fetch(`${origin}/api/room/${roomId}/${action}`,{method:"POST",headers:{origin,cookie:cookieHeader(jar),"Content-Type":"application/json"},body:JSON.stringify(data),redirect:"manual"});
  applyCookies(jar,response);return {response,data:await response.json()};
}
test("phone room projects only public fields and confirmation GET never signs anyone in",async()=>{
  const page=await fetch(`${origin}/room/${roomId}`);assert.equal(page.status,200);const html=await page.text();
  assert.match(html,/Fixture church/);assert.match(html,/Send me a sign-in code/);assert.ok(!html.includes(tripwire));assert.ok(!html.includes("private_note"));
  const jar=new Map<string,string>();const init=await roomPost("init",jar);assert.match(init.data.device_code,/^[A-HJ-NP-Z2-9]{8}$/);
  const sent=await roomPost("send",jar,{email:" Ann@Example.org "});assert.equal(sent.data.status,"sent");
  const email=emails.at(-1)!;assert.deepEqual(email.to,["ann@example.org"]);assert.match(email.text,/\n\n\d{6}\n\n/);assert.doesNotMatch(email.text,/\d{6}\./);assert.doesNotMatch(email.text,/\\n/);
  const digits=email.text.match(/\n\n(\d{6})\n\n/)![1];assert.ok(email.html.includes(`>${digits}</p>`));assert.match(email.html,/font-size:48px/);assert.doesNotMatch(email.html,/<script|onclick=|var\(--/i);
  const link=email.text.match(/http[^\s]+\/confirm[^\s]+/)![0];const before=roomAuthCalls;
  for(let n=0;n<2;n++){const confirm=await fetch(link);assert.equal(confirm.status,200);assert.equal(confirm.headers.get("referrer-policy"),"strict-origin");assert.match(confirm.headers.get("cache-control")!,/no-store/);assert.match(await confirm.text(),/Confirm sign-in/);}
  assert.equal(roomAuthCalls,before);assert.equal(roomChallenges.get(new URL(link).searchParams.get("challenge")!)!.consumed,false);
});
test("six-digit code works on a second device and issues only its own room cookie",async()=>{
  const email=emails.at(-1)!;const code=email.text.match(/\n\n(\d{6})\n\n/)![1];const jar=new Map<string,string>();await roomPost("init",jar);
  const wrong=await roomPost("verify",jar,{email:"ann@example.org",code:code==="000000"?"999999":"000000"});assert.equal(wrong.data.status,"invalid_code");
  const before=roomAuthCalls;const result=await roomPost("verify",jar,{email:"ann@example.org",code});assert.equal(result.data.status,"signed_in");assert.equal(roomAuthCalls,before+1);
  assert.equal(result.data.name,"Ann Lee");assert.equal(result.data.role,"participant");
  assert.ok([...jar.keys()].some(k=>k.startsWith("cw-room-")));assert.ok(![...jar.keys()].some(k=>k.startsWith("cw-facilitator")));
  assert.match(result.response.headers.get("set-cookie")!,/HttpOnly/);assert.ok(!JSON.stringify(result.data).includes("access_token"));
  const status=await fetch(`${origin}/api/room/${roomId}/status`,{headers:{cookie:cookieHeader(jar)}});const own=await status.json();assert.equal(own.name,"Ann Lee");
  const privatePage=await fetch(origin+"/setup",{headers:{cookie:cookieHeader(jar)},redirect:"manual"});assert.equal(privatePage.status,307);
  const denied=await fetch(`${origin}/api/facilitator/${roomId}/door`,{method:"POST",headers:{origin,cookie:cookieHeader(jar),"Content-Type":"application/json"},body:JSON.stringify({action:"manual",attendee:roomAttendee,code:"AAAAAAAA"})});assert.equal(denied.status,401);
  const authBefore=roomAuthCalls,readsBefore=calls.length;
  const restored=await fetch(`${origin}/room/${roomId}`,{headers:{cookie:cookieHeader(jar)}});
  const html=await restored.text();assert.match(html,/You’re in, Ann Lee\./);
  assert.doesNotMatch(html,/<input[^>]+id="(?:room-email|room-code|practice-name)"/);
  assert.match(restored.headers.get("cache-control")!,/private/);assert.match(restored.headers.get("cache-control")!,/no-store/);
  assert.equal(roomAuthCalls,authBefore);assert.ok(!calls.slice(readsBefore).includes("/rest/v1/device_sessions"));
  const initialized=await roomPost("init",jar);assert.equal(initialized.data.status,"signed_in");assert.equal(initialized.data.name,"Ann Lee");
});
test("room refresh renews its own cookie and server-renders the room before JavaScript",async()=>{
  const name=`cw-room-${roomId}`,jar=new Map<string,string>();
  jar.set(name,"base64-"+Buffer.from(JSON.stringify({access_token:token("room"),refresh_token:"refresh-room",expires_at:Math.floor(Date.now()/1000)-100,user:user("room")})).toString("base64url"));
  const refreshed=await fetch(`${origin}/room/${roomId}`,{headers:{cookie:cookieHeader(jar)},redirect:"manual"});
  assert.equal(refreshed.status,200);assert.match(refreshed.headers.get("set-cookie")!,new RegExp(name+"="));
  assert.match(refreshed.headers.get("set-cookie")!,/HttpOnly/);assert.doesNotMatch(refreshed.headers.get("set-cookie")!,/cw-facilitator/);
  const html=await refreshed.text();assert.match(html,/You’re in, Ann Lee\./);assert.doesNotMatch(html,/<input[^>]+id="room-email"/);
  applyCookies(jar,refreshed);assert.equal((await roomPost("init",jar)).data.status,"signed_in");
  for(const [cookieName,mode] of [[name,"revoked"],["cw-facilitator","allowed"],[`cw-room-${practiceRoom}`,"room"]]){
    const session={access_token:token(mode),refresh_token:`refresh-${mode}`,expires_at:Math.floor(Date.now()/1000)+3600,user:user(mode)};
    const denied=await fetch(`${origin}/room/${roomId}`,{headers:{cookie:cookieName+"=base64-"+Buffer.from(JSON.stringify(session)).toString("base64url")}});
    const deniedHtml=await denied.text();assert.doesNotMatch(deniedHtml,/You’re in, Ann Lee\./);assert.match(deniedHtml,/id="room-email"/);
  }
  const before=calls.length;
  const confirm=await fetch(`${origin}/room/${roomId}/confirm?challenge=${randomUUID()}&token=${"a".repeat(64)}`,{headers:{cookie:cookieHeader(jar)}});
  assert.match(await confirm.text(),/Confirm sign-in/);assert.ok(!calls.slice(before).some(path=>path.startsWith("/auth/")||path==="/rest/v1/rpc/room_auth"));
});
test("tap confirmation consumes a fresh link only after a POST",async()=>{
  const jar=new Map<string,string>();await roomPost("init",jar);await roomPost("send",jar,{email:"ann@example.org"});
  const link=new URL(emails.at(-1)!.text.match(/http[^\s]+\/confirm[^\s]+/)![0]);const before=roomAuthCalls;
  const confirm={challenge:link.searchParams.get("challenge"),token:link.searchParams.get("token")};
  const result=await roomPost("confirm",jar,confirm);assert.equal(result.data.status,"signed_in");assert.equal(roomAuthCalls,before+1);
  assert.equal((await roomPost("confirm",jar,confirm)).data.status,"invalid_code");
});
test("unlisted people can ask to join and approval lets their device in",async()=>{
  const jar=new Map<string,string>();const init=await roomPost("init",jar);const before=emails.length;
  assert.equal((await roomPost("send",jar,{email:"guest@example.org"})).data.status,"not_listed");assert.equal(emails.length,before);
  assert.equal((await roomPost("join",jar,{email:"guest@example.org",name:"A guest"})).data.status,"pending");
  const waiting=await (await fetch(`${origin}/api/room/${roomId}/status`,{headers:{cookie:cookieHeader(jar)}})).json();assert.equal(waiting.status,"pending");assert.equal(waiting.device_code,init.data.device_code);assert.ok(!("email" in waiting));
  const {jar:facilitator}=await finishLogin("allowed");const join=[...roomJoins.values()].at(-1)!;
  const approval=await fetch(`${origin}/api/facilitator/${roomId}/door`,{method:"POST",headers:{origin,cookie:cookieHeader(facilitator),"Content-Type":"application/json"},body:JSON.stringify({action:"approve",request:join.id})});assert.equal((await approval.json()).ok,true);
  const approved=await (await fetch(`${origin}/api/room/${roomId}/status`,{headers:{cookie:cookieHeader(jar)}})).json();assert.equal(approved.can_claim,true);
  assert.equal((await roomPost("claim",jar)).data.status,"signed_in");
});
test("manual sign-in by device code requires the facilitator session",async()=>{
  const jar=new Map<string,string>();const init=await roomPost("init",jar);const {jar:facilitator}=await finishLogin("allowed");
  const response=await fetch(`${origin}/api/facilitator/${roomId}/door`,{method:"POST",headers:{origin,cookie:cookieHeader(facilitator),"Content-Type":"application/json"},body:JSON.stringify({action:"manual",attendee:roomAttendee,code:init.data.device_code})});assert.equal((await response.json()).ok,true);
  assert.equal((await roomPost("claim",jar)).data.status,"signed_in");
});
test("room mutations reject cross-site Origin and GET sign-in attempts",async()=>{
  for(const action of ["init","send","verify","join","claim","confirm"]){
    const get=await fetch(`${origin}/api/room/${roomId}/${action}`);assert.equal(get.status,405);
    const cross=await fetch(`${origin}/api/room/${roomId}/${action}`,{method:"POST",headers:{origin:"https://evil.example","Content-Type":"application/json"},body:"{}"});assert.equal(cross.status,403);
  }
});

async function setupPost(jar:Map<string,string>,body:Record<string,unknown>){const response=await fetch(origin+"/api/setup",{method:"POST",headers:{origin,cookie:cookieHeader(jar),"Content-Type":"application/json"},body:JSON.stringify(body)});return {response,data:await response.json()};}
test("setup API enforces facilitator identity, CSRF and admin-only Team Hub discovery",async()=>{
 assert.equal((await setupPost(new Map(),{action:"hub_clients"})).response.status,401);
 const {jar}=await finishLogin("allowed");assert.equal((await setupPost(jar,{action:"hub_clients"})).response.status,403);
 const cross=await fetch(origin+"/api/setup",{method:"POST",headers:{origin:"https://evil.example",cookie:cookieHeader(jar)},body:"{}"});assert.equal(cross.status,403);
 const page=await fetch(origin+`/setup/${roomId}`,{headers:{cookie:cookieHeader(jar)}});assert.equal(page.status,200);assert.match(await page.text(),/Review import|How the room decides/);
});
test("attendee import previews normalize duplicates, then save only reviewed source",async()=>{
 const {jar}=await finishLogin("allowed");const body={id:roomId,source:"paste",text:"Ann Lee <ANN@example.org>\nOther <ann@example.org>"};
 const preview=await setupPost(jar,{...body,action:"preview_import"});assert.equal(preview.data.people.length,1);assert.deepEqual(preview.data.duplicates,["ann@example.org"]);
 const saved=await setupPost(jar,{...body,action:"import"});assert.equal(saved.data.count,1);
});
test("reviewed invite snapshot sends once and retry uses its saved sent status",async()=>{
 const {jar}=await finishLogin("allowed"),batch=randomUUID(),body={id:roomId,batch,attendees:[roomAttendee]};
 const prepared=await setupPost(jar,{...body,action:"prepare_invites"});assert.equal(prepared.data.payload.people[0].email,"ann@example.org");assert.match(prepared.data.preview,/We decide together/);assert.equal(sentBatches.length,0);
 const sent=await setupPost(jar,{...body,action:"invite"});assert.equal(sent.data.ok,true);assert.deepEqual(sentBatches,[batch]);
 const retry=await setupPost(jar,{...body,action:"invite"});assert.equal(retry.data.ok,true);assert.deepEqual(sentBatches,[batch]);
});
test("one add-and-invite request saves recipients and safely retries a failed delivery",async()=>{
 const {jar}=await finishLogin("allowed"),batch=randomUUID(),before=combinedImports;
 const body={action:"import_and_invite",id:roomId,batch,source:"person",person:{name:"Ann Lee",email:" ANN@EXAMPLE.ORG "}};
 assert.equal((await setupPost(new Map(),body)).response.status,401);
 failedInviteBatch=batch;
 assert.equal((await setupPost(jar,body)).response.status,503);assert.equal(combinedImports,before+1);assert.equal(inviteBatches.get(batch)!.status,"pending");
 const retry=await setupPost(jar,body);assert.equal(retry.data.ok,true);assert.equal(retry.data.count,1);assert.equal(combinedImports,before+1);
 assert.equal((await setupPost(jar,body)).data.ok,true);assert.equal(sentBatches.filter(id=>id===batch).length,1);
 const blocked=await setupPost(jar,{...body,batch:randomUUID(),person:{name:"Fictional",email:"person@riverside.example"}});assert.equal(blocked.response.status,400);assert.equal(combinedImports,before+1);
 const sentBefore=sentBatches.length;
 const saved=await setupPost(jar,{action:"import",id:roomId,source:"person",person:{name:"Ann Lee",email:"ann@example.org"}});assert.equal(saved.data.count,1);assert.equal(sentBatches.length,sentBefore);
 const page=await fetch(origin+`/setup/${roomId}`,{headers:{cookie:cookieHeader(jar)}});const html=await page.text();
 assert.match(html,/Add and invite/);assert.match(html,/Add without inviting/);assert.match(html,/Send invite/);assert.doesNotMatch(html,/Review import|Save people/);
});

test("practice phones join with a name and no email, while control remains protected",async()=>{
 const landing=await fetch(origin+"/practice",{redirect:"manual"});assert.ok(landing.headers.get("location")!.endsWith("/room/"+practiceRoom));
 const page=await fetch(origin+"/room/"+practiceRoom);const html=await page.text();assert.match(html,/Join the practice room/);assert.doesNotMatch(html,/id="room-email"/);
 const jar=new Map<string,string>(),before=emails.length;
 async function post(action:string,body:Record<string,unknown>={}){const r=await fetch(`${origin}/api/room/${practiceRoom}/${action}`,{method:"POST",headers:{origin,cookie:cookieHeader(jar),"Content-Type":"application/json"},body:JSON.stringify(body)});applyCookies(jar,r);return r.json();}
 assert.equal((await post("init")).status,"ready");
 const joined=await post("practice",{name:"Practice Alex"});
 assert.deepEqual(joined,{status:"signed_in",name:"Practice Alex",role:"participant"});assert.equal(emails.length,before);
 const status=await (await fetch(`${origin}/api/room/${practiceRoom}/status`,{headers:{cookie:cookieHeader(jar)}})).json();assert.equal(status.name,"Practice Alex");
 const restored=await fetch(origin+"/room/"+practiceRoom,{headers:{cookie:cookieHeader(jar)}});const restoredHtml=await restored.text();
 assert.match(restoredHtml,/You’re in, Practice Alex\./);assert.doesNotMatch(restoredHtml,/<input[^>]+id="practice-name"/);
 assert.equal((await post("init")).status,"signed_in");
 assert.equal((await fetch(origin+"/control",{headers:{cookie:cookieHeader(jar)},redirect:"manual"})).status,307);
});

test("Google sign-in is labelled clearly and cannot preselect a personal account",async()=>{
  const page=await fetch(origin+"/sign-in");const html=await page.text();
  assert.match(html,/>Sign in with Google<\/button>/);assert.doesNotMatch(html,/Continue with Google/);
  const response=await fetch(origin+"/auth/google?login_hint=personal%40gmail.com&authuser=0&prompt=none",{method:"POST",headers:{origin},redirect:"manual"});
  assert.equal(response.status,303);const target=new URL(response.headers.get("location")!);
  assert.equal(target.searchParams.get("prompt"),"select_account");assert.equal(target.searchParams.get("hd"),"clearway.co");
  assert.equal(target.searchParams.get("login_hint"),null);assert.equal(target.searchParams.get("authuser"),null);
});


test("live snapshots page past 1000, restart on version changes and protect transport credentials",async()=>{
  const session={access_token:token("room"),refresh_token:"refresh-room",expires_at:Math.floor(Date.now()/1000)+3600,user:user("room")};
  const cookie=`cw-room-${roomId}=base64-`+Buffer.from(JSON.stringify(session)).toString("base64url");
  liveRestart=true;livePages=0;
  const response=await fetch(`${origin}/api/live/${roomId}?transport=1`,{headers:{cookie}});
  assert.equal(response.status,200);assert.match(response.headers.get("cache-control")!,/private.*no-store/);
  const data=await response.json();assert.equal(data.answers.length,1205);assert.equal(new Set(data.answers.map((x:{id:string})=>x.id)).size,1205);assert.equal(livePages,5);
  assert.equal(data.connection.token,session.access_token);assert.notEqual(data.connection.key,tripwire);assert.ok(!JSON.stringify(data).includes(tripwire));
  const normal=await (await fetch(`${origin}/api/live/${roomId}`,{headers:{cookie}})).json();assert.equal(normal.connection,undefined);
  assert.equal((await fetch(`${origin}/api/live/${roomId}`)).status,403);
  assert.equal((await fetch(`${origin}/api/live/${roomId}?surface=control`,{headers:{cookie}})).status,403);
  assert.equal((await fetch(`${origin}/api/live/${practiceRoom}`,{headers:{cookie}})).status,403);
});
test("live submissions require their participant cookie, origin and valid immutable identity",async()=>{
  const session={access_token:token("room"),refresh_token:"refresh-room",expires_at:Math.floor(Date.now()/1000)+3600,user:user("room")};
  const cookie=`cw-room-${roomId}=base64-`+Buffer.from(JSON.stringify(session)).toString("base64url");
  const body={id:randomUUID(),session:roomId,revision:0,action:"submit",text:"Hope",sentAt:new Date().toISOString()};
  const post=(from:string,value:Record<string,unknown>,auth=cookie)=>fetch(`${origin}/api/live/${roomId}`,{method:"POST",headers:{origin:from,cookie:auth,"Content-Type":"application/json"},body:JSON.stringify(value)});
  const accepted=await post(origin,body);assert.equal(accepted.status,200);assert.equal((await accepted.json()).id,body.id);
  assert.equal((await post("https://other.invalid",body)).status,403);
  assert.equal((await post(origin,body,"")).status,403);
  assert.equal((await post(origin,{...body,id:"invalid"})).status,422);
});


test("run of show and printable notes require a facilitator session and stay private",async()=>{
  for(const path of [`/setup/${roomId}/run-of-show`,`/setup/${roomId}/run-of-show/print`]) {
    const unsigned=await fetch(origin+path,{redirect:"manual"});assert.equal(unsigned.status,307);assert.doesNotMatch(await unsigned.text(),/PRIVATE-PRINT-NOTES/);
  }
  assert.equal((await fetch(origin+`/api/run-of-show/${roomId}`)).status,401);
  const {jar}=await finishLogin("allowed"),headers={cookie:cookieHeader(jar)};
  const page=await fetch(origin+`/setup/${roomId}/run-of-show`,{headers});assert.equal(page.status,200);assert.match(await page.text(),/Add session|Print run of show/);
  const print=await fetch(origin+`/setup/${roomId}/run-of-show/print`,{headers});const html=await print.text();assert.equal(print.status,200);assert.match(html,/PRIVATE-PRINT-NOTES/);assert.match(html,/It is 2036/);assert.match(html,/Phone-only planning depth/);assert.match(print.headers.get("cache-control")!,/no-store/);
  assert.equal((await fetch(origin+`/api/run-of-show/${practiceRoom}`,{headers})).status,403);
});
test("run of show writes validate origin and input and never use a service key",async()=>{
  const {jar}=await finishLogin("allowed"),headers={origin,cookie:cookieHeader(jar),"Content-Type":"application/json"};
  const post=(value:unknown,from=origin)=>fetch(origin+`/api/run-of-show/${roomId}`,{method:"POST",headers:{...headers,origin:from},body:JSON.stringify(value)});
  assert.equal((await post({action:"save"},"https://evil.example")).status,403);
  assert.equal((await post({action:"save",input:{title:"Missing fields"}})).status,422);
  const input={...fixtureSession(randomUUID()),revision:null};
  assert.equal((await post({action:"save",input})).status,200);
  assert.equal((await post({action:"save",input:{...input,title:"Stale overwrite"}})).status,409);
  const current=await (await fetch(origin+`/api/run-of-show/${roomId}`,{headers})).json();assert.equal(current.sessions.find((s:{id:string})=>s.id===input.id).title,input.title);
  assert.equal((await post({action:"remove",input:{id:input.id,revision:0}})).status,200);
});
test("run of show paginates beyond 1000 sessions and retries a changed list without mixing pages",async()=>{
  const {jar}=await finishLogin("allowed");showPaging=true;showRestart=true;showReadPages=0;
  try {
    const response=await fetch(origin+`/api/run-of-show/${roomId}`,{headers:{cookie:cookieHeader(jar)}});assert.equal(response.status,200);
    const show=await response.json();assert.equal(show.sessions.length,1205);assert.equal(new Set(show.sessions.map((s:{id:string})=>s.id)).size,1205);assert.equal(showReadPages,5);
  } finally {showPaging=false;}
});
