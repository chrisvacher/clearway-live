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
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@supabase/supabase-js";
import { db, engagement, facilitator, localEnv, sessionCookies, startApp, until } from "./harness";

const controlDir = join(tmpdir(), `clearway-report-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
const fake = (value: { delayMs?: number; fail?: boolean; failSection?: string }) => writeFileSync(controlFile, JSON.stringify(value));
fake({});
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, ANTHROPIC_API_KEY: "", CLEARWAY_AI_REPORT_SLOW_MS: "60000" });

const room = "90000000-0000-4000-8000-000000000011";
const order = ["overview", "church_today", "process", "heard", "interviews", "tensions", "future", "vision", "risks", "outlook", "intent", "decisions", "visibility", "closing"];
const headings = ["Overview", "The Church Today", "The Process", "What We Heard", "Leadership Interviews", "Strategic Tensions", "The 10-year Future", "The 3-year Vision", "Risks and Roadblocks", "The 1-year Outlook", "Commander's Intent", "Decisions", "Make the Vision Visible", "Closing"];

// The export's files, read the way a person's tools would: the Word file unzipped, the PDF's text extracted.
const docxText = async (body: Buffer) => { const zip = await JSZip.loadAsync(body), xml = await zip.file("word/document.xml")!.async("string");
  const header = (await Promise.all(Object.keys(zip.files).filter(n => /^word\/header\d*\.xml$/.test(n)).map(n => zip.file(n)!.async("string")))).join("");
  return { xml, header, media: Object.keys(zip.files).filter(n => /^word\/media\//.test(n)), texts: [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1].replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"')) }; };
const pdfText = async (body: Buffer) => (await extractText(await getDocumentProxy(new Uint8Array(body)), { mergePages: true })).text as string;

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

    await step("After the retreat is on the control surface and the hub lists the report, the visibility plan, the Check-ins tile and the Share tile linked", async () => {
      await page.goto(`${app.origin}/control/${room}`);
      await page.getByTestId("after-link").waitFor({ timeout: 20000 });
      await page.getByTestId("after-link").click();
      await page.getByTestId("after-hub").waitFor({ timeout: 15000 });
      assert.match(await page.getByTestId("after-report").innerText(), /Not drafted yet/);
      assert.match(await page.getByTestId("after-visibility").innerText(), /Not drafted yet/);
      assert.equal(await page.getByTestId("after-share").getAttribute("href"), `/control/${room}/share`, "the Share tile opens the share page");
      assert.match(await page.getByTestId("after-share").innerText(), /Available once Day 2 closes/);
      assert.equal(await page.getByTestId("after-checkins").getAttribute("href"), `/control/${room}/check-ins`, "the Check-ins tile opens the check-ins");
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
      // Earlier kits (read-only) draft in this room too; only this kit's runs count.
      const since = (await sql.query("select now() as t")).rows[0].t as Date;
      await page.getByTestId("rpt-draft").click();
      await page.getByTestId("rpt-grid").waitFor({ timeout: 30000 });
      assert.deepEqual((await page.locator('[data-testid^="rpt-section-"]').evaluateAll(els => els.map(e => e.getAttribute("data-testid")!.replace("rpt-section-", "")))), order, "fourteen sections, in the report's order");
      assert.deepEqual(await page.locator(".rpt-li .h > span").allInnerTexts(), headings);
      // The first failure is retried after a pause; the kit skips the pause.
      await until(async () => { const r = (await sql.query("select attempts from private.report_rounds where engagement_id=$1 and not deleted and status='pending'", [room])).rows[0]; return r && r.attempts >= 1; }, "the first failure", 40000);
      await sql.query("update private.report_rounds set last_failed_at=now()-interval '5 minutes' where engagement_id=$1 and not deleted", [room]);
      await until(async () => (await secs()).every(s => s.status !== "drafting"), "every section is done", 60000);
      const runs = (await sql.query("select output->>'section' as section, status from private.ai_runs where engagement_id=$1 and job='draft_report' and session_id is null and created_at >= $2 order by created_at", [room, since])).rows as { section: string | null; status: string }[];
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

    await step("Thin data is labelled on the sentence that rests on the thin survey finding", async () => {
      await open("heard");
      await body.getByTestId("rpt-thin").first().waitFor({ timeout: 10000 });
      assert.match(await body.getByTestId("rpt-thin").first().innerText(), /Thin data: 6 of 87 respondents/);
      assert.match(await body.getByTestId("rpt-sentences").innerText(), /Respondents under 30/);
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
      await page.getByRole("button", { name: "Go back to the draft wording" }).click();
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
      // The 10-year Future is the signed off lens summaries word for word, and it cannot be edited here.
      const expected = (await sql.query(`select s.text from generate_series(1,5) g(lens) join private.lens_summaries l on l.engagement_id=$1 and l.lens=g.lens and l.state='signed_off' and not l.deleted
        join private.lens_summary_sentences s on s.version_id=l.signed_off_version_id and not s.deleted order by g.lens,s.position,s.id`, [room])).rows.map(r => r.text as string);
      assert.ok(expected.length >= 5, "the seeded room signed off its lens summaries");
      const shown = await table.getByTestId("rpt-part").evaluateAll(els => els.map(e => e.textContent ?? ""));
      assert.equal(shown.length, expected.length, "one line for each signed off sentence");
      expected.forEach((t, i) => assert.ok(shown[i].includes(t), `line ${i + 1} is the signed off sentence word for word`));
      assert.equal((await sql.query("select private.rp_future_ok($1) as ok", [room])).rows[0].ok, true, "and the database agrees");
      await body.getByTestId("rpt-picked").getByTestId("rpt-frozen").waitFor();
      assert.equal(await body.getByTestId("rpt-edit").count() + await body.getByTestId("rpt-remove").count(), 0, "with no way to edit or remove it");
      await shot(page, "future");
      await open("decisions");
      const grid = body.getByTestId("rpt-table");
      const rowsBefore = await grid.locator("tbody tr").count();
      assert.ok(rowsBefore >= 1, "the decisions are rows");
      await until(async () => body.getByTestId("rpt-refresh").isEnabled(), "and Refresh from the records is there", 15000);
      // A cell reads the live sentence: an edit shows in the table, a removal takes the row away, and Refresh brings the row back.
      await grid.getByTestId("rpt-cell-sentence").first().click();
      await body.getByTestId("rpt-picked").getByTestId("rpt-edit").click();
      await body.getByTestId("rpt-edit-text").fill("We will launch the five outcomes a season apart, starting in the spring.");
      await body.getByTestId("rpt-edit-save").click();
      await until(async () => /starting in the spring/.test(await grid.innerText().catch(() => "")), "the table shows the edit", 10000);
      await body.getByTestId("rpt-picked").getByTestId("rpt-remove").click();
      await until(async () => (await body.getByTestId("rpt-table").count()) === 0 || (await body.getByTestId("rpt-table").locator("tbody tr").count()) === rowsBefore - 1, "the row goes with its sentence", 10000);
      await body.getByTestId("rpt-refresh").click();
      if (await body.getByTestId("rpt-ask-yes").count()) await body.getByTestId("rpt-ask-yes").click();
      await until(async () => (await body.getByTestId("rpt-table").count()) === 1 && (await body.getByTestId("rpt-table").locator("tbody tr").count()) === rowsBefore, "Refresh brings the row back", 10000);
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

    await step("Export: the signed off version is refused before sign-off, and the draft downloads as Word and PDF marked Draft", async () => {
      const get = (query: string) => context.request.get(`${app.origin}/api/control/${room}/report/export?${query}`);
      const none = await get("format=docx&version=signed");
      assert.equal(none.status(), 409); assert.equal((await none.json()).status, "not_signed");
      assert.equal((await get("format=rtf&version=draft")).status(), 422);
      const word = await get("format=docx&version=draft");
      assert.equal(word.status(), 200);
      assert.match(word.headers()["content-type"], /wordprocessingml/);
      assert.match(decodeURIComponent(word.headers()["content-disposition"]), /Wayfinding Report \(Draft\)\.docx/);
      const d = await docxText(await word.body());
      assert.ok(d.header.includes("DRAFT") && d.texts.includes("Draft. This report has not been signed off."), "every page says Draft");
      const pdf = await get("format=pdf&version=draft");
      assert.equal(pdf.status(), 200); assert.match(pdf.headers()["content-type"], /application\/pdf/);
      assert.match(decodeURIComponent(pdf.headers()["content-disposition"]), /Wayfinding Report \(Draft\)\.pdf/);
      assert.ok((await pdfText(await pdf.body())).replace(/\s+/g, "").includes("DRAFT"));
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

    await step("Export: after sign-off both files carry the 14 headings in order, Plus Jakarta Sans, the logo and the signed words, with no Draft mark, source markers or dashes", async () => {
      const get = (query: string) => context.request.get(`${app.origin}/api/control/${room}/report/export?${query}`);
      const word = await get("format=docx&version=signed");
      assert.equal(word.status(), 200);
      assert.match(decodeURIComponent(word.headers()["content-disposition"]), /Wayfinding Report\.docx/);
      assert.ok(!/\(Draft\)/.test(decodeURIComponent(word.headers()["content-disposition"])), "no Draft in the file name");
      const d = await docxText(await word.body());
      let at = 0;
      for (const h of headings) { const i = d.texts.indexOf(h, at); assert.ok(i >= at, `${h} in order`); at = i + 1; }
      assert.ok(d.xml.includes('w:ascii="Plus Jakarta Sans"') && d.media.length > 0, "the font and the logo");
      assert.ok(!d.header.includes("DRAFT") && !d.texts.some(x => x.includes("Draft")), "no Draft mark on a signed report");
      const joined = d.texts.join("\n");
      assert.ok(joined.includes("The team carries this forward in prayer."), "the newest signed version");
      assert.ok(!/[\u2013\u2014]/.test(joined) && !joined.includes(";"), "no dashes or semicolons");
      const sources = (await sql.query("select distinct r.kind from private.report_sources r where r.engagement_id=$1 and not r.deleted", [room])).rows.length;
      assert.ok(sources > 0 && !/Source|Sources|source marker/.test(joined.replace(/Sources?\b(?= of)/g, "")) , "no source markers");
      const lens = (await sql.query(`select s.text from generate_series(1,5) g(lens) join private.lens_summaries l on l.engagement_id=$1 and l.lens=g.lens and l.state='signed_off' and not l.deleted
        join private.lens_summary_sentences s on s.version_id=l.signed_off_version_id and not s.deleted order by g.lens,s.position,s.id`, [room])).rows.map(r => r.text as string);
      for (const line of lens) assert.ok(joined.includes(line.replace(/\s*[\u2013\u2014]\s*/g, " - ")), "the 10-year Future is in the file word for word");
      const pdf = await get("format=pdf&version=signed");
      assert.equal(pdf.status(), 200);
      const text = await pdfText(await pdf.body());
      let from = 0;
      for (const h of headings) { const i = text.indexOf(`\n${h}\n`, from); assert.ok(i >= from, `${h} in the PDF in order`); from = i + 1; }
      assert.ok(!text.replace(/\s+/g, "").includes("DRAFT") && !/[\u2013\u2014]/.test(text) && text.includes("The team carries this forward in prayer."));
      const other = await browser!.newContext(); await other.addCookies(stranger.cookies(app.origin));
      assert.equal((await other.request.get(`${app.origin}/api/control/${room}/report/export?format=docx&version=signed`)).status(), 403, "another engagement's facilitator is denied");
      await other.close();
      assert.ok([401, 403].includes((await fetch(`${app.origin}/api/control/${room}/report/export?format=pdf&version=signed`)).status), "and so is an anonymous browser");
    });

    await step("Export: a co-facilitator can export, a participant, the scribe and a TV cannot, and an edit after sign-off is in the draft file but not the signed one", async () => {
      const url = (query: string) => `${app.origin}/api/control/${room}/report/export?${query}`;
      const coContext = await browser!.newContext(); await coContext.addCookies(co.cookies(app.origin));
      assert.equal((await coContext.request.get(url("format=docx&version=signed"))).status(), 200, "a co-facilitator exports the signed report");
      assert.equal((await coContext.request.get(url("format=pdf&version=draft"))).status(), 200, "and the draft");
      await coContext.close();
      // Room roles hold sessions that are not Clearway facilitators' (a participant's phone, the scribe's console, a paired TV): none reaches the export.
      const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      for (const role of ["participant", "scribe", "tv"]) {
        const link = await admin.auth.admin.generateLink({ type: "magiclink", email: `${role}-${randomUUID().slice(0, 8)}@example.org` }); assert.equal(link.error, null);
        const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
        const verified = await anon.auth.verifyOtp({ token_hash: link.data.properties!.hashed_token, type: link.data.properties!.verification_type as "magiclink" }); assert.equal(verified.error, null);
        const ctx = await browser!.newContext(); await ctx.addCookies(sessionCookies(verified.data.session!, app.origin));
        for (const q of ["format=docx&version=signed", "format=pdf&version=draft", "format=model&version=draft"]) assert.ok([401, 403].includes((await ctx.request.get(url(q))).status()), `${role} refused for ${q}`);
        await ctx.close();
      }
      // An edit after sign-off reaches the draft file and not the signed one.
      const edited = "Edited after the sign-off, for the draft only.";
      const sentence = (await sql.query("select x.id from private.report_sentences x join private.report_sections s on s.id=x.section_id where x.engagement_id=$1 and s.key='closing' and not x.deleted order by x.position limit 1", [room])).rows[0].id as string;
      const saved = await context.request.post(`${app.origin}/api/control/${room}/report`, { headers: { Origin: app.origin }, data: { action: "edit", sentence, text: edited } });
      assert.equal(saved.status(), 200);
      const signed = await docxText(await (await context.request.get(url("format=docx&version=signed"))).body());
      assert.ok(!signed.texts.join("\n").includes(edited), "the signed Word file lacks the edit");
      assert.ok(!(await pdfText(await (await context.request.get(url("format=pdf&version=signed"))).body())).includes(edited), "and so does the signed PDF");
      const draft = await docxText(await (await context.request.get(url("format=docx&version=draft"))).body());
      assert.ok(draft.texts.join("\n").includes(edited), "the draft Word file has it");
      assert.ok((await pdfText(await (await context.request.get(url("format=pdf&version=draft"))).body())).includes(edited), "and so does the draft PDF");
    });

    await step("The page offers the downloads and a preview, and the Word button saves the file", async () => {
      await page.goto(url);
      await page.getByTestId("rpt-export").waitFor({ timeout: 15000 });
      await page.getByTestId("rpt-preview").waitFor({ timeout: 15000 });
      assert.match(await page.getByTestId("rpt-preview").innerText(), /Wayfinding Report/);
      const [file] = await Promise.all([page.waitForEvent("download"), page.getByTestId("rpt-download-docx").click()]);
      assert.match(file.suggestedFilename(), /^.+ Wayfinding Report\.docx$/);
      await page.getByTestId("rpt-version-draft").check();
      await page.getByTestId("rpt-draft-note").waitFor();
      const [draft] = await Promise.all([page.waitForEvent("download"), page.getByTestId("rpt-download-pdf").click()]);
      assert.match(draft.suggestedFilename(), /Wayfinding Report \(Draft\)\.pdf$/);
      await shot(page, "export");
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

    await step("The page polls the light status call and reads the whole state only when something changed", async () => {
      await page.goto(url);
      await page.getByTestId("rpt-grid").waitFor({ timeout: 15000 });
      let pulses = 0, full = 0;
      const seen = (request: { url: () => string; method: () => string }) => {
        const u = new URL(request.url());
        if (request.method() !== "GET" || !u.pathname.endsWith(`/api/control/${room}/report`)) return;
        if (u.searchParams.get("pulse")) pulses++; else if (!u.searchParams.get("probe") && !u.searchParams.get("candidates")) full++;
      };
      page.on("request", seen);
      await delay(9500);
      assert.ok(pulses >= 2, `the light call is polled (${pulses})`);
      assert.ok(full <= 1, `the whole state is not (${full} reads in nine seconds)`);
      // A change made elsewhere reaches the page through the stamp.
      const reads = full;
      await sql.query("update private.report_sections set updated_at=clock_timestamp() where engagement_id=$1 and key='closing' and not deleted", [room]);
      await until(async () => full > reads, "the page reads the whole state when the stamp moves", 10000);
      page.off("request", seen);
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
