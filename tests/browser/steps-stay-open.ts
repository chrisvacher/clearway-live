// The live room before Pickering (November 16), in real browsers against the production build and the local stack, in both skins.
// It repeats the November 16 demo: open the live room, open the TV from its chip, join two phones by the room's link name, run every
// step, go back two steps and answer from a phone, Stop and Take answers, Start fresh, End the workshop, Reopen it, and recover the TV
// from the same chip. Then a second computer pairs by the code typed in Room admin. From opening the live room to the first phone answer
// must take under a minute, without visiting Setup. Local only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, startApp, until } from "./harness";

type Phone = { name: string; ctx: BrowserContext; page: Page };

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox(), app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const step = async (name: string, run: () => Promise<void>) => { await run(); console.log(`ok · ${name}`); };
  try {
    await sql.connect(); browser = await chromium.launch();
    const run = async (skin: "clearway" | "novetera") => {
      const room = await engagement(sql, ["Ruth"]), origin = skin === "novetera" ? app.noveteraOrigin : app.origin;
      const linkName = `ppc${randomUUID().replace(/[^0-9]/g, "").slice(0, 6)}`;
      await sql.query(`update public.engagements set title='Team workshop',type='team_workshop',status='setup',skin=$2,link_name=$3,start_date=current_date+1,
        settings=settings||'{"open_join":true}' where id=$1`, [room.id, skin, linkName]);
      const steps = [await room.session("One word", "word_cloud", "One word for today", 0), await room.session("A sentence", "wall", "Say more", 1),
        await room.session("Another word", "word_cloud", "One more word", 2), await room.session("Last thoughts", "wall", "Anything else", 3)];
      const fac = await facilitator(env, sql, room.id);
      const state = async (id: string) => (await sql.query("select state from public.sessions where id=$1", [id])).rows[0].state as string;
      const answers = async () => (await sql.query("select count(*)::int n from public.submissions where engagement_id=$1 and not deleted", [room.id])).rows[0].n as number;
      const answered = async (session: string) => (await sql.query("select count(*)::int n from public.submissions where session_id=$1 and not deleted", [session])).rows[0].n as number;
      const live = async () => (await sql.query("select live_session_id from public.room_states where engagement_id=$1", [room.id])).rows[0].live_session_id as string | null;
      const version = async () => (await sql.query("select version::int v from public.room_states where engagement_id=$1", [room.id])).rows[0].v as number;
      // The live room presses against where it last saw the room; wait for it to see each move before the next press.
      const settled = async () => { const v = await version(); await until(async () => Number(await control.locator(".ctl-app").getAttribute("data-room-version")) >= v, "the live room caught up", 10000); };
      // Room admin opens only if it is closed (the drawer remembers how it was left).
      const openAdmin = async () => { await control.bringToFront(); if ((await control.locator(".ctl-side-toggle").getAttribute("aria-expanded")) !== "true") await control.locator(".ctl-side-toggle").click(); await until(async () => (await control.locator(".ctl-cols.has-side:not(.is-side-off)").count()) === 1, "Room admin is open", 5000); };
      const moveTo = async (button: "next" | "back", to: string) => { await settled(); await control.locator(`.ctl-tp-${button}`).click(); await until(async () => (await live()) === to, `${button} to the step`, 10000); await settled(); };

      const ctx = await browser!.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addCookies(fac.cookies(app.origin));
      const control = await ctx.newPage();
      const visited: string[] = []; control.on("framenavigated", f => { if (f === control.mainFrame()) visited.push(new URL(f.url()).pathname); });
      let tv!: Page; const phones: Phone[] = [];
      const started = Date.now();
      await control.goto(`${app.origin}/control/${room.id}`);

      await step(`${skin}: the TV chip opens the TV already paired, and then says the TV is live`, async () => {
        const chip = control.getByTestId("tv-chip"); await chip.waitFor({ timeout: 20000 });
        assert.match(await chip.innerText(), /No TV connected\. Open the TV/);
        const popup = ctx.waitForEvent("page"); await chip.click(); tv = await popup;
        await tv.locator(".tv-scene.tv-holding.is-active").waitFor({ timeout: 20000 });
        assert.equal(await tv.locator("main[data-surface=tv]").getAttribute("data-skin"), skin);
        await control.getByTestId("tv-live").waitFor({ timeout: 20000 });
        assert.match(await control.getByTestId("tv-live").innerText(), /TV is live/);
      });

      const newPhone = async (name: string) => {
        const pctx = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await pctx.newPage();
        await page.goto(`${origin}/${linkName}`); await page.locator("#open-name").waitFor({ timeout: 15000 });
        await page.fill("#open-name", name); await page.getByRole("button", { name: "Join the room" }).click(); await page.locator(".ph-app").waitFor({ timeout: 15000 });
        const phone = { name, ctx: pctx, page }; phones.push(phone); return phone;
      };
      const prompts = ["One word for today", "Say more", "One more word", "Anything else"];
      // The phone follows the room: wait for the step's own prompt before typing, so the answer goes to the step meant.
      const answer = async (p: Phone, text: string, at: number) => {
        await p.page.locator(".ph-prompt", { hasText: prompts[at] }).waitFor({ timeout: 15000 });
        const box = p.page.locator("#ph-answer"); await box.waitFor({ timeout: 15000 }); await box.fill(text);
        await p.page.locator(".ph-send").click();
      };
      await step(`${skin}: two phones join by the room's link name, and the first answer lands within a minute of opening the live room`, async () => {
        const [priya, ben] = [await newPhone("Priya"), await newPhone("Ben")];
        await moveTo("next", steps[0]);
        await answer(priya, "Hope", 0); await until(async () => (await answered(steps[0])) === 1, "the first answer lands", 10000);
        const seconds = (Date.now() - started) / 1000; console.log(`  ${skin}: ${seconds.toFixed(1)} s from opening the live room to the first phone answer`);
        assert.ok(seconds < 60, `under a minute (${seconds.toFixed(1)} s)`);
        assert.ok(!visited.some(p => p.startsWith("/setup")), `no Setup page on the way (${visited.join(", ")})`);
        await answer(ben, "Courage", 0); await until(async () => (await answered(steps[0])) === 2, "the second phone answers", 10000);
      });

      await step(`${skin}: Next runs every step and never closes one`, async () => {
        const words = ["A sentence from Priya", "Joy", "Last thing"];
        for (let i = 1; i < steps.length; i++) {
          await moveTo("next", steps[i]);
          await answer(phones[0], words[i - 1], i); await until(async () => (await answered(steps[i])) === 1, `step ${i + 1} takes its answer`, 10000);
        }
        for (let i = 0; i < steps.length - 1; i++) assert.equal(await state(steps[i]), "open", `step ${i + 1} stays open`);
        const icons = () => control.locator(".ctl-run-list .ctl-state-icon").evaluateAll(els => els.map(e => e.getAttribute("data-status")).join(","));
        await until(async () => (await icons()) === "open,open,open,open", "the run of show shows every step open", 10000);
        await until(async () => (await control.locator(`li[data-session="${steps[0]}"] .ctl-state-count`).innerText()) === "2", "the run of show counts the first step's answers", 10000);
      });

      await step(`${skin}: Back twice puts an earlier step on the TV, live and answering`, async () => {
        await moveTo("back", steps[2]);
        await moveTo("back", steps[1]);
        assert.equal(await state(steps[1]), "live");
        await answer(phones[1], "Ben says more", 1); await until(async () => (await answered(steps[1])) === 2, "the step gone back to takes answers", 10000);
      });

      await step(`${skin}: a phone scrolls back to an earlier step and answers it`, async () => {
        const p = phones[1].page;
        await p.getByRole("button", { name: "Earlier" }).click();
        await p.locator(".ph-muted", { hasText: "still open" }).waitFor({ timeout: 10000 });
        await answer(phones[1], "Another word", 0); await until(async () => (await answered(steps[0])) === 3, "the earlier step takes the answer", 10000);
      });

      await step(`${skin}: Stop answers stops the step, with no Closed marker on the TV, and it stays stopped until Take answers`, async () => {
        await phones[0].page.getByRole("button", { name: /Back to now/ }).click().catch(() => {});
        await settled(); await control.getByTestId("stop-answers").click(); await until(async () => (await state(steps[1])) === "closed", "stopped", 10000);
        await phones[0].page.getByText("Answers for this step are finished.").waitFor({ timeout: 10000 });
        assert.equal(await phones[0].page.locator("#ph-answer").count(), 0, "the phone cannot send");
        assert.equal(await tv.locator(".tv-live.is-closed, .nvt-closed").count(), 0, "no Closed marker on the TV");
        await until(async () => (await control.locator(`li[data-session="${steps[1]}"] .ctl-state-icon`).getAttribute("data-status")) === "stopped", "the run of show shows it stopped", 5000);
        await moveTo("next", steps[2]);
        await moveTo("back", steps[1]);
        assert.equal(await state(steps[1]), "closed", "a stopped step stays stopped");
        await settled(); await control.getByTestId("take-answers").click(); await until(async () => (await state(steps[1])) === "live", "taking answers again", 10000);
        await phones[0].page.locator("#ph-answer").waitFor({ timeout: 10000 });
      });

      await step(`${skin}: Start fresh is held while a step is live, then deletes every answer and keeps the TV and phones`, async () => {
        // The TV window took the focus when it opened; the live room is the window in front from here (Room admin animates open).
        await openAdmin();
        const fresh = control.getByTestId("start-fresh"); await fresh.waitFor();
        assert.ok(await fresh.isDisabled(), "held while a step is live");
        assert.equal(await control.getByTestId("fresh-export").getAttribute("href"), `/api/control/${room.id}/export?session=all`, "Export answers sits beside it");
        await settled(); await control.locator(".ctl-screen-btn.is-holding").click(); await until(async () => (await live()) === null, "Home", 10000);
        await until(async () => !(await fresh.isDisabled()), "Start fresh is on once nothing is live", 10000);
        await fresh.click(); assert.match(await fresh.innerText(), /Tap again to delete every answer/); await fresh.click();
        await until(async () => (await answers()) === 0, "every answer is deleted", 15000);
        for (const s of steps) assert.equal(await state(s), "ready", "every step is Ready");
        const kept = (await sql.query(`select (select count(*)::int from private.tv_devices where engagement_id=$1 and not deleted) tvs,
          (select count(*)::int from public.device_sessions where engagement_id=$1 and revoked_at is null) phones`, [room.id])).rows[0];
        assert.equal(kept.tvs, 1, "the TV stays paired"); assert.equal(kept.phones, 2, "the phones stay signed in");
        await control.getByText(/^Started fresh\./).waitFor({ timeout: 10000 });
        for (const p of phones) await p.page.locator(".ph-waiting").waitFor({ timeout: 15000 });
        assert.equal(await tv.locator(".tv-scene.tv-pair.is-active").count(), 0, "the TV did not need pairing");
      });

      await step(`${skin}: End the workshop: phones say it ended, the TV window says Workshop ended with no code`, async () => {
        await settled(); await control.locator(`li[data-session="${steps[0]}"] button.is-go`).click(); await until(async () => (await live()) === steps[0], "a step is live", 10000);
        await answer(phones[0], "Again", 0); await until(async () => (await answered(steps[0])) === 1, "answered", 10000);
        await moveTo("next", steps[1]);
        await settled(); await control.getByTestId("stop-answers").click(); await until(async () => (await state(steps[1])) === "closed", "stopped before the end", 10000);
        await control.getByTestId("header-more").click(); await control.getByTestId("end-workshop").click(); await control.getByTestId("end-workshop-confirm").click();
        await control.getByTestId("workshop-ended").waitFor({ timeout: 15000 });
        await tv.getByTestId("tv-ended").waitFor({ timeout: 20000 });
        assert.equal(await tv.locator(".tv-scene.tv-pair.is-active").count(), 0, "no pairing code on the ended TV");
        assert.match(await tv.locator(".tv-scene.tv-opening").innerText(), /Workshop ended/);
        await phones[0].page.reload(); await phones[0].page.getByText("This workshop has ended. Thank you for taking part.").waitFor({ timeout: 15000 });
      });

      await step(`${skin}: Reopen brings back the steps End closed; the stopped step stays stopped`, async () => {
        await control.getByTestId("reopen-workshop").click(); await control.getByTestId("workshop-ended").waitFor({ state: "detached", timeout: 15000 });
        assert.equal(await state(steps[0]), "open", "End closed it, Reopen opens it");
        assert.equal(await state(steps[1]), "closed", "stopped by hand, it stays stopped");
        assert.equal(await state(steps[2]), "ready", "never shown, it stays Ready");
      });

      await step(`${skin}: the same chip pairs the same TV window again in one click`, async () => {
        const opened: Page[] = []; ctx.on("page", p => opened.push(p));
        const chip = control.getByTestId("tv-chip"); await chip.waitFor({ timeout: 20000 }); await chip.click();
        await tv.locator(".tv-scene.tv-holding.is-active").waitFor({ timeout: 20000 });
        assert.equal(opened.length, 0, "no new window: the cwl-tv window is reused");
        await control.getByTestId("tv-live").waitFor({ timeout: 20000 });
      });

      await step(`${skin}: an unpaired TV explains itself, and a second computer pairs by the code typed in Room admin`, async () => {
        const other = await browser!.newContext({ viewport: { width: 1920, height: 1080 } }), page = await other.newPage();
        await page.goto(`${origin}/tv`);
        await page.getByText("Open this screen from the live room with Open the TV. Using a second computer? Type this code in the live room.").waitFor({ timeout: 20000 });
        const code = await until(async () => { const c = (await page.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "a pairing code", 15000);
        await openAdmin();
        await control.getByTestId("second-computer").click();
        await control.fill("#ctl-tv-code", code); await control.fill("#ctl-tv-label", "Side TV");
        await control.getByRole("button", { name: "Pair this TV" }).click();
        await control.getByText("Paired. The screen joins in a moment.").waitFor({ timeout: 15000 });
        await page.locator(".tv-scene.tv-holding.is-active").waitFor({ timeout: 20000 });
        await other.close();
      });

      for (const p of phones) await p.ctx.close();
      await ctx.close();
    };
    await run("clearway");
    await run("novetera");
    console.log("Steps stay open, the TV from the live room, Start fresh, End and Reopen passed in both skins.");
  } finally {
    await browser?.close(); await sql.end().catch(() => {}); app.stop(); await mail.close();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
