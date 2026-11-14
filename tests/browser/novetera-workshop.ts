// One Novetera team workshop, start to finish, in real browsers against the production build and the local stack, and the proof that a
// Novetera room never shows or sends the word Clearway. The harness serves one app at two loopback names: http://localhost:<port> is
// Clearway's address (APP_ORIGIN) and http://127.0.0.1:<port> is Novetera's (NOVETERA_ORIGIN). The facilitator works at the Clearway address
// (setup, control surface, results) and the room (TV, phones, emails, the Word summary) lives at the Novetera address.
//   1. An admin sets a workshop up (open joining, an attendee list, AI on with the scripted fake model), switches it to Novetera on Details,
//      and builds a short run of show: a content screen, a scale, a word cloud, an open wall with AI grouping and Q&A.
//   2. A TV opened at the Novetera address is paired from the Clearway setup pages; phones join four ways (the QR link, the code typed at the
//      Novetera front page, the code typed at the Clearway front page, and an email sign-in whose email is checked); the invite email goes out.
//   3. Every session is answered on the phones and each answer reaches the Novetera TV. Day 1 closes, the results open, the AI drafts the
//      summary and the Word file is checked: creator Novetera, Public Sans, no Clearway anywhere in its XML.
//   4. Mid-session the engagement goes back to Clearway: the TV and phones take the Clearway look, a phone signed in at the Novetera address keeps
//      working, and the old Novetera link lands at the Clearway address.
// Throughout, every Novetera surface is read for the word Clearway (visible text, the tab title, every aria-label, alt and title, the meta
// description, and each email's subject, sender, text and HTML). The facilitator's own screens stay Clearway Live and are not read.
// KIT_SHOTS=<folder> sets where the screenshots go (default docs/evidence/novetera/workshop). Local only: a local mailbox stands in for Resend.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import JSZip from "jszip";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, press, startApp, until } from "./harness";

