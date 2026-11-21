// This kit uses throwaway local workshops. It never opens or resets the practice room.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import { testPass11Video } from "./pass11-video";
import { testParticipantLayout } from "./participant-layout";
import { testAutoSend } from "./auto-send";
import { testPass11ScaleBeforeAfter } from "./pass11-scale-before-after";
import { joinPhones } from "../../scripts/load-test";
import { db, engagement, facilitator, localEnv, pairTv, press, startApp, until } from "./harness";

async function main() {
  const enabled = (feature: string) => process.env[`KIT_${feature}`] === "1"
    || (!process.env.KIT_FILTER && process.env[`KIT_${feature}`] !== "0");
  if (enabled("PARTICIPANT")) await testParticipantLayout();
  if (enabled("AUTO_SEND")) await testAutoSend();
  const env = localEnv(), sql = db(env), app = await startApp(env);
  let browser: Browser | undefined;
  const shot = async (page: Page, name: string) => {
    if (process.env.KIT_SHOTS) await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png`, animations: "disabled" });
  };
  try {
    await sql.connect();
    browser = await chromium.launch();
    for (const skin of ["clearway", "novetera"] as const) for (const size of ["very_small", "medium"] as const)
      for (const theme of ["dark", "light"] as const) for (const reduced of [false, true]) {
        const name = `${skin}-${size}-${theme}-${reduced ? "reduced" : "full"}`;
        if (process.env.KIT_FILTER && !name.includes(process.env.KIT_FILTER)) continue;
        const room = await engagement(sql, []), link = `kit${randomUUID().slice(0, 8)}`;
        const origin = skin === "novetera" ? app.noveteraOrigin : app.origin;
        await sql.query("update public.engagements set type='team_workshop', skin=$2, link_name=$3, settings=settings||$4::jsonb where id=$1", [room.id, skin, link, JSON.stringify({ open_join: true, tv_theme: theme, room_size: size, reduced_motion: reduced, ai_enabled: false })]);
        const fac = await facilitator(env, sql, room.id);
        const scale = await room.session("Readiness scale", "scale", "How ready do you feel today?", 1);
        await sql.query("update public.sessions set options=private.session_options('scale',$2::jsonb,$3) where id=$1", [scale, JSON.stringify({ max: 10, low: "Getting started", high: "Ready to go" }), room.id]);
        const wall = await room.session("Reflections", "wall", "What did you learn?", 2);
        const qa = await room.session("Questions", "qa", "What questions do you have?", 3, { maxChars: 200 });
        await sql.query("update public.sessions set options=private.session_options('qa','{\"any_time\":false}'::jsonb,engagement_id) where id=$1", [qa]);
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await context.addCookies(fac.cookies(app.origin));
        await context.addInitScript(() => localStorage.setItem("clearway-live.room-admin", "closed"));
        const control = await context.newPage();
        const remote = await context.newPage(); await remote.setViewportSize({ width: 390, height: 844 });
        const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: reduced ? "reduce" : "no-preference" });
        const tv = await tvContext.newPage();
        const broadcasts: unknown[] = [];
        tv.on("websocket", ws => ws.on("framereceived", ({ payload }) => {
          try {
            const message = JSON.parse(String(payload));
            const event = Array.isArray(message) ? message[3] : message.event;
            const data = Array.isArray(message) ? message[4] : message.payload;
            if (event === "broadcast" && data?.event === "room") broadcasts.push(data.payload);
          }
          catch { /* Ignore transport frames outside the room broadcast protocol. */ }
        }));
        await tv.goto(`${origin}/tv`);
        const pair = await until(async () => { const code = (await tv.locator(".tv-code span").allTextContents()).join(""); return /^\d{6}$/.test(code) && code; }, "pairing code", 20000);
        await pairTv(fac, room.id, app.secret, pair, "Pass 11 TV");
        await tv.locator(".tv-holding.is-active").waitFor({ timeout: 20000 });
        const [answering] = await joinPhones(origin, 1, { room: room.id, prefix: "Answering phone" });
        const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const phone = await phoneContext.newPage();
        await phone.goto(`${origin}/${link}`);
        await phone.locator("#open-name").fill("Watching phone");
        await phone.getByRole("button", { name: "Join the room" }).click();
        await phone.locator(".ph-app").waitFor();
        await remote.goto(`${app.origin}/remote/${room.id}`);
        await control.goto(`${app.origin}/control/${room.id}`);
        await press(fac, sql, room.id, "go_live", { session: scale });
        await tv.locator(".tv-scale").waitFor({ state: "attached" });
        assert.equal(await answering.sendValue(room.id, scale, { value: 9 }), "accepted");
        await until(async () => (await tv.locator(".tv-layer:not(.is-leaving) .tv-scale").textContent())?.includes("9.0"), "scale average", 7000);
        const visibility = control.locator("#ctl-step-panel").getByRole("group", { name: "Who sees answers" });
        const privateButton = visibility.getByRole("button", { name: "Facilitators only" });
        await privateButton.click();
        await Promise.all([tv.locator(".tv-private-count").waitFor({ timeout: 1000 }), phone.locator("[data-private-line]").waitFor({ timeout: 1000 })]);
        assert.equal(await tv.locator(".tv-scale-marker").count(), 0);
        await control.locator("[data-private-results]").getByText("9.0", { exact: true }).waitFor();
        await remote.locator("[data-private-results]").getByText("9.0", { exact: true }).waitFor();
        const privateBroadcasts = await until(() => {
          const matched = broadcasts.filter(value => JSON.stringify(value).includes('"visibility":"private"'));
          return matched.length > 0 && matched;
        }, "private room broadcast", 1000);
        for (const payload of privateBroadcasts) {
          const { state, answer } = payload as { state: { results: Record<string, unknown> }; answer?: { text: unknown; value: unknown; answers: unknown[] } | null };
          assert.deepEqual(Object.keys(state.results).sort(), ["people", "total", "words"]);
          assert.deepEqual(state.results.words, []);
          if (answer) {
            assert.equal(answer.text, null);
            assert.equal(answer.value, null);
            assert.deepEqual(answer.answers, []);
          }
        }
        await shot(tv, `${name}-private-tv`); await shot(control, `${name}-private-results`);
        await control.getByRole("button", { name: "Undo", exact: true }).click();
        await tv.locator(".tv-scale-marker").waitFor({ state: "attached", timeout: 1000 });
        await phone.locator("[data-private-line]").waitFor({ state: "detached", timeout: 1000 });

        const frame = tv.locator(".tv-join-frame[aria-hidden=false]");
        await control.locator("#ctl-transport").getByRole("button", { name: "Frame", exact: true }).click();
        await frame.waitFor({ timeout: 1000 });
        assert.match(await frame.innerText(), new RegExp(link));
        await control.keyboard.press("f"); await frame.waitFor({ state: "detached", timeout: 1000 });
        await remote.getByRole("button", { name: "Frame", exact: true }).click(); await frame.waitFor({ timeout: 1000 });
        await press(fac, sql, room.id, "next");
        await tv.getByText("What did you learn?", { exact: true }).waitFor();
        await frame.waitFor();
        await press(fac, sql, room.id, "back"); await frame.waitFor();
        await press(fac, sql, room.id, "tv_screen", { screen: "join" }); await frame.waitFor({ state: "detached" });
        await press(fac, sql, room.id, "go_live", { session: wall }); await frame.waitFor();
        await press(fac, sql, room.id, "tv_screen", { screen: "blackout" }); await frame.waitFor({ state: "detached" });
        await press(fac, sql, room.id, "go_live", { session: wall }); await frame.waitFor();
        const box = await tv.locator(".tv-layer:not(.is-leaving) .tv-board").boundingBox();
        assert.ok(box && box.y + box.height <= 833, "the board ends above the frame");
        await shot(tv, `${name}-frame-tv`); await shot(remote, `${name}-frame-remote`);
        await control.locator(".ctl-run-step", { hasText: "Questions" }).hover();
        await control.getByRole("button", { name: "Preview Questions" }).click();
        await frame.waitFor();
        await control.locator("#ctl-transport").getByRole("button", { name: "Go live: Questions" }).click();
        await tv.locator(".tv-layer:not(.is-leaving) .tv-qa").waitFor();
        for (const question of ["How will we get started?", "What should happen next?", "How will we gather feedback?", "What can we share with the team?"]) {
          assert.equal((await answering.send(room.id, qa, question)).status, "accepted");
        }
        await until(async () => await tv.locator(".tv-layer:not(.is-leaving) .qa-row").count() === 4, "four framed questions");
        const rows = await tv.locator(".tv-layer:not(.is-leaving) .qa-row").evaluateAll(elements => elements.map(el => el.getBoundingClientRect().bottom));
        assert.ok(rows.every(bottom => bottom <= 864), "Q&A rows stay above the join frame");
        await shot(tv, `${name}-frame-qa`);
        if (enabled("SCALE") || enabled("BEFORE_AFTER")) {
          await testPass11ScaleBeforeAfter({ sql, room, fac, origin, tv, name, shot, beforeAfter: enabled("BEFORE_AFTER") });
        }
        if (enabled("AUTO_SEND")) {
          const choice = await room.session("Choose offline", "choice", "What should we do first?", 4);
          await sql.query("update public.sessions set options=private.session_options('choice',$2::jsonb,engagement_id) where id=$1", [choice,
            JSON.stringify({ multiple: true, items: [{ key: "a", text: "Start with a question" }, { key: "b", text: "Make a plan" }] })]);
          await press(fac, sql, room.id, "go_live", { session: choice });
          const first = phone.getByRole("checkbox", { name: "Start with a question" }), second = phone.getByRole("checkbox", { name: "Make a plan" });
          await first.waitFor();
          const posts: unknown[] = [];
          phone.on("request", request => { if (request.method() === "POST" && request.url().endsWith(`/api/live/${room.id}`)) posts.push(request.postDataJSON()); });
          await phoneContext.setOffline(true);
          await first.click();
          await phone.getByText(/Saved on this phone/).waitFor();
          await second.click(); await first.click();
          await new Promise(resolve => setTimeout(resolve, 650));
          assert.equal(posts.length, 0);
          await phoneContext.setOffline(false);
          await phone.getByText("Sent. Tap another to change it.").waitFor();
          assert.equal(posts.length, 1);
          assert.deepEqual((posts[0] as { value: unknown }).value, { choices: ["b"] });
          await shot(phone, `${name}-offline-selection-sent`);
        }
        if (enabled("VIDEO")) await testPass11Video({ sql, room, fac, control, tv, phone, name, shot, appOrigin: app.origin });
        await phoneContext.close(); await tvContext.close(); await context.close();
        console.log(`ok · ${name} · visibility, private results, join frame${enabled("SCALE") ? ", scale" : ""}${enabled("BEFORE_AFTER") ? ", before and after" : ""}${enabled("AUTO_SEND") ? ", offline auto-send" : ""}${enabled("VIDEO") ? ", video" : ""}`);
      }
  } finally { await browser?.close(); await sql.end(); app.stop(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
