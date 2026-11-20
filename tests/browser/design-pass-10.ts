import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, startApp } from "./harness";

type Visit = {
  name: string;
  path: string;
  destination?: string;
  tab?: RegExp;
};

const widths = [390, 1280, 1440, 1512];
const fixtures = [
  { key: "workshop-clearway", title: "Spring staff workshop", type: "team_workshop", skin: "clearway" },
  { key: "workshop-novetera", title: "Team planning workshop", type: "team_workshop", skin: "novetera" },
  { key: "wayfinding", title: "Riverside Wayfinding retreat", type: "wayfinding", skin: "clearway" },
] as const;

const shared: Visit[] = [
  { name: "engagements", path: "/admin" },
  { name: "create", path: "/admin/new" },
  { name: "templates", path: "/admin/templates" },
  { name: "blocks", path: "/admin/templates", tab: /^Blocks/ },
  { name: "clearway-users", path: "/admin/users" },
  { name: "operations", path: "/admin/operations" },
  { name: "control-alias", path: "/control", destination: "/admin" },
];

function engagementVisits(id: string, workshop: boolean): Visit[] {
  const admin = `/admin/${id}`;
  const control = `/control/${id}`;
  const setupOnly = ["discover", "four-lists"];
  const resultsOnly = ["after", "report", "review", "map", "share", "check-ins", "plan"];
  return [
    { name: "overview", path: admin },
    { name: "details", path: `${admin}/details` },
    { name: "people", path: `${admin}/joining` },
    { name: "access", path: `${admin}/joining`, tab: /^Access$/ },
    { name: "people-alias", path: `${admin}/people`, destination: `${admin}/joining` },
    { name: "door-alias", path: `${admin}/door`, destination: `${admin}/joining?filter=in-the-room` },
    { name: "screens", path: `${admin}/tv` },
    { name: "run-of-show", path: `${admin}/run-of-show` },
    { name: "run-of-show-print", path: `${admin}/run-of-show/print` },
    ...setupOnly.map(name => ({ name, path: `${admin}/${name}`, destination: workshop ? admin : undefined })),
    { name: "live-room", path: control },
    { name: "results", path: `${control}/recap` },
    { name: "latency", path: `${control}/latency` },
    ...resultsOnly.map(name => ({ name, path: `${control}/${name}`, destination: workshop ? `${control}/recap` : undefined })),
    { name: "remote", path: `/remote/${id}` },
  ];
}

async function checkLayout(page: Page, visit: Visit, width: number) {
  const layout = await page.evaluate(() => {
    const bounds = document.querySelector("#main")!.getBoundingClientRect();
    return { viewport: innerWidth, document: document.documentElement.scrollWidth, left: bounds.left, right: bounds.right };
  });
  assert.equal(layout.viewport, width);
  assert.ok(layout.document <= width + 1 && layout.left >= -1 && layout.right <= width + 1,
    `Page exceeds viewport: ${JSON.stringify(layout)}`);
  if (visit.name === "run-of-show" && width >= 1280) {
    const row = await page.locator(".rb-header > div").evaluateAll(elements => elements.map(element => {
      const { left, right, top, height } = element.getBoundingClientRect();
      return { left, right, center: top + height / 2 };
    }));
    assert.equal(row.length, 2);
    assert.ok(row[1].left >= row[0].right && Math.abs(row[1].center - row[0].center) <= 2,
      `Run of show header needs one row: ${JSON.stringify(row)}`);
  }
}

