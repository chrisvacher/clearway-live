// Milestone 3 acceptance, step 7a: every kind through the live-screen rules with 50 simulated
// phones. One headless TV is paired to the practice room and watched on every animation frame
// for the whole run, while each kind in turn goes live and 50 phones answer it through the
// real phone endpoint: word cloud, open text, Q&A, multiple choice, scale, ranking, 100 points,
// 2x2 grid, private form, sign together, statements, then the six content screens. For each
// kind the kit reports, from the latency log, the share of answers on the TV under one second
// and the 95th percentile (95 in 100 under one second is the gate), checks that nothing on
// the TV jumped, blanked or was drawn again, and that the TV's numbers are the server's own
// results. The private form shows only its count. KIT_SHOTS=<folder> saves each TV screen.
// Local only: the practice room on the local stack, no email, Team Hub or CORE.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { joinPhones, practiceRoom, type Phone } from "../../scripts/load-test";
import { verdict, type LatencyReport } from "../../lib/latency/report";
import { db, facilitator, localEnv, pairTv, press, startApp, until } from "./harness";

// The frame watcher, as plain script text so no bundler helper reaches the page. On every
// frame it records, for each item the current kind draws (window.__acc.sel), how far the item
// moved since the last frame, and whether the session scene had a visible layer at all.
// Items are told apart by element, not by key, so a word moving from the chips to the field
// is two items, never one long jump. Only items shown on both frames are compared.
const watcher = `(() => {
  const w = window; if (w.__acc) return;
  const a = w.__acc = { sel: "", frames: 0, blank: 0, dim: 0, worst: 0, worstKey: "", worstDt: 0, steps: 0, jumps: [], stop: false };
  const ids = new WeakMap(); let n = 0, last = new Map(), then = performance.now();
  const id = el => { if (!ids.has(el)) ids.set(el, ++n); return ids.get(el); };
  const read = now => {
    if (a.stop) return; const dt = now - then; then = now; a.frames++;
    const scene = document.querySelector(".tv-scene.tv-session.is-active");
    if (scene) {
      const layers = [...scene.querySelectorAll(".tv-layer")];
      // Blank: the session scene has no layer and no other scene is still fading out over it.
      const others = [...document.querySelectorAll(".tv-scene:not(.tv-session), .tv-check")].some(el => +getComputedStyle(el).opacity > 0.5);
      if (!layers.length && !others) a.blank++;
      // A cross-fade shows two layers at once: what the room sees is their combined cover.
      else if (1 - layers.reduce((x, l) => x * (1 - +getComputedStyle(l).opacity), 1) < 0.5 && !document.querySelector(".tv-check.is-active")) a.dim++;
    }
    const next = new Map();
    if (a.sel) for (const el of document.querySelectorAll(a.sel)) {
      if (el.closest(".tv-layer.is-leaving") || el.classList.contains("is-going") || !el.offsetWidth) continue;
      if (+getComputedStyle(el).opacity < 0.5) continue;
      const r = el.getBoundingClientRect(), c = [r.left + r.width / 2, r.top + r.height / 2], k = id(el), p = last.get(k);
      if (p) { const d = Math.hypot(c[0] - p[0], c[1] - p[1]); a.steps++; if (d > a.worst) { a.worst = d; a.worstKey = (el.className + " " + (el.dataset.key || el.textContent || "")).slice(0, 80); a.worstDt = dt; } if (d >= 150) a.jumps.push([(el.className + " " + (el.dataset.key || el.textContent || "")).slice(0, 80), Math.round(d), Math.round(dt), Math.round(p[0]), Math.round(c[0]), Math.round(p[1]), Math.round(c[1])]); }
      next.set(k, c);
    }
    last = next; requestAnimationFrame(read);
  };
  requestAnimationFrame(read);
})()`;
type Watch = { frames: number; blank: number; dim: number; worst: number; worstKey: string; worstDt: number; steps: number; jumps: (string | number)[][] };

