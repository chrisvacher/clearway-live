// The load script, run on every pull request against the local stack: a real
// headless TV paired to the practice room, 50 simulated phones in bursts, and
// the latency log's report. Loopback numbers prove the pipeline, not the venue.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, type Browser } from "playwright";
import { describe, practiceRoom, runLoad } from "../../scripts/load-test";
import { verdict } from "../../lib/latency/report";
import { db, facilitator, localEnv, pairTv, press, startApp, until } from "./harness";

async function main() {
  const env = localEnv(), sql = db(env), app = await startApp(env);
  let browser: Browser | undefined;
  try {
    await sql.connect();
    const seeded = (await sql.query("select 1 from public.engagements where id=$1 and not deleted", [practiceRoom])).rowCount;
    assert.equal(seeded, 1, "Run npm run db:seed first: the load test uses the permanent practice room");
    const fac = await facilitator(env, sql, practiceRoom);
    const session = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,max_sends) values($1,$2,'Day 1',900,'word_cloud','One word for this load test','ready',20) returning id`,
      [practiceRoom, `Load test ${randomUUID().slice(0, 6)}`])).rows[0].id as string;
    browser = await chromium.launch();
    const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    await tv.goto(app.origin + "/tv");
    const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(fac, practiceRoom, app.secret, code, "Load test TV");
    await press(fac, sql, practiceRoom, "go_live", { session });
    await tv.locator(".tv-layer.is-input:not(.is-leaving) .tv-board").waitFor({ timeout: 10000 });
    const cookie = fac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
    // Bursts as the PRD means them: 50 phones out, each answering within 10 seconds.
    const result = await runLoad({ origin: app.origin, phones: 50, bursts: 3, gapSeconds: 2, spreadSeconds: 10, reportCookie: cookie });
    console.log(describe(result));
    assert.equal(result.accepted, result.sent, "every simulated answer accepted");
    assert.ok(result.report, "the latency report reads");
    assert.equal(result.report!.measured, result.sent, "every answer reached the TV and was logged");
    assert.ok(verdict(result.report!).met, "95 of 100 under one second on loopback");
    // The extreme, reported rather than gated: 50 phones press Send in the same instant.
    const spike = await runLoad({ origin: app.origin, phones: 50, bursts: 1, spreadSeconds: 0, reportCookie: cookie, log: () => {} });
    assert.equal(spike.accepted, spike.sent, "a spike loses no answers");
    assert.equal(spike.report!.measured, spike.sent, "every spike answer reached the TV");
    console.log(`Spike, 50 in the same instant (not gated): ${verdict(spike.report!).label} 95th ${spike.report!.phone_tv.p95} ms.`);
    await press(fac, sql, practiceRoom, "nothing_live");
    console.log("Load script: 50 simulated phones in 3 bursts plus a spike, measured from the latency log. Loopback only; venue acceptance is the practice-room run.");
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally { await browser?.close(); app.stop(); await sql.end().catch(() => {}); }
}
main().catch(error => { console.error(error); process.exit(1); });
