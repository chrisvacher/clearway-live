// Milestone 4, step 3: candidate priorities (INT-13) with 50 simulated phones, in real browsers against the
// production build and the local stack, with the scripted fake model (never the API). One headless TV is paired
// to the practice room and watched on every animation frame. Lens sentences are written first; then AI drafts
// the candidates (a failed draft first, to show the step works by hand), the facilitator sends them to the TV,
// and 50 phones suggest renames, merges and new candidates. Nothing reaches the TV until the facilitator accepts;
// an accepted rename changes in place, an accepted merge glides, and nothing jumps, blanks or redraws. Then 50
// phones place their 100 points (95 in 100 under one second), the facilitator moves the cut line and marks the
// provisional Vision Outcomes, choosing against the counts to show they never decide.
// Local only: the practice room, no email, Team Hub or CORE. KIT_SHOTS=<folder> saves each TV screen.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { joinPhones, practiceRoom, type Phone } from "../../scripts/load-test";
import { verdict, type LatencyReport } from "../../lib/latency/report";
import { db, facilitator, localEnv, pairTv, press, startApp, until } from "./harness";

const controlDir = join(tmpdir(), `clearway-cd-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true }); writeFileSync(controlFile, "{}");
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "250", ANTHROPIC_API_KEY: "" });

// The frame watcher, as plain script text (the acceptance kit's): for each element the selector names it records how far
// the element moved since the last frame, and whether the session scene ever had no visible layer.
const watcher = `(() => {
  const w = window; if (w.__acc) return;
  const a = w.__acc = { sel: "", frames: 0, blank: 0, worst: 0, worstKey: "", steps: 0, jumps: [], stop: false };
  const ids = new WeakMap(); let n = 0, last = new Map();
  const id = el => { if (!ids.has(el)) ids.set(el, ++n); return ids.get(el); };
  const read = () => {
    if (a.stop) return; a.frames++;
    const scene = document.querySelector(".tv-scene.tv-session.is-active");
    if (scene) {
      const layers = [...scene.querySelectorAll(".tv-layer")];
      const others = [...document.querySelectorAll(".tv-scene:not(.tv-session), .tv-check")].some(el => +getComputedStyle(el).opacity > 0.5);
      if (!layers.length && !others) a.blank++;
    }
    const next = new Map();
    if (a.sel) for (const el of document.querySelectorAll(a.sel)) {
      if (el.closest(".tv-layer.is-leaving") || !el.offsetWidth || +getComputedStyle(el).opacity < 0.5) continue;
      const r = el.getBoundingClientRect(), c = [r.left + r.width / 2, r.top + r.height / 2], k = id(el), p = last.get(k);
      if (p) { const d = Math.hypot(c[0] - p[0], c[1] - p[1]); a.steps++; if (d > a.worst) { a.worst = d; a.worstKey = (el.className + " " + el.textContent).slice(0, 60); } if (d >= 150) a.jumps.push([(el.className + " " + el.textContent).slice(0, 60), Math.round(d)]); }
      next.set(k, c);
    }
    last = next; requestAnimationFrame(read);
  };
  requestAnimationFrame(read);
})()`;
type Watch = { frames: number; blank: number; worst: number; worstKey: string; steps: number; jumps: (string | number)[][] };
type Row = { id: string; num: number; name: string; origin: string; sources: unknown[] };
type State = { status: string; phase: string; standing: number; ai: { failing: boolean; note: string | null }; candidates: Row[]; suggestions: { ids: string[]; kind: string; count: number; text: string }[] };

const lensLines: string[][] = [
  ["We welcome every stranger by name", "Guests are greeted at the door before they find a seat", "We pray together before every decision", "Prayer comes first in every meeting"],
  ["Neighbours eat at our table every week", "We share a meal after every service", "Our neighbours know us by name", "Neighbours call our hall their own"],
  ["Every leader mentors an apprentice", "Leaders are raised here and sent out", "Volunteers share the load across many hands", "We serve without burning out"],
];

async function main() {
  const env = localEnv(), sql = db(env), app = await startApp(env);
  let browser: Browser | undefined;
  const passed: string[] = [], table: string[] = [], sessions: string[] = [];
  const shots = process.env.KIT_SHOTS, room = practiceRoom, tag = randomUUID().slice(0, 6);
  const shot = async (page: Page, name: string) => { if (shots) { await delay(1200); await page.screenshot({ path: `${shots}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { const t0 = Date.now(); await run(); passed.push(`${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); console.log(`ok · ${name}`); };
  let seed = 11; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  let before: { settings: unknown } | undefined;
  try {
    await sql.connect();
    before = (await sql.query("select settings from public.engagements where id=$1 and not deleted", [room])).rows[0];
    assert.ok(before, "Run npm run db:seed first: the kit uses the permanent practice room");
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [room]);
    const fac = await facilitator(env, sql, room), cookie = fac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
    const mk = async (kind: string, title: string, prompt: string, options: Record<string, unknown>, position: number, limits: [number, number, number]) => {
      const id = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,options,max_sends,max_characters,max_words)
        values($1,$2,'Day 1',$3,$4,$5,'ready',coalesce(private.session_options($4,$6::jsonb,$1),'{}'::jsonb),$7,$8,$9) returning id`, [room, `${title} ${tag}`, position, kind, prompt, options, ...limits])).rows[0].id as string;
      sessions.push(id); return id;
    };
    const server = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [room])).rows[0].results as Record<string, unknown>;
    const live = async () => (await sql.query("select live_session_id from public.room_states where engagement_id=$1", [room])).rows[0].live_session_id as string;
    const ctl = async (action: string, body: Record<string, unknown> = {}) => {
      const r = await fetch(`${app.origin}/api/control/${room}/candidates`, { method: "POST", headers: { Cookie: cookie, Origin: app.origin, "Content-Type": "application/json" }, body: JSON.stringify({ id: randomUUID(), action, from: await live(), ...body }) });
      return (await r.json()) as { status: string };
    };
    const state = async () => (await (await fetch(`${app.origin}/api/control/${room}/candidates`, { headers: { Cookie: cookie }, cache: "no-store" })).json()) as State;
    const report = async (from: string): Promise<LatencyReport> => {
      const r = await fetch(`${app.origin}/api/control/${room}/latency?from=${encodeURIComponent(from)}&to=${encodeURIComponent(new Date().toISOString())}`, { headers: { Cookie: cookie } });
      assert.ok(r.ok, "the latency report reads"); return await r.json() as LatencyReport;
    };

    await press(fac, sql, room, "nothing_live");
    browser = await chromium.launch();
    const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    await tv.goto(app.origin + "/tv");
    const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(fac, room, app.secret, code, "Candidates kit TV");
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
    await tv.evaluate(() => { (window as unknown as { __loaded: number }).__loaded = 1; });
    await tv.evaluate(watcher);
    const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
    const watch = async (sel: string) => tv.evaluate(s => { const a = (window as unknown as { __acc: Watch & { sel: string } }).__acc; const out = { ...a, jumps: a.jumps.slice() }; Object.assign(a, { sel: s, frames: 0, blank: 0, worst: 0, worstKey: "", steps: 0, jumps: [] }); return out as Watch; }, sel);
    const phones = await joinPhones(app.origin, 50, { prefix: "Candidates phone" });
    const post = async (p: Phone, path: string, body: unknown) => ((await (await p.call(path, { method: "POST", body: JSON.stringify(body) })).json().catch(() => ({ status: "bad" }))) as { status: string }).status;
    const cards = () => layer().locator(".cd-card:not(.cd-ghost)");
    const titles = async () => (await cards().evaluateAll(els => els.map(e => (e.querySelector(".cd-title > span:not(.cd-out)") as HTMLElement | null)?.textContent ?? ""))).sort();

    // ---------- The lens walls the candidates draw from ----------
    await step("Lens walls: 12 sentences from the Five Lenses' first three walls are written by phones", async () => {
      for (const [i, lines] of lensLines.entries()) {
        const wall = await mk("lens", `Lens ${i + 1}`, "In {base year + 10}, what is true?", { lens: i + 1 }, 960 + i, [3, 200, 50]);
        await press(fac, sql, room, "go_live", { session: wall });
        const out = await Promise.all(lines.map((text, k) => phones[i * 4 + k].sendValue(room, wall, undefined, text)));
        assert.deepEqual([...new Set(out)], ["accepted"], `lens ${i + 1} sentences accepted`);
      }
    });

    // ---------- Review ----------
    const cs = await mk("candidates", "Candidate priorities", "Which priorities do we carry forward?", { ai: true, cut: 5 }, 970, [1, 200, 50]);
    await press(fac, sql, room, "go_live", { session: cs });
    await tv.locator('.tv-layer:not(.is-leaving)[data-kind="candidates"] .tv-board').waitFor({ timeout: 10000 });
    await layer().evaluate(el => { (el as unknown as { __mark: number }).__mark = 1; (el.querySelector(".tv-board") as unknown as { __mark: number }).__mark = 1; });
    await step("Review: the TV waits and the phones wait; a suggestion before the candidates are sent is turned away", async () => {
      await layer().locator(".cd-note").waitFor({ timeout: 5000 });
      assert.equal(await cards().count(), 0, "no card on the TV in review");
      assert.equal(await post(phones[0], `/api/live/${room}/candidate`, { id: randomUUID(), session: cs, kind: "add", text: "Too early" }), "closed");
      assert.equal(((await server()).candidates as unknown[]).length, 0, "the room results hold no candidate");
    });
    await step("AI fails: the step still works by hand, and the TV has seen nothing", async () => {
      writeFileSync(controlFile, JSON.stringify({ fail: true }));
      assert.equal((await ctl("draft")).status, "ok");
      await until(async () => (await state()).ai.failing, "the failed draft is shown to the facilitator", 20000);
      assert.equal((await ctl("add", { name: "Serve the city" })).status, "ok");
      const s = await state(); assert.equal(s.candidates.length, 1); assert.equal(s.candidates[0].origin, "facilitator");
      assert.equal(await cards().count(), 0, "still nothing on the TV");
    });
    await step("AI drafts: candidates with their source sentences, for the facilitator only", async () => {
      writeFileSync(controlFile, "{}"); await delay(10500);
      assert.equal((await ctl("draft")).status, "ok");
      const s = await until(async () => { const x = await state(); return x.candidates.filter(c => c.origin === "ai").length >= 5 && x; }, "AI's candidates", 30000);
      const ai = s.candidates.filter(c => c.origin === "ai");
      assert.ok(ai.length >= 5 && ai.length <= 10, `AI proposed ${ai.length}`);
      assert.ok(ai.every(c => c.sources.length >= 2), "each has its source sentences");
      assert.equal(await cards().count(), 0, "the TV has no card: review is the facilitator's");
      assert.equal(((await server()).candidates as unknown[]).length, 0);
      assert.ok(!JSON.stringify(await server()).includes("stranger"), "no sentence in the room results");
    });

    // ---------- Sent ----------
    let rows: Row[] = [];
    await step("Send: the TV shows a number and a title for each candidate, and nothing else", async () => {
      const t0 = Date.now();
      assert.equal((await ctl("send")).status, "ok");
      await until(async () => (await cards().count()) === (await state()).standing, "the cards on the TV", 5000);
      assert.ok(Date.now() - t0 < 1500, "the cards reached the TV in about a second");
      rows = (await state()).candidates;
      const texts = await cards().allInnerTexts();
      assert.ok(texts.every(t => /^\d+\s+\S/.test(t.trim())), `each card is a number and a title: ${texts.join(" | ")}`);
      assert.ok(!texts.join(" ").match(/AI|sentence|Congregation|Community|Leadership|stranger/), "no AI badge, source or lens on the TV");
      assert.deepEqual(await titles(), rows.map(r => r.name).sort());
      await shot(tv, "candidates-sent-tv");
    });

    // ---------- 50 phones suggest ----------
    const target = rows.find(r => r.origin === "ai")!, joiner = rows.filter(r => r.origin === "ai")[1];
    await step("50 phones suggest renames, merges and new candidates: the facilitator sees them grouped, the TV sees nothing", async () => {
      const shown = await titles(); await watch(".cd-card:not(.cd-ghost)");
      const out = await Promise.all(phones.map(async (p, i) => {
        await delay(Math.floor(rnd() * 4000));
        const body = i % 5 === 4 ? { kind: "add", text: "Serve our city" } : i % 5 === 3 ? { kind: "merge", candidate: joiner.id, into: target.id } : { kind: "rename", candidate: target.id, text: "Open and welcoming" };
        return post(p, `/api/live/${room}/candidate`, { id: randomUUID(), session: cs, ...body });
      }));
      assert.deepEqual([...new Set(out)], ["accepted"], "every suggestion accepted");
      const s = await state(), by = (kind: string) => s.suggestions.filter(g => g.kind === kind);
      assert.equal(by("rename").length, 1); assert.equal(by("rename")[0].count, 30);
      assert.equal(by("merge")[0].count, 10); assert.equal(by("add")[0].count, 10);
      await delay(1500);
      assert.deepEqual(await titles(), shown, "the TV still shows the candidates as they were");
      const w = await watch(".cd-card:not(.cd-ghost)");
      assert.equal(w.blank, 0); assert.deepEqual(w.jumps, []);
      assert.ok(!(JSON.stringify(await server())).includes("Open and welcoming"), "no suggestion in the room results");
    });

    // ---------- One tap accepts ----------
    await step("Accept: a rename changes in place, a merge glides onto its target, a new candidate arrives; nothing jumps or redraws", async () => {
      const s = await state(), group = (kind: string) => s.suggestions.find(g => g.kind === kind)!;
      const card = layer().locator(`[data-cid="${target.id}"]`), box0 = (await card.boundingBox())!;
      await layer().evaluate(el => { (el as unknown as { __mark: number }).__mark = 1; (el.querySelector(".tv-board") as unknown as { __mark: number }).__mark = 1; });
      await watch(".cd-card:not(.cd-ghost)");
      const t0 = Date.now();
      assert.equal((await ctl("accept", { ids: group("rename").ids })).status, "ok");
      await until(async () => (await card.locator(".cd-title > span:not(.cd-out)").innerText()) === "Open and welcoming", "the new name on the TV", 4000);
      const ms = Date.now() - t0; assert.ok(ms < 1500, `the accepted name reached the TV in ${ms} ms`);
      const box1 = (await card.boundingBox())!;
      assert.ok(Math.abs(box0.x - box1.x) < 1 && Math.abs(box0.y - box1.y) < 1, "the renamed card did not move");
      await until(async () => (await card.locator(".cd-out").count()) === 0, "the old words fade out", 3000);
      const n0 = await cards().count();
      assert.equal((await ctl("accept", { ids: group("merge").ids })).status, "ok");
      await until(async () => (await cards().count()) === n0 - 1, "the merged card has left", 4000);
      assert.equal((await ctl("accept", { ids: group("add").ids })).status, "ok");
      await until(async () => (await cards().count()) === n0, "the new candidate has arrived", 4000);
      await delay(1500);
      const w = await watch(".cd-card:not(.cd-ghost)");
      assert.equal(w.blank, 0, "the TV never blanked");
      assert.deepEqual(w.jumps, [], `nothing jumped (largest step ${Math.round(w.worst)} px on ${w.worstKey})`);
      assert.ok(await layer().evaluate(el => (el as unknown as { __mark?: number }).__mark === 1 && (el.querySelector(".tv-board") as unknown as { __mark?: number }).__mark === 1), "the TV animated in place, never drawing the view again");
      assert.ok(await tv.evaluate(() => (window as unknown as { __loaded?: number }).__loaded === 1), "the TV page never reloaded");
      assert.equal((await state()).suggestions.length, 0, "every suggestion is settled");
      await shot(tv, "candidates-accepted-tv");
    });

    // ---------- 100 points ----------
    const points = await state();
    await step("Open 100 points: the TV turns to bars; 50 phones place 100 points, 95 in 100 reach the TV in under a second", async () => {
      assert.ok(points.standing >= 2 && points.standing <= 8, `${points.standing} candidates stand`);
      assert.equal((await ctl("open_points")).status, "ok");
      await tv.locator(".tv-layer:not(.is-leaving) .tv-bar").first().waitFor({ timeout: 8000 });
      const keys = points.candidates.map(c => c.id), from = new Date(Date.now() - 500).toISOString();
      await watch(".tv-layer:not(.is-leaving) .tv-bar");
      const out = await Promise.all(phones.map(async (p, i) => {
        await delay(Math.floor(rnd() * 5000));
        const share = keys.map(() => rnd() + 0.05), sum = share.reduce((a, b) => a + b, 0);
        const given = share.map(x => Math.floor(x / sum * 100)); given[i % keys.length] += 100 - given.reduce((a, b) => a + b, 0);
        // The first candidates lead, so the counts and the facilitator's choice can differ later.
        return p.sendValue(room, cs, { points: Object.fromEntries(keys.map((k, j) => [k, given[j]])) });
      }));
      assert.deepEqual([...new Set(out)], ["accepted"], "every 100 points accepted");
      await delay(2500);
      const r = await server(); assert.equal(r.people, 50);
      await until(async () => (await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").then(v => v ?? "")).includes("50"), "the TV count is the server's", 8000);
      const bars = r.bars as { key: string; fraction: number }[];
      await until(async () => { const rowsOnTv = await layer().locator(".tv-bar:not(.is-leaving)").evaluateAll(rs => rs.map(x => ({ key: (x as HTMLElement).dataset.key!, y: x.getBoundingClientRect().top })).sort((a, b) => a.y - b.y).map(x => x.key)); return JSON.stringify(rowsOnTv) === JSON.stringify(bars.map(b => b.key)); }, "the TV's bars stand in the server's order", 8000);
      const log = await report(from), mine = log.sessions.find(s => s.id === cs);
      assert.ok(mine, "the latency log has the session"); assert.equal(mine!.measured, 50, "every answer reached the TV and was logged");
      const w = await watch(".tv-layer:not(.is-leaving) .tv-bar");
      assert.equal(w.blank, 0, "the TV never blanked"); assert.deepEqual(w.jumps, [], `nothing jumped (largest step ${Math.round(w.worst)} px)`);
      const v = verdict(mine!); table.push(`Candidates, 100 points, 50 phones: ${mine!.under_second} of ${mine!.measured} under 1 s, 95th ${mine!.p95} ms, largest step ${Math.round(w.worst)} px over ${w.steps} item frames`);
      assert.ok(v.met, `95 of 100 under one second: ${v.label}`);
      await shot(tv, "candidates-points-tv");
    });
    await step("The cut line moves between 4 and 6; a line outside it is refused", async () => {
      assert.equal((await ctl("cut", { cut: 4 })).status, "ok"); assert.equal((await ctl("cut", { cut: 7 })).status, "invalid_request");
      assert.equal((await ctl("cut", { cut: 6 })).status, "ok");
      const r = await server(); const n = (r.bars as unknown[]).length;
      assert.equal(r.cut, n > 6 ? 6 : 0, "the server draws the cut line only when it falls inside the list");
      assert.equal((await ctl("back")).status, "has_points", "the candidates are fixed once points are placed");
      assert.equal((await ctl("cut", { cut: 5 })).status, "ok");
    });

    // ---------- Mark ----------
    await step("Mark: the candidates above the cut line become provisional Vision Outcomes; the counts never decide", async () => {
      const r = await server(), bars = r.bars as { key: string; text: string }[], cut = Math.min(5, bars.length);
      assert.equal((await ctl("mark", { reasons: "The room kept coming back to these." })).status, "ok");
      const got = (await sql.query("select o.title from private.vision_outcomes o where o.engagement_id=$1 and o.status='provisional' and not o.deleted and o.decision_id is not null and o.created_at>now()-interval '10 minutes' order by o.position", [room])).rows.map(x => x.title as string);
      assert.deepEqual(got, bars.slice(0, cut).map(b => b.text), "the top of the points, in order");
      const decision = (await sql.query("select subject, reasons from private.decisions where session_id=$1 and not deleted", [cs])).rows;
      assert.deepEqual(decision, [{ subject: "cut_line", reasons: "The room kept coming back to these." }]);
      await until(async () => (await layer().locator(".cd-card.is-marked").count()) === cut, "only the marked ones on the TV, outlined", 5000);
      assert.match(await layer().locator(".cd-head").innerText(), /Provisional Vision Outcomes/);
      await shot(tv, "candidates-marked-tv");
      // The facilitator chooses against the counts: the lowest place only.
      const last = bars[bars.length - 1];
      assert.equal((await ctl("mark", { ids: [last.key] })).status, "ok");
      const again = (await sql.query("select o.title from private.vision_outcomes o where o.engagement_id=$1 and o.status='provisional' and not o.deleted and o.decision_id is not null and o.created_at>now()-interval '10 minutes'", [room])).rows.map(x => x.title as string);
      assert.deepEqual(again, [last.text], "the facilitator's choice stands, whatever the counts");
      await until(async () => (await layer().locator(".cd-card.is-marked").count()) === 1, "the TV follows the facilitator", 5000);
    });
    await press(fac, sql, room, "nothing_live");
    console.log(`Candidates kit: ${passed.length} checks passed.\n${passed.join("\n")}\n${table.join("\n")}`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally {
    await browser?.close(); app.stop();
    await sql.query("update private.vision_outcomes set deleted=true,decision_id=null where id in (select outcome_id from private.candidates where session_id=any($1::uuid[]) and outcome_id is not null)", [sessions]).catch(() => {});
    await sql.query("update private.candidates set deleted=true,outcome_id=null where session_id=any($1::uuid[])", [sessions]).catch(() => {});
    await sql.query("update private.candidate_boards set deleted=true,decision_id=null where session_id=any($1::uuid[])", [sessions]).catch(() => {});
    await sql.query("update private.decisions set deleted=true where session_id=any($1::uuid[])", [sessions]).catch(() => {});
    await sql.query("update private.lens_sentences set deleted=true where session_id=any($1::uuid[])", [sessions]).catch(() => {});
    await sql.query("update public.sessions set deleted=true where id=any($1::uuid[])", [sessions]).catch(() => {});
    if (before) await sql.query("update public.engagements set settings=$2 where id=$1", [room, before.settings]).catch(() => {});
    await sql.end().catch(() => {}); rmSync(controlDir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exit(1); });
