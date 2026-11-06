// The failure kit, extended to milestone 6 (step 6). tests/browser/failures.ts runs these checks after milestone 4's (`npm run test:browser`), in the
// same browser, against the same production build and local stack, with the scripted fake AI model (never the API). Each check breaks something on
// purpose with a Discover or signal surface on screen and proves the room recovers the way the PRD says:
//   FAIL-09 AI slow and failing on fold_four_lists, draft_discover_themes, draft_what_we_heard and alignment_signal: the room keeps working, the
//     page says so, and the by-hand path works (hide a card, add a theme, type a headline, dismiss or ask from a card that is already up);
//   FAIL-05 the laptop closed, with the signal list still on the lead's own remote (a new card, the neutral question, Phones down and a silent card);
//   FAIL-01 offline queueing and in-order replay for Four Helpful Lists cards and agrees, each once.
// KIT_SHOTS=<folder> saves each failure state. Local only: no real email, Team Hub or CORE.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import type { Browser, Page } from "playwright";
import { engagement, facilitator, mailbox, pairTv, press, startApp, until, type Env } from "./harness";
import { controlDir, controlFile } from "./failures-m3";
import type pg from "pg";

// The slow-draft notice on the Discover page appears after this long; the kit shortens it (the same switch the themes and What We Heard kits use).
Object.assign(process.env, { CLEARWAY_AI_THEMES_SLOW_MS: "2500", CLEARWAY_AI_HEARD_SLOW_MS: "2500" });
const fake = (value: { delayMs?: number; fail?: boolean }) => writeFileSync(controlFile, JSON.stringify(value));
const names = { right: "What’s right?", wrong: "What’s wrong?", missing: "What’s missing?", confused: "What’s confused?" } as const;
const findings: [string, string, number][] = [["Welcoming culture", "60%", 60], ["Prayer and care", "50%", 50], ["Volunteers are stretched", "45%", 45], ["Giving is generous", "40%", 40], ["Young families", "5%", 5]];
const notes: [string, string, string, string][] = [
  ["interview", "Priya Shah", "Interview 1", "Newcomers cannot find a small group to join. The groups are full and nobody tells them the next step."],
  ["interview", "Ben Ortiz", "Interview 2", "Our music and worship are a real strength. People stay for the singing."],
  ["input", "Ruth Lee", "Board conversation", "Volunteers are stretched thin, the same five people every week."],
];
const first = ["we are a welcoming church", "newcomers are greeted at the door", "a welcome team meets every visitor", "we should add a third service on Sunday",
  "another service would help more families", "meals when someone is sick", "families need more room on Sundays", "prayer is how we start every meeting"];

type Kit = { env: Env; sql: pg.Client; mail: Awaited<ReturnType<typeof mailbox>>; app: Awaited<ReturnType<typeof startApp>>; browser: Browser;
  step: (name: string, run: () => Promise<void>) => Promise<void>; shot: (page: Page, name: string) => Promise<void> };
