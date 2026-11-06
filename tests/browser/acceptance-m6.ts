// Milestone 6 acceptance, step 6: every Discover and alignment signal surface through the live-screen rules. One headless TV is paired to the
// practice room and watched on every animation frame while 50 simulated phones write and agree on the Four Helpful Lists (AI slow). Then the
// facilitator's Discover page is used for real, in a browser: survey findings and notes go in, Draft themes reads the notes and the cards the
// phones wrote, the facilitator accepts and rejects, Draft What We Heard reads accepted themes only, Apply writes the step, and the step shows
// on the TV and a phone when it goes live. Finally a wall step runs with the alignment signal: cards on the control surface and the
// facilitator's own remote, and never in the TV's or any phone's page or network, a neutral question that cross-fades on and off with no blank
// frame, and the stored AI run inputs hold accepted themes only. AI is the scripted stand-in, never the API. KIT_SHOTS=<folder> saves screens.
// Local only: the practice room on the local stack, no email, Team Hub or CORE.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { joinPhones, practiceRoom, type Phone } from "../../scripts/load-test";
import { verdict, type LatencyReport } from "../../lib/latency/report";
import { db, facilitator, localEnv, pairTv, press, startApp, until } from "./harness";
import { spread, watcher, type Watch } from "./frame-watch";

