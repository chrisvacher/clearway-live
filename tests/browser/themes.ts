// Milestone 6, step 3: Discover themes in a real browser against the production build and the local stack, with the scripted fake model
// (never the API). The facilitator presses Draft themes; themes arrive from the notes and the Four Helpful Lists cards with the AI icon,
// "4 of 5" counts, thin and strong marks and their sources; accept, rename, merge and reject work; Redraft keeps what was accepted; only
// accepted themes count; a slow draft and a failed one say so and the facilitator adds a theme by hand; nobody else reaches any of it.
// The cards come from step 2's private.four_lists_cards_for_themes; here a fixed set stands in for it and is put back at the end.
// KIT_SHOTS=<folder> saves the screens. Local only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, startApp, until } from "./harness";

const controlDir = join(tmpdir(), `clearway-themes-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
const fake = (value: { delayMs?: number; fail?: boolean }) => writeFileSync(controlFile, JSON.stringify(value));
fake({});
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "250", ANTHROPIC_API_KEY: "", CLEARWAY_AI_THEMES_SLOW_MS: "2500" });

const notes: [string, string, string, string][] = [
  ["interview", "Priya Shah", "Interview 1", "We are warm on Sunday. Newcomers cannot find a small group to join. The groups are full and nobody tells them the next step."],
  ["interview", "Ben Ortiz", "Interview 2", "Our music and worship are a real strength. People stay for the singing. A few volunteers carry everything and they are burning out."],
  ["input", "Ruth Lee", "Board conversation", "Visitors come once and we lose them. There is no clear first step. Volunteers are stretched thin, the same five people every week."],
  ["input", "Sam Cho", "Staff conversation", "I feel alone as a leader. Nobody checks on the leaders. Small groups are hard to find for new families too."],
  ["interview", "Daniel Park", "Interview 3", "Giving is steady and generous. The worship band is the heart of Sunday."],
];
const cards: [string, string, number][] = [["right", "The music and worship are strong", 6], ["wrong", "Hard to find a small group as a newcomer", 5], ["wrong", "The same few volunteers do everything", 4], ["missing", "A clear next step for visitors", 3], ["confused", "Who decides what happens next", 1]];

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined, replaced = false, original = "";
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(700); await page.screenshot({ path: `${process.env.KIT_SHOTS}/themes-${name}.png`, fullPage: true }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    // The Four Helpful Lists cards stand in for step 2's function, inside this kit only.
    original = (await sql.query("select pg_get_functiondef('private.four_lists_cards_for_themes(uuid)'::regprocedure) as def")).rows[0].def as string;
    const room = await engagement(sql, ["Priya"]), elsewhere = await engagement(sql, []);
    const people = Array.from({ length: 8 }, () => randomUUID());
    // Each card carries the distinct people behind it; they overlap, as people do.
    const cardRows = cards.map(([column, text, agree]) => ({ card_id: randomUUID(), session_id: randomUUID(), column, text, agree, folded_ids: [] as string[], people: people.slice(0, agree + 1) }));
    await sql.query(`create or replace function private.four_lists_cards_for_themes(p_engagement uuid) returns table(card_id uuid,session_id uuid,"column" text,"text" text,agree integer,folded_ids uuid[],people uuid[])
      language sql stable security definer set search_path='' as $f$ select c.card_id,c.session_id,c."column",c."text",c.agree,c.folded_ids,c.people from jsonb_to_recordset($1::text::jsonb) as c(card_id uuid,session_id uuid,"column" text,"text" text,agree integer,folded_ids uuid[],people uuid[]) where p_engagement='${room.id}'::uuid $f$`.replace("$1::text::jsonb", `'${JSON.stringify(cardRows)}'::jsonb`));
    replaced = true;
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [room.id]);
    for (const [kind, person, title, body] of notes) await sql.query("insert into private.conversation_notes(id,engagement_id,kind,person,title,body,source_kind,word_count) values($1,$2,$3,$4,$5,$6,'paste',$7)", [randomUUID(), room.id, kind, person, title, body, body.split(/\s+/).length]);
    const fac = await facilitator(env, sql, room.id), co = await facilitator(env, sql, room.id), stranger = await facilitator(env, sql, elsewhere.id);
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
    await context.addCookies(fac.cookies(app.origin));
    const page = await context.newPage();
    const url = `${app.origin}/setup/${room.id}/discover`;
    const theme = (label: string) => page.locator(".dsc-theme", { hasText: label }).first();
    const rows = async (where = "") => (await sql.query(`select label,source,status,rests_on,out_of,merged_into,ai_run is not null as ai from private.discover_themes where engagement_id=$1 and not deleted ${where} order by seq`, [room.id])).rows;

    await step("Before drafting there are no themes, and Draft themes is ready", async () => {
      await page.goto(url);
      await page.getByRole("heading", { name: "Themes", level: 2 }).waitFor({ timeout: 15000 });
      const text = await page.locator("main").innerText();
      assert.ok(text.includes("No themes yet"), "the list starts empty");
      assert.ok(!/[–—]/.test(text), "no dashes in the copy");
      assert.equal(await page.getByRole("button", { name: "Draft themes" }).isEnabled(), true);
      await shot(page, "before");
    });

    await step("Draft themes: themes arrive from the notes and the cards, with the AI icon, counts, marks and sources", async () => {
      await page.getByRole("button", { name: "Draft themes" }).click();
      await theme("Small groups are hard to find").waitFor({ timeout: 30000 });
      await until(async () => (await rows()).length >= 6, "themes saved", 30000);
      const drafted = await rows();
      assert.ok(drafted.every(r => r.status === "draft" && r.ai), "every drafted theme is a draft made by AI");
      const small = theme("Small groups are hard to find").filter({ hasText: "Interviews and conversations" });
      assert.match(await small.innerText(), /2\s*of 5 conversations/, "rests on / out of, from the sources");
      assert.ok(await small.locator(".cwl-ai-mark").count() >= 1, "the AI icon on a drafted theme");
      assert.match(await small.innerText(), /Rests on/, "the sources are shown beside it");
      assert.match(await small.innerText(), /Interview 1/, "a source by its title");
      assert.ok(!/Priya|Ben Ortiz|Ruth Lee|Sam Cho|Daniel Park/.test(await page.locator("main").innerText()), "no person on the page");
      const cardTheme = page.locator(".dsc-theme", { hasText: "Four Helpful Lists" }).first();
      assert.match(await cardTheme.innerText(), /What's (?:right|wrong|missing|confused)/, "a card by its list");
      assert.ok(await page.locator(".dsc-theme .dsc-thin").count() >= 1, "a theme resting on one source is marked thin");
      assert.ok(await page.locator(".dsc-theme .dsc-strong").count() >= 1, "a well supported theme is marked strong");
      assert.equal((await sql.query("select count(*)::int n from private.discover_themes where engagement_id=$1 and source='survey'", [room.id])).rows[0].n, 0, "survey themes are never drafted by AI");
      assert.equal((await sql.query("select count(*)::int n from private.ai_runs where engagement_id=$1 and job='draft_discover_themes' and status='ok'", [room.id])).rows[0].n, 1);
      await shot(page, "drafted");
    });

    await step("Only accepted themes count: nothing counts until the facilitator accepts", async () => {
      assert.equal((await sql.query("select count(*)::int n from private.discover_accepted_themes($1)", [room.id])).rows[0].n, 0);
      await theme("Small groups are hard to find").filter({ hasText: "Interviews and conversations" }).getByRole("button", { name: "Accept" }).click();
      await until(async () => (await sql.query("select count(*)::int n from private.discover_accepted_themes($1)", [room.id])).rows[0].n === 1, "the accepted theme counts");
      const a = (await sql.query("select label,source,rests_on,out_of,thin,strong,jsonb_array_length(quotes) q from private.discover_accepted_themes($1)", [room.id])).rows[0];
      assert.deepEqual([a.label, a.source, a.rests_on, a.out_of, a.thin, a.q > 0], ["Small groups are hard to find", "conversations", 2, 5, false, true]);
      await page.locator(".dsc-theme.is-accepted", { hasText: "Small groups are hard to find" }).waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "Undo" }).first().click();
      await until(async () => (await sql.query("select count(*)::int n from private.discover_accepted_themes($1)", [room.id])).rows[0].n === 0, "undo takes it out again");
      await theme("Small groups are hard to find").filter({ hasText: "Interviews and conversations" }).getByRole("button", { name: "Accept" }).click();
      await until(async () => (await sql.query("select count(*)::int n from private.discover_accepted_themes($1)", [room.id])).rows[0].n === 1, "accepted again");
    });

    await step("Rename keeps what the theme was called", async () => {
      const t = theme("Volunteers are stretched").filter({ hasText: "Interviews and conversations" });
      await t.getByRole("button", { name: "Rename" }).click();
      await t.getByLabel("Theme name").fill("A few people carry the work");
      await t.getByRole("button", { name: "Save name" }).click();
      await until(async () => (await rows()).some(r => r.label === "A few people carry the work"), "renamed");
      await theme("A few people carry the work").getByText("Renamed from Volunteers are stretched").waitFor();
    });

    await step("Merge: a theme glides beneath the one it joins and its sources count once", async () => {
      const before = (await rows("and source='conversations' and merged_into is null")).length;
      const t = theme("The next step is unclear").filter({ hasText: "Interviews and conversations" });
      await t.getByRole("button", { name: "Merge" }).click();
      await t.getByLabel("Merge into").selectOption({ label: "A few people carry the work" });
      await t.getByRole("button", { name: "Merge into it" }).click();
      await until(async () => (await rows("and source='conversations' and merged_into is null")).length === before - 1, "one theme fewer", 10000);
      const survivor = theme("A few people carry the work");
      await survivor.getByText("Merged from 1 theme").waitFor();
      const merged = (await sql.query("select rests_on,out_of from private.discover_themes where engagement_id=$1 and label='A few people carry the work' and not deleted", [room.id])).rows[0];
      assert.equal(merged.out_of, 5);
      assert.ok(merged.rests_on >= 2 && merged.rests_on <= 4, `counted once, got ${merged.rests_on}`);
      await until(async () => new RegExp(`${merged.rests_on}\\s*of 5 conversations`).test(await survivor.innerText()), "the count rolls to what it now rests on", 8000);
      await survivor.locator("summary", { hasText: "Merged themes" }).click();
      await survivor.getByRole("button", { name: "Split out" }).click();
      await until(async () => (await rows("and source='conversations' and merged_into is null")).length === before, "split out again", 10000);
      await shot(page, "merged");
    });

    await step("Reject takes a theme off the page, and Bring back returns it", async () => {
      const t = theme("Leaders feel alone");
      await t.waitFor();
      await t.getByRole("button", { name: "Reject" }).click();
      await until(async () => (await rows("and label='Leaders feel alone' and status='rejected'")).length >= 1, "rejected");
      await page.locator(".dsc-theme", { hasText: "Leaders feel alone" }).first().waitFor({ state: "detached", timeout: 5000 });
      await page.locator("summary", { hasText: "Rejected themes" }).click();
      await page.getByRole("button", { name: "Bring back" }).first().click();
      await theme("Leaders feel alone").waitFor();
      assert.equal((await rows("and label='Leaders feel alone' and status='draft'")).length >= 1, true);
    });

    await step("Redraft keeps what was accepted, and offers only new themes beside it", async () => {
      const before = await rows();
      await sql.query("insert into private.conversation_notes(id,engagement_id,kind,person,title,body,source_kind,word_count) values($1,$2,'input','Tasha Brown','Youth conversation','We never announce anything and nobody knows what is happening. Communication is a mess.','paste',13)", [randomUUID(), room.id]);
      await page.getByRole("button", { name: "Redraft themes" }).click();
      await theme("Communication is unclear").waitFor({ timeout: 30000 });
      const after = await rows();
      assert.ok(before.filter(r => r.status === "accepted").every(r => after.some(a => a.label === r.label && a.status === "accepted")), "accepted themes stay");
      const labels = after.filter(r => !r.merged_into).map(r => `${r.source}:${r.label}`);
      assert.equal(new Set(labels).size, labels.length, "no theme offered twice");
      assert.ok(await theme("Communication is unclear").locator(".cwl-ai-mark").count() >= 1);
      await shot(page, "redraft");
    });

    await step("A slow draft says so and the facilitator adds a theme by hand while it runs", async () => {
      fake({ delayMs: 9000 });
      await page.getByRole("button", { name: "Redraft themes" }).click();
      await page.getByText("This is taking longer than usual").waitFor({ timeout: 15000 });
      await shot(page, "slow");
      await page.getByRole("button", { name: "Add a theme by hand" }).click();
      const form = page.getByRole("form", { name: "Add a theme by hand" });
      await form.getByLabel("Theme", { exact: true }).fill("People want more prayer");
      await form.getByRole("checkbox").first().check();
      await form.getByRole("button", { name: "Add and accept" }).click();
      await theme("People want more prayer").waitFor();
      await theme("People want more prayer").getByText("Written by hand").waitFor();
      await until(async () => (await sql.query("select count(*)::int n from private.discover_accepted_themes($1) where label='People want more prayer'", [room.id])).rows[0].n === 1, "a hand-made theme counts once accepted");
      await page.getByText("This is taking longer than usual").waitFor({ state: "detached", timeout: 30000 });
      fake({});
    });

    await step("A failed draft says so, offers a retry, and leaves the page working", async () => {
      fake({ fail: true });
      await sql.query("insert into private.conversation_notes(id,engagement_id,kind,person,title,body,source_kind,word_count) values($1,$2,'interview','Ana Cruz','Interview 4','Nobody checks on the leaders, and leaders feel alone.','paste',9)", [randomUUID(), room.id]);
      await page.getByRole("button", { name: "Redraft themes" }).click();
      // The first failure is retried after a pause; shorten the pause so the kit does not wait for it.
      await until(async () => { const r = (await sql.query("select attempts from private.discover_theme_rounds where engagement_id=$1 and not deleted and status='pending'", [room.id])).rows[0]; return r && r.attempts >= 1; }, "first failure", 30000);
      await sql.query("update private.discover_theme_rounds set last_failed_at=now()-interval '5 minutes' where engagement_id=$1 and not deleted", [room.id]);
      await page.getByText("AI couldn't draft themes this time").waitFor({ timeout: 45000 });
      await shot(page, "failed");
      assert.equal((await sql.query("select status from private.discover_theme_rounds where engagement_id=$1 and not deleted", [room.id])).rows[0].status, "failed");
      assert.equal(await page.getByRole("button", { name: "Redraft themes" }).isEnabled(), true, "the facilitator can try again");
      assert.equal(await page.getByRole("button", { name: "Add a theme by hand" }).isEnabled(), true, "or write one");
      fake({});
      await page.getByRole("button", { name: "Redraft themes" }).click();
      await until(async () => (await sql.query("select status from private.discover_theme_rounds where engagement_id=$1 and not deleted", [room.id])).rows[0].status === "ready", "the retry works", 30000);
    });

    await step("Both facilitators can use it; nobody else reaches it", async () => {
      const coContext = await browser!.newContext(); await coContext.addCookies(co.cookies(app.origin));
      const copage = await coContext.newPage(); await copage.goto(url);
      await copage.getByRole("heading", { name: "Themes", level: 2 }).waitFor({ timeout: 15000 });
      assert.ok(await copage.locator(".dsc-theme").count() >= 6, "the co-facilitator reads the same themes");
      await coContext.close();
      const anon = await fetch(`${app.origin}/api/discover/${room.id}/themes`);
      assert.ok([401, 403].includes(anon.status), `anonymous refused, got ${anon.status}`);
      const other = await browser!.newContext(); await other.addCookies(stranger.cookies(app.origin));
      assert.equal((await other.request.get(`${app.origin}/api/discover/${room.id}/themes`)).status(), 403, "another engagement's facilitator is denied");
      const post = await other.request.post(`${app.origin}/api/discover/${room.id}/themes`, { headers: { Origin: app.origin }, data: { action: "draft", id: randomUUID() } });
      assert.equal(post.status(), 403, "and cannot draft");
      await other.close();
      const cross = await context.request.post(`${app.origin}/api/discover/${room.id}/themes`, { headers: { Origin: "https://example.org" }, data: { action: "draft", id: randomUUID() } });
      assert.equal(cross.status(), 403, "a request from another origin is refused");
      const state = (await sql.query("select to_jsonb(r)::text as t from public.room_states r where engagement_id=$1", [room.id])).rows[0];
      assert.ok(!state || !/Small groups|carry the work/.test(String(state.t)), "themes never reach the room state");
      const runs = (await sql.query("select count(*)::int n from private.ai_runs where engagement_id=$1 and job='draft_discover_themes' and (coalesce(error,'')||inputs::text||coalesce(output::text,'')) ~* '(Priya|Ben Ortiz|Ruth Lee|Sam Cho|Daniel Park|Tasha Brown|Ana Cruz|Shah)'", [room.id])).rows[0].n;
      assert.equal(runs, 0, "no person field in what was sent or what came back");
    });

    await step("Before the themes functions are in the database the page keeps the list it had, and says nothing is wrong", async () => {
      const reload = () => sql.query("notify pgrst, 'reload schema'");
      const seen = async (check: () => Promise<boolean>, label: string) => until(async () => { await page.goto(url); return await check(); }, label, 45000);
      await sql.query("alter function public.discover_themes_state(uuid) rename to discover_themes_state_off"); await reload();
      try {
        await seen(async () => (await page.getByRole("heading", { name: "Themes", level: 2 }).count()) > 0 && (await page.getByRole("button", { name: /Draft themes|Redraft themes/ }).count()) === 0, "the page shows the read-only list");
        const text = await page.locator("main").innerText();
        assert.ok(!/couldn't|isn't ready|error/i.test(text.split("Themes")[1] ?? ""), "and no complaint");
        assert.ok(await page.getByRole("heading", { name: "Survey findings" }).count() > 0, "the rest of Discover is unchanged");
      } finally { await sql.query("alter function public.discover_themes_state_off(uuid) rename to discover_themes_state"); await reload(); }
      await seen(async () => (await page.getByRole("button", { name: /Draft themes|Redraft themes/ }).count()) > 0, "the drafting controls come back");
    });


    await step("The page follows the database while it stays open: counts, the added-since line and the round after a clear, with no reload", async () => {
      // The page is not reloaded after it opens. Changes are made in the database, as another window or the control surface would make them.
      await page.goto(url);
      await page.getByText(/AI offered \d+ themes?/).waitFor({ timeout: 15000 });
      const total = async () => (await sql.query("select count(*)::int n from private.conversation_notes where engagement_id=$1 and not deleted", [room.id])).rows[0].n as number;
      const before = await total();
      const first = page.locator(".dsc-theme", { hasText: "of " + before + " conversation" }).first();
      await first.waitFor({ timeout: 15000 });
      await sql.query("insert into private.conversation_notes(id,engagement_id,kind,person,title,body,source_kind,word_count) values($1,$2,'input','Mia Lund','Added elsewhere','A note that arrives while the page is open.','paste',8)", [randomUUID(), room.id]);
      await page.getByText(/1 note was added since/).waitFor({ timeout: 15000 });
      await page.locator(".dsc-theme", { hasText: "of " + (before + 1) + " conversation" }).first().waitFor({ timeout: 15000 });
      assert.equal(await page.locator(".dsc-theme", { hasText: "of " + before + " conversation" }).count(), 0, "no theme still says the old total");
      // Clear test answers puts the drafted themes away and the round quiet: the line about what AI offered goes with them.
      await sql.query("update private.discover_themes set deleted=true where engagement_id=$1 and source<>'survey' and ai_run is not null", [room.id]);
      await sql.query("update private.discover_theme_rounds set status='idle' where engagement_id=$1 and not deleted and status='ready'", [room.id]);
      await until(async () => (await page.getByText(/AI offered \d+ themes?/).count()) === 0, "AI offered N themes goes once no drafted theme is left, without a reload", 15000);
      assert.equal(await page.locator(".dsc-theme .cwl-ai-mark").count(), 0, "and no drafted theme is left on the page");
    });
    console.log(`Themes kit: ${passed.length} checks passed.`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally {
    if (replaced && original) await sql.query(original).catch(() => {});
    await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {});
  }
}
main().catch(error => { console.error(error); process.exit(1); });
