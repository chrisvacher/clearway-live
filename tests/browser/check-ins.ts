// Milestone 7, step 2: the 30, 60 and 90-day check-ins, in real browsers against the production build and the local stack.
// The harness mailbox stands in for Resend, so nothing is emailed anywhere else. CLEARWAY_NOW sets the scheduled run's clock, so the
// app is restarted for each date. CRON_SECRET is set here, in the kit's own environment. KIT_SHOTS=<folder> saves each screen. Local only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, startApp, until } from "./harness";

const secret = `kit-${randomUUID()}`;
const D = { r30: "2027-01-31", r60: "2027-03-02", r90: "2027-04-01" };
const text = { s1: "List every ministry lead and a possible apprentice", s2: "Meet every ministry lead one to one", s3: "Write the apprentice role description", s4: "Invite two baptised members to tell their story",
  g1: "Launch the apprentice pathway", g3: "Welcome every first-time guest by name" };

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  let browser: Browser | undefined, app: Awaited<ReturnType<typeof startApp>> | undefined;
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(700); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png`, fullPage: true }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  // The app, started with this date as its clock (or none) and this cron secret (or none).
  const start = async (now: string | null, withSecret = true) => {
    app?.stop();
    if (now) process.env.CLEARWAY_NOW = now; else delete process.env.CLEARWAY_NOW;
    if (withSecret) process.env.CRON_SECRET = secret; else delete process.env.CRON_SECRET;
    app = await startApp(env, mail.url);
    return app;
  };
  const cron = async (header?: string) => {
    const response = await fetch(`${app!.origin}/api/cron/check-ins`, { headers: header ? { Authorization: header } : {}, cache: "no-store" });
    return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, unknown> };
  };
  try {
    await sql.connect();
    const room = await engagement(sql, ["Priya", "Ben", "Ruth"]);
    for (const [i, full] of ["Priya Shah", "Ben Ortiz", "Ruth Morrison"].entries()) await sql.query("update public.attendees set name=$2 where id=$1", [room.attendees[i].id, full]);
    const [priya, ben, ruth] = room.attendees;
    const marcus = { name: "Marcus Webb", email: `marcus-${randomUUID().slice(0, 6)}@riverside.example` };
    const outcome = (await sql.query("insert into private.vision_outcomes(engagement_id,title,status,confirmed_at,position) values($1,'Leaders raised from within','confirmed',now(),0) returning id", [room.id])).rows[0].id;
    const card = (await sql.query("insert into private.intent_cards(engagement_id,outcome_id,intent) values($1,$2,'Every ministry grows its own leader') returning id", [room.id, outcome])).rows[0].id;
    const addStep = async (t: string, owner: string | null, person: { name: string; email: string } | null, pos: number, due = "2027-02-01") => (await sql.query(
      "insert into private.first_steps(engagement_id,card_id,text,owner_attendee_id,owner_name,owner_email,due_date,position) values($1,$2,$3,$4,$5,$6,$7,$8) returning id",
      [room.id, card, t, owner, person?.name ?? null, person?.email ?? null, due, pos])).rows[0].id as string;
    const addGoal = async (t: string, owner: string, pos: number) => (await sql.query(
      "insert into private.goals(engagement_id,outcome_id,title,owner_attendee_id,end_date,season,position) values($1,$2,$3,$4,'2027-04-30','JAN_APR',$5) returning id", [room.id, outcome, t, owner, pos])).rows[0].id as string;
    const ids = { s1: await addStep(text.s1, priya.id, null, 0), s2: await addStep(text.s2, ben.id, null, 1), s3: await addStep(text.s3, ben.id, null, 2), s4: await addStep("Invite two baptised members to tell their story", null, marcus, 3),
      g1: await addGoal(text.g1, priya.id, 0), g3: await addGoal(text.g3, ruth.id, 1) };
    await addStep("A step nobody owns yet", null, null, 4);
    const fac = await facilitator(env, sql, room.id);
    browser = await chromium.launch();
    const rounds = async () => (await sql.query("select day,due_on::text,status from private.check_in_rounds where engagement_id=$1 order by day", [room.id])).rows as { day: number; due_on: string; status: string }[];
    const people = async (day: number) => (await sql.query("select r.email,r.name,r.send_result,r.opened_at,r.answered_at from private.check_in_recipients r join private.check_in_rounds d on d.id=r.round_id where d.engagement_id=$1 and d.day=$2 order by r.name", [room.id, day])).rows as { email: string; name: string; send_result: string | null; opened_at: Date | null; answered_at: Date | null }[];
    const linkFor = async (email: string, day: number) => (await mail.find(email, new RegExp(`Your ${day}-day check-in`))).match(/\/c\/([A-Za-z0-9_-]+)/)![1];
    const phone = async (token: string) => {
      const ctx: BrowserContext = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage(); await page.goto(`${app!.origin}/c/${token}`);
      return { ctx, page };
    };
    const body = (page: Page) => page.locator("body").innerText();
    const other = (own: string[]) => [...Object.values(text), "Priya", "Ben ", "Ruth", "Marcus", "@example.org", "riverside.example"].filter(t => !own.some(o => o.includes(t) || t.includes(o)));

    await step("Rounds are made when the retreat closes, 30, 60 and 90 days after its last day", async () => {
      assert.equal((await rounds()).length, 0, "none before the retreat closes");
      await sql.query("update public.engagements set status='follow_up',retreat_end_date='2027-01-01' where id=$1", [room.id]);
      assert.deepEqual((await rounds()).map(r => [r.day, r.due_on, r.status]), [[30, D.r30, "scheduled"], [60, D.r60, "scheduled"], [90, D.r90, "scheduled"]]);
      // The scheduled run works on every engagement. Rounds left by an earlier run of this kit or another are put away so the counts here are this room's.
      await sql.query("update private.check_in_rounds set status='off' where engagement_id<>$1 and status in('scheduled','sending')", [room.id]);
    });

    await step("The scheduled route refuses a missing or wrong secret, and when no secret is set", async () => {
      await start("2027-01-30");
      assert.equal((await cron()).status, 401, "no header");
      assert.equal((await cron("Bearer wrong")).status, 401, "wrong secret");
      assert.equal((await cron(secret)).status, 401, "no Bearer");
      await start("2027-01-30", false);
      assert.equal((await cron("Bearer undefined")).status, 401, "no secret set");
      assert.equal((await cron("Bearer ")).status, 401, "empty header, no secret set");
      assert.equal(mail.count, 0, "nothing was sent");
    });

    await step("On other days the scheduled run sends nothing", async () => {
      await start("2027-01-30");
      const out = await cron(`Bearer ${secret}`);
      assert.equal(out.status, 200); assert.equal(out.body.rounds, 0); assert.equal(mail.count, 0);
      assert.ok((await rounds()).every(r => r.status === "scheduled"));
    });

    await step("On the 30-day date it sends one email a person into the harness mailbox, and never to a practice address", async () => {
      await start(D.r30);
      const before = mail.count, out = await cron(`Bearer ${secret}`);
      assert.equal(out.status, 200, JSON.stringify(out.body)); assert.equal(out.body.rounds, 1);
      assert.equal(mail.count - before, 3, "Priya, Ben and Ruth, one each");
      assert.equal(out.body.sent, 3); assert.equal(out.body.practice, 1);
      const got = await people(30);
      assert.deepEqual(got.map(p => [p.name, p.send_result]), [["Ben Ortiz", "sent"], ["Marcus Webb", "practice_address"], ["Priya Shah", "sent"], ["Ruth Morrison", "sent"]]);
      const priyaMail = await mail.find(priya.email, /30-day/), benMail = await mail.find(ben.email, /30-day/), ruthMail = await mail.find(ruth.email, /30-day/);
      assert.ok(priyaMail.includes(text.s1) && priyaMail.includes(text.g1), "Priya's email lists her step and goal");
      for (const t of [text.s2, text.s3, text.s4, text.g3]) assert.ok(!priyaMail.includes(t), `Priya's email does not list: ${t}`);
      assert.ok(benMail.includes(text.s2) && benMail.includes(text.s3) && !benMail.includes(text.s1) && !benMail.includes(text.g1), "Ben's lists only his two steps");
      assert.ok(ruthMail.includes(text.g3) && !/Your first steps/.test(ruthMail), "Ruth, a goal owner with no first step, gets her goal only");
      assert.ok(!/[\u2013\u2014]/.test(priyaMail), "no dashes");
      assert.equal((await rounds())[0].status, "sent");
    });

    await step("A second run the same day sends nothing new", async () => {
      const before = mail.count, out = await cron(`Bearer ${secret}`);
      assert.equal(out.status, 200); assert.equal(out.body.rounds, 0);
      assert.equal(mail.count, before);
      await start(D.r30);
      const again = await cron(`Bearer ${secret}`);
      assert.equal(again.body.rounds, 0); assert.equal(mail.count, before, "nor after a restart");
    });

    const tokens = { priya: await linkFor(priya.email, 30), ben: await linkFor(ben.email, 30), ruth: await linkFor(ruth.email, 30) };

    await step("Phone: Priya sees only her own first step and goal, and every tap saves", async () => {
      const { ctx, page } = await phone(tokens.priya);
      assert.match(await page.title(), /Your check-in/);
      assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex, nofollow");
      await page.getByRole("heading", { name: "Your 30-day check-in" }).waitFor();
      await shot(page, "aft-04-open");
      await page.getByRole("button", { name: "Open my check-in" }).click();
      assert.ok((await body(page)).includes(text.s1));
      await page.getByRole("radio", { name: "Stuck" }).click();
      await until(async () => (await sql.query("select answer from private.check_in_answers where first_step_id=$1", [ids.s1])).rows[0]?.answer === "stuck", "the tap saved", 8000);
      await page.getByLabel("What would help?").fill("I need to know who signs off the role.");
      await until(async () => (await sql.query("select note from private.check_in_answers where first_step_id=$1", [ids.s1])).rows[0]?.note === "I need to know who signs off the role.", "the note saved", 8000);
      await shot(page, "aft-04-stuck");
      await page.getByRole("button", { name: "Next" }).click();
      assert.ok((await body(page)).includes(text.g1));
      await page.getByRole("radio", { name: "At risk" }).click();
      await page.getByLabel("What would help?").first().fill("A second pair of hands in March.");
      await shot(page, "aft-04-goal");
      await page.getByLabel("Anything else that would help?").fill("A call with the elders.");
      await page.getByRole("button", { name: "Send my check-in" }).click();
      await page.getByRole("heading", { name: "Thank you" }).waitFor();
      await shot(page, "aft-04-sent");
      const seen = await body(page);
      for (const t of other([text.s1, text.g1, "Priya"])) assert.ok(!seen.includes(t), `Priya's page does not show: ${t}`);
      assert.deepEqual((await sql.query("select answer from private.check_in_answers where recipient_id=(select id from private.check_in_recipients where email=$1) order by answer", [priya.email])).rows.map(r => r.answer), ["at_risk", "stuck"]);
      assert.equal((await sql.query("select help from private.check_in_recipients where email=$1", [priya.email])).rows[0].help, "A call with the elders.");
      await ctx.close();
    });

    await step("Phone: answers survive a reload, and the page shows what was sent", async () => {
      const { ctx, page } = await phone(tokens.priya);
      await page.getByRole("heading", { name: "You already answered" }).waitFor();
      const seen = await body(page);
      assert.ok(seen.includes(text.s1) && seen.includes("Stuck") && seen.includes("At risk") && seen.includes("I need to know who signs off the role."));
      await shot(page, "aft-04-answered");
      await page.getByRole("button", { name: "Change my answers" }).click();
      assert.equal(await page.getByRole("radio", { name: "Stuck" }).getAttribute("aria-checked"), "true", "the chosen answer is shown");
      await ctx.close();
    });

    await step("Phone: offline, a tap waits on the phone ('Saved on this phone') and goes when the signal is back", async () => {
      const { ctx, page } = await phone(tokens.ben);
      await page.getByRole("button", { name: "Open my check-in" }).click();
      assert.ok((await body(page)).includes(text.s2));
      await ctx.setOffline(true);
      await page.getByRole("radio", { name: "Under way" }).click();
      await page.getByText("Saved on this phone").waitFor();
      await shot(page, "aft-04-saved-on-phone");
      assert.equal((await sql.query("select count(*)::int n from private.check_in_answers where first_step_id=$1", [ids.s2])).rows[0].n, 0, "nothing reached the server");
      assert.ok(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith("cw-ci:") && (localStorage.getItem(k) ?? "").includes("under_way"))), "the tap is kept on the phone");
      await ctx.setOffline(false);
      await until(async () => (await sql.query("select answer from private.check_in_answers where first_step_id=$1", [ids.s2])).rows[0]?.answer === "under_way", "the queued tap was sent when the signal came back", 15000);
      await page.getByText("Saved", { exact: true }).waitFor({ timeout: 10000 });
      assert.ok(await page.evaluate(() => Object.keys(localStorage).every(k => !k.startsWith("cw-ci:"))), "and the phone's copy is cleared");
      await page.goto(`${app!.origin}/c/${tokens.ben}`);
      await page.getByRole("heading", { name: "You already answered" }).waitFor();
      assert.ok(!(await body(page)).includes(text.s1), "Ben's page does not show Priya's step");
      await ctx.close();
    });

    await step("Results: every answer and note, stuck steps as follow-ups, who hasn't answered, and a practice address", async () => {
      await start(D.r30);
      const ctx = await browser!.newContext({ viewport: { width: 1440, height: 1000 } });
      await ctx.addCookies(fac.cookies(app!.origin));
      const page = await ctx.newPage(); await page.goto(`${app!.origin}/control/${room.id}/check-ins`);
      await page.getByRole("heading", { name: "Check-ins", exact: true }).waitFor();
      const main = page.locator("main");
      for (const t of [text.s1, "I need to know who signs off the role.", text.g1, "A second pair of hands in March.", "Stuck", "At risk", "Under way"]) assert.ok((await main.innerText()).includes(t), `results show: ${t}`);
      assert.ok((await main.innerText()).includes("1 to follow up") || (await main.innerText()).includes("2 to follow up"), "follow-ups are counted");
      const waiting = page.locator("section", { has: page.getByRole("heading", { name: /to hear from/ }) });
      assert.ok((await waiting.innerText()).includes("Ruth Morrison") && (await waiting.innerText()).includes("Marcus Webb"), "who hasn't answered");
      assert.ok((await waiting.innerText()).includes("Practice address, not sent"), "the practice address row says so");
      await shot(page, "aft-05-results");
      await page.getByRole("button", { name: "Mark followed up" }).first().click();
      await until(async () => Number((await sql.query("select count(*)::int n from private.check_in_answers where followed_up_at is not null and engagement_id=$1", [room.id])).rows[0].n) === 1, "follow-up saved", 8000);
      await page.getByRole("button", { name: "Followed up" }).first().waitFor();
      await shot(page, "aft-05-followed-up");
      const csv = await ctx.request.get(`${app!.origin}/api/control/${room.id}/check-ins?format=csv`);
      assert.equal(csv.status(), 200);
      const rows = await csv.text();
      assert.ok(rows.includes("Priya Shah,First step,") && rows.includes("Stuck") && rows.includes("Under way"), "the CSV carries the answers");
      // Open as this person: a practice address's own page, with no email.
      const popup = ctx.waitForEvent("page");
      await waiting.getByRole("button", { name: "Open as this person" }).click();
      const opened = await popup; await opened.waitForLoadState();
      await opened.getByRole("heading", { name: "Your 30-day check-in" }).waitFor();
      assert.ok((await opened.locator("body").innerText()).includes("Hi Marcus"));
      await opened.getByRole("button", { name: "Open my check-in" }).click();
      assert.ok((await opened.locator("body").innerText()).includes("Invite two baptised members"), "Marcus's step");
      assert.ok(!(await opened.locator("body").innerText()).includes(text.s1), "and not Priya's");
      // A person who is not a practice address cannot be opened this way.
      const real = (await sql.query("select r.id from private.check_in_recipients r where r.email=$1", [ruth.email])).rows[0].id;
      const refused = await ctx.request.post(`${app!.origin}/api/control/${room.id}/check-ins`, { headers: { Origin: app!.origin }, data: { action: "open_as", recipient: real } });
      assert.equal(refused.status(), 409);
      await ctx.close();
    });

    await step("Phone: a goal owner with no first step answers about the goal only", async () => {
      const { ctx, page } = await phone(tokens.ruth);
      await page.getByRole("button", { name: "Open my check-in" }).click();
      await page.getByRole("heading", { name: "Your goal" }).waitFor();
      assert.ok((await body(page)).includes(text.g3));
      await page.getByRole("radio", { name: "On track" }).click();
      await page.getByRole("button", { name: "Send my check-in" }).click();
      await page.getByRole("heading", { name: "Thank you" }).waitFor();
      assert.match(await body(page), /next one comes by email on Mar 2/);
      await ctx.close();
    });

    await step("The 60-day round: a new email, the 30-day link turns read-only and points to the newest email, progress shows", async () => {
      await start(D.r60);
      const before = mail.count, out = await cron(`Bearer ${secret}`);
      assert.equal(out.body.rounds, 1); assert.equal(mail.count - before, 3);
      assert.equal((await people(60)).length, 4);
      const { ctx, page } = await phone(tokens.priya);
      await page.getByRole("heading", { name: "Your answers" }).waitFor();
      const seen = await body(page);
      assert.ok(seen.includes("can no longer be changed") && seen.includes("Your 60-day check-in is open now"), seen);
      assert.equal(await page.getByRole("button", { name: "Change my answers" }).count(), 0);
      await shot(page, "aft-04-read-only");
      const refused = await fetch(`${app!.origin}/api/check-in`, { method: "POST", headers: { "Content-Type": "application/json", Origin: app!.origin }, body: JSON.stringify({ token: tokens.priya, kind: "step", item: ids.s1, answer: "done", note: null }) });
      assert.equal(refused.status, 409);
      assert.equal((await sql.query("select answer from private.check_in_answers where first_step_id=$1 and recipient_id=(select id from private.check_in_recipients where email=$2 and round_id=(select id from private.check_in_rounds where engagement_id=$3 and day=30))", [ids.s1, priya.email, room.id])).rows[0].answer, "stuck", "the 30-day answer stands");
      await ctx.close();
      const token60 = await linkFor(priya.email, 60);
      const p60 = await phone(token60);
      await p60.page.getByRole("button", { name: "Open my check-in" }).click();
      await p60.page.getByRole("radio", { name: "Under way" }).click();
      await p60.page.getByRole("button", { name: "Next" }).click();
      await p60.page.getByRole("radio", { name: "On track" }).click();
      await p60.page.getByRole("button", { name: "Send my check-in" }).click();
      await p60.page.getByRole("heading", { name: "Thank you" }).waitFor();
      assert.match(await body(p60.page), /next one comes by email on Apr 1/);
      await p60.ctx.close();
      const cx = await browser!.newContext({ viewport: { width: 1440, height: 1100 } });
      await cx.addCookies(fac.cookies(app!.origin));
      const results = await cx.newPage(); await results.goto(`${app!.origin}/control/${room.id}/check-ins`);
      await results.getByRole("tab", { name: "60 days" }).click();
      await results.getByRole("heading", { name: "Since the 30-day check-in" }).waitFor();
      const progress = await results.locator("section", { has: results.getByRole("heading", { name: "Since the 30-day check-in" }) }).innerText();
      assert.ok(progress.includes(text.s1) && progress.includes("Stuck") && progress.includes("Under way"), "Stuck at 30 days, Under way at 60");
      await shot(results, "aft-05-60-days");
      await cx.close();
    });

    await step("The 90-day email thanks them and says the check-ins end here", async () => {
      await start(D.r90);
      const before = mail.count, out = await cron(`Bearer ${secret}`);
      assert.equal(out.body.rounds, 1); assert.equal(mail.count - before, 3);
      const last = await mail.find(priya.email, /90-day/);
      assert.match(last, /Thank you for the work you have put in\. This is the last check-in, so the check-ins end here\./);
      assert.ok(!/next check-in comes/i.test(last));
      const { ctx, page } = await phone(await linkFor(priya.email, 90));
      await page.getByRole("button", { name: "Open my check-in" }).click();
      await page.getByRole("radio", { name: "Done" }).click();
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByRole("radio", { name: "Done" }).last().click();
      await page.getByRole("button", { name: "Send my check-in" }).click();
      await page.getByRole("heading", { name: "Thank you" }).waitFor();
      assert.match(await body(page), /That was the last one, so the check-ins end here/);
      await ctx.close();
    });

    await step("A closed engagement ends every link kindly", async () => {
      await sql.query("update public.engagements set status='closed' where id=$1", [room.id]);
      const { ctx, page } = await phone(tokens.priya);
      await page.getByRole("heading", { name: "This check-in is closed" }).waitFor();
      const seen = await body(page);
      assert.ok(seen.includes("Riverside Church") && !seen.includes(text.s1), "the church is named and nothing of the plan");
      await shot(page, "aft-04-closed");
      const saved = await fetch(`${app!.origin}/api/check-in`, { method: "POST", headers: { "Content-Type": "application/json", Origin: app!.origin }, body: JSON.stringify({ token: tokens.priya, kind: "help", note: "x" }) });
      assert.equal(saved.status, 410);
      await ctx.close();
      await sql.query("update public.engagements set status='follow_up' where id=$1", [room.id]);
    });

    await step("Create check-ins asks for a date, Send now asks inside the panel and says it emails real people", async () => {
      const second = await engagement(sql, ["Dana"]);
      const [dana] = second.attendees;
      await sql.query("update public.attendees set name='Dana Reyes' where id=$1", [dana.id]);
      const outcome2 = (await sql.query("insert into private.vision_outcomes(engagement_id,title,status,confirmed_at,position) values($1,'Outcome','confirmed',now(),0) returning id", [second.id])).rows[0].id;
      await sql.query("insert into private.goals(engagement_id,outcome_id,title,owner_attendee_id,end_date,position) values($1,$2,'Open the second door',$3,'2027-06-30',0)", [second.id, outcome2, dana.id]);
      await sql.query("update public.engagements set status='follow_up' where id=$1", [second.id]);
      const fac2 = await facilitator(env, sql, second.id);
      await start(null);
      const ctx = await browser!.newContext({ viewport: { width: 1440, height: 1000 } });
      await ctx.addCookies(fac2.cookies(app!.origin));
      const page = await ctx.newPage(); await page.goto(`${app!.origin}/control/${second.id}/check-ins`);
      await page.getByRole("heading", { name: "Create check-ins" }).waitFor();
      assert.ok(await page.getByRole("button", { name: "Create check-ins" }).isDisabled(), "needs a date first");
      await shot(page, "aft-05-create");
      await page.getByLabel("Retreat end date").fill("2027-01-01");
      await page.getByRole("button", { name: "Create check-ins" }).click();
      await page.getByRole("tab", { name: "30 days" }).waitFor();
      assert.deepEqual((await sql.query("select day,due_on::text from private.check_in_rounds where engagement_id=$1 order by day", [second.id])).rows.map(r => [r.day, r.due_on]), [[30, D.r30], [60, D.r60], [90, D.r90]]);
      await page.getByRole("button", { name: "Send now" }).click();
      const panel = page.getByRole("group", { name: "Send now" });
      assert.ok((await panel.innerText()).includes("This emails real people"), "the panel says so");
      assert.equal((await sql.query("select status from private.check_in_rounds where engagement_id=$1 and day=30", [second.id])).rows[0].status, "scheduled", "nothing sent yet");
      await shot(page, "aft-05-send-now");
      const untouched = mail.count;
      await panel.getByRole("button", { name: "Cancel" }).click();
      assert.equal(mail.count, untouched, "Cancel sent nothing");
      await page.getByRole("button", { name: "Send now" }).click();
      const before = mail.count;
      await page.getByRole("group", { name: "Send now" }).getByRole("button", { name: "Email them now" }).click();
      await page.getByText(/Sent\. 1 emailed/).waitFor();
      assert.equal(mail.count - before, 1);
      assert.match(await mail.find(dana.email, /30-day/), /Open the second door/);
      assert.equal((await sql.query("select sent_by from private.check_in_rounds where engagement_id=$1 and day=30", [second.id])).rows[0].sent_by.length, 36, "recorded as a facilitator's send");
      await shot(page, "aft-05-sent");
      // Switch off asks inside the panel too, and the sent round stays.
      await page.getByRole("button", { name: "Switch off check-ins" }).click();
      await page.getByRole("group", { name: "Switch off check-ins" }).getByRole("button", { name: "Switch off" }).click();
      await until(async () => (await sql.query("select count(*)::int n from private.check_in_rounds where engagement_id=$1 and status='off'", [second.id])).rows[0].n === 2, "the unsent rounds are off", 8000);
      assert.equal((await sql.query("select status from private.check_in_rounds where engagement_id=$1 and day=30", [second.id])).rows[0].status, "sent");
      await ctx.close();
    });

    console.log(`Check-ins kit: ${passed.length} checks passed.`);
  } catch (error) {
    console.error(app?.output().slice(-3000)); throw error;
  } finally { await browser?.close(); app?.stop(); await mail.close(); await sql.end().catch(() => {}); }
}
main().catch(error => { console.error(error); process.exit(1); });
