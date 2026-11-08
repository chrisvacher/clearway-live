// Milestone 7, step 1: the Wayfinding report (AFT-01), in a real browser against the production build and the local stack, with the scripted fake
// model (never the API), on the seeded Riverside engagement. The facilitator drafts the report: fourteen sections arrive in order, the seven prose
// sections drafted by the model and the seven tables built by code from the records, Overview and Closing last. Every sentence shows its sources,
// with the words it used lit. The saved aligned signal is a source in What We Heard. The facilitator edits a sentence, uses the room's words,
// writes a read of their own and redrafts a section (the sentences they touched stay). The model fails on one section (Needs attention) and the
// retry works. Sign-off waits for every review and every source, and only the lead signs. Nobody else reaches any of it, and no person reaches the model.
// Before the report's functions are in the database the link and the hub's tile fail quietly.
// KIT_SHOTS=<folder> saves the screens. Local only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, startApp, until } from "./harness";

const controlDir = join(tmpdir(), `clearway-report-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
const fake = (value: { delayMs?: number; fail?: boolean; failSection?: string }) => writeFileSync(controlFile, JSON.stringify(value));
fake({});
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, ANTHROPIC_API_KEY: "", CLEARWAY_AI_REPORT_SLOW_MS: "60000" });

const room = "90000000-0000-4000-8000-000000000011";
const order = ["overview", "church_today", "process", "heard", "interviews", "tensions", "future", "vision", "risks", "outlook", "intent", "decisions", "visibility", "closing"];
const headings = ["Overview", "The Church Today", "The Process", "What We Heard", "Leadership Interviews", "Strategic Tensions", "The 10-year Future", "The 3-year Vision", "Risks and Roadblocks", "The 1-year Outlook", "Commander's Intent", "Decisions", "Make the Vision Visible", "Closing"];

async function main() {
  const env = localEnv(), sql = db(env), app = await startApp(env);
  let browser: Browser | undefined, before: { settings: unknown } | undefined, roles: { clearway_user_id: string; role: string }[] = [], renamed = false, kitUsers: string[] = [];
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(700); await page.screenshot({ path: `${process.env.KIT_SHOTS}/report-${name}.png`, fullPage: true }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  const clear = async () => { await sql.query("select private.rp_clear($1::uuid,false)", [room]); await sql.query("update private.report_rounds set deleted=true where engagement_id=$1", [room]); await sql.query("delete from private.report_sign_offs where engagement_id=$1", [room]).catch(() => {}); };
  try {
    await sql.connect();
    before = (await sql.query("select settings from public.engagements where id=$1 and not deleted", [room])).rows[0];
    assert.ok(before, "Run npm run db:seed first: the kit reads the seeded Riverside engagement");
    roles = (await sql.query("select clearway_user_id,role::text from public.engagement_facilitators where engagement_id=$1 and not deleted", [room])).rows;
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [room]);
    const elsewhere = await engagement(sql, []);
    const fac = await facilitator(env, sql, room), co = await facilitator(env, sql, room), stranger = await facilitator(env, sql, elsewhere.id);
    // The kit's first facilitator is the lead, whoever the seed named; the second co-facilitates.
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
    const url = `${app.origin}/control/${room}/report`;
    const secs = async () => (await sql.query("select key,status,kind,error from private.report_sections where engagement_id=$1 and not deleted order by position", [room])).rows as { key: string; status: string; kind: string; error: string | null }[];
    const status = async (key: string) => (await secs()).find(s => s.key === key)?.status;
    const open = async (key: string) => { await page.getByTestId(`rpt-section-${key}`).click(); await page.locator(`[data-testid="rpt-body"][data-key="${key}"]`).waitFor(); };
    const body = page.getByTestId("rpt-body");

    await step("After the retreat is on the control surface and the hub lists the report, with the visibility plan, and two tiles that say they are coming", async () => {
      await page.goto(`${app.origin}/control/${room}`);
      await page.getByTestId("after-link").waitFor({ timeout: 20000 });
      await page.getByTestId("after-link").click();
      await page.getByTestId("after-hub").waitFor({ timeout: 15000 });
      assert.match(await page.getByTestId("after-report").innerText(), /Not drafted yet/);
      assert.match(await page.getByTestId("after-visibility").innerText(), /Not drafted yet/);
      for (const t of ["share", "checkins"]) assert.match(await page.getByTestId(`after-${t}`).innerText(), /Coming in this milestone/);
      assert.ok(!/[–—]/.test(await page.locator("main").innerText()), "no dashes in the copy");
      await shot(page, "hub");
    });

    await step("Before drafting the page says what it is, and offers one button", async () => {
      await page.goto(url);
      await page.getByTestId("rpt-draft").waitFor({ timeout: 15000 });
      assert.equal(await page.getByTestId("rpt-draft").innerText(), "Draft the report");
      assert.equal(await page.getByTestId("rpt-grid").count(), 0, "no sections yet");
      await shot(page, "before");
    });

    await step("Draft the report: fourteen sections arrive, Overview and Closing last, the model failing once on one section", async () => {
      fake({ failSection: "interviews" });
      await page.getByTestId("rpt-draft").click();
      await page.getByTestId("rpt-grid").waitFor({ timeout: 30000 });
      assert.deepEqual((await page.locator('[data-testid^="rpt-section-"]').evaluateAll(els => els.map(e => e.getAttribute("data-testid")!.replace("rpt-section-", "")))), order, "fourteen sections, in the report's order");
      assert.deepEqual(await page.locator(".rpt-li .h > span").allInnerTexts(), headings);
      // The first failure is retried after a pause; the kit skips the pause.
      await until(async () => { const r = (await sql.query("select attempts from private.report_rounds where engagement_id=$1 and not deleted and status='pending'", [room])).rows[0]; return r && r.attempts >= 1; }, "the first failure", 40000);
      await sql.query("update private.report_rounds set last_failed_at=now()-interval '5 minutes' where engagement_id=$1 and not deleted", [room]);
      await until(async () => (await secs()).every(s => s.status !== "drafting"), "every section is done", 60000);
      const runs = (await sql.query("select output->>'section' as section, status from private.ai_runs where engagement_id=$1 and job='draft_report' and session_id is null order by created_at", [room])).rows as { section: string | null; status: string }[];
      const drafted = runs.filter(r => r.status === "ok").map(r => r.section);
      assert.ok(drafted.indexOf("overview") > drafted.indexOf("tensions") && drafted.indexOf("closing") === drafted.length - 1, "Overview and Closing are drafted last");
      assert.equal(runs.filter(r => r.status === "failed").length, 2, "the failure was tried twice");
      const s = await secs();
      assert.equal(s.find(x => x.key === "interviews")?.status, "needs_attention", "the section that failed twice needs attention");
      assert.equal(s.filter(x => x.status === "needs_attention").length, 1, "and no other");
      for (const k of ["future", "vision", "risks", "outlook", "intent", "decisions", "visibility"]) assert.equal(s.find(x => x.key === k)?.kind, "record", `${k} is built from the records`);
      await page.getByTestId("rpt-status-interviews").getByText("Needs attention").waitFor({ timeout: 15000 });
      await shot(page, "drafted");
    });

    await step("A section that failed says so, and Try again drafts it", async () => {
      await open("interviews");
      await page.getByTestId("rpt-attention").waitFor();
      assert.match(await page.getByTestId("rpt-attention").innerText(), /could not draft this section/i);
      await shot(page, "needs-attention");
      fake({});
      await page.getByTestId("rpt-retry").click();
      await until(async () => (await status("interviews")) === "drafted", "interviews is drafted", 40000);
      await page.getByTestId("rpt-attention").waitFor({ state: "detached", timeout: 15000 });
      await until(async () => (await body.getByTestId("rpt-sentence").count()) >= 1, "and it shows its sentences", 15000);
    });

    await step("Each sentence shows how many sources it rests on, and choosing one lights the words it used in the panel", async () => {
      await open("heard");
      const sentences = body.getByTestId("rpt-sentence");
      await until(async () => (await sentences.count()) >= 3, "What We Heard has sentences");
      assert.ok(await sentences.first().getByTestId("rpt-mark").count() === 1, "a mark on each sentence");
      assert.match(await sentences.first().getByTestId("rpt-mark").innerText(), /1 source/);
      await sentences.first().locator("button.main").click();
      const sources = page.getByTestId("rpt-sources");
      await sources.getByTestId("rpt-source").first().waitFor();
      assert.ok(await sources.locator(".ovr-hl").count() >= 1, "the words the sentence used are lit");
      assert.ok(await sources.getByTestId("rpt-src-sentence").innerText() === (await sentences.first().locator(".txt").evaluate(e => e.firstChild?.textContent ?? "")), "the panel shows the sentence");
      await shot(page, "sources");
    });

    await step("The aligned signal the facilitator saved as a citation is a source in What We Heard, and the others are not", async () => {
      const kinds = (await sql.query(`select r.kind,r.ref_id from private.report_sources r join private.report_sentences x on x.id=r.sentence_id join private.report_sections s on s.id=x.section_id
        where s.engagement_id=$1 and s.key='heard' and not r.deleted and not x.deleted`, [room])).rows as { kind: string; ref_id: string }[];
      const signals = kinds.filter(k => k.kind === "signal");
      assert.ok(signals.length >= 1, "the signal is cited");
      const saved = (await sql.query("select id from private.signals where engagement_id=$1 and kind='aligned' and saved_as_citation_at is not null and not deleted", [room])).rows.map(r => r.id);
      assert.ok(signals.every(s => saved.includes(s.ref_id)), "and only a saved aligned signal");
      const sentence = body.getByTestId("rpt-sentence").filter({ has: page.locator("button.main") });
      let found = false;
      for (let i = 0; i < await sentence.count() && !found; i++) {
        await sentence.nth(i).locator("button.main").click();
        found = (await page.getByTestId("rpt-sources").locator('[data-kind="signal"]').count()) > 0;
      }
      assert.ok(found, "the panel shows the signal as a source");
      assert.match(await page.getByTestId("rpt-sources").locator('[data-kind="signal"]').first().innerText(), /Aligned signal saved as a citation/);
    });

    await step("Edit saves the facilitator's words, and the section reads Edited", async () => {
      await open("heard");
      const first = body.getByTestId("rpt-sentence").first();
      await first.locator("button.main").click();
      await first.getByTestId("rpt-edit").click();
      await first.getByTestId("rpt-edit-text").fill("The team heard it plainly: newcomers cannot find a way into a group.");
      await first.getByTestId("rpt-edit-save").click();
      await until(async () => (await sql.query(`select count(*)::int n from private.report_sentences x join private.report_sections s on s.id=x.section_id where s.key='heard' and s.engagement_id=$1 and x.text like 'The team heard it plainly%' and x.touched`, [room])).rows[0].n === 1, "the edit is saved");
      assert.equal(await status("heard"), "edited");
      await page.getByTestId("rpt-status-heard").getByText("Edited").waitFor({ timeout: 10000 });
      assert.match(await body.innerText(), /The team heard it plainly/);
    });

    await step("Use the room's words puts the exact words in and Undo brings the draft back", async () => {
      const quote = body.locator('[data-testid="rpt-sentence"].is-quote').filter({ hasText: "Volunteers are stretched thin, the same" });
      await quote.first().locator("button.main").click();
      await quote.first().getByTestId("rpt-room-words").click();
      await until(async () => (await sql.query(`select count(*)::int n from private.report_sentences x join private.report_sections s on s.id=x.section_id where s.key='heard' and s.engagement_id=$1 and x.origin='room' and x.text='Volunteers are stretched thin, the same few people every week.'`, [room])).rows[0].n === 1, "the room's exact words are in");
      await body.getByText("The room’s words", { exact: false }).first().waitFor();
      await shot(page, "room-words");
      await page.getByRole("button", { name: "Back to the draft wording" }).click();
      await until(async () => (await sql.query(`select count(*)::int n from private.report_sentences x join private.report_sections s on s.id=x.section_id where s.key='heard' and s.engagement_id=$1 and x.origin='room'`, [room])).rows[0].n === 0, "undone");
    });

    await step("Add your own read writes a sentence that needs no source, and a sentence can be removed", async () => {
      await body.getByTestId("rpt-add-own").click();
      await body.getByTestId("rpt-add-text").fill("Our own read: this is bigger than the survey shows.");
      await body.getByTestId("rpt-add-save").click();
      const own = body.getByTestId("rpt-sentence").filter({ hasText: "Our own read" });
      await own.waitFor({ timeout: 10000 });
      assert.match(await own.getByTestId("rpt-mark").innerText(), /Yours/);
      await own.locator("button.main").click();
      assert.match(await page.getByTestId("rpt-sources").innerText(), /own words\. They need no source/);
      await own.getByTestId("rpt-remove").click();
      await until(async () => (await body.getByTestId("rpt-sentence").filter({ hasText: "Our own read" }).count()) === 0, "the sentence is gone", 10000);
      await body.getByTestId("rpt-add-own").click();
      await body.getByTestId("rpt-add-text").fill("Our own read: this is bigger than the survey shows.");
      await body.getByTestId("rpt-add-save").click();
      await body.getByTestId("rpt-sentence").filter({ hasText: "Our own read" }).waitFor({ timeout: 10000 });
    });

    await step("Redraft section asks inside the panel, keeps what was touched, and replaces only the rest", async () => {
      const touched = async () => (await sql.query(`select count(*)::int n from private.report_sentences x join private.report_sections s on s.id=x.section_id where s.key='heard' and s.engagement_id=$1 and not x.deleted and (x.touched or x.origin='facilitator')`, [room])).rows[0].n as number;
      const before = await touched();
      assert.ok(before >= 2);
      await body.getByTestId("rpt-redraft").click();
      await page.getByTestId("rpt-ask").waitFor({ timeout: 10000 });
      assert.match(await page.getByTestId("rpt-ask").innerText(), new RegExp(`${before} sentences? you changed`));
      await shot(page, "redraft-ask");
      await page.getByTestId("rpt-ask-no").click();
      assert.equal(await page.getByTestId("rpt-ask").count(), 0, "cancel leaves it as it is");
      await body.getByTestId("rpt-redraft").click();
      await page.getByTestId("rpt-ask-yes").click();
      await until(async () => (await sql.query("select status from private.report_rounds where engagement_id=$1 and not deleted", [room])).rows[0]?.status === "ready", "the redraft is done", 40000);
      assert.equal(await touched(), before, "the sentences the facilitator touched are still there");
      assert.match(await body.innerText(), /The team heard it plainly/);
      assert.match(await body.innerText(), /Our own read/);
    });

    await step("A record section is a table built from the records, with each row's words as a sentence and its sources", async () => {
      await open("future");
      const table = body.getByTestId("rpt-table");
      await table.waitFor({ timeout: 15000 });
      assert.ok(await table.locator("tbody tr").count() >= 3, "the lens summaries are rows");
      await table.getByTestId("rpt-part").first().click();
      await page.getByTestId("rpt-sources").getByTestId("rpt-source").first().waitFor();
      assert.match(await page.getByTestId("rpt-sources").innerText(), /Signed off lens summary/);
      await shot(page, "future");
      await open("decisions");
      assert.ok(await body.getByTestId("rpt-table").locator("tbody tr").count() >= 1, "the decisions are rows");
      assert.ok(await body.getByTestId("rpt-refresh").isEnabled(), "and Refresh from the records is there");
      await open("outlook");
      assert.ok(await body.getByTestId("rpt-table").count() === 1);
      await body.getByTestId("rpt-refresh").click();
      await delay(800);
      assert.ok(await body.getByTestId("rpt-table").count() === 1, "refreshing keeps the table");
    });

    await step("Sign-off waits for every review and every source, and says what is missing", async () => {
      assert.equal(await page.getByTestId("rpt-sign-off").isDisabled(), true);
      assert.match(await page.getByTestId("rpt-blockers").innerText(), /still to review/);
      await shot(page, "blocked");
      // Review every section: the thin ones too.
      for (const key of order) {
        await open(key);
        const review = body.getByTestId("rpt-review");
        if (await review.count()) { await until(async () => await review.isEnabled(), `${key} can be reviewed`, 10000); await review.click(); }
        await until(async () => (await status(key)) === "reviewed", `${key} is reviewed`, 10000);
      }
      await until(async () => (await page.getByTestId("rpt-sign-off").isEnabled()), "sign-off opens when everything is reviewed", 10000);
      await shot(page, "ready");
    });

    await step("A sentence with no source stops sign-off until it has one again", async () => {
      await open("church_today");
      const sentence = body.getByTestId("rpt-sentence").first();
      await sentence.locator("button.main").click();
      await page.getByTestId("rpt-sources").getByRole("button", { name: "Take this source off the sentence" }).first().click();
      await page.getByTestId("rpt-needs-source").waitFor({ timeout: 10000 });
      await sentence.getByTestId("rpt-mark").getByText("No source").waitFor();
      await body.getByTestId("rpt-review").click();
      await until(async () => (await status("church_today")) === "reviewed", "reviewed again");
      assert.equal(await page.getByTestId("rpt-sign-off").isDisabled(), true, "sign-off stays shut");
      assert.match(await page.getByTestId("rpt-blockers").innerText(), /1 sentence with no source/);
      await shot(page, "unsourced");
      const choice = page.getByTestId("rpt-add-source");
      await choice.hover();
      await until(async () => (await choice.locator("option").count()) > 1, "the section's records are offered", 10000);
      await choice.selectOption({ index: 1 });
      await until(async () => (await page.getByTestId("rpt-needs-source").count()) === 0, "the source is back", 10000);
      await until(async () => (await status("church_today")) === "edited", "the change took the review away");
      await body.getByTestId("rpt-review").click();
      await until(async () => await page.getByTestId("rpt-sign-off").isEnabled(), "sign-off opens again", 10000);
    });

    await step("A co-facilitator cannot sign off, and the lead can", async () => {
      const coContext = await browser!.newContext({ viewport: { width: 1360, height: 1200 } }); await coContext.addCookies(co.cookies(app.origin));
      const copage = await coContext.newPage(); await copage.goto(url);
      await copage.getByTestId("rpt-sign-off").waitFor({ timeout: 15000 });
      assert.equal(await copage.getByTestId("rpt-sign-off").isDisabled(), true, "disabled for a co-facilitator");
      assert.match(await copage.getByTestId("rpt-blockers").innerText(), /Only the lead facilitator signs off/);
      const refused = await coContext.request.post(`${app.origin}/api/control/${room}/report`, { headers: { Origin: app.origin }, data: { action: "sign_off", id: randomUUID() } });
      assert.equal(refused.status(), 409); assert.equal((await refused.json()).status, "lead_only");
      await coContext.close();
      await page.getByTestId("rpt-sign-off").click();
      await page.getByTestId("rpt-signed").waitFor({ timeout: 15000 });
      const row = (await sql.query("select n,jsonb_array_length(snapshot->'sections')::int sections from private.report_sign_offs where engagement_id=$1 and not deleted", [room])).rows;
      assert.deepEqual(row, [{ n: 1, sections: 14 }]);
      assert.equal(await page.getByTestId("rpt-signoff").getAttribute("data-state"), "signed");
      await shot(page, "signed");
      await page.goto(`${app.origin}/control/${room}/after`);
      assert.match(await page.getByTestId("after-report").innerText(), /Signed off as version 1/);
    });

    await step("Editing after sign-off says the report has changed, and the next sign-off is version 2", async () => {
      await page.goto(url);
      await open("closing");
      const first = body.getByTestId("rpt-sentence").first();
      await first.locator("button.main").click(); await first.getByTestId("rpt-edit").click();
      await first.getByTestId("rpt-edit-text").fill("The team carries this forward in prayer.");
      await first.getByTestId("rpt-edit-save").click();
      await until(async () => (await page.getByTestId("rpt-signoff").getAttribute("data-state")) === "changed", "the bar says it changed", 10000);
      await body.getByTestId("rpt-review").click();
      await until(async () => await page.getByTestId("rpt-sign-off").isEnabled(), "ready again", 10000);
      await page.getByTestId("rpt-sign-off").click();
      await until(async () => (await sql.query("select count(*)::int n from private.report_sign_offs where engagement_id=$1 and not deleted", [room])).rows[0].n === 2, "version 2", 15000);
      assert.ok((await sql.query("select snapshot::text like '%in prayer%' as has from private.report_sign_offs where engagement_id=$1 and n=1", [room])).rows[0].has === false, "version 1 is kept as it was signed");
    });

    await step("Nobody else reaches it, a request from another origin is refused, and no person reaches the model", async () => {
      const anon = await fetch(`${app.origin}/api/control/${room}/report`);
      assert.ok([401, 403].includes(anon.status), `anonymous refused, got ${anon.status}`);
      const other = await browser!.newContext(); await other.addCookies(stranger.cookies(app.origin));
      assert.equal((await other.request.get(`${app.origin}/api/control/${room}/report`)).status(), 403, "another engagement's facilitator is denied");
      for (const data of [{ action: "draft", id: randomUUID(), scope: "all" }, { action: "sign_off", id: randomUUID() }, { action: "add", section: randomUUID(), text: "x" }]) {
        const post = await other.request.post(`${app.origin}/api/control/${room}/report`, { headers: { Origin: app.origin }, data });
        assert.equal(post.status(), 403, `${data.action} is refused`);
      }
      await other.close();
      const cross = await context.request.post(`${app.origin}/api/control/${room}/report`, { headers: { Origin: "https://example.org" }, data: { action: "draft", id: randomUUID(), scope: "all" } });
      assert.equal(cross.status(), 403);
      const people = (await sql.query("select name from public.attendees where engagement_id=$1 and not deleted", [room])).rows.map(r => r.name as string).filter(n => n && n.length > 3);
      const speakers = (await sql.query("select distinct speaker from private.scribe_cards where engagement_id=$1 and speaker is not null", [room])).rows.map(r => r.speaker as string);
      const sent = (await sql.query("select string_agg(coalesce(inputs::text,'')||coalesce(output::text,'')||coalesce(error,''),' ') as t from private.ai_runs where engagement_id=$1 and job='draft_report'", [room])).rows[0].t as string;
      for (const n of [...people, ...speakers]) assert.ok(!sent.includes(n), `${n} never reaches the model or comes back`);
      assert.ok(!/@[a-z0-9-]+\.(org|co|test)/i.test(sent), "no email either");
      const state = (await sql.query("select to_jsonb(r)::text as t from public.room_states r where engagement_id=$1", [room])).rows[0];
      assert.ok(!state || !/Our own read|The team heard it plainly/.test(String(state.t)), "the report never reaches the room's state");
    });

    await step("Before the report's functions are in the database the link and the hub's tile fail quietly", async () => {
      const reload = () => sql.query("notify pgrst, 'reload schema'");
      await sql.query("alter function public.report_state(uuid) rename to report_state_off"); renamed = true; await reload();
      try {
        await until(async () => { await page.goto(`${app.origin}/control/${room}`); await page.getByRole("heading", { name: /Room|Live/ }).first().waitFor({ timeout: 10000 }).catch(() => {}); return (await page.getByTestId("after-link").count()) === 0 && (await page.locator(".ctl-private").count()) > 0; }, "the link is gone and the control surface is still there", 45000);
        await until(async () => { await page.goto(`${app.origin}/control/${room}/after`); return /isn’t available yet/.test(await page.getByTestId("after-report").innerText()); }, "the hub's tile says it isn't here yet", 45000);
        assert.ok(!/error|went wrong/i.test(await page.locator("main").innerText()), "and no complaint");
      } finally { await sql.query("alter function public.report_state_off(uuid) rename to report_state"); renamed = false; await reload(); }
      await until(async () => { await page.goto(`${app.origin}/control/${room}`); return await page.getByTestId("after-link").waitFor({ timeout: 5000 }).then(() => true, () => false); }, "the link comes back", 45000);
    });

    console.log(`Report kit: ${passed.length} checks passed.`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally {
    if (renamed) await sql.query("alter function public.report_state_off(uuid) rename to report_state").catch(() => {});
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
