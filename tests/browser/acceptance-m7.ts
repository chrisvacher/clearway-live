// Milestone 7 acceptance, step 6: after the retreat, end to end on the seeded Riverside engagement, in real browsers against the production build and
// the local stack, with the scripted fake model (never the API) and the harness mailbox standing in for Resend. One run, the way Chris will use it:
// Close the day on Day 2 (and Mark the retreat closed, with Undo), draft the report (14 sections in order, sources on every AI sentence, the aligned
// signal saved as a citation in What We Heard, the 10-year Future word for word, a thin label), edit it, review every section and sign it off, export
// Word and PDF (headings in order, no source markers, no dashes), draft the visibility plan and see it as the report's Make the Vision Visible table,
// sign off again, make a share link and open it on a phone-size and a laptop-size page (no inputs, the plan, goals with owners, the signed report),
// turn it off (the plain page at once), run the scheduled check-in at the 30-day date (CLEARWAY_NOW) so one email goes to each owner and to nobody
// else, every owner answers on the phone page, the facilitator reads the results and the follow-ups, and a new link shows each owner's status.
// The owners' addresses are changed to example.org for the run (the seed's .example addresses are practice addresses, which are never emailed), and
// put back afterward. KIT_SHOTS=<folder> saves the screens. Local only: no real email, Team Hub, CORE or clearway.co.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { db, facilitator, localEnv, mailbox, startApp, until } from "./harness";

