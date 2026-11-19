// Local-only paired-TV acceptance for small-room clouds and AI walls.
// Every fixture is a fresh workshop. The shared practice room is never used.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { verdict, type LatencyReport } from "../../lib/latency/report";
import { joinPhones } from "../../scripts/load-test";
import { demoWordKey } from "../../lib/public/demo-room";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

const scratch = join(tmpdir(), `clearway-small-room-${randomUUID().slice(0, 8)}`);
mkdirSync(scratch, { recursive: true });
const controlFile = join(scratch, "fake.json");
writeFileSync(controlFile, "{}");
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "150", ANTHROPIC_API_KEY: "" });
const evidence = process.env.KIT_SHOTS ?? "docs/evidence/small-room";
mkdirSync(evidence, { recursive: true });
const words = ["kindness", "courage", "patience", "clarity", "honesty", "delight", "wisdom", "trust", "hope", "peace", "mercy", "joy", "grace", "rest", "strength", "unity", "care", "purpose", "freedom", "wonder",
  "accountability", "encouragement", "understanding", "reconciliation", "determination", "responsibility", "communication", "collaboration", "thoughtfulness", "resourcefulness", "approachability", "dependability", "intentionality", "consideration", "faithfulness", "authenticity", "availability", "compassion", "consistency", "discernment",
  "attentiveness", "perseverance", "continuity", "participation", "appreciation", "contentment", "receptiveness", "transparency", "steadfastness", "openheartedness", "belonging", "connection", "celebration", "cooperation", "reliability", "sustainability", "adaptability", "reassurance", "imagination", "humility"].map((text, i) => i < 20 ? text : `thoughtful ${text}`);
// Match the server's keys while retaining exactly what each phone originally sent.
assert.ok(words.every(text => text.length <= 28 && text.split(" ").length <= 3), "fixture answers respect the phone limits");
const wordKeys = words.map(demoWordKey);
assert.equal(new Set(wordKeys).size, words.length, "every fixture word has a distinct normalized key");
const sentText = new Map(words.map(text => [demoWordKey(text), text]));
const displays = ["clearway-very_small", "clearway-medium", "novetera-very_small", "novetera-medium"];
const displayFilter = process.env.KIT_DISPLAY;
assert.ok(!displayFilter || displays.includes(displayFilter), `KIT_DISPLAY must be one of: ${displays.join(", ")}`);
const active = ".tv-layer:not(.is-leaving)";
const cloudSelector = `${active} .tv-field .tv-word:not(.is-going)`;
// As in test:lens-wall, sample stable node identities each animation frame.
// New and removed nodes are excluded from comparisons across their lifetimes.
const sampler = `(() => { const seen = new WeakMap(); let next = 0; window.smallSamples = {}; window.smallStop = false;
 const tick = () => { for (const el of document.querySelectorAll('.tv-layer:not(.is-leaving) .tv-field .tv-word:not(.is-going), .tv-layer:not(.is-leaving) .ai-card, .tv-layer:not(.is-leaving) .ai-group:not(.is-going)')) {
  if (!seen.has(el)) seen.set(el, ++next); const r = el.getBoundingClientRect();
  (window.smallSamples[seen.get(el)] ??= []).push([r.left,r.top,performance.now()]);
 } if (!window.smallStop) requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()`;

