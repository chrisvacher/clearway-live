// Milestone 3, step 2: the bar family in real browsers against the production build and the
// local stack. Multiple choice (INT-04), scale (INT-05), ranking with Add an option (INT-06),
// 100 points (INT-07) and statements (INT-17) each go live on a paired TV with phones, through
// the nine states where they apply; the options editors save from the run of show; and 50
// simulated phones answer every kind in the practice room while the TV is watched frame by
// frame. KIT_SHOTS=<folder> saves each TV, phone and control screen. Local only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { practiceRoom } from "../../scripts/load-test";
import { verdict } from "../../lib/latency/report";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

type Bar = { key: string; text: string; place: number; fraction: number; leader: boolean; count?: number; percent?: number; average?: number | null; share?: number; agree?: number };

// Records every row's place and length on each animation frame, so the kit can check that
// rows glide (never swap or jump) and bars never fall back to zero.
const sampler = `(() => {
  const w = window; if (w.__bars) return; const log = w.__bars = []; const boards = new WeakMap(); let n = 0;
  const board = el => { if (!boards.has(el)) boards.set(el, ++n); return boards.get(el); };
  const read = () => { const rows = [...document.querySelectorAll('.tv-layer:not(.is-leaving) .tv-bar:not(.is-leaving)')].map(r => {
    const m = /translateY\\((-?[\\d.]+)px\\)/.exec(r.style.transform || ''); const f = r.querySelector('.tv-bar-fill');
    return [board(r.parentElement) + ':' + r.dataset.key, m ? +m[1] : null, f ? parseFloat(f.style.width) || 0 : 0, r.offsetHeight]; });
    log.push(rows); if (log.length > 6000) log.splice(0, 3000); requestAnimationFrame(read); };
  requestAnimationFrame(read);
})()`;
type Sample = [string, number | null, number, number][];

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(1100); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    const room = await engagement(sql, ["Ruth", "Ben", "Grace", "Mateo"]);
    const add = async (title: string, kind: string, prompt: string, position: number, options: Record<string, unknown>) => {
      const id = await room.session(title, kind, prompt, position);
      // Options go through the kind's own check, as the run of show saves them.
      await sql.query("update public.sessions set options=private.session_options(interaction,$2::jsonb,engagement_id) where id=$1", [id, options]);
      assert.ok((await sql.query("select options<>'{}' as ok from public.sessions where id=$1", [id])).rows[0].ok, `${title}: options accepted`); return id;
    };
    const opts = (...texts: string[]) => texts.map((text, i) => ({ key: `o${i + 1}`, text }));
    const choice = await add("Next season", "choice", "Where should our next season go?", 1, { items: opts("Reaching new people", "Next generation", "Welcome and first visits", "Systems and data", "Second campus and facility"), multiple: false });
    const any = await add("Serving", "choice", "Which of these have you served in this year?", 2, { items: opts("Worship", "Kids and youth", "Hospitality", "Care and prayer", "Groups"), multiple: true });
    const long = await add("Long options", "choice", "Which of these long options reads best from the back of the room?", 3, { items: opts(
      "Reaching the young families who moved into the new subdivisions east of the river and have never been to a church", "Next generation", "A third option that is also rather long and keeps going for a while"), multiple: false });
    const scale = await add("Direction", "scale", "How clear is our current direction?", 4, { max: 5, low: "Not clear at all", high: "Crystal clear" });
    const slider = await add("Readiness", "scale", "How ready is the team for a second campus?", 5, { max: 10, low: "Not ready", high: "Ready now" });
    const ranking = await add("Priorities", "ranking", "Rank these by what matters most", 6, { items: opts("Reaching new people", "Next generation", "Welcome and first visits", "Systems and data", "Second campus"), suggest: true });
    const points = await add("Spend 100", "points", "Spend 100 points on what matters most", 7, { items: opts("Reaching new people", "Next generation", "Welcome and first visits", "Systems and data", "Second campus"), cut: 3 });
    const statements = await add("How true", "statements", "How true is each of these for us today?", 8, { items: [
      { key: "s1", text: "We know who we are trying to reach" }, { key: "s2", text: "Our leaders have room to lead" }, { key: "s3", text: "Decisions get made and stay made" },
      { key: "s4", text: "Our systems help more than they hurt" }, { key: "s5", text: "We celebrate what God is doing" }], low: "Strongly disagree", high: "Strongly agree", flag_divided: true });
    const fac = await facilitator(env, sql, room.id);
    browser = await chromium.launch();

    const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvContext.newPage(); await tv.goto(app.origin + "/tv");
    const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(fac, room.id, app.secret, code);
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
    await tv.evaluate(sampler);
    const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();

    const contexts: BrowserContext[] = [];
    async function phone(person: { email: string }) {
      const ctx = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); contexts.push(ctx);
      const page = await ctx.newPage(); await page.goto(`${app.origin}/room/${room.id}`);
      const before = mail.count;
      await page.fill("#room-email", person.email); await page.getByRole("button", { name: "Send me a sign-in code" }).click();
      await page.fill("#room-code", await mail.code(person.email, before)); await page.getByRole("button", { name: "Sign in" }).click();
      await page.locator(".ph-app").waitFor({ timeout: 15000 });
      return page;
    }
    const [ruth, ben, grace, mateo] = [await phone(room.attendees[0]), await phone(room.attendees[1]), await phone(room.attendees[2]), await phone(room.attendees[3])];
    const facContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await facContext.addCookies(fac.cookies(app.origin));
    const control = await facContext.newPage();

    const results = async () => (await sql.query("select results from public.room_states where engagement_id=$1", [room.id])).rows[0].results as { people: number; bars?: Bar[]; scale?: { average: number | null }; cut?: number };
    const live = async (session: string) => {
      const prompt = (await sql.query("select prompt from public.sessions where id=$1", [session])).rows[0].prompt as string;
      await press(fac, sql, room.id, "go_live", { session });
      await until(async () => (await layer().locator(".tv-headline").innerText().catch(() => "")) === prompt, `${prompt} on the TV`, 10000);
      await delay(900);
    };
    // The TV's rows in the order they stand on screen, read from where they are drawn.
    const tvRows = async () => (await layer().locator(".tv-bar:not(.is-leaving)").evaluateAll(rows => rows.map(r => ({ key: (r as HTMLElement).dataset.key!, place: Number((r as HTMLElement).dataset.place),
      y: r.getBoundingClientRect().top, value: r.querySelector(".tv-bar-value")!.textContent!.trim(), leader: r.classList.contains("is-leader"), width: parseFloat((r.querySelector(".tv-bar-fill") as HTMLElement).style.width) || 0,
      label: (r.querySelector(".tv-bar-label") as HTMLElement).getBoundingClientRect().height, size: parseFloat(getComputedStyle(r.querySelector(".tv-bar-label")!).fontSize) }))));
    // The TV matches the server: every row in the server's order, every number the server's own.
    async function matches(format: (bar: Bar, people: number) => string, label: string) {
      await until(async () => {
        const server = await results(), rows = await tvRows();
        if (!server.bars || rows.length !== server.bars.length) return false;
        const byY = [...rows].sort((a, b) => a.y - b.y);
        return server.bars.every((bar, i) => byY[i].key === bar.key && byY[i].value === format(bar, server.people) && byY[i].leader === bar.leader && Math.abs(byY[i].width - bar.fraction * 100) < 0.6);
      }, label, 8000);
    }
    const choiceText = (b: Bar) => `${b.count} · ${b.percent}%`;
    // Values beside the bars and the cut line's label always show whole, never cut off.
    async function unclipped(label: string) {
      const clipped = await layer().locator(".tv-bar-value, .tv-cut-label").evaluateAll(els => els.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent));
      assert.deepEqual(clipped, [], `${label}: values and the cut label show whole`);
    }
    const tally = async (n: number) => until(async () => (await tv.locator(".tv-foot .tv-tally").innerText()).trim() === `${n} answering`, `${n} answering`, 8000);
    // Nothing jumps: from the frame log, no row moves a whole row or more in one
    // frame, and no bar falls back to zero once shown (pass 3 change 4).
    async function smooth(label: string) {
      const log = await tv.evaluate(() => { const w = window as unknown as { __bars: Sample[] }; const out = w.__bars.slice(); w.__bars.length = 0; return out; }) as Sample[];
      const seen = new Map<string, { y: number | null; w: number }>();
      let frames = 0;
      for (const frame of log) {
        const keys = new Set(frame.map(r => r[0]));
        for (const key of [...seen.keys()]) if (!keys.has(key)) seen.delete(key);
        for (const [key, y, w, h] of frame) {
          const prev = seen.get(key);
          if (prev && prev.y !== null && y !== null) assert.ok(Math.abs(y - prev.y) <= h + 1, `${label}: ${key} jumped ${Math.abs(y - prev.y).toFixed(1)}px in one frame`);
          if (prev && prev.w > 1) assert.ok(w > 0 || prev.w < 3, `${label}: ${key} fell back to zero`);
          seen.set(key, { y, w });
        }
        frames++;
      }
      return frames;
    }

    await step("The run of show edits each kind's options and saves them through the database's check", async () => {
      const editor = await facContext.newPage();
      await editor.goto(`${app.origin}/setup/${room.id}/run-of-show`);
      // SET-07: a tile from the palette adds the session at the end and opens its options in place.
      const open = editor.locator(".rb-row.is-open");
      await editor.locator(".rb-tile", { hasText: "Multiple choice" }).click();
      await open.locator("#session-title").fill("Poll from the editor");
      await open.getByLabel("Choice 1", { exact: true }).fill("Yes, this year");
      await open.getByLabel("Choice 2", { exact: true }).fill("Next year");
      await open.getByLabel("Choice 3", { exact: true }).fill("Not yet");
      await open.getByRole("button", { name: "Add choice" }).click();
      await open.getByLabel("Choice 4", { exact: true }).fill("We need to talk");
      await open.getByRole("button", { name: "Move choice 4 up" }).click();
      await open.getByLabel("Pick any").check();
      await open.locator(".bars-options").scrollIntoViewIfNeeded();
      await shot(editor, "set-07-choice-options");
      await open.getByRole("button", { name: "Done", exact: true }).click();
      const saved = await until(async () => (await sql.query("select options from public.sessions where engagement_id=$1 and title='Poll from the editor'", [room.id])).rows[0]?.options, "choice saved", 10000);
      assert.deepEqual(saved.items.map((o: { text: string }) => o.text), ["Yes, this year", "Next year", "We need to talk", "Not yet"]);
      assert.equal(saved.multiple, true);
      for (const [kind, tile, label, check] of [["ranking", "Ranking", "Option 1", "Add an option"], ["points", "100 points", "Option 1", null], ["statements", "Statements", "Statement 1", "Flag divided statements"], ["scale", "Scale", null, null]] as const) {
        await until(async () => await editor.locator(".rb-row.is-open").count() === 0, "the last options closed", 10000);
        await editor.locator(".rb-tile", { hasText: tile }).click();
        await open.locator("#session-title").fill(`Editor ${kind}`);
        if (label) { const items = kind === "points" ? 5 : kind === "ranking" ? 4 : 3; for (let i = 1; i <= items; i++) await open.getByLabel(label.replace("1", String(i)), { exact: true }).fill(`${kind} item ${i}`); }
        if (check === "Add an option") await open.getByLabel(check).check();
        if (kind === "points") await open.locator("#points-cut").selectOption("3");
        if (kind === "scale") { await open.locator("#scale-max").selectOption("10"); await open.locator("#scale-low").fill("Not ready"); }
        if (kind === "statements" || kind === "points" || kind === "scale") { await open.locator(kind === "scale" ? "#scale-max" : ".bars-options").scrollIntoViewIfNeeded(); await shot(editor, `set-07-${kind}-options`); }
        await open.getByRole("button", { name: "Done", exact: true }).click();
        const o = await until(async () => (await sql.query("select options from public.sessions where engagement_id=$1 and title=$2", [room.id, `Editor ${kind}`])).rows[0]?.options, `${kind} saved`, 10000);
        if (kind === "ranking") assert.equal(o.suggest, true);
        if (kind === "points") assert.equal(o.cut, 3);
        if (kind === "statements") assert.equal(o.flag_divided, true);
        if (kind === "scale") { assert.equal(o.max, 10); assert.equal(o.low, "Not ready"); assert.equal(o.items.length, 11); }
      }
      await sql.query("update public.sessions set state='draft' where engagement_id=$1 and (title like 'Editor %' or title='Poll from the editor')", [room.id]);
      await editor.close();
    });

    await step("INT-04 empty: every option with an empty track and 0 · 0%, nothing leading, 0 answering", async () => {
      await live(choice);
      await until(async () => (await tvRows()).length === 5, "five empty rows", 10000);
      const rows = await tvRows();
      assert.ok(rows.every(r => r.value === "0 · 0%" && !r.leader && r.width === 0), "an empty structure");
      await tally(0);
      await until(async () => await ruth.getByRole("radio").count() === 5, "options on the phone", 10000);
      await shot(tv, "int-04-empty-tv"); await shot(ruth, "int-04-empty-phone");
    });
    await step("INT-04 first item: the bar grows from zero and takes the lead in Sunrise", async () => {
      await ruth.getByRole("radio", { name: "Next generation" }).click(); await ruth.getByRole("button", { name: "Send" }).click();
      await tally(1); await matches(choiceText, "first answer on the TV");
      assert.equal((await tvRows()).find(r => r.key === "o2")!.leader, true);
      await until(async () => (await ruth.locator(".ph-note").innerText()).includes("Sent. You can change it"), "sent on the phone");
      await shot(tv, "int-04-first-tv"); await shot(ruth, "int-04-first-phone");
    });
    await step("INT-04 typical: live bars, leader on top, n · % beside each bar; a changed answer moves both bars", async () => {
      await ben.getByRole("radio", { name: "Welcome and first visits" }).click(); await ben.getByRole("button", { name: "Send" }).click();
      await grace.getByRole("radio", { name: "Welcome and first visits" }).click(); await grace.getByRole("button", { name: "Send" }).click();
      await mateo.getByRole("radio", { name: "Next generation" }).click(); await mateo.getByRole("button", { name: "Send" }).click();
      await tally(4); await matches(choiceText, "four answers");
      assert.deepEqual((await tvRows()).filter(r => r.leader).map(r => r.key).sort(), ["o2", "o3"], "ties share the lead");
      await ruth.getByRole("radio", { name: "Welcome and first visits" }).click(); await ruth.getByRole("button", { name: "Change my answer" }).click();
      await until(async () => (await results()).bars!.find(b => b.key === "o3")!.count === 3, "the change reaches the server", 8000);
      await tally(4); await matches(choiceText, "a changed answer");
      const top = [...await tvRows()].sort((a, b) => a.y - b.y)[0];
      assert.equal(top.key, "o3", "the new leader glides to the top"); assert.equal(top.value, "3 · 75%");
      assert.ok(await smooth("choice") > 10, "the TV drew frames while it moved");
      await shot(tv, "int-04-typical-tv"); await shot(ruth, "int-04-typical-phone");
    });
    await step("INT-04 Spotlight an option: it lifts in Sunrise over the scrim with its numbers; the leader takes Royal", async () => {
      await press(fac, sql, room.id, "spotlight", { item: "o5" });
      await until(async () => (await tv.locator(".tv-spot.is-on .tv-spot-text").innerText().catch(() => "")) === "Second campus and facility", "spotlight on the TV");
      assert.equal(await tv.locator(".tv-spot.is-on .tv-spot-meta").innerText(), "0 of 4 · 0%");
      await shot(tv, "int-04-spotlight-tv");
      await press(fac, sql, room.id, "clear_spotlight");
      await until(async () => await tv.locator(".tv-spot.is-on").count() === 0, "spotlight cleared");
    });
    await step("INT-04 phones down: the phone dims and holds its answer; the TV holds still", async () => {
      await press(fac, sql, room.id, "phones_down");
      await until(async () => (await ruth.locator(".ph-app").getAttribute("class"))!.includes("is-dimmed"), "the phone dims");
      assert.equal(await ruth.getByRole("radio", { name: "Next generation" }).isDisabled(), true, "no answering while phones are down");
      await shot(ruth, "int-04-phones-down-phone"); await shot(tv, "int-04-phones-down-tv");
      await press(fac, sql, room.id, "open_phones");
    });
    await step("INT-04 offline and queued: the pick is saved on the phone and sends when it is back", async () => {
      await until(async () => !(await ben.getByRole("radio", { name: "Systems and data" }).isDisabled()), "phones open");
      await contexts[1].setOffline(true);
      await ben.getByRole("radio", { name: "Systems and data" }).click(); await ben.getByRole("button", { name: "Change my answer" }).click();
      await until(async () => (await ben.locator(".ph-note").innerText()).includes("Saved on this phone"), "saved on this phone", 8000);
      await shot(ben, "int-04-offline-phone");
      await contexts[1].setOffline(false);
      await until(async () => (await results()).bars!.find(b => b.key === "o4")!.count === 1, "the queued pick arrives", 20000);
      await matches(choiceText, "after the queued pick");
    });
    await step("INT-04 pick any: percentages are of people answering; the count is people, not ticks", async () => {
      await live(any);
      await until(async () => await ruth.getByRole("checkbox").count() === 5, "checkboxes on the phone", 10000);
      for (const name of ["Worship", "Care and prayer", "Groups"]) await ruth.getByRole("checkbox", { name }).click();
      await ruth.getByRole("button", { name: "Send" }).click();
      await ben.getByRole("checkbox", { name: "Worship" }).click(); await ben.getByRole("button", { name: "Send" }).click();
      await tally(2); await matches(choiceText, "pick any");
      assert.equal([...await tvRows()].sort((a, b) => a.y - b.y)[0].value, "2 · 100%");
      await shot(tv, "int-04-pick-any-tv"); await shot(ruth, "int-04-pick-any-phone");
    });
    await step("INT-04 very long text: labels wrap to two lines then end, never below the floor; the phone shows all of it", async () => {
      await live(long);
      await ruth.getByRole("radio").first().click(); await ruth.getByRole("button", { name: "Send" }).click();
      await tally(1);
      const rows = await tvRows(), floor = await layer().locator(".tv-bars").evaluate(el => parseFloat(getComputedStyle(el).fontSize));
      assert.ok(floor >= 36, "labels at the floor or larger");
      assert.ok(rows.every(r => r.size >= floor && r.label <= r.size * 1.12 * 2 + 2), "two lines at most on the TV, never below the floor");
      assert.ok(rows.some(r => r.label > r.size * 1.12 * 1.5), "a long option wraps to a second line");
      assert.ok((await ruth.locator(".ph-opt-text").first().innerText()).endsWith("never been to a church"), "the phone shows the whole option");
      await shot(tv, "int-04-long-tv"); await shot(ruth, "int-04-long-phone");
    });

    await step("INT-05 empty, first item and typical: the average large with live columns; the marker slides", async () => {
      await live(scale);
      await until(async () => (await layer().locator(".tv-scale-none").innerText().catch(() => "")) === "No average yet", "no average yet", 10000);
      assert.equal(await layer().locator(".tv-col").count(), 5);
      await shot(tv, "int-05-empty-tv");
      await until(async () => await ruth.getByRole("radio").count() === 5, "five buttons", 10000);
      await shot(ruth, "int-05-empty-phone");
      await ruth.getByRole("radio", { name: "4" }).click();
      await until(async () => (await layer().locator(".tv-scale-number").innerText().catch(() => "")) === "4.0", "first average", 8000);
      await ben.getByRole("radio", { name: "5" }).click(); await grace.getByRole("radio", { name: "2" }).click(); await mateo.getByRole("radio", { name: "4" }).click();
      await tally(4);
      await until(async () => (await layer().locator(".tv-scale-number").innerText()) === "3.8" && (await layer().locator(".tv-scale-of").innerText()) === "average of 4", "3.8 average of 4", 8000);
      assert.equal(String((await results()).scale!.average), "3.8", "the server's average");
      assert.deepEqual(await layer().locator(".tv-col-count").allInnerTexts(), ["0", "1", "0", "2", "1"]);
      await ben.getByRole("radio", { name: "1" }).click();
      await until(async () => (await layer().locator(".tv-scale-number").innerText()) === "2.8", "a change moves the average", 8000);
      await shot(tv, "int-05-typical-tv"); await shot(ruth, "int-05-typical-phone");
      await press(fac, sql, room.id, "spotlight", { item: "average" });
      await until(async () => (await tv.locator(".tv-spot.is-on .tv-spot-text").innerText().catch(() => "")) === "2.8", "the average spotlit");
      await shot(tv, "int-05-spotlight-tv");
      await press(fac, sql, room.id, "clear_spotlight");
    });
    await step("INT-05 1 to 10: a slider on phones, ten columns on the TV", async () => {
      await live(slider);
      await until(async () => await ruth.locator("input.ph-slider").count() === 1, "a slider", 10000);
      assert.equal(await layer().locator(".tv-col").count(), 10);
      await ruth.locator("input.ph-slider").focus();
      for (let i = 0; i < 2; i++) await ruth.keyboard.press("ArrowRight");
      await until(async () => (await layer().locator(".tv-scale-number").innerText().catch(() => "")) === "7.0", "the slider sends when it comes to rest", 8000);
      await shot(tv, "int-05-slider-tv"); await shot(ruth, "int-05-slider-phone");
    });

    await step("INT-06 ranking: bars by average place, with the place and avg; a partial ranking counts", async () => {
      await live(ranking);
      await until(async () => (await tvRows()).length === 5 && (await tvRows()).every(r => r.value === "No rankings yet"), "empty ranking", 10000);
      await shot(tv, "int-06-empty-tv");
      for (const name of ["Systems and data", "Reaching new people", "Next generation"]) await ruth.getByRole("button", { name, exact: true }).click();
      await ruth.getByRole("button", { name: "Move Next generation up" }).click();
      await shot(ruth, "int-06-partial-phone");
      await ruth.getByRole("button", { name: "Send my order" }).click();
      await ben.getByRole("button", { name: "Next generation", exact: true }).click(); await ben.getByRole("button", { name: "Send my order" }).click();
      await tally(2);
      await matches((b, people) => people && b.average != null ? `avg ${Number(b.average).toFixed(1)}` : "No rankings yet", "the room's order by average place");
      const order = [...await tvRows()].sort((a, b) => a.y - b.y);
      assert.equal(order[0].key, "o2", "Next generation leads"); assert.equal(order[0].value, "avg 1.5");
      assert.deepEqual(await layer().locator(".tv-bar-place").allInnerTexts().then(t => t.map(Number).sort()), [1, 2, 3, 4, 5]);
      await shot(tv, "int-06-typical-tv");
    });
    await step("INT-06 Add an option: a phone suggests, the facilitator merges and adds, every phone and the TV get it", async () => {
      await grace.getByRole("button", { name: "Suggest an option" }).click();
      await grace.getByLabel("Your option").fill("Prayer");
      await grace.getByRole("button", { name: "Suggest", exact: true }).click();
      await until(async () => (await grace.locator(".ph-note").allInnerTexts()).some(t => t.includes("Sent to the facilitator")), "suggestion sent");
      await mateo.getByRole("button", { name: "Suggest an option" }).click();
      await shot(mateo, "int-06-suggest-phone");
      await mateo.getByLabel("Your option").fill("Prayer and discernment");
      await mateo.getByRole("button", { name: "Suggest", exact: true }).click();
      await control.goto(`${app.origin}/control/${room.id}`);
      const card = control.locator(".bars-suggestion");
      await until(async () => await card.count() === 1 && (await card.innerText()).includes("Suggested by 2 people"), "one merged suggestion", 15000);
      assert.equal(await card.locator("input").inputValue(), "Prayer and discernment");
      await card.scrollIntoViewIfNeeded(); await shot(control, "int-06-add-option-control");
      await card.getByRole("button", { name: "Add to every phone" }).click();
      await until(async () => (await tvRows()).length === 6, "the option joins the TV", 10000);
      await until(async () => (await ruth.locator(".ph-opt", { hasText: "Prayer and discernment" }).innerText().catch(() => "")).includes("New"), "on every phone, marked new", 10000);
      await matches((b, people) => people && b.average != null ? `avg ${Number(b.average).toFixed(1)}` : "No rankings yet", "earlier rankings treat it as unranked");
      await until(async () => await control.locator(".bars-suggestion").count() === 0, "the suggestion leaves the list", 8000);
      await smooth("ranking");
      await shot(tv, "int-06-added-tv"); await shot(ruth, "int-06-added-phone");
    });

    await step("INT-07 100 points: five lines, the overage comes from the others, counted once all 100 are placed", async () => {
      await live(points);
      await until(async () => (await tvRows()).length === 5 && await layer().locator(".tv-cut").count() === 1, "five empty bars and the cut line", 10000);
      assert.equal(await layer().locator(".tv-cut-label").innerText(), "Top three");
      await shot(tv, "int-07-empty-tv");
      const fader = (page: Page, name: string) => page.getByRole("slider", { name, exact: true });
      await until(async () => await fader(ruth, "Reaching new people").count() === 1, "faders on the phone", 10000);
      await fader(ruth, "Reaching new people").focus(); await ruth.keyboard.press("PageUp"); await ruth.keyboard.press("PageUp"); await ruth.keyboard.press("PageUp"); await ruth.keyboard.press("PageUp");
      await fader(ruth, "Next generation").focus(); for (let i = 0; i < 3; i++) await ruth.keyboard.press("PageUp");
      await fader(ruth, "Systems and data").focus(); for (let i = 0; i < 3; i++) await ruth.keyboard.press("PageUp");
      assert.equal(await ruth.locator(".ph-left b").innerText(), "0");
      await shot(ruth, "int-07-all-placed-phone");
      // Drag one line to the end: its points come from the other three in proportion.
      const track = fader(ruth, "Welcome and first visits").locator(".ph-fader-track"), box = (await track.boundingBox())!;
      await ruth.mouse.move(box.x + 18, box.y + box.height / 2); await ruth.mouse.down();
      await ruth.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 8 }); await ruth.mouse.up();
      const values = await ruth.locator(".ph-fader-n").allInnerTexts();
      assert.equal(values.map(Number).reduce((a, b) => a + b, 0), 100, "the budget holds while dragging");
      assert.ok(Number(values[2]) >= 45 && Number(values[0]) < 40 && Number(values[1]) < 30, `the others slide back in proportion: ${values}`);
      await ruth.getByRole("button", { name: "Send" }).click();
      await fader(ben, "Second campus").focus(); await ben.keyboard.press("End");
      await ben.getByRole("button", { name: "Send" }).click();
      await fader(grace, "Next generation").focus(); await grace.keyboard.press("End");
      assert.equal(await grace.getByRole("button", { name: "Send" }).isEnabled(), true);
      await grace.getByRole("button", { name: "Send" }).click();
      await tally(3);
      await matches(b => `${b.share}%`, "shares of the room's points");
      await unclipped("100 points");
      await shot(tv, "int-07-typical-tv"); await shot(ben, "int-07-typical-phone");
      // Points move until close: the bars and the cut line move as one.
      await fader(mateo, "Systems and data").focus(); await mateo.keyboard.press("End"); await mateo.getByRole("button", { name: "Send" }).click();
      await fader(ben, "Systems and data").focus(); await ben.keyboard.press("End"); await ben.getByRole("button", { name: "Send my change" }).click();
      await tally(4); await matches(b => `${b.share}%`, "points still moving");
      await smooth("points");
      await shot(tv, "int-07-moving-tv");
    });

    await step("INT-17 statements: every statement on one phone screen, each tap sends; bars by average with agree share", async () => {
      await live(statements);
      await until(async () => (await tvRows()).length === 5 && (await tvRows()).every(r => r.value === "No answers yet"), "empty statements", 10000);
      await shot(tv, "int-17-empty-tv");
      const tap = async (page: Page, statement: string, n: number) => page.getByRole("radiogroup", { name: statement }).getByRole("radio", { name: new RegExp(`^${n}`) }).click();
      await until(async () => await ruth.getByRole("radiogroup").count() === 5, "five statements on the phone", 10000);
      await shot(ruth, "int-17-empty-phone");
      for (const [page, picks] of [[ruth, [1, 5, 4, 3, 5]], [ben, [2, 4, 4, 2, 5]], [grace, [5, 4, 3, 3, 4]], [mateo, [4, 5, 2, 2, 5]]] as const) {
        const names = ["We know who we are trying to reach", "Our leaders have room to lead", "Decisions get made and stay made", "Our systems help more than they hurt", "We celebrate what God is doing"];
        for (let i = 0; i < 5; i++) await tap(page as Page, names[i], picks[i]);
      }
      await tally(4);
      await matches(b => b.count ? `${Number(b.average).toFixed(1)} · ${b.agree}% agree` : "No answers yet", "statements by average");
      await unclipped("statements");
      const top = [...await tvRows()].sort((a, b) => a.y - b.y)[0];
      assert.equal(top.key, "s5"); assert.equal(top.leader, true);
      const label = await layer().locator(".tv-bar-label").first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
      const floor = await layer().locator(".tv-bars").evaluate(el => parseFloat(getComputedStyle(el).fontSize));
      assert.equal(label, floor, "statement labels sit at the TV floor");
      assert.ok(!(await tv.locator(".tv-stage, main").first().innerText()).includes("Divided"), "never Divided on the TV");
      await control.goto(`${app.origin}/control/${room.id}`);
      await until(async () => (await control.locator(".bars-divided").innerText().catch(() => "")).includes("We know who we are trying to reach"), "Divided on the control surface only", 15000);
      await control.locator(".bars-divided").scrollIntoViewIfNeeded();
      await shot(tv, "int-17-typical-tv"); await shot(ruth, "int-17-typical-phone"); await shot(control, "int-17-divided-control");
      await tap(ruth, "We know who we are trying to reach", 5);
      await matches(b => b.count ? `${Number(b.average).toFixed(1)} · ${b.agree}% agree` : "No answers yet", "a changed rating");
      await smooth("statements");
    });

    await step("Reduced motion and the Off-White theme: everything takes its place at once, same numbers", async () => {
      await sql.query("update public.engagements set settings=settings||'{\"reduced_motion\":true,\"tv_theme\":\"light\"}' where id=$1", [room.id]);
      await until(async () => (await tv.locator("main").getAttribute("data-motion")) === "reduced" && (await tv.locator("main").getAttribute("data-theme")) === "light", "reduced motion on the TV", 10000);
      await live(choice);
      await press(fac, sql, room.id, "reopen");
      await until(async () => !(await grace.getByRole("radio", { name: "Systems and data" }).isDisabled()), "the reopened step takes answers", 10000);
      await tv.evaluate(() => { (window as unknown as { __bars: unknown[] }).__bars.length = 0; });
      await grace.getByRole("radio", { name: "Systems and data" }).click(); await grace.getByRole("button", { name: "Change my answer" }).click();
      await matches(choiceText, "reduced motion");
      const log = await tv.evaluate(() => (window as unknown as { __bars: Sample[] }).__bars.slice()) as Sample[];
      const ys = new Map<string, Set<number>>();
      for (const frame of log) for (const [key, y] of frame) { if (y !== null) (ys.get(key) ?? ys.set(key, new Set()).get(key)!).add(Math.round(y)); }
      assert.ok([...ys.values()].every(set => set.size <= 2), "rows move in one step, never through the frames between");
      await shot(tv, "int-04-reduced-light-tv");
      await sql.query("update public.engagements set settings=settings||'{\"reduced_motion\":false,\"tv_theme\":\"dark\"}' where id=$1", [room.id]);
    });

    await step("The control surface mirror and the phone's TV view draw the same bars", async () => {
      await control.goto(`${app.origin}/control/${room.id}`);
      await until(async () => await control.locator(".tv-mirror .tv-bar").count() === 5, "bars in the mirror", 15000);
      const server = await results();
      const mirror = await control.locator(".tv-mirror .tv-bar .tv-bar-value").allInnerTexts();
      assert.deepEqual([...mirror].sort(), server.bars!.map(b => choiceText(b)).sort(), "the mirror shows the server's numbers");
      await press(fac, sql, room.id, "tv_on_phones", { on: true });
      await until(async () => await ruth.locator(".tv-mirror .tv-bar").count() === 5, "the TV view on phones", 10000);
      await shot(ruth, "int-04-tv-on-phone"); await shot(control, "int-04-control");
      await press(fac, sql, room.id, "tv_on_phones", { on: false });
      await press(fac, sql, room.id, "nothing_live");
    });

    // ---------- Statements' values at the sizes a room uses ----------
    // Eight statements beside the join strip (the narrowest board) in the very small room:
    // every value and its agree share show whole, never cut off at the side or the bottom.
    await step("INT-17 values whole: eight statements beside the join strip, 8 then 16 answers, at 1920x1080 and 1280x720", async () => {
      const pfac = await facilitator(env, sql, practiceRoom), tag = randomUUID().slice(0, 6);
      const eight = opts("We know who we are trying to reach", "Our leaders have room to lead", "Decisions get made and stay made", "Our systems help more than they hurt",
        "We celebrate what God is doing", "Our staff and elders trust each other with hard conversations", "Newcomers find a next step within a month", "We agree");
      const id = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,options,settings) values($1,$2,'Day 1',899,'statements',$3,'ready',
        private.session_options('statements',$4::jsonb,$1),'{"anonymous":true,"burst_minutes":4,"join_strip":true}') returning id`,
        [practiceRoom, `Values ${tag}`, "How true is each of these for us today?", { items: eight, low: "Strongly disagree", high: "Strongly agree" }])).rows[0].id as string;
      const screens: { page: Page; size: string; ctx: BrowserContext }[] = [];
      for (const [width, height] of [[1920, 1080], [1280, 720]]) {
        const ctx = await browser!.newContext({ viewport: { width, height } }), page = await ctx.newPage(); await page.goto(app.origin + "/tv");
        const pcode = await until(async () => { const c = (await page.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
        await pairTv(pfac, practiceRoom, app.secret, pcode, `Values TV ${width}`);
        screens.push({ page, size: `${width}x${height}`, ctx });
      }
      await press(pfac, sql, practiceRoom, "go_live", { session: id });
      for (const { page } of screens) await page.locator(".tv-layer:not(.is-leaving) .tv-join-strip").waitFor({ timeout: 10000 });
      const phones = await joinPhones(app.origin, 16);
      // Everyone agrees with the last statement: "5.0 · 100% agree", the widest value there is.
      const value = (i: number) => ({ ratings: Object.fromEntries(eight.map((o, k) => [o.key, k === 7 ? 5 : ((i + k * 2) % 5) + 1])) });
      for (const n of [8, 16]) {
        for (let i = n === 8 ? 0 : 8; i < n; i++) assert.equal(await phones[i].send(id, value(i)), "accepted");
        for (const { page, size } of screens) {
          await until(async () => (await page.locator(".tv-foot .tv-tally").innerText()).trim() === `${n} answering`, `${size}: ${n} answering`, 8000);
          await delay(1500);
          const cut = await page.locator(".tv-layer:not(.is-leaving) .tv-bars").evaluate(board => {
            const edge = board.getBoundingClientRect(), range = document.createRange();
            return [...board.querySelectorAll<HTMLElement>(".tv-bar:not(.is-leaving) .tv-bar-value")].filter(el => {
              range.selectNodeContents(el); const text = range.getBoundingClientRect();
              return el.scrollWidth > el.clientWidth + 1 || text.right > edge.right + 1 || text.bottom > edge.bottom + 1;
            }).map(el => el.textContent);
          });
          assert.deepEqual(cut, [], `${size}, ${n} answering: every value shows whole`);
          const values = await page.locator(".tv-layer:not(.is-leaving) .tv-bar:not(.is-leaving) .tv-bar-value").allInnerTexts();
          assert.equal(values.length, 8); assert.ok(values.includes("5.0 · 100% agree"), `${size}: the widest value, whole (${values.join(" | ")})`);
          await shot(page, `int-17-values-${n}-${size}-tv`);
        }
      }
      await press(pfac, sql, practiceRoom, "nothing_live");
      for (const { ctx } of screens) await ctx.close();
    });

    // ---------- 50 simulated phones in the practice room, every kind ----------
    await step("Crowded, 50 phones: every kind's answers reach the TV under one second, nothing jumps, numbers match the server", async () => {
      const seeded = (await sql.query("select 1 from public.engagements where id=$1 and not deleted", [practiceRoom])).rowCount;
      assert.equal(seeded, 1, "Run npm run db:seed first: the 50 phone run uses the practice room");
      const pfac = await facilitator(env, sql, practiceRoom), tag = randomUUID().slice(0, 6);
      const mk = async (title: string, kind: string, prompt: string, options: Record<string, unknown>, position: number) =>
        (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,options) values($1,$2,'Day 1',$3,$4,$5,'ready',private.session_options($4,$6::jsonb,$1)) returning id`, [practiceRoom, `${title} ${tag}`, 900 + position, kind, prompt, options])).rows[0].id as string;
      const five = opts("Reaching new people", "Next generation", "Welcome and first visits", "Systems and data", "Second campus and facility");
      const kinds = [
        { kind: "choice", id: await mk("Load choice", "choice", "Where should our next season go?", { items: five, multiple: false }, 1), value: (i: number) => ({ choices: [`o${[1, 2, 2, 3, 4, 3, 5, 2][i % 8]}`] }) },
        { kind: "scale", id: await mk("Load scale", "scale", "How clear is our current direction?", { max: 5 }, 2), value: (i: number) => ({ value: [3, 4, 5, 2, 4, 3, 4, 1][i % 8] }) },
        { kind: "ranking", id: await mk("Load ranking", "ranking", "Rank these", { items: five }, 3), value: (i: number) => ({ order: [["o1", "o2", "o3", "o4", "o5"], ["o2", "o1", "o4"], ["o4", "o1", "o3"], ["o1", "o3", "o2", "o5"]][i % 4] }) },
        { kind: "points", id: await mk("Load points", "points", "Spend 100 points", { items: five, cut: 3 }, 4), value: (i: number) => ({ points: [{ o1: 40, o2: 30, o3: 10, o4: 10, o5: 10 }, { o4: 50, o2: 25, o1: 25 }, { o5: 100 }, { o1: 20, o2: 20, o3: 20, o4: 20, o5: 20 }][i % 4] }) },
        { kind: "statements", id: await mk("Load statements", "statements", "How true is each of these?", { items: five }, 5), value: (i: number) => ({ ratings: Object.fromEntries(five.map((o, k) => [o.key, ((i + k * 2) % 5) + 1])) }) },
      ];
      const ptvContext = await browser!.newContext({ viewport: { width: 1920, height: 1080 } });
      const ptv = await ptvContext.newPage(); await ptv.goto(app.origin + "/tv");
      const pcode = await until(async () => { const c = (await ptv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
      await pairTv(pfac, practiceRoom, app.secret, pcode, "Bars load TV");
      await ptv.evaluate(sampler);
      const phones = await joinPhones(app.origin, 50);
      const from = new Date(Date.now() - 1000).toISOString();
      for (const k of kinds) {
        await press(pfac, sql, practiceRoom, "go_live", { session: k.id });
        await until(async () => (await ptv.locator(".tv-layer:not(.is-leaving)").last().getAttribute("data-kind")) === k.kind, `${k.kind} on the practice TV`, 10000);
        await delay(800);
        // A burst: 50 phones out, each answering within 5 seconds; then 10 change their answer.
        const sent = await Promise.all(phones.map(async (p, i) => { await delay(Math.floor(Math.random() * 5000)); return p.send(k.id, k.value(i)); }));
        assert.ok(sent.every(s => s === "accepted"), `${k.kind}: every answer accepted (${[...new Set(sent)]})`);
        const changed = await Promise.all(phones.slice(0, 10).map(async (p, i) => { await delay(Math.floor(Math.random() * 1500)); return p.send(k.id, k.value(i + 3)); }));
        assert.ok(changed.every(s => s === "accepted"), `${k.kind}: every change accepted`);
        await until(async () => (await ptv.locator(".tv-foot .tv-tally").innerText()).trim() === "50 answering", `${k.kind}: 50 answering`, 10000);
        const server = (await sql.query("select results from public.room_states where engagement_id=$1", [practiceRoom])).rows[0].results;
        if (k.kind === "scale") {
          await until(async () => (await ptv.locator(".tv-layer:not(.is-leaving) .tv-scale-number").last().innerText()) === Number(server.scale.average).toFixed(1), "scale average matches the server", 8000);
        } else {
          const want = (server.bars as Bar[]).map(b => b.key);
          await until(async () => {
            const rows = await ptv.locator(".tv-layer:not(.is-leaving) .tv-bar:not(.is-leaving)").evaluateAll(rs => rs.map(r => ({ key: (r as HTMLElement).dataset.key!, y: r.getBoundingClientRect().top, w: parseFloat((r.querySelector(".tv-bar-fill") as HTMLElement).style.width) || 0 })));
            const byY = rows.sort((a, b) => a.y - b.y);
            return byY.length === want.length && byY.every((r, i) => r.key === want[i] && Math.abs(r.w - (server.bars as Bar[])[i].fraction * 100) < 0.6);
          }, `${k.kind}: the TV settles on the server's order and lengths`, 8000);
          const log = await ptv.evaluate(() => { const w = window as unknown as { __bars: Sample[] }; const out = w.__bars.slice(); w.__bars.length = 0; return out; }) as Sample[];
          const seen = new Map<string, number>();
          for (const frame of log) for (const [key, y, , h] of frame) { const prev = seen.get(key); if (prev !== undefined && y !== null) assert.ok(Math.abs(y - prev) <= h + 1, `${k.kind}: ${key} jumped`); if (y !== null) seen.set(key, y); }
        }
        if (process.env.KIT_SHOTS) await shot(ptv, `int-${({ choice: "04", scale: "05", ranking: "06", points: "07", statements: "17" } as Record<string, string>)[k.kind]}-crowded-50-tv`);
      }
      await delay(3000);
      const to = new Date().toISOString(), cookie = pfac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
      const report = await (await fetch(`${app.origin}/api/control/${practiceRoom}/latency?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { headers: { Cookie: cookie } })).json();
      console.log(`50 phones, five kinds: ${report.measured} answers measured. ${verdict(report).label} Phone to TV: median ${report.phone_tv.p50} ms, 95th ${report.phone_tv.p95} ms, slowest ${report.phone_tv.max} ms. Not received by a TV: ${report.missing_tv}.`);
      assert.equal(report.measured, 300, "every answer and change reached the TV and was logged");
      assert.ok(verdict(report).met, "95 of 100 under one second on loopback");
      await press(pfac, sql, practiceRoom, "nothing_live");
      await ptvContext.close();
    });
    console.log(`Bar family kit: ${passed.length} checks passed. Local checks on loopback.`);
  } catch (error) {
    console.error(app.output().slice(-3000));
    if (process.env.KIT_SHOTS) for (const [i, page] of (browser?.contexts() ?? []).flatMap(c => c.pages()).entries()) await page.screenshot({ path: `${process.env.KIT_SHOTS}/failure-${i}.png` }).catch(() => {});
    throw error;
  } finally { await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); }
}

// Simulated phones join the practice room by name and send structured answers through the
// same endpoint as a real phone (as scripts/load-test.ts does for text).
async function joinPhones(origin: string, count: number) {
  class Phone {
    private jar = new Map<string, string>();
    offset = 0; uncertainty = 60000;
    async call(path: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers); headers.set("Origin", origin);
      if (this.jar.size) headers.set("Cookie", [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "));
      if (init.body) headers.set("Content-Type", "application/json");
      const response = await fetch(origin + path, { ...init, headers, redirect: "manual" });
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
      await this.clock();
    }
    async clock() {
      const sent = Date.now(), data = await (await this.call(`/api/live/${practiceRoom}?surface=phone`, { cache: "no-store" })).json(), received = Date.now();
      this.offset = Date.parse(data.server_time) - (sent + received) / 2; this.uncertainty = (received - sent) / 2;
    }
    async send(session: string, value: unknown) {
      const body = { id: randomUUID(), session, revision: 0, action: "submit", text: "", value, sentAt: new Date(Date.now() + this.offset).toISOString(), uncertaintyMs: Math.min(60000, Math.round(this.uncertainty)) };
      const data = await (await this.call(`/api/live/${practiceRoom}`, { method: "POST", body: JSON.stringify(body) })).json().catch(() => ({ status: "failed" }));
      return data.status as string;
    }
  }
  const phones: Phone[] = [];
  for (let start = 0; start < count; start += 10) {
    const batch = Array.from({ length: Math.min(10, count - start) }, () => new Phone());
    await Promise.all(batch.map((p, i) => p.join(`Bars phone ${String(start + i + 1).padStart(2, "0")}`)));
    phones.push(...batch);
  }
  // One clock for every simulated phone: the fastest of several samples wins.
  let best = { offset: phones[0].offset, uncertainty: phones[0].uncertainty };
  for (let i = 0; i < 5; i++) { await phones[0].clock(); if (phones[0].uncertainty < best.uncertainty) best = { offset: phones[0].offset, uncertainty: phones[0].uncertainty }; }
  for (const p of phones) { p.offset = best.offset; p.uncertainty = best.uncertainty; }
  return phones;
}
main().catch(error => { console.error(error); process.exit(1); });
