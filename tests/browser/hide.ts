// Batch 1: hide a response (MD-1) in real browsers against the production build and the local stack. On a live open-text
// step, phones answer; the facilitator taps one in the Responses list and hides it from the TV. The TV's answers rework
// around it with the usual motion and nothing jumps, the people and submissions badges drop it (and the person whose only
// answer it was), the list shows it struck through with who hid it and when, and Show again puts it back everywhere. The
// same steps run in the Novetera skin. Then 50 phones answer a wall in bursts while the facilitator hides answers, and the
// TV's badges end equal to the database's count of shown answers. KIT_SHOTS=<folder> saves a screenshot of each screen.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { joinPhones, practiceRoom, runLoad } from "../../scripts/load-test";
import { db, engagement, facilitator, localEnv, pairTv, press, startApp, until } from "./harness";
import { watcher, type Watch } from "./frame-watch";

async function main() {
  const env = localEnv(), sql = db(env), app = await startApp(env);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(900); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  // The TV's badges, read off the screen once their numbers settle.
  const badges = async (tv: Page) => ({ people: Number(await tv.locator(".tv-top .tv-count-people b").innerText()), sent: Number(await tv.locator(".tv-top .tv-count-sent b").innerText()) });
  const shownCounts = async (session: string) => (await sql.query(`select count(distinct attendee_id)::int people,count(*)::int sent from public.submissions where session_id=$1 and not deleted and not withdrawn and not hidden`, [session])).rows[0] as { people: number; sent: number };
  try {
    await sql.connect();
    browser = await chromium.launch();
    const answers = ["Volunteers who show up early", "Our Alpha course was full", "New families at the kids program", "Three baptisms at Easter", "Young families finding us online", "Pastor never listens"];

    for (const skin of ["clearway", "novetera"] as const) {
      const room = await engagement(sql, []);
      await sql.query(`update public.engagements set type='team_workshop',settings=settings||'{"open_join":true}'${skin === "novetera" ? ",skin='novetera'" : ""} where id=$1`, [room.id]);
      const wall = await room.session("What's working", "wall", "What's working on our team that we should protect?", 1, { maxSends: 5, maxChars: 280 });
      const fac = await facilitator(env, sql, room.id);
      const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
      await tv.goto(app.origin + "/tv");
      const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
      await pairTv(fac, room.id, app.secret, code);
      await press(fac, sql, room.id, "go_live", { session: wall });
      await tv.locator(".tv-layer.is-input:not(.is-leaving) .tv-board").waitFor({ timeout: 15000 });
      const phones = await joinPhones(app.origin, 6, { room: room.id, prefix: "Hide phone" });
      for (const [i, p] of phones.entries()) assert.equal((await p.send(room.id, wall, answers[i])).status, "accepted");
      await until(async () => { const b = await badges(tv); return b.people === 6 && b.sent === 6; }, "six answers on the TV", 10000);
      const facContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await facContext.addCookies(fac.cookies(app.origin));
      const control = await facContext.newPage(); await control.goto(`${app.origin}/control/${room.id}`);
      const list = control.locator("[data-responses]");

      await step(`${skin}: the Responses list shows the live step's answers; tap one, then Hide from the TV`, async () => {
        await list.waitFor({ timeout: 15000 });
        await until(async () => await list.locator(".ctl-resp").count() === 6, "six responses listed", 10000);
        assert.match(await list.innerText(), /6 shown/);
        await tv.evaluate(watcher);
        await tv.evaluate(s => { Object.assign((window as unknown as { __acc: Watch & { sel: string } }).__acc, { sel: s, frames: 0, blank: 0, dim: 0, worst: 0, jumps: [] }); }, ".tv-feed-list > *, .ai-card");
        const row = list.locator(".ctl-resp", { hasText: "Pastor never listens" });
        await row.locator(".ctl-resp-text").click();
        await shot(control, `${skin}-hide-picked-control`);
        await row.getByRole("button", { name: "Hide from the TV" }).click();
        await until(async () => (await sql.query("select hidden from public.submissions where session_id=$1 and text='Pastor never listens'", [wall])).rows[0].hidden === true, "hidden in the database", 5000);
      });

      await step(`${skin}: the TV reworks around it with nothing jumping, and both badges drop it and its only writer`, async () => {
        await until(async () => !(await tv.getByText("Pastor never listens").count()), "gone from the TV", 5000);
        await until(async () => { const b = await badges(tv), d = await shownCounts(wall); return b.people === d.people && b.sent === d.sent && b.sent === 5 && b.people === 5; }, "badges 5 and 5, matching the database", 8000);
        await delay(1500);
        const seen = await tv.evaluate(() => { const a = (window as unknown as { __acc: Watch & { stop: boolean } }).__acc; a.stop = true; return { frames: a.frames, blank: a.blank, jumps: a.jumps.slice() }; });
        assert.ok(seen.frames > 20, "frames were sampled");
        assert.equal(seen.blank, 0, "never blank");
        assert.deepEqual(seen.jumps, [], "nothing jumped");
        await shot(tv, `${skin}-hide-after-tv`);
      });

      await step(`${skin}: the list keeps it, struck through with who hid it and when; Show again puts it back everywhere`, async () => {
        await list.getByRole("tab", { name: "Hidden (1)" }).click();
        const row = list.locator(".ctl-resp.is-hidden", { hasText: "Pastor never listens" });
        await row.waitFor({ timeout: 5000 });
        assert.match(await row.innerText(), /Hidden by \S+ at \d/);
        assert.equal(await row.locator(".ctl-resp-text").evaluate(el => getComputedStyle(el).textDecorationLine), "line-through");
        await shot(control, `${skin}-hide-hidden-control`);
        await row.getByRole("button", { name: "Show again" }).click();
        await until(async () => (await tv.getByText("Pastor never listens").count()) > 0, "back on the TV", 8000);
        await until(async () => { const b = await badges(tv); return b.people === 6 && b.sent === 6; }, "badges back to 6", 8000);
        await until(async () => /Nothing is hidden/.test(await list.innerText()), "the Hidden list empties", 8000);
      });
      await tv.context().close(); await facContext.close();
    }

    await step("50 phones answer a wall in bursts while answers are hidden, and the TV's badges match the database", async () => {
      const seeded = (await sql.query("select 1 from public.engagements where id=$1 and not deleted", [practiceRoom])).rowCount;
      assert.equal(seeded, 1, "Run npm run db:seed first: this run uses the permanent practice room");
      const fac = await facilitator(env, sql, practiceRoom);
      const session = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters) values($1,$2,'Day 1',901,'wall','What should we protect?','ready',10,280) returning id`,
        [practiceRoom, `Hide run ${randomUUID().slice(0, 6)}`])).rows[0].id as string;
      const tv = await (await browser!.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
      await tv.goto(app.origin + "/tv");
      const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
      await pairTv(fac, practiceRoom, app.secret, code, "Hide run TV");
      await press(fac, sql, practiceRoom, "go_live", { session });
      await tv.locator(".tv-layer.is-input:not(.is-leaving) .tv-board").waitFor({ timeout: 10000 });
      const cookie = fac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
      let hiding = true, hidden = 0;
      const hider = (async () => {
        while (hiding) {
          await delay(700);
          const pick = (await sql.query("select id from public.submissions where session_id=$1 and not hidden and not deleted order by random() limit 1", [session])).rows[0]?.id;
          if (pick && hidden < 12) { const r = await press(fac, sql, practiceRoom, "hide", { item: pick }); if (r.status === "ok") hidden++; }
        }
      })();
      const result = await runLoad({ origin: app.origin, phones: 50, bursts: 3, gapSeconds: 2, spreadSeconds: 10, reportCookie: cookie, log: () => {} });
      hiding = false; await hider;
      assert.equal(result.accepted, result.sent, "every answer accepted while hiding");
      assert.ok(hidden >= 5, `answers were hidden during the bursts (${hidden})`);
      const db = await shownCounts(session);
      await until(async () => { const b = await badges(tv); return b.people === db.people && b.sent === db.sent; }, `the TV's badges settle on the database's ${db.people} people and ${db.sent} answers`, 15000);
      assert.equal(db.sent, result.sent - hidden, "the submissions badge is every answer less the hidden ones");
      console.log(`  ${result.sent} answers from 50 phones, ${hidden} hidden; TV and database agree on ${db.people} people and ${db.sent} answers. ${result.report ? `95th ${result.report.phone_tv.p95} ms.` : ""}`);
      await press(fac, sql, practiceRoom, "nothing_live");
      await tv.context().close();
    });
    console.log(`Hide kit: ${passed.length} checks passed. Local checks on loopback.`);
  } finally { await browser?.close(); await app.stop(); await sql.end(); }
}
main().catch(error => { console.error(error); process.exit(1); });