type MotionSamples = Record<string, [number, number, number][]>;
async function stopSampling(page: Page, reduced: boolean) {
  const samples = await page.evaluate(() => { const w = window as unknown as { smallSamples: MotionSamples; smallStop: boolean }; w.smallStop = true; return w.smallSamples; });
  let frames = 0, largest = 0;
  for (const pts of Object.values(samples)) for (let i = 1; i < pts.length; i++) {
    // A suspended browser is not an animation frame discontinuity.
    if (pts[i][2] - pts[i - 1][2] > 100) continue;
    frames++; largest = Math.max(largest, Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  assert.ok(frames > 20, "motion was sampled");
  if (!reduced) assert.ok(largest < 150, `nothing jumped across ${frames} frames (largest ${largest.toFixed(1)}px)`);
  return { frames, largest: Math.round(largest * 10) / 10 };
}
async function settle(page: Page) {
  const read = () => page.locator(`${active} [style]`).evaluateAll(els => els.map(el => (el as HTMLElement).style.cssText).join(";"));
  let last = await read();
  for (let i = 0; i < 35; i++) { await delay(200); const now = await read(); if (now === last) return; last = now; }
  throw new Error("The TV did not settle within seven seconds");
}
async function waitForLoneArrival(page: Page) {
  const hold = await page.locator(`${active} .tv-board`).evaluate(el => {
    const value = getComputedStyle(el).getPropertyValue("--cwl-dur-new-hold").trim();
    return value.endsWith("ms") ? parseFloat(value) : parseFloat(value) * 1000;
  });
  assert.ok(Number.isFinite(hold) && hold > 0, "newest-arrival hold token is available");
  await delay(hold + 100);
}
async function geometry(page: Page) {
  return page.locator(`${active} .tv-field`).evaluate(field => {
    const area = field.getBoundingClientRect(), nodes = [...field.querySelectorAll<HTMLElement>(".tv-word:not(.is-going)")];
    const boxes = nodes.map(el => ({ key: el.dataset.key!, size: parseFloat(getComputedStyle(el).fontSize), ...(() => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width }; })() }));
    const clipped = boxes.filter(b => b.left < area.left - 1 || b.top < area.top - 1 || b.right > area.right + 1 || b.bottom > area.bottom + 1).map(b => b.key);
    const overlaps: string[] = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j]; if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) overlaps.push(`${a.key}/${b.key}`); }
    const root = field.closest<HTMLElement>(".tv-board")!, floor = parseFloat(getComputedStyle(root).fontSize);
    return { boxes, clipped, overlaps, floor, height: area.height, width: area.width, scale: Number((field as HTMLElement).dataset.cloudScale), overflow: JSON.parse(root.dataset.overflow ?? "[]") as string[] };
  });
}
async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox(), app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const rows: Record<string, unknown>[] = [], total = { measured: 0, under_second: 0 };
  let expectedMeasured = 0, configurations = 0;
  try {
    await sql.connect(); browser = await chromium.launch();
    for (const skin of ["clearway", "novetera"] as const) for (const size of ["very_small", "medium"] as const) for (const theme of ["dark", "light"] as const) for (const reduced of [false, true]) {
      if (displayFilter && displayFilter !== `${skin}-${size}`) continue;
      const name = `${skin}-${size}-${theme}-${reduced ? "reduced" : "full"}`;
      const room = await engagement(sql, []), fac = await facilitator(env, sql, room.id);
      await sql.query("update public.engagements set type='team_workshop',skin=$2,settings=settings||$3::jsonb where id=$1", [room.id, skin, JSON.stringify({ open_join: true, ai_enabled: true, tv_theme: theme, room_size: size, reduced_motion: reduced })]);
      const cloud = await room.session("Words in a small room", "word_cloud", "What do we value?", 1, { maxSends: 5 });
      await sql.query("update public.sessions set options=options||'{\"ai\":false,\"join_strip\":false}' where id=$1", [cloud]);
      const wall = await room.session("Answers in a small room", "wall", "What have you noticed?", 2, { maxSends: 5 });
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: reduced ? "reduce" : "no-preference" }), tv = await ctx.newPage();
      // Each phone sign-in rotates the private room topic. A first submission
      // during that recovery is a replay, which correctly has no newest moment.
      const joinedSockets = new Map<object, Set<string>>();
      tv.on("websocket", socket => {
        const topics = new Set<string>(); joinedSockets.set(socket, topics);
        socket.on("framereceived", frame => {
          try {
            const message = JSON.parse(typeof frame.payload === "string" ? frame.payload : frame.payload.toString("utf8")) as { topic?: string; event?: string; payload?: unknown } | unknown[];
            const topic = Array.isArray(message) ? message[2] : message.topic;
            const event = Array.isArray(message) ? message[3] : message.event;
            const payload = Array.isArray(message) ? message[4] : message.payload;
            if (event === "phx_reply" && typeof topic === "string" && payload && typeof payload === "object" && "status" in payload && payload.status === "ok") topics.add(topic);
          } catch { /* A non-JSON websocket frame is not a room join. */ }
        });
        socket.on("close", () => joinedSockets.delete(socket));
      });
      const readyForArrival = async () => {
        const target = (await sql.query("select 'realtime:live:'||r.engagement_id::text||':'||t.channel_id::text as topic,r.version::text as version from public.room_states r join private.room_transport t on t.engagement_id=r.engagement_id where r.engagement_id=$1", [room.id])).rows[0] as { topic: string; version: string };
        await until(async () => [...joinedSockets.values()].some(topics => topics.has(target.topic)) && Number(await tv.locator(".tv-stage").getAttribute("data-version")) >= Number(target.version), "paired TV joins the current private room topic and catches up", 15000);
      };
      const origin = skin === "novetera" ? app.noveteraOrigin : app.origin;
      await tv.goto(origin + "/tv");
      const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
      await pairTv(fac, room.id, app.secret, code, `Small room ${name}`);
      await press(fac, sql, room.id, "go_live", { session: cloud });
      await tv.locator(`${active} [data-board=word_cloud]`).waitFor({ timeout: 10000 });
      assert.equal(await tv.locator("main").getAttribute("data-skin"), skin);
      assert.equal(await tv.locator("main").getAttribute("data-room"), size);
      assert.equal(await tv.locator("main").getAttribute("data-theme"), theme);
      const phones = await joinPhones(origin, 20, { room: room.id, prefix: "Small room phone" });
      await readyForArrival();
      const started = new Date(Date.now() - 1000).toISOString(); let sends = 0;
      await tv.evaluate(sampler);
      const chipHeights: number[] = [];
      for (let n = 0; n < words.length; n++) {
        assert.equal((await phones[n % phones.length].send(room.id, cloud, words[n])).status, "accepted", words[n]); sends++;
        // Sequential lone arrivals exercise the Lime moment and avoid a deliberate burst hold.
        await until(async () => Number((await sql.query("select results->>'total' as n from public.room_states where engagement_id=$1", [room.id])).rows[0].n) === n + 1, "answer stored");
        await until(async () => await tv.locator(`${active} [data-board=word_cloud]`).getAttribute("data-empty") === "false", "cloud has input");
        if (n === 0) {
          await until(async () => await tv.locator(`${cloudSelector}.is-single.is-new`).count() === 1, "single word gets the newest-arrival moment", 5000).catch(async error => {
            console.error(`${name}: first-arrival diagnostics`, await tv.locator(`${active} .tv-board`).innerHTML(), "joined topics", [...joinedSockets.values()].flatMap(topics => [...topics]));
            await tv.screenshot({ path: join(evidence, `${name}-first-arrival-failure.png`) }); throw error;
          });
          assert.equal(await tv.locator(`${cloudSelector}.is-leader`).count(), 0, "all-single cloud has no leader");
        }
        if ([3, 8, 20, 60].includes(n + 1)) {
          await until(async () => { const g = await geometry(tv); return g.boxes.length + g.overflow.length === n + 1; }, "every word has a destination", 10000);
          await settle(tv); const g = await geometry(tv);
          assert.deepEqual(g.clipped, [], `${name}/${n + 1}: no cloud word clipped`);
          assert.deepEqual(g.overlaps, [], `${name}/${n + 1}: no cloud words overlap`);
          assert.ok(g.boxes.every(b => b.size >= g.floor - 0.2), "type never falls below the room floor");
          assert.ok(g.boxes.every(b => b.size <= 168 * g.floor / 36 + 0.2 && b.width <= 1281), "headline and width ceilings");
          const chipsHeight = await tv.locator(`${active} .tv-chips`).evaluate(el => el.getBoundingClientRect().height); chipHeights.push(chipsHeight);
          if (n < 20) { assert.equal(g.overflow.length, 0, `${n + 1} words fit without a row`); assert.equal(chipsHeight, 0, "empty row takes no height"); }
          if (n === 2) { assert.ok(g.scale > 1, "a three-word cloud grows above natural size"); assert.ok(g.boxes.every(b => b.size > 56 * g.floor / 36), "three words grow beyond their natural size"); }
          if (n === 59) {
            assert.ok(g.overflow.length > 0, "60 words require the overflow row"); assert.ok(chipsHeight > 0, "overflow row opens");
            assert.deepEqual(g.overflow, wordKeys.slice(0, g.overflow.length), "oldest single words overflow first");
          }
          await tv.screenshot({ path: join(evidence, `${name}-cloud-${n + 1}.png`) });
          rows.push({ name, state: `cloud-${n + 1}`, cloud: g.boxes.length, overflow: g.overflow, scale: g.scale, chipsHeight });
        } else await delay(250);
      }
      const motion = await stopSampling(tv, reduced);
      // Once overflowed, a single stays there after a hide frees space; a second person returns it.
      const before = await geometry(tv), oldest = before.overflow[0];
      const hideWord = before.boxes.at(-1)!.key;
      await press(fac, sql, room.id, "hide", { item: hideWord });
      await until(async () => await tv.locator(`${cloudSelector}[data-key=${JSON.stringify(hideWord)}]`).count() === 0, "hidden cloud word leaves"); await settle(tv);
      assert.ok((await geometry(tv)).overflow.includes(oldest), "hiding does not return overflow singles");
      await press(fac, sql, room.id, "unhide", { item: hideWord });
      const repeatedText = sentText.get(oldest); assert.ok(repeatedText, "overflow key maps to its original phone input");
      assert.equal((await phones[19].send(room.id, cloud, repeatedText)).status, "accepted"); sends++;
      await until(async () => await tv.locator(`${cloudSelector}[data-key=${JSON.stringify(oldest)}]`).count() === 1, "repeated overflow word returns to the cloud", 10000);
      await settle(tv); assert.ok(!(await geometry(tv)).overflow.includes(oldest), "a repeated word never overflows");
      await tv.screenshot({ path: join(evidence, `${name}-cloud-repeated.png`) });
      // This answer cannot fit at the largest room floor. Its second mention
      // must return to the cloud and obey the approved width-only exception.
      const wideText = "W".repeat(28), wideKey = demoWordKey(wideText);
      for (const phone of [phones[0], phones[1]]) {
        assert.equal((await phone.send(room.id, cloud, wideText)).status, "accepted"); sends++;
      }
      await until(async () => await tv.locator(`${cloudSelector}[data-key=${JSON.stringify(wideKey)}].is-repeated, ${cloudSelector}[data-key=${JSON.stringify(wideKey)}].is-leader`).count() === 1, "wide repeated answer remains in the cloud", 10000);
      await settle(tv);
      const widePlan = await geometry(tv), wide = widePlan.boxes.find(box => box.key === wideKey);
      assert.ok(wide, "wide answer has a cloud position");
      assert.ok(wide.width <= 1281, `wide repeated answer stays within 1280px (${wide.width}px)`);
      assert.ok(!widePlan.overflow.includes(wideKey), "wide repeated answer never moves to the row");
      assert.ok(widePlan.boxes.filter(box => box.key !== wideKey).every(box => box.size >= widePlan.floor - 0.2), "ordinary words keep the room floor during the width exception");
      if (size === "very_small") assert.ok(wide.size < widePlan.floor, "the largest room uses the approved width exception");
      assert.deepEqual(widePlan.clipped, [], "wide word is not clipped");
      assert.deepEqual(widePlan.overlaps, [], "wide word does not overlap another word");
      await tv.screenshot({ path: join(evidence, `${name}-cloud-wide-repeated.png`) });
      rows.push({ name, state: "cloud-wide-repeated", key: wideKey, size: wide.size, width: wide.width, floor: widePlan.floor, cloud: widePlan.boxes.length, overflow: widePlan.overflow });
      console.log(`ok · ${name}: cloud 3, 8, 20, 60, sticky overflow, repeated return and width exception; largest frame step ${motion.largest}px`);

      const facCtx = await browser.newContext({ viewport: { width: 1440, height: 1100 } }); await facCtx.addCookies(fac.cookies(app.origin));
      const control = await facCtx.newPage(); await control.goto(`${app.origin}/control/${room.id}`);
      await press(fac, sql, room.id, "go_live", { session: wall });
      await tv.locator(`${active} [data-board=wall]`).waitFor({ timeout: 10000 });
      await readyForArrival();
      const layout = tv.locator(`${active} .ai-wall`), cards = tv.locator(`${active} .ai-cards`), split = tv.locator(`${active} .ai-wall-split`);
      const identity = await cards.evaluate(el => { (window as unknown as { smallCards: Element }).smallCards = el; return true; }); assert.ok(identity);
      const unrelated = ["The roof is repaired", "A new flower bed", "Our accounts are balanced"];
      for (const [i, text] of unrelated.entries()) {
        await waitForLoneArrival(tv);
        assert.equal((await phones[i].send(room.id, wall, text)).status, "accepted"); sends++;
        await until(async () => await cards.locator(".ai-card").count() === i + 1, "answer card arrives", 5000);
        assert.equal(await layout.getAttribute("data-layout"), "cards");
        await until(async () => Number(await split.evaluate(el => getComputedStyle(el).opacity)) === 0, "answer column hidden");
        const order = await cards.locator(".ai-card").allTextContents(); assert.deepEqual(order, unrelated.slice(0, i + 1), "oldest card first");
        assert.ok(await cards.locator(".ai-card.is-newest").count() > 0, "newest answer gets its moment");
        assert.doesNotMatch(await tv.locator("body").innerText(), /Grouping as answers arrive/);
        await settle(tv); await tv.screenshot({ path: join(evidence, `${name}-cards-${i + 1}.png`) });
      }
      await tv.evaluate(`(() => { window.smallTransitions = []; window.smallTransitionStop = false; const tick = () => { const root = document.querySelector('.tv-layer:not(.is-leaving) .ai-wall'); if (root) window.smallTransitions.push([Number(getComputedStyle(root.querySelector('.ai-cards')).opacity), Number(getComputedStyle(root.querySelector('.ai-wall-split')).opacity)]); if (!window.smallTransitionStop) requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()`);
      // Theme-bearing answers are deliberately held together so the fake model forms one group.
      writeFileSync(controlFile, JSON.stringify({ delayMs: 500 }));
      assert.equal((await phones[3].send(room.id, wall, "Three baptisms at Easter")).status, "accepted"); sends++;
      assert.equal((await phones[4].send(room.id, wall, "People asking to be baptized")).status, "accepted"); sends++;
      await until(async () => await layout.getAttribute("data-layout") === "groups", "first group switches to groups", 15000);
      await settle(tv); assert.equal(await cards.evaluate(el => getComputedStyle(el).opacity), "0"); assert.equal(await split.evaluate(el => getComputedStyle(el).opacity), "1");
      assert.equal(await cards.evaluate(el => el === (window as unknown as { smallCards: Element }).smallCards), true, "cards stay mounted through the cross-fade");
      await tv.screenshot({ path: join(evidence, `${name}-first-group.png`) });
      writeFileSync(controlFile, "{}");
      await waitForLoneArrival(tv);
      const columnArrival = "The library has new books";
      assert.equal((await phones[5].send(room.id, wall, columnArrival)).status, "accepted"); sends++;
      await until(async () => await tv.locator(`${active} .ai-wall[data-layout=groups] .tv-feed-row.is-newest`, { hasText: columnArrival }).count() === 1, "newest answer is marked in the visible groups answer column", 5000);
      const group = control.locator('[data-group="Baptisms"]'); await group.getByRole("button", { name: "Undo", exact: true }).click();
      await until(async () => await layout.getAttribute("data-layout") === "cards", "Undo only group returns to cards", 10000);
      await settle(tv); await tv.screenshot({ path: join(evidence, `${name}-undo-group.png`) });
      await control.locator("[data-ai-panel]").getByRole("button", { name: "Show summary", exact: true }).click();
      await until(async () => await layout.getAttribute("data-layout") === "groups", "Show summary uses groups even with no group", 10000);
      await tv.locator(`${active} .ai-summary:not(.is-off)`).waitFor({ timeout: 15000 }); await settle(tv);
      assert.equal(await tv.locator(`${active} .ai-group:not(.is-going)`).count(), 0, "no groups below the summary");
      assert.doesNotMatch(await tv.locator("body").innerText(), /Grouping as answers arrive/);
      await tv.screenshot({ path: join(evidence, `${name}-summary-no-group.png`) });
      const transitions = await tv.evaluate(() => { const w = window as unknown as { smallTransitions: [number, number][]; smallTransitionStop: boolean }; w.smallTransitionStop = true; return w.smallTransitions; });
      if (!reduced) assert.ok(transitions.some(([a, b]) => a > 0.05 && a < 0.95 && b > 0.05 && b < 0.95), "layouts cross-fade through intermediate opacity");
      assert.ok(transitions.every(([a, b]) => a + b >= 0.9), "layouts never blank while cross-fading");
      console.log(`ok · ${name}: cards 1 to 3, first group, Undo and summary without groups`);
      const cookie = fac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
      await delay(1000);
      const response = await fetch(`${app.origin}/api/control/${room.id}/latency?from=${encodeURIComponent(started)}&to=${encodeURIComponent(new Date().toISOString())}`, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200); const report = await response.json() as LatencyReport;
      assert.equal(report.measured, sends, "every accepted answer reached the paired TV");
      assert.ok(verdict(report).met, `${name}: ${verdict(report).label}`);
      assert.equal(report.sessions.length, 2, "latency covers both the cloud and the wall sessions");
      for (const session of report.sessions) {
        assert.ok(session.measured > 0, `${name}/${session.title}: measured phone-to-TV arrivals`);
        assert.ok(verdict(session).met, `${name}/${session.title}: ${verdict(session).label}`);
      }
      total.measured += report.measured; total.under_second += report.under_second; expectedMeasured += sends;
      rows.push({ name, state: "wall-and-motion", motion, latency: report, chipHeights });
      await press(fac, sql, room.id, "nothing_live"); await facCtx.close(); await ctx.close(); configurations++;
    }
    assert.equal(configurations, displayFilter ? 4 : 16, "every requested display configuration ran");
    assert.equal(total.measured, expectedMeasured); assert.ok(total.measured >= 100, "at least 100 phone-to-TV samples"); assert.ok(verdict(total).met, verdict(total).label);
    writeFileSync(join(evidence, "results.json"), JSON.stringify({ recorded: new Date().toISOString(), environment: "local production build, loopback, scripted fake model", display: displayFilter ?? "all", configurations, verdict: verdict(total), total, states: rows }, null, 2) + "\n");
    console.log(`Small-room kit: ${configurations} display configurations passed. ${verdict(total).label} Local loopback evidence only.`);
  } catch (error) { console.error(app.output().slice(-3000)); throw error; }
  finally { await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); rmSync(scratch, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exit(1); });