const controlDir = join(tmpdir(), `clearway-m7-acc-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
writeFileSync(controlFile, "{}");
const secret = `kit-${randomUUID()}`;
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, ANTHROPIC_API_KEY: "", CLEARWAY_AI_REPORT_SLOW_MS: "60000", CLEARWAY_AI_PLAN_SLOW_MS: "60000", CRON_SECRET: secret });

const room = "90000000-0000-4000-8000-000000000011";
const order = ["overview", "church_today", "process", "heard", "interviews", "tensions", "future", "vision", "risks", "outlook", "intent", "decisions", "visibility", "closing"];
const headings = ["Overview", "The Church Today", "The Process", "What We Heard", "Leadership Interviews", "Strategic Tensions", "The 10-year Future", "The 3-year Vision", "Risks and Roadblocks", "The 1-year Outlook", "Commander's Intent", "Decisions", "Make the Vision Visible", "Closing"];
const outward = ["lead_pastor", "participants", "board", "staff", "key_leaders", "congregation"];
const apostrophe = (s: string) => s.replace(/[’]/g, "'");
const dash = /[–—]/;
const plus = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

// The export's files, read the way a person's tools would: the Word file unzipped, the PDF's text extracted.
const docxText = async (body: Buffer) => { const zip = await JSZip.loadAsync(body), xml = await zip.file("word/document.xml")!.async("string");
  const header = (await Promise.all(Object.keys(zip.files).filter(n => /^word\/header\d*\.xml$/.test(n)).map(n => zip.file(n)!.async("string")))).join("");
  return { xml, header, media: Object.keys(zip.files).filter(n => /^word\/media\//.test(n)), texts: [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1].replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"')) }; };
const pdfText = async (body: Buffer) => (await extractText(await getDocumentProxy(new Uint8Array(body)), { mergePages: true })).text as string;

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  let app: Awaited<ReturnType<typeof startApp>> | undefined, browser: Browser | undefined;
  type Saved = { engagement: { settings: unknown; status: string; day2_closed_at: string | null }; roles: { clearway_user_id: string; role: string }[]; sessions: { id: string; state: string; closed_at: string | null }[];
    attendees: { id: string; email: string }[]; goals: { id: string; owner_email: string | null }[]; steps: { id: string; owner_email: string | null }[] };
  let saved: Saved | undefined, kitUsers: string[] = [];
  const passed: string[] = [], startedAt = new Date().toISOString();
  const shot = async (page: Page, name: string, full = true) => { if (process.env.KIT_SHOTS) { await delay(700); await page.screenshot({ path: `${process.env.KIT_SHOTS}/acceptance-m7-${name}.png`, fullPage: full }); } };
  const step = async (name: string, run: () => Promise<void>) => { const t0 = Date.now(); await run(); passed.push(`${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); console.log(`ok · ${name}`); };
  const wipe = async () => {
    await sql.query("select private.vp_clear($1::uuid,false)", [room]);
    await sql.query("select private.rp_clear($1::uuid,false)", [room]);
    await sql.query("update private.report_rounds set deleted=true where engagement_id=$1", [room]);
    await sql.query("delete from private.report_sign_offs where engagement_id=$1", [room]);
    await sql.query("select private.check_in_clear($1::uuid)", [room]);
    await sql.query("delete from private.read_only_links where engagement_id=$1", [room]);
    await sql.query("update public.engagements set day2_closed_at=null where id=$1", [room]);
  };
  try {
    await sql.connect();
    const row = (await sql.query("select settings,status::text as status,day2_closed_at,retreat_end_date::text as end_date from public.engagements where id=$1 and not deleted", [room])).rows[0];
    assert.ok(row, "Run npm run db:seed first: the kit reads the seeded Riverside engagement");
    assert.ok(row.end_date, "Riverside has a retreat end date");
    // The 30-day round is due thirty days after the retreat's last day. The app is started with that day as its clock.
    const base = row.end_date as string, due = { 30: plus(base, 30), 60: plus(base, 60), 90: plus(base, 90) };
    process.env.CLEARWAY_NOW = due[30];
    saved = { engagement: row, roles: (await sql.query("select clearway_user_id,role::text from public.engagement_facilitators where engagement_id=$1 and not deleted", [room])).rows,
      sessions: (await sql.query("select id,state,closed_at from public.sessions where engagement_id=$1 and part='Day 2' and not deleted", [room])).rows,
      attendees: (await sql.query("select id,email from public.attendees where engagement_id=$1", [room])).rows,
      goals: (await sql.query("select id,owner_email from private.goals where engagement_id=$1", [room])).rows, steps: (await sql.query("select id,owner_email from private.first_steps where engagement_id=$1", [room])).rows };
    // The seed's addresses end in .example, which the check-ins never email. For this run they are example.org, and the mailbox is the harness's.
    const real = (email: string | null) => email && email.replace(/\.example$/, ".example.org").replace(/@riverside\.example\.org$/, "@riverside.example.org");
    await sql.query("update public.attendees set email=regexp_replace(email,'\\.example$','.example.org') where engagement_id=$1", [room]);
    await sql.query("update private.goals set owner_email=regexp_replace(owner_email,'\\.example$','.example.org') where engagement_id=$1 and owner_email is not null", [room]);
    await sql.query("update private.first_steps set owner_email=regexp_replace(owner_email,'\\.example$','.example.org') where engagement_id=$1 and owner_email is not null", [room]);
    assert.equal(real("naomi.okafor@riverside.example"), "naomi.okafor@riverside.example.org");
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}', status='retreat' where id=$1", [room]);
    const fac = await facilitator(env, sql, room);
    const leadId = (await sql.query("select id from public.clearway_users where auth_user_id=$1", [fac.session.user.id])).rows[0].id as string;
    kitUsers = [leadId];
    await sql.query("update public.engagement_facilitators set role='co_facilitator' where engagement_id=$1 and clearway_user_id<>$2 and not deleted", [room, leadId]);
    await sql.query("update public.engagement_facilitators set role='lead' where engagement_id=$1 and clearway_user_id=$2", [room, leadId]);
    await wipe();
    // Day 2's step is open again, so Close the day has something to close. Other engagements' check-ins are put away so the counts are this room's.
    await sql.query("update public.sessions set state='live',closed_at=null where engagement_id=$1 and part='Day 2' and not deleted", [room]);
    const quiet = () => sql.query("update private.check_in_rounds set status='off' where engagement_id<>$1 and status in ('scheduled','sending')", [room]);
    await quiet();
    app = await startApp(env, mail.url);
    const origin = app.origin;

    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1360, height: 1500 } });
    await context.addCookies(fac.cookies(origin));
    const page = await context.newPage();
    const control = `${origin}/control/${room}`, hub = `${control}/after`, reportUrl = `${control}/report`, shareUrl = `${control}/share`, resultsUrl = `${control}/check-ins`;
    const secs = async () => (await sql.query("select key,status,kind from private.report_sections where engagement_id=$1 and not deleted order by position", [room])).rows as { key: string; status: string; kind: string }[];
    const status = async (key: string) => (await secs()).find(s => s.key === key)?.status;
    const open = async (key: string) => { await page.getByTestId(`rpt-section-${key}`).click(); await page.locator(`[data-testid="rpt-body"][data-key="${key}"]`).waitFor(); };
    const body = page.getByTestId("rpt-body");
    const signOffs = async () => (await sql.query("select n from private.report_sign_offs where engagement_id=$1 and not deleted order by n", [room])).rows.map(r => r.n as number);
    const rounds = async () => (await sql.query("select day,due_on::text,status from private.check_in_rounds where engagement_id=$1 order by day", [room])).rows as { day: number; due_on: string; status: string }[];
    const reviewAll = async () => {
      for (const key of order) {
        await open(key);
        const review = body.getByTestId("rpt-review");
        if (await review.count()) { await until(async () => await review.isEnabled(), `${key} can be reviewed`, 10000); if ((await status(key)) !== "reviewed") await review.click(); }
        await until(async () => (await status(key)) === "reviewed", `${key} is reviewed`, 10000);
      }
    };
    const get = (query: string) => context.request.get(`${origin}/api/control/${room}/report/export?${query}`);
    const viewer = async (kind: "laptop" | "phone"): Promise<{ ctx: BrowserContext; page: Page }> => {
      const ctx = await browser!.newContext(kind === "phone" ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
      return { ctx, page: await ctx.newPage() };
    };
    const makeLink = async (name: string) => {
      await page.goto(shareUrl);
      await page.getByTestId("share-name").fill(name);
      await page.getByTestId("share-make").click();
      await page.getByTestId("share-url").waitFor({ timeout: 15000 });
      return (await page.getByTestId("share-url").innerText()).trim();
    };
    const planRows = async () => (await sql.query("select id,stage,who,what_they_hear,position from private.visibility_plan_rows where engagement_id=$1 and not deleted order by position", [room])).rows as { id: string; stage: string; who: string; what_they_hear: string; position: number }[];
    const gone = "This link isn’t available";

    // ---------- Close the day ----------
    await step("Close the day on Day 2 closes the retreat and sets the 30, 60 and 90-day check-ins", async () => {
      assert.equal((await sql.query("select day2_closed_at from public.engagements where id=$1", [room])).rows[0].day2_closed_at, null);
      await page.goto(control);
      await page.getByRole("button", { name: "Close Day 2", exact: true }).waitFor({ timeout: 20000 });
      await page.getByRole("button", { name: "Close Day 2", exact: true }).click();
      await page.getByRole("button", { name: "Tap again to close Day 2" }).click();
      await until(async () => (await sql.query("select day2_closed_at from public.engagements where id=$1", [room])).rows[0].day2_closed_at, "Day 2 closed is recorded", 15000);
      assert.deepEqual((await rounds()).map(r => [r.day, r.due_on, r.status]), [[30, due[30], "scheduled"], [60, due[60], "scheduled"], [90, due[90], "scheduled"]], "the check-in rounds are made, thirty days apart from the retreat's last day");
      await page.goto(hub);
      await page.getByTestId("retreat-closed").waitFor({ timeout: 20000 });
      assert.match(await page.getByTestId("retreat-closed").innerText(), /The retreat closed on/);
      assert.match(await page.getByTestId("after-share").innerText(), /link|Make/i);
      assert.ok(!/[–—]/.test(await page.locator("main").innerText()), "no dashes in the copy");
      await shot(page, "hub-after-close");
    });

    await step("Undo takes the close back (before any check-in goes out) and Mark the retreat closed makes it again", async () => {
      await page.getByTestId("retreat-undo").click();
      assert.match(await page.getByTestId("retreat-close").innerText(), /taken away/);
      await page.getByTestId("retreat-confirm").click();
      await page.getByTestId("retreat-mark").waitFor({ timeout: 15000 });
      assert.equal((await sql.query("select day2_closed_at from public.engagements where id=$1", [room])).rows[0].day2_closed_at, null);
      assert.equal((await rounds()).length, 0, "the rounds go with it");
      await shot(page, "hub-before-mark");
      await page.getByTestId("retreat-mark").click();
      assert.match(await page.getByTestId("retreat-close").innerText(), /Mark the retreat closed\?/);
      await page.getByTestId("retreat-confirm").click();
      await page.getByTestId("retreat-closed").waitFor({ timeout: 15000 });
      assert.deepEqual((await rounds()).map(r => [r.day, r.due_on]), [[30, due[30]], [60, due[60]], [90, due[90]]], "marking it makes the same rounds");
    });

    // ---------- The report ----------
    await step("Draft the report: 14 sections in Clearway's order, Overview and Closing last, tables built from the records", async () => {
      await page.goto(hub);
      await page.getByTestId("after-report").click();
      await page.getByTestId("rpt-draft").waitFor({ timeout: 20000 });
      await page.getByTestId("rpt-draft").click();
      await page.getByTestId("rpt-grid").waitFor({ timeout: 30000 });
      assert.deepEqual(await page.locator('[data-testid^="rpt-section-"]').evaluateAll(els => els.map(e => e.getAttribute("data-testid")!.replace("rpt-section-", ""))), order, "fourteen sections, in the report's order");
      assert.deepEqual(await page.locator(".rpt-li .h > span").allInnerTexts(), headings);
      await until(async () => { const s = await secs(); return s.length === 14 && s.every(x => x.status !== "drafting"); }, "every section is drafted", 120000);
      const runs = (await sql.query("select output->>'section' as section from private.ai_runs where engagement_id=$1 and job='draft_report' and session_id is null and status='ok' and created_at>=$2 order by created_at", [room, startedAt])).rows.map(r => r.section as string | null);
      assert.ok(runs.indexOf("overview") > runs.indexOf("tensions") && runs.indexOf("closing") === runs.length - 1, "Overview and Closing are drafted last");
      const s = await secs();
      assert.ok(s.every(x => x.status !== "needs_attention"), `no section needs attention: ${JSON.stringify(s.filter(x => x.status === "needs_attention"))}`);
      for (const k of ["future", "vision", "risks", "outlook", "intent", "decisions", "visibility"]) assert.equal(s.find(x => x.key === k)?.kind, "record", `${k} is built from the records`);
      await shot(page, "report-drafted");
    });

    await step("Every AI sentence has a source, the aligned signal saved as a citation is one in What We Heard, and the thin finding is labelled", async () => {
      const unsourced = (await sql.query(`select count(*)::int n from private.report_sentences x join private.report_sections s on s.id=x.section_id where s.engagement_id=$1 and not x.deleted and not s.deleted
        and x.origin in ('ai','room','record') and not exists(select 1 from private.report_sources r where r.sentence_id=x.id and not r.deleted)`, [room])).rows[0].n;
      assert.equal(unsourced, 0, "no sentence without a source");
      const ai = (await sql.query("select count(*)::int n from private.report_sentences x join private.report_sections s on s.id=x.section_id where s.engagement_id=$1 and not x.deleted and x.origin='ai'", [room])).rows[0].n;
      assert.ok(ai >= 10, `the model wrote sentences (${ai})`);
      await open("heard");
      const sentences = body.getByTestId("rpt-sentence");
      await until(async () => (await sentences.count()) >= 3, "What We Heard has sentences");
      assert.match(await sentences.first().getByTestId("rpt-mark").innerText(), /\d+ sources?/);
      await sentences.first().locator("button.main").click();
      await page.getByTestId("rpt-sources").getByTestId("rpt-source").first().waitFor();
      assert.ok(await page.getByTestId("rpt-sources").locator(".ovr-hl").count() >= 1, "the words the sentence used are lit");
      const signals = (await sql.query(`select r.ref_id from private.report_sources r join private.report_sentences x on x.id=r.sentence_id join private.report_sections s on s.id=x.section_id
        where s.engagement_id=$1 and s.key='heard' and r.kind='signal' and not r.deleted and not x.deleted`, [room])).rows.map(r => r.ref_id as string);
      assert.ok(signals.length >= 1, "the signal is cited");
      const savedSignals = (await sql.query("select id from private.signals where engagement_id=$1 and kind='aligned' and saved_as_citation_at is not null and not deleted", [room])).rows.map(r => r.id as string);
      assert.ok(signals.every(id => savedSignals.includes(id)), "and only an aligned signal saved as a citation");
      let found = false;
      for (let i = 0; i < await sentences.count() && !found; i++) { await sentences.nth(i).locator("button.main").click(); found = (await page.getByTestId("rpt-sources").locator('[data-kind="signal"]').count()) > 0; }
      assert.ok(found, "the panel shows the signal as a source");
      assert.match(await page.getByTestId("rpt-sources").locator('[data-kind="signal"]').first().innerText(), /Aligned signal saved as a citation/);
      await shot(page, "report-sources");
      await body.getByTestId("rpt-thin").first().waitFor({ timeout: 10000 });
      assert.match(await body.getByTestId("rpt-thin").first().innerText(), /Thin data: 6 of 87 respondents/);
      assert.match(await body.getByTestId("rpt-sentences").innerText(), /Respondents under 30/);
    });

    await step("The 10-year Future is the five signed off lens summaries word for word, and cannot be edited", async () => {
      await open("future");
      const table = body.getByTestId("rpt-table");
      await table.waitFor({ timeout: 15000 });
      const expected = (await sql.query(`select s.text from generate_series(1,5) g(lens) join private.lens_summaries l on l.engagement_id=$1 and l.lens=g.lens and l.state='signed_off' and not l.deleted
        join private.lens_summary_sentences s on s.version_id=l.signed_off_version_id and not s.deleted order by g.lens,s.position,s.id`, [room])).rows.map(r => r.text as string);
      assert.ok(expected.length >= 5, "the seeded room signed off its lens summaries");
      const shown = await table.getByTestId("rpt-part").evaluateAll(els => els.map(e => e.textContent ?? ""));
      assert.equal(shown.length, expected.length);
      expected.forEach((t, i) => assert.ok(shown[i].includes(t), `line ${i + 1} is the signed off sentence word for word`));
      assert.equal((await sql.query("select private.rp_future_ok($1) as ok", [room])).rows[0].ok, true, "and the database agrees");
      await table.getByTestId("rpt-part").first().click();
      await body.getByTestId("rpt-picked").getByTestId("rpt-frozen").waitFor();
      assert.equal(await body.getByTestId("rpt-edit").count() + await body.getByTestId("rpt-remove").count(), 0, "with no way to edit or remove it");
      await shot(page, "report-future");
    });

    await step("The facilitator edits a sentence, adds their own read and reviews every section, and sign-off waits for it", async () => {
      await open("heard");
      await delay(1500);
      const first = body.getByTestId("rpt-sentence").first();
      await first.locator("button.main").click();
      await first.getByTestId("rpt-edit").waitFor({ timeout: 10000 });
      await first.getByTestId("rpt-edit").click();
      await first.getByTestId("rpt-edit-text").fill("The team heard it plainly: newcomers cannot find a way into a group.");
      await first.getByTestId("rpt-edit-save").click();
      await until(async () => (await sql.query(`select count(*)::int n from private.report_sentences x join private.report_sections s on s.id=x.section_id where s.key='heard' and s.engagement_id=$1 and not x.deleted and not s.deleted and x.text like 'The team heard it plainly%' and x.touched`, [room])).rows[0].n === 1, "the edit is saved", 15000).catch(async e => { await shot(page, "edit-failed"); throw e; });
      await until(async () => (await status("heard")) === "edited", "the section reads Edited", 10000);
      await body.getByTestId("rpt-add-own").click();
      await body.getByTestId("rpt-add-text").fill("Our own read: this is bigger than the survey shows.");
      await body.getByTestId("rpt-add-save").click();
      const own = body.getByTestId("rpt-sentence").filter({ hasText: "Our own read" });
      await own.waitFor({ timeout: 10000 });
      assert.match(await own.getByTestId("rpt-mark").innerText(), /Yours/);
      assert.equal(await page.getByTestId("rpt-sign-off").isDisabled(), true, "sign-off waits");
      assert.match(await page.getByTestId("rpt-blockers").innerText(), /still to review/);
      await reviewAll();
      await until(async () => await page.getByTestId("rpt-sign-off").isEnabled(), "sign-off opens when everything is reviewed", 10000);
      await shot(page, "report-ready");
    });

    await step("The lead signs off: version 1 is kept as signed", async () => {
      await page.getByTestId("rpt-sign-off").click();
      await page.getByTestId("rpt-signed").waitFor({ timeout: 15000 });
      assert.deepEqual(await signOffs(), [1]);
      assert.equal((await sql.query("select jsonb_array_length(snapshot->'sections')::int n from private.report_sign_offs where engagement_id=$1 and n=1", [room])).rows[0].n, 14);
      await shot(page, "report-signed");
      await page.goto(hub);
      assert.match(await page.getByTestId("after-report").innerText(), /Signed off as version 1/);
    });

    await step("Export: the signed report downloads as Word and PDF with the 14 headings in order, the font and logo, no source markers, no dashes and the 10-year Future word for word", async () => {
      const word = await get("format=docx&version=signed");
      assert.equal(word.status(), 200);
      assert.match(decodeURIComponent(word.headers()["content-disposition"]), /Wayfinding Report\.docx/);
      const d = await docxText(await word.body());
      let at = 0;
      for (const h of headings) { const i = d.texts.indexOf(h, at); assert.ok(i >= at, `${h} in the Word file, in order`); at = i + 1; }
      assert.ok(d.xml.includes('w:ascii="Plus Jakarta Sans"') && d.media.length > 0, "Plus Jakarta Sans and the logo");
      assert.ok(!d.header.includes("DRAFT") && !d.texts.some(x => x.includes("Draft")), "no Draft mark on a signed report");
      const joined = d.texts.join("\n");
      assert.ok(!dash.test(joined) && !joined.includes(";"), "no dashes or semicolons");
      assert.ok(!/Source|Sources|source marker/.test(joined.replace(/Sources?\b(?= of)/g, "")), "no source markers");
      const lens = (await sql.query(`select s.text from generate_series(1,5) g(lens) join private.lens_summaries l on l.engagement_id=$1 and l.lens=g.lens and l.state='signed_off' and not l.deleted
        join private.lens_summary_sentences s on s.version_id=l.signed_off_version_id and not s.deleted order by g.lens,s.position,s.id`, [room])).rows.map(r => r.text as string);
      for (const line of lens) assert.ok(joined.includes(line.replace(/\s*[–—]\s*/g, " - ")), "the 10-year Future is in the Word file word for word");
      assert.ok(joined.includes("The team heard it plainly"), "and the facilitator's edit");
      const pdf = await get("format=pdf&version=signed");
      assert.equal(pdf.status(), 200); assert.match(pdf.headers()["content-type"], /application\/pdf/);
      const text = await pdfText(await pdf.body());
      let from = 0;
      for (const h of headings) { const i = text.indexOf(`\n${h}\n`, from); assert.ok(i >= from, `${h} in the PDF, in order`); from = i + 1; }
      assert.ok(!text.replace(/\s+/g, "").includes("DRAFT") && !dash.test(text), "no Draft mark and no dashes in the PDF");
      await page.goto(reportUrl);
      await page.getByTestId("rpt-export").waitFor({ timeout: 15000 });
      await page.getByTestId("rpt-preview").waitFor({ timeout: 15000 });
      await shot(page, "report-export");
    });

    // ---------- The visibility plan ----------
    await step("The visibility plan is drafted from what the room said: rows in the outward order, each with sources, no when without a public date", async () => {
      await page.goto(hub);
      await page.getByTestId("after-visibility").click();
      await page.getByTestId("vp-draft").waitFor({ timeout: 20000 });
      await page.getByTestId("vp-draft").click();
      await page.getByTestId("vp-table").waitFor({ timeout: 40000 });
      await until(async () => (await sql.query("select status from private.visibility_plans where engagement_id=$1 and not deleted", [room])).rows[0]?.status === "drafted", "the plan is drafted", 40000);
      const rows = await planRows();
      assert.ok(rows.length >= 5, `a row for each audience the room gave a reason for (${rows.length})`);
      assert.equal(rows[0].stage, "lead_pastor"); assert.equal(rows.at(-1)!.stage, "congregation");
      const ranks = rows.map(r => outward.indexOf(r.stage));
      assert.deepEqual([...ranks].sort((a, b) => a - b), ranks, "in the outward order");
      assert.equal((await sql.query("select count(*)::int n from private.visibility_plan_rows w where w.engagement_id=$1 and not w.deleted and not exists(select 1 from private.visibility_plan_sources s where s.row_id=w.id and not s.deleted)", [room])).rows[0].n, 0, "every row has a source");
      assert.equal((await sql.query("select count(*)::int n from private.visibility_plan_rows where engagement_id=$1 and not deleted and (coalesce(when_text,'')<>'' or when_date is not null)", [room])).rows[0].n, 0, "no when is invented without a public date");
      await page.getByTestId("vp-row").first().click();
      await page.getByTestId("vp-sources").getByTestId("rpt-source").first().waitFor({ timeout: 10000 });
      assert.ok(!dash.test(await page.getByTestId("vp-table").innerText()), "no dashes in the plan");
      await shot(page, "plan-drafted");
    });

    await step("The plan reaches the report's Make the Vision Visible section, which blocks sign-off until it is refreshed, and the lead signs off version 2", async () => {
      await page.goto(reportUrl);
      await page.getByTestId("rpt-grid").waitFor({ timeout: 20000 });
      await open("visibility");
      await page.getByTestId("rpt-plan-stale").waitFor({ timeout: 15000 });
      assert.notEqual(await status("visibility"), "reviewed", "the plan changing took the review away");
      const refused = await context.request.post(`${origin}/api/control/${room}/report`, { headers: { Origin: origin }, data: { action: "sign_off", id: randomUUID() } });
      assert.equal(refused.status(), 409, "the server refuses a sign-off until the section is refreshed");
      assert.deepEqual(await signOffs(), [1]);
      await shot(page, "report-plan-stale");
      await body.getByTestId("rpt-refresh").click();
      if (await body.getByTestId("rpt-ask-yes").count()) await body.getByTestId("rpt-ask-yes").click();
      const t = body.getByTestId("rpt-table");
      const rows = await planRows();
      await until(async () => (await t.count()) === 1 && (await t.locator("tbody tr").count()) >= rows.length, "the plan is the table", 20000);
      const text = await t.innerText();
      for (const r of rows) assert.ok(text.includes(r.who), `${r.who} is in Make the Vision Visible`);
      await page.getByTestId("rpt-plan-stale").waitFor({ state: "detached", timeout: 15000 });
      await body.getByTestId("rpt-review").click();
      await until(async () => (await status("visibility")) === "reviewed", "reviewed again", 10000);
      await page.getByTestId("rpt-sign-off").waitFor({ timeout: 15000 });
      await until(async () => await page.getByTestId("rpt-sign-off").isEnabled(), "sign-off opens again", 15000);
      await page.getByTestId("rpt-sign-off").click();
      await until(async () => (await signOffs()).length === 2, "version 2", 15000);
      assert.equal((await sql.query("select snapshot::text like $2 as has from private.report_sign_offs where engagement_id=$1 and n=1", [room, `%${rows[0].who.replace(/[%_]/g, "")}%`])).rows[0].has, false, "version 1 is kept as it was signed, without the plan");
      const word = await docxText(await (await get("format=docx&version=signed")).body());
      assert.ok(word.texts.join("\n").includes(rows[0].who), "the signed Word file carries the plan's table");
      assert.ok(!dash.test(word.texts.join("\n")));
      await shot(page, "report-signed-2");
    });

    // ---------- Share ----------
    let link = "";
    await step("A named link is made and shown once; on a phone-size and a laptop-size page it has no inputs and shows the plan, goals with owners and the signed report", async () => {
      link = await makeLink("Elders");
      assert.match(link, /\/v\/[A-Za-z0-9_-]{32}$/);
      await shot(page, "share-new");
      await page.reload();
      await page.getByTestId("share-link").first().waitFor();
      assert.equal(await page.getByTestId("share-url").count(), 0, "the link is not shown again");
      const rows = await planRows();
      for (const kind of ["phone", "laptop"] as const) {
        const v = await viewer(kind); const p = v.page;
        await p.goto(link);
        await p.getByTestId("ro-page").waitFor({ timeout: 20000 });
        const text = await p.locator("body").innerText();
        assert.match(text, /Riverside Church/i);
        assert.ok(await p.getByTestId("ro-outcome").count() >= 1, "Vision Outcomes");
        assert.ok(await p.getByTestId("ro-intent").count() >= 1, "commander's intent cards");
        const goals = await p.getByTestId("ro-goal").allInnerTexts();
        assert.ok(goals.length >= 3, "the 1-year goals");
        for (const owner of ["Priya Shah", "Daniel Brooks", "Naomi Okafor"]) assert.ok(goals.some(g => g.includes(owner)), `a goal shows its owner, ${owner}`);
        await p.getByTestId("ro-report").waitFor();
        assert.deepEqual((await p.locator("#report h3").allInnerTexts()).map(apostrophe), headings.map(apostrophe), "the 14 sections, in order");
        assert.ok((await p.locator("#report").innerText()).includes(rows[0].who), "the visibility plan is in the signed report");
        assert.equal(await p.locator("input, textarea, select, form, [contenteditable]").count(), 0, "no inputs");
        assert.equal(await p.locator('a[href*="/control"], a[href*="/setup"], a[href*="/sign-in"]').count(), 0, "no edit links");
        assert.deepEqual(await p.locator("button").allInnerTexts(), ["Print or save as PDF"], "the only button prints");
        assert.ok(!dash.test(text), "no dashes");
        assert.ok(!/@riverside\.example/.test(await p.content()), "no email in the page");
        assert.equal(await p.getByTestId("ro-goal-status").count(), 0, "no status before the first check-in");
        if (kind === "phone") assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "the phone page does not scroll sideways");
        await shot(p, `copy-${kind}`, kind === "laptop");
        await v.ctx.close();
      }
      assert.equal((await sql.query("select open_count from private.read_only_links where name='Elders'", [])).rows[0].open_count, 2, "both opens were counted");
    });

    await step("Turning the link off asks inside the panel, and the page is the plain one at once", async () => {
      await page.goto(shareUrl);
      await page.getByTestId("share-revoke").first().click();
      assert.match(await page.getByTestId("share-confirm").innerText(), /lose access at once/);
      assert.equal((await sql.query("select revoked_at from private.read_only_links where name='Elders'")).rows[0].revoked_at, null, "asking changes nothing");
      await page.getByTestId("share-revoke-yes").click();
      await until(async () => (await sql.query("select revoked_at from private.read_only_links where name='Elders'")).rows[0].revoked_at, "turned off", 10000);
      const v = await viewer("phone"), u = await viewer("laptop");
      await v.page.goto(link); await v.page.getByTestId("ro-gone").waitFor();
      await u.page.goto(`${origin}/v/${"y".repeat(32)}`);
      assert.match(await v.page.locator("body").innerText(), new RegExp(gone));
      assert.equal(await v.page.locator("body").innerText(), await u.page.locator("body").innerText(), "the same page as an unknown link");
      assert.ok(!(await v.page.locator("body").innerText()).includes("Riverside"), "nothing about the plan");
      await shot(v.page, "copy-revoked", false);
      await v.ctx.close(); await u.ctx.close();
    });

    // ---------- Check-ins ----------
    const cron = async (header?: string) => { const r = await fetch(`${origin}/api/cron/check-ins`, { headers: header ? { Authorization: header } : {}, cache: "no-store" }); return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, number | string> }; };
    const owners = [
      { name: "Priya Shah", email: "priya.shah@riverside.example.org", own: ["List every ministry lead and a possible apprentice", "Launch the apprentice pathway"] },
      { name: "Daniel Brooks", email: "daniel.brooks@riverside.example.org", own: ["Develop a leader in every 1:1"] },
      { name: "Naomi Okafor", email: "naomi.okafor@riverside.example.org", own: ["Welcome every first-time guest by name"] },
      { name: "Marcus Webb", email: "marcus.webb@riverside.example.org", own: ["Invite two baptised members to tell their story on a Sunday"] },
    ];
    const everything = [...owners.flatMap(o => o.own), "Design the leader residency", "Ask three people to share a baptism story"];
    await step("The scheduled run refuses a missing or wrong secret, and on the 30-day date sends one email to each owner and to nobody else", async () => {
      assert.equal((await cron()).status, 401, "no header"); assert.equal((await cron("Bearer wrong")).status, 401, "wrong secret");
      assert.equal(mail.count, 0, "nothing was sent");
      await quiet();
      const before = mail.count, out = await cron(`Bearer ${secret}`);
      assert.equal(out.status, 200, JSON.stringify(out.body)); assert.equal(out.body.rounds, 1, "the 30-day round only");
      assert.equal(mail.count - before, owners.length, "one email each");
      assert.equal(out.body.sent, owners.length); assert.equal(out.body.practice, 0);
      for (const o of owners) {
        const text = await mail.find(o.email, /30-day/);
        for (const mine of o.own) assert.ok(text.includes(mine), `${o.name}'s email lists: ${mine}`);
        for (const other of everything.filter(t => !o.own.includes(t))) assert.ok(!text.includes(other), `${o.name}'s email does not list: ${other}`);
        assert.ok(!dash.test(text), "no dashes in the email");
      }
      assert.deepEqual((await rounds()).map(r => r.status), ["sent", "scheduled", "scheduled"]);
      // A second run the same day sends nothing.
      const again = await cron(`Bearer ${secret}`);
      assert.equal(again.body.rounds, 0); assert.equal(mail.count - before, owners.length, "no second email");
    });

    const tokenOf = async (email: string) => (await mail.find(email, /30-day/)).match(/\/c\/([A-Za-z0-9_-]+)/)![1];
    const answered = async () => Number((await sql.query("select count(*)::int n from private.check_in_recipients r join private.check_in_rounds d on d.id=r.round_id where d.engagement_id=$1 and d.day=30 and r.answered_at is not null", [room])).rows[0].n);
    const phone = async (email: string) => { const v = await viewer("phone"); await v.page.goto(`${origin}/c/${await tokenOf(email)}`); await v.page.getByRole("button", { name: "Open my check-in" }).click(); return v; };
    await step("Every owner answers on the phone page, which shows only their own steps and goals", async () => {
      const seen = async (p: Page, own: string[]) => { const text = await p.locator("body").innerText(); for (const other of everything.filter(t => !own.includes(t))) assert.ok(!text.includes(other), `a page does not show: ${other}`); };
      // Priya: a stuck first step and a goal at risk.
      let v = await phone(owners[0].email), p = v.page;
      assert.ok((await p.locator("body").innerText()).includes(owners[0].own[0])); await seen(p, [owners[0].own[0]]);
      await p.getByRole("radio", { name: "Stuck" }).click();
      await p.getByLabel("What would help?").fill("I need to know who signs off the role.");
      await shot(p, "phone-step", false);
      await p.getByRole("button", { name: "Next" }).click();
      await p.getByRole("radio", { name: "At risk" }).click();
      await p.getByLabel("What would help?").first().fill("A second pair of hands in March.");
      await p.getByRole("button", { name: "Send my check-in" }).click();
      await p.getByRole("heading", { name: "Thank you" }).waitFor();
      await shot(p, "phone-sent", false);
      await until(async () => (await answered()) === 1, "Priya counts as answered", 8000);
      await v.ctx.close();
      // The facilitator sees who has not answered yet.
      await page.goto(resultsUrl);
      await page.getByRole("heading", { name: "Check-ins", exact: true }).waitFor({ timeout: 20000 });
      assert.match(await page.locator("main").innerText(), /3 people to hear from/);
      // Daniel: his goal only.
      v = await phone(owners[1].email); p = v.page;
      await p.getByRole("heading", { name: "Your goal" }).waitFor(); await seen(p, owners[1].own);
      await p.getByRole("radio", { name: "On track" }).click();
      await p.getByRole("button", { name: "Send my check-in" }).click(); await p.getByRole("heading", { name: "Thank you" }).waitFor(); await until(async () => (await answered()) === 2, "answer 2 is saved", 8000); await v.ctx.close();
      // Naomi, who is no attendee: a goal off track.
      v = await phone(owners[2].email); p = v.page;
      await p.getByRole("heading", { name: "Your goal" }).waitFor(); await seen(p, owners[2].own);
      await p.getByRole("radio", { name: "Off track" }).click();
      await p.getByLabel("What would help?").first().fill("We need a second greeter team.");
      await p.getByRole("button", { name: "Send my check-in" }).click(); await p.getByRole("heading", { name: "Thank you" }).waitFor(); await until(async () => (await answered()) === 3, "answer 3 is saved", 8000); await v.ctx.close();
      // Marcus, also no attendee: a first step under way.
      v = await phone(owners[3].email); p = v.page;
      await seen(p, owners[3].own);
      await p.getByRole("radio", { name: "Under way" }).click();
      await p.getByRole("button", { name: "Send my check-in" }).click(); await p.getByRole("heading", { name: "Thank you" }).waitFor(); await until(async () => (await answered()) === 4, "answer 4 is saved", 8000); await v.ctx.close();
      await until(async () => (await answered()) === 4, "all four owners are answered", 10000);
      assert.deepEqual((await sql.query("select answer from private.check_in_answers where engagement_id=$1 order by answer", [room])).rows.map(r => r.answer), ["at_risk", "off_track", "on_track", "stuck", "under_way"]);
    });

    await step("Results: every answer and note, stuck and at-risk work as follow-ups, nobody left to hear from", async () => {
      await page.goto(resultsUrl);
      await page.getByRole("heading", { name: "Check-ins", exact: true }).waitFor({ timeout: 20000 });
      const main = page.locator("main");
      for (const t of [owners[0].own[0], "I need to know who signs off the role.", owners[0].own[1], "A second pair of hands in March.", "We need a second greeter team.", "Stuck", "At risk", "Off track", "On track", "Under way"])
        assert.ok((await main.innerText()).includes(t), `results show: ${t}`);
      assert.match(await main.innerText(), /3 to follow up/, "a stuck step, a goal at risk and a goal off track");
      assert.match(await main.innerText(), /Everyone has answered/);
      assert.match(await main.innerText(), /of 4 answered/);
      await shot(page, "check-ins-results");
      await page.getByRole("button", { name: "Mark followed up" }).first().click();
      await until(async () => Number((await sql.query("select count(*)::int n from private.check_in_answers where followed_up_at is not null and engagement_id=$1", [room])).rows[0].n) === 1, "follow-up saved", 8000);
      await page.getByRole("button", { name: "Clear the follow-up" }).first().waitFor();
      assert.match(await main.innerText(), /2 to follow up/);
      await shot(page, "check-ins-followed-up");
    });

    await step("A new link shows each owner's status on the read-only copy as a label and a date, and never the note", async () => {
      const second = await makeLink("Board");
      const v = await viewer("laptop"); const p = v.page;
      await p.goto(second); await p.getByTestId("ro-page").waitFor({ timeout: 20000 });
      const statusOf = async (title: string) => (await p.getByTestId("ro-goal").filter({ hasText: title }).first().getByTestId("ro-goal-status").innerText()).trim();
      assert.match(await statusOf("Launch the apprentice pathway"), /^At risk\s*, [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
      assert.match(await statusOf("Develop a leader in every 1:1"), /^On track\s*, [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
      assert.match(await statusOf("Welcome every first-time guest by name"), /^Off track\s*, [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
      assert.equal(await p.getByTestId("ro-goal").filter({ hasText: "Design the leader residency" }).first().getByTestId("ro-goal-status").count(), 0, "a goal with no answer shows no status");
      const html = await p.content();
      for (const note of ["I need to know who signs off the role.", "A second pair of hands in March.", "We need a second greeter team."]) assert.ok(!html.includes(note), "never a note");
      for (const o of owners) assert.ok(!html.includes(o.email), "never an email");
      assert.equal(await p.locator("input, textarea, select, form").count(), 0, "still nothing to change");
      await shot(p, "copy-status");
      await v.ctx.close();
      assert.ok(!(await mail.find(owners[0].email, /30-day/)).includes("/v/"), "the email carries the owner's own check-in and no share link");
    });

    console.log(`Milestone 7 acceptance: ${passed.length} checks passed.\n${passed.map(x => `  ${x}`).join("\n")}\nLocal checks on the loopback stack; the real-device run is sections 39 onward of the practice-room script.`);
  } catch (error) {
    console.error(app?.output().slice(-4000)); throw error;
  } finally {
    await browser?.close().catch(() => {});
    try {
      await wipe();
      if (saved) {
        await sql.query("update public.engagements set settings=$2::jsonb,status=$3::engagement_status,day2_closed_at=$4 where id=$1", [room, JSON.stringify(saved.engagement.settings), saved.engagement.status, saved.engagement.day2_closed_at]);
        for (const s of saved.sessions) await sql.query("update public.sessions set state=$2,closed_at=$3 where id=$1", [s.id, s.state, s.closed_at]);
        for (const a of saved.attendees) await sql.query("update public.attendees set email=$2 where id=$1", [a.id, a.email]);
        for (const g of saved.goals) await sql.query("update private.goals set owner_email=$2 where id=$1", [g.id, g.owner_email]);
        for (const s of saved.steps) await sql.query("update private.first_steps set owner_email=$2 where id=$1", [s.id, s.owner_email]);
        if (kitUsers.length) await sql.query("update public.engagement_facilitators set deleted=true where engagement_id=$1 and clearway_user_id=any($2::uuid[])", [room, kitUsers]);
        await sql.query("update public.engagement_facilitators set role='co_facilitator' where engagement_id=$1 and role='lead'", [room]);
        for (const r of saved.roles) await sql.query("update public.engagement_facilitators set role=$3::facilitator_role where engagement_id=$1 and clearway_user_id=$2", [room, r.clearway_user_id, r.role]);
      }
    } catch (error) { console.error("Clean-up did not finish", error); }
    app?.stop(); await mail.close(); await sql.end().catch(() => {}); rmSync(controlDir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exit(1); });