async function main() {
  const output = process.env.PASS10_SWEEP_SHOTS ?? "docs/evidence/design-pass-10";
  await mkdir(output, { recursive: true });
  process.env.TEAM_HUB_DATABASE_URL = "postgres://clearway_live_reader:local@127.0.0.1:1/postgres";
  const env = localEnv();
  const sql = db(env);
  const mail = await mailbox();
  const app = await startApp(env, mail.url);
  const browser = await chromium.launch();
  const results: { fixture: string; width: number; name: string; screenshots: string[]; error?: string }[] = [];

  try {
    await sql.connect();
    const groups = [{ key: "shared", visits: shared }];
    const primary = await engagement(sql, ["Ruth", "Ben", "Ana"]);
    const fac = await facilitator(env, sql, primary.id);
    await sql.query("update public.clearway_users set is_admin=true where email=$1", [fac.session.user.email]);

    for (const [index, fixture] of fixtures.entries()) {
      const room = index === 0 ? primary : await engagement(sql, ["Ruth", "Ben", "Ana"]);
      const workshop = fixture.type === "team_workshop";
      await sql.query(`update public.engagements set title=$2,type=$3::public.engagement_type,skin=$4,status=$5::public.engagement_status,
        start_date='2027-03-02',end_date=case when $3='wayfinding' then '2027-03-03'::date else null end,
        retreat_start_date='2027-03-02',retreat_end_date='2027-03-03' where id=$1`,
      [room.id, fixture.title, fixture.type, fixture.skin, workshop ? "setup" : "pre_call"]);
      if (index > 0) {
        await sql.query(`insert into public.engagement_facilitators(engagement_id,clearway_user_id,role)
          select $1,clearway_user_id,'lead' from public.engagement_facilitators where engagement_id=$2 and role='lead'`,
        [room.id, primary.id]);
      }
      const welcome = await room.session("Welcome", "wall", "What brought you here?", 1);
      await room.session("Shared priorities", "wall", "Which priorities need our attention?", 2);
      await sql.query("update public.sessions set section='Opening' where engagement_id=$1", [room.id]);
      await sql.query("update public.sessions set shown_at=now() where id=$1", [welcome]);
      if (!workshop) await room.session("Four Helpful Lists", "four_lists", "What do we need to hear?", 3);
      groups.push({ key: fixture.key, visits: engagementVisits(room.id, workshop) });
    }

    for (const width of widths) {
      // Start from the facilitator's initial drawer preference. The broader kits open the drawer in the harness.
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce", storageState: {
        cookies: [], origins: [{ origin: app.origin, localStorage: [{ name: "clearway-live.room-admin", value: "closed" }] }],
      } });
      await context.addCookies(fac.cookies(app.origin));
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      for (const group of groups) {
        for (const visit of group.visits) {
          const result: (typeof results)[number] = { fixture: group.key, width, name: visit.name, screenshots: [] };
          results.push(result);
          errors.length = 0;
          try {
            const response = await page.goto(app.origin + visit.path, { waitUntil: "domcontentloaded", timeout: 10_000 });
            assert.ok(response?.ok(), `HTTP ${response?.status()}`);
            await page.waitForURL(app.origin + (visit.destination ?? visit.path), { timeout: 5_000 });
            await page.locator("#main").waitFor({ timeout: 5_000 });
            if (visit.tab) {
              const tab = page.getByRole("tab", { name: visit.tab });
              await tab.click({ timeout: 5_000 });
              await page.locator('[role="tab"][aria-selected="true"]').filter({ hasText: visit.tab }).waitFor({ timeout: 5_000 });
            }
            await page.evaluate(() => document.fonts.ready.then(() => undefined));
            const capture = async (name: string) => {
              const file = join(group.key, `${name}.png`);
              await page.screenshot({ path: join(output, file), fullPage: true, animations: "disabled", timeout: 10_000 });
              result.screenshots.push(file);
            };
            if (width === 1440 && !visit.destination) await capture(visit.name);
            if (visit.name === "live-room" && width >= 1280) {
              const drawer = page.getByRole("complementary", { name: "Room admin", exact: true });
              await drawer.waitFor({ state: "hidden", timeout: 5_000 });
              if (width !== 1440) await capture(`live-room-${width}-closed`);
              await page.getByRole("button", { name: "Room admin", exact: true }).click({ timeout: 5_000 });
              await drawer.waitFor({ timeout: 5_000 });
              await page.waitForFunction(() => {
                const aside = document.querySelector("#ctl-side");
                return aside && getComputedStyle(aside).opacity === "1";
              }, undefined, { timeout: 5_000 });
              await capture(`live-room-${width}-open`);
              await drawer.getByRole("button", { name: "Close Room admin" }).click({ timeout: 5_000 });
              await drawer.waitFor({ state: "hidden", timeout: 5_000 });
            }
            await checkLayout(page, visit, width);
            assert.deepEqual(errors, []);
          } catch (error) {
            result.error = error instanceof Error ? error.message : String(error);
            console.error(`${group.key} ${width} ${visit.name}: ${result.error}`);
          }
        }
      }
      await context.close();
    }
  } finally {
    await writeFile(join(output, "sweep.json"), JSON.stringify(results, null, 2) + "\n");
    await browser.close();
    app.stop();
    await mail.close();
    await sql.end();
  }
  const failed = results.filter(result => result.error);
  console.log(`Checked ${results.length} signed-in views and redirects. Saved ${results.flatMap(result => result.screenshots).length} screenshots.`);
  assert.equal(failed.length, 0, `${failed.length} signed-in checks failed. See sweep.json.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
