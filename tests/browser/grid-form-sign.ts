// Milestone 3, step 3: the 2x2 grid (INT-08), the private form (INT-09) and sign together
// (INT-10), in real browsers against the production build and the local stack. Each runs
// on a paired TV and three signed-in phones through the nine states that apply, with the
// laptop's own controls (merge, close signing) pressed in the control surface. Then 50
// simulated phones answer each kind in the practice room: every answer reaches the TV in
// under one second on loopback, nothing on the TV jumps, and the TV's numbers match the
// server's. KIT_SHOTS=<folder> saves each screen for review. Local only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { practiceRoom } from "../../scripts/load-test";
import { verdict, type LatencyReport } from "../../lib/latency/report";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

const gridItems = ["Online newcomer path", "Prayer room", "Leader residency", "Youth night", "Data dashboard", "Coffee bar"];
const longLabel = "A clear, written pathway from a first Sunday visit to joining a small group within six weeks";
const signText = "We commit to the goals we set together this weekend.\n\nWe will pray for them and for each other.\n\n## Our first goal\nLaunch the leader residency by September.\n\n## How we will hold each other\nWe meet monthly to review the plan.";

// A simulated phone in the practice room: joins by name, sends through the real endpoint.
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
  async send(session: string, id: string, revision: number, value: unknown) {
    const body = { id, session, revision, action: revision ? "change" : "submit", text: "x", value, sentAt: new Date(Date.now() + this.offset).toISOString(), uncertaintyMs: 5 };
    const response = await this.call(`/api/live/${practiceRoom}`, { method: "POST", body: JSON.stringify(body) });
    return ((await response.json().catch(() => ({ status: `http_${response.status}` }))) as { status: string }).status;
  }
}

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [], load: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(1300); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    const room = await engagement(sql, ["Priya", "Ben", "Ruth"]);
    for (const [i, full] of ["Priya Shah", "Ben Ortiz", "Ruth Morrison"].entries()) await sql.query("update public.attendees set name=$2 where id=$1", [room.attendees[i].id, full]);
    const add = async (title: string, kind: string, prompt: string, position: number, options: Record<string, unknown>, named = false) => {
      const id = await room.session(title, kind, prompt, position);
      await sql.query("update public.sessions set options=$2,settings=settings||jsonb_build_object('anonymous',$3::boolean) where id=$1", [id, options, !named]); return id;
    };
    const items = gridItems.map((text, i) => ({ key: `i${i + 1}`, text }));
    const grid = await add("Place each idea", "grid", "Where does each idea sit?", 1, { items: items.slice(0, 5) });
    const premortem = await add("Pre-mortem", "grid", "It's 2029 and this plan failed. Why?", 2, { preset: "pre_mortem", x_label: "Likelihood", x_low: "Unlikely", x_high: "Likely", y_label: "Impact", y_low: "Low", y_high: "High", legend: "Reasons it failed",
      items: [{ key: "r1", text: "Leaders already at capacity" }, { key: "r2", text: "No campus pastor ready" }, { key: "r3", text: longLabel }] });
    const form = await add("Before we start", "form", "A few questions just for the facilitators", 3, { questions: [{ key: "q1", text: "What would make this retreat a win for you?" }, { key: "q2", text: "Anything we should know before tomorrow?" }] });
    const sign = await add("Our shared commitment", "sign", "Our shared commitment", 4, { text: signText }, true);
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
    const live = async (session: string) => { await press(fac, sql, room.id, "go_live", { session }); await delay(1100); };
    // One row of the control surface's item list, by its own text (not the Merge into choices).
    const row = (text: string) => control.locator(".ctl-item-list li").filter({ has: control.locator(".ctl-item-text", { hasText: text }) });

    // Grid helpers: where a placement goes on the phone, and where a dot sits on the TV.
    const place = async (page: Page, n: number, gx: number, gy: number) => {
      await page.locator(".gfs-chip").nth(n - 1).click();
      const box = (await page.locator(".gfs-phplot").boundingBox())!;
      await page.mouse.click(box.x + (0.08 + gx * 0.84) * box.width, box.y + (0.08 + (1 - gy) * 0.84) * box.height);
    };
    const dots = async () => layer().locator(".gfs-dot").evaluateAll(els => els.filter(el => getComputedStyle(el).opacity !== "0").map(el => {
      const plot = el.closest(".gfs-plot")!.getBoundingClientRect(), r = el.getBoundingClientRect();
      return { n: Number(el.textContent), x: (r.left + r.width / 2 - plot.left) / plot.width, y: 1 - (r.top + r.height / 2 - plot.top) / plot.height };
    }));
    const legend = async () => layer().locator(".gfs-leg:not([aria-hidden])").evaluateAll(els => els.filter(el => Number(getComputedStyle(el).opacity) > 0.5).map(el => ({ n: Number(el.querySelector("i")!.textContent), count: Number(el.querySelector("small")!.textContent!.replace(/\D/g, "")) })));
    // The TV's dots and legend must say what the server computed, once motion settles.
    async function matchesServer(label: string, id = room.id, page = tv) {
      const server = (await results(id)).items.filter((i: { count: number; into?: string }) => i.count > 0 && !i.into) as { num: number; count: number; x: number; y: number }[];
      let seen = "";
      await until(async () => {
        const shown = page === tv ? await dots() : [], rows = page === tv ? await legend() : [];
        // Rows that do not fit beside the plot at this room size wait on phones: "+ 2 more on your phones".
        const more = Number((await layer().locator(".gfs-legend-more").innerText()).match(/\d+/)?.[0] ?? 0);
        seen = JSON.stringify({ shown, rows, more });
        return shown.length === server.length && server.every(s => { const d = shown.find(x => x.n === s.num); return d && Math.abs(d.x - s.x) < 0.12 && Math.abs(d.y - s.y) < 0.14; })
          && rows.length > 0 && rows.length + more === server.length && rows.every(r => server.find(s => s.num === r.n)?.count === r.count)
          && [...rows].sort((a, b) => a.n - b.n).every((r, i) => r.n === [...server].sort((a, b) => a.num - b.num)[i].num);
      }, `${label}: the TV matches the server`, 8000).catch(error => { throw new Error(`${error.message}\nserver ${JSON.stringify(server)}\nTV ${seen}`); });
    }

    // ---------- Run of show ----------
    await step("SET-07: the grid's settings in the run of show, ten items at most, and the pre-mortem preset", async () => {
      const editor = await facContext.newPage(); await editor.goto(`${app.origin}/setup/${room.id}/run-of-show`);
      await editor.locator(".rb-row", { hasText: "Place each idea" }).getByRole("button", { name: /Open options/ }).click();
      await editor.locator(".rb-row.is-open #grid-preset").waitFor();
      assert.equal(await editor.locator(".gfs-lines li").count(), 5, "the five items");
      await editor.getByRole("button", { name: "Add an item" }).click();
      await editor.locator("#grid-item-5").fill(gridItems[5]);
      for (let i = 6; i < 10; i++) { await editor.getByRole("button", { name: "Add an item" }).click(); await editor.locator(`#grid-item-${i}`).fill(`Spare idea ${i + 1}`); }
      assert.equal(await editor.getByRole("button", { name: "Add an item" }).isDisabled(), true, "a grid holds ten items at most");
      await shot(editor, "set-07-grid-options");
      for (let i = 9; i >= 6; i--) await editor.getByRole("button", { name: `Remove Spare idea ${i + 1}` }).click();
      await editor.locator(".rb-row.is-open").getByRole("button", { name: "Done", exact: true }).click();
      await until(async () => (await sql.query("select jsonb_array_length(options->'items') as n from public.sessions where id=$1", [grid])).rows[0].n === 6, "six items saved", 10000);
      await editor.locator(".rb-row", { hasText: "Our shared commitment" }).getByRole("button", { name: /Open options/ }).click();
      await editor.locator(".rb-row.is-open #sign-text").waitFor();
      assert.ok((await editor.locator(".rb-row.is-open .show-panel").innerText()).includes("Named by design"), "sign together is named by design");
      await shot(editor, "set-07-sign-options");
      await editor.close();
    });

    // ---------- INT-08 2x2 grid ----------
    await step("INT-08 Empty: the axes, the quadrant lines and an empty legend; the phone shows the numbers and the grid", async () => {
      await live(grid);
      await until(async () => (await layer().locator(".gfs-xname").innerText()).includes("Effort"), "axes on the TV", 10000);
      assert.equal((await dots()).length, 0, "no dots yet");
      assert.equal(await layer().locator(".tv-note").count(), 0, "the plot is the structure: no Waiting for answers");
      await until(async () => await priya.page.locator(".gfs-chip").count() === 6, "six numbers on the phone");
      assert.equal(await priya.page.locator(".gfs-chip.is-on").innerText(), "1", "number 1 is selected first");
      await shot(tv, "int-08-empty-tv"); await shot(priya.page, "int-08-empty-phone");
    });
    await step("INT-08 First item: one placement lands as a numbered dot with its Lime moment, under a second", async () => {
      const t0 = Date.now();
      await place(priya.page, 1, 0.25, 0.8);
      await until(async () => (await dots()).length === 1, "dot 1 on the TV", 3000);
      const ms = Date.now() - t0;
      assert.ok(ms < 1000, `phone to TV ${ms} ms`);
      assert.equal(await layer().locator(".gfs-dot.is-new").count(), 1, "the first appearance holds Lime for its moment");
      assert.equal(await priya.page.locator(".gfs-chip.is-on").innerText(), "2", "placing moves on to the next number");
      await shot(tv, "int-08-first-tv"); await shot(priya.page, "int-08-first-phone");
      await matchesServer("first item");
    });
    await step("INT-08 Typical: one dot per item at the mean, faint placements once two have placed it, each placement sent as made", async () => {
      await place(priya.page, 2, 0.6, 0.55); await place(priya.page, 3, 0.75, 0.85);
      await place(ben.page, 1, 0.35, 0.7); await place(ben.page, 2, 0.55, 0.45); await place(ben.page, 5, 0.3, 0.3);
      await place(ruth.page, 1, 0.15, 0.9); await place(ruth.page, 4, 0.8, 0.2); await place(ruth.page, 6, 0.5, 0.65);
      await until(async () => (await results()).people === 3 && (await results()).total === 9, "nine placements from three people", 8000);
      await matchesServer("typical");
      const one = (await results()).items.find((i: { key: string }) => i.key === "i1");
      assert.equal(one.count, 3); assert.ok(Math.abs(one.x - 0.25) < 0.01 && Math.abs(one.y - 0.8) < 0.01, "the mean of 0.25, 0.35 and 0.15, and of 0.8, 0.7 and 0.9");
      assert.equal(await layer().locator(".gfs-faint.cwl-i1").count(), 3, "three faint dots behind item 1, in its color");
      assert.equal(await layer().locator(".gfs-faint.cwl-i3").count(), 0, "one placement: no faint dot");
      const rows = await sql.query("select count(*)::integer as n from public.submissions where session_id=$1 and not withdrawn", [grid]);
      assert.equal(rows.rows[0].n, 3, "one standing answer per person holds the whole set");
      assert.equal(await tv.locator(".tv-top .tv-tally").getAttribute("aria-label").then(v => v ?? ""), "3 answering", "counted by people, bottom right");
      await shot(tv, "int-08-typical-tv"); await shot(ben.page, "int-08-typical-phone");
    });
    await step("INT-08 Drag a placed dot: the TV's dot glides to the new mean on the regroup spring, never jumping", async () => {
      // Plain script text, so the test runner's transform adds no helpers to the page.
      await tv.evaluate(`(() => { window.__track = [];
        const loop = () => { const el = [...document.querySelectorAll(".tv-layer:not(.is-leaving) .gfs-dot")].find(d => d.textContent === "3");
          if (el) { const r = el.getBoundingClientRect(); window.__track.push([r.left + r.width / 2, r.top + r.height / 2]); } if (window.__track.length < 400) requestAnimationFrame(loop); };
        requestAnimationFrame(loop); })()`);
      const box = (await priya.page.locator(".gfs-phplot").boundingBox())!, pin = (await priya.page.locator(".gfs-pin", { hasText: /^3$/ }).boundingBox())!;
      await priya.page.mouse.move(pin.x + pin.width / 2, pin.y + pin.height / 2); await priya.page.mouse.down();
      await priya.page.mouse.move(box.x + 0.2 * box.width, box.y + 0.75 * box.height, { steps: 10 }); await priya.page.mouse.up();
      await until(async () => { const r = (await results()).items.find((i: { key: string }) => i.key === "i3"); return r && r.x < 0.3; }, "the moved placement reaches the server", 5000);
      await delay(1600);
      const track = await tv.evaluate(() => (window as unknown as { __track: number[][] }).__track);
      const steps = track.slice(1).map((p, i) => Math.hypot(p[0] - track[i][0], p[1] - track[i][1])), total = Math.hypot(track.at(-1)![0] - track[0][0], track.at(-1)![1] - track[0][1]);
      assert.ok(total > 100, `the dot travelled (${Math.round(total)} px)`);
      assert.ok(Math.max(...steps) < total * 0.25, `no frame moves more than a quarter of the way (${Math.round(Math.max(...steps))} of ${Math.round(total)} px)`);
      await matchesServer("after a drag");
    });
    await step("INT-08 Spotlight an item from the control surface: its dot is ringed in Sunrise and the rest step back", async () => {
      await until(async () => await control.locator(".ctl-items h2", { hasText: "Items on the grid" }).count() === 1, "the grid's own item list", 10000);
      await row("Online newcomer path").getByRole("button", { name: "Spotlight" }).click();
      await until(async () => await layer().locator(".gfs-dot.is-spot").count() === 1, "spotlit dot");
      assert.ok(await layer().locator(".gfs-dot.is-dim").count() >= 4, "others dim");
      await shot(tv, "int-08-spotlight-tv"); await shot(control, "int-08-control");
      await control.getByRole("button", { name: "Clear" }).first().click();
      await until(async () => await layer().locator(".gfs-dot.is-spot").count() === 0, "spotlight cleared");
    });
    await step("INT-08 Duplicates merge: the duplicate's dot glides into the survivor and fades while the survivor grows; Undo brings it back", async () => {
      // Ruth placed Coffee bar; Priya and Ben placed Prayer room. Merged, Prayer room counts three.
      const before = (await results()).items.find((i: { key: string }) => i.key === "i2").count;
      await row("Coffee bar").locator("select").selectOption("i2");
      await until(async () => (await results()).items.find((i: { text: string }) => i.text === "Coffee bar").into === "i2", "merged on the server", 5000);
      await until(async () => !(await dots()).some(d => d.n === 6), "the duplicate's dot has gone", 5000);
      assert.equal((await results()).items.find((i: { key: string }) => i.key === "i2").count, before + 1, "the survivor grows");
      await matchesServer("merged");
      await shot(tv, "int-08-merged-tv"); await shot(control, "int-08-merged-control");
      await row("Coffee bar").getByRole("button", { name: "Undo merge" }).click();
      await until(async () => (await dots()).some(d => d.n === 6), "the item comes back", 5000);
      await matchesServer("unmerged");
    });
    await step("INT-08 Hide an item: its dot and legend row leave, the rest close the gap", async () => {
      await row("Youth night").getByRole("button", { name: "Hide" }).click();
      await until(async () => !(await dots()).some(d => d.n === 4) && !(await legend()).some(r => r.n === 4), "item 4 hidden", 5000);
      await row("Youth night").getByRole("button", { name: "Unhide" }).click();
      await until(async () => (await dots()).some(d => d.n === 4), "item 4 back", 5000);
    });
    await step("INT-08 Offline and queued: a placement is saved on the phone, then sent and shown when the phone is back", async () => {
      await ruth.ctx.setOffline(true);
      await until(async () => (await ruth.page.locator(".ph-head").innerText()).includes("Offline") || await ruth.page.locator(".ph-reconnecting.is-on").count() > 0, "offline mark", 8000);
      await place(ruth.page, 2, 0.9, 0.9);
      await until(async () => (await ruth.page.locator(".ph-note").innerText()).includes("Saved on this phone"), "saved on this phone");
      await shot(ruth.page, "int-08-offline-phone");
      await ruth.ctx.setOffline(false);
      await until(async () => (await results()).items.find((i: { key: string }) => i.key === "i2").count === 3, "the queued placement arrives", 15000);
      await matchesServer("after reconnecting");
    });
    await step("INT-08 Phones down: the phone dims and holds, the TV's wall holds still with the quiet mark", async () => {
      await press(fac, sql, room.id, "phones_down");
      await until(async () => await tv.locator(".tv-live.is-down").count() === 1, "quiet mark");
      await until(async () => await priya.page.locator(".ph-app.is-dimmed").count() === 1, "phone dims");
      assert.equal(await priya.page.locator(".gfs-chip:not([disabled])").count(), 0, "the numbers hold");
      await shot(tv, "int-08-phones-down-tv"); await shot(priya.page, "int-08-phones-down-phone");
      await press(fac, sql, room.id, "open_phones");
    });
    await step("INT-08 Reduced motion: a moved dot is in place at once", async () => {
      await tv.emulateMedia({ reducedMotion: "reduce" });
      await place(ben.page, 5, 0.9, 0.1);
      await until(async () => { const r = (await results()).items.find((i: { key: string }) => i.key === "i5"); return r.x > 0.55; }, "server mean moves", 5000);
      await delay(150);
      await matchesServer("reduced motion");
      await shot(tv, "int-08-reduced-tv");
      await tv.emulateMedia({ reducedMotion: "no-preference" });
    });
    await step("INT-08 Pre-mortem axes and very long text: likelihood and impact, a long reason wraps to two lines in the legend, never on the plot", async () => {
      await live(premortem);
      await until(async () => (await layer().locator(".gfs-xname").innerText()).includes("Likelihood"), "pre-mortem axes", 10000);
      assert.ok((await layer().locator(".gfs-legend-head").innerText()).toLowerCase().includes("reasons it failed"));
      await until(async () => await priya.page.locator(".gfs-chip").count() === 3, "phone shows the reasons");
      await place(priya.page, 1, 0.85, 0.9); await place(ben.page, 1, 0.8, 0.85); await place(priya.page, 3, 0.6, 0.7); await place(ben.page, 2, 0.7, 0.8);
      await until(async () => (await results()).total === 4, "four placements", 8000);
      await matchesServer("pre-mortem");
      const long = layer().locator(".gfs-leg", { hasText: "pathway" }).locator("span");
      const lines = await long.evaluate(el => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
      assert.ok(lines <= 2, `the long reason clamps to two lines (${lines})`);
      await shot(tv, "int-08-premortem-tv"); await shot(priya.page, "int-08-premortem-phone");
    });

    // ---------- INT-09 Private form ----------
    const secret = `kitsecret${randomUUID().slice(0, 6)}`;
    await step("INT-09 Empty: the TV shows only the count, a still structure; phones show the questions, marked Private", async () => {
      await live(form);
      await until(async () => (await layer().locator(".gfs-n").innerText()) === "0", "0 on the TV", 10000);
      assert.ok((await layer().innerText()).includes("This screen just counts"));
      assert.ok(await layer().locator(".gfs-mark").count() > 0, "a mark for each person present");
      await until(async () => await priya.page.locator(".gfs-q").count() === 2, "two questions on the phone");
      assert.ok((await priya.page.locator(".ph-who").innerText()).includes("Only the facilitators"), "the phone says who sees it");
      assert.equal(await priya.page.locator(".ph-send").isDisabled(), true, "Send privately holds until there is an answer");
      await shot(tv, "int-09-empty-tv"); await shot(priya.page, "int-09-empty-phone");
    });
    await step("INT-09 Answers go privately: the count climbs and no answer ever reaches the TV", async () => {
      await priya.page.locator("#gfs-q-q1").fill(`A plan we all believe in ${secret}`);
      await priya.page.locator("#gfs-q-q2").fill(`If we leave with a plan the whole team believes in, and not just the parts Mark and I agreed on before we walked in, that's a win. ${"We should also name what we will stop. ".repeat(4)}`);
      await priya.page.getByRole("button", { name: "Send privately" }).click();
      await until(async () => (await layer().locator(".gfs-n").innerText()) === "1", "1 on the TV", 3000);
      await ben.page.locator("#gfs-q-q2").fill(`Honest talk about the building ${secret}`);
      await ben.page.getByRole("button", { name: "Send privately" }).click();
      await until(async () => (await layer().locator(".gfs-n").innerText()) === "2", "2 on the TV", 3000);
      assert.equal((await results()).people, 2, "the server's count");
      assert.ok(!(await tv.content()).includes(secret), "the answers are nowhere on the TV page");
      assert.ok(!(await ruth.page.content()).includes(secret), "or on another phone");
      assert.equal(await tv.locator(".tv-top .tv-tally").evaluate(el => getComputedStyle(el).opacity), "0", "the count is the screen: no count badges");
      assert.equal(await layer().locator(".gfs-mark.is-done").count(), 2, "two marks filled, in the order answers arrived");
      await until(async () => (await control.locator(".gfs-answers").innerText().catch(() => "")).includes(secret), "the facilitator reads them on the control surface", 8000);
      assert.ok((await control.locator(".gfs-answers").innerText()).includes("Priya Shah"));
      await shot(tv, "int-09-typical-tv"); await shot(priya.page, "int-09-long-text-phone"); await shot(control, "int-09-control");
    });
    await step("INT-09 Offline and queued, phones down: a form waits on the phone and sends privately when back", async () => {
      await ruth.ctx.setOffline(true);
      await ruth.page.locator("#gfs-q-q1").fill("Clarity on staffing");
      await ruth.page.getByRole("button", { name: "Send privately" }).click();
      await until(async () => (await ruth.page.locator(".ph-note").innerText()).includes("Saved on this phone"), "saved on this phone");
      await shot(ruth.page, "int-09-offline-phone");
      await ruth.ctx.setOffline(false);
      await until(async () => (await layer().locator(".gfs-n").innerText()) === "3", "3 on the TV", 15000);
      await press(fac, sql, room.id, "phones_down");
      await until(async () => await priya.page.locator(".ph-app.is-dimmed").count() === 1, "phone dims");
      await shot(tv, "int-09-phones-down-tv"); await shot(priya.page, "int-09-phones-down-phone");
      await press(fac, sql, room.id, "open_phones");
    });

    // ---------- INT-10 Sign together ----------
    const ink = async (page: Page, wiggle = 0) => {
      const box = (await page.locator(".gfs-sigpad svg").boundingBox())!;
      await page.mouse.move(box.x + 20, box.y + box.height * 0.7); await page.mouse.down();
      for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 20 + i * (box.width - 60) / 12, box.y + box.height * (0.5 + 0.3 * Math.sin(i * 1.3 + wiggle)));
      await page.mouse.up();
    };
    await step("INT-10 Empty: the text's title, an empty wall and the count; the phone has the text with sections, and Sign holds until there is ink", async () => {
      await live(sign);
      await until(async () => (await layer().locator(".gfs-big").innerText()) === "0", "0 signed", 10000);
      assert.ok((await layer().innerText()).includes("Waiting for the first signature"));
      await until(async () => await priya.page.locator(".gfs-sigpad").count() === 1, "signature field on the phone");
      assert.equal(await priya.page.locator(".gfs-doc details").count(), 2, "two sections to expand");
      assert.ok((await priya.page.locator(".gfs-sig-line").innerText()).includes("Priya"), "the name is printed under the line");
      assert.equal(await priya.page.getByRole("button", { name: "Sign", exact: true }).isDisabled(), true, "Sign stays held until there is ink");
      await shot(tv, "int-10-empty-tv"); await shot(priya.page, "int-10-empty-phone");
      await ink(priya.page);
      assert.equal(await priya.page.getByRole("button", { name: "Sign", exact: true }).isDisabled(), false, "ink: Sign is ready");
      await priya.page.getByRole("button", { name: "Clear" }).click();
      assert.equal(await priya.page.getByRole("button", { name: "Sign", exact: true }).isDisabled(), true, "Clear wipes the field");
    });
    await step("INT-10 First item and typical: signatures arrive one at a time with the name under them and the count climbs", async () => {
      await ink(priya.page); await priya.page.getByRole("button", { name: "Sign", exact: true }).click();
      await until(async () => await layer().locator(".gfs-name.is-sig").count() === 1, "the first signature", 3000);
      assert.ok((await layer().locator(".gfs-name .nm").first().innerText()).includes("Priya Shah"), "the full name, read on the server");
      await shot(tv, "int-10-first-tv"); await shot(priya.page, "int-10-signed-phone");
      await ink(ben.page, 1); await ben.page.getByRole("button", { name: "Sign", exact: true }).click();
      await ink(ruth.page, 2); await ruth.page.getByRole("button", { name: "Sign", exact: true }).click();
      await until(async () => (await layer().locator(".gfs-big").innerText()) === "3", "3 signed", 5000);
      const path = await layer().locator(".gfs-name path").first().getAttribute("d");
      assert.match(path ?? "", /^M\d+ \d+L/, "drawn from the stroke paths");
      await shot(tv, "int-10-typical-tv");
    });
    await step("INT-10 Hide a name: it fades and the rest close the gap; it stays in the record", async () => {
      await until(async () => await control.locator(".ctl-items h2", { hasText: "Signed" }).count() === 1, "the names list", 10000);
      await row("Ben Ortiz").getByRole("button", { name: "Hide from the TV" }).click();
      await until(async () => (await layer().locator(".gfs-big").innerText()) === "2" && !(await layer().innerText()).includes("Ben Ortiz"), "Ben hidden", 5000);
      await until(async () => (await row("Ben Ortiz").innerText()).includes("Hidden from the TV"), "marked hidden", 5000);
      await shot(tv, "int-10-hidden-tv"); await shot(control, "int-10-control");
      await row("Ben Ortiz").getByRole("button", { name: "Unhide" }).click();
      await until(async () => (await layer().locator(".gfs-big").innerText()) === "3", "Ben back", 5000);
      await until(async () => await layer().locator(".gfs-name.is-sig").count() === 3, "with his signature, not only his name", 5000);
    });
    await step("INT-10 Signing closed: the Sky mark with Closed, phones show their signature, nothing more arrives", async () => {
      await control.getByRole("button", { name: "Close signing" }).click();
      await until(async () => await tv.locator(".tv-live.is-closed").count() === 1, "Closed on the TV", 5000);
      await until(async () => (await priya.page.locator(".ph-body").innerText()).includes("Signing has closed"), "closed on the phone", 5000);
      await shot(tv, "int-10-closed-tv"); await shot(priya.page, "int-10-closed-phone");
      await control.getByRole("button", { name: "Reopen signing" }).click();
      await until(async () => await tv.locator(".tv-live.is-live").count() === 1, "live again", 5000);
    });

    // ---------- Crowded: 50 simulated phones in the practice room ----------
    // The room's own screens are done: close them so the practice room's TV has the machine to itself.
    await Promise.all([priya.ctx, ben.ctx, ruth.ctx, facContext, tvContext].map(c => c.close()));
    const seeded = (await sql.query("select 1 from public.engagements where id=$1 and not deleted", [practiceRoom])).rowCount;
    assert.equal(seeded, 1, "Run npm run db:seed first: the crowded runs use the permanent practice room");
    const pfac = await facilitator(env, sql, practiceRoom);
    const ptvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const ptv = await ptvContext.newPage(); await ptv.goto(app.origin + "/tv");
    await pairTv(pfac, practiceRoom, app.secret, await pairCode(ptv), "Grid form sign kit TV");
    const pLayer = () => ptv.locator(".tv-layer:not(.is-leaving)").last();
    const cookie = pfac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
    const tag = randomUUID().slice(0, 6);
    const psession = async (kind: string, options: Record<string, unknown>, named = false) => (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,options,settings)
      values($1,$2,'Day 1',950,$3,$4,'ready',$5,jsonb_build_object('anonymous',$6::boolean,'burst_minutes',4,'join_strip',false)) returning id`, [practiceRoom, `Kit ${kind} ${tag}`, kind, `Fifty phones: ${kind}`, options, !named])).rows[0].id as string;
    const tenItems = Array.from({ length: 10 }, (_, i) => ({ key: `p${i + 1}`, text: gridItems[i] ?? `Idea ${i + 1}` }));
    const pgrid = await psession("grid", { items: tenItems }), pform = await psession("form", { questions: [{ key: "q1", text: "One thing for the facilitators" }] }), psign = await psession("sign", { text: signText }, true);
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
    let seed = 11; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    async function crowd(kind: string, session: string, sends: (p: SimPhone, i: number) => Promise<string[]>) {
      await press(pfac, sql, practiceRoom, "go_live", { session });
      await ptv.locator(`.tv-layer:not(.is-leaving)[data-kind="${kind}"] .tv-board`).waitFor({ timeout: 10000 });
      await delay(1200);
      const from = new Date(Date.now() - 500).toISOString();
      const statuses = (await Promise.all(phones.map(async (p, i) => { await delay(Math.floor(rnd() * 6000)); return sends(p, i); }))).flat();
      const r = await report(from);
      assert.ok(statuses.every(s => s === "accepted"), `${kind}: every answer accepted (${JSON.stringify(statuses.filter(s => s !== "accepted").slice(0, 3))})`);
      assert.equal(r.measured, statuses.length, `${kind}: every answer reached the TV and was logged`);
      const line = `${kind}: ${statuses.length} answers from 50 phones, phone to TV median ${r.phone_tv.p50} ms, 95th ${r.phone_tv.p95} ms, slowest ${r.phone_tv.max} ms (phone to server 95th ${r.phone_server.p95} ms, server to TV 95th ${r.server_tv.p95} ms)`;
      assert.ok(verdict(r).met, `${kind}: 95 of 100 under one second on loopback. ${line}`);
      load.push(`${line} (${verdict(r).label})`);
      return r;
    }
    await step("INT-08 Crowded, 50 phones: ten items, three placements each, every one on the TV in under a second, nothing jumps, numbers match", async () => {
      await ptv.evaluate(`(() => { const w = window; w.__jumps = []; w.__last = new Map();
        const loop = () => {
          document.querySelectorAll(".tv-layer:not(.is-leaving) .gfs-dot").forEach(el => {
            const b = el.getBoundingClientRect(), c = [b.left + b.width / 2, b.top + b.height / 2], last = w.__last.get(el.textContent);
            if (last && getComputedStyle(el).opacity === "1") w.__jumps.push({ n: el.textContent, step: Math.hypot(c[0] - last[0], c[1] - last[1]), r: b.width / 2 });
            w.__last.set(el.textContent, c);
          });
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop); })()`);
      const placesFor = (k: number) => Object.fromEntries(tenItems.slice(0, k).map((item, j) => [item.key, [Math.round(Math.min(0.98, 0.1 + 0.07 * j + rnd() * 0.2) * 1000) / 1000, Math.round(Math.min(0.98, 0.15 + 0.06 * j + rnd() * 0.25) * 1000) / 1000]]));
      await crowd("grid", pgrid, async p => {
        const id = randomUUID(), out: string[] = [];
        for (let rev = 0; rev < 3; rev++) { out.push(await p.send(pgrid, id, rev, { places: placesFor(4 + rev * 3) })); await delay(300 + Math.floor(rnd() * 600)); }
        return out;
      });
      await delay(2000);
      const server = (await results(practiceRoom)).items as { num: number; count: number; x: number; y: number }[];
      assert.equal((await results(practiceRoom)).people, 50, "counted by people");
      await until(async () => {
        const shown = await pLayer().locator(".gfs-dot").evaluateAll(els => els.map(el => Number(el.textContent)));
        const counts = await pLayer().locator(".gfs-leg:not([aria-hidden]) small").allInnerTexts();
        return shown.length === 10 && counts.length > 0 && counts.every(c => server.some(s => s.count === Number(c.replace(/\D/g, ""))));
      }, "every item's dot, and legend counts from the server", 8000);
      assert.equal(await ptv.locator(".tv-top .tv-tally").getAttribute("aria-label").then(v => v ?? ""), "50 answering");
      const jumps = await ptv.evaluate(() => (window as unknown as { __jumps: { n: string; step: number; r: number }[] }).__jumps);
      const worst = Math.max(...jumps.map(j => j.step));
      assert.ok(jumps.length > 100 && worst < 120, `no dot jumps between frames (largest step ${Math.round(worst)} px over ${jumps.length} frames)`);
      await shot(ptv, "int-08-crowded-tv");
    });
    await step("INT-09 Crowded, 50 phones: the count climbs to 50 and no answer reaches the TV", async () => {
      await crowd("form", pform, async (p, i) => [await p.send(pform, randomUUID(), 0, { answers: { q1: `kitprivate ${i}` } })]);
      await until(async () => (await pLayer().locator(".gfs-big").innerText()) === "50", "50 on the TV", 8000);
      assert.ok(!(await ptv.content()).includes("kitprivate"), "nothing private on the TV");
      await shot(ptv, "int-09-crowded-tv");
    });
    // Every signer's card sits whole inside the wall, its name unclipped, with no "+ more";
    // or, past what the wall holds, the rest are counted: no one is silently dropped.
    const wall = async (page: Page) => page.locator(".tv-layer:not(.is-leaving)").last().locator(".gfs-sign").evaluate(board => {
      const clip = board.querySelector(".gfs-names-clip")!.getBoundingClientRect(), box = board.querySelector<HTMLElement>(".gfs-names-box")!;
      const cards = [...board.querySelectorAll<HTMLElement>(".gfs-name")].filter(el => Number(getComputedStyle(el).opacity) > 0.5);
      const inside = cards.filter(el => { const r = el.getBoundingClientRect(); return r.left >= clip.left - 1 && r.right <= clip.right + 1 && r.top >= clip.top - 1 && r.bottom <= clip.bottom + 1; });
      const clipped = cards.map(el => el.querySelector<HTMLElement>(".nm")!).filter(nm => nm.scrollWidth > nm.clientWidth + 1 || nm.scrollHeight > nm.clientHeight + 2).map(nm => nm.textContent);
      return { cards: cards.length, inside: inside.length, clipped, more: board.querySelector(".gfs-more")!.textContent ?? "", hold: Number(box.dataset.hold), big: board.querySelector(".gfs-big")!.textContent };
    });
    await step("INT-10 Room sizes: 8 and then 16 signers each land whole on the wall at 1920x1080 and 1280x720, shrinking and reflowing as they arrive, no \"+ more\"", async () => {
      const small = await browser!.newContext({ viewport: { width: 1280, height: 720 } });
      const stv = await small.newPage(); await stv.goto(app.origin + "/tv");
      await pairTv(pfac, practiceRoom, app.secret, await pairCode(stv), "Grid form sign kit small TV");
      await stv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
      const fitSign = await psession("sign", { text: signText }, true);
      await press(pfac, sql, practiceRoom, "go_live", { session: fitSign });
      for (const page of [ptv, stv]) await page.locator('.tv-layer:not(.is-leaving)[data-kind="sign"] .gfs-sign').waitFor({ timeout: 10000 });
      const pen = (k: number) => [`M${20 + k} 120L${120 + k} ${60 + k}L${260} 140L${380 - k} 70L560 110`];
      for (const n of [8, 16]) {
        for (let i = n === 8 ? 0 : 8; i < n; i++) { assert.equal(await phones[i].send(fitSign, randomUUID(), 0, { strokes: pen(i) }), "accepted"); await delay(250); }
        for (const [page, size] of [[ptv, "1920x1080"], [stv, "1280x720"]] as const) {
          const seen = await until(async () => { const w = await wall(page); return w.big === String(n) && w.cards === n && w.inside === n ? w : null; }, `${n} signers whole on the ${size} wall`, 8000)
            .catch(async error => { throw new Error(`${error.message}: ${JSON.stringify(await wall(page))}`); });
          assert.deepEqual(seen.clipped, [], `${size}, ${n} signed: every name shows whole`);
          assert.equal(seen.more, "", `${size}, ${n} signed: no "+ more" while everyone fits`);
          await shot(page, `int-10-${n}-signers-${size}-tv`);
        }
      }
      await small.close();
    });
    await step("INT-10 Crowded, 50 phones: fifty signatures fill the wall, then it rolls slowly once quiet; names never jump", async () => {
      const stroke = () => { let x = 20 + Math.floor(rnd() * 40), s = `M${x} ${100 + Math.floor(rnd() * 40)}`; for (let k = 0; k < 14; k++) { x += 20 + Math.floor(rnd() * 15); s += `L${Math.min(600, x)} ${40 + Math.floor(rnd() * 120)}`; } return s; };
      await crowd("sign", psign, async p => [await p.send(psign, randomUUID(), 0, { strokes: [stroke(), stroke()] })]);
      await until(async () => (await pLayer().locator(".gfs-big").innerText()) === "50", "50 signed", 8000);
      assert.equal((await results(practiceRoom)).signers.length, 50, "the server's names");
      // Past what the wall holds: every card is there to roll to, and the rest are counted.
      const full = await until(async () => { const w = await wall(ptv); return w.cards === 50 && /^\+ \d+ more$/.test(w.more) ? w : null; }, "fifty cards and a \"+ more\" count", 8000);
      assert.equal(Number(full.more.replace(/\D/g, "")) + full.hold, 50, `"${full.more}" plus the ${full.hold} the wall holds at once is everyone`);
      assert.ok(full.inside <= full.hold && full.inside > 0, `${full.inside} whole on the wall right now`);
      assert.deepEqual(full.clipped, [], "names on the crowded wall show whole");
      const positions = async () => pLayer().locator(".gfs-name").evaluateAll(els => els.map(el => (el as HTMLElement).style.transform));
      const before = await positions(); await delay(400);
      assert.deepEqual(await positions(), before, "settled names hold their places");
      const roll = async () => Number((await pLayer().locator(".gfs-names").evaluate(el => (el as HTMLElement).style.transform)).match(/-?[\d.]+/)?.[0] ?? 0);
      const quietStart = await roll(); await delay(9000);
      assert.notEqual(await roll(), quietStart, "the full wall rolls once nothing has arrived for a while");
      await shot(ptv, "int-10-crowded-tv");
    });
    await press(pfac, sql, practiceRoom, "nothing_live");
    console.log(load.join("\n"));
    console.log(`Grid, form and sign kit: ${passed.length} checks passed. Local checks on loopback; venue acceptance is the practice-room run.`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally { await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); }
}
main().catch(error => { console.error(error); process.exit(1); });
