// Milestone 6, step 4: What We Heard drafted from the accepted themes (PRE-08), in a real browser against the production build and the local
// stack, with the scripted fake model (never the API). The facilitator presses Draft What We Heard; one headline with depth arrives for each
// What We Heard step in the run of show, from accepted themes only, with the AI icon, the lead figure as the number and quotes the room said;
// a source with nothing accepted says so; the facilitator edits and presses Apply, which writes the step's headline, number, source and phone
// depth through the run of show's own save and changes nothing else; a slow draft and a failed one say so and the facilitator types a headline
// by hand; nobody else reaches any of it. Step 2's card function is stood in for by a fixed set and put back at the end.
// KIT_SHOTS=<folder> saves the screens. Local only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, startApp, until } from "./harness";

const controlDir = join(tmpdir(), `clearway-heard-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
const fake = (value: { delayMs?: number; fail?: boolean }) => writeFileSync(controlFile, JSON.stringify(value));
fake({});
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "250", ANTHROPIC_API_KEY: "", CLEARWAY_AI_HEARD_SLOW_MS: "2500" });

const names = ["Priya Shah", "Ben Ortiz", "Ruth Lee", "Sam Cho", "Daniel Park", "Tasha Brown"];
const notes: [string, string, string, string][] = [
  ["interview", names[0], "Interview 1", "Newcomers cannot find a small group to join. The groups are full and nobody tells them the next step."],
  ["interview", names[1], "Interview 2", "Our music and worship are a real strength. People stay for the singing."],
  ["interview", names[4], "Interview 3", "Small groups are hard to find for new families too."],
  ["input", names[2], "Board conversation", "Volunteers are stretched thin, the same five people every week."],
  ["input", names[3], "Staff conversation", "Volunteers are tired. The same few people do everything."],
];
const cards: [string, string, number][] = [["wrong", "Hard to find a small group as a newcomer", 5], ["wrong", "The same few volunteers do everything", 3]];
const stepRows: [string, string, string][] = [["What we heard: Survey", "Congregational survey", "survey"], ["What we heard: Four Helpful Lists", "Four Helpful Lists", "four_lists"],
  ["What we heard: Board and staff input", "Board and staff input conversations", "input"], ["What we heard: Leadership interviews", "Leadership interviews", "interviews"]];

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined, replaced = false, original = "";
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(700); await page.screenshot({ path: `${process.env.KIT_SHOTS}/what-we-heard-${name}.png`, fullPage: true }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    original = (await sql.query("select pg_get_functiondef('private.four_lists_cards_for_themes(uuid)'::regprocedure) as def")).rows[0].def as string;
    const room = await engagement(sql, ["Priya"]), elsewhere = await engagement(sql, []);
    const people = Array.from({ length: 8 }, () => randomUUID());
    const cardRows = cards.map(([column, text, agree]) => ({ card_id: randomUUID(), session_id: randomUUID(), column, text, agree, folded_ids: [] as string[], people: people.slice(0, agree + 1) }));
    await sql.query(`create or replace function private.four_lists_cards_for_themes(p_engagement uuid) returns table(card_id uuid,session_id uuid,"column" text,"text" text,agree integer,folded_ids uuid[],people uuid[])
      language sql stable security definer set search_path='' as $f$ select c.card_id,c.session_id,c."column",c."text",c.agree,c.folded_ids,c.people from jsonb_to_recordset('${JSON.stringify(cardRows)}'::jsonb) as c(card_id uuid,session_id uuid,"column" text,"text" text,agree integer,folded_ids uuid[],people uuid[]) where p_engagement='${room.id}'::uuid $f$`);
    replaced = true;
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [room.id]);
    // The four What We Heard steps as the templates make them. The interviews step comes last, so a source can be left with no accepted themes.
    const steps: Record<string, string> = {};
    for (const [i, [title, source, key]] of stepRows.entries()) steps[key] = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,options,phone_depth)
      values($1,$2,'Pre-call',$3,'content','','draft',$4::jsonb,'') returning id`, [room.id, title, 10 + i, JSON.stringify({ screen: "headline", source })])).rows[0].id as string;
    const fac = await facilitator(env, sql, room.id), co = await facilitator(env, sql, room.id), stranger = await facilitator(env, sql, elsewhere.id);
    const rpc = async (name: string, args: Record<string, unknown>) => { const r = await fac.client.rpc(name, args); assert.equal(r.error, null, `${name}: ${r.error?.message}`); assert.equal((r.data as { status: string }).status, "ok", `${name}: ${JSON.stringify(r.data)}`); return r.data; };
    // Findings, notes and accepted themes, all made by the facilitator's own functions.
    await rpc("discover_total_set", { p_engagement: room.id, p_total: 87 });
    for (const [title, figure, n] of [["A clear way into groups", "31%", 27], ["Decision making is unclear", "33%", 33], ["People under 30", "6", 6]] as const) await rpc("discover_finding_save", { p_engagement: room.id, p_id: randomUUID(), p_title: title, p_figure: figure, p_rests_on: n });
    const ids = notes.map(() => randomUUID());
    for (const [i, [kind, person, title, body]] of notes.entries()) await rpc("discover_note_add", { p_engagement: room.id, p_id: ids[i], p_kind: kind, p_person: person, p_title: title, p_body: body, p_source: "paste" });
    const theme = async (source: string, label: string, detail: string, srcs: string[]) => { const id = randomUUID(); await rpc("discover_theme_add", { p_engagement: room.id, p_id: id, p_source: source, p_label: label, p_detail: detail, p_sources: srcs }); return id; };
    const small = await theme("conversations", "Small groups are hard to find", "Newcomers cannot find a way in.", [ids[0], ids[2]]);
    const stretched = await theme("conversations", "Volunteers are stretched", "The same few people carry the work.", [ids[3], ids[4]]);
    await theme("four_lists", "Hard to find a small group", "Newcomers cannot find a way into a group.", [cardRows[0].card_id]);
    const quote = (themeId: string, note: string, text: string) => sql.query("update private.discover_theme_sources set quote=$3 where theme_id=$1 and note_id=$2", [themeId, note, text]);
    await quote(small, ids[0], "Newcomers cannot find a small group to join."); await quote(small, ids[2], "Small groups are hard to find for new families too.");
    await quote(stretched, ids[3], "The same five people every week.");
    await sql.query("update private.discover_theme_sources set quote='Hard to find a small group as a newcomer' where card_id=$1", [cardRows[0].card_id]);
    // Make the leadership interviews source have nothing accepted: turn the interview theme down.
    await rpc("discover_theme_act", { p_engagement: room.id, p_theme: small, p_action: "undo", p: null });

    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
    await context.addCookies(fac.cookies(app.origin));
    const page = await context.newPage();
    const url = `${app.origin}/setup/${room.id}/discover`;
    const source = (key: string) => page.locator(`[data-source="${key}"]`);
    const drafts = async () => (await sql.query("select source_key,number,line,detail,thin,ai_run is not null as ai,applied_at from private.heard_drafts where engagement_id=$1 and not deleted order by source_key", [room.id])).rows;
    const stepRow = async (key: string) => (await sql.query("select state,prompt,phone_depth,options,revision from public.sessions where id=$1", [steps[key]])).rows[0];

    await step("Before drafting, each source says what it has, and a source with nothing accepted says so", async () => {
      await page.goto(url);
      await page.getByRole("heading", { name: "What We Heard", level: 2 }).waitFor({ timeout: 15000 });
      const text = await page.locator("main").innerText();
      assert.ok(!/[–—]/.test(text), "no dashes in the copy");
      for (const [, , key] of stepRows) await source(key).waitFor();
      assert.match(await source("interviews").innerText(), /Nothing accepted yet for leadership interviews/, "a source with no accepted themes says so");
      assert.match(await source("survey").innerText(), /3 accepted themes, 1 thin/);
      assert.equal(await page.getByRole("button", { name: "Draft What We Heard" }).isEnabled(), true);
      assert.equal((await drafts()).length, 0);
      await shot(page, "before");
    });

    await step("Draft What We Heard: a headline arrives for each source that has accepted themes, from accepted themes only", async () => {
      await page.getByRole("button", { name: "Draft What We Heard" }).click();
      await source("survey").getByLabel("Headline line").waitFor({ timeout: 30000 });
      await until(async () => (await drafts()).length === 3, "three drafts saved", 30000);
      const d = await drafts();
      assert.deepEqual(d.map(r => r.source_key), ["four_lists", "input", "survey"], "the interviews source has none");
      assert.ok(d.every(r => r.ai && r.line && !r.applied_at), "each is an AI draft, not yet applied");
      const survey = d.find(r => r.source_key === "survey")!;
      assert.equal(survey.number, "33%", "the number is the lead theme's figure, set by the database, not the model");
      assert.equal(await source("survey").getByLabel("Number").inputValue(), "33%");
      assert.ok(await source("survey").locator(".cwl-ai-mark").count() >= 1, "the AI icon on a draft");
      assert.ok(await source("four_lists").locator("blockquote, .dsc-wwh-quotes li").count() >= 1, "quotes the room said, kept by the facilitator");
      assert.match(await source("interviews").innerText(), /Nothing accepted yet/, "and the source with nothing still says so");
      assert.ok(!new RegExp(names.join("|")).test(await page.locator("main").innerText()), "no person on the page");
      assert.equal((await sql.query("select count(*)::int n from private.ai_runs where engagement_id=$1 and job='draft_what_we_heard' and status='ok'", [room.id])).rows[0].n, 1);
      assert.equal((await stepRow("survey")).prompt, "", "nothing is written to a step until Apply");
      await shot(page, "drafted");
    });

    await step("Edit saves the facilitator's words, and a redraft keeps them", async () => {
      const box = source("survey").getByLabel("Headline line");
      await box.fill("named **who decides** as what to improve");
      await source("survey").getByRole("button", { name: "Save draft" }).click();
      await until(async () => (await drafts()).find(r => r.source_key === "survey")?.line === "named **who decides** as what to improve", "the edit is saved");
      await page.getByRole("button", { name: "Redraft What We Heard" }).click();
      await until(async () => (await sql.query("select status from private.heard_rounds where engagement_id=$1 and not deleted", [room.id])).rows[0]?.status === "ready", "redraft done", 30000);
      assert.equal((await drafts()).find(r => r.source_key === "survey")?.line, "named **who decides** as what to improve", "an edited draft is kept");
      assert.equal(await source("survey").getByLabel("Headline line").inputValue(), "named **who decides** as what to improve");
    });

    await step("Apply writes the step's headline, number, source and phone depth, and nothing else, and nothing goes live", async () => {
      const before = await stepRow("four_lists");
      await source("four_lists").getByRole("button", { name: "Apply" }).click();
      await source("four_lists").locator(".dsc-applied").waitFor({ timeout: 20000 });
      const after = await stepRow("four_lists");
      assert.ok(after.prompt.length > 5, "the headline is written");
      assert.ok(after.options.number, "with its number");
      assert.match(after.options.source, /^Four Helpful Lists/, "the source line keeps the source's name");
      assert.equal(after.options.screen, "headline");
      assert.ok(after.phone_depth.length > 5, "and the phone depth");
      assert.equal(after.state, before.state, "the step's state is unchanged: nothing reaches the TV or phones");
      assert.ok(after.revision > before.revision, "it went through the run of show's save");
      assert.ok((await drafts()).find(r => r.source_key === "four_lists")?.applied_at, "the draft is marked applied");
      await source("survey").getByRole("button", { name: "Apply" }).click();
      await until(async () => (await stepRow("survey")).prompt.includes("who decides"), "the edited survey headline is written", 15000);
      assert.equal((await sql.query("select count(*)::int n from public.sessions where engagement_id=$1 and title like 'What we heard%' and state<>'draft'", [room.id])).rows[0].n, 0, "no step is ready or on the TV");
      await shot(page, "applied");
    });

    await step("A step that is on the TV now takes the change through the same save, and stays where it is", async () => {
      await sql.query("update public.sessions set state='live' where id=$1", [steps.input]);
      const before = await stepRow("input");
      await source("input").getByRole("button", { name: "Apply" }).click();
      await source("input").locator(".dsc-applied").waitFor({ timeout: 20000 });
      const after = await stepRow("input");
      assert.ok(after.prompt.includes("volunteers") || after.prompt.length > 5, "the headline is written");
      assert.equal(after.state, "live", "the step stays live");
      assert.ok(after.revision > before.revision, "through the run of show's own save");
      await sql.query("update public.sessions set state='draft' where id=$1", [steps.input]);
    });

    await step("A slow draft says so, and the facilitator types a headline by hand while it runs", async () => {
      fake({ delayMs: 9000 });
      await page.getByRole("button", { name: "Redraft What We Heard" }).click();
      await page.getByText("This is taking longer than usual").waitFor({ timeout: 15000 });
      await shot(page, "slow");
      await source("interviews").getByRole("button", { name: "Type it by hand" }).click();
      await source("interviews").getByLabel("Number").fill("2 of 3");
      await source("interviews").getByLabel("Headline line").fill("interviews named **small groups** as hard to find");
      await source("interviews").getByRole("button", { name: "Apply" }).click();
      await until(async () => (await stepRow("interviews")).prompt.includes("small groups"), "a hand-typed headline is applied", 20000);
      assert.equal((await stepRow("interviews")).options.number, "2 of 3");
      await page.getByText("This is taking longer than usual").waitFor({ state: "detached", timeout: 30000 });
      fake({});
    });

    await step("A failed draft says so, offers a retry, and leaves the page working", async () => {
      fake({ fail: true });
      await page.getByRole("button", { name: "Redraft What We Heard" }).click();
      await until(async () => { const r = (await sql.query("select attempts from private.heard_rounds where engagement_id=$1 and not deleted and status='pending'", [room.id])).rows[0]; return r && r.attempts >= 1; }, "first failure", 30000);
      await sql.query("update private.heard_rounds set last_failed_at=now()-interval '5 minutes' where engagement_id=$1 and not deleted", [room.id]);
      await page.getByText("AI couldn't draft the headlines this time").waitFor({ timeout: 45000 });
      await shot(page, "failed");
      assert.equal((await sql.query("select status from private.heard_rounds where engagement_id=$1 and not deleted", [room.id])).rows[0].status, "failed");
      assert.equal(await page.getByRole("button", { name: "Redraft What We Heard" }).isEnabled(), true, "the facilitator can try again");
      assert.equal(await source("survey").getByRole("button", { name: "Apply" }).isEnabled(), true, "and the page still works by hand");
      fake({});
      await page.getByRole("button", { name: "Redraft What We Heard" }).click();
      await until(async () => (await sql.query("select status from private.heard_rounds where engagement_id=$1 and not deleted", [room.id])).rows[0].status === "ready", "the retry works", 30000);
    });

    await step("Both facilitators can use it; nobody else reaches it; no person reaches the model", async () => {
      const coContext = await browser!.newContext(); await coContext.addCookies(co.cookies(app.origin));
      const copage = await coContext.newPage(); await copage.goto(url);
      await copage.getByRole("heading", { name: "What We Heard", level: 2 }).waitFor({ timeout: 15000 });
      assert.ok(await copage.locator("[data-source]").count() === 4, "the co-facilitator reads the same four sources");
      await coContext.close();
      const anon = await fetch(`${app.origin}/api/discover/${room.id}/heard`);
      assert.ok([401, 403].includes(anon.status), `anonymous refused, got ${anon.status}`);
      const other = await browser!.newContext(); await other.addCookies(stranger.cookies(app.origin));
      assert.equal((await other.request.get(`${app.origin}/api/discover/${room.id}/heard`)).status(), 403, "another engagement's facilitator is denied");
      const post = await other.request.post(`${app.origin}/api/discover/${room.id}/heard`, { headers: { Origin: app.origin }, data: { action: "draft", id: randomUUID() } });
      assert.equal(post.status(), 403, "and cannot draft");
      const apply = await other.request.post(`${app.origin}/api/discover/${room.id}/heard`, { headers: { Origin: app.origin }, data: { action: "apply", source: "survey", number: "1", line: "x", detail: "" } });
      assert.equal(apply.status(), 403, "or apply");
      await other.close();
      const cross = await context.request.post(`${app.origin}/api/discover/${room.id}/heard`, { headers: { Origin: "https://example.org" }, data: { action: "draft", id: randomUUID() } });
      assert.equal(cross.status(), 403, "a request from another origin is refused");
      const state = (await sql.query("select to_jsonb(r)::text as t from public.room_states r where engagement_id=$1", [room.id])).rows[0];
      assert.ok(!state || !/Small groups|who decides/.test(String(state.t)), "drafts never reach the room state");
      const leaks = (await sql.query("select count(*)::int n from private.ai_runs where engagement_id=$1 and job='draft_what_we_heard' and (coalesce(error,'')||inputs::text||coalesce(output::text,'')) ~* '(Priya|Ben Ortiz|Ruth Lee|Sam Cho|Daniel Park|Tasha Brown|Shah)'", [room.id])).rows[0].n;
      assert.equal(leaks, 0, "no person field in what was sent or what came back");
    });

    await step("Before the What We Heard functions are in the database the page leaves the section out, and says nothing is wrong", async () => {
      const reload = () => sql.query("notify pgrst, 'reload schema'");
      const seen = async (check: () => Promise<boolean>, label: string) => until(async () => { await page.goto(url); return await check(); }, label, 45000);
      await sql.query("alter function public.discover_heard_state(uuid) rename to discover_heard_state_off"); await reload();
      try {
        await seen(async () => (await page.getByRole("heading", { name: "What We Heard", level: 2 }).count()) === 0 && (await page.getByRole("heading", { name: "Themes", level: 2 }).count()) > 0, "the section is gone and Themes remains");
        assert.ok(!/couldn't|isn't ready|error/i.test(await page.locator("main").innerText()), "and no complaint");
      } finally { await sql.query("alter function public.discover_heard_state_off(uuid) rename to discover_heard_state"); await reload(); }
      await seen(async () => (await page.getByRole("heading", { name: "What We Heard", level: 2 }).count()) > 0, "the section comes back");
    });

    console.log(`What We Heard kit: ${passed.length} checks passed.`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally {
    if (replaced && original) await sql.query(original).catch(() => {});
    await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {});
  }
}
main().catch(error => { console.error(error); process.exit(1); });
