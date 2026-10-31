import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
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
    const generated = await admin.auth.admin.generateLink({ type: "magiclink", email: `live-${label}-${randomUUID()}@example.org` });
    assert.equal(generated.error, null);
    const type = generated.data.properties!.verification_type; assert.ok(type === "magiclink" || type === "signup");
    const verified = await client.auth.verifyOtp({ token_hash: generated.data.properties!.hashed_token, type });
    assert.equal(verified.error, null); assert.ok(verified.data.session); assert.ok(verified.data.user);
    return { client, user: verified.data.user, session: sessionId(verified.data.session.access_token)! };
  }
  const channels: RealtimeChannel[] = [];
  async function joined(client: SupabaseClient, topic: string, room: (value: Record<string, unknown>) => void, rekey: () => void = () => {}) {
    const channel = client.channel(topic, { config: { private: true, broadcast: { ack: true } } }).on("broadcast", { event: "room" }, event => room(event.payload)).on("broadcast", { event: "rekey" }, rekey);
    channels.push(channel);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Private Realtime subscription timed out")), 15000);
      channel.subscribe(value => { if (value === "SUBSCRIBED") { clearTimeout(timer); resolve(); } else if (value === "CHANNEL_ERROR") { clearTimeout(timer); reject(new Error("Private Realtime subscription denied")); } });
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
    await joined(tv.client, initial.data.topic, event => events.push(event), () => { rekeys++; });
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
    await db.query("update public.room_states set phones_down=false where engagement_id=$1", [room]);
    await until(() => restored.length === 1, "Active TV resumed on the rotated private channel");
    console.log("Native live engine: private WebSocket delivery, 50 concurrent writes, ordered versions, deduplication, anti-spoofing, anonymous payloads, 1256-row pagination, latency receipts and revocation rotation passed. This is not the venue latency acceptance test.");
  } finally {
    await Promise.all(clients.map(client => client.removeAllChannels()));
    await db.end();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
