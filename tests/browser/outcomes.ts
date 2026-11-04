// Milestone 4, step 4: Outcome bullets (D1-11, D1-12) and Outcome confirm (D2-05, D2-06), in real
// browsers against the production build and the local stack. A paired TV, three signed-in phones and
// the laptop's control surface run the states that apply: a bullet appearing on the TV as it is
// typed, an empty outcome outlined until it has one, the facilitator choosing the outcome, then
// confirm, rename and challenge, a challenged outcome lifting on the control surface, and the room's
// decision recorded. Then 50 simulated phones in the practice room type in bursts and send: every
// sent bullet reaches the TV in under one second on loopback, typed text reaches it as it is typed
// without a room update per keystroke, and the TV's counts match the server's.
// KIT_SHOTS=<folder> saves each screen for review. Local only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { practiceRoom } from "../../scripts/load-test";
import { verdict, type LatencyReport } from "../../lib/latency/report";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

const titles = ["Leaders raised from within", "New faith stories", "A church that shows up for the city", "Families find a home here", "Homes and every generation"];

// A simulated phone in the practice room: joins by name, sends through the real endpoints.
class SimPhone {
  private jar = new Map<string, string>(); offset = 0;
  constructor(private origin: string) {}
  async call(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers); headers.set("Origin", this.origin);
    if (this.jar.size) headers.set("Cookie", [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "));
    if (init.body) headers.set("Content-Type", "application/json");
    const response = await fetch(this.origin + path, { ...init, headers, redirect: "manual" });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";"), at = pair.indexOf("="), name = pair.slice(0, at), value = pair.slice(at + 1);
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(cookie) || !value) this.jar.delete(name); else this.jar.set(name, value);
    }
    return response;
  }
  async join(name: string) {
    await this.call(`/api/room/${practiceRoom}/init`, { method: "POST", body: "{}" });
    const joined = await (await this.call(`/api/room/${practiceRoom}/practice`, { method: "POST", body: JSON.stringify({ name }) })).json();
    if (!["signed_in", "approved"].includes(joined.status)) throw new Error(`Practice join refused: ${joined.status}`);
  }
  async send(session: string, id: string, revision: number, text: string, value: unknown) {
    const body = { id, session, revision, action: revision ? "change" : "submit", text, value, sentAt: new Date(Date.now() + this.offset).toISOString(), uncertaintyMs: 5 };
    const response = await this.call(`/api/live/${practiceRoom}`, { method: "POST", body: JSON.stringify(body) });
    return ((await response.json().catch(() => ({ status: `http_${response.status}` }))) as { status: string }).status;
  }
  async type(session: string, id: string, outcome: string, text: string, seq: number) {
    const response = await this.call(`/api/live/${practiceRoom}/type`, { method: "POST", body: JSON.stringify({ action: "type", id, session, outcome, text, seq }) });
    return await response.json().catch(() => ({ status: `http_${response.status}` })) as { status: string; pending?: boolean; wait_ms?: number };
  }
  async nudge(session: string) {
    await this.call(`/api/live/${practiceRoom}/type`, { method: "POST", body: JSON.stringify({ action: "nudge", session }) });
  }
}

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [], load: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(1300); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  const cleanup: (() => Promise<unknown>)[] = [];
  try {
    await sql.connect();
    const room = await engagement(sql, ["Priya", "Ben", "Ruth"]);
    for (const [i, full] of ["Priya Shah", "Ben Ortiz", "Ruth Morrison"].entries()) await sql.query("update public.attendees set name=$2 where id=$1", [room.attendees[i].id, full]);
    const outcomes: string[] = [];
    for (const [i, title] of titles.slice(0, 4).entries()) outcomes.push((await sql.query("insert into private.vision_outcomes(engagement_id,title,position) values($1,$2,$3) returning id", [room.id, title, i])).rows[0].id);
    await sql.query("insert into private.outcome_indicators(engagement_id,outcome_id,text,position) values($1,$2,'12 apprentice leaders serve alongside a ministry lead',0)", [room.id, outcomes[0]]);
    const bulletsId = await room.session("In 2029, what's true?", "bullets", "In {{year}}, what's true?", 1, { maxSends: 6, maxChars: 200 });
    const confirmId = await room.session("Confirm the outcomes", "confirm", "Confirm, rename or challenge each outcome", 2, { maxSends: 1, maxChars: 280 });
    await sql.query("update public.sessions set settings=settings||jsonb_build_object('anonymous',true) where id=any($1)", [[bulletsId, confirmId]]);
    const fac = await facilitator(env, sql, room.id);
    browser = await chromium.launch();

    const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvContext.newPage(); await tv.goto(app.origin + "/tv");
    const pairCode = async (page: Page) => until(async () => { const c = (await page.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(fac, room.id, app.secret, await pairCode(tv));
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
    const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
    const results = async (id = room.id) => (await sql.query("select results from public.room_states where engagement_id=$1", [id])).rows[0].results;

    async function phone(person: { email: string }) {
      const ctx = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage(); await page.goto(`${app.origin}/room/${room.id}`);
      const before = mail.count;
      await page.fill("#room-email", person.email); await page.getByRole("button", { name: "Send me a sign-in code" }).click();
      await page.fill("#room-code", await mail.code(person.email, before)); await page.getByRole("button", { name: "Sign in" }).click();
      await page.locator(".ph-app").waitFor({ timeout: 15000 });
      return { ctx, page };
    }
    const [priya, ben, ruth] = [await phone(room.attendees[0]), await phone(room.attendees[1]), await phone(room.attendees[2])];
    const facContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await facContext.addCookies(fac.cookies(app.origin));
    const control = await facContext.newPage(); await control.goto(`${app.origin}/control/${room.id}`);
    await control.locator(".ctl-app").waitFor({ timeout: 15000 });
    const live = async (session: string, kind: string) => { await press(fac, sql, room.id, "go_live", { session }); await tv.locator(`.tv-layer:not(.is-leaving)[data-kind="${kind}"] .tv-oc`).waitFor({ timeout: 10000 }); };

    // ---------- Outcome bullets ----------
    await step("D1-11: the question, the first outcome and the rail; an outcome with no bullets is outlined until it has one", async () => {
      await live(bulletsId, "bullets");
      assert.equal(await layer().locator(".oc-title .oc-t").innerText(), titles[0]);
      assert.equal(await layer().locator(".oc-orow").count(), 4, "the rail lists every outcome");
      assert.equal(await layer().locator(".oc-orow.is-flagged").count(), 3, "three outcomes have no bullet: outlined");
      assert.ok((await layer().locator(".oc-orow.is-flagged").first().innerText()).includes("Empty"));
      await shot(tv, "d1-11-bullets-tv");
    });
    await step("D1-11: a bullet appears on the TV as it is typed, before it is added; adding keeps it", async () => {
      await priya.page.locator("#oc-bullet").waitFor({ timeout: 10000 });
      const text = "Every new family is known by name within a month";
      await priya.page.locator("#oc-bullet").pressSequentially(text.slice(0, 16), { delay: 70 });
      await until(async () => { const t = await layer().locator(".oc-bullet.is-typing").innerText().catch(() => ""); return t.length >= 8 && text.startsWith(t.trim()) ? t : null; }, "the first letters on the TV while typing", 4000);
      await priya.page.locator("#oc-bullet").pressSequentially(text.slice(16), { delay: 40 });
      await until(async () => (await layer().locator(".oc-bullet").last().innerText()).trim() === text, "the whole bullet on the TV as typed", 4000);
      assert.equal(await layer().locator(".oc-bullet.is-typing").count(), 1, "still marked as typing until it is added");
      await shot(tv, "d1-11-typing-tv"); await shot(priya.page, "d1-11-typing-phone");
      await priya.page.getByRole("button", { name: "Add bullet" }).click();
      await until(async () => await layer().locator(".oc-bullet.is-typing").count() === 0 && (await layer().locator(".oc-bullet").last().innerText()).trim() === text, "added", 4000);
      await until(async () => (await sql.query("select count(*)::int as n from private.outcome_indicators where outcome_id=$1 and not deleted", [outcomes[0]])).rows[0].n === 2, "the bullet is the outcome's indicator", 4000);
      assert.equal((await priya.page.locator("#oc-bullet").inputValue()), "", "the box is ready for the next bullet");
    });
    await step("D1-11: the facilitator chooses the outcome; the TV changes at once, and the empty one is outlined", async () => {
      await until(async () => await control.locator(".oc-panel").count() > 0, "the panel", 10000);
      await control.locator(".oc-panel li", { hasText: titles[3] }).getByRole("button", { name: "Show on the screen" }).click();
      await until(async () => (await layer().locator(".oc-title .oc-t").innerText()) === titles[3], "the TV on the fourth outcome", 4000);
      assert.equal(await layer().locator(".oc-empty").count(), 1, "outlined with Needs a bullet");
      assert.ok((await layer().locator(".oc-empty").innerText()).includes("Needs a bullet"));
      await shot(tv, "d1-11-empty-tv"); await shot(control, "d1-11-control");
      await ben.page.locator("#oc-bullet").fill("Parents leave the building feeling known");
      await ben.page.getByRole("button", { name: "Add bullet" }).click();
      await until(async () => await layer().locator(".oc-empty").count() === 0 && (await layer().locator(".oc-bullet").innerText()).includes("known"), "the empty flag clears", 4000);
    });

    // ---------- Outcome confirm ----------
    const pick = async (page: Page, title: string, name: string) => page.locator("fieldset", { hasText: title }).getByRole("button", { name, exact: true }).click();
    await step("D2-05: phones confirm, rename or challenge with an optional reason; the TV shows counts only", async () => {
      await live(confirmId, "confirm");
      assert.equal(await layer().locator(".oc-crow").count(), 4);
      for (const person of [priya, ben, ruth]) await person.page.locator("fieldset").first().waitFor({ timeout: 10000 });
      await pick(priya.page, titles[0], "Confirm"); await pick(priya.page, titles[1], "Challenge");
      await priya.page.locator("textarea").first().fill("Too broad to act on");
      await pick(priya.page, titles[2], "Rename"); await priya.page.locator('input[id^="oc-name-"]').fill("A church for the city");
      await priya.page.getByRole("button", { name: "Send answers" }).click();
      await pick(ben.page, titles[0], "Confirm"); await pick(ben.page, titles[1], "Challenge"); await ben.page.getByRole("button", { name: "Send answers" }).click();
      await pick(ruth.page, titles[0], "Confirm"); await pick(ruth.page, titles[1], "Confirm"); await ruth.page.getByRole("button", { name: "Send answers" }).click();
      const row = (n: number) => layer().locator(".oc-crow").nth(n);
      const counts = (n: number) => row(n).locator(".oc-cnts > span").evaluateAll(els => els.map(el => Number(el.textContent)));
      await until(async () => (await counts(0))[0] === 3, "three confirm the first outcome", 5000);
      assert.deepEqual(await counts(1), [1, 0, 2], "one confirm, none rename, two challenge");
      const page = await tv.content();
      assert.ok(!page.includes("Too broad to act on") && !page.includes("A church for the city"), "no reason or suggested name reaches the TV");
      assert.equal(await row(1).evaluate(el => el.classList.contains("is-challenged")), true, "the challenged outcome gets a soft highlight");
      assert.equal((await results()).people, 3, "counted by people");
      await shot(tv, "d2-05-confirm-tv"); await shot(priya.page, "d2-05-confirm-phone");
    });
    await step("D2-06: a challenged outcome lifts on the control surface, and the facilitator records the room's decision", async () => {
      await until(async () => await control.locator(".oc-panel-row").count() === 4, "the outcomes on the control surface", 10000);
      assert.ok((await control.locator(".oc-panel-row").first().innerText()).includes(titles[1]), "the challenged outcome is first");
      assert.ok((await control.locator(".oc-panel-row").first().innerText()).includes("Too broad to act on"), "with its reason, for the facilitator only");
      assert.ok((await control.locator(".oc-panel-row").first().innerText()).includes("Counts show where the room is"), "counts never decide");
      await shot(control, "d2-06-control");
      const card = control.locator(".oc-panel-row", { hasText: titles[0] });
      await card.locator("input[id^=oc-d-]").fill("Leaders come from within our own church.");
      await card.locator("textarea[id^=oc-s-]").fill("Hiring leaders from outside first");
      await card.getByRole("button", { name: "Mark the room’s decision" }).click();
      await until(async () => await layer().locator(".oc-crow.is-decided").count() === 1, "the row confirms on the TV", 5000);
      await shot(tv, "d2-06-confirmed-tv");
      const decision = (await sql.query("select subject,decision,subject_id from private.decisions where engagement_id=$1 and not deleted", [room.id])).rows;
      assert.deepEqual(decision.map(d => [d.subject, d.decision, d.subject_id]), [["outcome", "Confirmed", outcomes[0]]]);
      const o = (await sql.query("select status,description,what_we_stop from private.vision_outcomes where id=$1", [outcomes[0]])).rows[0];
      assert.deepEqual(o, { status: "confirmed", description: "Leaders come from within our own church.", what_we_stop: "Hiring leaders from outside first" });
      assert.equal((await sql.query("select status from private.vision_outcomes where id=$1", [outcomes[1]])).rows[0].status, "provisional", "a challenge count never decides");
      assert.ok((await control.locator(".oc-warning").innerText()).includes("four to six"), "fewer than four confirmed: a note, not a block");
      const rename = control.locator(".oc-panel-row", { hasText: titles[2] });
      await rename.getByRole("button", { name: "Renamed" }).click(); await rename.locator("input[id^=oc-n-]").fill("A church for the city");
      await rename.getByRole("button", { name: "Mark the room’s decision" }).click();
      await until(async () => (await layer().locator(".oc-crow.is-decided").allInnerTexts()).some(t => t.includes("A church for the city") && t.includes(titles[2])), "renamed, with the old name struck through", 5000);
      await shot(tv, "d2-06-renamed-tv");
    });

    // ---------- Crowded: 50 simulated phones in the practice room ----------
    await Promise.all([priya.ctx, ben.ctx, ruth.ctx, facContext, tvContext].map(c => c.close()));
    const seeded = (await sql.query("select 1 from public.engagements where id=$1 and not deleted", [practiceRoom])).rowCount;
    assert.equal(seeded, 1, "Run npm run db:seed first: the crowded runs use the permanent practice room");
    const pfac = await facilitator(env, sql, practiceRoom);
    const ptvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const ptv = await ptvContext.newPage(); await ptv.goto(app.origin + "/tv");
    await pairTv(pfac, practiceRoom, app.secret, await pairCode(ptv), "Outcomes kit TV");
    const pLayer = () => ptv.locator(".tv-layer:not(.is-leaving)").last();
    const cookie = pfac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
    const tag = randomUUID().slice(0, 6);
    const pout: string[] = [];
    for (const [i, title] of titles.entries()) pout.push((await sql.query("insert into private.vision_outcomes(engagement_id,title,position) values($1,$2,$3) returning id", [practiceRoom, `${title} ${tag}`, i])).rows[0].id);
    cleanup.push(() => sql.query("update private.vision_outcomes set deleted=true where id=any($1)", [pout]));
    const psession = async (kind: string, max: number) => (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,options,settings,max_sends,max_characters,max_words)
      values($1,$2,'Day 1',950,$3,$4,'ready','{}',jsonb_build_object('anonymous',true,'burst_minutes',4,'join_strip',false),$5,200,50) returning id`, [practiceRoom, `Kit ${kind} ${tag}`, kind, `Fifty phones: ${kind}`, max])).rows[0].id as string;
    const pbul = await psession("bullets", 3), pcon = await psession("confirm", 1);
    const phones: SimPhone[] = [];
    for (let start = 0; start < 50; start += 10) {
      const batch = Array.from({ length: 10 }, () => new SimPhone(app.origin));
      await Promise.all(batch.map((p, i) => p.join(`Kit phone ${String(start + i + 1).padStart(2, "0")}`)));
      phones.push(...batch);
    }
    const sample = await (await phones[0].call(`/api/live/${practiceRoom}?surface=phone`, { cache: "no-store" })).json();
    for (const p of phones) p.offset = Date.parse(sample.server_time) - Date.now();
    async function report(from: string): Promise<LatencyReport> {
      await delay(3000);
      const to = new Date().toISOString();
      const response = await fetch(`${app.origin}/api/control/${practiceRoom}/latency?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { headers: { Cookie: cookie } });
      assert.ok(response.ok, "the latency report reads"); return await response.json() as LatencyReport;
    }
    let seed = 13; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const version = async () => Number((await sql.query("select version from public.room_states where engagement_id=$1", [practiceRoom])).rows[0].version);
    const sentences = ["Every new family is known by name", "Leaders are raised from within", "Our groups multiply every year", "Prayer fills the week", "Young adults serve as leaders", "Neighbors ask to join us"];
    async function crowd(kind: string, session: string, sends: (p: SimPhone, i: number) => Promise<string[]>) {
      await press(pfac, sql, practiceRoom, "go_live", { session });
      await ptv.locator(`.tv-layer:not(.is-leaving)[data-kind="${kind}"] .tv-oc`).waitFor({ timeout: 10000 });
      await delay(1200);
      const from = new Date(Date.now() - 500).toISOString();
      const statuses = (await Promise.all(phones.map(async (p, i) => { await delay(Math.floor(rnd() * 4000)); return sends(p, i); }))).flat();
      const r = await report(from);
      assert.ok(statuses.every(s => s === "accepted"), `${kind}: every answer accepted (${JSON.stringify(statuses.filter(s => s !== "accepted").slice(0, 3))})`);
      assert.equal(r.measured, statuses.length, `${kind}: every answer reached the TV and was logged`);
      const line = `${kind}: ${statuses.length} answers from 50 phones, phone to TV median ${r.phone_tv.p50} ms, 95th ${r.phone_tv.p95} ms, slowest ${r.phone_tv.max} ms (phone to server 95th ${r.phone_server.p95} ms, server to TV 95th ${r.server_tv.p95} ms)`;
      assert.ok(verdict(r).met, `${kind}: 95 of 100 under one second on loopback. ${line}`);
      load.push(`${line} (${verdict(r).label})`);
      return r;
    }
    await step("D1-11 Crowded, 50 phones: typing bursts then Add, every bullet on the TV in under a second, and the room is not told on every keystroke", async () => {
      const typed = { requests: 0, pending: 0 };
      const v0 = await version(), t0 = Date.now();
      await crowd("bullets", pbul, async (p, i) => {
        const out: string[] = [];
        for (let b = 0; b < 2; b++) {
          const id = randomUUID(), outcome = pout[0], text = `${sentences[(i + b) % sentences.length]} ${i}`;
          // A burst of typed updates, a few letters at a time, about 150 ms apart, then Add.
          let seq = 0;
          for (let n = 4; n < text.length + 4; n += 4) {
            const reply = await p.type(pbul, id, outcome, text.slice(0, Math.min(n, text.length)), ++seq);
            typed.requests++; if (reply.pending) typed.pending++;
            assert.ok(["ok", "locked"].includes(reply.status), `typed update accepted (${JSON.stringify(reply)})`);
            await delay(120 + Math.floor(rnd() * 60));
          }
          await p.nudge(pbul);
          out.push(await p.send(pbul, id, 0, text, { outcome }));
          await delay(200 + Math.floor(rnd() * 400));
        }
        return out;
      });
      const bumps = (await version()) - v0, windows = Math.ceil((Date.now() - t0) / 120);
      assert.ok(typed.requests > 600, `${typed.requests} typed updates were sent`);
      assert.ok(bumps < typed.requests, `the room was told ${bumps} times for ${typed.requests} typed updates and 100 added bullets (at most one per 120 ms: ${windows} windows)`);
      assert.ok(bumps <= windows + 100 + 10, `at most one room update per window plus one per added bullet (${bumps})`);
      load.push(`bullets typing: ${typed.requests} typed updates, ${typed.pending} held for the window, ${bumps} room updates over ${Math.round((Date.now() - t0) / 1000)} s`);
      const server = (await results(practiceRoom)).current as { count: number; bullets: unknown[] };
      assert.ok(server.count >= 100, "the server holds every bullet");
      await until(async () => /^\+ \d+ earlier bullets? on your phones$/.test(await pLayer().locator(".oc-more").innerText()), "the rest are counted, not dropped", 8000);
      assert.equal(await pLayer().locator(".oc-bullet").count(), 6, "the newest six show");
      assert.equal(await ptv.locator(".tv-foot .tv-tally").innerText(), "100 bullets");
      await shot(ptv, "d1-11-crowded-tv");
    });
    await step("D2-05 Crowded, 50 phones: confirm, rename and challenge, the TV's counts match the server and no reason reaches it", async () => {
      await crowd("confirm", pcon, async (p, i) => {
        const pick = ["confirm", "confirm", "challenge", "rename"][i % 4];
        const entry = (c: string) => c === "rename" ? { c, name: `Kit name ${i}`, reason: "kitsecret reason" } : c === "challenge" ? { c, reason: "kitsecret reason" } : { c };
        return [await p.send(pcon, randomUUID(), 0, "x", { outcomes: { [pout[0]]: entry("confirm"), [pout[1]]: entry(pick), [pout[2]]: entry(i % 2 ? "confirm" : "challenge") } })];
      });
      await delay(1500);
      const server = (await results(practiceRoom)).outcomes as { id: string; c: number; r: number; x: number; challenged: boolean }[];
      assert.equal((await results(practiceRoom)).people, 50, "counted by people");
      await until(async () => {
        const rows = await pLayer().locator(".oc-crow").evaluateAll(els => els.map(el => ({ counts: [...el.querySelectorAll(".oc-cnts > span")].map(c => Number(c.textContent)), hot: el.classList.contains("is-challenged") })));
        return rows.length === server.length && server.every((s, i) => (s.challenged ? rows[i].hot : true) && rows[i].counts.join(",") === [s.c, s.r, s.x].join(","));
      }, "the counts on the TV are the server's", 8000);
      assert.equal(await ptv.locator(".tv-foot .tv-tally").innerText(), "50 answering");
      assert.ok(!(await ptv.content()).includes("kitsecret"), "no reason reaches the TV");
      await shot(ptv, "d2-05-crowded-tv");
    });
    await press(pfac, sql, practiceRoom, "nothing_live");
    console.log(load.join("\n"));
    console.log(`Outcome bullets and confirm kit: ${passed.length} checks passed. Local checks on loopback; venue acceptance is the practice-room run.`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally { for (const run of cleanup) await run().catch(() => {}); await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); }
}
main().catch(error => { console.error(error); process.exit(1); });
