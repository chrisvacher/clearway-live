// Milestone 4, step 2: the lens wall (INT-12, D1-05) in a real browser against the production build and
// the local stack, with the scripted fake model (never the API). A paired TV shows lens 1's wall while 50
// simulated phones write present-tense sentences through the real endpoints and AI clusters them slowly.
// It checks the live-screen rules (95 of 100 phone-to-TV times under one second, no cluster-bound row
// jumping between frames), that the TV's numbers match the server's, that the AI icon marks the
// clusters, and that the sentences never carry a name or email into an AI input.
// KIT_SHOTS=<folder> saves screens.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { promptVersions } from "../../lib/ai/prompts";
import { verdict } from "../../lib/latency/report";
import { Phone, describe, practiceRoom, runLoad } from "../../scripts/load-test";
import { db, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

// The scripted fake model reads this file on every call: slow or well.
const controlDir = join(tmpdir(), `clearway-lens-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
const fake = (value: { delayMs?: number; fail?: boolean }) => writeFileSync(controlFile, JSON.stringify(value));
fake({});
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "250", ANTHROPIC_API_KEY: "" });

// Samples every cluster's and every drifting sentence's place on every frame, as a plain script so no bundler
// helper reaches the page. Clusters keep their order of first appearance, so none should ever leap.
const sampler = `(() => { window.lensSamples = {}; window.lensStop = false; const ids = new WeakMap(); let n = 0;
  const read = () => { for (const el of document.querySelectorAll('.tv-layer:not(.is-leaving) .lens-cluster, .tv-layer:not(.is-leaving) .lens-ghost')) {
      if (!ids.has(el)) ids.set(el, (el.classList.contains('lens-ghost') ? 'ghost' : 'cluster') + ++n); const r = el.getBoundingClientRect(); (window.lensSamples[ids.get(el)] ??= []).push([r.left, r.top, performance.now()]); }
    if (!window.lensStop) requestAnimationFrame(read); };
  requestAnimationFrame(read); })()`;
const jump = 150;

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
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
    const seeded = (await sql.query("select settings from public.engagements where id=$1 and not deleted", [practiceRoom])).rows[0];
    assert.ok(seeded, "Run npm run db:seed first: the 50-phone run uses the practice room");
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [practiceRoom]);
    try {
      const fac = await facilitator(env, sql, practiceRoom);
      const lens = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,options)
        values($1,$2,'Day 1',903,'lens','Describe the 10-year Future for this lens, as if it is true today','ready',5,280,'{"lens":1}') returning id`, [practiceRoom, `Lens wall load ${randomUUID().slice(0, 6)}`])).rows[0].id as string;
      const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
      await tv.goto(app.origin + "/tv");
      const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
      await pairTv(fac, practiceRoom, app.secret, code, "Lens load TV");
      await press(fac, sql, practiceRoom, "go_live", { session: lens });
      await tv.locator('.tv-layer:not(.is-leaving) [data-board="lens"]').waitFor({ timeout: 10000 });
      await step("The lens wall shows the lens's heading with its icon, and the empty wall waits", async () => {
        const head = tv.locator(".tv-layer:not(.is-leaving) .lens-tv-head");
        await head.waitFor({ timeout: 5000 });
        assert.ok((await head.innerText()).trim().length > 0, "the lens name is on the TV");
        assert.ok(await head.locator("svg").count() > 0, "with the lens icon");
        await shot(tv, "lens-wall-empty");
      });
      await step("Crowded, 50 phones with AI slow: every sentence reaches the TV under a second, nothing jumps, numbers match the server", async () => {
        fake({ delayMs: 2500 });
        await tv.evaluate(sampler);
        const cookie = fac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
        const result = await runLoad({ origin: app.origin, phones: 50, bursts: 2, gapSeconds: 2, spreadSeconds: 10, reportCookie: cookie });
        console.log(describe(result));
        assert.equal(result.accepted, result.sent, "every sentence accepted");
        assert.equal(result.report!.measured, result.sent, "every sentence reached the TV and was logged");
        assert.ok(verdict(result.report!).met, `95 of 100 under one second on loopback while AI works: ${verdict(result.report!).label}`);
        const aiRuns = (await sql.query("select count(*)::integer as n, count(*) filter (where status='ok' and changed)::integer as changed, bool_and(job='group_lens') as lens_job, bool_and(prompt_version=$2) as version from private.ai_runs where session_id=$1", [lens, promptVersions.group_lens])).rows[0];
        assert.ok(aiRuns.n >= 2 && aiRuns.changed >= 1, `AI ran beside the sentences: ${JSON.stringify(aiRuns)}`);
        assert.ok(aiRuns.lens_job && aiRuns.version, "every run was the lens job, on the lens prompt version");
        fake({});
        await delay(6000);
        const samples = await tv.evaluate(() => { const w = window as unknown as { lensSamples: Record<string, [number, number, number][]>; lensStop: boolean }; w.lensStop = true; return w.lensSamples; });
        let jumps = 0, frames = 0, largest = 0; const by: Record<string, number> = {};
        for (const [key, pts] of Object.entries(samples)) for (let i = 1; i < pts.length; i++) { frames++; const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); largest = Math.max(largest, d); if (d >= jump) { jumps++; by[key.replace(/\d+/, "")] = (by[key.replace(/\d+/, "")] ?? 0) + 1; } }
        assert.ok(frames > 0, "clusters were sampled");
        assert.equal(jumps, 0, `no cluster or drifting sentence jumped across ${frames} sampled frames (largest step ${Math.round(largest)}px; by kind ${JSON.stringify(by)})`);
        const final = (await sql.query("select results from public.room_states where engagement_id=$1", [practiceRoom])).rows[0].results as { total: number; groups: { label: string; count: number }[] };
        await until(async () => Number(((await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").then(v => v ?? "")).match(/\d+/) ?? [])[0]) === final.total, "the TV count matches the server", 8000);
        const tvClusters = async () => (await tv.locator(".tv-layer:not(.is-leaving) .lens-cluster:not(.is-going)").evaluateAll(els => els.map(e => `${e.querySelector(".lens-label")!.textContent!.trim()}:${e.querySelector(".lens-count")!.textContent}`))).sort();
        const want = final.groups.map(g => `${g.label}:${g.count}`).sort();
        await until(async () => JSON.stringify(await tvClusters()) === JSON.stringify(want), `the TV's clusters match the server (${want.join(", ")})`, 8000);
        assert.ok(await tv.locator(".tv-layer:not(.is-leaving) .lens-clusters-head .cwl-ai-mark").count() > 0, "the AI icon marks the clusters");
        console.log(`50 phones, AI slow (2.5s a call): ${aiRuns.n} AI runs beside ${result.sent} sentences. Phone to TV: median ${result.report!.phone_tv.p50} ms, 95th ${result.report!.phone_tv.p95} ms, slowest ${result.report!.phone_tv.max} ms. Largest cluster or drift step ${Math.round(largest)}px over ${frames} frames.`);
        await shot(tv, "lens-wall-50-phones-ai");
      });
      await step("No AI input carried a name or an email", async () => {
        const runs = (await sql.query("select inputs::text as inputs from private.ai_runs where session_id=$1", [lens])).rows as { inputs: string }[];
        assert.ok(runs.length > 0 && runs.every(r => !r.inputs.includes("@example.org") && !/"(name|email)"/.test(r.inputs)));
      });
      await step("A seeded sentence may run to 400 characters, the live wall keeps its own limit (November 5)", async () => {
        const seeding = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,mode,opens_at,closes_at,options,max_sends,max_characters,max_words)
          values($1,$2,'Pre-call',904,'lens','Describe the 10-year Future for a lens, as if it is true today','ready','self_paced',now()-interval '1 hour',now()+interval '2 days',
          coalesce(private.session_options('lens','{"seed":true}'::jsonb,$1),'{}'::jsonb),3,200,50) returning id`, [practiceRoom, `Seed length ${randomUUID().slice(0, 6)}`])).rows[0].id as string;
        try {
          const phone = new Phone(app.origin); await phone.join(practiceRoom, "Seed length phone");
          const sentence = (n: number) => `We welcome every stranger by name ${"and sit with them ".repeat(30)}`.slice(0, n).trimEnd().padEnd(n, "x");
          assert.equal(await phone.sendValue(practiceRoom, seeding, { lens: 2 }, sentence(400)), "accepted", "400 characters land although the step says 200");
          assert.equal(await phone.sendValue(practiceRoom, seeding, { lens: 2 }, sentence(401)), "invalid_answer", "401 do not");
          assert.equal(await phone.sendValue(practiceRoom, lens, {}, sentence(281)), "limit", "a live lens sentence still stops at the step's limit (280)");
          assert.equal((await sql.query("select max(length(text))::int n from private.lens_sentences where session_id=$1 and not deleted", [seeding])).rows[0].n, 400, "stored whole");
        } finally {
          await sql.query("update private.lens_sentences set deleted=true where session_id=$1", [seeding]).catch(() => {});
          await sql.query("update public.submissions set deleted=true where session_id=$1", [seeding]).catch(() => {});
          await sql.query("update public.sessions set deleted=true where id=$1", [seeding]).catch(() => {});
        }
      });
      await press(fac, sql, practiceRoom, "nothing_live");
    } finally {
      await sql.query("update public.engagements set settings=$2 where id=$1", [practiceRoom, seeded.settings]);
    }
    console.log(`Lens wall kit: ${passed.length} checks passed. Local checks on loopback, with the scripted fake model.`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally { await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); rmSync(controlDir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exit(1); });
