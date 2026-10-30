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
const roomAttendee = "50000000-0000-4000-8000-000000000011";
const emails: { to: string[]; text: string }[] = [];
const roomDevices = new Map<string,{proof:string;code:string;approved:boolean;claim?:string}>();
const roomChallenges = new Map<string,{email:string;code:string;link:string;consumed:boolean}>();
const roomJoins = new Map<string,{id:string;device:string;email:string;name:string;status:string}>();
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
        if (body.refresh_token !== "refresh-allowed") return send({ message: "Invalid refresh token" }, 400);
      } else if (!body.code_verifier || createHash("sha256").update(body.code_verifier).digest("base64url") !== expectedChallenge || body.auth_code === "invalid") {
        return send({ message: "Invalid PKCE code" }, 400);
      }
      const loginMode = body.auth_code || "allowed";
      return send({ access_token: token(loginMode), refresh_token: "refresh-" + loginMode,
        expires_in: 3600, token_type: "bearer", user: user(loginMode),
        provider_token: "unused-google-provider-secret" + "p".repeat(5000), provider_refresh_token: "unused-google-refresh-secret" });
    }
    if (url.pathname === "/auth/v1/user") return mode === "invalid" || mode === "revoked"
      ? send({ message: "Invalid session" }, 401) : send(user(mode));
    if (url.pathname === "/auth/v1/logout") { logouts.push(url.searchParams.get("scope") || ""); return send({}); }
    if (url.pathname === "/rest/v1/rpc/claim_clearway_access") return send(mode === "allowed");
    if (url.pathname === "/rest/v1/clearway_users") {
      assert.equal(url.searchParams.get("auth_user_id"), "eq." + userId);
      return send(mode === "allowed" ? [profile] : []);
    }
    if (url.pathname === "/rest/v1/engagements") {
      if (url.searchParams.get("id") === "eq." + roomId) return send([{ id:roomId,title:"Room fixture",type:"wayfinding",status:"pre_call",how_the_room_decides:"We decide together.",settings:{neutral_join_message:false,private_note:tripwire},churches:{name:"Fixture church",deleted:false}}]);
      return send([{ id: "engagement-a", title: "Assigned engagement", status: "setup" }]);
    }
    if (url.pathname === "/rest/v1/attendees") return send((mode === "room" && roomBound) || mode === "allowed" ? [{id:roomAttendee,name:"Ann Lee",email:"ann@example.org",room_role:"participant"}] : []);
    if (url.pathname === "/rest/v1/device_sessions") return send([]);
    if (url.pathname === "/rest/v1/join_requests") return send([...roomJoins.values()].filter(j=>url.searchParams.has("id") ? url.searchParams.get("id") === "eq."+j.id : j.status==="pending"));
    if (url.pathname === "/emails") {
      let raw="";for await(const chunk of req)raw+=chunk;
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
      return send(body.p_engagement===roomId ? {id:roomId,title:"Room fixture",type:"wayfinding",church:"Fixture church",closed:false,howTheRoomDecides:"We decide together.",neutral:false}:null);
    }
    if (url.pathname === "/rest/v1/rpc/room_presence") return send(roomBound?[{attendee_id:roomAttendee,device_count:2,present:true}]:[]);
    if (url.pathname === "/rest/v1/rpc/room_auth") {
      assert.equal(req.headers.apikey,tripwire);
      let raw="";for await(const chunk of req)raw+=chunk;const {p_action:action,p}=JSON.parse(raw);
      assert.equal(p.engagement,roomId);const device=roomDevices.get(p.device);
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
  const email=emails.at(-1)!;assert.deepEqual(email.to,["ann@example.org"]);assert.match(email.text,/\n\n/);assert.doesNotMatch(email.text,/\\n/);
  const link=email.text.match(/http[^\s]+\/confirm[^\s]+/)![0];const before=roomAuthCalls;
  for(let n=0;n<2;n++){const confirm=await fetch(link);assert.equal(confirm.status,200);assert.equal(confirm.headers.get("referrer-policy"),"strict-origin");assert.match(confirm.headers.get("cache-control")!,/no-store/);assert.match(await confirm.text(),/Confirm sign-in/);}
  assert.equal(roomAuthCalls,before);assert.equal(roomChallenges.get(new URL(link).searchParams.get("challenge")!)!.consumed,false);
});
test("six-digit code works on a second device and issues only its own room cookie",async()=>{
  const email=emails.at(-1)!;const code=email.text.match(/code is (\d{6})/)![1];const jar=new Map<string,string>();await roomPost("init",jar);
  const wrong=await roomPost("verify",jar,{email:"ann@example.org",code:code==="000000"?"999999":"000000"});assert.equal(wrong.data.status,"invalid_code");
  const before=roomAuthCalls;const result=await roomPost("verify",jar,{email:"ann@example.org",code});assert.equal(result.data.status,"signed_in");assert.equal(roomAuthCalls,before+1);
  assert.ok([...jar.keys()].some(k=>k.startsWith("cw-room-")));assert.ok(![...jar.keys()].some(k=>k.startsWith("cw-facilitator")));
  assert.match(result.response.headers.get("set-cookie")!,/HttpOnly/);assert.ok(!JSON.stringify(result.data).includes("access_token"));
  const status=await fetch(`${origin}/api/room/${roomId}/status`,{headers:{cookie:cookieHeader(jar)}});const own=await status.json();assert.equal(own.name,"Ann Lee");
  const privatePage=await fetch(origin+"/setup",{headers:{cookie:cookieHeader(jar)},redirect:"manual"});assert.equal(privatePage.status,307);
  const denied=await fetch(`${origin}/api/facilitator/${roomId}/door`,{method:"POST",headers:{origin,cookie:cookieHeader(jar),"Content-Type":"application/json"},body:JSON.stringify({action:"manual",attendee:roomAttendee,code:"AAAAAAAA"})});assert.equal(denied.status,401);
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
