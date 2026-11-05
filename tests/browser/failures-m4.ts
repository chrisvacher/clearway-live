// The failure kit, extended to milestone 4's kinds (step 8). tests/browser/failures.ts runs these
// checks after milestone 3's (`npm run test:browser`), in the same browser, against the same production
// build and local stack, with the scripted fake AI model (never the API). Each check breaks something on
// purpose with a Wayfinding kind on screen and proves the room recovers the way the PRD says:
//   FAIL-01 offline queueing and in-order replay for lens sentences, the lens summary's Approve and
//     outcome bullets, the last answer standing and nothing sent twice;
//   FAIL-02 the TV holding its last screen on the lens wall and the lens summary and catching up on reconnect;
//   FAIL-09 AI slow and failing on the lens wall and the lens summary: every answer still lands at once
//     and only the control surface says so;
//   FAIL-10 the run of show printing from the Wayfinding template (and the day-and-a-half one).
// KIT_SHOTS=<folder> saves each failure state. Local only: no real email, Team Hub or CORE.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import type { Browser, BrowserContext, Page, WebSocketRoute } from "playwright";
import { engagement, facilitator, mailbox, pairTv, press, startApp, until, type Env } from "./harness";
import { controlDir, controlFile } from "./failures-m3";
import { rmSync, writeFileSync } from "node:fs";
import type pg from "pg";

const fake = (value: { delayMs?: number; fail?: boolean }) => writeFileSync(controlFile, JSON.stringify(value));
export const wayfindingTemplate = "c1ea0000-0000-4000-8000-000000000002", halfDayTemplate = "c1ea0000-0000-4000-8000-000000000003";

type Kit = { env: Env; sql: pg.Client; mail: Awaited<ReturnType<typeof mailbox>>; app: Awaited<ReturnType<typeof startApp>>; browser: Browser;
  step: (name: string, run: () => Promise<void>) => Promise<void>; shot: (page: Page, name: string) => Promise<void> };
