// Milestone 5, step 3b in real browsers against the production build and the local stack: a facilitator
// promotes a scribe quote to the TV (PromotedQuote, FAC-01) while phones keep answering a live word cloud.
// Two paired TVs and the control surface agree; the quote is anonymous (no speaker, scribe or card id);
// answers keep landing on the step underneath; taking it down leaves the step exactly as it was, with no
// blank frame, no reload and no lost answer; a second quote crossfades over the first; the remote can take
// it down; a step change, the team-led block and nothing-live behave; long quotes fit at the default room
// size and at Medium; reduced motion shows the final state at once. KIT_SHOTS=<folder> saves the screens.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { watcher } from "./frame-watch";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

// Records, on every frame, how much of a quote is showing (the combined cover of the quote cards) and how
// dark the scrim is, while `watch` is set. A crossfade keeps a quote in view; taking down never dims the step.
const quoteWatcher = `(() => {
  const w = window; if (w.__pq) return;
  const q = w.__pq = { watch: false, minCover: 1, minScrim: 1, frames: 0 };
  const read = () => {
    if (q.watch) {
      q.frames++;
      const spots = [...document.querySelectorAll(".pq-spot")], cover = 1 - spots.reduce((x, s) => x * (1 - +getComputedStyle(s).opacity), 1);
      const scrim = document.querySelector(".pq-scrim"); q.minCover = Math.min(q.minCover, cover); if (scrim) q.minScrim = Math.min(q.minScrim, +getComputedStyle(scrim).opacity);
    }
    requestAnimationFrame(read);
  };
  requestAnimationFrame(read);
})()`;

