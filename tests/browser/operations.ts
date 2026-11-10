import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium, type Browser } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, startApp, until } from "./harness";
async function main() {
  const env = localEnv(), sql = db(env);
  process.env.CRON_SECRET = "operations-local-only";
  process.env.OPERATIONS_ALERT_EMAIL = "operations@clearway.test";
  const mail = await mailbox();
  let fileId: string | undefined;
  let app: Awaited<ReturnType<typeof startApp>> | undefined, browser: Browser | undefined;
  try {
    await sql.connect();
    const room = await engagement(sql, ["Operations"]), fac = await facilitator(env, sql, room.id);
    const user = await fac.client.auth.getUser(); assert.ok(user.data.user);
    await sql.query("update public.clearway_users set is_admin=true where auth_user_id=$1", [user.data.user.id]);
    const session = await room.session("Files", "wall", "Notes", 0);
    const id = randomUUID(), path = room.id + "/" + session + "/" + id + ".txt";
    fileId = id;
    const bytes = Buffer.from("version one\n" + "a".repeat(1048576)), digest = createHash("sha256").update(bytes).digest("hex");
    const { createClient } = await import("@supabase/supabase-js");
    const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    assert.equal((await service.storage.from("scribe").upload(path, bytes, { contentType: "text/plain" })).error, null);
    await sql.query("insert into private.scribe_files(id,engagement_id,session_id,kind,name,content_type,bytes,storage_path,attendee_id,captured_at,uploaded_at) values($1,$2,$3,'file','notes.txt','text/plain',$4,$5,$6,now(),now())", [id, room.id, session, bytes.length, path, room.attendees[0].id]);
    app = await startApp(env, mail.url); browser = await chromium.launch({ headless: true });
    const anonymous = await browser.newContext();
    assert.equal((await anonymous.request.get(app.origin + "/api/operations")).status(), 403);
    assert.equal((await anonymous.request.get(app.origin + "/api/cron/operations")).status(), 401);
    assert.equal((await anonymous.request.post(app.origin + "/api/operations/errors", { headers: { Origin: "https://evil.invalid" }, data: { kind: "error", route: "/" } })).status(), 403);
    const admin = await browser.newContext(); await admin.addCookies(fac.cookies(app.origin));
    const page = await admin.newPage(); await page.goto(app.origin + "/setup/operations");
    await page.getByRole("button", { name: "Back up files", exact: true }).click();
    await page.getByText("The file backup check finished.", { exact: true }).waitFor();
    const protectedRow = (await sql.query("select id,sha256 from private.file_backups where file_id=$1 and completed_at is not null", [id])).rows[0];
    assert.equal(protectedRow.sha256, digest);
    await service.storage.from("scribe").remove([path]);
    const download = await admin.request.get(app.origin + "/api/operations/backups/" + protectedRow.id);
    assert.equal(download.status(), 200); assert.equal(download.headers()["x-content-sha256"], digest);
    assert.deepEqual(await download.body(), bytes);
    assert.equal((await anonymous.request.get(app.origin + "/api/operations/backups/" + protectedRow.id)).status(), 403);
    await page.getByRole("button", { name: "Verify file recovery", exact: true }).click();
    await page.getByText("The test file was recovered and its checksum matched.", { exact: true }).waitFor();
    await page.evaluate(() => window.dispatchEvent(new ErrorEvent("error", { error: new TypeError("Jane private@example.org SECRET-ANSWER") })));
    await until(async () => (await sql.query("select count(*)::int as n from private.client_errors where event->>'name'='TypeError'")).rows[0].n > 0, "Global browser error received", 15000);
    const events = (await sql.query("select event::text from private.client_errors")).rows;
    assert.doesNotMatch(JSON.stringify(events), /SECRET-ANSWER|private@example.org|Jane/);
    const text = await mail.find("operations@clearway.test", /operational issues/);
    assert.doesNotMatch(text, /SECRET-ANSWER|private@example.org|Jane/);
    const count = mail.count;
    await page.evaluate(() => window.dispatchEvent(new ErrorEvent("error", { error: new RangeError("another private answer") })));
    await until(async () => (await sql.query("select count(*)::int as n from private.client_errors where event->>'name'='RangeError'")).rows[0].n > 0, "Second error received");
    await page.getByRole("button", { name: "Refresh status", exact: true }).click();
    assert.equal(mail.count, count, "One alert per hour");
    const other = await facilitator(env, sql, room.id), context = await browser.newContext();
    await context.addCookies(other.cookies(app.origin));
    assert.equal((await context.request.get(app.origin + "/api/operations")).status(), 403);
    assert.equal((await context.request.get(app.origin + "/api/operations/backups/" + protectedRow.id)).status(), 403);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 }); await page.reload();
      await page.getByText("File protection", { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "No horizontal overflow");
      if (process.env.KIT_SHOTS) { await mkdir(process.env.KIT_SHOTS, { recursive: true }); await page.screenshot({ path: process.env.KIT_SHOTS + "/operations-" + width + ".png", fullPage: true }); }
    }
    const run = await anonymous.request.get(app.origin + "/api/cron/operations", { headers: { Authorization: "Bearer operations-local-only" } });
    assert.equal(run.status(), 503); assert.ok((await run.json()).failed > 0, "Lost source is detected");
    console.log("Operations: multi-chunk recovery, source-loss detection, global error capture, privacy, bounded alerts, admin isolation and responsive UI passed.");
  } finally {
    await browser?.close(); await app?.stop(); await mail.close();
    if (fileId) await sql.query("update private.scribe_files set deleted=true where id=$1", [fileId]).catch(() => {});
    await sql.query("truncate private.file_backups cascade; truncate private.operations_runs,private.client_errors,private.operations_limits,private.operations_alerts").catch(() => {});
    await sql.end();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
