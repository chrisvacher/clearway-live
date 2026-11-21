import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type pg from "pg";
import type { Page } from "playwright";
import { engagement, facilitator, press, until } from "./harness";

type Args = { sql: pg.Client; room: Awaited<ReturnType<typeof engagement>>; fac: Awaited<ReturnType<typeof facilitator>>; control: Page; tv: Page; phone: Page; name: string; appOrigin: string; shot: (page: Page, name: string) => Promise<void> };
export async function testPass11Video({ sql, room, fac, control, tv, phone, name, appOrigin, shot }: Args) {
  const temp = await mkdtemp(join(tmpdir(), "clearway-pass11-video-"));
  const editor = await control.context().newPage();
  try {
    const path = join(temp, "Workshop clip.mp4");
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24:duration=12", "-f", "lavfi", "-i", "sine=frequency=220:duration=12", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", path]);
    const resumable = process.env.KIT_RESUMABLE === "1" || (!process.env.KIT_FILTER && name === "novetera-very_small-dark-full");
    if (resumable) {
      const free = Buffer.alloc(8 * 1024 * 1024);
      free.writeUInt32BE(free.length);
      free.write("free", 4);
      await appendFile(path, free);
    }
    await editor.goto(`${appOrigin}/admin/${room.id}/run-of-show`);
    await editor.getByRole("button", { name: "Add step", exact: true }).click();
    await editor.locator(".rb-tile").filter({ hasText: "Video" }).click();
    const panel = editor.locator(".rb-settings");
    await panel.locator("#session-title").fill("Uploaded workshop clip");
    let dropped = false;
    const uploadTrace: string[] = [];
    if (resumable) {
      editor.on("response", response => {
        if (response.url().includes("/upload/resumable")) uploadTrace.push(`${response.request().method()} ${response.status()}`);
      });
      editor.on("requestfailed", request => {
        if (request.url().includes("/upload/resumable")) uploadTrace.push(`${request.method()} ${request.failure()?.errorText}`);
      });
    }
    if (resumable) await editor.route("**/upload/resumable/**", async route => {
      if (!dropped && route.request().method() === "PATCH") {
        dropped = true;
        await route.abort();
      } else await route.continue();
    });
    await panel.getByLabel("Upload video", { exact: true }).setInputFiles(path);
    try { await panel.getByText(/Uploaded$/).waitFor({ timeout: 25000 }); }
    catch (cause) { throw new Error(`Video upload did not finish (${uploadTrace.join(", ")}). ${await panel.getByRole("alert").allTextContents()}`, { cause }); }
    if (resumable) assert.ok(dropped, "the resumable upload recovered after a dropped PATCH");
    await panel.getByRole("button", { name: "Mark ready" }).click();
    const clip = await until(async () => (await sql.query("select id,options->'video' as video from public.sessions where engagement_id=$1 and title='Uploaded workshop clip' and state='ready'", [room.id])).rows[0], "video upload and readiness", 10000);
    await shot(editor, `${name}-video-setup`);
    await control.locator(".ctl-run-step", { hasText: "Uploaded workshop clip" }).hover();
    await control.getByRole("button", { name: "Preview Uploaded workshop clip" }).click();
    await tv.locator("[data-video-stage=preload] video").waitFor({ state: "attached" });
    await until(async () => await tv.locator("[data-video-stage=preload] video").evaluate(video => (video as HTMLVideoElement).readyState > 0), "video preloads");
    await press(fac, sql, room.id, "go_live", { session: clip.id });
    const player = tv.locator("[data-video-stage=live] video");
    await until(async () => await player.evaluate(video => !(video as HTMLVideoElement).paused), "video starts playing");
    await phone.getByText("Watch the screen. The video plays there, with sound.").waitFor();
    assert.equal(await phone.locator("video, iframe").count(), 0);
    await shot(phone, `${name}-video-phone`);
    const controls = control.getByRole("region", { name: "Video controls" });
    await controls.getByText("The TV needs a click to play sound. Click the TV once.").waitFor();
    await controls.getByRole("button", { name: "Pause" }).click();
    await until(async () => await player.evaluate(v => (v as HTMLVideoElement).paused), "TV pauses", 1000);
    await assertPlayback(sql, room.id, false);
    await press(fac, sql, room.id, "media_seek", { position: 5 });
    await until(async () => await player.evaluate(v => Math.abs((v as HTMLVideoElement).currentTime - 5) < .25), "TV seeks", 1000);
    await controls.getByRole("button", { name: "Restart" }).click();
    await until(async () => await player.evaluate(v => (v as HTMLVideoElement).currentTime < 2 && !(v as HTMLVideoElement).paused), "TV restarts", 1000);
    await press(fac, sql, room.id, "media_seek", { position: 6 });
    await tv.reload();
    await until(async () => await player.evaluate(v => (v as HTMLVideoElement).currentTime >= 6), "reconnected TV resumes server position", 10000);
    await shot(tv, `${name}-video-tv`); await shot(control, `${name}-video-live`);
    await press(fac, sql, room.id, "media_seek", { position: 11.7 });
    await until(async () => (await sql.query("select media->>'playing' as playing from public.room_states where engagement_id=$1", [room.id])).rows[0]?.playing === "false", "video holds its last frame", 4000);
    assert.equal((await sql.query("select live_session_id from public.room_states where engagement_id=$1", [room.id])).rows[0].live_session_id, clip.id);

    const nextClip = await room.session("Next after video", "video", "", 293);
    const following = await room.session("After the clip", "wall", "The next step after the clip", 294);
    await sql.query("update public.sessions set options=$2::jsonb,state='ready' where id=$1", [nextClip, JSON.stringify({ video: { ...clip.video, end: 1, ends: "next", sound: false } })]);
    await press(fac, sql, room.id, "go_live", { session: nextClip });
    await until(async () => (await sql.query("select live_session_id from public.room_states where engagement_id=$1", [room.id])).rows[0].live_session_id === following, "video advances once on the server", 5000);
    assert.equal((await sql.query("select count(*)::int n from private.room_controls where engagement_id=$1 and action='media_ended'", [room.id])).rows[0].n, 1);
  } finally { await editor.close(); await rm(temp, { recursive: true, force: true }); }
}

async function assertPlayback(sql: pg.Client, room: string, playing: boolean) {
  const row = (await sql.query("select media from public.room_states where engagement_id=$1", [room])).rows[0];
  assert.equal(row?.media?.playing, playing);
}
