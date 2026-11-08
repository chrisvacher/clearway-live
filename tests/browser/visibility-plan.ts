// Milestone 7, step 3: the visibility plan (AFT-02), in a real browser against the production build and the local stack, with the scripted fake
// model (never the API), on the seeded Riverside engagement. The facilitator drafts the plan: rows arrive in the outward order (lead pastor first,
// congregation last), each with its sources, and no row has a when while there is no public date. They edit a cell, mark rows reviewed, name the
// public date (a row dated after it is flagged), add a row by hand, move one and remove one. A redraft asks first and keeps what they touched.
// The model fails (Needs attention) and Try again works. The plan is the table in the report's Make the Vision Visible section. Nobody else reaches
// it, and no person reaches the model. Before the plan's functions are in the database the hub's tile fails quietly.
// KIT_SHOTS=<folder> saves the screens. Local only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, startApp, until } from "./harness";

const controlDir = join(tmpdir(), `clearway-plan-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
const fake = (value: { delayMs?: number; fail?: boolean; failPlan?: boolean }) => writeFileSync(controlFile, JSON.stringify(value));
fake({});
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, ANTHROPIC_API_KEY: "", CLEARWAY_AI_PLAN_SLOW_MS: "60000" });

const room = "90000000-0000-4000-8000-000000000011";
const outward = ["lead_pastor", "participants", "board", "staff", "key_leaders", "congregation"];

async function main() {
  const env = localEnv(), sql = db(env), app = await startApp(env);
  let browser: Browser | undefined, before: { settings: unknown } | undefined, roles: { clearway_user_id: string; role: string }[] = [], renamed = false, kitUsers: string[] = [];
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(700); await page.screenshot({ path: `${process.env.KIT_SHOTS}/plan-${name}.png`, fullPage: true }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  const clear = async () => {
    await sql.query("select private.vp_clear($1::uuid,false)", [room]);
    await sql.query("select private.rp_clear($1::uuid,false)", [room]);
    await sql.query("update private.report_rounds set deleted=true where engagement_id=$1", [room]);
    await sql.query("delete from private.ai_runs where engagement_id=$1 and job in ('draft_visibility_plan','draft_report')", [room]);
  };
  try {
    await sql.connect();
    before = (await sql.query("select settings from public.engagements where id=$1 and not deleted", [room])).rows[0];
    assert.ok(before, "Run npm run db:seed first: the kit reads the seeded Riverside engagement");
    roles = (await sql.query("select clearway_user_id,role::text from public.engagement_facilitators where engagement_id=$1 and not deleted", [room])).rows;
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [room]);
    const elsewhere = await engagement(sql, []);
    const fac = await facilitator(env, sql, room), co = await facilitator(env, sql, room), stranger = await facilitator(env, sql, elsewhere.id);
    const ids = async (f: Awaited<ReturnType<typeof facilitator>>) => (await sql.query("select id from public.clearway_users where auth_user_id=$1", [f.session.user.id])).rows[0].id as string;
    const [leadId, coId] = [await ids(fac), await ids(co)];
    kitUsers = [leadId, coId];
    await sql.query("update public.engagement_facilitators set role='co_facilitator' where engagement_id=$1 and clearway_user_id<>$2 and not deleted", [room, leadId]);
    await sql.query("update public.engagement_facilitators set role='lead' where engagement_id=$1 and clearway_user_id=$2", [room, leadId]);
    await clear();

    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1360, height: 1500 } });
    await context.addCookies(fac.cookies(app.origin));
    const page = await context.newPage();
    const url = `${app.origin}/control/${room}/plan`;
    type Row = { id: string; stage: string; who: string; when_text: string; when_date: string | null; what_they_hear: string; origin: string; touched: boolean; reviewed_at: string | null; position: number };
    const rows = async () => (await sql.query(`select id,stage,who,when_text,to_char(when_date,'YYYY-MM-DD') as when_date,what_they_hear,origin,touched,reviewed_at,position from private.visibility_plan_rows
      where engagement_id=$1 and not deleted order by position`, [room])).rows as Row[];
    const plan = async () => (await sql.query("select status,moment,to_char(public_date,'YYYY-MM-DD') as public_date,dropped,error from private.visibility_plans where engagement_id=$1 and not deleted", [room])).rows[0] as { status: string; moment: string; public_date: string | null; dropped: number; error: string | null } | undefined;
    const table = page.getByTestId("vp-table"), vrows = page.getByTestId("vp-row");
    const rowByWho = (who: string) => vrows.filter({ has: page.locator(".who b", { hasText: who }) });

    await step("The After hub lists the visibility plan, links to it, and the page says what it is before anything is drafted", async () => {
      await page.goto(`${app.origin}/control/${room}/after`);
      await page.getByTestId("after-hub").waitFor({ timeout: 20000 });
      assert.match(await page.getByTestId("after-visibility").innerText(), /Not drafted yet/);
      assert.ok(!/[–—]/.test(await page.locator("main").innerText()), "no dashes in the copy");
      await shot(page, "hub");
      await page.getByTestId("after-visibility").click();
      await page.getByTestId("vp-card").waitFor({ timeout: 15000 });
      assert.equal(new URL(page.url()).pathname, `/control/${room}/plan`);
      assert.equal(await page.getByTestId("vp-draft").innerText(), "Draft the plan");
      assert.match(await page.getByTestId("vp-status").innerText(), /Not drafted/);
      assert.match(await page.getByTestId("vp-empty").innerText(), /No rows yet/);
      assert.match(await page.getByTestId("vp-anchor").innerText(), /no date/i, "it says there is no date yet");
      const order = await page.getByTestId("vp-order").innerText();
      for (const s of ["Lead pastor", "Retreat participants", "Board or elders", "Staff", "Members and key leaders", "Congregation"]) assert.ok(order.includes(s), s);
      await shot(page, "before");
    });

    await step("Draft the plan: rows arrive in the outward order, each cites its sources, and no row has a when without a public date", async () => {
      await page.getByTestId("vp-draft").click();
      await table.waitFor({ timeout: 40000 });
      await until(async () => (await plan())?.status === "drafted", "the plan is drafted", 40000);
      const r = await rows();
      assert.ok(r.length >= 5, `a row for each audience the room gave a reason for (${r.length})`);
      assert.equal(r[0].stage, "lead_pastor", "the lead pastor hears first");
      assert.equal(r[r.length - 1].stage, "congregation", "and the congregation last");
      const ranks = r.map(x => outward.indexOf(x.stage));
      assert.deepEqual([...ranks].sort((a, b) => a - b), ranks, "in the outward order");
      assert.ok(r.every(x => !x.when_text && !x.when_date), "no when without a public date");
      assert.ok(r.every(x => x.origin === "ai" && !x.touched && !x.reviewed_at));
      const unsourced = (await sql.query(`select count(*)::int n from private.visibility_plan_rows w where w.engagement_id=$1 and not w.deleted and not exists(select 1 from private.visibility_plan_sources s where s.row_id=w.id and not s.deleted)`, [room])).rows[0].n;
      assert.equal(unsourced, 0, "every row has a source");
      await until(async () => (await vrows.count()) === r.length, "every row is on the screen", 10000);
      await until(async () => JSON.stringify(await vrows.evaluateAll(els => els.map(e => e.getAttribute("data-stage")))) === JSON.stringify(r.map(x => x.stage)), "the screen shows the same order", 10000);
      assert.match(await page.getByTestId("vp-status").innerText(), /Draft to review/);
      assert.match(await page.getByTestId("vp-mark").first().innerText(), /\d+ sources?/);
      assert.ok(await page.getByTestId("vp-ai-icon").count() >= r.length, "AI marks each row");
      assert.match(await page.getByTestId("vp-left").innerText(), new RegExp(`${r.length} of ${r.length} rows still need review`));
      assert.ok(!/[–—]/.test(await table.innerText()), "no dashes in the plan");
      await shot(page, "drafted");
    });

    await step("Choosing a row shows the words it rests on", async () => {
      await vrows.first().click();
      const sources = page.getByTestId("vp-sources");
      await sources.getByTestId("rpt-source").first().waitFor({ timeout: 10000 });
      assert.ok(await sources.getByTestId("rpt-source").count() >= 1);
      assert.match(await page.getByTestId("vp-panel-row").innerText(), /Lead pastor: /);
      await shot(page, "sources");
    });

    await step("The plan was made from refs: no person's name, speaker, owner or email reaches the model", async () => {
      const people = (await sql.query("select name from public.attendees where engagement_id=$1 and not deleted", [room])).rows.map(r => r.name as string).filter(n => n && n.length > 3);
      const speakers = (await sql.query("select distinct speaker from private.scribe_cards where engagement_id=$1 and speaker is not null", [room])).rows.map(r => r.speaker as string);
      const sent = (await sql.query("select string_agg(coalesce(inputs::text,'')||coalesce(output::text,'')||coalesce(error,''),' ') as t from private.ai_runs where engagement_id=$1 and job='draft_visibility_plan'", [room])).rows[0].t as string;
      assert.ok(sent.length > 100, "a run was logged");
      for (const n of [...people, ...speakers]) assert.ok(!sent.includes(n), `${n} never reaches the model or comes back`);
      assert.ok(!/@[a-z0-9-]+\.(org|co|test)/i.test(sent), "no email either");
      assert.ok(!/owner_attendee|attendee_id/.test(sent), "no owner either");
    });

    await step("Edit a cell: it saves in the facilitator's words, the row reads Edited and the plan reads Edited", async () => {
      const first = vrows.nth(1), who = (await rows())[1].who;
      await first.getByTestId("vp-cell-what_they_hear").click();
      await first.getByTestId("vp-edit-text").fill("Hold the plan until the elders have been briefed; then say nothing.");
      await first.getByTestId("vp-edit-save").click();
      await until(async () => (await rows())[1].touched, "the row is touched");
      const r = (await rows())[1];
      assert.equal(r.what_they_hear, "Hold the plan until the elders have been briefed, then say nothing.", "semicolons are written as commas");
      assert.equal(r.origin, "ai");
      assert.equal(r.reviewed_at, null);
      assert.equal((await plan())?.status, "edited");
      await page.getByTestId("vp-edited").first().waitFor({ timeout: 10000 });
      assert.match(await page.getByTestId("vp-status").innerText(), /Edited/);
      assert.ok((await rowByWho(who).first().innerText()).includes("then say nothing"));
      await shot(page, "edited");
    });

    await step("Mark reviewed and Mark as not reviewed, and the count follows", async () => {
      const total = await vrows.count();
      await vrows.first().getByTestId("vp-review").click();
      await until(async () => (await rows())[0].reviewed_at !== null, "reviewed");
      await vrows.first().getByTestId("vp-unreview").waitFor({ timeout: 10000 });
      assert.match(await page.getByTestId("vp-left").innerText(), new RegExp(`${total - 1} of ${total} rows still need review`));
      await vrows.first().getByTestId("vp-unreview").click();
      await until(async () => (await rows())[0].reviewed_at === null, "not reviewed");
      await vrows.first().getByTestId("vp-review").click();
      await until(async () => (await rows())[0].reviewed_at !== null, "reviewed again");
    });

    await step("Naming the public date anchors the plan, and a row dated after it is flagged", async () => {
      await page.getByTestId("vp-moment-name").fill("Vision Sunday");
      await page.getByTestId("vp-moment-date").fill("2027-01-31");
      await page.getByTestId("vp-moment-save").click();
      await until(async () => (await plan())?.public_date === "2027-01-31", "the date is saved");
      await until(async () => /January 31, 2027/.test(await page.getByTestId("vp-anchor").innerText()), "the page says it works back from the date", 10000);
      const row = vrows.nth(2);
      await row.getByTestId("vp-cell-when").click();
      await row.getByTestId("vp-edit-text").fill("The week after");
      await row.getByTestId("vp-edit-date").fill("2027-02-07");
      await row.getByTestId("vp-edit-save").click();
      await row.getByTestId("vp-after-public").waitFor({ timeout: 10000 });
      assert.match(await row.getByTestId("vp-after-public").innerText(), /after the public date/);
      await shot(page, "after-public");
      await row.getByTestId("vp-cell-when").click();
      await row.getByTestId("vp-edit-text").fill("The week before");
      await row.getByTestId("vp-edit-date").fill("2027-01-24");
      await row.getByTestId("vp-edit-save").click();
      await until(async () => (await rows())[2].when_date === "2027-01-24", "the date is on or before the public date");
      await until(async () => /The week before, Jan 24, 2027/.test(await row.innerText()), "the row shows its when and its date", 10000);
      assert.equal(await row.getByTestId("vp-after-public").count(), 0, "and the flag goes");
    });

    await step("Add a row by hand, move it up and remove another, and every change shows at once", async () => {
      await page.getByTestId("vp-add").click();
      await page.getByTestId("vp-add-stage").selectOption("board");
      await page.getByTestId("vp-add-who").fill("The volunteers");
      await page.getByTestId("vp-add-hear").fill("What changes for them in the first year.");
      await page.getByTestId("vp-add-save").click();
      const mine = rowByWho("The volunteers");
      await mine.waitFor({ timeout: 10000 });
      assert.match(await mine.getByTestId("vp-mark").innerText(), /Yours/);
      assert.equal((await rows()).at(-1)?.who, "The volunteers", "it goes last");
      await mine.click();
      assert.match(await page.getByTestId("vp-yours").innerText(), /needs no source/);
      const last = (await rows()).length;
      await page.getByTestId("vp-up").click();
      await until(async () => (await rows())[last - 2].who === "The volunteers", "it moved up");
      await until(async () => JSON.stringify(await vrows.evaluateAll(els => els.map(e => e.querySelector(".who b")?.textContent))) === JSON.stringify((await rows()).map(r => r.who)), "the screen has the same order", 10000);
      await vrows.nth(1).click();
      await page.getByTestId("vp-remove").click();
      await page.getByTestId("vp-remove-ask").waitFor();
      await page.getByTestId("vp-remove-no").click();
      assert.equal((await rows()).length, last, "keeping it leaves it");
      await page.getByTestId("vp-remove").click();
      await page.getByTestId("vp-remove-yes").click();
      await until(async () => (await rows()).length === last - 1, "the row is gone");
      await until(async () => (await vrows.count()) === last - 1, "and off the screen", 10000);
      await shot(page, "hand");
    });

    await step("Redraft asks first, keeps the rows the facilitator touched or reviewed, and replaces only the rest", async () => {
      const kept = (await rows()).filter(r => r.touched || r.reviewed_at || r.origin === "facilitator");
      assert.ok(kept.length >= 2);
      await page.getByTestId("vp-draft").click();
      await page.getByTestId("vp-ask").waitFor({ timeout: 10000 });
      assert.match(await page.getByTestId("vp-ask").innerText(), new RegExp(`${kept.length} rows? (is|are) yours or reviewed`));
      await shot(page, "redraft-ask");
      await page.getByTestId("vp-ask-no").click();
      assert.equal(await page.getByTestId("vp-ask").count(), 0, "cancel leaves it as it is");
      await page.getByTestId("vp-draft").click();
      await page.getByTestId("vp-ask-yes").click();
      await until(async () => (await sql.query("select count(*)::int n from private.ai_runs where engagement_id=$1 and job='draft_visibility_plan' and status='ok'", [room])).rows[0].n >= 2
        && (await sql.query("select status from private.visibility_plan_rounds where engagement_id=$1 and not deleted", [room])).rows[0]?.status === "ready", "the redraft is done", 40000);
      const after = await rows();
      for (const k of kept) assert.ok(after.some(r => r.id === k.id), `${k.who} is still there`);
      assert.equal(after.find(r => r.id === kept[0].id)?.what_they_hear, kept[0].what_they_hear, "as the facilitator left it");
      const ranks = after.filter(r => r.origin === "ai").map(r => outward.indexOf(r.stage));
      assert.ok(after.every(r => !r.when_date || r.when_date <= "2027-01-31"), "no row is dated after the public date");
      assert.ok(ranks.length >= 1);
      assert.equal(after.filter(r => r.stage === "lead_pastor").length, kept.some(k => k.stage === "lead_pastor") ? 1 : 1, "one lead pastor row");
      assert.deepEqual(after.map(r => r.position), after.map((_, i) => i + 1), "positions stay one to n");
    });

    await step("The model fails: the first failure is tried again, the second says Needs attention, nothing written is lost, and Try again works", async () => {
      const writtenBefore = (await rows()).filter(r => r.origin === "facilitator" || r.touched).length;
      fake({ failPlan: true });
      await page.getByTestId("vp-draft").click();
      await page.getByTestId("vp-ask-yes").click();
      await until(async () => { const r = (await sql.query("select attempts,status from private.visibility_plan_rounds where engagement_id=$1 and not deleted", [room])).rows[0]; return r && r.attempts >= 1 && r.status === "pending"; }, "the first failure waits to be tried again", 40000);
      await page.getByTestId("vp-retry").waitFor({ timeout: 15000 });
      await sql.query("update private.visibility_plan_rounds set last_failed_at=now()-interval '5 minutes' where engagement_id=$1 and not deleted", [room]);
      await until(async () => (await sql.query("select status from private.visibility_plan_rounds where engagement_id=$1 and not deleted", [room])).rows[0]?.status === "failed", "the second failure gives up", 40000);
      await page.getByTestId("vp-failed").waitFor({ timeout: 15000 });
      assert.match(await page.getByTestId("vp-failed").innerText(), /couldn’t draft the plan/);
      assert.match(await page.getByTestId("vp-status").innerText(), /Needs attention/);
      const failedRuns = (await sql.query("select created_at,error,status from private.ai_runs where engagement_id=$1 and job='draft_visibility_plan' order by created_at", [room])).rows;
      assert.equal(failedRuns.filter(r => r.status === "failed").length, 2, `tried twice: ${JSON.stringify(failedRuns)}`);
      assert.equal((await rows()).filter(r => r.origin === "facilitator" || r.touched).length, writtenBefore, "nothing written is lost");
      await shot(page, "failed");
      fake({});
      await page.getByTestId("vp-try-again").click();
      await page.getByTestId("vp-ask-yes").click().catch(() => {});
      await until(async () => (await sql.query("select count(*)::int n from private.ai_runs where engagement_id=$1 and job='draft_visibility_plan' and status='ok'", [room])).rows[0].n >= 3
        && (await sql.query("select status from private.visibility_plan_rounds where engagement_id=$1 and not deleted", [room])).rows[0]?.status === "ready" && (await plan())?.error === null, "the plan is drafted again", 40000);
      await page.getByTestId("vp-failed").waitFor({ state: "detached", timeout: 15000 });
    });

    await step("The plan is the table in the report's Make the Vision Visible section, and refreshing from the records brings in a change", async () => {
      await page.getByTestId("vp-report-link").click();
      await page.getByTestId("rpt-draft").waitFor({ timeout: 20000 });
      await page.getByTestId("rpt-draft").click();
      await page.getByTestId("rpt-grid").waitFor({ timeout: 30000 });
      await until(async () => (await sql.query("select count(*)::int n from private.report_sections where engagement_id=$1 and not deleted and status='drafting'", [room])).rows[0].n === 0, "every section is done", 90000);
      await page.getByTestId("rpt-section-visibility").click();
      const section = page.locator('[data-testid="rpt-body"][data-key="visibility"]');
      await section.waitFor({ timeout: 15000 });
      const t = section.getByTestId("rpt-table");
      await t.waitFor({ timeout: 15000 });
      const plans = await rows();
      const heads = await t.locator("thead th").allInnerTexts();
      for (const h of ["Who", "When", "Who tells them", "What they hear", "The risk it answers"]) assert.ok(heads.some(x => x.toLowerCase().includes(h.toLowerCase())), `${h} in ${JSON.stringify(heads)}`);
      const planRows = (await t.locator("tbody tr").evaluateAll((els, n) => els.filter(e => (e.textContent ?? "").length > 0).map(e => e.querySelector("td")?.textContent ?? "").slice(0, n), 99)) as string[];
      for (const r of plans) assert.ok(planRows.some(x => x.includes(r.who)), `${r.who} is in the report`);
      assert.ok(plans.findIndex(r => r.who === plans[0].who) === 0 && planRows.findIndex(x => x.includes(plans[0].who)) <= planRows.findIndex(x => x.includes(plans.at(-1)!.who)), "in the plan's order");
      await shot(page, "report");
      // A change in the plan reaches the report only when it is refreshed.
      await sql.query("update private.visibility_plan_rows set who='The ministry leaders' where id=$1", [plans[1].id]);
      assert.ok(!(await t.innerText()).includes("The ministry leaders"), "the report holds what was built");
      await section.getByTestId("rpt-refresh").click();
      await until(async () => (await t.innerText()).includes("The ministry leaders"), "Refresh from the records brings it in", 20000);
    });

    await step("Nobody else reaches it, a request from another origin is refused, and a co-facilitator can use it", async () => {
      const anon = await fetch(`${app.origin}/api/control/${room}/plan`);
      assert.ok([401, 403].includes(anon.status), `anonymous refused, got ${anon.status}`);
      const other = await browser!.newContext(); await other.addCookies(stranger.cookies(app.origin));
      assert.equal((await other.request.get(`${app.origin}/api/control/${room}/plan`)).status(), 403, "another engagement's facilitator is denied");
      const rid = (await rows())[0].id;
      for (const data of [{ action: "draft", id: randomUUID(), confirm: true }, { action: "set", moment: "x", date: null }, { action: "add", cells: { who: "x" } }, { action: "remove", row: rid }, { action: "reviewed", row: rid }, { action: "move", row: rid, direction: "up" }, { action: "edit", row: rid, cells: { who: "x" } }]) {
        const post = await other.request.post(`${app.origin}/api/control/${room}/plan`, { headers: { Origin: app.origin }, data });
        assert.equal(post.status(), 403, `${data.action} is refused`);
      }
      await other.close();
      const cross = await context.request.post(`${app.origin}/api/control/${room}/plan`, { headers: { Origin: "https://example.org" }, data: { action: "set", moment: "x", date: null } });
      assert.equal(cross.status(), 403);
      const coContext = await browser!.newContext({ viewport: { width: 1360, height: 1200 } }); await coContext.addCookies(co.cookies(app.origin));
      const copage = await coContext.newPage(); await copage.goto(url);
      await copage.getByTestId("vp-table").waitFor({ timeout: 15000 });
      await copage.getByTestId("vp-row").first().getByTestId("vp-cell-risk").click();
      await copage.getByTestId("vp-edit-text").fill("The elders never owned the plan.");
      await copage.getByTestId("vp-edit-save").click();
      await until(async () => (await rows())[0].touched, "a co-facilitator's edit is saved");
      await coContext.close();
    });

    await step("Before the plan's functions are in the database the hub's tile fails quietly", async () => {
      const reload = () => sql.query("notify pgrst, 'reload schema'");
      await sql.query("alter function public.visibility_plan_state(uuid) rename to visibility_plan_state_off"); renamed = true; await reload();
      try {
        await until(async () => { await page.goto(`${app.origin}/control/${room}/after`); return /isn’t available yet/.test(await page.getByTestId("after-visibility").innerText()); }, "the hub's tile says it isn't here yet", 45000);
        assert.ok(!/error|went wrong/i.test(await page.locator("main").innerText()), "and no complaint");
        assert.match(await page.getByTestId("after-report").innerText(), /Not drafted yet|sections reviewed|Signed off/, "the report's tile is untouched");
      } finally { await sql.query("alter function public.visibility_plan_state_off(uuid) rename to visibility_plan_state"); renamed = false; await reload(); }
      await until(async () => { await page.goto(`${app.origin}/control/${room}/after`); return /rows reviewed|Not drafted yet|Every row/.test(await page.getByTestId("after-visibility").innerText()); }, "the tile comes back", 45000);
    });

    console.log(`Visibility plan kit: ${passed.length} checks passed.`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally {
    if (renamed) await sql.query("alter function public.visibility_plan_state_off(uuid) rename to visibility_plan_state").catch(() => {});
    await clear().catch(() => {});
    if (before) await sql.query("update public.engagements set settings=$2::jsonb where id=$1", [room, JSON.stringify(before.settings)]).catch(() => {});
    if (kitUsers.length) await sql.query("update public.engagement_facilitators set deleted=true where engagement_id=$1 and clearway_user_id=any($2::uuid[])", [room, kitUsers]).catch(() => {});
    if (roles.length) {
      await sql.query("update public.engagement_facilitators set role='co_facilitator' where engagement_id=$1 and role='lead'", [room]).catch(() => {});
      for (const r of roles) await sql.query("update public.engagement_facilitators set role=$3::facilitator_role where engagement_id=$1 and clearway_user_id=$2", [room, r.clearway_user_id, r.role]).catch(() => {});
    }
    await browser?.close(); app.stop(); await sql.end().catch(() => {});
  }
}
main().catch(error => { console.error(error); process.exit(1); });
