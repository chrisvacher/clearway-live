// Milestone 6, step 1: the Discover setup page in a real browser against the production build and the local stack.
// A facilitator sets the survey total, adds findings (each becomes an accepted theme, thin ones are flagged), pastes
// notes and uploads Word, PDF and text files (one that can't be read says why), and nobody else can reach any of it.
// KIT_SHOTS=<folder> saves the screens. Local only.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, startApp, until } from "./harness";

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(700); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png`, fullPage: true }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  const fixture = (name: string) => new URL(`../fixtures/discover/${name}`, import.meta.url).pathname;
  try {
    await sql.connect();
    const room = await engagement(sql, ["Priya"]);
    const elsewhere = await engagement(sql, []);
    const fac = await facilitator(env, sql, room.id);
    const stranger = await facilitator(env, sql, elsewhere.id);
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.addCookies(fac.cookies(app.origin));
    const page = await context.newPage();
    const url = `${app.origin}/setup/${room.id}/discover`;

    await step("The setup page links to Discover, and Discover starts empty and private", async () => {
      await page.goto(`${app.origin}/setup/${room.id}`);
      await page.getByRole("link", { name: "Discover" }).waitFor({ timeout: 15000 });
      await page.getByRole("link", { name: "Discover" }).click();
      await page.getByRole("heading", { name: "Discover", level: 1 }).waitFor({ timeout: 15000 });
      const text = await page.locator("main").innerText();
      assert.ok(text.includes("Only you see this"), "marked private");
      assert.ok(text.includes("No themes yet"), "the theme list starts empty");
      assert.ok(text.includes("Notes stay with Clearway"), "the privacy line");
      assert.ok(!/[–—]/.test(text), "no dashes in the copy");
      await shot(page, "discover-empty");
    });

    await step("The total and the findings save, and each finding becomes an accepted theme", async () => {
      await page.getByLabel("People who answered").fill("87");
      await page.getByRole("button", { name: "Save total" }).click();
      await page.getByText("Saved.").first().waitFor();
      assert.equal((await sql.query("select survey_respondents from public.engagements where id=$1", [room.id])).rows[0].survey_respondents, 87);
      const add = async (title: string, figure: string, rests: string) => {
        const row = page.locator("li.dsc-finding").last();
        await row.getByLabel("Finding").fill(title); await row.getByLabel("Number in the report").fill(figure); await row.getByLabel("Respondents it rests on").fill(rests);
        await row.getByRole("button", { name: "Add finding" }).click();
      };
      await add("Small groups are easy to find", "31%", "27");
      await page.locator(".dsc-theme", { hasText: "Small groups are easy to find" }).waitFor({ timeout: 10000 });
      await add("Under-30s feel unheard", "7%", "6");
      await page.locator(".dsc-theme", { hasText: "Under-30s feel unheard" }).waitFor({ timeout: 10000 });
      const themes = (await sql.query("select label,rests_on,out_of,status,source from private.discover_themes where engagement_id=$1 and not deleted order by seq", [room.id])).rows;
      assert.deepEqual(themes.map(t => [t.label, t.rests_on, t.out_of, t.status, t.source]), [["Small groups are easy to find", 27, 87, "accepted", "survey"], ["Under-30s feel unheard", 6, 87, "accepted", "survey"]]);
      const list = page.getByRole("list", { name: "Themes" });
      await list.waitFor();
      const text = await list.innerText();
      assert.ok(text.includes("of 87"), "what each rests on");
      assert.equal(await page.locator(".dsc-theme .dsc-thin").count(), 1, "one thin theme");
      assert.ok((await page.locator(".dsc-theme", { hasText: "Under-30s feel unheard" }).innerText()).includes("6 of 87 respondents, fewer than 10"), "with its reason");
      assert.equal(await page.locator(".dsc-theme", { hasText: "Small groups are easy to find" }).locator(".dsc-strong").count(), 0, "31 percent is not strong");
      await shot(page, "discover-findings");
    });

    await step("A finding above the total is refused with a plain sentence, and editing keeps one theme", async () => {
      const row = page.locator("li.dsc-finding").last();
      await row.getByLabel("Finding").fill("Too many"); await row.getByLabel("Number in the report").fill("99%"); await row.getByLabel("Respondents it rests on").fill("200");
      await row.getByRole("button", { name: "Add finding" }).click();
      await page.getByText("can't rest on more people than the survey's total of 87").waitFor();
      const first = page.locator("li.dsc-finding").first();
      await first.getByLabel("Respondents it rests on").fill("40");
      await first.getByRole("button", { name: "Save finding" }).click();
      await until(async () => (await sql.query("select rests_on from private.discover_themes where engagement_id=$1 and label='Small groups are easy to find' and not deleted", [room.id])).rows[0]?.rests_on === 40, "the theme follows the finding");
      assert.equal((await sql.query("select count(*)::int n from private.discover_themes where engagement_id=$1 and not deleted", [room.id])).rows[0].n, 2);
    });

    await step("Notes are pasted, and the person is kept for the record only", async () => {
      await page.getByLabel("Person (for the record only)").first().fill("Pastor Dan Lee");
      await page.getByLabel("Or paste notes: title").fill("Interview with the lead pastor");
      await page.getByLabel("Notes", { exact: true }).fill("We want a church that sends people out.\n\nSmall groups are hard to find.");
      await page.getByRole("button", { name: "Add pasted notes" }).click();
      await page.getByText("Interview with the lead pastor").first().waitFor({ timeout: 10000 });
      const note = (await sql.query("select kind,person,title,source_kind,word_count,char_count from private.conversation_notes where engagement_id=$1 and not deleted", [room.id])).rows[0];
      assert.deepEqual([note.kind, note.person, note.title, note.source_kind, note.word_count], ["interview", "Pastor Dan Lee", "Interview with the lead pastor", "paste", 14]);
      assert.ok((await page.locator(".dsc-file").first().innerText()).includes("14 words"));
      await shot(page, "discover-notes");
    });

    await step("Word, PDF and text files are read on the server and not kept; one that can't be read says why", async () => {
      const before = (await sql.query("select count(*)::int n from storage.objects")).rows[0].n;
      await page.locator("#dsc-kind").selectOption("input");
      await page.locator("input[type=file]").setInputFiles([fixture("interview.docx"), fixture("elders.pdf"), fixture("staff.txt")]);
      await until(async () => (await sql.query("select count(*)::int n from private.conversation_notes where engagement_id=$1 and not deleted", [room.id])).rows[0].n === 4, "three files read", 20000);
      const rows = (await sql.query("select title,kind,source_kind,body from private.conversation_notes where engagement_id=$1 and not deleted and source_kind<>'paste' order by source_kind", [room.id])).rows;
      assert.deepEqual(rows.map(r => [r.title, r.kind, r.source_kind]), [["interview", "input", "docx"], ["elders", "input", "pdf"], ["staff", "input", "txt"]]);
      assert.match(rows[0].body, /Small groups are hard to find\./); assert.match(rows[1].body, /The elders want a clear plan\./); assert.equal(rows[2].body, "Staff are stretched.\n\nLong weeks are normal.");
      assert.equal((await sql.query("select count(*)::int n from storage.objects")).rows[0].n, before, "no file was stored");
      await page.locator("input[type=file]").setInputFiles({ name: "old-notes.doc", mimeType: "application/msword", buffer: Buffer.from("x") });
      await page.getByText("Use a Word (.docx), PDF or text (.txt) file, or paste the text.").waitFor();
      await page.locator("input[type=file]").setInputFiles({ name: "binary.txt", mimeType: "text/plain", buffer: Buffer.from([97, 0, 98, 99]) });
      await page.getByText("That doesn't look like a text file.").waitFor({ timeout: 10000 });
      assert.equal(await page.locator(".dsc-file.is-err").count(), 2, "both are marked with the error edge");
      assert.equal((await sql.query("select count(*)::int n from private.conversation_notes where engagement_id=$1 and not deleted", [room.id])).rows[0].n, 4, "and added nothing");
      assert.ok((await page.getByText("3 input conversations").count()) === 1 || (await page.getByText("1 interview and 3 input conversations").count()) === 1, "the count of interviews and conversations");
      await shot(page, "discover-files");
    });

    await step("A note's kind and details can change, and a note can be removed", async () => {
      const row = page.locator(".dsc-file", { hasText: "staff" }).first();
      await row.getByLabel(/Which conversation: staff/).selectOption("interview");
      await until(async () => (await sql.query("select kind from private.conversation_notes where engagement_id=$1 and title='staff' and not deleted", [room.id])).rows[0]?.kind === "interview", "kind saved");
      await row.getByRole("button", { name: "Details" }).click();
      await row.getByLabel("Person (for the record only)").fill("Staff team");
      await row.getByRole("button", { name: "Save details" }).click();
      await until(async () => (await sql.query("select person from private.conversation_notes where engagement_id=$1 and title='staff' and not deleted", [room.id])).rows[0]?.person === "Staff team", "person saved");
      await row.getByRole("button", { name: /Remove staff/ }).click();
      await until(async () => (await sql.query("select count(*)::int n from private.conversation_notes where engagement_id=$1 and not deleted", [room.id])).rows[0].n === 3, "note removed");
    });

    await step("Nobody else reaches Discover, and nothing reaches the room state", async () => {
      const anon = await fetch(`${app.origin}/api/discover/${room.id}`);
      assert.ok([401, 403].includes(anon.status), `anonymous request refused, got ${anon.status}`);
      const other = await context.browser()!.newContext(); await other.addCookies(stranger.cookies(app.origin));
      const denied = await other.request.get(`${app.origin}/api/discover/${room.id}`);
      assert.equal(denied.status(), 403, "a facilitator of another engagement is denied");
      const page2 = await other.newPage(); const opened = await page2.goto(url);
      assert.equal(opened?.status(), 404, "the page does not exist for them");
      assert.ok(!(await page2.locator("body").innerText()).includes("Under-30s"), "and shows nothing");
      const post = await other.request.post(`${app.origin}/api/discover/${room.id}`, { headers: { Origin: app.origin }, data: { action: "finding_delete", id: (await sql.query("select id from private.survey_findings where engagement_id=$1 and not deleted limit 1", [room.id])).rows[0].id } });
      assert.equal(post.status(), 403, "and cannot delete a finding");
      await other.close();
      const state = (await sql.query("select to_jsonb(r)::text as t from public.room_states r where engagement_id=$1", [room.id])).rows[0];
      assert.ok(!state || !/Pastor Dan Lee|Under-30s|elders want/.test(String(state.t)), "Discover never reaches the room state");
      const crossOrigin = await context.request.post(`${app.origin}/api/discover/${room.id}`, { headers: { Origin: "https://example.org" }, data: { action: "total", total: 5 } });
      assert.equal(crossOrigin.status(), 403, "a request from another origin is refused");
    });

    await step("Before the migration is run, the page says Discover isn't ready and setup is unchanged", async () => {
      await sql.query("alter function public.discover_state(uuid) rename to discover_state_off");
      try {
        await page.goto(url);
        await page.getByText("Discover isn't ready yet.").waitFor({ timeout: 15000 });
        await page.goto(`${app.origin}/setup/${room.id}`);
        await page.getByRole("link", { name: "Edit run of show" }).waitFor({ timeout: 15000 });
      } finally { await sql.query("alter function public.discover_state_off(uuid) rename to discover_state"); }
      await page.goto(url);
      await page.getByRole("heading", { name: "Survey findings" }).waitFor();
    });

    console.log(`Discover kit: ${passed.length} checks passed.`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally { await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); }
}
main().catch(error => { console.error(error); process.exit(1); });