// The scripted fake model, as the other AI kits run it. Never the API.
const controlDir = join(tmpdir(), `novetera-workshop-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true }); writeFileSync(controlFile, "{}");
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "250", ANTHROPIC_API_KEY: "" });

const people = ["Priya", "Ben", "Ruth"];
const novSender = "Novetera <hello@novetera.test>";
type Phone = { name: string; how: string; ctx: BrowserContext; page: Page };

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  const CW = app.origin, NV = app.noveteraOrigin;
  let browser: Browser | undefined;
  const shots = process.env.KIT_SHOTS || "docs/evidence/novetera/workshop";
  mkdirSync(shots, { recursive: true });
  const passed: string[] = [], audited: string[] = [];
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  const shot = async (page: Page, name: string) => { await delay(900); await page.screenshot({ path: `${shots}/${name}.png` }); };

  // ---------- The Clearway check ----------
  // Everything a person in the room could read or hear: the visible text, the text of every element drawn or not (a screen reader reads
  // some of it), the tab title, the meta description and every aria-label, alt, title and placeholder. Plain script text, so the runner's
  // transform adds no helpers to the page.
  const readable = (page: Page) => page.evaluate(`(() => {
    const out = [["title", document.title]];
    const meta = document.querySelector('meta[name="description"]'); out.push(["meta description", meta ? meta.getAttribute("content") || "" : ""]);
    for (const el of document.querySelectorAll("[aria-label],[alt],[title],[placeholder]")) for (const a of ["aria-label", "alt", "title", "placeholder"]) if (el.hasAttribute(a)) out.push([a + " on <" + el.tagName.toLowerCase() + ">", el.getAttribute(a) || ""]);
    out.push(["visible text", document.body.innerText]);
    const copy = document.body.cloneNode(true); for (const el of copy.querySelectorAll("script,style,noscript,template")) el.remove();
    out.push(["all text", copy.textContent || ""]);
    return out; })()`) as Promise<[string, string][]>;
  const clearway = /clearway/i;   // also catches clearway.co
  async function audit(page: Page, label: string) {
    const hits = (await readable(page)).filter(([, text]) => clearway.test(text)).map(([where, text]) => `${where}: "${text.slice(Math.max(0, text.search(clearway) - 40), text.search(clearway) + 60).replace(/\s+/g, " ")}"`);
    assert.deepEqual(hits, [], `${label} (${page.url()}) says Clearway`);
    audited.push(label);
  }
  // A Novetera email: sent as Novetera, links at the Novetera address, says Novetera, and never Clearway in any part of it.
  type Message = (typeof mail.messages)[number];
  const links = (text: string) => [...text.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)].map(m => m[0]);
  function checkEmail(m: Message, label: string) {
    assert.equal(m.from, novSender, `${label}: sent as Novetera`);
    assert.ok(m.reply_to && !clearway.test(String(m.reply_to)) && /novetera/i.test(String(m.reply_to)), `${label}: replies go to Novetera (${m.reply_to})`);
    const body = `${m.text}\n${m.html ?? ""}`, found = links(body);
    assert.ok(found.length >= 1, `${label}: it has a link`);
    assert.deepEqual([...new Set(found.map(u => new URL(u).origin))], [NV], `${label}: every link is at the Novetera address`);
    assert.match(m.text, /Novetera/, `${label}: the text says Novetera`); if (m.html) assert.match(m.html, /Novetera/, `${label}: the HTML says Novetera`);
    for (const [part, value] of Object.entries({ subject: m.subject ?? "", from: m.from ?? "", reply_to: String(m.reply_to ?? ""), text: m.text, html: m.html ?? "" })) assert.ok(!clearway.test(value), `${label}: Clearway in the email's ${part}`);
    audited.push(`email: ${label}`);
  }

  try {
    await sql.connect();
    const room = await engagement(sql, people);
    const code = (await sql.query("select room_code from public.engagements where id=$1", [room.id])).rows[0].room_code as string;
    await sql.query("update public.engagements set title='Team workshop',type='team_workshop',start_date=current_date+1,settings=settings||'{\"ai_enabled\":true,\"open_join\":true}' where id=$1", [room.id]);
    const fac = await facilitator(env, sql, room.id);
    await sql.query("update public.clearway_users set is_admin=true where email=$1", [fac.session.user.email]);
    const skinNow = async () => (await sql.query("select skin from public.engagements where id=$1", [room.id])).rows[0].skin as string;
    const results = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [room.id])).rows[0]?.results as { total: number; people: number; groups?: unknown[]; words?: { key: string; ai?: boolean }[] };
    browser = await chromium.launch();

    // ---------- Setup ----------
    const facContext = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
    await facContext.addCookies(fac.cookies(CW));
    const setup = await facContext.newPage();
    await step("A workshop engagement with open joining, an attendee list and AI on has Clearway as its Brand until an admin changes it", async () => {
      assert.equal(await skinNow(), "clearway");
      await setup.goto(`${CW}/setup/${room.id}/joining`);
      await setup.getByRole("radio", { name: /Anyone who has the link or code/ }).waitFor();
      assert.equal(await setup.getByRole("radio", { name: /Anyone who has the link or code/ }).isChecked(), true, "open joining");
      await setup.getByRole("heading", { name: "3 people" }).waitFor();
    });
    await step("On Details an admin switches the Brand to Novetera and the room's links move to the Novetera address", async () => {
      await setup.goto(`${CW}/setup/${room.id}/details`);
      await setup.getByRole("combobox", { name: /^Brand/ }).selectOption("novetera");
      await setup.getByRole("button", { name: "Save engagement", exact: true }).click();
      await setup.getByText(/^Saved\./).first().waitFor({ timeout: 15000 });
      await until(async () => await skinNow() === "novetera", "the skin is saved", 10000);
      await setup.goto(`${CW}/setup/${room.id}`);
      assert.equal(await setup.locator(".invite-card a.text-link").getAttribute("href"), `${NV}/${code}`, "the invite card's link is at the Novetera address");
    });
    // The run of show: a content screen, a scale, a word cloud, an open wall with AI grouping and Q&A. All from existing elements.
    const ids: Record<string, string> = {};
    await step("Build a short run of show: content, scale, word cloud, wall and Q&A", async () => {
      ids.prayer = await room.session("Opening prayer", "content", "Let's begin in prayer.", 1); await sql.query("update public.sessions set options=$2 where id=$1", [ids.prayer, { screen: "prayer" }]);
      ids.scale = await room.session("Check-in", "scale", "How full is your tank this week?", 2); await sql.query("update public.sessions set options=$2 where id=$1", [ids.scale, { max: 5, low: "Running on empty", high: "Full and ready" }]);
      ids.cloud = await room.session("One word for this season", "word_cloud", "In one word, how would you describe this season for our team?", 3);
      ids.wall = await room.session("What's working", "wall", "What's working on our team that we should protect?", 4, { maxSends: 10 });
      ids.qa = await room.session("Your questions", "qa", "What questions do you have for each other or for us?", 5, { maxSends: 10, maxChars: 200 });
      await sql.query("update public.sessions set options=$2,max_words=50 where id=$1", [ids.qa, { any_time: false }]);
      assert.equal((await sql.query("select count(*)::int n from public.sessions where engagement_id=$1 and not deleted", [room.id])).rows[0].n, 5);
    });

    // ---------- The TV, paired from the Clearway control surface ----------
    const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } }), tv = await tvContext.newPage();
    const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
    const tvText = async () => (await layer().innerText().catch(() => "")) as string;
    await step("A TV opened at the Novetera address shows the Novetera pairing screen, and the Clearway setup page pairs it", async () => {
      await tv.goto(NV + "/tv");
      await tv.locator(".tv-pair.is-active").waitFor({ timeout: 15000 });
      assert.equal(await tv.locator("main").getAttribute("data-skin"), "novetera");
      await audit(tv, "TV pairing screen"); await shot(tv, "01-tv-pairing");
      const pairingCode = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
      await setup.goto(`${CW}/setup/${room.id}/tv`);
      await setup.locator("#tv-pair-code").fill(pairingCode); await setup.locator("#tv-label").fill("Workshop TV");
      await setup.getByRole("button", { name: "Pair this TV" }).click();
      await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
      await until(async () => (await setup.locator(".tv-screen-list").innerText().catch(() => "")).includes("Workshop TV"), "the TV in Paired screens", 10000);
      assert.equal(new URL(tv.url()).origin, NV, "the TV stayed at the Novetera address");
      assert.deepEqual(await tvContext.cookies(CW), [], "and holds no cookie at the Clearway address");
      await until(async () => await tv.locator("main").getAttribute("data-skin") === "novetera", "the paired TV draws Novetera", 10000);
      await audit(tv, "TV holding screen"); await shot(tv, "02-tv-holding");
    });
    await step("The TV's join screen is Novetera's: the QR code is the Novetera link and the room code reads at the Novetera address", async () => {
      const { data, error } = await fac.client.rpc("tv_manage", { p_engagement: room.id, p_action: "screen", p: { content: "join" } }); assert.equal(error, null); assert.equal(data.status, "ok");
      await tv.locator(".tv-scene.tv-join.is-active").waitFor({ timeout: 15000 });
      const { roomQr } = await import("../../lib/tv/qr");
      // The browser draws the code from the engagement's production address, so the kit draws it the same way: https://live.novetera.co/CODE.
      assert.equal(await tv.locator(".tv-qr-ink").getAttribute("d"), roomQr(code, "novetera").path, "the QR code carries the live.novetera.co link");
      assert.notEqual(roomQr(code, "novetera").path, roomQr(code, "clearway").path, "which is not the Clearway link");
      assert.equal((await tv.locator(".tv-join-link span").first().innerText()).trim(), "live.novetera.co");
      await audit(tv, "TV join screen"); await shot(tv, "03-tv-join");
    });

    // ---------- Phones: four ways in ----------
    const phones: Phone[] = [];
    // The join box's own redirect is built from the Host the server was started with, which the harness makes 0.0.0.0 (so a redirect never collapses to a
    // bare path). Behind Vercel the host is the real one. The phone follows the redirect at the address it asked, and the kit says so here.
    const keepAddress = (ctx: BrowserContext) => ctx.route(url => url.pathname === "/join", async route => {
      // A redirect inside a redirect is not offered to the route again, so the kit follows the /join hops itself (the Clearway address sends a Novetera code on
      // to the Novetera address's /join), then hands the browser the last redirect, the one into the room, with the host of the address it was asked at.
      let at = new URL(route.request().url()), response = await route.fetch({ maxRedirects: 0 });
      for (let hop = 0; hop < 3 && response.status() >= 300 && response.status() < 400; hop++) {
        const next = new URL(response.headers().location, at); if (next.hostname === "0.0.0.0") next.host = at.host;
        if (next.pathname !== "/join") return route.fulfill({ response, headers: { ...response.headers(), location: next.href } });
        at = next; response = await route.fetch({ url: next.href, maxRedirects: 0 });
      }
      return route.fulfill({ response });
    });
    const newPhone = async (name: string, how: string) => { const ctx = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await keepAddress(ctx); const page = await ctx.newPage(); const phone = { name, how, ctx, page }; phones.push(phone); return phone; };
    const enterByName = async (p: Phone) => {
      await p.page.locator("#open-name").waitFor({ timeout: 15000 });
      assert.equal(await p.page.locator(".surface").getAttribute("data-skin"), "novetera", `${p.how}: the sign-in page is Novetera`);
      await audit(p.page, `${p.how}: sign-in page`);
      await p.page.fill("#open-name", p.name); await p.page.getByRole("button", { name: "Join the room" }).click(); await p.page.locator(".ph-app").waitFor({ timeout: 15000 });
    };
    const inRoom = (p: Phone) => { assert.equal(new URL(p.page.url()).origin, NV, `${p.how}: the phone is at the Novetera address`); assert.equal(new URL(p.page.url()).pathname, `/room/${room.id}`, `${p.how}: in the room`); };
    await step("Phone 1 joins by the QR link (live.novetera.co/CODE, here at the Novetera loopback address)", async () => {
      const p = await newPhone("Mia", "QR link"); await p.page.goto(`${NV}/${code}`); await enterByName(p); inRoom(p);
    });
    await step("Phone 2 types the code at the Novetera front page", async () => {
      const p = await newPhone("Noah", "code at the Novetera front page"); await p.page.goto(NV + "/");
      await p.page.locator(".nvj").waitFor(); await audit(p.page, "Novetera front page"); await shot(p.page, "04-phone-novetera-front");
      await p.page.fill("#room-code", `${code.slice(0, 4)}-${code.slice(4)}`); await p.page.getByRole("button", { name: "Join" }).click();
      await p.page.waitForURL(`${NV}/room/${room.id}**`, { timeout: 15000 }); await enterByName(p); inRoom(p);
    });
    await step("Phone 3 types the code at the Clearway front page and lands at the Novetera address", async () => {
      const p = await newPhone("Olive", "code at the Clearway front page"); await p.page.goto(CW + "/");
      await p.page.locator(".home").waitFor(); await p.page.fill("#room-code", code); await p.page.getByRole("button", { name: "Join" }).click();
      await p.page.waitForURL(url => url.origin === NV && url.pathname === `/room/${room.id}`, { timeout: 15000 });
      assert.deepEqual(await p.ctx.cookies(CW), [], "no cookie was set at the Clearway address on the way");
      await enterByName(p); inRoom(p);
    });
    await step("Phone 4 signs in by email: the code comes from the Novetera sender, with Novetera links and words", async () => {
      const priya = room.attendees[0], p = await newPhone("Priya", "email sign-in"); await p.page.goto(`${NV}/room/${room.id}`);
      await p.page.getByRole("button", { name: "Sign in with your email instead" }).click(); await p.page.locator("#room-email").waitFor();
      assert.equal(await p.page.locator(".surface").getAttribute("data-skin"), "novetera");
      await audit(p.page, "email sign-in page"); await shot(p.page, "05-phone-email-sign-in");
      const before = mail.count;
      await p.page.fill("#room-email", priya.email); await p.page.getByRole("button", { name: "Send me a sign-in code" }).click();
      const signIn = await until(() => { const m = mail.messages.slice(before).find(x => x.to.includes(priya.email) && /\b\d{6}\b/.test(x.text)); return m; }, "the sign-in email", 15000);
      checkEmail(signIn, "the sign-in email"); assert.match(signIn.text, /Your Novetera sign-in code/);
      await audit(p.page, "email sign-in page after sending");
      await p.page.fill("#room-code", await mail.code(priya.email, before)); await p.page.getByRole("button", { name: "Sign in" }).click(); await p.page.locator(".ph-app").waitFor({ timeout: 15000 }); inRoom(p);
      assert.equal(phones.length, 4);
    });
    await step("The invite email goes to the attendee list from Novetera, with Novetera links, its AI paragraph and its sign-off", async () => {
      await setup.goto(`${CW}/setup/${room.id}/joining`);
      await setup.getByRole("heading", { name: "6 people" }).waitFor();   // the three on the list and the three who joined by name, who have no email to invite
      const before = mail.count;
      await setup.getByRole("button", { name: "Select all for invites" }).click();
      await setup.getByRole("button", { name: "Send 3 invites" }).click();
      await setup.getByText("Sent 3 invites.").waitFor({ timeout: 20000 });
      await until(() => mail.messages.slice(before).filter(m => /invited to/.test(m.text)).length === 3, "three invites", 15000);
      for (const person of room.attendees) {
        const invite = mail.messages.slice(before).find(m => m.to.includes(person.email) && /invited to/.test(m.text))!; assert.ok(invite, `${person.name} has an invite`);
        checkEmail(invite, `the invite to ${person.name}`);
        assert.match(invite.text, new RegExp(`${NV}/room/${room.id}\\?email=`), "the room link is at the Novetera address");
        assert.match(invite.text, new RegExp(`${NV}/how-we-use-ai`), "so is the AI page");
        assert.match(invite.text, /Novetera reviews every draft/, "Novetera's AI paragraph"); assert.match(invite.text, /\nNovetera\s*$/, "signed Novetera");
      }
    });

    // ---------- The run of show ----------
    const all = <T>(run: (p: Phone, i: number) => Promise<T>) => Promise.all(phones.map(run));
    const bodyOf = (p: Page) => p.locator(".ph-body").innerText().catch(() => "");
    const live = async (id: string, prompt: string) => {
      await press(fac, sql, room.id, "go_live", { session: id });
      await all(p => until(async () => (await p.page.locator(".ph-app").innerText().catch(() => "")).includes(prompt), `${prompt} on ${p.name}'s phone`, 20000));
    };
    const send = async (p: Page, text: string) => {
      await until(async () => { await p.fill("#ph-answer", text, { timeout: 2000 }); await delay(150); return await p.inputValue("#ph-answer") === text && await p.locator(".ph-send").isEnabled(); }, `Send is ready for "${text}"`, 10000);
      await p.locator(".ph-send").click();
    };
    // The audit of every screen for the step: the TV and every phone, with a picture of the TV and one phone.
    const look = async (label: string, n: string, who = 0) => {
      await audit(tv, `TV: ${label}`); for (const p of phones) await audit(p.page, `${p.how}: ${label}`);
      await shot(tv, `${n}-tv`); await shot(phones[who].page, `${n}-phone`);
    };
    const novetera = async () => { assert.equal(await tv.locator("main").getAttribute("data-skin"), "novetera"); for (const p of phones) assert.equal(await p.page.locator(".surface").getAttribute("data-skin"), "novetera", `${p.how} is Novetera`); };
    const control = await facContext.newPage();
    await control.goto(`${CW}/control/${room.id}`); await control.locator(".ctl-app").waitFor({ timeout: 15000 });

    await step("Waiting: every phone is Novetera before anything is live, and so is the TV", async () => {
      await novetera();
      for (const p of phones) await p.page.locator(".ph-head .nvt-mark").waitFor();
      await look("waiting", "06-waiting");
    });
    await step("Content screen: the prayer on the TV, phones away", async () => {
      await press(fac, sql, room.id, "go_live", { session: ids.prayer });
      await until(async () => (await tvText()).includes("Let's begin in prayer."), "the prayer line on the TV", 10000);
      await all(p => until(async () => (await bodyOf(p.page)).includes("Phones away"), `phones away on ${p.name}`, 15000));
      await novetera(); await look("content", "07-content");
    });
    await step("Scale: four taps reach the Novetera TV as the same average", async () => {
      await live(ids.scale, "How full is your tank this week?");
      await until(async () => (await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").catch(() => "")) === "0 answering", "an empty scale", 10000);
      const picks = [4, 3, 5, 2]; await all((p, i) => p.page.getByRole("radio", { name: String(picks[i]) }).click());
      await until(async () => (await results())?.people === 4, "four answers on the server", 15000);
      const average = picks.reduce((a, b) => a + b, 0) / picks.length;
      await until(async () => (await tv.locator(".tv-scale-number").innerText().catch(() => "")) === average.toFixed(1), `the average ${average} on the TV`, 10000);
      await until(async () => (await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").catch(() => "")) === "4 answering", "4 answering on the TV", 10000);
      await all(p => until(async () => (await p.page.locator(".ph-note").innerText().catch(() => "")).includes("Sent"), `sent on ${p.name}'s phone`, 10000));
      await novetera(); await look("scale", "08-scale", 3);
    });
    await step("Word cloud: every phone's words appear on the TV and AI combines near-duplicates, marked as AI", async () => {
      await live(ids.cloud, "In one word, how would you describe this season for our team?");
      // AI starts combining at about 30 different words, so every phone sends two rounds of five.
      const sends = [["youth, hope, joy, grace, family", "momentum, welcome, peace, courage, rest"], ["young people, kids, unity, prayer, music", "mission, healing, light, freedom, love"],
        ["teenagers, children, renewal, harvest, friendship", "care, trust, community, generosity, growth"], ["worship, alpha, stretched, busy, serving", "outreach, change, patience, vision, faith"]];
      for (const round of [0, 1]) await all(async (p, i) => { await send(p.page, sends[i][round]); await until(async () => (await p.page.locator(".ph-answers").innerText().catch(() => "")).includes(sends[i][round].split(",")[0].trim()), `${p.name} sent`, 10000); });
      await until(async () => (await results())?.total === 40, "forty words on the server", 15000);
      // The TV's own count says all forty arrived, and the cloud draws the words (it draws the biggest words large and the rest in a strip that scrolls off the edge, so the kit asks for a few, not every one).
      await until(async () => (await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").catch(() => "")) === "40 answers from 4 people", "40 answers from 4 people on the TV", 10000);
      const wordsSent = sends.flat().flatMap(r => r.split(",").map(w => w.trim().toLowerCase()));
      await until(async () => { const t = (await tvText()).toLowerCase(); return wordsSent.filter(w => t.includes(w)).length >= 5; }, "the words on the TV", 15000);
      await until(async () => (await layer().locator(".tv-word .cwl-ai-mark").count()) >= 1, "a combined word carries the AI mark", 25000);
      assert.equal(await layer().locator(".tv-word .cwl-ai-mark").first().evaluate(el => getComputedStyle(el).getPropertyValue("display")) !== "none", true);
      assert.ok(((await results()).words ?? []).some(w => w.ai), "the server marks the combine as AI");
      await novetera(); await look("word cloud", "09-word-cloud", 0);
    });
    await step("Wall: cards arrive on the TV and AI groups them under labels; the summary waits for Show summary", async () => {
      await live(ids.wall, "What's working on our team that we should protect?");
      await until(async () => (await layer().locator(".ai-wall").getAttribute("data-ai")) === "on", "the AI layout", 10000);
      const cards = [["Three baptisms at Easter", "Teenagers asking to be baptized"], ["Our Alpha course was full", "Alpha guests stayed for church"], ["Young families staying after the service", "New families at the kids program"], ["Volunteers who show up early", "Serving teams that cover for each other"]];
      for (const round of [0, 1]) await all(async (p, i) => { await send(p.page, cards[i][round]); await until(async () => (await p.page.locator(".ph-answers").innerText().catch(() => "")).includes(cards[i][round].slice(0, 12)), `${p.name} sent a card`, 10000); });
      await until(async () => (await results())?.total === 8, "eight cards on the server", 15000);
      await until(async () => ((await results()).groups ?? []).length === 4, "four AI groups on the server", 20000);
      await until(async () => (await layer().locator(".ai-group").count()) >= 1, "groups on the TV", 10000);
      assert.equal(await layer().locator(".ai-groups-head .cwl-ai-mark").count(), 1, "marked as AI");
      for (const card of cards.flat()) assert.ok((await tvText()).includes(card), `"${card}" is on the TV`);
      assert.equal(await layer().locator(".ai-summary:not(.is-off)").count(), 0, "the summary waits");
      await novetera(); await look("wall with AI groups", "10-wall-groups", 1);
      await control.locator("[data-ai-panel]").getByRole("button", { name: "Show summary" }).click();
      await until(async () => (await layer().locator(".ai-summary:not(.is-off) .ai-summary-text").innerText().catch(() => "")).includes("with 8 answers"), "the summary on the TV", 15000);
      await look("wall with the AI summary", "11-wall-summary", 1);
    });
    await step("Q&A: matching questions fold, votes rank them, and every question reaches the TV", async () => {
      await live(ids.qa, "What questions do you have for each other or for us?");
      await until(async () => (await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").catch(() => "")) === "0 questions from 0 people", "no questions yet", 10000);
      const asks = ["When will we start on the shared priorities?", "When do we start the shared priorities work?", "Who will lead the new leaders track?", "How do we protect time for each other?"];
      await all(async (p, i) => { await p.page.locator("#qa-question").waitFor({ timeout: 10000 }); await p.page.fill("#qa-question", asks[i]); await p.page.locator(".qa-ask-form .ph-send").click(); });
      await until(async () => ((await results()) as unknown as { questions?: { askers: number }[] }).questions?.some(q => q.askers === 2), "two matching questions fold into one", 15000);
      await until(async () => (await layer().locator(".qa-row").allInnerTexts()).some(t => t.includes("Asked by 2")), "asked by 2 on the TV", 10000);
      for (const ask of asks.slice(2)) await until(async () => (await tvText()).includes(ask), `"${ask}" on the TV`, 10000);
      await all(async p => { const vote = p.page.locator(".qa-item", { hasText: "Who will lead" }).locator(".qa-vote"); await vote.waitFor({ timeout: 10000 }); if (!(await vote.isDisabled())) await vote.click(); });
      await until(async () => ((await results()) as unknown as { questions: { text: string; rank: number }[] }).questions.find(q => q.text.startsWith("Who will lead"))?.rank === 1, "the voted question rises to the top", 10000);
      await novetera(); await look("Q&A", "12-qa", 2);
    });
    await step("Close Day 1: every session closes, the TV holds, and every phone reads as closed", async () => {
      await control.getByRole("button", { name: "Close Day 1" }).click(); await control.getByRole("button", { name: "Tap again to close Day 1" }).click();
      await until(async () => (await sql.query("select count(*)::int n from public.sessions where engagement_id=$1 and not deleted and state<>'closed'", [room.id])).rows[0].n === 0, "every session closed", 10000);
      await until(async () => await tv.locator(".tv-scene.tv-holding.is-active").count() === 1, "the TV goes to its holding screen", 10000);
      await all(p => until(async () => !(await bodyOf(p.page)).includes("What questions do you have"), `${p.name}'s phone moves on`, 15000));
      await novetera(); await look("closed", "13-closed", 0);
    });

    // ---------- The results, the AI summary and the Word file ----------
    await step("The results open and AI drafts the summary with the fake model; the Word file is Novetera's document", async () => {
      const recap = await facContext.newPage(); await recap.goto(`${CW}/control/${room.id}/recap`);
      await until(async () => await recap.locator(".recap-card").count() === 4, "four cards (every session that took answers)", 10000);
      const card = recap.getByTestId("workshop-summary");
      await card.getByRole("button", { name: "Draft a summary", exact: true }).click();
      await card.getByText("AI drafted this from the room’s answers. Read it before you share it.").waitFor({ timeout: 20000 });
      assert.match(await card.locator(".ws-body").innerText(), /The room began with/);
      const runs = await sql.query("select status,prompt_version from private.ai_runs where engagement_id=$1 and job='draft_workshop_summary'", [room.id]);
      assert.deepEqual(runs.rows.map(r => r.status), ["ok"], "one run, from the fake model");
      const [download] = await Promise.all([recap.waitForEvent("download"), card.getByRole("link", { name: "Download as Word", exact: true }).click()]);
      assert.match(download.suggestedFilename(), /summary\.docx$/); assert.ok(!clearway.test(download.suggestedFilename()), "the file's name");
      const zip = await JSZip.loadAsync(readFileSync((await download.path())!));
      const parts = Object.keys(zip.files).filter(n => /\.(xml|rels)$/i.test(n)); assert.ok(parts.includes("docProps/core.xml") && parts.includes("word/document.xml"));
      const xml: Record<string, string> = Object.fromEntries(await Promise.all(parts.map(async n => [n, await zip.file(n)!.async("string")])));
      assert.match(xml["docProps/core.xml"], /<dc:creator>Novetera<\/dc:creator>/, "the creator is Novetera");
      assert.ok(Object.values(xml).some(x => /Public Sans/.test(x)), "Public Sans is named");
      assert.ok(/Public Sans/.test(xml["word/styles.xml"] ?? "") || /Public Sans/.test(xml["word/document.xml"]), "in its styles or its text");
      assert.deepEqual(parts.filter(n => clearway.test(xml[n])), [], "no Clearway in any XML part of the Word file");
      assert.ok(!Object.keys(zip.files).some(n => clearway.test(n)), "or in a part's name");
      assert.match(xml["word/document.xml"], /Novetera/, "it says Novetera");
      audited.push("the Word summary"); await recap.close();
    });

    // ---------- Back to Clearway, mid-session ----------
    await step("Back to Clearway mid-session: the TV and phones take the Clearway look, a signed-in phone keeps working and the old Novetera link lands at the Clearway address", async () => {
      ids.last = await room.session("One last word", "word_cloud", "One word for how you leave today", 6);
      await live(ids.last, "One word for how you leave today");
      await send(phones[0].page, "grateful"); await until(async () => (await tvText()).includes("grateful"), "the word on the Novetera TV", 10000);
      await novetera(); await shot(tv, "14-before-switch-tv"); await shot(phones[0].page, "14-before-switch-phone");
      await setup.goto(`${CW}/setup/${room.id}/details`);
      await setup.getByRole("combobox", { name: /^Brand/ }).selectOption("clearway"); await setup.getByRole("button", { name: "Save engagement", exact: true }).click();
      await setup.getByText(/^Saved\./).first().waitFor({ timeout: 15000 }); await until(async () => await skinNow() === "clearway", "back to Clearway", 10000);
      // The TV and the phones follow without being touched. A reload is the fallback a person would use, so the kit says which one it needed.
      const follows = async (page: Page, selector: string, label: string) => {
        try { await until(async () => await page.locator(selector).first().getAttribute("data-skin") === "clearway", `${label} takes the Clearway look`, 20000); return "live"; }
        catch { await page.reload(); await until(async () => await page.locator(selector).first().getAttribute("data-skin") === "clearway", `${label} takes the Clearway look after a reload`, 20000); return "after a reload"; }
      };
      const how = [await follows(tv, "main", "the TV"), ...await Promise.all(phones.map(p => follows(p.page, ".surface", `${p.how}'s phone`)))];
      console.log(`  the TV and phones took the Clearway look: ${how.join(", ")}`);
      assert.equal(await tv.locator(".nvt-mark, .nvt-lockup").count(), 0, "no Novetera mark on the TV"); assert.equal(await phones[0].page.locator(".nvt-mark, .nvt-lockup").count(), 0, "or on a phone");
      assert.equal(await phones[0].page.locator(".surface").getAttribute("data-theme"), "dark"); assert.equal(await tv.locator("main").getAttribute("data-theme"), "dark");
      for (const p of phones) assert.equal(new URL(p.page.url()).origin, NV, `${p.how}: the phone stays at the Novetera address`);
      await shot(tv, "15-after-switch-tv"); await shot(phones[0].page, "15-after-switch-phone");
      // A phone already signed in at the Novetera address keeps working there: its next answer still reaches the TV.
      const before = (await results()).total;
      await send(phones[3].page, "rested"); await until(async () => (await results()).total === before + 1, "the answer is accepted at the Novetera address", 10000);
      await until(async () => (await tvText()).includes("rested"), "and reaches the TV", 10000);
      assert.equal((await phones[3].page.evaluate(async path => (await (await fetch(path)).json()).status, `/api/room/${room.id}/status`)), "signed_in", "still signed in");
      // The old Novetera link now lands at the Clearway address.
      const fresh = await browser!.newContext(), visitor = await fresh.newPage(); await visitor.goto(`${NV}/${code}`);
      assert.equal(new URL(visitor.url()).origin, CW, "the old link lands at the Clearway address"); assert.equal(new URL(visitor.url()).pathname, `/room/${room.id}`);
      assert.equal(await visitor.locator(".surface").getAttribute("data-skin"), "clearway"); assert.deepEqual(await fresh.cookies(NV), [], "with no cookie left at the Novetera address"); await fresh.close();
    });

    // ---------- The pages with no engagement yet, at the Novetera address ----------
    await step("The check itself can fail: the Clearway front page and a Clearway room are read and found to say Clearway", async () => {
      const ctx = await browser!.newContext(), page = await ctx.newPage(); await page.goto(CW + "/");
      const hits = (await readable(page)).filter(([, text]) => clearway.test(text)).map(([where]) => where);
      assert.ok(hits.includes("title") && hits.includes("visible text"), `the Clearway front page is flagged (${hits.join(", ")})`);
      await page.goto(`${CW}/room/${room.id}`); await page.locator(".surface").waitFor();
      assert.ok((await readable(page)).some(([, text]) => clearway.test(text)), "and so is a Clearway room's sign-in page"); await ctx.close();
    });
    await step("The Novetera front page, the join and not found pages, the room code page, How we use AI and the TV pairing page never say Clearway", async () => {
      // The engagement is Clearway's again, so a code for it no longer belongs here: these pages are the ones the address alone decides.
      const ctx = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await keepAddress(ctx); const page = await ctx.newPage();
      for (const [path, label, status] of [["/", "front page", 200], ["/join?code=ZZZZZZZZ", "join page with a wrong code", 200], ["/join", "join page with no code", 200], ["/nosuchroomname", "not found page", 404], ["/room", "room code page", 200], ["/how-we-use-ai", "How we use AI", 200]] as const) {
        const res = await page.goto(NV + path); assert.equal(res?.status(), status, label);
        assert.equal(new URL(page.url()).origin, NV, `${label} stays at the Novetera address`);
        assert.equal(await page.locator("[data-skin]").first().getAttribute("data-skin"), "novetera", `${label} is Novetera`);
        await audit(page, `Novetera ${label}`);
        if (path === "/how-we-use-ai") { assert.match(await page.locator("body").innerText(), /Novetera uses Claude/); await shot(page, "16-phone-how-we-use-ai"); }
        if (path === "/nosuchroomname") await shot(page, "17-phone-not-found");
        if (path === "/join?code=ZZZZZZZZ") await page.getByText("We couldn't find a room with that code. Check the screen and try again.").waitFor();
      }
      await ctx.close();
      const tvOnly = await browser!.newContext({ viewport: { width: 1920, height: 1080 } }), pairing = await tvOnly.newPage(); await pairing.goto(NV + "/tv");
      await pairing.locator(".tv-pair.is-active").waitFor({ timeout: 15000 }); await audit(pairing, "a second Novetera TV's pairing screen"); await tvOnly.close();
    });
    await step("Every email the mailbox received for the room was Novetera's and was checked", async () => {
      // The sign-in code, then the three invites, all to people in the room. Nothing was sent after the switch back. (The mailbox can also hold the
      // operations alert the app sends to its operators when a facilitator screen reports an error: it is not addressed to the room and is not read here.)
      const theirs = mail.messages.filter(m => m.to.some(to => room.attendees.some(a => a.email === to)));
      assert.equal(theirs.length, 4, `the room's mail: ${theirs.map(m => m.subject).join(" | ")}`);
      for (const m of theirs) checkEmail(m, `email "${m.subject}" to ${m.to}`);
      const others = mail.messages.filter(m => !theirs.includes(m));
      assert.ok(others.every(m => m.subject === "Check Clearway Live" && !m.to.some(to => room.attendees.some(a => a.email === to))), `no other mail went out: ${others.map(m => `${m.subject} to ${m.to}`).join(" | ")}`);
    });
    console.log(`Novetera workshop kit: ${passed.length} steps passed; ${audited.length} Novetera surfaces read for the word Clearway and none had it. Screenshots in ${shots}.`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally { await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); rmSync(controlDir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exit(1); });
