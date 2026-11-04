// Milestone 3, step 1: content screens and the pass 3 chrome, in real browsers against
// the production build and the local stack. Every content screen goes live on a paired TV
// and two phones; the image is added through the run of show editor. KIT_SHOTS=<folder>
// saves a screenshot of each TV and phone screen for review. Local only.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(900); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    const room = await engagement(sql, ["Ruth", "Ben"]);
    await sql.query("update public.engagements set settings=settings||'{\"scripture_translation\":\"NIV\"}' where id=$1", [room.id]);
    const add = async (title: string, prompt: string, position: number, options: Record<string, unknown>, depth = "") => {
      const id = await room.session(title, "content", prompt, position);
      await sql.query("update public.sessions set options=$2,phone_depth=$3 where id=$1", [id, options, depth]); return id;
    };
    const holding = await add("Wayfinding · Day 1", "", 1, { screen: "holding", outline: "9:00 Welcome and prayer\n9:15 Celebration\n9:45 The Five Lenses\n2:45 Provisional Vision Outcomes\n4:15 Close in prayer" });
    const depth = await add("What we heard · Survey", "Quality preaching is the most named **strength**", 2, { screen: "headline", number: "45%", source: "Congregational survey · 87 answers · 39 named it" },
      "It was the most named strength across every age group except under 30, where welcoming culture came first.\n\n> The teaching on Sundays is why I stayed after we moved.\n- Survey comment, anonymous\n\n## Read more: by age group\nUnder 30s named welcoming culture first.");
    const scripture = await add("Scripture", "Write down the revelation and make it plain on tablets so that a herald may run with it. For the revelation awaits an appointed time; it speaks of the end and **will not prove false**.", 3, { screen: "scripture", reference: "Habakkuk 2:2-3" });
    const prayer = await add("Prayer", "Let's **pray**", 4, { screen: "prayer" });
    const image = await add("Survey page", "Survey results, page 3", 5, { screen: "image" });
    const check = await add("Screen check", "", 6, { screen: "screen_check" });
    const cloud = await room.session("Celebration", "word_cloud", "One word for what God is doing at Riverside", 7);
    const fac = await facilitator(env, sql, room.id);
    browser = await chromium.launch();

    const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvContext.newPage(); await tv.goto(app.origin + "/tv");
    const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(fac, room.id, app.secret, code);
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
    const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();

    async function phone(person: { email: string }) {
      const ctx = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage(); await page.goto(`${app.origin}/room/${room.id}`);
      const before = mail.count;
      await page.fill("#room-email", person.email); await page.getByRole("button", { name: "Send me a sign-in code" }).click();
      await page.fill("#room-code", await mail.code(person.email, before)); await page.getByRole("button", { name: "Sign in" }).click();
      await page.locator(".ph-app").waitFor({ timeout: 15000 });
      return page;
    }
    const [ruth, ben] = [await phone(room.attendees[0]), await phone(room.attendees[1])];

    // The image goes in through the run of show editor, fitted in the browser.
    const facContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await facContext.addCookies(fac.cookies(app.origin));
    const editor = await facContext.newPage();
    await step("The run of show adds an image to an image or document page", async () => {
      const page = await facContext.newPage();
      await page.setContent(`<body style="margin:0;background:#fff;font:600 28px sans-serif;color:#03294E"><div style="width:850px;height:1100px;padding:72px;box-sizing:border-box">
        <p style="font-size:16px;letter-spacing:.08em">RIVERSIDE CHURCH · SURVEY RESULTS · PAGE 3</p><h1>What would help you take a next step?</h1><p style="font-weight:400">87 answers. People could choose up to three.</p>
        ${[["Small group access", 54], ["Clear next steps", 41], ["More midweek options", 33], ["Serving with friends", 28]].map(([t, n]) => `<p>${t} <span style="display:inline-block;height:22px;width:${Number(n) * 6}px;background:#3F72DE"></span> ${n}%</p>`).join("")}</div></body>`);
      const png = await page.locator("div").first().screenshot({ type: "png" }); await page.close();
      await editor.goto(`${app.origin}/setup/${room.id}/run-of-show`);
      await editor.locator(".rb-row", { hasText: "Survey page" }).getByRole("button", { name: /Open options/ }).click();
      await editor.locator(".rb-row.is-open #content-file").setInputFiles({ name: "page-3.png", mimeType: "image/png", buffer: png });
      await editor.getByText("Image added. Save to put it in the run of show.").waitFor({ timeout: 10000 });
      await shot(editor, "set-07-image-options");
      await editor.locator(".rb-row.is-open").getByRole("button", { name: "Done", exact: true }).click();
      await until(async () => (await sql.query("select options->>'media' as m from public.sessions where id=$1", [image])).rows[0].m, "image saved on the session", 10000);
    });

    const live = async (session: string) => { await press(fac, sql, room.id, "go_live", { session }); await delay(1100); };
    await step("Holding and walk-in: the welcome and the day's outline, with the holding texture; phones wait", async () => {
      await live(holding);
      await until(async () => (await layer().innerText()).includes("Welcome to Riverside Church"), "welcome on the TV", 10000);
      assert.ok((await layer().innerText()).includes("Provisional Vision Outcomes"), "the outline shows");
      assert.equal(await tv.locator("main").getAttribute("data-screen"), "holding");
      assert.equal(await tv.locator(".tv-live").count(), 0, "no LIVE mark on a content screen");
      await until(async () => (await ruth.locator(".ph-body").innerText()).includes("You’re in"), "phone waits");
      assert.equal(await ruth.locator(".ph-app").getAttribute("data-screen"), "phone-waiting");
      await shot(tv, "content-holding-tv"); await shot(ruth, "content-holding-phone");
    });
    await step("Headline with depth: the number, headline and source on the TV; the depth on phones", async () => {
      await live(depth);
      await until(async () => (await layer().innerText()).includes("45%"), "number on the TV", 10000);
      assert.equal(await layer().locator(".tv-headline-xl strong").innerText(), "strength", "a marked phrase is bold");
      await until(async () => (await ruth.locator(".ph-body").innerText()).includes("why I stayed after we moved"), "the quote on the phone");
      assert.equal(await ruth.locator(".ph-section summary").innerText(), "Read more: by age group");
      await shot(tv, "content-headline-tv"); await shot(ruth, "content-headline-phone");
    });
    await step("Scripture: the passage, the reference and the engagement's translation, as three pieces", async () => {
      await live(scripture);
      await until(async () => (await layer().locator(".tv-reference").innerText().catch(() => "")).includes("Habakkuk 2:2-3"), "reference on the TV", 10000);
      assert.equal(await layer().locator(".tv-reference span").innerText(), "NIV", "translation defaults from the engagement");
      await until(async () => (await ruth.locator(".ph-passage").innerText().catch(() => "")).includes("herald may run"), "passage on the phone");
      await shot(tv, "content-scripture-tv"); await shot(ruth, "content-scripture-phone");
    });
    await step("Prayer and silence: a single still line; phones say Phones away", async () => {
      await live(prayer);
      await until(async () => (await layer().innerText()).includes("pray"), "prayer line", 10000);
      await until(async () => (await ben.locator(".ph-body").innerText()).includes("Phones away"), "Phones away");
      await shot(tv, "content-prayer-tv"); await shot(ben, "content-prayer-phone");
    });
    await step("Image or document page: the page at its own shape on the TV, and on phones to zoom", async () => {
      await live(image);
      const img = layer().locator("img.tv-page");
      await until(async () => await img.evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0).catch(() => false), "image loads on the TV", 10000);
      const box = await img.boundingBox(); assert.ok(box && Math.abs(box.width / box.height - 850 / 1100) < 0.02, "never stretched");
      await until(async () => await ruth.locator(".ph-zoom img").evaluate(el => (el as HTMLImageElement).naturalWidth > 0).catch(() => false), "image loads on the phone", 10000);
      await shot(tv, "content-image-tv"); await shot(ruth, "content-image-phone");
    });
    await step("Screen check from the run of show: the full-bleed check on the TV, fixes on phones", async () => {
      await live(check);
      await until(async () => await tv.locator(".tv-check.is-active").count() === 1, "screen check", 10000);
      await until(async () => (await ruth.locator(".ph-body").innerText()).includes("If the screen looks wrong"), "fixes on the phone");
      await shot(tv, "content-check-tv"); await shot(ruth, "content-check-phone");
    });
    await step("Pass 3 chrome: the church top left with the count badges beside it, the Lime mark top right", async () => {
      await live(cloud);
      await ruth.fill("#ph-answer", "hope"); await ruth.locator(".ph-send").click();
      await ben.fill("#ph-answer", "hope"); await ben.locator(".ph-send").click();
      await until(async () => (await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").then(v => v ?? "")).trim() === "2 answers from 2 people", "the count badges top left", 10000);
      assert.deepEqual(await tv.locator(".tv-top .tv-count b").allInnerTexts(), ["2", "2"], "people, then submissions");
      assert.equal(await tv.locator(".tv-top .tv-live.is-live").count(), 1, "the LIVE mark");
      assert.equal(await tv.locator(".tv-top .tv-mark").count(), 0, "the Clearway mark is gone from the lockup");
      assert.equal(await ruth.locator(".ph-head .ph-live.is-live").count(), 1, "the phone header carries the mark");
      await shot(tv, "chrome-word-cloud-tv"); await shot(ruth, "chrome-word-cloud-phone");
      await press(fac, sql, room.id, "phones_down");
      await until(async () => await tv.locator(".tv-live.is-down").count() === 1, "the quiet mark for phones down");
      await shot(tv, "chrome-phones-down-tv");
    });
    console.log(`Content screens kit: ${passed.length} checks passed. Local checks on loopback.`);
  } finally { await browser?.close(); await app.stop(); await mail.close(); await sql.end(); }
}
main().catch(error => { console.error(error); process.exit(1); });
