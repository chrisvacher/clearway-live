// The failure kit, extended to milestone 5's surfaces (step 4). tests/browser/failures.ts runs these checks after
// milestone 4's (`npm run test:browser`), in the same browser, against the same production build and local stack, with
// the scripted fake AI model (never the API). Each check breaks something on purpose and proves the room recovers the
// way the PRD says:
//   FAIL-03 the scribe goes offline: a quote, a decision, a read-back correction, an easel photo and a tension are saved
//     on the laptop in the order made with their ids, nothing reaches the server, then they sync in that order, once each,
//     even when the first response is lost and it is sent again, and the control surface shows them arriving;
//   FAIL-02 the TV holding its last read-back item while a correction folds in and the room moves on, then catching up;
//   FAIL-09 AI slow and failing on `fold_read_back` (a correction that names no line) and on the overnight drafts
//     (late, then failed, with the facilitators writing the draft by hand).
// KIT_SHOTS=<folder> saves each failure state. Local only: no real email, Team Hub or CORE.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import type { Browser, Page, WebSocketRoute } from "playwright";
import type pg from "pg";
import { easelPng } from "./easel";
import { controlFile } from "./failures-m3";
import { engagement, facilitator, mailbox, pairTv, press, startApp, until, type Env } from "./harness";

const fake = (value: { delayMs?: number; fail?: boolean }) => writeFileSync(controlFile, JSON.stringify(value));
type Kit = { env: Env; sql: pg.Client; mail: Awaited<ReturnType<typeof mailbox>>; app: Awaited<ReturnType<typeof startApp>>; browser: Browser;
  step: (name: string, run: () => Promise<void>) => Promise<void>; shot: (page: Page, name: string) => Promise<void> };

const signedOff = [
  ["We welcome every guest by name at the door.", "We eat together every week after the service.", "Leaders raise up the next leaders from within."],
  ["Our street knows us by name.", "We run the community supper.", "Neighbours ask us to pray with them."],
  ["Apprentice leaders serve beside every ministry lead.", "Every team has a coach.", "Leaders share the work."],
  ["Volunteers keep the Sunday rhythm.", "Every room is set before the doors open.", "The week has a steady beat."],
  ["Every person learns something new each month in a group.", "Teachers meet to share what they taught and learned.", "Children and adults learn side by side each week."],
];
type Info = { items: { id: string; label: string; state: string }[]; item: { id: string; heading: string; version: number; lines: { id: string; text: string }[] } | null;
  corrections: { id: string; state: string; wording: string; source: string; failure?: string }[]; ai?: { failing?: boolean } };

