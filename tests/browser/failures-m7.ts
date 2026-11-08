// The failure kit, extended to milestone 7 (step 6). tests/browser/failures.ts runs these checks after milestone 6's (`npm run test:browser`), in the same
// browser, against the same production build and local stack, with the scripted fake AI model (never the API) and the harness mailbox for email, on the
// seeded Riverside engagement. Each check breaks something on purpose with an after-the-retreat surface on screen and proves it recovers the way the PRD says:
//   FAIL-09 AI slow and failing on draft_report: the page says so, a finished section can be read and written beside, the facilitator writes by hand, Try again works;
//   FAIL-09 AI slow and failing on draft_visibility_plan: the page says so, a row is added by hand, Try again works and nothing written is lost;
//   a revoked link: the plain page at once, on a page that was already open too;
//   the scheduled check-in run without the secret (401, nothing sent) and called twice the same day (one email each, never a second);
//   FAIL-01 on the check-in phone: answers saved on the phone offline, sent once when the signal is back.
// KIT_SHOTS=<folder> saves each failure state. Local only: no real email, Team Hub or CORE.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import type { Browser, Page } from "playwright";
import { controlFile } from "./failures-m3";
import { facilitator, type Env, type mailbox, type startApp } from "./harness";
import { until } from "./harness";
import type pg from "pg";

// The "taking longer than usual" notices appear after this long; the kit shortens it. The scheduled run's secret and clock are the kit's own.
const cronSecret = `kit-${randomUUID()}`;
Object.assign(process.env, { CLEARWAY_AI_REPORT_SLOW_MS: "2500", CLEARWAY_AI_PLAN_SLOW_MS: "2500", CRON_SECRET: cronSecret, CLEARWAY_NOW: "2027-12-31" });
const fake = (value: { delayMs?: number; fail?: boolean }) => writeFileSync(controlFile, JSON.stringify(value));
const room = "90000000-0000-4000-8000-000000000011";
type Kit = { env: Env; sql: pg.Client; mail: Awaited<ReturnType<typeof mailbox>>; app: Awaited<ReturnType<typeof startApp>>; browser: Browser;
  step: (name: string, run: () => Promise<void>) => Promise<void>; shot: (page: Page, name: string) => Promise<void> };

