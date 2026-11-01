import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { sessionId } from "../../lib/room/policy";

// Native FAC-01/FAC-03 check against disposable loopback Auth, Postgres and
// private Realtime. Two facilitators, a paired TV and a phone; no production data.
async function main() {
  const raw = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const env = Object.fromEntries([...raw.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map(m => [m[1], m[2]]));
  assert.equal(new URL(env.API_URL).hostname, "127.0.0.1"); assert.equal(new URL(env.DB_URL).hostname, "127.0.0.1");
  const db = new Pool({ connectionString: env.DB_URL, max: 4 }), clients: SupabaseClient[] = [], channels: RealtimeChannel[] = [];
  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  async function identity(email: string) {
    const client = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); clients.push(client);
    const generated = await admin.auth.admin.generateLink({ type: "magiclink", email }); assert.equal(generated.error, null);
    const type = generated.data.properties!.verification_type; assert.ok(type === "magiclink" || type === "signup");
    const verified = await client.auth.verifyOtp({ token_hash: generated.data.properties!.hashed_token, type }); assert.equal(verified.error, null);
    return { client, user: verified.data.user!, sid: sessionId(verified.data.session!.access_token)! };
  }
  async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown>) { const { data, error } = await client.rpc(name, args); assert.equal(error, null, name); return data; }
  async function until(check: () => boolean, label: string) { for (let i = 0; i < 150 && !check(); i++) await delay(50); assert.ok(check(), label); }
  async function joined(client: SupabaseClient, topic: string, event: string, on: (payload: Record<string, unknown>) => void) {
    await client.realtime.setAuth();
    const marker = randomUUID(); let ready = false;
    const channel = client.channel(topic, { config: { private: true } }).on("broadcast", { event }, m => on(m.payload)).on("broadcast", { event: "test_ready" }, m => { if (m.payload.marker === marker) ready = true; });
    channels.push(channel);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Private Realtime subscription timed out")), 15000);
      channel.subscribe((value, error) => { if (value === "SUBSCRIBED") { clearTimeout(timer); resolve(); } else if (value === "CHANNEL_ERROR") { clearTimeout(timer); reject(new Error("denied: " + (error?.message || ""))); } });
    });
    for (let i = 0; i < 30 && !ready; i++) { await db.query("select private.live_send($1,'test_ready',$2::jsonb)", [topic, JSON.stringify({ marker })]); await delay(100); }
    assert.ok(ready, "Private Realtime delivery is ready");
  }
  try {
    const room = randomUUID(), church = randomUUID(), [chrisId, jaisyId] = [randomUUID(), randomUUID()], device = randomUUID(), attendee = randomUUID();
    const [chris, jaisy, tv, phone] = await Promise.all([identity(`ctl-chris-${randomUUID()}@clearway.co`), identity(`ctl-jaisy-${randomUUID()}@clearway.co`), identity(`ctl-tv-${randomUUID()}@example.org`), identity(`ctl-phone-${randomUUID()}@example.org`)]);
    await db.query("insert into public.churches(id,name,timezone) values($1,'Native control church','America/Toronto')", [church]);
    await db.query("insert into public.engagements(id,church_id,title,status) values($1,$2,'Native control room','retreat')", [room, church]);
    for (const [f, id, name] of [[chris, chrisId, "Chris Vacher"], [jaisy, jaisyId, "Jaisy Tam"]] as const) {
      await db.query("insert into auth.identities(user_id,provider,provider_id,identity_data) values($1::uuid,'google',$1::uuid::text,jsonb_build_object('email',$2::text,'email_verified',true))", [f.user.id, f.user.email]);
      await db.query("insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),$1,now(),now(),'oauth')", [f.sid]);
      await db.query("insert into public.clearway_users(id,auth_user_id,name,email,team_hub_team_member_id) values($1,$2,$3,$4,gen_random_uuid())", [id, f.user.id, name, f.user.email]);
    }
    await db.query("insert into public.engagement_facilitators(engagement_id,clearway_user_id,role) values($1,$2,'lead'),($1,$3,'co_facilitator')", [room, chrisId, jaisyId]);
    await db.query("insert into private.tv_devices(id,proof,engagement_id,label,paired_at) values($1,repeat('b',64),$2,'Front TV',now())", [device, room]);
    await db.query("insert into private.live_tv_sessions(engagement_id,auth_user_id,auth_session_id,device_id) values($1,$2,$3,$4)", [room, tv.user.id, tv.sid, device]);
    await db.query("insert into public.attendees(id,engagement_id,auth_user_id,name,email,verified_at) values($1,$2,$3,'Native phone',$4,now())", [attendee, room, phone.user.id, phone.user.email]);
    await db.query("insert into public.device_sessions(engagement_id,attendee_id,auth_session_id) values($1,$2,$3)", [room, attendee, phone.sid]);
    const steps = [randomUUID(), randomUUID(), randomUUID()];
    await db.query(`insert into public.sessions(id,engagement_id,part,position,segment,title,interaction,prompt,state,max_sends) values
      ($1,$4,'Day 1',0,'Five Lenses','Five Lenses: Congregation','word_cloud','Congregation','ready',10),($2,$4,'Day 1',1,'Five Lenses','Five Lenses: Community','wall','Community','ready',10),
      ($3,$4,'Day 1',2,'','Celebration','word_cloud','Celebrate','ready',10)`, [...steps, room]);
    await db.query("insert into private.session_notes(session_id,engagement_id,notes) values($1,$2,'NATIVE-CONTROL-NOTES')", [steps[0], room]);

    // Settle the channel generation for this set of sessions before anyone joins.
    await db.query("update public.room_states set results=private.live_results($1) where engagement_id=$1", [room]);
    // Every surface on its own private socket.
    const tvFrame = await rpc(tv.client, "live_snapshot", { p_engagement: room });
    const tvEvents: Record<string, unknown>[] = [], chrisNotices: Record<string, unknown>[] = [], jaisyNotices: Record<string, unknown>[] = [];
    await joined(tv.client, tvFrame.topic, "room", e => tvEvents.push(e));
    const status = await rpc(chris.client, "control_status", { p_engagement: room });
    assert.equal(status.status, "ok"); assert.match(status.fac_topic, /^fac:/);
    await joined(chris.client, status.fac_topic, "fac", e => chrisNotices.push(e));
    await joined(jaisy.client, status.fac_topic, "fac", e => jaisyNotices.push(e));
    await assert.rejects(() => joined(tv.client, status.fac_topic, "fac", () => {}), /denied|timed out/, "The TV cannot join facilitator notices");
    await assert.rejects(() => joined(phone.client, status.fac_topic, "fac", () => {}), /denied|timed out/, "A phone cannot join facilitator notices");
    assert.equal((await rpc(phone.client, "room_control", { p_engagement: room, p_id: randomUUID(), p_action: "next", p: { from: null } })).status, "denied");

    // Chris presses Next on the laptop; the TV moves and Jaisy's remote hears who pressed.
    const press = (who: typeof chris, action: string, p: Record<string, unknown>, id = randomUUID()) => rpc(who.client, "room_control", { p_engagement: room, p_id: id, p_action: action, p }).then(r => ({ ...r, id }));
    const started = Date.now(), first = await press(chris, "next", { from: null });
    assert.equal(first.status, "ok");
    await until(() => tvEvents.some(e => (e.state as { version: number }).version === first.version), "The TV received Go live");
    const moved = tvEvents.find(e => (e.state as { version: number }).version === first.version)!;
    assert.equal((moved.state as { live_session_id: string }).live_session_id, steps[0]);
    assert.ok(!JSON.stringify(moved).includes("Chris") && !JSON.stringify(moved).includes("NATIVE-CONTROL-NOTES"), "Shared event carries no actor or notes");
    const loopback = Date.now() - started;
    await until(() => jaisyNotices.some(n => n.id === first.id && n.by === "Chris"), "The other remote hears who pressed");

    // The TV confirms; both remotes hear it on the private topic.
    assert.equal(await rpc(tv.client, "live_ack", { p_engagement: room, p_version: first.version, p_received: new Date().toISOString(), p_uncertainty: 1, p_answers: [] }), true);
    await until(() => chrisNotices.some(n => n.kind === "ack" && n.screen === device && n.version === first.version), "The remote hears the TV confirmation");
    assert.equal((await rpc(chris.client, "control_status", { p_engagement: room })).screens[0].confirmed_version, first.version);

    // Two remotes press Next at once against the same step: the room moves once.
    const [a, b] = await Promise.all([press(chris, "next", { from: steps[0] }), press(jaisy, "next", { from: steps[0] })]);
    assert.deepEqual([a.status, b.status].sort(), ["moved", "ok"]);
    assert.equal((await db.query("select live_session_id from public.room_states where engagement_id=$1", [room])).rows[0].live_session_id, steps[1]);

    // Late answers inside the segment; the segment closes when the room leaves it.
    const send = (session: string, text: string) => rpc(phone.client, "live_submit", { p_engagement: room, p_id: randomUUID(), p_session: session, p_revision: 0, p_action: "submit", p_text: text, p_sent: new Date().toISOString(), p_uncertainty: 1 });
    assert.equal((await send(steps[0], "Hope")).status, "accepted", "Phone answers an earlier step in the segment");
    const burst = await press(jaisy, "start_burst", { from: steps[1], minutes: 3 });
    assert.equal(burst.status, "ok");
    await db.query("update public.room_states set burst_ends_at=now()-interval '1 second' where engagement_id=$1", [room]);
    const tick = await rpc(tv.client, "live_tick", { p_engagement: room });
    assert.equal(tick.status, "ended");
    await until(() => tvEvents.some(e => (e.state as { version: number; phones_down: boolean }).version === tick.version && (e.state as { phones_down: boolean }).phones_down), "Phones go down on the TV when the burst ends");
    await until(() => chrisNotices.some(n => n.action === "burst_ended"), "Remotes hear the burst end");
    assert.equal((await send(steps[1], "Late")).status, "closed", "Phones down locks the live step");
    assert.equal((await send(steps[0], "Courage")).status, "accepted", "An earlier step in the segment still takes answers");
    assert.equal((await press(chris, "next", { from: steps[1] })).status, "ok");
    assert.equal((await send(steps[0], "After")).status, "closed", "Leaving the segment closes it");

    // Hide a word on the live step: it leaves the TV event.
    assert.equal((await send(steps[2], "Joy, Peace")).status, "accepted");
    const hidden = await press(chris, "hide", { from: steps[2], item: "joy" });
    await until(() => tvEvents.some(e => (e.state as { version: number }).version === hidden.version), "The TV hears the hide");
    const hideEvent = tvEvents.find(e => (e.state as { version: number }).version === hidden.version)!;
    assert.deepEqual(((hideEvent.state as { results: { words: { key: string }[] } }).results.words).map(w => w.key), ["peace"]);

    // Removing Jaisy's assignment removes her private status and notices.
    await db.query("update public.engagement_facilitators set deleted=true where engagement_id=$1 and clearway_user_id=$2", [room, jaisyId]);
    assert.equal((await rpc(jaisy.client, "control_status", { p_engagement: room })).status, "denied");
    assert.equal((await press(jaisy, "nothing_live", { from: steps[2] })).status, "denied");
    console.log(`Native controls: private facilitator notices, TV confirmation (${loopback} ms Go live on loopback), simultaneous remotes, segment late answers, server burst end, word hiding and assignment revocation passed. Venue acceptance remains separate.`);
  } finally {
    for (const channel of channels) await channel.unsubscribe();
    for (const client of clients) client.realtime.disconnect();
    await db.end();
  }
}
main().catch(error => { console.error(error); process.exit(1); });
