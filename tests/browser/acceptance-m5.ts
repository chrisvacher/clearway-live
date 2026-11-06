// Milestone 5 acceptance, step 4: every milestone 5 surface through the live-screen rules, in Riverside order, with 50
// simulated phones. One headless TV is paired to the practice room and watched on every animation frame for the whole run.
// The scribe's laptop captures all six tagged cards and an easel photo while a lens wall is live and 50 phones are on it;
// a facilitator promotes a quote over that live step (more phones answer underneath) and takes it down; Day 1 closes; the
// overnight drafts arrive (the scripted model, never the API) with every sentence linked to its sources and are edited,
// restored and published by the lead only; on Day 2 the read-back confirms five lens summaries and the published outcomes
// with 100 phone answers, a scribe correction accepted and folded as a tracked change, the tally restarting at zero, and
// Mark a decision on every item; then the draft Map shows the changed text. For each live surface the kit reports the share
// of phone answers on the TV under one second and the 95th percentile (95 in 100 is the gate), checks nothing jumped, and
// checks that the TV's numbers are the server's. No speaker name or scribe identity may reach the TV, a phone or the read-back.
// The practice room takes one room-wide lock, so no control surface, review page or scribe console is open while phones
// are being measured (the read-back kit does the same). KIT_SHOTS=<folder> saves screens. Local only: the practice room on the
// local stack, no email, Team Hub or CORE.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { verdict, type LatencyReport } from "../../lib/latency/report";
import { joinPhones, Phone, practiceRoom } from "../../scripts/load-test";
import { easelPng } from "./easel";
import { watcher, type Watch } from "./frame-watch";
import { db, facilitator, localEnv, pairTv, press, startApp, until } from "./harness";