const first = "If we weren’t here, the city would notice and some of them would miss us.";
const second = "Our doors are open and our table is long.";
const long = Array.from({ length: 24 }, (_, i) => `Sentence ${i + 1}: we keep coming back to the table because that is where strangers become neighbours, and neighbours become the people who carry us.`).join(" ").slice(0, 1990);

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shots = process.env.KIT_SHOTS;
  const shot = async (page: Page, name: string) => { if (shots) { await delay(900); await page.screenshot({ path: `${shots}/promoted-quote-${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    const room = await engagement(sql, ["Priya", "Ben"]);
    const scribe = { id: randomUUID(), name: "Sam Scribe" };
    await sql.query("insert into public.attendees(id,engagement_id,name,email,room_role) values($1,$2,$3,$4,'scribe')", [scribe.id, room.id, scribe.name, `sam-${randomUUID().slice(0, 6)}@example.org`]);
    const cloud = await room.session("Celebration", "word_cloud", "One word for what God is doing at Riverside", 1);
    const wall = await room.session("Five Lenses: Community", "wall", "It’s 2036. Describe our Community.", 2);
    const team = await room.session("Team-led: commander’s intent", "wall", "Your team writes the commander’s intent.", 3);
    await sql.query("update public.sessions set team_led=true where id=$1", [team]);
    const ids = { first: randomUUID(), second: randomUUID(), long: randomUUID(), decision: randomUUID(), speakerOnly: randomUUID() };
    const card = (id: string, session: string, kind: string, text: string, speaker: string | null, ago: number) => sql.query(
      "insert into private.scribe_cards(id,engagement_id,session_id,kind,text,speaker,attendee_id,captured_at) values($1,$2,$3,$4,$5,$6,$7,now()-($8||' seconds')::interval)", [id, room.id, session, kind, text, speaker, scribe.id, ago]);
    await card(ids.decision, cloud, "decision", "We will meet monthly.", null, 50);
    await card(ids.first, cloud, "quote", first, "Pat Alder", 40);
    await card(ids.second, cloud, "quote", second, "Dana Cho", 30);
    await card(ids.long, cloud, "quote", long, null, 20);
    const fac = await facilitator(env, sql, room.id);
    browser = await chromium.launch();

    async function pairedTv(label: string, extra: { reducedMotion?: "reduce" } = {}) {
      const context = await browser!.newContext({ viewport: { width: 1920, height: 1080 }, ...extra });
      const page = await context.newPage(); await page.goto(app.origin + "/tv");
      const code = await until(async () => { const c = (await page.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
      await pairTv(fac, room.id, app.secret, code, label);
      await page.locator(".tv-church-logo").waitFor({ timeout: 15000 });
      return { context, page };
    }
    const tvA = await pairedTv("Front TV"), tvB = await pairedTv("Side TV");
    const tv = tvA.page;
    async function phone(person: { email: string }) {
      const ctx: BrowserContext = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage(); await page.goto(`${app.origin}/room/${room.id}`);
      const before = mail.count;
      await page.fill("#room-email", person.email); await page.getByRole("button", { name: "Send me a sign-in code" }).click();
      await page.fill("#room-code", await mail.code(person.email, before)); await page.getByRole("button", { name: "Sign in" }).click();
      await page.locator(".ph-app").waitFor({ timeout: 15000 });
      return { ctx, page };
    }
    const [priya, ben] = [await phone(room.attendees[0]), await phone(room.attendees[1])];
    const send = async (page: Page, text: string) => { await page.fill("#ph-answer", text); await page.locator(".ph-send").click(); };
    const board = (page: Page) => page.locator(".tv-layer:not(.is-leaving) .tv-board");
    const boardText = async (page: Page) => (await board(page).innerText()).toLowerCase();
    const tally = async (page: Page) => (await page.locator(".tv-top .tv-tally").getAttribute("aria-label").then(v => v ?? "")).trim();
    const promoted = async () => (await sql.query("select count(*)::int as n from private.scribe_cards where engagement_id=$1 and promoted_at is not null and not deleted", [room.id])).rows[0].n as number;
    const quoteOn = (page: Page) => page.locator(".pq-spot.is-on");
    const quoteText = async (page: Page) => (await quoteOn(page).locator(".pq-text").innerText()).replace(/\s+/g, " ").trim();

    const facContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await facContext.addCookies(fac.cookies(app.origin));
    const control = await facContext.newPage();
    await control.goto(`${app.origin}/control/${room.id}`);
    const remoteContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await remoteContext.addCookies(fac.cookies(app.origin));
    const remote = await remoteContext.newPage(); await remote.goto(`${app.origin}/remote/${room.id}`);
    await remote.getByRole("button", { name: "Next" }).waitFor({ timeout: 15000 });
    const cardOf = (text: string) => control.locator("[data-testid=scribe-feed] .scr-card", { hasText: text.slice(0, 24) });

    await press(fac, sql, room.id, "go_live", { session: cloud });
    await tv.locator(".tv-layer.is-input:not(.is-leaving) .tv-board").waitFor({ timeout: 10000 });
    await tvB.page.locator(".tv-layer.is-input:not(.is-leaving) .tv-board").waitFor({ timeout: 10000 });
    await send(priya.page, "youth"); await send(ben.page, "hope");
    await until(async () => (await boardText(tv)).includes("youth") && (await boardText(tv)).includes("hope"), "first words on the TV");
    await control.locator("[data-testid=scribe-feed] .scr-card").first().waitFor({ timeout: 10000 });
    await tv.evaluate(watcher); await tv.evaluate(quoteWatcher);
    await tv.evaluate(() => { (window as unknown as { __kit: number }).__kit = 1; });

    await step("Promote is on quote cards only, and the feed shows no speaker", async () => {
      assert.equal(await cardOf(first).getByRole("button", { name: "Promote to TV" }).isEnabled(), true);
      assert.equal(await cardOf(second).getByRole("button", { name: "Promote to TV" }).isEnabled(), true);
      assert.equal(await cardOf("We will meet monthly").getByRole("button", { name: /Promote to TV/ }).count(), 0, "a decision has no Promote");
      assert.equal((await control.locator("[data-testid=scribe-feed]").innerText()).includes("Pat Alder"), false);
      await shot(control, "01-feed");
    });

    await step("Promote: every TV and the control surface show the words, anonymously", async () => {
      await tv.evaluate(() => { (window as unknown as { __pq: { watch: boolean } }).__pq.watch = true; });
      const t0 = Date.now();
      await cardOf(first).getByRole("button", { name: "Promote to TV" }).click();
      await quoteOn(tv).waitFor({ timeout: 4000 }); const onA = Date.now() - t0;
      await quoteOn(tvB.page).waitFor({ timeout: 4000 });
      console.log(`  promote to first TV: ${onA} ms`);
      // Press to TV includes the browser, the route and the fit measure, so this is a guard against a stall on a shared machine; the sub-second target is the phone to TV path that test:load measures.
      assert.ok(onA < 2500, `the quote reached the TV in ${onA} ms`);
      assert.equal(await quoteText(tv), `“${first}”`);
      assert.equal(await quoteText(tvB.page), `“${first}”`);
      assert.match(await quoteOn(tv).locator(".tv-spot-eyebrow").innerText(), /From the room/i);
      assert.equal((await quoteOn(tv).locator(".pq-session").innerText()).trim(), "Celebration");
      // Light then bold: the second half of the words is bold.
      assert.ok(await quoteOn(tv).locator(".pq-text strong").count() === 1);
      const html = await tv.content();
      for (const secret of ["Pat Alder", "Sam Scribe", ids.first, ids.second, ids.decision, scribe.id]) assert.equal(html.includes(secret), false, `the TV page never carries ${secret}`);
      const payload = JSON.stringify(await fac.client.rpc("live_snapshot", { p_engagement: room.id }).then(r => (r.data as { promoted_quote: unknown }).promoted_quote));
      assert.deepEqual(Object.keys(JSON.parse(payload)).sort(), ["session", "text"]);
      await control.locator(".tv-mirror .pq-spot.is-on").waitFor({ timeout: 5000 });
      await control.locator("[data-testid=scribe-feed] .scr-card.is-promoted").waitFor({ timeout: 5000 });
      assert.match(await cardOf(first).innerText(), /On the TV/);
      assert.equal(await cardOf(first).getByRole("button", { name: "Take off the TV" }).isVisible(), true);
      assert.equal(await promoted(), 1);
      await shot(tv, "02-promoted-1920x1080");
      await shot(control, "03-control-promoted");
    });

    await step("Phones stay on the live step while a quote is up", async () => {
      assert.equal(await priya.page.locator("#ph-answer").isVisible(), true);
      assert.equal((await priya.page.locator("body").innerText()).includes("city would notice"), false);
    });

    await step("Answers keep landing on the step underneath while the quote is up", async () => {
      const before = await tally(tv);
      const t0 = Date.now();
      await send(priya.page, "mercy"); await send(ben.page, "joy");
      await until(async () => (await boardText(tv)).includes("mercy") && (await boardText(tv)).includes("joy"), "answers land under the quote", 3000);
      console.log(`  answers under the quote: ${Date.now() - t0} ms`);
      await until(async () => (await tally(tv)) !== before, "the count moves", 3000);
      await quoteOn(tv).waitFor({ timeout: 2000 });
      assert.equal(await quoteText(tv), `“${first}”`, "and the quote is still up");
    });

    await step("Take down returns the TV to the live step exactly as it is: no blank, no reload, no lost answer", async () => {
      await until(async () => (await tally(tv)) === "4 answers from 2 people", "the count settles at four", 5000);
      const counted = await tally(tv);
      await cardOf(first).getByRole("button", { name: "Take off the TV" }).click();
      await until(async () => (await quoteOn(tv).count()) === 0, "the quote comes off", 4000);
      await until(async () => (await tv.locator(".pq-spot").count()) === 0 && (await tvB.page.locator(".pq-spot").count()) === 0, "the layers are gone on both TVs", 4000);
      assert.equal(await promoted(), 0);
      const text = await boardText(tv);
      for (const word of ["youth", "hope", "mercy", "joy"]) assert.ok(text.includes(word), `${word} is still on the step`);
      assert.equal(await tally(tv), counted, "no answer was lost");
      assert.equal(await tv.evaluate(() => (window as unknown as { __kit?: number }).__kit === 1), true, "the TV page was not reloaded");
      const acc = await tv.evaluate(() => { const w = window as unknown as { __acc: { blank: number; dim: number; frames: number }; __pq: { watch: boolean; frames: number; minScrim: number } }; w.__pq.watch = false; return { ...w.__acc, pq: w.__pq.frames }; });
      console.log(`  frames sampled while the quote was up and coming down: ${acc.frames}, blank ${acc.blank}, dim ${acc.dim}`);
      assert.equal(acc.blank, 0, "no blank frame on the step"); assert.equal(acc.dim, 0, "the step never dimmed");
      await control.locator("[data-testid=scribe-feed] .scr-card.is-promoted").waitFor({ state: "detached", timeout: 5000 });
      await shot(tv, "04-after-take-down");
    });

    await step("Promoting another quote replaces the first with a crossfade that never leaves the screen empty", async () => {
      await cardOf(first).getByRole("button", { name: "Promote to TV" }).click();
      await quoteOn(tv).waitFor({ timeout: 4000 });
      await delay(1200);
      await tv.evaluate(() => { const q = (window as unknown as { __pq: { watch: boolean; minCover: number; minScrim: number; frames: number } }).__pq; q.minCover = 1; q.minScrim = 1; q.frames = 0; q.watch = true; });
      await cardOf(second).getByRole("button", { name: "Promote to TV" }).click();
      await until(async () => (await quoteOn(tv).count()) === 1 && (await quoteText(tv)) === `“${second}”`, "the second quote", 4000);
      await until(async () => (await tv.locator(".pq-spot").count()) === 1, "the first layer leaves", 4000);
      const seen = await tv.evaluate(() => { const q = (window as unknown as { __pq: { watch: boolean; minCover: number; minScrim: number; frames: number } }).__pq; q.watch = false; return q; });
      console.log(`  crossfade frames ${seen.frames}, least cover ${seen.minCover.toFixed(2)}, least scrim ${seen.minScrim.toFixed(2)}`);
      assert.ok(seen.minCover >= 0.5, `a quote stayed in view all through the swap (${seen.minCover})`);
      assert.ok(seen.minScrim >= 0.99, "and the scrim never lifted");
      assert.equal(await promoted(), 1, "one promoted quote at a time");
      assert.equal(await quoteText(tvB.page), `“${second}”`);
      assert.match(await cardOf(second).innerText(), /On the TV/); assert.doesNotMatch(await cardOf(first).innerText(), /On the TV/);
      await shot(tv, "05-replaced");
    });

    await step("The remote shows the quote and takes it down", async () => {
      await remote.locator("[data-testid=quote-on-tv]").waitFor({ timeout: 8000 });
      assert.match(await remote.locator("[data-testid=quote-on-tv]").innerText(), /Our doors are open/);
      await shot(remote, "06-remote");
      await remote.getByRole("button", { name: "Take off the TV" }).click();
      await until(async () => (await quoteOn(tv).count()) === 0 && (await promoted()) === 0, "the remote took it down", 4000);
      await remote.locator("[data-testid=quote-on-tv]").waitFor({ state: "detached", timeout: 5000 });
    });

    await step("Long quotes wrap and shrink inside the screen at the default room size and at Medium", async () => {
      for (const size of ["very_small", "medium"]) {
        await press(fac, sql, room.id, "room_size", { size });
        await until(async () => (await tv.locator("main.tv-viewport").getAttribute("data-room")) === size, `room size ${size}`, 5000);
        for (const [label, ids2] of [["long", ids.long], ["short", ids.second]] as const) {
          await control.evaluate(async ([engagement, id]) => { await fetch(`/api/control/${engagement}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "promote", card: id }) }); }, [room.id, ids2]);
          await until(async () => (await quoteOn(tv).count()) === 1 && (await tv.locator(".pq-spot").count()) === 1, `${label} quote on at ${size}`, 6000);
          await delay(1200);
          const fit = await quoteOn(tv).evaluate(el => {
            const box = el.getBoundingClientRect(), stage = document.querySelector(".tv-stage")!.getBoundingClientRect(), text = el.querySelector(".pq-text") as HTMLElement;
            const spans = [...text.querySelectorAll("span, strong")].map(s => s.getBoundingClientRect());
            return { height: el.getBoundingClientRect().height / (stage.width / 1920), wide: el.classList.contains("is-wide"), top: box.top - stage.top, bottom: stage.bottom - box.bottom, left: box.left - stage.left, right: stage.right - box.right, size: parseFloat(getComputedStyle(text).fontSize),
              columns: el.classList.contains("is-columns"), inside: spans.every(r => r.bottom <= box.bottom + 1 && r.right <= box.right + 1 && r.left >= box.left - 1 && r.top >= box.top - 1), scaled: stage.width / 1920 };
          });
          console.log(`  ${label} at ${size}: font ${fit.size.toFixed(1)}px, columns ${fit.columns}, wide ${fit.wide}, height ${fit.height.toFixed(0)}, margins top ${fit.top.toFixed(0)} bottom ${fit.bottom.toFixed(0)}`);
          assert.ok(fit.top >= 0 && fit.bottom >= 0 && fit.left >= 0 && fit.right >= 0, `the ${label} quote stays on the screen at ${size}`);
          assert.ok(fit.inside, `every word of the ${label} quote is inside its card at ${size}`);
          assert.ok(fit.height <= 833, `the ${label} quote card fits the screen (${fit.height}px)`);
          if (label === "long") assert.ok(fit.wide, "a long quote widens the card");
          assert.ok(fit.size >= 24, "the type never goes below the up-close size");
          if (label === "short") assert.ok(fit.size >= 56, "a short quote stays at headline size");
          await shot(tv, `07-${label}-${size}`);
          await control.evaluate(async engagement => { await fetch(`/api/control/${engagement}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "take_down" }) }); }, room.id);
          await until(async () => (await tv.locator(".pq-spot").count()) === 0, "taken down", 5000);
        }
      }
      await press(fac, sql, room.id, "room_size", { size: "very_small" });
    });

    await step("A step change takes the quote down", async () => {
      await cardOf(first).getByRole("button", { name: "Promote to TV" }).click();
      await quoteOn(tv).waitFor({ timeout: 4000 });
      await press(fac, sql, room.id, "go_live", { session: wall });
      await until(async () => (await tv.locator(".pq-spot").count()) === 0, "the quote came down with the step", 6000);
      await until(async () => (await tv.locator(".tv-layer:not(.is-leaving)").last().getAttribute("data-kind")) === "wall", "the wall is live", 6000);
      assert.equal(await promoted(), 0);
      await press(fac, sql, room.id, "go_live", { session: cloud });
      await tv.locator(".tv-layer.is-input:not(.is-leaving) .tv-board").waitFor({ timeout: 8000 });
      assert.equal(await tv.locator(".pq-spot").count(), 0, "and does not come back with the step");
    });

    await step("Not during a team-led step, and not with nothing live: Promote is off with a plain reason", async () => {
      await press(fac, sql, room.id, "go_live", { session: team });
      const reason = control.locator("[data-testid=scribe-feed] .scr-promote-why").first();
      await sql.query("update private.scribe_cards set session_id=$2 where id=$1", [ids.first, team]);
      await control.reload(); await control.locator("[data-testid=scribe-feed] .scr-card").first().waitFor({ timeout: 10000 });
      assert.match(await reason.innerText(), /team has the room/);
      assert.equal(await control.getByRole("button", { name: "Promote to TV" }).first().isDisabled(), true);
      const status = await control.evaluate(async ([engagement, id]) => (await fetch(`/api/control/${engagement}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "promote", card: id }) })).status, [room.id, ids.first]);
      assert.equal(status, 409);
      await shot(control, "08-team-led-off");
      await sql.query("update private.scribe_cards set session_id=$2 where id=$1", [ids.first, cloud]);
      await press(fac, sql, room.id, "nothing_live");
      await control.reload(); await control.locator("[data-testid=scribe-feed] .scr-card").first().waitFor({ timeout: 10000 });
      assert.match(await control.locator("[data-testid=scribe-feed] .scr-promote-why").first().innerText(), /Put a step on the TV first/);
      await press(fac, sql, room.id, "go_live", { session: cloud });
      await tv.locator(".tv-layer.is-input:not(.is-leaving) .tv-board").waitFor({ timeout: 8000 });
    });

    await step("Only a facilitator can promote or take down (a phone and an unsigned caller are refused)", async () => {
      const call = (page: Page, body: unknown) => page.evaluate(async ([engagement, payload]) => (await fetch(`/api/control/${engagement}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })).status, [room.id, body] as const);
      assert.ok([401, 403].includes(await call(priya.page, { action: "promote", card: ids.first })));
      assert.ok([401, 403].includes(await call(priya.page, { action: "take_down" })));
      const anon = await fetch(`${app.origin}/api/control/${room.id}/quote`, { method: "POST", headers: { Origin: app.origin, "Content-Type": "application/json" }, body: JSON.stringify({ action: "take_down" }) });
      assert.ok([401, 403].includes(anon.status));
      assert.equal(await promoted(), 0);
    });

    await step("Reduced motion shows the final state at once", async () => {
      const calm = await pairedTv("Calm TV", { reducedMotion: "reduce" });
      await calm.page.locator(".tv-layer.is-input:not(.is-leaving) .tv-board").waitFor({ timeout: 10000 });
      await cardOf(second).getByRole("button", { name: "Promote to TV" }).click();
      await quoteOn(calm.page).waitFor({ timeout: 4000 });
      const opacity = await calm.page.evaluate(() => +getComputedStyle(document.querySelector(".pq-spot.is-on")!).opacity), scrim = await calm.page.evaluate(() => +getComputedStyle(document.querySelector(".pq-scrim")!).opacity);
      assert.equal(opacity, 1); assert.equal(scrim, 1);
      await cardOf(second).getByRole("button", { name: "Take off the TV" }).click();
      await until(async () => (await calm.page.locator(".pq-spot").count()) === 0, "taken down at once", 3000);
      await calm.context.close();
    });

    await step("A TV that reloads mid-quote shows it from the snapshot", async () => {
      await cardOf(second).getByRole("button", { name: "Promote to TV" }).click();
      await quoteOn(tv).waitFor({ timeout: 4000 });
      await tvB.page.reload();
      await quoteOn(tvB.page).waitFor({ timeout: 15000 });
      assert.equal(await quoteText(tvB.page), `“${second}”`);
      await cardOf(second).getByRole("button", { name: "Take off the TV" }).click();
      await until(async () => (await tv.locator(".pq-spot").count()) === 0 && (await tvB.page.locator(".pq-spot").count()) === 0, "down on both", 5000);
    });

    console.log(`\n${passed.length} promoted quote checks passed.`);
  } finally {
    await browser?.close(); app.stop(); await mail.close(); await sql.end();
  }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
