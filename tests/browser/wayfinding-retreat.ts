// Milestone 4, step 8: the Riverside retreat end to end (`npm run test:wayfinding`). An engagement starts from
// the Wayfinding template, the room rehearses and clears its test answers, a TV is paired and eight phones
// sign in by email code. Then the kit runs the pre-call through to the draft Clearway Map in order, with the
// TV, the phones and the records checked at every step: the seeded lens sentences hidden until each lens
// opens, the lens wall, the lens summaries signed off, candidates renamed and marked as provisional Vision
// Outcomes, outcome bullets, confirm, the pre-mortem with a mitigation, CORE goals, the team taking the
// remote for commander's intent, Affirm together and the draft Map. Last, the day-and-a-half template's
// follow-up block runs through a follow-up link and code. AI is the scripted stand-in, never the API.
// KIT_SHOTS=<folder> saves each screen. Local only: no real email, Team Hub or CORE. There is no Publish to CORE step.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

const controlDir = join(tmpdir(), `clearway-way-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
writeFileSync(controlFile, "{}");
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "250", ANTHROPIC_API_KEY: "" });

const wayfinding = "c1ea0000-0000-4000-8000-000000000002", halfDay = "c1ea0000-0000-4000-8000-000000000003";
const people = ["Ruth", "Ben", "Grace", "Priya", "Marcus", "Dana", "Ellis", "Noor"];
const candidateNames = ["Reaching new people", "Raising leaders from within", "Welcoming every first visit", "A church that serves the city", "Families at the center", "Healthy staff and teams"];
const reasons = ["Volunteers burn out and quit", "Budget runs short mid year", "Staff turnover stalls the plan", "Leaders lose interest after launch", "Nobody owns the follow up", "The building project delays everything", "Families drift to online only", "Prayer fades from our meetings"];

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(900); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { const t0 = Date.now(); await run(); passed.push(`${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    const room = await engagement(sql, people);
    await sql.query("update public.engagements set title='Riverside Wayfinding',base_year=2026,settings=settings||'{\"ai_enabled\":true}' where id=$1", [room.id]);
    const fac = await facilitator(env, sql, room.id);
    const origin = { Origin: app.origin };
    const state = async () => (await sql.query("select live_session_id,remote_holder_id,team_led_block_id,results from public.room_states where engagement_id=$1", [room.id])).rows[0];
    const results = async () => (await state()).results;
    const rpc = async (name: string, args: Record<string, unknown>) => { const { data, error } = await fac.client.rpc(name, { p_engagement: room.id, ...args }); assert.equal(error, null); return data as { status: string }; };
    const live = async () => (await state()).live_session_id as string | null;
    const control = async (name: string, action: string, p: Record<string, unknown> = {}, from?: string) => {
      const data = await rpc(name, { p_id: randomUUID(), p_action: action, p: { from: from ?? await live(), ...p } });
      assert.ok(["ok", "unchanged"].includes(data.status), `${name} ${action}: ${JSON.stringify(data)}`); return data;
    };

    // ---------- Start from the template ----------
    const start = new Date(Date.now() - 3600000).toISOString();
    await step("Start from the Wayfinding template: 40 sessions, the seeding step open, no Publish to CORE", async () => {
      const { data, error } = await fac.client.rpc("template_write", { p_action: "apply", p_input: { template: wayfinding, engagement: room.id, start } });
      assert.equal(error, null); assert.equal(data.status, "ok", JSON.stringify(data)); assert.equal(data.count, 40);
      const rows = (await sql.query("select title from public.sessions where engagement_id=$1 and not deleted", [room.id])).rows;
      assert.equal(rows.length, 40); assert.ok(rows.every(r => !/publish to core/i.test(r.title)));
      // The pre-call seeding step is open while the kit runs, whatever the clock says.
      await sql.query("update public.sessions set opens_at=now()-interval '1 hour',closes_at=now()+interval '2 days' where engagement_id=$1 and title='Seeding the Five Lenses'", [room.id]);
    });
    const id = async (title: string, nth = 0) => (await sql.query("select id from public.sessions where engagement_id=$1 and title=$2 and not deleted order by position offset $3 limit 1", [room.id, title, nth])).rows[0].id as string;
    const lensIds = (await sql.query("select id,title from public.sessions where engagement_id=$1 and interaction='lens' and mode='live' and not deleted order by position", [room.id])).rows as { id: string; title: string }[];
    assert.equal(lensIds.length, 5, "five lens sessions");
    assert.ok(lensIds.every(l => /^Five Lenses: \S/.test(l.title)), "named after the lenses");

    browser = await chromium.launch();
    const facContext = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
    await facContext.addCookies(fac.cookies(app.origin));
    const controlPage = await facContext.newPage(); await controlPage.goto(`${app.origin}/control/${room.id}`);
    await controlPage.locator(".ctl-app").waitFor({ timeout: 15000 });
    const poke = () => fetch(`${app.origin}/api/control/${room.id}`, { headers: { Cookie: fac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ") }, cache: "no-store" }).catch(() => undefined);

    // ---------- The TV and eight phones ----------
    const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvContext.newPage(); await tv.goto(app.origin + "/tv");
    const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(fac, room.id, app.secret, code, "Riverside TV");
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
    await tv.evaluate(() => { (window as unknown as { __way: number }).__way = 1; });
    const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
    const tvText = async () => (await tv.locator("body").innerText());
    const tally = async () => (await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").then(v => v ?? "")).replace(/\s+/g, " ").trim();
    const phones: { ctx: BrowserContext; page: Page; person: (typeof room.attendees)[number] }[] = [];
    await step("Eight phones sign in by email code", async () => {
      for (const person of room.attendees) {
        const ctx = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const page = await ctx.newPage(); await page.goto(`${app.origin}/room/${room.id}`);
        const before = mail.count;
        await page.fill("#room-email", person.email); await page.getByRole("button", { name: "Send me a sign-in code" }).click();
        await page.fill("#room-code", await mail.code(person.email, before)); await page.getByRole("button", { name: "Sign in" }).click();
        await page.locator(".ph-app").waitFor({ timeout: 15000 });
        phones.push({ ctx, page, person });
      }
      assert.equal(phones.length, 8);
    });
    const post = async (i: number, path: string, data: unknown) => {
      const r = await phones[i].ctx.request.post(`${app.origin}${path}`, { headers: origin, data });
      return (await r.json().catch(() => ({ status: `http_${r.status()}` }))) as { status: string };
    };
    const answer = async (i: number, session: string, text: string, value?: unknown) =>
      (await post(i, `/api/live/${room.id}`, { id: randomUUID(), session, revision: 0, action: "submit", text, value, sentAt: new Date().toISOString(), uncertaintyMs: 5000 })).status;
    const everyone = async (session: string, text: (i: number) => string, value?: (i: number) => unknown) => {
      const out = await Promise.all(phones.map((_, i) => answer(i, session, text(i), value?.(i))));
      assert.deepEqual([...new Set(out)], ["accepted"], `every answer accepted: ${out.join(",")}`);
    };
    const goLive = async (session: string, ready: string) => {
      await press(fac, sql, room.id, "go_live", { session });
      await layer().locator(ready).first().waitFor({ timeout: 15000 });
      await delay(700);
    };
    const seeds = ["We welcome every stranger by name", "Our neighbours eat at our table every week", "Leaders raise up the next leaders", "Every ministry has a clear owner", "We learn together and share what we learn"];

    // ---------- The rehearsal ----------
    await step("Rehearse and Clear test answers: a rehearsal answer is marked as a test and then cleared, and real answers are left alone", async () => {
      const celebrate = await id("Celebrations: one word");
      assert.equal((await rpc("rehearsal_control", { p_id: randomUUID(), p_action: "start" })).status, "ok");
      await press(fac, sql, room.id, "go_live", { session: celebrate });
      assert.equal(await answer(0, celebrate, "rehearsal"), "accepted");
      assert.equal((await sql.query("select count(*)::int n from public.submissions where session_id=$1 and not deleted and test", [celebrate])).rows[0].n, 1, "the rehearsal answer is marked as a test");
      assert.equal((await rpc("rehearsal_control", { p_id: randomUUID(), p_action: "end" })).status, "ok");
      assert.equal(await answer(1, celebrate, "real"), "accepted");
      await press(fac, sql, room.id, "nothing_live");
      const cleared = await rpc("rehearsal_control", { p_id: randomUUID(), p_action: "clear" });
      assert.equal(cleared.status, "ok", JSON.stringify(cleared));
      assert.equal((await sql.query("select count(*)::int n from public.submissions where session_id=$1 and not deleted and test", [celebrate])).rows[0].n, 0, "no test answer is left");
      assert.equal((await sql.query("select count(*)::int n from public.submissions where session_id=$1 and not deleted", [celebrate])).rows[0].n, 1, "the real answer stands");
      await sql.query("update public.submissions set deleted=true where session_id=$1", [celebrate]);
    });

    // ---------- Pre-call: lens seeding ----------
    const seeding = await id("Seeding the Five Lenses");
    await step("Pre-call seeding: eight phones write for their lens, the facilitator sees only counts, nothing is visible on the TV or in a phone's state", async () => {
      await everyone(seeding, i => `${seeds[i % 5]} SEEDTOKEN-L${(i % 5) + 1}-${i}`, i => ({ lens: (i % 5) + 1 }));
      const counts = await (await facContext.request.get(`${app.origin}/api/control/${room.id}/lens`)).text();
      assert.ok(!counts.includes("SEEDTOKEN"), "the facilitator's count carries no words");
      const lenses = JSON.parse(counts).lenses as { seeded: number; open: boolean }[];
      assert.equal(lenses.reduce((n, l) => n + l.seeded, 0), 8, "eight written");
      assert.ok(lenses.every(l => !l.open));
      const snapshot = await (await phones[3].ctx.request.get(`${app.origin}/api/live/${room.id}?surface=phone`)).text();
      assert.ok(!snapshot.includes("SEEDTOKEN") && !JSON.stringify(await results()).includes("SEEDTOKEN") && !(await tvText()).includes("SEEDTOKEN"), "no seeded sentence in a snapshot, the room state or on the TV");
      await shot(phones[0].page, "wayfinding-seeding-phone");
    });

    // ---------- Day 1: the Five Lenses ----------
    await step("Five Lenses: each lens reveals only its own seeds when it opens, then the wall takes eight sentences and the TV agrees with the server", async () => {
      for (const [n, lens] of lensIds.entries()) {
        await goLive(lens.id, '[data-board="lens"]');
        const r = JSON.stringify(await results());
        for (let other = 1; other <= 5; other++) assert.equal(r.includes(`SEEDTOKEN-L${other}-`), other === n + 1, `lens ${n + 1}: the seeds of lens ${other} ${other === n + 1 ? "show" : "stay hidden"}`);
        assert.ok((await tvText()).includes(`SEEDTOKEN-L${n + 1}-`) === (r.includes(`SEEDTOKEN-L${n + 1}-`)), "the TV shows what the server shows");
        if (n === 0) {
          await phones[0].page.locator("#lens-sentence").fill("Teenagers ask to be baptized in our building"); await phones[0].page.locator(".lens-form .ph-send").click();
        } else await answer(0, lens.id, `Young families find us online in lens ${n + 1}`);
        await Promise.all(phones.slice(1).map((_, i) => answer(i + 1, lens.id, `Neighbours join a group within weeks (${n + 1}-${i})`)));
        await until(async () => { const t = (await results()).total as number; return t >= 8 && (await tally()).startsWith(`${t} `); }, `lens ${n + 1}: the TV counts the server's sentences`, 10000);
        if (n === 0) await shot(tv, "wayfinding-lens-wall-tv");
      }
      await poke();
    });

    // ---------- The lens summaries ----------
    const summary = await id("The 10-year Future, by lens");
    await step("Lens summaries: AI drafts each lens straight to the TV, phones approve or suggest, and the facilitator signs off all five", async () => {
      await goLive(summary, "[data-lens-summary]");
      for (let n = 1; n <= 5; n++) {
        if (n > 1) await control("lens_summary_control", "show", { to: n });
        await until(async () => { await poke(); return (await results()).summary?.sentences?.length >= 3; }, `lens ${n}: AI drafted the summary`, 45000);
        await until(async () => (await layer().locator(".lsm-line:not(.is-gone)").count()) === (await results()).summary.sentences.length, `lens ${n}: the TV shows the draft`, 8000);
        const version = (await results()).summary.version_id as string;
        if (n === 1) await phones[0].page.getByRole("button", { name: "Approve", exact: true }).click(); else await answer(0, summary, "Approve", { version, response: "approve" });
        const out = await Promise.all(phones.slice(1).map((_, i) => i < 5 ? answer(i + 1, summary, "Approve", { version, response: "approve" }) : answer(i + 1, summary, "Guests are greeted by name before every service", { version, response: "suggest" })));
        assert.deepEqual([...new Set(out)], ["accepted"]);
        await until(async () => (await results()).tally.approve === 6 && (await results()).tally.suggest === 2, `lens ${n}: the tally is six and two`, 8000);
        await until(async () => (await layer().locator('[data-tally="approve"]').innerText()).trim() === "6", `lens ${n}: the TV tally is the server's`, 6000);
        assert.ok(!/Wayfinder|@example/.test(await tvText()), "no name on the TV");
        if (n === 1) await shot(tv, "wayfinding-lens-summary-tv");
        await control("lens_summary_control", "decide", { decision: "Signed off", reasons: "The room agrees it describes the 10-year Future." });
        await until(async () => (await layer().locator(".lsm-signed").count()) > 0, `lens ${n}: the TV shows the decision`, 6000);
      }
      const signed = (await sql.query("select count(*)::int n from private.lens_summaries where engagement_id=$1 and state='signed_off' and signed_off_version_id is not null", [room.id])).rows[0].n;
      assert.equal(signed, 5, "five lenses signed off, each with a decision record");
      assert.equal((await sql.query("select count(*)::int n from private.decisions where engagement_id=$1 and subject='lens_summary' and not deleted", [room.id])).rows[0].n, 5);
    });

    // ---------- Provisional Vision Outcomes ----------
    const candidates = await id("Provisional Vision Outcomes");
    const ctl = async (action: string, body: Record<string, unknown> = {}) => (await (await facContext.request.post(`${app.origin}/api/control/${room.id}/candidates`, { headers: origin,
      data: { id: randomUUID(), action, from: await live(), ...body } })).json()) as { status: string };
    const cstate = async () => (await (await facContext.request.get(`${app.origin}/api/control/${room.id}/candidates`)).json()) as { candidates: { id: string; name: string }[]; suggestions: { ids: string[]; kind: string; count: number }[] };
    await step("Cluster and rename: candidates reach the TV when sent, phones suggest a rename, one tap accepts, and the card changes in place", async () => {
      await goLive(candidates, ".tv-board");
      for (const name of candidateNames) assert.equal((await ctl("add", { name })).status, "ok");
      assert.equal(await layer().locator(".cd-card:not(.cd-ghost)").count(), 0, "in review the TV shows no card");
      assert.equal((await ctl("send")).status, "ok");
      await until(async () => (await layer().locator(".cd-card:not(.cd-ghost)").count()) === candidateNames.length, "the cards on the TV", 8000);
      const first = (await cstate()).candidates[0];
      const sent = await Promise.all([1, 2, 3].map(i => post(i, `/api/live/${room.id}/candidate`, { id: randomUUID(), session: candidates, kind: "rename", candidate: first.id, text: "Open and welcoming" })));
      assert.deepEqual([...new Set(sent.map(s => s.status))], ["accepted"]);
      await delay(1000);
      assert.ok(!(await tvText()).includes("Open and welcoming"), "a suggestion never reaches the TV");
      const group = (await cstate()).suggestions.find(g => g.kind === "rename")!;
      assert.equal(group.count, 3);
      assert.equal((await ctl("accept", { ids: group.ids })).status, "ok");
      await until(async () => (await layer().locator(`[data-cid="${first.id}"] .cd-title > span:not(.cd-out)`).innerText()) === "Open and welcoming", "the new name on the TV", 4000);
    });
    await step("Candidates: eight phones spend 100 points, the bars match the server, and Mark provisional writes five Vision Outcomes", async () => {
      const keys = (await cstate()).candidates.map(c => c.id);
      assert.equal((await ctl("open_points")).status, "ok");
      await layer().locator(".tv-bar").first().waitFor({ timeout: 8000 });
      await everyone(candidates, () => "", i => { const given = keys.map(() => 0); given[i % keys.length] = 60; given[(i + 1) % keys.length] = 40; return { points: Object.fromEntries(keys.map((k, j) => [k, given[j]])) }; });
      await until(async () => (await results()).people === 8, "eight people counted", 8000);
      const bars = (await results()).bars as { key: string; fraction: number }[];
      await until(async () => {
        const rows = await layer().locator(".tv-bar:not(.is-leaving)").evaluateAll(rs => rs.map(r => ({ key: (r as HTMLElement).dataset.key!, y: r.getBoundingClientRect().top, w: parseFloat((r.querySelector(".tv-bar-fill") as HTMLElement).style.width) || 0 })));
        const byY = rows.sort((a, b) => a.y - b.y);
        return byY.length === bars.length && byY.every((r, i) => r.key === bars[i].key && Math.abs(r.w - bars[i].fraction * 100) < 0.6);
      }, "the TV's bars are the server's", 8000);
      assert.equal((await ctl("mark", { reasons: "The room kept coming back to these." })).status, "ok");
      const outcomes = (await sql.query("select count(*)::int n from private.vision_outcomes where engagement_id=$1 and status='provisional' and not deleted and decision_id is not null", [room.id])).rows[0].n;
      assert.equal(outcomes, 5, "five provisional Vision Outcomes, each with a decision");
      await shot(tv, "wayfinding-candidates-tv");
    });
    const outcomes = (await sql.query("select id,title from private.vision_outcomes where engagement_id=$1 and status='provisional' and not deleted order by position", [room.id])).rows as { id: string; title: string }[];

    // ---------- Outcome bullets ----------
    await step("3-year Vision, first pass: bullets typed on a phone appear on the TV as they are typed, and eight added bullets are records", async () => {
      await goLive(await id("3-year Vision, first pass"), ".tv-oc");
      const text = "Every new family is known by name within a month";
      await phones[0].page.locator("#oc-bullet").waitFor({ timeout: 10000 });
      await phones[0].page.locator("#oc-bullet").pressSequentially(text.slice(0, 16), { delay: 70 });
      await until(async () => { const t = await layer().locator(".oc-bullet.is-typing").innerText().catch(() => ""); return t.length >= 8 && text.startsWith(t.trim()) ? t : null; }, "the first letters on the TV while typing", 4000);
      await phones[0].page.locator("#oc-bullet").pressSequentially(text.slice(16), { delay: 40 });
      await phones[0].page.getByRole("button", { name: "Add bullet" }).click();
      const session = (await live())!;
      const rest = await Promise.all(phones.slice(1).map((_, i) => answer(i + 1, session, `Our groups multiply and ${i} new leaders serve`, { outcome: outcomes[0].id })));
      assert.deepEqual([...new Set(rest)], ["accepted"]);
      await until(async () => (await sql.query("select count(*)::int n from private.outcome_indicators where outcome_id=$1 and not deleted", [outcomes[0].id])).rows[0].n >= 8, "every bullet is an indicator of the outcome", 8000);
      assert.equal(await layer().locator(".oc-bullet.is-typing").count(), 0, "nothing is left typing");
      await shot(tv, "wayfinding-bullets-tv");
    });

    // ---------- Day 2: confirm ----------
    await step("Confirm the Vision Outcomes: eight phones answer, the TV shows counts and no reasons, and the facilitator confirms four", async () => {
      await goLive(await id("Confirm the Vision Outcomes"), ".tv-oc");
      await everyone((await live())!, () => "x", i => ({ outcomes: Object.fromEntries(outcomes.map((o, k) => [o.id, i % 4 === 3 && k === 4 ? { c: "challenge", reason: "kitsecret reason" } : { c: "confirm" }])) }));
      await until(async () => (await results()).people === 8 && /^8 /.test(await tally()), "the TV counts eight", 8000);
      assert.ok(!(await tv.content()).includes("kitsecret"), "no reason reaches the TV");
      for (const o of outcomes.slice(0, 4)) await rpc("confirm_control", { p_id: randomUUID(), p_action: "decide", p: { outcome: o.id, kind: "confirm", reasons: "The room agreed." } });
      await until(async () => (await layer().locator(".oc-crow.is-decided").count()) === 4, "four decided rows on the TV", 6000);
      assert.equal((await sql.query("select count(*)::int n from private.vision_outcomes where engagement_id=$1 and status='confirmed' and not deleted", [room.id])).rows[0].n, 4, "four confirmed, inside four to six");
      await shot(tv, "wayfinding-confirm-tv");
    });
    const confirmed = (await sql.query("select id,title from private.vision_outcomes where engagement_id=$1 and status='confirmed' and not deleted order by position", [room.id])).rows as { id: string; title: string }[];

    // ---------- Pre-mortem ----------
    await step("Pre-mortem: eight reasons reach the TV, phones place them, and a mitigation shows under its reason", async () => {
      const pm = await id("Pre-mortem");
      await goLive(pm, ".gfs-plot");
      const sent = await Promise.all(reasons.map((text, i) => post(i, `/api/live/${room.id}/reason`, { id: randomUUID(), session: pm, text })));
      assert.deepEqual([...new Set(sent.map(s => s.status))], ["accepted"]);
      await until(async () => (await layer().locator(".gfs-leg").count()) >= 8, "the reasons in the TV's legend", 8000);
      const items = (await results()).items as { key: string; into?: string }[];
      const standing = items.filter(r => !r.into);
      await everyone(pm, () => "x", i => ({ places: Object.fromEntries(standing.map((r, k) => [r.key, [((i * 7 + k * 13) % 100) / 100, ((i * 11 + k * 17) % 100) / 100]])) }));
      await until(async () => /^8 /.test(await tally()), "the TV counts eight", 8000);
      await control("reasons_control", "mitigate", { item: standing[0].key, text: "Rotate volunteers every six months" });
      await until(async () => (await layer().locator(".gfs-mit").allInnerTexts()).some(t => t.includes("Rotate volunteers every six months")), "the mitigation on the TV", 6000);
      assert.ok((await sql.query("select count(*)::int n from private.risks where engagement_id=$1 and not deleted", [room.id])).rows[0].n >= 5, "the reasons are risks");
      await shot(tv, "wayfinding-premortem-tv");
    });

    // ---------- CORE goals ----------
    await step("1-year Outlook: goals reach the TV with their CORE letters, linked to the pre-mortem's risks, and a goal missing a letter stays flagged", async () => {
      const gs = await id("1-year Outlook");
      await goLive(gs, ".gl-board");
      await control("goals_control", "outcome", { to: confirmed[0].id });
      const form = await (await phones[0].ctx.request.get(`${app.origin}/api/live/${room.id}/goal?session=${gs}`)).json() as { status: string; people: { id: string }[]; season_ends: { date: string }[]; risks: { id: string }[] };
      assert.equal(form.status, "ok"); assert.ok(form.risks.length >= 5, "the pre-mortem risks can be linked");
      const out = await Promise.all(phones.map((_, i) => post(i, `/api/live/${room.id}/goal`, { id: randomUUID(), session: gs, fields: { title: `Goal ${i + 1}: ${["Welcome team", "Follow up call", "Small group launch", "Serve day"][i % 4]}`,
        ...(i % 2 ? { result: "Done and counted" } : {}), owner: { attendee: form.people[i % form.people.length].id }, ...(i % 4 ? { end_date: form.season_ends[i % 3].date } : {}), risks: [form.risks[i % form.risks.length].id] } })));
      assert.deepEqual([...new Set(out.map(s => s.status))], ["accepted"]);
      await until(async () => (await layer().locator(".gl-goal").count()) === 8, "every goal on the TV", 8000);
      const goals = ((await results()).goals ?? []) as { id: string; met: boolean }[];
      assert.equal(goals.length, 8);
      assert.ok(goals.some(g => !g.met) && (await layer().locator(".gl-goal.is-flagged").count()) > 0, "goals missing a letter are flagged");
      assert.ok(!/Wayfinder|@example/.test(await tvText()), "no email on the TV");
      for (const g of goals.slice(0, 3)) await control("goals_control", "clear", { goal: g.id, clear: true });
      await shot(tv, "wayfinding-goals-tv");
    });

    // ---------- The team takes the remote ----------
    await step("Handover and commander's intent: the remote goes to a participant and back, pairs fill four cards, and the TV shows lines as they are written", async () => {
      await goLive(await id("The team takes the remote"), ".tv-board, .tv-content, .tv-headline");
      const intent = await id("Commander's intent"), sign = await id("Affirm together");
      await goLive(intent, ".int-card");
      await control("handover_control", "give", { attendee: room.attendees[0].id });
      assert.equal((await state()).remote_holder_id, room.attendees[0].id, "the remote is with the team");
      assert.ok(!new RegExp(`\\b(${people.join("|")})\\b`).test(await layer().innerText()), "no name on the TV");
      const cards = (await sql.query("select c.id from private.intent_cards c join private.vision_outcomes o on o.id=c.outcome_id where c.engagement_id=$1 and not c.deleted order by o.position", [room.id])).rows.map(r => r.id as string);
      assert.equal(cards.length, 4, "one card for each confirmed outcome");
      for (const [i, card] of cards.entries()) await control("intent_control", "assign", { card, attendees: [room.attendees[i].id] });
      for (const [i, card] of cards.entries()) {
        const status = await post(i, `/api/live/${room.id}/intent`, { kind: "edit", card, op: "set", p: { field: "intent", text: `Neighbours know our names ${i}` } });
        assert.equal(status.status, "ok", JSON.stringify(status));
      }
      await until(async () => (await layer().locator(".int-line").allInnerTexts()).filter(t => t.includes("Neighbours know our names")).length >= 4, "the lines on the TV", 6000);
      await control("intent_control", "present", { card: cards[0] });
      await shot(tv, "wayfinding-intent-tv");
      await control("handover_control", "take_back");
      assert.equal((await state()).remote_holder_id, null, "the lead holds the remote again");
      await control("intent_control", "affirm_text", { session: sign });
      await goLive(sign, ".tv-board");
      await everyone(sign, () => "x", () => ({ strokes: ["M20 100L120 60L220 120"] }));
      await until(async () => (await layer().locator(".gfs-name").count()) === 8, "eight signatures on the TV", 8000);
      await shot(tv, "wayfinding-affirm-tv");
    });

    // ---------- The draft Clearway Map ----------
    await step("Draft Clearway Map: it assembles from the records, lists the signed-off lenses and the confirmed outcomes, and never reaches the room", async () => {
      await press(fac, sql, room.id, "nothing_live");
      const page = await facContext.newPage(); await page.goto(`${app.origin}/control/${room.id}/map`);
      await page.getByRole("heading", { name: "Draft Clearway Map" }).waitFor({ timeout: 15000 });
      const text = await page.locator(".map-doc").innerText();
      for (const o of confirmed) assert.ok(text.includes(o.title) || text.includes("Open and welcoming"), `the Map lists the outcome ${o.title}`);
      assert.ok(!text.includes("Not signed off yet"), "all five lenses are signed off");
      assert.ok(text.toLowerCase().includes("10-year future") && text.toLowerCase().includes("3-year vision") && text.toLowerCase().includes("1-year outlook"));
      // Key Issues lists the six most likely and most damaging risks; the mitigation shows when its risk is one of them.
      const shown = (await sql.query(`select count(*)::int n from (select r.id from private.risks r where r.engagement_id=$1 and not r.deleted and r.merged_into is null order by coalesce(r.likelihood,0)*coalesce(r.impact,0) desc,r.id limit 6) t
        join private.risk_mitigations m on m.risk_id=t.id and not m.deleted`, [room.id])).rows[0].n;
      assert.equal(text.includes("Rotate volunteers every six months"), shown > 0, "the mitigation is in Key Issues when its risk is in the six shown");
      assert.equal(await page.locator(".map-issues li").count() > 0, true, "Key Issues lists the pre-mortem risks");
      const md = await (await facContext.request.get(`${app.origin}/api/control/${room.id}/map?format=md`)).text();
      assert.ok(md.includes("## Page 1: Identity and direction") && md.includes("## Page 2: Action"), "the text download has both pages");
      assert.ok(!/publish to core/i.test(text + md), "no Publish to CORE");
      assert.ok(!/[–—]/.test(md), "no dashes in the export");
      await shot(page, "wayfinding-map");
      await page.close();
    });
    await step("The TV page never reloaded and showed no name through the whole retreat", async () => {
      assert.ok(await tv.evaluate(() => (window as unknown as { __way?: number }).__way === 1), "the TV page never reloaded");
    });

    // ---------- The day-and-a-half template's follow-up block ----------
    await step("Day-and-a-half template: the follow-up block runs by a link and code with no Clearway sign-in, and the remote never shows the lead's private views", async () => {
      const half = await engagement(sql, ["Ruth", "Ben"]);
      // The team's own facilitator signs in as an attendee, as a person in the room does.
      const lead = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const leadPage = await lead.newPage(); await leadPage.goto(`${app.origin}/room/${half.id}`);
      const before = mail.count;
      await leadPage.fill("#room-email", half.attendees[0].email); await leadPage.getByRole("button", { name: "Send me a sign-in code" }).click();
      await leadPage.fill("#room-code", await mail.code(half.attendees[0].email, before)); await leadPage.getByRole("button", { name: "Sign in" }).click();
      await leadPage.locator(".ph-app").waitFor({ timeout: 15000 });
      const f2 = await facilitator(env, sql, half.id);
      const { data, error } = await f2.client.rpc("template_write", { p_action: "apply", p_input: { template: halfDay, engagement: half.id, start } });
      assert.equal(error, null); assert.equal(data.status, "ok", JSON.stringify(data)); assert.equal(data.count, 41);
      const follow = (await sql.query("select id,title,interaction,team_led from public.sessions where engagement_id=$1 and part='Follow-up' and not deleted order by position", [half.id])).rows as { id: string; title: string; interaction: string; team_led: boolean }[];
      assert.ok(follow.length >= 5 && follow.every(s => s.team_led), "the follow-up is team-led");
      const ctx2 = await browser!.newContext({ viewport: { width: 1440, height: 1000 } });
      await ctx2.addCookies(f2.cookies(app.origin));
      await press(f2, sql, half.id, "go_live", { session: follow[0].id });
      const issued = await ctx2.request.post(`${app.origin}/api/control/${half.id}/followup`, { headers: origin, data: { action: "issue", attendee: half.attendees[0].id, sessions: follow.map(s => s.id),
        opens_at: new Date(Date.now() - 60000).toISOString(), closes_at: new Date(Date.now() + 2 * 3600000).toISOString() } });
      const out = await issued.json();
      if (out.status !== "ok") {
        const seen = (await sql.query("select (select count(*)::int from public.attendees where id=$2 and engagement_id=$1 and not deleted and verified_at is not null) as who, (select count(*)::int from public.sessions where id=any($3::uuid[]) and engagement_id=$1 and not deleted and mode='live') as live", [half.id, half.attendees[0].id, follow.map(s => s.id)])).rows[0];
        assert.fail(`the follow-up link was refused: ${JSON.stringify(out)} (attendee ok ${seen.who}, live sessions ${seen.live} of ${follow.length})`);
      }
      assert.match(out.code, /^[A-Z]{5} [0-9]{4}$/); assert.match(out.link, /\/f\/[A-Za-z0-9_-]{20,}$/);
      const visitor = await (await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
      await visitor.goto(out.link);
      await visitor.locator("#fu-code").fill(out.code); await visitor.getByRole("button", { name: "Enter" }).click();
      await visitor.getByRole("button", { name: "Take the remote" }).waitFor({ timeout: 8000 });
      await visitor.getByRole("button", { name: "Take the remote" }).click();
      await visitor.getByRole("button", { name: /^Next/ }).waitFor({ timeout: 8000 });
      const holder = (await sql.query("select remote_holder_id from public.room_states where engagement_id=$1", [half.id])).rows[0].remote_holder_id;
      assert.equal(holder, half.attendees[0].id, "the team facilitator holds the remote");
      await visitor.getByRole("button", { name: /^Next/ }).click();
      await until(async () => (await sql.query("select live_session_id from public.room_states where engagement_id=$1", [half.id])).rows[0].live_session_id === follow[1].id, "Next moved the room to the pre-mortem", 8000);
      const page = (await visitor.locator("body").innerText()).toLowerCase();
      assert.ok(!page.includes("alignment") || page.includes("never"), "no alignment signal on the team remote");
      await shot(visitor, "wayfinding-follow-up-remote");
      const revoked = await ctx2.request.post(`${app.origin}/api/control/${half.id}/followup`, { headers: origin, data: { action: "revoke" } });
      assert.equal((await revoked.json()).status, "ok");
      await until(async () => (await sql.query("select remote_holder_id from public.room_states where engagement_id=$1", [half.id])).rows[0].remote_holder_id === null, "revoking returns the remote", 8000);
      await ctx2.close(); await lead.close();
    });

    console.log(`Riverside Wayfinding retreat kit: ${passed.length} checks passed.\n${passed.map(p => `  ${p}`).join("\n")}`);
  } catch (error) {
    console.error(app.output().slice(-3000));
    if (process.env.KIT_SHOTS) for (const [i, page] of (browser?.contexts() ?? []).flatMap(c => c.pages()).entries()) await page.screenshot({ path: `${process.env.KIT_SHOTS}/wayfinding-failure-${i}.png` }).catch(() => {});
    throw error;
  } finally {
    await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); rmSync(controlDir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exit(1); });
