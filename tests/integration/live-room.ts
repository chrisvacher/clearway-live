import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { subscribeLive } from "../../lib/live/stream";
import type { LiveSnapshot } from "../../lib/live/types";
import { sessionId } from "../../lib/room/policy";

async function main() {
  const status = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const env = Object.fromEntries([...status.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map(m => [m[1], m[2]]));
  assert.equal(new URL(env.API_URL).hostname, "127.0.0.1");
  assert.equal(new URL(env.DB_URL).hostname, "127.0.0.1");
  const db = new Pool({ connectionString: env.DB_URL, max: 4 });
  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const clients: SupabaseClient[] = [];
  async function identity(label: string) {
    const client = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); clients.push(client);
    const generated = await admin.auth.admin.generateLink({ type: "magiclink", email: `live-${label}-${randomUUID()}@${label === "fac" ? "clearway.co" : "example.org"}` });
    assert.equal(generated.error, null);
    const type = generated.data.properties!.verification_type; assert.ok(type === "magiclink" || type === "signup");
    const verified = await client.auth.verifyOtp({ token_hash: generated.data.properties!.hashed_token, type });
    assert.equal(verified.error, null); assert.ok(verified.data.session); assert.ok(verified.data.user);
    return { client, user: verified.data.user, session: sessionId(verified.data.session.access_token)!, token: verified.data.session.access_token };
  }
  const channels: RealtimeChannel[] = [];
  const subscriptions: (() => void)[] = [];
  async function joined(client: SupabaseClient, topic: string, room: (value: Record<string, unknown>) => void, rekey: () => void = () => {}) {
    await client.realtime.setAuth();
    const channel = client.channel(topic, { config: { private: true, broadcast: { ack: true } } }).on("broadcast", { event: "room" }, event => room(event.payload)).on("broadcast", { event: "rekey" }, rekey);
    channels.push(channel);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Private Realtime subscription timed out")), 15000);
      channel.subscribe((value,error) => { if (value === "SUBSCRIBED") { clearTimeout(timer); resolve(); } else if (value === "CHANNEL_ERROR") { clearTimeout(timer); reject(new Error("Private Realtime subscription denied: "+(error?.message||"no reason"))); } });
    });
    return channel;
  }
  async function until(check: () => boolean, message: string) {
    for (let attempt = 0; attempt < 150 && !check(); attempt++) await delay(100);
    assert.ok(check(), message);
  }
  try {
    const room = randomUUID(), church = randomUUID(), session = randomUUID(), attendee = randomUUID(), tvId = randomUUID();
    const [phone, tv, outsider] = await Promise.all([identity("phone"), identity("tv"), identity("outsider")]);
    await db.query("insert into public.churches(id,name,timezone) values($1,'Disposable live test','America/Toronto')", [church]);
    await db.query("insert into public.engagements(id,church_id,title,status) values($1,$2,'Disposable live room','pre_call')", [room, church]);
    await db.query("insert into public.attendees(id,engagement_id,auth_user_id,name,email,verified_at) values($1,$2,$3,'Native phone',$4,now())", [attendee, room, phone.user.id, phone.user.email]);
    await db.query("insert into public.device_sessions(engagement_id,attendee_id,auth_session_id) values($1,$2,$3)", [room, attendee, phone.session]);
    await db.query("insert into private.live_tv_sessions(id,engagement_id,auth_user_id,auth_session_id) values($1,$2,$3,$4)", [tvId, room, tv.user.id, tv.session]);
    await db.query("insert into public.sessions(id,engagement_id,title,state,max_sends) values($1,$2,'Word cloud','live',100)", [session, room]);
    await db.query("insert into private.session_notes(session_id,engagement_id,notes) values($1,$2,'NATIVE-PRESENTER-SECRET')", [session, room]);
    await db.query("update public.room_states set live_session_id=$1,tv_content='session' where engagement_id=$2", [session, room]);
    const initial = await tv.client.rpc("live_snapshot", { p_engagement: room }); assert.equal(initial.error, null); assert.equal(initial.data.role, "tv");
    const events: Record<string, unknown>[] = [], revokedEvents: Record<string, unknown>[] = []; let rekeys = 0;
    await joined(tv.client, initial.data.topic, event => { if ((event.state as {version:number}).version>initial.data.version) events.push(event); }, () => { rekeys++; });
    const phoneChannel = await joined(phone.client, initial.data.topic, event => revokedEvents.push(event));
    await assert.rejects(() => joined(outsider.client, initial.data.topic, () => {}), /denied|timed out/);
    const payload = { p_engagement: room, p_session: session, p_revision: 0, p_action: "submit", p_text: "Hope", p_sent: new Date().toISOString(), p_uncertainty: 1 };
    const send = async (id: string) => { const r = await phone.client.rpc("live_submit", { ...payload, p_id: id }); assert.equal(r.error, null); return r.data; };
    const firstId = randomUUID(), accepted = await send(firstId); assert.equal(accepted.status, "accepted");
    await until(() => events.some(e => (e.answer as { id: string } | undefined)?.id === firstId), "Committed answer reached the actual private WebSocket");
    const firstEvent = events.find(e => (e.answer as { id: string } | undefined)?.id === firstId)!;
    assert.ok(!JSON.stringify(firstEvent).includes(attendee)); assert.ok(!JSON.stringify(firstEvent).includes("NATIVE-PRESENTER-SECRET"));
    assert.equal((await send(firstId)).status, "duplicate");
    const ids = Array.from({ length: 50 }, () => randomUUID());
    const batch = await Promise.all(ids.map(send)); assert.ok(batch.every(x => x.status === "accepted"));
    await until(() => events.length >= 51, "50 simultaneous requests all reached Realtime");
    const versions = events.map(e => (e.state as { version: number }).version);
    assert.equal(new Set(versions).size, 51); assert.deepEqual(versions, [...versions].sort((a,b) => a-b));
    const spoof = await phoneChannel.send({ type: "broadcast", event: "room", payload: { forged: true } }); assert.notEqual(spoof, "ok");
    assert.ok(!events.some(e => e.forged));
    assert.equal((await outsider.client.rpc("live_snapshot", { p_engagement: room })).data.status, "denied");
    assert.deepEqual((await tv.client.from("submissions").select("id,attendee_id")).data, []);
    const ack = await tv.client.rpc("live_ack", { p_engagement: room, p_version: accepted.version, p_received: new Date().toISOString(), p_uncertainty: 2, p_answers: [{ id: firstId, revision: 0 }] });
    assert.equal(ack.error, null); assert.equal(ack.data, true);
    assert.equal((await db.query("select count(*)::integer as n from private.latency_logs where tv_session_id=$1", [tvId])).rows[0].n, 1);
    // Use a fresh snapshot to test pagination beyond the native Data API cap.
    await db.query("insert into public.submissions(id,engagement_id,session_id,attendee_id,text,answers,phone_sent_at) select gen_random_uuid(),$1,$2,$3,'Team','[{\"text\":\"Team\",\"key\":\"team\"}]',now() from generate_series(1,1205)", [room, session, attendee]);
    await db.query("update public.room_states set results=private.live_results($1) where engagement_id=$1", [room]);
    let cursor: string | null = null, version: number | null = null, count = 0;
    do { const r: {data: LiveSnapshot | null; error: unknown} = await tv.client.rpc("live_snapshot", { p_engagement: room, p_after: cursor, p_version: version }); assert.equal(r.error, null); assert.ok(r.data); assert.equal(r.data.status, "ok"); count += r.data.answers.length; cursor = r.data.next; version = r.data.version; } while(cursor);
    assert.equal(count, 1256);
    // Keep the revoked socket open. Only the harmless rekey notice may reach it.
    await delay(500); const before = revokedEvents.length;
    await db.query("update public.device_sessions set revoked_at=now() where auth_session_id=$1", [phone.session]);
    await db.query("update public.room_states set phones_down=true where engagement_id=$1", [room]);
    await until(() => rekeys > 0, "Access change issued a rekey notification");
    await delay(500); assert.equal(revokedEvents.length, before);
    const renewed = await tv.client.rpc("live_snapshot", { p_engagement: room }); assert.equal(renewed.error, null); assert.notEqual(renewed.data.topic, initial.data.topic);
    assert.equal((await phone.client.rpc("live_snapshot", { p_engagement: room })).data.status, "denied");
    const restored: Record<string, unknown>[] = []; await joined(tv.client, renewed.data.topic, event => restored.push(event));
    const adapterEvents: Record<string, unknown>[] = [];
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("Production receive adapter timed out")),15000);
      subscriptions.push(subscribeLive({...renewed.data,connection:{url:env.API_URL,key:env.ANON_KEY,token:tv.token}},
        event=>{if(event.state.version>renewed.data.version)adapterEvents.push(event);},()=>{},connected=>{if(connected){clearTimeout(timer);resolve();}}));
    });
    await db.query("update public.room_states set phones_down=false where engagement_id=$1", [room]);
    await until(() => restored.length === 1, "Active TV resumed on the rotated private channel");
    await until(() => adapterEvents.length === 1, "Production receive adapter authenticated before joining");
    // Native authorizations and a real WebSocket verify explicit Save reaches the room.
    const facilitator=await identity("fac"),facId=randomUUID();
    await db.query("insert into auth.identities(user_id,provider,provider_id,identity_data) values($1,'google',$1::text,jsonb_build_object('email',$2::text,'email_verified',true))",[facilitator.user.id,facilitator.user.email]);
    await db.query("insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),$1,now(),now(),'oauth')",[facilitator.session]);
    await db.query("insert into public.clearway_users(id,auth_user_id,name,email) values($1,$2,'Native facilitator',$3)",[facId,facilitator.user.id,facilitator.user.email]);
    await db.query("insert into public.engagement_facilitators(engagement_id,clearway_user_id,role) values($1,$2,'lead')",[room,facId]);
    await db.query("update public.device_sessions set revoked_at=null where auth_session_id=$1",[phone.session]);
    await db.query("update public.room_states set phones_down=false where engagement_id=$1",[room]);
    const saveStart=await tv.client.rpc("live_snapshot",{p_engagement:room});assert.equal(saveStart.error,null);
    const savedEvents:Record<string,unknown>[]=[];await joined(tv.client,saveStart.data.topic,event=>savedEvents.push(event));
    const show=await facilitator.client.rpc("show_read",{p_engagement:room});assert.equal(show.error,null);assert.equal(show.data.status,"ok");
    const edit={...show.data.sessions[0],prompt:"Saved {base year + 10}",phone_depth:"Depth {base year + 3}",notes:"SAVED-NOTES-SECRET"};
    const started=Date.now();
    const saved=await facilitator.client.rpc("show_write",{p_engagement:room,p_action:"save",p_input:edit});assert.equal(saved.error,null);assert.equal(saved.data.status,"ok");
    await until(()=>savedEvents.length===1,"Saved prompt reached native private WebSocket");
    const deliveryMs=Date.now()-started;
    assert.equal((savedEvents[0].session as {prompt:string}).prompt,"Saved 2036");assert.ok(!JSON.stringify(savedEvents).includes("SAVED-NOTES-SECRET"));assert.ok(!JSON.stringify(savedEvents).includes("Depth 2029"));
    const depth=await phone.client.rpc("live_snapshot",{p_engagement:room});assert.equal(depth.data.phone_depth,"Depth 2029");
    assert.equal((await tv.client.rpc("show_read",{p_engagement:room})).data.status,"denied");
    const conflicts=await Promise.all([1,2].map(n=>facilitator.client.rpc("show_write",{p_engagement:room,p_action:"save",p_input:{...edit,revision:edit.revision+1,title:"Concurrent edit "+n}})));
    assert.deepEqual(conflicts.map(x=>x.data.status).sort(),["conflict","ok"]);
    await db.query("insert into public.sessions(engagement_id,title,position) select $1,'Planning row '||n,n from generate_series(1,1205)n",[room]);
    let showAfter:string|null=null,showVersion:string|null=null,showCount=0;
    do {const page: {data:{status:string;sessions:unknown[];next:string|null;version:string}|null;error:unknown}=await facilitator.client.rpc("show_read",{p_engagement:room,p_after:showAfter,p_version:showVersion});assert.equal(page.error,null);assert.ok(page.data);assert.equal(page.data.status,"ok");showCount+=page.data.sessions.length;showAfter=page.data.next;showVersion=page.data.version;}while(showAfter);
    assert.equal(showCount,1206);
    // Deterministic lock race: closing starts while an edit owns the room lock.
    // Closing must wait before locking sessions, otherwise editor/close deadlock.
    const editorConnection=await db.connect(),closingConnection=await db.connect();
    try {
      await editorConnection.query("begin");
      await editorConnection.query("select 1 from public.room_states where engagement_id=$1 for update",[room]);
      const closingPid=(await closingConnection.query("select pg_backend_pid() as pid")).rows[0].pid;
      const closeInProgress=closingConnection.query("update public.engagements set status='closed' where id=$1",[room]);
      let closingWaits=false;
      for(let i=0;i<30;i++) {closingWaits=(await db.query("select wait_event_type='Lock' as waiting from pg_stat_activity where pid=$1",[closingPid])).rows[0]?.waiting===true;if(closingWaits)break;await delay(20);}
      assert.ok(closingWaits,"Closing waits behind the active editor's room lock");
      const claims=JSON.parse(Buffer.from(facilitator.token.split(".")[1],"base64url").toString());
      await editorConnection.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(claims)]);
      await editorConnection.query("set local role authenticated");
      const currentEdit=(await editorConnection.query("select public.show_read($1) as value",[room])).rows[0].value.sessions.find((s:{id:string})=>s.id===session);
      const finalSave=await editorConnection.query("select public.show_write($1,'save',$2) as value",[room,JSON.stringify({...currentEdit,title:"Saved while closing"})]);
      assert.equal(finalSave.rows[0].value.status,"ok");await editorConnection.query("commit");await closeInProgress;
      assert.equal((await db.query("select status from public.engagements where id=$1",[room])).rows[0].status,"closed");
      assert.equal((await facilitator.client.rpc("show_write",{p_engagement:room,p_action:"save",p_input:edit})).data.status,"closed");
    } finally {await editorConnection.query("rollback");editorConnection.release();closingConnection.release();}
    console.log(`Native run of show: Save broadcast received in ${deliveryMs} ms on loopback, anonymous TV projection, private phone depth, concurrent-save/close protection and 1206-session paging passed. Venue acceptance remains separate.`);
    console.log("Native live engine: private WebSocket delivery, 50 concurrent writes, ordered versions, deduplication, anti-spoofing, anonymous payloads, 1256-row pagination, latency receipts and revocation rotation passed. This is not the venue latency acceptance test.");
  } finally {
    for(const stop of subscriptions)stop();
    await Promise.all(clients.map(client => client.removeAllChannels()));
    await db.end();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
