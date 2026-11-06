// Milestone 6, step 2: the Four Helpful Lists (INT-11, SET-05) in real browsers against the production build and the local
// stack, with the scripted fake model (never the API). Part one runs in a fresh engagement: a paired TV, three signed-in phones
// and the facilitator's control surface go through an empty board, a first card, agreeing and un-agreeing, a fold by the same
// words with Undo, an AI fold that arrives after the card is already on the TV (AI slow), Undo last AI change, Pin, Hide, the
// facilitator's review and its CSV, and reduced motion. Part two is the live-screen gate: 50 simulated phones write and agree in
// the practice room while AI works slowly. Every card is on the TV in under a second (95 in 100), every agree too, nothing
// jumps, and the TV's numbers are the server's. KIT_SHOTS=<folder> saves screens.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { promptVersions } from "../../lib/ai/prompts";
import { verdict, type LatencyReport } from "../../lib/latency/report";
import { joinPhones, practiceRoom, type Phone } from "../../scripts/load-test";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";
import { watcher, type Watch } from "./frame-watch";

// The scripted fake model reads this file on every call: slow or well.
const controlDir = join(tmpdir(), `clearway-four-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
const fake = (value: { delayMs?: number; fail?: boolean }) => writeFileSync(controlFile, JSON.stringify(value));
fake({});
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "250", ANTHROPIC_API_KEY: "" });

type Card = { id: string; column: string; text: string; agree: number; folded: number; ai?: boolean; pinned?: boolean; ids: string[]; rank: number };
type Results = { total: number; people: number; ai?: boolean; columns: Record<string, number>; cards: Card[] };
const names = { right: "What’s right?", wrong: "What’s wrong?", missing: "What’s missing?", confused: "What’s confused?" } as const;
const lists = ["right", "wrong", "missing", "confused"] as const;
// Cards for the 50 phones: near-duplicates inside a list (for AI to fold) and the same words across lists (which must stay apart).
const pool: Record<(typeof lists)[number], string[]> = {
  right: ["Preaching is strong and clear", "The preaching is clear and strong", "Our volunteers show up early", "Volunteers always show up early", "We pray together before services", "A warm welcome team at the door"],
  wrong: ["Two room Sundays feel split", "Sundays in two rooms feel split", "Staff are stretched too thin", "Staff stretched thin and tired", "Parking is full by nine", "The welcome team is missing at the door"],
  missing: ["A clear path into groups", "A clear way to join a group", "Young adults ministry", "Ministry for young adults", "Training for new volunteers", "A prayer room"],
  confused: ["Who approves the budget", "Who decides the budget approval", "Elder and staff roles are unclear", "Roles of staff are confusing", "Where do I ask to start something", "How decisions get made"],
};

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shots = process.env.KIT_SHOTS;
  const shot = async (page: Page, name: string) => { if (shots) { await delay(900); await page.screenshot({ path: `${shots}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { const t0 = Date.now(); await run(); passed.push(`${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); console.log(`ok · ${name}`); };
  let seed = 11; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  let practiceSettings: unknown = null;
  try {
    await sql.connect();
    browser = await chromium.launch();

    // ---------- Part one: a fresh engagement, three real phones ----------
    const room = await engagement(sql, ["Priya", "Ben", "Ruth"]);
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [room.id]);
    const lists1 = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,options,max_sends,max_characters,max_words,planned_minutes)
      values($1,'Four Helpful Lists','Discover',1,'four_lists','Think about our church today.','ready','{}',8,140,30,30) returning id`, [room.id])).rows[0].id as string;
    const fac = await facilitator(env, sql, room.id);
    const results = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [room.id])).rows[0].results as Results;

    const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvContext.newPage(); await tv.goto(app.origin + "/tv");
    const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(fac, room.id, app.secret, code);
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
    const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
    const slots = (list?: string) => layer().locator(`${list ? `.fl-col[data-col="${list}"] ` : ""}.fl-slot:not([data-out])`);
    const tvCards = async (list: string) => await slots(list).evaluateAll(els => els.filter(e => !(e as HTMLElement).style.opacity || Number((e as HTMLElement).style.opacity) > 0.5)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map(e => ({ text: e.querySelector(".fl-tx")!.textContent!, agree: Number(e.querySelector(".fl-agree b")!.textContent), ai: !(e.querySelector(".fl-ai") as HTMLElement).hidden, aiCount: e.querySelector(".fl-ai")!.textContent!.trim() })));
    const tally = async () => (await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").then(v => v ?? "")).replace(/\s+/g, " ").trim();

    async function phone(person: { email: string }) {
      const ctx = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage(); await page.goto(`${app.origin}/room/${room.id}`);
      const before = mail.count;
      await page.fill("#room-email", person.email); await page.getByRole("button", { name: "Send me a sign-in code" }).click();
      await page.fill("#room-code", await mail.code(person.email, before)); await page.getByRole("button", { name: "Sign in" }).click();
      await page.locator(".ph-app").waitFor({ timeout: 15000 });
      return page;
    }
    const [priya, ben, ruth] = [await phone(room.attendees[0]), await phone(room.attendees[1]), await phone(room.attendees[2])];
    const write = async (p: Page, list: keyof typeof names, text: string) => {
      await p.getByRole("radio", { name: names[list] }).click();
      await p.fill("#fl-card", text); await p.locator(".fl-form .ph-send").click();
    };
    const pick = async (p: Page, list: keyof typeof names) => { await p.getByRole("radio", { name: names[list] }).click(); };

    const facContext = await browser.newContext({ viewport: { width: 1440, height: 1500 } });
    await facContext.addCookies(fac.cookies(app.origin));
    const control = await facContext.newPage();
    await control.goto(`${app.origin}/control/${room.id}`);
    const panelCard = (text: string) => control.locator("[data-fl-card]").filter({ has: control.locator("b", { hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\!]/g, "\\$&")}$`) }) }).first();

    await step("Empty: four lists with their headings, outlined and waiting, and no generic waiting line", async () => {
      await press(fac, sql, room.id, "go_live", { session: lists1 });
      await layer().locator(".fl-board").waitFor({ timeout: 10000 });
      const heads = await layer().locator(".fl-col .fl-q").allTextContents();
      assert.deepEqual(heads, Object.values(names), "the four headings, in order");
      assert.equal(await layer().locator(".fl-col.is-empty").count(), 4, "every list shows its empty outline");
      assert.equal(await layer().locator(".tv-note").isVisible(), false, "the generic waiting line is not shown");
      await until(async () => (await tally()) === "0 cards from 0 people", "count reads 0 cards", 10000);
      await shot(tv, "int-11-empty-tv");
    });

    await step("First card: sent from a phone, on the TV in under a second, with the Lime moment", async () => {
      await until(async () => await priya.locator(".fl-form").isVisible(), "Priya's composer", 10000);
      const start = Date.now();
      await write(priya, "missing", "A clear way to join a group");
      await until(async () => (await tvCards("missing")).length === 1, "the card on the TV", 5000);
      const ms = Date.now() - start;
      assert.ok(ms < 1500, `phone tap to TV in ${ms} ms (page polling included)`);
      assert.equal(await layer().locator(".fl-card.is-newest").count(), 1, "a lone arrival takes the Lime moment");
      await until(async () => (await tally()) === "1 card from 1 person", "count reads 1 card", 5000);
      assert.deepEqual((await tvCards("missing")).map(c => [c.text, c.agree]), [["A clear way to join a group", 0]]);
      assert.equal(await layer().locator(".fl-col[data-col=\"missing\"] .fl-agree.is-zero").count(), 1, "zero agreement is an outline");
      await delay(1500);
      assert.equal(await layer().locator(".fl-card.is-newest").count(), 0, "the Lime moment settles");
      assert.ok((await priya.locator("[data-fl-own]").innerText()).includes("A clear way to join a group"), "Priya sees her own card");
      await shot(tv, "int-11-first-card-tv"); await shot(priya, "int-11-first-card-phone");
    });

    await step("Agreeing: one tap on, the TV count rises in under a second, second tap off, and never on your own card", async () => {
      await until(async () => await ben.locator(".fl-form").isVisible(), "Ben's composer", 10000);
      await pick(ben, "missing");
      const row = ben.locator(".fl-arow", { hasText: "A clear way to join a group" });
      await until(async () => await row.isVisible(), "the card to agree with on Ben's phone", 8000);
      assert.equal(await priya.locator(".fl-arow").count(), 0, "Priya is never offered her own card to agree with");
      const start = Date.now();
      await row.getByRole("button", { name: "Agree" }).click();
      await until(async () => (await tvCards("missing"))[0]?.agree === 1, "the count ticks to 1 on the TV", 5000);
      const ms = Date.now() - start;
      assert.ok(ms < 1500, `agree tap to TV in ${ms} ms (page polling included)`);
      assert.equal((await row.getByRole("button", { name: "Take back" }).getAttribute("aria-pressed")), "true");
      assert.equal(await layer().locator(".fl-col[data-col=\"missing\"] .fl-agree.is-zero").count(), 0);
      await row.getByRole("button", { name: "Take back" }).click();
      await until(async () => (await tvCards("missing"))[0]?.agree === 0, "the count goes back to 0", 5000);
      assert.equal(await row.getByRole("button", { name: "Agree" }).getAttribute("aria-pressed"), "false");
      const rows = (await sql.query("select count(*)::integer as n, count(*) filter (where agreed)::integer as on from private.four_list_agrees where engagement_id=$1 and not deleted", [room.id])).rows[0];
      assert.equal(rows.n, 1, "one row for the person and the card, toggled"); assert.equal(rows.on, 0);
      await row.getByRole("button", { name: "Agree" }).click();
      await until(async () => (await tvCards("missing"))[0]?.agree === 1, "agreed again", 5000);
    });

    await step("Same words fold at once, with no AI icon, and the control surface can undo the fold", async () => {
      await write(ben, "missing", "A clear way to join a group!");
      await until(async () => (await tvCards("missing")).length === 1 && (await results()).cards.find(c => c.folded === 1) !== undefined, "the same words fold beneath the first card", 6000);
      const [only] = await tvCards("missing");
      assert.equal(only.ai, false, "words are not AI");
      await until(async () => await panelCard("A clear way to join a group").locator("[aria-label=\"Folded into this card\"]").isVisible(), "the fold in the control panel", 8000);
      assert.ok((await panelCard("A clear way to join a group").innerText()).includes("Matching words"), "the panel says it was matched words");
      await panelCard("A clear way to join a group").getByRole("button", { name: "Undo fold" }).click();
      await until(async () => (await tvCards("missing")).length === 2, "Undo fold puts both cards back on the TV", 6000);
      assert.equal((await results()).total, 2);
    });

    await step("AI slow: similar cards are on the TV first, then AI folds them beneath a survivor marked AI with the count, and Undo last AI change puts them back", async () => {
      fake({ delayMs: 2500 });
      const start = Date.now();
      await write(priya, "confused", "Elder and staff roles are unclear");
      await write(ben, "confused", "Roles of staff are confusing");
      await until(async () => (await tvCards("confused")).length === 2, "both cards on the TV", 5000);
      const shown = Date.now() - start;
      assert.ok(shown < 1800, `AI is never in the path: both cards were on the TV in ${shown} ms while AI was still working`);
      await until(async () => (await tvCards("confused")).length === 1 && (await tvCards("confused"))[0].ai, "AI folds the two beneath one card", 15000);
      const [survivor] = await tvCards("confused");
      assert.equal(survivor.aiCount, "2", "the AI mark carries the number of cards it stands for");
      assert.equal(await layer().locator(".fl-col[data-col=\"confused\"] .fl-ai .cwl-ai-mark").count(), 1);
      fake({});
      const runs = (await sql.query("select count(*)::integer as n, bool_and(job='fold_four_lists') as job, bool_and(prompt_version=$2) as version from private.ai_runs where session_id=$1 and status='ok' and changed", [lists1, promptVersions.fold_four_lists])).rows[0];
      assert.ok(runs.n >= 1 && runs.job && runs.version, "the fold ran on the fold prompt's version");
      await shot(tv, "int-11-ai-fold-tv");
      const undo = control.getByRole("button", { name: "Undo last AI change" }).first();
      await until(async () => await undo.isEnabled(), "Undo last AI change is available", 10000);
      await undo.click();
      await until(async () => (await tvCards("confused")).length === 2, "Undo last AI change puts the cards back", 8000);
      assert.equal((await tvCards("confused")).every(c => !c.ai), true);
      // AI would fold them again on the next run; turn it off so the rest of the kit is steady.
      await control.getByRole("switch", { name: "AI for this session" }).first().click();
      await until(async () => (await results()).ai === false, "AI is off for the step", 8000);
    });

    await step("Pin and Hide: a pinned card is marked, a hidden card leaves the TV and comes back", async () => {
      await panelCard("A clear way to join a group").getByRole("button", { name: "Pin" }).click();
      await until(async () => (await panelCard("A clear way to join a group").innerText()).includes("Pinned"), "the card is marked Pinned", 8000);
      await panelCard("A clear way to join a group").getByRole("button", { name: "Unpin" }).click();
      await panelCard("A clear way to join a group!").getByRole("button", { name: "Hide" }).click();
      await until(async () => (await tvCards("missing")).length === 1, "a hidden card leaves the TV", 6000);
      assert.ok(!(await tvCards("missing")).some(c => c.text === "A clear way to join a group!"));
      await control.locator("[data-fl-card].is-hidden").filter({ hasText: "A clear way to join a group!" }).getByRole("button", { name: "Unhide" }).click();
      await until(async () => (await tvCards("missing")).length === 2, "Unhide brings it back", 6000);
    });

    await step("Rank follows agreement: the card that gains agreement glides to the top of its list without jumping", async () => {
      await write(priya, "right", "Preaching is strong");
      await write(priya, "right", "We pray together");
      await until(async () => (await tvCards("right")).length === 2, "two cards in What’s right?", 6000);
      await pick(ben, "right");
      await until(async () => await ben.locator(".fl-arow", { hasText: "We pray together" }).isVisible(), "Ben sees the card", 8000);
      await tv.evaluate(`(() => { window.__fl = { y: [], stop: false }; const read = () => { const el = [...document.querySelectorAll('.tv-layer:not(.is-leaving) .fl-col[data-col="right"] .fl-slot')].find(e => e.textContent.includes('We pray together'));
        if (el) window.__fl.y.push(el.getBoundingClientRect().top); if (!window.__fl.stop) requestAnimationFrame(read); }; requestAnimationFrame(read); })()`);
      await ben.locator(".fl-arow", { hasText: "We pray together" }).getByRole("button", { name: "Agree" }).click();
      await until(async () => (await tvCards("right"))[0]?.text === "We pray together", "the agreed card is first", 6000);
      await delay(1200);
      const ys = await tv.evaluate(() => { const w = window as unknown as { __fl: { y: number[]; stop: boolean } }; w.__fl.stop = true; return w.__fl.y; });
      const steps = ys.slice(1).map((y, i) => Math.abs(y - ys[i]));
      assert.ok(ys.length > 10 && Math.max(...steps) < 150, `the card glided: ${ys.length} frames, largest step ${Math.round(Math.max(...steps))}px`);
      assert.ok(Math.max(...steps) > 0, "it moved");
    });

    await step("SET-05: the review shows every card by list with agreement and folds, read only, and the CSV names no one", async () => {
      const page = await facContext.newPage();
      await page.goto(`${app.origin}/setup/${room.id}/four-lists`);
      await page.locator("[data-fl-review]").waitFor({ timeout: 15000 });
      const text = await page.locator("[data-fl-review]").innerText();
      for (const want of Object.values(names)) assert.ok(text.includes(want), `the review has ${want}`);
      for (const want of ["Preaching is strong", "We pray together", "A clear way to join a group", "Elder and staff roles are unclear"]) assert.ok(text.includes(want), `the review has ${want}`);
      assert.equal(await page.locator("[data-fl-review] input, [data-fl-review] textarea").count(), 0, "read only");
      assert.ok(await page.getByRole("link", { name: "Download CSV" }).isVisible());
      for (const who of ["Priya", "Ben", "Ruth"]) assert.ok(!text.includes(who), `${who} is not named`);
      await shot(page, "set-05-review");
      const csv = await (await page.request.get(`${app.origin}/api/control/${room.id}/four-lists/export`)).text();
      assert.ok(csv.replace(/^﻿/, "").startsWith("Step,List,Card,People agreeing,Folded into,Folded by,Pinned,Hidden from the TV"));
      assert.ok(csv.includes("We pray together,1"), "agreement counts are in the file");
      for (const who of ["Priya", "Ben", "Ruth", "@example.org"]) assert.ok(!csv.includes(who), `${who} is not in the CSV`);
      await page.close();
    });

    await step("Reduced motion: a card fades in over 150 milliseconds and everything else trades in place", async () => {
      await tv.emulateMedia({ reducedMotion: "reduce" });
      await delay(300);
      await tv.evaluate(`(() => { window.__rm = { transforms: new Set(), opacity: [], stop: false, seen: false }; const read = () => { const el = [...document.querySelectorAll('.tv-layer:not(.is-leaving) .fl-col[data-col="wrong"] .fl-slot')].find(e => e.textContent.includes('Staff stretched thin'));
        if (el) { window.__rm.seen = true; window.__rm.transforms.add(el.style.transform); window.__rm.opacity.push(+getComputedStyle(el).opacity); } if (!window.__rm.stop) requestAnimationFrame(read); }; requestAnimationFrame(read); })()`);
      await write(priya, "wrong", "Staff stretched thin");
      await until(async () => (await tvCards("wrong")).length === 1, "the card is on the TV", 5000);
      await delay(600);
      const rm = await tv.evaluate(() => { const w = window as unknown as { __rm: { transforms: Set<string>; opacity: number[]; stop: boolean; seen: boolean } }; w.__rm.stop = true; return { transforms: [...w.__rm.transforms], opacity: w.__rm.opacity, seen: w.__rm.seen }; });
      assert.ok(rm.seen && rm.transforms.length === 1, `it never travelled: ${JSON.stringify(rm.transforms)}`);
      assert.ok(rm.opacity.at(-1) === 1, "it ends fully shown");
      await tv.emulateMedia({ reducedMotion: "no-preference" });
    });

    for (const p of [priya, ben, ruth]) await p.context().close();
    await facContext.close(); await tvContext.close();
    await press(fac, sql, room.id, "nothing_live");

    // ---------- Part two: 50 simulated phones in the practice room ----------
    practiceSettings = (await sql.query("select settings from public.engagements where id=$1 and not deleted", [practiceRoom])).rows[0]?.settings;
    assert.ok(practiceSettings, "Run npm run db:seed first: the 50-phone run uses the practice room");
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [practiceRoom]);
    const pfac = await facilitator(env, sql, practiceRoom);
    const cookie = pfac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
    await press(pfac, sql, practiceRoom, "nothing_live");
    const big = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,options,max_sends,max_characters,max_words,planned_minutes)
      values($1,$2,'Day 1',904,'four_lists','Fifty phones','ready','{}',6,140,30,30) returning id`, [practiceRoom, `Four lists load ${randomUUID().slice(0, 6)}`])).rows[0].id as string;
    const bigResults = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [practiceRoom])).rows[0].results as Results;
    const tv2Context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv2 = await tv2Context.newPage(); await tv2.goto(app.origin + "/tv");
    const code2 = await until(async () => { const c = (await tv2.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(pfac, practiceRoom, app.secret, code2, "Four lists kit TV");
    await tv2.locator(".tv-church-logo").waitFor({ timeout: 15000 });
    await tv2.evaluate(() => { (window as unknown as { __loaded: number }).__loaded = 1; });
    await tv2.evaluate(watcher);
    const watch = async (sel: string) => tv2.evaluate(s => { const a = (window as unknown as { __acc: Watch & { sel: string } }).__acc; const out = { ...a, jumps: a.jumps.slice() }; Object.assign(a, { sel: s, frames: 0, blank: 0, dim: 0, worst: 0, worstKey: "", worstDt: 0, steps: 0, jumps: [] }); return out as Watch; }, sel);
    const layer2 = () => tv2.locator(".tv-layer:not(.is-leaving)").last();
    const phones = await joinPhones(app.origin, 50, { prefix: "Four lists phone" });
    const stamp = (p: Phone) => ({ sentAt: new Date(Date.now() + p.offset).toISOString(), uncertaintyMs: Math.min(60000, Math.round(p.uncertainty)) });
    const agree = async (p: Phone, card: string) => (await (await p.call(`/api/live/${practiceRoom}/agree`, { method: "POST", body: JSON.stringify({ id: randomUUID(), card, revision: 0, on: true, ...stamp(p) }) })).json()) as { status: string; reason?: string };
    // Cards go through the same endpoint as every answer; the id is the card's.
    const send = async (p: Phone, list: (typeof lists)[number], text: string) => p.sendValue(practiceRoom, big, { column: list }, text);

    await step("50 phones write cards while AI is slow: every card is on the TV under a second, nothing jumps, blanks or redraws, and the TV's numbers are the server's", async () => {
      fake({ delayMs: 2500 });
      await press(pfac, sql, practiceRoom, "go_live", { session: big });
      await layer2().locator(".fl-board").waitFor({ timeout: 10000 });
      await delay(900);
      await layer2().evaluate(el => { (el as unknown as { __mark: number }).__mark = 1; (el.querySelector(".tv-board") as unknown as { __mark: number }).__mark = 1; });
      await watch(".tv-layer:not(.is-leaving) .fl-slot");
      const from = new Date(Date.now() - 500).toISOString();
      // Two bursts of 50, each phone writing within six seconds.
      const statuses: string[] = [];
      for (let b = 0; b < 2; b++) {
        statuses.push(...await Promise.all(phones.map(async (p, i) => {
          await delay(Math.floor(rnd() * 6000));
          const list = lists[(i + b) % 4], texts = pool[list];
          return send(p, list, `${texts[(i * 3 + b * 2) % texts.length]} (${i + 1})`);
        })));
        await delay(1500);
      }
      assert.deepEqual([...new Set(statuses)], ["accepted"], "every card accepted");
      assert.equal(statuses.length, 100);
      await delay(2500);
      const runs = (await sql.query("select count(*)::integer as n, count(*) filter (where status='ok' and changed)::integer as changed, bool_and(job='fold_four_lists') as job from private.ai_runs where session_id=$1", [big])).rows[0];
      assert.ok(runs.n >= 1 && runs.job, `AI ran beside the cards: ${JSON.stringify(runs)}`);
      fake({});
      await until(async () => (await tv2.locator(".tv-top .tv-tally").getAttribute("aria-label").then(v => v ?? "")).startsWith("100 cards from 50 people"), "the TV count reads 100 cards from 50 people", 15000);
      const server = await bigResults();
      assert.equal(server.total, 100);
      const to = new Date().toISOString();
      const report = await (await fetch(`${app.origin}/api/control/${practiceRoom}/latency?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { headers: { Cookie: cookie } })).json() as LatencyReport;
      const mine = report.sessions.find(s => s.id === big);
      assert.ok(mine, "the latency log has the session");
      assert.equal(mine!.measured, 100, "every card reached the TV and was logged");
      const v = verdict(mine!);
      assert.ok(v.met, `95 of 100 under one second on loopback while AI works: ${v.label}`);
      const w = await watch(".tv-layer:not(.is-leaving) .fl-slot");
      assert.equal(w.blank, 0, "the TV never blanked"); assert.equal(w.dim, 0, "the TV never faded out");
      assert.ok(w.steps > 100, `the TV drew frames while cards arrived (${w.steps} item frames)`);
      assert.deepEqual(w.jumps, [], `nothing jumped (largest step ${Math.round(w.worst)} px on ${w.worstKey}, ${Math.round(w.worstDt)} ms frame)`);
      assert.ok(await layer2().evaluate(el => (el as unknown as { __mark?: number }).__mark === 1 && (el.querySelector(".tv-board") as unknown as { __mark?: number }).__mark === 1), "the TV animated in place, never drawing the view again");
      assert.ok(await tv2.evaluate(() => (window as unknown as { __loaded?: number }).__loaded === 1), "the TV page never reloaded");
      // The TV shows the server's top cards of each list, in its order, with its agreement numbers.
      const want = lists.map(l => server.cards.filter(c => c.column === l).sort((a, b) => a.rank - b.rank).slice(0, 4).map(c => `${c.text}|${c.agree}`));
      await until(async () => {
        const got = await Promise.all(lists.map(l => layer2().locator(`.fl-col[data-col="${l}"] .fl-slot`).evaluateAll(els => els.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
          .map(e => `${e.querySelector(".fl-tx")!.textContent}|${e.querySelector(".fl-agree b")!.textContent}`))));
        return got.every((g, i) => g.length >= Math.min(3, want[i].length) && g.every((x, k) => x === want[i][k]));
      }, "the TV's lists match the server's top cards", 10000);
      const folds = (await sql.query("select count(*)::integer as n from private.four_list_folds f join public.submissions s on s.id=f.member_id where s.session_id=$1 and f.undone_at is null and not f.deleted and f.made_by='ai'", [big])).rows[0].n as number;
      console.log(`50 phones, AI slow (2.5s a call): ${runs.n} AI runs, ${folds} cards folded by AI. Phone to TV: ${mine!.under_second} of ${mine!.measured} under 1 s, 95th ${mine!.p95} ms, largest step ${Math.round(w.worst)} px over ${w.steps} item frames.`);
      await shot(tv2, "int-11-50-phones-tv");
    });

    await step("50 phones agree: each agree is on the TV in under a second (95 in 100), and a card never counts its own writer or the same person twice", async () => {
      const server = await bigResults(), cards = server.cards.filter(c => c.rank <= 4);
      assert.ok(cards.length >= 8, "there are cards to agree with");
      await watch(".tv-layer:not(.is-leaving) .fl-slot");
      const times: number[] = [];
      const shown = async (card: Card) => layer2().locator(`.fl-slot[data-id="${card.id}"] .fl-agree b`).first().textContent().then(t => Number(t)).catch(() => -1);
      // Twenty timed taps, one at a time: the tap, then how long until the TV shows the new number.
      for (let i = 0; i < 20; i++) {
        const card = cards[i % cards.length], before = (await bigResults()).cards.find(c => c.id === card.id)!, p = phones[(i * 7 + 3) % 50];
        const start = Date.now(), reply = await agree(p, card.id);
        if (reply.status !== "accepted") continue;
        const now = (await bigResults()).cards.find(c => c.id === card.id);
        if (!now || now.agree === before.agree) continue;
        await until(async () => (await shown(now)) === now.agree, `agree ${i} on the TV`, 4000);
        times.push(Date.now() - start);
      }
      assert.ok(times.length >= 12, `most timed agrees counted (${times.length} of 20)`);
      const sorted = [...times].sort((a, b) => a - b), p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
      assert.ok(sorted.filter(t => t < 1000).length / sorted.length >= 0.95, `95 in 100 agrees under one second: 95th ${p95} ms, slowest ${sorted.at(-1)} ms`);
      // Every other phone agrees with something too, in a burst, while the TV watches the cards trade places.
      const statuses = await Promise.all(phones.map(async (p, i) => { await delay(Math.floor(rnd() * 4000)); const reply = await agree(p, cards[(i * 5) % cards.length].id); return reply.reason ?? reply.status; }));
      assert.ok(statuses.every(s => ["accepted", "duplicate", "own", "conflict"].includes(s)), `every agree counted or refused for a reason: ${[...new Set(statuses)]}`);
      await delay(2000);
      const w = await watch(".tv-layer:not(.is-leaving) .fl-slot");
      assert.deepEqual(w.jumps, [], `nothing jumped while cards traded places (largest step ${Math.round(w.worst)} px on ${w.worstKey})`);
      assert.equal(w.blank, 0); assert.equal(w.dim, 0);
      // A writer can never agree with their own card: the card's text ends with its writer's number, so the writer's phone is known.
      const writerOf = (c: Card) => phones[Number(/\((\d+)\)$/.exec(c.text)?.[1]) - 1];
      const mine = cards.find(c => writerOf(c));
      assert.ok(mine, "a standing card whose writer is known");
      const own = await agree(writerOf(mine!), mine!.id);
      assert.equal(own.reason, "own", `a writer's agree on their own card is refused (${own.status}/${own.reason})`);
      // Same person twice: a second agree from the same phone on the same card, with a new id, lands on the one row and never counts twice.
      const target = cards.find(c => writerOf(c) !== phones[1])!;
      const first = await agree(phones[1], target.id), second = await agree(phones[1], target.id);
      assert.equal(first.status, "accepted", `phone 2 agrees (${first.status}/${first.reason})`);
      assert.equal(second.status, "accepted", `and again from a new press (${second.status}/${second.reason})`);
      const who = (await sql.query("select attendee_id from private.four_list_agrees where id=$1", [(first as unknown as { id: string }).id])).rows[0]?.attendee_id as string;
      const person = (await sql.query("select count(*)::integer as n, bool_and(agreed) as on from private.four_list_agrees where card_id=$1 and attendee_id=$2 and not deleted", [target.id, who])).rows[0];
      assert.equal(person.n, 1, "one agree row for the person and the card"); assert.equal(person.on, true);
      // Every standing card, not the TV's top few, is on a phone to agree with.
      const feed = await (await phones[3].call(`/api/live/${practiceRoom}/agree?session=${big}`)).json() as { cards: { id: string }[] };
      const standing = (await sql.query("select jsonb_array_length(private.four_lists_board($1,false))::integer as n", [big])).rows[0].n as number;
      assert.ok(standing > server.cards.length, `more cards stand (${standing}) than the TV holds (${server.cards.length})`);
      assert.equal(feed.cards.length, standing, "the phone is offered every standing card");
      const dup = (await sql.query("select card_id,attendee_id,count(*)::integer as n from private.four_list_agrees where engagement_id=$1 and not deleted group by 1,2 having count(*)>1", [practiceRoom])).rowCount;
      assert.equal(dup, 0, "one agree per person per card");
      const final = await bigResults();
      await until(async () => {
        const got = await layer2().locator(".fl-slot").evaluateAll(els => els.map(e => [(e as HTMLElement).dataset.id!, Number(e.querySelector(".fl-agree b")!.textContent)] as const));
        return got.length > 0 && got.every(([id, n]) => final.cards.find(c => c.id === id)?.agree === n);
      }, "every number on the TV is the server's", 10000);
      console.log(`Agrees: ${times.length} timed taps, median ${sorted[Math.floor(sorted.length / 2)]} ms, 95th ${p95} ms, slowest ${sorted.at(-1)} ms. Largest step while cards traded places: ${Math.round(w.worst)} px.`);
    });

    await step("No AI input carried a name, an email or a person: cards are text and counts under short refs", async () => {
      const runs = (await sql.query("select inputs::text as inputs from private.ai_runs where session_id=$1", [big])).rows as { inputs: string }[];
      assert.ok(runs.length > 0 && runs.every(r => !r.inputs.includes("@example.org") && !/"(name|email|attendee)/.test(r.inputs)));
    });
    await press(pfac, sql, practiceRoom, "nothing_live");
    console.log(`Four Helpful Lists kit: ${passed.length} checks passed. Local checks on loopback, with the scripted fake model.\n${passed.map(p => `  ${p}`).join("\n")}`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally {
    if (practiceSettings) await sql.query("update public.engagements set settings=$2 where id=$1", [practiceRoom, practiceSettings]).catch(() => {});
    await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); rmSync(controlDir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exit(1); });
