// One deployment, two addresses (live.clearway.co and live.novetera.co). The kit serves the production build at two loopback
// addresses that share a port but never a cookie: http://localhost:<port> is Clearway's and http://127.0.0.1:<port> is Novetera's.
// It proves the address decides where a request belongs: a room code, link name or room link at the wrong address lands at its
// engagement's address before any cookie is set; a facilitator page at Novetera's address lands at Clearway's; a change from the
// other address is refused; a TV opened at Novetera's address is paired from the Clearway control surface; and after a skin switch
// the old links move while a phone already signed in stays where it is. Local only: no real email, Team Hub or CORE.
import assert from "node:assert/strict";
import { chromium, request as playwrightRequest, type APIRequestContext, type Browser, type BrowserContext } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, startApp, until } from "./harness";
import { practiceId } from "../../lib/room/practice";

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox(), app = await startApp(env, mail.url);
  const CW = app.origin, NV = app.noveteraOrigin;
  let browser: Browser | undefined, practiceSkin = "clearway";
  const step = async (name: string, run: () => Promise<void>) => { await run(); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    assert.notEqual(new URL(CW).host, new URL(NV).host, "the two addresses differ");
    assert.equal((await sql.query("select 1 from public.engagements where id=$1 and not deleted", [practiceId])).rowCount, 1, "Run npm run db:seed first: the kit uses the permanent practice room");
    practiceSkin = (await sql.query("select skin from public.engagements where id=$1", [practiceId])).rows[0].skin;
    browser = await chromium.launch();
    // Each call is a visitor with no cookies, so an earlier call's device cookie never counts as a session.
    const once = async <T>(run: (ctx: APIRequestContext) => Promise<T>) => { const ctx = await playwrightRequest.newContext(); try { return await run(ctx); } finally { await ctx.dispose(); } };
    const get = (url: string) => once(async ctx => { const r = await ctx.get(url, { maxRedirects: 0 }), body = await r.text(); return { status: () => r.status(), headers: () => r.headers(), headersArray: () => r.headersArray(), text: async () => body }; });
    const post = (url: string, origin?: string) => once(async ctx => { const r = await ctx.post(url, { maxRedirects: 0, headers: origin ? { origin } : {}, data: {} }), body = await r.text(); return { status: () => r.status(), headers: () => r.headers(), headersArray: () => r.headersArray(), text: async () => body }; });
    const cookieNames = (res: { headersArray(): { name: string; value: string }[] }) => res.headersArray().filter(h => h.name.toLowerCase() === "set-cookie").map(h => h.value);
    const clearwayRoom = await engagement(sql, ["Ruth"]), noveteraRoom = await engagement(sql, ["Ben"]);
    const noveteraName = `kitnv${noveteraRoom.id.replace(/-/g, "").slice(0, 10)}`;
    await sql.query("update public.engagements set skin='novetera', link_name=$2 where id=$1", [noveteraRoom.id, noveteraName]);
    const codeOf = async (id: string) => (await sql.query("select room_code from public.engagements where id=$1", [id])).rows[0].room_code as string;
    const [cwCode, nvCode] = [await codeOf(clearwayRoom.id), await codeOf(noveteraRoom.id)];
    const fac = await facilitator(env, sql, noveteraRoom.id);

    // The lookups only: status, Location and cookies, with no redirect followed.
    const moves = async (from: string, path: string, to: string, label: string) => {
      const res = await get(from + path); assert.equal(res.status(), 307, `${label}: ${from}${path} redirects`);
      assert.equal(res.headers().location, to + path, `${label}: same path and query at the engagement's address`);
      assert.deepEqual(cookieNames(res), [], `${label}: no cookie is set on the way`);
      assert.match(res.headers()["cache-control"] ?? "", /no-store/, `${label}: not cached`);
    };
    const stays = async (url: string, label: string, status?: number) => {
      // The page's own steps (a code opens its room) stay at the same address: a bare path, never the other address.
      const res = await get(url); const where = res.headers().location; assert.ok(!where || where.startsWith("/"), `${label}: ${url} is not sent to another address (${res.status()} ${where})`);
      if (status) assert.equal(res.status(), status, label);
    };

    await step("a Novetera code, link name, /r/ and /join typed at the Clearway address go to the Novetera address", async () => {
      await moves(CW, `/${nvCode}`, NV, "code"); await moves(CW, `/${nvCode.toLowerCase()}`, NV, "code in lower case");
      await moves(CW, `/${noveteraName.toUpperCase()}`, NV, "link name in capitals"); await moves(CW, `/r/${nvCode}`, NV, "/r/");
      await moves(CW, `/join?code=${nvCode.slice(0, 4)}-${nvCode.slice(4)}&from=kit`, NV, "/join"); await moves(CW, `/join?code=${noveteraName}`, NV, "/join with a link name");
      await moves(CW, `/room/${noveteraRoom.id}`, NV, "room"); await moves(CW, `/room/${noveteraRoom.id}/confirm?challenge=a&token=b`, NV, "confirm link");
    });
    await step("and a Clearway code or link at the Novetera address goes to the Clearway address", async () => {
      await moves(NV, `/${cwCode}`, CW, "code"); await moves(NV, `/r/${cwCode.toLowerCase()}`, CW, "/r/"); await moves(NV, `/join?code=${cwCode}`, CW, "/join"); await moves(NV, `/room/${clearwayRoom.id}`, CW, "room");
    });
    await step("a code at its own address, an unknown code, the TV, its API, the AI page and static files stay where they are", async () => {
      await stays(`${NV}/${nvCode}`, "own address"); await stays(`${CW}/${cwCode}`, "own address"); await stays(`${NV}/room/${noveteraRoom.id}`, "own room");
      await stays(`${NV}/NOSUCH99`, "unknown code", 404); await stays(`${CW}/NOSUCH99`, "unknown code", 404);
      for (const origin of [CW, NV]) { await stays(`${origin}/tv`, "tv", 200); await stays(`${origin}/how-we-use-ai`, "how we use AI", 200); await stays(`${origin}/robots.txt`, "robots", 200); await stays(`${origin}/`, "front page", 200); }
      assert.notEqual((await get(`${NV}/api/tv`)).status(), 307, "the TV API is never redirected"); assert.notEqual((await get(`${CW}/api/tv/ack`)).status(), 307);
    });
    await step("/practice follows the practice room's skin", async () => {
      await sql.query("update public.engagements set skin='clearway' where id=$1", [practiceId]);
      await moves(NV, "/practice", CW, "practice at Clearway's skin"); await stays(`${CW}/practice`, "practice at Clearway");
      await sql.query("update public.engagements set skin='novetera' where id=$1", [practiceId]);
      await moves(CW, "/practice", NV, "practice at Novetera's skin"); await stays(`${NV}/practice`, "practice at Novetera"); await moves(CW, "/PRACTICE", NV, "PRACTICE");
      await sql.query("update public.engagements set skin=$2 where id=$1", [practiceId, practiceSkin]);
    });
    await step("a facilitator page at the Novetera address lands at the Clearway one; a change there is refused", async () => {
      for (const path of ["/sign-in", "/setup?tab=a", `/setup/${noveteraRoom.id}/details`, "/control", `/remote/${noveteraRoom.id}`, "/auth/callback?code=x"]) await moves(NV, path, CW, "facilitator page");
      const lands = await browser!.newContext(); const page = await lands.newPage(); await page.goto(`${NV}/setup`);
      assert.equal(new URL(page.url()).origin, CW, "the browser ends at the Clearway address"); assert.equal(new URL(page.url()).pathname, "/sign-in", "and its sign-in page"); await lands.close();
      for (const path of ["/auth/google", "/api/setup", `/api/control/${noveteraRoom.id}`, `/api/tv/control/${noveteraRoom.id}`, "/api/templates"]) {
        assert.equal((await post(NV + path)).status(), 403, `POST ${path} at Novetera is refused`); assert.equal((await post(NV + path, NV)).status(), 403); assert.equal((await post(NV + path, CW)).status(), 403);
        assert.equal((await post(CW + path, NV)).status(), 403, `POST ${path} from Novetera's origin is refused at Clearway`);
      }
      assert.match(await (await get(`${NV}/robots.txt`)).text(), /Disallow: \//, "Novetera is hidden from search engines"); assert.match(await (await get(`${CW}/robots.txt`)).text(), /Disallow: \//);
    });
    await step("a change from the other address is refused, from its own address accepted", async () => {
      for (const path of [`/api/room/${noveteraRoom.id}/init`, `/api/live/${noveteraRoom.id}/candidate`, "/api/tv", "/api/tv/ack"]) {
        assert.equal((await post(NV + path, CW)).status(), 403, `${path} at Novetera from Clearway's origin`); assert.equal((await post(CW + path, NV)).status(), 403, `${path} at Clearway from Novetera's origin`);
        for (const bad of [undefined, "null", "https://live.novetera.co", "http://evil.example"]) assert.equal((await post(NV + path, bad)).status(), 403, `${path} with origin ${bad}`);
      }
      const init = await post(`${NV}/api/room/${noveteraRoom.id}/init`, NV); assert.equal(init.status(), 200, "a Novetera room starts sign-in from Novetera's origin"); assert.equal((await post(`${CW}/api/room/${clearwayRoom.id}/init`, CW)).status(), 200);
    });
    await step("every cookie is host-only, Lax and HttpOnly at both addresses", async () => {
      for (const [origin, id] of [[CW, clearwayRoom.id], [NV, noveteraRoom.id]]) {
        const ctx = await browser!.newContext(), page = await ctx.newPage(); await page.goto(`${origin}/room/${id}`); await page.locator("#room-email").waitFor();
        const cookies = await until(async () => { const c = await ctx.cookies(); return c.length ? c : null; }, "the device cookie", 10000);
        for (const c of cookies) { assert.equal(c.domain, new URL(origin).hostname, `${c.name} is host-only (no leading dot)`); assert.equal(c.sameSite, "Lax"); assert.ok(c.httpOnly, c.name); assert.equal(c.path, "/"); }
        assert.deepEqual(await ctx.cookies(origin === CW ? NV : CW), [], "and the other address sees none of them"); await ctx.close();
      }
    });
    await step("a TV opened at the Novetera address pairs from the Clearway control surface", async () => {
      const tvContext = await browser!.newContext({ viewport: { width: 1920, height: 1080 } }), tv = await tvContext.newPage(); await tv.goto(NV + "/tv");
      assert.equal(new URL(tv.url()).origin, NV, "the TV stays at Novetera's address");
      const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
      const facContext = await browser!.newContext(); await facContext.addCookies(fac.cookies(CW));
      const paired = await facContext.request.post(`${CW}/api/tv/control/${noveteraRoom.id}`, { headers: { origin: CW }, data: { action: "pair", code, label: "Novetera TV" } });
      assert.equal(paired.status(), 200, await paired.text());
      await until(async () => (await tv.locator(".tv-pair.is-active").count()) === 0 && (await tvContext.cookies(NV)).some(c => c.name.startsWith("cw-tv") && c.name !== "cw-tv-device"), "the TV is paired", 20000);
      assert.deepEqual((await tvContext.cookies(CW)), [], "the TV has no cookie at the Clearway address");
      assert.ok((await tvContext.cookies(NV)).every(c => c.domain === new URL(NV).hostname && c.httpOnly && c.sameSite === "Lax"), "the TV's cookies are host-only, HttpOnly and Lax");
      const wrongOrigin = await facContext.request.post(`${CW}/api/tv/control/${noveteraRoom.id}`, { headers: { origin: NV }, data: { action: "pair", code, label: "Other" } });
      assert.equal(wrongOrigin.status(), 403, "the control surface does not accept the Novetera origin"); await facContext.close(); await tvContext.close();
    });
    await step("after a skin switch the old link redirects, and a phone already signed in stays where it is", async () => {
      const phone = async (origin: string, person: { email: string }, id: string): Promise<BrowserContext> => {
        const ctx = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await ctx.newPage(); await page.goto(`${origin}/room/${id}`);
        const before = mail.count; await page.fill("#room-email", person.email); await page.getByRole("button", { name: "Send me a sign-in code" }).click();
        await page.fill("#room-code", await mail.code(person.email, before)); await page.getByRole("button", { name: "Sign in" }).click(); await page.locator(".ph-app").waitFor({ timeout: 15000 }); await page.close(); return ctx;
      };
      const signedIn = async (ctx: BrowserContext, origin: string, id: string) => { const page = await ctx.newPage(); await page.goto(`${origin}/${cwCode}`); const where = page.url(); const status = await page.evaluate(async path => (await (await fetch(path)).json()).status, `/api/room/${id}/status`); await page.close(); return { where, status }; };
      const inside = await phone(CW, clearwayRoom.attendees[0], clearwayRoom.id);
      assert.equal((await signedIn(inside, CW, clearwayRoom.id)).status, "signed_in");
      await sql.query("update public.engagements set skin='novetera' where id=$1", [clearwayRoom.id]);   // what the Details page saves
      await moves(CW, `/${cwCode}`, NV, "old code link after the switch"); await moves(CW, `/r/${cwCode}`, NV, "old /r/ link"); await moves(CW, `/join?code=${cwCode}`, NV, "old /join link"); await moves(CW, `/room/${clearwayRoom.id}`, NV, "old room link");
      await stays(`${NV}/${cwCode}`, "the new address answers"); await stays(`${NV}/room/${clearwayRoom.id}`, "the new address answers");
      const fresh = await browser!.newContext(), page = await fresh.newPage(); await page.goto(`${CW}/${cwCode}`);
      assert.equal(new URL(page.url()).origin, NV, "a phone with no session lands at Novetera's address"); assert.equal(new URL(page.url()).pathname, `/room/${clearwayRoom.id}`); await fresh.close();
      const stayed = await signedIn(inside, CW, clearwayRoom.id);
      assert.equal(new URL(stayed.where).origin, CW, "the signed-in phone stays at the Clearway address"); assert.equal(new URL(stayed.where).pathname, `/room/${clearwayRoom.id}`); assert.equal(stayed.status, "signed_in", "and is still signed in");
      assert.deepEqual((await inside.cookies(NV)), [], "it never got a cookie at the other address"); await inside.close();
      // And back: nothing is remembered, the link follows the skin again.
      await sql.query("update public.engagements set skin='clearway' where id=$1", [clearwayRoom.id]); await moves(NV, `/${cwCode}`, CW, "after switching back"); await stays(`${CW}/${cwCode}`, "back at Clearway");
    });
    console.log("Two-addresses kit passed.");
  } finally {
    await sql.query("update public.engagements set skin=$2 where id=$1", [practiceId, practiceSkin]).catch(() => undefined);
    await browser?.close(); app.stop(); await mail.close(); await sql.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
