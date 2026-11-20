// Batch 1: the image loop (LP-1) and a loop as Home, in real browsers against the production build and the local stack with
// Storage. The facilitator builds a Walk-in loop in the run of show (three images, 3 seconds each, a slide), turns on Use as the
// Home screen, and the paired TV shows it on Home with the header covered, moving to the next image on time with no blank moment.
// Slide images are for the TV only (November 19): a signed-in phone at 390 wide shows the waiting message without the loop, a
// phone that hasn't joined sees the join form on its own, and neither asks for an image. The Live room says which image is up
// and when the next comes. Cut and reduced motion cut. The loop also runs as a live step, the
// Preview draws it as the TV does, and the Screens page puts Home back to the holding screen. The same steps run in Novetera.
// KIT_SHOTS=<folder> saves a screenshot of each screen. Local only.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";
import { watchStage } from "./image-watch";

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(900); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    assert.equal((await sql.query("select private.engagement_images_setup() as s")).rows[0].s, "ready", "Storage is running, so the image bucket can be made");
    browser = await chromium.launch();
    const picture = async (title: string, colour: string, w = 1920, h = 1080) => {
      const page = await browser!.newPage({ viewport: { width: w, height: h } });
      await page.setContent(`<body style="margin:0"><div style="width:${w}px;height:${h}px;background:${colour};font:600 ${Math.round(h * 0.1)}px Georgia;color:#FBFAF7;display:grid;place-items:center">${title}</div></body>`);
      const png = await page.screenshot({ type: "png" }); await page.close(); return png;
    };
    const pictures = [await picture("Welcome", "#2F6F6A"), await picture("Wi-Fi: Guest", "#8A4B2A", 1440, 1080), await picture("Join on your phone", "#2B3A67")];

    for (const skin of ["clearway", "novetera"] as const) {
      const room = await engagement(sql, ["Ruth"]);
      if (skin === "novetera") await sql.query("update public.engagements set skin='novetera' where id=$1", [room.id]);
      const walkIn = await room.session("Walk-in loop", "content", "", 1);
      await sql.query(`update public.sessions set options='{"screen":"loop"}' where id=$1`, [walkIn]);
      await room.session("Why we are here", "content", "Three things we will **build together**", 2);
      const fac = await facilitator(env, sql, room.id);
      const facContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await facContext.addCookies(fac.cookies(app.origin));
      const editor = await facContext.newPage();

      await step(`${skin}: the run of show builds a loop: three images in order, seconds per image, a transition, and Use as the Home screen`, async () => {
        await editor.goto(`${app.origin}/admin/${room.id}/run-of-show`);
        await editor.locator(".rb-row", { hasText: "Walk-in loop" }).getByRole("button", { name: /Open options/ }).click();
        const open = editor.locator(".rb-settings");
        await open.locator("#loop-file").setInputFiles(pictures.map((buffer, i) => ({ name: `Loop${i + 1}.png`, mimeType: "image/png", buffer })));
        await until(async () => await open.locator(".loop-item").count() === 3, "three images in the loop", 30000);
        assert.match(await open.locator(".loop-item").nth(1).innerText(), /Letterboxed/, "the 4:3 image says it will be letterboxed");
        await open.getByRole("button", { name: "Move Loop3.png earlier" }).click();
        await open.getByRole("button", { name: "Move Loop3.png later" }).click();
        await open.locator("#loop-seconds").selectOption("3");
        assert.match(await open.innerText(), /3 images, 9 seconds a turn/);
        await open.getByRole("radio", { name: "Slide" }).click();
        await shot(editor, `${skin}-loop-run-of-show`);
        await until(async () => { const o = (await sql.query("select options from public.sessions where id=$1", [walkIn])).rows[0].options; return o.images?.length === 3 && o.seconds === 3 && o.transition === "slide"; }, "loop saved", 10000);
        await editor.locator(".rb-row", { hasText: "Walk-in loop" }).getByRole("button", { name: /Open options/ }).click();
        await editor.locator(".rb-settings").getByRole("switch", { name: "Use as the Home screen" }).click();
        await until(async () => (await sql.query("select settings->>'home_session' h from public.engagements where id=$1", [room.id])).rows[0].h === walkIn, "Home set", 10000);
        await editor.locator(".rb-row", { hasText: "Walk-in loop" }).locator(".rb-chip", { hasText: "Home screen" }).waitFor({ timeout: 5000 });
        await editor.locator(".rb-row", { hasText: "Walk-in loop" }).locator(".rb-chip", { hasText: "3 images · 3s" }).waitFor({ timeout: 5000 });
      });

      const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
      await tv.goto(app.origin + "/tv");
      const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
      await pairTv(fac, room.id, app.secret, code);
      const stageImg = () => tv.locator(".tv-imgstage.is-active .tv-img-layer:not(.is-leaving) img");
      const loaded = (img: ReturnType<Page["locator"]>) => until(async () => await img.evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0).catch(() => false), "image loads", 15000);
      const tvIndex = async () => Number(await tv.locator(".tv-imgstage").getAttribute("data-image-index"));

      await step(`${skin}: Home on the TV is the loop, covering the header, moving on every 3 seconds with no blank moment`, async () => {
        await loaded(stageImg());
        assert.equal(await tv.locator(".tv-imgstage").getAttribute("data-image-stage"), "on");
        await shot(tv, `${skin}-loop-home-tv`);
        const first = await tvIndex();
        const watch = await watchStage(tv);
        await until(async () => (await tvIndex()) !== first, "the next image", 5000);
        await delay(1200);
        const seen = await watch.stop();
        assert.ok(seen.frames > 20, "frames were sampled");
        assert.ok(seen.min > 0.98, `the stage never dims (lowest ${seen.min})`);
        assert.ok(seen.cover > 0.98, `an image always covers the stage during the slide (lowest ${seen.cover})`);
        assert.ok(await tv.locator(".tv-img-layer.is-slide").count() >= 1, "the slide transition is used");
      });

      const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      // Every image or signed Storage address a phone asks for, and every Home poll. Phones ask for none.
      const asked: string[] = [];
      phoneContext.on("request", r => { if (/\/api\/(images|media)\/|\/storage\/v1\/object\/|\/api\/room\/[^/]+\/home/.test(r.url())) asked.push(r.url()); });
      const joining = await phoneContext.newPage(); await joining.goto(`${app.origin}/room/${room.id}`);
      await step(`${skin}: a phone that hasn't joined sees the join form on its own, with no Home image`, async () => {
        await joining.locator("#room-email").waitFor({ timeout: 15000 });
        await delay(1500);
        assert.equal(await joining.locator("img").count(), 0, "no image above the join form");
        assert.equal(await joining.locator(".join-home, .ph-loop").count(), 0);
        await shot(joining, `${skin}-loop-home-joining`);
      });

      const phone = await phoneContext.newPage(); await phone.goto(`${app.origin}/room/${room.id}`);
      const before = mail.count; await phone.fill("#room-email", room.attendees[0].email); await phone.getByRole("button", { name: "Send me a sign-in code" }).click();
      await phone.fill("#room-code", await mail.code(room.attendees[0].email, before)); await phone.getByRole("button", { name: "Sign in" }).click();
      await phone.locator(".ph-app").waitFor({ timeout: 15000 });

      await step(`${skin}: a signed-in phone shows the waiting message without the loop image`, async () => {
        await until(async () => /You’re in, Ruth/.test(await phone.locator(".ph-waiting").innerText().catch(() => "")), "the waiting message", 10000);
        // Through a change of image on the TV, the phone draws none.
        const first = await tvIndex();
        await until(async () => (await tvIndex()) !== first, "the TV moves on", 5000);
        assert.equal(await phone.locator(".ph-body img, .ph-loop").count(), 0, "no loop image on the phone");
        await shot(phone, `${skin}-loop-home-phone`);
      });

      await step(`${skin}: the Live room names the Home loop, which image is up and when the next comes`, async () => {
        const control = await facContext.newPage(); await control.goto(`${app.origin}/control/${room.id}`);
        const line = control.locator("[data-loop-line]");
        await line.waitFor({ timeout: 15000 });
        assert.match(await line.innerText(), /Home: Walk-in loop/);
        assert.match(await line.innerText(), /Image [123] of 3 · next in [123]s/);
        await shot(control, `${skin}-loop-live-room`);
        await control.close();
      });

      await step(`${skin}: cut, and reduced motion, change images in one frame`, async () => {
        await sql.query(`update public.sessions set options=jsonb_set(options,'{transition}','"cut"') where id=$1`, [walkIn]);
        await until(async () => await tv.locator(".tv-img-layer.is-cut").count() >= 1, "cut", 8000);
        await sql.query(`update public.sessions set options=jsonb_set(options,'{transition}','"fade"') where id=$1`, [walkIn]);
        await sql.query(`update public.engagements set settings=settings||'{"reduced_motion":true}' where id=$1`, [room.id]);
        await until(async () => { const i = await tvIndex(); await until(async () => (await tvIndex()) !== i, "next", 5000); return await tv.locator(".tv-img-layer:not(.is-leaving).is-cut").count() >= 1; }, "reduced motion cuts", 12000);
        await sql.query(`update public.engagements set settings=settings||'{"reduced_motion":false}' where id=$1`, [room.id]);
      });

      await step(`${skin}: the Preview draws the loop as the TV will; it runs as a live step too, and joining phones lose it when Home goes`, async () => {
        const control = await facContext.newPage(); await control.goto(`${app.origin}/control/${room.id}`);
        await control.getByRole("button", { name: "Choose Walk-in loop" }).click();
        await loaded(control.locator(".ctl-screen.is-preview .tv-imgstage.is-active .tv-img-layer:not(.is-leaving) img"));
        await shot(control, `${skin}-loop-preview-control`);
        await control.close();
        await press(fac, sql, room.id, "go_live", { session: walkIn });
        await loaded(stageImg());
        assert.equal(await tv.locator(".tv-imgstage").getAttribute("data-image-stage"), "on");
        await until(async () => (await phone.locator(".ph-body").innerText()).includes("Watch the screen. Your phone will wake when we start."), "the loop step's waiting line on the phone", 10000);
        assert.equal(await phone.locator(".ph-body img, .ph-loop").count(), 0, "no loop image on the phone");
        await shot(phone, `${skin}-loop-step-phone`);
        // The Home address for joining phones is gone, and the image route no longer serves joining phones.
        assert.equal((await fetch(`${app.origin}/api/room/${room.id}/home`)).status, 405, "no Home address for joining phones");
        const first = (await sql.query("select options->'images'->>0 as id from public.sessions where id=$1", [walkIn])).rows[0].id as string;
        assert.equal((await fetch(`${app.origin}/api/images/${room.id}/${first}?surface=join`, { redirect: "manual" })).status, 404, "no image for a joining phone");
        assert.deepEqual(asked, [], "no phone asked for an image, a signed address or Home");
        const ids = (await sql.query("select id from public.sessions where engagement_id=$1 and title='Why we are here'", [room.id])).rows[0].id;
        await press(fac, sql, room.id, "go_live", { session: ids });
        await until(async () => await tv.locator(".tv-imgstage").getAttribute("data-image-stage") === "off", "a headline takes the screen back", 8000);
      });

      await step(`${skin}: the Screens page puts Home back to the holding screen`, async () => {
        await press(fac, sql, room.id, "nothing_live");
        await until(async () => await tv.locator(".tv-imgstage").getAttribute("data-image-stage") === "on", "Home is the loop again", 8000);
        const screens = await facContext.newPage(); await screens.goto(`${app.origin}/admin/${room.id}/tv`);
        const card = screens.locator("[data-home-card]");
        await card.waitFor({ timeout: 10000 });
        assert.equal(await card.getByRole("radio", { name: "An image loop" }).isChecked(), true);
        await card.scrollIntoViewIfNeeded(); await shot(screens, `${skin}-loop-screens`);
        await card.getByRole("radio", { name: /The holding screen/ }).click();
        await until(async () => (await sql.query("select settings->>'home_session' h from public.engagements where id=$1", [room.id])).rows[0].h === null, "Home cleared", 10000);
        await until(async () => await tv.locator(".tv-imgstage").getAttribute("data-image-stage") === "off", "the TV shows the holding screen", 8000);
        await screens.close();
      });
      await tv.context().close(); await phoneContext.close(); await facContext.close();
    }
    console.log(`Image loop kit: ${passed.length} checks passed. Local checks on loopback.`);
  } finally { await browser?.close(); await app.stop(); await mail.close(); await sql.end(); }
}
main().catch(error => { console.error(error); process.exit(1); });
