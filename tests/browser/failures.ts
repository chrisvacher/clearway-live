// The failure kit (FAIL-01, 02, 04, 05, 06, 08, 10, and realtime blocked; FAIL-03 and FAIL-09 on milestone 5 below), run in
// real browsers against the production build and the local stack. Each check
// breaks something on purpose and proves the room recovers the way the PRD says.
// The milestone 2 checks run on the word cloud and wall; then failures-m3.ts runs
// the same failures on milestone 3's kinds, plus FAIL-09 with the fake AI model; failures-m4.ts and
// failures-m5.ts (FAIL-03, the scribe offline), failures-m6.ts and failures-m7.ts (milestone 7: AI slow and failing on the report and the visibility plan,
// a revoked link, the scheduled check-in run, the check-in phone offline) follow.
// Local only: no real email, Team Hub or CORE.
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type BrowserContext, type Page, type WebSocketRoute } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";
// Imported first: it points the app's AI worker at the scripted fake model before the app starts.
import { controlDir, milestone3Failures } from "./failures-m3";
import { milestone4Failures } from "./failures-m4";
import { milestone5Failures } from "./failures-m5";
import { milestone6Failures } from "./failures-m6";
import { milestone7Failures } from "./failures-m7";

async function main() {
const env = localEnv(), sql = db(env), mail = await mailbox();
const app = await startApp(env, mail.url);
let browser: Browser | undefined;
const passed: string[] = [];
// KIT_SHOTS=<folder> saves a screenshot at each failure state for review.
const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(800); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png` }); } };
const step = async (name: string, run: () => Promise<void>) => { const t0 = Date.now(); await run(); passed.push(`${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); console.log(`ok · ${name}`); };

