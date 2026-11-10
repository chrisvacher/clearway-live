// Milestone 3, step 7b: a team workshop end to end, the way Chris runs one, in real browsers
// against the production build and the local stack. The facilitator starts an engagement from
// the team workshop template, pairs a TV through setup, signs in eight phones, rehearses and
// clears the test answers, then runs every session in order from the control surface with AI on
// (the scripted fake model, never the API), closes Day 1, exports each session's CSV and prints
// the recap. The TV, the phones and the counts are checked at every step, and nothing from the
// rehearsal may survive the clear. No email is sent: a local mailbox stands in for Resend.
// KIT_SHOTS=<folder> saves the screens and recap.pdf. Local only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { aiSignInLine, aiSignInLink } from "../../lib/ai/disclosure";
import { db, engagement, facilitator, localEnv, mailbox, startApp, until } from "./harness";

// The scripted fake model, as the AI kit runs it: a control file can slow it down or fail it.
const controlDir = join(tmpdir(), `clearway-team-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
writeFileSync(controlFile, "{}");
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "250", ANTHROPIC_API_KEY: "" });

const teamWorkshop = "c1ea0000-0000-4000-8000-000000000001";
const people = ["Priya", "Ben", "Ruth", "Grace", "Mateo", "Sam", "Joy", "Ken"];
// Words only the rehearsal uses, so any trace of it after the clear is easy to find.
const rehearsalWords = ["rehearsing", "dryrun", "Rehearsal card about baptisms", "Rehearsal question about the budget?"];

type Results = { total: number; people: number; [key: string]: unknown };
type Phone = { name: string; ctx: BrowserContext; page: Page };

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shots = process.env.KIT_SHOTS;
  // Screens are saved at rest: once nothing on the page has moved for 400 ms.
  const settle = async (page: Page) => {
    const read = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[style]")].map(e => `${e.style.transform}|${e.style.opacity}|${e.style.width}`).join(";"));
    let last = await read();
    for (let i = 0; i < 20; i++) { await delay(400); const now = await read(); if (now === last) return; last = now; }
  };
  const shot = async (page: Page, name: string) => { if (shots) { await delay(500); await settle(page); await page.screenshot({ path: `${shots}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    const room = await engagement(sql, people);
    await sql.query("update public.engagements set title='Team workshop',type='team_workshop',settings=settings||'{\"ai_enabled\":true}' where id=$1", [room.id]);
    const fac = await facilitator(env, sql, room.id);
    const results = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [room.id])).rows[0]?.results as Results;
    const liveId = async () => (await sql.query("select live_session_id from public.room_states where engagement_id=$1", [room.id])).rows[0]?.live_session_id as string | null;
    const sessions = async () => (await sql.query("select id,title,interaction,state,shown_at from public.sessions where engagement_id=$1 and not deleted order by position,id", [room.id])).rows as
      { id: string; title: string; interaction: string; state: string; shown_at: Date | null }[];
    const idOf = async (title: string) => (await sessions()).find(s => s.title === title)!.id;
    browser = await chromium.launch();

    // ---------- Setup: the template, the TV and eight phones ----------
    const facContext = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
    await facContext.addCookies(fac.cookies(app.origin));
    const setup = await facContext.newPage();
    await step("Use a template from the team workshop template", async () => {
      await setup.goto(`${app.origin}/setup/templates?engagement=${room.id}`);
      const card = setup.locator(".tpl-card", { hasText: "Team workshop" }).filter({ hasText: "Ships with the app" });
      await card.waitFor({ timeout: 15000 });
      await card.getByRole("button", { name: "Preview" }).click();
      await setup.locator(".tpl-panel").getByRole("button", { name: "Use this template" }).click();
      const dialog = setup.getByRole("dialog", { name: "Use a template" });
      await dialog.waitFor();
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      await dialog.locator("#start-time").fill(`${tomorrow}T19:00`);
      await dialog.getByRole("button", { name: "Apply template" }).click();
      await setup.waitForURL(`**/setup/${room.id}/run-of-show**`, { timeout: 15000 });
      await setup.getByText("Started from the template: 11 sessions added.").waitFor();
      const copied = await sessions();
      const template = (await sql.query("select sessions from private.templates where id=$1", [teamWorkshop])).rows[0].sessions as { title: string; interaction: string }[];
      assert.deepEqual(copied.map(s => s.title), template.map(t => t.title), "every session, in order");
      assert.ok(copied.every(s => s.state === "ready"), "every session Ready");
      await shot(setup, "team-run-of-show");
    });

    const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
    const tally = async () => (await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").then(v => v ?? "").catch(() => "")).trim();
    await step("Pair the TV from setup with the code on the screen", async () => {
      await tv.goto(app.origin + "/tv");
      const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
      await setup.goto(`${app.origin}/setup/${room.id}/tv`);
      await setup.locator("#tv-pair-code").fill(code); await setup.locator("#tv-label").fill("Workshop TV");
      await setup.getByRole("button", { name: "Pair this TV" }).click();
      await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
      await until(async () => (await setup.locator(".tv-screen-list").innerText().catch(() => "")).includes("Workshop TV"), "the TV in Paired screens", 10000);
      await setup.close();
    });

    const phones: Phone[] = [];
    await step("Eight phones sign in by email code; the AI line sits under Sign in and links to How we use AI", async () => {
      for (const [i, person] of room.attendees.entries()) {
        const ctx = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const page = await ctx.newPage(); await page.goto(`${app.origin}/room/${room.id}`);
        if (i === 0) {
          const note = page.locator('[data-ai-disclosure="sign-in"]');
          await note.waitFor();
          assert.equal((await note.innerText()).replace(/\s+/g, " ").trim(), `${aiSignInLine} ${aiSignInLink}`, "the approved words, with AI on");
          assert.equal(await note.locator("a").getAttribute("href"), "/how-we-use-ai");
          await shot(page, "team-sign-in-phone");
        }
        const before = mail.count;
        await page.fill("#room-email", person.email); await page.getByRole("button", { name: "Send me a sign-in code" }).click();
        await page.fill("#room-code", await mail.code(person.email, before)); await page.getByRole("button", { name: "Sign in" }).click();
        await page.locator(".ph-app").waitFor({ timeout: 15000 });
        phones.push({ name: person.name, ctx, page });
      }
      assert.equal(phones.length, 8);
    });
    const all = <T>(run: (p: Phone, i: number) => Promise<T>) => Promise.all(phones.map(run));

    const control = await facContext.newPage();
    await control.goto(`${app.origin}/control/${room.id}`);
    await control.locator(".ctl-app").waitFor({ timeout: 15000 });
    const stats = async () => control.locator(".ctl-stats b").allInnerTexts();
    // The TV's count, the server's and the control surface's agree (one source for every count).
    async function counts(label: string, expected: { people?: number; total?: number; unit: "answering" | "answers" | "questions" | null }) {
      await until(async () => {
        const r = await results(); if (!r) return false;
        if (expected.people !== undefined && r.people !== expected.people) return false;
        if (expected.total !== undefined && r.total !== expected.total) return false;
        if (expected.unit) {
          const n = expected.unit === "answering" ? r.people : r.total;
          const word = expected.unit === "answers" && n === 1 ? "answer" : expected.unit === "questions" && n === 1 ? "question" : expected.unit;
          const label = expected.unit === "answering" ? `${n} ${word}` : `${n} ${word} from ${r.people} ${r.people === 1 ? "person" : "people"}`;
          if (await tally() !== label) return false;
        }
        const s = await stats();
        return s[1] === String(r.people) && s[2] === String(r.total);
      }, `${label}: the TV, the server and the control surface agree`, 15000).catch(async error => {
        throw new Error(`${error.message}\nserver ${JSON.stringify({ people: (await results())?.people, total: (await results())?.total })} TV "${await tally()}" control ${JSON.stringify(await stats())}`);
      });
    }
    const prompts = async () => new Map((await sql.query("select title,prompt from public.sessions where engagement_id=$1 and not deleted", [room.id])).rows.map(r => [r.title as string, r.prompt as string]));
    // Every phone shows the step's prompt: the phones have moved with the room.
    const phonesOn = async (title: string) => { const prompt = (await prompts()).get(title)!; await all(p => until(async () => (await p.page.locator(".ph-app").innerText().catch(() => "")).includes(prompt), `${title} on ${p.name}'s phone`, 20000)); };
    const goLive = async (title: string) => {
      await control.getByRole("button", { name: `Preview ${title}` }).click();
      await control.getByRole("button", { name: "Go live from preview" }).click();
      const id = await idOf(title);
      await until(async () => await liveId() === id, `${title} live`, 10000);
      await phonesOn(title);
    };
    // Next from the control surface, as Chris presses it; the TV follows.
    const next = async (title: string, kind: string) => {
      await until(async () => (await control.locator(".ctl-controls.is-laptop").getByRole("button", { name: "Next" }).getAttribute("title")) === title, `Next points at ${title}`, 10000);
      await control.locator(".ctl-controls.is-laptop").getByRole("button", { name: "Next" }).click();
      const id = await idOf(title);
      await until(async () => await liveId() === id, `${title} live`, 10000);
      if (kind === "screen_check") await until(async () => await tv.locator(".tv-check.is-active").count() === 1, "the screen check on the TV", 10000);
      else await until(async () => (await layer().getAttribute("data-kind")) === kind, `${title} on the TV`, 10000);
      if (kind !== "content" && kind !== "screen_check") await phonesOn(title);
    };
    const onEveryPhone = (label: string, check: (p: Page) => Promise<boolean>) => all(p => until(async () => await check(p.page), `${label} on ${p.name}'s phone`, 20000)
      .catch(async error => { await p.page.screenshot({ path: join(controlDir, "..", `team-kit-${p.name}.png`) }).catch(() => {}); throw new Error(`${error.message}: the phone says ${JSON.stringify((await p.page.locator(".ph-app").innerText().catch(() => "")).slice(0, 700))}`); }));
    const bodyOf = (p: Page) => p.locator(".ph-body").innerText().catch(() => "");

    // ---------- The rehearsal, then Clear test answers ----------
    const [priya, ben, ruth] = phones;
    const send = async (p: Page, text: string) => {
      // Type again until it holds: a phone moving to the next step swaps its answer box.
      await until(async () => { await p.fill("#ph-answer", text, { timeout: 2000 }); await delay(150); return await p.inputValue("#ph-answer") === text && await p.locator(".ph-send").isEnabled(); }, `Send is ready for "${text}"`, 10000).catch(async error => {
        throw new Error(`${error.message}: the phone says ${JSON.stringify((await p.locator(".ph-app").innerText()).slice(0, 600))}`); });
      await p.locator(".ph-send").click();
    };
    await step("Rehearse: test answers on the scale, the word cloud, the wall and Q&A, marked on phones and the control surface", async () => {
      await control.getByRole("button", { name: "Start rehearsal" }).click();
      await until(async () => await control.locator(".sp-rehearsing").isVisible(), "Rehearsing on the control surface", 8000);
      await goLive("Check-in");
      await onEveryPhone("the rehearsal line", async p => (await bodyOf(p)).includes("Rehearsal. Your answers are test answers"));
      await priya.page.getByRole("radio", { name: "2" }).click(); await ben.page.getByRole("radio", { name: "5" }).click();
      await counts("rehearsal scale", { people: 2, unit: "answering" });
      await shot(priya.page, "team-rehearsal-phone");
      await goLive("One word for this season");
      await send(priya.page, "rehearsing, dryrun"); await send(ben.page, "dryrun");
      await until(async () => (await layer().innerText()).includes("dryrun"), "rehearsal words on the TV", 8000);
      await goLive("What's working");
      await send(priya.page, rehearsalWords[2]); await send(ruth.page, "Rehearsal: baptism class doubled");
      await until(async () => ((await results()).groups as unknown[] | undefined)?.length === 1, "AI groups the rehearsal cards", 15000);
      await control.locator("[data-ai-panel]").getByRole("button", { name: "Show summary" }).click();
      await until(async () => (await layer().locator(".ai-summary:not(.is-off) .ai-summary-text").innerText().catch(() => "")).length > 0, "a rehearsal summary on the TV", 15000);
      await shot(tv, "team-rehearsal-wall-tv");
      await goLive("Your questions");
      await ben.page.locator("#qa-question").fill(rehearsalWords[3]); await ben.page.locator(".qa-ask-form .ph-send").click();
      await until(async () => (await layer().innerText()).includes("budget"), "the rehearsal question on the TV", 8000);
      await control.locator(".qa-ctl-item", { hasText: "budget" }).first().getByRole("button", { name: "Spotlight" }).click();
      await until(async () => await tv.locator(".qa-spot.is-on").count() === 1, "a spotlit rehearsal question", 8000);
      await until(async () => (await control.locator(".sp-rehearsal .ctl-label").innerText()).startsWith("7 test items"), "the control surface counts the test answers", 10000);
      await shot(control, "team-rehearsal-control");
    });
    await step("Clear test answers: refused while live, then everything from the rehearsal goes and the steps are Ready again", async () => {
      assert.equal(await control.getByRole("button", { name: "Clear test answers" }).isDisabled(), true, "held while a session is live");
      await control.locator(".ctl-controls.is-laptop").getByRole("button", { name: "Nothing live" }).click();
      await until(async () => await liveId() === null, "Nothing live", 8000);
      await until(async () => !(await control.getByRole("button", { name: "Clear test answers" }).isDisabled()), "the button frees up", 8000);
      await control.getByRole("button", { name: "Clear test answers" }).click();
      await control.getByRole("button", { name: /Tap again to clear/ }).click();
      await until(async () => (await control.locator(".sp-rehearsal").innerText()).includes("Cleared 7 test answers and set 4 steps back to Ready."), "the result", 10000);
      const left = (await sql.query(`select (select count(*) from public.submissions where engagement_id=$1 and not deleted)::int as answers,
        (select count(*) from private.ai_groups where engagement_id=$1 and not deleted)::int as groups, (select count(*) from private.ai_summaries where engagement_id=$1 and not deleted)::int as summaries,
        (select count(*) from private.qa_questions q join public.submissions s on s.id=q.submission_id where s.engagement_id=$1 and not q.deleted)::int as questions,
        (select count(*) from private.ai_sessions where engagement_id=$1 and summary_shown)::int as shown,
        (select spotlight_id from public.room_states where engagement_id=$1) as spot`, [room.id])).rows[0];
      assert.deepEqual(left, { answers: 0, groups: 0, summaries: 0, questions: 0, shown: 0, spot: null }, "no answer, AI group, summary, question or spotlight survives");
      assert.ok((await sessions()).every(s => s.state === "ready" && s.shown_at === null), "every step Ready and unreached");
      const log = (await sql.query("select answers,sessions from private.rehearsal_log where engagement_id=$1 and action='clear'", [room.id])).rows;
      assert.deepEqual(log, [{ answers: 7, sessions: 4 }], "the clear is logged");
      await until(async () => await tv.locator(".qa-spot.is-on").count() === 0, "the spotlight leaves the TV", 8000);
      await until(async () => await tv.locator(".tv-scene.tv-holding.is-active").count() === 1, "the TV holds", 8000);
      await delay(1500);
      const seen = await visibleOnTv(tv, /dryrun|rehearsing|Rehearsal|budget/);
      assert.deepEqual(seen, [], "nothing from the rehearsal is visible on the TV");
      await onEveryPhone("no rehearsal line", async p => !(await bodyOf(p)).includes("Rehearsal."));
      await shot(control, "team-cleared-control"); await shot(tv, "team-cleared-tv");
    });

    // ---------- The real run, every session in order from the control surface ----------
    await step("Screen check: the check on the TV, fixes on every phone", async () => {
      await next("Screen check", "screen_check");
      await onEveryPhone("the fixes", async p => (await bodyOf(p)).includes("If the screen looks wrong"));
      await shot(tv, "team-01-screen-check-tv"); await shot(ruth.page, "team-01-screen-check-phone");
    });
    await step("Welcome: the church and the outline; phones wait", async () => {
      await next("Welcome", "content");
      await until(async () => (await layer().innerText()).includes("Welcome to Riverside Church"), "welcome on the TV", 10000);
      assert.ok((await layer().innerText()).includes("Check-in and one word"), "the template's outline");
      await onEveryPhone("You’re in", async p => (await bodyOf(p)).includes("You’re in"));
      await shot(tv, "team-02-welcome-tv"); await shot(ruth.page, "team-02-welcome-phone");
    });
    await step("Opening prayer: one still line; phones away", async () => {
      await next("Opening prayer", "content");
      await until(async () => (await layer().innerText()).includes("Let's begin in prayer."), "the prayer line", 10000);
      await onEveryPhone("Phones away", async p => (await bodyOf(p)).includes("Phones away"));
      await shot(tv, "team-03-prayer-tv"); await shot(ruth.page, "team-03-prayer-phone");
    });
    await step("Check-in (scale): the join strip, eight taps, the average from the server; no rehearsal answer counts", async () => {
      await next("Check-in", "scale");
      await until(async () => (await tally()) === "0 answering", "an empty scale", 10000);
      assert.equal(await layer().locator(".tv-join-strip").count(), 1, "the join strip, on in the template");
      const picks = [4, 3, 5, 2, 4, 3, 4, 5];
      await all((p, i) => p.page.getByRole("radio", { name: String(picks[i]) }).click());
      await counts("check-in", { people: 8, unit: "answering" });
      const average = Math.round(picks.reduce((a, b) => a + b, 0) / 8 * 10) / 10;
      assert.equal((await results()).scale && ((await results()).scale as { average: number }).average, average);
      await until(async () => (await layer().locator(".tv-scale-number").innerText()) === average.toFixed(1), "the average on the TV", 8000);
      await until(async () => (await priya.page.locator(".ph-note").innerText().catch(() => "")).includes("Sent"), "sent on the phone", 8000);
      await shot(tv, "team-04-check-in-tv"); await shot(priya.page, "team-04-check-in-phone"); await shot(control, "team-04-check-in-control");
    });
    await step("One word (word cloud): eight phones fill the cloud; AI combines near-duplicates, marked as AI", async () => {
      await next("One word for this season", "word_cloud");
      await onEveryPhone("the cloud's prompt and nothing sent yet", async p => (await p.locator("#ph-count").innerText().catch(() => "")).includes("0 of 3 sent"));
      assert.ok(!(await priya.page.locator(".ph-body").innerText()).includes("rehearsing"), "the rehearsal's words are gone from the phone");
      const sends = [
        ["youth, hope, joy, grace, family", "momentum, welcome"], ["young people, kids, unity", "prayer, music, mission"], ["youth, healing, light", "peace, courage, rest"],
        ["students, seniors, serving", "outreach, freedom"], ["teens, renewal, harvest", "friendship, love, care"], ["hope, generosity, growth", "trust, community"],
        ["youth, joy, discipleship", "worship, alpha"], ["hope, young people, change", "stretched, busy"],
      ];
      for (const round of [0, 1]) await all(async (p, i) => { await send(p.page, sends[i][round]); await until(async () => (await p.page.locator(".ph-answers").innerText().catch(() => "")).includes(sends[i][round].split(",")[0].trim()), `${p.name} sent`, 10000); });
      const total = sends.flat().reduce((n, s) => n + s.split(",").length, 0);
      await counts("word cloud", { total, unit: "answers" });
      await until(async () => (await layer().locator(".tv-word .cwl-ai-mark").count()) >= 1, "a combined word carries the gradient AI icon", 15000);
      await until(async () => (await tv.locator("[data-ai-foot]").innerText().catch(() => "")).includes("Combined similar answers"), "the foot names it", 8000);
      const words = (await results()).words as { key: string; count: number; ai?: boolean }[];
      assert.ok(words.some(w => w.ai), "the server marks the combine as AI");
      assert.deepEqual(await visibleOnTv(tv, /rehearsing|dryrun/), [], "no rehearsal word in the cloud");
      await shot(tv, "team-05-word-cloud-tv"); await shot(ben.page, "team-05-word-cloud-phone"); await shot(control, "team-05-word-cloud-control");
    });
    await step("What's working (wall): cards arrive, AI groups them under labels; the summary waits for Show summary", async () => {
      await next("What's working", "wall");
      await until(async () => (await layer().locator(".ai-wall").getAttribute("data-ai")) === "on", "the AI layout", 10000);
      assert.equal(await layer().locator(".ai-summary:not(.is-off)").count(), 0, "the rehearsal's Show summary did not survive");
      const cards = ["Three baptisms at Easter", "Teenagers asking to be baptized", "Our Alpha course was full", "Alpha guests stayed for church", "Young families staying after the service",
        "New families at the kids program", "Volunteers who show up early", "Serving teams that cover for each other"];
      await all((p, i) => send(p.page, cards[i]));
      await counts("wall", { total: 8, unit: "answers" });
      await until(async () => ((await results()).groups as unknown[] | undefined)?.length === 4, "four AI groups on the server", 20000);
      await until(async () => (await layer().locator(".ai-group").count()) >= 1, "groups on the TV", 8000);
      assert.equal(await layer().locator(".ai-groups-head .cwl-ai-mark").count(), 1, "marked as AI");
      assert.deepEqual(await visibleOnTv(tv, /Rehearsal/), [], "no rehearsal card or summary");
      await shot(tv, "team-06-wall-groups-tv");
      await control.locator("[data-ai-panel]").getByRole("button", { name: "Show summary" }).click();
      await until(async () => (await layer().locator(".ai-summary:not(.is-off) .ai-summary-text").innerText().catch(() => "")).includes("with 8 answers"), "the summary from the real answers", 15000);
      await shot(tv, "team-06-wall-summary-tv"); await shot(priya.page, "team-06-wall-phone"); await shot(control, "team-06-wall-control");
    });
    await step("Where to focus (100 points): every phone places all 100; bars and the cut line from the server", async () => {
      await next("Where to focus", "points");
      const splits: [string, number, string, number][] = [
        ["Clearer communication", 6, "Shared priorities", 4], ["Shared priorities", 7, "Raising new leaders", 3], ["Raising new leaders", 5, "Caring for each other", 5], ["Clearer communication", 8, "Better meetings", 2],
        ["Shared priorities", 5, "Clearer communication", 5], ["Caring for each other", 6, "Shared priorities", 4], ["Raising new leaders", 9, "Better meetings", 1], ["Shared priorities", 6, "Clearer communication", 4],
      ];
      await all(async (p, i) => {
        const [a, na, b, nb] = splits[i];
        await p.page.getByRole("slider", { name: a, exact: true }).waitFor({ timeout: 10000 });
        await p.page.getByRole("slider", { name: a, exact: true }).focus(); for (let k = 0; k < na; k++) await p.page.keyboard.press("PageUp");
        await p.page.getByRole("slider", { name: b, exact: true }).focus(); for (let k = 0; k < nb; k++) await p.page.keyboard.press("PageUp");
        await p.page.locator(".ph-bars-foot .ph-send").click();
      });
      await counts("100 points", { people: 8, unit: "answering" });
      const bars = (await results()).bars as { key: string; share: number; fraction: number }[];
      await until(async () => {
        const rows = await layer().locator(".tv-bar:not(.is-leaving)").evaluateAll(rs => rs.map(r => ({ key: (r as HTMLElement).dataset.key!, y: r.getBoundingClientRect().top, value: r.querySelector(".tv-bar-value")!.textContent!.trim() })));
        const byY = rows.sort((x, y) => x.y - y.y);
        return byY.length === bars.length && bars.every((b, i) => byY[i].key === b.key && byY[i].value === `${b.share}%`);
      }, "the TV's bars in the server's order with its shares", 10000);
      assert.equal(await layer().locator(".tv-cut").count(), 1, "the cut line after the top three");
      await shot(tv, "team-07-points-tv"); await shot(phones[4].page, "team-07-points-phone");
    });
    await step("Effort and impact (2x2 grid): placements become one numbered dot per item at the mean", async () => {
      await next("Effort and impact", "grid");
      const place = async (page: Page, n: number, gx: number, gy: number) => {
        await page.locator(".gfs-chip").nth(n - 1).click();
        const box = (await page.locator(".gfs-phplot").boundingBox())!;
        await page.mouse.click(box.x + (0.08 + gx * 0.84) * box.width, box.y + (0.08 + (1 - gy) * 0.84) * box.height);
      };
      await all(async (p, i) => {
        await p.page.locator(".gfs-chip").first().waitFor({ timeout: 10000 });
        await place(p.page, 1 + (i % 5), 0.2 + 0.08 * i, 0.8 - 0.05 * i);
        await place(p.page, 1 + ((i + 2) % 5), 0.7 - 0.05 * i, 0.3 + 0.06 * i);
      });
      await counts("grid", { people: 8, unit: "answering" });
      const items = ((await results()).items as { num: number; count: number; into?: string }[]).filter(i => i.count > 0 && !i.into);
      assert.equal(items.length, 5, "every item placed");
      await until(async () => (await layer().locator(".gfs-dot").evaluateAll(els => els.filter(el => getComputedStyle(el).opacity !== "0").length)) === 5, "one dot per item on the TV", 10000);
      await shot(tv, "team-08-grid-tv"); await shot(ruth.page, "team-08-grid-phone");
    });
    await step("Your questions (Q&A): asked anonymously, matching questions fold, votes rank them, Spotlight and Answered", async () => {
      await next("Your questions", "qa");
      await until(async () => (await tally()) === "0 questions from 0 people", "no questions yet: the rehearsal's is gone", 10000);
      const asks = ["When will we start on the shared priorities?", "When do we start the shared priorities work?", "Who will lead the new leaders track?", "How do we protect time for each other?",
        "What happens to our current meetings?", "Can we revisit this in three months?", "How will we know the focus is working?", "Who decides what we stop doing?"];
      await all(async (p, i) => { await p.page.locator("#qa-question").waitFor({ timeout: 10000 }); await p.page.fill("#qa-question", asks[i]); await p.page.locator(".qa-ask-form .ph-send").click(); });
      await until(async () => ((await results()).questions as { askers: number }[] | undefined)?.some(q => q.askers === 2), "two matching questions fold into one", 15000);
      await until(async () => (await layer().locator(".qa-row").allInnerTexts()).some(t => t.includes("Asked by 2")), "asked by 2 on the TV", 10000);
      await all(async p => { const vote = p.page.locator(".qa-item", { hasText: "Who decides what we stop" }).locator(".qa-vote"); if (!(await vote.isDisabled())) await vote.click(); });
      const questions = async () => (await results()).questions as { id: string; text: string; people: number; rank: number }[];
      await until(async () => (await questions()).find(q => q.text.startsWith("Who decides"))?.rank === 1, "the voted question rises to the top", 10000);
      // Rows sit by transform, so the top row is the highest one on screen, not the first in the page.
      const topRow = () => layer().locator(".qa-row").evaluateAll(els => els.filter(e => !(e as HTMLElement).style.opacity || Number((e as HTMLElement).style.opacity) > 0.5)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map(e => e.querySelector(".qa-text")!.textContent!)[0] ?? "");
      await until(async () => (await topRow()).startsWith("Who decides"), "and to the top of the TV", 10000);
      await counts("Q&A", { unit: "questions" });
      await shot(tv, "team-09-qa-tv"); await shot(ben.page, "team-09-qa-phone");
      await control.locator(".qa-ctl-item", { hasText: "Who decides" }).first().getByRole("button", { name: "Spotlight" }).click();
      await until(async () => (await tv.locator(".qa-spot.is-on .qa-spot-text").innerText().catch(() => "")).includes("Who decides"), "spotlit on the TV", 8000);
      await shot(tv, "team-09-qa-spotlight-tv");
      await control.locator(".qa-ctl-spot").getByRole("button", { name: "Answered" }).click();
      await until(async () => await tv.locator(".qa-spot.is-on").count() === 0, "Answered clears it", 8000);
      await counts("Q&A after Answered", { total: 6, unit: "questions" });
      await shot(control, "team-09-qa-control");
    });
    await step("Our commitment (sign together): eight signatures arrive with names and the count", async () => {
      await next("Our commitment", "sign");
      await until(async () => (await layer().locator(".gfs-big").innerText()) === "0", "0 signed", 10000);
      await all(async (p, i) => {
        await p.page.locator(".gfs-sigpad svg").waitFor({ timeout: 10000 });
        const box = (await p.page.locator(".gfs-sigpad svg").boundingBox())!;
        await p.page.mouse.move(box.x + 20, box.y + box.height * 0.7); await p.page.mouse.down();
        for (let k = 1; k <= 10; k++) await p.page.mouse.move(box.x + 20 + k * (box.width - 60) / 10, box.y + box.height * (0.5 + 0.3 * Math.sin(k * 1.3 + i)));
        await p.page.mouse.up();
        await p.page.getByRole("button", { name: "Sign", exact: true }).click();
      });
      await until(async () => (await layer().locator(".gfs-big").innerText()) === "8", "8 signed on the TV", 15000);
      await counts("sign together", { people: 8, unit: null });
      const names = (await layer().locator(".gfs-name .nm").allInnerTexts()).map(t => t.trim()).sort();
      assert.deepEqual(names, [...people].sort(), "every name, read on the server");
      await shot(tv, "team-10-sign-tv"); await shot(priya.page, "team-10-sign-phone");
    });
    await step("Sending prayer, then Close Day 1: every step closed and the TV holding", async () => {
      await next("Sending prayer", "content");
      await until(async () => (await layer().innerText()).includes("Go in peace."), "the sending line", 10000);
      await onEveryPhone("Phones away", async p => (await bodyOf(p)).includes("Phones away"));
      await shot(tv, "team-11-sending-prayer-tv");
      const close = control.getByRole("button", { name: "Close Day 1" });
      await close.click(); await control.getByRole("button", { name: "Tap again to close Day 1" }).click();
      await until(async () => (await sessions()).every(s => s.state === "closed"), "every session closed", 10000);
      await until(async () => await tv.locator(".tv-scene.tv-holding.is-active").count() === 1, "the TV goes to its holding screen", 10000);
      await shot(tv, "team-12-closed-tv"); await shot(control, "team-12-closed-control");
    });

    // ---------- Export and the recap ----------
    const expected: Record<string, { rows: number; named: boolean; header: RegExp }> = {
      "Check-in": { rows: 8, named: false, header: /^Answered at,Value,Hidden from the TV,Test answer$/ },
      "One word for this season": { rows: 16, named: false, header: /^Answered at,Answer,Hidden/ },
      "What's working": { rows: 8, named: false, header: /^Answered at,Answer,Hidden/ },
      "Where to focus": { rows: 8, named: false, header: /^Answered at,Points: Clearer communication,Points: Shared priorities,Points: Raising new leaders,Points: Caring for each other,Points: Better meetings,Hidden/ },
      "Effort and impact": { rows: 8, named: false, header: /^Answered at,Clearer communication: Effort,Clearer communication: Impact,/ },
      "Your questions": { rows: 8, named: false, header: /^Answered at,Question,/ },
      "Our commitment": { rows: 8, named: true, header: /^Answered at,Name,Hidden from the TV,Test answer$/ },
    };
    const recap = await facContext.newPage();
    await step("The recap: one card per session that took answers, counts from the server, nothing from the rehearsal", async () => {
      await recap.goto(`${app.origin}/control/${room.id}/recap`);
      const server = (await fac.client.rpc("results_recap", { p_engagement: room.id })).data as { sessions: { session: { id: string; title: string } }[] };
      await until(async () => await recap.locator(".recap-card").count() === 7, "seven cards", 10000);
      assert.deepEqual(server.sessions.map(s => s.session.title).sort(), Object.keys(expected).sort(), "every input session, no content screen");
      const text = await recap.locator("main").innerText();
      assert.ok(!/rehearsing|dryrun|Rehearsal card|budget/.test(text), "nothing from the rehearsal on the recap");
      assert.equal(await recap.locator(`.recap-card[data-session="${await idOf("Check-in")}"] .recap-count`).innerText(), "8 answering");
      assert.equal(await recap.locator(`.recap-card[data-session="${await idOf("What's working")}"] .recap-count`).innerText(), "8 answers");
      assert.equal(await recap.locator(`.recap-card[data-session="${await idOf("Our commitment")}"] .recap-count`).innerText(), "8 answering");
      if (shots) await recap.screenshot({ path: `${shots}/team-recap.png`, fullPage: true });
    });
    await step("Export each session's CSV from its recap card: the right rows and columns, no test answers", async () => {
      for (const [title, want] of Object.entries(expected)) {
        const card = recap.locator(`.recap-card[data-session="${await idOf(title)}"]`);
        const [download] = await Promise.all([recap.waitForEvent("download"), card.getByRole("link", { name: "Download CSV" }).click()]);
        const text = readFileSync((await download.path())!, "utf8").replace(/^﻿/, "").trim();
        const lines = text.split("\r\n");
        assert.match(lines[0], want.header, `${title}: its columns`);
        assert.equal(lines.length - 1, want.rows, `${title}: ${want.rows} rows`);
        assert.ok(lines.slice(1).every(l => !l.endsWith(",Yes")), `${title}: no test answers`);
        assert.ok(!/rehearsing|dryrun|Rehearsal|budget/.test(text), `${title}: nothing from the rehearsal`);
        if (want.named) assert.deepEqual(lines.slice(1).map(l => l.split(",")[1]).sort(), [...people].sort(), `${title}: named by design`);
        else assert.ok(!people.some(n => text.includes(`,${n},`)), `${title}: anonymous`);
        assert.match(download.suggestedFilename(), /^riverside-church-.+\.csv$/);
      }
      const [download] = await Promise.all([recap.waitForEvent("download"), recap.getByRole("link", { name: "Download all as CSV" }).click()]);
      const every = readFileSync((await download.path())!, "utf8").replace(/^﻿/, "").trim().split("\r\n");
      assert.equal(every.length - 1, Object.values(expected).reduce((n, e) => n + e.rows, 0), "Download all has every row");
    });
    await step("Print the recap to PDF", async () => {
      await recap.emulateMedia({ media: "print" });
      assert.equal(await recap.locator(".recap-actions").isVisible(), false, "print leaves the buttons off");
      const pdf = await recap.pdf({ format: "Letter" });
      assert.ok(pdf.byteLength > 10000, "prints to PDF");
      if (shots) writeFileSync(`${shots}/team-recap.pdf`, pdf);
      await recap.close();
    });
    console.log(`Team workshop kit: ${passed.length} checks passed on a paired TV, eight phones and the control surface. Local checks on loopback, with the scripted fake model.`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally { await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); rmSync(controlDir, { recursive: true, force: true }); }
}
// Text matching a pattern that a person at the TV could see: every element up the tree drawn
// (not hidden, not fully transparent). Layers fading out under the holding screen don't count.
// Plain script text, so the test runner's transform adds no helpers to the page.
async function visibleOnTv(tv: Page, pattern: RegExp) {
  return await tv.evaluate(`(() => { const re = new RegExp(${JSON.stringify(pattern.source)});
    const shown = el => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return false; } return true; };
    return [...document.querySelectorAll("body *")].filter(el => [...el.childNodes].some(n => n.nodeType === 3 && re.test(n.textContent || "")) && shown(el)).map(el => el.textContent.trim()); })()`) as string[];
}
main().catch(error => { console.error(error); process.exit(1); });
