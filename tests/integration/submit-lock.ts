// The room lock and what may run beside a phone's answer (migration 20261109070000_four_lists_submit_load).
// Two real connections, one holding the room lock the way another writer does:
//   1. A lens summary vote that waits behind the lock while the facilitator shows a new version (or signs the lens off)
//      is judged against the new state when it gets the lock: it comes back stale and nothing is stored. This fails if
//      the vote's check ever runs before the lock, which is what moving the parse ahead of the lock would do.
//   2. An answer that waits while the person is removed from the room is refused and not stored.
//   3. The follow-up status poll every open control surface makes reads without the lock, so it never queues behind a
//      room full of answers; a status that has a lapsed grant to sweep, and every write, still wait for the lock.
// Against the local stack only; it leaves its own rows behind.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { createClient } from "@supabase/supabase-js";
import { sessionId } from "../../lib/room/policy";

async function main() {
  const status = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const env = Object.fromEntries([...status.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map(m => [m[1], m[2]]));
  assert.equal(new URL(env.API_URL).hostname, "127.0.0.1");
  assert.equal(new URL(env.DB_URL).hostname, "127.0.0.1");
  const db = new Pool({ connectionString: env.DB_URL, max: 6 });
  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  async function identity(label: string) {
    const client = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const generated = await admin.auth.admin.generateLink({ type: "magiclink", email: `lock-${label}-${randomUUID()}@${label === "fac" ? "clearway.co" : "example.org"}` });
    assert.equal(generated.error, null);
    const type = generated.data.properties!.verification_type; assert.ok(type === "magiclink" || type === "signup");
    const verified = await client.auth.verifyOtp({ token_hash: generated.data.properties!.hashed_token, type });
    assert.equal(verified.error, null); assert.ok(verified.data.session); assert.ok(verified.data.user);
    return { client, user: verified.data.user, session: sessionId(verified.data.session.access_token)! };
  }
  // Waits until a backend running this function is blocked on a lock, so the order of events is deterministic.
  async function blocked(fn: string) {
    for (let i = 0; i < 100; i++) {
      const row = (await db.query("select 1 from pg_stat_activity where wait_event_type='Lock' and query ilike $1 and pid<>pg_backend_pid()", [`%${fn}%`])).rowCount;
      if (row) return;
      await delay(20);
    }
    assert.fail(`${fn} never waited on a lock`);
  }
  const holders: { query: (sql: string) => Promise<unknown>; release: () => void }[] = [];
  const pending = <T>(promise: PromiseLike<T>) => { const state = { done: false }; const settled = Promise.resolve(promise).then(v => { state.done = true; return v; }); return { state, settled }; };

  try {
    const room = randomUUID(), church = randomUUID(), step = randomUUID(), person = randomUUID(), person2 = randomUUID(), summary = randomUUID(), v1 = randomUUID(), v2 = randomUUID(), facId = randomUUID();
    const [phone, phone2, fac] = await Promise.all([identity("phone"), identity("phone2"), identity("fac")]);
    await db.query("insert into public.churches(id,name,timezone) values($1,'Lock race church','America/Toronto')", [church]);
    await db.query("insert into public.engagements(id,church_id,title,status) values($1,$2,'Lock race','retreat')", [room, church]);
    for (const [id, who, label] of [[person, phone, "Priya Shah"], [person2, phone2, "Ben Ortiz"]] as const) {
      await db.query("insert into public.attendees(id,engagement_id,auth_user_id,name,email,verified_at) values($1,$2,$3,$4,$5,now())", [id, room, who.user.id, label, who.user.email]);
      await db.query("insert into public.device_sessions(engagement_id,attendee_id,auth_session_id) values($1,$2,$3)", [room, id, who.session]);
    }
    await db.query("insert into auth.identities(user_id,provider,provider_id,identity_data) values($1::uuid,'google',$1::uuid::text,jsonb_build_object('email',$2::text,'email_verified',true))", [fac.user.id, fac.user.email]);
    await db.query("insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),$1,now(),now(),'oauth')", [fac.session]);
    await db.query("insert into public.clearway_users(id,auth_user_id,name,email,team_hub_team_member_id) values($1,$2,'Lock facilitator',$3,gen_random_uuid())", [facId, fac.user.id, fac.user.email]);
    await db.query("insert into public.engagement_facilitators(engagement_id,clearway_user_id,role) values($1,$2,'lead')", [room, facId]);
    await db.query(`insert into public.sessions(id,engagement_id,title,part,position,interaction,prompt,state,options,max_sends,max_characters,max_words)
      values($1,$2,'Lens summary','Day 1',0,'lens_summary','Does this say it?','live','{"lens":1}',3,140,30)`, [step, room]);
    await db.query("insert into private.lens_summaries(id,engagement_id,lens,state) values($1,$2,1,'on_screen')", [summary, room]);
    await db.query("insert into private.lens_summary_versions(id,engagement_id,summary_id,version,author,shown_at) values($1,$2,$3,1,'facilitator',now()),($4,$2,$3,2,'facilitator',null)", [v1, room, summary, v2]);
    await db.query("update private.lens_summaries set current_version_id=$2 where id=$1", [summary, v1]);
    await db.query("update public.room_states set live_session_id=$2,phones_down=false where engagement_id=$1", [room, step]);

    const vote = (who: typeof phone, id: string, version: string) => who.client.rpc("live_submit", { p_engagement: room, p_id: id, p_session: step, p_revision: 0, p_action: "submit", p_text: "Approve",
      p_value: { version, response: "approve" }, p_sent: new Date().toISOString(), p_uncertainty: 1 });
    const holdRoomLock = async () => {
      const holder = await db.connect(); holders.push(holder);
      await holder.query("begin");
      await holder.query("select 1 from public.room_states where engagement_id=$1 for update", [room]);
      return holder;
    };
    const stored = async (id: string) => (await db.query("select count(*)::integer as n from public.submissions where id=$1", [id])).rows[0].n as number;

    // The vote on the version on screen is taken (so a stale result below is the check, not a broken setup).
    const first = await vote(phone, randomUUID(), v1);
    assert.equal(first.error, null); assert.equal(first.data.status, "accepted", "a vote on the version on screen is accepted");

    // 1a. A vote waits behind the lock while the facilitator shows version 2: stale, and nothing stored.
    const staleId = randomUUID();
    let holder = await holdRoomLock();
    let waiting = pending(vote(phone2, staleId, v1));
    await blocked("live_submit");
    assert.equal(waiting.state.done, false, "the vote waits for the room lock");
    await holder.query("update private.lens_summary_versions set shown_at=now() where id=$1", [v2]);
    await holder.query("update private.lens_summaries set current_version_id=$2 where id=$1", [summary, v2]);
    await holder.query("commit"); holder.release();
    const staleVote = await waiting.settled;
    assert.equal(staleVote.error, null);
    assert.equal(staleVote.data.status, "stale", "a vote checked against version 1 is stale once version 2 is on screen");
    assert.equal(await stored(staleId), 0, "a stale vote is not stored");
    assert.equal((await db.query("select count(*)::integer as n from private.lens_summary_responses where version_id=$1 and attendee_id=$2", [v1, person2])).rows[0].n, 0, "and no response is written for the old version");

    // 1b. A vote waits behind the lock while the lens is signed off: stale, nothing stored.
    const signedId = randomUUID();
    holder = await holdRoomLock();
    waiting = pending(vote(phone2, signedId, v2));
    await blocked("live_submit");
    await holder.query("update private.lens_summaries set state='signed_off',signed_off_version_id=$2 where id=$1", [summary, v2]);
    await holder.query("commit"); holder.release();
    const afterSignOff = await waiting.settled;
    assert.equal(afterSignOff.data.status, "stale", "a vote that waited through the sign-off is stale");
    assert.equal(await stored(signedId), 0, "and is not stored");
    await db.query("update private.lens_summaries set state='on_screen',signed_off_version_id=null where id=$1", [summary]);

    // 2. A person removed from the room while their answer waits gets no answer in.
    const goneId = randomUUID();
    holder = await holdRoomLock();
    waiting = pending(vote(phone2, goneId, v2));
    await blocked("live_submit");
    await holder.query("update public.device_sessions set revoked_at=now() where auth_session_id=$1", [phone2.session]);
    await holder.query("update public.attendees set deleted=true where id=$1", [person2]);
    await holder.query("commit"); holder.release();
    const removed = await waiting.settled;
    assert.equal(removed.data.status, "denied", "an answer from a person removed while it waited is denied");
    assert.equal(await stored(goneId), 0, "and is not stored");

    // 3. The follow-up status poll does not queue behind the room lock; a lapsed grant to sweep, and every write, still do.
    const poll = () => fac.client.rpc("followup_manage", { p_engagement: room, p_action: "status", p: {} });
    holder = await holdRoomLock();
    const fast = await Promise.race([poll(), delay(2000).then(() => "waited" as const)]);
    assert.notEqual(fast, "waited", "a status poll with nothing to sweep does not wait for the room lock");
    assert.equal((fast as { data: { status: string } }).data.status, "ok");
    const writing = pending(fac.client.rpc("followup_manage", { p_engagement: room, p_action: "revoke", p: {} }));
    await blocked("followup_manage");
    assert.equal(writing.state.done, false, "a write waits for the room lock");
    await holder.query("commit"); holder.release();
    assert.equal((await writing.settled).data.status, "missing", "and answers once it has the lock");
    await db.query("insert into private.followup_access(engagement_id,attendee_id,email,session_ids,token_hash,code_hash,opens_at,closes_at,issued_by) values($1,$2,'priya@example.org',array[$3::uuid],$4,$4,now()-interval '3 hours',now()-interval '1 hour',$5)",
      [room, person, step, randomBytes(32).toString("hex"), facId]);
    holder = await holdRoomLock();
    const sweeping = pending(poll());
    await blocked("followup_manage");
    assert.equal(sweeping.state.done, false, "a status with a lapsed grant to sweep waits for the room lock");
    await holder.query("commit"); holder.release();
    assert.equal((await sweeping.settled).data.status, "ok");
    assert.ok((await db.query("select swept_at from private.followup_access where engagement_id=$1", [room])).rows[0].swept_at, "the sweep ran once it had the lock");
    const quiet = await Promise.race([poll(), delay(2000).then(() => "waited" as const)]);
    assert.notEqual(quiet, "waited", "after the sweep the poll is lock-free again");

    console.log("Room lock: a lens summary vote that waited through a new version or a sign-off came back stale and unstored, a removed person's waiting answer was denied, and the follow-up status poll no longer queues behind the room lock.");
  } finally {
    // A failed check must not leave a connection holding the lock.
    for (const h of holders) { await h.query("rollback").catch(() => {}); try { h.release(); } catch { /* Already released. */ } }
    await db.end();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
