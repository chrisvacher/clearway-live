// Who sees answers (November 20): the practice room runs one public and one private step of every kind that has the setting,
// with 50 simulated phones answering each through the real phone endpoint and one headless TV paired to the room.
// A private step (Facilitators only): the TV shows the question, the count and the private line, and nothing of any answer;
// another phone's snapshot carries counts only; the room state holds counts only; phones cannot upvote a private question;
// every answer still reaches the TV's count, logged in the latency log. A public step is unchanged: the TV draws the answers
// as the acceptance kit checks them. KIT_SHOTS=<folder> saves each TV screen. KIT_ONLY=scale,wall runs just those kinds.
// Local only: the practice room on the local stack, no email, Team Hub or CORE.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { joinPhones, practiceRoom } from "../../scripts/load-test";
import { verdict, type LatencyReport } from "../../lib/latency/report";
import { privateLine } from "../../lib/interactions/visibility";
import { db, facilitator, localEnv, pairTv, press, startApp, until } from "./harness";

type Results = Record<string, unknown> & { total: number; people: number };
type Kind = { kind: string; label: string; options: Record<string, unknown>; sel: string; maxSends?: number;
  // Each phone's answer: [value, text]. A text answer carries the marker so a leak would show as text anywhere.
  answer: (i: number, marker: string) => [unknown, string] };

const five = ["Reaching new people", "Next generation", "Welcome and first visits", "Systems and data", "Second campus and facility"].map((text, i) => ({ key: `o${i + 1}`, text }));
const gridItems = ["Online newcomer path", "Prayer room", "Leader residency", "Youth night", "Data dashboard"].map((text, i) => ({ key: `p${i + 1}`, text }));
const signText = "We commit to the goals we set together.";
const stroke = (i: number) => `M${20 + i % 30} 120L${120 + i % 40} 60L${260 + i % 50} 140L${420 + i % 30} 80`;

const kinds: Kind[] = [
  { kind: "word_cloud", label: "Word cloud", options: {}, sel: ".tv-word", answer: (i, m) => [undefined, `${m}${i % 12}`] },
  { kind: "wall", label: "Open text", options: {}, sel: ".ai-card", answer: (i, m) => [undefined, `${m} testimonial number ${i + 1}`] },
  { kind: "qa", label: "Q&A", options: { any_time: false }, sel: ".qa-row", maxSends: 5, answer: (i, m) => [undefined, `${m} question ${i + 1}?`] },
  { kind: "choice", label: "Multiple choice", options: { items: five, multiple: false }, sel: ".tv-bar", answer: i => [{ choices: [`o${(i % 5) + 1}`] }, ""] },
  { kind: "scale", label: "Scale (NPS)", options: { max: 10, low: "Not likely", high: "Very likely" }, sel: ".tv-scale-marker, .tv-col-count", answer: i => [{ value: (i % 10) + 1 }, ""] },
  { kind: "ranking", label: "Ranking", options: { items: five }, sel: ".tv-bar", answer: i => [{ order: [["o1", "o2", "o3"], ["o2", "o1", "o4"], ["o4", "o5"]][i % 3] }, ""] },
  { kind: "points", label: "100 points", options: { items: five, cut: 3 }, sel: ".tv-bar", answer: i => [{ points: [{ o1: 60, o2: 40 }, { o3: 100 }, { o4: 50, o5: 50 }][i % 3] }, ""] },
  { kind: "statements", label: "Statements", options: { items: five }, sel: ".tv-bar", answer: i => [{ ratings: Object.fromEntries(five.map((o, k) => [o.key, ((i + k) % 5) + 1])) }, ""] },
  { kind: "grid", label: "2x2 grid", options: { items: gridItems }, sel: ".gfs-dot", answer: i => [{ places: Object.fromEntries(gridItems.map((g, j) => [g.key, [((i + j) % 9 + 1) / 10, ((i * 3 + j) % 9 + 1) / 10]])) }, "x"] },
  { kind: "sign", label: "Sign together", options: { text: signText }, sel: ".gfs-name", answer: i => [{ strokes: [stroke(i)] }, "x"] },
  { kind: "form", label: "Private form", options: { questions: [{ key: "q1", text: "One thing for the facilitators" }] }, sel: ".gfs-count", answer: (i, m) => [{ answers: { q1: `${m} form ${i}` } }, "x"] },
];

