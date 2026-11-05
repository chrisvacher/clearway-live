// Milestone 4, step 7: the Wayfinding templates (SET-08) and the draft Clearway Map (D2-15), in a
// real browser against the production build and the local stack. An engagement starts from each
// template and every session's kind, place and timing is checked; then a draft Map is assembled
// from seeded Riverside records and read on the control surface, printed and downloaded.
// KIT_SHOTS=<folder> saves the screens. Local only.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, startApp } from "./harness";

const wayfinding = "c1ea0000-0000-4000-8000-000000000002", halfDay = "c1ea0000-0000-4000-8000-000000000003";
type Row = { title: string; part: string; position: number; interaction: string; planned_start: Date | null; planned_minutes: number; mode: string; team_led: boolean; segment: string; options: Record<string, unknown>; closes_at: Date | null };

async function main() {
  const env = localEnv(), sql = db(env), mail = await mailbox();
  const app = await startApp(env, mail.url);
  let browser: Browser | undefined;
  const passed: string[] = [];
  const shot = async (page: Page, name: string) => { if (process.env.KIT_SHOTS) { await delay(900); await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png`, fullPage: true }); } };
  const step = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`ok · ${name}`); };
  try {
    await sql.connect();
    // Step 2b registers lens_summary; until it is on this database the kit stands one in.
    if (!(await sql.query("select 1 from private.interaction_kinds where kind='lens_summary'")).rowCount) {
      await sql.query("insert into private.interaction_kinds(kind,label,input,one_per_person,counts,structured,shares_answers,spotlight,named,position) values('lens_summary','Lens summary',true,true,'people',true,false,'none','never',28)");
      await sql.query(`create function private.options_lens_summary(p jsonb,p_engagement uuid) returns jsonb language sql stable security definer set search_path='' as $f$
        select case when jsonb_typeof(p)='object' and not exists(select 1 from jsonb_object_keys(p) k where k not in ('lens','ai')) then p end $f$`);
    }
    const kinds = new Set((await sql.query("select kind from private.interaction_kinds")).rows.map(r => r.kind as string));
    const start = "2026-11-02T14:00:00Z";
    const sessions = (id: string) => sql.query<Row>("select title,part,position,interaction,planned_start,planned_minutes,mode,team_led,segment,options,closes_at from public.sessions where engagement_id=$1 and not deleted order by position", [id]).then(r => r.rows);
    const order = ["Pre-call", "Day 1", "Day 2", "Follow-up"];

    for (const [name, template, count, parts, liveMinutes, goalsLater] of [["Wayfinding", wayfinding, 40, ["Pre-call", "Day 1", "Day 2"], 980, 0], ["Wayfinding, day and a half", halfDay, 41, ["Pre-call", "Day 1", "Day 2", "Follow-up"], 945, 2]] as const) {
      await step(`${name}: starts, and every session has a kind, a place and a time`, async () => {
        const room = await engagement(sql, []);
        const fac = await facilitator(env, sql, room.id);
        const { data, error } = await fac.client.rpc("template_write", { p_action: "apply", p_input: { template, engagement: room.id, start } });
        assert.equal(error, null); assert.equal(data.status, "ok", JSON.stringify(data)); assert.equal(data.count, count);
        const rows = await sessions(room.id);
        assert.equal(rows.length, count);
        for (const r of rows) {
          assert.ok(kinds.has(r.interaction), `${r.title}: kind ${r.interaction} is registered`);
          assert.ok(order.includes(r.part), `${r.title}: part ${r.part}`);
          assert.ok(r.mode === "self_paced" ? r.closes_at : r.planned_start, `${r.title}: has a time`);
          assert.ok(r.planned_minutes >= 1 && r.planned_minutes <= 1440, `${r.title}: minutes`);
          assert.ok(!/[–—]/.test(r.title), `${r.title}: no dashes`);
          assert.ok(!/publish to core/i.test(r.title), "no Publish to CORE session");
        }
        assert.deepEqual([...new Set(rows.map(r => r.part))].sort((a, b) => order.indexOf(a) - order.indexOf(b)), parts);
        assert.equal(rows.filter(r => r.mode === "live").reduce((n, r) => n + r.planned_minutes, 0), liveMinutes);
        for (const part of parts) {
          const live = rows.filter(r => r.part === part && r.mode === "live").map(r => r.planned_start!.getTime());
          assert.deepEqual(live, [...live].sort((a, b) => a - b), `${part}: starts run in order`);
        }
        const clock = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
        assert.equal(clock(rows.find(r => r.part === "Day 1" && r.mode === "live")!.planned_start!), "09:00", "Day 1 starts at 9:00");
        assert.equal(clock(rows.find(r => r.part === "Day 2" && r.mode === "live")!.planned_start!), "08:30", "Day 2 starts at 8:30");
        // The Five Lenses run, then the lens summary sign-off, then the provisional Vision Outcomes.
        const at = (title: string) => rows.findIndex(r => r.title === title);
        const lenses = rows.filter(r => r.title.startsWith("Five Lenses: "));
        assert.equal(lenses.length, 5); assert.ok(lenses.every(r => r.segment === "Five Lenses"));
        const summary = rows.findIndex(r => r.interaction === "lens_summary");
        assert.equal(rows[summary].planned_minutes, 25);
        assert.ok(summary > rows.indexOf(lenses[4]) && summary < rows.findIndex(r => r.interaction === "candidates"), "the sign-off comes after Learning and before the Vision Outcomes");
        assert.equal(rows.filter(r => r.interaction === "goals" && r.options.risk_links === "later").length, goalsLater);
        assert.ok(rows.some(r => r.team_led) && rows.some(r => r.interaction === "intent"), "the team-led block is there");
        for (const kind of ["lens", "lens_summary", "candidates", "bullets", "confirm", "grid", "goals", "intent", "sign"]) assert.ok(rows.some(r => r.interaction === kind), `${name} uses ${kind}`);
        void at;
        if (template === halfDay) assert.equal(rows.filter(r => r.part === "Follow-up" && r.team_led).length, rows.filter(r => r.part === "Follow-up").length, "the follow-up is team-led");
      });
    }

    const room = await engagement(sql, ["Priya", "Ben"]);
    await sql.query("update public.engagements set title='Riverside Wayfinding',base_year=2026 where id=$1", [room.id]);
    const fac = await facilitator(env, sql, room.id);
    browser = await chromium.launch();
    const facContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await facContext.addCookies(fac.cookies(app.origin));
    const page = await facContext.newPage();

    await step("Draft Map: empty fields say so and say why, with nothing invented", async () => {
      await page.goto(`${app.origin}/control/${room.id}/map`);
      await page.getByRole("heading", { name: "Draft Clearway Map" }).waitFor({ timeout: 15000 });
      const text = await page.locator(".map-doc").innerText();
      assert.ok(text.includes("Not signed off yet"), "lenses start unsigned");
      assert.ok(text.includes("Left for the church's Annual Planning") || text.includes("Left for the church’s Annual Planning"), "This Year's Priorities is empty");
      const lower = text.toLowerCase(); // the labels are set in capitals
      assert.ok(lower.includes("10-year future") && lower.includes("3-year vision") && lower.includes("1-year outlook"), "horizon terms");
      await shot(page, "map-empty");
    });

    await step("Draft Map: it assembles from the records and follows them", async () => {
      await sql.query("update public.churches set mission='Help every neighbour take a next step with Jesus.',\"values\"='[\"Hospitality\",\"Courage\"]'::jsonb,leadership_rhythms='[\"Monthly elders meeting\"]'::jsonb where id=(select church_id from public.engagements where id=$1)", [room.id]);
      const outcome = (await sql.query("insert into private.vision_outcomes(engagement_id,title,status,confirmed_at,position) values($1,'Leaders raised from within','confirmed',now(),0) returning id", [room.id])).rows[0].id;
      await sql.query("insert into private.outcome_indicators(engagement_id,outcome_id,text) values($1,$2,'12 apprentice leaders serve alongside a ministry lead')", [room.id, outcome]);
      await sql.query("insert into private.goals(engagement_id,outcome_id,title,result,result_clear,owner_attendee_id,end_date) values($1,$2,'Launch the apprentice pathway','8 apprentices placed in ministries',true,$3,'2027-04-30'),($1,$2,'Design the leader residency','',false,null,null)", [room.id, outcome, room.attendees[0].id]);
      await sql.query("insert into private.risks(engagement_id,text,likelihood,impact) values($1,'We tried all five at once',0.8,0.8)", [room.id]);
      await sql.query("insert into private.key_metrics(engagement_id,text,rank) values($1,'People in groups',1)", [room.id]);
      await sql.query("insert into private.celebrations(engagement_id,text) values($1,'A baptism every month')", [room.id]);
      const summary = (await sql.query("insert into private.lens_summaries(engagement_id,lens,state) values($1,1,'on_screen') returning id", [room.id])).rows[0].id;
      const version = (await sql.query("insert into private.lens_summary_versions(engagement_id,summary_id,version,author,shown_at) values($1,$2,1,'ai',now()) returning id", [room.id, summary])).rows[0].id;
      await sql.query("insert into private.lens_summary_sentences(engagement_id,version_id,position,text) values($1,$2,0,'Every Sunday the room holds people who found us through a friend.')", [room.id, version]);
      await sql.query("update private.lens_summaries set state='signed_off',signed_off_version_id=$2,current_version_id=$2 where id=$1", [summary, version]);
      // The open page follows the records without a reload.
      await page.getByText("Every Sunday the room holds people who found us through a friend.").waitFor({ timeout: 20000 });
      const text = await page.locator(".map-doc").innerText();
      for (const expect of ["Help every neighbour take a next step with Jesus.", "Hospitality", "Leaders raised from within", "12 apprentice leaders", "Launch the apprentice pathway", "People in groups", "A baptism every month", "Monthly elders meeting", "We tried all five at once"]) assert.ok(text.includes(expect), `shows ${expect}`);
      assert.ok(!text.includes("Design the leader residency"), "a goal that does not meet CORE is left off");
      assert.ok(text.includes("1 goal does not meet CORE yet"), "and counted");
      assert.equal(await page.locator("[data-lens='1'].is-empty").count(), 0, "lens 1 is signed off");
      assert.equal(await page.locator("[data-lens='2'].is-empty").count(), 1, "lens 2 is not");
      await shot(page, "map-assembled");
    });

    await step("Draft Map: the print view shows two pages without the controls, and the text download works", async () => {
      await page.emulateMedia({ media: "print" });
      assert.equal(await page.locator(".map-actions").isVisible(), false, "no buttons in print");
      assert.equal(await page.locator(".map-page").count(), 2, "two pages");
      await page.emulateMedia({ media: "screen" });
      const md = await facContext.request.get(`${app.origin}/api/control/${room.id}/map?format=md`);
      assert.equal(md.status(), 200);
      const body = await md.text();
      assert.ok(body.includes("## Page 1: Identity and direction") && body.includes("## Page 2: Action") && body.includes("Launch the apprentice pathway"));
      assert.ok(!/[–—]/.test(body), "no dashes in the export");
    });

    await step("Draft Map: facilitators only, and nothing in the room state", async () => {
      const anon = await fetch(`${app.origin}/api/control/${room.id}/map`);
      assert.ok([401, 403].includes(anon.status), `anonymous request refused, got ${anon.status}`);
      const state = (await sql.query("select to_jsonb(r)::text as t from public.room_states r where engagement_id=$1", [room.id])).rows[0];
      assert.ok(!state || !String(state.t).includes("Hospitality"), "the Map never reaches the room state");
    });

    console.log(`Map and templates kit: ${passed.length} checks passed.`);
  } catch (error) {
    console.error(app.output().slice(-3000)); throw error;
  } finally { await browser?.close(); app.stop(); await mail.close(); await sql.end().catch(() => {}); }
}
main().catch(error => { console.error(error); process.exit(1); });
