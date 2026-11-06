// Milestone 6, step 1: the Four Helpful Lists (INT-11) in real browsers against the production build and the local
// stack, with the scripted stand-in for the model (never the API). A paired TV shows the four lists while 50 simulated
// phones add cards and agree with each other's through the real endpoints and AI groups slowly in the background.
// It checks the live-screen rules (95 of 100 phone-to-TV times under one second, nothing jumps between frames, the TV's
// numbers are the server's), that AI never sits in the path (the model is made slow and the cards still arrive), the AI
// controls (pin, undo, off and on), Hide, a phone in a real browser, and the review after the session (SET-05) with its
// marks stored for step 4. KIT_SHOTS=<folder> saves screens.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { promptVersions } from "../../lib/ai/prompts";
import { listKeys, listNames, type ListKey } from "../../lib/interactions/four-lists";
import { verdict, type LatencyReport } from "../../lib/latency/report";
import { joinPhones, practiceRoom, type Phone } from "../../scripts/load-test";
import { db, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

// The scripted stand-in reads this file on every call: slow or well.
const controlDir = join(tmpdir(), `clearway-lists-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
const fake = (value: { delayMs?: number; fail?: boolean }) => writeFileSync(controlFile, JSON.stringify(value));
fake({});
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "250", ANTHROPIC_API_KEY: "" });

// Samples every card on the TV on every frame, as plain script so no bundler helper reaches the page. For each card it keeps
// where the card is laid out (offsets, which ignore transforms) and where it is drawn (the bounding box). A card that is laid out
// somewhere new must be drawn where it was a frame ago, then glide: a card whose drawn place leaps when its layout place changes
// jumped. A card appearing or leaving is not a move.
const sampler = `(() => { window.flSamples = { frames: 0, moves: 0, leaps: [], blank: 0, worst: 0, long: [] }; window.flStop = false; const last = new Map();
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) window.flSamples.long.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch {}
  const read = () => { const s = window.flSamples; s.frames++;
    const layer = document.querySelector('.tv-layer:not(.is-leaving) [data-board="four_lists"]'); if (!layer) s.blank++;
    const seen = new Set();
    for (const el of document.querySelectorAll('.tv-layer:not(.is-leaving) .fl-card:not(.fl-ghost)')) {
      if (!el.offsetParent) continue; const id = el.dataset.card; seen.add(id);
      const r = el.getBoundingClientRect(), now = { lx: el.offsetLeft, ly: el.offsetTop, vx: r.left, vy: r.top, col: el.closest('[data-col]').dataset.col }, was = last.get(id);
      if (was && was.col === now.col && (Math.abs(now.lx - was.lx) > 1 || Math.abs(now.ly - was.ly) > 1)) {
        s.moves++; const leap = Math.hypot(now.vx - was.vx, now.vy - was.vy); s.worst = Math.max(s.worst, leap);
        if (leap > 24) s.leaps.push([id, Math.round(leap), now.col, el.getAnimations().length, Math.round(now.ly - was.ly), Math.round(performance.now())]); }
      last.set(id, now); }
    for (const id of [...last.keys()]) if (!seen.has(id)) last.delete(id);
    if (!window.flStop) requestAnimationFrame(read); };
  requestAnimationFrame(read); })()`;
type Samples = { frames: number; moves: number; leaps: (string | number)[][]; blank: number; worst: number; long: number[] };

const lines: Record<ListKey, string[]> = {
  right: ["Volunteers serve with real joy", "Our greeters make people feel welcome", "The preaching is honest and practical", "Worship feels warm and sincere", "Kids love coming on Sunday", "People pray for each other"],
  wrong: ["Preaching goes too long and loses people", "Sermons run long and people drift", "Parking is a mess on Sunday", "Volunteers are stretched and tired", "Our staff are stretched too thin", "Announcements take forever"],
  missing: ["A clear way into small groups", "Easy ways to join a group and belong", "A plan for young adults", "A place for students to connect", "Training for new volunteers", "A guest follow-up that works"],
  confused: ["Who decides the budget?", "Who approves spending and decides roles?", "What happened to the youth group?", "Who leads the elders now?", "What is our real mission?", "How do we choose what to stop?"],
};
const pool = listKeys.flatMap(col => lines[col].map(text => ({ col, text })));

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url), room = practiceRoom;
  let browser: Browser | undefined;
  const passed: string[] = [], errors: string[] = [];
  const settle = async (page: Page) => {
    const read = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[style]")].map(e => `${e.style.transform}|${e.style.opacity}|${e.style.fontSize}`).join(";"));
    let last = await read();
    for (let i = 0; i < 40; i++) { await delay(400); const now = await read(); if (now === last) return; last = now; }
  };
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(600); await settle(page); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    browser = await chromium.launch();
    const seeded = (await sql.query("select settings from public.engagements where id=$1 and not deleted", [room])).rows[0];
    assert.ok(seeded, "Run npm run db:seed first: the 50-phone run uses the practice room");
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [room]);
    try {
      const fac = await facilitator(env, sql, room), cookie = fac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
      const tag = randomUUID().slice(0, 6);
      const session = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,max_words,options)
        values($1,$2,'Day 1',905,'four_lists','Add what is right, wrong, missing and confused about how we work today','ready',12,200,50,coalesce(private.session_options('four_lists','{"ai":true}'::jsonb,$1),'{}'::jsonb)) returning id`, [room, `Four lists ${tag}`])).rows[0].id as string;
      const server = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [room])).rows[0].results as { total: number; people: number; ai: boolean; columns: Record<ListKey, { cards: number; units: number }>; cards: { id: string; col: ListKey; text: string; agree: number; held: number; ai: boolean; pinned: boolean; ids: string[] }[] };
      const ai = async (action: string, body: Record<string, unknown> = {}) => (await (await fetch(`${app.origin}/api/control/${room}/ai`, { method: "POST", headers: { Cookie: cookie, Origin: app.origin, "Content-Type": "application/json" }, body: JSON.stringify({ id: randomUUID(), action, session, ...body }) })).json()) as { status: string };
      const aiStatus = async () => (await (await fetch(`${app.origin}/api/control/${room}/ai?session=${session}`, { headers: { Cookie: cookie }, cache: "no-store" })).json()) as { groups: { id: string; label: string; column: string; pinned: boolean; undone: boolean; members: { id: string }[] }[]; session: { ai: boolean } };
      const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
      tv.on("pageerror", e => errors.push(`pageerror: ${e.message} ${(e.stack ?? "").split("\n").slice(0, 4).join(" | ")}`));
      tv.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
      await tv.goto(app.origin + "/tv");
      const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
      await pairTv(fac, room, app.secret, code, "Four lists kit TV");
      await press(fac, sql, room, "go_live", { session });
      const board = '.tv-layer:not(.is-leaving) [data-board="four_lists"]';
      await tv.locator(board).waitFor({ timeout: 10000 });

      await step("Four lists stand side by side, told apart by heading and position, and wait empty", async () => {
        const heads = await tv.locator(`${board} .fl-col`).evaluateAll(cols => cols.map(c => ({ name: c.querySelector("h2")!.textContent, x: c.getBoundingClientRect().left })));
        assert.deepEqual(heads.map(h => h.name), listKeys.map(k => listNames[k]), "the four headings, in order");
        assert.ok(heads.every((h, i) => i === 0 || h.x > heads[i - 1].x + 100), "each list stands to the right of the last");
        assert.equal(await tv.locator(`${board} .fl-card`).count(), 0, "no cards before anyone writes");
        await shot(tv, "four-lists-empty-1920");
      });

      const phones = await joinPhones(app.origin, 50, { prefix: "Lists phone" });
      const post = async (p: Phone, path: string, body: unknown) => (await (await p.call(path, { method: "POST", body: JSON.stringify(body) })).json().catch(() => ({ status: "bad" }))) as { status: string; count?: number };
      const read = async (p: Phone) => ((await (await p.call(`/api/live/${room}/lists?session=${session}`, { cache: "no-store" })).json()) as { status: string; cards: { id: string; col: ListKey; text: string; agree: number; mine: boolean; own: boolean }[] });
      await tv.evaluate(sampler);

      await step("Rules: 200 characters, a limit per person, a card needs its list", async () => {
        const p = phones[0], long = "x".repeat(201);
        assert.notEqual(await p.sendValue(room, session, { column: "wrong" }, long), "accepted", "201 characters turned away");
        assert.notEqual(await p.sendValue(room, session, {}, "No list chosen"), "accepted", "a card needs a list");
        assert.notEqual(await p.sendValue(room, session, { column: "elsewhere" }, "A made-up list"), "accepted", "only the four lists");
        const out: string[] = [];
        for (let i = 0; i < 13; i++) out.push(await p.sendValue(room, session, { column: "right" }, `Limit card ${i + 1}`));
        assert.equal(out.filter(s => s === "accepted").length, 12, `12 accepted, got ${JSON.stringify(out)}`);
        assert.notEqual(out[12], "accepted", "the 13th turned away");
        // Put the room back for the load: withdrawing is the phone's own undo.
        await sql.query("update private.latency_logs set deleted=true where submission_id in (select id from public.submissions where session_id=$1)", [session]);
        await sql.query("update public.submissions set deleted=true where session_id=$1", [session]);
        await sql.query("update public.room_states set results=private.live_results(engagement_id) where engagement_id=$1", [room]);
      });

      await step("Crowded, 50 phones with AI slow: every card reaches the TV under a second, nothing jumps, AI is never in the way", async () => {
        fake({ delayMs: 2500 });
        const from = new Date(Date.now() - 1000).toISOString();
        const sent: string[] = [];
        for (let wave = 0; wave < 2; wave++) {
          if (wave) await delay(2000);
          const out = await Promise.all(phones.map(async (p, i) => {
            await delay(Math.floor(Math.random() * 8000));
            const card = pool[(i * 5 + wave * 11) % pool.length];
            const status = await p.sendValue(room, session, { column: card.col }, `${card.text}${wave ? "" : " "}`.trim());
            return status;
          }));
          sent.push(...out);
        }
        assert.deepEqual([...new Set(sent)], ["accepted"], "every card accepted");
        const r = await server();
        assert.equal(r.total, 100, "100 cards stand");
        assert.equal(r.people, 50);
        // The TV acknowledges each card with the time it was received; give the acknowledgements a moment to arrive.
        const readReport = async () => {
          const response = await fetch(`${app.origin}/api/control/${room}/latency?from=${encodeURIComponent(from)}&to=${encodeURIComponent(new Date().toISOString())}`, { headers: { Cookie: cookie } });
          assert.ok(response.ok, "the latency report reads");
          return await response.json() as LatencyReport;
        };
        let report = await readReport();
        for (let i = 0; i < 40 && report.measured < 100; i++) { await delay(500); report = await readReport(); }
        assert.equal(report.measured, 100, "every card reached the TV and was logged");
        assert.ok(verdict(report).met, `95 of 100 under one second while AI is slow: ${verdict(report).label}`);
        console.log(`50 phones, 100 cards, AI slow (2.5s a call): phone to TV median ${report.phone_tv.p50} ms, 95th ${report.phone_tv.p95} ms, slowest ${report.phone_tv.max} ms.`);
        await shot(tv, "four-lists-100-cards-1920");
      });

      await step("50 phones agree: one agreement per person per card, undoable, never on their own card", async () => {
        const first = await read(phones[0]);
        assert.equal(first.status, "ok");
        assert.equal(first.cards.length, 100, "a phone reads everyone's cards");
        assert.ok(first.cards.some(c => c.own) && first.cards.some(c => !c.own), "its own cards are marked");
        const ownCard = first.cards.find(c => c.own)!;
        assert.equal((await post(phones[0], `/api/live/${room}/agree`, { card: ownCard.id, on: true })).status, "own", "not your own card");
        const target = first.cards.find(c => !c.own && c.agree === 0)!;
        assert.equal((await post(phones[0], `/api/live/${room}/agree`, { card: target.id, on: true })).status, "accepted");
        const twice = await post(phones[0], `/api/live/${room}/agree`, { card: target.id, on: true });
        assert.equal(twice.status, "accepted"); assert.equal(twice.count, 1, "agreeing twice counts once");
        const back = await post(phones[0], `/api/live/${room}/agree`, { card: target.id, on: false });
        assert.equal(back.count, 0, "taking it back undoes it");
        // The room agrees with a few cards, some more than others, so the lists re-order as the counts rise.
        const read2 = await Promise.all(phones.map(p => read(p)));
        const liked = [...read2[1].cards].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 12);
        const out = await Promise.all(phones.map(async (p, i) => {
          await delay(Math.floor(Math.random() * 6000));
          const picks = liked.filter((c, k) => (k + i) % 3 === 0 || k < 2).filter(c => !read2[i].cards.find(x => x.id === c.id)?.own);
          const results = [];
          for (const c of picks) results.push((await post(p, `/api/live/${room}/agree`, { card: c.id, on: true })).status);
          return results;
        }));
        assert.deepEqual([...new Set(out.flat())], ["accepted"], "every agreement accepted");
        await delay(2500);
        const sums = await sql.query(`select count(*)::integer as n, count(distinct (submission_id, attendee_id))::integer as pairs from private.four_list_agreements where session_id=$1 and agreed and not deleted`, [session]);
        assert.equal(sums.rows[0].n, sums.rows[0].pairs, "one agreement per person per card");
        assert.equal(await sql.query("select 1 from private.four_list_agreements a join public.submissions s on s.id=a.submission_id where a.session_id=$1 and a.attendee_id=s.attendee_id and a.agreed", [session]).then(r => r.rowCount), 0, "no one agreed with their own card");
      });

      await step("The TV's numbers are the server's: counts, order, and what waits on phones", async () => {
        const r = await server();
        await until(async () => Number(((await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").then(v => v ?? "")).match(/\d+/) ?? [])[0]) === r.total, "the TV count matches the server", 8000);
        await delay(2500);
        const final = await server();
        for (const col of listKeys) {
          const ranked = final.cards.filter(c => c.col === col);
          const shown = await tv.locator(`${board} .fl-col[data-col="${col}"] .fl-card:not([data-over]):not(.fl-ghost)`).evaluateAll(els => els.map(e => ({ id: (e as HTMLElement).dataset.card!, agree: Number((e as HTMLElement).dataset.agree) })));
          assert.ok(shown.length >= 1, `${col} shows cards`);
          assert.deepEqual(shown.map(s => s.id), ranked.slice(0, shown.length).map(c => c.id), `${col}: the TV stands in the server's order`);
          assert.deepEqual(shown.map(s => s.agree), ranked.slice(0, shown.length).map(c => c.agree), `${col}: the agreement counts are the server's`);
          const more = (await tv.locator(`${board} .fl-col[data-col="${col}"] .fl-more`).innerText()).trim();
          const waiting = final.columns[col].units - shown.length;
          assert.equal(more, waiting > 0 ? `+ ${waiting} more on phones` : "", `${col}: the line for cards that wait on phones`);
        }
        assert.ok(final.cards.some(c => c.agree >= 2), "the room agreed with some cards more than once");
        const type = await tv.locator(`${board} .fl-card`).first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
        assert.ok(type >= 36, `type stays at the room minimum or larger (${type}px)`);
        const overflow = await tv.locator(`${board} .fl-board`).evaluate(el => el.scrollHeight - el.clientHeight);
        assert.ok(overflow <= 2, `nothing runs off the bottom of the board (${overflow}px)`);
        await shot(tv, "four-lists-agreed-1920");
      });

      await step("AI grouped inside lists, marked once with the AI icon; nothing crossed a list", async () => {
        fake({});
        const runs = await until(async () => { const r = (await sql.query("select count(*)::integer as n, count(*) filter (where status='ok' and changed)::integer as changed, bool_and(job='group_four_lists') as job, bool_and(prompt_version=$2) as version from private.ai_runs where session_id=$1", [session, promptVersions.group_four_lists])).rows[0]; return r.changed >= 1 && r; }, "AI grouped", 20000);
        assert.ok(runs.job && runs.version, "every run was the lists job, on its prompt version");
        const crossing = (await sql.query(`select g.id from private.ai_groups g join private.ai_group_members m on m.group_id=g.id and m.removed_at is null and not m.deleted
          join public.submissions s on s.id=m.submission_id where g.session_id=$1 and g.undone_at is null group by g.id having count(distinct s.value->>'column')>1`, [session])).rowCount;
        assert.equal(crossing, 0, "no group holds cards from two lists");
        await until(async () => (await server()).ai, "the results say AI grouped", 8000);
        await until(async () => (await tv.locator(`${board} .fl-card[data-ai="true"]`).count()) > 0 || (await tv.locator(`${board} .fl-more`).allInnerTexts()).some(t => t.trim()), "a grouped card or a list with cards waiting", 8000);
        const final = await server();
        if (final.cards.some(c => c.ai)) {
          const grouped = final.cards.find(c => c.ai)!, el = tv.locator(`${board} .fl-card[data-card="${grouped.id}"]:not([data-over])`);
          if (await el.count()) { assert.ok(await el.locator(".fl-ai .cwl-ai-mark").count() > 0, "the grouped card carries the AI icon"); assert.equal((await el.locator(".fl-ai span").last().innerText()).trim(), String(grouped.held), "with the number of cards it holds"); }
        }
        assert.equal((await tv.locator(`${board} .fl-foot`).innerText()).trim(), "Grouped from your answers", "the AI line");
        assert.ok(await tv.locator(`${board} .fl-foot .cwl-ai-mark`).count() > 0, "beside the AI icon");
        const names = (await sql.query("select inputs::text as inputs from private.ai_runs where session_id=$1", [session])).rows as { inputs: string }[];
        assert.ok(names.every(r => !r.inputs.includes("@example.org") && !/"(name|email)"/.test(r.inputs)), "no AI input carried a name or an email");
        await shot(tv, "four-lists-ai-grouped-1920");
      });

      await step("Control: pin keeps a group, undo dissolves it, off stands every card alone, on groups again", async () => {
        const status = await aiStatus();
        const groups = status.groups.filter(g => !g.undone);
        assert.ok(groups.length >= 1, `AI made groups: ${JSON.stringify(groups.map(g => g.label))}`);
        assert.ok(groups.every(g => ["right", "wrong", "missing", "confused"].includes(g.column)), "each group names its list");
        const pin = groups[0];
        assert.equal((await ai("pin_group", { group: pin.id })).status, "ok");
        await until(async () => (await server()).cards.some(c => c.pinned), "the server shows the pin", 5000);
        assert.equal((await ai("undo_group", { group: groups[groups.length - 1].id })).status, "ok");
        const afterUndo = await aiStatus();
        assert.ok(afterUndo.groups.find(g => g.id === groups[groups.length - 1].id)?.undone, "undone groups say so");
        const total = (await server()).total;
        assert.equal((await ai("ai_off")).status, "ok");
        await until(async () => { const r = await server(); return !r.ai && r.cards.every(c => c.held === 1); }, "off: every card stands alone", 6000);
        assert.equal((await server()).total, total, "no card was lost");
        await until(async () => (await tv.locator(`${board} .fl-foot .cwl-ai-mark`).count()) === 0, "the AI line leaves with AI", 6000);
        assert.equal((await ai("ai_on")).status, "ok");
        await until(async () => (await server()).ai, "on: grouped again", 20000);
        await shot(tv, "four-lists-control-1920");
      });

      await step("Hide takes a card off the TV and its count; Unhide puts it back", async () => {
        const r = await server(), victim = r.cards.find(c => c.held === 1 && !c.pinned)!;
        const total = r.total;
        await press(fac, sql, room, "hide", { item: victim.id });
        await until(async () => (await server()).total === total - 1 && !(await server()).cards.some(c => c.id === victim.id), "hidden: gone from the results", 5000);
        await until(async () => (await tv.locator(`${board} .fl-card[data-card="${victim.id}"]`).count()) === 0, "gone from the TV", 5000);
        await press(fac, sql, room, "unhide", { item: victim.id });
        await until(async () => (await server()).total === total, "unhidden: back in the results", 5000);
      });

      await step("A phone in a real browser: pick a list, add a card, see everyone's by list, agree and take it back", async () => {
        const p = phones[7];
        const context = await browser!.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
        const jar = (p as unknown as { jar: Map<string, string> }).jar;
        await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: app.origin })));
        const page = await context.newPage();
        await page.goto(`${app.origin}/room/${room}`);
        // A tap, as a thumb would: bring the control to the middle of the screen, clear of the sticky header.
        const tap = async (target: ReturnType<Page["locator"]>) => { await target.evaluate(el => el.scrollIntoView({ block: "center" })); await target.click(); };
        await page.getByRole("radio", { name: listNames.missing }).waitFor({ state: "attached", timeout: 15000 });
        await tap(page.locator(".fl-pick label", { hasText: listNames.missing }));
        assert.ok(await page.getByRole("radio", { name: listNames.missing }).isChecked(), "the list is picked");
        const words = `A better way to follow up with guests ${tag}`;
        await page.getByLabel("Your card").fill(words);
        await shot(page, "four-lists-phone-typing");
        await tap(page.getByRole("button", { name: "Add to list" }));
        await until(async () => (await sql.query("select 1 from public.submissions where session_id=$1 and text=$2 and value->>'column'='missing' and not deleted", [session, words])).rowCount === 1, "the card is stored in the list that was picked", 5000);
        for (const key of listKeys) await page.getByText(new RegExp(`^${listNames[key].replace("?", "\\?")} · \\d+$`)).waitFor({ timeout: 8000 });
        const pick = page.locator(".fl-row:not(:has-text('Yours'))").filter({ has: page.getByRole("button", { name: /^Agree with/ }) }).first();
        await pick.waitFor({ timeout: 8000 });
        const row = page.locator(`.fl-row[data-card="${await pick.getAttribute("data-card")}"]`);
        const agree = row.getByRole("button", { name: /^Agree with/ });
        await tap(agree);
        await row.getByRole("button", { name: /^Take back your agreement/ }).waitFor({ timeout: 5000 });
        assert.equal(await row.getByRole("button", { name: /^Take back/ }).getAttribute("aria-pressed"), "true");
        await shot(page, "four-lists-phone-agreed");
        await tap(row.getByRole("button", { name: /^Take back/ }));
        await row.getByRole("button", { name: /^Agree with/ }).waitFor({ timeout: 5000 });
        const names = await page.locator(".fl-row").allInnerTexts();
        assert.ok(names.every(t => !/Lists phone \d+/.test(t)), "no name on any card");
        assert.equal(await page.locator(".fl-pick input").count(), 4, "the four lists to pick from");
        await context.close();
      });

      await step("Frame sampling: no card jumped, the TV never blanked", async () => {
        const s = await tv.evaluate(() => { const w = window as unknown as { flSamples: Samples; flStop: boolean }; w.flStop = true; return w.flSamples; });
        assert.ok(s.frames > 100 && s.moves > 0, `cards were sampled moving (${s.frames} frames, ${s.moves} moves)`);
        assert.equal(s.blank, 0, "the TV never blanked");
        assert.deepEqual(s.leaps, [], `no card leapt when its place changed (largest ${Math.round(s.worst)}px across ${s.moves} moves in ${s.frames} frames)`);
        console.log(`Frame sampling: ${s.moves} card moves over ${s.frames} frames, largest unglided step ${Math.round(s.worst)}px. Long tasks on the TV: ${s.long.length}, longest ${Math.max(0, ...s.long)} ms.`);
      });

      await step("The review (SET-05): edit words, merge, set aside, mark; the marks are stored for step 4", async () => {
        const facCtx = await browser!.newContext({ viewport: { width: 1440, height: 1000 } });
        await facCtx.addCookies(fac.cookies(app.origin));
        const page = await facCtx.newPage();
        await page.goto(`${app.origin}/control/${room}/lists/${session}`);
        await page.locator('[data-review="four_lists"]').waitFor({ timeout: 15000 });
        assert.equal(await page.locator(".fl-rcol").count(), 4, "four columns");
        const wrong = page.locator('.fl-rcol[data-col="wrong"] .fl-rcard');
        const firstId = (await wrong.nth(0).getAttribute("data-card"))!, secondId = (await wrong.nth(1).getAttribute("data-card"))!, thirdId = (await wrong.nth(2).getAttribute("data-card"))!;
        const api = async (body: Record<string, unknown>) => (await (await fetch(`${app.origin}/api/control/${room}/lists`, { method: "POST", headers: { Cookie: cookie, Origin: app.origin, "Content-Type": "application/json" }, body: JSON.stringify({ session, ...body }) })).json()) as { status: string };
        // Edit words in the page.
        await wrong.nth(0).getByRole("button", { name: "Edit words" }).click();
        await page.getByLabel("Words for this card").fill("Preaching runs long");
        await page.getByRole("button", { name: "Save words" }).click();
        await page.locator(`.fl-rcard[data-card="${firstId}"]:has-text("Preaching runs long")`).waitFor({ timeout: 5000 });
        await page.locator(`.fl-rcard[data-card="${firstId}"]`).getByText(/^Edited\. Original:/).waitFor();
        // Mark in the page.
        await page.locator(`.fl-rcard[data-card="${firstId}"]`).getByLabel("Feeds What We Heard").check();
        await page.locator(`.fl-rcard[data-card="${firstId}"]`).getByLabel("Feeds Strategic Tensions").check();
        await until(async () => (await sql.query("select feeds_heard,feeds_tensions from private.four_list_review where submission_id=$1", [firstId])).rows[0]?.feeds_tensions === true, "the marks are stored", 5000);
        // A tension can only come from what is wrong or confused.
        const rightId = (await page.locator('.fl-rcol[data-col="right"] .fl-rcard').first().getAttribute("data-card"))!;
        assert.equal((await api({ action: "mark", card: rightId, heard: true, tensions: true })).status, "invalid_state");
        assert.equal(await page.locator(`.fl-rcard[data-card="${rightId}"]`).getByLabel("Feeds Strategic Tensions").count(), 0, "the page offers no tension mark on What's right?");
        // Merge two, set one aside.
        assert.equal((await api({ action: "merge", cards: [firstId, secondId] })).status, "ok");
        assert.equal((await api({ action: "keep", card: thirdId, kept: false })).status, "ok");
        await page.reload();
        await page.locator(`.fl-rcard[data-card="${firstId}"] .merged li`).waitFor({ timeout: 8000 });
        assert.equal(await page.locator(`.fl-rcard[data-card="${secondId}"]`).count(), 0, "a merged card stands inside its survivor");
        assert.equal(await page.locator(`.fl-rcard[data-card="${thirdId}"].is-aside`).count(), 1, "a card set aside is marked");
        const marks = await fac.client.rpc("four_lists_marks", { p_engagement: room });
        assert.equal(marks.data.status, "ok");
        const feeds = (marks.data.cards as { session: string; card: string; text: string; heard: boolean; tensions: boolean; agree: number; took_part: number }[]).filter(c => c.session === session && (c.heard || c.tensions));
        assert.deepEqual(feeds.map(c => [c.card, c.text, c.heard, c.tensions]), [[firstId, "Preaching runs long", true, true]], "step 4 reads the words as edited, with both marks");
        assert.ok(feeds[0].took_part >= 50, "and how many people took part");
        assert.equal((await api({ action: "unmerge", card: secondId })).status, "ok");
        await shot(page, "four-lists-review-1440");
        await facCtx.close();
      });

      await step("The control surface lists counts per list and Hide", async () => {
        const facCtx = await browser!.newContext({ viewport: { width: 1440, height: 1000 } });
        await facCtx.addCookies(fac.cookies(app.origin));
        const page = await facCtx.newPage();
        await page.goto(`${app.origin}/control/${room}`);
        await page.locator("[data-fl-counts]").waitFor({ timeout: 15000 });
        const readCounts = () => page.locator("[data-fl-counts] li").evaluateAll(els => els.map(e => [e.querySelector("span")!.textContent, Number(e.querySelector("b")!.textContent)] as [string, number]));
        const total = (await server()).total;
        await until(async () => (await readCounts()).reduce((a, c) => a + c[1], 0) === total, `the counts per list add up to the ${total} cards`, 10000);
        const counts = await readCounts();
        assert.deepEqual(counts.map(c => c[0]), listKeys.map(k => listNames[k]));
        const byList = await sql.query("select value->>'column' as col, count(*)::integer as n from public.submissions where session_id=$1 and not deleted and not withdrawn and not hidden group by 1", [session]);
        for (const [i, key] of listKeys.entries()) assert.equal(counts[i][1], byList.rows.find(r => r.col === key)?.n ?? 0, `${key}: the count is the database's`);
        await until(async () => (await page.locator("[data-ai-panel]").count()) > 0, "the AI panel is there", 8000);
        assert.ok(await page.locator("[data-fl-items] button", { hasText: "Hide" }).count() > 0, "Hide on each card");
        await page.locator("[data-ai-groups]").waitFor();
        await shot(page, "four-lists-control-surface-1440");
        await facCtx.close();
      });

      await press(fac, sql, room, "nothing_live");
    } finally {
      await sql.query("update public.engagements set settings=$2 where id=$1", [room, seeded.settings]);
    }
    console.log(`Four lists kit: ${passed.length} checks passed. Local checks on loopback, with the scripted stand-in for the model.`);
  } catch (error) {
    console.error(app.output().slice(-3000)); if (errors.length) console.error(`TV page errors:\n${[...new Set(errors)].slice(0, 8).join("\n")}`); throw error;
  } finally { await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); rmSync(controlDir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exit(1); });
