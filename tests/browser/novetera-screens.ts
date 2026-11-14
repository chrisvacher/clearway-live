// The Novetera skin on everything the room sees, in real browsers against the production build and the local stack. A Novetera
// engagement's TV, phone, join pages, the control surface's TV preview and the Novetera front page draw Novetera (data-skin, the N
// mark, no texture, no glow, colours computed from the tokens); the same screens for a Clearway engagement still compute Clearway's values.
// The harness serves one app under two loopback names: localhost is Clearway's address (APP_ORIGIN) and 127.0.0.1 is Novetera's
// (NOVETERA_ORIGIN), so the address-based pages (front page, pairing screen, not found) are tested through the Host header the
// browser sends. API calls from a page at the Novetera name carry the Clearway origin, so this kit tests what the room sees, not
// the same-origin rule (the domain work owns that). KIT_SHOTS=<folder> saves a screenshot of each Novetera screen at the TV and phone sizes.
// Local only.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  const A = app.origin, N = app.noveteraOrigin, hostN = new URL(N).host;
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(900); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  // A colour as four numbers, whatever way the browser wrote it (rgb, color-mix, color()), so two colours compare exactly.
  const px = (page: Page, css: string) => page.evaluate(c => { const x = document.createElement("canvas").getContext("2d")!; x.clearRect(0, 0, 1, 1); x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data]; }, css);
  // What a token role resolves to where an element sits.
  const role = (page: Page, selector: string, name: string) => page.evaluate(([s, n]) => { const el = document.querySelector(s)!; const p = document.createElement("i"); p.style.color = `var(${n})`; el.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; }, [selector, name]);
  const css = (page: Page, selector: string, prop: string) => page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
  const sameColour = async (page: Page, actual: string, expected: string, why: string) => assert.deepEqual(await px(page, actual), await px(page, expected), why);
  const roleIs = async (page: Page, selector: string, prop: string, name: string, why: string) => sameColour(page, await css(page, selector, prop), await role(page, selector, name), why);
  const different = async (page: Page, a: string, b: string, why: string) => assert.notDeepEqual(await px(page, a), await px(page, b), why);
  try {
    await sql.connect();
    const nov = await engagement(sql, ["Ruth"]), clr = await engagement(sql, ["Ben"]);
    await sql.query("update public.engagements set skin='novetera' where id=$1", [nov.id]);
    const setup = async (room: typeof nov) => {
      const cloud = await room.session("Celebration", "word_cloud", "One word for what God is doing here", 1);
      const scripture = await room.session("Scripture", "content", "Write down the revelation and make it plain on tablets so that a herald may run with it. For the revelation awaits an appointed time; it speaks of the end and **will not prove false**.", 2);
      await sql.query("update public.sessions set options=$2 where id=$1", [scripture, { screen: "scripture", reference: "Habakkuk 2:2-3" }]);
      const cloud2 = await room.session("Celebration, again", "word_cloud", "One word for what God is doing here", 3);
      return { cloud, scripture, cloud2 };
    };
    const novSessions = await setup(nov), clrSessions = await setup(clr);
    // A session goes live once, so each later question is a fresh one.
    let more = 10; const fresh = (room: typeof nov) => room.session("Another question", "word_cloud", "One word for what God is doing here", more++);
    const novFac = await facilitator(env, sql, nov.id), clrFac = await facilitator(env, sql, clr.id);
    browser = await chromium.launch();
    const context = async (viewport: { width: number; height: number }, phone = false) => {
      const ctx = await browser!.newContext({ viewport, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
      // Only a POST at Novetera's name needs it; everything else goes through as it is.
      await ctx.route(url => url.href.startsWith(`${N}/api/`), async route => {
        if (route.request().method() !== "POST") return route.fallback();
        try { await route.fulfill({ response: await route.fetch({ headers: { ...route.request().headers(), origin: A } }) }); } catch { /* the page closed mid-request */ }
      });
      return ctx;
    };

    // ---------- The front pages: the address decides ----------
    await step("live.novetera.co's front page is the Novetera join page: a lockup, one room code field and Join, nothing else", async () => {
      const ctx = await context({ width: 390, height: 844 }, true), page = await ctx.newPage();
      const res = await page.goto(N + "/"); assert.equal(res?.status(), 200);
      await page.locator(".nvj").waitFor();
      const root = page.locator(".nvj");
      assert.equal(await root.getAttribute("data-skin"), "novetera"); assert.equal(await root.getAttribute("data-theme"), "light", "Chalk, the canvas's Phone artboards");
      assert.equal(await page.title(), "Novetera");
      assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "Join your team in the room.");
      assert.equal(await page.locator("input:not([type=hidden])").count(), 1, "one field"); assert.equal(await page.getByLabel("Room code").count(), 1);
      assert.deepEqual(await page.getByRole("button").allInnerTexts(), ["Join"]);
      assert.equal(await page.locator("form").getAttribute("action"), "/join", "the box posts where the Clearway one does");
      const links = await page.locator("a").evaluateAll(list => list.map(a => `${a.getAttribute("href")}|${a.getAttribute("aria-label")}`));
      assert.deepEqual(links.filter(l => !l.startsWith("#main")), ["/|Novetera home"], "no product page, demo, TV or facilitator link");
      const text = await page.locator("body").innerText();
      assert.ok(!/clearway|facilitat|demo|practice/i.test(text), "no Clearway words on it"); assert.ok(!/[–—]/.test(text));
      assert.equal(await page.locator(".cwl-wordmark").count(), 0); assert.equal(await page.locator(".nvt-lockup").count(), 1);
      await roleIs(page, ".nvj", "background-color", "--cwl-surface", "the page is Chalk from the tokens");
      assert.deepEqual(await px(page, await css(page, ".nvj", "background-color")), [247, 246, 243, 255]);
      await roleIs(page, ".nvj-button", "background-color", "--cwl-button-primary", "the Join button is the primary button role");
      assert.match(await css(page, ".nvj", "font-family"), /Public Sans/);
      assert.match(await css(page, ".nvj-tagline", "font-family"), /Source Serif 4/); assert.equal(await css(page, ".nvj-tagline", "font-style"), "italic");
      assert.deepEqual(await page.locator('link[rel~="icon"], link[rel="apple-touch-icon"]').evaluateAll(list => list.map(l => new URL((l as HTMLLinkElement).href).pathname)).then(l => l.sort()),
        ["/novetera/apple-touch-icon.png", "/novetera/icon-192.png", "/novetera/icon-32.png", "/novetera/icon.svg"], "the favicon and home-screen icon are the N mark");
      for (const file of ["icon.svg", "icon-32.png", "icon-192.png", "apple-touch-icon.png"]) assert.equal((await fetch(`${N}/novetera/${file}`)).status, 200, file);
      await shot(page, "phone-front");
      // A wrong code comes back to the front page with the note. (The redirect's host is the join route's business, which the domain work owns; under `next start` it is the Clearway name.)
      await page.fill("#room-code", "ZZZZZZZZ"); await page.getByRole("button", { name: "Join" }).click();
      await page.getByText("We couldn't find a room with that code. Check the screen and try again.").waitFor();
      await ctx.close();
    });
    await step("live.clearway.co's front page is still the Clearway product page", async () => {
      const ctx = await context({ width: 1280, height: 900 }), page = await ctx.newPage();
      await page.goto(A + "/"); await page.locator(".home").waitFor();
      assert.equal(await page.title(), "Clearway Live"); assert.equal(await page.locator(".nvj, [data-skin=novetera]").count(), 0);
      assert.ok(await page.getByRole("link", { name: /Facilitator sign-in/ }).count() >= 1, "the product page keeps its facilitator link");
      assert.equal(await page.locator(".cwl-wordmark").count() >= 1, true); assert.equal(await page.locator('link[rel~="icon"]').count(), 0, "Clearway serves no icon, as before");
      await ctx.close();
    });
    await step("Not found and the room code page follow the address", async () => {
      const ctx = await context({ width: 390, height: 844 }, true), page = await ctx.newPage();
      for (const [origin, skin, theme, title, brand] of [[N, "novetera", "light", "Novetera", "Novetera home"], [A, "clearway", "dark", "Clearway Live", "Clearway Live home"]] as const) {
        const lost = await page.goto(`${origin}/nosuchroomname`); assert.equal(lost?.status(), 404);
        assert.equal(await page.locator(".surface").getAttribute("data-skin"), skin); assert.equal(await page.locator(".surface").getAttribute("data-theme"), theme);
        assert.equal(await page.title(), title, "the tab title"); assert.equal(await page.locator(".header a.brand").getAttribute("aria-label"), brand);
        assert.equal(await page.locator(".nvt-lockup").count(), skin === "novetera" ? 1 : 0); assert.equal(await page.locator(".cwl-wordmark").count(), skin === "novetera" ? 0 : 1);
        await page.goto(`${origin}/room`);
        assert.equal(await page.locator(".surface").getAttribute("data-skin"), skin); assert.equal(await page.title(), `Find your room | ${title}`);
      }
      await page.goto(`${N}/nosuchroomname`); await shot(page, "phone-not-found");
      await ctx.close();
    });

    // ---------- The TV ----------
    async function pairingScreen(origin: string, skin: "novetera" | "clearway") {
      const ctx = await context({ width: 1920, height: 1080 }), tv = await ctx.newPage();
      await tv.goto(origin + "/tv");
      assert.equal(await tv.title(), skin === "novetera" ? "TV | Novetera" : "TV | Clearway Live");
      await tv.locator(".tv-pair.is-active").waitFor({ timeout: 15000 });
      assert.equal(await tv.locator("main").getAttribute("data-skin"), skin);
      assert.equal((await tv.locator(".tv-foot .tv-upclose").first().innerText()).trim(), `${new URL(origin).host}/tv`, "the pairing screen names its own address");
      return { ctx, tv };
    }
    await step("The pairing screen at live.novetera.co/tv is Novetera: the N mark, no texture, and it names its own address", async () => {
      const { ctx, tv } = await pairingScreen(N, "novetera");
      assert.equal(await tv.locator(".tv-top-status .nvt-mark").count(), 1, "the N mark top right");
      assert.equal(await tv.locator(".tv-top-status .nvt-mark").getAttribute("aria-label"), "Novetera, nothing live");
      assert.equal(await tv.locator(".tv-live, .cwl-mark").count(), 0, "no Clearway icon");
      assert.equal(await css(tv, ".tv-texture", "display"), "none", "no texture");
      await roleIs(tv, ".tv-viewport", "background-color", "--cwl-surface-holding", "the join ground is the holding role (Charcoal)");
      assert.deepEqual(await px(tv, await css(tv, ".tv-viewport", "background-color")), [31, 35, 40, 255]);
      await roleIs(tv, ".tv-stage", "background-color", "--cwl-surface-holding", "the stage too");
      await shot(tv, "tv-pairing"); await ctx.close();
    });
    await step("The pairing screen at the Clearway address is unchanged", async () => {
      const { ctx, tv } = await pairingScreen(A, "clearway");
      assert.equal(await tv.locator(".nvt-mark, .nvt-lockup").count(), 0);
      assert.notEqual(await css(tv, ".tv-texture", "display"), "none", "Clearway's texture is still there");
      await roleIs(tv, ".tv-viewport", "background-color", "--cwl-surface", "Clearway's Navy");
      await ctx.close();
    });

    async function pairedTv(room: typeof nov, fac: typeof novFac, origin: string) {
      const ctx = await context({ width: 1920, height: 1080 }), tv = await ctx.newPage(); await tv.goto(origin + "/tv");
      const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
      await pairTv(fac, room.id, app.secret, code, "Skin TV");
      await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
      return { ctx, tv };
    }
    const manage = async (fac: typeof novFac, room: typeof nov, content: string) => {
      const { data, error } = await fac.client.rpc("tv_manage", { p_engagement: room.id, p_action: "screen", p: { content } }); assert.equal(error, null); assert.equal(data.status, "ok");
    };
    const novTv = await pairedTv(nov, novFac, N), clrTv = await pairedTv(clr, clrFac, N);   // both open at Novetera's name: the engagement's skin beats the address
    await step("A Novetera engagement's TV join screen: data-skin, the lockup top right, the join roles, no texture or glow, the church logo stays", async () => {
      const tv = novTv.tv; await manage(novFac, nov, "join");
      await tv.locator(".tv-scene.tv-join.is-active").waitFor({ timeout: 15000 });
      assert.equal(await tv.locator("main").getAttribute("data-skin"), "novetera"); assert.equal(await tv.locator("main").getAttribute("data-screen"), "holding");
      assert.equal(await tv.locator(".tv-brand-row .tv-church-logo").count(), 1, "the church stays top left");
      assert.equal(await tv.locator(".tv-top-status .nvt-lockup").count(), 1, "the lockup where the canvas puts it"); assert.equal(await tv.locator(".tv-top-status .nvt-lockup").getAttribute("aria-label"), "Novetera");
      assert.equal(await tv.locator(".tv-top-status .nvt-mark").count(), 0); assert.equal(await tv.locator(".tv-live, .cwl-mark").count(), 0);
      assert.equal(await css(tv, ".tv-texture", "display"), "none", "no texture, though the engagement's texture setting is on");
      assert.equal(await tv.locator("main").getAttribute("data-texture"), "on");
      assert.equal((await css(tv, ".tv-viewport", "--cwl-glow")).trim(), "none", "no glow");
      await roleIs(tv, ".tv-viewport", "background-color", "--cwl-surface-holding", "the ground reads the holding role");
      await roleIs(tv, ".tv-join-link", "color", "--cwl-text-holding", "the link reads the holding text role");
      await roleIs(tv, ".tv-join .tv-body", "color", "--cwl-text-muted-holding", "muted text reads its holding role");
      await roleIs(tv, ".tv-qr-ink", "fill", "--cwl-code-ink", "the code's ink is the code role (Charcoal)");
      await roleIs(tv, ".tv-qr-ground", "fill", "--cwl-code-ground", "the code's ground is White");
      assert.equal((await tv.locator(".tv-join-link span").first().innerText()).trim(), "live.novetera.co", "the link names Novetera's address");
      assert.match(await tv.locator(".tv-join-link span").nth(1).innerText(), /^\/[A-F0-9]{8}$/);
      assert.match(await css(tv, ".tv-stage", "font-family"), /Public Sans/);
      await shot(tv, "tv-join-charcoal");
    });
    await step("A Novetera engagement's TV while a question is live: the mark carries the live state, headlines are 700, no texture", async () => {
      const tv = novTv.tv; await press(novFac, sql, nov.id, "go_live", { session: novSessions.cloud });
      await tv.locator(".tv-layer.is-input").last().waitFor({ timeout: 15000 }); await delay(1200);
      assert.equal(await tv.locator("main").getAttribute("data-screen"), "input");
      const mark = tv.locator(".tv-top-status .nvt-mark"); assert.equal(await mark.count(), 1);
      assert.equal(await mark.getAttribute("aria-label"), "Novetera, live"); assert.ok((await mark.getAttribute("class"))!.includes("is-live"));
      await roleIs(tv, ".tv-top-status .nvt-mark .b", "fill", "--cwl-mark-live", "the second stroke turns live"); await roleIs(tv, ".tv-top-status .nvt-mark .a", "fill", "--cwl-mark-stroke", "the first stroke");
      assert.equal(await css(tv, ".tv-top-status .nvt-mark", "height"), "72px", "the Clearway icon's size");
      assert.equal(await css(tv, ".tv-layer.is-input .tv-headline", "font-weight"), "700", "Novetera headlines are 700");
      await roleIs(tv, ".tv-viewport", "background-color", "--cwl-surface", "the session ground is Charcoal");
      assert.equal(await css(tv, ".tv-texture", "display"), "none"); assert.equal(await tv.locator(".tv-live, .cwl-mark").count(), 0);
      await shot(tv, "tv-live-question");
      await press(novFac, sql, nov.id, "nothing_live"); await delay(900);
      assert.equal(await tv.locator(".tv-top-status .nvt-mark").getAttribute("aria-label"), "Novetera, nothing live"); assert.ok(!(await tv.locator(".tv-top-status .nvt-mark").getAttribute("class"))!.includes("is-live"));
    });
    await step("Scripture on a Novetera TV is set in the editorial face, italic", async () => {
      const tv = novTv.tv; await press(novFac, sql, nov.id, "go_live", { session: novSessions.scripture });
      await tv.locator(".tv-passage").waitFor({ timeout: 15000 }); await delay(1200);
      assert.match(await css(tv, ".tv-passage", "font-family"), /Source Serif 4/); assert.equal(await css(tv, ".tv-passage", "font-style"), "italic"); assert.equal(await css(tv, ".tv-passage", "font-weight"), "400");
      assert.equal(await tv.locator(".tv-live, .cwl-mark").count(), 0);
      await shot(tv, "tv-scripture");
      await press(novFac, sql, nov.id, "nothing_live");
    });
    await step("A Novetera engagement on a light TV draws Chalk with the charcoal mark, and the join screen keeps the one join ground", async () => {
      await sql.query("update public.engagements set settings=settings||'{\"tv_theme\":\"light\"}' where id=$1", [nov.id]);
      const tv = novTv.tv; await until(async () => await tv.locator("main").getAttribute("data-theme") === "light", "light theme reaches the TV", 15000);
      await manage(novFac, nov, "join"); await tv.locator(".tv-scene.tv-join.is-active").waitFor(); await delay(800);
      await roleIs(tv, ".tv-viewport", "background-color", "--cwl-surface-holding", "the join ground is one token value in both themes");
      await press(novFac, sql, nov.id, "go_live", { session: novSessions.cloud2 });
      await tv.locator(".tv-top-status .nvt-mark.is-live").waitFor({ timeout: 15000 }); await delay(1500);
      await roleIs(tv, ".tv-viewport", "background-color", "--cwl-surface", "Chalk");
      assert.deepEqual(await px(tv, await css(tv, ".tv-viewport", "background-color")), [247, 246, 243, 255]);
      await roleIs(tv, ".tv-top-status .nvt-mark .b", "fill", "--cwl-mark-live", "Oxblood 700 on light"); assert.equal(await css(tv, ".tv-texture", "display"), "none");
      await shot(tv, "tv-live-question-light");
      await press(novFac, sql, nov.id, "nothing_live"); await manage(novFac, nov, "join"); await delay(900); await shot(tv, "tv-join-charcoal-light-theme");
      await sql.query("update public.engagements set settings=settings||'{\"tv_theme\":\"dark\"}' where id=$1", [nov.id]);
      await until(async () => await tv.locator("main").getAttribute("data-theme") === "dark", "dark again", 15000);
    });
    await step("A Clearway engagement's TV, opened at Novetera's address, computes Clearway's values: the engagement's skin beats the address", async () => {
      const tv = clrTv.tv; await manage(clrFac, clr, "join");
      await tv.locator(".tv-scene.tv-join.is-active").waitFor({ timeout: 15000 });
      assert.equal(await tv.locator("main").getAttribute("data-skin"), "clearway");
      assert.equal(await tv.locator(".nvt-mark, .nvt-lockup").count(), 0);
      assert.notEqual(await css(tv, ".tv-texture", "display"), "none", "Clearway keeps its texture");
      await roleIs(tv, ".tv-viewport", "background-color", "--cwl-surface", "Clearway's Navy (no holding ground)");
      await different(tv, await css(tv, ".tv-viewport", "background-color"), await role(tv, ".tv-viewport", "--cwl-surface-holding"), "and not Novetera's holding ground");
      await roleIs(tv, ".tv-qr-ink", "fill", "--cw-navy", "the code is Navy ink"); await roleIs(tv, ".tv-join-link", "color", "--cwl-text", "text role");
      assert.equal((await tv.locator(".tv-join-link span").first().innerText()).trim(), "live.clearway.co");
      assert.match(await css(tv, ".tv-stage", "font-family"), /Plus Jakarta Sans/);
      await press(clrFac, sql, clr.id, "go_live", { session: clrSessions.cloud }); await tv.locator(".tv-layer.is-input").last().waitFor(); await delay(1200);
      assert.equal(await tv.locator(".tv-top-status .tv-live.cwl-mark.is-live").count(), 1, "the Clearway icon carries the live state");
      assert.equal(await css(tv, ".tv-layer.is-input .tv-headline", "font-weight"), "300", "Clearway headlines are still light");
      await press(clrFac, sql, clr.id, "go_live", { session: clrSessions.scripture }); await tv.locator(".tv-passage").waitFor(); await delay(1200);
      assert.match(await css(tv, ".tv-passage", "font-family"), /Plus Jakarta Sans/); assert.equal(await css(tv, ".tv-passage", "font-style"), "normal");
      await press(clrFac, sql, clr.id, "nothing_live");
    });

    // ---------- The control surface: the preview draws the engagement's skin, the facilitator's own screens stay Clearway Live ----------
    await step("The control surface's TV preview and the remote's mirror draw the engagement's skin; the rest of the screen stays Clearway Live", async () => {
      for (const [room, fac, skin] of [[nov, novFac, "novetera"], [clr, clrFac, "clearway"]] as const) {
        const ctx = await context({ width: 1440, height: 1000 }); await ctx.addCookies(fac.cookies(A));
        await press(fac, sql, room.id, "go_live", { session: await fresh(room) });
        for (const path of ["control", "remote"]) {
          const page = await ctx.newPage(); await page.goto(`${A}/${path}/${room.id}`);
          await page.locator(".tv-mirror").first().waitFor({ timeout: 15000 }); await delay(800);
          assert.equal(await page.locator(".tv-mirror").first().getAttribute("data-skin"), skin, `${path}: the mirror draws ${skin}`);
          assert.equal(await page.locator('[data-skin="novetera"]').count(), skin === "novetera" ? 1 : 0, `${path}: nothing else on the facilitator's screen is Novetera`);
          assert.equal(await page.locator(".tv-mirror .nvt-mark").count(), skin === "novetera" ? 1 : 0);
          if (skin === "novetera") {
            await roleIs(page, ".tv-mirror", "background-color", "--cwl-surface", "the preview is Charcoal inside the app shell");
            assert.deepEqual(await px(page, await css(page, ".tv-mirror", "background-color")), [31, 35, 40, 255]);
            assert.equal(await css(page, ".tv-mirror .tv-texture", "display"), "none"); assert.match(await css(page, ".tv-mirror .tv-stage", "font-family"), /Public Sans/);
          } else assert.equal(await page.locator(".tv-mirror .tv-live.cwl-mark").count(), 1, "Clearway's preview keeps its icon");
          if (path === "control") await shot(page, `${skin}-control-preview`);
          await page.close();
        }
        await press(fac, sql, room.id, "nothing_live"); await ctx.close();
      }
    });

    // ---------- Phones ----------
    async function signIn(room: typeof nov, person: { email: string }, origin: string) {
      const ctx = await context({ width: 390, height: 844 }, true), page = await ctx.newPage(); await page.goto(`${origin}/room/${room.id}`);
      await page.locator("#room-email").waitFor({ timeout: 15000 });
      return { ctx, page, signIn: async () => {
        const before = mail.count;
        await page.fill("#room-email", person.email); await page.getByRole("button", { name: "Send me a sign-in code" }).click();
        await page.fill("#room-code", await mail.code(person.email, before)); await page.getByRole("button", { name: "Sign in" }).click();
        await page.locator(".ph-app").waitFor({ timeout: 15000 });
      } };
    }
    const novPhone = await signIn(nov, nov.attendees[0], N), clrPhone = await signIn(clr, clr.attendees[0], N);   // both at Novetera's name
    await step("A Novetera room's sign-in page: Novetera on Chalk, the lockup, sentence-case buttons", async () => {
      const page = novPhone.page, surface = page.locator(".surface");
      assert.equal(await surface.getAttribute("data-skin"), "novetera"); assert.equal(await surface.getAttribute("data-theme"), "light"); assert.equal(await surface.getAttribute("data-surface"), "phone");
      assert.equal(await page.title(), "Novetera"); assert.equal(await page.locator(".header a.brand").getAttribute("aria-label"), "Novetera home");
      assert.equal(await page.locator(".header .nvt-lockup").count(), 1); assert.equal(await page.locator(".cwl-wordmark").count(), 0);
      const body = await page.locator("body").innerText(); assert.ok(!/clearway/i.test(body), "no Clearway on a Novetera sign-in page"); assert.ok(!/[–—]/.test(body));
      await roleIs(page, ".surface", "background-color", "--cwl-surface", "Chalk"); assert.deepEqual(await px(page, await css(page, ".surface", "background-color")), [247, 246, 243, 255]);
      await roleIs(page, ".button-link", "background-color", "--cwl-button-primary", "the button role");
      assert.match(await css(page, ".surface", "font-family"), /Public Sans/);
      await shot(page, "phone-sign-in");
    });
    await step("A Clearway room's sign-in page at Novetera's name takes the Clearway look: the engagement beats the address", async () => {
      const page = clrPhone.page, surface = page.locator(".surface");
      assert.equal(await surface.getAttribute("data-skin"), "clearway"); assert.equal(await surface.getAttribute("data-theme"), "dark");
      assert.equal(await page.locator(".header a.brand").getAttribute("aria-label"), "Clearway Live home"); assert.equal(await page.locator(".cwl-wordmark").count(), 1); assert.equal(await page.locator(".nvt-lockup").count(), 0);
      assert.equal(await page.title(), "Clearway Live");
      await roleIs(page, ".surface", "background-color", "--cwl-surface", "Clearway's Navy");
    });
    await novPhone.signIn(); await clrPhone.signIn();
    await step("A Novetera phone in the room: the N mark carries the live state, Chalk, sentence-case Send, no texture", async () => {
      const page = novPhone.page;
      assert.equal(await page.locator(".surface").getAttribute("data-skin"), "novetera"); assert.equal(await page.locator(".surface").getAttribute("data-theme"), "light");
      await page.locator(".ph-head .nvt-mark").waitFor(); assert.equal(await page.locator(".ph-head .nvt-mark").getAttribute("aria-label"), "Novetera, nothing live");
      assert.equal(await page.locator(".ph-live, .cwl-mark, .cwl-wordmark").count(), 0, "no Clearway mark or wordmark");
      assert.equal(await css(page, ".ph-texture", "display"), "none");
      await roleIs(page, ".ph-app", "background-color", "--cwl-surface", "Chalk"); assert.equal(await css(page, ".ph-head .nvt-mark", "height"), "28px");
      assert.ok(!/clearway/i.test(await page.locator("body").innerText()));
      await shot(page, "phone-waiting");
      await press(novFac, sql, nov.id, "go_live", { session: await fresh(nov) });
      await until(async () => await page.locator(".ph-head .nvt-mark.is-live").count() === 1, "live mark on the phone", 15000);
      assert.equal(await page.locator(".ph-head .nvt-mark").getAttribute("aria-label"), "Novetera, live");
      await roleIs(page, ".ph-head .nvt-mark .b", "fill", "--cwl-mark-live", "the second stroke turns live");
      await page.locator(".ph-send").waitFor(); assert.equal(await css(page, ".ph-send", "text-transform"), "none", "buttons are sentence case"); assert.equal(await page.locator(".ph-send").innerText(), "Send");
      await page.locator("#ph-answer").fill("Hope");
      await roleIs(page, ".ph-send", "background-color", "--cwl-button-primary", "the button role");
      await shot(page, "phone-answering");
      // The TV view on phones draws the engagement's skin.
      await press(novFac, sql, nov.id, "tv_on_phones", { on: true });
      await page.locator(".tv-mirror").waitFor({ timeout: 10000 }); assert.equal(await page.locator(".tv-mirror").getAttribute("data-skin"), "novetera");
      await press(novFac, sql, nov.id, "tv_on_phones", { on: false }); await press(novFac, sql, nov.id, "nothing_live");
    });
    await step("A Clearway phone is unchanged: the Clearway icon, dark, uppercase buttons", async () => {
      const page = clrPhone.page;
      assert.equal(await page.locator(".surface").getAttribute("data-theme"), "dark"); assert.equal(await page.locator(".nvt-mark, .nvt-lockup").count(), 0);
      await press(clrFac, sql, clr.id, "go_live", { session: await fresh(clr) });
      await until(async () => await page.locator(".ph-head .ph-live.cwl-mark.is-live").count() === 1, "Clearway's icon is live on the phone", 15000);
      await page.locator(".ph-send").waitFor(); assert.equal(await css(page, ".ph-send", "text-transform"), "uppercase");
      await roleIs(page, ".ph-app", "background-color", "--cwl-surface", "Clearway's Navy");
      await press(clrFac, sql, clr.id, "tv_on_phones", { on: true });
      await page.locator(".tv-mirror").waitFor({ timeout: 10000 }); assert.equal(await page.locator(".tv-mirror").getAttribute("data-skin"), "clearway");
      await press(clrFac, sql, clr.id, "tv_on_phones", { on: false }); await press(clrFac, sql, clr.id, "nothing_live");
    });
    await step("Switching the engagement back to Clearway: a phone already open at Novetera's name takes the Clearway look and keeps working", async () => {
      const page = novPhone.page;
      await sql.query("update public.engagements set skin='clearway' where id=$1", [nov.id]);
      await until(async () => await page.locator(".surface").getAttribute("data-skin") === "clearway", "the phone redraws in Clearway", 20000);
      assert.equal(await page.locator(".surface").getAttribute("data-theme"), "dark"); assert.equal(await page.locator(".nvt-mark").count(), 0);
      await until(async () => await page.locator(".ph-head .ph-reconnecting, .ph-head .ph-live, .ph-head .cwl-mark").count() > 0, "Clearway's icon", 5000);
      assert.equal(new URL(page.url()).host, hostN, "it stays at the address it was opened at");
      await press(novFac, sql, nov.id, "go_live", { session: await fresh(nov) });
      await until(async () => await page.locator(".ph-head .ph-live.cwl-mark.is-live").count() === 1, "the signed-in phone still receives the room", 15000);
      await press(novFac, sql, nov.id, "nothing_live");
      await sql.query("update public.engagements set skin='novetera' where id=$1", [nov.id]);
      await until(async () => await page.locator(".surface").getAttribute("data-skin") === "novetera", "and back to Novetera", 20000);
    });
    await novTv.ctx.close(); await clrTv.ctx.close(); await novPhone.ctx.close(); await clrPhone.ctx.close();
  } finally {
    await browser?.close().catch(() => undefined); await mail.close(); app.stop(); await sql.end().catch(() => undefined);
  }
  console.log(`\n${passed.length} steps passed`);
}
main().catch(error => { console.error(error); process.exit(1); });