type Bar = { key: string; fraction: number; leader: boolean };
type Kind = {
  int: string; kind: string; label: string; options: Record<string, unknown>; sel: string; sends: number; maxChars?: number; maxSends?: number;
  answer: (p: Phone, i: number, session: string) => Promise<string[]>;
  matches: (server: Results, session: string) => Promise<boolean>;
};
type Results = Record<string, unknown> & { total: number; people: number };

const five = ["Reaching new people", "Next generation", "Welcome and first visits", "Systems and data", "Second campus and facility"].map((text, i) => ({ key: `o${i + 1}`, text }));
const gridItems = ["Online newcomer path", "Prayer room", "Leader residency", "Youth night", "Data dashboard", "Coffee bar", "Kids check-in", "Men's breakfast", "Worship nights", "Serve day"].map((text, i) => ({ key: `p${i + 1}`, text }));
const words = ["youth", "alpha", "baptisms", "momentum", "welcome", "families", "prayer", "worship", "hope", "generosity", "kids", "students", "seniors", "music", "outreach", "unity", "care", "joy"];
const sentences = ["Teenagers asking to be baptized", "Young families finding us online", "Small groups meeting in homes again", "Volunteers who show up early", "Newcomers in a group within weeks"];
const topics = ["the building", "small groups", "the budget", "staff turnover", "youth ministry", "the survey", "Sunday mornings", "the final plan", "prayer", "the timeline",
  "our neighbours", "worship", "kids ministry", "the board", "new families", "serving the city", "generosity", "the parking lot", "online church", "baptisms"];
const signText = "We commit to the goals we set together.\n\n## How we will hold each other\nWe meet monthly to review the plan.";

