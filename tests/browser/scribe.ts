// Milestone 5, step 1 in real browsers against the production build and the local stack (with
// Storage): the scribe console on a laptop and the easel camera on a phone. Tagged capture of all
// six kinds, the scribe feed on the control surface, easel photos and files in the private bucket,
// wifi off then on with every card sent once and in order (FAIL-03), a replay that is a duplicate,
// the team-led block turning the console off, and no speaker or card words on the TV or a
// participant's phone. KIT_SHOTS=<folder> saves the screens.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, pairTv, press, startApp, until } from "./harness";

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => { const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4); const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0); return Buffer.concat([head, data, tail]); };
// A plain 640 by 480 picture of an easel page: white paper with a few dark lines.
function easelPng() {
  const w = 640, h = 480, rows: Buffer[] = [];
  for (let y = 0; y < h; y++) { const row = Buffer.alloc(1 + w * 3, 255); row[0] = 0; if (y % 60 === 30) for (let x = 40; x < w - 40; x++) { row[1 + x * 3] = 40; row[2 + x * 3] = 60; row[3 + x * 3] = 90; } rows.push(row); }
  const header = Buffer.alloc(13); header.writeUInt32BE(w, 0); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}
const pdf = Buffer.from("%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shots = process.env.KIT_SHOTS;
  const shot = async (page: Page, name: string) => { if (shots) { await delay(700); await page.screenshot({ path: `${shots}/scribe-${name}.png` }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    const storage = (await sql.query("select private.scribe_storage_setup() as s")).rows[0].s;
    assert.equal(storage, "ready", "Storage is running, so the scribe bucket and its policies can be made");
    const room = await engagement(sql, ["Priya", "Ben"]);
    const scribe = { id: randomUUID(), name: "Sam Scribe", email: `sam-${randomUUID().slice(0, 6)}@example.org` };
    const second = { id: randomUUID(), name: "Rae Scribe", email: `rae-${randomUUID().slice(0, 6)}@example.org` };
    for (const person of [scribe, second]) await sql.query("insert into public.attendees(id,engagement_id,name,email,room_role) values($1,$2,$3,$4,'scribe')", [person.id, room.id, person.name, person.email]);
    const quotes = await room.session("Five Lenses: Congregation", "wall", "Write the 10-year Future for Congregation in the present tense.", 1);
    const team = await room.session("Team-led: commander’s intent", "wall", "Your team writes the commander’s intent.", 2);
    const later = await room.session("Close the day", "wall", "What did you hear today?", 3);
    const fac = await facilitator(env, sql, room.id);
    const facCookie = fac.cookies(app.origin).map(c => `${c.name}=${c.value}`).join("; ");
    browser = await chromium.launch();

    const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvContext.newPage(); await tv.goto(app.origin + "/tv");
    const code = await until(async () => { const c = (await tv.locator(".tv-code span").allTextContents()).join("").trim(); return /^\d{6}$/.test(c) && c; }, "pairing code", 15000);
    await pairTv(fac, room.id, app.secret, code);
    await tv.locator(".tv-church-logo").waitFor({ timeout: 15000 });

    const facContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await facContext.addCookies(fac.cookies(app.origin));
    const control = await facContext.newPage();
    await control.goto(`${app.origin}/control/${room.id}`);

    async function signIn(page: Page, email: string, ready: string) {
      const before = mail.count;
      await page.fill("#room-email", email); await page.getByRole("button", { name: "Send me a sign-in code" }).click();
      await page.fill("#room-code", await mail.code(email, before)); await page.getByRole("button", { name: "Sign in" }).click();
      await page.locator(ready).waitFor({ timeout: 15000 });
    }
    const laptopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const laptop = await laptopContext.newPage();
    await laptop.goto(`${app.origin}/room/${room.id}`);
    await signIn(laptop, scribe.email, "[data-testid=scribe-console]");
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const priya = await phoneContext.newPage();
    await priya.goto(`${app.origin}/room/${room.id}`);
    await signIn(priya, room.attendees[0].email, ".ph-app");
    const scribePhoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const scribePhone = await scribePhoneContext.newPage();
    await scribePhone.goto(`${app.origin}/room/${room.id}`);
    await signIn(scribePhone, second.email, "[data-testid=scribe-phone]");

    const count = async () => Number((await sql.query("select count(*) from private.scribe_cards where engagement_id=$1 and not deleted", [room.id])).rows[0].count);
    const cardsOnLaptop = () => laptop.locator("[data-testid=scribe-cards] .scr-card");
    const capture = async (page: Page, kind: string, text: string, extra: Record<string, string> = {}) => {
      await page.locator(".scr-tag", { hasText: kind }).click();
      await page.fill("#scr-text", text);
      for (const [id, value] of Object.entries(extra)) await page.fill(`#${id}`, value);
      await page.locator("#scr-text").press("Enter");
    };
    const pngBuffer = easelPng();

    await step("With nothing live the console says so and cannot capture", async () => {
      await laptop.locator("[data-testid=scribe-nothing]").waitFor();
      assert.equal(await laptop.locator("#scr-text").isDisabled(), true);
      await shot(laptop, "01-nothing-live");
    });

    await step("The console follows the run of show and the card attaches to the live step", async () => {
      await press(fac, sql, room.id, "go_live", { session: quotes });
      await laptop.locator(".scr-head b", { hasText: "Five Lenses: Congregation" }).waitFor({ timeout: 8000 });
      assert.match(await laptop.locator(".scr-attach").innerText(), /Attaches to Five Lenses: Congregation/);
      assert.equal(await laptop.locator("#scr-text").isEnabled(), true);
    });

    await step("Tagged capture: all six kinds, with the details each kind carries", async () => {
      await capture(laptop, "Quote", "We are a church that feeds people first.", { "scr-who": "Pat Alder" });
      await capture(laptop, "Decision", "We will meet monthly.", { "scr-why": "Weekly was too much" });
      await capture(laptop, "Tension", "Stay the size we are or grow.", { "scr-view1": "Stay small and close", "scr-view2": "Reach new families" });
      await capture(laptop, "Action", "Call the bank about the loan.", { "scr-owner": "Dana", "scr-date": "Friday" });
      await capture(laptop, "Question", "Who owns the food bank?");
      await capture(laptop, "Mitigation", "Train two backup volunteers.", { "scr-risk": "Volunteer burnout" });
      await until(async () => (await cardsOnLaptop().count()) === 6, "six cards on the console");
      await until(async () => (await count()) === 6, "six cards in the database");
      const kinds = (await sql.query("select kind from private.scribe_cards where engagement_id=$1 order by seq", [room.id])).rows.map(r => r.kind);
      assert.deepEqual(kinds, ["quote", "decision", "tension", "action", "question", "mitigation"]);
      const text = await laptop.locator("[data-testid=scribe-cards]").innerText();
      assert.match(text, /Why: Weekly was too much/); assert.match(text, /Dana/); assert.match(text, /Not on a risk yet: Volunteer burnout/, "no pre-mortem risk has those words, so the card says it is not on one");
      assert.match(text, /Stay small and close/); assert.match(text, /Reach new families/);
      await shot(laptop, "02-six-kinds");
    });

    await step("Keys 1 to 6 pick the kind, Enter captures, Esc clears", async () => {
      await laptop.locator("body").click({ position: { x: 5, y: 5 } });
      await laptop.keyboard.press("5");
      assert.equal(await laptop.locator(".scr-tag[aria-pressed=true]").innerText().then(t => /Question/.test(t)), true);
      await laptop.fill("#scr-text", "Typed then cleared"); await laptop.locator("#scr-text").press("Escape");
      assert.equal(await laptop.inputValue("#scr-text"), "");
    });

    await step("The speaker is kept for the record and shown nowhere", async () => {
      const speaker = (await sql.query("select speaker from private.scribe_cards where engagement_id=$1 and kind='quote'", [room.id])).rows[0].speaker;
      assert.equal(speaker, "Pat Alder");
      assert.equal((await laptop.locator("body").innerText()).includes("Pat Alder"), false, "not on the scribe's own console");
      assert.match(await cardsOnLaptop().filter({ hasText: "feeds people first" }).innerText(), /Speaker kept for the record/);
      const feedState = await control.evaluate(async id => (await fetch(`/api/scribe/${id}?surface=control`)).text(), room.id);
      assert.equal(feedState.includes("Pat Alder"), false, "not in what the control surface reads");
      const scribeState = await laptop.evaluate(async id => (await fetch(`/api/scribe/${id}`)).text(), room.id);
      assert.equal(scribeState.includes("Pat Alder"), false, "not in what the scribe reads");
    });

    await step("The scribe feed on the control surface shows the cards as they land", async () => {
      await control.locator("[data-testid=scribe-feed] .scr-card").first().waitFor({ timeout: 8000 });
      await until(async () => (await control.locator("[data-testid=scribe-feed] .scr-card").count()) >= 6 || (await control.locator("[data-testid=scribe-feed] .scr-feed-more").count()) > 0, "the feed fills");
      const before = await control.locator("[data-testid=scribe-feed] .scr-card").first().innerText();
      await capture(laptop, "Quote", "A new line for the feed.");
      await until(async () => (await control.locator("[data-testid=scribe-feed] .scr-card").first().innerText()) !== before, "the newest card is first in the feed", 8000);
      assert.match(await control.locator("[data-testid=scribe-feed] .scr-card").first().innerText(), /A new line for the feed/);
      assert.equal((await control.locator("[data-testid=scribe-feed]").innerText()).includes("Pat Alder"), false);
      await shot(control, "03-feed-on-control");
    });

    await step("Nothing reaches the TV or a participant's phone, and a participant cannot read the scribe's cards", async () => {
      const words = ["feeds people first", "meet monthly", "Pat Alder", "Volunteer burnout"];
      const tvText = await tv.locator("body").innerText(), phoneText = await priya.locator("body").innerText();
      for (const w of words) { assert.equal(tvText.includes(w), false, `TV: ${w}`); assert.equal(phoneText.includes(w), false, `phone: ${w}`); }
      const status = await priya.evaluate(async id => (await fetch(`/api/scribe/${id}`)).status, room.id);
      assert.equal(status, 403, "a participant is refused");
      const post = await priya.evaluate(async id => (await fetch(`/api/scribe/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "capture", id: crypto.randomUUID(), session: id, kind: "quote", text: "x", detail: {}, speaker: "", capturedAt: new Date().toISOString() }) })).status, room.id);
      assert.ok(post === 403 || post === 422, `a participant cannot capture (${post})`);
    });

    await step("Wifi off: cards are saved on the laptop, then wifi back sends each once and in order", async () => {
      const before = await count();
      await laptopContext.setOffline(true);
      await laptop.locator("[data-testid=scribe-queue]").waitFor({ timeout: 8000 });
      const texts = ["Offline one", "Offline two", "Offline three"];
      for (const t of texts) await capture(laptop, "Quote", t);
      await until(async () => (await laptop.locator("[data-testid=scribe-queue] .n").innerText()) === "3", "three waiting");
      assert.equal(await laptop.locator("[data-testid=scribe-cards] .scr-card.is-queued").count(), 3);
      assert.match(await laptop.locator("[data-testid=scribe-cards]").innerText(), /Saved on this laptop/);
      await delay(1500);
      assert.equal(await count(), before, "nothing reached the server while offline");
      await shot(laptop, "04-offline-queue");
      await laptopContext.setOffline(false);
      await until(async () => (await count()) === before + 3, "three cards arrive", 20000);
      const rows = (await sql.query("select text from private.scribe_cards where engagement_id=$1 order by seq desc limit 3", [room.id])).rows.map(r => r.text).reverse();
      assert.deepEqual(rows, texts, "in the order they were made");
      await until(async () => (await laptop.locator("[data-testid=scribe-cards] .scr-card.is-queued").count()) === 0, "none left waiting");
      const dup = (await sql.query("select count(*) - count(distinct id) as d from private.scribe_cards where engagement_id=$1", [room.id])).rows[0].d;
      assert.equal(Number(dup), 0);
      const queued = (await sql.query("select count(*) from private.scribe_cards where engagement_id=$1 and queued_at is not null", [room.id])).rows[0].count;
      assert.equal(Number(queued), 3, "the three that waited know they waited");
    });

    await step("A replay of a card the server already holds is a duplicate", async () => {
      const before = await count();
      const body = { action: "capture", id: randomUUID(), session: quotes, kind: "quote", text: "Sent twice", detail: {}, speaker: "", capturedAt: new Date().toISOString() };
      const statuses = await laptop.evaluate(async ({ id, body }) => {
        const out: string[] = [];
        for (let i = 0; i < 2; i++) out.push((await (await fetch(`/api/scribe/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json()).status);
        return out;
      }, { id: room.id, body });
      assert.deepEqual(statuses, ["accepted", "duplicate"]);
      await until(async () => (await count()) === before + 1, "one card, not two");
    });

    await step("An easel photo from the file picker is fitted, uploaded to the private bucket and shown", async () => {
      await laptop.locator("input[aria-label='Choose files to upload']").setInputFiles({ name: "easel-1.png", mimeType: "image/png", buffer: pngBuffer });
      const img = laptop.locator("[data-testid=scribe-files] img").first();
      await img.waitFor({ timeout: 15000 });
      await until(async () => await img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0), "the photo loads");
      const row = (await sql.query("select kind,content_type,uploaded_at,storage_path from private.scribe_files where engagement_id=$1", [room.id])).rows[0];
      assert.equal(row.kind, "photo"); assert.equal(row.content_type, "image/jpeg"); assert.ok(row.uploaded_at);
      const object = (await sql.query("select count(*) from storage.objects where bucket_id='scribe' and name=$1", [row.storage_path])).rows[0].count;
      assert.equal(Number(object), 1, "the bytes are in the scribe bucket");
      const bucket = (await sql.query("select public from storage.buckets where id='scribe'")).rows[0].public;
      assert.equal(bucket, false, "and the bucket is private");
      const open = await fetch(`${env.API_URL}/storage/v1/object/public/scribe/${row.storage_path}`);
      assert.notEqual(open.status, 200, "the bytes are not public");
      const anon = await fetch(`${app.origin}/api/scribe/${room.id}/files/${randomUUID()}`);
      assert.ok([403, 404].includes(anon.status), "and the file route refuses a stranger");
    });

    await step("A PDF uploads and downloads for the scribe, and the control surface sees the photo", async () => {
      await laptop.locator("input[aria-label='Choose files to upload']").setInputFiles({ name: "agenda.pdf", mimeType: "application/pdf", buffer: pdf });
      await laptop.locator("[data-testid=scribe-files] a", { hasText: "agenda.pdf" }).waitFor({ timeout: 15000 });
      await laptop.locator("input[aria-label='Choose files to upload']").setInputFiles({ name: "notes.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
      await laptop.getByText(/can’t be uploaded/).waitFor();
      await control.locator("[data-testid=scribe-feed] img").first().waitFor({ timeout: 15000 });
      await until(async () => await control.locator("[data-testid=scribe-feed] img").first().evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0), "the photo loads on the control surface");
      await shot(laptop, "05-photo-and-file");
      await shot(control, "06-feed-with-photo");
    });

    await step("The scribe's phone takes an easel photo, offline too, and it sends when the connection is back", async () => {
      await scribePhone.locator("[data-testid=scribe-phone]").waitFor();
      await shot(scribePhone, "07-easel-phone");
      const before = Number((await sql.query("select count(*) from private.scribe_files where engagement_id=$1 and uploaded_at is not null", [room.id])).rows[0].count);
      await scribePhoneContext.setOffline(true);
      await scribePhone.locator("input[capture=environment]").setInputFiles({ name: "camera.png", mimeType: "image/png", buffer: pngBuffer });
      await scribePhone.locator("[data-testid=scribe-phone-files] .scr-card.is-queued").waitFor({ timeout: 8000 });
      assert.match(await scribePhone.locator("[data-testid=scribe-phone-files]").innerText(), /Saved on this phone/);
      await shot(scribePhone, "08-easel-offline");
      await scribePhoneContext.setOffline(false);
      await until(async () => Number((await sql.query("select count(*) from private.scribe_files where engagement_id=$1 and uploaded_at is not null", [room.id])).rows[0].count) === before + 1, "the photo uploads", 20000);
      await until(async () => (await scribePhone.locator("[data-testid=scribe-phone-files] .scr-card.is-queued").count()) === 0, "nothing waiting on the phone");
    });

    await step("A card can be edited and re-filed to another session", async () => {
      const card = cardsOnLaptop().filter({ hasText: "food bank" }).first();
      await card.getByRole("button", { name: "Edit this card" }).click();
      await card.locator("textarea").fill("Who owns the food bank, Community or Operations?");
      await card.getByRole("button", { name: "Save the edit" }).click();
      await until(async () => (await sql.query("select revision,text from private.scribe_cards where text like 'Who owns the food bank, %'", [])).rows.length === 1, "the edit is saved");
      await card.getByRole("button", { name: "Re-file to another session" }).click();
      await card.locator("select").selectOption({ label: "Close the day" });
      await card.getByRole("button", { name: "Re-file", exact: true }).click();
      await until(async () => (await sql.query("select 1 from private.scribe_cards where text like 'Who owns the food bank, %' and session_id=$1 and refiled_from is not null", [later])).rows.length === 1, "the card is on the other session");
    });

    await step("An edit on an old copy is refused and says so, and Dismiss shows the server's wording", async () => {
      const card = cardsOnLaptop().filter({ hasText: "We will meet monthly." }).first();
      await card.getByRole("button", { name: "Edit this card" }).click();
      // Another scribe saves the same card while this form is still open. The console's poll then reads the new revision.
      await sql.query("update private.scribe_cards set text='Rae kept it weekly', revision=revision+1 where engagement_id=$1 and text='We will meet monthly.'", [room.id]);
      await delay(3500);
      await card.locator("textarea").fill("Thomas wants monthly");
      await card.getByRole("button", { name: "Save the edit" }).click();
      await card.getByText("This card changed somewhere else, so this edit didn’t go in.").waitFor({ timeout: 8000 });
      assert.equal((await sql.query("select text from private.scribe_cards where engagement_id=$1 and text like 'Rae kept%'", [room.id])).rows.length, 1, "the other scribe's words are still the stored ones");
      await card.getByRole("button", { name: "Dismiss" }).click();
      await until(async () => (await cardsOnLaptop().filter({ hasText: "Rae kept it weekly" }).count()) === 1, "after Dismiss the card shows the server's words");
      assert.equal(await cardsOnLaptop().filter({ hasText: "Thomas wants monthly" }).count(), 0);
    });

    await step("The team-led block turns the console off, and it comes back after", async () => {
      const toggle = async (session: string, value: boolean) => {
        const response = await fetch(`${app.origin}/api/run-of-show/${room.id}/team-led`, { method: "POST", headers: { Cookie: facCookie, Origin: app.origin, "Content-Type": "application/json" }, body: JSON.stringify({ session, value }) });
        assert.equal(response.status, 200, await response.text());
      };
      await toggle(team, true);
      await press(fac, sql, room.id, "go_live", { session: team });
      await laptop.locator("[data-testid=scribe-off]").waitFor({ timeout: 8000 });
      assert.match(await laptop.locator("[data-testid=scribe-off]").innerText(), /The team has the room/);
      assert.equal(await laptop.locator("#scr-text").isDisabled(), true);
      const before = await count();
      const status = await laptop.evaluate(async ({ id, session }) => (await (await fetch(`/api/scribe/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "capture", id: crypto.randomUUID(), session, kind: "quote", text: "Not now", detail: {}, speaker: "", capturedAt: new Date().toISOString() }) })).json()).status, { id: room.id, session: team });
      assert.equal(status, "team_led");
      assert.equal(await count(), before, "nothing was captured");
      await scribePhone.getByText(/The team has the room/).waitFor({ timeout: 8000 });
      assert.equal(await scribePhone.getByRole("button", { name: "Take an easel photo" }).isDisabled(), true);
      await shot(laptop, "09-team-led-off");
      await shot(scribePhone, "10-team-led-off-phone");
      await press(fac, sql, room.id, "go_live", { session: later });
      await laptop.locator("[data-testid=scribe-off]").waitFor({ state: "detached", timeout: 8000 });
      assert.equal(await laptop.locator("#scr-text").isEnabled(), true);
      await toggle(team, false);
    });

    await step("Only a facilitator can set the team-led flag", async () => {
      const response = await fetch(`${app.origin}/api/run-of-show/${room.id}/team-led`, { method: "POST", headers: { Origin: app.origin, "Content-Type": "application/json" }, body: JSON.stringify({ session: team, value: true }) });
      assert.ok([401, 403].includes(response.status));
      const direct = await priya.evaluate(async ({ id, session }) => (await fetch(`/api/run-of-show/${id}/team-led`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session, value: true }) })).status, { id: room.id, session: team });
      assert.ok([401, 403].includes(direct));
    });

    console.log(`\n${passed.length} scribe console checks passed.`);
  } finally {
    await browser?.close(); app.stop(); await mail.close(); await sql.end();
  }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
