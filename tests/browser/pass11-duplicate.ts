import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type pg from "pg";
import type { Browser, Page } from "playwright";
import { joinPhones } from "../../scripts/load-test";
import { engagement, facilitator, press, type Env } from "./harness";

type Args = { env: Env; sql: pg.Client; appOrigin: string; browser: Browser; shot: (page: Page, name: string) => Promise<void> };
export async function testPass11Duplicate({ env, sql, appOrigin, browser, shot }: Args) {
  const source = await engagement(sql, []), empty = await engagement(sql, []), replace = await engagement(sql, []);
  const append = await engagement(sql, []), answered = await engagement(sql, []);
  const token = randomUUID().slice(0, 6);
  const labels = [`Source ${token}`, `Empty ${token}`, `Replace ${token}`, `Append ${token}`, `Has answers ${token}`];
  for (const [index, room] of [source, empty, replace, append, answered].entries()) {
    await sql.query("update public.engagements set title=$2,type='team_workshop',skin=$3,start_date=$4,settings=settings||'{\"open_join\":true}'::jsonb where id=$1",
      [room.id, labels[index], index ? "novetera" : "clearway", index ? "2030-02-10" : "2029-01-02"]);
  }
  const fac = await facilitator(env, sql, source.id);
  for (const target of [empty, replace, append, answered]) {
    await sql.query("insert into public.engagement_facilitators(engagement_id,clearway_user_id,role) select $1,id,'lead' from public.clearway_users where auth_user_id=$2",
      [target.id, fac.session.user.id]);
  }
  const subject = await source.session("Original prompt", "wall", "What do you think?", 1);
  const media = randomUUID(), imagePath = `${source.id}/${media}.png`;
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ailut4AAAAASUVORK5CYII=", "base64");
  const store = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } }).storage.from("engagement-images");
  assert.equal((await store.upload(imagePath, image, { contentType: "image/png" })).error, null);
  await sql.query("insert into private.engagement_images(id,engagement_id,path,mime,bytes,name,width,height,uploaded_at) values($1,$2,$3,'image/png',$4,'Slide.png',1,1,now())",
    [media, source.id, imagePath, image.length]);
  await sql.query("update public.sessions set options=options||$2::jsonb,planned_start='2029-01-02T15:15Z',section='Opening' where id=$1",
    [subject, JSON.stringify({ image: { id: media, display: "place" }, visibility: "private" })]);
  const choices = await source.session("Original second step", "scale", "What changed?", 2);
  await sql.query("update public.sessions set options=private.session_options('scale','{\"max\":10}'::jsonb,engagement_id) where id=$1", [choices]);
  const later = await source.session("Later scale", "scale", "How about now?", 3);
  await sql.query("update public.sessions set options=private.session_options('scale','{\"max\":10}'::jsonb,engagement_id) where id=$1", [later]);
  const comparison = await source.session("Compare the ratings", "before_after", "What changed?", 4);
  await sql.query("update public.sessions set options=private.session_options('before_after',$2::jsonb,engagement_id) where id=$1",
    [comparison, JSON.stringify({ mode: "steps", before_session: choices, after_session: later })]);
  await sql.query("update public.sessions set options=options||$2::jsonb where id=$1",
    [subject, JSON.stringify({ timer: { kind: "down", seconds: 120, through: later } })]);
  const existingReplace = await replace.session("Remove this step", "wall", "Old", 1);
  const existingAppend = await append.session("Retain this step", "wall", "Old", 1);
  const existingAnswered = await answered.session("Already answered", "wall", "Old", 1);
  const [phone] = await joinPhones(appOrigin, 1, { room: answered.id, prefix: "Disposable duplicate tester" });
  await press(fac, sql, answered.id, "go_live", { session: existingAnswered });
  assert.equal((await phone.send(answered.id, existingAnswered, "An answer that stays put")).status, "accepted");
  await press(fac, sql, answered.id, "nothing_live");
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies(fac.cookies(appOrigin));
  const page = await context.newPage();
  const dialog = page.getByRole("dialog", { name: "Duplicate run of show" });
  const menu = page.getByRole("menuitem", { name: "Duplicate run of show" });
  const address = `${appOrigin}/admin/${source.id}`;
  const choose = async (label: string, fromOverview = true) => {
    if (fromOverview) {
      await page.goto(address);
      await page.getByRole("button", { name: "More actions", exact: true }).click();
    }
    await menu.click();
    await dialog.getByRole("searchbox").fill(label);
    await dialog.getByRole("button", { name: new RegExp(label) }).click();
  };
  const submit = async (target: string) => {
    await dialog.getByRole("button", { name: "Duplicate 4 steps" }).click();
    await page.getByText(`Copied 4 steps to ${target}`, { exact: true }).waitFor();
    await dialog.waitFor({ state: "detached" });
  };
  const rows = async (id: string) => (await sql.query("select id,title,position,options,planned_start,state from public.sessions where engagement_id=$1 and not deleted order by position", [id])).rows;
  try {
    await page.goto(`${appOrigin}/admin`);
    await page.getByRole("searchbox", { name: "Search churches and events" }).fill(labels[0]);
    await page.getByRole("row", { name: new RegExp(labels[0]) }).getByRole("button", { name: "More actions" }).click();
    await menu.waitFor();
    await shot(page, "duplicate-run-of-show-menu");
    await choose(labels[1], false);
    assert.equal(await dialog.getByRole("radio").count(), 0);
    await submit(labels[1]);
    assert.equal(await page.getByRole("link", { name: "Open its run of show" }).getAttribute("href"), `/admin/${empty.id}/run-of-show`);
    const copied = await rows(empty.id);
    assert.equal(copied.length, 4);
    assert.equal(copied[0].state, "draft");
    assert.notEqual(copied[0].id, subject);
    assert.notEqual(copied[0].options.image.id, media);
    assert.equal(copied[0].options.visibility, "private");
    assert.equal(copied[0].options.timer.through, copied[2].id);
    assert.equal(copied[0].options.timer.seconds, 120);
    assert.equal(copied[3].options.before_session, copied[1].id);
    assert.equal(copied[3].options.after_session, copied[2].id);
    assert.equal(copied[0].planned_start.toISOString(), "2030-02-10T15:15:00.000Z");
    const read = await store.download(`${empty.id}/${copied[0].options.image.id}.png`);
    assert.ok(read.data);
    assert.deepEqual(Buffer.from(await read.data.arrayBuffer()), image);

    await choose(labels[2]);
    await dialog.getByRole("radio", { name: /Replace them/ }).check();
    await shot(page, "duplicate-run-of-show-dialog");
    for (const name of ["Images and videos", "Timers and planned times", "Who sees answers on each step"]) await dialog.getByRole("checkbox", { name }).uncheck();
    await submit(labels[2]);
    const replaced = await rows(replace.id);
    assert.equal(replaced.length, 4);
    assert.ok(replaced.every(step => step.id !== existingReplace && !step.options.image && !step.options.timer && !step.options.visibility && !step.planned_start));

    await choose(labels[3]);
    await dialog.getByRole("radio", { name: /Add after them/ }).check();
    await submit(labels[3]);
    const appended = await rows(append.id);
    assert.equal(appended.length, 5);
    assert.equal(appended[0].id, existingAppend);

    await choose(labels[4]);
    assert.ok(await dialog.getByRole("radio", { name: /Replace them/ }).isDisabled());
    await dialog.getByText("Unavailable because these steps already have answers.").waitFor();
    await shot(page, "duplicate-run-of-show-replace-disabled");
    const refused = await page.request.post(`${appOrigin}/api/setup/duplicate-run-of-show`, {
      headers: { origin: appOrigin }, data: { source: source.id, target: answered.id, replace: true, media: false, times: false, visibility: false },
    });
    assert.equal((await refused.json()).status, "has_answers");
    assert.equal((await rows(answered.id))[0].id, existingAnswered);

    await sql.query("update public.clearway_users set is_admin=true where auth_user_id=$1", [fac.session.user.id]);
    const asNew = await page.request.post(`${appOrigin}/api/setup/engagement`, { headers: { origin: appOrigin }, data: { action: "duplicate", id: source.id } });
    const result = await asNew.json() as { ok: boolean; id: string };
    assert.equal(result.ok, true);
    const newSteps = await rows(result.id);
    assert.equal(newSteps.length, 4);
    assert.notEqual(newSteps[0].options.image.id, media);
    assert.ok((await store.download(`${result.id}/${newSteps[0].options.image.id}.png`)).data, "new event has its own image object");
    console.log("ok · duplicate run of show · empty, replace, append, answer guard, media, planned times, references and new event");
  } finally { await context.close(); }
}