async function main() {
  const env = localEnv(), sql = db(env), app = await startApp(env);
  let browser: Browser | undefined;
  const passed: string[] = [], table: string[] = [], cleanup: string[] = [];
  const shots = process.env.KIT_SHOTS;
  const shot = async (page: Page, name: string) => { if (shots) { await delay(900); await page.screenshot({ path: `${shots}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { const t0 = Date.now(); await run(); passed.push(`${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); console.log(`ok · ${name}`); };
  let seed = 11; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  try {
    await sql.connect();
    const seeded = (await sql.query("select 1 from public.engagements where id=$1 and not deleted", [practiceRoom])).rowCount;
    assert.equal(seeded, 1, "Run npm run db:seed first: the kit uses the permanent practice room");
    const fac = await facilitator(env, sql, practiceRoom), tag = randomUUID().slice(0, 6);
    const cookie = fac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
    let position = 940;
    // Saved through the same options check the run of show uses, so the setting is validated as it would be from the admin.
    const mk = async (k: Kind, visibility: "public" | "private") => {
      const options = { ...k.options, ...(visibility === "private" ? { visibility } : {}) };
      const id = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,options,max_sends,max_characters,max_words)
        values($1,$2,'Day 1',$3,$4,$5,'ready',private.session_options($4,$6::jsonb,$1),$7,$8,$9) returning id`,
        [practiceRoom, `${k.label} ${visibility} ${tag}`, position++, k.kind, `${k.label}: ${visibility === "private" ? "facilitators only" : "everyone"}`, options,
          k.maxSends ?? 3, k.kind === "wall" || k.kind === "qa" ? 200 : 28, k.kind === "wall" || k.kind === "qa" ? 50 : 3])).rows[0].id as string;
      cleanup.push(id); return id;
    };
    const results = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [practiceRoom])).rows[0].results as Results;
    const report = async (from: string): Promise<LatencyReport> => {
      const to = new Date().toISOString();
      const response = await fetch(`${app.origin}/api/control/${practiceRoom}/latency?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { headers: { Cookie: cookie } });
      assert.ok(response.ok, "the latency report reads"); return await response.json() as LatencyReport;
    };

    await press(fac, sql, practiceRoom, "nothing_live");
    browser = await chromium.launch();
    const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage(); await tv.goto(app.origin + "/tv");
    const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(fac, practiceRoom, app.secret, code, "Visibility kit TV");
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
    await tv.evaluate(() => { (window as unknown as { __loaded: number }).__loaded = 1; });
    const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
    const phones = await joinPhones(app.origin, 50, { prefix: "Visibility phone" });
    // A 51st view of the room: the snapshot a phone that has not answered would read (its own answers are not in it).
    const watcher = phones[49];

    const only = process.env.KIT_ONLY?.split(",").map(x => x.trim()).filter(Boolean);
    for (const k of kinds.filter(k => !only || only.includes(k.kind))) {
      for (const visibility of (k.kind === "form" ? ["private"] : ["public", "private"]) as ("public" | "private")[]) {
        await step(`${k.label}, ${visibility === "private" ? "Facilitators only" : "Everyone"}, 50 phones`, async () => {
          const session = await mk(k, visibility), marker = `kit${visibility === "private" ? "secret" : "open"}${tag}`;
          const stored = (await sql.query("select options->>'visibility' v from public.sessions where id=$1", [session])).rows[0].v as string | null;
          assert.equal(stored, visibility === "private" ? "private" : null, `${k.label}: the setting is stored`);
          await press(fac, sql, practiceRoom, "go_live", { session });
          await tv.locator(`.tv-layer:not(.is-leaving)[data-kind="${k.kind}"] .tv-board`).waitFor({ timeout: 10000 });
          await delay(700);
          const from = new Date(Date.now() - 500).toISOString();
          const statuses = await Promise.all(phones.map(async (p, i) => {
            await delay(Math.floor(rnd() * 5000));
            const [value, text] = k.answer(i, marker);
            return p.sendValue(practiceRoom, session, value, text);
          }));
          assert.deepEqual([...new Set(statuses)], ["accepted"], `${k.label} ${visibility}: every answer accepted`);
          await delay(2000);
          const server = await results(), snap = await (await watcher.call(`/api/live/${practiceRoom}?surface=phone`, { cache: "no-store" })).json() as Record<string, unknown> & { answers: unknown[]; state: { results: Results }; session: { options?: Record<string, unknown> } };
          const r = await report(from), mine = r.sessions.find(s => s.id === session);
          if (visibility === "private") {
            assert.deepEqual(Object.keys(server).sort(), ["people", "total", "words"], `${k.label}: the room state holds counts only`);
            assert.equal(server.people, 50, `${k.label}: 50 people counted`);
            assert.deepEqual(Object.keys(snap.state.results).sort(), ["people", "total", "words"], `${k.label}: another phone's snapshot carries counts only`);
            assert.deepEqual(snap.answers, [], `${k.label}: and no answers`);
            assert.equal(snap.session.options?.visibility, "private", `${k.label}: phones learn the step is private`);
            assert.ok(!JSON.stringify(snap).includes(marker), `${k.label}: no answer text reaches another phone`);
            await until(async () => await layer().getAttribute("data-private") === "true"
              && ((await layer().locator(".gfs-marks").getAttribute("aria-label")) ?? "").startsWith("50 of "), `${k.label}: the TV counts 50 answers`, 10000);
            const html = await tv.content(), text = await layer().innerText();
            assert.ok(!html.includes(marker), `${k.label}: no answer text on the TV`);
            assert.ok(text.includes(privateLine.slice(0, -1)), `${k.label}: the TV reads "${privateLine}"`);
            if (k.sel !== ".gfs-count") assert.equal(await layer().locator(k.sel).count(), 0, `${k.label}: no bars, words or cards on the TV`);
            if (k.kind === "qa") {
              const ids = (await sql.query("select id from public.submissions where session_id=$1 and not deleted and not withdrawn limit 5", [session])).rows.map(x => x.id as string);
              const votes = await Promise.all(phones.slice(10, 15).map((p, i) => p.vote(practiceRoom, ids[i % ids.length])));
              assert.ok(votes.every(v => (v.reason ?? v.status) === "closed"), `Q&A: phones cannot upvote a private question (${votes.map(v => v.reason ?? v.status)})`);
            }
            // The facilitators read every answer on the control surface.
            const status = await (await fetch(`${app.origin}/api/control/${practiceRoom}`, { headers: { Cookie: cookie } })).json() as { status: string; items?: unknown[] };
            assert.equal(status.status, "ok", `${k.label}: the control surface reads`);
            if (["word_cloud", "wall", "qa"].includes(k.kind)) assert.ok(JSON.stringify(status.items).includes(marker), `${k.label}: the facilitators still read every answer`);
            else assert.ok((status.items ?? []).length > 0, `${k.label}: the facilitators still see the answers`);
          } else {
            await until(async () => await layer().locator(k.sel).count() > 0, `${k.label}: the TV draws the answers`, 10000);
            assert.equal(await layer().getAttribute("data-private"), null, `${k.label}: a public step is not marked private`);
            assert.ok(Object.keys(server).length > 3 || ["word_cloud"].includes(k.kind), `${k.label}: the room state carries the results`);
            if (["word_cloud", "wall", "qa"].includes(k.kind)) assert.ok(JSON.stringify(snap).includes(marker), `${k.label}: phones see the answers on a public step`);
            assert.ok(!(await layer().innerText()).includes(privateLine.slice(0, -1)), `${k.label}: no private line on a public step`);
          }
          assert.ok(mine, `${k.label} ${visibility}: the latency log has the session`);
          assert.equal(mine!.measured, 50, `${k.label} ${visibility}: every answer reached the TV and was logged`);
          const v = verdict(mine!);
          table.push(`${(k.label + (visibility === "private" ? " (private)" : "")).padEnd(30)} ${String(mine!.under_second).padStart(2)} of ${mine!.measured} under 1 s, 95th ${mine!.p95} ms`);
          assert.ok(v.met, `${k.label} ${visibility}: 95 of 100 under one second on loopback: ${v.label}`);
          await shot(tv, `visibility-${k.kind}-${visibility}-tv`);
        });
      }
    }
    assert.ok(await tv.evaluate(() => (window as unknown as { __loaded?: number }).__loaded === 1), "the TV page never reloaded");
    await press(fac, sql, practiceRoom, "nothing_live");
    console.log(`\nWho sees answers, 50 simulated phones on loopback (phone to TV, from the latency log):\n${table.map(l => `  ${l}`).join("\n")}`);
    console.log(`Visibility kit: ${passed.length} steps passed.\n${passed.map(p => `  ${p}`).join("\n")}`);
  } catch (error) {
    console.error(app.output().slice(-3000));
    if (shots) for (const [i, page] of (browser?.contexts() ?? []).flatMap(c => c.pages()).entries()) await page.screenshot({ path: `${shots}/visibility-failure-${i}.png` }).catch(() => {});
    throw error;
  } finally {
    if (cleanup.length) await sql.query("update public.sessions set deleted=true where id=any($1::uuid[])", [cleanup]).catch(() => {});
    await browser?.close(); app.stop(); await sql.end().catch(() => {});
  }
}
main().catch(error => { console.error(error); process.exit(1); });
