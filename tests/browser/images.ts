// Batch 1: images (TC-2 deck images to slides, TC-3 one image per step) in real browsers against the production build and the
// local stack with Storage. The facilitator adds three exported slides at once through Add images as slides (one of them 4:3),
// orders them, picks the section, and gets one Image step each, titled "Image 1" and on, greyed until a title is typed. Each goes
// live on a paired TV (Fill, letterboxed on the skin's TV ground, the header covered, nothing jumping between steps). Slide images
// are for the TV only (November 19): a phone at 390 wide shows an Image step's title and phone words, never the image, and never
// asks for one. An image In place sits beside a headline and beside an interaction's question on the TV, and the phone shows only
// the step's own content. The TV view on phones still mirrors the TV, image and all. The control surface's Preview draws it as
// the TV does. The same steps run in the Novetera skin.
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
    // A slide exported from a deck, drawn in a page and captured at its own size.
    const slide = async (title: string, w: number, h: number, colour: string) => {
      const page = await browser!.newPage({ viewport: { width: w, height: h } });
      await page.setContent(`<body style="margin:0"><div style="width:${w}px;height:${h}px;background:#FBFAF7;font:400 ${Math.round(h * 0.09)}px Georgia;color:#26292E;position:relative">
        <div style="position:absolute;left:0;top:0;bottom:0;width:${Math.round(w * 0.025)}px;background:${colour}"></div><div style="position:absolute;left:10%;top:16%">${title}</div></div></body>`);
      const png = await page.screenshot({ type: "png" }); await page.close(); return png;
    };
    const slides = [await slide("Where we have been", 1920, 1080, "#2F6F6A"), await slide("Three things we heard", 1920, 1080, "#8A4B2A"), await slide("Survey highlights", 1440, 1080, "#2B3A67")];

    for (const skin of ["clearway", "novetera"] as const) {
      const room = await engagement(sql, ["Ruth"]);
      if (skin === "novetera") await sql.query("update public.engagements set skin='novetera' where id=$1", [room.id]);
      const opening = await room.session("Why we are here", "content", "Three things we will **build together**", 1);
      await sql.query("update public.sessions set section='Opening' where id=$1", [opening]);
      const question = await room.session("Which next step first?", "choice", "Which next step could we try first?", 2);
      await sql.query(`update public.sessions set section='Opening',options='{"items":[{"key":"o1","text":"Grow small groups"},{"key":"o2","text":"Clear next steps"},{"key":"o3","text":"Raise volunteers"}],"multiple":false}' where id=$1`, [question]);
      const fac = await facilitator(env, sql, room.id);
      const facContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await facContext.addCookies(fac.cookies(app.origin));
      const editor = await facContext.newPage();

      await step(`${skin}: Add images as slides uploads three images, keeps their order, and adds one Image step each to the chosen section`, async () => {
        await editor.goto(`${app.origin}/admin/${room.id}/run-of-show`);
        await editor.getByRole("button", { name: "Add images as slides" }).click();
        const dialog = editor.getByRole("dialog", { name: "Add images as slides" });
        await dialog.locator("#add-images-file").setInputFiles(slides.map((buffer, i) => ({ name: `Slide${i + 1}.png`, mimeType: "image/png", buffer })));
        await until(async () => await dialog.locator(".add-images-item.is-done, .add-images-item:not(.is-uploading):not(.is-failed)").count() === 3, "three uploads done", 30000);
        assert.equal(await dialog.locator(".add-images-item.is-failed").count(), 0, "no upload failed");
        assert.match(await dialog.locator(".add-images-item").nth(2).innerText(), /1440 by 1080, letterboxed on the TV/, "a 4:3 slide says it will be letterboxed");
        // Order: move the third earlier, then back, with the keyboard buttons.
        await dialog.getByRole("button", { name: "Move Slide3.png earlier" }).click();
        assert.match(await dialog.locator(".add-images-item").nth(1).innerText(), /Slide3\.png/);
        await dialog.getByRole("button", { name: "Move Slide3.png later" }).click();
        assert.match(await dialog.locator("#add-images-section").inputValue(), /Day 1::Opening/, "the last section is chosen to start with");
        await shot(editor, `${skin}-images-dialog`);
        await dialog.getByRole("button", { name: "Add 3 slides" }).click();
        await until(async () => Number((await sql.query("select count(*) from public.sessions where engagement_id=$1 and options->>'screen'='image' and not deleted", [room.id])).rows[0].count) === 3, "three Image steps", 20000);
        const rows = (await sql.query(`select title, section, state, options from public.sessions where engagement_id=$1 and not deleted order by position`, [room.id])).rows;
        assert.deepEqual(rows.map(r => r.title), ["Why we are here", "Which next step first?", "Image 1", "Image 2", "Image 3"], "in order, at the end of the section");
        assert.ok(rows.slice(2).every(r => r.section === "Opening" && r.state === "ready" && r.options.untitled === true && r.options.image.display === "fill"), "Ready, in Opening, untitled, Fill");
        await editor.locator(".rb-row", { hasText: "Image 1" }).locator("strong.is-untitled").waitFor({ timeout: 10000 });
        await shot(editor, `${skin}-images-run-of-show`);
      });

      await step(`${skin}: typing a title clears the greyed default; an image goes In place on a headline and on a question`, async () => {
        await editor.locator(".rb-row", { hasText: "Image 1" }).getByRole("button", { name: /Open options/ }).click();
        await editor.locator(".rb-row.is-open #session-title").fill("Where we have been");
        await editor.locator(".rb-row.is-open").getByRole("button", { name: "Done", exact: true }).click();
        await until(async () => (await sql.query("select options from public.sessions where engagement_id=$1 and title='Where we have been'", [room.id])).rows[0]?.options.untitled === undefined, "untitled cleared", 10000);
        const image = (await sql.query("select options#>>'{image,id}' as id from public.sessions where engagement_id=$1 and title='Image 2'", [room.id])).rows[0].id as string;
        for (const [title, id] of [["Why we are here", opening], ["Which next step first?", question]] as const) {
          await editor.locator(".rb-row", { hasText: title }).first().getByRole("button", { name: /Open options/ }).click();
          const open = editor.locator(".rb-row.is-open");
          await open.getByRole("combobox", { name: "Use an image already added" }).selectOption(image);
          if (title === "Which next step first?") assert.equal(await open.getByRole("radio", { name: "Fill" }).isDisabled(), true, "interaction steps get In place only");
          else await open.getByRole("radio", { name: "In place" }).click();
          await open.getByRole("button", { name: "Done", exact: true }).click();
          await until(async () => (await sql.query("select options#>>'{image,display}' as d from public.sessions where id=$1", [id])).rows[0].d === "place", `${title} In place`, 10000);
        }
        // The database refuses Fill on an interaction step, whatever the browser sends.
        const refused = await fac.client.rpc("show_write", { p_engagement: room.id, p_action: "save", p_input: { ...(await sql.query("select to_jsonb(s) j from public.sessions s where id=$1", [question])).rows[0].j, options: { items: [{ key: "o1", text: "A" }, { key: "o2", text: "B" }], multiple: false, image: { id: image, display: "fill" } } } });
        assert.notEqual(refused.data?.status, "ok", "Fill on a question is refused");
      });

      const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
      await tv.goto(app.origin + "/tv");
      const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
      await pairTv(fac, room.id, app.secret, code);
      await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
      const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      // Every image or signed Storage address a phone asks for. Its own screens ask for none.
      const asked: string[] = [];
      phoneContext.on("request", r => { if (/\/api\/(images|media)\/|\/storage\/v1\/object\//.test(r.url())) asked.push(r.url()); });
      const phone = await phoneContext.newPage(); await phone.goto(`${app.origin}/room/${room.id}`);
      const before = mail.count; await phone.fill("#room-email", room.attendees[0].email); await phone.getByRole("button", { name: "Send me a sign-in code" }).click();
      await phone.fill("#room-code", await mail.code(room.attendees[0].email, before)); await phone.getByRole("button", { name: "Sign in" }).click();
      await phone.locator(".ph-app").waitFor({ timeout: 15000 });
      const ids = new Map((await sql.query("select id,title from public.sessions where engagement_id=$1 and not deleted", [room.id])).rows.map(r => [r.title as string, r.id as string]));
      const live = async (title: string) => { await press(fac, sql, room.id, "go_live", { session: ids.get(title)! }); await delay(1100); };
      const stageImg = () => tv.locator(".tv-imgstage.is-active .tv-img-layer:not(.is-leaving) img");
      const loaded = (img: ReturnType<Page["locator"]>) => until(async () => await img.evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0).catch(() => false), "image loads", 15000);

      await step(`${skin}: an Image step fills the TV, the header covered, letterboxed on the TV ground, loaded before it goes live`, async () => {
        await live("Why we are here");
        // The next steps' images are in the preload list before they go live.
        await until(async () => (await tv.locator(".tv-img-preload img").count()) >= 1, "preloaded", 10000);
        await live("Where we have been");
        await loaded(stageImg());
        assert.equal(await tv.locator(".tv-imgstage").getAttribute("data-image-stage"), "on");
        const stage = await tv.locator(".tv-imgstage").boundingBox(), viewport = tv.viewportSize()!;
        assert.ok(stage && Math.abs(stage.width - viewport.width) < 2 && Math.abs(stage.height - viewport.height) < 2, "the whole TV");
        const ground = await tv.locator(".tv-imgstage").evaluate(el => getComputedStyle(el).backgroundColor);
        const surface = await tv.locator(".tv-stage").evaluate(el => getComputedStyle(el).backgroundColor);
        assert.equal(ground, surface, "the letterbox ground is the skin's TV ground");
        await until(async () => (await phone.locator(".ph-body .ph-headline").innerText().catch(() => "")) === "Where we have been", "the phone shows the title as a headline", 10000);
        assert.equal(await phone.locator(".ph-body img").count(), 0, "no image on the phone");
        assert.doesNotMatch(await phone.locator(".ph-body").innerText(), /Pinch to zoom/i);
        await shot(tv, `${skin}-image-fill-tv`); await shot(phone, `${skin}-image-fill-phone`);
        // A 4:3 slide: shown whole, never cropped.
        await live("Image 3");
        await loaded(stageImg());
        assert.equal(await stageImg().evaluate(el => getComputedStyle(el).objectFit), "contain");
        // Untitled, with no phone words: the phone says to watch the screen, never the greyed "Image 3".
        await until(async () => (await phone.locator(".ph-body").innerText()).includes("Watch the screen."), "untitled on the phone", 10000);
        assert.doesNotMatch(await phone.locator(".ph-body").innerText(), /Image 3/);
        assert.equal(await phone.locator(".ph-body img").count(), 0, "no image on the phone");
        await shot(tv, `${skin}-image-letterbox-tv`); await shot(phone, `${skin}-image-untitled-phone`);
      });

      await step(`${skin}: from one image to the next, the old one holds under the cross-fade, so the screen is never blank`, async () => {
        const watch = await watchStage(tv);
        await live("Image 2"); await delay(1500);
        const seen = await watch.stop();
        assert.ok(seen.frames > 20, "frames were sampled");
        assert.ok(seen.min > 0.98, `the stage never dims between images (lowest ${seen.min})`);
        assert.ok(seen.cover > 0.98, `an image always covers the stage (lowest ${seen.cover})`);
      });

      await step(`${skin}: In place sits beside the headline, and beside a question with the live bars below; phones show only the step`, async () => {
        await live("Why we are here");
        await loaded(tv.locator(".tv-layer:not(.is-leaving) .tv-inplace-img img"));
        await until(async () => (await phone.locator(".ph-body .ph-headline").innerText().catch(() => "")).includes("Three things we will build together"), "the headline on the phone", 10000);
        assert.equal(await phone.locator(".ph-body img").count(), 0, "no image under the headline on the phone");
        await shot(phone, `${skin}-inplace-content-phone`);
        assert.equal(await tv.locator(".tv-imgstage").getAttribute("data-image-stage"), "off", "the stage stays down: In place is in the layout");
        await shot(tv, `${skin}-inplace-content-tv`);
        await live("Which next step first?");
        await loaded(tv.locator(".tv-layer:not(.is-leaving) .tv-inplace-thumb img"));
        const thumb = await tv.locator(".tv-layer:not(.is-leaving) .tv-inplace-thumb").boundingBox();
        assert.ok(thumb && Math.round(thumb.width) === 480 && Math.round(thumb.height) === 270, "480 by 270 beside the question");
        await until(async () => (await phone.locator(".ph-prompt").innerText().catch(() => "")) === "Which next step could we try first?", "the question on the phone", 10000);
        assert.equal(await phone.locator(".ph-body img").count(), 0, "no image under the question on the phone");
        assert.doesNotMatch(await phone.locator(".ph-body").innerText(), /Pinch to zoom/i);
        await shot(tv, `${skin}-inplace-question-tv`); await shot(phone, `${skin}-inplace-question-phone`);
        assert.deepEqual(asked, [], "the phone asked for no image and no signed address");
      });

      await step(`${skin}: the TV view on phones still mirrors the TV, image and all`, async () => {
        await live("Where we have been");
        await press(fac, sql, room.id, "tv_on_phones", { on: true });
        await loaded(phone.locator(".ph-body [data-surface='tv'] .tv-imgstage.is-active .tv-img-layer:not(.is-leaving) img"));
        await shot(phone, `${skin}-image-tv-view-phone`);
        await press(fac, sql, room.id, "tv_on_phones", { on: false });
        await until(async () => await phone.locator(".ph-body [data-surface='tv']").count() === 0, "the TV view goes", 10000);
        assert.equal(await phone.locator(".ph-body img").count(), 0, "and the phone's own screen has no image");
      });

      await step(`${skin}: the Preview draws an Image step exactly as the TV will`, async () => {
        const control = await facContext.newPage(); await control.goto(`${app.origin}/control/${room.id}`);
        await control.getByRole("button", { name: "Preview Image 3" }).click();
        await loaded(control.locator(".ctl-screen.is-preview .tv-imgstage.is-active .tv-img-layer:not(.is-leaving) img"));
        await shot(control, `${skin}-image-preview-control`);
        await control.close();
      });
      await press(fac, sql, room.id, "nothing_live");
    }
    console.log(`Images kit: ${passed.length} checks passed. Local checks on loopback.`);
  } finally { await browser?.close(); await app.stop(); await mail.close(); await sql.end(); }
}
main().catch(error => { console.error(error); process.exit(1); });
