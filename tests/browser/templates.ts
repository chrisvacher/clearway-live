// Milestone 3, step 6b: the run of show built by dragging (SET-07, pass 3 change 15) and
// templates (SET-08), in real browsers against the production build and the local stack.
// The facilitator starts an engagement from the team workshop template, builds on it by
// dragging, clicking and the keyboard, saves it as a template, then runs sessions from the
// template on a paired TV and a phone. KIT_SHOTS=<folder> saves the screens. Local only.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

const teamWorkshop = "c1ea0000-0000-4000-8000-000000000001";
async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shot = async (page: Page, name: string, wait = 900) => { if (process.env.KIT_SHOTS) { await delay(wait); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    const room = await engagement(sql, ["Ruth"]);
    await sql.query("update public.engagements set title='Team workshop',type='team_workshop' where id=$1", [room.id]);
    const fac = await facilitator(env, sql, room.id);
    browser = await chromium.launch();
    const facContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await facContext.addCookies(fac.cookies(app.origin));
    const editor = await facContext.newPage();
    // KIT_CPU_THROTTLE=4 slows the facilitator browser down like a small CI runner.
    if (process.env.KIT_CPU_THROTTLE) await (await facContext.newCDPSession(editor)).send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.KIT_CPU_THROTTLE) });
    const run = async () => (await sql.query("select s.id,s.title,s.position,s.state,s.interaction,s.planned_start,s.planned_minutes,s.options,s.revision,n.notes from public.sessions s left join private.session_notes n on n.session_id=s.id where s.engagement_id=$1 and s.part='Day 1' and not s.deleted order by s.position,s.id", [room.id])).rows as
      { id: string; title: string; position: number; state: string; interaction: string; planned_start: Date | null; planned_minutes: number; options: Record<string, unknown>; revision: number; notes: string }[];
    // Its own name, so the kit can run again on the same database.
    const tplName = `Riverside team night ${room.id.slice(0, 4)}`;
    const titles = async () => (await run()).map(r => r.title);
    const rows = () => editor.locator(".rb-part[data-part='Day 1'] .rb-row");
    const rowTitles = async () => (await rows().locator(".rb-name strong").allInnerTexts());
    // The run is still: no rows gliding and, unless options are meant to stay open, no
    // options panel open or sliding closed. Positions read before this can be stale: a
    // closing panel shrinks the page, the browser clamps the scroll and every row moves.
    const still = (panels: boolean) => until(() => editor.evaluate(panels => (!panels || !document.querySelector(".rb-opts .show-panel"))
      && [...document.querySelectorAll<HTMLElement>(".rb-run [data-glide]")].every(el => !el.style.transform), panels), "the run settles", 10000);
    // A real pointer drag, in small steps so the gap follows the pointer.
    async function drag(from: string, to: { row: number; above: boolean } | "end", hold?: () => Promise<void>) {
      await still(false);
      await editor.locator(from).evaluate(el => el.scrollIntoView({ block: "center" }));
      const a = await editor.locator(from).boundingBox(); assert.ok(a, `${from} on screen`);
      await editor.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await editor.mouse.down();
      await editor.mouse.move(a.x + a.width / 2 - 20, a.y + a.height / 2, { steps: 4 });
      // Picking it up slides any open options closed first; read the run once that is done.
      await still(true);
      let x = 0, y = 0;
      if (to === "end") { const b = (await rows().last().boundingBox())!; x = b.x + b.width / 2; y = b.y + b.height + 30; }
      else {
        // Where the row sits without any gap already open (a dragged row opens one at once).
        const head = (await rows().nth(to.row).locator(".rb-head").boundingBox())!, slot = await editor.locator(".rb-slot").count() ? await editor.locator(".rb-slot").boundingBox() : null;
        const shift = slot && slot.y < head.y ? slot.height + 8 : 0;
        x = head.x + head.width / 2; y = (to.above ? head.y + 6 : head.y + head.height - 6) - shift;
      }
      await editor.mouse.move(x, y, { steps: 18 });
      await until(async () => await editor.locator(".rb-slot").count() === 1, "the gap opens where it will land");
      if (hold) await hold();
      await editor.mouse.up();
    }

    // ---------- SET-08: the library and Use a template ----------
    await step("SET-08: the library lists the team workshop template, ninety minutes, with its sessions", async () => {
      await editor.goto(`${app.origin}/setup/templates?engagement=${room.id}`);
      const card = editor.locator(".tpl-card", { hasText: "Team workshop" });
      await card.waitFor();
      assert.match(await card.innerText(), /90 minutes · 11 sessions/);
      assert.match(await card.innerText(), /Clearway/); assert.match(await card.innerText(), /Ships with the app/);
      await card.getByRole("button", { name: "Preview" }).click();
      const panel = editor.locator(".tpl-panel");
      assert.deepEqual((await panel.locator(".rb-name strong").allInnerTexts()).slice(0, 4), ["Screen check", "Welcome", "Opening prayer", "Check-in"]);
      assert.ok((await panel.innerText()).includes("1:25"), "times from the durations");
      await shot(editor, "set-08-library");
    });
    await step("SET-08: Use a template from the team workshop copies its sessions, prompts, settings, timings and notes", async () => {
      await editor.locator(".tpl-panel").getByRole("button", { name: "Use this template" }).click();
      const dialog = editor.getByRole("dialog", { name: "Use a template" });
      await dialog.waitFor();
      assert.equal(await dialog.locator("#start-engagement").inputValue(), room.id, "the engagement it came from");
      await dialog.locator("#start-time").fill("2026-11-19T19:00");
      assert.match(await dialog.innerText(), /Copies 11 sessions/);
      await shot(editor, "set-08-start-engagement");
      await dialog.getByRole("button", { name: "Apply template" }).click();
      await editor.waitForURL(`**/setup/${room.id}/run-of-show**`, { timeout: 15000 });
      await editor.getByText("Started from the template: 11 sessions added.").waitFor();
      const copied = await run();
      assert.equal(copied.length, 11);
      const template = (await sql.query("select sessions from private.templates where id=$1", [teamWorkshop])).rows[0].sessions as { title: string; prompt: string; notes: string; planned_minutes: number; options: Record<string, unknown> }[];
      for (const [i, t] of template.entries()) {
        assert.equal(copied[i].title, t.title); assert.equal(copied[i].notes, t.notes, `${t.title} notes`); assert.equal(copied[i].planned_minutes, t.planned_minutes);
      }
      assert.equal(copied[0].planned_start?.toISOString(), "2026-11-20T00:00:00.000Z", "7:00 pm in Toronto");
      assert.equal(copied[10].planned_start?.toISOString(), "2026-11-20T01:25:00.000Z");
      assert.equal(copied.find(r => r.title === "Where to focus")!.options.cut, 3);
      assert.deepEqual(await rowTitles(), template.map(t => t.title));
      assert.equal(await rows().first().locator(".rb-time").innerText(), "7:00 p.m.");
      assert.equal(await editor.locator(".rb-chip.is-ready").count(), 11, "every session Ready");
      await shot(editor, "set-07-from-template");
    });

    // ---------- SET-07: build by dragging ----------
    await step("SET-07: dragging a tile over the run opens a gap; dropping inserts it there and slides its options open", async () => {
      const before = await run(), check = before.findIndex(r => r.title === "Check-in");
      await drag(".rb-tile:has-text('Multiple choice')", { row: check + 1, above: true }, async () => {
        const slotIndex = await editor.locator(".rb-part[data-part='Day 1'] .rb-list > li").evaluateAll(els => els.findIndex(el => el.classList.contains("rb-slot")));
        assert.equal(slotIndex, check + 1, "the gap sits after Check-in");
        assert.match(await editor.locator(".rb-slot").innerText(), /Drop Multiple choice here/);
        assert.equal(await editor.locator(".rb-ghost").count(), 1, "the tile follows the pointer");
        await shot(editor, "set-07-drag-gap", 250);
      });
      await until(async () => (await rowTitles())[check + 1] === "Multiple choice", "dropped into the gap");
      await editor.locator(".rb-row.is-open #session-title").waitFor();
      assert.equal(await editor.locator(".rb-row.is-open").count(), 1);
      await until(async () => (await titles())[check + 1] === "Multiple choice", "saved where it landed", 8000);
      const after = await run(), dropped = after[check + 1];
      assert.equal(dropped.state, "draft", "a dropped interaction starts as a Draft");
      assert.equal(after[check + 2].planned_start!.getTime() - before[check + 1].planned_start!.getTime(), 5 * 60000, "the times after it move by its length");
      await shot(editor, "set-07-dropped-options");
    });
    await step("SET-07: the options open in place; Done saves them and marks the session Ready", async () => {
      const open = editor.locator(".rb-row.is-open");
      await open.locator("#session-title").fill("Which do we start with?");
      await open.locator("#session-prompt").fill("Which of these should our team start with?");
      await open.getByLabel("Choice 1", { exact: true }).fill("Clearer communication");
      await open.getByLabel("Choice 2", { exact: true }).fill("Shared priorities");
      await open.getByLabel("Choice 3", { exact: true }).fill("Better meetings");
      await open.locator("#session-notes").fill("Ask for one pick each.");
      assert.ok((await open.innerText()).includes("from the lengths before it"), "its start follows the lengths before it");
      await shot(editor, "set-07-options-in-place");
      await open.getByRole("button", { name: "Done" }).click();
      await until(async () => (await run()).find(r => r.title === "Which do we start with?")?.state === "ready", "saved as Ready", 8000);
      const saved = (await run()).find(r => r.title === "Which do we start with?")!;
      assert.deepEqual((saved.options.items as { text: string }[]).map(o => o.text), ["Clearer communication", "Shared priorities", "Better meetings"]);
      assert.equal(saved.notes, "Ask for one pick each.");
      await until(async () => await editor.locator(".rb-row.is-open").count() === 0, "Done closes the options");
      assert.equal(await editor.locator(".rb-row", { hasText: "Which do we start with?" }).locator(".rb-chip").innerText(), "Ready");
    });
    await step("SET-07: grabbing another tile slides any open options closed first; Save as draft keeps a Draft", async () => {
      await editor.locator(".rb-row", { hasText: "What's working" }).getByRole("button", { name: /Open options/ }).click();
      await editor.locator(".rb-row.is-open #session-title").waitFor();
      await editor.locator(".rb-row.is-open #session-prompt").fill("What's working that we should protect this season?");
      await drag(".rb-tile:has-text('Statements')", { row: (await rowTitles()).indexOf("Your questions"), above: true }, async () => {
        assert.equal(await editor.locator(".rb-row.is-open").count(), 0, "the open options closed before the gap opened");
        assert.equal(await editor.locator(".rb-row", { hasText: "What's working" }).locator(".rb-chip.is-unsaved").count(), 1, "its unsaved edits wait");
      });
      const open = editor.locator(".rb-row.is-open");
      await open.locator("#session-title").waitFor();
      assert.equal(await open.locator("#session-title").inputValue(), "Statements");
      await open.getByRole("button", { name: "Save as draft" }).click();
      await until(async () => (await run()).find(r => r.title === "Statements")?.state === "draft", "kept as a Draft", 8000);
      await until(async () => await editor.locator(".rb-row.is-open").count() === 0, "closed");
      // Reopen the first session: its unsaved edits are still there.
      await editor.locator(".rb-row", { hasText: "What's working" }).getByRole("button", { name: /Open options/ }).click();
      assert.equal(await editor.locator(".rb-row.is-open #session-prompt").inputValue(), "What's working that we should protect this season?");
      await editor.locator(".rb-row.is-open").getByRole("button", { name: "Done" }).click();
      await until(async () => (await sql.query("select prompt from public.sessions where engagement_id=$1 and title=$2", [room.id, "What's working"])).rows[0].prompt === "What's working that we should protect this season?", "saved after the move", 8000);
    });
    await step("SET-07: clicking a tile adds it at the end; Remove takes a session out", async () => {
      const n = (await run()).length;
      await editor.locator(".rb-tile", { hasText: "Word cloud" }).click();
      await until(async () => (await rowTitles()).at(-1) === "Word cloud", "added at the end");
      await editor.locator(".rb-row.is-open #session-title").waitFor();
      await until(async () => (await run()).length === n + 1 && (await titles()).at(-1) === "Word cloud", "saved at the end", 8000);
      await editor.locator(".rb-row.is-open").getByRole("button", { name: "Remove" }).click();
      await until(async () => !(await rowTitles()).includes("Word cloud"), "removed from the run");
      await until(async () => (await run()).length === n, "removed in the database", 8000);
      const last = await run();
      assert.equal(last.at(-1)!.title, "Sending prayer");
    });
    await step("SET-07: the keyboard picks up a tile or a row, moves it with the arrows and drops it", async () => {
      const tile = editor.locator(".rb-tile", { hasText: "Scale" });
      await tile.focus(); await editor.keyboard.press("Space");
      await until(async () => await editor.locator(".rb-slot").count() === 1, "a gap at the end");
      assert.match(await editor.locator("p.sr-only[aria-live='assertive']").innerText(), /picked up/);
      await editor.keyboard.press("ArrowUp"); await editor.keyboard.press("ArrowUp");
      await shot(editor, "set-07-keyboard-gap", 300);
      await editor.keyboard.press("Enter");
      const n = (await run()).length;
      await until(async () => (await rowTitles()).at(-3) === "Scale", "dropped two from the end");
      await editor.locator(".rb-row.is-open #session-title").waitFor();
      await until(async () => (await run()).length === n + 1 && (await titles()).at(-3) === "Scale", "saved there", 8000);
      await editor.locator(".rb-row.is-open").getByRole("button", { name: "Remove" }).click();
      await until(async () => (await run()).length === n, "removed", 8000);
      // Move Sending prayer up one place with the keyboard.
      await editor.getByRole("button", { name: "Move Sending prayer" }).focus(); await editor.keyboard.press("Space");
      await editor.keyboard.press("ArrowUp"); await editor.keyboard.press("Enter");
      await until(async () => (await titles()).slice(-2).join() === "Sending prayer,Our commitment", "moved by the keyboard", 8000);
    });
    await step("SET-07: dragging a row moves it, and times recalculate from the durations", async () => {
      await drag(".rb-row:has-text('Our commitment') .rb-grip", { row: (await rowTitles()).indexOf("Sending prayer"), above: true });
      await until(async () => (await titles()).slice(-2).join() === "Our commitment,Sending prayer", "moved back by dragging", 8000);
      const r = (await run()).filter(x => x.planned_start);
      for (let i = 1; i < r.length; i++) assert.equal(r[i].planned_start!.getTime(), r[i - 1].planned_start!.getTime() + r[i - 1].planned_minutes * 60000, `${r[i].title} starts when ${r[i - 1].title} ends`);
      const total = r.reduce((n, s) => n + s.planned_minutes, 0);
      assert.match(await editor.locator(".show-header").innerText(), new RegExp(`${r.length} sessions · ${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`));
      await shot(editor, "set-07-built");
    });
    await step("SET-07: the palette adds a self-paced session; its times use the form's self-paced fields and never move", async () => {
      const liveBefore = (await run()).filter(r => r.planned_start).map(r => r.planned_start!.getTime());
      await editor.getByRole("radio", { name: "Self-paced" }).click();
      assert.equal(await editor.locator(".rb-tile", { hasText: "Holding" }).isDisabled(), true, "content screens run in the room");
      await editor.locator(".rb-tile", { hasText: "Open text" }).click();
      const open = editor.locator(".rb-row.is-open");
      await open.locator("#session-opens").waitFor();
      assert.ok(await open.locator("#session-opens").inputValue(), "a starting window"); assert.ok(await open.locator("#session-closes").inputValue());
      assert.equal(await open.locator("#session-mode").inputValue(), "self_paced");
      await open.locator("#session-title").fill("Before we meet");
      await open.locator("#session-prompt").fill("What do you hope this workshop changes for our team?");
      const local = (ms: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ms)).replace(" ", "T");
      const opens = Math.floor(Date.now() / 60000) * 60000 - 3600000, closes = opens + 3 * 86400000;
      await open.locator("#session-opens").fill(local(opens)); await open.locator("#session-closes").fill(local(closes));
      assert.match(await open.innerText(), /takes no room time/);
      await shot(editor, "set-07-self-paced-options");
      await open.getByRole("button", { name: "Done", exact: true }).click();
      const saved = await until(async () => (await sql.query("select mode,state,opens_at,closes_at,planned_start from public.sessions where engagement_id=$1 and title='Before we meet'", [room.id])).rows.find(r => r.state === "ready"), "saved as a ready self-paced session", 8000);
      // Done has finished on screen too: its options have slid closed.
      await until(async () => await editor.locator(".rb-opts .show-panel").count() === 0, "Done closes the options", 10000);
      assert.equal(saved.mode, "self_paced"); assert.equal(saved.opens_at.getTime(), opens); assert.equal(saved.closes_at.getTime(), closes); assert.equal(saved.planned_start, null);
      await until(async () => (await editor.locator(".rb-row", { hasText: "Before we meet" }).innerText()).includes("Self-paced"), "the row says Self-paced");
      assert.match(await editor.locator(".rb-row", { hasText: "Before we meet" }).innerText(), /Open until/);
      assert.deepEqual((await run()).filter(r => r.planned_start).map(r => r.planned_start!.getTime()), liveBefore, "a self-paced session takes no room time");
      // Moving a live session never moves the self-paced window.
      await drag(".rb-row:has-text('Sending prayer') .rb-grip", { row: (await rowTitles()).indexOf("Our commitment"), above: true });
      await until(async () => (await titles()).filter(t => t !== "Before we meet").slice(-2).join() === "Sending prayer,Our commitment", "moved", 8000).catch(async error => { await shot(editor, "debug-moved", 0); throw new Error(`${error.message}: run ${(await titles()).join(" | ")}; on screen ${(await rowTitles()).join(" | ")}`); });
      const after = (await sql.query("select opens_at,closes_at from public.sessions where engagement_id=$1 and title='Before we meet'", [room.id])).rows[0];
      assert.equal(after.opens_at.getTime(), opens); assert.equal(after.closes_at.getTime(), closes);
      await drag(".rb-row:has-text('Our commitment') .rb-grip", { row: (await rowTitles()).indexOf("Sending prayer"), above: true });
      await until(async () => (await titles()).filter(t => t !== "Before we meet").slice(-2).join() === "Our commitment,Sending prayer", "moved back", 8000);
      await editor.getByRole("radio", { name: "Live in the room" }).click();
      await shot(editor, "set-07-self-paced-row");
    });
    await step("SET-08: Save as template keeps any run of show for next time", async () => {
      await editor.getByRole("button", { name: "Save as template" }).click();
      const dialog = editor.getByRole("dialog", { name: "Save as template" });
      await dialog.locator("#template-name").fill(tplName);
      assert.match(await dialog.innerText(), /14 sessions with their prompts, interaction settings, timings and presenter notes/);
      await shot(editor, "set-08-save-as-template");
      await dialog.getByRole("button", { name: "Save template" }).click();
      await dialog.getByText(`Saved ${tplName} with 14 sessions.`).waitFor();
      const saved = (await sql.query("select sessions from private.templates where name=$1 and not deleted", [tplName])).rows[0].sessions as { title: string; notes: string }[];
      assert.equal(saved.length, 14); assert.equal((saved as { title: string; mode?: string }[]).find(s => s.title === "Before we meet")!.mode, "self_paced"); assert.equal(saved.find(s => s.title === "Which do we start with?")!.notes, "Ask for one pick each.");
      await dialog.getByRole("button", { name: "Close" }).last().click();
      await editor.goto(`${app.origin}/setup/templates`);
      const card = editor.locator(".tpl-card", { hasText: tplName });
      assert.match(await card.innerText(), /Saved by you/);
    });
    await step("SET-08: Use a template from it shifts live and self-paced times alike; 6a's rehearsal, self-paced list and export work", async () => {
      const second = await engagement(sql, ["Ben"]);
      await sql.query("update public.engagements set title='Board night' where id=$1", [second.id]);
      await sql.query("insert into public.engagement_facilitators(engagement_id,clearway_user_id,role) select $1,clearway_user_id,'lead' from public.engagement_facilitators where engagement_id=$2 and not deleted limit 1", [second.id, room.id]);
      const source = (await sql.query("select title,mode,planned_start,opens_at,closes_at from public.sessions where engagement_id=$1 and not deleted", [room.id])).rows;
      const firstLive = Math.min(...source.filter(r => r.mode === "live" && r.planned_start).map(r => r.planned_start.getTime()));
      await editor.goto(`${app.origin}/setup/templates?engagement=${second.id}`);
      await editor.locator(".tpl-card", { hasText: tplName }).getByRole("button", { name: `Use ${tplName}` }).click();
      const dialog = editor.getByRole("dialog", { name: "Use a template" });
      assert.equal(await dialog.locator("#start-engagement").inputValue(), second.id);
      await dialog.locator("#start-time").fill("2026-12-03T19:00");
      await dialog.getByRole("button", { name: "Apply template" }).click();
      await editor.waitForURL(`**/setup/${second.id}/run-of-show**`, { timeout: 15000 });
      const copied = (await sql.query("select title,mode,state,planned_start,opens_at,closes_at from public.sessions where engagement_id=$1 and not deleted", [second.id])).rows;
      assert.equal(copied.length, 14);
      const shift = Date.parse("2026-12-04T00:00:00Z") - firstLive;
      const was = source.find(r => r.title === "Before we meet")!, now = copied.find(r => r.title === "Before we meet")!;
      assert.equal(now.mode, "self_paced"); assert.equal(now.state, "ready");
      assert.equal(now.opens_at.getTime(), was.opens_at.getTime() + shift, "the window shifts with the start"); assert.equal(now.closes_at.getTime(), was.closes_at.getTime() + shift);
      assert.equal(Math.min(...copied.filter(r => r.planned_start).map(r => r.planned_start.getTime())), Date.parse("2026-12-04T00:00:00Z"), "the first live session starts when chosen");
      // Step 6a's surfaces on the engagement started from the template.
      await sql.query("update public.sessions set opens_at=now()-interval '1 hour',closes_at=now()+interval '2 days' where engagement_id=$1 and title='Before we meet'", [second.id]);
      const control = await facContext.newPage(); await control.goto(`${app.origin}/control/${second.id}`);
      await until(async () => (await control.locator(".sp-list li", { hasText: "Before we meet" }).innerText().catch(() => "")).includes("0 answered"), "the self-paced list", 15000);
      assert.match(await control.locator(".sp-list li", { hasText: "Before we meet" }).innerText(), /Open/);
      await control.getByRole("button", { name: "Start rehearsal" }).click();
      await until(async () => await control.locator(".sp-rehearsal[data-rehearsing='on']").count() === 1, "rehearsing", 10000);
      await press(fac, sql, second.id, "go_live", { session: (await sql.query("select id from public.sessions where engagement_id=$1 and title='Check-in'", [second.id])).rows[0].id });
      const exportLink = control.getByRole("link", { name: "Export answers", exact: true });
      await until(async () => await exportLink.isVisible(), "Export answers", 10000);
      const [download] = await Promise.all([control.waitForEvent("download"), exportLink.click()]);
      assert.match(download.suggestedFilename(), /\.csv$/);
      await shot(control, "set-08-template-control-surface");
      await press(fac, sql, second.id, "nothing_live");
      await control.getByRole("button", { name: "End rehearsal" }).click();
      await until(async () => await control.locator(".sp-rehearsal[data-rehearsing='off']").count() === 1, "rehearsal ended", 10000);
      await control.close();
    });

    // ---------- A team workshop from the template, on a TV and a phone ----------
    const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvContext.newPage(); await tv.goto(app.origin + "/tv");
    const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(fac, room.id, app.secret, code);
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
    const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const ruth = await phoneContext.newPage(); await ruth.goto(`${app.origin}/room/${room.id}`);
    const before = mail.count;
    await ruth.fill("#room-email", room.attendees[0].email); await ruth.getByRole("button", { name: "Send me a sign-in code" }).click();
    await ruth.fill("#room-code", await mail.code(room.attendees[0].email, before)); await ruth.getByRole("button", { name: "Sign in" }).click();
    await ruth.locator(".ph-app").waitFor({ timeout: 15000 });
    const session = async (title: string) => (await run()).find(r => r.title === title)!.id;
    const live = async (title: string) => { await press(fac, sql, room.id, "go_live", { session: await session(title) }); await delay(1100); };

    await step("From the template: the welcome holding screen on the TV, phones waiting", async () => {
      await live("Welcome");
      await until(async () => (await layer().innerText()).includes("Welcome to Riverside Church"), "welcome on the TV", 10000);
      assert.ok((await layer().innerText()).includes("Check-in and one word"), "the outline from the template");
      await until(async () => (await ruth.locator(".ph-body").innerText()).includes("You’re in"), "phone waits");
      await shot(tv, "template-welcome-tv"); await shot(ruth, "template-welcome-phone");
    });
    const inside = async (selector: string) => {
      const stage = (await tv.locator(".tv-stage").boundingBox())!, boxes = await tv.locator(selector).evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }));
      return boxes.length > 0 && boxes.every(b => b.bottom <= stage.y + stage.height - 40 && b.right <= stage.x + stage.width && b.top >= stage.y);
    };
    await step("TV: a twelve-line outline fits the screen, in two columns at the type floor", async () => {
      const welcome = await session("Welcome");
      const outline = ["9:00 Welcome and prayer", "9:15 Check-in", "9:25 One word for this season", "9:35 What's working", "9:55 Where to focus", "10:10 Coffee", "10:25 Effort and impact", "10:40 Your questions",
        "10:55 Our commitment", "11:05 Sending prayer", "11:15 Lunch together", "12:00 Home"].join("\n");
      await sql.query("update public.sessions set options=options||jsonb_build_object('outline',$2::text) where id=$1", [welcome, outline]);
      await press(fac, sql, room.id, "nothing_live"); await live("Welcome");
      await until(async () => await layer().locator(".tv-outline-cols .tv-outline-row").count() === 12, "twelve lines in two columns", 10000);
      await delay(800);
      assert.ok(await inside(".tv-layer:not(.is-leaving) .tv-outline-row span"), "every line on the screen, above the count");
      const sizes = await layer().locator(".tv-outline-cols .tv-outline").evaluateAll(els => els.map(el => parseFloat(getComputedStyle(el).fontSize)));
      const floor = await tv.locator(".tv-stage").evaluate(el => parseFloat(getComputedStyle(el).getPropertyValue("--cwl-fs-tv-floor")) || 0);
      assert.ok(sizes.every(px => px >= floor - 0.5), "never below the type floor");
      await shot(tv, "tv-outline-twelve-lines");
    });
    await step("From the template: the check-in scale runs on the phone and the TV", async () => {
      await live("Check-in");
      await until(async () => await ruth.getByRole("radio").count() === 5, "five buttons", 10000);
      assert.ok((await ruth.locator(".ph-app").innerText()).includes("Running on empty"), "the template's end labels");
      await ruth.getByRole("radio", { name: "4" }).click();
      await until(async () => (await layer().locator(".tv-scale-number").innerText().catch(() => "")) === "4.0", "the average on the TV", 8000);
      await shot(tv, "template-check-in-tv"); await shot(ruth, "template-check-in-phone");
    });
    await step("TV: the join strip and the count both show, and neither overlaps the other", async () => {
      const qr = (await layer().locator(".tv-join-strip").boundingBox())!, count = (await tv.locator(".tv-top .tv-tally").boundingBox())!;
      assert.ok(qr && count, "both on the TV");
      const overlap = !(qr.y + qr.height <= count.y || count.y + count.height <= qr.y || qr.x + qr.width <= count.x || count.x + count.width <= qr.x);
      assert.equal(overlap, false, `the strip ${JSON.stringify(qr)} clears the count ${JSON.stringify(count)}`);
      assert.ok(await inside(".tv-layer:not(.is-leaving) .tv-join-strip"), "the strip stays on the screen");
    });
    await step("From the template: one word for this season lands on the TV", async () => {
      await live("One word for this season");
      await until(async () => await ruth.locator("#ph-answer").count() === 1, "the word cloud on the phone", 10000);
      await ruth.fill("#ph-answer", "growing"); await ruth.locator(".ph-send").click();
      await until(async () => (await layer().innerText()).includes("growing"), "the word on the TV", 8000);
      await shot(tv, "template-word-cloud-tv"); await shot(ruth, "template-word-cloud-phone");
    });
    await step("From the builder: the multiple choice added by dragging runs on the phone and the TV", async () => {
      await live("Which do we start with?");
      await until(async () => (await ruth.locator(".ph-app").innerText()).includes("Shared priorities"), "the options on the phone", 10000);
      await ruth.getByRole("radio", { name: /Shared priorities/ }).click(); await ruth.getByRole("button", { name: /Send/i }).click();
      const values = async () => (await layer().locator(".tv-bar-value").allTextContents()).map(t => t.replace(/\s+/g, " ").trim());
      await until(async () => (await values()).includes("1 · 100%"), "the bar on the TV", 8000).catch(async error => {
        await shot(ruth, "debug-choice-phone", 0); await shot(tv, "debug-choice-tv", 0);
        const server = (await sql.query("select results, live_session_id from public.room_states where engagement_id=$1", [room.id])).rows[0];
        const subs = (await sql.query("select text,value,withdrawn from public.submissions where engagement_id=$1 order by created_at desc limit 3", [room.id])).rows;
        throw new Error(`${error.message}\nTV ${JSON.stringify(await values())}\nserver ${JSON.stringify(server)}\nanswers ${JSON.stringify(subs)}`);
      });
      await shot(tv, "template-choice-tv"); await shot(ruth, "template-choice-phone");
    });
    console.log(`Templates and builder kit: ${passed.length} checks passed. Local checks on loopback.`);
  } finally { await browser?.close(); await app.stop(); await mail.close(); await sql.end(); }
}
main().catch(error => { console.error(error); process.exit(1); });
