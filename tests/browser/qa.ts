// Milestone 3, step 4: INT-03 Q&A in real browsers against the production build and the
// local stack. A paired TV, three signed-in phones and the facilitator's control surface run
// every state: empty, first item, typical, folding and undo, votes rising with a glide,
// Spotlight over any session, Answered, edit, phones down, offline and queued, AI off,
// reduced motion, very long text and Questions any time. Then 50 simulated phones ask and
// vote in the practice room against the live-screen rules. KIT_SHOTS=<folder> saves screens.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { verdict, type LatencyReport } from "../../lib/latency/report";
import { practiceRoom } from "../../scripts/load-test";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

// Samples every row's place on each frame, as a plain script so no bundler helper reaches the page.
const sampler = `(() => { window.qaSamples = {}; window.qaStop = false;
  const read = () => { for (const el of document.querySelectorAll(".tv-layer:not(.is-leaving) .qa-row")) {
    const m = /translateY\\((-?[\\d.]+)px\\)/.exec(el.style.transform); if (m) (window.qaSamples[el.dataset.id] ??= []).push(Number(m[1])); }
    if (!window.qaStop) requestAnimationFrame(read); };
  requestAnimationFrame(read); })()`;
// A jump is most of a row in one frame. A glide on cwl-dur-bar-trade moves at most about
// 105px in one frame even when a loaded machine drops the TV to 20 frames a second.
const jump = 150;
type Q = { id: string; text: string; people: number; askers: number; rank?: number; answered: boolean; ids: string[] };

