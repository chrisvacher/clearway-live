// Milestone 6, step 5: the alignment signal (FAC-02) and the facilitator's own signal list (FAC-03), in real browsers against the production
// build and the local stack, with the scripted fake model (never the API). A paired TV, three signed-in phones, the facilitator's control
// surface and the facilitator's own remote run one Wayfinding wall step with four accepted Discover themes. Eight answers make the signal
// due: cards arrive on the control surface and the remote with the soft rise, and nothing at all on the TV or a phone. Then the evidence,
// Save as a citation (aligned only), Dismiss (it fades, the list closes up, and it stays dismissed), Ask the room (the TV cross-fades to a
// neutral question with no theme, count or kind, and back), the remote with the laptop closed (a new card, Put the question up, Back to the
// session), and a silent card only once phones first go down. KIT_SHOTS=<folder> saves screens.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

const controlDir = join(tmpdir(), `clearway-signal-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
writeFileSync(controlFile, "{}");
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "250", ANTHROPIC_API_KEY: "" });

const themes = [
  ["Welcoming culture", "People feel welcome on a first visit.", 60], ["Prayer and care", "Care in hard seasons.", 50],
  ["Volunteers are stretched", "The same few people carry the work.", 45], ["Giving is generous", "People give gladly.", 40], ["Young families", "Families with small children.", 5],
] as const;
const first = ["we are a welcoming church", "newcomers are greeted at the door", "a welcome team meets every visitor", "we should add a third service on Sunday",
  "another service would help more families", "meals when someone is sick", "families need more room on Sundays", "prayer is how we start every meeting"];
const second = ["volunteers are stretched thin every week", "the volunteers carry too much", "volunteers need a break", "we need more volunteers on Sundays",
  "volunteers are tired by December", "ask the volunteers how they are", "volunteers set up before dawn", "volunteers deserve our thanks"];

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shots = process.env.KIT_SHOTS;
  const shot = async (page: Page, name: string) => { if (shots) { await delay(900); await page.screenshot({ path: `${shots}/${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { const t0 = Date.now(); await run(); passed.push(`${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    browser = await chromium.launch();
    const room = await engagement(sql, ["Priya", "Ben", "Ruth"]);
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [room.id]);
    for (const [label, detail, rests] of themes) await sql.query("insert into private.discover_themes(engagement_id,source,label,detail,rests_on,out_of,status) values($1,'survey',$2,$3,$4,100,'accepted')", [room.id, label, detail, rests]);
    const wall = (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,options,max_sends,max_characters,max_words,planned_minutes)
      values($1,'Five Lenses: Community','Day 1',1,'wall','What does our community say about us?','ready','{}',30,280,50,20) returning id`, [room.id])).rows[0].id as string;
    const fac = await facilitator(env, sql, room.id);
    const cards = async (extra = "") => (await sql.query(`select kind,title,dismissed_at,saved_as_citation_at,on_tv,ask_sent,theme_id from private.signals where session_id=$1 and not deleted ${extra} order by seq`, [wall])).rows as
      { kind: string; title: string; dismissed_at: string | null; saved_as_citation_at: string | null; on_tv: boolean; ask_sent: string | null }[];

    // The TV, never asked about the signal: every request it makes is watched.
    const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvContext.newPage();
    const tvRequests: string[] = []; tv.on("request", r => tvRequests.push(r.url()));
    await tv.goto(app.origin + "/tv");
    const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(fac, room.id, app.secret, code);
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });
    const layer = () => tv.locator(".tv-layer:not(.is-leaving)").last();
    // What the room can read: the TV's header, scenes and foot (the screen check's own sample copy is not part of the live step).
    const tvWords = async () => (await tv.locator(".tv-top, .tv-scenes, .tv-foot").allInnerTexts()).join(" ").toLowerCase();

    const phoneRequests: string[] = [];
    async function phone(person: { email: string }) {
      const ctx = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage(); page.on("request", r => phoneRequests.push(r.url())); await page.goto(`${app.origin}/room/${room.id}`);
      const before = mail.count;
      await page.fill("#room-email", person.email); await page.getByRole("button", { name: "Send me a sign-in code" }).click();
      await page.fill("#room-code", await mail.code(person.email, before)); await page.getByRole("button", { name: "Sign in" }).click();
      await page.locator(".ph-app").waitFor({ timeout: 15000 });
      return { page, ctx };
    }
    const phones = [await phone(room.attendees[0]), await phone(room.attendees[1]), await phone(room.attendees[2])];
    const send = async (p: Page, text: string) => {
      await p.locator("#ph-answer").waitFor({ timeout: 10000 });
      await p.fill("#ph-answer", text); await p.locator(".ph-send").click();
      await until(async () => (await p.locator(".ph-answers").innerText().catch(() => "")).includes(text), `sent: ${text}`, 8000);
    };

    const facContext: BrowserContext = await browser.newContext({ viewport: { width: 1440, height: 1500 } });
    await facContext.addCookies(fac.cookies(app.origin));
    const control = await facContext.newPage();
    await control.goto(`${app.origin}/control/${room.id}`);
    const remoteContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await remoteContext.addCookies(fac.cookies(app.origin));
    const remote = await remoteContext.newPage(); await remote.goto(`${app.origin}/remote/${room.id}`);
    const panelCards = () => control.locator("[data-signal-panel] [data-signal-id]");
    const listCards = () => remote.locator("[data-signal-list] [data-signal-id]");
    const kindsOn = async (page: Page, root: string) => (await page.locator(`${root} [data-signal-id]:not(.is-leaving)`).evaluateAll(els => els.map(e => e.getAttribute("data-signal")))).sort();

    await step("Before any answer the panel is quiet, and says which themes wait for phones to go down", async () => {
      await press(fac, sql, room.id, "go_live", { session: wall });
      await layer().locator(".tv-board, .ai-wall, .tv-feed").first().waitFor({ timeout: 10000 }).catch(() => {});
      const panel = control.locator("[data-signal-panel]");
      await panel.waitFor({ timeout: 15000 });
      assert.match(await panel.innerText(), /Nothing stands out yet/);
      assert.match(await panel.innerText(), /4 silent themes wait until phones first go down in this step/, "the strong themes are held back, not raised");
      assert.match(await panel.getAttribute("aria-label") ?? "", /only you see this/);
      await remote.locator("[data-signal-list]").waitFor({ timeout: 15000 });
      assert.match(await remote.locator("[data-signal-list]").innerText(), /Nothing stands out yet/);
    });

    await step("Eight answers: each is on the TV at once, and the cards arrive on the control surface and the remote with the soft rise", async () => {
      const who = [phones[0].page, phones[1].page, phones[2].page];
      for (let i = 0; i < first.length; i++) {
        const start = Date.now();
        await send(who[i % 3], first[i]);
        await until(async () => (await layer().innerText()).includes(first[i]), `answer ${i + 1} on the TV`, 5000);
        assert.ok(Date.now() - start < 3000, `answer ${i + 1} reached the TV in ${Date.now() - start} ms`);
      }
      await until(async () => (await panelCards().count()) === 4, "four cards on the control surface", 30000);
      await until(async () => (await listCards().count()) === 4, "and four on the remote", 15000);
      assert.deepEqual(await kindsOn(control, "[data-signal-panel]"), ["aligned", "aligned", "divergent", "thin"]);
      assert.deepEqual(await kindsOn(remote, "[data-signal-list]"), ["aligned", "aligned", "divergent", "thin"]);
      const motion = await panelCards().first().evaluate(el => { const s = getComputedStyle(el); return { cls: el.className, name: s.animationName, duration: s.animationDuration, ease: s.animationTimingFunction }; });
      assert.match(motion.cls, /is-arriving/);
      assert.deepEqual([motion.name, motion.duration, motion.ease], ["cwl-sg-in", "0.9s", "cubic-bezier(0.45, 0, 0.25, 1)"], "a soft fade and rise: cwl-dur-signal-in on cwl-ease-calm");
      const run = (await sql.query("select job,model,status,changed,prompt_version from private.ai_runs where session_id=$1 and job='alignment_signal' order by created_at limit 1", [wall])).rows[0];
      assert.deepEqual([run.job, run.status, run.changed, run.prompt_version], ["alignment_signal", "ok", false, "alignment-signal@1"]);
      assert.equal(run.model, "fake-script");
      assert.match(await control.locator("[data-signal-panel]").innerText(), /1 silent theme waits until phones first go down/, "one strong theme no card has taken is still held");
      await shot(control, "fac-02-cards-control"); await shot(remote, "fac-03-list-remote");
    });

    await step("Nothing on the TV, a phone or the scribe console; the signal API answers only a facilitator", async () => {
      assert.equal(await tv.locator("[data-signal-id], [data-signal-panel], [data-signal-list], .cwl-signal, [class*=\"cwl-sg\"]").count(), 0, "no card on the TV");
      const tvText = await tvWords();
      for (const word of ["aligned", "divergent", "thin data", "welcoming culture", "silent", "alignment"]) assert.ok(!tvText.includes(word), `the TV never says "${word}": ...${tvText.slice(Math.max(0, tvText.indexOf(word) - 80), tvText.indexOf(word) + 80)}...`);
      for (const { page } of phones) {
        assert.equal(await page.locator("[data-signal-id], [data-signal-panel], [data-signal-list], [class*=\"cwl-sg\"]").count(), 0, "no card on a phone");
        const text = (await page.locator("body").innerText()).toLowerCase();
        for (const word of ["aligned", "divergent", "thin data", "alignment signal"]) assert.ok(!text.includes(word), `a phone never says "${word}"`);
      }
      assert.ok(![...tvRequests, ...phoneRequests].some(url => /\/signal(\b|\/|\?)/.test(new URL(url).pathname)), "neither the TV nor a phone ever asks for the signal");
      const url = `${app.origin}/api/control/${room.id}/signal`;
      assert.equal((await fetch(url)).status, 401, "an unsigned caller is refused");
      assert.equal((await phones[0].ctx.request.get(url)).status(), 401, "a participant's session is refused");
      assert.equal((await facContext.request.get(url)).status(), 200, "the lead is let in");
      const scribe = (await sql.query("select count(*)::integer as n from private.scribe_cards where engagement_id=$1", [room.id])).rows[0].n;
      assert.equal(scribe, 0, "nothing was written to the scribe's cards");
    });

    await step("Evidence: the theme with its strength and sources, and the room's own words", async () => {
      await panelCards().filter({ hasText: "Aligned" }).first().click();
      const detail = control.locator("[data-signal-detail=\"aligned\"]");
      await detail.waitFor({ timeout: 5000 });
      const text = await detail.innerText();
      assert.match(text, /Theme from Discover/i);
      assert.match(text, /Strong · \d+ of 100 survey respondents · Survey/, "its strength and its source");
      assert.match(text, /What the room said/i);
      assert.match(text, /\d+ answers?/);
      for (const name of ["Priya", "Ben", "Ruth"]) assert.ok(!text.includes(name), `no ${name} in the evidence`);
      await shot(control, "fac-02-detail");
      await detail.getByRole("button", { name: "See all signals" }).click();
      await panelCards().first().waitFor({ timeout: 5000 });
    });

    await step("Save as a citation: only on an aligned card, and it stays saved", async () => {
      await panelCards().filter({ hasText: "Divergent" }).first().click();
      const divergent = control.locator("[data-signal-detail=\"divergent\"]");
      await divergent.waitFor({ timeout: 5000 });
      assert.equal(await divergent.getByRole("button", { name: /Save as a citation/ }).count(), 0, "a divergent card cannot be saved");
      await divergent.getByRole("button", { name: "See all signals" }).click();
      await panelCards().filter({ hasText: "Aligned" }).first().click();
      const aligned = control.locator("[data-signal-detail=\"aligned\"]");
      await aligned.getByRole("button", { name: "Save as a citation" }).click();
      await until(async () => (await cards()).some(c => c.saved_as_citation_at), "the citation is saved", 5000);
      await until(async () => (await aligned.getByRole("button", { name: "Saved as a citation" }).isDisabled().catch(() => false)), "the button says so", 8000);
      assert.equal((await cards()).filter(c => c.saved_as_citation_at).every(c => c.kind === "aligned"), true);
      await aligned.getByRole("button", { name: "See all signals" }).click();
      assert.match(await panelCards().filter({ hasText: "Saved as a citation" }).first().innerText(), /Saved as a citation/, "and the card in the list says it");
    });

    await step("Dismiss: the card fades, the list closes up after it, and it stays dismissed", async () => {
      await panelCards().filter({ hasText: "Thin data" }).first().click();
      const detail = control.locator("[data-signal-detail=\"thin\"]");
      const id = (await sql.query("select id from private.signals where session_id=$1 and kind='thin' and not deleted", [wall])).rows[0].id as string;
      // Sampled from the press on: the card must be seen leaving (the is-leaving class, or an opacity below 1), not only gone.
      let sawFade = false;
      const sampler = (async () => { for (let i = 0; i < 120 && !sawFade; i++) { sawFade = await control.locator(`[data-signal-id="${id}"]`).first().evaluate(el => el.classList.contains("is-leaving") || Number(getComputedStyle(el).opacity) < 1).catch(() => false); await delay(15); } })();
      await detail.getByRole("button", { name: "Dismiss" }).click();
      await sampler;
      assert.ok(sawFade, "the card faded before the list closed up");
      await until(async () => (await control.locator(`[data-signal-id="${id}"]`).count()) === 0 && (await panelCards().count()) === 3, "the list has closed up", 3000);
      assert.equal((await cards()).find(c => c.kind === "thin")?.dismissed_at != null, true, "dismissed in the database");
      await until(async () => (await listCards().count()) === 3, "and gone from the remote too", 8000);
    });

    await step("Ask the room: the TV cross-fades to a neutral question with no theme, count or kind, and phones keep the live step", async () => {
      await panelCards().filter({ hasText: "Divergent" }).first().click();
      const detail = control.locator("[data-signal-detail=\"divergent\"]");
      const box = detail.getByRole("textbox"); await box.waitFor({ timeout: 5000 });
      assert.match(await box.inputValue(), /\?$/, "the suggested wording is a question");
      await box.fill("Why do 60% of us say welcoming culture?");
      await detail.getByRole("button", { name: "Put the question up" }).click();
      await until(async () => /neutral/i.test(await control.locator("[data-signal-panel] [role=alert]").innerText().catch(() => "")), "a question that names the theme or a figure is refused", 5000);
      assert.equal((await sql.query("select neutral_question from public.room_states where engagement_id=$1", [room.id])).rows[0].neutral_question, null, "nothing went to the TV");
      const asked = "What would we gain or lose by going that way?";
      await box.fill(asked);
      // The question layer's opacity is sampled as it comes in: a cross-fade, not a cut.
      const samples: number[] = [];
      const sampler = (async () => { for (let i = 0; i < 40; i++) { samples.push(await tv.locator(".tv-ask").evaluate(el => Number(getComputedStyle(el).opacity))); await delay(30); } })();
      await detail.getByRole("button", { name: "Put the question up" }).click();
      await until(async () => (await tv.locator(".tv-ask.is-on .tv-headline-xl").innerText().catch(() => "")) === asked, "the question on the TV", 5000);
      await sampler;
      assert.ok(samples.some(v => v > 0.05 && v < 0.95), `the layer cross-fades in (${samples.join(",")})`);
      assert.equal(Math.max(...samples) > 0.95, true, "and reaches full");
      const ask = await tv.locator(".tv-ask").evaluate(el => { const s = getComputedStyle(el); return [s.transitionProperty, s.transitionDuration, s.transitionTimingFunction]; });
      assert.deepEqual(ask, ["opacity", "0.7s", "cubic-bezier(0.25, 0.1, 0.25, 1)"], "on the session-change fade: cwl-dur-make-room, cwl-ease-signature");
      await until(async () => Number(await tv.locator(".tv-layers .tv-layer").last().evaluate(el => getComputedStyle(el).opacity)) < 0.01, "the live step fades beneath it", 3000);
      assert.equal(await tv.locator(".tv-top .tv-ask-hide.is-hidden").count(), 1, "the count is hidden while it is up");
      await until(async () => await tv.locator(".tv-top .tv-ask-hide").evaluate(el => getComputedStyle(el).visibility) === "hidden", "and gone from sight", 3000);
      const tvText = await tvWords();
      for (const word of ["welcoming culture", "aligned", "divergent", "thin data", "silent", "survey"]) assert.ok(!tvText.includes(word), `the TV question carries no "${word}"`);
      const payload = (await sql.query("select private.live_public_state($1) as p", [room.id])).rows[0].p as { state: Record<string, unknown> };
      assert.equal(payload.state.neutral_question, asked, "the payload holds the question");
      const flat = JSON.stringify(payload).toLowerCase();
      for (const word of ["welcoming culture", "aligned", "divergent", "evidence", "signal", "thin data"]) assert.ok(!flat.includes(word), `the TV payload never holds "${word}"`);
      assert.deepEqual(Object.keys(payload.state).filter(k => /signal|theme|kind|evidence|count/.test(k)), [], "and no key for one");
      for (const { page } of phones) {
        assert.equal(await page.locator("#ph-answer").isVisible(), true, "phones keep the live step");
        assert.ok(!(await page.locator("body").innerText()).includes(asked), "and never show the question");
      }
      assert.match(await control.locator("[data-signal-ask]").innerText(), /Question on the TV: What would we gain or lose/, "the control surface says what is up");
      await until(async () => (await remote.locator("[data-signal-ask]").count()) === 1, "and so does the remote", 8000);
      assert.equal((await cards()).filter(c => c.on_tv).length, 1);
      await shot(tv, "fac-02-neutral-question-tv"); await shot(control, "fac-02-neutral-question-control");
    });

    await step("Back to the session: the question fades, the step and its count return", async () => {
      // The words stay while the layer fades (no blank frame mid-fade), then go: the layer is left empty, not holding the question at opacity 0.
      const fade: { opacity: number; text: string }[] = [];
      const fadeSampler = (async () => { for (let i = 0; i < 70; i++) { fade.push(await tv.locator(".tv-ask").evaluate(el => ({ opacity: Number(getComputedStyle(el).opacity), text: (el.querySelector(".tv-headline-xl")?.textContent ?? "") }))); await delay(30); } })();
      await control.locator("[data-signal-ask]").getByRole("button", { name: "Back to the session" }).click();
      await until(async () => Number(await tv.locator(".tv-ask").evaluate(el => getComputedStyle(el).opacity)) < 0.01, "the question fades out", 5000);
      await fadeSampler;
      assert.ok(fade.some(f => f.opacity > 0.05 && f.opacity < 0.95), `the layer cross-fades out (${fade.map(f => f.opacity).join(",")})`);
      assert.ok(fade.filter(f => f.opacity > 0.05).every(f => f.text.length > 0), "the question's words stay for as long as the layer can be seen");
      await until(async () => (await tv.locator(".tv-ask .tv-headline-xl").evaluate(el => el.textContent ?? "x")) === "", "the question's text is removed from the page once it has faded", 4000);
      assert.equal((await tv.locator(".tv-ask .tv-eyebrow").evaluate(el => el.textContent ?? "x")), "", "and so is the step title on the layer");
      assert.equal(await tv.locator(".tv-ask").getAttribute("aria-hidden"), "true", "the empty layer stays aria-hidden");
      assert.ok(!(await tv.locator("body").innerHTML()).includes("What would we gain or lose by going that way?"), "nothing of the question is left in the TV's markup");
      await until(async () => Number(await tv.locator(".tv-layers .tv-layer").last().evaluate(el => getComputedStyle(el).opacity)) > 0.99, "the step is back", 5000);
      await until(async () => await tv.locator(".tv-top .tv-ask-hide").evaluate(el => getComputedStyle(el).visibility) === "visible", "with its count", 5000);
      assert.equal((await sql.query("select neutral_question from public.room_states where engagement_id=$1", [room.id])).rows[0].neutral_question, null);
      assert.equal((await cards()).filter(c => c.on_tv).length, 0);
      await until(async () => (await control.locator("[data-signal-ask]").count()) === 0, "the control surface drops its strip", 8000);
    });

    await step("With the laptop closed: a new card reaches the remote, which puts a question up, takes it down and dismisses", async () => {
      await control.close();
      for (let i = 0; i < second.length; i++) await send(phones[i % 3].page, second[i]);
      await until(async () => (await listCards().count()) === 4, "a new card on the remote", 30000);
      const kinds = await kindsOn(remote, "[data-signal-list]");
      assert.equal(kinds.filter(k => k === "aligned").length, 3, "an aligned card for the volunteers joined the list");
      const item = remote.locator("[data-signal-list] [data-signal=\"divergent\"]");
      await item.getByRole("button").first().click();
      const rbox = item.getByRole("textbox"); await rbox.waitFor({ timeout: 5000 });
      assert.match(await rbox.inputValue(), /\?$/, "the remote shows the question it will send");
      const edited = "What do you notice about how we serve on Sundays?";
      await rbox.fill(edited);
      await item.getByRole("button", { name: "Put the question up" }).click();
      await until(async () => (await tv.locator(".tv-ask.is-on .tv-headline-xl").innerText().catch(() => "")) === edited, "the edited question on the TV", 8000);
      await until(async () => (await remote.locator("[data-signal-ask]").count()) === 1, "the remote shows it", 8000);
      await remote.locator("[data-signal-ask]").getByRole("button", { name: "Back to the session" }).click();
      await until(async () => Number(await tv.locator(".tv-ask").evaluate(el => getComputedStyle(el).opacity)) < 0.01, "back to the step", 8000);
      await until(async () => (await tv.locator(".tv-ask .tv-headline-xl").evaluate(el => el.textContent ?? "x")) === "", "the remote's question leaves the page once faded", 4000);
      const aligned = remote.locator("[data-signal-list] [data-signal=\"aligned\"]").first();
      await aligned.getByRole("button").first().click();
      await aligned.getByRole("button", { name: "Dismiss" }).click();
      await until(async () => (await listCards().count()) === 3, "dismissed from the remote", 8000);
      assert.equal((await cards()).filter(c => c.dismissed_at).length, 2, "two cards dismissed in all");
      await shot(remote, "fac-03-remote-laptop-closed");
    });

    await step("Silent cards wait for phones: none before they go down, one after, and it stays private", async () => {
      assert.equal((await cards()).filter(c => c.kind === "silent").length, 0, "no silent card while phones are up");
      await press(fac, sql, room.id, "phones_down");
      await until(async () => (await cards()).some(c => c.kind === "silent"), "a silent card once phones first go down", 30000);
      await until(async () => (await kindsOn(remote, "[data-signal-list]")).includes("silent"), "on the remote", 10000);
      assert.equal(await tv.locator("[data-signal-id]").count(), 0, "never on the TV");
      const silent = (await cards()).find(c => c.kind === "silent")!;
      assert.match(silent.title, /Giving is generous/, "on the one strong theme the room has not touched");
      const run = (await sql.query("select count(*)::integer as n, count(*) filter (where status='ok')::integer as ok from private.ai_runs where session_id=$1 and job='alignment_signal'", [wall])).rows[0];
      assert.ok(run.n >= 3 && run.n === run.ok, `every signal run is logged and ok (${JSON.stringify(run)})`);
      const slow = (await sql.query("select last_ms, last_failed_at from private.ai_sessions where session_id=$1", [wall])).rows[0];
      assert.equal(slow.last_failed_at, null, "the signal never reads as AI failing");
    });

    console.log(`\nAlignment signal kit passed:\n${passed.map(p => ` - ${p}`).join("\n")}`);
  } finally {
    await browser?.close();
    app.stop(); await mail.close(); await sql.end().catch(() => {});
    rmSync(controlDir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exit(1); });