export async function milestone4Failures({ env, sql, mail, app, browser, step, shot }: Kit) {
  fake({});
  const room = await engagement(sql, ["Ruth", "Ben", "Grace"]);
  await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [room.id]);
  const fac = await facilitator(env, sql, room.id);
  const results = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [room.id])).rows[0].results;
  const addLens = async (title: string, position: number) => {
    const id = await room.session(title, "lens", "Describe the 10-year Future for this lens, as if it is true today", position, { maxSends: 10, maxChars: 280 });
    await sql.query("update public.sessions set options=private.session_options('lens','{\"lens\":1}'::jsonb,engagement_id),settings=settings||'{\"anonymous\":true}'::jsonb where id=$1", [id]);
    return id;
  };
  const wall = await addLens("Five Lenses: Congregation", 1), wall2 = await addLens("Five Lenses: Community", 3);
  const summary = await room.session("The 10-year Future, by lens", "lens_summary", "The 10-year Future, one lens at a time", 2, { maxSends: 1, maxChars: 140 });
  await sql.query("update public.sessions set options=private.session_options('lens_summary','{\"lens\":1,\"ai\":true}'::jsonb,engagement_id) where id=$1", [summary]);
  assert.ok((await sql.query("select options<>'{}' as ok from public.sessions where id=$1", [summary])).rows[0].ok, "lens summary options accepted");

  const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tvSockets: WebSocketRoute[] = []; let tvCut = false;
  await tvContext.routeWebSocket(/\/realtime\/v1\/websocket/, ws => { if (tvCut) { ws.close(); return; } tvSockets.push(ws); ws.connectToServer(); });
  const tv = await tvContext.newPage(); await tv.goto(app.origin + "/tv");
  const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
  await pairTv(fac, room.id, app.secret, code, "Failure kit TV (milestone 4)");
  await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
  await tv.evaluate(() => { (window as unknown as { __kit4: number }).__kit4 = 1; });
  const unchanged = () => tv.evaluate(() => (window as unknown as { __kit4?: number }).__kit4 === 1);
  const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
  const live = async (session: string, ready: string) => {
    await press(fac, sql, room.id, "go_live", { session });
    // Back on a step the room has closed, it is read-only until Reopen (live controls).
    if ((await sql.query("select state from public.sessions where id=$1", [session])).rows[0].state === "closed") await press(fac, sql, room.id, "reopen");
    await layer().locator(ready).first().waitFor({ timeout: 10000 });
    await delay(900);
  };
  async function phone(person: { email: string }) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); await page.goto(`${app.origin}/room/${room.id}`);
    const before = mail.count;
    await page.fill("#room-email", person.email); await page.getByRole("button", { name: "Send me a sign-in code" }).click();
    await page.fill("#room-code", await mail.code(person.email, before)); await page.getByRole("button", { name: "Sign in" }).click();
    await page.locator(".ph-app").waitFor({ timeout: 15000 });
    return { ctx, page };
  }
  const [ruth, ben, grace] = [await phone(room.attendees[0]), await phone(room.attendees[1]), await phone(room.attendees[2])];
  const every = async (email: string, session: string) => (await sql.query(`select x.id, x.text, x.value, x.withdrawn, x.server_received_at from public.submissions x join public.attendees a on a.id=x.attendee_id
    where a.email=$1 and x.session_id=$2 and not x.deleted order by x.server_received_at`, [email, session])).rows as { id: string; text: string; value: Record<string, unknown>; withdrawn: boolean; server_received_at: Date }[];
  const sentence = async (page: Page, text: string) => { await page.locator("#lens-sentence").fill(text); await page.locator(".lens-form .ph-send").click(); };
  const tally = async () => (await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").catch(() => "")) ?? "";
  const tvSays = async () => (await tv.locator("body").innerText()).toLowerCase();
  const sentences = ["We welcome every stranger by name", "Our neighbours eat at our table every week", "Teenagers ask to be baptized", "Young families find us online",
    "Small groups meet in homes again", "Volunteers show up early", "Newcomers join a group within weeks", "Leaders raise up the next leaders", "Prayer fills the week"];

  // ---------- FAIL-01 on the lens wall and the lens summary ----------
  await step("FAIL-01 Lens sentences offline: three are saved on the phone, then sent in the order written, each once, and the TV counts them", async () => {
    await live(wall, '[data-board="lens"]');
    const page = ruth.page;
    await page.locator("#lens-sentence").waitFor({ timeout: 10000 });
    await ruth.ctx.setOffline(true);
    await until(async () => (await page.locator(".ph-head").innerText()).includes("Offline"), "Offline marker", 8000);
    for (const t of sentences.slice(0, 3)) { await sentence(page, t); await delay(150); }
    await until(async () => (await page.locator(".ph-answers").innerText()).includes("Saved on this phone"), "sentences saved on this phone", 5000);
    await shot(page, "fail-01-m4-lens-offline-phone");
    await delay(1200);
    assert.equal((await every(room.attendees[0].email, wall)).length, 0, "nothing reaches the server while the phone is offline");
    const back = Date.now();
    await ruth.ctx.setOffline(false);
    await until(async () => (await every(room.attendees[0].email, wall)).length === 3, "the queued sentences arrive", 15000);
    console.log(`  three queued lens sentences sent within ${Date.now() - back} ms of the network returning`);
    const rows = await every(room.attendees[0].email, wall);
    assert.deepEqual(rows.map(r => r.text), sentences.slice(0, 3), "sent in the order written, each stored once");
    const at = rows.map(r => r.server_received_at.getTime());
    assert.deepEqual([...at].sort((a, b) => a - b), at, "received in order");
    await until(async () => /^3 /.test(await tally()), "the TV counts three sentences", 5000);
    await until(async () => (await page.getByText("Saved on this phone").count()) === 0, "nothing left saved on the phone", 8000);
    assert.ok(await unchanged(), "the TV page never reloaded");
    for (const [p, t] of [[ben.page, sentences[3]], [grace.page, sentences[4]], [ben.page, sentences[5]]] as const) await sentence(p, t);
    await until(async () => ((await results()).total as number) === 6, "six sentences on the server", 8000);
  });
  await step("FAIL-01 Approve offline: the phone saves it, then sends it once when the network returns, and the TV tally counts it", async () => {
    await press(fac, sql, room.id, "go_live", { session: summary });
    await layer().locator("[data-lens-summary]").waitFor({ timeout: 10000 });
    // The control surface open on the room is what wakes the AI worker.
    const control = await (await browser.newContext({ viewport: { width: 1440, height: 1400 } })).newPage();
    await control.context().addCookies(fac.cookies(app.origin)); await control.goto(`${app.origin}/control/${room.id}`);
    await control.locator(".ctl-app").waitFor({ timeout: 15000 });
    await until(async () => ((await results()).summary?.sentences?.length ?? 0) >= 3, "AI drafted the summary", 40000);
    await until(async () => (await layer().locator(".lsm-line:not(.is-gone)").count()) === (await results()).summary.sentences.length, "the TV shows the draft", 8000);
    const page = ben.page;
    await page.getByRole("button", { name: "Approve", exact: true }).waitFor({ timeout: 10000 });
    await ben.ctx.setOffline(true);
    await until(async () => (await page.locator(".ph-head").innerText()).includes("Offline"), "Offline marker", 8000);
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await delay(1200);
    assert.equal((await results()).tally.approve, 0, "the approval waits on the phone");
    await shot(page, "fail-01-m4-approve-offline-phone");
    await ben.ctx.setOffline(false);
    await until(async () => (await results()).tally.approve === 1, "the approval arrives once", 15000);
    await until(async () => (await layer().locator('[data-tally="approve"]').innerText()).trim() === "1", "the TV tally counts it", 5000);
    assert.equal((await every(room.attendees[1].email, summary)).filter(r => !r.withdrawn).length, 1, "stored once");
    assert.ok(await unchanged(), "the TV page never reloaded");
    await control.context().close();
  });

  // ---------- FAIL-02 on the lens wall and the lens summary ----------
  async function holdAndCatchUp(label: string, kind: string, read: () => Promise<string>, answer: () => Promise<void>, matches: () => Promise<boolean>) {
    const shown = await read();
    tvCut = true; tvSockets.splice(0).forEach(ws => ws.close()); await tvContext.setOffline(true);
    await until(async () => await tv.locator(".tv-reconnecting.is-on").count() === 1, `${label}: Reconnecting mark`, 12000);
    await answer();
    await delay(1500);
    assert.equal(await read(), shown, `${label}: the TV keeps its last screen, never blank`);
    assert.equal(await layer().getAttribute("data-kind"), kind, `${label}: still the same step`);
    await shot(tv, `fail-02-m4-${kind}-reconnecting-tv`);
    const back = Date.now(); tvCut = false; await tvContext.setOffline(false);
    await until(matches, `${label}: the TV catches up to the server`, 5000);
    const ms = Date.now() - back;
    await until(async () => await tv.locator(".tv-reconnecting.is-on").count() === 0, `${label}: Reconnecting mark clears`, 5000);
    assert.ok(ms < 3000, `${label}: current state within 3 seconds of the network returning (${ms} ms)`);
    assert.ok(await unchanged(), `${label}: the TV page never reloaded`);
    console.log(`  ${label}: caught up ${ms} ms after the network returned`);
  }
  await step("FAIL-02 on the lens wall: the TV holds its sentences with Reconnecting, then catches up to the server's count and clusters", async () => {
    await live(wall, '[data-board="lens"]');
    const clusters = () => layer().locator(".lens-cluster:not(.is-going)").evaluateAll(els => els.map(e => `${e.querySelector(".lens-label")!.textContent!.trim()}:${e.querySelector(".lens-count")!.textContent}`).sort().join("|"));
    await holdAndCatchUp("lens wall", "lens", async () => `${await tally()}#${await clusters()}`, async () => {
      for (const [p, t] of [[ben.page, sentences[6]], [grace.page, sentences[7]]] as const) await sentence(p, t);
      await until(async () => ((await results()).total as number) === 8, "sentences reach the server while the TV is cut", 8000);
    }, async () => /^8 /.test(await tally()));
  });
  await step("FAIL-02 on the lens summary: the TV holds its lines with Reconnecting, then the tally catches up", async () => {
    await live(summary, "[data-lens-summary]");
    const shown = async () => `${await layer().locator('[data-tally="approve"]').innerText()}|${await layer().locator(".lsm-line:not(.is-gone) .lsm-text").allInnerTexts().then(t => t.join("/"))}`;
    await holdAndCatchUp("lens summary", "lens_summary", shown, async () => {
      await grace.page.getByRole("button", { name: "Approve", exact: true }).click();
      await until(async () => (await results()).tally.approve === 2, "the approval reaches the server while the TV is cut", 8000);
    }, async () => (await layer().locator('[data-tally="approve"]').innerText()).trim() === "2");
  });

  // ---------- FAIL-09 on the lens wall ----------
  const facContext = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  await facContext.addCookies(fac.cookies(app.origin));
  const control = await facContext.newPage(); await control.goto(`${app.origin}/control/${room.id}`);
  await control.locator(".ctl-app").waitFor({ timeout: 15000 });
  const panel = () => control.locator("[data-ai-panel]");
  const notice = async () => (await panel().locator("[data-ai-notice='warning']").innerText().catch(() => ""));
  await step("FAIL-09 on the lens wall: AI slow, then failing; every sentence still lands at once and only the control surface says so", async () => {
    await live(wall2, '[data-board="lens"]');
    await panel().waitFor({ timeout: 10000 });
    const landed = async (text: string) => (await layer().innerText()).includes(text);
    const fresh = ["We are known by our neighbours", "Our building is full all week", "Every household has a friend here", "Giving is joyful and steady", "Our children lead in worship"];
    fake({ delayMs: 9000 });
    for (let n = 0; n < 3; n++) {
      const t0 = Date.now(); await sentence([ben.page, grace.page][n % 2], fresh[n]);
      await until(async () => ((await results()).total as number) === n + 1, `answer ${n + 1} lands while AI is slow`, 2000);
      await until(() => landed(fresh[n]), `answer ${n + 1} is on the TV while AI is slow`, 2000);
      if (!n) console.log(`  lens wall: phone send to TV with AI slow ${Date.now() - t0} ms`);
    }
    await until(async () => (await notice()).includes("AI is slow."), "the control surface says AI is slow", 15000);
    assert.ok(!/slow|isn.t responding|failed|ai is/.test(await tvSays()), "the TV never says anything about AI");
    await panel().scrollIntoViewIfNeeded(); await shot(control, "fail-09-m4-lens-slow-control");
    fake({ fail: true });
    for (let n = 3; n < 5; n++) {
      await sentence([ben.page, grace.page][n % 2], fresh[n]);
      await until(async () => ((await results()).total as number) === n + 1, `answer ${n + 1} lands while AI fails`, 2000);
      await until(() => landed(fresh[n]), `answer ${n + 1} is on the TV while AI fails`, 2000);
    }
    await until(async () => (await notice()).includes("AI isn't responding."), "the control surface says AI isn't responding", 20000);
    assert.ok(!/slow|isn.t responding|failed|ai is/.test(await tvSays()), "the TV never says AI is failing");
    await shot(control, "fail-09-m4-lens-failing-control"); await shot(tv, "fail-09-m4-lens-failing-tv");
    fake({});
    assert.ok(await unchanged(), "the TV page never reloaded");
  });
  await step("FAIL-09 on the lens summary: with AI failing the draft waits, the room's Approve still lands and the TV says nothing about AI", async () => {
    fake({ fail: true });
    await live(summary, "[data-lens-summary]");
    await ruth.page.getByRole("button", { name: "Approve", exact: true }).waitFor({ timeout: 10000 });
    assert.ok(!/slow|isn.t responding|failed|ai is/.test(await tvSays()), "the TV never says AI is failing");
    await shot(tv, "fail-09-m4-summary-failing-tv");
    fake({});
  });

  // ---------- FAIL-10 from the Wayfinding template ----------
  await step("FAIL-10 The run of show prints from the Wayfinding template with every milestone 4 kind, and the day-and-a-half one prints its follow-up", async () => {
    for (const [name, template, extra] of [["Wayfinding", wayfindingTemplate, []], ["Wayfinding, day and a half", halfDayTemplate, ["Follow-up"]]] as const) {
      const made = await engagement(sql, []);
      const f = await facilitator(env, sql, made.id);
      const { data, error } = await f.client.rpc("template_write", { p_action: "apply", p_input: { template, engagement: made.id, start: "2026-11-02T14:00:00Z" } });
      assert.equal(error, null); assert.equal(data.status, "ok", JSON.stringify(data));
      const printContext = await browser.newContext({ viewport: { width: 1440, height: 1400 } }); await printContext.addCookies(f.cookies(app.origin));
      const print = await printContext.newPage(); await print.goto(`${app.origin}/setup/${made.id}/run-of-show/print`);
      await print.locator("main").waitFor({ timeout: 15000 });
      const text = await print.locator("main").innerText();
      for (const want of ["Run of show", "Pre-call", "Day 1", "Day 2", "Five Lenses: Congregation", "Self-paced", "If the tech fails", ...extra]) assert.ok(text.includes(want), `${name} print has: ${want}`);
      assert.doesNotMatch(text, /publish to core/i, `${name}: no Publish to CORE`);
      const rows = (await sql.query("select count(*)::int n from public.sessions where engagement_id=$1 and not deleted", [made.id])).rows[0].n as number;
      assert.ok(rows >= 40, `${name}: ${rows} sessions print`);
      assert.doesNotMatch(text, /Content · Live.*Five Lenses/, "a Wayfinding kind is never printed as Content");
      if (process.env.KIT_SHOTS) await print.screenshot({ path: `${process.env.KIT_SHOTS}/fail-10-m4-print-${template === wayfindingTemplate ? "wayfinding" : "half-day"}.png`, fullPage: true });
      await printContext.close();
    }
  });
  await press(fac, sql, room.id, "nothing_live");
  await Promise.all([tvContext, facContext, ruth.ctx, ben.ctx, grace.ctx].map((c: BrowserContext) => c.close().catch(() => {})));
  rmSync(controlDir, { recursive: true, force: true });
}