try {
  await sql.connect();
  const room = await engagement(sql, ["Ruth", "Ben", "Grace"]);
  const cloud = await room.session("Celebration", "word_cloud", "One word for what God is doing at Riverside", 1);
  await room.session("Celebration wall", "wall", "What is God doing that is worth celebrating?", 2);
  const fac = await facilitator(env, sql, room.id);
  browser = await chromium.launch();

  // The TV, on its own computer. Its realtime socket can be cut on demand.
  const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tvSockets: WebSocketRoute[] = []; let tvCut = false, tvRealtime = true;
  await tvContext.routeWebSocket(/\/realtime\/v1\/websocket/, ws => { if (tvCut || !tvRealtime) { ws.close(); return; } tvSockets.push(ws); ws.connectToServer(); });
  let tv = await tvContext.newPage(); await tv.goto(app.origin + "/tv");
  const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
  await pairTv(fac, room.id, app.secret, code);
  await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
  await press(fac, sql, room.id, "go_live", { session: cloud });
  await tv.locator(".tv-layer.is-input:not(.is-leaving) .tv-board").waitFor({ timeout: 10000 });
  const mark = (page: Page) => page.evaluate(() => { (window as unknown as { __kit: number }).__kit = 1; });
  const unchanged = (page: Page) => page.evaluate(() => (window as unknown as { __kit?: number }).__kit === 1);
  await mark(tv);
  const tvText = () => tv.locator(".tv-layer:not(.is-leaving) .tv-board").innerText();
  const tally = async () => Number((await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").then(v => v ?? "")).match(/\d+/)?.[0] ?? 0);

  // Phones sign in by email code, as a real room does.
  async function phone(person: { email: string }, context?: BrowserContext) {
    const ctx = context ?? await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); await page.goto(`${app.origin}/room/${room.id}`);
    const before = mail.count;
    await page.fill("#room-email", person.email); await page.getByRole("button", { name: "Send me a sign-in code" }).click();
    await page.fill("#room-code", await mail.code(person.email, before)); await page.getByRole("button", { name: "Sign in" }).click();
    await page.locator(".ph-app").waitFor({ timeout: 15000 });
    return { ctx, page };
  }
  const send = async (page: Page, text: string) => { await page.fill("#ph-answer", text); await page.locator(".ph-send").click(); };
  const [ruth, ben] = [await phone(room.attendees[0]), await phone(room.attendees[1])];
  await ruth.page.locator("#ph-answer").waitFor();
  await send(ben.page, "youth"); await until(async () => (await tvText()).includes("youth"), "first word on the TV");

  // The laptop and the remote.
  const facContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await facContext.addCookies(fac.cookies(app.origin));
  const control = await facContext.newPage(); await control.goto(`${app.origin}/control/${room.id}`);
  await control.locator(".ctl-app").waitFor({ timeout: 15000 });
  const remoteContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await remoteContext.addCookies(fac.cookies(app.origin));
  const remote = await remoteContext.newPage(); await remote.goto(`${app.origin}/remote/${room.id}`);
  await remote.getByRole("button", { name: "Next" }).waitFor({ timeout: 15000 });

  await step("FAIL-01 Venue wifi drops on a phone: answers are saved, then sent in order with no duplicates", async () => {
    const before = await tally();
    await ruth.ctx.setOffline(true);
    await until(async () => (await ruth.page.locator(".ph-head").innerText()).includes("Offline"), "Offline marker");
    for (const word of ["hope", "alpha", "momentum"]) await send(ruth.page, word);
    await until(async () => (await ruth.page.getByText("Saved on this phone").count()) === 3, "three answers saved on this phone");
    await shot(ruth.page, "fail-01-phone-offline");
    await delay(1500); assert.equal(await tally(), before, "nothing reaches the TV while the phone is offline");
    await ruth.ctx.setOffline(false);
    await until(async () => (await ruth.page.getByText("Saved on this phone").count()) === 0, "every saved answer sent", 15000);
    await until(async () => await tally() === before + 3, "the TV counts all three", 10000);
    const rows = (await sql.query(`select x.text from public.submissions x join public.attendees a on a.id=x.attendee_id
      where a.email=$1 and x.session_id=$2 and not x.deleted order by x.server_received_at`, [room.attendees[0].email, cloud])).rows.map(r => r.text);
    assert.deepEqual(rows, ["hope", "alpha", "momentum"], "sent in the order written, each once");
  });

  await step("FAIL-02 The TV loses its connection: it holds its last screen, shows Reconnecting, and catches up when the network returns", async () => {
    tvCut = true; tvSockets.splice(0).forEach(ws => ws.close()); await tvContext.setOffline(true);
    await until(async () => await tv.locator(".tv-reconnecting.is-on").count() === 1, "Reconnecting mark", 12000);
    const held = await tvText(); await shot(tv, "fail-02-tv-reconnecting");
    await send(ben.page, "baptisms"); await send(ruth.page, "worship");
    await delay(1500);
    assert.equal(await tvText(), held, "the TV keeps its last state, never blank");
    assert.ok(held.includes("youth"));
    // After 12 seconds silent the TV drops out of confirmation and the laptop offers the TV view on phones.
    await until(async () => (await control.locator(".ctl-banner").innerText().catch(() => "")).includes("reconnecting"), "laptop warning", 25000);
    await shot(control, "fail-02-laptop-warning");
    await control.getByRole("button", { name: "Show the TV view on phones" }).click();
    await until(async () => (await ben.page.locator(".ph-app .tv-mirror").count()) === 1, "TV view on phones");
    await until(async () => (await ben.page.locator(".ph-app .tv-mirror").innerText()).includes("baptisms"), "phones show what the TV would show");
    await shot(ben.page, "fail-02-tv-view-on-phones");
    const back = Date.now(); tvCut = false; await tvContext.setOffline(false);
    await until(async () => { const t = await tvText(); return t.includes("baptisms") && t.includes("worship"); }, "missed answers arrive", 5000);
    const caughtUp = Date.now() - back;
    await until(async () => await tv.locator(".tv-reconnecting.is-on").count() === 0, "Reconnecting mark clears", 5000);
    assert.ok(caughtUp < 3000, `current state within 3 seconds of the network returning (${caughtUp} ms)`);
    assert.ok(await unchanged(tv), "the TV page never reloaded");
    await press(fac, sql, room.id, "tv_on_phones", { on: false });
    await until(async () => (await ben.page.locator(".ph-app .tv-mirror").count()) === 0, "TV view off on phones");
  });

  await step("FAIL-04 The TV's browser is closed: reopening it resumes the session without pairing again", async () => {
    await tv.close();
    tv = await tvContext.newPage(); await tv.goto(app.origin + "/tv");
    await until(async () => (await tvText()).includes("baptisms"), "same session and answers", 15000);
    assert.equal(await tv.locator(".tv-pair.is-active").count(), 0, "no pairing code");
    await mark(tv);
  });

  await step("FAIL-06 The remote and the TV disagree: the TV wins, Syncing shows after 2 seconds, then corrects", async () => {
    let blocked = true;
    await tv.route("**/api/tv/ack", route => blocked ? route.abort() : route.continue());
    await press(fac, sql, room.id, "phones_down");
    await until(async () => (await tv.locator(".tv-live.is-down").count()) === 1, "the TV shows Phones down");
    await until(async () => (await remote.getByText("Syncing").count()) > 0, "remote shows Syncing", 6000);
    await until(async () => (await control.getByText("The TV hasn’t confirmed yet.").count()) > 0, "laptop shows a quiet warning", 6000);
    await shot(remote, "fail-06-remote-syncing");
    blocked = false;
    await until(async () => (await remote.getByText("Syncing").count()) === 0, "remote corrects itself", 20000);
    await tv.unroute("**/api/tv/ack");
  });

  await step("FAIL-05 The laptop dies: the remote runs the room alone", async () => {
    await control.close();
    await remote.getByRole("button", { name: "Open phones" }).click();
    await until(async () => (await tv.locator(".tv-live:not(.is-down)").count()) === 1, "phones open from the remote");
    await remote.getByRole("button", { name: "Next" }).click();
    await until(async () => (await tv.locator(".tv-layer:not(.is-leaving) .tv-feed").count()) === 1, "Next from the remote reaches the TV", 8000);
    await ben.page.locator("#ph-answer").waitFor({ timeout: 8000 });
  });

  await step("Refresh phones reloads every phone and never the TV", async () => {
    let reloads = 0; ruth.page.on("load", () => { reloads++; });
    await press(fac, sql, room.id, "refresh_phones");
    await until(() => reloads > 0, "the phone reloaded", 10000);
    await ruth.page.locator("#ph-answer").waitFor({ timeout: 10000 });
    assert.ok(await unchanged(tv), "the TV never reloaded");
  });

  await step("FAIL-08 A phone dies: the person signs in on another device and sees their own answers", async () => {
    await send(ben.page, "Teenagers asking to be baptized");
    await until(async () => (await tvText()).includes("Teenagers asking to be baptized"), "wall answer on the TV");
    await ben.ctx.close();
    const second = await phone(room.attendees[1]);
    await until(async () => (await second.page.locator(".ph-answers").innerText().catch(() => "")).includes("Teenagers asking to be baptized"), "own answer on the new phone", 10000);
    assert.ok((await second.page.getByText("Your earlier answers are here.").count()) > 0, "a one-time line says so");
    await shot(second.page, "fail-08-new-phone");
    await second.ctx.close();
  });

  await step("Realtime blocked: a screen keeps up from snapshots, with no Reconnecting mark", async () => {
    tvRealtime = false; tvSockets.splice(0).forEach(ws => ws.close());
    await tv.close(); tv = await tvContext.newPage(); await tv.goto(app.origin + "/tv");
    await until(async () => (await tvText()).includes("Teenagers"), "fallback TV resumes", 15000);
    const sent = Date.now(); await send(ruth.page, "Small groups starting in homes again");
    await until(async () => (await tvText()).includes("Small groups starting in homes again"), "answer through fallback", 4000);
    const ms = Date.now() - sent;
    assert.ok(ms < 2500, `fallback delivery within one snapshot interval (${ms} ms)`);
    await delay(2000);
    assert.equal(await tv.locator(".tv-reconnecting.is-on").count(), 0, "fallback is not a disconnect");
  });

  await step("FAIL-10 The tech fails completely: the run of show and prompts print from the control surface", async () => {
    const print = await facContext.newPage(); await print.goto(`${app.origin}/setup/${room.id}/run-of-show/print`);
    const text = await print.locator("main").innerText();
    for (const want of ["Run of show", "One word for what God is doing at Riverside", "What is God doing that is worth celebrating?", "If the tech fails"]) assert.ok(text.includes(want), want);
  });

  await step("The phone to TV report reads the latency log for this room", async () => {
    const report = await facContext.newPage(); await report.goto(`${app.origin}/control/${room.id}/latency`);
    const text = await report.locator("main").innerText();
    assert.match(text, /reached the TV in under 1 second/); assert.match(text, /Celebration/);
    await shot(report, "latency-report");
  });

  // Milestone 3's kinds, in the same browser and app, on an engagement of their own.
  await Promise.all(browser.contexts().map(c => c.close().catch(() => {})));
  await milestone3Failures({ env, sql, mail, app, browser, step, shot });
  await Promise.all(browser.contexts().map(c => c.close().catch(() => {})));
  await milestone4Failures({ env, sql, mail, app, browser, step, shot });
  await Promise.all(browser.contexts().map(c => c.close().catch(() => {})));
  await milestone5Failures({ env, sql, mail, app, browser, step, shot });
  await Promise.all(browser.contexts().map(c => c.close().catch(() => {})));
  await milestone6Failures({ env, sql, mail, app, browser, step, shot });
  await Promise.all(browser.contexts().map(c => c.close().catch(() => {})));
  await milestone7Failures({ env, sql, mail, app, browser, step, shot });

  console.log(`Browser failure kit: ${passed.length} checks passed.\n${passed.map(p => `  ${p}`).join("\n")}\nLocal checks on loopback; venue acceptance is the practice-room script.`);
} catch (error) {
  console.error(app.output().slice(-4000));
  throw error;
} finally {
  await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); rmSync(controlDir, { recursive: true, force: true });
}
}
main().catch(error => { console.error(error); process.exit(1); });
