// The failure kit, extended to milestone 3's kinds (step 7a). tests/browser/failures.ts runs
// these checks after its milestone 2 checks (`npm run test:browser`), in the same browser,
// against the same production build and local stack, with the scripted fake AI model (never the API).
// Each check breaks something on purpose with a structured kind on screen and proves the
// room recovers the way the PRD says:
//   FAIL-01 offline queueing and in-order replay for choice, ranking, 100 points, a grid
//     placement and a signature, each once, the last answer standing;
//   FAIL-02 the TV holding its last screen on a bar and a grid and catching up on reconnect;
//   FAIL-06 Syncing and its correction while a Q&A ranking moves;
//   FAIL-08 a new phone seeing its own structured answers;
//   FAIL-09 AI slow and failing on the word cloud, the wall and Q&A;
//   FAIL-10 the run of show printing with the new kinds and a self-paced session.
// KIT_SHOTS=<folder> saves each failure state. Local only: no real email, Team Hub or CORE.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Browser, BrowserContext, Page, WebSocketRoute } from "playwright";
import { engagement, facilitator, mailbox, pairTv, press, startApp, until, type Env } from "./harness";
import type pg from "pg";

// The scripted fake model reads this file on every call: slow, failing or well (as the AI kit does).
// Set when this module loads, before failures.ts starts the app, so the app's AI worker uses it.
export const controlDir = join(tmpdir(), `clearway-fail-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
const fake = (value: { delayMs?: number; fail?: boolean }) => writeFileSync(controlFile, JSON.stringify(value));
fake({});
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "250", ANTHROPIC_API_KEY: "" });

type Bar = { key: string; fraction: number; leader: boolean; count?: number };
const opts = (...texts: string[]) => texts.map((text, i) => ({ key: `o${i + 1}`, text }));
const five = opts("Reaching new people", "Next generation", "Welcome and first visits", "Systems and data", "Second campus");
const gridItems = ["Online newcomer path", "Prayer room", "Leader residency", "Youth night"].map((text, i) => ({ key: `i${i + 1}`, text }));

type Kit = { env: Env; sql: pg.Client; mail: Awaited<ReturnType<typeof mailbox>>; app: Awaited<ReturnType<typeof startApp>>; browser: Browser;
  step: (name: string, run: () => Promise<void>) => Promise<void>; shot: (page: Page, name: string) => Promise<void> };
export async function milestone3Failures({ env, sql, mail, app, browser, step, shot }: Kit) {
  const room = await engagement(sql, ["Ruth", "Ben", "Grace"]);
  await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [room.id]);
  const add = async (title: string, kind: string, prompt: string, position: number, options: Record<string, unknown>, extra: { segment?: string; maxSends?: number; maxChars?: number; named?: boolean } = {}) => {
    const id = await room.session(title, kind, prompt, position, extra);
    await sql.query("update public.sessions set options=private.session_options(interaction,$2::jsonb,engagement_id),settings=settings||jsonb_build_object('anonymous',$3::boolean) where id=$1", [id, options, !extra.named]);
    if (Object.keys(options).length) assert.ok((await sql.query("select options<>'{}' as ok from public.sessions where id=$1", [id])).rows[0].ok, `${title}: options accepted`);
    return id;
  };
  // One segment, so a step the room has moved past stays open for late answers (Decided November 1).
  const seg = { segment: "Where to focus" };
  const choice = await add("Next season", "choice", "Where should our next season go?", 1, { items: five, multiple: false }, seg);
  const ranking = await add("Priorities", "ranking", "Rank these by what matters most", 2, { items: five }, seg);
  const points = await add("Spend 100", "points", "Spend 100 points on what matters most", 3, { items: five, cut: 3 }, seg);
  const grid = await add("Effort and impact", "grid", "Where does each idea sit?", 4, { items: gridItems }, seg);
  const sign = await add("Our commitment", "sign", "Sign our shared commitment", 5, { text: "We commit to the goals we set together." }, { ...seg, named: true });
  const qa = await add("Your questions", "qa", "What do you want to ask about the plan?", 6, { any_time: false }, { maxSends: 10, maxChars: 200 });
  const cloud = await add("One word", "word_cloud", "One word for this season", 7, {}, { maxSends: 10 });
  const wall = await add("What's working", "wall", "What's working that we should protect?", 8, {}, { maxSends: 10 });
  await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,mode,opens_at,closes_at,options)
    values($1,'Before we meet','Pre-call',0,'statements','How true is each of these for us today?','ready','self_paced',now()-interval '1 hour',now()+interval '2 days',private.session_options('statements',$2::jsonb,$1))`,
    [room.id, { items: [{ key: "s1", text: "We know who we are trying to reach" }, { key: "s2", text: "Decisions get made and stay made" }] }]);
  const fac = await facilitator(env, sql, room.id);
  const results = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [room.id])).rows[0].results;

  // The TV, on its own computer. Its realtime socket can be cut on demand.
  const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tvSockets: WebSocketRoute[] = []; let tvCut = false;
  await tvContext.routeWebSocket(/\/realtime\/v1\/websocket/, ws => { if (tvCut) { ws.close(); return; } tvSockets.push(ws); ws.connectToServer(); });
  const tv = await tvContext.newPage(); await tv.goto(app.origin + "/tv");
  const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
  await pairTv(fac, room.id, app.secret, code);
  await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
  await tv.evaluate(() => { (window as unknown as { __kit: number }).__kit = 1; });
  const unchanged = () => tv.evaluate(() => (window as unknown as { __kit?: number }).__kit === 1);
  const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
  const live = async (session: string, kind: string) => {
    await press(fac, sql, room.id, "go_live", { session });
    await tv.locator(`.tv-layer:not(.is-leaving)[data-kind="${kind}"] .tv-board`).waitFor({ timeout: 10000 });
    await delay(900);
  };
  // The TV's bars, in the order they stand, against the server's.
  const barsMatch = async () => {
    const server = (await results()).bars as Bar[];
    const rows = await layer().locator(".tv-bar:not(.is-leaving)").evaluateAll(rs => rs.map(r => ({ key: (r as HTMLElement).dataset.key!, y: r.getBoundingClientRect().top,
      w: parseFloat((r.querySelector(".tv-bar-fill") as HTMLElement).style.width) || 0 })));
    const byY = rows.sort((a, b) => a.y - b.y);
    return byY.length === server.length && byY.every((r, i) => r.key === server[i].key && Math.abs(r.w - server[i].fraction * 100) < 0.6);
  };
  const tvBars = () => layer().locator(".tv-bar-value").allTextContents().then(t => t.join("|"));

  // Phones sign in by email code, as a real room does.
  async function phone(person: { email: string }, context?: BrowserContext) {
    const ctx = context ?? await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); await page.goto(`${app.origin}/room/${room.id}`);
    const before = mail.count;
    await page.fill("#room-email", person.email); await page.getByRole("button", { name: "Send me a sign-in code" }).click();
    await page.fill("#room-code", await mail.code(person.email, before)); await page.getByRole("button", { name: "Sign in" }).click();
    await page.locator(".ph-app").waitFor({ timeout: 15000 });
    return { ctx, page };
  }
  const [ruth, ben, grace] = [await phone(room.attendees[0]), await phone(room.attendees[1]), await phone(room.attendees[2])];
  // The person's standing answers, as the database keeps them: one per person for these kinds.
  const standing = async (email: string, session: string) => (await sql.query(`select x.value, x.revision, x.server_received_at from public.submissions x join public.attendees a on a.id=x.attendee_id
    where a.email=$1 and x.session_id=$2 and not x.deleted and not x.withdrawn order by x.server_received_at`, [email, session])).rows as { value: Record<string, unknown>; revision: number; server_received_at: Date }[];
  const every = async (email: string, session: string) => (await sql.query(`select x.id, x.value, x.withdrawn, x.revision from public.submissions x join public.attendees a on a.id=x.attendee_id
    where a.email=$1 and x.session_id=$2 and not x.deleted order by x.server_received_at`, [email, session])).rows as { id: string; value: Record<string, unknown>; withdrawn: boolean; revision: number }[];
  const goStep = async (page: Page, title: string) => {
    // Look back at a step the room has reached and that is still open in the segment.
    for (let i = 0; i < 8 && !(await page.locator(".ph-body").innerText()).includes(title); i++) {
      const earlier = page.getByRole("button", { name: "Earlier" });
      if (await earlier.isEnabled()) await earlier.click(); else break;
      await delay(150);
    }
    await until(async () => (await page.locator(".ph-body").innerText()).includes(title), `${title} on the phone`, 5000);
  };

  // ---------- FAIL-01, structured answers ----------
  await step("FAIL-01 Structured answers offline: choice, ranking, 100 points, a grid placement and a signature are saved on the phone, then sent in the order written, each once", async () => {
    // The room reaches every step in the segment once, so each stays open for late answers.
    for (const [s, k] of [[choice, "choice"], [ranking, "ranking"], [points, "points"], [grid, "grid"], [sign, "sign"]] as const) await live(s, k);
    const page = ruth.page;
    await ruth.ctx.setOffline(true);
    await until(async () => (await page.locator(".ph-head").innerText()).includes("Offline"), "Offline marker", 8000);
    // The live step: a signature.
    await page.locator(".gfs-sigpad").waitFor({ timeout: 10000 });
    const box = (await page.locator(".gfs-sigpad svg").boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + box.height * 0.7); await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 20 + i * (box.width - 60) / 10, box.y + box.height * (0.5 + 0.3 * Math.sin(i * 1.3)));
    await page.mouse.up(); await page.getByRole("button", { name: "Sign", exact: true }).click();
    await until(async () => (await page.locator(".ph-note").innerText()).includes("Saved on this phone"), "signature saved on this phone", 5000);
    await shot(page, "fail-01-m3-sign-offline-phone");
    // Earlier steps in the segment, still open: a grid placement, then 100 points, then a ranking, then a choice changed twice.
    await goStep(page, "Where does each idea sit?");
    await page.locator(".gfs-chip").first().click();
    const plot = (await page.locator(".gfs-phplot").boundingBox())!;
    await page.mouse.click(plot.x + 0.3 * plot.width, plot.y + 0.3 * plot.height);
    await until(async () => (await page.locator(".ph-note").innerText()).includes("Saved on this phone"), "placement saved on this phone", 5000);
    await shot(page, "fail-01-m3-grid-offline-phone");
    await goStep(page, "Spend 100 points");
    await page.getByRole("slider", { name: "Second campus", exact: true }).focus(); await page.keyboard.press("End");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await until(async () => (await page.locator(".ph-note").innerText()).includes("Saved on this phone"), "points saved on this phone", 5000);
    await goStep(page, "Rank these by what matters most");
    for (const name of ["Systems and data", "Next generation"]) await page.getByRole("button", { name, exact: true }).click();
    await page.getByRole("button", { name: "Send my order" }).click();
    await until(async () => (await page.locator(".ph-note").innerText()).includes("Saved on this phone"), "ranking saved on this phone", 5000);
    await goStep(page, "Where should our next season go?");
    await page.getByRole("radio", { name: "Next generation" }).click(); await page.getByRole("button", { name: "Send" }).click();
    await until(async () => (await page.locator(".ph-note").innerText()).includes("Saved on this phone"), "choice saved on this phone", 5000);
    await page.getByRole("radio", { name: "Systems and data" }).click(); await page.getByRole("button", { name: "Change my answer" }).click();
    await shot(page, "fail-01-m3-choice-offline-phone");
    await delay(1200);
    for (const s of [choice, ranking, points, grid, sign]) assert.equal((await every(room.attendees[0].email, s)).length, 0, "nothing reaches the server while the phone is offline");
    const back = Date.now();
    await ruth.ctx.setOffline(false);
    // The signature is the step on the TV: it lands there once the phone is back.
    await until(async () => await layer().locator(".gfs-name.is-sig").count() === 1, "the queued signature on the TV", 15000);
    for (const [s, label] of [[ranking, "ranking"], [points, "points"], [grid, "grid"], [sign, "signature"]] as const)
      await until(async () => (await standing(room.attendees[0].email, s)).length === 1, `the queued ${label} arrives`, 15000);
    await until(async () => (await every(room.attendees[0].email, choice)).length === 2, "the queued pick and its change arrive", 15000);
    console.log(`  five queued structured answers sent within ${Date.now() - back} ms of the network returning`);
    // In the order written: the signature first, then the placement, points, ranking and the choice and its change.
    const at = async (s: string) => (await standing(room.attendees[0].email, s))[0].server_received_at.getTime();
    const order = [await at(sign), await at(grid), await at(points), await at(ranking), await at(choice)];
    assert.deepEqual([...order].sort((a, b) => a - b), order, "sent in the order written");
    // Each once, the latest standing: the phone sends a changed pick as a new answer, and the
    // server's one-answer-per-person rule withdraws the earlier one (interaction-engine.md).
    const picks = await every(room.attendees[0].email, choice);
    assert.equal(picks.length, 2, "the pick and its change, each stored once");
    assert.deepEqual(picks.map(p => [p.value, p.withdrawn]), [[{ choices: ["o2"] }, true], [{ choices: ["o4"] }, false]], "in the order written, the latest pick standing");
    assert.deepEqual((await standing(room.attendees[0].email, ranking))[0].value, { order: ["o4", "o2"] });
    assert.deepEqual((await standing(room.attendees[0].email, points))[0].value, { points: { o1: 0, o2: 0, o3: 0, o4: 0, o5: 100 } });
    assert.ok(((await standing(room.attendees[0].email, grid))[0].value.places as Record<string, unknown>).i1, "the placement");
    assert.ok(((await standing(room.attendees[0].email, sign))[0].value.strokes as unknown[]).length >= 1, "the signature's strokes");
    for (const s of [ranking, points, grid, sign]) assert.equal((await every(room.attendees[0].email, s)).length, 1, "each answer stored once");
    await until(async () => (await page.getByText("Saved on this phone").count()) === 0, "nothing left saved on the phone", 8000);
    assert.ok(await unchanged(), "the TV page never reloaded");
  });

  // ---------- FAIL-02 on a bar and a grid ----------
  async function holdAndCatchUp(label: string, kind: string, read: () => Promise<string>, answer: () => Promise<void>, matches: () => Promise<boolean>) {
    const shown = await read();
    tvCut = true; tvSockets.splice(0).forEach(ws => ws.close()); await tvContext.setOffline(true);
    await until(async () => await tv.locator(".tv-reconnecting.is-on").count() === 1, `${label}: Reconnecting mark`, 12000);
    await answer();
    await delay(1500);
    assert.equal(await read(), shown, `${label}: the TV keeps its last screen, never blank`);
    assert.equal(await layer().getAttribute("data-kind"), kind, `${label}: still the same step`);
    await shot(tv, `fail-02-m3-${kind}-reconnecting-tv`);
    const back = Date.now(); tvCut = false; await tvContext.setOffline(false);
    await until(matches, `${label}: the TV catches up to the server`, 5000);
    const ms = Date.now() - back;
    await until(async () => await tv.locator(".tv-reconnecting.is-on").count() === 0, `${label}: Reconnecting mark clears`, 5000);
    assert.ok(ms < 3000, `${label}: current state within 3 seconds of the network returning (${ms} ms)`);
    assert.ok(await unchanged(), `${label}: the TV page never reloaded`);
    console.log(`  ${label}: caught up ${ms} ms after the network returned`);
  }
  await step("FAIL-02 on a bar: the TV holds its last bars with Reconnecting, then glides to the current state within 3 seconds", async () => {
    await live(choice, "choice");
    await until(barsMatch, "the bars match before the cut", 8000);
    await holdAndCatchUp("multiple choice", "choice", tvBars, async () => {
      for (const p of [ben.page, grace.page]) { await p.getByRole("radio", { name: "Welcome and first visits" }).click(); await p.getByRole("button", { name: "Send" }).click(); }
      await until(async () => (await results()).people === 3, "answers reach the server while the TV is cut", 8000);
    }, barsMatch);
  });
  await step("FAIL-02 on a grid: the TV holds its dots with Reconnecting, then the dots glide to the server's means", async () => {
    await live(grid, "grid");
    const dots = () => layer().locator(".gfs-dot").evaluateAll(els => els.filter(el => getComputedStyle(el).opacity !== "0").map(el => el.textContent).sort().join(","));
    await holdAndCatchUp("2x2 grid", "grid", dots, async () => {
      for (const [p, n] of [[ben.page, 2], [grace.page, 3]] as const) {
        await p.locator(".gfs-chip").nth(n - 1).click();
        const b = (await p.locator(".gfs-phplot").boundingBox())!; await p.mouse.click(b.x + 0.7 * b.width, b.y + 0.6 * b.height);
      }
      await until(async () => (await results()).people === 3, "placements reach the server while the TV is cut", 8000);
    }, async () => {
      const server = ((await results()).items as { num: number; count: number }[]).filter(i => i.count > 0).map(i => String(i.num)).sort().join(",");
      return (await dots()) === server;
    });
  });

  // ---------- FAIL-06 on a Q&A ranking ----------
  await step("FAIL-06 on a Q&A ranking: the TV wins; the remote shows Syncing after 2 seconds while votes move the rows, then corrects", async () => {
    await live(qa, "qa");
    const ask = async (page: Page, text: string) => { await page.locator("#qa-question").waitFor({ timeout: 10000 }); await page.fill("#qa-question", text); await page.locator(".qa-ask-form .ph-send").click(); };
    await ask(ruth.page, "When does the second campus open?"); await ask(ben.page, "Who leads the youth night?"); await ask(grace.page, "How will we measure the residency?");
    await until(async () => await layer().locator(".qa-row").count() === 3, "three questions on the TV", 8000);
    const remoteContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await remoteContext.addCookies(fac.cookies(app.origin));
    const remote = await remoteContext.newPage(); await remote.goto(`${app.origin}/remote/${room.id}`);
    await remote.getByRole("button", { name: "Next" }).waitFor({ timeout: 15000 });
    let blocked = true;
    await tv.route("**/api/tv/ack", route => blocked ? route.abort() : route.continue());
    // Two votes lift the last question to the top while the TV cannot confirm.
    const bottom = ((await results()).questions as { id: string; text: string }[]).at(-1)!;
    for (const p of [ruth.page, ben.page]) {
      const item = p.locator(".qa-item", { hasText: bottom.text });
      if (await item.locator(".qa-vote:not([disabled])").count()) await item.locator(".qa-vote").click();
    }
    await until(async () => ((await results()).questions as { id: string }[])[0].id === bottom.id, "the voted question leads on the server", 8000);
    await until(async () => (await layer().locator(".qa-row").evaluateAll(els => els.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0]?.querySelector(".qa-text")?.textContent)) === bottom.text, "the TV moves it up", 8000);
    await until(async () => (await remote.getByText("Syncing").count()) > 0, "the remote shows Syncing", 8000);
    await shot(remote, "fail-06-m3-qa-remote-syncing");
    blocked = false;
    await until(async () => (await remote.getByText("Syncing").count()) === 0, "the remote corrects itself", 20000);
    await tv.unroute("**/api/tv/ack");
    // Corrected to what the TV shows: the same top question in the remote's mirror.
    await until(async () => (await remote.locator(".tv-mirror .qa-row .qa-text").first().textContent().catch(() => "")) !== null
      && (await remote.locator(".tv-mirror").innerText()).includes(bottom.text), "the remote's mirror shows the TV's top question", 8000);
    await remoteContext.close();
  });

  // ---------- FAIL-08 structured ----------
  await step("FAIL-08 Structured answers on a new phone: the person signs in elsewhere and sees their own pick, ranking, points, placement and signature", async () => {
    await live(sign, "sign");
    await ruth.ctx.close();
    const second = await phone(room.attendees[0]);
    const page = second.page;
    await until(async () => (await page.locator(".ph-banner").innerText().catch(() => "")).includes("Your earlier answers are here."), "a one-time line says so", 10000);
    await until(async () => await page.locator(".gfs-sig-shown").count() === 1, "her signature, not a fresh pad", 10000);
    await shot(page, "fail-08-m3-sign-new-phone");
    await goStep(page, "Where does each idea sit?");
    await until(async () => await page.locator(".gfs-pin").count() === 1, "her placement on the grid", 8000);
    await goStep(page, "Spend 100 points");
    await until(async () => (await page.getByRole("slider", { name: "Second campus", exact: true }).getAttribute("aria-valuenow")) === "100", "her 100 points", 8000);
    await goStep(page, "Rank these by what matters most");
    await until(async () => (await page.locator(".ph-opt.is-ranked .ph-opt-text").allInnerTexts()).join("|") === "Systems and data|Next generation", "her ranking", 8000);
    await goStep(page, "Where should our next season go?");
    await until(async () => (await page.getByRole("radio", { name: "Systems and data" }).getAttribute("aria-checked")) === "true", "her latest pick", 8000);
    assert.equal(await page.getByRole("radio", { name: "Next generation" }).getAttribute("aria-checked"), "false", "not the pick she changed");
    await shot(page, "fail-08-m3-choice-new-phone");
    ruth.ctx = second.ctx; ruth.page = page;
  });

  // ---------- FAIL-09 on the word cloud, wall and Q&A ----------
  const facContext = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  await facContext.addCookies(fac.cookies(app.origin));
  const control = await facContext.newPage(); await control.goto(`${app.origin}/control/${room.id}`);
  await control.locator(".ctl-app").waitFor({ timeout: 15000 });
  const panel = () => control.locator("[data-ai-panel]");
  const notice = async () => (await panel().locator("[data-ai-notice='warning']").innerText().catch(() => ""));
  const tvSays = async () => (await tv.locator("body").innerText()).toLowerCase();
  const sendText = async (page: Page, text: string) => {
    await page.locator("#ph-answer").waitFor({ timeout: 10000 });
    await page.fill("#ph-answer", text); await page.locator(".ph-send").click();
  };
  async function aiFails(label: string, kind: string, session: string, answer: (n: number) => Promise<void>, landed: (n: number) => Promise<boolean>, recover = false) {
    await live(session, kind);
    // Back on a step the room closed (Q&A, earlier), it is read-only until Reopen (live controls).
    if ((await sql.query("select state from public.sessions where id=$1", [session])).rows[0].state === "closed") await press(fac, sql, room.id, "reopen");
    await panel().waitFor({ timeout: 10000 });
    // AI slow: every answer still lands at once, in arrival order.
    fake({ delayMs: 9000 });
    for (let n = 0; n < 3; n++) { const t0 = Date.now(); await answer(n); await until(() => landed(n), `${label}: answer ${n + 1} lands while AI is slow`, 2000); if (!n) console.log(`  ${label}: phone send to TV with AI slow ${Date.now() - t0} ms`); }
    await until(async () => (await notice()).includes("AI is slow."), `${label}: the control surface says AI is slow`, 15000);
    assert.ok(!/slow|isn.t responding|failed|ai is/.test(await tvSays()), `${label}: the TV never says anything about AI`);
    await panel().scrollIntoViewIfNeeded(); await shot(control, `fail-09-m3-${kind}-slow-control`);
    // AI failing: the room carries on and the control surface says so.
    fake({ fail: true });
    for (let n = 3; n < 5; n++) { await answer(n); await until(() => landed(n), `${label}: answer ${n + 1} lands while AI fails`, 2000); }
    await until(async () => (await notice()).includes("AI isn't responding."), `${label}: the control surface says AI isn't responding`, 20000);
    assert.ok(!/slow|isn.t responding|failed|ai is/.test(await tvSays()), `${label}: the TV never says AI is failing`);
    await shot(control, `fail-09-m3-${kind}-failing-control`); await shot(tv, `fail-09-m3-${kind}-failing-tv`);
    fake({});
    // AI back: it catches up and the warning clears. Once is enough here (the AI kit checks the
    // wall too); it takes about 40 seconds, the worker's budget for the call that was failing.
    if (recover) {
      const t0 = Date.now(); await delay(10500);
      await answer(5); await until(() => landed(5), `${label}: answer 6 lands`, 2000);
      await until(async () => (await notice()) === "", `${label}: AI recovers after the cool-down`, 45000);
      console.log(`  ${label}: AI recovered ${Math.round((Date.now() - t0) / 1000)} s after it was back`);
    }
    assert.ok(await unchanged(), `${label}: the TV page never reloaded`);
  }
  const words = ["youth", "hope", "joy", "grace", "family", "unity", "prayer"];
  const tvWords = () => layer().locator(".tv-word:not(.is-going)").evaluateAll(els => els.map(e => e.textContent!.trim()));
  await step("FAIL-09 on the word cloud: AI slow, then failing, then back; every word still lands at once and only the control surface says so", async () => {
    // AI combines once there are about 30 different words (Default), so the room has 30 already.
    const thirty = ["momentum", "welcome", "music", "mission", "healing", "light", "peace", "kids", "students", "seniors", "serving", "outreach", "alpha", "worship", "freedom",
      "courage", "renewal", "harvest", "friendship", "love", "care", "trust", "community", "growth", "generosity", "discipleship", "baptisms", "families", "rest", "wonder"];
    await live(cloud, "word_cloud");
    for (let i = 0; i < 30; i += 5) await sendText(ruth.page, thirty.slice(i, i + 5).join(", "));
    await until(async () => ((await results()).words as unknown[]).length >= 30, "thirty different words on the server", 10000);
    await aiFails("word cloud", "word_cloud", cloud, n => sendText([ben.page, grace.page][n % 2], words[n]), async n => (await tvWords()).includes(words[n]), true);
  });
  const cards = ["Teenagers asking to be baptized", "Young families finding us online", "Small groups in homes again", "Volunteers who show up early", "Newcomers in a group within weeks", "Baptism class doubled"];
  await step("FAIL-09 on the wall: AI slow and then failing, every answer still lands at once in arrival order", async () => {
    await aiFails("wall", "wall", wall, n => sendText([ben.page, grace.page][n % 2], cards[n]),
      async n => (await layer().locator(".tv-feed-row, .ai-card").allTextContents()).includes(cards[n]));
    const feed = await layer().locator(".tv-feed-row").allTextContents();
    assert.deepEqual(feed.filter(t => cards.includes(t)), cards.slice(0, 5).reverse(), "newest first, in the order they arrived");
  });
  const questions = ["Can we talk about the budget today?", "What about the building?", "Who is on the board?", "When is the next survey?", "How do new families join?", "Where do volunteers sign up?"];
  await step("FAIL-09 on Q&A: AI slow and then failing, every question still lands at once and the count is the server's", async () => {
    await aiFails("Q&A", "qa", qa, async n => {
      const p = [ben.page, grace.page][n % 2]; await p.locator("#qa-question").waitFor({ timeout: 10000 });
      await p.fill("#qa-question", questions[n]); await p.locator(".qa-ask-form .ph-send").click();
    }, async n => ((await results()).questions as { text: string }[]).some(q => q.text === questions[n]) && (await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").then(v => v ?? "")).trim().startsWith(`${(await results()).total} questions from `));
  });

  // ---------- FAIL-10 with the new kinds ----------
  await step("FAIL-10 The run of show prints with every new kind's name, its prompt and the self-paced session's window", async () => {
    const print = await facContext.newPage(); await print.goto(`${app.origin}/setup/${room.id}/run-of-show/print`);
    const text = await print.locator("main").innerText();
    for (const want of ["Multiple choice · Live", "Ranking · Live", "100 points · Live", "2x2 grid · Live", "Sign together · Live", "Q&A · Live", "Word cloud · Live", "Open text · Live",
      "Statements · Self-paced", "Where should our next season go?", "Sign our shared commitment", "How true is each of these for us today?", "Before we meet", "If the tech fails"]) assert.ok(text.includes(want), `the print has: ${want}`);
    assert.match(text, /Opens [A-Z][a-z]{2} \d+.*Closes [A-Z][a-z]{2} \d+/, "the self-paced window");
    assert.doesNotMatch(text, /Content · Live.*Where should/, "a new kind is never printed as Content");
    if (process.env.KIT_SHOTS) await print.screenshot({ path: `${process.env.KIT_SHOTS}/fail-10-m3-print.png`, fullPage: true });
    await print.close();
  });
  await press(fac, sql, room.id, "nothing_live");

  await Promise.all([tvContext, facContext, ruth.ctx, ben.ctx, grace.ctx].map(c => c.close().catch(() => {})));
  rmSync(controlDir, { recursive: true, force: true });
}
