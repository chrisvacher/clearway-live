// Milestone 3, step 5: AI, live, in real browsers against the production build and the local
// stack, with the scripted fake model (never the API). A paired TV, three signed-in phones,
// the control surface and the remote run INT-01's combine and Undo, INT-02's groups with
// rename, pin, undo and AI off, Show summary, INT-03's fold by AI and its undo, and FAIL-09
// (AI slow, AI not responding, AI switched off). Then 50 simulated phones answer an AI wall
// in the practice room while AI is slow, against the live-screen rules. KIT_SHOTS=<folder> saves screens.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { verdict } from "../../lib/latency/report";
import { describe, practiceRoom, runLoad } from "../../scripts/load-test";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

// The scripted fake model reads this file on every call: slow, failing or well.
const controlDir = join(tmpdir(), `clearway-ai-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
const fake = (value: { delayMs?: number; fail?: boolean }) => writeFileSync(controlFile, JSON.stringify(value));
fake({});
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "250", ANTHROPIC_API_KEY: "" });

// Samples each AI group label's place on every frame, as a plain script so no bundler helper reaches the page.
const sampler = `(() => { window.aiSamples = {}; window.aiStop = false;
  const read = () => { for (const el of document.querySelectorAll('.tv-layer:not(.is-leaving) .ai-wall[data-ai="on"] .ai-group, .tv-layer:not(.is-leaving) .ai-wall[data-ai="off"] .ai-card')) {
    const m = /translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/.exec(el.style.transform); if (m) (window.aiSamples[el.dataset.key] ??= []).push([Number(m[1]), Number(m[2])]); }
    if (!window.aiStop) requestAnimationFrame(read); };
  requestAnimationFrame(read); })()`;
const jump = 150;

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(1200); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    const room = await engagement(sql, ["Priya", "Ben", "Ruth"]);
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [room.id]);
    const cloud = await room.session("Celebration: one word", "word_cloud", "One word for what God is doing at Riverside", 1, { maxSends: 10 });
    const wall = await room.session("Celebration wall", "wall", "What is God doing that is worth celebrating?", 2, { maxSends: 10 });
    const qa = await room.session("Questions", "qa", "What do you want to ask about the plan?", 3, { maxSends: 10, maxChars: 200 });
    const fac = await facilitator(env, sql, room.id);
    const results = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [room.id])).rows[0].results;
    browser = await chromium.launch();

    const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    await tv.goto(app.origin + "/tv");
    const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(fac, room.id, app.secret, code);
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
    const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
    const tvSays = async () => (await tv.locator("body").innerText()).toLowerCase();
    // The words on the TV now: anything fading out is leaving.
    const words = async () => layer().locator(".tv-word:not(.is-going)").evaluateAll(els => els.filter(e => Number(getComputedStyle(e).opacity) > 0.5).map(e => e.textContent!.trim()));

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
    const send = async (page: Page, text: string) => {
      await page.locator("#ph-answer").waitFor({ timeout: 10000 });
      await page.fill("#ph-answer", text); await page.locator(".ph-send").click();
      await until(async () => (await page.locator(".ph-answers").innerText().catch(() => "")).includes(text.split(",")[0].trim()), `sent: ${text}`, 8000);
    };
    const ask = async (page: Page, text: string) => { await page.locator("#qa-question").waitFor({ timeout: 10000 }); await page.fill("#qa-question", text); await page.locator(".qa-ask-form .ph-send").click(); };

    const facContext = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
    await facContext.addCookies(fac.cookies(app.origin));
    const control = await facContext.newPage();
    await control.goto(`${app.origin}/control/${room.id}`);
    const panel = () => control.locator("[data-ai-panel]");

    // ---------- INT-01 ----------
    await step("INT-01: answers land at once, and AI combines near-duplicates once there are about 30 different answers", async () => {
      await press(fac, sql, room.id, "go_live", { session: cloud });
      await layer().locator('[data-board="word_cloud"]').waitFor({ timeout: 10000 });
      await send(priya, "youth, hope, joy, grace, family");
      await until(async () => (await words()).includes("youth"), "youth is on the TV straight away", 3000);
      assert.equal(await tv.locator("[data-ai-foot]").count(), 0, "nothing is marked as AI before AI has combined anything");
      await send(priya, "momentum, welcome, prayer, music, unity");
      await send(priya, "mission, healing, light, peace, youth");
      await send(ben, "young people, kids, students, seniors, serving");
      await send(ben, "outreach, alpha, worship, freedom, courage");
      await send(ben, "renewal, harvest, friendship, love, care");
      await send(ruth, "youth, young people, trust, community, growth");
      await send(ruth, "generosity, discipleship");
      await until(async () => (await layer().locator(".tv-word .cwl-ai-glyph").count()) === 1, "the combined word carries the AI glyph", 10000);
      await until(async () => !(await words()).includes("young people"), "the absorbed word leaves the TV", 5000).catch(async error => {
        console.error(await layer().locator(".tv-board").innerHTML()); await tv.screenshot({ path: join(controlDir, "..", "ai-kit-failure.png") }); throw error; });
      assert.match(await tv.locator("[data-ai-foot]").innerText(), /Combined similar answers/, "the foot names it once");
      const youth = (await results()).words.find((w: { key: string }) => w.key === "youth");
      assert.deepEqual([youth.count, youth.ai, youth.merged], [5, true, ["young people"]], "youth counts young people with it, on the server");
      await until(async () => (await ben.locator(".ph-answer-note").innerText().catch(() => "")).includes("On the screen with youth"), "Ben's phone says where his word went", 8000);
      await shot(tv, "int-01-ai-combined-tv"); await shot(ben, "int-01-ai-combined-phone");
      await control.locator("[data-combine='young people']").waitFor({ timeout: 10000 });
      await shot(control, "int-01-control-combines");
    });
    await step("INT-01: Undo the combine puts both words back, animated, and the AI mark goes", async () => {
      await control.locator("[data-combine='young people']").getByRole("button", { name: "Undo" }).click();
      await until(async () => (await words()).includes("young people"), "young people is back on the TV", 5000).catch(async error => {
        console.error(await layer().locator(".tv-board").innerHTML()); throw error; });
      await until(async () => (await layer().locator(".tv-word .cwl-ai-glyph").count()) === 0, "youth no longer carries the glyph", 5000);
      await until(async () => (await tv.locator("[data-ai-foot]").count()) === 0, "and the foot line goes", 5000);
      await until(async () => (await control.locator("[data-combine='young people']").innerText()).includes("Undone"), "the control surface shows it undone", 5000);
      await shot(tv, "int-01-undo-tv");
    });

    // ---------- INT-02 ----------
    await step("INT-02: AI groups drift together under short labels marked as AI; answers keep arriving in the column", async () => {
      await press(fac, sql, room.id, "go_live", { session: wall });
      await layer().locator('[data-board="wall"]').waitFor({ timeout: 10000 });
      assert.equal(await layer().locator(".ai-wall").getAttribute("data-ai"), "on", "AI is on: groups beside the answers");
      await send(priya, "Three baptisms at Easter");
      await until(async () => (await layer().locator(".tv-feed-row").allTextContents()).includes("Three baptisms at Easter"), "the first answer is in the column at once", 3000);
      await send(ben, "Teenagers asking to be baptized");
      await send(priya, "Our Alpha course was full");
      await send(ben, "Alpha guests stayed for church");
      await send(priya, "Young families staying after the service");
      await send(ruth, "New families at the kids program");
      await send(ruth, "Volunteers who show up early");
      const labels = async () => (await layer().locator(".ai-group .lbl").allTextContents()).map(t => t.trim()).sort();
      await until(async () => JSON.stringify(await labels()) === JSON.stringify(["Alpha", "Baptisms", "Young families"]), "three groups form", 15000);
      assert.equal(await layer().locator(".ai-groups-head .cwl-ai-badge").count(), 1, "one AI badge above the groups");
      const counts = (await results()).groups.map((g: { label: string; count: number }) => `${g.label}:${g.count}`).sort();
      assert.deepEqual(counts, ["Alpha:2", "Baptisms:2", "Young families:2"], "the server counts each group");
      await shot(tv, "int-02-ai-groups-tv");
      await control.locator("[data-group='Baptisms']").waitFor({ timeout: 10000 });
      await shot(control, "int-02-control-groups");
    });
    await step("INT-02: Rename, pin and undo a group from the control surface", async () => {
      const row = (label: string) => control.locator(`[data-group='${label}']`);
      await row("Baptisms").getByRole("button", { name: "Rename Baptisms" }).click();
      await control.getByLabel("Rename Baptisms").fill("Baptisms this year");
      await row("Baptisms").getByRole("button", { name: "Save" }).click();
      await until(async () => (await layer().locator(".ai-group .lbl").allTextContents()).some(t => t.includes("Baptisms this year")), "the TV shows the new name", 5000);
      await row("Alpha").getByRole("button", { name: "Pin" }).click();
      await until(async () => (await layer().locator(".ai-group", { hasText: "Alpha" }).locator(".pin").count()) === 1, "a pinned group shows the pin", 5000);
      await row("Young families").getByRole("button", { name: "Undo" }).click();
      await until(async () => !(await layer().locator(".ai-group .lbl").allTextContents()).some(t => t.includes("Young families")), "the undone group leaves the TV", 5000);
      await until(async () => (await row("Young families").innerText()).includes("Redo"), "and can be redone", 5000);
      assert.ok((await layer().locator(".tv-feed-row").allTextContents()).includes("New families at the kids program"), "its answers stay in arrival order");
      await shot(tv, "int-02-undo-and-pin-tv"); await shot(control, "int-02-control-undo-and-pin");
    });
    await step("INT-02: the AI summary appears on the TV only after Show summary", async () => {
      assert.equal(await layer().locator(".ai-summary:not(.is-off)").count(), 0, "no summary before Show summary");
      assert.equal(((await results()).summary), undefined, "and none in the results");
      await panel().getByRole("button", { name: "Show summary" }).click();
      await until(async () => (await layer().locator(".ai-summary:not(.is-off) .ai-summary-text").innerText().catch(() => "")).includes("Most answers celebrate"), "the summary opens at the top of the groups column", 10000);
      assert.match(await layer().locator(".ai-summary-head").innerText(), /AI summary/);
      await until(async () => (await panel().innerText()).includes("Most answers celebrate"), "the control surface shows it privately", 5000);
      await shot(tv, "int-02-show-summary-tv"); await shot(control, "int-02-control-summary");
      await panel().getByRole("button", { name: "Hide summary" }).click();
      await until(async () => (await layer().locator(".ai-summary:not(.is-off)").count()) === 0, "Hide summary closes it", 5000);
    });

    // ---------- FAIL-09 ----------
    await step("FAIL-09: AI is slow. Answers keep landing in arrival order; the control surface and remote say so; the TV never does", async () => {
      fake({ delayMs: 9000 });
      const t0 = Date.now();
      await send(priya, "Baptism class doubled");
      await until(async () => (await layer().locator(".tv-feed-row").allTextContents()).includes("Baptism class doubled"), "the answer reaches the TV at once, whatever AI is doing", 2000);
      console.log(`  phone send to TV while AI is slow: ${Date.now() - t0} ms (including the phone's own click and confirmation)`);
      await until(async () => (await panel().locator("[data-ai-notice='warning']").innerText().catch(() => "")).includes("AI is slow."), "the control surface says AI is slow", 12000);
      const remote = await facContext.newPage(); await remote.setViewportSize({ width: 390, height: 844 });
      await remote.goto(`${app.origin}/remote/${room.id}`);
      await until(async () => (await remote.locator("[data-ai-remote]").innerText().catch(() => "")).includes("AI is slow. The room is fine."), "the remote says so too", 8000);
      const tvText = await tvSays();
      assert.ok(!/slow|isn.t responding|failed|ai is/.test(tvText), "the TV never says anything about AI being slow");
      await panel().scrollIntoViewIfNeeded();
      await shot(control, "fail-09-ai-slow-control"); await shot(tv, "fail-09-ai-slow-tv");
      await remote.locator("[data-ai-remote]").scrollIntoViewIfNeeded(); await shot(remote, "fail-09-ai-slow-remote");
      fake({});
      await until(async () => (await results()).groups.some((g: { label: string; count: number }) => g.label === "Baptisms this year" && g.count === 3), "groups catch up when AI does", 20000);
      await remote.close();
    });
    await step("FAIL-09: AI not responding. The room carries on and AI catches up when it is back", async () => {
      fake({ fail: true });
      await send(ruth, "Prayer team growing");
      await until(async () => (await layer().locator(".tv-feed-row").allTextContents()).includes("Prayer team growing"), "the answer lands", 2000);
      await until(async () => (await panel().locator("[data-ai-notice='warning']").innerText().catch(() => "")).includes("AI isn't responding."), "the control surface says AI isn't responding", 10000);
      await shot(control, "fail-09-ai-failing-control");
      fake({});
      await until(async () => (await panel().locator("[data-ai-notice='warning']").count()) === 0, "after the cool-down it recovers on its own", 30000);
    });
    await step("FAIL-09 and INT-02 AI off: the wall falls back to answer cards in arrival order, oldest first", async () => {
      await panel().getByRole("switch", { name: "AI for this session" }).click();
      await until(async () => (await layer().locator(".ai-wall").getAttribute("data-ai")) === "off", "the TV switches layout without redrawing", 5000);
      const cards = await layer().locator(".ai-card").allTextContents();
      assert.equal(cards[0], "Three baptisms at Easter", "oldest first");
      assert.equal(cards[cards.length - 1], "Prayer team growing", "newest last");
      await until(async () => (await panel().innerText()).includes("AI is off for this session."), "the control surface says AI is off", 5000);
      await shot(tv, "int-02-ai-off-tv"); await shot(control, "fail-09-ai-off-control");
      await panel().getByRole("switch", { name: "AI for this session" }).click();
      await until(async () => (await layer().locator(".ai-wall").getAttribute("data-ai")) === "on", "back on, the groups return from what is there", 5000);
    });
    await step("INT-02 reduced motion: the wall puts things in place at once", async () => {
      await tv.evaluate(() => document.querySelector(".tv-viewport")?.setAttribute("data-motion", "reduced"));
      await send(ben, "Baptisms every month");
      await until(async () => (await layer().locator(".tv-feed-row").allTextContents()).includes("Baptisms every month"), "the answer is in place", 3000);
      await tv.evaluate(() => document.querySelector(".tv-viewport")?.removeAttribute("data-motion"));
    });

    // ---------- INT-03 ----------
    await step("INT-03: AI folds near-duplicate questions into one, asked by 2, marked as AI; every fold can be undone", async () => {
      await press(fac, sql, room.id, "go_live", { session: qa });
      await layer().locator(".qa-rows").waitFor({ timeout: 10000 });
      await ask(priya, "When does the new building open?");
      await ask(ben, "What date will the new building be ready?");
      await ask(ruth, "How much will the building cost?");
      await until(async () => (await layer().locator(".qa-row", { hasText: "When does the new building open?" }).innerText().catch(() => "")).includes("asked by 2"), "the fold reaches the TV", 10000);
      assert.equal(await layer().locator(".qa-row .qa-ai .cwl-ai-badge").count(), 1, "marked with the AI badge");
      const folded = (await results()).questions.find((q: { text: string }) => q.text === "When does the new building open?");
      assert.deepEqual([folded.askers, folded.ai], [2, true], "the server's group");
      await shot(tv, "int-03-ai-fold-tv");
      await control.locator(".qa-fold-by.is-ai").first().waitFor({ timeout: 10000 });
      await shot(control, "int-03-control-ai-fold");
      await control.locator(".qa-ctl-item", { hasText: "When does the new building open?" }).getByRole("button", { name: "Undo fold" }).click();
      await until(async () => (await layer().locator(".qa-row .qa-ai").count()) === 0, "undo: the AI mark goes", 5000);
      await until(async () => (await layer().locator(".qa-text").allTextContents()).includes("What date will the new building be ready?"), "and the question is back on its own", 5000);
    });
    await press(fac, sql, room.id, "nothing_live");
    const runs = (await sql.query("select job,model,prompt_version,status,inputs::text as inputs from private.ai_runs where engagement_id=$1", [room.id])).rows as { job: string; model: string; prompt_version: string; status: string; inputs: string }[];
    assert.ok(runs.length >= 5 && runs.every(r => r.model === "fake-script" && /@1$/.test(r.prompt_version)), "every AI run stored its model and prompt version");
    assert.ok(runs.every(r => !r.inputs.includes("@example.org") && !r.inputs.includes("Priya")), "no AI input carried a name or email");
    console.log(`AI kit: ${passed.length} checks passed on a paired TV, three phones, the control surface and the remote; ${runs.length} AI runs (${runs.filter(r => r.status === "failed").length} failed on purpose).`);

    // ---------- 50 simulated phones in the practice room, AI slow ----------
    const seeded = (await sql.query("select settings from public.engagements where id=$1 and not deleted", [practiceRoom])).rows[0];
    assert.ok(seeded, "Run npm run db:seed first: the 50-phone run uses the practice room");
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [practiceRoom]);
    try {
      const pfac = await facilitator(env, sql, practiceRoom);
      const crowd = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters) values($1,$2,'Day 1',902,'wall','What is worth celebrating?','ready',5,280) returning id`,
        [practiceRoom, `AI wall load ${randomUUID().slice(0, 6)}`])).rows[0].id as string;
      const ptv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
      await ptv.goto(app.origin + "/tv");
      const pcode = await until(async () => { const c = (await ptv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
      await pairTv(pfac, practiceRoom, app.secret, pcode, "AI load TV");
      await press(pfac, sql, practiceRoom, "go_live", { session: crowd });
      await ptv.locator('.tv-layer:not(.is-leaving) [data-board="wall"]').waitFor({ timeout: 10000 });
      await step("Crowded, 50 phones with AI slow: every answer reaches the TV under a second, nothing jumps, numbers match the server", async () => {
        fake({ delayMs: 2500 });
        await ptv.evaluate(sampler);
        const cookie = pfac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
        const result = await runLoad({ origin: app.origin, phones: 50, bursts: 2, gapSeconds: 2, spreadSeconds: 10, reportCookie: cookie });
        console.log(describe(result));
        assert.equal(result.accepted, result.sent, "every answer accepted");
        assert.equal(result.report!.measured, result.sent, "every answer reached the TV and was logged");
        assert.ok(verdict(result.report!).met, `95 of 100 under one second on loopback while AI works: ${verdict(result.report!).label}`);
        const aiRuns = (await sql.query("select count(*)::integer as n, count(*) filter (where status='ok' and changed)::integer as changed from private.ai_runs where session_id=$1", [crowd])).rows[0];
        assert.ok(aiRuns.n >= 2 && aiRuns.changed >= 1, `AI ran beside the answers: ${JSON.stringify(aiRuns)}`);
        fake({});
        await delay(6000);
        const samples = await ptv.evaluate(() => { const w = window as unknown as { aiSamples: Record<string, [number, number][]>; aiStop: boolean }; w.aiStop = true; return w.aiSamples; });
        let jumps = 0, frames = 0, largest = 0;
        for (const pts of Object.values(samples)) for (let i = 1; i < pts.length; i++) { frames++; const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); largest = Math.max(largest, d); if (d >= jump) jumps++; }
        assert.equal(jumps, 0, `no group label jumped across ${frames} sampled frames (largest step ${Math.round(largest)}px)`);
        const final = (await sql.query("select results from public.room_states where engagement_id=$1", [practiceRoom])).rows[0].results as { total: number; groups: { label: string; count: number }[] };
        await until(async () => (await ptv.locator(".tv-foot .tv-tally").innerText()).trim() === `${final.total} answers`, "the TV count matches the server", 8000);
        const tvGroups = async () => (await ptv.locator(".tv-layer:not(.is-leaving) .ai-group").evaluateAll(els => els.filter(e => !(e as HTMLElement).style.opacity || Number((e as HTMLElement).style.opacity) > 0.5)
          .map(e => `${e.querySelector(".lbl")!.textContent!.trim()}:${e.querySelector(".n")!.textContent}`))).sort();
        const want = final.groups.slice(0, 9).map(g => `${g.label}:${g.count}`).sort();
        await until(async () => JSON.stringify(await tvGroups()) === JSON.stringify(want), `the TV's groups match the server (${want.join(", ")})`, 8000);
        console.log(`50 phones, AI slow (2.5s a call): ${aiRuns.n} AI runs beside ${result.sent} answers. Phone to TV: median ${result.report!.phone_tv.p50} ms, 95th ${result.report!.phone_tv.p95} ms, slowest ${result.report!.phone_tv.max} ms. ${frames} label frames sampled, largest step ${Math.round(largest)}px, no jumps. Groups: ${want.join(", ")}.`);
        await shot(ptv, "int-02-crowded-50-phones-ai-tv");
      });
      await press(pfac, sql, practiceRoom, "nothing_live");
    } finally {
      await sql.query("update public.engagements set settings=$2 where id=$1", [practiceRoom, seeded.settings]);
    }
    console.log(`AI kit: ${passed.length} checks passed. Local checks on loopback, with the scripted fake model.`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally { await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); rmSync(controlDir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exit(1); });
