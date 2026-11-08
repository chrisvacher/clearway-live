// The AI claim and an answer that commits while it runs (migrations 20261108060000_ai_claim_one_snapshot and
// 20261108070000_claim_one_snapshot_lists_signal).
// The worker's claim writes which answers it has seen; an answer it marks seen must be one the run's inputs hold,
// or the model never reads it and the next claim (the one its own trigger asks for) goes idle. Each trial puts two
// cards on the wall (or two questions in Q&A), starts a claim, and commits one more card a few milliseconds later,
// so it lands before, during or after the claim. The cases are the lens wall and Q&A, the Four Helpful Lists fold and the
// alignment signal. Then the worker claims until idle, as it does after a trigger.
// The late card must have been in some run's inputs. Against the local stack only; it leaves its own rows behind.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";

const versions = JSON.stringify({ combine_words: "combine-words@1", group_wall: "group-wall@1", summarize_wall: "summarize-wall@1", fold_questions: "fold-questions@1", group_lens: "group-lens@1", fold_four_lists: "fold-four-lists@1", alignment_signal: "alignment-signal@1" });
type Claim = { status: string; run?: string; job?: string; inputs?: { answers?: { id: string }[]; questions?: { id: string }[]; columns?: { cards: { id: string }[] }[]; room?: { id: string }[] } };

