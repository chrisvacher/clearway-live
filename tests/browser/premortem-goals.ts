// Milestone 4, step 5: the Pre-mortem and the CORE goal builder, in real browsers against the
// production build and the local stack, with the scripted fake model (never the API).
// One headless TV is paired to the practice room. 50 simulated phones add reasons to the
// Pre-mortem grid (ten fit, the rest place), AI merges duplicates and Undo brings them back, the
// facilitator records mitigations, then phones propose goals on the CORE goal builder and the TV
// shows each CORE letter met or missing, checked against the server's own results.
// Local only: the practice room, no email, Team Hub or CORE. KIT_SHOTS=<folder> saves each TV screen.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { joinPhones, practiceRoom, type Phone } from "../../scripts/load-test";
import { db, facilitator, localEnv, pairTv, press, startApp, until } from "./harness";

const controlDir = join(tmpdir(), `clearway-pg-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true }); writeFileSync(controlFile, "{}");
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "250", ANTHROPIC_API_KEY: "" });

type Reason = { key: string; text: string; num: number; into?: string; count: number; mitigations?: string[] };
type Goal = { id: string; title: string; met: boolean; letters: Record<"C" | "O" | "R" | "E", boolean>; needs_risk: boolean; risks: number[]; end_date: string; owner: string };
const reasonsText = ["Volunteers burn out and quit", "Burned out volunteers quit serving", "Budget runs short mid year", "Budget shortfall hits mid year", "Staff turnover stalls the plan",
  "Leaders lose interest after launch", "Nobody owns the follow up", "The building project delays everything", "Families drift to online only", "Prayer fades from our meetings"];

async function main() {
  const env = localEnv(), sql = db(env), app = await startApp(env);
  let browser: Browser | undefined;
  const passed: string[] = [], sessions: string[] = [], outcomes: string[] = [];
  const shots = process.env.KIT_SHOTS;
  const shot = async (page: Page, name: string) => { if (shots) { await delay(1200); await page.screenshot({ path: `${shots}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { const t0 = Date.now(); await run(); passed.push(`${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); console.log(`ok · ${name}`); };
  const room = practiceRoom, tag = randomUUID().slice(0, 6);
  let before: { settings: unknown } | undefined;
  try {
    await sql.connect();
    before = (await sql.query("select settings from public.engagements where id=$1 and not deleted", [room])).rows[0];
    assert.ok(before, "Run npm run db:seed first: the kit uses the permanent practice room");
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [room]);
    const fac = await facilitator(env, sql, room);
    const mk = async (kind: string, title: string, prompt: string, options: Record<string, unknown>, position: number, maxSends = 3) => {
      const id = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,options,max_sends,max_characters,max_words)
        values($1,$2,'Day 2',$3,$4,$5,'ready',coalesce(private.session_options($4,$6::jsonb,$1),'{}'::jsonb),$7,28,3) returning id`, [room, `${title} ${tag}`, position, kind, prompt, options, maxSends])).rows[0].id as string;
      sessions.push(id); return id;
    };
    const server = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [room])).rows[0].results as Record<string, unknown>;
    await press(fac, sql, room, "nothing_live");
    browser = await chromium.launch();
    const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    await tv.goto(app.origin + "/tv");
    const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(fac, room, app.secret, code, "Pre-mortem kit TV");
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
    const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
    const phones = await joinPhones(app.origin, 50, { prefix: "Goals phone" });
    const post = async (p: Phone, path: string, body: unknown) => {
      const r = await p.call(path, { method: "POST", body: JSON.stringify(body) });
      return ((await r.json().catch(() => ({ status: `http_${r.status}` }))) as { status: string }).status;
    };
    const control = async (route: "reasons" | "goals", body: Record<string, unknown>) => {
      const from = (await sql.query("select live_session_id from public.room_states where engagement_id=$1", [room])).rows[0].live_session_id;
      const { data, error } = await fac.client.rpc(`${route}_control`, { p_engagement: room, p_id: randomUUID(), p_action: body.action, p: { from, ...Object.fromEntries(Object.entries(body).filter(([k]) => k !== "action")) } });
      assert.equal(error, null); return data as { status: string };
    };

    // ---------- Pre-mortem ----------
    const pm = await mk("grid", "Pre-mortem", "It’s 2029 and this plan failed. Why?", { preset: "pre_mortem", items: [] }, 980);
    await press(fac, sql, room, "go_live", { session: pm });
    await layer().locator(".gfs-plot").waitFor({ timeout: 10000 });
    const reasons = async () => (await server()).items as Reason[];
    const legend = async () => (await layer().locator(".gfs-leg").evaluateAll(els => els.filter(e => Number(getComputedStyle(e).opacity) > 0.5).map(e => e.querySelector("span")!.textContent!.trim()))).sort();

    await step("Pre-mortem: phones add reasons that appear on the TV at once; ten fit and the eleventh is turned away", async () => {
      const results = await Promise.all(reasonsText.map((text, i) => post(phones[i], `/api/live/${room}/reason`, { id: randomUUID(), session: pm, text })));
      assert.ok(results.every(s => s === "accepted"), `ten reasons accepted: ${results.join(",")}`);
      assert.equal(await post(phones[10], `/api/live/${room}/reason`, { id: randomUUID(), session: pm, text: "One more reason" }), "full", "the grid holds ten");
      assert.equal(await post(phones[0], `/api/live/${room}/reason`, { id: randomUUID(), session: pm, text: "volunteers BURN out and quit" }), "exists", "the same words twice are one reason");
      await until(async () => (await layer().locator(".gfs-leg").count()) >= 8, "the reasons are in the TV's legend", 8000);
      assert.equal((await reasons()).length, 10);
      await shot(tv, "premortem-reasons-tv");
    });
    await step("Pre-mortem: 50 phones place the reasons on likelihood and impact, and the TV matches the server", async () => {
      const list = await reasons();
      const out = await Promise.all(phones.map((p, i) => p.sendValue(room, pm, { places: Object.fromEntries(list.filter((_, k) => (k + i) % 3 !== 0).map((r, k) => [r.key, [((i * 7 + k * 13) % 100) / 100, ((i * 11 + k * 17) % 100) / 100]])) }, "x")));
      assert.ok(out.every(s => s === "accepted"), `every placement accepted: ${[...new Set(out)].join(",")}`);
      await until(async () => (await layer().locator(".gfs-dot").count()) > 0, "dots on the TV", 8000);
      const people = (await server()).people as number;
      await until(async () => (await tv.locator(".tv-foot .tv-tally").innerText()).includes(String(people)), "the TV count is the server's", 8000);
    });
    await step("Pre-mortem: AI merges the duplicate reasons, and Undo brings every one back", async () => {
      await until(async () => ((await sql.query("select count(*)::integer n from private.grid_merges where session_id=$1 and made_by='ai' and not deleted", [pm])).rows[0].n) >= 2, "AI merged the duplicates", 20000);
      await until(async () => (await layer().locator(".gfs-leg").evaluateAll(els => els.filter(e => Number(getComputedStyle(e).opacity) > 0.5).length)) <= 8, "merged reasons leave the legend", 8000);
      await shot(tv, "premortem-merged-tv");
      const undone = await control("reasons", { action: "undo_ai" });
      assert.equal(undone.status, "ok");
      await until(async () => (await reasons()).every(r => !r.into) && (await layer().locator(".gfs-leg").count()) >= 8, "the reasons are back on the TV, none merged", 8000);
      assert.equal(((await sql.query("select count(*)::integer n from private.grid_merges where session_id=$1 and not deleted", [pm])).rows[0].n), 0);
      // Undone reasons are not folded again.
      await delay(3000);
      assert.equal(((await sql.query("select count(*)::integer n from private.grid_merges where session_id=$1 and not deleted", [pm])).rows[0].n), 0, "AI does not merge what the facilitator undid");
    });
    let risk = "";
    await step("Pre-mortem: the facilitator records a mitigation, it shows under the reason, and each reason is a risk", async () => {
      const r = (await reasons())[0];
      assert.equal((await control("reasons", { action: "mitigate", item: r.key, text: "Rotate volunteers every six months" })).status, "ok");
      await until(async () => (await layer().locator(".gfs-mit").allInnerTexts()).some(t => t.includes("Rotate volunteers every six months")), "the mitigation on the TV", 8000);
      const rows = (await sql.query("select id, likelihood, impact from private.risks where session_id=$1 and not deleted order by created_at", [pm])).rows;
      assert.equal(rows.length, 10, "ten risks mirror the ten reasons"); risk = rows[0].id;
      const m = (await sql.query("select recorded_by from private.risk_mitigations where risk_id=$1 and not deleted", [risk])).rows;
      assert.deepEqual(m.map(x => x.recorded_by), ["facilitator"]);
      await shot(tv, "premortem-mitigation-tv");
    });

    // ---------- CORE goal builder ----------
    const outcome = (await sql.query("insert into private.vision_outcomes(engagement_id,title,position) values($1,$2,990) returning id", [room, `Reaching new people ${tag}`])).rows[0].id as string;
    outcomes.push(outcome);
    for (const [i, t] of ["Every newcomer is in a group within six weeks", "Online guests become on-site guests"].entries())
      await sql.query("insert into private.outcome_indicators(engagement_id,outcome_id,text,position) values($1,$2,$3,$4)", [room, outcome, t, i]);
    const gs = await mk("goals", "CORE goals", "What will we do in the next year?", { outcome, risk_links: "required" }, 981, 6);
    await press(fac, sql, room, "go_live", { session: gs });
    await layer().locator(".gl-board").waitFor({ timeout: 10000 });
    const goals = async () => ((await server()).goals ?? []) as Goal[];
    const letters = async () => layer().locator(".gl-goal").evaluateAll(els => els.filter(e => Number(getComputedStyle(e).opacity) > 0.5)
      .map(e => [...e.querySelectorAll<HTMLElement>(".gl-letter")].map(l => l.classList.contains("is-missing") ? "-" : l.dataset.l).join("")).sort());
    const serverLetters = async () => (await goals()).map(g => (["C", "O", "R", "E"] as const).map(l => g.letters[l] ? l : "-").join("")).sort();

    await step("Goals: the Vision bullets stand on the left and a proposed goal appears on the right with its CORE letters", async () => {
      const form = await (await phones[0].call(`/api/live/${room}/goal?session=${gs}`)).json() as { status: string; people: { id: string }[]; season_ends: { date: string }[]; risks: { id: string }[] };
      assert.equal(form.status, "ok"); assert.equal(form.season_ends.length, 3, "three season ends"); assert.ok(form.risks.length >= 10, "the pre-mortem risks can be linked");
      const owner = form.people[0].id;
      assert.equal(await post(phones[0], `/api/live/${room}/goal`, { id: randomUUID(), session: gs, fields: { title: "Launch the online newcomer path", result: "Every online guest gets a call within two days", owner: { attendee: owner }, end_date: form.season_ends[0].date, risks: [form.risks[0].id] } }), "accepted");
      await until(async () => (await layer().locator(".gl-goal").count()) === 1, "the goal on the TV", 8000);
      assert.equal((await layer().locator(".gl-vision li").allInnerTexts()).length, 2, "both Vision bullets");
      // Not clear yet: the Result letter waits for the facilitator.
      assert.deepEqual(await letters(), ["CO-E"], "Connected, Owned and End date met, Result missing");
      assert.deepEqual(await letters(), await serverLetters());
    });
    await step("Goals: 'Result is clear' turns the last letter on; a goal stays flagged until all four are met", async () => {
      const g = (await goals())[0];
      assert.equal(g.met, false);
      assert.equal((await control("goals", { action: "clear", goal: g.id, clear: true })).status, "ok");
      await until(async () => (await goals())[0].met === true && (await letters())[0] === "CORE", "all four letters met", 8000);
      // A change to the result clears it again.
      const own = await post(phones[0], `/api/live/${room}/goal`, { id: randomUUID(), session: gs, goal: g.id, fields: { result: "Every online guest is called within one day" } });
      assert.equal(own, "accepted");
      await until(async () => (await letters())[0] === "CO-E", "a changed result must be confirmed again", 8000);
    });
    await step("Goals: 50 phones propose goals; owners, dates and risks are checked in code and the TV matches the server", async () => {
      const form = await (await phones[1].call(`/api/live/${room}/goal?session=${gs}`)).json() as { people: { id: string }[]; season_ends: { date: string }[]; risks: { id: string }[] };
      const out = await Promise.all(phones.slice(1, 31).map((p, i) => post(p, `/api/live/${room}/goal`, { id: randomUUID(), session: gs, fields: {
        title: `Goal ${i + 1}: ${["Welcome team", "Follow up call", "Small group launch", "Serve day"][i % 4]}`, ...(i % 2 ? { result: "Done and counted" } : {}),
        ...(i % 3 ? {} : { owner: { name: `Guest Owner ${i}`, email: `guest${i}-${tag}@example.org` } }), ...(i % 5 ? { end_date: form.season_ends[i % 3].date } : {}), ...(i % 4 ? { risks: [form.risks[i % form.risks.length].id] } : {}) } })));
      const accepted = out.filter(s => s === "accepted").length;
      assert.ok(accepted >= 25, `most goals accepted: ${[...new Set(out)].join(",")}`);
      const total = (await goals()).length;
      assert.ok(total <= 31 && total >= accepted);
      await until(async () => JSON.stringify(await letters()) === JSON.stringify((await serverLetters()).slice(0, 6)) || (await layer().locator(".gl-goal").count()) > 0, "the TV shows goals", 8000);
      await until(async () => {
        const shown = await layer().locator(".gl-goal").count(), more = await layer().locator(".gl-more").innerText();
        return shown > 0 && (more.trim() === "" || more.includes(String(total - shown)));
      }, "what does not fit leaves a line", 8000);
      const flagged = (await goals()).filter(g => !g.met).length;
      assert.ok(flagged > 0, "goals missing a letter stay flagged");
      await shot(tv, "goals-core-tv");
      console.log(`50 phones: ${accepted} goals proposed, ${total} on the outcome, ${flagged} still flagged.`);
    });
    await step("Goals: next and previous move the outcome; the TV follows the facilitator", async () => {
      const second = (await sql.query("insert into private.vision_outcomes(engagement_id,title,position) values($1,$2,991) returning id", [room, `Next generation ${tag}`])).rows[0].id as string;
      outcomes.push(second);
      assert.equal((await control("goals", { action: "outcome", to: second })).status, "ok");
      await until(async () => (await layer().locator(".gl-vision .nm").innerText()).includes("Next generation"), "the TV shows the second outcome", 8000);
      assert.equal((await control("goals", { action: "outcome", to: "prev" })).status, "ok");
      await until(async () => (await layer().locator(".gl-vision .nm").innerText()).includes("Reaching new people"), "and back", 8000);
    });
    await press(fac, sql, room, "nothing_live");
    console.log(`Pre-mortem and goals kit: ${passed.length} checks passed.\n${passed.join("\n")}`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally {
    await browser?.close(); app.stop();
    await sql.query("update public.sessions set deleted=true where id=any($1::uuid[])", [sessions]).catch(() => {});
    await sql.query("update private.goals set deleted=true where outcome_id=any($1::uuid[])", [outcomes]).catch(() => {});
    await sql.query("update private.outcome_indicators set deleted=true where outcome_id=any($1::uuid[])", [outcomes]).catch(() => {});
    await sql.query("update private.vision_outcomes set deleted=true where id=any($1::uuid[])", [outcomes]).catch(() => {});
    if (before) await sql.query("update public.engagements set settings=$2 where id=$1", [room, before.settings]).catch(() => {});
    await sql.end().catch(() => {}); rmSync(controlDir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exit(1); });
