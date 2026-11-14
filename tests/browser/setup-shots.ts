// Screenshots of every facilitator setup page at 1440 and 1024 wide, for the setup pickers review. Local harness and fictional people only.
// Usage: KIT_SHOTS=docs/evidence/setup-pickers/before node --import tsx tests/browser/setup-shots.ts
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, startApp } from "./harness";
async function main() {
  const out = process.env.KIT_SHOTS; assert.ok(out, "set KIT_SHOTS to the folder for the screenshots"); await mkdir(out, { recursive: true });
  process.env.TEAM_HUB_DATABASE_URL = "postgres://clearway_live_reader:local@127.0.0.1:1/postgres";
  const env = localEnv(), sql = db(env), mail = await mailbox(), app = await startApp(env, mail.url), browser = await chromium.launch();
  try {
    await sql.connect();
    const room = await engagement(sql, ["Ruth", "Ben"]), fac = await facilitator(env, sql, room.id);
    await sql.query("update public.clearway_users set is_admin=true where email=$1", [fac.session.user.email]);
    await sql.query("update public.engagements set title='Riverside Wayfinding retreat',type='wayfinding',start_date='2027-02-20',end_date='2027-02-21',retreat_start_date='2027-02-20',retreat_end_date='2027-02-21' where id=$1", [room.id]);
    await room.session("Welcome", "wall", "What brought you here?", 1); await room.session("Five Lenses: Congregation", "wall", "Describe the Congregation in ten years.", 2, { segment: "Five Lenses" });
    await sql.query("update public.sessions set section='Opening' where engagement_id=$1 and position=1", [room.id]);
    const workshop = await engagement(sql, ["Ana"]); await facilitator(env, sql, workshop.id).then(f => sql.query("update public.clearway_users set is_admin=true where email=$1", [f.session.user.email]));
    await sql.query("update public.engagements set title='Staff planning workshop',type='team_workshop',start_date='2027-03-02' where id=$1", [workshop.id]);
    await sql.query("insert into public.engagement_facilitators(engagement_id,clearway_user_id,role) select $1,clearway_user_id,'lead' from public.engagement_facilitators where engagement_id=$2 and role='lead' on conflict do nothing", [workshop.id, room.id]);
    await workshop.session("Welcome", "wall", "What brought you here?", 1);
    const context = await browser.newContext(); await context.addCookies(fac.cookies(app.origin));
    const page = await context.newPage();
    // New engagement: a church and an engagement picked from a stand-in for Team Hub, so the later cards show.
    await page.route("**/api/setup", async route => {
      const data = route.request().postDataJSON();
      if (data.action === "hub_clients") return route.fulfill({ json: { ok: true, clients: [{ id: room.id, name: "Riverside Church", city: "Toronto", state_province: "ON", timezone: "America/Toronto" }] } });
      if (data.action === "hub_engagements") return route.fulfill({ json: { ok: true, client: { id: room.id, name: "Riverside Church", timezone: "America/Toronto" }, engagements: [{ id: workshop.id, title: "Spring workshop", engagement_type: "team_workshop", start_date: "2027-03-02" }, { id: room.id, title: "Wayfinding 2027", engagement_type: "wayfinding", start_date: "2027-02-20" }] } });
      return route.continue();
    });
    const shot = async (name: string, width: number) => { await page.waitForLoadState("networkidle"); await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true }); };
    const go = async (path: string) => { const r = await page.goto(app.origin + path); assert.ok(r && r.status() < 400, `${path}: ${r?.status()}`); await page.waitForLoadState("networkidle"); };
    const pages: [string, string, ((p: Page) => Promise<void>)?][] = [
      ["01-engagements", "/setup"],
      ["02-create", "/setup/new"],
      ["03-create-picked", "/setup/new", async p => { await p.getByRole("button", { name: "Find churches" }).click(); await p.getByRole("button", { name: /^Riverside Church/ }).click(); await p.getByRole("button", { name: /^Spring workshop/ }).click(); }],
      ["04-overview", `/setup/${room.id}`],
      ["05-details-wayfinding", `/setup/${room.id}/details`],
      ["06-details-workshop", `/setup/${workshop.id}/details`],
      ["07-people-joining-wayfinding", `/setup/${room.id}/joining`],
      ["08-people-joining-workshop", `/setup/${workshop.id}/joining`],
      ["09-screens", `/setup/${room.id}/tv`],
      ["10-run-of-show", `/setup/${room.id}/run-of-show`],
      ["11-run-of-show-options", `/setup/${room.id}/run-of-show`, async p => { await p.locator(".rb-head").nth(1).click(); await p.locator(".rb-row.is-open .show-fields").waitFor(); }],
      ["12-run-of-show-save-template", `/setup/${room.id}/run-of-show`, async p => { await p.getByRole("button", { name: "Save as template" }).click(); await p.getByRole("dialog").waitFor(); }],
      ["13-discover", `/setup/${room.id}/discover`],
      ["14-four-lists", `/setup/${room.id}/four-lists`],
      ["15-door-list", `/setup/${room.id}/door`],
      ["16-templates", "/setup/templates"],
      ["17-templates-use", "/setup/templates", async p => { await p.locator(".tpl-card").first().getByRole("button", { name: /^Use / }).click(); await p.getByRole("dialog").waitFor(); }],
      ["18-clearway-users", "/setup/users"],
      ["19-operations", "/setup/operations"],
    ];
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [name, path, act] of pages) {
        try { await page.setViewportSize({ width, height: /^1[0-2]-|^1[67]-/.test(name) ? 2200 : 1000 }); await go(path); if (act) await act(page); await page.waitForTimeout(250); await shot(name, width); }
        catch (e) { console.log(`skipped ${name} at ${width}: ${e instanceof Error ? e.message.split("\n")[0] : e}`); }
      }
    }
    console.log("Screenshots are in", out);
  } finally { await browser.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); }
}
main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
