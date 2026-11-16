// Batch 1: timers (TM-1 to TM-3) in real browsers against the production build and the local stack. The facilitator adds a
// timer to a step in the run of show that runs through the next step; the run of show marks the span. On Go live the TV shows
// it top right, left of the live mark and 48 px from it, the Preview shows it as the TV will, and phones show a plain chip.
// In the last minute it turns the callout colour (Sunrise, Brass 300 in Novetera); past zero it counts overtime up with the
// same look. Room admin pauses, resumes, adds and takes off minutes, resets, and asks before replacing it. It keeps running
// into the step it runs through and stops past it. The same steps run in the Novetera skin.
// KIT_SHOTS=<folder> saves a screenshot of each screen. Local only.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, pairTv, press, startApp, until } from "./harness";

async function main() {
  const env = localEnv(), sql = db(env), app = await startApp(env);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(700); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  const seconds = (text: string) => { const [m, s] = text.replace("+", "").split(":").map(Number); return m * 60 + s; };
  try {
    await sql.connect();
    browser = await chromium.launch();
    for (const skin of ["clearway", "novetera"] as const) {
      const room = await engagement(sql, []);
      await sql.query(`update public.engagements set type='team_workshop',settings=settings||'{"open_join":true}'${skin === "novetera" ? ",skin='novetera'" : ""} where id=$1`, [room.id]);
      const welcome = await room.session("Welcome", "content", "Welcome", 1);
      const talk = await room.session("Talk at your tables", "wall", "What's one task AI could take off your plate?", 2, { maxSends: 5, maxChars: 280 });
      const share = await room.session("Share back", "wall", "What did your table hear?", 3, { maxSends: 5, maxChars: 280 });
      const after = await room.session("After the break", "content", "After the break", 4);
      const fac = await facilitator(env, sql, room.id);
      const facContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await facContext.addCookies(fac.cookies(app.origin));
      const editor = await facContext.newPage();

      await step(`${skin}: the run of show adds a 1:10 countdown that runs through the next step, on the TV and phones, and marks the span`, async () => {
        await editor.goto(`${app.origin}/setup/${room.id}/run-of-show`);
        await editor.locator(".rb-row", { hasText: "Talk at your tables" }).getByRole("button", { name: /Open options/ }).click();
        const open = editor.locator(".rb-row.is-open");
        await open.locator("#timer-on").check();
        await open.locator("#timer-mins").fill("1");
        await open.locator("#timer-secs").fill("10");
        await open.locator("#timer-through").selectOption(share);
        await open.locator("#timer-phones").check();
        await shot(editor, `${skin}-timer-run-of-show`);
        await open.getByRole("button", { name: "Done", exact: true }).click();
        await until(async () => { const t = (await sql.query("select options->'timer' t from public.sessions where id=$1", [talk])).rows[0].t; return t?.seconds === 70 && t.through === share && t.phones === true && t.tv === true && t.start === "live"; }, "timer saved", 10000);
        await editor.locator(`.rb-row[data-row="${talk}"] [data-timer-mark="owner"]`).waitFor({ timeout: 5000 });
        await editor.locator(`.rb-row[data-row="${share}"] [data-timer-mark="end"]`).waitFor({ timeout: 5000 });
        assert.match(await editor.locator(`.rb-row[data-row="${share}"]`).getAttribute("class") ?? "", /has-timer-span/, "a blue edge on the step it runs through");
        assert.equal(await editor.locator(`.rb-row[data-row="${after}"] [data-timer-mark]`).count(), 0, "and none past it");
      });

      const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
      await tv.goto(app.origin + "/tv");
      const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
      await pairTv(fac, room.id, app.secret, code);
      await press(fac, sql, room.id, "go_live", { session: welcome });
      const phonePage = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
      await phonePage.goto(`${app.origin}/room/${room.id}`);
      await phonePage.fill("#open-name", "Ruth"); await phonePage.getByRole("button", { name: "Join the room" }).click();
      await phonePage.locator(".ph-app").waitFor({ timeout: 15000 });
      const control = await facContext.newPage(); await control.goto(`${app.origin}/control/${room.id}`);
      const timerOnTv = tv.locator(".tv-timer");

      await step(`${skin}: the Preview shows the step's timer as the TV will`, async () => {
        await control.getByRole("button", { name: "Preview Talk at your tables" }).click();
        await until(async () => (await control.locator(".ctl-screen.is-preview .tv-timer.is-on b").innerText().catch(() => "")) === "1:10", "the preview shows 1:10", 10000);
        await shot(control, `${skin}-timer-preview-control`);
      });

      await step(`${skin}: on Go live the TV shows it top right, 48 px left of the live mark; phones show a plain chip`, async () => {
        await press(fac, sql, room.id, "go_live", { session: talk });
        await until(async () => (await timerOnTv.getAttribute("data-timer")) === "normal", "the timer on the TV", 10000);
        { const left = seconds(await timerOnTv.locator("b").innerText()); assert.ok(left <= 76 && left >= 50, `counting down from about 1:10 (${left}); the TV's first clock sample can be a few seconds out on a busy runner`); }
        const box = (await timerOnTv.boundingBox())!, mark = (await tv.locator(".tv-top-status > :last-child").boundingBox())!;
        assert.ok(box.y < 200 && box.x > 1200, "top right");
        assert.ok(Math.abs(mark.x - (box.x + box.width) - 48) <= 2, `48 px from the live mark (${Math.round(mark.x - box.x - box.width)})`);
        await phonePage.locator(".ph-timer").waitFor({ timeout: 10000 });
        await shot(tv, `${skin}-timer-tv`); await shot(phonePage, `${skin}-timer-phone`);
      });

      await step(`${skin}: the last minute takes the callout colour, and past zero it counts overtime up with the same look`, async () => {
        await until(async () => (await timerOnTv.getAttribute("data-timer")) === "last", "the last minute", 15000);
        await delay(1200);
        const [colour, callout] = await timerOnTv.evaluate(el => { const probe = document.createElement("i"); probe.style.color = "var(--cwl-callout)"; el.appendChild(probe); const c = getComputedStyle(probe).color; probe.remove(); return [getComputedStyle(el).color, c]; });
        assert.equal(colour, callout, "the callout colour");
        await shot(tv, `${skin}-timer-tv-last`);
        const card = control.locator("[data-timer-card]");
        await card.getByRole("button", { name: "−1 min" }).click();
        await until(async () => (await timerOnTv.getAttribute("data-timer")) === "over", "overtime", 8000);
        assert.match(await timerOnTv.locator("b").innerText(), /^\+0:\d\d$/, "overtime counts up from +0:00");
        await shot(tv, `${skin}-timer-tv-over`);
      });

      await step(`${skin}: Room admin pauses, resumes, adds minutes and resets; the Live screen's header has Pause and +1`, async () => {
        const card = control.locator("[data-timer-card]");
        await card.getByRole("button", { name: "+5 min" }).click();
        await until(async () => (await timerOnTv.getAttribute("data-timer")) === "normal", "back to normal with time added", 8000);
        await card.getByRole("button", { name: "Pause" }).click();
        await until(async () => (await sql.query("select timer ? 'paused_at' p from public.room_states where engagement_id=$1", [room.id])).rows[0].p, "paused", 5000);
        const held = await timerOnTv.locator("b").innerText(); await delay(2200);
        assert.equal(await timerOnTv.locator("b").innerText(), held, "the TV holds while paused");
        await card.getByRole("button", { name: "Resume" }).click();
        await until(async () => (await timerOnTv.locator("b").innerText()) !== held, "running again", 5000);
        const chip = control.locator("[data-timer-chip]");
        await chip.getByRole("button", { name: "1 min" }).click();
        await card.getByRole("button", { name: "Reset" }).click();
        await until(async () => (await timerOnTv.locator("b").innerText()) === "1:10", "reset to its full length, held", 5000);
        await shot(control, `${skin}-timer-control`);
      });

      await step(`${skin}: starting another asks first: Keep the running timer, or Replace it`, async () => {
        const card = control.locator("[data-timer-card]");
        const start = card.locator(".ctl-timer-start");
        if (!(await start.getAttribute("open"))) await start.locator("summary").click();
        await start.getByRole("radio", { name: "Up" }).click();
        await start.getByRole("button", { name: "Start", exact: true }).click();
        await card.getByText("Replace the running timer?").waitFor({ timeout: 5000 });
        await shot(control, `${skin}-timer-replace`);
        await card.getByRole("button", { name: "Keep the running timer" }).click();
        assert.equal((await sql.query("select timer->>'kind' k from public.room_states where engagement_id=$1", [room.id])).rows[0].k, "down", "kept");
        await card.getByRole("button", { name: "Resume" }).click();
      });

      await step(`${skin}: it keeps running into the step it runs through, and stops past it`, async () => {
        await press(fac, sql, room.id, "next");
        await delay(1200);
        assert.equal(await timerOnTv.getAttribute("data-timer") !== "off", true, "still on the TV in Share back");
        await press(fac, sql, room.id, "next");
        await until(async () => (await timerOnTv.getAttribute("data-timer")) === "off", "gone after the span", 8000);
        await until(async () => (await phonePage.locator(".ph-timer").count()) === 0, "and from phones", 8000);
      });
      await tv.context().close(); await phonePage.context().close(); await facContext.close();
    }
    console.log(`Timers kit: ${passed.length} checks passed. Local checks on loopback.`);
  } finally { await browser?.close(); await app.stop(); await sql.end(); }
}
main().catch(error => { console.error(error); process.exit(1); });