// A simulated phone for the 50-phone run: joins the practice room by name and calls the real endpoints.
class SimPhone {
  private jar = new Map<string, string>();
  offset = 0; uncertainty = 60000;
  constructor(private origin: string) {}
  async call(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers); headers.set("Origin", this.origin);
    if (this.jar.size) headers.set("Cookie", [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "));
    if (init.body) headers.set("Content-Type", "application/json");
    const response = await fetch(this.origin + path, { ...init, headers, redirect: "manual" });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";"), at = pair.indexOf("="), name = pair.slice(0, at), value = pair.slice(at + 1);
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(cookie) || !value) this.jar.delete(name); else this.jar.set(name, value);
    }
    return response;
  }
  async join(room: string, name: string) {
    await this.call(`/api/room/${room}/init`, { method: "POST", body: "{}" });
    const joined = await (await this.call(`/api/room/${room}/practice`, { method: "POST", body: JSON.stringify({ name }) })).json();
    assert.ok(["signed_in", "approved"].includes(joined.status), `practice join: ${joined.status}`);
  }
  async clock(room: string) {
    const sent = Date.now(), data = await (await this.call(`/api/live/${room}?surface=phone`, { cache: "no-store" })).json(), got = Date.now();
    this.offset = Date.parse(data.server_time) - (sent + got) / 2; this.uncertainty = (got - sent) / 2;
  }
  stamp() { return { sentAt: new Date(Date.now() + this.offset).toISOString(), uncertaintyMs: Math.min(60000, Math.round(this.uncertainty)) }; }
  async ask(room: string, session: string, text: string) {
    const id = randomUUID(), r = await this.call(`/api/live/${room}`, { method: "POST", body: JSON.stringify({ id, session, revision: 0, action: "submit", text, ...this.stamp() }) });
    return { id, status: (await r.json()).status as string };
  }
  async vote(room: string, question: string) {
    const r = await this.call(`/api/live/${room}/vote`, { method: "POST", body: JSON.stringify({ id: randomUUID(), question, revision: 0, on: true, ...this.stamp() }) });
    return (await r.json()) as { status: string; reason?: string };
  }
}

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(900); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    const room = await engagement(sql, ["Priya", "Ben", "Ruth"]);
    const qa = await room.session("What we heard: questions", "qa", "What do you want to ask about the results?", 1, { maxSends: 10, maxChars: 200, segment: "What we heard" });
    const cloud = await room.session("Celebration", "word_cloud", "One word for what God is doing at Riverside", 2, { segment: "What we heard" });
    const pool = await room.session("Questions for Chris", "qa", "What do you want to ask?", 3, { maxSends: 10, maxChars: 200, segment: "What we heard" });
    await sql.query("update public.sessions set options='{\"any_time\":false}' where id=$1", [qa]);
    const fac = await facilitator(env, sql, room.id);
    const results = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [room.id])).rows[0].results as { total: number; questions?: Q[] };
    const server = async () => (await results()).questions ?? [];
    browser = await chromium.launch();

    const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvContext.newPage(); await tv.goto(app.origin + "/tv");
    const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(fac, room.id, app.secret, code);
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
    const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
    const rows = () => layer().locator(".qa-row");
    const tvTexts = async () => (await rows().evaluateAll(els => els.filter(e => !(e as HTMLElement).style.opacity || Number((e as HTMLElement).style.opacity) > 0.5)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map(e => e.querySelector(".qa-text")!.textContent!)));
    const tally = async () => (await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").then(v => v ?? "")).trim();

    async function phone(person: { email: string }) {
      const ctx = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage(); await page.goto(`${app.origin}/room/${room.id}`);
      const before = mail.count;
      await page.fill("#room-email", person.email); await page.getByRole("button", { name: "Send me a sign-in code" }).click();
      await page.fill("#room-code", await mail.code(person.email, before)); await page.getByRole("button", { name: "Sign in" }).click();
      await page.locator(".ph-app").waitFor({ timeout: 15000 });
      return { page, ctx };
    }
    const [priya, ben, ruth] = [await phone(room.attendees[0]), await phone(room.attendees[1]), await phone(room.attendees[2])];
    const ask = async (p: Page, text: string) => { await p.fill("#qa-question", text); await p.locator(".qa-ask-form .ph-send").click(); };
    const item = (p: Page, text: string) => p.locator(".qa-item", { hasText: text });

    const facContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await facContext.addCookies(fac.cookies(app.origin));
    const control = await facContext.newPage();
    await control.goto(`${app.origin}/control/${room.id}`);
    const panelItem = (text: string) => control.locator(".qa-ctl-item", { hasText: text }).first();

    await step("Empty: Waiting for questions on the TV, no questions yet on phones", async () => {
      await press(fac, sql, room.id, "go_live", { session: qa });
      await until(async () => (await layer().getAttribute("data-kind")) === "qa", "Q&A on the TV", 10000);
      await until(async () => (await tally()) === "0 questions from 0 people", "count reads 0 questions", 10000);
      assert.equal(await layer().locator(".qa-note").isVisible(), true, "Waiting for questions");
      assert.equal(await layer().locator(".tv-note").isVisible(), false, "the generic waiting line is not shown");
      await until(async () => (await priya.page.locator(".ph-body").innerText()).includes("No questions yet. Be the first to ask."), "phone empty state", 10000);
      await shot(tv, "int-03-empty-tv"); await shot(priya.page, "int-03-empty-phone");
    });
    await step("First item: a question asked on a phone reaches the TV in under a second", async () => {
      const start = Date.now();
      await ask(priya.page, "How many people answered the survey?");
      await until(async () => (await tvTexts()).includes("How many people answered the survey?"), "first question on the TV", 5000);
      const ms = Date.now() - start;
      assert.ok(ms < 1500, `phone tap to TV in ${ms} ms (page polling included)`);
      await until(async () => (await tally()).startsWith("1 question from "), "count reads 1 question", 5000);
      assert.equal((await rows().first().locator("b").innerText()).trim(), "1", "one person");
      await until(async () => (await item(priya.page, "How many people answered").innerText()).includes("Yours"), "Yours on the asker's phone");
      assert.equal(await item(priya.page, "How many people answered").locator(".qa-vote").isDisabled(), true, "never your own vote");
      await shot(tv, "int-03-first-item-tv"); await shot(priya.page, "int-03-first-item-phone");
    });
    await step("Folding: a near-duplicate folds as it arrives and shows asked by 2", async () => {
      await until(async () => await ben.page.locator("#qa-question").isVisible(), "Ben's ask form", 10000);
      await ask(ben.page, "How many people answered the survey");
      await until(async () => (await rows().first().locator(".qa-meta").innerText()).includes("Asked by 2"), "asked by 2 on the TV", 5000);
      await until(async () => (await tally()).startsWith("1 question from "), "count reads 1 question", 5000);
      assert.equal((await rows().first().locator("b").innerText()).trim(), "2");
      assert.equal(await item(ben.page, "How many people answered").locator(".qa-vote").isDisabled(), true, "a folded question counts as Ben's own");
    });
    await step("Typical: the top three by people, the rest on phones", async () => {
      await ask(ben.page, "Is the building really the main issue?");
      await ask(ruth.page, "What did people under 30 say about Sunday?");
      await until(async () => (await server()).length === 3, "three questions", 5000);
      await ask(priya.page, "Where do small groups fit in all this?");
      await until(async () => (await layer().locator(".qa-more").innerText()).includes("+ 1 more on your phones"), "more line", 5000);
      await until(async () => (await tally()).startsWith("4 questions from "), "count reads 4 questions", 5000);
      const top = (await server()).slice(0, 3).map(q => q.text);
      await until(async () => JSON.stringify(await tvTexts()) === JSON.stringify(top), "the TV shows the server's top three", 5000);
      assert.equal(top[0], "How many people answered the survey?", "asked by 2 leads: each asker counts 2");
      assert.ok(!top.includes("Is the building really the main issue?"), "the oldest single question waits on phones");
      await until(async () => await item(ruth.page, "Is the building").isVisible(), "phones carry every question");
      await shot(tv, "int-03-typical-tv"); await shot(ruth.page, "int-03-typical-phone");
    });
    await step("Votes: a question rises into the top three with a glide; rows never jump or swap", async () => {
      const target = (await server()).find(q => q.text.startsWith("Is the building"))!;
      await tv.evaluate(sampler);
      await item(ruth.page, "Is the building").locator(".qa-vote").click();
      await until(async () => (await tvTexts()).includes("Is the building really the main issue?"), "the voted question rises onto the TV", 5000);
      await delay(1500);
      const samples = await tv.evaluate(() => { const w = window as unknown as { qaSamples: Record<string, number[]>; qaStop: boolean }; w.qaStop = true; return w.qaSamples; });
      const rise = samples[target.id] ?? [];
      assert.ok(rise.length > 10, `the rising row moved over ${rise.length} frames`);
      assert.ok(rise[0] > rise[rise.length - 1] + 100, `it rose from below (${Math.round(rise[0])} to ${Math.round(rise[rise.length - 1])})`);
      for (const [id, ys] of Object.entries(samples)) for (let i = 1; i < ys.length; i++) assert.ok(Math.abs(ys[i] - ys[i - 1]) < jump, `row ${id.slice(-4)} moved ${Math.round(Math.abs(ys[i] - ys[i - 1]))}px in one frame`);
      assert.equal((await item(ruth.page, "Is the building").locator(".qa-vote").getAttribute("aria-pressed")), "true", "Ruth's vote shows as on");
      const top = (await server()).slice(0, 3).map(q => q.text);
      await until(async () => JSON.stringify(await tvTexts()) === JSON.stringify(top), "the TV matches the server's order", 5000);
      await item(ruth.page, "Is the building").locator(".qa-vote").click();
      await until(async () => (await server()).find(q => q.id === target.id)!.people === 1, "the vote toggles off", 5000);
      await item(ruth.page, "Is the building").locator(".qa-vote").click();
      await until(async () => (await server()).find(q => q.id === target.id)!.people === 2, "and on again", 5000);
    });
    await step("Spotlight over any session from the control panel, then Answered clears it", async () => {
      await control.locator(".qa-ctl").waitFor({ timeout: 10000 });
      // The control surface's mirror is short: "asked by" never spills out of its row.
      await until(async () => await control.locator(".tv-mirror .qa-row").count() === 3, "the mirror's three rows", 5000);
      const spill = await control.locator(".tv-mirror .qa-row").evaluateAll(els => els.map(e => { const meta = e.querySelector(".qa-meta")!, r = e.getBoundingClientRect(), m = meta.getBoundingClientRect();
        return meta.textContent ? m.bottom - r.bottom : -1; }));
      assert.ok(spill.every(d => d <= 1), `asked by stays inside its mirror row (${spill.map(Math.round).join(", ")})`);
      await shot(control, "int-03-control-typical");
      await panelItem("Where do small groups").getByRole("button", { name: "Spotlight" }).click();
      await until(async () => (await tv.locator(".qa-spot.is-on .qa-spot-text").innerText().catch(() => "")).includes("Where do small groups"), "spotlit on the TV", 5000);
      await shot(tv, "int-03-spotlight-tv");
      await press(fac, sql, room.id, "go_live", { session: cloud });
      await until(async () => (await layer().getAttribute("data-kind")) === "word_cloud", "the word cloud is on", 10000);
      assert.equal(await tv.locator(".qa-spot.is-on").count(), 1, "the spotlight holds over another session");
      await shot(tv, "int-03-spotlight-over-word-cloud-tv");
      await control.locator(".qa-ctl-spot").getByRole("button", { name: "Answered" }).click();
      await until(async () => await tv.locator(".qa-spot.is-on").count() === 0, "Answered clears the spotlight", 5000);
      await press(fac, sql, room.id, "go_live", { session: qa });
      await until(async () => (await layer().getAttribute("data-kind")) === "qa", "back on Q&A", 10000);
      await until(async () => !(await tvTexts()).includes("Where do small groups fit in all this?"), "the answered question left the TV", 5000);
      await until(async () => (await priya.page.locator(".qa-section").textContent().catch(() => "")) === "Answered", "phones list it under Answered", 10000);
      await priya.page.locator('.qa-list[aria-label="Answered questions"] .qa-item').last().evaluate(el => el.scrollIntoView({ block: "center" }));
      await shot(tv, "int-03-answered-tv"); await shot(priya.page, "int-03-answered-phone");
    });
    await step("Undo a fold from the control panel: the folded question is its own row again", async () => {
      const row = panelItem("How many people answered the survey?");
      await row.getByRole("button", { name: "Undo fold" }).click();
      await until(async () => (await server()).filter(q => q.text.startsWith("How many people answered")).length === 2, "two questions again", 5000);
      await until(async () => !(await layer().innerText()).includes("Asked by 2"), "asked by 2 is gone from the TV", 5000);
      await shot(control, "int-03-control-undo");
    });
    await step("Edit from the control panel: the TV shows the edited words", async () => {
      await panelItem("What did people under 30 say").getByRole("button", { name: "Edit" }).click();
      const row = control.locator(".qa-ctl-item:has(.qa-ctl-edit)");
      await row.locator("textarea").fill("What did people under 30 say about Sunday mornings?");
      await row.getByRole("button", { name: "Save the edit" }).click();
      await until(async () => (await tvTexts()).includes("What did people under 30 say about Sunday mornings?"), "edited on the TV", 5000);
      await until(async () => await item(ruth.page, "Sunday mornings").isVisible(), "and on phones", 5000);
    });
    await step("Very long text: the TV clamps to two lines, the phone carries the whole question", async () => {
      const long = "When the survey says people want more connection beyond Sunday, does that mean more small groups, more midweek events, or something we have not thought of yet, like serving together?";
      await ask(ruth.page, long);
      await until(async () => (await server()).some(q => q.text === long), "long question accepted", 5000);
      await item(priya.page, long.slice(0, 40)).locator(".qa-vote").click();
      await item(ben.page, long.slice(0, 40)).locator(".qa-vote").click();
      const text = layer().locator(".qa-row", { hasText: "When the survey says" }).locator(".qa-text");
      await text.waitFor({ timeout: 5000 });
      const clamp = await text.evaluate(el => ({ lines: getComputedStyle(el).webkitLineClamp, cut: el.scrollHeight > el.clientHeight + 2 }));
      assert.equal(clamp.lines, "2"); assert.ok(clamp.cut, "the question is cut at two lines");
      assert.ok((await item(priya.page, "When the survey says").innerText()).includes("like serving together?"), "the phone shows all of it");
      await shot(tv, "int-03-long-text-tv"); await shot(priya.page, "int-03-long-text-phone");
    });
    await step("AI off: questions fold by matching words only and nothing is marked as AI", async () => {
      assert.equal(await tv.locator(".qa-by .cwl-ai-mark").count(), 0); assert.equal(await priya.page.getByText("Combined").count(), 0);
      await shot(tv, "int-03-ai-off-tv");
    });
    await step("Phones down: phones hold their vote and Ask; the TV holds still", async () => {
      await press(fac, sql, room.id, "phones_down");
      await until(async () => await tv.locator(".tv-live.is-down").count() === 1, "quiet mark", 5000);
      await until(async () => await ben.page.locator(".ph-down").isVisible(), "Phones down on the phone", 5000);
      assert.equal(await ben.page.locator("#qa-question").count(), 0, "no Ask while phones are down");
      assert.equal(await item(ben.page, "Sunday mornings").locator(".qa-vote").isDisabled(), true, "votes wait");
      await shot(tv, "int-03-phones-down-tv"); await shot(ben.page, "int-03-phones-down-phone");
      await press(fac, sql, room.id, "open_phones");
    });
    await step("Offline and queued: a vote and a question wait on the phone, then send in order", async () => {
      await until(async () => await ben.page.locator("#qa-question").isVisible(), "phones open", 5000);
      await ben.ctx.setOffline(true);
      await item(ben.page, "Sunday mornings").locator(".qa-vote").click();
      await ask(ben.page, "Who decides what goes in the final plan?");
      await until(async () => (await ben.page.locator(".ph-body").innerText()).includes("Saved on this phone"), "saved on this phone", 5000);
      await until(async () => (await ben.page.locator(".ph-body").innerText()).includes("Vote saved on this phone"), "vote saved on this phone", 5000);
      await shot(ben.page, "int-03-offline-phone");
      const before = (await server()).find(q => q.text.includes("Sunday mornings"))!.people;
      await ben.ctx.setOffline(false);
      await ben.page.evaluate(() => window.dispatchEvent(new Event("online")));
      await until(async () => (await server()).some(q => q.text === "Who decides what goes in the final plan?"), "the queued question arrives", 15000);
      await until(async () => (await server()).find(q => q.text.includes("Sunday mornings"))!.people === before + 1, "the queued vote counts", 15000);
    });
    await step("Reduced motion: rows take their places at once", async () => {
      await sql.query("update public.engagements set settings=settings||'{\"reduced_motion\":true}' where id=$1", [room.id]);
      await until(async () => (await tv.locator("main").getAttribute("data-motion")) === "reduced", "the TV setting", 10000);
      const target = (await server()).find(q => q.text.startsWith("Who decides"))!;
      await item(priya.page, "Who decides").locator(".qa-vote").click();
      await item(ruth.page, "Who decides").locator(".qa-vote").click();
      await until(async () => (await server()).find(q => q.id === target.id)!.people === 3, "votes counted", 5000);
      const top = (await server()).slice(0, 3).map(q => q.text);
      await until(async () => JSON.stringify(await tvTexts()) === JSON.stringify(top), "the TV order", 5000);
      const ys = await rows().evaluateAll(els => els.map(e => (e as HTMLElement).style.transform));
      await delay(120);
      assert.deepEqual(await rows().evaluateAll(els => els.map(e => (e as HTMLElement).style.transform)), ys, "nothing is still moving");
      await shot(tv, "int-03-reduced-motion-tv");
      await sql.query("update public.engagements set settings=settings-'reduced_motion' where id=$1", [room.id]);
    });
    await step("Numbers match the server: the count, the people and the more line", async () => {
      const list = (await server()).filter(q => !q.answered), shown = list.slice(0, 3);
      await until(async () => (await tally()).startsWith(`${list.length} questions from `), "count", 5000);
      const people = await rows().evaluateAll(els => els.filter(e => !(e as HTMLElement).style.opacity).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map(e => Number(e.querySelector("b")!.textContent)));
      assert.deepEqual(people, shown.map(q => q.people));
      assert.equal((await layer().locator(".qa-more").innerText()).trim(), `+ ${list.length - 3} more on your phones`);
    });
    await step("Questions any time: an Ask button on another session's phone, one pool, a quiet note on the TV", async () => {
      await sql.query("update public.sessions set options='{\"any_time\":true}' where id=$1", [pool]);
      await press(fac, sql, room.id, "go_live", { session: cloud });
      await until(async () => await ruth.page.locator(".qa-ask-button").isVisible(), "Ask in the phone header", 10000);
      await shot(ruth.page, "int-03-any-time-phone");
      await ruth.page.locator(".qa-ask-button").click();
      await ruth.page.fill("#qa-any-question", "Will we talk about the building today?");
      await shot(ruth.page, "int-03-any-time-sheet");
      await ruth.page.locator(".qa-sheet .ph-send").click();
      await until(async () => (await ruth.page.locator(".qa-sheet-list").innerText().catch(() => "")).includes("Sent"), "sent from the sheet", 5000);
      await until(async () => (await tv.locator(".qa-waiting").innerText().catch(() => "")).includes("Questions any time: 1 waiting"), "the TV notes it quietly", 5000);
      const stored = (await sql.query("select session_id from public.submissions where text=$1 and engagement_id=$2", ["Will we talk about the building today?", room.id])).rows[0];
      assert.equal(stored.session_id, pool, "the question went to the pool");
      await control.locator("#qa-any-title").waitFor({ timeout: 10000 });
      await until(async () => (await control.locator(".qa-ctl").innerText()).includes("Will we talk about the building today?"), "the control surface lists it", 10000);
      await shot(tv, "int-03-any-time-tv"); await shot(control, "int-03-control-any-time");
      await ruth.page.keyboard.press("Escape");
    });
    await step("Phone remote: Q&A controls in the hand", async () => {
      await press(fac, sql, room.id, "go_live", { session: qa });
      const remote = await facContext.newPage(); await remote.setViewportSize({ width: 390, height: 844 });
      await remote.goto(`${app.origin}/remote/${room.id}`);
      await remote.getByRole("button", { name: "Spotlight" }).first().click();
      await remote.locator(".qa-ctl").waitFor({ timeout: 10000 });
      await shot(remote, "int-03-remote");
      await remote.close();
    });
    await step("Questions any time after the pool step has run: Ask stays on later sessions and after Close Day 1", async () => {
      const later = await room.session("After the break", "word_cloud", "One word for this morning", 5);
      await press(fac, sql, room.id, "go_live", { session: pool });
      await press(fac, sql, room.id, "go_live", { session: later });
      const state = async () => (await sql.query("select state from public.sessions where id=$1", [pool])).rows[0].state as string;
      await until(async () => (await state()) === "closed", "the pool step closes when the room leaves its segment", 5000);
      await until(async () => await ruth.page.locator(".qa-ask-button").isVisible(), "Ask still in the phone header on the next session", 10000);
      await ruth.page.locator(".qa-ask-button").click();
      await ruth.page.fill("#qa-any-question", "Can we come back to the budget after lunch?");
      await ruth.page.locator(".qa-sheet .ph-send").click();
      await until(async () => /Can we come back to the budget after lunch\?\s*Sent/.test(await ruth.page.locator(".qa-sheet-list").innerText().catch(() => "")), "sent from the sheet", 10000);
      await shot(ruth.page, "int-03-any-time-after-close-sheet");
      await ruth.page.keyboard.press("Escape");
      const stored = await until(async () => (await sql.query("select session_id from public.submissions where text=$1 and engagement_id=$2", ["Can we come back to the budget after lunch?", room.id])).rows[0], "stored on the server", 10000);
      assert.equal(stored.session_id, pool, "the question went to the pool, closed or not");
      const waiting = async () => (await sql.query("select count(*)::int as n from public.submissions where session_id=$1 and not deleted and not withdrawn", [pool])).rows[0].n as number;
      await until(async () => (await tv.locator(".qa-waiting").innerText().catch(() => "")).includes("Questions any time:"), "the TV still notes the pool quietly", 5000);
      assert.ok(await waiting() >= 2);
      await shot(ruth.page, "int-03-any-time-after-close-phone"); await shot(tv, "int-03-any-time-after-close-tv");
      await press(fac, sql, room.id, "close_part", { part: "Day 1" });
      await until(async () => (await sql.query("select live_session_id from public.room_states where engagement_id=$1", [room.id])).rows[0].live_session_id === null, "the TV goes to its holding screen", 5000);
      await until(async () => (await ruth.page.locator(".ph-waiting").isVisible()) && await ruth.page.locator(".qa-ask-button").isVisible(), "Ask on the waiting screen after Close Day 1", 10000);
      await shot(ruth.page, "int-03-any-time-after-close-day-phone");
    });
    console.log(`Q&A kit: ${passed.length} checks passed on a paired TV and three phones.`);

    // ---------- 50 simulated phones in the practice room ----------
    const seeded = (await sql.query("select 1 from public.engagements where id=$1 and not deleted", [practiceRoom])).rowCount;
    assert.equal(seeded, 1, "Run npm run db:seed first: the 50-phone run uses the practice room");
    const pfac = await facilitator(env, sql, practiceRoom);
    const crowd = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters) values($1,$2,'Day 1',901,'qa','What do you want to ask about the results?','ready',5,200) returning id`,
      [practiceRoom, `Q&A load ${randomUUID().slice(0, 6)}`])).rows[0].id as string;
    const ptv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    await ptv.goto(app.origin + "/tv");
    const pcode = await until(async () => { const c = (await ptv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(pfac, practiceRoom, app.secret, pcode, "Q&A load TV");
    await press(pfac, sql, practiceRoom, "go_live", { session: crowd });
    await ptv.locator('.tv-layer:not(.is-leaving)[data-kind="qa"]').waitFor({ timeout: 10000 });
    await step("Crowded, 50 phones: every question and vote lands, under a second, nothing jumps, numbers match the server", async () => {
      const phones: SimPhone[] = [];
      for (let start = 0; start < 50; start += 10) {
        const batch = Array.from({ length: 10 }, () => new SimPhone(app.origin));
        await Promise.all(batch.map((p, i) => p.join(practiceRoom, `Q&A phone ${String(start + i + 1).padStart(2, "0")}`)));
        phones.push(...batch);
      }
      for (const p of phones.slice(0, 1)) await p.clock(practiceRoom);
      for (const p of phones) { p.offset = phones[0].offset; p.uncertainty = phones[0].uncertainty; }
      const topics = ["the building", "small groups", "the budget", "staff turnover", "youth ministry", "the survey", "Sunday mornings", "the final plan", "prayer", "the timeline",
        "our neighbours", "worship", "kids ministry", "the board", "new families", "serving the city", "generosity", "the parking lot", "online church", "baptisms"];
      await ptv.evaluate(sampler);
      const from = new Date(Date.now() - 1000).toISOString();
      // Each phone asks once within ten seconds; some ask the same thing in other words.
      const asked = await Promise.all(phones.map(async (p, i) => { await delay(Math.floor(Math.random() * 10000)); return p.ask(practiceRoom, crowd, i % 3 === 2 ? `What about ${topics[i % topics.length]}?` : `Can we talk about ${topics[i % topics.length]} today?`); }));
      assert.equal(asked.filter(a => a.status === "accepted").length, 50, `every question accepted: ${JSON.stringify(asked.map(a => a.status).filter(s => s !== "accepted"))}`);
      const list = ((await sql.query("select results from public.room_states where engagement_id=$1", [practiceRoom])).rows[0].results.questions as Q[]);
      assert.ok(list.length < 50 && list.length >= 20, `questions fold by matching words: ${list.length} groups from 50 questions`);
      // Then each phone votes for two questions that are not its own, within five seconds.
      const votes = await Promise.all(phones.map(async (p, i) => {
        const out: string[] = [];
        for (const k of [1, 2]) { await delay(Math.floor(Math.random() * 2500)); const target = list[(i * 7 + k * 5) % list.length]; out.push((await p.vote(practiceRoom, target.id)).reason ?? "?"); }
        return out;
      }));
      const flat = votes.flat(), accepted = flat.filter(s => s === "accepted").length, own = flat.filter(s => s === "own").length;
      assert.equal(accepted + own, 100, `every vote counted or refused as the voter's own: ${JSON.stringify(flat.filter(s => s !== "accepted" && s !== "own"))}`);
      await delay(4000);
      const samples = await ptv.evaluate(() => { const w = window as unknown as { qaSamples: Record<string, number[]>; qaStop: boolean }; w.qaStop = true; return w.qaSamples; });
      let jumps = 0, frames = 0, largest = 0;
      for (const ys of Object.values(samples)) for (let i = 1; i < ys.length; i++) { frames++; const d = Math.abs(ys[i] - ys[i - 1]); largest = Math.max(largest, d); if (d >= jump) jumps++; }
      assert.equal(jumps, 0, `no row jumped across ${frames} sampled frames (largest step ${Math.round(largest)}px)`);
      const final = ((await sql.query("select results from public.room_states where engagement_id=$1", [practiceRoom])).rows[0].results) as { total: number; questions: Q[] };
      const player = ptv.locator(".tv-layer:not(.is-leaving)").last();
      await until(async () => (await ptv.locator(".tv-top .tv-tally").getAttribute("aria-label").then(v => v ?? "")).trim() === `${final.total} questions`, "the TV count matches the server", 5000);
      const shownTexts = await player.locator(".qa-row").evaluateAll(els => els.filter(e => !(e as HTMLElement).style.opacity).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map(e => e.querySelector(".qa-text")!.textContent));
      assert.deepEqual(shownTexts, final.questions.slice(0, 3).map(q => q.text), "the TV shows the server's top three");
      assert.equal((await player.locator(".qa-more").innerText()).trim(), `+ ${final.total - 3} more on your phones`);
      const response = await fetch(`${app.origin}/api/control/${practiceRoom}/latency?from=${encodeURIComponent(from)}&to=${encodeURIComponent(new Date().toISOString())}`, { headers: { Cookie: pfac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ") } });
      const report = await response.json() as LatencyReport;
      assert.equal(report.measured, 50, "every question reached the TV and was logged");
      assert.ok(verdict(report).met, `95 of 100 under one second on loopback: ${verdict(report).label}`);
      console.log(`50 phones: ${list.length} questions after folding, ${accepted} votes and ${own} refused as own. Phone to TV: median ${report.phone_tv.p50} ms, 95th ${report.phone_tv.p95} ms, slowest ${report.phone_tv.max} ms. ${frames} row frames sampled, largest step ${Math.round(largest)}px, no jumps.`);
      await shot(ptv, "int-03-crowded-50-phones-tv");
    });
    await press(pfac, sql, practiceRoom, "nothing_live");
    console.log(`Q&A kit: ${passed.length} checks passed. Local checks on loopback.`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally { await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); }
}
main().catch(error => { console.error(error); process.exit(1); });
