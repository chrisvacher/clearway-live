// Milestone 3, step 6a in real browsers against the production build and the local stack:
// self-paced sessions (reached from the room link and from the invite email, opening and
// closing on time, the person's saved answers to change or withdraw), a rehearsal and Clear
// test answers (refused while a session is live, logged), each session's input as CSV with
// its privacy, and the results recap, on a paired TV, three phones and the control surface.
// Then 50 simulated phones answer a live step and a self-paced step at once in the practice
// room against the live-screen rules. No email is sent: a local mailbox stands in for Resend.
// KIT_SHOTS=<folder> saves the screens.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { verdict, type LatencyReport } from "../../lib/latency/report";
import { practiceRoom } from "../../scripts/load-test";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

// Every bar's place on each frame, to check that nothing jumps.
const sampler = `(() => {
  const w = window; if (w.__bars) return; const log = w.__bars = [];
  const read = () => { const rows = [...document.querySelectorAll('.tv-layer:not(.is-leaving) .tv-bar:not(.is-leaving)')].map(r => {
    const m = /translateY\\((-?[\\d.]+)px\\)/.exec(r.style.transform || ''); return [r.dataset.key, m ? +m[1] : null, r.offsetHeight]; });
    log.push(rows); if (log.length > 6000) log.splice(0, 3000); requestAnimationFrame(read); };
  requestAnimationFrame(read);
})()`;
type Sample = [string, number | null, number][];
type Bar = { key: string; fraction: number };

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shots = process.env.KIT_SHOTS;
  const shot = async (page: Page, name: string) => { if (shots) { await delay(900); await page.screenshot({ path: `${shots}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  const cleanup: string[] = [];
  try {
    await sql.connect();
    const room = await engagement(sql, ["Priya", "Ben", "Ruth"]);
    await sql.query("update public.engagements set how_the_room_decides='We talk until we can all live with it.' where id=$1", [room.id]);
    const add = async (title: string, kind: string, prompt: string, position: number, extra: { mode?: string; opens?: string; closes?: string; options?: Record<string, unknown>; state?: string; part?: string } = {}) =>
      (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,mode,opens_at,closes_at,max_sends,max_characters,max_words,options)
        values($1,$2,$9,$3,$4,$5,$10,$6,$7::timestamptz,$8::timestamptz,3,$11,3,private.session_options($4,$12::jsonb,$1)) returning id`,
        [room.id, title, position, kind, prompt, extra.mode ?? "live", extra.opens ?? null, extra.closes ?? null, extra.part ?? "Day 1", extra.state ?? "ready", kind === "wall" ? 280 : 28, extra.options ?? {}])).rows[0].id as string;
    const soon = (s: number) => new Date(Date.now() + s * 1000).toISOString();
    const items = [{ key: "a", text: "Prayer" }, { key: "b", text: "Hospitality" }, { key: "c", text: "Next generation" }];
    const pre = await add("Before we meet", "wall", "What are you most grateful for at Riverside this year?", 1, { mode: "self_paced", opens: soon(-60), closes: soon(3600), part: "Pre-call" });
    const later = await add("Choose a focus", "choice", "Which matters most this season?", 2, { mode: "self_paced", opens: soon(3 * 86400), closes: soon(4 * 86400), part: "Pre-call", options: { items } });
    const draft = await add("Not ready yet", "wall", "Draft question", 3, { mode: "self_paced", opens: soon(-60), closes: soon(3600), part: "Pre-call", state: "draft" });
    const cloud = await add("Celebration", "word_cloud", "One word for what God is doing at Riverside", 1);
    const choice = await add("Where next", "choice", "Where should our next season go?", 2, { options: { items } });
    const form = await add("For the facilitators", "form", "A few questions just for the facilitators", 3, { options: { questions: [{ key: "q1", text: "What would make this retreat a win for you?" }] } });
    const fac = await facilitator(env, sql, room.id);
    const facCookie = fac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
    browser = await chromium.launch();

    const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvContext.newPage(); await tv.goto(app.origin + "/tv");
    const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(fac, room.id, app.secret, code);
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });

    const facContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await facContext.addCookies(fac.cookies(app.origin));
    const control = await facContext.newPage();
    await control.goto(`${app.origin}/control/${room.id}`);

    async function signIn(page: Page, email: string) {
      const before = mail.count;
      await page.fill("#room-email", email); await page.getByRole("button", { name: "Send me a sign-in code" }).click();
      await page.fill("#room-code", await mail.code(email, before)); await page.getByRole("button", { name: "Sign in" }).click();
      await page.locator(".ph-app").waitFor({ timeout: 15000 });
    }
    const phoneContext = () => browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const [priya, ben, ruth] = room.attendees;
    let pPage: Page, bPage: Page, rPage: Page, pCtx: BrowserContext;

    await step("The invite email links to each open self-paced session, never to a draft", async () => {
      const response = await fetch(`${app.origin}/api/setup`, { method: "POST", headers: { Cookie: facCookie, Origin: app.origin, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invite", id: room.id, batch: randomUUID(), attendees: room.attendees.map(a => a.id) }) });
      const body = await response.json(); assert.equal(body.ok, true, JSON.stringify(body)); assert.equal(body.count, 3);
      const text = await mail.find(priya.email, /Before we meet/);
      assert.match(text, /Before we meet\nBefore we meet: open from .+ until .+ \(America\/Toronto\)\n/);
      assert.ok(text.includes(`step=${pre}`) && text.includes(`step=${later}`), "both ready self-paced sessions are linked");
      assert.ok(!text.includes(draft), "a draft is never linked");
      assert.doesNotMatch(text, /[–—]/, "no em or en dashes");
      const link = text.match(new RegExp(`(http\\S+step=${pre})`))![1];
      assert.equal(new URL(link).searchParams.get("email"), priya.email, "Priya's own link");
      pCtx = await phoneContext(); pPage = await pCtx.newPage(); await pPage.goto(link);
      assert.equal(await pPage.inputValue("#room-email"), priya.email, "the email is filled in");
      await signIn(pPage, priya.email);
      await until(async () => (await pPage.locator(".ph-step").innerText()).includes("What are you most grateful for"), "the link opens the self-paced session", 15000);
      assert.ok((await pPage.locator(".ph-step .ph-muted").first().innerText()).includes("Self-paced"));
      assert.match(await pPage.locator(".ph-window").innerText(), /^Open until /);
      await shot(pPage, "self-paced-from-email-phone");
    });
    await step("Self-paced: the person answers outside the live room, and the TV never shows it", async () => {
      await pPage.fill("#ph-answer", "Teenagers asking to be baptized"); await pPage.locator(".ph-send").click();
      await until(async () => (await pPage.locator(".ph-answers").innerText().catch(() => "")).includes("Teenagers asking to be baptized"), "the saved answer on the phone", 8000);
      await until(async () => (await sql.query("select count(*)::int as n from public.submissions where session_id=$1 and not deleted", [pre])).rows[0].n === 1, "stored", 8000);
      await delay(1000);
      assert.ok(!(await tv.locator("body").innerText()).includes("Teenagers"), "the TV holds its own screen");
      assert.equal(await tv.locator(".tv-scene.tv-holding.is-active").count(), 1, "the TV stays on its holding screen");
    });
    await step("Change and withdraw while open, and the saved answers come back on a new phone", async () => {
      await pPage.locator(".ph-answer", { hasText: "Teenagers" }).getByRole("button", { name: "Change" }).click();
      await pPage.fill("#ph-answer", "Teenagers asking to be baptized this fall"); await pPage.getByRole("button", { name: "Save change" }).click();
      await until(async () => (await pPage.locator(".ph-answers").innerText()).includes("this fall"), "changed", 8000);
      await pPage.fill("#ph-answer", "A second thought"); await pPage.locator(".ph-send").click();
      await until(async () => (await pPage.locator(".ph-answer", { hasText: "A second thought" }).count()) === 1, "second answer", 8000);
      await pPage.locator(".ph-answer", { hasText: "A second thought" }).getByRole("button", { name: "Withdraw" }).click();
      await until(async () => (await pPage.locator(".ph-answer", { hasText: "A second thought" }).count()) === 0, "withdrawn", 8000);
      await until(async () => (await sql.query("select count(*)::int as n from public.submissions where session_id=$1 and not deleted and withdrawn", [pre])).rows[0].n === 1, "withdrawn on the server", 8000);
      await shot(pPage, "self-paced-saved-answers-phone");
      // Signing in on another phone shows the person's own saved answers.
      const other = await (await phoneContext()).newPage(); await other.goto(`${app.origin}/room/${room.id}?step=${pre}`);
      await signIn(other, priya.email);
      await until(async () => (await other.locator(".ph-answers").innerText().catch(() => "")).includes("this fall"), "saved answers on a new phone", 15000);
      assert.equal(await other.locator(".ph-answer", { hasText: "A second thought" }).count(), 0, "a withdrawn answer stays withdrawn");
      await other.context().close();
    });
    await step("From the room link: open self-paced sessions are listed, and one that opens later says when", async () => {
      bPage = await (await phoneContext()).newPage(); await bPage.goto(`${app.origin}/room/${room.id}`);
      await signIn(bPage, ben.email);
      await until(async () => (await bPage.locator(".ph-self").innerText().catch(() => "")).includes("Before we meet"), "the list on the waiting screen", 15000);
      const list = await bPage.locator(".ph-self").innerText();
      assert.match(list, /Choose a focus\s+Opens /, "the later one says when it opens");
      assert.ok(!list.includes("Not ready yet"), "drafts never reach phones");
      await shot(bPage, "self-paced-room-link-phone");
      await bPage.locator(".ph-self button", { hasText: "Choose a focus" }).click();
      await until(async () => (await bPage.locator(".ph-step").innerText()).includes("This opens"), "not open yet", 5000);
      assert.ok(!(await bPage.locator(".ph-step").innerText()).includes("Which matters most"), "no prompt before it opens");
      await shot(bPage, "self-paced-not-yet-open-phone");
      await bPage.getByRole("button", { name: "Back to now" }).click();
      await bPage.locator(".ph-self button", { hasText: "Before we meet" }).click();
      await bPage.fill("#ph-answer", "Volunteers who show up early"); await bPage.locator(".ph-send").click();
      await until(async () => (await bPage.locator(".ph-answers").innerText().catch(() => "")).includes("Volunteers"), "Ben's answer", 8000);
    });
    await step("The control surface lists self-paced sessions with their state and count; Next skips them", async () => {
      await until(async () => (await control.locator(".sp-list li", { hasText: "Before we meet" }).innerText().catch(() => "")).includes("2 answered"), "2 answered", 10000);
      const row = await control.locator(".sp-list li", { hasText: "Before we meet" }).innerText();
      assert.match(row, /Open until/); assert.match(row, /\bOpen\b/);
      assert.match(await control.locator(".sp-list li", { hasText: "Choose a focus" }).innerText(), /Opens later/);
      assert.match(await control.locator(".sp-list li", { hasText: "Not ready yet" }).innerText(), /Draft/);
      await shot(control, "self-paced-control");
      await press(fac, sql, room.id, "next");
      assert.equal((await sql.query("select live_session_id from public.room_states where engagement_id=$1", [room.id])).rows[0].live_session_id, cloud, "Next goes to the first live step, past every self-paced one");
      await press(fac, sql, room.id, "nothing_live");
    });
    await step("A self-paced session opens and closes on time, with no refresh", async () => {
      await sql.query("update public.sessions set opens_at=now()+interval '17 seconds',closes_at=now()+interval '31 seconds' where id=$1", [later]);
      await bPage.getByRole("button", { name: "Back to now" }).click().catch(() => {});
      await bPage.locator(".ph-self button", { hasText: "Choose a focus" }).click();
      await until(async () => (await bPage.locator(".ph-step").innerText()).includes("Which matters most this season?"), "it opens on the phone on time", 40000);
      await shot(bPage, "self-paced-opened-phone");
      await bPage.locator(".ph-opt", { hasText: "Hospitality" }).click(); await bPage.locator(".ph-bars-foot .ph-send").click();
      await until(async () => (await sql.query("select count(*)::int as n from public.submissions where session_id=$1 and not deleted", [later])).rows[0].n === 1, "answered while open", 8000);
      await until(async () => (await bPage.locator(".ph-step").innerText()).includes("This step is closed. Your answers are kept."), "it closes on the phone on time", 30000);
      assert.equal(await bPage.locator(".ph-opt").first().isDisabled(), true, "input closes with it");
      const late = await bPage.evaluate(async ([engagement, session]) => (await (await fetch(`/api/live/${engagement}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: crypto.randomUUID(), session, revision: 0, action: "submit", text: "", value: { choices: ["a"] }, sentAt: new Date().toISOString(), uncertaintyMs: 0 }) })).json()).status, [room.id, later]);
      assert.equal(late, "closed", "the server refuses an answer after close");
      await shot(bPage, "self-paced-closed-phone");
    });

    await step("Rehearsal: answers made while it runs are test answers, shown on phones and the control surface", async () => {
      await control.getByRole("button", { name: "Start rehearsal" }).click();
      await until(async () => await control.locator(".sp-rehearsing").isVisible(), "Rehearsing on the control surface", 8000);
      await press(fac, sql, room.id, "go_live", { session: choice });
      rPage = await (await phoneContext()).newPage(); await rPage.goto(`${app.origin}/room/${room.id}`);
      await signIn(rPage, ruth.email);
      for (const page of [pPage, bPage, rPage]) {
        await page.getByRole("button", { name: "Back to now" }).click().catch(() => {});
        await until(async () => await page.locator(".ph-opt").count() === 3, "the live choice", 15000);
        await until(async () => (await page.locator(".ph-body").innerText()).includes("Rehearsal. Your answers are test answers"), "the rehearsal line on phones", 20000);
      }
      await pPage.locator(".ph-opt", { hasText: "Prayer" }).click(); await pPage.locator(".ph-bars-foot .ph-send").click();
      await rPage.locator(".ph-opt", { hasText: "Next generation" }).click(); await rPage.locator(".ph-bars-foot .ph-send").click();
      await until(async () => (await tv.locator(".tv-foot .tv-tally").innerText()).trim() === "2 answering", "the TV counts the test answers like any others", 8000);
      const rows = (await sql.query("select test from public.submissions where session_id=$1 and not deleted", [choice])).rows;
      assert.ok(rows.length === 2 && rows.every(r => r.test), "both are marked test");
      await shot(rPage, "rehearsal-phone"); await shot(tv, "rehearsal-tv");
    });
    await step("Clear test answers is refused while a session is live", async () => {
      await until(async () => (await control.locator(".sp-rehearsal .ctl-label").innerText()).startsWith("2 test answers"), "the count of test answers", 8000);
      assert.equal(await control.getByRole("button", { name: "Clear test answers" }).isDisabled(), true, "the button is held");
      assert.match(await control.locator("#sp-clear-why").innerText(), /Choose Nothing live first/);
      const refused = await fetch(`${app.origin}/api/control/${room.id}/rehearsal`, { method: "POST", headers: { Cookie: facCookie, Origin: app.origin, "Content-Type": "application/json" }, body: JSON.stringify({ id: randomUUID(), action: "clear" }) });
      assert.equal(refused.status, 409); assert.equal((await refused.json()).status, "live", "the server refuses it too");
      assert.equal((await sql.query("select count(*)::int as n from public.submissions where engagement_id=$1 and test and not deleted", [room.id])).rows[0].n, 2, "nothing removed");
      await shot(control, "rehearsal-control-live");
    });
    await step("Clear test answers removes every test answer, puts the rehearsed step back to Ready, and is logged", async () => {
      await press(fac, sql, room.id, "nothing_live");
      await until(async () => !(await control.getByRole("button", { name: "Clear test answers" }).isDisabled()), "the button frees up", 8000);
      await control.getByRole("button", { name: "Clear test answers" }).click();
      await control.getByRole("button", { name: /Tap again to clear/ }).click();
      await until(async () => (await control.locator(".sp-rehearsal").innerText()).includes("Cleared 2 test answers and set 1 step back to Ready."), "the result", 8000);
      assert.equal((await sql.query("select count(*)::int as n from public.submissions where engagement_id=$1 and test and not deleted", [room.id])).rows[0].n, 0, "every test answer removed");
      assert.equal((await sql.query("select count(*)::int as n from public.submissions where engagement_id=$1 and not test and not deleted", [room.id])).rows[0].n, 4, "every real answer kept");
      const state = (await sql.query("select state,shown_at from public.sessions where id=$1", [choice])).rows[0];
      assert.equal(state.state, "ready"); assert.equal(state.shown_at, null, "the rehearsed step is ready to run for real");
      const log = (await sql.query("select l.answers,u.name from private.rehearsal_log l join public.clearway_users u on u.id=l.actor_id where l.engagement_id=$1 and l.action='clear'", [room.id])).rows;
      assert.deepEqual(log, [{ answers: 2, name: "Chris Kit" }], "logged with who cleared it");
      await until(async () => (await control.locator(".sp-rehearsal").innerText()).includes("Last cleared"), "the last clear on the control surface", 8000);
      assert.equal(await control.locator(".sp-rehearsing").count(), 0, "the rehearsal is over");
      await until(async () => !(await pPage.locator(".ph-body").innerText()).includes("Rehearsal."), "phones drop the rehearsal line", 20000);
      await shot(control, "rehearsal-control-cleared");
    });

    await step("Export: each session's input as CSV, anonymous without names, the private form to the facilitator with names", async () => {
      await press(fac, sql, room.id, "go_live", { session: form });
      await until(async () => await rPage.locator("textarea").count() > 0, "the form on Ruth's phone", 15000);
      await rPage.locator("textarea").first().fill("Honest talk about the building");
      await rPage.getByRole("button", { name: "Send privately" }).click();
      await until(async () => (await sql.query("select count(*)::int as n from public.submissions where session_id=$1 and not deleted", [form])).rows[0].n === 1, "the form answer", 8000);
      const csv = async (session: string, cookie = facCookie) => { const r = await fetch(`${app.origin}/api/control/${room.id}/export?session=${session}`, { headers: { Cookie: cookie } }); return { status: r.status, type: r.headers.get("content-type"), name: r.headers.get("content-disposition"), text: await r.text() }; };
      const wall = await csv(pre);
      assert.equal(wall.status, 200); assert.match(wall.type!, /^text\/csv/); assert.match(wall.name!, /riverside-church-before-we-meet\.csv/);
      const lines = wall.text.replace(/^﻿/, "").trim().split("\r\n");
      assert.equal(lines[0], "Answered at,Answer,Hidden from the TV,Test answer", "no Name column for an anonymous session");
      assert.equal(lines.length, 3, "two standing answers, the withdrawn one left out");
      assert.ok(lines.some(l => l.includes("this fall")) && !/Priya|Ben/.test(wall.text), "answers without names");
      const priv = await csv(form);
      assert.match(priv.text, /Name,What would make this retreat a win for you\?/); assert.match(priv.text, /Ruth,Honest talk about the building/);
      const button = control.getByRole("link", { name: "Export answers", exact: true });
      await until(async () => await button.isVisible(), "Export answers on the control surface", 8000);
      const [download] = await Promise.all([control.waitForEvent("download"), button.click()]);
      assert.match(download.suggestedFilename(), /for-the-facilitators\.csv$/);
      const phoneCookie = (await rPage.context().cookies()).map(c => `${c.name}=${c.value}`).join("; ");
      assert.ok([401, 403].includes((await csv(form, phoneCookie)).status), "a phone cannot export, private form or not");
      await press(fac, sql, room.id, "nothing_live");
    });

    await step("The results recap: a card per session, numbers from the server, updating without re-animating, prints to PDF", async () => {
      const recap = await facContext.newPage(); await recap.goto(`${app.origin}/control/${room.id}/recap`);
      const server = (await fac.client.rpc("results_recap", { p_engagement: room.id })).data as { sessions: { session: { id: string }; results: { total: number; people: number } }[] };
      await until(async () => await recap.locator(".recap-card").count() === server.sessions.length, "one card per reached session", 10000);
      assert.deepEqual(new Set(server.sessions.map(s => s.session.id)), new Set([pre, later, cloud, form]), "every session that was reached or opened, the rehearsed and cleared step left out");
      const card = recap.locator(`.recap-card[data-session="${pre}"]`);
      assert.equal(await card.locator(".recap-count").innerText(), "2 answers");
      assert.equal(await recap.locator(`.recap-card[data-session="${form}"] .recap-count`).innerText(), "1 answering");
      assert.ok(!(await recap.locator(`.recap-card[data-session="${form}"]`).innerText()).includes("Honest talk"), "private form answers never reach a card");
      await card.locator(".tv-mirror").evaluate(el => { (el as HTMLElement & { __kept?: boolean }).__kept = true; });
      await shot(recap, "recap");
      // A new self-paced answer arrives: the card's count moves, the same picture stays.
      await rPage.goto(`${app.origin}/room/${room.id}?step=${pre}`);
      await until(async () => await rPage.locator("#ph-answer").isVisible(), "Ruth opens the self-paced session", 15000);
      await rPage.fill("#ph-answer", "New families finding us online"); await rPage.locator(".ph-send").click();
      await until(async () => (await card.locator(".recap-count").innerText()) === "3 answers", "the card updates on its own", 12000);
      assert.equal(await card.locator(".tv-mirror").evaluate(el => Boolean((el as HTMLElement & { __kept?: boolean }).__kept)), true, "without redrawing the card");
      assert.equal(await card.locator(".tv-mirror").getAttribute("data-motion"), "reduced", "and without re-animating it");
      const [download] = await Promise.all([recap.waitForEvent("download"), recap.getByRole("link", { name: "Download all as CSV" }).click()]);
      assert.match(download.suggestedFilename(), /all-answers\.csv$/);
      await recap.emulateMedia({ media: "print" });
      assert.equal(await recap.locator(".recap-actions").isVisible(), false, "print leaves the buttons off");
      const pdf = await recap.pdf({ format: "Letter" });
      assert.ok(pdf.byteLength > 10000, "prints to PDF");
      if (shots) { writeFileSync(`${shots}/recap.pdf`, pdf); await recap.screenshot({ path: `${shots}/recap-print.png`, fullPage: true }); }
      await recap.close();
    });
    console.log(`Self-paced kit: ${passed.length} checks passed on a paired TV and three phones.`);

    // ---------- 50 simulated phones in the practice room ----------
    const seeded = (await sql.query("select 1 from public.engagements where id=$1 and not deleted", [practiceRoom])).rowCount;
    assert.equal(seeded, 1, "Run npm run db:seed first: the 50 phone run uses the practice room");
    await step("Crowded, 50 phones: a live step and a self-paced step at once; live answers reach the TV under a second, nothing jumps, numbers match the server", async () => {
      const pfac = await facilitator(env, sql, practiceRoom), tag = randomUUID().slice(0, 6);
      const mk = async (title: string, kind: string, prompt: string, mode: string, options: Record<string, unknown>) =>
        (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,mode,opens_at,closes_at,max_sends,max_characters,options)
          values($1,$2,'Day 1',950,$3,$4,'ready',$5,case when $5='self_paced' then now()-interval '1 minute' end,case when $5='self_paced' then now()+interval '1 hour' end,3,280,private.session_options($3,$6::jsonb,$1)) returning id`,
          [practiceRoom, `${title} ${tag}`, kind, prompt, mode, options])).rows[0].id as string;
      const five = ["Reaching new people", "Next generation", "Welcome and first visits", "Systems and data", "Second campus"].map((text, i) => ({ key: `o${i + 1}`, text }));
      const live = await mk("Load choice", "choice", "Where should our next season go?", "live", { items: five, multiple: false });
      const self = await mk("Load self-paced", "wall", "What should we celebrate?", "self_paced", {});
      cleanup.push(live, self);
      const ptvContext = await browser!.newContext({ viewport: { width: 1920, height: 1080 } });
      const ptv = await ptvContext.newPage(); await ptv.goto(app.origin + "/tv");
      const pcode = await until(async () => { const c = (await ptv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
      await pairTv(pfac, practiceRoom, app.secret, pcode, "Self-paced load TV");
      await press(pfac, sql, practiceRoom, "go_live", { session: live });
      await until(async () => (await ptv.locator(".tv-layer:not(.is-leaving)").last().getAttribute("data-kind")) === "choice", "the live choice on the TV", 10000);
      await ptv.evaluate(sampler);
      const phones = await joinPhones(app.origin, 50);
      await delay(800);
      const from = new Date(Date.now() - 1000).toISOString();
      const words = ["Teenagers asking to be baptized", "Young families finding us online", "Small groups in homes again", "Volunteers who show up early", "Newcomers in a group within weeks"];
      // Every phone answers the live step and the self-paced step within six seconds, in either order.
      const sent = await Promise.all(phones.map(async (p, i) => {
        const a = async () => { await delay(Math.floor(Math.random() * 6000)); return p.send(live, "", { choices: [`o${[1, 2, 2, 3, 4, 3, 5, 2][i % 8]}`] }); };
        const b = async () => { await delay(Math.floor(Math.random() * 6000)); return p.send(self, `${words[i % 5]} ${i}`); };
        return Promise.all(i % 2 ? [a(), b()] : [b(), a()]);
      }));
      assert.ok(sent.flat().every(s => s === "accepted"), `every answer accepted (${[...new Set(sent.flat())]})`);
      await until(async () => (await ptv.locator(".tv-foot .tv-tally").innerText()).trim() === "50 answering", "50 answering on the TV", 10000);
      const server = (await sql.query("select results from public.room_states where engagement_id=$1", [practiceRoom])).rows[0].results as { people: number; bars: Bar[] };
      assert.equal(server.people, 50, "the room's count is the live step's alone");
      const want = server.bars.map(b => b.key);
      await until(async () => {
        const rows = await ptv.locator(".tv-layer:not(.is-leaving) .tv-bar:not(.is-leaving)").evaluateAll(rs => rs.map(r => ({ key: (r as HTMLElement).dataset.key!, y: r.getBoundingClientRect().top, w: parseFloat((r.querySelector(".tv-bar-fill") as HTMLElement).style.width) || 0 })));
        const byY = rows.sort((a, b) => a.y - b.y);
        return byY.length === want.length && byY.every((r, i) => r.key === want[i] && Math.abs(r.w - server.bars[i].fraction * 100) < 0.6);
      }, "the TV settles on the server's order and lengths", 8000);
      const log = await ptv.evaluate(() => { const w = window as unknown as { __bars: Sample[] }; const out = w.__bars.slice(); w.__bars.length = 0; return out; }) as Sample[];
      const seen = new Map<string, number>(); let frames = 0, largest = 0;
      for (const frame of log) for (const [key, y, h] of frame) { const prev = seen.get(key); if (prev !== undefined && y !== null) { frames++; largest = Math.max(largest, Math.abs(y - prev)); assert.ok(Math.abs(y - prev) <= h + 1, `${key} jumped`); } if (y !== null) seen.set(key, y); }
      const tvText = await ptv.locator("body").innerText();
      assert.ok(!words.some(w => tvText.includes(w)), "no self-paced answer ever reaches the TV");
      assert.equal((await sql.query("select count(*)::int as n from public.submissions where session_id=$1 and not deleted", [self])).rows[0].n, 50, "every self-paced answer stored");
      // The recap's numbers are the server's.
      const recap = (await pfac.client.rpc("results_recap", { p_engagement: practiceRoom })).data as { sessions: { session: { id: string }; results: { total: number; people: number } }[] };
      assert.equal(recap.sessions.find(s => s.session.id === self)!.results.total, 50, "the recap counts the self-paced answers");
      assert.equal(recap.sessions.find(s => s.session.id === live)!.results.people, 50);
      await delay(3000);
      const to = new Date().toISOString(), cookie = pfac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
      const report = await (await fetch(`${app.origin}/api/control/${practiceRoom}/latency?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { headers: { Cookie: cookie } })).json() as LatencyReport;
      const liveReport = report.sessions.find(s => s.id === live)!;
      assert.equal(liveReport.measured, 50, "every live answer reached the TV and was logged");
      assert.ok(verdict(liveReport).met, `95 of 100 live answers under one second on loopback: ${verdict(liveReport).label}`);
      console.log(`50 phones, a live choice and a self-paced wall at once: ${liveReport.under_second} of ${liveReport.measured} live answers under one second, 95th ${liveReport.p95} ms. All answers: median ${report.phone_tv.p50} ms, 95th ${report.phone_tv.p95} ms, slowest ${report.phone_tv.max} ms. ${frames} bar frames sampled, largest step ${Math.round(largest)}px, no jumps.`);
      await shot(ptv, "self-paced-crowded-50-tv");
      await press(pfac, sql, practiceRoom, "nothing_live");
      await ptvContext.close();
    });
    console.log(`Self-paced kit: ${passed.length} checks passed. Local checks on loopback.`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally {
    // The practice room keeps no self-paced load sessions for real phones to find.
    if (cleanup.length) await sql.query("update public.sessions set deleted=true where id=any($1::uuid[])", [cleanup]).catch(() => {});
    await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {});
  }
}

async function joinPhones(origin: string, count: number) {
  class Phone {
    private jar = new Map<string, string>();
    offset = 0; uncertainty = 60000;
    async call(path: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers); headers.set("Origin", origin);
      if (this.jar.size) headers.set("Cookie", [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "));
      if (init.body) headers.set("Content-Type", "application/json");
      const response = await fetch(origin + path, { ...init, headers, redirect: "manual" });
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(";"), at = pair.indexOf("="), name = pair.slice(0, at), value = pair.slice(at + 1);
        if (/max-age=0|expires=thu, 01 jan 1970/i.test(cookie) || !value) this.jar.delete(name); else this.jar.set(name, value);
      }
      return response;
    }
    async join(name: string) {
      await this.call(`/api/room/${practiceRoom}/init`, { method: "POST", body: "{}" });
      const joined = await (await this.call(`/api/room/${practiceRoom}/practice`, { method: "POST", body: JSON.stringify({ name }) })).json();
      if (!["signed_in", "approved"].includes(joined.status)) throw new Error(`Practice join refused: ${joined.status}`);
      const sent = Date.now(), data = await (await this.call(`/api/live/${practiceRoom}?surface=phone`, { cache: "no-store" })).json(), received = Date.now();
      this.offset = Date.parse(data.server_time) - (sent + received) / 2; this.uncertainty = (received - sent) / 2;
    }
    async send(session: string, text: string, value?: unknown) {
      const body = { id: randomUUID(), session, revision: 0, action: "submit", text, ...(value !== undefined ? { value } : {}), sentAt: new Date(Date.now() + this.offset).toISOString(), uncertaintyMs: Math.min(60000, Math.round(this.uncertainty)) };
      const data = await (await this.call(`/api/live/${practiceRoom}`, { method: "POST", body: JSON.stringify(body) })).json().catch(() => ({ status: "failed" }));
      return data.status as string;
    }
  }
  const phones: Phone[] = [];
  for (let start = 0; start < count; start += 10) {
    const batch = Array.from({ length: Math.min(10, count - start) }, () => new Phone());
    await Promise.all(batch.map((p, i) => p.join(`Self-paced phone ${String(start + i + 1).padStart(2, "0")}`)));
    phones.push(...batch);
  }
  return phones;
}
main().catch(error => { console.error(error); process.exit(1); });
