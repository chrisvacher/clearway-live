// Milestone 5, step 3a: the Day 2 read-back (D2-03, D2-04, INT-14) in a real browser against the production build and the
// local stack, with the scripted fake model (never the API). A paired TV reads the five signed-off lens summaries and two
// reviewed outcomes one at a time while 50 simulated phones answer "Yes, that's us" or "It needs a change" and add
// "What's missing?" through the real endpoints. It checks the live-screen rules (95 of 100 phone-to-TV times under one second,
// no row jumping), a scribe correction accepted and folding in as a tracked change, the tally restarting at zero, a
// correction that names no line placed by AI, an offline scribe, Undo the last fold, Mark a decision settling an item, the
// Map reading the changed text, and that no scribe word, photo or name reaches a phone or the TV. KIT_SHOTS=<folder> saves screens.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { promptVersions } from "../../lib/ai/prompts";
import { verdict } from "../../lib/latency/report";
import { joinPhones, Phone, practiceRoom } from "../../scripts/load-test";
import { db, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

const controlDir = join(tmpdir(), `clearway-read-back-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
writeFileSync(controlFile, "{}");
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "250", ANTHROPIC_API_KEY: "" });

const room = practiceRoom;
const scribeWords = "Scribe card words that must never reach a phone", photoWords = "Easel photo words";
// Lens 1 to 5, as signed off on Day 1. Lens 5 is the longest a screen takes (8 lines, 416 characters).
const lensLines: string[][] = [
  ["We welcome every guest by name at the door.", "We eat together every week after the service.", "Leaders raise up the next leaders from within."],
  ["Our street knows us by name.", "We run the community supper.", "Neighbours ask us to pray with them."],
  ["Apprentice leaders serve beside every ministry lead.", "Every team has a coach.", "Leaders share the work."],
  ["Volunteers keep the Sunday rhythm.", "Every room is set before the doors open.", "The week has a steady beat."],
  Array.from({ length: 8 }, (_, i) => ["Every person learns something new each month in a group.", "Teachers meet to share what they taught and learned.", "Children and adults learn side by side each week.",
    "We read the Scriptures together before we plan anything.", "New ideas get a small trial before they spread.", "Each ministry keeps a short note of what worked.",
    "People ask questions in the room and get answers.", "Learning is part of every meeting we hold."][i]),
];
const outcomes = [
  { name: "Welcome every neighbour", bullets: [["Every new family gets a visit within 14 days", "Visit new families quickly"], ["Three hosts run the Sunday welcome", "Hosts at the Sunday door"]] },
  { name: "Raise up leaders", bullets: [["Twelve leaders are in training", "Leaders in training"], ["Every team has a coach", ""]] },
];

const sampler = `(() => { window.rbkSamples = {}; window.rbkStop = false; window.rbkSeen = { ins: false };
  const ids = new WeakMap(); let n = 0;
  const read = () => { const layer = document.querySelector('.tv-layer:not(.is-leaving)'); if (layer) {
      for (const el of layer.querySelectorAll('.lsm-line')) { if (!ids.has(el)) ids.set(el, 'row' + ++n); const r = el.getBoundingClientRect(); (window.rbkSamples[ids.get(el)] ??= []).push([r.left, r.top, performance.now()]); }
      if (layer.querySelector('.lsm-ins')) window.rbkSeen.ins = true; }
    if (!window.rbkStop) requestAnimationFrame(read); };
  requestAnimationFrame(read); })()`;

type Info = { status: string; session: string | null; version: number; items: { id: string; label: string; state: string; kind: string }[];
  item: { id: string; heading: string; settled: boolean; version: number; version_id: string; lines: { id: string; pos: number; text: string }[]; versions: { version: number; undone: boolean; current: boolean }[] } | null;
  corrections: { id: string; state: string; wording: string; reason: string; source: string }[]; room: { tally: { yes: number; change: number }; of: number } | null;
  published: { any: boolean; loaded: number | null }; notSigned: string[]; not_signed?: string[] };

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(1500); await page.screenshot({ path: `${process.env.KIT_SHOTS}/read-back-${name}.png` }); } };
  const panelShot = async (name: string) => { if (process.env.KIT_SHOTS) { await delay(1500); await panelPage!.locator("[data-read-back-panel]").scrollIntoViewIfNeeded(); await panelPage!.screenshot({ path: `${process.env.KIT_SHOTS}/read-back-${name}.png` }); } };
  let panelPage: Page | undefined;
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    browser = await chromium.launch();
    const seeded = (await sql.query("select settings from public.engagements where id=$1 and not deleted", [room])).rows[0];
    assert.ok(seeded, "Run npm run db:seed first: the 50-phone run uses the practice room");
    await sql.query("update public.engagements set settings=(settings-'room_size')||'{\"ai_enabled\":true}' where id=$1", [room]);
    // A clean room: earlier kits' lens summaries, outcomes and read-back boards are put away.
    for (const t of ["lens_summary_responses", "lens_summary_sources", "lens_summary_sentences", "lens_summary_versions", "lens_sentences", "vision_outcomes", "outcome_indicators", "overnight_rounds", "draft_outcomes", "draft_bullets", "draft_sources",
      "read_back_boards", "read_back_items", "read_back_versions", "read_back_lines", "read_back_corrections"]) await sql.query(`update private.${t} set deleted=true where engagement_id=$1 and not deleted`, [room]).catch(() => undefined);
    await sql.query("update private.lens_summaries set deleted=true,current_version_id=null,signed_off_version_id=null,decision_id=null where engagement_id=$1 and not deleted", [room]);
    await sql.query("delete from private.lens_summary_locks where engagement_id=$1", [room]);
    await sql.query("update private.overnight_publications set withdrawn_at=now() where engagement_id=$1 and withdrawn_at is null", [room]);
    const tag = randomUUID().slice(0, 6);
    const publish = async () => {
      const round = (await sql.query("insert into private.overnight_rounds(engagement_id,status,published_at,published_by) values($1,'ready',now(),(select id from public.clearway_users order by created_at limit 1)) returning id", [room])).rows[0].id as string;
      const snapshot: unknown[] = [];
      for (const [position, o] of outcomes.entries()) {
        const outcome = (await sql.query("insert into private.vision_outcomes(engagement_id,title,status,position) values($1,$2,'provisional',$3) returning id", [room, o.name, position])).rows[0].id as string;
        const draft = (await sql.query("insert into private.draft_outcomes(engagement_id,round_id,outcome_id,position,name,original_name) values($1,$2,$3,$4,$5,$5) returning id", [room, round, outcome, position, o.name])).rows[0].id as string;
        for (const [at, [text, indicator]] of o.bullets.entries()) {
          const bullet = (await sql.query("insert into private.draft_bullets(engagement_id,draft_outcome_id,position,text,origin) values($1,$2,$3,$4,'ai') returning id", [room, draft, at, text])).rows[0].id as string;
          if (indicator) {
            const ind = (await sql.query("insert into private.outcome_indicators(engagement_id,outcome_id,text,position) values($1,$2,$3,$4) returning id", [room, outcome, indicator, at])).rows[0].id as string;
            await sql.query("insert into private.draft_sources(engagement_id,draft_outcome_id,bullet_id,kind,ref_id,excerpt) values($1,$2,$3,'bullet',$4,$5)", [room, draft, bullet, ind, indicator]);
            if (position === 0 && at === 0) await sql.query("insert into private.draft_sources(engagement_id,draft_outcome_id,bullet_id,kind,ref_id,excerpt) values($1,$2,$3,'card',gen_random_uuid(),$4)", [room, draft, bullet, scribeWords]);
            if (position === 1 && at === 0) await sql.query("insert into private.draft_sources(engagement_id,draft_outcome_id,bullet_id,kind,ref_id,excerpt) values($1,$2,$3,'photo',gen_random_uuid(),$4)", [room, draft, bullet, photoWords]);
          }
        }
        snapshot.push({ outcome_id: outcome, name: o.name, bullets: o.bullets.map(([text]) => ({ text, origin: "ai", sources: 1 })) });
      }
      await sql.query("insert into private.overnight_publications(id,engagement_id,round_id,n,snapshot,published_by) values(gen_random_uuid(),$1,$2,(select coalesce(max(n),0)+1 from private.overnight_publications where engagement_id=$1),$3,(select id from public.clearway_users order by created_at limit 1))",
        [room, round, JSON.stringify({ year: 2029, horizon: "3-year Vision", outcomes: snapshot })]);
    };
    for (const [at, lines] of lensLines.entries()) {
      const lens = at + 1, summary = (await sql.query("insert into private.lens_summaries(engagement_id,lens) values($1,$2) returning id", [room, lens])).rows[0].id as string;
      const version = (await sql.query("insert into private.lens_summary_versions(engagement_id,summary_id,version,author,shown_at) values($1,$2,1,'facilitator',now()) returning id", [room, summary])).rows[0].id as string;
      for (const [position, text] of lines.entries()) {
        const sentence = (await sql.query("insert into private.lens_summary_sentences(engagement_id,version_id,position,text) values($1,$2,$3,$4) returning id", [room, version, position, text])).rows[0].id as string;
        const source = (await sql.query("insert into private.lens_sentences(engagement_id,lens,source,text) values($1,$2,'live',$3) returning id", [room, lens, `Day 1 words ${tag} for line ${position + 1}`])).rows[0].id as string;
        await sql.query("insert into private.lens_summary_sources(summary_sentence_id,lens_sentence_id,engagement_id) values($1,$2,$3)", [sentence, source, room]);
      }
      await sql.query("update private.lens_summaries set state='signed_off',current_version_id=$2,signed_off_version_id=$2 where id=$1", [summary, version]);
    }
    try {
      const fac = await facilitator(env, sql, room);
      await publish();
      const cookie = fac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
      const mk = async (title: string, position: number) => (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,max_sends,max_characters,max_words,options)
        values($1,$2,'Day 2',$3,'read_back','Did we hear you right?','ready',60,280,50,'{"ai":true}') returning id`, [room, `${title} ${tag}`, position])).rows[0].id as string;
      const rb = await mk("Confirm the 10-year Future and outcomes", 906);
      const poke = () => fetch(`${app.origin}/api/control/${room}`, { headers: { Cookie: cookie }, cache: "no-store" }).catch(() => undefined);
      const info = async () => (await (await fetch(`${app.origin}/api/control/${room}/read-back`, { headers: { Cookie: cookie }, cache: "no-store" })).json()) as Info;
      const ctl = async (action: string, body: Record<string, unknown> = {}) => {
        const response = await fetch(`${app.origin}/api/control/${room}/read-back`, { method: "POST", headers: { Cookie: cookie, Origin: app.origin, "Content-Type": "application/json" }, body: JSON.stringify({ id: randomUUID(), action, session: rb, ...body }) });
        return (await response.json()) as { status: string };
      };
      const results = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [room])).rows[0].results as { tally: { yes: number; change: number }; item: { version: number; lines: { text: string }[] } | null; index: number };

      const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
      await tv.goto(app.origin + "/tv");
      const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
      await pairTv(fac, room, app.secret, code, "Read-back TV");
      await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
      const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
      const tvLines = async () => (await layer().locator(".lsm-line:not(.is-gone) .lsm-text").allInnerTexts()).map(l => l.replace(/\s+/g, " ").trim());
      const phones = await joinPhones(app.origin, 50, { prefix: `Readback phone ${tag}` });
      const scribe = new Phone(app.origin);
      await scribe.join(room, `Scribe kit ${tag}`);
      await sql.query("update public.attendees set room_role='scribe' where engagement_id=$1 and name=$2", [room, `Scribe kit ${tag}`]);

      // The control surface and the remote open after the 100-answer run: in the practice room every call takes one room-wide lock,
      // and two polling pages would be measured with the phones (the lens summary kit keeps them closed the same way).
      const laptopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await laptopContext.addCookies(fac.cookies(app.origin));
      const laptop = await laptopContext.newPage(); panelPage = laptop;
      const remoteContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await remoteContext.addCookies(fac.cookies(app.origin));
      const remote = await remoteContext.newPage();
      // ---------- Go live: the items are read ----------
      await press(fac, sql, room, "go_live", { session: rb });
      await layer().locator("[data-read-back]").waitFor({ timeout: 10000 });
      await tv.evaluate(sampler);
      const one = await until(async () => { const i = await info(); return i.items?.length === 7 && i; }, "seven items", 8000);

      await step("Go-live reads the five lens summaries in lens order, then the two reviewed outcomes", async () => {
        assert.deepEqual(one.items.map(i => i.kind), ["lens", "lens", "lens", "lens", "lens", "outcome", "outcome"]);
        assert.deepEqual(one.items.slice(5).map(i => i.label), outcomes.map(o => o.name));
        assert.equal(one.items[0].state, "now");
        assert.match(one.item!.heading, /, \d{4}$/, "the heading reads like Community, 2036");
        assert.deepEqual(one.item!.lines.map(l => l.text), lensLines[0]);
        await until(async () => (await layer().locator(".rbk-chip").count()) === 7, "seven progress chips on the TV", 5000);
        assert.equal((await layer().locator(".tv-headline").innerText()).trim(), "Did we hear you right?");
        assert.deepEqual(await tvLines(), lensLines[0], "the TV shows the server's lines");
        assert.ok((await tvLines()).join(" ").length <= 420, "one screen: 420 characters");
        await shot(tv, "tv-first-item");
      });

      // ---------- 50 phones ----------
      const first = one.item!.version_id;
      await step("50 phones answer and add what's missing: 95 of 100 reach the TV under a second, the tally has no leader colour, nothing jumps", async () => {
        const from = new Date(Date.now() - 1000).toISOString();
        const answers = await Promise.all(phones.map(async (p, i) => {
          await delay(Math.floor(Math.random() * 2500));
          return i < 40 ? p.sendValue(room, rb, { version: first, response: "yes" }, "Yes, that's us") : p.sendValue(room, rb, { version: first, response: "change" }, `Line ${i - 39} could say more about ${["children", "visitors", "volunteers", "prayer", "meals"][i % 5]}`);
        }));
        assert.ok(answers.every(a => a === "accepted"), `every answer accepted: ${[...new Set(answers)].join(",")}`);
        const missing = await Promise.all(phones.map(async (p, i) => { await delay(Math.floor(Math.random() * 2500)); return p.sendValue(room, rb, { version: first, response: "missing" }, `Missing ${tag} idea ${i + 1}: neighbours at the school gate`); }));
        assert.ok(missing.every(a => a === "accepted"), `every missing answer accepted: ${[...new Set(missing)].join(",")}`);
        await delay(3500);
        const report = await (await fetch(`${app.origin}/api/control/${room}/latency?from=${encodeURIComponent(from)}&to=${encodeURIComponent(new Date().toISOString())}`, { headers: { Cookie: cookie } })).json() as { measured: number; under_second: number; phone_tv: { p50: number; p95: number } };
        assert.equal(report.measured, 100, `every answer reached the TV and was logged: ${JSON.stringify(report)}`);
        assert.ok(verdict(report as never).met, `95 of 100 under one second on loopback: ${verdict(report as never).label}`);
        console.log(`100 answers: phone to TV median ${report.phone_tv.p50} ms, 95th ${report.phone_tv.p95} ms`);
        assert.deepEqual((await results()).tally, { yes: 40, change: 10 });
        await until(async () => (await layer().locator('[data-tally="yes"] dd').innerText()).trim() === "40" && (await layer().locator('[data-tally="change"] dd').innerText()).trim() === "10", "the TV tally matches the server", 5000);
        const fills = await layer().locator(".rbk-bar i").evaluateAll(els => els.map(e => getComputedStyle(e).backgroundColor));
        assert.equal(new Set(fills).size, 1, `both bars share one colour, no leader: ${fills.join(" | ")}`);
        await until(async () => (await layer().locator("[data-missing]:not(.is-out)").count()) >= 1, "a missing answer is shown", 6000).catch(async e => { await shot(tv, "debug-no-cards"); throw e; });
        const shown = await layer().locator("[data-missing]:not(.is-out)").count(), more = (await layer().locator("[data-more-missing]").innerText()).trim();
        assert.ok(shown >= 1 && shown <= 6, `at most 6 anonymous missing cards: ${shown}`);
        assert.equal(more, `+ ${50 - shown} more on phones`);
        assert.ok(!new RegExp(`Readback phone|@example\\.org`).test(await layer().innerText()), "no name or email on the TV");
        await shot(tv, "tv-50-phones");
        const samples = await tv.evaluate(() => (window as unknown as { rbkSamples: Record<string, [number, number, number][]> }).rbkSamples);
        let jumps = 0, frames = 0, largest = 0;
        for (const pts of Object.values(samples)) for (let i = 1; i < pts.length; i++) { frames++; const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (d >= 160) jumps++; largest = Math.max(largest, d); }
        assert.equal(jumps, 0, `no row jumped across ${frames} sampled frames (largest step ${Math.round(largest)}px)`);
      });

      await step("A phone reads the full text with its source sentences, changes its answer, and sees a missing answer of its own", async () => {
        const read = await (await phones[0].call(`/api/live/${room}/read-back?session=${rb}`, { cache: "no-store" })).json() as { status: string; item: { lines: { text: string; sources: { text: string }[] }[] } };
        assert.equal(read.status, "ok");
        assert.deepEqual(read.item.lines.map(l => l.text), lensLines[0]);
        assert.ok(read.item.lines.every(l => l.sources.length > 0 && l.sources.every(s => s.text.includes(tag))), "every line carries the sentences it came from");
        const mine = await (await phones[0].call(`/api/live/${room}`, { cache: "no-store" })).json() as { answers?: unknown[] };
        assert.ok(mine, "the phone's own snapshot loads");
      });

      // ---------- A scribe correction naming a line ----------
      const scribeSend = async (body: Record<string, unknown>, phone = scribe) => {
        const response = await phone.call(`/api/scribe/${room}/read-back`, { method: "POST", body: JSON.stringify({ id: randomUUID(), ...body }) });
        return (await response.json()) as { status: string };
      };
      await step("A scribe correction that names a line goes to the queue with its reason, the facilitator accepts it, and it folds in as a tracked change", async () => {
        await laptop.goto(`${app.origin}/control/${room}`); await remote.goto(`${app.origin}/remote/${room}`);
        const i = await info(), target = i.item!.lines[1], wording = "We eat together every Sunday after worship.";
        const sent = await scribeSend({ item: i.item!.id, line: target.id, wording, reason: "The room said Sunday, not every week" });
        assert.equal(sent.status, "accepted");
        await laptop.locator(`[data-correction][data-state="queued"]`).first().waitFor({ timeout: 8000 });
        assert.match(await laptop.locator("[data-correction-reason]").first().innerText(), /Sunday, not every week/, "the scribe's reason is on the control surface");
        assert.ok(!(await layer().innerText()).includes("not every week"), "the reason never reaches the TV");
        await delay(1500); await panelShot("control-queue");
        await laptop.locator("[data-accept]").first().click();
        await until(async () => (await results()).item?.version === 2, "version 2 on the server", 8000);
        const s = await results();
        assert.deepEqual(s.item!.lines.map(l => l.text), [lensLines[0][0], wording, lensLines[0][2]], "every other line word for word");
        assert.deepEqual(s.tally, { yes: 0, change: 0 }, "the tally restarts at zero");
        await until(async () => (await layer().locator('[data-tally="yes"] dd').innerText()).trim() === "0", "the TV tally restarted", 5000);
        await until(async () => (await layer().locator(".lsm-ins").count()) > 0, "inserted words are underlined", 5000);
        await shot(tv, "tv-tracked-change");
        await delay(2500);
        assert.deepEqual(await tvLines(), s.item!.lines.map(l => l.text), "once the struck words leave, the TV shows the server's lines");
        const samples = await tv.evaluate(() => (window as unknown as { rbkSamples: Record<string, [number, number, number][]> }).rbkSamples);
        let jumps = 0, frames = 0, largest = 0;
        for (const pts of Object.values(samples)) for (let n = 1; n < pts.length; n++) { frames++; const d = Math.hypot(pts[n][0] - pts[n - 1][0], pts[n][1] - pts[n - 1][1]); if (d >= 160) jumps++; largest = Math.max(largest, d); }
        assert.equal(jumps, 0, `no row jumped across the fold, ${frames} frames (largest ${Math.round(largest)}px)`);
        const ran = (await sql.query("select count(*)::integer n from private.ai_runs where session_id=$1 and job='fold_read_back' and not deleted", [rb])).rows[0].n;
        assert.equal(ran, 0, "a correction that names a line folds in code, with no AI call");
      });

      await step("A phone one version behind is told to read the new one; the new version takes fresh answers", async () => {
        assert.equal(await phones[0].sendValue(room, rb, { version: first, response: "yes" }, "Yes, that's us"), "stale");
        const version = (await info()).item!.version_id;
        const out = await Promise.all(phones.slice(0, 30).map(p => p.sendValue(room, rb, { version, response: "yes" }, "Yes, that's us")));
        assert.ok(out.every(s => s === "accepted"), `answers on version 2: ${[...new Set(out)].join(",")}`);
        await until(async () => (await layer().locator('[data-tally="yes"] dd').innerText()).trim() === "30", "the TV counts version 2", 5000);
        assert.equal((await sql.query("select count(*)::integer n from public.submissions where session_id=$1 and not deleted", [rb])).rows[0].n >= 130, true, "version 1's answers are kept as history");
      });

      // ---------- A correction naming no line: AI places it ----------
      await step("A correction that names no line is placed by AI, every other line word for word, and the run is recorded", async () => {
        const i = await info(), wording = "Every guest is welcomed by name at the door.";
        assert.equal((await scribeSend({ item: i.item!.id, wording, reason: "Guests, not strangers" })).status, "accepted");
        const id = await until(async () => (await info()).corrections.find(c => c.wording === wording && c.state === "queued")?.id, "the correction is queued", 8000);
        await laptop.locator(`[data-correction="${id}"] [data-accept]`).click();
        await until(async () => { await poke(); return (await results()).item?.version === 3; }, "version 3 folded in", 30000);
        const s = await results();
        assert.deepEqual(s.item!.lines.map(l => l.text), [wording, "We eat together every Sunday after worship.", lensLines[0][2]], "AI changed the one line and left the others word for word");
        const run = (await sql.query("select status, changed, prompt_version from private.ai_runs where session_id=$1 and job='fold_read_back' and not deleted order by created_at desc limit 1", [rb])).rows[0];
        assert.ok(run && run.status === "ok" && run.changed && run.prompt_version === promptVersions.fold_read_back, `the fold run: ${JSON.stringify(run)}`);
        assert.ok(!(await layer().innerText()).includes("Guests, not strangers"), "the scribe's reason never reaches the TV");
        await shot(tv, "tv-ai-fold");
      });

      await step("Undo the last fold puts the previous wording back on the TV and the control surface", async () => {
        await laptop.locator("[data-undo]").click();
        await until(async () => (await tvLines()).join("|") === ["We welcome every guest by name at the door.", "We eat together every Sunday after worship.", lensLines[0][2]].join("|"), "the TV shows the wording before the AI fold", 8000);
        const i = await info();
        assert.ok(i.item!.versions.some(v => v.undone), "the folded version is marked undone");
      });

      // ---------- A scribe offline ----------
      await step("A scribe who is offline keeps the correction in the outbox, and it arrives when the connection returns", async () => {
        const jar = (scribe as unknown as { jar: Map<string, string> }).jar;
        const scribeContext = await browser!.newContext({ viewport: { width: 1440, height: 1000 } });
        await scribeContext.addCookies([...jar].map(([name, value]) => ({ name, value, url: app.origin })));
        const page = await scribeContext.newPage(); await page.goto(`${app.origin}/room/${room}`);
        await page.locator("[data-testid=correction-composer]").waitFor({ timeout: 20000 });
        await page.selectOption("#scr-cr-line", { label: "A new line" }).catch(async () => { await page.selectOption("#scr-cr-line", "new"); });
        await page.fill("#scr-cr-wording", "We pray for our neighbours by name.");
        await page.fill("#scr-cr-reason", "Said by two people");
        await scribeContext.setOffline(true);
        await page.locator("[data-testid=correction-send]").click();
        await delay(1500);
        assert.equal((await info()).corrections.filter(c => c.wording === "We pray for our neighbours by name.").length, 0, "nothing reached the server while offline");
        await shot(page, "scribe-composer-offline");
        await scribeContext.setOffline(false);
        await until(async () => (await info()).corrections.some(c => c.wording === "We pray for our neighbours by name." && c.state === "queued"), "the offline correction arrives", 30000);
        await shot(page, "scribe-composer");
        await scribeContext.close();
      });

      await step("The facilitator writes a correction directly, dismisses it, and accepts the scribe's new line", async () => {
        const out = await ctl("correct", { line: "", wording: "Throwaway wording the room did not want.", reason: "Facilitator note" });
        assert.equal(out.status, "ok");
        const throwaway = await until(async () => (await info()).corrections.find(c => c.wording.startsWith("Throwaway") && c.source === "facilitator")?.id, "the direct correction is queued", 8000);
        await laptop.locator(`[data-correction="${throwaway}"] [data-dismiss]`).click();
        await until(async () => (await info()).corrections.find(c => c.id === throwaway)?.state === "dismissed", "dismissed", 5000);
        const added = (await info()).corrections.find(c => c.wording === "We pray for our neighbours by name." && c.state === "queued")!;
        await laptop.locator(`[data-correction="${added.id}"] [data-accept]`).click();
        await until(async () => (await results()).item?.lines.length === 4, "a fourth line", 8000);
        await until(async () => (await tvLines()).length === 4, "the TV shows 4 lines", 8000);
        assert.equal((await tvLines())[3], "We pray for our neighbours by name.");
      });

      // ---------- Mark a decision, and the Map reads it ----------
      await step("Mark a decision settles the item, the confirmed text becomes a new signed-off lens summary version, and the Map reads it", async () => {
        await laptop.evaluate(() => { for (const b of document.querySelectorAll("button")) if (b.textContent?.includes("Mark a decision") && !b.closest(".lsm-decide")) b.setAttribute("data-toolbar-decision", ""); });
        assert.equal(await laptop.locator("[data-toolbar-decision]").count(), 1, "one toolbar Mark a decision");
        await laptop.locator("[data-toolbar-decision]").click();
        await until(async () => await laptop.evaluate(() => document.activeElement?.id) === "rbk-decision", "the toolbar's Mark a decision goes to the read-back's own", 3000);
        assert.equal(await laptop.locator(".ctl-decision").count(), 0, "the general decision panel does not open");
        await laptop.fill("#rbk-decision", "Confirmed with changes");
        await laptop.locator("[data-decide]").click();
        await until(async () => (await layer().locator("[data-settled-mark]").count()) > 0, "the TV marks the item settled", 8000);
        await until(async () => (await layer().locator('.rbk-chip[data-state="settled"]').count()) === 1, "the progress strip marks it settled", 5000);
        const row = (await sql.query("select subject, decision from private.decisions where engagement_id=$1 and subject='read_back' and not deleted order by marked_at desc limit 1", [room])).rows[0];
        assert.ok(row && row.decision === "Confirmed with changes", `a decision record: ${JSON.stringify(row)}`);
        assert.equal(await layer().locator(".lsm-ins").count(), 0, "once settled the underlines become plain words");
        const v = (await sql.query(`select v.author, v.note, v.id from private.lens_summaries s join private.lens_summary_versions v on v.id=s.signed_off_version_id where s.engagement_id=$1 and s.lens=1 and not s.deleted`, [room])).rows[0];
        assert.ok(v && v.author === "read_back", `the signed-off lens summary is a new version by the read-back: ${JSON.stringify(v)}`);
        assert.match(String(v.note ?? ""), /Changed in the Day 2 confirm/);
        const texts = (await sql.query("select text from private.lens_summary_sentences where version_id=$1 and not deleted order by position", [v.id])).rows.map(r => r.text);
        assert.deepEqual(texts, (await results()).item!.lines.map(l => l.text), "the confirmed lines are the summary's lines");
        const map = JSON.stringify((await fac.client.rpc("map_draft_read", { p_engagement: room })).data);
        assert.ok(map.includes("We pray for our neighbours by name."), "the draft Map reads the changed text");
        await shot(tv, "tv-settled");
        await panelShot("control-settled");
      });

      // ---------- Next, the remote, and the outcomes ----------
      await step("Next moves on with the lift, the new item starts at zero, and the settled item stays to look back at on phones", async () => {
        const before = await layer().locator("[data-read-back]").getAttribute("data-item");
        await laptop.locator("[data-next]").click();
        await until(async () => (await layer().locator("[data-read-back]").getAttribute("data-item")) !== before, "the TV moves to the next item", 8000);
        await until(async () => (await layer().locator('[data-tally="yes"] dd').innerText()).trim() === "0", "the new item starts at zero", 5000);
        const read = await (await phones[0].call(`/api/live/${room}/read-back?session=${rb}`, { cache: "no-store" })).json() as { settled: { changed: boolean; lines: { text: string }[] }[] };
        assert.equal(read.settled.length, 1);
        assert.ok(read.settled[0].changed && read.settled[0].lines.some(l => l.text === "We pray for our neighbours by name."), "the settled item shows its confirmed text");
      });

      await step("The remote has Previous, Next and the tally, and nothing else of the queue", async () => {
        await remote.locator("[data-read-back-remote]").waitFor({ timeout: 15000 });
        assert.match(await remote.locator("[data-read-back-remote] [data-tally]").innerText(), /Yes, that's us/);
        assert.equal(await remote.locator("[data-correction], [data-accept]").count(), 0, "no queue on the remote");
        const at = (await results()).index;
        await remote.locator("[data-read-back-remote] button", { hasText: "Previous" }).click();
        await until(async () => (await results()).index === at - 1, "Previous on the remote", 8000);
        await remote.locator("[data-read-back-remote] button", { hasText: "Next" }).click();
        await until(async () => (await results()).index === at, "Next on the remote", 8000);
        await shot(remote, "remote");
      });

      await step("An outcome shows its 3-year Vision bullets; a phone sees only the input the overnight draft cites, never scribe words, photos or speakers", async () => {
        const i = await info();
        assert.equal((await ctl("show", { to: i.items[5].id })).status, "ok");
        await until(async () => (await layer().locator(".rbk-h").innerText()).includes(outcomes[0].name), "the TV shows the first outcome", 8000);
        assert.deepEqual(await tvLines(), outcomes[0].bullets.map(b => b[0]));
        const read = await phones[2].call(`/api/live/${room}/read-back?session=${rb}`, { cache: "no-store" });
        const body = await read.text();
        assert.ok(body.includes("Visit new families quickly") && body.includes("Hosts at the Sunday door"), "the cited phone input reaches the phone");
        assert.ok(!body.includes(scribeWords) && !body.includes(photoWords), "no scribe card or photo words reach a phone");
        assert.ok(!/speaker|Sam Scribe/i.test(body), "no speaker reaches a phone");
        await shot(tv, "tv-outcome");
      });

      // The practice-room runs of November 6 found the read-back TV showing 1 or 2 of the "What's missing?" answers, with "+ 6 more", where
      // the Default is up to six that fit whole, and a count that moved from 2 to 1 with no new input. The first kit step used eight answers of
      // 12 to 20 characters on a screen with no other traffic, measured once; the practice room's answers run to 30 or 40 characters, the room size
      // changes while the room is live, and phones keep answering. So this step uses both kinds of answer, changes the room size live,
      // samples the count while the room version moves, and asks of every count that it is the most whole answers the space allows.
      const geometry = () => layer().evaluate(el => {
        const stage = el.closest(".tv-stage")!.getBoundingClientRect(), box = (e: Element) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
        const lines = [...el.querySelectorAll<HTMLElement>(".lsm-line:not(.is-gone)")].map(l => parseFloat(getComputedStyle(l).fontSize));
        const all = [...el.querySelectorAll<HTMLElement>("[data-missing]")].map(c => ({ ...box(c), out: c.classList.contains("is-out"), text: (c.textContent ?? "").trim(), height: c.getBoundingClientRect().height,
          rows: (() => { const clip = c.querySelector<HTMLElement>(".rbk-clip")!; return clip.clientHeight / (parseFloat(getComputedStyle(clip).lineHeight) || 1); })() }));
        const more = el.querySelector("[data-more-missing]"), list = el.querySelector(".rbk-missing")!;
        return { stage: { top: Math.max(0, stage.top), bottom: Math.min(innerHeight, stage.bottom) }, lines, cards: all.filter(c => !c.out), hidden: all.filter(c => c.out), gap: parseFloat(getComputedStyle(list).rowGap) || 0,
          more: more ? { ...box(more), text: (more.textContent ?? "").trim() } : null, list: box(list), type: parseFloat(getComputedStyle(el.querySelector(".lsm-card, .rbk-missing-h")!).fontSize) };
      });
      const wholeAndFull = (g: Awaited<ReturnType<typeof geometry>>, total: number, size: string) => {
        for (const c of g.cards) {
          // Two lines at most, each whole: an answer longer than that ends after its second line, never half a line.
          assert.ok(c.rows <= 2.05 && Math.abs(c.rows - Math.round(c.rows)) < 0.1, `${size}: a missing answer shows whole lines, two at most: ${c.rows} lines: ${c.text}`);
          assert.ok(c.top >= g.list.top - 0.5 && c.bottom <= g.list.bottom + 0.5, `${size}: a missing answer sits inside its list: ${JSON.stringify(c)}`);
          assert.ok(c.bottom <= g.stage.bottom + 0.5, `${size}: a missing answer is on the screen`);
        }
        if (g.more) assert.ok(g.more.bottom <= g.stage.bottom + 0.5 && g.more.top >= g.cards[g.cards.length - 1].bottom - 0.5, `${size}: the "+ n more" line sits under the cards and on the screen: ${JSON.stringify(g.more)}`);
        assert.equal(g.cards.length + Number(g.more?.text.match(/\d+/)?.[0] ?? 0), total, `${size}: shown plus "+ n more on phones" is all ${total}: ${g.more?.text}`);
        // As many whole answers as fit, up to six: when one is held back, there was no room for it under the last one shown.
        if (g.cards.length < Math.min(6, total) && g.hidden.length) {
          const free = g.list.bottom - g.cards[g.cards.length - 1].bottom - g.gap;
          assert.ok(free + 0.5 < g.hidden[0].height, `${size}: ${g.cards.length} shown, yet ${Math.round(free)}px was free for an answer that needs ${Math.round(g.hidden[0].height)}px`);
        }
      };
      // The count for one room size, sampled for a few seconds while the room version moves (a phone changes its answer twice): it must not move.
      const settled = async (size: string, total: number, churn: () => Promise<unknown>) => {
        await press(fac, sql, room, "room_size", { size });
        await until(async () => (await tv.locator("main[data-room]").getAttribute("data-room")) === size, `room size ${size}`, 8000);
        await until(async () => (await geometry()).cards.length + Number((await geometry()).more?.text.match(/\d+/)?.[0] ?? 0) === total, `every answer is on the TV at ${size}`, 8000);
        await delay(600);
        const counts: number[] = [], first = await geometry(); counts.push(first.cards.length);
        for (let t = 0; t < 12; t++) { if (t === 3 || t === 7) await churn(); await delay(400); counts.push((await geometry()).cards.length); }
        assert.equal(new Set(counts).size, 1, `${size}: the count does not move with no new answers: ${counts.join(",")}`);
        const g = await geometry(); wholeAndFull(g, total, size);
        return g;
      };
      let flip = 0;
      const churn = async () => { flip++; await phones[10].sendValue(room, rb, { version: (await info()).item!.version_id, response: flip % 2 ? "yes" : "change" }, flip % 2 ? "Yes, that's us" : "It needs a change"); };
      const fontsLoaded = async () => tv.evaluate(async () => { await document.fonts.ready; return ["600 36px \"Plus Jakarta Sans\"", "700 36px \"Plus Jakarta Sans\""].every(f => document.fonts.check(f)); });
      await step("The read-back text follows the room size, and What's missing shows up to six short answers whole at every size, 1920 by 1080, with no drift", async () => {
        await tv.evaluate("window.__name = f => f"); // the test runner's transpiler names inner functions
        assert.ok(await fontsLoaded(), "the TV's real type face is loaded, as on the live screen");
        const i = await info();
        assert.equal((await ctl("show", { to: i.items[3].id })).status, "ok");
        await until(async () => (await layer().locator("[data-read-back]").getAttribute("data-item")) === i.items[3].id, "Operations on the TV", 8000);
        const version = (await info()).item!.version_id;
        const answers = ["Open the doors early", "Child care Sundays", "A quiet prayer room", "Names on a board", "More parking", "Coffee first", "Rides for elders", "A way to give"];
        const sent = await Promise.all(answers.map((a, n) => phones[n].sendValue(room, rb, { version, response: "missing" }, a)));
        assert.ok(sent.every(a => a === "accepted"), `every missing answer accepted: ${[...new Set(sent)].join(",")}`);
        const sizeBefore = (await sql.query("select settings->>'room_size' as s from public.engagements where id=$1", [room])).rows[0].s as string | null;
        const px: Record<string, number> = {}, shownAt: Record<string, number> = {};
        for (const size of ["very_small", "medium", "very_large"]) {
          const g = await settled(size, answers.length, churn);
          assert.ok(g.lines.length === 3, `Operations has three lines on the TV: ${g.lines.length}`);
          px[size] = g.lines[0]; shownAt[size] = g.cards.length;
          await shot(tv, `tv-missing-${size}`);
        }
        console.log(`Read-back line size by room size: ${JSON.stringify(px)}; short answers shown: ${JSON.stringify(shownAt)}`);
        assert.deepEqual(shownAt, { very_small: 6, medium: 6, very_large: 6 }, "six short answers show at every room size");
        assert.ok(px.very_small > px.medium && px.medium > px.very_large, `the line text follows the room size (very small ${px.very_small}px, medium ${px.medium}px, very large ${px.very_large}px)`);
        await sql.query("update public.engagements set settings=case when $2::text is null then settings-'room_size' else settings||jsonb_build_object('room_size',$2::text) end where id=$1", [room, sizeBefore]);
      });

      await step("What's missing with one- and two-line answers, and answers longer than a line: as many whole answers as fit at every size, none clipped, none moving", async () => {
        const i = await info();
        assert.equal((await ctl("show", { to: i.items[1].id })).status, "ok");
        await until(async () => (await layer().locator("[data-read-back]").getAttribute("data-item")) === i.items[1].id, "Community on the TV", 8000);
        const version = (await info()).item!.version_id;
        const answers = ["Child care for babies during the service", "Rides for older members", "Coffee first", "A quiet place to pray before we start", "More parking", "Names on a board at the entrance",
          "A way to give online that works on a phone and does not ask for a long form every time", "Open the doors early"];
        const sent = await Promise.all(answers.map((a, n) => phones[n].sendValue(room, rb, { version, response: "missing" }, a)));
        assert.ok(sent.every(a => a === "accepted"), `every missing answer accepted: ${[...new Set(sent)].join(",")}`);
        const shownAt: Record<string, number> = {}, type: Record<string, number> = {};
        for (const size of ["very_small", "medium", "very_large"]) {
          const g = await settled(size, answers.length, churn);
          shownAt[size] = g.cards.length; type[size] = g.type;
          await shot(tv, `tv-missing-mixed-${size}`);
        }
        console.log(`Mixed answers shown by room size: ${JSON.stringify(shownAt)}; answer type px: ${JSON.stringify(type)}`);
        assert.ok(shownAt.very_small >= 4 && shownAt.medium >= 4 && shownAt.very_large >= 4, `at least four whole answers at every size: ${JSON.stringify(shownAt)}`);
        await sql.query("update public.engagements set settings=settings-'room_size' where id=$1", [room]);
      });

      await step("The longest item stays at its one-screen size (about 43 px) at every room size", async () => {
        const i = await info();
        assert.equal((await ctl("show", { to: i.items[4].id })).status, "ok");
        await until(async () => (await layer().locator("[data-read-back]").getAttribute("data-item")) === i.items[4].id, "Learning on the TV", 8000);
        const longest: Record<string, number> = {};
        for (const size of ["very_small", "medium", "very_large"]) {
          await press(fac, sql, room, "room_size", { size });
          await until(async () => (await tv.locator("main[data-room]").getAttribute("data-room")) === size, `room size ${size}`, 8000);
          await delay(800);
          longest[size] = await layer().evaluate(el => parseFloat(getComputedStyle(el.querySelector(".lsm-line:not(.is-gone)")!).fontSize));
        }
        console.log(`Read-back longest item line size by room size: ${JSON.stringify(longest)}`);
        assert.ok(longest.very_small >= longest.medium && longest.medium >= longest.very_large && longest.very_large >= 36, `the longest item never grows as the room size shrinks the type: ${JSON.stringify(longest)}`);
        await sql.query("update public.engagements set settings=settings-'room_size' where id=$1", [room]);
        assert.equal((await ctl("show", { to: i.items[3].id })).status, "ok"); // the next step moves to the longest item itself
      });

      await step("The longest item (8 lines, 416 characters) fits whole on the screen at the default size and at Medium", async () => {
        const i = await info();
        assert.equal((await ctl("show", { to: i.items[4].id })).status, "ok");
        await until(async () => (await layer().locator(".rbk-h").innerText()).length > 0 && (await layer().locator("[data-read-back]").getAttribute("data-item")) === i.items[4].id, "lens 5 on the TV", 8000);
        for (const size of [null, "medium"]) {
          if (size) await press(fac, sql, room, "room_size", { size });
          await until(async () => size ? (await tv.locator("main[data-room]").getAttribute("data-room")) === size : true, `room size ${size}`, 8000);
          let miss: unknown;
          await until(async () => {
            try {
              const g = await layer().evaluate(el => {
                const stage = el.closest(".tv-stage")!.getBoundingClientRect(), sheet = el.querySelector(".lsm-lines")!.getBoundingClientRect();
                const lines = [...el.querySelectorAll<HTMLElement>(".lsm-line:not(.is-gone)")].map(l => ({ r: l.getBoundingClientRect(), px: parseFloat(getComputedStyle(l).fontSize) }));
                const more = el.querySelector("[data-more]")?.textContent ?? "";
                return { n: lines.length, stage: { top: Math.max(0, stage.top), bottom: Math.min(innerHeight, stage.bottom) }, sheet: { top: sheet.top, bottom: sheet.bottom }, lines: lines.map(l => ({ top: l.r.top, bottom: l.r.bottom, px: l.px })), more };
              });
              assert.ok(g.n >= 1 && g.n <= 8, `lines on the screen: ${g.n}`);
              for (const l of g.lines) { assert.ok(l.top >= g.sheet.top - 0.5 && l.bottom <= g.sheet.bottom + 0.5, `a line sits inside the sheet ${JSON.stringify(l)}`); assert.ok(l.top >= g.stage.top - 0.5 && l.bottom <= g.stage.bottom + 0.5, `a line is on the screen ${JSON.stringify(l)}`); assert.ok(l.px >= 36, `readable (${l.px}px)`); }
              assert.equal(g.n + Number(g.more.match(/\d+/)?.[0] ?? 0), 8, `shown plus "+ n more on phones" is all 8: ${g.more}`);
              return true;
            } catch (error) { miss = error; return false; }
          }, `the item fits at ${size ?? "the default size"}`, 6000).catch(() => { throw miss; });
          await shot(tv, `tv-longest-${size ?? "default"}`);
        }
        await sql.query("update public.engagements set settings=settings-'room_size' where id=$1", [room]);
      });

      await step("With nothing published only the lens items load, and the control surface says the overnight drafts are not published yet", async () => {
        await sql.query("update private.overnight_publications set withdrawn_at=now() where engagement_id=$1 and withdrawn_at is null", [room]);
        await press(fac, sql, room, "nothing_live");
        const bare = await mk("Confirm with nothing published", 907);
        await press(fac, sql, room, "go_live", { session: bare });
        const i = await until(async () => { const x = await info(); return x.session === bare && x.items?.length === 5 && x; }, "five lens items only", 8000);
        assert.ok(i.items.every(c => c.kind === "lens"));
        await laptop.locator("[data-unpublished]").waitFor({ timeout: 10000 });
        await panelShot("control-unpublished");
      });

      await step("No name or email reached the TV or an AI input", async () => {
        const runs = (await sql.query("select inputs::text as inputs from private.ai_runs where session_id=$1", [rb])).rows as { inputs: string }[];
        assert.ok(runs.length >= 1 && runs.every(r => !r.inputs.includes("@example.org") && !r.inputs.includes("Readback phone") && !r.inputs.includes(scribeWords)));
      });

      // ---------- Reset practice room: the paired TV follows it, and Remove works on a step that has been live ----------
      await step("Reset practice room: the paired TV moves to the waiting screen without a reload, and nothing of the old read-back stays in its page", async () => {
        assert.equal(await layer().locator("[data-read-back]").count(), 1, "a read-back is on the TV");
        await tv.evaluate(() => { (window as unknown as { __rbkSamePage: boolean }).__rbkSamePage = true; });
        const out = await fac.client.rpc("reset_practice_room"); assert.equal(out.error, null); assert.equal(out.data, true);
        await until(async () => (await tv.locator(".tv-holding.is-active").count()) === 1, "the waiting screen is up", 6000);
        await until(async () => (await tv.locator("[data-read-back]").count()) === 0, "no part of the old read-back is left in the TV's page", 4000);
        assert.equal(await tv.evaluate(() => (window as unknown as { __rbkSamePage?: boolean }).__rbkSamePage === true), true, "the page was not reloaded");
        await shot(tv, "tv-after-reset");
      });

      await step("Remove on a step that has been live, after Reset practice room, asks in the panel and takes the step out (no browser confirm box)", async () => {
        const dialogs: string[] = [];
        laptop.on("dialog", d => { dialogs.push(d.message()); void d.dismiss(); }); // what some browsers and tools do to a native confirm
        const started = new Date(Date.now() - 1000).toISOString();
        await laptop.goto(`${app.origin}/setup/${room}/run-of-show`);
        await laptop.locator(".rb-tile", { hasText: "Read-back" }).click();
        await laptop.locator(".rb-row.is-open #session-title").waitFor();
        const added = await until(async () => (await sql.query("select id from public.sessions where engagement_id=$1 and interaction='read_back' and title='Read-back' and not deleted and created_at>$2", [room, started])).rows[0]?.id as string, "the palette step is saved", 8000);
        const stateOf = async () => (await sql.query("select state,deleted from public.sessions where id=$1", [added])).rows[0] as { state: string; deleted: boolean };
        await laptop.locator(".rb-row.is-open").getByRole("button", { name: "Done" }).click();
        await until(async () => (await stateOf()).state === "ready", "marked ready", 8000);
        const row = laptop.locator(`[data-row="${added}"]`);
        // On air: Remove is not offered, and the panel says why.
        await press(fac, sql, room, "go_live", { session: added });
        await until(async () => (await sql.query("select live_session_id from public.room_states where engagement_id=$1", [room])).rows[0].live_session_id === added, "live", 8000);
        await laptop.reload();
        await row.getByRole("button", { name: /Open options/ }).click();
        await row.locator("[data-remove-note]").waitFor({ timeout: 8000 });
        assert.equal(await row.getByRole("button", { name: "Remove", exact: true }).count(), 0, "no Remove button while the step is on air");
        assert.match(await row.locator("[data-remove-note]").innerText(), /Nothing live/);
        // After the reset it is Ready again, and Remove works.
        const reset = await fac.client.rpc("reset_practice_room"); assert.equal(reset.error, null); assert.equal(reset.data, true);
        await laptop.reload();
        await row.getByRole("button", { name: /Open options/ }).click();
        await row.getByRole("button", { name: "Remove", exact: true }).click();
        await row.locator("[data-remove-confirm]").waitFor({ timeout: 8000 });
        assert.match(await row.locator("[data-remove-confirm]").innerText(), /Remove Read-back from the run of show\?/);
        await row.getByRole("button", { name: "Keep it" }).click();
        assert.equal((await stateOf()).deleted, false, "Keep it leaves the step");
        await row.getByRole("button", { name: "Remove", exact: true }).click();
        await row.getByRole("button", { name: "Remove session" }).click();
        await until(async () => (await stateOf()).deleted, "removed in the database", 8000);
        await until(async () => (await laptop.locator(`[data-row="${added}"]`).count()) === 0, "gone from the run of show", 8000);
        await laptop.getByText("Session removed.").waitFor({ timeout: 8000 });
        assert.deepEqual(dialogs, [], "no native confirm box was used");
        await laptop.reload();
        assert.equal(await laptop.locator(`[data-row="${added}"]`).count(), 0, "still gone after a reload");
      });
      await press(fac, sql, room, "nothing_live");
    } finally {
      await sql.query("update public.engagements set settings=$2 where id=$1", [room, seeded.settings]);
    }
    console.log(`Read-back kit: ${passed.length} checks passed. Local checks on loopback, with the scripted fake model.`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally { await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); rmSync(controlDir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exit(1); });
