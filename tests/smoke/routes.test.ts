import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { after, before, test } from "node:test";

let server: ChildProcess;
let origin: string;
let output = "";
const tripwire = "foundation-server-secret-must-never-ship";

before(async () => {
  await readFile(".next/BUILD_ID");
  const socket = createServer();
  await new Promise<void>(resolve => socket.listen(0, "127.0.0.1", resolve));
  const address = socket.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) => socket.close(err => err ? reject(err) : resolve()));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: tripwire, TEAM_HUB_DATABASE_URL: tripwire, RESEND_API_KEY: tripwire },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", chunk => { output += chunk; });
  server.stderr?.on("data", chunk => { output += chunk; });
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch { /* Wait for the production server to bind. */ }
    if (server.exitCode !== null) throw new Error(output);
    await delay(250);
  }
  throw new Error(`Production server did not become ready: ${output}`);
}, { timeout: 30000 });
after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise<void>(resolve => server.once("exit", () => resolve()));
    server.kill("SIGTERM");
    await exited;
  }
});

for (const [route, heading, surface] of [
  ["/", "Good work begins", "control"],
  ["/sign-in", "Prepare the room.", "control"],
  ["/room", "Your place in the room.", "phone"],
]) {
  test(`${route} serves a complete production page with the correct surface`, async () => {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
    const html = await response.text();
    assert.ok(html.includes(heading));
    assert.ok(html.includes(`data-surface="${surface}"`));
    assert.match(html, /lang="en"/);
    assert.match(html, /id="main"/);
    assert.doesNotMatch(html, /maximum-scale|user-scalable=no/);
    assert.ok(!html.includes(tripwire));
  });
}

test("home links lead to real routes", async () => {
  const html = await (await fetch(origin)).text();
  for (const route of ["/sign-in", "/room"]) assert.ok(html.includes(`href="${route}"`));
});

test("unbuilt private and live surfaces serve no engagement data", async () => {
  for (const route of ["/setup", "/control", "/tv", "/remote", "/room/nonexistent"]) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 404, route);
    assert.match(await response.text(), /Check the room link with your facilitator/);
  }
});

test("production CSS and every bundled local font are reachable", async () => {
  const html = await (await fetch(origin)).text();
  const cssPaths = [...html.matchAll(/href="([^\"]+\.css(?:\?[^\"]*)?)"/g)].map(m => m[1].replaceAll("&amp;", "&"));
  assert.ok(cssPaths.length > 0);
  let css = "";
  for (const path of cssPaths) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    css += await response.text();
  }
  assert.ok(css.includes("--cwl-surface"));
  assert.ok(css.includes("Plus Jakarta Sans"));
  const fonts = [...css.matchAll(/url\(["']?([^)'\"]+\.ttf)["']?\)/g)].map(m => m[1]);
  assert.ok(fonts.length >= 5);
  for (const path of new Set(fonts)) {
    const response = await fetch(new URL(path, origin + cssPaths[0]));
    assert.equal(response.status, 200, path);
    assert.ok((await response.arrayBuffer()).byteLength > 1000);
  }
});

test("no secret tripwire is present in browser JS or CSS", async () => {
  async function inspect(dir: string): Promise<void> {
    for (const file of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, file.name);
      if (file.isDirectory()) await inspect(path);
      else if (/\.(js|css)$/.test(path)) assert.ok(!(await readFile(path, "utf8")).includes(tripwire), path);
    }
  }
  await inspect(".next/static");
});
