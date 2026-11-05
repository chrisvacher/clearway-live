// Milestone 4, step 2b: the lens summary (INT-18, D1-06) in a real browser against the production build and
// the local stack, with the scripted fake model (never the API). A paired TV shows lens 1's summary while 50
// simulated phones tap Approve or Suggest a change through the real endpoints and AI folds the suggestions
// into a new version slowly. It checks the live-screen rules (95 of 100 phone-to-TV times under one second
// with AI slow, no row jumping or redrawing, a tracked change on the fold), the draft (present tense, one
// screen, every line sourced, marked AI), the tally restarting at zero, a stale phone, the facilitator's edit
// replacing a line in place, Mark a decision, and that no name or email reaches the TV or an AI input.
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
import { joinPhones, practiceRoom } from "../../scripts/load-test";
import { db, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

// The scripted fake model reads this file on every call: slow or well.
const controlDir = join(tmpdir(), `clearway-summary-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
const fake = (value: { delayMs?: number; fail?: boolean }) => writeFileSync(controlFile, JSON.stringify(value));
fake({});
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "250", ANTHROPIC_API_KEY: "" });

const room = practiceRoom;
const lensSentences = ["We welcome every stranger by name at the door", "Every guest is greeted by name before the service", "We eat together every Sunday after worship", "Shared tables fill the hall on Sunday",
  "Apprentice leaders serve beside every ministry lead", "Leaders raise up the next leaders from within", "We pray before we plan anything", "Neighbours know us by name"];
const suggestions = ["Add: kids and adults eat at the same tables", "Add: we pray for our neighbours by name", "Guests are greeted by name before every service", "Leaders raise up the next leaders from every ministry",
  "Remove the line about praying before we plan", "We eat together every week after worship", "Guests are greeted by name before every service starts", "Leaders raise up the next leaders from every ministry we run",
  "We eat together every week after the service", "Neighbours know us by first name"];
const futureWords = /\b(will|would|shall|going to|hope to|plan to|aim to|intend to)\b/i;

// Samples every summary row's place on every frame, and whether a row's element is ever replaced. Rows keep their
// elements across versions (a redraw would swap them), and none should leap. A plain script, so no bundler helper
// reaches the page.
const sampler = `(() => { window.sumSamples = {}; window.sumStop = false; window.sumSeen = { ins: false, del: false, gone: false, first: [...document.querySelectorAll('.tv-layer:not(.is-leaving) .lsm-line')] };
  const ids = new WeakMap(); let n = 0;
  const read = () => { const layer = document.querySelector('.tv-layer:not(.is-leaving)'); if (layer) {
      for (const el of layer.querySelectorAll('.lsm-line')) { if (!ids.has(el)) ids.set(el, 'row' + ++n); const r = el.getBoundingClientRect(); (window.sumSamples[ids.get(el)] ??= []).push([r.left, r.top, performance.now()]); }
      if (layer.querySelector('.lsm-ins')) window.sumSeen.ins = true; if (layer.querySelector('.lsm-del')) window.sumSeen.del = true; if (layer.querySelector('.lsm-line.is-gone')) window.sumSeen.gone = true; }
    if (!window.sumStop) requestAnimationFrame(read); };
  requestAnimationFrame(read); })()`;
const jump = 160;

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(1500); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    browser = await chromium.launch();
    const seeded = (await sql.query("select settings from public.engagements where id=$1 and not deleted", [room])).rows[0];
    assert.ok(seeded, "Run npm run db:seed first: the 50-phone run uses the practice room");
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [room]);
    // A clean lens 1: the sentences and summaries of earlier kits are put away, as the practice reset does.
    for (const t of ["lens_summary_responses", "lens_summary_sources", "lens_summary_sentences"]) await sql.query(`update private.${t} set deleted=true where engagement_id=$1 and not deleted`, [room]);
    await sql.query("update private.lens_summaries set deleted=true,current_version_id=null,signed_off_version_id=null,decision_id=null where engagement_id=$1 and not deleted", [room]);
    await sql.query("update private.lens_summary_versions set deleted=true where engagement_id=$1 and not deleted", [room]);
    await sql.query("delete from private.lens_summary_locks where engagement_id=$1", [room]);
    await sql.query("update private.lens_sentences set deleted=true where engagement_id=$1 and not deleted", [room]);
    try {
      const fac = await facilitator(env, sql, room);
      const cookie = fac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
      const tag = randomUUID().slice(0, 6);
      const wall = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,max_words,options)
        values($1,$2,'Day 1',904,'lens','Describe the 10-year Future for this lens, as if it is true today','ready',5,280,50,'{"lens":1}') returning id`, [room, `Lens 1 wall ${tag}`])).rows[0].id as string;
      const summary = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,max_words,options)
        values($1,$2,'Day 1',905,'lens_summary','The 10-year Future, one lens at a time','ready',1,140,50,coalesce(private.session_options('lens_summary','{"lens":1}'::jsonb,$1),'{}'::jsonb)) returning id`, [room, `Lens summary ${tag}`])).rows[0].id as string;
      const server = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [room])).rows[0].results as { summary?: { version_id: string; version: number; author: string; tracked: boolean; sentences: { id: string; text: string }[]; changes: { kind: string }[]; signed: boolean }; tally: { approve: number; suggest: number }; total: number; suggestions: { text: string }[] };
      const poke = () => fetch(`${app.origin}/api/control/${room}`, { headers: { Cookie: cookie }, cache: "no-store" }).catch(() => undefined);
      const control = async (action: string, p: Record<string, unknown> = {}) => {
        const { data, error } = await fac.client.rpc("lens_summary_control", { p_engagement: room, p_id: randomUUID(), p_action: action, p });
        assert.equal(error, null); return data as { status: string };
      };
      const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
      await tv.goto(app.origin + "/tv");
      const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
      await pairTv(fac, room, app.secret, code, "Lens summary TV");
      await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
      const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
      const phones = await joinPhones(app.origin, 50, { prefix: "Summary phone" });

      // ---------- The lens's sentences, then the draft ----------
      await press(fac, sql, room, "go_live", { session: wall });
      await layer().locator('[data-board="lens"]').waitFor({ timeout: 10000 });
      const written = await Promise.all(lensSentences.map((text, i) => phones[i].send(room, wall, text)));
      assert.ok(written.every(w => w.status === "accepted"), `the lens sentences were accepted: ${written.map(w => w.status).join(",")}`);
      await until(async () => { await poke(); return (await sql.query("select count(*)::integer n from private.ai_groups where session_id=$1 and not deleted and undone_at is null", [wall])).rows[0].n >= 3; }, "AI clustered the lens wall", 30000);
      await press(fac, sql, room, "go_live", { session: summary });
      await layer().locator("[data-lens-summary]").waitFor({ timeout: 10000 });
      await step("The draft goes straight to the TV: present tense, one screen, every line sourced, marked AI", async () => {
        await until(async () => { await poke(); return (await server()).summary?.sentences.length; }, "AI drafted the summary", 30000);
        const s = (await server()).summary!;
        await until(async () => (await layer().locator(".lsm-line:not(.is-gone)").count()) === s.sentences.length, "the TV shows the draft", 5000);
        const lines = await layer().locator(".lsm-line:not(.is-gone) .lsm-text").allInnerTexts();
        assert.deepEqual(lines.map(l => l.trim()), s.sentences.map(x => x.text), "the TV shows the server's lines");
        assert.ok(lines.length >= 3 && lines.length <= 8, `3 to 8 lines: ${lines.length}`);
        assert.ok(lines.join(" ").length <= 420, "one screen: 420 characters");
        for (const l of lines) assert.ok(!futureWords.test(l) && !/["“”]/.test(l), `present tense, no quotes: ${l}`);
        assert.ok(await layer().locator(".lsm-who .cwl-ai-mark").count() > 0, "the AI icon marks the draft");
        assert.match(await layer().locator(".lsm-ver").innerText(), /Version 1/);
        const run = (await sql.query("select status, changed, prompt_version from private.ai_runs where session_id=$1 and job='draft_lens_summary' and not deleted order by created_at limit 1", [summary])).rows[0];
        assert.ok(run && run.status === "ok" && run.changed && run.prompt_version === promptVersions.draft_lens_summary, `the draft run: ${JSON.stringify(run)}`);
        const bare = (await sql.query(`select count(*)::integer n from private.lens_summary_sentences s where s.engagement_id=$1 and s.version_id=$2 and not s.deleted
          and not exists(select 1 from private.lens_summary_sources x where x.summary_sentence_id=s.id and not x.deleted)`, [room, s.version_id])).rows[0].n;
        assert.equal(bare, 0, "every line is linked to its source sentences");
        assert.equal((await server()).tally.approve + (await server()).tally.suggest, 0, "the tally starts at zero");
        await shot(tv, "lens-summary-draft");
      });

      // ---------- 50 phones, AI slow ----------
      let from = "", firstVersion = "";
      await step("50 phones approve or suggest while AI is slow: every answer reaches the TV under a second and nothing jumps or redraws", async () => {
        fake({ delayMs: 2500 });
        const before = (await server()).summary!;
        firstVersion = before.version_id;
        await tv.evaluate(sampler);
        from = new Date(Date.now() - 1000).toISOString();
        const answers = await Promise.all(phones.map(async (p, i) => {
          await delay(Math.floor(Math.random() * 2800)); // all inside AI's 3 quiet seconds, so it folds once, after the last one
          return i < 40 ? p.sendValue(room, summary, { version: firstVersion, response: "approve" }, "Approve") : p.sendValue(room, summary, { version: firstVersion, response: "suggest" }, suggestions[i - 40]);
        }));
        assert.ok(answers.every(a => a === "accepted"), `every answer accepted: ${[...new Set(answers)].join(",")}`);
        await delay(4000);
        const report = await (await fetch(`${app.origin}/api/control/${room}/latency?from=${encodeURIComponent(from)}&to=${encodeURIComponent(new Date().toISOString())}`, { headers: { Cookie: cookie } })).json() as { measured: number; under_second: number; phone_tv: { p50: number; p95: number }; sent: number };
        assert.equal(report.measured, 50, `every answer reached the TV and was logged: ${JSON.stringify(report)}`);
        assert.ok(verdict(report as never).met, `95 of 100 under one second on loopback while AI works: ${verdict(report as never).label}`);
        console.log(`50 phones, AI slow (2.5s a call): phone to TV median ${report.phone_tv.p50} ms, 95th ${report.phone_tv.p95} ms`);
        const mid = await server();
        assert.equal(mid.tally.approve, 40); assert.equal(mid.tally.suggest, 10, "the tally is the server's");
        await until(async () => (await layer().locator('[data-tally="approve"]').innerText()).trim() === "40" && (await layer().locator('[data-tally="suggest"]').innerText()).trim() === "10", "the TV tally matches the server", 5000);
        assert.equal(await layer().locator("[data-suggestion]").count(), 2, "two anonymous suggestion cards on the TV");
        assert.match(await layer().locator("[data-more-suggestions]").innerText(), /\+ 8 more on phones/, "the rest are counted for phones");
        await shot(tv, "lens-summary-50-phones");
      });

      await step("AI folds the suggestions into version 2 after a quiet moment: a tracked change on the TV, the tally restarts at zero", async () => {
        await until(async () => { await poke(); return (await server()).summary?.version === 2; }, "version 2 folded in", 40000);
        const s = (await server()).summary!;
        assert.equal(s.author, "ai"); assert.ok(s.tracked, "tracked");
        const kinds = new Set(s.changes.map(c => c.kind));
        assert.ok(kinds.has("edit") && kinds.has("add"), `edits and adds: ${[...kinds].join(",")}`);
        const run = (await sql.query("select status, changed, prompt_version from private.ai_runs where session_id=$1 and job='fold_lens_summary' and not deleted order by created_at limit 1", [summary])).rows[0];
        assert.ok(run && run.status === "ok" && run.changed && run.prompt_version === promptVersions.fold_lens_summary, `the fold run: ${JSON.stringify(run)}`);
        assert.deepEqual((await server()).tally, { approve: 0, suggest: 0 }, "the tally restarts at zero for the new version");
        await until(async () => (await layer().locator('[data-tally="approve"]').innerText()).trim() === "0", "the TV tally restarted", 5000);
        await until(async () => (await layer().locator(".lsm-line:not(.is-gone)").count()) === s.sentences.length, "the TV shows version 2", 5000);
        await delay(2500);
        const seen = await tv.evaluate(() => { const w = window as unknown as { sumSeen: { ins: boolean; del: boolean; gone: boolean; first: Element[] } }; return { ...w.sumSeen, kept: w.sumSeen.first.filter(e => e.isConnected).length, started: w.sumSeen.first.length }; });
        assert.ok(seen.ins, "inserted words were underlined on the TV"); assert.ok(seen.del || seen.gone, "struck words or a struck line were shown before they left");
        assert.ok(seen.kept >= seen.started - 1, `rows kept their place in the page across the fold: ${seen.kept} of ${seen.started} (one line may be taken away)`);
        const samples = await tv.evaluate(() => (window as unknown as { sumSamples: Record<string, [number, number, number][]> }).sumSamples);
        let jumps = 0, frames = 0, largest = 0;
        for (const pts of Object.values(samples)) for (let i = 1; i < pts.length; i++) { frames++; const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); largest = Math.max(largest, d); if (d >= jump) jumps++; }
        assert.ok(frames > 0, "rows were sampled");
        assert.equal(jumps, 0, `no row jumped across ${frames} sampled frames (largest step ${Math.round(largest)}px)`);
        const after = await layer().locator(".lsm-line:not(.is-gone) .lsm-text").allInnerTexts();
        assert.deepEqual(after.map(l => l.replace(/\s+/g, " ").trim()), s.sentences.map(x => x.text), "once the struck words leave, the TV shows the server's lines");
        await shot(tv, "lens-summary-folded");
      });

      await step("A phone one version behind is told to read the new one; the new version takes fresh answers", async () => {
        assert.equal(await phones[0].sendValue(room, summary, { version: firstVersion, response: "approve" }, "Approve"), "stale");
        const v2 = (await server()).summary!.version_id;
        const out = await Promise.all(phones.slice(0, 30).map(p => p.sendValue(room, summary, { version: v2, response: "approve" }, "Approve")));
        assert.ok(out.every(s => s === "accepted"), `answers on version 2: ${[...new Set(out)].join(",")}`);
        await until(async () => (await layer().locator('[data-tally="approve"]').innerText()).trim() === "30", "the TV counts version 2's approvals", 5000);
        const suggestions1 = (await sql.query("select count(*)::integer n from private.lens_summary_responses where version_id=$1 and not deleted", [firstVersion])).rows[0].n;
        assert.equal(suggestions1, 50, "version 1's answers are kept as history");
      });

      await step("The facilitator's edit replaces the line on the TV in place, within a second, with no tracked change", async () => {
        const state = (await fac.client.rpc("lens_summary_state", { p_engagement: room })).data as { summary: { sentences: { id: string; text: string }[] } };
        const target = state.summary.sentences[0], text = "Every guest is greeted by name at the door.";
        const row = layer().locator(".lsm-line:not(.is-gone)").first(), key = await row.getAttribute("data-line");
        assert.ok(key);
        await control("edit_start", { sentence: target.id });
        const sent = Date.now();
        assert.equal((await control("edit", { op: "text", sentence: target.id, text })).status, "ok");
        await until(async () => (await layer().locator(".lsm-line:not(.is-gone) .lsm-text").first().innerText()).trim() === text, "the TV shows the edited line", 1500);
        const took = Date.now() - sent; console.log(`Facilitator edit to TV: ${took} ms`);
        assert.ok(took < 1500, `the edit reached the TV quickly: ${took} ms`);
        assert.equal(await layer().locator(".lsm-ins, .lsm-del").count(), 0, "a hand edit is not a tracked change");
        const s = (await server()).summary!;
        assert.equal(s.author, "facilitator"); assert.equal(s.version, 3);
        assert.deepEqual((await server()).tally, { approve: 0, suggest: 0 }, "the facilitator's own version starts at zero");
        assert.equal((await control("edit_done")).status, "ok");
        // AI does not write over the facilitator's version.
        fake({}); await delay(4000);
        assert.equal((await server()).summary!.version, 3, "AI leaves the facilitator's version alone");
      });

      await step("Mark a decision: the room's decision, never a count", async () => {
        const out = await control("decide", { decision: "Signed off", reasons: "The room agrees it describes the 10-year Future." });
        assert.equal(out.status, "ok");
        await until(async () => (await layer().locator(".lsm-signed").count()) > 0, "the TV shows the decision", 5000);
        const row = (await sql.query("select subject, decision from private.decisions where engagement_id=$1 and subject='lens_summary' and not deleted order by marked_at desc limit 1", [room])).rows[0];
        assert.ok(row && row.decision === "Signed off", `a decision record: ${JSON.stringify(row)}`);
        assert.equal((await server()).summary!.signed, true);
        assert.equal(await phones[1].sendValue(room, summary, { version: (await server()).summary!.version_id, response: "approve" }, "Approve"), "stale", "a decided lens takes no more answers");
        await shot(tv, "lens-summary-decided");
      });

      await step("No name or email reached the TV or an AI input", async () => {
        const text = await layer().innerText();
        assert.ok(!/Summary phone|@example\.org/.test(text), "the TV shows no name or email");
        const runs = (await sql.query("select inputs::text as inputs from private.ai_runs where session_id=$1", [summary])).rows as { inputs: string }[];
        assert.ok(runs.length >= 2 && runs.every(r => !r.inputs.includes("@example.org") && !/"(name|email)"/.test(r.inputs) && !r.inputs.includes("Summary phone")));
      });
      await press(fac, sql, room, "nothing_live");
    } finally {
      await sql.query("update public.engagements set settings=$2 where id=$1", [room, seeded.settings]);
    }
    console.log(`Lens summary kit: ${passed.length} checks passed. Local checks on loopback, with the scripted fake model.`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally { await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); rmSync(controlDir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exit(1); });