export async function milestone6Failures({ env, sql, mail, app, browser, step, shot }: Kit) {
  fake({});
  const room = await engagement(sql, ["Ruth", "Ben", "Grace"]);
  await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [room.id]);
  const newFour = async (title: string, position: number) => (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,options,max_sends,max_characters,max_words,planned_minutes)
    values($1,$2,'Day 1',$3,'four_lists','Think about our church today.','ready','{}',8,140,30,30) returning id`, [room.id, title, position])).rows[0].id as string;
  const four = await newFour("Four Helpful Lists", 1), fourB = await newFour("Four Helpful Lists, second", 2);
  const wall = await room.session("Five Lenses: Community", "wall", "What does our community say about us?", 3, { maxSends: 40, maxChars: 280 });
  const heard: Record<string, string> = {};
  for (const [i, [title, source, key]] of ([["What we heard: Survey", "Congregational survey", "survey"], ["What we heard: Four Helpful Lists", "Four Helpful Lists", "four_lists"],
    ["What we heard: Board and staff input", "Board and staff input conversations", "input"], ["What we heard: Leadership interviews", "Leadership interviews", "interviews"]] as const).entries())
    heard[key] = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,options,phone_depth)
      values($1,$2,'Pre-call',$3,'content','','draft',$4::jsonb,'') returning id`, [room.id, title, 20 + i, JSON.stringify({ screen: "headline", source })])).rows[0].id as string;
  const fac = await facilitator(env, sql, room.id);
  const rpc = async (name: string, args: Record<string, unknown>) => { const r = await fac.client.rpc(name, args); assert.equal(r.error, null, `${name}: ${r.error?.message}`); assert.equal((r.data as { status: string }).status, "ok", `${name}: ${JSON.stringify(r.data)}`); return r.data; };
  await rpc("discover_total_set", { p_engagement: room.id, p_total: 100 });
  for (const [title, figure, n] of findings) await rpc("discover_finding_save", { p_engagement: room.id, p_id: randomUUID(), p_title: title, p_figure: figure, p_rests_on: n });

  const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvContext.newPage(); await tv.goto(app.origin + "/tv");
  const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
  await pairTv(fac, room.id, app.secret, code, "Failure kit TV (milestone 6)");
  await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
  await tv.evaluate(() => { (window as unknown as { __kit6: number }).__kit6 = 1; });
  const unchanged = () => tv.evaluate(() => (window as unknown as { __kit6?: number }).__kit6 === 1);
  const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
  const tvSays = async () => (await tv.locator("body").innerText()).toLowerCase();
  const calm = async (label: string) => assert.ok(!/slow|isn.t responding|failed|ai is|themes|signal|aligned|divergent/.test(await tvSays()), `${label}: the TV never says anything about AI or the signal`);
  const live = async (session: string, ready: string) => {
    await press(fac, sql, room.id, "go_live", { session });
    if ((await sql.query("select state from public.sessions where id=$1", [session])).rows[0].state === "closed") await press(fac, sql, room.id, "reopen");
    await layer().locator(ready).first().waitFor({ timeout: 10000 });
    await delay(900);
  };
  async function phone(person: { email: string }) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); await page.goto(`${app.origin}/room/${room.id}`);
    const before = mail.count;
    await page.fill("#room-email", person.email); await page.getByRole("button", { name: "Send me a sign-in code" }).click();
    await page.fill("#room-code", await mail.code(person.email, before)); await page.getByRole("button", { name: "Sign in" }).click();
    await page.locator(".ph-app").waitFor({ timeout: 15000 });
    return { ctx, page };
  }
  const [ruth, ben, grace] = [await phone(room.attendees[0]), await phone(room.attendees[1]), await phone(room.attendees[2])];
  const write = async (p: Page, list: keyof typeof names, text: string) => { await p.getByRole("radio", { name: names[list] }).click(); await p.fill("#fl-card", text); await p.locator(".fl-form .ph-send").click(); };
  const pick = async (p: Page, list: keyof typeof names) => { await p.getByRole("radio", { name: names[list] }).click(); };
  const slots = (list: string) => layer().locator(`.fl-col[data-col="${list}"] .fl-slot:not([data-out])`);
  const tvTexts = async (list: string) => slots(list).evaluateAll(els => els.map(e => e.querySelector(".fl-tx")!.textContent));
  const tally = async () => (await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").catch(() => "")) ?? "";
  const sentence = async (page: Page, text: string) => { await page.locator("#ph-answer").fill(text); await page.locator(".ph-send").click(); };

  const facContext = await browser.newContext({ viewport: { width: 1440, height: 1500 } });
  await facContext.addCookies(fac.cookies(app.origin));
  let control = await facContext.newPage(); await control.goto(`${app.origin}/control/${room.id}`);
  await control.locator(".ctl-app").waitFor({ timeout: 15000 });
  const panel = () => control.locator("[data-ai-panel]");
  const notice = async () => (await panel().locator("[data-ai-notice='warning']").innerText().catch(() => ""));
  const cardOf = (text: string) => control.locator("[data-fl-card]").filter({ has: control.locator("b", { hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\!]/g, "\\$&")}$`) }) }).first();

  // ---------- FAIL-09 on the Four Helpful Lists fold ----------
  await step("FAIL-09 on the Four Helpful Lists fold: AI slow, then failing; every card is on the TV at once, only the control surface says so, and hiding a card and agreeing work by hand", async () => {
    await live(four, ".fl-board");
    await panel().waitFor({ timeout: 10000 });
    const foldSlowAt = new Date().toISOString();
    fake({ delayMs: 9000 });
    const cards = ["Elder and staff roles are unclear", "Roles of staff are confusing", "Staff roles are confusing for everyone"];
    for (const [n, text] of cards.entries()) {
      const t0 = Date.now(); await write([ruth.page, ben.page, grace.page][n], "confused", text);
      await until(async () => (await tvTexts("confused")).includes(text), `card ${n + 1} is on the TV while AI is slow`, 2500);
      if (!n) console.log(`  Four Helpful Lists: phone send to TV with AI slow ${Date.now() - t0} ms`);
    }
    await until(async () => (await notice()).includes("AI is slow."), "the control surface says AI is slow", 20000);
    await calm("fold slow");
    assert.equal((await sql.query("select count(*)::int n from private.ai_runs where session_id=$1 and job='fold_four_lists' and status='ok' and created_at>=$2", [four, foldSlowAt])).rows[0].n, 0, "no fold has finished since AI went slow");
    assert.equal((await tvTexts("confused")).length, 3, "the three cards stand apart on the TV until AI folds them");
    await panel().scrollIntoViewIfNeeded(); await shot(control, "fail-09-m6-fold-slow-control");
    fake({ fail: true });
    for (const [n, text] of ["The budget is unclear to us", "Nobody knows who approves things"].entries()) {
      await write([ben.page, grace.page][n], "confused", text);
      await until(async () => (await tvTexts("confused")).includes(text), `a card is on the TV while AI fails`, 2500);
    }
    await until(async () => (await notice()).includes("AI isn't responding."), "the control surface says AI isn't responding", 25000);
    await calm("fold failing");
    await shot(control, "fail-09-m6-fold-failing-control"); await shot(tv, "fail-09-m6-fold-failing-tv");
    // By hand: hide a card from the control surface, bring it back, and agree from a phone. None of it needs AI.
    await cardOf("Nobody knows who approves things").getByRole("button", { name: "Hide" }).click();
    await until(async () => !(await tvTexts("confused")).includes("Nobody knows who approves things"), "a hidden card leaves the TV", 6000);
    await control.locator("[data-fl-card].is-hidden").filter({ hasText: "Nobody knows who approves things" }).getByRole("button", { name: "Unhide" }).click();
    await until(async () => (await tvTexts("confused")).includes("Nobody knows who approves things"), "and comes back", 6000);
    await pick(ruth.page, "confused");
    const row = ruth.page.locator(".fl-arow", { hasText: "The budget is unclear to us" });
    await until(async () => await row.isVisible(), "a card to agree with on Ruth's phone", 8000);
    await row.getByRole("button", { name: "Agree" }).click();
    await until(async () => (await slots("confused").evaluateAll(els => els.filter(e => e.textContent!.includes("The budget is unclear to us")).map(e => Number(e.querySelector(".fl-agree b")!.textContent)))).includes(1), "the agree ticks on the TV while AI fails", 6000);
    fake({});
    assert.ok(await unchanged(), "the TV page never reloaded");
  });

  // ---------- FAIL-09 on Discover themes ----------
  const discover = await facContext.newPage();
  const theme = (label: string) => discover.locator(".dsc-theme", { hasText: label }).first();
  await step("FAIL-09 on Discover themes: a slow draft says so and a failed one says so with a retry, and the facilitator adds a theme by hand either way", async () => {
    for (const [kind, person, title, body] of notes) await rpc("discover_note_add", { p_engagement: room.id, p_id: randomUUID(), p_kind: kind, p_person: person, p_title: title, p_body: body, p_source: "paste" });
    await discover.goto(`${app.origin}/setup/${room.id}/discover`);
    await discover.getByRole("heading", { name: "Themes", level: 2 }).waitFor({ timeout: 15000 });
    fake({ delayMs: 9000 });
    await discover.getByRole("button", { name: "Draft themes" }).click();
    await discover.getByText("This is taking longer than usual").waitFor({ timeout: 15000 });
    await shot(discover, "fail-09-m6-themes-slow");
    await discover.getByRole("button", { name: "Add a theme by hand" }).click();
    const form = discover.getByRole("form", { name: "Add a theme by hand" });
    await form.getByLabel("Theme", { exact: true }).fill("People want more prayer");
    await form.getByRole("checkbox").first().check();
    await form.getByRole("button", { name: "Add and accept" }).click();
    await theme("People want more prayer").getByText("Written by hand").waitFor();
    await until(async () => (await sql.query("select count(*)::int n from private.discover_accepted_themes($1) where label='People want more prayer'", [room.id])).rows[0].n === 1, "a hand-made theme counts once accepted");
    await discover.getByText("This is taking longer than usual").waitFor({ state: "detached", timeout: 30000 });
    fake({ fail: true });
    await sql.query("insert into private.conversation_notes(id,engagement_id,kind,person,title,body,source_kind,word_count) values($1,$2,'input','Tasha Brown','Youth conversation','We never announce anything and nobody knows what is happening.','paste',9)", [randomUUID(), room.id]);
    await discover.getByRole("button", { name: "Redraft themes" }).click();
    await until(async () => { const r = (await sql.query("select attempts from private.discover_theme_rounds where engagement_id=$1 and not deleted and status='pending'", [room.id])).rows[0]; return r && r.attempts >= 1; }, "first failure", 30000);
    await sql.query("update private.discover_theme_rounds set last_failed_at=now()-interval '5 minutes' where engagement_id=$1 and not deleted", [room.id]);
    await discover.getByText("AI couldn't draft themes this time").waitFor({ timeout: 45000 });
    await shot(discover, "fail-09-m6-themes-failed");
    assert.equal(await discover.getByRole("button", { name: "Redraft themes" }).isEnabled(), true, "the facilitator can try again");
    assert.equal(await discover.getByRole("button", { name: "Add a theme by hand" }).isEnabled(), true, "or write one");
    assert.equal((await sql.query("select count(*)::int n from private.discover_accepted_themes($1)", [room.id])).rows[0].n, findings.length + 1, "the accepted themes are untouched by the failure");
    fake({});
    await discover.getByRole("button", { name: "Redraft themes" }).click();
    await until(async () => (await sql.query("select status from private.discover_theme_rounds where engagement_id=$1 and not deleted", [room.id])).rows[0].status === "ready", "the retry works", 30000);
    await calm("themes");
  });

  // ---------- FAIL-09 on What We Heard ----------
  const source = (key: string) => discover.locator(`[data-source="${key}"]`);
  const stepRow = async (key: string) => (await sql.query("select state,prompt,options from public.sessions where id=$1", [heard[key]])).rows[0];
  await step("FAIL-09 on What We Heard: a slow draft says so, a failed one says so with a retry, and the facilitator types a headline and applies it by hand either way", async () => {
    await discover.goto(`${app.origin}/setup/${room.id}/discover`);
    await discover.getByRole("heading", { name: "What We Heard", level: 2 }).waitFor({ timeout: 15000 });
    fake({ delayMs: 9000 });
    await discover.getByRole("button", { name: "Draft What We Heard" }).click();
    await discover.getByText("This is taking longer than usual").waitFor({ timeout: 15000 });
    await shot(discover, "fail-09-m6-heard-slow");
    // The Four Helpful Lists source has nothing accepted in this room: the facilitator writes its headline.
    await source("four_lists").getByRole("button", { name: "Type it by hand" }).click();
    await source("four_lists").getByLabel("Number").fill("2 of 3");
    await source("four_lists").getByLabel("Headline line").fill("people wrote about **who decides** most");
    await source("four_lists").getByRole("button", { name: "Apply" }).click();
    await until(async () => (await stepRow("four_lists")).prompt.includes("who decides"), "a hand-typed headline is applied while the draft is slow", 20000);
    assert.equal((await stepRow("four_lists")).options.number, "2 of 3");
    assert.equal((await stepRow("four_lists")).state, "draft", "and nothing goes live");
    await discover.getByText("This is taking longer than usual").waitFor({ state: "detached", timeout: 40000 });
    fake({ fail: true });
    await discover.getByRole("button", { name: "Redraft What We Heard" }).click();
    await until(async () => { const r = (await sql.query("select attempts from private.heard_rounds where engagement_id=$1 and not deleted and status='pending'", [room.id])).rows[0]; return r && r.attempts >= 1; }, "first failure", 30000);
    await sql.query("update private.heard_rounds set last_failed_at=now()-interval '5 minutes' where engagement_id=$1 and not deleted", [room.id]);
    await discover.getByText("AI couldn't draft the headlines this time").waitFor({ timeout: 45000 });
    await shot(discover, "fail-09-m6-heard-failed");
    assert.equal(await discover.getByRole("button", { name: "Redraft What We Heard" }).isEnabled(), true, "the facilitator can try again");
    assert.equal(await source("survey").getByRole("button", { name: "Apply" }).isEnabled(), true, "and the page still applies a draft by hand");
    await source("survey").getByRole("button", { name: "Apply" }).click();
    await source("survey").locator(".dsc-applied").waitFor({ timeout: 20000 });
    assert.ok((await stepRow("survey")).prompt.length > 5, "the survey headline is written by Apply");
    fake({});
    await discover.getByRole("button", { name: "Redraft What We Heard" }).click();
    await until(async () => (await sql.query("select status from private.heard_rounds where engagement_id=$1 and not deleted", [room.id])).rows[0].status === "ready", "the retry works", 30000);
    await calm("What We Heard");
  });

  // ---------- The signal: cards, FAIL-05 with the laptop closed, FAIL-09 ----------
  const remoteContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await remoteContext.addCookies(fac.cookies(app.origin));
  const remote = await remoteContext.newPage();
  const kinds = async (page: Page, root: string) => (await page.locator(`${root} [data-signal-id]:not(.is-leaving)`).evaluateAll(els => els.map(e => e.getAttribute("data-signal")))).sort();
  const cards = async () => (await sql.query("select kind,dismissed_at from private.signals where session_id=$1 and not deleted", [wall])).rows as { kind: string; dismissed_at: Date | null }[];
  const lineCount = () => remote.locator("[data-signal-list] [data-signal-id]").count();
  await step("The signal, before anything breaks: cards arrive on the control surface and the remote, and nowhere on the TV", async () => {
    await live(wall, ".tv-board, .ai-wall, .tv-feed");
    await remote.goto(`${app.origin}/remote/${room.id}`);
    await control.locator("[data-signal-panel]").waitFor({ timeout: 20000 });
    await remote.locator("[data-signal-list]").waitFor({ timeout: 20000 });
    for (const [i, text] of first.entries()) { await sentence([ruth.page, ben.page, grace.page][i % 3], text); await until(async () => (await layer().innerText()).includes(text), `answer ${i + 1} on the TV`, 5000); }
    await until(async () => { const k = await kinds(control, "[data-signal-panel]"); return k.includes("aligned") && k.includes("divergent"); }, "cards on the control surface", 45000);
    await until(async () => JSON.stringify(await kinds(remote, "[data-signal-list]")) === JSON.stringify(await kinds(control, "[data-signal-panel]")), "and on the remote", 20000);
    assert.equal(await tv.locator("[data-signal-id], [class*=\"cwl-sg\"]").count(), 0, "none on the TV");
  });
  await step("FAIL-05 The laptop dies with the signal up: the remote still lists the cards, takes a new one, puts the neutral question up and down, dismisses, and lists a silent card after Phones down", async () => {
    await control.close();
    const before = await lineCount();
    assert.ok(before >= 3, `the remote lists the cards the laptop had (${before})`);
    for (const [i, text] of ["volunteers are stretched thin every week", "the volunteers carry too much", "volunteers need a break", "we need more volunteers on Sundays",
      "volunteers are tired by December", "ask the volunteers how they are", "volunteers set up before dawn", "volunteers deserve our thanks"].entries()) await sentence([ruth.page, ben.page, grace.page][i % 3], text);
    await until(async () => (await lineCount()) > before, "a new card reaches the remote with the laptop closed", 45000);
    const divergent = remote.locator("[data-signal-list] [data-signal=\"divergent\"]").first();
    await divergent.getByRole("button").first().click();
    const rbox = divergent.getByRole("textbox"); await rbox.waitFor({ timeout: 5000 });
    assert.match(await rbox.inputValue(), /\?$/, "the remote shows the question it will send");
    const edited = "What do you notice about how we serve on Sundays?";
    await rbox.fill(edited);
    await divergent.getByRole("button", { name: "Put the question up" }).click();
    await until(async () => (await tv.locator(".tv-ask.is-on .tv-headline-xl").innerText().catch(() => "")) === edited, "the edited neutral question on the TV, from the remote alone", 8000);
    await calm("remote question");
    await shot(remote, "fail-05-m6-remote-question");
    await remote.locator("[data-signal-ask]").getByRole("button", { name: "Back to the session" }).click();
    await until(async () => Number(await tv.locator(".tv-ask").evaluate(el => getComputedStyle(el).opacity)) < 0.01, "back to the step", 8000);
    const aligned = remote.locator("[data-signal-list] [data-signal=\"aligned\"]").first();
    await aligned.getByRole("button").first().click();
    await aligned.getByRole("button", { name: "Dismiss" }).click();
    await until(async () => (await cards()).filter(c => c.dismissed_at).length === 1, "dismissed from the remote", 8000);
    await remote.getByRole("button", { name: "Phones down" }).click();
    await until(async () => (await tv.locator(".tv-live.is-down").count()) === 1, "Phones down from the remote reaches the TV", 8000);
    await until(async () => (await kinds(remote, "[data-signal-list]")).includes("silent"), "a silent card on the remote once phones go down", 45000);
    assert.equal(await tv.locator("[data-signal-id]").count(), 0, "and none on the TV");
    await shot(remote, "fail-05-m6-remote-silent");
    await remote.getByRole("button", { name: "Open phones" }).click();
    await until(async () => (await tv.locator(".tv-live:not(.is-down)").count()) === 1, "phones open again from the remote", 8000);
    assert.ok(await unchanged(), "the TV page never reloaded");
  });
  await step("FAIL-09 on the alignment signal: AI slow, then failing; every answer is on the TV at once, the cards already up stay and work, and the control surface says so", async () => {
    control = await facContext.newPage(); await control.goto(`${app.origin}/control/${room.id}`);
    await control.locator("[data-signal-panel]").waitFor({ timeout: 20000 });
    await panel().waitFor({ timeout: 10000 });
    const up = (await cards()).filter(c => !c.dismissed_at).length;
    const landed = async (text: string) => (await layer().innerText()).includes(text);
    const slowAt = new Date().toISOString();
    fake({ delayMs: 9000 });
    const slow = ["young families need a place to start", "prayer holds this church together", "meals for families in a hard season", "welcome starts at the car park", "newcomers find a friend by the second week",
      "care in hard seasons is what we do best", "the welcome team knows every name", "greeters make a difference"];
    for (const [n, text] of slow.entries()) {
      const t0 = Date.now(); await sentence([ruth.page, ben.page, grace.page][n % 3], text);
      await until(() => landed(text), `answer ${n + 1} is on the TV while AI is slow`, 2500);
      if (!n) console.log(`  signal: phone send to TV with AI slow ${Date.now() - t0} ms`);
    }
    await until(async () => (await notice()).includes("AI is slow."), "the control surface says AI is slow", 25000);
    await calm("signal slow");
    await panel().scrollIntoViewIfNeeded(); await shot(control, "fail-09-m6-signal-slow-control");
    // A slow run is not a failed one: wait for a run that started after the switch, lasted the slow window and still finished well, then none has failed.
    await until(async () => (await sql.query("select count(*)::int n from private.ai_runs where session_id=$1 and job='alignment_signal' and status='ok' and created_at>=$2 and ms>=8000", [wall, slowAt])).rows[0].n >= 1, "a signal run takes the slow window and finishes ok", 60000);
    assert.equal((await sql.query("select count(*)::int n from private.ai_runs where session_id=$1 and job='alignment_signal' and status<>'ok' and created_at>=$2", [wall, slowAt])).rows[0].n, 0, "and none failed while AI was slow");
    fake({ fail: true });
    const failing = ["hospitality is our gift", "our building welcomes everyone", "friends invite friends here", "children are known by name", "the greeters are always smiling",
      "every visitor gets a call", "coffee after church matters", "people stay for the community"];
    for (const [n, text] of failing.entries()) { await sentence([ruth.page, ben.page, grace.page][n % 3], text); await until(() => landed(text), `answer ${n + 1} is on the TV while AI fails`, 2500); }
    await until(async () => (await sql.query("select count(*)::int n from private.ai_runs where session_id=$1 and job='alignment_signal' and status<>'ok'", [wall])).rows[0].n >= 1, "a signal run fails and is logged", 60000);
    await until(async () => (await notice()).includes("AI isn't responding."), "the control surface says AI isn't responding", 25000);
    await calm("signal failing");
    assert.equal(await control.locator("[data-signal-panel]").count(), 1, "the signal panel is still there");
    assert.ok((await cards()).filter(c => !c.dismissed_at).length >= up, "the cards already up are kept, none lost");
    // By hand: cards that are already up still work with AI failing. Put a divergent card's question up (worded by the facilitator) and take it down, then dismiss another card.
    await control.locator("[data-signal-panel] [data-signal=\"divergent\"]:not(.is-leaving)").first().click();
    const detail = control.locator("[data-signal-detail=\"divergent\"]");
    await detail.waitFor({ timeout: 5000 });
    const box = detail.getByRole("textbox");
    await box.waitFor({ timeout: 3000 });
    await box.fill("What would we want a first visit to feel like?");
    await detail.getByRole("button", { name: "Put the question up" }).click();
    await until(async () => (await tv.locator(".tv-ask.is-on .tv-headline-xl").innerText().catch(() => "")) === "What would we want a first visit to feel like?", "a question the facilitator wrote reaches the TV while AI fails", 6000);
    await control.locator("[data-signal-ask]").getByRole("button", { name: "Back to the session" }).click();
    await until(async () => Number(await tv.locator(".tv-ask").evaluate(el => getComputedStyle(el).opacity)) < 0.01, "and comes down", 6000);
    const dismissedBefore = (await cards()).filter(c => c.dismissed_at).length;
    await detail.getByRole("button", { name: "See all signals" }).click().catch(() => {});
    const other = control.locator("[data-signal-panel] [data-signal-id]:not(.is-leaving):not([data-signal=\"divergent\"])").first();
    await other.click();
    await control.locator("[data-signal-detail]").getByRole("button", { name: "Dismiss" }).click();
    await until(async () => (await cards()).filter(c => c.dismissed_at).length === dismissedBefore + 1, "a card is dismissed while AI fails", 6000);
    await shot(control, "fail-09-m6-signal-failing-control");
    fake({});
    assert.ok(await unchanged(), "the TV page never reloaded");
  });

  // ---------- FAIL-01 on the Four Helpful Lists ----------
  await step("FAIL-01 Four Helpful Lists cards and agrees offline: saved on the phone, then sent in the order written, each once, and the TV counts them", async () => {
    await live(fourB, ".fl-board");
    const every = async (email: string) => (await sql.query(`select x.text, x.server_received_at from public.submissions x join public.attendees a on a.id=x.attendee_id
      where a.email=$1 and x.session_id=$2 and not x.deleted and not x.withdrawn order by x.server_received_at`, [email, fourB])).rows as { text: string; server_received_at: Date }[];
    const agrees = async (email: string) => (await sql.query(`select s.text, g.agreed, g.server_received_at from private.four_list_agrees g join public.submissions s on s.id=g.card_id join public.attendees a on a.id=g.attendee_id
      where a.email=$1 and g.session_id=$2 and not g.deleted order by g.server_received_at`, [email, fourB])).rows as { text: string; agreed: boolean; server_received_at: Date }[];
    await write(ben.page, "wrong", "Parking is full by nine"); await write(ben.page, "missing", "A clear way to join a group");
    await until(async () => (await tally()).startsWith("2 cards"), "Ben's two cards on the TV", 6000);
    const page = ruth.page;
    await pick(page, "wrong");
    await until(async () => await page.locator(".fl-arow", { hasText: "Parking is full by nine" }).isVisible(), "a card to agree with on Ruth's phone", 8000);
    await pick(page, "missing");
    await until(async () => await page.locator(".fl-arow", { hasText: "A clear way to join a group" }).isVisible(), "and a second", 8000);
    await ruth.ctx.setOffline(true);
    await until(async () => (await page.locator(".ph-head").innerText()).includes("Offline"), "Offline marker", 8000);
    const mine = ["Preaching is strong and clear", "Two room Sundays feel split"];
    await write(page, "right", mine[0]); await delay(150); await write(page, "wrong", mine[1]);
    await until(async () => (await page.getByText("Saved on this phone").count()) === 2, "both cards saved on this phone", 5000);
    await pick(page, "wrong");
    await page.locator(".fl-arow", { hasText: "Parking is full by nine" }).getByRole("button", { name: "Agree" }).click(); await delay(150);
    await pick(page, "missing");
    await page.locator(".fl-arow", { hasText: "A clear way to join a group" }).getByRole("button", { name: "Agree" }).click();
    assert.equal(await page.locator(".fl-arow", { hasText: "A clear way to join a group" }).getByRole("button", { name: "Take back" }).getAttribute("aria-pressed"), "true", "the agree shows as taken on the phone");
    await shot(page, "fail-01-m6-four-lists-offline-phone");
    await delay(1500);
    assert.equal((await every(room.attendees[0].email)).length, 0, "no card reaches the server while the phone is offline");
    assert.equal((await agrees(room.attendees[0].email)).length, 0, "and no agree");
    assert.ok((await tally()).startsWith("2 cards"), "the TV still counts two");
    const back = Date.now();
    await ruth.ctx.setOffline(false);
    await until(async () => (await every(room.attendees[0].email)).length === 2 && (await agrees(room.attendees[0].email)).length === 2, "the queued cards and agrees arrive", 20000);
    console.log(`  two queued cards and two agrees sent within ${Date.now() - back} ms of the network returning`);
    const cardRows = await every(room.attendees[0].email);
    assert.deepEqual(cardRows.map(r => r.text), mine, "cards sent in the order written, each stored once");
    const agreeRows = await agrees(room.attendees[0].email);
    assert.deepEqual(agreeRows.map(r => [r.text, r.agreed]), [["Parking is full by nine", true], ["A clear way to join a group", true]], "agrees sent in the order written, each once");
    await until(async () => (await tally()).startsWith("4 cards from 2 people"), "the TV counts four cards from two people", 6000);
    await until(async () => {
      const agree = await layer().locator(".fl-slot").evaluateAll(els => Object.fromEntries(els.map(e => [e.querySelector(".fl-tx")!.textContent!, Number(e.querySelector(".fl-agree b")!.textContent)])));
      return agree["Parking is full by nine"] === 1 && agree["A clear way to join a group"] === 1;
    }, "both agreements tick on the TV", 8000);
    await until(async () => (await page.getByText("Saved on this phone").count()) === 0, "nothing left saved on the phone", 8000);
    assert.ok(await unchanged(), "the TV page never reloaded");
  });
  await press(fac, sql, room.id, "nothing_live");
  rmSync(controlDir, { recursive: true, force: true });
}