// The scripted fake model reads this file on every call: slow, failing or well.
const controlDir = join(tmpdir(), `clearway-m6-acc-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
const fake = (value: { delayMs?: number; fail?: boolean }) => writeFileSync(controlFile, JSON.stringify(value));
fake({});
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "250", ANTHROPIC_API_KEY: "" });

const room = practiceRoom;
const lists = ["right", "wrong", "missing", "confused"] as const;
type Card = { id: string; column: string; text: string; agree: number; folded: number; ai?: boolean; ids: string[]; rank: number };
type Results = { total: number; people: number; columns: Record<string, number>; cards: Card[] };
// Cards for the 50 phones: near-duplicates inside a list (for AI to fold), the same words across lists (which stay apart), and words the fake model's themes read.
const pool: Record<(typeof lists)[number], string[]> = {
  right: ["Preaching is strong and clear", "The preaching is clear and strong", "Our volunteers show up early", "Volunteers always show up early", "We pray together before services", "A warm welcome team at the door"],
  wrong: ["Two room Sundays feel split", "Sundays in two rooms feel split", "Staff are stretched too thin", "Staff stretched thin and tired", "Parking is full by nine", "The welcome team is missing at the door"],
  missing: ["A clear path into groups", "A clear way to join a group", "Young adults ministry", "Ministry for young adults", "Training for new volunteers", "A prayer room"],
  confused: ["Who approves the budget", "Who decides the budget approval", "Elder and staff roles are unclear", "Roles of staff are confusing", "Where do I ask to start something", "How decisions get made"],
};
// Conversation notes. The person is for the record only: it must never reach a model, a page the room sees or a stored AI input.
const people = ["Priya Shah", "Ben Ortiz", "Ruth Lee", "Sam Cho", "Daniel Park"];
const notes: [string, string, string, string][] = [
  ["interview", people[0], "Interview 1", "We are warm on Sunday. Newcomers cannot find a small group to join. The groups are full and nobody tells them the next step."],
  ["interview", people[1], "Interview 2", "Our music and worship are a real strength. People stay for the singing. A few volunteers carry everything and they are burning out."],
  ["input", people[2], "Board conversation", "Visitors come once and we lose them. There is no clear first step. Volunteers are stretched thin, the same five people every week."],
  ["input", people[3], "Staff conversation", "I feel alone as a leader. Nobody checks on the leaders. Small groups are hard to find for new families too."],
  ["interview", people[4], "Interview 3", "Giving is steady and generous. The worship band is the heart of Sunday."],
];
const findings: [string, string, number][] = [["Small groups are easy to find", "52%", 52], ["Giving is generous", "45%", 45], ["Young families", "5%", 5]];
const stepRows: [string, string, string][] = [["What we heard: Survey", "Congregational survey", "survey"], ["What we heard: Four Helpful Lists", "Four Helpful Lists", "four_lists"],
  ["What we heard: Board and staff input", "Board and staff input conversations", "input"], ["What we heard: Leadership interviews", "Leadership interviews", "interviews"]];
// What the 50 phones say on the wall step while the signal reads the room. "volunteers" belongs to a theme the facilitator never accepts.
const said = ["small groups meet in homes again", "small groups are where we belong", "a small group got me through a hard year", "groups are how newcomers find friends",
  "we should add a third service on Sunday", "another service would help more families", "young families find us online", "young families need more room",
  "volunteers are stretched thin every week", "the volunteers carry too much"];

async function main() {
  const env = localEnv(), sql = db(env), app = await startApp(env);
  let browser: Browser | undefined, fac: Awaited<ReturnType<typeof facilitator>> | undefined;
  const passed: string[] = [], table: string[] = [], cleanup: string[] = [];
  const startedAt = new Date().toISOString(), shots = process.env.KIT_SHOTS, tag = randomUUID().slice(0, 6);
  const shot = async (page: Page, name: string) => { if (shots) { await delay(900); await page.screenshot({ path: `${shots}/acceptance-m6-${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { const t0 = Date.now(); await run(); passed.push(`${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); console.log(`ok · ${name}`); };
  let seed = 23; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  let before: { settings: unknown } | undefined;
  try {
    await sql.connect();
    before = (await sql.query("select settings from public.engagements where id=$1 and not deleted", [room])).rows[0];
    assert.ok(before, "Run npm run db:seed first: the acceptance kit uses the permanent practice room");
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [room]);
    fac = await facilitator(env, sql, room);
    const lead = fac;
    const cookie = lead.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
    let position = 940;
    const mk = async (kind: string, title: string, prompt: string, limits: { sends?: number; chars?: number; words?: number; part?: string } = {}) => {
      const id = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,options,max_sends,max_characters,max_words,planned_minutes)
        values($1,$2,$3,$4,$5,$6,'ready','{}',$7,$8,$9,20) returning id`, [room, `${title} ${tag}`, limits.part ?? "Day 1", position++, kind, prompt, limits.sends ?? 3, limits.chars ?? 200, limits.words ?? 50])).rows[0].id as string;
      cleanup.push(id); return id;
    };
    const results = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [room])).rows[0].results as Results;
    const report = async (from: string): Promise<LatencyReport> => {
      const r = await fetch(`${app.origin}/api/control/${room}/latency?from=${encodeURIComponent(from)}&to=${encodeURIComponent(new Date().toISOString())}`, { headers: { Cookie: cookie } });
      assert.ok(r.ok, "the latency report reads"); return await r.json() as LatencyReport;
    };
    const rpc = async (name: string, args: Record<string, unknown>) => { const r = await lead.client.rpc(name, args); assert.equal(r.error, null, `${name}: ${r.error?.message}`); assert.equal((r.data as { status: string }).status, "ok", `${name}: ${JSON.stringify(r.data)}`); return r.data; };

    // A clean room: the practice reset puts away what earlier kits left, Discover records and signals included.
    const reset = await lead.client.rpc("reset_practice_room"); assert.equal(reset.error, null); assert.equal(reset.data, true, "the practice room resets");
    await press(lead, sql, room, "nothing_live");
    browser = await chromium.launch();
    const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvContext.newPage();
    // Everything the TV is sent after the signal run starts is kept, for the check that no card is among it.
    let tvWire: string[] = [], recording = false;
    tv.on("response", async r => { if (!recording) return; const type = r.headers()["content-type"] ?? ""; if (/json|event-stream|text\/plain/.test(type)) tvWire.push(await r.text().catch(() => "")); });
    tv.on("websocket", ws => ws.on("framereceived", f => { if (recording) tvWire.push(String(f.payload)); }));
    await tv.goto(app.origin + "/tv");
    const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(lead, room, app.secret, code, "Milestone 6 acceptance TV");
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
    await tv.evaluate(() => { (window as unknown as { __loaded: number }).__loaded = 1; });
    await tv.evaluate(watcher);
    const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
    const tally = async () => (await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").then(v => v ?? "")).replace(/\s+/g, " ").trim();
    const watch = async (sel: string) => tv.evaluate(s => { const a = (window as unknown as { __acc: Watch & { sel: string } }).__acc; const out = { ...a, jumps: a.jumps.slice() }; Object.assign(a, { sel: s, frames: 0, blank: 0, dim: 0, worst: 0, worstKey: "", worstDt: 0, steps: 0, jumps: [] }); return out as Watch; }, sel);
    const phones = await joinPhones(app.origin, 50, { prefix: "Wayfinder" });
    const attendees = (await sql.query("select id from public.attendees where engagement_id=$1 and not deleted and name like 'Wayfinder %'", [room])).rows;
    assert.equal(attendees.length, 50, "fifty phones in the room");
    // One of them is a real browser page, so a phone's own page and network can be read.
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const jar = (phones[0] as unknown as { jar: Map<string, string> }).jar;
    await phoneContext.addCookies([...jar].map(([name, value]) => ({ name, value, url: app.origin })));
    const phonePage = await phoneContext.newPage();
    let phoneWire: string[] = [];
    phonePage.on("response", async r => { if (!recording) return; const type = r.headers()["content-type"] ?? ""; if (/json|event-stream|text\/plain/.test(type)) phoneWire.push(await r.text().catch(() => "")); });
    phonePage.on("websocket", ws => ws.on("framereceived", f => { if (recording) phoneWire.push(String(f.payload)); }));
    await phonePage.goto(`${app.origin}/room/${room}`);
    await phonePage.locator(".ph-app").waitFor({ timeout: 20000 });

    // ---------- The Four Helpful Lists, 50 phones ----------
    const fourId = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,options,max_sends,max_characters,max_words,planned_minutes)
      values($1,$2,'Day 1',$3,'four_lists','Think about our church today.','ready','{}',6,140,30,30) returning id`, [room, `Four Helpful Lists ${tag}`, position++])).rows[0].id as string;
    cleanup.push(fourId);
    const agree = async (p: Phone, card: string) => (await (await p.call(`/api/live/${room}/agree`, { method: "POST", body: JSON.stringify({ id: randomUUID(), card, revision: 0, on: true, sentAt: new Date(Date.now() + p.offset).toISOString(), uncertaintyMs: Math.min(60000, Math.round(p.uncertainty)) }) })).json()) as { status: string; reason?: string };
    await step("Four Helpful Lists, 50 phones with AI slow: every card is on the TV under one second (95 in 100), nothing jumps, blanks or redraws, and the TV's counts are the server's", async () => {
      fake({ delayMs: 2000 });
      await press(lead, sql, room, "go_live", { session: fourId });
      await layer().locator(".fl-board").waitFor({ timeout: 10000 });
      await delay(900);
      await layer().evaluate(el => { (el as unknown as { __mark: number }).__mark = 1; (el.querySelector(".tv-board") as unknown as { __mark: number }).__mark = 1; });
      await watch(".tv-layer:not(.is-leaving) .fl-slot");
      const from = new Date(Date.now() - 500).toISOString();
      const statuses = await Promise.all(phones.map(async (p, i) => {
        await delay(Math.floor(rnd() * 6000));
        const list = lists[i % 4], texts = pool[list];
        return p.sendValue(room, fourId, { column: list }, `${texts[Math.floor(i / 4) % texts.length]} (${i + 1})`);
      }));
      assert.deepEqual([...new Set(statuses)], ["accepted"], "every card accepted"); assert.equal(statuses.length, 50);
      await delay(3500);
      fake({});
      await until(async () => (await tally()).startsWith("50 cards from 50 people"), "the TV count reads 50 cards from 50 people", 15000);
      const server = await results();
      assert.equal(server.total, 50, "the server counts 50 cards"); assert.equal(server.people, 50, "from 50 people");
      const mine = (await report(from)).sessions.find(s => s.id === fourId);
      assert.ok(mine, "the latency log has the session");
      assert.equal(mine!.measured, 50, "every card reached the TV and was logged");
      const v = verdict(mine!);
      const w = await watch(".tv-layer:not(.is-leaving) .fl-slot");
      assert.equal(w.blank, 0, "the TV never blanked"); assert.equal(w.dim, 0, "the TV never faded out");
      assert.ok(w.steps > 50, `the TV drew frames while cards arrived (${w.steps} item frames)`);
      assert.deepEqual(w.jumps, [], `nothing jumped (largest step ${Math.round(w.worst)} px on ${w.worstKey}, ${Math.round(w.worstDt)} ms frame)`);
      assert.ok(await layer().evaluate(el => (el as unknown as { __mark?: number }).__mark === 1 && (el.querySelector(".tv-board") as unknown as { __mark?: number }).__mark === 1), "the TV animated in place, never drawing the view again");
      assert.ok(await tv.evaluate(() => (window as unknown as { __loaded?: number }).__loaded === 1), "the TV page never reloaded");
      table.push(`${"Four Helpful Lists (cards)".padEnd(34)} ${String(mine!.under_second).padStart(3)} of ${String(mine!.measured).padEnd(3)} under 1 s (${Math.floor(mine!.under_second / mine!.measured * 1000) / 10}%), 95th ${mine!.p95} ms, largest step ${Math.round(w.worst)} px over ${w.steps} item frames`);
      assert.ok(v.met, `95 of 100 under one second on loopback while AI works: ${v.label}`);
      // The TV shows the server's top cards of each list, in its order, with its agreement numbers, and says how many more stand on phones.
      const want = lists.map(l => server.cards.filter(c => c.column === l).sort((a, b) => a.rank - b.rank).slice(0, 4).map(c => `${c.text}|${c.agree}`));
      await until(async () => {
        const got = await Promise.all(lists.map(l => layer().locator(`.fl-col[data-col="${l}"] .fl-slot`).evaluateAll(els => els.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
          .map(e => `${e.querySelector(".fl-tx")!.textContent}|${e.querySelector(".fl-agree b")!.textContent}`))));
        return got.every((g, i) => g.length >= Math.min(3, want[i].length) && g.every((x, k) => x === want[i][k]));
      }, "the TV's lists match the server's top cards", 10000);
      for (const l of lists) {
        const shown = await layer().locator(`.fl-col[data-col="${l}"] .fl-slot:not([data-out])`).count(), more = Number((await layer().locator(`.fl-col[data-col="${l}"] .fl-more`).innerText()).match(/\d+/)?.[0] ?? 0);
        const standing = (await sql.query("select count(*)::integer as n from jsonb_array_elements(private.four_lists_board($1,false)) c where c->>'column'=$2", [fourId, l])).rows[0].n as number;
        assert.equal(shown + more, standing, `${l}: the TV's cards and its "more on phones" line add up to the ${standing} that stand`);
      }
      const folds = (await sql.query("select count(*)::integer as n from private.four_list_folds f join public.submissions s on s.id=f.member_id where s.session_id=$1 and f.undone_at is null and not f.deleted and f.made_by='ai'", [fourId])).rows[0].n as number;
      table.push(`${"Four Helpful Lists (folds)".padEnd(34)} ${folds} cards folded by AI beside the cards, never in their way`);
      await shot(tv, "four-lists-tv");
    });
    await step("Four Helpful Lists, 50 phones agree: each agree is on the TV under one second (95 in 100), the TV's numbers are the server's, and no one counts twice", async () => {
      const server = await results(), cards = server.cards.filter(c => c.rank <= 4);
      assert.ok(cards.length >= 8, "there are cards to agree with");
      await watch(".tv-layer:not(.is-leaving) .fl-slot");
      const times: number[] = [];
      const shown = async (card: Card) => layer().locator(`.fl-slot[data-id="${card.id}"] .fl-agree b`).first().textContent().then(t => Number(t)).catch(() => -1);
      for (let i = 0; i < 20; i++) {
        const card = cards[i % cards.length], b = (await results()).cards.find(c => c.id === card.id)!, p = phones[(i * 7 + 3) % 50];
        const start = Date.now(), reply = await agree(p, card.id);
        if (reply.status !== "accepted") continue;
        const now = (await results()).cards.find(c => c.id === card.id);
        if (!now || now.agree === b.agree) continue;
        await until(async () => (await shown(now)) === now.agree, `agree ${i} on the TV`, 4000);
        times.push(Date.now() - start);
      }
      assert.ok(times.length >= 12, `most timed agrees counted (${times.length} of 20)`);
      const sp = spread(times);
      assert.ok(sp.share >= 95, `95 in 100 agrees under one second: 95th ${sp.p95} ms, slowest ${sp.max} ms`);
      const agreeRows = async () => (await sql.query("select count(*) filter (where agreed)::integer as n from private.four_list_agrees where engagement_id=$1 and session_id=$2 and not deleted", [room, fourId])).rows[0].n as number;
      const rowsBefore = await agreeRows();
      const statuses = await Promise.all(phones.map(async (p, i) => { await delay(Math.floor(rnd() * 4000)); const reply = await agree(p, cards[(i * 5) % cards.length].id); return reply.reason ?? reply.status; }));
      assert.ok(statuses.every(s => ["accepted", "duplicate", "own", "conflict"].includes(s)), `every agree counted or refused for a reason: ${[...new Set(statuses)]}`);
      await delay(2000);
      const took = statuses.filter(x => x === "accepted").length;
      assert.ok(took >= 25, `most of the 50 burst agrees were accepted (${took}); the rest were refused for a reason: ${JSON.stringify(statuses.filter(x => x !== "accepted"))}`);
      assert.equal(await agreeRows() - rowsBefore, took, "the stored agree rows rose by exactly the number accepted");
      const w = await watch(".tv-layer:not(.is-leaving) .fl-slot");
      // A jump is 150 px in one display frame. A frame the machine took twice as long over (33 ms, with 50 phones hitting a 2 CPU box) is two display frames of the same glide.
      assert.deepEqual(w.jumps.filter(j => Number(j[1]) / Math.min(2, Math.max(1, Math.round(Number(j[2]) / 16.7))) >= 150), [], `nothing jumped while cards traded places (largest step ${Math.round(w.worst)} px on ${w.worstKey})`);
      assert.equal(w.blank, 0); assert.equal(w.dim, 0);
      const dup = (await sql.query("select card_id,attendee_id,count(*)::integer as n from private.four_list_agrees where engagement_id=$1 and not deleted group by 1,2 having count(*)>1", [room])).rowCount;
      assert.equal(dup, 0, "one agree per person per card");
      const final = await results();
      await until(async () => {
        const got = await layer().locator(".fl-slot").evaluateAll(els => els.map(e => [(e as HTMLElement).dataset.id!, Number(e.querySelector(".fl-agree b")!.textContent)] as const));
        return got.length > 0 && got.every(([id, n]) => final.cards.find(c => c.id === id)?.agree === n);
      }, "every number on the TV is the server's", 10000);
      const rows = (await sql.query("select count(*) filter (where agreed)::integer as n from private.four_list_agrees where engagement_id=$1 and session_id=$2 and not deleted", [room, fourId])).rows[0].n as number;
      assert.ok(rows >= 12, `agrees stored (${rows})`);
      table.push(`${"Four Helpful Lists (agrees)".padEnd(34)} ${sp.under} of ${sp.n} timed taps under 1 s (${sp.share}%), 95th ${sp.p95} ms, ${rows} agrees, largest step ${Math.round(w.worst)} px`);
    });
    await press(lead, sql, room, "nothing_live");

    // ---------- Discover: findings, notes, themes ----------
    const facContext: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 1500 } });
    await facContext.addCookies(lead.cookies(app.origin));
    const page = await facContext.newPage();
    const discover = `${app.origin}/setup/${room}/discover`;
    const theme = (label: string, source = "") => page.locator(".dsc-theme", { hasText: label }).filter({ hasText: source }).first();
    const themeRows = async (where = "") => (await sql.query(`select label,source,status,rests_on,out_of,ai_run is not null as ai from private.discover_themes where engagement_id=$1 and not deleted ${where} order by seq`, [room])).rows;
    const accepted = async () => (await sql.query("select label,source from private.discover_accepted_themes($1) order by label,source", [room])).rows as { label: string; source: string }[];
    const conv = "Interviews and conversations", fl = "Four Helpful Lists";
    await step("Discover setup: the total and the findings go in by hand, each finding is its own accepted theme, and thin data is flagged", async () => {
      await rpc("discover_total_set", { p_engagement: room, p_total: 100 });
      for (const [title, figure, n] of findings) await rpc("discover_finding_save", { p_engagement: room, p_id: randomUUID(), p_title: title, p_figure: figure, p_rests_on: n });
      for (const [kind, person, title, body] of notes) await rpc("discover_note_add", { p_engagement: room, p_id: randomUUID(), p_kind: kind, p_person: person, p_title: title, p_body: body, p_source: "paste" });
      await page.goto(discover);
      await page.getByRole("heading", { name: "Themes", level: 2 }).waitFor({ timeout: 15000 });
      const rows = await themeRows("and source='survey'");
      assert.deepEqual(rows.map(r => [r.label, r.status, r.rests_on, r.out_of]), [["Small groups are easy to find", "accepted", 52, 100], ["Giving is generous", "accepted", 45, 100], ["Young families", "accepted", 5, 100]]);
      const thin = (await sql.query("select label,thin,strong from private.discover_accepted_themes($1) order by label", [room])).rows;
      assert.deepEqual(thin.map(r => [r.label, r.thin, r.strong]), [["Giving is generous", false, true], ["Small groups are easy to find", false, true], ["Young families", true, false]], "thin and strong are worked out in code from the counts");
      assert.match(await theme("Young families").innerText(), /5 of 100 respondents, fewer than 10/, "the thin finding says why");
      assert.equal(await theme("Young families").locator(".dsc-thin").count(), 1, "and carries the thin mark");
      assert.equal(await theme("Small groups are easy to find").locator(".dsc-strong").count(), 1, "52 percent is strong");
      assert.equal(await theme("Small groups are easy to find").locator(".dsc-thin").count(), 0, "and not thin");
      assert.ok(!/[–—]/.test(await page.locator("main").innerText()), "no dashes in the copy");
      await shot(page, "discover-findings");
    });
    await step("Draft themes: themes arrive from the notes and the 50 phones' cards with the AI icon and counts, resting on conversations and cards, with no person anywhere; a single source is thin", async () => {
      const standing = (await sql.query("select count(*)::int n from private.four_lists_cards_for_themes($1)", [room])).rows[0].n as number;
      assert.ok(standing >= 20, `the cards the 50 phones wrote stand for the themes to read (${standing})`);
      await page.getByRole("button", { name: "Draft themes" }).click();
      await theme("Small groups are hard to find", conv).waitFor({ timeout: 30000 });
      await until(async () => (await themeRows("and source in ('conversations','four_lists')")).length >= 6, "themes saved", 30000);
      const drafted = await themeRows("and source in ('conversations','four_lists')");
      assert.ok(drafted.every(r => r.status === "draft" && r.ai), "every drafted theme is a draft made by AI");
      assert.ok(drafted.some(r => r.source === "four_lists"), "the cards the phones wrote gave themes too");
      assert.match(await theme("Small groups are hard to find", conv).innerText(), /2\s*of 5 conversations/, "rests on / out of, from the sources");
      assert.ok(await theme("Small groups are hard to find", conv).locator(".cwl-ai-mark").count() >= 1, "the AI icon on a drafted theme");
      assert.match(await theme("Communication is unclear", fl).innerText(), /of \d+ people/, "a card theme counts people");
      // One interview alone is thin by the rule (one interview), and says so.
      assert.equal(await theme("Giving is steady", conv).locator(".dsc-thin").count(), 1, "a theme resting on one interview is marked thin");
      assert.ok(!new RegExp(people.join("|") + "|Shah").test(await page.locator("main").innerText()), "no person on the page");
      assert.equal((await sql.query("select count(*)::int n from private.ai_runs where engagement_id=$1 and job='draft_discover_themes' and status='ok' and created_at>=$2", [room, startedAt])).rows[0].n, 1);
      assert.equal((await accepted()).length, 3, "only the three findings count before anything is accepted");
      await shot(page, "discover-drafted");
    });
    await step("Accept, reject and leave: only the themes the facilitator accepts count", async () => {
      await theme("Small groups are hard to find", conv).getByRole("button", { name: "Accept" }).click();
      await theme("Communication is unclear", fl).getByRole("button", { name: "Accept" }).click();
      await theme("Leaders feel alone").getByRole("button", { name: "Reject" }).click();
      await until(async () => (await accepted()).length === 5, "five themes count: three findings and two accepted", 10000);
      const labels = (await accepted()).map(a => a.label);
      for (const none of ["Volunteers are stretched", "Leaders feel alone", "Giving is steady", "Worship and music are strengths"]) assert.ok(!labels.includes(none), `${none} does not count`);
      await until(async () => (await themeRows("and label='Leaders feel alone' and status='rejected'")).length >= 1, "a rejected theme is saved as rejected", 10000);
      assert.ok((await themeRows("and label='Volunteers are stretched' and status='draft'")).length >= 1, "a theme left alone stays a draft");
      await shot(page, "discover-accepted");
    });

    // ---------- What We Heard ----------
    const heard: Record<string, string> = {};
    for (const [i, [title, source, key]] of stepRows.entries()) {
      heard[key] = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,options,phone_depth)
        values($1,$2,'Pre-call',$3,'content','','draft',$4::jsonb,'') returning id`, [room, `${title} ${tag}`, 990 + i, JSON.stringify({ screen: "headline", source })])).rows[0].id as string;
      cleanup.push(heard[key]);
    }
    const source = (key: string) => page.locator(`[data-source="${key}"]`);
    const stepRow = async (key: string) => (await sql.query("select state,prompt,phone_depth,options,revision from public.sessions where id=$1", [heard[key]])).rows[0];
    await step("Draft What We Heard: headlines come from accepted themes only, with the lead figure as the number, and the stored AI input holds nothing else", async () => {
      await page.goto(discover);
      await page.getByRole("heading", { name: "What We Heard", level: 2 }).waitFor({ timeout: 15000 });
      await page.getByRole("button", { name: "Draft What We Heard" }).click();
      await source("survey").getByLabel("Headline line").waitFor({ timeout: 30000 });
      await until(async () => (await sql.query("select count(*)::int n from private.heard_drafts where engagement_id=$1 and not deleted", [room])).rows[0].n >= 2, "drafts saved", 30000);
      const drafts = (await sql.query("select source_key,number,line,thin,ai_run is not null as ai,applied_at from private.heard_drafts where engagement_id=$1 and not deleted order by source_key", [room])).rows;
      assert.ok(drafts.some(d => d.source_key === "survey") && drafts.some(d => d.source_key === "four_lists"), "a headline for the survey and for the Four Helpful Lists");
      assert.ok(drafts.every(d => d.ai && !d.applied_at), "each is an AI draft, not yet applied");
      assert.equal(drafts.find(d => d.source_key === "survey")!.number, "52%", "the number is the lead theme's own figure, set by the database");
      assert.ok(await source("survey").locator(".cwl-ai-mark").count() >= 1, "the AI icon on a draft");
      const run = (await sql.query("select inputs::text as inputs, output::text as output from private.ai_runs where engagement_id=$1 and job='draft_what_we_heard' and status='ok' and created_at>=$2 order by created_at desc limit 1", [room, startedAt])).rows[0];
      for (const want of ["Small groups are easy to find", "Small groups are hard to find", "Communication is unclear"]) assert.ok(run.inputs.includes(want), `the accepted theme "${want}" was sent`);
      for (const none of ["Volunteers are stretched", "Leaders feel alone", "Giving is steady", "Worship and music are strengths", "The next step is unclear", ...people]) assert.ok(!run.inputs.includes(none) && !run.output.includes(none), `"${none}" never reached the model`);
      assert.equal((await stepRow("survey")).prompt, "", "nothing is written to a step until Apply");
      // Thin follows the lead theme: the page marks "(thin data)" on a line exactly when the database says its lead is thin, and the survey's lead (52 percent) is not.
      assert.equal(drafts.find(d => d.source_key === "survey")!.thin, false, "the survey headline leads with a strong finding");
      // The interview and input sources each rest on one conversation for the one accepted conversation theme, so their lead is thin and their line says so.
      assert.ok(drafts.some(d => d.thin), "at least one headline leads with a thin theme");
      for (const d of drafts) assert.equal(/\(thin data\)/i.test(await source(d.source_key).innerText()), d.thin, `${d.source_key}: "(thin data)" is on the line exactly when its lead is thin`);
      await shot(page, "what-we-heard-drafted");
    });
    await step("Apply writes the step's headline, number, source and phone depth, and nothing goes live; when the step goes live the TV and a phone show it", async () => {
      const line = "named **small groups** as easy to find";
      await source("survey").getByLabel("Headline line").fill(line);
      await source("survey").getByRole("button", { name: "Save draft" }).click();
      await until(async () => (await sql.query("select line from private.heard_drafts where engagement_id=$1 and source_key='survey' and not deleted", [room])).rows[0]?.line === line, "the edit is saved");
      const before = await stepRow("survey");
      await source("survey").getByRole("button", { name: "Apply" }).click();
      await source("survey").locator(".dsc-applied").waitFor({ timeout: 20000 });
      const after = await stepRow("survey");
      assert.equal(after.prompt, line, "the headline is written exactly as edited");
      assert.equal(after.options.number, "52%"); assert.match(after.options.source, /^Congregational survey/); assert.equal(after.options.screen, "headline");
      assert.ok(after.phone_depth.length > 5, "and the phone depth"); assert.equal(after.state, before.state, "the step's state is unchanged: nothing reaches the TV or phones");
      assert.ok(after.revision > before.revision, "it went through the run of show's own save");
      assert.ok(!(await tv.locator("body").innerText()).toLowerCase().includes("small groups are easy"), "the TV shows nothing of it yet");
      await sql.query("update public.sessions set state='ready' where id=$1", [heard.survey]);
      await press(lead, sql, room, "go_live", { session: heard.survey });
      await until(async () => (await layer().innerText()).includes("52%"), "the number on the TV", 10000);
      assert.equal(await layer().locator(".tv-headline-xl strong").innerText(), "small groups", "a marked phrase is bold");
      await until(async () => (await phonePage.locator(".ph-body").innerText()).length > 20 && /small group/i.test(await phonePage.locator(".ph-body").innerText()), "the depth on a phone", 10000);
      await shot(tv, "what-we-heard-live-tv"); await shot(phonePage, "what-we-heard-live-phone");
      await press(lead, sql, room, "nothing_live");
    });

    // ---------- The alignment signal ----------
    const wall = await mk("wall", "Five Lenses: Community", "What does our community say about us?", { sends: 3, chars: 280, words: 50 });
    const control = await facContext.newPage();
    let remotePage: Page | undefined;
    await step("Signal: cards arrive on the control surface and the facilitator's remote, and never reach the TV, a phone's page or any network payload", async () => {
      await press(lead, sql, room, "go_live", { session: wall });
      await layer().locator(".tv-board, .ai-wall, .tv-feed").first().waitFor({ timeout: 10000 }).catch(() => {});
      await control.goto(`${app.origin}/control/${room}`);
      const remoteContext = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await remoteContext.addCookies(lead.cookies(app.origin));
      const remote = await remoteContext.newPage(); await remote.goto(`${app.origin}/remote/${room}`);
      await control.locator("[data-signal-panel]").waitFor({ timeout: 20000 });
      await remote.locator("[data-signal-list]").waitFor({ timeout: 20000 });
      tvWire = []; phoneWire = []; recording = true;
      const from = new Date(Date.now() - 500).toISOString();
      const statuses = await Promise.all(said.map(async (text, i) => { await delay(Math.floor(rnd() * 2500)); return phones[i].send(room, wall, text).then(r => r.status); }));
      assert.deepEqual([...new Set(statuses)], ["accepted"], "every answer accepted");
      const panelKinds = async () => (await control.locator("[data-signal-panel] [data-signal-id]:not(.is-leaving)").evaluateAll(els => els.map(e => e.getAttribute("data-signal")))).sort();
      const listKinds = async () => (await remote.locator("[data-signal-list] [data-signal-id]:not(.is-leaving)").evaluateAll(els => els.map(e => e.getAttribute("data-signal")))).sort();
      await until(async () => { const k = await panelKinds(); return ["aligned", "divergent", "thin"].every(x => k.includes(x)); }, "aligned, divergent and thin cards on the control surface", 60000).catch(async e => {
        const runs = (await sql.query("select status,error,jsonb_array_length(inputs->'room') as room,left(output::text,600) as out from private.ai_runs where session_id=$1 and job='alignment_signal' order by created_at", [wall])).rows;
        console.error("signal runs:", JSON.stringify(runs), "cards:", JSON.stringify((await sql.query("select kind,title,dismissed_at from private.signals where session_id=$1", [wall])).rows)); throw e; });
      await until(async () => JSON.stringify(await listKinds()) === JSON.stringify(await panelKinds()), "the same cards on the remote", 20000);
      const w = (await report(from)).sessions.find(s => s.id === wall);
      // Ten answers on a two CPU box with the model running: one slow answer is 90 percent, so the gate here is every answer logged and the 95th under 1.5 s. The 50 phone steps above hold the 95 in 100 rule.
      assert.ok(w && w.measured === 10 && (w.p95 ?? 0) <= 1500, `the wall's answers reached the TV promptly while the signal ran (${w ? verdict(w).label : "no log"})`);
      table.push(`${"Wall with the signal running".padEnd(34)} ${w!.under_second} of ${w!.measured} under 1 s, 95th ${w!.p95} ms; cards on the control surface and the remote: ${(await panelKinds()).join(", ")}`);
      // The cards, from the database.
      const cards = (await sql.query("select kind,title,line,ask from private.signals where session_id=$1 and not deleted", [wall])).rows as { kind: string; title: string; line: string; ask: string | null }[];
      assert.ok(cards.length >= 3);
      // Nothing on the TV: not its page, not one byte it was sent.
      assert.equal(await tv.locator("[data-signal-id], [data-signal-panel], [data-signal-list], [class*=\"cwl-sg\"]").count(), 0, "no card on the TV");
      const tvText = (await tv.locator("body").innerText()).toLowerCase();
      for (const c of cards) for (const part of [c.title, c.line]) assert.ok(!tvText.includes(part.toLowerCase()), `the TV page never holds "${part}"`);
      for (const word of ["aligned", "divergent", "thin data", "silent", "alignment"]) assert.ok(!tvText.includes(word), `the TV never says "${word}"`);
      // Words the room itself said, and the What We Heard step the facilitator applied and took live, are public on purpose; the rest of the accepted themes are not.
      const publicText = (said.join(" ") + " " + (await sql.query("select string_agg(prompt||' '||phone_depth||' '||options::text,' ') as t from public.sessions where id=any($1::uuid[])", [Object.values(heard)])).rows[0].t).toLowerCase();
      const forbidden = [...cards.flatMap(c => [c.title, c.line, c.ask ?? ""]), ...(await accepted()).map(a => a.label).filter(l => !publicText.includes(l.toLowerCase())), "alignment_signal", "\"divergent\"", "\"aligned\"", "evidence"].filter(Boolean).map(s => s.toLowerCase());
      const tvAll = tvWire.join("\n").toLowerCase();
      assert.ok(tvWire.length > 0, "the TV's network was watched");
      for (const bad of forbidden) assert.ok(!tvAll.includes(bad), `the TV was never sent "${bad}"`);
      // Nothing on a phone: a real phone's page and network, and the snapshot every simulated phone reads.
      assert.equal(await phonePage.locator("[data-signal-id], [data-signal-panel], [data-signal-list], [class*=\"cwl-sg\"]").count(), 0, "no card on a phone");
      const phoneText = (await phonePage.locator("body").innerText()).toLowerCase();
      for (const bad of ["aligned", "divergent", "thin data", "alignment signal", ...cards.map(c => c.title.toLowerCase())]) assert.ok(!phoneText.includes(bad), `a phone never says "${bad}"`);
      assert.ok(phoneWire.length > 0, "a phone's network was watched");
      for (const bad of forbidden) assert.ok(!phoneWire.join("\n").toLowerCase().includes(bad), `the phone was never sent "${bad}"`);
      for (const p of phones.slice(0, 12)) {
        const snap = JSON.stringify(await (await p.call(`/api/live/${room}?surface=phone`, { cache: "no-store" })).json()).toLowerCase();
        for (const bad of forbidden) assert.ok(!snap.includes(bad), `a phone's snapshot never holds "${bad}"`);
      }
      const asked: string[] = [];
      for (const p of [phones[3], phones[9]]) { const r = await p.call(`/api/control/${room}/signal`); asked.push(String(r.status)); }
      assert.deepEqual(asked, ["401", "401"], "a participant's session cannot read the signal");
      assert.equal((await fetch(`${app.origin}/api/control/${room}/signal`)).status, 401, "an unsigned caller is refused");
      assert.equal((await facContext.request.get(`${app.origin}/api/control/${room}/signal`)).status(), 200, "the lead reads it");
      assert.ok(![...await tv.evaluate(() => performance.getEntriesByType("resource").map(e => e.name))].some(u => /\/signal(\b|\/|\?)/.test(new URL(u).pathname)), "the TV never asked for the signal");
      await shot(control, "signal-control"); await shot(remote, "signal-remote");
      remotePage = remote;
    });
    const remote = () => remotePage!;

    await step("Signal inputs: the stored AI run read accepted themes only, and the room's words with no person", async () => {
      const runs = (await sql.query("select inputs::text as inputs, status from private.ai_runs where session_id=$1 and job='alignment_signal' order by created_at", [wall])).rows as { inputs: string; status: string }[];
      assert.ok(runs.length >= 1 && runs.every(r => r.status === "ok"), `signal runs logged and ok (${runs.length})`);
      const inputs = runs.map(r => r.inputs).join("\n");
      for (const want of ["Small groups are easy to find", "Giving is generous", "Young families", "Small groups are hard to find", "Communication is unclear"]) assert.ok(inputs.includes(want), `the accepted theme "${want}" was sent`);
      for (const none of ["Volunteers are stretched", "Leaders feel alone", "Giving is steady", "Worship and music are strengths", "The next step is unclear", "Worship and music", ...people, "Wayfinder 0"]) assert.ok(!inputs.includes(none), `"${none}" never reached the model`);
      const noCard = (await sql.query("select count(*)::int n from private.signals s join private.discover_themes t on t.id=s.theme_id where s.session_id=$1 and t.status<>'accepted'", [wall])).rows[0].n;
      assert.equal(noCard, 0, "no card rests on a theme that is not accepted");
      const volunteers = (await sql.query("select count(*)::int n from private.signals where session_id=$1 and not deleted and (title ilike '%volunteer%' or line ilike '%volunteer%')", [wall])).rows[0].n;
      assert.equal(volunteers, 0, "the room spoke of volunteers, but that theme is not accepted, so no card speaks of it");
    });

    await step("Dismiss and Save as a citation: the card fades and the list closes up on both surfaces, a citation is aligned only and stays saved", async () => {
      const panel = control.locator("[data-signal-panel] [data-signal-id]");
      await panel.filter({ hasText: "Aligned" }).first().click();
      const aligned = control.locator("[data-signal-detail=\"aligned\"]");
      await aligned.waitFor({ timeout: 5000 });
      assert.match(await aligned.innerText(), /Theme from Discover/i); assert.match(await aligned.innerText(), /What the room said/i);
      for (const name of people) assert.ok(!(await aligned.innerText()).includes(name), `no ${name} in the evidence`);
      await aligned.getByRole("button", { name: "Save as a citation" }).click();
      await until(async () => (await sql.query("select count(*)::int n from private.signals where session_id=$1 and saved_as_citation_at is not null and kind='aligned'", [wall])).rows[0].n === 1, "the citation is saved", 5000);
      await aligned.getByRole("button", { name: "See all signals" }).click();
      const thinId = await panel.filter({ hasText: "Thin data" }).first().getAttribute("data-signal-id");
      await panel.filter({ hasText: "Thin data" }).first().click();
      const thin = control.locator("[data-signal-detail=\"thin\"]");
      assert.equal(await thin.getByRole("button", { name: /Save as a citation/ }).count(), 0, "only an aligned card can be saved");
      await thin.getByRole("button", { name: "Dismiss" }).click();
      const mine = (root: Page, list: string) => root.locator(`${list} [data-signal-id="${thinId}"]:not(.is-leaving)`);
      await until(async () => (await mine(control, "[data-signal-panel]").count()) === 0, "the dismissed card is gone from the control surface", 6000);
      await until(async () => (await mine(remote(), "[data-signal-list]").count()) === 0, "and from the remote's list", 10000);
      assert.ok((await panel.count()) >= 1, "the other cards are still listed");
      assert.equal((await sql.query("select count(*)::int n from private.signals where session_id=$1 and kind='thin' and dismissed_at is not null", [wall])).rows[0].n, 1, "dismissed in the database");
    });

    const cover = `(() => { const w = window; w.__cf = { frames: 0, min: 1, blank: 0, maxAsk: 0, stop: false }; const read = () => { if (w.__cf.stop) return; const ls = [...document.querySelectorAll(".tv-layers .tv-layer")].map(l => +getComputedStyle(l).opacity), ask = document.querySelector(".tv-ask"), a = ask ? +getComputedStyle(ask).opacity : 0;
        const c = 1 - ls.reduce((x, o) => x * (1 - o), 1) * (1 - a); w.__cf.frames++; if (c < w.__cf.min) w.__cf.min = c; if (c < 0.5) w.__cf.blank++; if (a > w.__cf.maxAsk) w.__cf.maxAsk = a; requestAnimationFrame(read); }; requestAnimationFrame(read); })()`;
    await step("The neutral question: the TV cross-fades to it with no blank frame, the count and the AI line are hidden and carry no theme, number or kind; Back to the session restores them", async () => {
      await control.locator("[data-signal-panel] [data-signal-id]").filter({ hasText: "Divergent" }).first().click();
      const detail = control.locator("[data-signal-detail=\"divergent\"]");
      const box = detail.getByRole("textbox"); await box.waitFor({ timeout: 5000 });
      const asked = await box.inputValue();
      assert.match(asked, /\?$/, "the suggested wording is a question");
      const top = tv.locator(".tv-top .tv-ask-hide");
      await tv.evaluate(cover);
      await detail.getByRole("button", { name: "Put the question up" }).click();
      await until(async () => (await tv.locator(".tv-ask.is-on .tv-headline-xl").innerText().catch(() => "")) === asked, "the question on the TV", 5000);
      await delay(1200);
      const fade = await tv.evaluate(() => { const w = window as unknown as { __cf: { frames: number; min: number; blank: number; maxAsk: number; stop: boolean } }; w.__cf.stop = true; return { ...w.__cf }; });
      assert.ok(fade.frames > 20, `the fade was watched (${fade.frames} frames)`); assert.ok(fade.maxAsk > 0.95, "the question reaches full");
      assert.equal(fade.blank, 0, `no blank frame on the way in (the screen never covered less than ${Math.round(fade.min * 100)} percent)`);
      await until(async () => (await top.evaluate(el => getComputedStyle(el).visibility)) === "hidden", "the count is hidden", 3000);
      const tvText = (await tv.locator(".tv-top, .tv-ask").allInnerTexts()).join(" ").toLowerCase();
      for (const bad of ["aligned", "divergent", "thin data", "silent", "survey", "52%", "small groups are easy", "giving is generous", "young families"]) assert.ok(!tvText.includes(bad), `the question carries no "${bad}"`);
      const payload = (await sql.query("select private.live_public_state($1) as p", [room])).rows[0].p as { state: Record<string, unknown> };
      assert.equal(payload.state.neutral_question, asked, "the payload holds the question");
      const flat = JSON.stringify(payload).toLowerCase();
      for (const bad of ["alignment_signal", "\"aligned\"", "divergent", "evidence", "small groups are easy", "giving is generous", "thin data"]) assert.ok(!flat.includes(bad), `the TV payload never holds "${bad}"`);
      assert.deepEqual(Object.keys(payload.state).filter(k => /signal|theme|kind|evidence|count/.test(k)), [], "and no key for a theme, count or kind");
      assert.equal(await phonePage.locator("#ph-answer").isVisible(), true, "phones keep the live step");
      assert.ok(!(await phonePage.locator("body").innerText()).includes(asked), "and never show the question");
      await shot(tv, "neutral-question-tv"); await shot(control, "neutral-question-control");
      // Back: the question fades out and the step, its count and the AI line return, again with no blank frame.
      await tv.evaluate(cover);
      await control.locator("[data-signal-ask]").getByRole("button", { name: "Back to the session" }).click();
      await until(async () => Number(await tv.locator(".tv-ask").evaluate(el => getComputedStyle(el).opacity)) < 0.01, "the question fades out", 5000);
      await until(async () => (await top.evaluate(el => getComputedStyle(el).visibility)) === "visible", "the count is back", 5000);
      await delay(600);
      const back = await tv.evaluate(() => { const w = window as unknown as { __cf: { frames: number; min: number; blank: number; stop: boolean } }; w.__cf.stop = true; return { ...w.__cf }; });
      assert.equal(back.blank, 0, `no blank frame on the way out (the screen never covered less than ${Math.round(back.min * 100)} percent)`);
      assert.equal((await sql.query("select neutral_question from public.room_states where engagement_id=$1", [room])).rows[0].neutral_question, null);
      assert.ok(await tv.evaluate(() => (window as unknown as { __loaded?: number }).__loaded === 1), "the TV page never reloaded");
      table.push(`${"Neutral question crossfade".padEnd(34)} in: lowest cover ${Math.round(fade.min * 100)}%, out: ${Math.round(back.min * 100)}%, ${fade.frames + back.frames} frames sampled`);
    });

    await step("The neutral question over a word cloud: the AI line shows first (words combined), goes while the question is up, and comes back with Back to the session, with no blank frame either way", async () => {
      await press(lead, sql, room, "nothing_live");
      const cloud = await mk("word_cloud", "Words for our church", "One word for our church today.", { sends: 3, chars: 40, words: 2 });
      await press(lead, sql, room, "go_live", { session: cloud });
      await layer().locator(".tv-board, .tv-cloud, .tv-words").first().waitFor({ timeout: 10000 }).catch(() => {});
      // Synonyms the scripted model combines, and one word that speaks of the thin finding so a card (with its question) is raised on this step.
      const sentWords = ["youth", "teens", "teenagers", "kids", "children", "welcome", "welcoming", "families", "families", "families"];
      const sent = await Promise.all(sentWords.map(async (w, i) => { await delay(Math.floor(rnd() * 1500)); return phones[20 + i].send(room, cloud, w).then(r => r.status); }));
      assert.deepEqual([...new Set(sent)], ["accepted"], "every word accepted");
      const aiLine = tv.locator(".tv-foot [data-ai-foot]");
      await until(async () => (await aiLine.innerText().catch(() => "")).trim().length > 0, "the AI line on the TV once words are combined", 30000);
      const lineWas = (await aiLine.innerText()).trim();
      assert.equal(await aiLine.evaluate(el => getComputedStyle(el).visibility), "visible", "the AI line is showing before the question");
      await until(async () => (await control.locator("[data-signal-panel] [data-signal=\"thin\"]:not(.is-leaving)").count()) >= 1, "a card with a question on this step", 60000);
      await control.locator("[data-signal-panel] [data-signal=\"thin\"]").first().click();
      const detail = control.locator("[data-signal-detail=\"thin\"]"), box = detail.getByRole("textbox");
      await box.waitFor({ timeout: 5000 });
      const asked = await box.inputValue(); assert.match(asked, /\?$/);
      await tv.evaluate(cover);
      await detail.getByRole("button", { name: "Put the question up" }).click();
      await until(async () => (await tv.locator(".tv-ask.is-on .tv-headline-xl").innerText().catch(() => "")) === asked, "the question on the TV", 5000);
      await until(async () => (await aiLine.evaluate(el => getComputedStyle(el).visibility)) === "hidden", "the AI line is hidden while the question is up", 3000);
      await until(async () => (await tv.locator(".tv-top .tv-ask-hide").evaluate(el => getComputedStyle(el).visibility)) === "hidden", "and so is the count", 3000);
      assert.ok(!(await tv.locator(".tv-ask").innerText()).toLowerCase().includes(lineWas.toLowerCase()), "the question does not carry the AI line");
      await delay(800);
      const fade = await tv.evaluate(() => { const w = window as unknown as { __cf: { frames: number; min: number; blank: number; stop: boolean } }; w.__cf.stop = true; return { ...w.__cf }; });
      assert.equal(fade.blank, 0, `no blank frame going in (lowest cover ${Math.round(fade.min * 100)}%)`);
      await tv.evaluate(cover);
      await control.locator("[data-signal-ask]").getByRole("button", { name: "Back to the session" }).click();
      await until(async () => Number(await tv.locator(".tv-ask").evaluate(el => getComputedStyle(el).opacity)) < 0.01, "the question fades out", 5000);
      await until(async () => (await aiLine.evaluate(el => getComputedStyle(el).visibility)) === "visible" && (await aiLine.innerText()).trim() === lineWas, "the AI line is back, as it was", 5000);
      await delay(600);
      const back = await tv.evaluate(() => { const w = window as unknown as { __cf: { frames: number; min: number; blank: number; stop: boolean } }; w.__cf.stop = true; return { ...w.__cf }; });
      assert.equal(back.blank, 0, `no blank frame coming out (lowest cover ${Math.round(back.min * 100)}%)`);
      table.push(`${"Neutral question over word cloud".padEnd(34)} AI line "${lineWas}" hidden while up and restored; lowest cover ${Math.round(Math.min(fade.min, back.min) * 100)}%`);
      await shot(tv, "neutral-question-ai-line");
      await press(lead, sql, room, "nothing_live");
      await press(lead, sql, room, "go_live", { session: wall });
      await layer().locator(".tv-board, .ai-wall, .tv-feed").first().waitFor({ timeout: 10000 }).catch(() => {});
    });

    await step("Silent cards wait for phones: none before, one after phones go down, and still nothing on the TV", async () => {
      assert.equal((await sql.query("select count(*)::int n from private.signals where session_id=$1 and kind='silent'", [wall])).rows[0].n, 0, "no silent card while phones are up");
      await press(lead, sql, room, "phones_down");
      await until(async () => (await sql.query("select count(*)::int n from private.signals where session_id=$1 and kind='silent'", [wall])).rows[0].n >= 1, "a silent card once phones go down", 40000);
      await until(async () => (await remote().locator("[data-signal-list] [data-signal=\"silent\"]").count()) >= 1, "on the remote", 15000);
      assert.equal(await tv.locator("[data-signal-id]").count(), 0, "never on the TV");
      const silent = (await sql.query("select title from private.signals where session_id=$1 and kind='silent' and not deleted", [wall])).rows[0].title as string;
      assert.match(silent, /Giving is generous/, "on the strong theme the room never touched");
      assert.ok(!tvWire.join("\n").toLowerCase().includes(silent.toLowerCase()), "and never sent to the TV");
      recording = false;
    });
    await press(lead, sql, room, "nothing_live");
    await step("Reset practice room puts away the findings, notes, themes, drafts and signals this run made", async () => {
      const done = await lead.client.rpc("reset_practice_room"); assert.equal(done.error, null); assert.equal(done.data, true);
      for (const t of ["survey_findings", "conversation_notes", "discover_themes", "heard_drafts", "signals"]) {
        const left = (await sql.query(`select count(*)::int n from private.${t} where engagement_id=$1 and not deleted`, [room])).rows[0].n;
        assert.equal(left, 0, `${t}: nothing left in the practice room`);
      }
    });
    console.log(`\nMilestone 6 acceptance, 50 simulated phones on loopback:\n${table.map(l => `  ${l}`).join("\n")}`);
    console.log(`Milestone 6 acceptance kit: ${passed.length} checks passed.\n${passed.map(p => `  ${p}`).join("\n")}\nLoopback numbers prove the pipeline, not the venue; venue acceptance is the practice-room run.`);
  } catch (error) {
    console.error(app.output().slice(-3000));
    if (shots) for (const [i, p] of (browser?.contexts() ?? []).flatMap(c => c.pages()).entries()) await p.screenshot({ path: `${shots}/acceptance-m6-failure-${i}.png` }).catch(() => {});
    throw error;
  } finally {
    if (cleanup.length) await sql.query("update public.sessions set deleted=true where id=any($1::uuid[])", [cleanup]).catch(() => {});
    // Put the practice room back as it was found: the reset clears the Discover records, themes and signals this run made.
    if (fac) { try { await fac.client.rpc("reset_practice_room"); } catch { /* Best effort. */ } }
    if (before) await sql.query("update public.engagements set settings=$2 where id=$1", [room, before.settings]).catch(() => {});
    await browser?.close(); app.stop(); await sql.end().catch(() => {}); rmSync(controlDir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exit(1); });
