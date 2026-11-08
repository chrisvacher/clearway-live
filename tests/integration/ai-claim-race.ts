// The AI claim and an answer that commits while it runs (migration 20261108060000_ai_claim_one_snapshot).
// The worker's claim writes which answers it has seen; an answer it marks seen must be one the run's inputs hold,
// or the model never reads it and the next claim (the one its own trigger asks for) goes idle. Each trial puts two
// cards on the wall (or two questions in Q&A), starts a claim, and commits one more card a few milliseconds later,
// so it lands before, during or after the claim. Then the worker claims until idle, as it does after a trigger.
// The late card must have been in some run's inputs. Against the local stack only; it leaves its own rows behind.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";

const versions = JSON.stringify({ combine_words: "combine-words@1", group_wall: "group-wall@1", summarize_wall: "summarize-wall@1", fold_questions: "fold-questions@1", group_lens: "group-lens@1", alignment_signal: "alignment-signal@1" });
type Claim = { status: string; run?: string; job?: string; inputs?: { answers?: { id: string }[]; questions?: { id: string }[] } };

async function main() {
  const status = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const env = Object.fromEntries([...status.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map(m => [m[1], m[2]]));
  assert.equal(new URL(env.DB_URL).hostname, "127.0.0.1");
  const phone = new pg.Client({ connectionString: env.DB_URL }), worker = new pg.Client({ connectionString: env.DB_URL });
  await phone.connect(); await worker.connect();
  try {
    const church = randomUUID(), room = randomUUID(), person = randomUUID(), wall = randomUUID(), qa = randomUUID();
    await phone.query("insert into public.churches(id,name,timezone) values($1,'Race Church','America/Toronto')", [church]);
    await phone.query(`insert into public.engagements(id,church_id,title,settings) values($1,$2,'AI claim race','{"ai_enabled":true}')`, [room, church]);
    await phone.query("insert into public.attendees(id,engagement_id,name,email,room_role) values($1,$2,'Priya Shah',$3,'participant')", [person, room, `race-${person}@example.org`]);
    await phone.query(`insert into public.sessions(id,engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,max_words) values
      ($1,$3,'Wall','Day 1',0,'wall','What is worth celebrating?','live',20,280,50),($2,$3,'Questions','Day 1',1,'qa','What do you want to ask?','open',20,200,50)`, [wall, qa, room]);
    const add = async (session: string, text: string) => {
      const id = randomUUID();
      await phone.query(`insert into public.submissions(id,engagement_id,session_id,attendee_id,text,answers,phone_sent_at) values($1,$2,$3,$4,$5,jsonb_build_array(jsonb_build_object('key',lower($5::text),'text',$5::text)),now())`,
        [id, room, session, person, text]);
      return id;
    };
    const claim = async (session: string, lease: string) => (await worker.query("select public.ai_claim($1,$2,'claude-test-model',$3::jsonb) as c", [session, lease, versions])).rows[0].c as Claim;
    const read = (c: Claim) => [...(c.inputs?.answers ?? []), ...(c.inputs?.questions ?? [])].map(a => a.id);
    const apply = async (c: Claim, lease: string) => {
      const out = (await worker.query("select public.ai_apply($1,$2,'{\"groups\":[]}'::jsonb,'{\"ms\":10}'::jsonb) as o", [c.run, lease])).rows[0].o as { status: string };
      assert.equal(out.status, "ok", "the worker applies and lets go of the lease");
    };

    for (const [session, cards, job] of [[wall, ["Three baptisms at Easter", "Our Alpha course was full", "Teenagers asking to be baptized"], "group_wall"],
      [qa, ["When does the new building open?", "How much will the building cost?", "When will the new building be ready?"], "fold_questions"]] as const) {
      let stranded = 0, mid = 0;
      const trials = 150;
      for (let t = 0; t < trials; t++) {
        await phone.query("update public.submissions set deleted=true where session_id=$1 and not deleted", [session]);
        await phone.query("update private.ai_sessions set lease_id=null,lease_run=null,lease_until=null,last_failed_at=null,group_seen_at=null,group_seen_ids='{}',fold_seen_at=null,fold_seen_ids='{}' where session_id=$1", [session]);
        await add(session, cards[0]); await add(session, cards[1]);
        const shown = new Set<string>(), lease = randomUUID();
        // The worker's claim and the last phone's card, at nearly the same moment.
        const [first, late] = await Promise.all([claim(session, lease), delay(Math.random() * 6).then(() => add(session, cards[2]))]);
        assert.equal(first.status, "claimed"); assert.equal(first.job, job);
        read(first).forEach(id => shown.add(id));
        if (!shown.has(late)) mid++;
        await apply(first, lease);
        // The late card's own trigger: the worker claims again until nothing is due.
        for (let i = 0; i < 5; i++) {
          const again = randomUUID(), next = await claim(session, again);
          if (next.status !== "claimed") { assert.equal(next.status, "idle"); break; }
          read(next).forEach(id => shown.add(id));
          await apply(next, again);
        }
        if (!shown.has(late)) stranded++;
      }
      console.log(`${job}: ${trials} trials, the late card missed the first claim in ${mid}, stranded in ${stranded}`);
      assert.ok(mid > 0, `${job}: some late cards land after the first claim read the answers`);
      assert.equal(stranded, 0, `${job}: a card that commits while a claim runs is always in a later run's inputs`);
    }
    await phone.query("update public.sessions set state='closed' where id=any($1::uuid[])", [[wall, qa]]);
    console.log("ok · AI claims never mark an answer seen that the run did not read");
  } finally { await phone.end(); await worker.end(); }
}

main().catch(error => { console.error(error); process.exit(1); });