async function main() {
  const status = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const env = Object.fromEntries([...status.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map(m => [m[1], m[2]]));
  assert.equal(new URL(env.DB_URL).hostname, "127.0.0.1");
  const phone = new pg.Client({ connectionString: env.DB_URL }), worker = new pg.Client({ connectionString: env.DB_URL });
  await phone.connect(); await worker.connect();
  try {
    const church = randomUUID(), room = randomUUID(), person = randomUUID(), wall = randomUUID(), qa = randomUUID(), lists = randomUUID(), signal = randomUUID(), room2 = randomUUID(), person2 = randomUUID();
    await phone.query("insert into public.churches(id,name,timezone) values($1,'Race Church','America/Toronto')", [church]);
    await phone.query(`insert into public.engagements(id,church_id,title,settings) values($1,$2,'AI claim race','{"ai_enabled":true}')`, [room, church]);
    await phone.query("insert into public.attendees(id,engagement_id,name,email,room_role) values($1,$2,'Priya Shah',$3,'participant')", [person, room, `race-${person}@example.org`]);
    await phone.query(`insert into public.sessions(id,engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,max_words) values
      ($1,$3,'Wall','Day 1',0,'wall','What is worth celebrating?','live',20,280,50),($2,$3,'Questions','Day 1',1,'qa','What do you want to ask?','open',20,200,50)`, [wall, qa, room]);
    await phone.query(`insert into public.sessions(id,engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,max_words) values
      ($1,$2,'Four Helpful Lists','Discover',2,'four_lists','Think about our church today.','open',20,140,30)`, [lists, room]);
    // The signal reads only a live step (one a room), and needs an accepted Discover theme, so it has a room of its own.
    await phone.query(`insert into public.engagements(id,church_id,title,settings) values($1,$2,'Signal race','{"ai_enabled":true}')`, [room2, church]);
    await phone.query("insert into public.attendees(id,engagement_id,name,email,room_role) values($1,$2,'Ben Ortiz',$3,'participant')", [person2, room2, `race-${person2}@example.org`]);
    await phone.query(`insert into public.sessions(id,engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,max_words) values
      ($1,$2,'Words','Day 1',0,'word_cloud','One word for our church','live',20,60,5)`, [signal, room2]);
    await phone.query(`insert into private.discover_themes(id,engagement_id,source,label,detail,rests_on,out_of,status) values($1,$2,'survey','Welcoming culture','People feel welcome on a first visit.',60,100,'accepted')`, [randomUUID(), room2]);
    await phone.query("update public.room_states set live_session_id=$2 where engagement_id=$1", [room2, signal]);
    const add = async (session: string, text: string, aged = false) => {
      const id = randomUUID();
      // A Four Helpful Lists card names its column. The signal reads an input 45 seconds after it arrived, so its late card is aged.
      const value = session === lists ? JSON.stringify({ column: "right" }) : null;
      await phone.query(`insert into public.submissions(id,engagement_id,session_id,attendee_id,text,answers,value,phone_sent_at,server_received_at) values($1,$2,$3,$4,$5,jsonb_build_array(jsonb_build_object('key',lower($5::text),'text',$5::text)),$6::jsonb,now(),case when $7::boolean then now()-interval '60 seconds' else now() end)`,
        [id, session === signal ? room2 : room, session, session === signal ? person2 : person, text, value, aged]);
      return id;
    };
    const claim = async (session: string, lease: string) => (await worker.query("select public.ai_claim($1,$2,'claude-test-model',$3::jsonb) as c", [session, lease, versions])).rows[0].c as Claim;
    const read = (c: Claim) => [...(c.inputs?.answers ?? []), ...(c.inputs?.questions ?? []), ...(c.inputs?.columns ?? []).flatMap(col => col.cards), ...(c.inputs?.room ?? [])].map(a => a.id);
    const apply = async (c: Claim, lease: string) => {
      const out = (await worker.query("select public.ai_apply($1,$2,'{\"groups\":[]}'::jsonb,'{\"ms\":10}'::jsonb) as o", [c.run, lease])).rows[0].o as { status: string };
      assert.equal(out.status, "ok", "the worker applies and lets go of the lease");
    };

    // Each case: the session, the cards (the last one is the late card), the job its first claim runs, and how many cards seed a trial.
    const cases = [
      { session: wall, cards: ["Three baptisms at Easter", "Our Alpha course was full", "Teenagers asking to be baptized"], job: "group_wall", seed: 2 },
      { session: qa, cards: ["When does the new building open?", "How much will the building cost?", "When will the new building be ready?"], job: "fold_questions", seed: 2 },
      { session: lists, cards: ["Warm welcome for newcomers", "Preaching that stays practical", "Volunteers who love serving"], job: "fold_four_lists", seed: 2 },
      { session: signal, cards: ["Welcoming", "Generous", "Prayerful", "Warm", "Faithful", "Growing", "Friendly", "Hopeful", "Caring"], job: "alignment_signal", seed: 8 }
    ];
    const failures: string[] = [];
    for (const { session, cards, job, seed } of cases) {
      let stranded = 0, mid = 0;
      const trials = 150;
      for (let t = 0; t < trials; t++) {
        await phone.query("update public.submissions set deleted=true where session_id=$1 and not deleted", [session]);
        await phone.query(`update private.ai_sessions set lease_id=null,lease_run=null,lease_until=null,last_failed_at=null,group_seen_at=null,group_seen_ids='{}',fold_seen_at=null,fold_seen_ids='{}',
          signal_at=null,signal_seen_at=null,signal_seen_ids='{}',signal_phones_seen=false,signal_failed_at=null,signal_lease_id=null,signal_lease_run=null,signal_lease_until=null where session_id=$1`, [session]);
        for (const text of cards.slice(0, seed)) await add(session, text);
        const shown = new Set<string>(), lease = randomUUID(), aged = session === signal;
        // The worker's claim and the last phone's card, at nearly the same moment.
        const [first, late] = await Promise.all([claim(session, lease), delay(Math.random() * 6).then(() => add(session, cards[seed], aged))]);
        assert.equal(first.status, "claimed"); assert.equal(first.job, job);
        read(first).forEach(id => shown.add(id));
        if (!shown.has(late)) mid++;
        await apply(first, lease);
        // The late card's own trigger: the worker claims again until nothing is due.
        for (let i = 0; i < 5; i++) {
          // The signal never runs twice within 10 seconds; let them pass.
          if (session === signal) await phone.query("update private.ai_sessions set signal_at=null where session_id=$1", [session]);
          const again = randomUUID(), next = await claim(session, again);
          if (next.status !== "claimed") { assert.equal(next.status, "idle"); break; }
          read(next).forEach(id => shown.add(id));
          await apply(next, again);
        }
        if (!shown.has(late)) stranded++;
      }
      console.log(`${job}: ${trials} trials, the late card missed the first claim in ${mid}, stranded in ${stranded}`);
      assert.ok(mid > 0, `${job}: some late cards land after the first claim read the answers`);
      if (stranded > 0) failures.push(`${job}: ${stranded} of ${trials} late cards stranded`);
    }
    // Every case reports before the first failure ends the run.
    assert.deepEqual(failures, [], "a card that commits while a claim runs is always in a later run's inputs");
    await phone.query("update public.sessions set state='closed' where id=any($1::uuid[])", [[wall, qa, lists, signal]]);
    console.log("ok · AI claims never mark an answer seen that the run did not read");
  } finally { await phone.end(); await worker.end(); }
}

main().catch(error => { console.error(error); process.exit(1); });
