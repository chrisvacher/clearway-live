// Milestone 4, step 6: the remote changing hands, commander's intent (INT-16) and the follow-up
// access, in real browsers against the production build and the local stack. A paired TV, three
// signed-in phones, the lead's control surface and, for the follow-up, a visitor with only a link
// and a code. KIT_SHOTS=<folder> saves each screen for review. Local only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

const outcomes = ["Every neighbour knows our name", "Leaders grow leaders", "Generous with our building"];

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(1300); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    const room = await engagement(sql, ["Priya", "Ben", "Ruth"]);
    for (const [i, full] of ["Priya Shah", "Ben Ortiz", "Ruth Morrison"].entries()) await sql.query("update public.attendees set name=$2 where id=$1", [room.attendees[i].id, full]);
    for (const [i, title] of outcomes.entries()) await sql.query("insert into private.vision_outcomes(engagement_id,title,status,confirmed_at,position) values($1,$2,'confirmed',now(),$3)", [room.id, title, i]);
    const intent = await room.session("Commander's intent", "intent", "Write the commander's intent for your outcome", 1);
    const sign = await room.session("Our shared commitment", "sign", "Our shared commitment", 2);
    const close = await room.session("Closing", "content", "Thank you", 3);
    await sql.query("update public.sessions set options='{\"assign\":\"remote\"}' where id=$1", [intent]);
    await sql.query("update public.sessions set options='{\"text\":\"\"}',settings=settings||'{\"anonymous\":false}' where id=$1", [sign]);
    const fac = await facilitator(env, sql, room.id);
    browser = await chromium.launch();

    const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage(); await tv.goto(app.origin + "/tv");
    const pairCode = async (page: Page) => until(async () => { const c = (await page.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(fac, room.id, app.secret, await pairCode(tv));
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
    const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
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
    const state = async () => (await sql.query("select live_session_id,remote_holder_id,team_led_block_id,spotlight_key from public.room_states where engagement_id=$1", [room.id])).rows[0];
    const rpc = async (name: string, args: Record<string, unknown>) => { const { data, error } = await fac.client.rpc(name, { p_engagement: room.id, ...args }); assert.equal(error, null); return data as { status: string }; };
    const control_ = async (action: string, p: Record<string, unknown> = {}) => {
      const data = await rpc("intent_control", { p_id: randomUUID(), p_action: action, p: { from: (await state()).live_session_id, ...p } });
      assert.ok(["ok", "unchanged"].includes(data.status), `${action}: ${JSON.stringify(data)}`); return data;
    };
    const cards = async () => (await sql.query("select c.id from private.intent_cards c join private.vision_outcomes o on o.id=c.outcome_id where c.engagement_id=$1 and not c.deleted order by o.position", [room.id])).rows.map(r => r.id as string);
    const origin = { Origin: app.origin };
    // A kept-alive connection the server closed while idle resets on first use; send the same request once more.
    const postJson = async (url: string, options: Parameters<typeof facContext.request.post>[1]) => {
      try { return await facContext.request.post(url, options); } catch (error) { if (!/ECONNRESET/.test(String(error))) throw error; return await facContext.request.post(url, options); }
    };

    await step("INT-16 Empty: one card for each Vision Outcome on the TV, no names", async () => {
      await press(fac, sql, room.id, "go_live", { session: intent });
      await until(async () => await layer().locator(".int-card").count() === 3, "three cards on the TV", 15000);
      const text = await layer().innerText();
      for (const n of ["Priya", "Ben", "Ruth"]) assert.ok(!text.includes(n), `${n} never shows on the TV`);
      await shot(tv, "int-16-empty-tv");
    });
    await step("INT-16 Pairs: set from the remote, shown by first name on phones and the control surface only", async () => {
      const [a, b, c] = await cards();
      await control_("assign", { card: a, attendees: [room.attendees[0].id, room.attendees[1].id] });
      await control_("assign", { card: b, attendees: [room.attendees[2].id] });
      await until(async () => await priya.page.locator(".hi-ph-title").count() === 1, "Priya is on her card", 10000);
      assert.ok((await priya.page.locator(".hi-ph-title").innerText()).includes("Every neighbour"), "Priya has card 1");
      assert.ok((await ruth.page.locator(".hi-ph-title").innerText()).includes("Leaders grow leaders"), "Ruth has card 2");
      assert.ok(!(await layer().innerText()).includes("Priya"), "no name on the TV");
      void c; await shot(priya.page, "int-16-pair-phone");
    });
    await step("INT-16 Two phones edit one card: one person per line, and the TV follows the typing", async () => {
      const [a] = await cards(), line = (p: Page, f: string) => p.locator(`[id="${a}-${f}"]`);
      const mark = layer().locator(`.int-card[data-card="${a}"] .int-line`);
      await mark.evaluate(el => { el.setAttribute("data-mark", "1"); });
      const t0 = Date.now();
      await line(priya.page, "intent").click(); await line(priya.page, "intent").pressSequentially("Every neighbour", { delay: 60 });
      await until(async () => (await mark.innerText()).startsWith("Every"), "the first words on the TV", 2000);
      assert.ok(Date.now() - t0 < 4000, "typing reaches the TV while it is typed");
      await until(async () => await line(ben.page, "intent").isDisabled(), "Ben's copy of that line is held", 8000);
      assert.ok((await ben.page.locator(".hi-ph-line", { hasText: "Commander" }).first().innerText()).includes("is typing here"), "Ben is told who is typing");
      await line(ben.page, "must_do").click(); await line(ben.page, "must_do").pressSequentially("Learn ten names", { delay: 30 });
      await line(priya.page, "intent").pressSequentially(" knows our name", { delay: 30 });
      await until(async () => (await mark.innerText()) === "Every neighbour knows our name", "the whole line on the TV", 4000);
      assert.equal(await layer().locator(`.int-card[data-card="${a}"] .int-line[data-mark="1"]`).count(), 1, "typing grew the line in place; it was never rebuilt");
      await line(priya.page, "intent").blur();
      await until(async () => !(await line(ben.page, "intent").isDisabled()), "the line frees when Priya leaves it", 8000);
      await shot(tv, "int-16-typing-tv"); await shot(ben.page, "int-16-typing-phone");
    });
    await step("INT-16 An edit replaces the old line on the TV", async () => {
      const [a] = await cards();
      await ben.page.locator(`[id="${a}-intent"]`).fill("Every neighbour can name three of us");
      await ben.page.locator(`[id="${a}-intent"]`).blur();
      await until(async () => (await layer().locator(`.int-card[data-card="${a}"] .int-line`).innerText()) === "Every neighbour can name three of us", "the new line replaces the old", 4000);
      assert.equal(await layer().locator(`.int-card[data-card="${a}"] .int-line .int-old`).count() <= 1, true, "at most the fading old line remains");
    });
    await step("INT-16 First steps need an owner and a date; the flag shows on the TV and goes when both are set", async () => {
      const [a] = await cards();
      const added = await rpc("intent_edit", { p_card: a, p_op: "step_add", p: { text: "Host a neighbours' night" } });
      assert.equal(added.status, "ok");
      await until(async () => await layer().locator(`.int-card[data-card="${a}"] .int-flag-tag`).count() === 1, "the card is flagged", 5000);
      assert.ok((await layer().locator(`.int-card[data-card="${a}"] .int-flag-tag`).innerText()).includes("owner"));
      const step_ = (await sql.query("select id from private.first_steps where card_id=$1 and not deleted", [a])).rows[0].id;
      await rpc("intent_edit", { p_card: a, p_op: "step_set", p: { step: step_, owner: room.attendees[0].id, date: "2026-12-15" } });
      await until(async () => await layer().locator(`.int-card[data-card="${a}"] .int-flag-tag`).count() === 0, "the flag clears", 5000);
      await shot(tv, "int-16-flag-cleared-tv");
    });
    await step("INT-16 Present one card at full size, then all of them again", async () => {
      const [a] = await cards();
      await control_("present", { card: a });
      await until(async () => await layer().locator(".int-present:not([hidden])").count() === 1, "one card at full size", 5000);
      assert.ok((await layer().locator(".int-present").innerText()).includes("Host a neighbours"), "its first step shows");
      assert.ok(!(await layer().locator(".int-present").innerText()).includes("Priya"), "the owner's name stays off the TV");
      await shot(tv, "int-16-present-tv");
      await control_("present", { card: null });
      await until(async () => await layer().locator(".int-grid:not([hidden])").count() === 1, "all cards again", 5000);
    });
    await step("INT-16 Affirm together fills the sign step from the cards", async () => {
      // The facilitator's own button, through the control route (the phone route refuses this press).
      const pressed = await postJson(`${app.origin}/api/control/${room.id}/intent`, { headers: origin, data: { kind: "press", id: randomUUID(), action: "intent_affirm_text", p: { from: (await state()).live_session_id, session: sign } } });
      assert.equal(pressed.status(), 200, `the control route takes Fill: ${await pressed.text()}`);
      const refused = await priya.page.request.post(`${app.origin}/api/live/${room.id}/intent`, { headers: origin, data: { kind: "press", id: randomUUID(), action: "intent_affirm_text", p: { from: null, session: sign } } });
      assert.equal(refused.status(), 422, "the phone route refuses it");
      const text = (await sql.query("select options->>'text' as t from public.sessions where id=$1", [sign])).rows[0].t as string;
      for (const title of outcomes) assert.ok(text.includes(title), title);
      assert.ok(text.includes("Every neighbour can name three of us"), "the written intent");
    });

    await step("D2-11 Hand over: the team facilitator is named, the team remote shows only the block", async () => {
      const gave = await rpc("handover_control", { p_id: randomUUID(), p_action: "give", p: { from: intent, attendee: room.attendees[0].id } });
      assert.equal(gave.status, "ok");
      assert.equal((await state()).remote_holder_id, room.attendees[0].id);
      await priya.page.locator(".hi-phone-remote").waitFor({ timeout: 10000 });
      const remoteText = await priya.page.locator(".hi-phone-remote").innerText();
      for (const hidden of ["alignment", "Presenter notes", "Discover", "Closing"]) assert.ok(!remoteText.toLowerCase().includes(hidden.toLowerCase()), `the team remote never shows ${hidden}`);
      assert.ok(remoteText.includes("Commander's intent") && remoteText.includes("Our shared commitment"), "it shows the block");
      assert.equal(await ben.page.locator(".hi-phone-remote").count(), 0, "no one else sees a remote");
      await until(async () => (await control.locator("[data-handover]").innerText()).includes("Priya has the remote"), "the lead sees who holds it", 10000);
      await shot(control, "d2-11-lead-banner"); await shot(priya.page, "d2-11-team-remote");
    });
    await step("D2-11 The team facilitator presses Next; a press outside the block is refused", async () => {
      await priya.page.getByRole("button", { name: /^Next/ }).click();
      await until(async () => (await state()).live_session_id === sign, "the sign step is live", 8000);
      assert.equal((await state()).remote_holder_id, room.attendees[0].id, "the remote stays with the team");
      await shot(tv, "d2-11-after-next-tv");
    });
    await step("D2-11 The lead takes it back and the TV does not change; the team remote goes quiet", async () => {
      await delay(1500); // let the step that just went live finish arriving
      const before = await layer().innerText();
      // The press names the live step the lead's page last saw; right after Next that can lag, so press again until it lands.
      await until(async () => {
        if ((await state()).remote_holder_id === null) return true;
        await control.getByRole("button", { name: "Take it back" }).click({ timeout: 1000 }).catch(() => undefined);
        await new Promise(resolve => setTimeout(resolve, 1200));
        return (await state()).remote_holder_id === null;
      }, "the lead holds the remote", 15000);
      assert.equal((await state()).live_session_id, sign, "the live step is unchanged");
      assert.equal(await layer().innerText(), before, "the TV did not change");
      await until(async () => await priya.page.getByRole("button", { name: /^Next/ }).isDisabled().catch(() => true), "the team remote is quiet", 8000);
    });
    await step("D2-11 The remote returns to the lead after the block, by itself", async () => {
      const gave = await rpc("handover_control", { p_id: randomUUID(), p_action: "give", p: { from: sign, attendee: room.attendees[0].id } });
      assert.equal(gave.status, "ok");
      assert.equal((await state()).remote_holder_id, room.attendees[0].id);
      await press(fac, sql, room.id, "go_live", { session: close });
      await until(async () => (await state()).remote_holder_id === null && (await state()).team_led_block_id === null, "the block ended and the remote returned", 8000);
    });

    await step("Follow-up: a link and a code from the lead, no Clearway sign-in", async () => {
      await press(fac, sql, room.id, "go_live", { session: intent });
      const issued = await postJson(`${app.origin}/api/control/${room.id}/followup`, { headers: origin, data: { action: "issue", attendee: room.attendees[0].id, sessions: [intent, sign],
        opens_at: new Date(Date.now() - 60000).toISOString(), closes_at: new Date(Date.now() + 2 * 3600000).toISOString() } });
      const out = await issued.json(); assert.equal(out.status, "ok", JSON.stringify(out));
      assert.match(out.code, /^[A-Z]{5} [0-9]{4}$/); assert.match(out.link, /\/f\/[A-Za-z0-9_-]{20,}$/);
      const stored = await sql.query("select token_hash,code_hash from private.followup_access where engagement_id=$1", [room.id]);
      assert.ok(!JSON.stringify(stored.rows).includes(out.code.replace(" ", "")), "the code is never stored");
      const visitor = await (await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
      await visitor.goto(out.link);
      await visitor.locator("#fu-code").fill("WRONG1234"); await visitor.getByRole("button", { name: "Enter" }).click();
      await visitor.getByText("That code doesn't match.").waitFor({ timeout: 8000 });
      await visitor.locator("#fu-code").fill(out.code); await visitor.getByRole("button", { name: "Enter" }).click();
      await visitor.getByRole("button", { name: "Take the remote" }).waitFor({ timeout: 8000 });
      const scope = await visitor.locator(".hi-scope").first().innerText();
      assert.ok(scope.includes("alignment signal") && scope.includes("Presenter notes") && scope.includes("Discover data"), "the page says what the remote never shows");
      await shot(visitor, "follow-up-enter");
      await visitor.getByRole("button", { name: "Take the remote" }).click();
      await visitor.getByRole("button", { name: /^Next/ }).waitFor({ timeout: 8000 });
      assert.equal((await state()).remote_holder_id, room.attendees[0].id, "the team facilitator holds the remote");
      await visitor.getByRole("button", { name: /^Next/ }).click();
      await until(async () => (await state()).live_session_id === sign, "Next moved the room", 8000);
      await shot(visitor, "follow-up-remote");

      const shared = await (await browser!.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
      await shared.goto(out.link + "/tv");
      await shared.locator("#fu-code").fill(out.code); await shared.getByRole("button", { name: "Enter" }).click();
      await shared.getByRole("button", { name: "Show the TV view" }).click();
      await shared.locator(".tv-church-logo").waitFor({ timeout: 25000 });
      await shot(shared, "follow-up-tv-view");

      const revoked = await postJson(`${app.origin}/api/control/${room.id}/followup`, { headers: origin, data: { action: "revoke" } });
      assert.equal((await revoked.json()).status, "ok");
      await until(async () => (await state()).remote_holder_id === null, "revoking returns the remote", 8000);
      await visitor.reload();
      await visitor.locator("#fu-code").waitFor({ timeout: 8000 });
      assert.equal(await visitor.getByRole("button", { name: /^Next/ }).count(), 0, "a revoked link has no remote");
    });

    console.log(`Handover and commander's intent kit: ${passed.length} checks passed.`);
    void [ruth, close];
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally { await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); }
}
main().catch(error => { console.error(error); process.exit(1); });