export async function milestone7Failures({ env, sql, mail, app, browser, step, shot }: Kit) {
  fake({});
  const before = (await sql.query("select settings,status::text as status,day2_closed_at from public.engagements where id=$1 and not deleted", [room])).rows[0];
  assert.ok(before, "Run npm run db:seed first: the milestone 7 failure checks use the seeded Riverside engagement");
  const saved = { roles: (await sql.query("select clearway_user_id,role::text from public.engagement_facilitators where engagement_id=$1 and not deleted", [room])).rows as { clearway_user_id: string; role: string }[],
    sessions: (await sql.query("select id,state,closed_at from public.sessions where engagement_id=$1 and not deleted", [room])).rows as { id: string; state: string; closed_at: string | null }[],
    attendees: (await sql.query("select id,email from public.attendees where engagement_id=$1", [room])).rows as { id: string; email: string }[],
    goals: (await sql.query("select id,owner_email from private.goals where engagement_id=$1", [room])).rows as { id: string; owner_email: string | null }[],
    steps: (await sql.query("select id,owner_email from private.first_steps where engagement_id=$1", [room])).rows as { id: string; owner_email: string | null }[] };
  const wipe = async () => {
    await sql.query("select private.vp_clear($1::uuid,false)", [room]);
    await sql.query("select private.rp_clear($1::uuid,false)", [room]);
    await sql.query("update private.report_rounds set deleted=true where engagement_id=$1", [room]);
    await sql.query("delete from private.report_sign_offs where engagement_id=$1", [room]);
    await sql.query("select private.check_in_clear($1::uuid)", [room]);
    await sql.query("delete from private.read_only_links where engagement_id=$1", [room]);
    await sql.query("update public.engagements set day2_closed_at=null where id=$1", [room]);
  };
  const poke: NodeJS.Timeout[] = [], quieted = new Map<string, string>();
  let kitUser: string | undefined;
  try {
    // The seed's owner addresses end in .example, which are never emailed. For these checks they are example.org, and the mailbox is the harness's.
    await sql.query("update public.attendees set email=regexp_replace(email,'\\.example$','.example.org') where engagement_id=$1", [room]);
    await sql.query("update private.goals set owner_email=regexp_replace(owner_email,'\\.example$','.example.org') where engagement_id=$1 and owner_email is not null", [room]);
    await sql.query("update private.first_steps set owner_email=regexp_replace(owner_email,'\\.example$','.example.org') where engagement_id=$1 and owner_email is not null", [room]);
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}', status='retreat' where id=$1", [room]);
    const fac = await facilitator(env, sql, room);
    kitUser = (await sql.query("select id from public.clearway_users where auth_user_id=$1", [fac.session.user.id])).rows[0].id as string;
    await sql.query("update public.engagement_facilitators set role='co_facilitator' where engagement_id=$1 and clearway_user_id<>$2 and not deleted", [room, kitUser]);
    await sql.query("update public.engagement_facilitators set role='lead' where engagement_id=$1 and clearway_user_id=$2", [room, kitUser]);
    await wipe();
    const context = await browser.newContext({ viewport: { width: 1360, height: 1500 } });
    await context.addCookies(fac.cookies(app.origin));
    const page = await context.newPage();
    const secs = async () => (await sql.query("select key,status from private.report_sections where engagement_id=$1 and not deleted order by position", [room])).rows as { key: string; status: string }[];
    const body = page.getByTestId("rpt-body");
    const open = async (key: string) => { await page.getByTestId(`rpt-section-${key}`).click(); await page.locator(`[data-testid="rpt-body"][data-key="${key}"]`).waitFor(); };
    const skipPause = (table: string) => { poke.push(setInterval(() => { sql.query(`update private.${table} set last_failed_at=now()-interval '5 minutes' where engagement_id=$1 and not deleted and status='pending'`, [room]).catch(() => {}); }, 600)); };
    const stopPoking = () => { poke.splice(0).forEach(clearInterval); };

    // ---------- FAIL-09 on the report ----------
    await step("FAIL-09 on draft_report: AI slow, then failing; the page says so, a finished section can be read and written beside, a section is written by hand, and Try again works", async () => {
      fake({ delayMs: 6000 });
      await page.goto(`${app.origin}/control/${room}/report`);
      await page.getByTestId("rpt-draft").waitFor({ timeout: 20000 });
      await page.getByTestId("rpt-draft").click();
      await page.getByTestId("rpt-grid").waitFor({ timeout: 30000 });
      await page.getByTestId("rpt-slow").waitFor({ timeout: 20000 });
      assert.match(await page.getByTestId("rpt-slow").innerText(), /taking longer than usual/);
      await shot(page, "fail-09-m7-report-slow");
      // A section that is done can be read and written beside while the rest are still being drafted.
      const done = await until(async () => { const s = await secs(); return s.some(x => x.status === "drafted") && s.some(x => x.status === "drafting") ? s.find(x => x.status === "drafted")!.key : null; }, "one section is done while the rest are still drafting", 40000);
      await open(done);
      await body.getByTestId("rpt-sentence").first().waitFor({ timeout: 15000 });
      await body.getByTestId("rpt-add-own").click();
      await body.getByTestId("rpt-add-text").fill("Our own read, written while the draft was slow.");
      await body.getByTestId("rpt-add-save").click();
      await body.getByTestId("rpt-sentence").filter({ hasText: "written while the draft was slow" }).waitFor({ timeout: 10000 });
      fake({ fail: true }); skipPause("report_rounds");
      await until(async () => { const s = await secs(); return s.length === 14 && s.every(x => x.status !== "drafting"); }, "the round gives up and moves on", 120000);
      stopPoking();
      const attention = (await secs()).filter(s => s.status === "needs_attention").map(s => s.key);
      assert.ok(attention.length >= 1, `a section the model failed on says Needs attention (${attention})`);
      await page.getByTestId(`rpt-status-${attention[0]}`).getByText("Needs attention").waitFor({ timeout: 15000 });
      await open(attention[0]);
      await page.getByTestId("rpt-attention").waitFor({ timeout: 10000 });
      assert.match(await page.getByTestId("rpt-attention").innerText(), /could not draft this section/i);
      assert.match(await page.getByTestId("rpt-attention").innerText(), /write the section yourself/i, "it says the section can be written by hand");
      await shot(page, "fail-09-m7-report-failed");
      // By hand: the facilitator writes the section's words, and they stand.
      await body.getByTestId("rpt-add-own").click();
      await body.getByTestId("rpt-add-text").fill("Written by hand while AI was down.");
      await body.getByTestId("rpt-add-save").click();
      await body.getByTestId("rpt-sentence").filter({ hasText: "Written by hand while AI was down." }).waitFor({ timeout: 10000 });
      assert.equal((await sql.query(`select count(*)::int n from private.report_sentences x join private.report_sections s on s.id=x.section_id where s.engagement_id=$1 and s.key=$2 and not x.deleted and x.origin='facilitator'`, [room, attention[0]])).rows[0].n, 1);
      // The model comes back: Try again drafts it, and the words written by hand are kept.
      fake({});
      const retryAt = new Date().toISOString();
      await body.getByTestId("rpt-redraft").click();
      await page.getByTestId("rpt-ask-yes").waitFor({ timeout: 8000 }).then(() => page.getByTestId("rpt-ask-yes").click(), () => {});
      await until(async () => (await sql.query("select count(*)::int n from private.report_rounds where engagement_id=$1 and not deleted and status='ready' and requested_at>=$2", [room, retryAt])).rows[0].n >= 1, "Try again runs", 60000);
      await until(async () => (await sql.query(`select count(*)::int n from private.report_sentences x join private.report_sections s on s.id=x.section_id where s.engagement_id=$1 and s.key=$2 and not x.deleted and x.origin='ai'`, [room, attention[0]])).rows[0].n >= 1, "the model's sentences are back", 60000);
      assert.match(await body.innerText(), /Written by hand while AI was down\./, "and the facilitator's words stayed");
    });

    // ---------- FAIL-09 on the visibility plan ----------
    await step("FAIL-09 on draft_visibility_plan: AI slow, then failing; the page says so, a row is added by hand, nothing written is lost, and Try again works", async () => {
      fake({ delayMs: 6000 });
      await page.goto(`${app.origin}/control/${room}/plan`);
      await page.getByTestId("vp-draft").waitFor({ timeout: 20000 });
      await page.getByTestId("vp-draft").click();
      await page.getByTestId("vp-slow").waitFor({ timeout: 20000 });
      assert.match(await page.getByTestId("vp-slow").innerText(), /taking longer than usual/);
      await shot(page, "fail-09-m7-plan-slow");
      await page.getByTestId("vp-add").click();
      await page.getByTestId("vp-add-stage").selectOption("board");
      await page.getByTestId("vp-add-who").fill("The volunteers");
      await page.getByTestId("vp-add-hear").fill("What changes for them in the first year.");
      await page.getByTestId("vp-add-save").click();
      await page.getByTestId("vp-row").filter({ has: page.locator(".who b", { hasText: "The volunteers" }) }).waitFor({ timeout: 10000 });
      await until(async () => (await sql.query("select status from private.visibility_plan_rounds where engagement_id=$1 and not deleted", [room])).rows[0]?.status === "ready", "the slow draft still lands", 60000);
      await page.getByTestId("vp-slow").waitFor({ state: "detached", timeout: 15000 });
      const mine = async () => (await sql.query("select count(*)::int n from private.visibility_plan_rows where engagement_id=$1 and not deleted and who='The volunteers' and origin='facilitator'", [room])).rows[0].n as number;
      assert.equal(await mine(), 1, "the row written while it was slow stands");
      fake({ fail: true }); skipPause("visibility_plan_rounds");
      await page.getByTestId("vp-draft").click();
      await page.getByTestId("vp-ask-yes").click();
      await page.getByTestId("vp-failed").waitFor({ timeout: 60000 });
      stopPoking();
      assert.match(await page.getByTestId("vp-failed").innerText(), /couldn’t draft the plan/);
      assert.match(await page.getByTestId("vp-status").innerText(), /Needs attention/);
      assert.equal(await mine(), 1, "nothing written is lost");
      await shot(page, "fail-09-m7-plan-failed");
      await page.getByTestId("vp-add-by-hand").click();
      await page.getByTestId("vp-add-stage").selectOption("staff");
      await page.getByTestId("vp-add-who").fill("The staff team");
      await page.getByTestId("vp-add-hear").fill("What we will do together this season.");
      await page.getByTestId("vp-add-save").click();
      await page.getByTestId("vp-row").filter({ has: page.locator(".who b", { hasText: "The staff team" }) }).waitFor({ timeout: 10000 });
      fake({});
      const retryAt = new Date().toISOString();
      await page.getByTestId("vp-try-again").click();
      await page.getByTestId("vp-ask-yes").waitFor({ timeout: 5000 }).then(() => page.getByTestId("vp-ask-yes").click(), () => {});
      await until(async () => (await sql.query("select count(*)::int n from private.ai_runs where engagement_id=$1 and job='draft_visibility_plan' and status='ok' and created_at>=$2", [room, retryAt])).rows[0].n >= 1, "Try again drafts the plan", 60000);
      await page.getByTestId("vp-failed").waitFor({ state: "detached", timeout: 30000 });
      await until(async () => !/Needs attention/.test(await page.getByTestId("vp-status").innerText()), "the plan no longer needs attention", 30000);
      assert.equal(await mine(), 1, "and the row written by hand is still there");
      fake({});
    });

    // ---------- A revoked link ----------
    await step("A revoked link shows the plain page at once, on a page that was already open too", async () => {
      await sql.query("update public.engagements set status='follow_up' where id=$1", [room]);
      await sql.query("select private.retreat_close($1::uuid,now())", [room]);
      await page.goto(`${app.origin}/control/${room}/share`);
      await page.getByTestId("share-name").fill("Elders");
      await page.getByTestId("share-make").click();
      await page.getByTestId("share-url").waitFor({ timeout: 15000 });
      const link = (await page.getByTestId("share-url").innerText()).trim();
      const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const open1 = await phone.newPage(); await open1.goto(link); await open1.getByTestId("ro-page").waitFor({ timeout: 20000 });
      await page.reload();
      await page.getByTestId("share-revoke").first().click();
      await page.getByTestId("share-revoke-yes").click();
      await until(async () => (await sql.query("select revoked_at from private.read_only_links where name='Elders' and engagement_id=$1", [room])).rows[0]?.revoked_at, "turned off", 10000);
      await open1.reload();
      await open1.getByTestId("ro-gone").waitFor({ timeout: 10000 });
      assert.match(await open1.locator("body").innerText(), /This link isn’t available/);
      assert.ok(!(await open1.locator("body").innerText()).includes("Riverside"), "nothing about the plan");
      const fresh = await browser.newContext(); const again = await fresh.newPage(); await again.goto(link);
      await again.getByTestId("ro-gone").waitFor({ timeout: 10000 });
      assert.equal(await again.locator("body").innerText(), await open1.locator("body").innerText(), "the same plain page on a new browser");
      assert.equal((await sql.query("select open_count from private.read_only_links where name='Elders' and engagement_id=$1", [room])).rows[0].open_count, 1, "a turned-off link's opens add nothing");
      await shot(open1, "fail-m7-revoked-link");
      await phone.close(); await fresh.close();
    });

    // ---------- The scheduled run, and the check-in phone offline ----------
    const cron = async (header?: string) => { const r = await fetch(`${app.origin}/api/cron/check-ins`, { headers: header ? { Authorization: header } : {}, cache: "no-store" }); return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, number | string> }; };
    const owners = ["priya.shah", "daniel.brooks", "naomi.okafor", "marcus.webb"].map(n => `${n}@riverside.example.org`);
    await step("The scheduled run without the secret is refused and sends nothing, and called twice the same day it sends one email to each owner and no more", async () => {
      for (const r of (await sql.query("select id,status from private.check_in_rounds where engagement_id<>$1 and status in ('scheduled','sending')", [room])).rows as { id: string; status: string }[]) {
        quieted.set(r.id, r.status); await sql.query("update private.check_in_rounds set status='off' where id=$1", [r.id]);
      }
      const start = mail.count;
      assert.equal((await cron()).status, 401, "no header"); assert.equal((await cron("Bearer wrong")).status, 401, "wrong secret"); assert.equal((await cron(cronSecret)).status, 401, "no Bearer");
      assert.equal(mail.count, start, "nothing was sent");
      const first = await cron(`Bearer ${cronSecret}`);
      assert.equal(first.status, 200, JSON.stringify(first.body)); assert.equal(first.body.sent, owners.length, "one email each");
      assert.equal(mail.count - start, owners.length);
      for (const email of owners) assert.match(await mail.find(email, /check-in/), /\/c\//, `${email} has a link`);
      const second = await cron(`Bearer ${cronSecret}`);
      assert.equal(second.status, 200); assert.equal(second.body.rounds, 0, "nothing is due the second time");
      assert.equal(mail.count - start, owners.length, "no second email the same day");
      assert.equal((await sql.query("select count(*)::int n from private.check_in_recipients r join private.check_in_rounds d on d.id=r.round_id where d.engagement_id=$1 and d.status='sent'", [room])).rows[0].n, owners.length, "one recipient row each");
    });

    await step("FAIL-01 on the check-in phone: answers are saved on the phone offline and sent once, in order, when the signal is back", async () => {
      const text = await mail.find(owners[0], /check-in/), token = text.match(/\/c\/([A-Za-z0-9_-]+)/)![1];
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const p = await ctx.newPage(); await p.goto(`${app.origin}/c/${token}`);
      await p.getByRole("button", { name: "Open my check-in" }).click();
      const stepRow = async () => (await sql.query("select answer,note from private.check_in_answers a join private.first_steps s on s.id=a.first_step_id where s.engagement_id=$1 and s.id='90000000-0000-4000-8000-000000000461'", [room])).rows as { answer: string; note: string | null }[];
      await ctx.setOffline(true);
      await p.getByRole("radio", { name: "Under way" }).click();
      await p.getByText("Saved on this phone").waitFor({ timeout: 8000 });
      await p.getByRole("radio", { name: "Stuck" }).click();
      await p.getByLabel("What would help?").fill("I need to know who signs off the role.");
      await shot(p, "fail-01-m7-check-in-offline");
      assert.deepEqual(await stepRow(), [], "nothing reaches the server while the phone is offline");
      assert.ok(await p.evaluate(() => Object.keys(localStorage).some(k => k.startsWith("cw-ci:") && (localStorage.getItem(k) ?? "").includes("stuck"))), "the answers are kept on the phone");
      await ctx.setOffline(false);
      await until(async () => (await stepRow()).length === 1 && (await stepRow())[0].answer === "stuck" && (await stepRow())[0].note === "I need to know who signs off the role.", "the saved answers were sent when the signal came back", 20000);
      await p.getByText("Saved", { exact: true }).waitFor({ timeout: 10000 });
      assert.ok(await p.evaluate(() => Object.keys(localStorage).every(k => !k.startsWith("cw-ci:"))), "and the phone's copy is cleared");
      assert.equal((await stepRow()).length, 1, "the answer is stored once");
      assert.equal((await sql.query("select count(*)::int n from private.check_in_recipients r where r.engagement_id=$1 and r.answered_at is not null", [room])).rows[0].n, 0, "a tap is not an answer sent");
      await ctx.close();
    });
    await context.close();
  } finally {
    stopPokingAll(poke);
    fake({});
    try {
      await wipe();
      await sql.query("update public.engagements set settings=$2::jsonb,status=$3::engagement_status,day2_closed_at=$4 where id=$1", [room, JSON.stringify(before.settings), before.status, before.day2_closed_at]);
      for (const s of saved.sessions) await sql.query("update public.sessions set state=$2,closed_at=$3 where id=$1", [s.id, s.state, s.closed_at]);
      for (const a of saved.attendees) await sql.query("update public.attendees set email=$2 where id=$1", [a.id, a.email]);
      for (const g of saved.goals) await sql.query("update private.goals set owner_email=$2 where id=$1", [g.id, g.owner_email]);
      for (const s of saved.steps) await sql.query("update private.first_steps set owner_email=$2 where id=$1", [s.id, s.owner_email]);
      for (const [id, status] of quieted) await sql.query("update private.check_in_rounds set status=$2 where id=$1", [id, status]);
      if (kitUser) await sql.query("update public.engagement_facilitators set deleted=true where engagement_id=$1 and clearway_user_id=$2", [room, kitUser]);
      await sql.query("update public.engagement_facilitators set role='co_facilitator' where engagement_id=$1 and role='lead'", [room]);
      for (const r of saved.roles) await sql.query("update public.engagement_facilitators set role=$3::facilitator_role where engagement_id=$1 and clearway_user_id=$2", [room, r.clearway_user_id, r.role]);
    } catch (error) { console.error("Milestone 7 failure checks: clean-up did not finish", error); }
  }
}
const stopPokingAll = (timers: NodeJS.Timeout[]) => timers.splice(0).forEach(clearInterval);
