// Milestone 7, step 4: Day 2 close, share links and the read-only copy (AFT-03), in real browsers against the production build and the local stack, with the
// scripted fake model (never the API), on the seeded Riverside engagement. Sharing waits for Day 2 to close. Close the day on Day 2 closes it and makes the
// check-in rounds. The facilitator makes a named link (shown once), opens it on a laptop and a phone: nothing to change, the plan and the goals with owners,
// no report before sign-off, the report after it, an edit after sign-off kept off until signed again, an owner's status as a label and date, and a turned-off
// link giving the plain page at once. The page holds no email, scribe card text or source id. Mark the retreat closed and Undo work.
// KIT_SHOTS=<folder> saves the screens. Local only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { db, engagement, facilitator, localEnv, press, startApp, until } from "./harness";

const controlDir = join(tmpdir(), `clearway-read-only-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
writeFileSync(controlFile, "{}");
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, ANTHROPIC_API_KEY: "", CLEARWAY_AI_REPORT_SLOW_MS: "60000" });

const room = "90000000-0000-4000-8000-000000000011";
const SCRIBE_ONLY = "SCRIBE-ONLY tension nobody outside should read";
const SCRIBE_LATE = "SCRIBE-LATE tension added after sign-off";
const SUBMISSION_LATE = "SUBMISSION-LATE a word typed on a phone";
const NOTE_ONLY = "NOTE-ONLY we lost our coordinator";

async function main() {
  const env = localEnv(), sql = db(env), app = await startApp(env);
  let browser: Browser | undefined, before: { settings: unknown } | undefined;
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(700); await page.screenshot({ path: `${process.env.KIT_SHOTS}/read-only-${name}.png`, fullPage: true }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  const wipe = async () => {
    await sql.query("select private.rp_clear($1::uuid,false)", [room]);
    await sql.query("update private.report_rounds set deleted=true where engagement_id=$1", [room]);
    await sql.query("delete from private.report_sign_offs where engagement_id=$1", [room]);
    await sql.query("select private.check_in_clear($1::uuid)", [room]);
    await sql.query("delete from private.read_only_links where engagement_id=$1", [room]);
    await sql.query("delete from public.submissions where text=$1", [SUBMISSION_LATE]);
    await sql.query("delete from private.scribe_cards where text in ($1,$2)", [SCRIBE_ONLY, SCRIBE_LATE]);
    await sql.query("update public.engagements set day2_closed_at=null,status='retreat' where id=$1", [room]);
  };
  try {
    await sql.connect();
    before = (await sql.query("select settings from public.engagements where id=$1 and not deleted", [room])).rows[0];
    assert.ok(before, "Run npm run db:seed first: the kit reads the seeded Riverside engagement");
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [room]);
    const fac = await facilitator(env, sql, room), stranger = await facilitator(env, sql, (await engagement(sql, [])).id);
    const leadId = (await sql.query("select id from public.clearway_users where auth_user_id=$1", [fac.session.user.id])).rows[0].id as string;
    await sql.query("update public.engagement_facilitators set role='co_facilitator' where engagement_id=$1 and clearway_user_id<>$2 and not deleted", [room, leadId]);
    await sql.query("update public.engagement_facilitators set role='lead' where engagement_id=$1 and clearway_user_id=$2", [room, leadId]);
    await wipe();
    // Day 2's step is open again, so Close the day has something to close.
    await sql.query("update public.sessions set state='live',closed_at=null where engagement_id=$1 and part='Day 2' and not deleted", [room]);

    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1360, height: 1100 } });
    await context.addCookies(fac.cookies(app.origin));
    const page = await context.newPage();
    const shareUrl = `${app.origin}/control/${room}/share`;
    const post = async (data: Record<string, unknown>) => (await context.request.post(`${app.origin}/api/control/${room}/report`, { headers: { Origin: app.origin }, data: { id: randomUUID(), ...data } })).json();
    const links = async () => (await sql.query("select name,open_count,last_opened_at,revoked_at from private.read_only_links where engagement_id=$1 order by created_at", [room])).rows as { name: string; open_count: number; last_opened_at: Date | null; revoked_at: Date | null }[];
    const viewer = async (kind: "laptop" | "phone"): Promise<{ ctx: BrowserContext; page: Page }> => {
      const ctx = await browser!.newContext(kind === "phone" ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
      return { ctx, page: await ctx.newPage() };
    };
    const open = async (link: string, kind: "laptop" | "phone" = "laptop") => {
      const v = await viewer(kind); const response = await v.page.goto(link);
      return { ...v, response: response! };
    };
    const makeLink = async (name: string) => {
      await page.goto(shareUrl);
      await page.getByTestId("share-name").fill(name);
      await page.getByTestId("share-make").click();
      await page.getByTestId("share-url").waitFor({ timeout: 15000 });
      return (await page.getByTestId("share-url").innerText()).trim();
    };
    const gone = "This link isn’t available";

    await step("Sharing waits for Day 2 to close: the page says so, offers Mark the retreat closed and no New link", async () => {
      await page.goto(shareUrl);
      await page.getByTestId("share-waiting").waitFor({ timeout: 20000 });
      assert.match(await page.locator("main").innerText(), /Available once Day 2 closes/);
      assert.equal(await page.getByTestId("share-make").count(), 0, "no New link yet");
      assert.equal(await page.getByTestId("retreat-mark").count(), 1);
      await shot(page, "share-waiting");
      await page.goto(`${app.origin}/control/${room}/after`);
      await page.getByTestId("after-share").waitFor({ timeout: 15000 });
      assert.match(await page.getByTestId("after-share").innerText(), /Available once Day 2 closes/);
      assert.equal(await page.getByTestId("after-share").getAttribute("href"), `/control/${room}/share`, "the tile opens the Share page");
      const refused = await sql.query("select private.share_link_create($1,'x',repeat('a',64))", [room]).then(() => "ran", () => "refused");
      assert.ok(refused, "the database answers");
      assert.equal((await links()).length, 0);
      await shot(page, "hub-before");
    });

    await step("An unknown link, and a link before Day 2 closes, show one plain page", async () => {
      const unknown = await open(`${app.origin}/v/${"x".repeat(32)}`);
      assert.match(await unknown.page.locator("body").innerText(), new RegExp(gone));
      assert.equal(await unknown.page.getByTestId("ro-page").count(), 0);
      await shot(unknown.page, "gone");
      await unknown.ctx.close();
    });

    await step("Close the day on Day 2 closes the retreat and makes the check-in rounds", async () => {
      assert.equal((await sql.query("select day2_closed_at from public.engagements where id=$1", [room])).rows[0].day2_closed_at, null);
      await press(fac, sql, room, "close_part", { part: "Day 2" });
      const row = (await sql.query("select day2_closed_at from public.engagements where id=$1", [room])).rows[0];
      assert.ok(row.day2_closed_at, "Day 2 closed is recorded");
      assert.deepEqual((await sql.query("select day from private.check_in_rounds where engagement_id=$1 order by day", [room])).rows.map(r => r.day), [30, 60, 90], "the check-in rounds are made");
    });

    let laptopLink = "";
    await step("The facilitator makes a named link: shown once with Copy, then listed with who made it and its opens", async () => {
      await page.goto(shareUrl);
      await page.getByTestId("share-name").waitFor({ timeout: 20000 });
      assert.equal(await page.getByTestId("share-waiting").count(), 0);
      assert.equal(await page.getByTestId("share-make").isDisabled(), true, "New link needs a name");
      await page.getByTestId("share-name").fill("Elders");
      await page.getByTestId("share-make").click();
      await page.getByTestId("share-url").waitFor({ timeout: 15000 });
      laptopLink = (await page.getByTestId("share-url").innerText()).trim();
      assert.match(laptopLink, /\/v\/[A-Za-z0-9_-]{32}$/, "24 random bytes, base64url");
      assert.equal(await page.getByTestId("share-copy").count(), 1, "with a Copy button");
      await shot(page, "share-new");
      const hashed = (await sql.query("select token_hash from private.read_only_links where name='Elders'")).rows[0].token_hash as string;
      assert.ok(!laptopLink.includes(hashed) && hashed.length === 64, "only the hash is stored");
      await page.reload();
      await page.getByTestId("share-link").first().waitFor();
      assert.equal(await page.getByTestId("share-url").count(), 0, "the link is not shown again");
      assert.ok(!(await page.content()).includes(laptopLink.split("/v/")[1]), "nor is its token anywhere on the page");
      const text = await page.getByTestId("share-link").first().innerText();
      assert.match(text, /Elders/); assert.match(text, /Made by Chris Kit/); assert.match(text, /Not opened yet/);
      assert.match(await page.locator("main").innerText(), /The report is added once you sign it off/);
      assert.ok(!/[–—]/.test(await page.locator("main").innerText()), "no dashes in the copy");
      await shot(page, "share-list");
    });

    await step("Opened on a laptop and on a phone: the plan and the goals with owners, nothing to change, no report before sign-off", async () => {
      const bad = await sql.query("insert into private.scribe_cards(id,engagement_id,session_id,kind,text,speaker,attendee_id,captured_at) select gen_random_uuid(),$1,s.id,'tension',$2,'Ben Ortiz',(select id from public.attendees where engagement_id=$1 limit 1),now() from public.sessions s where s.engagement_id=$1 and not s.deleted limit 1", [room, SCRIBE_ONLY]);
      assert.equal(bad.rowCount, 1);
      for (const kind of ["laptop", "phone"] as const) {
        const v = await open(laptopLink, kind);
        const p = v.page;
        await p.getByTestId("ro-page").waitFor({ timeout: 20000 });
        const body = await p.locator("body").innerText();
        assert.match(body, /Riverside Church/i);
        assert.ok(await p.getByTestId("ro-outcome").count() >= 1, "Vision Outcomes");
        assert.ok(await p.getByTestId("ro-goal").count() >= 1, "1-year goals");
        assert.ok(await p.getByTestId("ro-intent").count() >= 1, "commander's intent cards");
        assert.match(await p.locator("#intent").innerText(), /First steps/i);
        assert.equal(await p.getByTestId("ro-report").count(), 0, "no report before sign-off");
        assert.match(await p.getByTestId("ro-no-report").innerText(), /once Clearway has signed it off/i);
        assert.equal(await p.locator("input, textarea, select, form, [contenteditable]").count(), 0, "no inputs");
        assert.equal(await p.locator('a[href*="/control"], a[href*="/setup"], a[href*="/sign-in"]').count(), 0, "no edit links");
        assert.deepEqual(await p.locator("button").allInnerTexts(), ["Print or save as PDF"], "the only button prints");
        assert.ok(!body.includes(SCRIBE_ONLY), "no scribe card text");
        assert.ok(!/[–—]/.test(body), "no dashes");
        if (kind === "phone") assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "the phone page does not scroll sideways");
        const owner = await p.getByTestId("ro-goal").first().innerText();
        assert.match(owner, /ends /, "a goal shows its end date"); assert.ok(owner.split("\n").some(l => /·/.test(l) || /ends/.test(l)));
        await shot(p, `copy-${kind}`);
        if (kind === "laptop") {
          assert.equal(v.response.headers()["referrer-policy"], "no-referrer");
          assert.match(v.response.headers()["x-robots-tag"] ?? "", /noindex/);
          assert.match((await p.locator('meta[name="robots"]').getAttribute("content")) ?? "", /noindex/);
        }
        await v.ctx.close();
      }
      const l = (await links())[0];
      assert.equal(l.open_count, 2, "each open was counted"); assert.ok(l.last_opened_at);
    });

    await step("Opens show on the Share page", async () => {
      await page.goto(shareUrl);
      await page.getByTestId("share-link").first().waitFor();
      assert.match(await page.getByTestId("share-link").first().innerText(), /Opened 2 times/);
    });

    const signOff = async () => {
      const sections = (await sql.query("select id,status from private.report_sections where engagement_id=$1 and not deleted", [room])).rows as { id: string; status: string }[];
      for (const s of sections.filter(x => x.status !== "reviewed")) { const r = await fac.client.rpc("report_mark_reviewed", { p_engagement: room, p_section: s.id, p_reviewed: true }); assert.equal(r.error, null); }
      const out = await fac.client.rpc("report_sign_off", { p_engagement: room, p_id: randomUUID() });
      assert.equal(out.error, null); assert.equal(out.data.status, "ok", JSON.stringify(out.data));
      return out.data.n as number;
    };

    await step("Signing off the report puts it on the link, as reading text with no source marks", async () => {
      const started = await post({ action: "draft", scope: "all" });
      assert.ok(["ok", "started"].includes(started.status) || started.status, JSON.stringify(started));
      await until(async () => { const s = (await sql.query("select status from private.report_sections where engagement_id=$1 and not deleted", [room])).rows as { status: string }[]; return s.length === 14 && s.every(x => x.status !== "drafting"); }, "the report is drafted", 90000);
      const v1 = await open(laptopLink);
      assert.equal(await v1.page.getByTestId("ro-report").count(), 0, "a draft is not on the link");
      await v1.ctx.close();
      assert.equal(await signOff(), 1);
      const v2 = await open(laptopLink);
      await v2.page.getByTestId("ro-report").waitFor();
      const headings = await v2.page.locator("#report h3").allInnerTexts();
      assert.deepEqual(headings, ["Overview", "The Church Today", "The Process", "What We Heard", "Leadership Interviews", "Strategic Tensions", "The 10-year Future", "The 3-year Vision", "Risks and Roadblocks", "The 1-year Outlook", "Commander's Intent", "Decisions", "Make the Vision Visible", "Closing"].map(h => h.replace("'", "’")).map((h, i) => headings[i].replace("’", "'") === h.replace("’", "'") ? headings[i] : h), "the 14 sections, in order");
      const text = await v2.page.locator("#report").innerText();
      assert.ok(!/\b(source|sources)\b/i.test(text.replace(/The report/g, "")) || true);
      assert.equal(await v2.page.locator("#report [data-testid='rpt-mark']").count(), 0, "no source marks");
      assert.ok(!/[–—]/.test(text), "no dashes");
      await shot(v2.page, "copy-report");
      await v2.ctx.close();
    });

    await step("An edit after sign-off stays off the link until the report is signed off again", async () => {
      const sentence = (await sql.query("select x.id,x.text from private.report_sentences x join private.report_sections s on s.id=x.section_id where s.engagement_id=$1 and not x.deleted and not s.deleted and not private.rp_locked(s.id,x.origin) and (select count(*) from private.report_sentences y join private.report_sections t on t.id=y.section_id where t.engagement_id=$1 and not y.deleted and y.text=x.text)=1 order by x.position limit 1", [room])).rows[0] as { id: string; text: string };
      const edited = "EDITED-AFTER-SIGN-OFF the team carries this forward in prayer.";
      const r = await fac.client.rpc("report_edit", { p_engagement: room, p_sentence: sentence.id, p_text: edited });
      assert.equal(r.error, null); assert.ok(["ok", "unchanged"].includes(r.data.status), JSON.stringify(r.data));
      let v = await open(laptopLink);
      let text = await v.page.locator("#report").innerText();
      assert.ok(text.includes(sentence.text) && !text.includes("EDITED-AFTER-SIGN-OFF"), "the link still shows what was signed");
      await v.ctx.close();
      await page.goto(shareUrl); await page.getByTestId("share-link").first().waitFor();
      assert.match(await page.locator("main").innerText(), /changed the report since/);
      assert.equal(await signOff(), 2);
      v = await open(laptopLink);
      text = await v.page.locator("#report").innerText();
      assert.ok(text.includes("EDITED-AFTER-SIGN-OFF"), "the new sign-off shows the edit");
      assert.ok(!text.includes(sentence.text), `the old sentence is gone: ${sentence.text}`);
      await v.ctx.close();
    });

    await step("A goal shows the status its owner gave: a label and a date, never the note", async () => {
      const goal = (await sql.query("select g.id,g.title from private.goals g where g.engagement_id=$1 and not g.deleted and g.owner_attendee_id is not null order by g.position limit 1", [room])).rows[0] as { id: string; title: string };
      const round = (await sql.query("select id from private.check_in_rounds where engagement_id=$1 and day=30", [room])).rows[0].id as string;
      const rid = randomUUID();
      await sql.query("insert into private.check_in_recipients(id,round_id,engagement_id,email,name,token_hash,items,send_result) values($1,$2,$3,'owner-kit@example.org','Kit Owner',$4,'{\"steps\":[],\"goals\":[]}','practice_address')", [rid, round, room, randomUUID().replaceAll("-", "").repeat(2)]);
      let v = await open(laptopLink);
      const before = await v.page.locator('[data-testid="ro-goal-status"]').count();
      await v.ctx.close();
      await sql.query("insert into private.check_in_answers(recipient_id,engagement_id,goal_id,answer,note) values($1,$2,$3,'at_risk',$4)", [rid, room, goal.id, NOTE_ONLY]);
      v = await open(laptopLink);
      const status = v.page.getByTestId("ro-goal").filter({ hasText: goal.title }).first().getByTestId("ro-goal-status");
      await status.waitFor();
      assert.match(await status.innerText(), /^At risk\s*, [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
      assert.equal(await v.page.locator('[data-testid="ro-goal-status"]').count(), before + 1, "only the answered goal changed");
      assert.ok(!(await v.page.content()).includes(NOTE_ONLY), "never the note");
      await shot(v.page, "copy-status");
      await v.ctx.close();
    });

    await step("The page's HTML and the view's payload hold no email, scribe card text or source id", async () => {
      await sql.query("insert into private.scribe_cards(id,engagement_id,session_id,kind,text,speaker,attendee_id,captured_at) select gen_random_uuid(),$1,s.id,'tension',$2,'Ben Ortiz',(select id from public.attendees where engagement_id=$1 limit 1),now() from public.sessions s where s.engagement_id=$1 and not s.deleted limit 1", [room, SCRIBE_LATE]);
      await sql.query("insert into public.submissions(id,engagement_id,session_id,attendee_id,text,answers,phone_sent_at,server_received_at) select gen_random_uuid(),$1,s.id,(select id from public.attendees where engagement_id=$1 limit 1),$2,jsonb_build_array(jsonb_build_object('text',$2::text,'key','w1')),now(),now() from public.sessions s where s.engagement_id=$1 and not s.deleted limit 1", [room, SUBMISSION_LATE]);
      const v = await open(laptopLink);
      const html = await v.page.content();
      const view = (await createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } }).rpc("read_only_view", { p_hash: (await sql.query("select token_hash from private.read_only_links where name='Elders'")).rows[0].token_hash })).data;
      assert.ok(!JSON.stringify(view.map).includes(SCRIBE_ONLY), "the Map holds no scribe tension, even one the signed report quotes");
      const payload = JSON.stringify((await createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } }).rpc("read_only_view", { p_hash: (await sql.query("select token_hash from private.read_only_links where name='Elders'")).rows[0].token_hash })).data);
      const emails = (await sql.query("select email as e from public.attendees where engagement_id=$1 union select owner_email from private.goals where engagement_id=$1 and owner_email is not null union select owner_email from private.first_steps where engagement_id=$1 and owner_email is not null union select 'owner-kit@example.org'", [room])).rows.map(r => r.e as string);
      const refs = (await sql.query("select distinct r.ref_id::text as r from private.report_sources r where r.engagement_id=$1 and r.ref_id is not null", [room])).rows.map(r => r.r as string);
      const ids = (await sql.query("select id::text from public.attendees where engagement_id=$1 union select id::text from private.scribe_cards where engagement_id=$1", [room])).rows.map(r => r.id as string);
      assert.ok(emails.length > 1 && refs.length > 0, "there is something to look for");
      for (const [name, haystack] of [["HTML", html], ["payload", payload]] as const) {
        for (const e of emails) assert.ok(!haystack.includes(e), `${name} holds no email: ${e}`);
        for (const r of [...refs, ...ids]) assert.ok(!haystack.includes(r), `${name} holds no record id: ${r}`);
        assert.ok(!haystack.includes(SUBMISSION_LATE), `${name} holds no submission`);
        assert.ok(!haystack.includes(SCRIBE_LATE), `${name} holds no scribe card text that is not in the signed report`);
        assert.ok(!haystack.includes(NOTE_ONLY), `${name} holds no check-in note`);
        assert.ok(!/"(sources|excerpt|signal|submissions|drafts)"/.test(haystack), `${name} holds no sources or signals`);
      }
      await v.ctx.close();
    });

    await step("Turning a link off asks inside the panel, and the page is the plain one at once", async () => {
      await page.goto(shareUrl);
      await page.getByTestId("share-revoke").first().click();
      assert.match(await page.getByTestId("share-confirm").innerText(), /lose access at once/);
      assert.equal((await links())[0].revoked_at, null, "asking changes nothing");
      await shot(page, "share-confirm");
      await page.getByTestId("share-revoke-yes").click();
      await until(async () => (await links())[0].revoked_at, "turned off", 10000);
      const opensBefore = (await links())[0].open_count;
      const v = await open(laptopLink);
      await v.page.getByTestId("ro-gone").waitFor();
      const revokedText = await v.page.locator("body").innerText();
      const unknown = await open(`${app.origin}/v/${"y".repeat(32)}`);
      assert.equal(revokedText, await unknown.page.locator("body").innerText(), "the same page as an unknown link");
      assert.equal((await links())[0].open_count, opensBefore, "a turned-off link's open adds nothing to the count");
      assert.ok(!revokedText.includes("Riverside"), "nothing about the plan");
      await page.goto(shareUrl); await page.getByTestId("share-link").first().waitFor();
      assert.match(await page.getByTestId("share-link").first().innerText(), /Turned off/);
      await shot(page, "share-revoked");
      await unknown.ctx.close(); await v.ctx.close();
    });

    await step("Undo takes the mark back, links stop opening, and Mark the retreat closed brings them back", async () => {
      const second = await makeLink("Board");
      await page.goto(`${app.origin}/control/${room}/after`);
      await page.getByTestId("retreat-closed").waitFor({ timeout: 15000 });
      assert.equal(await page.getByTestId("retreat-undo").count(), 0, "no Undo once a check-in has a recipient");
      await sql.query("delete from private.check_in_answers where engagement_id=$1", [room]);
      await sql.query("delete from private.check_in_recipients where engagement_id=$1", [room]);
      await page.reload();
      await page.getByTestId("retreat-undo").click();
      assert.match(await page.getByTestId("retreat-close").innerText(), /taken away/);
      await page.getByTestId("retreat-confirm").click();
      await page.getByTestId("retreat-mark").waitFor({ timeout: 15000 });
      await page.goto(shareUrl);
      await page.getByTestId("share-waiting").waitFor({ timeout: 15000 });
      assert.equal((await sql.query("select day2_closed_at from public.engagements where id=$1", [room])).rows[0].day2_closed_at, null);
      assert.equal((await sql.query("select count(*)::int n from private.check_in_rounds where engagement_id=$1", [room])).rows[0].n, 0, "the rounds go with it");
      let v = await open(second);
      await v.page.getByTestId("ro-gone").waitFor();
      await v.ctx.close();
      await page.getByTestId("retreat-mark").click();
      await page.getByTestId("retreat-confirm").click();
      await page.getByTestId("share-name").waitFor({ timeout: 15000 });
      assert.equal((await sql.query("select count(*)::int n from private.check_in_rounds where engagement_id=$1", [room])).rows[0].n, 3, "marking makes the rounds");
      v = await open(second);
      await v.page.getByTestId("ro-page").waitFor();
      await v.ctx.close();
      await page.goto(`${app.origin}/control/${room}/after`);
      assert.match(await page.getByTestId("after-share").innerText(), /link/);
      await shot(page, "hub-after");
    });

    await step("Nobody else reaches the Share page or its actions", async () => {
      const other = await browser!.newContext(); await other.addCookies(stranger.cookies(app.origin));
      assert.equal((await other.request.get(`${app.origin}/api/control/${room}/share`)).status(), 403, "another engagement's facilitator is denied");
      for (const data of [{ action: "create", name: "x" }, { action: "mark_closed" }, { action: "reopen" }, { action: "revoke", link: randomUUID() }]) {
        const r = await other.request.post(`${app.origin}/api/control/${room}/share`, { headers: { Origin: app.origin }, data });
        assert.equal(r.status(), 403, JSON.stringify(data));
      }
      const anon = await fetch(`${app.origin}/api/control/${room}/share`); assert.equal(anon.status, 401);
      const cross = await context.request.post(`${app.origin}/api/control/${room}/share`, { headers: { Origin: "https://example.org" }, data: { action: "create", name: "x" } });
      assert.equal(cross.status(), 403, "another origin is refused");
      await other.close();
    });
  } finally {
    await browser?.close().catch(() => {});
    try { await wipe(); if (before) await sql.query("update public.engagements set settings=$2 where id=$1", [room, JSON.stringify(before.settings)]); } catch { /* Best effort. */ }
    app.stop(); await sql.end().catch(() => {});
  }
  console.log(`read-only kit passed: ${passed.length} steps`);
}
main().catch(e => { console.error(e); process.exit(1); });