export async function milestone5Failures({ env, sql, mail, app, browser, step, shot }: Kit) {
  fake({});
  const room = await engagement(sql, ["Ruth", "Ben"]);
  await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [room.id]);
  const scribe = { id: randomUUID(), email: `sam-${randomUUID().slice(0, 6)}@example.org` };
  await sql.query("insert into public.attendees(id,engagement_id,name,email,room_role) values($1,$2,'Sam Scribe',$3,'scribe')", [scribe.id, room.id, scribe.email]);
  const fac = await facilitator(env, sql, room.id);
  const cookie = fac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
  const speaker = "Pat Alder";

  // The five lenses signed off on Day 1, then the Day 2 read-back step.
  for (const [at, lines] of signedOff.entries()) {
    const summary = (await sql.query("insert into private.lens_summaries(engagement_id,lens) values($1,$2) returning id", [room.id, at + 1])).rows[0].id as string;
    const version = (await sql.query("insert into private.lens_summary_versions(engagement_id,summary_id,version,author,shown_at) values($1,$2,1,'facilitator',now()) returning id", [room.id, summary])).rows[0].id as string;
    for (const [p, text] of lines.entries()) {
      const sentence = (await sql.query("insert into private.lens_summary_sentences(engagement_id,version_id,position,text) values($1,$2,$3,$4) returning id", [room.id, version, p, text])).rows[0].id as string;
      const source = (await sql.query("insert into private.lens_sentences(engagement_id,lens,source,text) values($1,$2,'live',$3) returning id", [room.id, at + 1, `Day 1 words for line ${p + 1}`])).rows[0].id as string;
      await sql.query("insert into private.lens_summary_sources(summary_sentence_id,lens_sentence_id,engagement_id) values($1,$2,$3)", [sentence, source, room.id]);
    }
    await sql.query("update private.lens_summaries set state='signed_off',current_version_id=$2,signed_off_version_id=$2 where id=$1", [summary, version]);
  }
  const rb = await room.session("Confirm the 10-year Future and outcomes", "read_back", "Did we hear you right?", 1, { maxSends: 60, maxChars: 280 });
  await sql.query("update public.sessions set part='Day 2', options='{\"ai\":true}'::jsonb where id=$1", [rb]);

  const info = async () => (await (await fetch(`${app.origin}/api/control/${room.id}/read-back`, { headers: { Cookie: cookie }, cache: "no-store" })).json()) as Info;
  const ctl = async (action: string, body: Record<string, unknown> = {}) => (await (await fetch(`${app.origin}/api/control/${room.id}/read-back`, { method: "POST",
    headers: { Cookie: cookie, Origin: app.origin, "Content-Type": "application/json" }, body: JSON.stringify({ id: randomUUID(), action, session: rb, ...body }) })).json()) as { status: string };
  const poke = () => fetch(`${app.origin}/api/control/${room.id}`, { headers: { Cookie: cookie }, cache: "no-store" }).catch(() => undefined);
  const count = async (t: string) => Number((await sql.query(`select count(*) from private.${t} where engagement_id=$1 and not deleted`, [room.id])).rows[0].count);

  const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tvSockets: WebSocketRoute[] = []; let tvCut = false;
  await tvContext.routeWebSocket(/\/realtime\/v1\/websocket/, ws => { if (tvCut) { ws.close(); return; } tvSockets.push(ws); ws.connectToServer(); });
  const tv = await tvContext.newPage(); await tv.goto(app.origin + "/tv");
  const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
  await pairTv(fac, room.id, app.secret, code, "Failure kit TV (milestone 5)");
  await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
  await tv.evaluate(() => { (window as unknown as { __kit5: number }).__kit5 = 1; });
  const unchanged = () => tv.evaluate(() => (window as unknown as { __kit5?: number }).__kit5 === 1);
  const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
  const tvLines = async () => (await layer().locator(".lsm-line:not(.is-gone) .lsm-text").allInnerTexts()).map(l => l.replace(/\s+/g, " ").trim());
  const tvSays = async () => (await tv.locator("body").innerText()).toLowerCase();
  await press(fac, sql, room.id, "go_live", { session: rb });
  await layer().locator("[data-read-back]").waitFor({ timeout: 15000 });
  await until(async () => (await info()).items?.length === 5, "five lens items", 10000);
  await delay(900);

  const facContext = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  await facContext.addCookies(fac.cookies(app.origin));
  const control = await facContext.newPage(); await control.goto(`${app.origin}/control/${room.id}`);
  await control.locator(".ctl-app").waitFor({ timeout: 15000 });

  // ---------- FAIL-03 ----------
  await step("FAIL-03 The scribe goes offline: a quote, a decision, a read-back correction, a photo and a tension keep their order and ids, then sync in order, once each, with the control surface showing them arrive", async () => {
    const scribeContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await scribeContext.newPage(); await page.goto(`${app.origin}/room/${room.id}`);
    const before = mail.count;
    await page.fill("#room-email", scribe.email); await page.getByRole("button", { name: "Send me a sign-in code" }).click();
    await page.fill("#room-code", await mail.code(scribe.email, before)); await page.getByRole("button", { name: "Sign in" }).click();
    await page.locator("[data-testid=scribe-console]").waitFor({ timeout: 20000 });
    await page.locator("[data-testid=correction-composer]").waitFor({ timeout: 20000 });
    const capture = async (kind: string, text: string, extra: Record<string, string> = {}) => {
      await page.locator(".scr-tag", { hasText: kind }).click();
      await page.fill("#scr-text", text);
      for (const [id, value] of Object.entries(extra)) await page.fill(`#${id}`, value);
      await page.locator("#scr-text").press("Enter");
    };
    const quote = "Offline quote: our doors are open and our table is long.", decision = "Offline decision: we meet monthly.", tension = "Offline tension: stay small or grow.", wording = "We pray for our neighbours by name.";
    await scribeContext.setOffline(true);
    await page.locator("[data-testid=scribe-queue]").waitFor({ timeout: 10000 });
    await capture("Quote", quote, { "scr-who": speaker });
    await capture("Decision", decision, { "scr-why": "Weekly was too much" });
    await page.selectOption("#scr-cr-line", "new");
    await page.fill("#scr-cr-wording", wording); await page.fill("#scr-cr-reason", "Said by two people at the table");
    await page.locator("[data-testid=correction-send]").click();
    await page.locator("input[aria-label='Choose files to upload']").setInputFiles({ name: "easel-offline.png", mimeType: "image/png", buffer: easelPng() });
    await capture("Tension", tension, { "scr-view1": "Stay small and close", "scr-view2": "Reach new families" });
    const key = `cw-scribe-outbox-${room.id}`;
    const outbox = () => page.evaluate(k => (JSON.parse(localStorage.getItem(k) || "[]") as { item: { type: string; id: string }; state: string }[]).map(e => ({ type: e.item.type, id: e.item.id, state: e.state })), key);
    await until(async () => (await outbox()).length === 5, "five items saved on the laptop", 10000);
    const made = await outbox();
    assert.deepEqual(made.map(e => e.type), ["capture", "capture", "correction", "file", "capture"], "saved in the order made");
    assert.equal(new Set(made.map(e => e.id)).size, 5, "each with an id of its own, made on the laptop");
    await until(async () => Number(await page.locator("[data-testid=scribe-queue] .n").innerText()) >= 5, "the queue counts what is waiting", 5000);
    assert.match(await page.locator("[data-testid=scribe-cards]").innerText(), /Saved on this laptop/);
    await delay(1800);
    assert.deepEqual([await count("scribe_cards"), await count("read_back_corrections"), await count("scribe_files")], [0, 0, 0], "nothing reached the server while offline");
    await shot(page, "fail-03-m5-scribe-offline");
    // The first card reaches the server, but its answer is lost on the way back: the laptop sends it again with the same id.
    let lost = 0;
    await scribeContext.route(/\/api\/scribe\/[0-9a-f-]+$/, async route => {
      if (route.request().method() === "POST" && lost === 0) { lost++; await route.fetch(); await route.abort("connectionreset"); } else await route.continue();
    });
    await scribeContext.setOffline(false);
    const back = Date.now();
    await until(async () => (await count("scribe_cards")) === 3 && (await count("read_back_corrections")) === 1 && (await sql.query("select 1 from private.scribe_files where engagement_id=$1 and not deleted and uploaded_at is not null", [room.id])).rowCount === 1, "everything arrives", 40000);
    console.log(`  scribe outbox of five synced ${Date.now() - back} ms after the network returned (one response lost on purpose)`);
    assert.equal(lost, 1, "the first answer was lost and the card was sent again");
    // In the order made, with the ids made on the laptop.
    const cards = (await sql.query("select id,text,received_at from private.scribe_cards where engagement_id=$1 and not deleted order by received_at", [room.id])).rows;
    const correction = (await sql.query("select id,created_at from private.read_back_corrections where engagement_id=$1 and not deleted", [room.id])).rows[0];
    const file = (await sql.query("select id,received_at,queued_at from private.scribe_files where engagement_id=$1 and not deleted", [room.id])).rows[0];
    const arrived = [...cards.map(c => ({ id: c.id as string, at: (c.received_at as Date).getTime() })), { id: correction.id as string, at: (correction.created_at as Date).getTime() }, { id: file.id as string, at: (file.received_at as Date).getTime() }].sort((a, b) => a.at - b.at).map(a => a.id);
    assert.deepEqual(arrived, made.map(e => e.id), "the server received them in the order made, under the ids made on the laptop");
    assert.deepEqual(cards.map(c => c.text), [quote, decision, tension]);
    assert.ok(file.queued_at, "the photo knows it waited");
    assert.equal((await sql.query("select count(*) - count(distinct id) as d from private.scribe_cards where engagement_id=$1", [room.id])).rows[0].d, "0", "no card twice");
    await until(async () => (await outbox()).length === 0 && (await page.locator("[data-testid=scribe-cards] .scr-card.is-queued").count()) === 0, "the outbox is empty", 15000);
    // A replay of what the server already holds is a duplicate, never a second card or correction.
    const itemId = (await info()).item!.id;
    const replay = [
      await page.evaluate(async ({ id, card, session }) => (await (await fetch(`/api/scribe/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "capture", id: card, session, kind: "quote",
        text: "Offline quote: our doors are open and our table is long.", detail: {}, speaker: "", capturedAt: new Date().toISOString() }) })).json()).status as string, { id: room.id, card: made[0].id, session: rb }),
      await page.evaluate(async ({ id, c, item }) => (await (await fetch(`/api/scribe/${id}/read-back`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c, item, line: "new",
        wording: "We pray for our neighbours by name.", reason: "Said by two people at the table" }) })).json()).status as string, { id: room.id, c: made[2].id, item: itemId }),
    ];
    assert.deepEqual(replay, ["duplicate", "duplicate"], "a replay is a duplicate");
    assert.deepEqual([await count("scribe_cards"), await count("read_back_corrections"), await count("scribe_files")], [3, 1, 1], "still one of each");
    // The control surface shows them arriving.
    const feed = control.locator("[data-testid=scribe-feed]");
    await until(async () => (await feed.locator(".scr-card").count()) >= 3, "the cards are in the feed", 15000);
    await feed.locator("img").first().waitFor({ timeout: 15000 });
    await control.locator(`[data-correction="${made[2].id}"]`).waitFor({ timeout: 15000 });
    assert.match(await control.locator(`[data-correction="${made[2].id}"] [data-correction-reason]`).innerText(), /two people at the table/, "the scribe's reason is in the queue");
    assert.ok(!(await feed.innerText()).includes(speaker), "and no speaker is in the feed");
    assert.ok(!(await tv.locator("body").innerText()).includes("Offline quote"), "nothing from the scribe reached the TV");
    await shot(control, "fail-03-m5-control-after-sync");
    await shot(page, "fail-03-m5-scribe-synced");
    await scribeContext.close();
  });

  // ---------- FAIL-02 on a read-back item ----------
  await step("FAIL-02 on the read-back: the TV holds its item with Reconnecting while a correction folds in and the room moves on, then catches up within 3 seconds", async () => {
    const shown = await tvLines(), heading = await layer().locator(".rbk-h").innerText();
    tvCut = true; tvSockets.splice(0).forEach(ws => ws.close()); await tvContext.setOffline(true);
    await until(async () => await tv.locator(".tv-reconnecting.is-on").count() === 1, "Reconnecting mark", 12000);
    const queued = (await info()).corrections.find(c => c.state === "queued" && c.source !== "facilitator")!;
    assert.ok(queued, "the scribe's correction is waiting");
    assert.equal((await ctl("accept", { correction: queued.id, line: "new" })).status, "ok");
    assert.equal((await ctl("show", { to: "next" })).status, "ok");
    const server = await info();
    assert.match(server.item!.heading, /Community/, "the room has moved on to the next item");
    await delay(1500);
    assert.deepEqual(await tvLines(), shown, "the TV keeps the item it had, never blank");
    assert.equal((await layer().locator(".rbk-h").innerText()), heading);
    await shot(tv, "fail-02-m5-read-back-reconnecting");
    const back = Date.now(); tvCut = false; await tvContext.setOffline(false);
    await until(async () => (await tvLines()).join("|") === server.item!.lines.map(l => l.text).join("|"), "the TV shows the server's item", 5000);
    const ms = Date.now() - back;
    await until(async () => await tv.locator(".tv-reconnecting.is-on").count() === 0, "Reconnecting mark clears", 5000);
    assert.ok(ms < 3000, `current item within 3 seconds of the network returning (${ms} ms)`);
    assert.ok(await unchanged(), "the TV page never reloaded");
    console.log(`  read-back item caught up ${ms} ms after the network returned`);
    const v1 = (await sql.query("select count(*)::int n from private.read_back_versions v join private.read_back_items i on i.id=v.item_id where i.engagement_id=$1 and not v.deleted", [room.id])).rows[0].n;
    assert.ok(v1 >= 6, `the first item folded a new version (${v1} versions across the items)`);
  });

  // ---------- FAIL-09 on fold_read_back ----------
  await step("FAIL-09 on fold_read_back: with AI slow the TV keeps its words until the fold lands, with AI failing the correction waits for the facilitator to name the line, and the TV never mentions AI", async () => {
    await ctl("show", { to: "prev" });
    await until(async () => (await info()).item?.heading.includes("Congregation"), "back on the first item", 8000);
    await until(async () => (await tvLines()).length === 4, "the TV shows the four lines", 8000);
    const before = await tvLines(), item0 = (await info()).item!;
    fake({ delayMs: 9000 });
    const slow = "Every guest is welcomed by name at the door.";
    assert.equal((await ctl("correct", { line: "", wording: slow, reason: "Guests, not strangers" })).status, "ok");
    const slowId = await until(async () => (await info()).corrections.find(c => c.wording === slow && c.state === "queued")?.id, "the correction is queued", 8000);
    const t0 = Date.now();
    assert.equal((await ctl("accept", { correction: slowId, line: "" })).status, "ok", "accepting is never held up by AI");
    assert.ok(Date.now() - t0 < 2500, `Accept answered at once (${Date.now() - t0} ms)`);
    await until(async () => (await info()).corrections.find(c => c.id === slowId)?.state === "folding", "the correction says AI is folding it in", 8000);
    await delay(2500);
    assert.deepEqual(await tvLines(), before, "the TV keeps its words while AI is slow");
    assert.ok(!/\bai\b|slow|isn.t responding|failed|folding/.test(await tvSays()), "the TV never says anything about AI");
    await shot(control, "fail-09-m5-fold-slow-control");
    await until(async () => { await poke(); return (await info()).item?.version === item0.version + 1; }, "the slow fold lands", 40000);
    await until(async () => (await tvLines()).includes(slow), "and reaches the TV", 8000);
    // Failing: the correction is left for the facilitator, and the room carries on.
    fake({ fail: true });
    const hard = "Every neighbour is invited to the Sunday meal.";
    assert.equal((await ctl("correct", { line: "", wording: hard, reason: "The room said neighbours" })).status, "ok");
    const hardId = await until(async () => (await info()).corrections.find(c => c.wording === hard && c.state === "queued")?.id, "the second correction is queued", 8000);
    const onTv = await tvLines();
    assert.equal((await ctl("accept", { correction: hardId, line: "" })).status, "ok");
    await until(async () => { await poke(); return (await info()).corrections.find(c => c.id === hardId)?.state === "failed"; }, "the fold failed and the correction is waiting", 60000);
    assert.deepEqual(await tvLines(), onTv, "the TV is unchanged by the failed fold");
    assert.ok(!/\bai\b|slow|isn.t responding|failed|folding/.test(await tvSays()), "the TV never says AI is failing");
    await control.reload(); await control.locator(`[data-correction="${hardId}"]`).waitFor({ timeout: 15000 });
    assert.match(await control.locator(`[data-correction="${hardId}"] .show-message`).innerText(), /Pick the line|name the line|could not/i, "the control surface says to name the line");
    await control.locator(`[data-correction="${hardId}"]`).scrollIntoViewIfNeeded();
    await shot(control, "fail-09-m5-fold-failing-control"); await shot(tv, "fail-09-m5-fold-failing-tv");
    // The facilitator names the line, so it folds in code with no AI.
    const lineId = (await info()).item!.lines[1].id;
    assert.equal((await ctl("accept", { correction: hardId, line: lineId })).status, "ok");
    await until(async () => (await tvLines()).includes(hard), "naming the line folds it in without AI", 10000);
    fake({});
    assert.ok(await unchanged(), "the TV page never reloaded");
  });

  // ---------- FAIL-09 on the overnight drafts ----------
  const day1 = async (title: string) => {
    const made = await engagement(sql, ["Priya"]);
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [made.id]);
    const sScribe = randomUUID();
    await sql.query("insert into public.attendees(id,engagement_id,name,email,room_role) values($1,$2,'Rae Scribe',$3,'scribe')", [sScribe, made.id, `rae-${randomUUID().slice(0, 6)}@example.org`]);
    const liveStep = await made.session(title, "wall", "What could go wrong?", 1);
    for (const [i, [name, bullets]] of ([["Leaders raised from within", ["leaders grow here and lead here", "a few deep partnerships with the city"]], ["Families find a home here", ["kids and parents belong"]], ["A church that shows up", []]] as [string, string[]][]).entries()) {
      const id = randomUUID();
      await sql.query("insert into private.vision_outcomes(id,engagement_id,title,status,position) values($1,$2,$3,'provisional',$4)", [id, made.id, name, i]);
      for (const [j, text] of bullets.entries()) await sql.query("insert into private.outcome_indicators(id,engagement_id,outcome_id,text,position) values($1,$2,$3,$4,$5)", [randomUUID(), made.id, id, text, j]);
    }
    for (const [kind, text] of [["quote", "If we weren't here, the city would notice."], ["decision", "A few deep partnerships, not many shallow ones."]]) {
      await sql.query("insert into private.scribe_cards(id,engagement_id,session_id,kind,text,speaker,attendee_id,captured_at) values($1,$2,$3,$4,$5,null,$6,now())", [randomUUID(), made.id, liveStep, kind, text, sScribe]);
    }
    const lead = await facilitator(env, sql, made.id);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies(lead.cookies(app.origin));
    return { made, lead, context, liveStep };
  };
  await step("FAIL-09 on the overnight drafts, slow: past 30 minutes the review says so and offers Write it by hand, and the late draft still lands", async () => {
    fake({ delayMs: 9000 });
    const { made, lead, context, liveStep } = await day1("Pre-mortem");
    const page = await context.newPage();
    await press(lead, sql, made.id, "go_live", { session: liveStep });
    await press(lead, sql, made.id, "close_part", { part: "Day 1" });
    await until(async () => (await sql.query("select 1 from private.overnight_rounds where engagement_id=$1", [made.id])).rowCount, "a round opens", 10000);
    await sql.query("update private.overnight_rounds set day_closed_at=now()-interval '31 minutes' where engagement_id=$1", [made.id]);
    await page.goto(`${app.origin}/control/${made.id}`);
    await page.goto(`${app.origin}/control/${made.id}/review`);
    await page.locator("[data-testid=ovn-progress]").waitFor({ timeout: 20000 });
    await page.locator("[data-testid=ovn-slow]").waitFor({ timeout: 10000 });
    assert.match(await page.locator("[data-testid=ovn-slow]").innerText(), /longer than 30 minutes/);
    assert.equal(await page.getByRole("button", { name: "Write it by hand instead" }).isVisible(), true, "the facilitators can start writing at once");
    await shot(page, "fail-09-m5-overnight-slow");
    await until(async () => { await poke(); return (await sql.query("select status from private.overnight_rounds where engagement_id=$1", [made.id])).rows[0]?.status === "ready"; }, "the late draft lands", 60000);
    await page.reload();
    await until(async () => (await page.locator("[data-testid=ovn-row]").count()) === 3, "the three outcomes are drafted", 15000);
    assert.equal(await page.locator("[data-testid=ovn-slow]").count(), 0, "the warning clears");
    await context.close(); fake({});
  });
  await step("FAIL-09 on the overnight drafts, failing: the review says the draft hit a problem, then the facilitators write the draft by hand", async () => {
    fake({ fail: true });
    const { made, lead, context, liveStep } = await day1("Pre-mortem");
    const page = await context.newPage();
    await press(lead, sql, made.id, "go_live", { session: liveStep });
    await press(lead, sql, made.id, "close_part", { part: "Day 1" });
    await page.goto(`${app.origin}/control/${made.id}`);
    await page.goto(`${app.origin}/control/${made.id}/review`);
    await until(async () => (await page.locator("[data-testid=ovn-retry], [data-testid=ovn-failed]").count()) > 0, "the review says the draft hit a problem", 60000);
    await shot(page, "fail-09-m5-overnight-failing");
    await page.getByRole("button", { name: "Write it by hand instead" }).click();
    await until(async () => (await sql.query("select count(*)::int c from private.draft_outcomes where engagement_id=$1 and tidy='by_hand'", [made.id])).rows[0].c > 0, "the outcomes are by hand", 15000);
    await page.locator("[data-testid=ovn-row]").first().click();
    await page.locator("[data-testid=ovn-outcome]").waitFor();
    await until(async () => await page.getByRole("button", { name: "Edit" }).count() + await page.getByRole("button", { name: /Add a bullet|Add/ }).count() > 0, "the facilitator can write the draft", 15000);
    await shot(page, "fail-09-m5-overnight-by-hand");
    await context.close(); fake({});
  });
  await press(fac, sql, room.id, "nothing_live");
  await Promise.all([tvContext, facContext].map(c => c.close().catch(() => {})));
}