// The scripted fake model reads this file on every call: slow, failing or well.
const controlDir = join(tmpdir(), `clearway-m5-acc-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
const fake = (value: { delayMs?: number; fail?: boolean }) => writeFileSync(controlFile, JSON.stringify(value));
fake({});
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "250", ANTHROPIC_API_KEY: "" });

const room = practiceRoom;
const lensLines = ["Teenagers ask to be baptized", "Young families find us online", "Small groups meet in homes again", "Volunteers show up early", "Newcomers join a group within weeks"];
const speaker = "Pat Alder", scribeName = "Scribe Sam";
// The Day 1 outcomes the overnight draft tidies (milestone 4's provisional Vision Outcomes), each with the room's bullets.
const outcomes = [
  { name: "Leaders raised from within", bullets: ["Leaders grow here and lead here", "A few deep partnerships with the city"] },
  { name: "Families find a home here", bullets: ["Kids and parents belong together", "Every new family is known by name"] },
  { name: "A church that shows up", bullets: [] as string[] },
];
// Lens 1 to 5, signed off on Day 1 (milestone 4's live lens summaries).
const signedOff: string[][] = [
  ["We welcome every guest by name at the door.", "We eat together every week after the service.", "Leaders raise up the next leaders from within."],
  ["Our street knows us by name.", "We run the community supper.", "Neighbours ask us to pray with them."],
  ["Apprentice leaders serve beside every ministry lead.", "Every team has a coach.", "Leaders share the work."],
  ["Volunteers keep the Sunday rhythm.", "Every room is set before the doors open.", "The week has a steady beat."],
  ["Every person learns something new each month in a group.", "Teachers meet to share what they taught and learned.", "Children and adults learn side by side each week."],
];
type Info = { status: string; items: { id: string; label: string; state: string; kind: string }[];
  item: { id: string; heading: string; settled: boolean; version: number; version_id: string; lines: { id: string; pos: number; text: string }[] } | null;
  corrections: { id: string; state: string; wording: string; reason: string; source: string }[]; room: { tally: { yes: number; change: number }; of: number } | null };
type Results = Record<string, unknown> & { total: number; people: number };

async function main() {
  const env = localEnv(), sql = db(env), app = await startApp(env);
  let browser: Browser | undefined;
  const passed: string[] = [], table: string[] = [], cleanup: string[] = [];
  const shots = process.env.KIT_SHOTS, tag = randomUUID().slice(0, 6);
  const shot = async (page: Page, name: string) => { if (shots) { await delay(900); await page.screenshot({ path: `${shots}/acceptance-m5-${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { const t0 = Date.now(); await run(); passed.push(`${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); console.log(`ok · ${name}`); };
  let seed = 29; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  let before: { settings: unknown } | undefined;
  try {
    await sql.connect();
    assert.equal((await sql.query("select private.scribe_storage_setup() as s")).rows[0].s, "ready", "Storage is running, so the scribe bucket can be made");
    before = (await sql.query("select settings from public.engagements where id=$1 and not deleted", [room])).rows[0];
    assert.ok(before, "Run npm run db:seed first: the acceptance kit uses the permanent practice room");
    await sql.query("update public.engagements set settings=(settings-'room_size')||'{\"ai_enabled\":true}' where id=$1", [room]);
    const fac = await facilitator(env, sql, room), co = await facilitator(env, sql, room);
    // Earlier kits leave their own leads in the permanent practice room. This run's first facilitator leads (only the lead publishes).
    const me = (await sql.query("select f.clearway_user_id from public.engagement_facilitators f join public.clearway_users u on u.id=f.clearway_user_id where f.engagement_id=$1 and u.auth_user_id=$2 and not f.deleted", [room, fac.session.user.id])).rows[0].clearway_user_id as string;
    await sql.query("update public.engagement_facilitators set role='co_facilitator' where engagement_id=$1 and role='lead'", [room]);
    await sql.query("update public.engagement_facilitators set role='lead' where engagement_id=$1 and clearway_user_id=$2", [room, me]);
    const cookie = fac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");

    // A clean room: the practice reset puts away what earlier kits left, and so do these tables.
    const reset = await fac.client.rpc("reset_practice_room"); assert.equal(reset.error, null); assert.equal(reset.data, true, "the practice room resets");
    for (const t of ["lens_summary_responses", "lens_summary_sources", "lens_summary_sentences", "lens_summary_versions", "lens_sentences", "vision_outcomes", "outcome_indicators", "overnight_rounds", "draft_outcomes", "draft_bullets", "draft_sources",
      "read_back_boards", "read_back_items", "read_back_versions", "read_back_lines", "read_back_corrections"]) await sql.query(`update private.${t} set deleted=true where engagement_id=$1 and not deleted`, [room]).catch(() => undefined);
    await sql.query("update private.lens_summaries set deleted=true,current_version_id=null,signed_off_version_id=null,decision_id=null where engagement_id=$1 and not deleted", [room]);
    await sql.query("delete from private.lens_summary_locks where engagement_id=$1", [room]);
    await sql.query("update private.overnight_publications set withdrawn_at=now() where engagement_id=$1 and withdrawn_at is null", [room]);
    await press(fac, sql, room, "nothing_live");

    let position = 970;
    const mk = async (kind: string, title: string, prompt: string, options: Record<string, unknown>, limits: { sends?: number; chars?: number; words?: number; part?: string } = {}) => {
      const id = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,options,max_sends,max_characters,max_words)
        values($1,$2,$3,$4,$5,$6,'ready',coalesce(private.session_options($5,$7::jsonb,$1),'{}'::jsonb),$8,$9,$10) returning id`,
        [room, `${title} ${tag}`, limits.part ?? "Day 1", position++, kind, prompt, options, limits.sends ?? 3, limits.chars ?? 200, limits.words ?? 50])).rows[0].id as string;
      cleanup.push(id); return id;
    };
    const results = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [room])).rows[0].results as Results;
    const report = async (from: string): Promise<LatencyReport> => {
      const r = await fetch(`${app.origin}/api/control/${room}/latency?from=${encodeURIComponent(from)}&to=${encodeURIComponent(new Date().toISOString())}`, { headers: { Cookie: cookie } });
      assert.ok(r.ok, "the latency report reads"); return await r.json() as LatencyReport;
    };
    const poke = () => fetch(`${app.origin}/api/control/${room}`, { headers: { Cookie: cookie }, cache: "no-store" }).catch(() => undefined);
    const control = async (path: string, body: Record<string, unknown>) => {
      const r = await fetch(`${app.origin}/api/control/${room}/${path}`, { method: "POST", headers: { Cookie: cookie, Origin: app.origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { http: r.status, ...(await r.json().catch(() => ({}))) } as { http: number; status: string };
    };

    browser = await chromium.launch();
    const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage(); await tv.goto(app.origin + "/tv");
    const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(fac, room, app.secret, code, "Milestone 5 acceptance TV");
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
    await tv.evaluate(() => { (window as unknown as { __loaded: number }).__loaded = 1; });
    await tv.evaluate(watcher);
    const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
    const tally = async () => (await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").then(v => v ?? "")).replace(/\s+/g, " ").trim();
    const tallyN = async () => Number((await tally()).match(/\d+/)?.[0] ?? -1);
    const watch = async (sel: string) => tv.evaluate(s => { const a = (window as unknown as { __acc: Watch & { sel: string } }).__acc; const out = { ...a, jumps: a.jumps.slice() }; Object.assign(a, { sel: s, frames: 0, blank: 0, dim: 0, worst: 0, worstKey: "", worstDt: 0, steps: 0, jumps: [] }); return out as Watch; }, sel);

    const phones = await joinPhones(app.origin, 50, { prefix: "Wayfinder" });
    const scribe = new Phone(app.origin);
    await scribe.join(room, scribeName);
    await sql.query("update public.attendees set room_role='scribe' where engagement_id=$1 and name=$2", [room, scribeName]);
    assert.equal((await sql.query("select count(*)::int n from public.attendees where engagement_id=$1 and not deleted and name like 'Wayfinder %'", [room])).rows[0].n >= 50, true, "fifty phones in the room");

    // ---------- Shared checks ----------
    const goLive = async (session: string, ready: string) => {
      await press(fac, sql, room, "go_live", { session });
      await tv.locator(`.tv-layer:not(.is-leaving) ${ready}`).first().waitFor({ timeout: 15000 });
      await delay(900);
      await layer().evaluate(el => { (el as unknown as { __mark: number }).__mark = 1; });
    };
    const burst = async <T,>(list: Phone[], over: number, send: (p: Phone, i: number) => Promise<T>) =>
      Promise.all(list.map(async (p, i) => { await delay(Math.floor(rnd() * over)); return send(p, i); }));
    const accepted = (label: string, statuses: string[], want: number) => { assert.deepEqual([...new Set(statuses)], ["accepted"], `${label}: every answer accepted`); assert.equal(statuses.length, want, `${label}: ${want} answers sent`); };
    const everyone = ["Wayfinder 0", scribeName, speaker, "@example.org"];
    const frames = async (label: string, sel: string, minSteps = 40, ignore?: RegExp) => {
      const w = await watch(sel);
      assert.equal(w.blank, 0, `${label}: the TV never blanked`);
      assert.equal(w.dim, 0, `${label}: the TV never faded out`);
      assert.ok(w.steps > minSteps, `${label}: the TV drew frames while answers arrived (${w.steps} item frames)`);
      // A row that is below the bottom of the screen at both ends of its move (the lens wall's feed keeps its older rows there) is not on the screen.
      const seen = w.jumps.filter(j => !(ignore && ignore.test(String(j[0]))) && !(Number(j[5]) > 1100 && Number(j[6]) > 1100));
      assert.deepEqual(seen, [], `${label}: nothing on the screen jumped (largest step ${Math.round(w.worst)} px on ${w.worstKey})`);
      assert.ok(await layer().evaluate(el => (el as unknown as { __mark?: number }).__mark === 1), `${label}: the TV animated in place, never drawing the view again`);
      assert.ok(await tv.evaluate(() => (window as unknown as { __loaded?: number }).__loaded === 1), `${label}: the TV page never reloaded`);
      const text = await tv.locator("body").innerText();
      for (const secret of everyone) assert.ok(!text.includes(secret), `${label}: no name on the TV (${secret})`);
      return w;
    };
    const logged = async (label: string, session: string, from: string, sends: number, w: Watch) => {
      const r = await report(from), mine = r.sessions.find(s => s.id === session);
      assert.ok(mine, `${label}: the latency log has the session`);
      assert.equal(mine!.measured, sends, `${label}: every answer reached the TV and was logged`);
      const v = verdict(mine!), share = mine!.measured ? Math.floor(mine!.under_second / mine!.measured * 1000) / 10 : 0;
      table.push(`${label.padEnd(40)} ${String(mine!.under_second).padStart(3)} of ${String(mine!.measured).padEnd(3)} under 1 s (${share}%), 95th ${mine!.p95} ms, largest step ${Math.round(w.worst)} px over ${w.steps} item frames`);
      assert.ok(v.met, `${label}: 95 of 100 under one second on loopback: ${v.label}`);
    };
    const tvClusters = async () => (await layer().locator(".lens-cluster:not(.is-going)").evaluateAll(els => els.map(e => `${e.querySelector(".lens-label")!.textContent!.trim()}:${e.querySelector(".lens-count")!.textContent}`))).sort();
    const serverClusters = async () => ((await results()).groups as { label: string; count: number }[]).map(x => `${x.label}:${x.count}`).sort();
    const sameClusters = async () => { const g = await serverClusters(); return g.length > 0 && JSON.stringify(await tvClusters()) === JSON.stringify(g); };
    const jarOf = (p: Phone) => (p as unknown as { jar: Map<string, string> }).jar;
    const openAs = async (p: Phone, width: number, height: number) => {
      const context = await browser!.newContext({ viewport: { width, height } });
      await context.addCookies([...jarOf(p)].map(([name, value]) => ({ name, value, url: app.origin })));
      return { context, page: await context.newPage() };
    };
    const openFacilitator = async (who: typeof fac, path: string) => {
      const context = await browser!.newContext({ viewport: { width: 1440, height: 1100 } });
      await context.addCookies(who.cookies(app.origin));
      const page = await context.newPage(); await page.goto(`${app.origin}${path}`);
      return { context, page };
    };

    // ---------- The lens wall, 50 phones ----------
    const lens1 = await mk("lens", "Five Lenses: Congregation", "Describe the 10-year Future for this lens, as if it is true today", { lens: 1 }, { sends: 3, chars: 280, part: "Day 1" });
    await step("Lens wall, 50 phones with AI slow: every sentence is on the TV under one second, clusters drift without jumping, the numbers are the server's", async () => {
      await goLive(lens1, '[data-board="lens"]');
      fake({ delayMs: 2500 });
      await watch(".lens-cluster, .lens-ghost");
      const from = new Date(Date.now() - 500).toISOString();
      const statuses = await burst(phones, 6000, (p, i) => p.sendValue(room, lens1, undefined, `${lensLines[i % 5]} (${i + 1})`));
      accepted("lens wall", statuses, 50);
      fake({});
      await delay(6000);
      const final = await results();
      await until(async () => (await tallyN()) === final.total, "the TV count matches the server", 8000);
      await until(sameClusters, "the TV's clusters are the server's", 10000);
      const w = await frames("lens wall", ".lens-cluster, .lens-ghost", 10);
      await logged("Lens wall (50 phones)", lens1, from, 50, w);
      await shot(tv, "tv-lens-wall");
    });

    // ---------- The scribe console, while the lens wall is live ----------
    const quoteWords = "Leaders grow here and we lead here with joy.";
    const cards: [string, string, Record<string, string>][] = [
      ["Decision", "A few deep partnerships with the city, not many shallow ones.", { "scr-why": "The room chose depth" }],
      ["Tension", "Leaders grow here but who leads the partnerships with the city?", { "scr-view1": "Grow our own leaders", "scr-view2": "Bring leaders in" }],
      ["Action", "Call the school about the partnership.", { "scr-owner": "Dana", "scr-date": "Friday" }],
      ["Question", "Who owns the family welcome every Sunday?", {}],
      ["Mitigation", "Train two backup volunteers for the welcome team.", { "scr-risk": "Volunteers burn out" }],
      // Last, so it is the newest card and sits at the top of the facilitator's feed.
      ["Quote", quoteWords, { "scr-who": speaker }],
    ];
    await step("Scribe console while the lens wall is live: six tagged cards and an easel photo, the speaker kept for the record and shown nowhere, the TV undisturbed", async () => {
      await watch(".lens-cluster, .lens-ghost");
      const { context, page } = await openAs(scribe, 1440, 900);
      await page.goto(`${app.origin}/room/${room}`);
      await page.locator("[data-testid=scribe-console]").waitFor({ timeout: 20000 });
      await page.locator(".scr-head b", { hasText: "Five Lenses: Congregation" }).waitFor({ timeout: 10000 });
      assert.match(await page.locator(".scr-attach").innerText(), /Attaches to Five Lenses: Congregation/);
      for (const [kind, text, extra] of cards) {
        await page.locator(".scr-tag", { hasText: kind }).click();
        await page.fill("#scr-text", text);
        for (const [id, value] of Object.entries(extra)) await page.fill(`#${id}`, value);
        await page.locator("#scr-text").press("Enter");
      }
      await until(async () => (await page.locator("[data-testid=scribe-cards] .scr-card").count()) === 6, "six cards on the console");
      await until(async () => (await sql.query("select count(*)::int n from private.scribe_cards where engagement_id=$1 and not deleted", [room])).rows[0].n === 6, "six cards stored", 10000);
      const stored = (await sql.query("select kind,speaker from private.scribe_cards where engagement_id=$1 and not deleted order by seq", [room])).rows;
      assert.deepEqual(stored.map(r => r.kind), ["decision", "tension", "action", "question", "mitigation", "quote"]);
      assert.equal(stored[5].speaker, speaker, "the speaker is kept for the record");
      await page.locator("input[aria-label='Choose files to upload']").setInputFiles({ name: "easel-1.png", mimeType: "image/png", buffer: easelPng() });
      const img = page.locator("[data-testid=scribe-files] img").first();
      await img.waitFor({ timeout: 15000 });
      await until(async () => await img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0), "the photo loads");
      const file = (await sql.query("select kind,content_type,uploaded_at,storage_path from private.scribe_files where engagement_id=$1 and not deleted", [room])).rows[0];
      assert.equal(file.kind, "photo"); assert.ok(file.uploaded_at, "the photo reached the private bucket");
      assert.equal((await sql.query("select public from storage.buckets where id='scribe'")).rows[0].public, false, "and the bucket is private");
      assert.ok(!(await page.locator("body").innerText()).includes(speaker), "the speaker is not on the scribe's own console");
      assert.match(await page.locator("[data-testid=scribe-cards]").innerText(), /Speaker kept for the record/);
      await shot(page, "scribe-console");
      await context.close();
      const w = await frames("the lens wall while the scribe captures", ".lens-cluster, .lens-ghost", 40);
      assert.equal(await sameClusters(), true, "and the TV still shows the server's clusters");
      table.push(`Scribe console (6 cards, 1 photo)          lens wall undisturbed: largest step ${Math.round(w.worst)} px over ${w.steps} item frames, no card words or speaker on the TV`);
      const text = await tv.locator("body").innerText();
      for (const [, words] of cards) assert.ok(!text.includes(words.slice(0, 20)), "no card words reach the TV");
    });

    // ---------- Promote a quote over the live step, then take it down ----------
    await step("Promote a quote over the live lens wall: anonymous on the TV, 50 more sentences land underneath under one second, Take down leaves the step exactly as it was", async () => {
      const { context, page: panel } = await openFacilitator(fac, `/control/${room}`);
      const feed = panel.locator("[data-testid=scribe-feed]");
      await feed.locator(".scr-card").first().waitFor({ timeout: 15000 });
      await feed.locator("img").first().waitFor({ timeout: 15000 });
      assert.ok(!(await feed.innerText()).includes(speaker), "the feed shows no speaker");
      await panel.locator("[data-testid=scribe-feed] .scr-card", { hasText: quoteWords.slice(0, 24) }).getByRole("button", { name: "Promote to TV" }).click();
      const spot = tv.locator(".pq-spot.is-on");
      await spot.waitFor({ timeout: 5000 });
      assert.equal((await spot.locator(".pq-text").innerText()).replace(/\s+/g, " ").trim(), `“${quoteWords}”`);
      const html = await tv.content();
      for (const secret of [speaker, scribeName]) assert.ok(!html.includes(secret), `the TV page never carries ${secret}`);
      await shot(tv, "tv-promoted-quote");
      await shot(panel, "control-feed-promoted");
      await context.close();
      // More phones answer on the step underneath, with no control surface open (the room-wide lock).
      const clustersBefore = await serverClusters(), totalBefore = (await results()).total;
      await watch(".lens-cluster, .lens-ghost");
      const from = new Date(Date.now() - 500).toISOString();
      const statuses = await burst(phones, 6000, (p, i) => p.sendValue(room, lens1, undefined, `${lensLines[(i + 2) % 5]} (more ${i + 1})`));
      accepted("lens wall under the quote", statuses, 50);
      await delay(3000);
      const final = await results();
      assert.equal(final.total, totalBefore + 50, "every answer is stored");
      await until(async () => (await tallyN()) === final.total, "the TV count under the quote is the server's", 8000);
      await until(sameClusters, "the clusters under the quote are the server's", 10000);
      assert.equal(await spot.count(), 1, "the quote is still up");
      const w = await frames("lens wall under a promoted quote", ".lens-cluster, .lens-ghost", 40);
      await logged("Lens wall under a promoted quote", lens1, from, 50, w);
      const boardBefore = await layer().locator(".lens-board, [data-board=lens]").first().innerText();
      assert.notDeepEqual(clustersBefore, await serverClusters(), "the clusters moved while the quote was up");
      const down = await control("quote", { action: "take_down" });
      assert.equal(down.http, 200, JSON.stringify(down));
      await until(async () => (await tv.locator(".pq-spot").count()) === 0, "the quote comes off", 5000);
      await delay(1200);
      assert.equal(await tallyN(), final.total, "no answer was lost taking it down");
      assert.equal(await sameClusters(), true, "the step is exactly as the server has it");
      assert.equal(await layer().locator(".lens-board, [data-board=lens]").first().innerText(), boardBefore, "and as it was under the quote");
      await frames("taking the quote down", ".lens-cluster, .lens-ghost", 10);
      await shot(tv, "tv-after-take-down");
    });

    // ---------- Close Day 1: the overnight draft ----------
    const seedOutcomes = async () => {
      for (const [i, o] of outcomes.entries()) {
        const id = randomUUID();
        await sql.query("insert into private.vision_outcomes(id,engagement_id,title,status,position) values($1,$2,$3,'provisional',$4)", [id, room, o.name, i]);
        for (const [j, text] of o.bullets.entries()) await sql.query("insert into private.outcome_indicators(id,engagement_id,outcome_id,text,position) values($1,$2,$3,$4,$5)", [randomUUID(), room, id, text, j]);
      }
    };
    await seedOutcomes();
    const roundFor = async () => (await sql.query("select status, extract(epoch from (coalesce(ready_at,now()) - day_closed_at))/60 as m from private.overnight_rounds where engagement_id=$1 and not deleted order by day_closed_at desc limit 1", [room])).rows[0] as { status: string; m: string } | undefined;
    await step("Close Day 1 starts the overnight draft: ready well inside 30 minutes, nothing from it on the TV or a phone", async () => {
      await press(fac, sql, room, "close_part", { part: "Day 1" });
      await until(async () => (await roundFor())?.status, "a round opens", 10000);
      await until(async () => { await poke(); return (await roundFor())?.status === "ready"; }, "the draft is ready", 60000);
      const r = (await roundFor())!;
      assert.ok(Number(r.m) < 30, `ready in ${Number(r.m).toFixed(2)} minutes`);
      const run = (await sql.query("select status, prompt_version, model from private.ai_runs where engagement_id=$1 and job='overnight_draft' and not deleted order by created_at desc limit 1", [room])).rows[0];
      assert.equal(run.status, "ok"); assert.match(run.prompt_version, /^overnight-draft@\d+$/);
      table.push(`Overnight drafts (OVN-01)                 ready ${(Number(r.m) * 60).toFixed(1)} s after Day 1 closed (gate: 30 minutes), run ${run.prompt_version}`);
      const phoneText = await (await phones[3].call(`/api/live/${room}?surface=phone`, { cache: "no-store" })).text(), tvText = await tv.locator("body").innerText();
      for (const word of [...outcomes.map(o => o.name), "Leaders grow here and lead", "Drafts ready"]) {
        assert.ok(!tvText.includes(word), `TV: ${word}`); assert.ok(!phoneText.includes(word), `phone: ${word}`);
      }
      for (const url of [`/api/overnight/${room}`, `/api/overnight/${room}?published=1`]) assert.ok([401, 403].includes((await phones[3].call(url)).status), `a phone cannot read ${url}`);
    });

    // ---------- The review: two facilitators, sources, edit, restore, publish ----------
    const review = `/control/${room}/review`;
    await step("Review (OVN-02): every sentence is linked to its sources, one outcome is locked to the facilitator editing it, Restore the room's words is one action, every version is kept", async () => {
      const lead = await openFacilitator(fac, review), other = await openFacilitator(co, review);
      await lead.page.locator("[data-testid=ovn-row]").first().waitFor({ timeout: 20000 });
      assert.equal(await lead.page.locator("[data-testid=ovn-row]").count(), 3, "three outcomes");
      assert.equal(await lead.page.locator("[data-testid=ovn-thin]").count(), 1, "the outcome with no bullets is flagged thin");
      const unsourced = (await sql.query(`select count(*)::int n from private.draft_bullets b where b.engagement_id=$1 and not b.deleted
        and not exists (select 1 from private.draft_sources s where s.bullet_id=b.id and not s.deleted)`, [room])).rows[0].n;
      const bullets = (await sql.query("select count(*)::int n from private.draft_bullets where engagement_id=$1 and not deleted", [room])).rows[0].n;
      assert.ok(bullets >= 4, `${bullets} drafted bullets`);
      assert.equal(unsourced, 0, "every drafted sentence is linked to at least one source");
      await lead.page.locator("[data-testid=ovn-row]", { hasText: outcomes[0].name }).click();
      await lead.page.locator("[data-testid=ovn-outcome]").waitFor();
      await lead.page.locator("[data-testid=ovn-bullet]").first().click();
      await lead.page.locator("[data-testid=ovn-source]").first().waitFor();
      assert.ok(await lead.page.locator("[data-testid=ovn-voices]").count() > 0, "the voices not to lose stand apart");
      assert.ok(await lead.page.locator("[data-testid=ovn-tensions]").count() > 0, "and so do the tensions the room named");
      assert.ok((await lead.page.locator("body").innerText()).includes(speaker), "the speaker shows on the review screen, to facilitators only");
      await shot(lead.page, "review-outcome");
      await lead.page.getByRole("button", { name: "Edit" }).click();
      await lead.page.locator(".ovr-edit textarea").waitFor();
      await other.page.locator("[data-testid=ovn-row]", { hasText: outcomes[0].name }).click();
      await other.page.locator("[data-testid=ovn-locked]").waitFor({ timeout: 15000 });
      assert.match(await other.page.locator("[data-testid=ovn-locked]").innerText(), /is editing this outcome/);
      await shot(other.page, "review-locked");
      await lead.page.locator(".ovr-edit textarea").fill("Leaders are raised, trained and sent from our own people.");
      await lead.page.getByRole("button", { name: "Save the bullet" }).click();
      await until(async () => (await sql.query("select count(*)::int c from private.draft_versions where engagement_id=$1", [room])).rows[0].c > 1, "a new version is kept");
      await lead.page.locator("[data-testid=ovn-bullet]").first().click();
      const restore = lead.page.getByRole("button", { name: /Restore the room.s words/ });
      await until(async () => restore.isEnabled(), "restore is offered");
      await restore.click();
      await until(async () => (await lead.page.locator("[data-testid=ovn-bullet]").first().innerText()).toLowerCase().includes("leaders grow here and lead here"), "the room's words are back");
      assert.ok((await sql.query("select count(*)::int c from private.draft_versions where engagement_id=$1", [room])).rows[0].c >= 3, "start, edit and restore are all kept");
      await lead.context.close(); await other.context.close();
    });
    await step("Publish (OVN-03): only the lead publishes, a co-facilitator is refused, and publishing is not a TV event", async () => {
      const denied = await co.client.rpc("overnight_publish", { p_engagement: room, p_id: randomUUID() });
      assert.notEqual((denied.data as { status: string } | null)?.status, "ok", `a co-facilitator cannot publish: ${JSON.stringify(denied.data ?? denied.error)}`);
      assert.equal((await sql.query("select count(*)::int c from private.overnight_publications where engagement_id=$1 and withdrawn_at is null", [room])).rows[0].c, 0, "nothing is published");
      const state = await fac.client.rpc("overnight_state", { p_engagement: room });
      for (const draft of (state.data.outcomes as { id: string; revision: number; thin: boolean }[])) {
        let revision = draft.revision;
        if (draft.thin) { await fac.client.rpc("overnight_ack_thin", { p_engagement: room, p_outcome: draft.id, p_value: true }); revision = ((await fac.client.rpc("overnight_state", { p_engagement: room })).data.outcomes as { id: string; revision: number }[]).find(o => o.id === draft.id)!.revision; }
        const accepted = await fac.client.rpc("overnight_accept", { p_engagement: room, p_outcome: draft.id, p_revision: revision });
        assert.ok(["ok", "unchanged"].includes(accepted.data?.status), JSON.stringify(accepted.data));
      }
      const lead = await openFacilitator(fac, review);
      const nav = lead.page.locator(".ovr-nav button", { hasText: "Publish for Day 2" });
      await until(async () => nav.isEnabled(), "publish opens", 20000);
      await nav.click();
      await until(async () => lead.page.locator("[data-testid=ovn-publish-button]").isEnabled(), "the button is ready", 15000);
      await lead.page.locator("[data-testid=ovn-publish-button]").click();
      await lead.page.locator("[data-testid=ovn-published]").waitFor({ timeout: 15000 });
      await shot(lead.page, "review-published");
      await lead.context.close();
      assert.equal((await sql.query("select count(*)::int c from private.overnight_publications where engagement_id=$1 and withdrawn_at is null", [room])).rows[0].c, 1, "one publication");
      assert.equal((await tv.locator("body").innerText()).includes(outcomes[0].name), false, "publishing is not a TV event");
      assert.equal((await (await phones[3].call(`/api/live/${room}?surface=phone`, { cache: "no-store" })).text()).includes(outcomes[0].name), false, "and no phone is told");
    });

    // ---------- Day 2: the read-back ----------
    const tagLine = `Day 1 words ${tag}`;
    for (const [at, lines] of signedOff.entries()) {
      const lens = at + 1, summary = (await sql.query("insert into private.lens_summaries(engagement_id,lens) values($1,$2) returning id", [room, lens])).rows[0].id as string;
      const version = (await sql.query("insert into private.lens_summary_versions(engagement_id,summary_id,version,author,shown_at) values($1,$2,1,'facilitator',now()) returning id", [room, summary])).rows[0].id as string;
      for (const [p, text] of lines.entries()) {
        const sentence = (await sql.query("insert into private.lens_summary_sentences(engagement_id,version_id,position,text) values($1,$2,$3,$4) returning id", [room, version, p, text])).rows[0].id as string;
        const source = (await sql.query("insert into private.lens_sentences(engagement_id,lens,source,text) values($1,$2,'live',$3) returning id", [room, lens, `${tagLine} for line ${p + 1}`])).rows[0].id as string;
        await sql.query("insert into private.lens_summary_sources(summary_sentence_id,lens_sentence_id,engagement_id) values($1,$2,$3)", [sentence, source, room]);
      }
      await sql.query("update private.lens_summaries set state='signed_off',current_version_id=$2,signed_off_version_id=$2 where id=$1", [summary, version]);
    }
    const rb = await mk("read_back", "Confirm the 10-year Future and outcomes", "Did we hear you right?", { ai: true }, { sends: 60, chars: 280, part: "Day 2" });
    const info = async () => (await (await fetch(`${app.origin}/api/control/${room}/read-back`, { headers: { Cookie: cookie }, cache: "no-store" })).json()) as Info;
    const ctl = async (action: string, body: Record<string, unknown> = {}) => control("read-back", { id: randomUUID(), action, session: rb, ...body });
    const rbResults = async () => (await results()) as Results & { tally: { yes: number; change: number }; item: { version: number; lines: { text: string }[] } | null; index: number };
    const tvLines = async () => (await layer().locator(".lsm-line:not(.is-gone) .lsm-text").allInnerTexts()).map(l => l.replace(/\s+/g, " ").trim());
    let first = "";
    await step("Day 2 read-back, 50 phones: the item is on the TV, 100 phone answers reach it under one second, the tally has no leader colour, the numbers are the server's", async () => {
      await goLive(rb, "[data-read-back]");
      const one = await until(async () => { const i = await info(); return i.items?.length === 8 && i; }, "eight items", 10000);
      assert.deepEqual(one.items.map(i => i.kind), ["lens", "lens", "lens", "lens", "lens", "outcome", "outcome", "outcome"], "five lens items, then the three published outcomes");
      first = one.item!.version_id;
      assert.deepEqual(await tvLines(), signedOff[0], "the TV shows the server's lines");
      await watch(".lsm-line");
      const from = new Date(Date.now() - 1000).toISOString();
      const answers = await burst(phones, 2500, (p, i) => i < 40 ? p.sendValue(room, rb, { version: first, response: "yes" }, "Yes, that's us") : p.sendValue(room, rb, { version: first, response: "change" }, `Line ${i - 39} could say more about ${["children", "visitors", "volunteers", "prayer", "meals"][i % 5]}`));
      accepted("read-back answers", answers, 50);
      const missing = await burst(phones, 2500, (p, i) => p.sendValue(room, rb, { version: first, response: "missing" }, `Missing ${tag} idea ${i + 1}: neighbours at the school gate`));
      accepted("read-back missing answers", missing, 50);
      await delay(3500);
      assert.deepEqual((await rbResults()).tally, { yes: 40, change: 10 }, "the server's tally");
      await until(async () => (await layer().locator('[data-tally="yes"] dd').innerText()).trim() === "40" && (await layer().locator('[data-tally="change"] dd').innerText()).trim() === "10", "the TV tally is the server's", 6000);
      const fills = await layer().locator(".rbk-bar i").evaluateAll(els => els.map(e => getComputedStyle(e).backgroundColor));
      assert.equal(new Set(fills).size, 1, `both bars share one colour, no leader: ${fills.join(" | ")}`);
      await until(async () => (await layer().locator("[data-missing]:not(.is-out)").count()) >= 1, "a missing answer is shown", 6000);
      const shown = await layer().locator("[data-missing]:not(.is-out)").count();
      assert.ok(shown >= 1 && shown <= 6, `at most 6 anonymous missing answers (${shown})`);
      assert.equal((await layer().locator("[data-more-missing]").innerText()).trim(), `+ ${50 - shown} more on phones`);
      const w = await frames("read-back", ".lsm-line", 20);
      await logged("Day 2 read-back (50 answers + 50 missing)", rb, from, 100, w);
      await shot(tv, "tv-read-back-50-phones");
    });
    await step("Phones read the full text with its source sentences, and no scribe words, photo or speaker reach a phone", async () => {
      const read = await (await phones[0].call(`/api/live/${room}/read-back?session=${rb}`, { cache: "no-store" })).json() as { status: string; item: { lines: { text: string; sources: { text: string }[] }[] } };
      assert.equal(read.status, "ok");
      assert.deepEqual(read.item.lines.map(l => l.text), signedOff[0]);
      assert.ok(read.item.lines.every(l => l.sources.length > 0 && l.sources.every(s => s.text.includes(tag))), "every line carries the sentences it came from");
      for (const p of [phones[0], phones[7], phones[40]]) {
        const body = JSON.stringify(read) + await (await p.call(`/api/live/${room}/read-back?session=${rb}`, { cache: "no-store" })).text() + await (await p.call(`/api/live/${room}?surface=phone`, { cache: "no-store" })).text();
        for (const secret of [speaker, scribeName, ...cards.map(c => c[1].slice(0, 24))]) assert.ok(!body.includes(secret), `no ${secret} on a phone`);
      }
    });

    // ---------- A scribe correction folds in as a tracked change ----------
    let panel: Page | undefined, panelContext: BrowserContext | undefined;
    await step("A scribe correction goes to the queue with its reason, the facilitator accepts it, it folds in as a tracked change and the tally restarts at zero", async () => {
      ({ context: panelContext, page: panel } = await openFacilitator(fac, `/control/${room}`));
      const scribeView = await openAs(scribe, 1440, 1000);
      await scribeView.page.goto(`${app.origin}/room/${room}`);
      await scribeView.page.locator("[data-testid=correction-composer]").waitFor({ timeout: 20000 });
      const wording = "We pray for our neighbours by name.";
      await scribeView.page.selectOption("#scr-cr-line", "new");
      await scribeView.page.fill("#scr-cr-wording", wording);
      await scribeView.page.fill("#scr-cr-reason", "Said by two people at the table");
      await scribeView.page.locator("[data-testid=correction-send]").click();
      await panel.locator(`[data-correction][data-state="queued"]`).first().waitFor({ timeout: 15000 });
      assert.match(await panel.locator("[data-correction-reason]").first().innerText(), /two people at the table/, "the scribe's reason is on the control surface");
      assert.ok(!(await layer().innerText()).includes("two people at the table"), "and never on the TV");
      await shot(scribeView.page, "scribe-composer");
      await scribeView.context.close();
      await panel.locator("[data-correction]").first().scrollIntoViewIfNeeded();
      await shot(panel, "control-correction-queue");
      await watch(".lsm-line");
      await panel.locator("[data-accept]").first().click();
      await until(async () => (await rbResults()).item?.version === 2, "version 2 on the server", 10000);
      const s = await rbResults();
      assert.deepEqual(s.item!.lines.map(l => l.text), [...signedOff[0], wording], "every other line word for word, the new line added");
      assert.deepEqual(s.tally, { yes: 0, change: 0 }, "the tally restarts at zero");
      await until(async () => (await layer().locator('[data-tally="yes"] dd').innerText()).trim() === "0", "the TV tally restarted", 6000);
      await until(async () => (await layer().locator(".lsm-ins").count()) > 0, "inserted words are underlined", 6000);
      await shot(tv, "tv-tracked-change");
      await delay(2500);
      assert.deepEqual(await tvLines(), s.item!.lines.map(l => l.text), "once the struck words leave, the TV shows the server's lines");
      await frames("the correction folding in", ".lsm-line", 5);
      assert.equal((await sql.query("select count(*)::int n from private.ai_runs where session_id=$1 and job='fold_read_back' and not deleted", [rb])).rows[0].n, 0, "a correction in code needs no AI call");
      const folded = await info();
      assert.ok(!JSON.stringify(folded).includes(speaker), "no speaker in the read-back");
    });

    // ---------- Mark a decision on every item ----------
    await step("Mark a decision on every item: the facilitator settles each of the eight, the changed lens becomes a new signed-off version, and the draft Map shows the changed text", async () => {
      const all = (await info()).items;
      assert.equal(all.length, 8);
      for (const [n, item] of all.entries()) {
        if (n > 0) assert.equal((await ctl("show", { to: item.id })).status, "ok");
        await until(async () => (await info()).item?.id === item.id, `item ${n + 1} on show`, 8000);
        await until(async () => (await tvLines()).length > 0 || (await layer().locator(".rbk-empty, [data-empty]").count()) > 0 || n >= 7, `item ${n + 1} on the TV`, 8000).catch(() => undefined);
        const decided = await ctl("decide", { decision: n === 0 ? "Confirmed with changes" : "Confirmed", reasons: "" });
        assert.equal(decided.status, "ok", `item ${n + 1}: ${JSON.stringify(decided)}`);
        await until(async () => (await layer().locator("[data-settled-mark]").count()) > 0, `item ${n + 1} is marked settled on the TV`, 8000);
      }
      const after = await info();
      assert.equal(after.items.filter(i => i.state === "settled").length, 8, "all eight are settled");
      assert.equal((await sql.query("select count(*)::int n from private.decisions where engagement_id=$1 and subject='read_back' and not deleted", [room])).rows[0].n, 8, "eight decision records");
      const looking = await (await phones[0].call(`/api/live/${room}/read-back?session=${rb}`, { cache: "no-store" })).json() as { settled: { changed: boolean }[] };
      assert.equal(looking.settled.length, 8, "a phone can look back at all eight settled items");
      assert.equal(looking.settled.filter(s => s.changed).length, 1, "and sees which one changed");
      const v = (await sql.query("select v.author, v.note, v.id from private.lens_summaries s join private.lens_summary_versions v on v.id=s.signed_off_version_id where s.engagement_id=$1 and s.lens=1 and not s.deleted", [room])).rows[0];
      assert.equal(v.author, "read_back"); assert.match(String(v.note ?? ""), /Changed in the Day 2 confirm/);
      const map = JSON.stringify((await fac.client.rpc("map_draft_read", { p_engagement: room })).data);
      assert.ok(map.includes("We pray for our neighbours by name."), "the draft Map reads the changed text");
      assert.ok(map.includes(outcomes[0].name), "and the confirmed outcomes");
      await shot(tv, "tv-settled");
      await panel!.locator("[data-read-back-panel]").scrollIntoViewIfNeeded();
      await shot(panel!, "control-settled");
      await panelContext!.close();
    });

    // ---------- No speaker or scribe identity anywhere the room can see ----------
    await step("No speaker name or scribe identity reached the TV, a phone or the read-back", async () => {
      const text = await tv.locator("body").innerText(), html = await tv.content();
      for (const secret of [speaker, scribeName]) { assert.ok(!text.includes(secret) && !html.includes(secret), `the TV: ${secret}`); }
      const bodies = [JSON.stringify(await info()), JSON.stringify((await fac.client.rpc("live_snapshot", { p_engagement: room })).data)];
      for (const p of [phones[0], phones[25], phones[49]]) bodies.push(await (await p.call(`/api/live/${room}/read-back?session=${rb}`, { cache: "no-store" })).text(), await (await p.call(`/api/live/${room}?surface=phone`, { cache: "no-store" })).text());
      for (const body of bodies) for (const secret of [speaker, scribeName]) assert.ok(!body.includes(secret), `a read-back or room state carries ${secret}`);
      const ai = (await sql.query("select inputs::text as inputs from private.ai_runs where engagement_id=$1 and not deleted", [room])).rows as { inputs: string }[];
      assert.ok(ai.length >= 1 && ai.every(r => !r.inputs.includes(speaker) && !r.inputs.includes(scribeName) && !r.inputs.includes("@example.org")), "and no AI input carries a speaker, a scribe or an email");
      table.push(`Identity                                  no speaker or scribe name in the TV, ${bodies.length} phone and read-back payloads or ${ai.length} AI inputs`);
    });

    // ---------- Reset practice room ----------
    await step("Reset practice room clears milestone 5's cards, files and read-back items", async () => {
      await press(fac, sql, room, "nothing_live");
      const out = await fac.client.rpc("reset_practice_room"); assert.equal(out.error, null); assert.equal(out.data, true);
      const left = async (t: string) => (await sql.query(`select count(*)::int n from private.${t} where engagement_id=$1 and not deleted`, [room])).rows[0].n as number;
      for (const t of ["scribe_cards", "scribe_files", "read_back_boards", "read_back_items"]) assert.equal(await left(t), 0, `${t} is cleared`);
    });

    console.log(`\nMilestone 5 acceptance, 50 simulated phones on loopback:\n${table.map(l => `  ${l}`).join("\n")}`);
    console.log(`Milestone 5 live-screen acceptance kit: ${passed.length} checks passed.\n${passed.map(p => `  ${p}`).join("\n")}\nLoopback numbers prove the pipeline, not the venue; venue acceptance is the practice-room run.`);
  } catch (error) {
    console.error(app.output().slice(-3000));
    if (shots) for (const [i, page] of (browser?.contexts() ?? []).flatMap(c => c.pages()).entries()) await page.screenshot({ path: `${shots}/acceptance-m5-failure-${i}.png` }).catch(() => {});
    throw error;
  } finally {
    if (cleanup.length) await sql.query("update public.sessions set deleted=true where id=any($1::uuid[])", [cleanup]).catch(() => {});
    await sql.query("update private.overnight_publications set withdrawn_at=now() where engagement_id=$1 and withdrawn_at is null", [room]).catch(() => {});
    if (before) await sql.query("update public.engagements set settings=$2 where id=$1", [room, before.settings]).catch(() => {});
    await browser?.close(); app.stop(); await sql.end().catch(() => {}); rmSync(controlDir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exit(1); });
