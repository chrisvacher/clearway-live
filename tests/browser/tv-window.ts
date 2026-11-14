// "Open the TV in a new window", in real browsers against the production build and the local stack. The facilitator clicks the
// button on Screens; the new window pairs itself, shows what the room is showing, stays paired on reload, cannot be paired again
// from the same link in another browser, and is listed on Screens and can be unpaired. The same for a Novetera engagement, whose
// window opens at the Novetera address and draws Novetera. Local only.
import assert from "node:assert/strict";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, startApp, until } from "./harness";

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox(), app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const step = async (name: string, run: () => Promise<void>) => { await run(); console.log(`ok · ${name}`); };
  try {
    await sql.connect(); browser = await chromium.launch();
    const expired = "That link has expired. Enter this code on Screens instead.";
    const run = async (skin: "clearway" | "novetera") => {
      const room = await engagement(sql, ["Ruth"]), fac = await facilitator(env, sql, room.id), expect = skin === "novetera" ? app.noveteraOrigin : app.origin;
      if (skin === "novetera") await sql.query("update public.engagements set skin='novetera' where id=$1", [room.id]);
      const shown = await fac.client.rpc("tv_manage", { p_engagement: room.id, p_action: "screen", p: { content: "join" } }); assert.equal(shown.data.status, "ok");
      const ctx: BrowserContext = await browser!.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addCookies(fac.cookies(app.origin));
      const opened: string[] = []; ctx.on("request", r => { if (/\/tv\?pair=/.test(r.url())) opened.push(r.url()); });
      const screens = await ctx.newPage(); await screens.goto(`${app.origin}/setup/${room.id}/tv`);
      let tv!: Page;
      await step(`${skin}: the button is the first action on Screens, above the code fields`, async () => {
        const button = screens.getByRole("button", { name: "Open the TV in a new window" }); assert.equal(await button.count(), 1); await button.waitFor({ state: "visible" });
        const top = (await button.boundingBox())!.y, code = (await screens.getByLabel("Code on the TV").boundingBox())!.y; assert.ok(top < code);
        assert.ok(await button.evaluate(el => el.getBoundingClientRect().height >= 43), "44px card action");
      });
      await step(`${skin}: one click opens the TV in a new window at the engagement's address and it pairs itself`, async () => {
        const popup = ctx.waitForEvent("page");
        await screens.getByRole("button", { name: "Open the TV in a new window" }).click(); tv = await popup;
        await until(() => opened.length > 0, "the link was opened");
        assert.ok(opened[0].startsWith(`${expect}/tv?pair=`), opened[0]);
        const root = tv.locator("main[data-surface=tv]");
        await until(async () => (await root.getAttribute("data-join")) === "on", "paired and showing the join screen", 20000);
        assert.equal(await root.getAttribute("data-skin"), skin);
        await until(() => new URL(tv.url()).search === "", "the link is gone from the address bar");
        assert.equal(new URL(tv.url()).pathname, "/tv");
      });
      await step(`${skin}: Screens lists the window as This laptop`, async () => {
        await screens.goto(`${app.origin}/setup/${room.id}/tv`);
        await screens.locator(".tv-screen-list strong", { hasText: "This laptop" }).waitFor();
        const list = await sql.query("select label, engagement_id from private.tv_devices where engagement_id=$1 and not deleted", [room.id]);
        assert.deepEqual(list.rows.map(r => r.label), ["This laptop"]);
      });
      await step(`${skin}: a reload stays paired`, async () => {
        await tv.reload(); const root = tv.locator("main[data-surface=tv]");
        await until(async () => (await root.getAttribute("data-join")) === "on", "still paired after a reload", 20000);
        assert.equal(await tv.locator(".tv-scene.tv-pair.is-active").count(), 0);
      });
      await step(`${skin}: the same link in a fresh browser gets the pairing screen and the expired line`, async () => {
        const other = await browser!.newContext({ viewport: { width: 1920, height: 1080 } }), page = await other.newPage();
        await page.goto(opened[0]);
        await page.getByText(expired).waitFor({ timeout: 20000 });
        assert.match((await page.locator(".tv-code").getAttribute("aria-label")) ?? "", /Pairing code \d \d \d \d \d \d/);
        assert.equal(new URL(page.url()).search, "", "the address bar is clean");
        assert.equal(await page.locator("main[data-surface=tv]").getAttribute("data-join"), null);
        assert.equal((await sql.query("select count(*)::int n from private.tv_devices where engagement_id=$1 and not deleted", [room.id])).rows[0].n, 1, "nothing else was paired");
        await other.close();
      });
      await step(`${skin}: an ordinary TV page has no expired line`, async () => {
        const other = await browser!.newContext(), page = await other.newPage(); await page.goto(`${expect}/tv`);
        await page.locator(".tv-code").waitFor(); assert.equal(await page.getByText(expired).count(), 0); await other.close();
      });
      await step(`${skin}: Unpair works and the window goes back to the pairing screen`, async () => {
        screens.once("dialog", d => void d.accept());
        await screens.getByRole("button", { name: "Unpair" }).click();
        await screens.getByText("No screens paired yet.").waitFor();
        await until(async () => (await tv.locator(".tv-scene.tv-pair.is-active").count()) === 1, "the window shows its pairing screen", 20000);
      });
      await ctx.close();
    };
    await run("clearway"); await run("novetera");
    await step("a second click on a paired laptop pairs a new window as This laptop again", async () => {
      const room = await engagement(sql, ["Ben"]), fac = await facilitator(env, sql, room.id);
      const ctx = await browser!.newContext(); await ctx.addCookies(fac.cookies(app.origin));
      const screens = await ctx.newPage(); await screens.goto(`${app.origin}/setup/${room.id}`);
      const popup = ctx.waitForEvent("page"); await screens.getByRole("button", { name: "Open the TV in a new window" }).click(); const tv = await popup;
      await until(async () => (await tv.locator("main[data-surface=tv]").getAttribute("data-screen")) !== null && (await sql.query("select 1 from private.live_tv_sessions where engagement_id=$1 and revoked_at is null", [room.id])).rowCount === 1, "paired from Overview", 20000);
      await ctx.close();
    });
  } finally { await browser?.close(); await sql.end(); await mail.close(); app.stop(); }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
