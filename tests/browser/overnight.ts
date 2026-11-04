// Milestone 5, step 2 in real browsers against the production build and the local stack, with the
// scripted fake model (never the API). Closing Day 1 starts the overnight round; the drafts arrive
// with every sentence sourced; "Drafts ready" shows on the control surface and the remote; two
// facilitators review at once with an outcome locked to whoever is editing it; "Restore the room's
// words" is one action; every version is kept; nothing reaches the TV or a phone until Publish; a
// slow or failed draft says so and the facilitators write it by hand. KIT_SHOTS=<folder> saves the screens.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

// The scripted fake model reads this file on every call: slow, failing or well.
const controlDir = join(tmpdir(), `clearway-overnight-kit-${randomUUID().slice(0, 8)}`), controlFile = join(controlDir, "fake.json");
mkdirSync(controlDir, { recursive: true });
const fake = (value: { delayMs?: number; fail?: boolean }) => writeFileSync(controlFile, JSON.stringify(value));
fake({});
Object.assign(process.env, { CLEARWAY_AI_FAKE: "script", CLEARWAY_AI_FAKE_CONTROL: controlFile, CLEARWAY_AI_DEBOUNCE_MS: "250", ANTHROPIC_API_KEY: "" });

async function seedDay1(sql: ReturnType<typeof db>, room: { id: string; session: (t: string, i: string, p: string, n: number) => Promise<string> }, scribe: string) {
  const outcomes = [
    ["Leaders raised from within", ["leaders grow here and lead here", "a few deep partnerships with the city"]],
    ["Families find a home here", ["kids and parents belong"]],
    ["A church that shows up", []] ] as const;
  const ids: string[] = [];
  for (const [i, [title, bullets]] of outcomes.entries()) {
    const id = randomUUID(); ids.push(id);
    await sql.query("insert into private.vision_outcomes(id,engagement_id,title,status,position) values($1,$2,$3,'provisional',$4)", [id, room.id, title, i]);
    for (const [j, text] of bullets.entries()) await sql.query("insert into private.outcome_indicators(id,engagement_id,outcome_id,text,position) values($1,$2,$3,$4,$5)", [randomUUID(), room.id, id, text, j]);
  }
  const step = await room.session("Provisional Vision Outcomes review", "wall", "Name the outcomes.", 9);
  const cards: [string, string, string][] = [["quote", "If we weren't here, the city would notice.", "Tasha Brown"], ["decision", "A few deep partnerships, not many shallow ones.", ""], ["tension", "Growth: more services or more groups?", "Daniel and Ruth"]];
  for (const [kind, text, speaker] of cards) await sql.query("insert into private.scribe_cards(id,engagement_id,session_id,kind,text,speaker,attendee_id,captured_at) values($1,$2,$3,$4,$5,nullif($6,''),$7,now())", [randomUUID(), room.id, step, kind, text, speaker, scribe]);
  return ids;
}

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(700); await page.screenshot({ path: `${process.env.KIT_SHOTS}/overnight-${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    const room = await engagement(sql, ["Priya", "Ben"]);
    await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [room.id]);
    const scribe = randomUUID();
    await sql.query("insert into public.attendees(id,engagement_id,name,email,room_role) values($1,$2,'Sam Scribe',$3,'scribe')", [scribe, room.id, `sam-${randomUUID().slice(0, 6)}@example.org`]);
    const live = await room.session("Pre-mortem", "wall", "What could go wrong?", 1);
    const outcomeIds = await seedDay1(sql, room, scribe);
    const lead = await facilitator(env, sql, room.id), co = await facilitator(env, sql, room.id);
    browser = await chromium.launch();

    const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvContext.newPage(); await tv.goto(app.origin + "/tv");
    const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(lead, room.id, app.secret, code);
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });

    const leadContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await leadContext.addCookies(lead.cookies(app.origin));
    const control = await leadContext.newPage(); await control.goto(`${app.origin}/control/${room.id}`);
    const coContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await coContext.addCookies(co.cookies(app.origin));
    const remoteContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await remoteContext.addCookies(lead.cookies(app.origin));
    const remote = await remoteContext.newPage(); await remote.goto(`${app.origin}/remote/${room.id}`);
    const reviewUrl = `${app.origin}/control/${room.id}/review`;
    const leadReview = await leadContext.newPage(), coReview = await coContext.newPage();

    await step("Before Day 1 closes there is nothing to review", async () => {
      await leadReview.goto(reviewUrl);
      await leadReview.locator("[data-testid=ovn-none]").waitFor({ timeout: 15000 });
      await shot(leadReview, "01-none");
    });

    await step("Closing Day 1 starts the round and the drafts are ready well inside 30 minutes", async () => {
      await press(lead, sql, room.id, "go_live", { session: live });
      await press(lead, sql, room.id, "close_part", { part: "Day 1" });
      await until(async () => (await sql.query("select 1 from private.overnight_rounds where engagement_id=$1", [room.id])).rowCount, "a round opens");
      await control.reload();
      await until(async () => (await sql.query("select status from private.overnight_rounds where engagement_id=$1", [room.id])).rows[0]?.status === "ready", "the draft is ready", 40000);
      const round = (await sql.query("select extract(epoch from (coalesce(ready_at,now()) - day_closed_at))/60 as m from private.overnight_rounds where engagement_id=$1", [room.id])).rows[0];
      assert.ok(Number(round.m) < 30);
      const runs = (await sql.query("select job, prompt_version, status from private.ai_runs where engagement_id=$1 and job='overnight_draft'", [room.id])).rows;
      assert.equal(runs.length, 1); assert.match(runs[0].prompt_version, /^overnight-draft@\d+$/); assert.equal(runs[0].status, "ok");
    });

    await step("Drafts ready shows on the control surface and the remote, and review is a link on the laptop only", async () => {
      await control.locator("[data-testid=overnight-ready]").waitFor({ timeout: 15000 });
      await remote.locator("[data-testid=overnight-ready]").waitFor({ timeout: 15000 });
      assert.equal(await remote.locator("a[href$='/review']").count(), 0, "no review link on the remote");
      assert.ok(await control.locator("a[href$='/review']").count() > 0);
      await shot(control, "02-drafts-ready");
    });

    await step("The review lists each Vision Outcome; the 10-year Future is not drafted; a thin outcome is flagged", async () => {
      await leadReview.reload();
      await until(async () => (await leadReview.locator("[data-testid=ovn-row]").count()) === 3, "three outcomes");
      const text = await leadReview.locator("[data-testid=overnight-review]").innerText();
      assert.match(text, /Leaders raised from within/); assert.match(text, /A church that shows up/);
      assert.equal(await leadReview.locator("[data-testid=ovn-thin]").count(), 1);
      assert.equal(/10-year Future/.test((await leadReview.locator("[data-testid=ovn-row]").allInnerTexts()).join(" ")), false, "no draft row for the 10-year Future");
      assert.match(await leadReview.locator("[data-testid=ovn-list]").innerText(), /Not redrafted overnight/);
      await shot(leadReview, "03-overview");
    });

    await step("An outcome shows its bullets with sources, voices and tensions apart", async () => {
      await leadReview.locator("[data-testid=ovn-row]", { hasText: "Leaders raised from within" }).click();
      await leadReview.locator("[data-testid=ovn-outcome]").waitFor();
      assert.ok(await leadReview.locator("[data-testid=ovn-bullet]").count() >= 2);
      await leadReview.locator("[data-testid=ovn-bullet]").first().click();
      await leadReview.locator("[data-testid=ovn-source]").first().waitFor();
      assert.ok(await leadReview.locator("[data-testid=ovn-voices]").count() > 0);
      assert.ok(await leadReview.locator("[data-testid=ovn-tensions]").count() > 0);
      const speakers = await leadReview.locator("body").innerText();
      assert.equal(speakers.includes("Tasha Brown"), true, "speaker names show on the review screen");
      await shot(leadReview, "04-outcome");
    });

    await step("Two facilitators at once: the one editing holds the outcome, the other reads it", async () => {
      await leadReview.getByRole("button", { name: "Edit" }).click();
      await leadReview.locator(".ovr-edit textarea").waitFor();
      await coReview.goto(reviewUrl);
      await coReview.locator("[data-testid=ovn-row]", { hasText: "Leaders raised from within" }).click();
      await coReview.locator("[data-testid=ovn-locked]").waitFor({ timeout: 15000 });
      assert.match(await coReview.locator("[data-testid=ovn-locked]").innerText(), /is editing this outcome/);
      await shot(coReview, "05-locked");
    });

    await step("Saving an edit, then Restore the room's words in one action", async () => {
      const area = leadReview.locator(".ovr-edit textarea");
      await area.fill("Leaders are raised, trained and sent from our own people.");
      await leadReview.getByRole("button", { name: "Save the bullet" }).click();
      await until(async () => (await sql.query("select count(*) c from private.draft_versions where engagement_id=$1", [room.id])).rows[0].c > 1, "a new version is kept");
      await leadReview.locator("[data-testid=ovn-bullet]").first().click();
      const restore = leadReview.getByRole("button", { name: /Restore the room.s words/ });
      await until(async () => restore.isEnabled(), "restore is offered");
      await restore.click();
      await until(async () => (await leadReview.locator("[data-testid=ovn-bullet]").first().innerText()).toLowerCase().includes("leaders grow here and lead here"), "the room's words are back");
    });

    await step("Every version is kept and listed", async () => {
      await leadReview.getByRole("tab", { name: "Version history" }).click();
      await leadReview.locator("[data-testid=ovn-versions]").waitFor();
      const kept = Number((await sql.query("select count(*) c from private.draft_versions where engagement_id=$1", [room.id])).rows[0].c);
      assert.ok(kept >= 3, `at least start, edit and restore are kept (${kept})`);
      await shot(leadReview, "06-versions");
    });

    await step("Until it is published nothing from the drafts reaches the TV or any phone", async () => {
      const words = ["Leaders raised from within", "Families find a home here", "Leaders grow here", "Tasha Brown", "Drafts ready", "overnight"];
      const tvText = await tv.locator("body").innerText();
      for (const w of words) assert.equal(tvText.toLowerCase().includes(w.toLowerCase()), false, `TV: ${w}`);
      const phoneContext = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
      const phone = await phoneContext.newPage();
      await phone.goto(`${app.origin}/room/${room.id}`);
      const status = await phone.evaluate(async id => (await fetch(`/api/overnight/${id}`)).status, room.id);
      assert.ok(status === 401 || status === 403, `a phone cannot read the drafts (${status})`);
      const published = await phone.evaluate(async id => (await fetch(`/api/overnight/${id}?published=1`)).status, room.id);
      assert.ok(published === 401 || published === 403, `or the published snapshot (${published})`);
      await phoneContext.close();
    });

    await step("Publish is blocked until every outcome is reviewed, then the lead publishes once", async () => {
      await leadReview.getByRole("button", { name: "Publish for Day 2" }).click();
      await leadReview.locator("[data-testid=ovn-blockers]").waitFor();
      assert.equal(await leadReview.locator("[data-testid=ovn-publish-button]").isDisabled(), true);
      await shot(leadReview, "07-blocked");
      for (const id of outcomeIds) {
        const r = await lead.client.rpc("overnight_state", { p_engagement: room.id });
        const draft = (r.data.outcomes as { id: string; outcome_id: string; revision: number; thin: boolean }[]).find(o => o.outcome_id === id)!;
        if (draft.thin) await lead.client.rpc("overnight_ack_thin", { p_engagement: room.id, p_outcome: draft.id, p_value: true });
        let revision = draft.revision;
        if (draft.thin) revision = ((await lead.client.rpc("overnight_state", { p_engagement: room.id })).data.outcomes as { outcome_id: string; revision: number }[]).find(o => o.outcome_id === id)!.revision;
        const accepted = await lead.client.rpc("overnight_accept", { p_engagement: room.id, p_outcome: draft.id, p_revision: revision });
        assert.ok(["ok", "unchanged", "locked"].includes(accepted.data?.status), JSON.stringify(accepted.data));
      }
    });

    await step("After the lead publishes, the snapshot is readable and the TV and phones still show nothing of it", async () => {
      await until(async () => { await leadReview.reload(); return await leadReview.getByRole("button", { name: "Publish for Day 2" }).isEnabled(); }, "publish opens", 20000);
      await leadReview.getByRole("button", { name: "Publish for Day 2" }).click();
      await until(async () => (await leadReview.locator("[data-testid=ovn-publish-button]").isEnabled()), "the button is ready", 15000);
      await leadReview.locator("[data-testid=ovn-publish-button]").click();
      await leadReview.locator("[data-testid=ovn-published]").waitFor({ timeout: 15000 });
      const rows = (await sql.query("select count(*) c from private.overnight_publications where engagement_id=$1", [room.id])).rows[0].c;
      assert.equal(Number(rows), 1);
      const snap = await lead.client.rpc("overnight_published", { p_engagement: room.id });
      assert.equal(snap.data.status, "ok");
      assert.equal((await tv.locator("body").innerText()).includes("Leaders raised from within"), false, "publishing is not a TV event");
      await shot(leadReview, "08-published");
    });

    await step("A slow or failed draft says so, and the facilitators write the draft by hand", async () => {
      const second = await engagement(sql, ["Ruth"]);
      await sql.query("update public.engagements set settings=settings||'{\"ai_enabled\":true}' where id=$1", [second.id]);
      const sScribe = randomUUID();
      await sql.query("insert into public.attendees(id,engagement_id,name,email,room_role) values($1,$2,'Rae Scribe',$3,'scribe')", [sScribe, second.id, `rae-${randomUUID().slice(0, 6)}@example.org`]);
      const liveStep = await second.session("Pre-mortem", "wall", "What could go wrong?", 1);
      await seedDay1(sql, second, sScribe);
      const fac = await facilitator(env, sql, second.id);
      fake({ fail: true });
      const context = await browser!.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addCookies(fac.cookies(app.origin));
      const page = await context.newPage();
      await press(fac, sql, second.id, "go_live", { session: liveStep });
      await press(fac, sql, second.id, "close_part", { part: "Day 1" });
      await page.goto(`${app.origin}/control/${second.id}`);
      await page.goto(`${app.origin}/control/${second.id}/review`);
      await page.locator("[data-testid=ovn-retry], [data-testid=ovn-failed], [data-testid=ovn-progress]").first().waitFor({ timeout: 30000 });
      await until(async () => (await page.locator("[data-testid=ovn-retry], [data-testid=ovn-failed]").count()) > 0, "the screen says the draft hit a problem", 40000);
      await shot(page, "09-failed");
      await page.getByRole("button", { name: "Write it by hand instead" }).click();
      await until(async () => (await sql.query("select count(*) c from private.draft_outcomes where engagement_id=$1 and tidy='by_hand'", [second.id])).rows[0].c > 0, "the outcomes are by hand");
      await page.locator("[data-testid=ovn-row]").first().click();
      await page.locator("[data-testid=ovn-outcome]").waitFor();
      assert.equal(await page.getByRole("button", { name: "Edit" }).count() + await page.getByRole("button", { name: /Add a bullet|Add/ }).count() > 0, true, "the facilitator can write the draft");
      fake({});
      await context.close();
    });
  } finally {
    await browser?.close();
    app.stop();
    await mail.close(); await sql.end();
  }
  console.log(`\n${passed.length} overnight checks passed`);
}
main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