async function main() {
  const env = localEnv(), sql = db(env), app = await startApp(env);
  let browser: Browser | undefined;
  const passed: string[] = [], table: string[] = [], cleanup: string[] = [];
  const shots = process.env.KIT_SHOTS;
  const shot = async (page: Page, name: string) => { if (shots) { await delay(900); await page.screenshot({ path: `${shots}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { const t0 = Date.now(); await run(); passed.push(`${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); console.log(`ok · ${name}`); };
  // A fixed seed keeps the bursts the same shape on every run.
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  try {
    await sql.connect();
    const seeded = (await sql.query("select 1 from public.engagements where id=$1 and not deleted", [practiceRoom])).rowCount;
    assert.equal(seeded, 1, "Run npm run db:seed first: the acceptance kit uses the permanent practice room");
    const fac = await facilitator(env, sql, practiceRoom), tag = randomUUID().slice(0, 6);
    const cookie = fac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
    let position = 970;
    const mk = async (kind: string, title: string, prompt: string, options: Record<string, unknown>, limits: { maxSends?: number; maxChars?: number } = {}) => {
      const id = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,options,max_sends,max_characters,max_words)
        values($1,$2,'Day 1',$3,$4,$5,'ready',coalesce(private.session_options($4,$6::jsonb,$1),'{}'::jsonb),$7,$8,$9) returning id`,
        [practiceRoom, `${title} ${tag}`, position++, kind, prompt, options, limits.maxSends ?? 3, limits.maxChars ?? (kind === "wall" ? 280 : kind === "qa" ? 200 : 28), kind === "wall" || kind === "qa" ? 50 : 3])).rows[0].id as string;
      cleanup.push(id); return id;
    };
    const results = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [practiceRoom])).rows[0].results as Results;
    const report = async (from: string): Promise<LatencyReport> => {
      const to = new Date().toISOString();
      const response = await fetch(`${app.origin}/api/control/${practiceRoom}/latency?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { headers: { Cookie: cookie } });
      assert.ok(response.ok, "the latency report reads"); return await response.json() as LatencyReport;
    };

    // A run that stopped part way may have left the room live on a session it then removed.
    await press(fac, sql, practiceRoom, "nothing_live");
    browser = await chromium.launch();
    const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvContext.newPage(); await tv.goto(app.origin + "/tv");
    const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(fac, practiceRoom, app.secret, code, "Acceptance kit TV");
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
    await tv.evaluate(() => { (window as unknown as { __loaded: number }).__loaded = 1; });
    await tv.evaluate(watcher);
    const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
    const tally = async () => (await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").then(v => v ?? "")).replace(/\s+/g, " ").trim();
    const watch = async (sel: string) => tv.evaluate(s => { const a = (window as unknown as { __acc: Watch & { sel: string } }).__acc; const out = { ...a, jumps: a.jumps.slice() }; Object.assign(a, { sel: s, frames: 0, blank: 0, dim: 0, worst: 0, worstKey: "", worstDt: 0, steps: 0, jumps: [] }); return out as Watch; }, sel);
    const phones = await joinPhones(app.origin, 50, { prefix: "Acceptance phone" });

    // The TV's bars in the order they stand, against the server's order and lengths.
    const barsMatch = async (server: Results) => {
      const bars = server.bars as Bar[];
      const rows = await layer().locator(".tv-bar:not(.is-leaving)").evaluateAll(rs => rs.map(r => ({ key: (r as HTMLElement).dataset.key!, y: r.getBoundingClientRect().top,
        w: parseFloat((r.querySelector(".tv-bar-fill") as HTMLElement).style.width) || 0, leader: r.classList.contains("is-leader") })));
      const byY = rows.sort((a, b) => a.y - b.y);
      return byY.length === bars.length && byY.every((r, i) => r.key === bars[i].key && Math.abs(r.w - bars[i].fraction * 100) < 0.6 && r.leader === bars[i].leader);
    };
    const people = (n: number) => async () => (await tally()) === `${n} answering`;
    // One send per phone, or a first answer and a change for the first ten (one answer per person).
    const once = (value: (i: number) => unknown, text = "") => async (p: Phone, i: number, session: string) => [await p.sendValue(practiceRoom, session, value(i), text)];
    const andChange = (value: (i: number) => unknown, text = "") => async (p: Phone, i: number, session: string) => {
      const out = [await p.sendValue(practiceRoom, session, value(i), text)];
      if (i < 10) { await delay(300 + Math.floor(rnd() * 900)); out.push(await p.sendValue(practiceRoom, session, value(i + 3), text)); }
      return out;
    };
    const stroke = () => { let x = 20 + Math.floor(rnd() * 40), s = `M${x} ${100 + Math.floor(rnd() * 40)}`; for (let k = 0; k < 14; k++) { x += 20 + Math.floor(rnd() * 15); s += `L${Math.min(600, x)} ${40 + Math.floor(rnd() * 120)}`; } return s; };
    const placesFor = (k: number) => Object.fromEntries(gridItems.slice(0, k).map((item, j) => [item.key, [Math.round(Math.min(0.98, 0.1 + 0.07 * j + rnd() * 0.2) * 1000) / 1000, Math.round(Math.min(0.98, 0.15 + 0.06 * j + rnd() * 0.25) * 1000) / 1000]]));

    const kinds: Kind[] = [
      { int: "01", kind: "word_cloud", label: "Word cloud", options: {}, sel: ".tv-layer:not(.is-leaving) .tv-word", sends: 50,
        answer: once(() => undefined), matches: async server => {
          const shown = await layer().locator(".tv-field .tv-word:not(.is-going)").evaluateAll(els => els.map(e => ({ key: (e as HTMLElement).dataset.key!, leader: e.classList.contains("is-leader") })));
          const repeated = (server.words as { key: string; count: number; level: string }[]).filter(w => w.count > 1);
          return (await tally()).startsWith(`${server.total} answers from `) && repeated.length > 0 && shown.length === repeated.length
            && repeated.every(w => shown.some(s => s.key === w.key && s.leader === (w.level === "leader")));
        } },
      { int: "02", kind: "wall", label: "Open text", options: {}, sel: ".tv-layer:not(.is-leaving) .ai-wall[data-ai=\"off\"] .ai-card", sends: 50,
        answer: once(() => undefined), matches: async (server, session) => {
          const stored = (await sql.query("select text from public.submissions where session_id=$1 and not deleted and not withdrawn", [session])).rows.map(r => r.text as string).sort();
          const cards = (await layer().locator(".ai-wall[data-ai=\"off\"] .ai-card").allTextContents()).sort();
          return (await tally()).startsWith(`${server.total} answers from `) && JSON.stringify(cards) === JSON.stringify(stored);
        } },
      { int: "03", kind: "qa", label: "Q&A", options: { any_time: false }, sel: ".tv-layer:not(.is-leaving) .qa-row", sends: 50, maxSends: 5,
        answer: once(() => undefined), matches: async server => {
          const questions = server.questions as { text: string }[];
          const shown = await layer().locator(".qa-row").evaluateAll(els => els.filter(e => !(e as HTMLElement).style.opacity).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map(e => e.querySelector(".qa-text")!.textContent));
          return (await tally()).startsWith(`${server.total} questions from `) && JSON.stringify(shown) === JSON.stringify(questions.slice(0, 3).map(q => q.text))
            && (await layer().locator(".qa-more").innerText()).trim() === `+ ${server.total - 3} more on your phones`;
        } },
      { int: "04", kind: "choice", label: "Multiple choice", options: { items: five, multiple: false }, sel: ".tv-layer:not(.is-leaving) .tv-bar", sends: 60,
        answer: andChange(i => ({ choices: [`o${[1, 2, 2, 3, 4, 3, 5, 2][i % 8]}`] })), matches: async s => await people(50)() && barsMatch(s) },
      { int: "05", kind: "scale", label: "Scale", options: { max: 5, low: "Not clear at all", high: "Crystal clear" }, sel: ".tv-layer:not(.is-leaving) .tv-scale-marker, .tv-layer:not(.is-leaving) .tv-col-count", sends: 60,
        answer: andChange(i => ({ value: [3, 4, 5, 2, 4, 3, 4, 1][i % 8] })), matches: async server => {
          const scale = server.scale as { average: number; columns: { count: number }[] };
          return await people(50)() && (await layer().locator(".tv-scale-number").innerText()) === Number(scale.average).toFixed(1)
            && JSON.stringify((await layer().locator(".tv-col-count").allInnerTexts()).map(Number)) === JSON.stringify(scale.columns.map(c => c.count));
        } },
      { int: "06", kind: "ranking", label: "Ranking", options: { items: five }, sel: ".tv-layer:not(.is-leaving) .tv-bar", sends: 60,
        answer: andChange(i => ({ order: [["o1", "o2", "o3", "o4", "o5"], ["o2", "o1", "o4"], ["o4", "o1", "o3"], ["o1", "o3", "o2", "o5"]][i % 4] })), matches: async s => await people(50)() && barsMatch(s) },
      { int: "07", kind: "points", label: "100 points", options: { items: five, cut: 3 }, sel: ".tv-layer:not(.is-leaving) .tv-bar, .tv-layer:not(.is-leaving) .tv-cut", sends: 60,
        answer: andChange(i => ({ points: [{ o1: 40, o2: 30, o3: 10, o4: 10, o5: 10 }, { o4: 50, o2: 25, o1: 25 }, { o5: 100 }, { o1: 20, o2: 20, o3: 20, o4: 20, o5: 20 }][i % 4] })),
        matches: async s => await people(50)() && barsMatch(s) },
      { int: "08", kind: "grid", label: "2x2 grid", options: { items: gridItems }, sel: ".tv-layer:not(.is-leaving) .gfs-dot", sends: 150,
        answer: async (p, _i, session) => {
          const id = randomUUID(), out: string[] = [];
          for (let rev = 0; rev < 3; rev++) { out.push(await p.sendValue(practiceRoom, session, { places: placesFor(4 + rev * 3) }, "x", { id, revision: rev })); await delay(300 + Math.floor(rnd() * 600)); }
          return out;
        }, matches: async server => {
          const items = (server.items as { num: number; count: number }[]).filter(i => i.count > 0);
          const dots = await layer().locator(".gfs-dot").evaluateAll(els => els.filter(el => getComputedStyle(el).opacity !== "0").map(el => Number(el.textContent)));
          const counts = await layer().locator(".gfs-leg:not([aria-hidden])").evaluateAll(els => els.filter(el => Number(getComputedStyle(el).opacity) > 0.5).map(el => ({ n: Number(el.querySelector("i")!.textContent), count: Number(el.querySelector("small")!.textContent!.replace(/\D/g, "")) })));
          return await people(50)() && dots.length === items.length && items.every(i => dots.includes(i.num)) && counts.length > 0 && counts.every(c => items.find(i => i.num === c.n)?.count === c.count);
        } },
      { int: "09", kind: "form", label: "Private form", options: { questions: [{ key: "q1", text: "One thing for the facilitators" }] }, sel: ".tv-layer:not(.is-leaving) .gfs-count", sends: 50,
        answer: once(i => ({ answers: { q1: `kitprivate ${i}` } }), "x"), matches: async server => server.people === 50 && ((await layer().locator(".gfs-marks").getAttribute("aria-label")) ?? "").startsWith("50 of ") && !(await tv.content()).includes("kitprivate") },
      { int: "10", kind: "sign", label: "Sign together", options: { text: signText }, sel: ".tv-layer:not(.is-leaving) .gfs-name", sends: 50,
        answer: once(() => ({ strokes: [stroke(), stroke()] }), "x"), matches: async server => (server.signers as unknown[]).length === 50 && (await layer().locator(".gfs-big").innerText()) === "50"
          && await layer().locator(".gfs-name").count() === 50 },
      { int: "17", kind: "statements", label: "Statements", options: { items: five }, sel: ".tv-layer:not(.is-leaving) .tv-bar", sends: 60,
        answer: andChange(i => ({ ratings: Object.fromEntries(five.map((o, k) => [o.key, ((i + k * 2) % 5) + 1])) })), matches: async s => await people(50)() && barsMatch(s) },
    ];

    // KIT_ONLY=word_cloud,choice runs just those kinds (and skips the content screens), for a quick look.
    const only = process.env.KIT_ONLY?.split(",").map(x => x.trim()).filter(Boolean);
    for (const k of kinds.filter(k => !only || only.includes(k.kind))) {
      await step(`INT-${k.int} ${k.label}, 50 phones: under one second (95 in 100), nothing jumps, blanks or redraws, the TV's numbers are the server's`, async () => {
        const session = await mk(k.kind, `Acceptance ${k.label}`, `Fifty phones: ${k.label}`, k.options, { maxSends: k.maxSends });
        await press(fac, sql, practiceRoom, "go_live", { session });
        await tv.locator(`.tv-layer:not(.is-leaving)[data-kind="${k.kind}"] .tv-board`).waitFor({ timeout: 10000 });
        await delay(900);
        // The layer and its board, marked now: drawn again, they would be new elements.
        await layer().evaluate(el => { (el as unknown as { __mark: number }).__mark = 1; (el.querySelector(".tv-board") as unknown as { __mark: number }).__mark = 1; });
        await watch(k.sel);
        const from = new Date(Date.now() - 500).toISOString();
        // A burst, as the PRD means one: every phone out, each answering within six seconds.
        const text = (i: number) => k.kind === "word_cloud" ? words[(i * 7) % words.length] : k.kind === "wall" ? `${sentences[i % sentences.length]} (${i + 1})`
          : k.kind === "qa" ? (i % 3 === 2 ? `What about ${topics[i % topics.length]}?` : `Can we talk about ${topics[i % topics.length]} today?`) : "";
        const statuses = (await Promise.all(phones.map(async (p, i) => {
          await delay(Math.floor(rnd() * 6000));
          return text(i) ? [await p.sendValue(practiceRoom, session, undefined, text(i))] : k.answer(p, i, session);
        }))).flat();
        assert.deepEqual([...new Set(statuses)], ["accepted"], `${k.label}: every answer accepted`);
        assert.equal(statuses.length, k.sends);
        if (k.kind === "qa") {
          // Then each phone votes for one question, so the rows trade places while the TV watches.
          const list = (await results()).questions as { id: string }[];
          const votes = await Promise.all(phones.map(async (p, i) => { await delay(Math.floor(rnd() * 3000)); return (await p.vote(practiceRoom, list[(i * 7) % list.length].id)).reason ?? "?"; }));
          assert.ok(votes.every(v => v === "accepted" || v === "own"), `every vote counted or refused as the voter's own: ${[...new Set(votes)]}`);
        }
        await delay(2500);
        const server = await results();
        await until(() => k.matches(server, session), `${k.label}: the TV settles on the server's numbers`, 10000);
        const r = await report(from), mine = r.sessions.find(s => s.id === session);
        assert.ok(mine, `${k.label}: the latency log has the session`);
        assert.equal(mine!.measured, k.sends, `${k.label}: every answer reached the TV and was logged`);
        const w = await watch(k.sel);
        assert.equal(w.blank, 0, `${k.label}: the TV never blanked`);
        assert.equal(w.dim, 0, `${k.label}: the TV never faded out`);
        assert.ok(w.steps > 100, `${k.label}: the TV drew frames while answers arrived (${w.steps} item frames)`);
        assert.deepEqual(w.jumps, [], `${k.label}: nothing jumped (largest step ${Math.round(w.worst)} px on ${w.worstKey}, ${Math.round(w.worstDt)} ms frame)`);
        assert.ok(await layer().evaluate(el => (el as unknown as { __mark?: number }).__mark === 1 && (el.querySelector(".tv-board") as unknown as { __mark?: number }).__mark === 1), `${k.label}: the TV animated in place, never drawing the view again`);
        assert.ok(await tv.evaluate(() => (window as unknown as { __loaded?: number }).__loaded === 1), "the TV page never reloaded");
        const v = verdict(mine!), share = mine!.measured ? Math.floor(mine!.under_second / mine!.measured * 1000) / 10 : 0;
        table.push(`INT-${k.int} ${k.label.padEnd(16)} ${String(mine!.under_second).padStart(3)} of ${String(mine!.measured).padEnd(3)} under 1 s (${share}%), 95th ${mine!.p95} ms, largest step ${Math.round(w.worst)} px over ${w.steps} item frames`);
        assert.ok(v.met, `${k.label}: 95 of 100 under one second on loopback: ${v.label}`);
        await shot(tv, `acceptance-int-${k.int}-${k.kind}-50-phones-tv`);
      });
    }

    if (only && !kinds.some(k => only.includes(k.kind)) && only.includes("content")) {
      await press(fac, sql, practiceRoom, "go_live", { session: await mk("choice", "Acceptance before content", "Before the content screens", { items: five }) });
      await tv.locator('.tv-layer:not(.is-leaving)[data-kind="choice"]').waitFor({ timeout: 10000 }); await delay(900);
    }
    if (!only || only.includes("content")) await step("Content screens with 50 phones: each cross-fades in with no blank frame, and every phone has it", async () => {
      // An image page needs an image: a document page drawn here, stored through media_write as the run of show stores it.
      const draw = await tvContext.newPage();
      await draw.setContent(`<body style="margin:0;background:#fff;font:600 28px sans-serif;color:#03294E"><div style="width:850px;height:1100px;padding:72px;box-sizing:border-box"><p>RIVERSIDE CHURCH · PAGE 3</p><h1>What would help you take a next step?</h1></div></body>`);
      const png = (await draw.locator("div").first().screenshot({ type: "png" })).toString("base64"); await draw.close();
      const screens = [
        { screen: "holding", title: "Walk-in", prompt: "", options: { screen: "holding", outline: "Welcome and prayer\nCheck-in\nWhere to focus" }, sees: "Where to focus" },
        { screen: "headline", title: "What we heard", prompt: "Quality preaching is the most named **strength**", options: { screen: "headline", number: "45%", source: "Congregational survey" }, sees: "45%" },
        { screen: "scripture", title: "Scripture", prompt: "Write down the revelation and make it plain on tablets.", options: { screen: "scripture", reference: "Habakkuk 2:2", translation: "NIV" }, sees: "Habakkuk 2:2" },
        { screen: "prayer", title: "Prayer", prompt: "Let's pray", options: { screen: "prayer" }, sees: "pray" },
        { screen: "image", title: "Survey page", prompt: "Survey results, page 3", options: { screen: "image" }, sees: "" },
        { screen: "screen_check", title: "Screen check", prompt: "", options: { screen: "screen_check" }, sees: "" },
      ];
      // The room starts on the last kind's step, so each screen below arrives as one session
      // replacing another, the change the layers cross-fade. (From Nothing live, the holding
      // scene cross-fades to the session scene instead, before the first layer exists.)
      await watch(".tv-layer:not(.is-leaving) .tv-headline, .tv-layer:not(.is-leaving) .tv-headline-xl, .tv-layer:not(.is-leaving) img");
      const lines: string[] = [];
      for (const s of screens) {
        const session = await mk("content", s.title, s.prompt, s.options);
        if (s.screen === "image") {
          const stored = await fac.client.rpc("media_write", { p_engagement: practiceRoom, p_session: session, p_mime: "image/png", p_width: 850, p_height: 1100, p_data: png });
          assert.equal(stored.data?.status, "ok", JSON.stringify(stored.data));
          await sql.query("update public.sessions set options=private.session_options('content',$2::jsonb,engagement_id) where id=$1", [session, { screen: "image", media: stored.data.id }]);
        }
        const t0 = Date.now();
        await press(fac, sql, practiceRoom, "go_live", { session });
        // Every phone reads the room at once, as 50 phones do when the room moves.
        const seen = await Promise.all(phones.map(async p => { const snap = await p.snapshot(practiceRoom); return { id: snap.session?.id, ms: Date.now() - t0 }; }));
        assert.ok(seen.every(x => x.id === session), `${s.screen}: every phone has the screen`);
        const slowest = Math.max(...seen.map(x => x.ms));
        assert.ok(slowest < 1000, `${s.screen}: go live to every phone moved under one second (${slowest} ms)`);
        if (s.screen === "screen_check") await tv.locator(".tv-check.is-active").waitFor({ timeout: 5000 });
        else await until(async () => (await layer().getAttribute("data-kind")) === "content" && (s.screen !== "image" || await layer().locator("img").count() === 1)
          && (!s.sees || (await layer().innerText()).includes(s.sees)), `${s.screen} on the TV`, 8000);
        if (s.screen === "image") {
          await until(async () => (await layer().locator("img").evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)), "the image loads", 8000);
          const box = (await layer().locator("img").boundingBox())!;
          assert.ok(Math.abs(box.width / box.height - 850 / 1100) < 0.02, "the page keeps its own shape");
        }
        await delay(1200);
        await shot(tv, `acceptance-content-${s.screen}-tv`);
        lines.push(`${s.screen} ${slowest} ms`);
      }
      const w = await watch("");
      assert.equal(w.blank, 0, "no frame without a screen while the content screens changed");
      assert.equal(w.dim, 0, "every cross-fade kept a screen in view");
      assert.deepEqual(w.jumps, [], `nothing on the content screens jumped (largest step ${Math.round(w.worst)} px)`);
      assert.ok(await tv.evaluate(() => (window as unknown as { __loaded?: number }).__loaded === 1), "the TV page never reloaded");
      table.push(`Content screens: go live to all 50 phones read, slowest ${lines.join(", ")}; ${w.frames} frames watched in all, none blank`);
    });
    await press(fac, sql, practiceRoom, "nothing_live");
    console.log(`\nAcceptance, 50 simulated phones on loopback (phone to TV, from the latency log):\n${table.map(l => `  ${l}`).join("\n")}`);
    console.log(`Live-screen acceptance kit: ${passed.length} checks passed.\n${passed.map(p => `  ${p}`).join("\n")}\nLoopback numbers prove the pipeline, not the venue; venue acceptance is the practice-room run.`);
  } catch (error) {
    console.error(app.output().slice(-3000));
    if (shots) for (const [i, page] of (browser?.contexts() ?? []).flatMap(c => c.pages()).entries()) await page.screenshot({ path: `${shots}/acceptance-failure-${i}.png` }).catch(() => {});
    throw error;
  } finally {
    // The practice room keeps none of the kit's sessions for real phones to find.
    if (cleanup.length) await sql.query("update public.sessions set deleted=true where id=any($1::uuid[])", [cleanup]).catch(() => {});
    await browser?.close(); app.stop(); await sql.end().catch(() => {});
  }
}
main().catch(error => { console.error(error); process.exit(1); });
