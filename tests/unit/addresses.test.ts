import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { authConfig, sameAddress, sameOrigin } from "../../lib/auth/policy";
import { addressDecision, classify, type Rule, type Target } from "../../lib/room/address";
import { practiceId } from "../../lib/room/practice";

const env = { APP_ORIGIN: "https://live.clearway.co", NOVETERA_ORIGIN: "https://live.novetera.co" };
const CW = "https://live.clearway.co", NV = "https://live.novetera.co";
const request = (host: string, origin?: string) => new Request(`https://${host}/api/live/x`, { method: "POST", headers: { host, ...(origin === undefined ? {} : { origin }) } });
const id = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";

test("a change is accepted only from the first-party origin of the address it was sent to", () => {
  assert.ok(sameAddress(request("live.clearway.co", CW), env));
  assert.ok(sameAddress(request("live.novetera.co", NV), env));
  assert.equal(sameAddress(request("live.clearway.co", NV), env), false, "Novetera's origin is not accepted at Clearway's address");
  assert.equal(sameAddress(request("live.novetera.co", CW), env), false, "Clearway's origin is not accepted at Novetera's address");
  for (const bad of [undefined, "", "null", "http://live.novetera.co", "https://live.novetera.co.evil.example", "https://evil.example", "https://live.novetera.co/"]) assert.equal(sameAddress(request("live.novetera.co", bad), env), false, `refused: ${bad}`);
  assert.equal(sameAddress(request("evil.example", NV), env), false, "a Host that is neither address is refused");
  assert.equal(sameAddress(request("evil.example", "https://evil.example"), env), false);
  assert.ok(sameAddress(request("LIVE.NOVETERA.CO", NV), env), "a host is matched in any letter case");
});
test("facilitator routes keep accepting APP_ORIGIN only", () => {
  const post = (origin: string) => new Request(`${CW}/api/control/x`, { method: "POST", headers: { origin } });
  assert.ok(sameOrigin(post(CW), CW)); assert.equal(sameOrigin(post(NV), CW), false);
});
test("local kits tell the two addresses apart by host", () => {
  const local = { APP_ORIGIN: "http://localhost:4000", NOVETERA_ORIGIN: "http://127.0.0.1:4000" };
  assert.ok(sameAddress(request("localhost:4000", "http://localhost:4000"), local)); assert.ok(sameAddress(request("127.0.0.1:4000", "http://127.0.0.1:4000"), local));
  assert.equal(sameAddress(request("127.0.0.1:4000", "http://localhost:4000"), local), false); assert.equal(sameAddress(request("localhost:4000", "http://127.0.0.1:4000"), local), false);
});
test("cookies stay host-only and keep their Secure setting", () => {
  const base = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture" };
  assert.equal(authConfig({ ...base, APP_ORIGIN: CW })?.secure, true); assert.equal(authConfig({ ...base, APP_ORIGIN: "http://localhost:3000" })?.secure, false);
  // No cookie the app sets names a Domain, so a cookie never reaches the other address.
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? (name === "node_modules" || name === ".next" ? [] : walk(path)) : /\.tsx?$/.test(name) ? [path] : []; });
  for (const file of [...walk("app"), ...walk("lib"), "middleware.ts"]) assert.doesNotMatch(readFileSync(file, "utf8"), /\bdomain\s*:/i, `${file} sets no cookie Domain`);
});

const params = (path: string) => { const url = new URL(path, CW); return classify(url.pathname, url.searchParams); };
test("each path kind is a rule", () => {
  for (const path of ["/sign-in", "/auth/google", "/auth/callback?code=1", "/setup", "/setup/new", `/setup/${id}/tv`, "/control", `/control/${id}/plan`, `/remote/${id}`, "/api/facilitator/x/door", "/api/control/x/ai", "/api/run-of-show/x",
    "/api/setup", "/api/setup/logo", "/api/templates", "/api/operations", "/api/operations/backups/x", "/api/discover/x/file", "/api/overnight/x", "/api/scribe/x/files/y", "/api/tv/control/x"])
    assert.deepEqual(params(path), { kind: "clearway" }, path);
  assert.deepEqual(params("/ABCD1234"), { kind: "code", code: "ABCD1234" });
  assert.deepEqual(params("/abcd1234"), { kind: "code", code: "ABCD1234" }, "any letter case");
  assert.deepEqual(params("/abcd-1234"), { kind: "code", code: "ABCD1234" });
  assert.deepEqual(params("/HopeOakville"), { kind: "code", code: "HOPEOAKVILLE" }, "a link name");
  assert.deepEqual(params("/r/abcd1234"), { kind: "code", code: "ABCD1234" });
  assert.deepEqual(params("/join?code=hope-oakville"), { kind: "code", code: "HOPEOAKVILLE" }, "the join box strips hyphens");
  assert.equal(params("/hope-oakville"), null, "a path with a hyphen is not a link name");
  assert.deepEqual(params("/join?code=https%3A%2F%2Flive.novetera.co%2Fabcd1234"), { kind: "code", code: "ABCD1234" }, "a pasted link");
  assert.deepEqual(params("/practice"), { kind: "practice" }); assert.deepEqual(params("/PRACTICE"), { kind: "practice" }); assert.deepEqual(params("/join?code=practice"), { kind: "practice" });
  assert.deepEqual(params(`/room/${id}`), { kind: "engagement", id }); assert.deepEqual(params(`/room/${id}/confirm?challenge=a&token=b`), { kind: "engagement", id });
});
test("these are never a room: the TV, its API, the AI page, static files, error reports, the front page", () => {
  for (const path of ["/", "/tv", "/api/tv", "/api/tv/ack", "/how-we-use-ai", "/robots.txt", "/icon.svg", "/favicon.ico", "/_next/static/a.js", "/api/live/x/tick", "/api/room/x/status", "/api/operations/errors", "/api/cron/check-ins", "/v/tok", "/c/tok", "/f/tok/tv", "/api/followup", "/api/check-in",
    "/room", "/room/not-an-id", `/room/${id}/other`, "/join", "/join?code=", "/join?code=%20", "/r/zzz", "/r/ABCD1234/x", "/ab", "/ABCD1234/extra", "/api", "/tv/x"])
    assert.equal(params(path), null, path);
});

type Call = { host: string; path: string; method?: string; cookies?: string[]; skins?: Record<string, Skin> };
type Skin = "clearway" | "novetera";
// The database, as a table of what each code or id is now. Switching an engagement's skin is changing this table.
const decide = async ({ host, path, method = "GET", cookies = [], skins }: Call, world: { codes: Record<string, Target>; skin: Record<string, Skin> }, calls: Rule[] = []) => {
  const url = new URL(path, `https://${host}`);
  return addressDecision({ method, host, pathname: url.pathname, search: url.search, cookies: { getAll: () => cookies.map(name => ({ name })) }, env,
    resolve: async rule => { calls.push(rule); if (rule.kind === "code") return world.codes[rule.code] ?? null; if (rule.kind === "clearway") return null; const key = rule.kind === "practice" ? practiceId : rule.id; return world.skin[key] ? { id: key, skin: skins?.[key] ?? world.skin[key] } : null; } });
};
const world = { codes: { ABCD1234: { id, skin: "novetera" as Skin }, HOPEOAKVILLE: { id, skin: "novetera" as Skin }, FACE5678: { id: other, skin: "clearway" as Skin } }, skin: { [id]: "novetera" as Skin, [other]: "clearway" as Skin, [practiceId]: "clearway" as Skin } };
const to = (location: string) => ({ action: "redirect", location });

test("a facilitator page or API at the Novetera address goes to the Clearway address, and a change is refused", async () => {
  for (const path of ["/sign-in", "/setup", `/setup/${id}/details?tab=a`, "/control", `/remote/${id}`, "/api/tv/control/x", "/auth/callback?code=1&state=2"])
    assert.deepEqual(await decide({ host: "live.novetera.co", path }, world), to(CW + path), path);
  assert.deepEqual(await decide({ host: "live.novetera.co", path: "/setup", method: "HEAD" }, world), to(CW + "/setup"));
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) for (const path of ["/auth/google", "/api/control/x/ai", "/api/setup", "/api/tv/control/x"]) assert.deepEqual(await decide({ host: "live.novetera.co", path, method }, world), { action: "refuse" }, `${method} ${path}`);
  assert.deepEqual(await decide({ host: "live.clearway.co", path: "/setup" }, world), { action: "pass" });
  assert.deepEqual(await decide({ host: "live.clearway.co", path: "/api/setup", method: "POST" }, world), { action: "pass" });
});
test("a room code, link name or room link at the wrong address goes to its engagement's address, path and query kept", async () => {
  for (const [path, at, want] of [
    ["/abcd1234", "live.clearway.co", NV + "/abcd1234"], ["/HopeOakville", "live.clearway.co", NV + "/HopeOakville"], ["/r/ABCD1234", "live.clearway.co", NV + "/r/ABCD1234"],
    ["/join?code=ABCD-1234&x=1", "live.clearway.co", NV + "/join?code=ABCD-1234&x=1"], [`/room/${id}`, "live.clearway.co", NV + `/room/${id}`], [`/room/${id}/confirm?challenge=a&token=b`, "live.clearway.co", NV + `/room/${id}/confirm?challenge=a&token=b`],
    ["/FACE5678", "live.novetera.co", CW + "/FACE5678"], ["/r/face5678", "live.novetera.co", CW + "/r/face5678"], [`/room/${other}`, "live.novetera.co", CW + `/room/${other}`], ["/practice", "live.novetera.co", CW + "/practice"], ["/PRACTICE", "live.novetera.co", CW + "/PRACTICE"],
  ]) assert.deepEqual(await decide({ host: at, path }, world), to(want), `${at}${path}`);
  for (const [path, at] of [["/abcd1234", "live.novetera.co"], ["/r/ABCD1234", "live.novetera.co"], [`/room/${id}`, "live.novetera.co"], ["/FACE5678", "live.clearway.co"], ["/practice", "live.clearway.co"], ["/join?code=ABCD1234", "live.novetera.co"]])
    assert.deepEqual(await decide({ host: at, path }, world), { action: "pass" }, `right address ${at}${path}`);
});
test("an unknown code, a lookup that fails and a host that is neither address stay where they are", async () => {
  assert.deepEqual(await decide({ host: "live.novetera.co", path: "/NOSUCH99" }, world), { action: "pass" });
  assert.deepEqual(await decide({ host: "live.novetera.co", path: `/room/${"3".repeat(8)}-3333-4333-8333-333333333333` }, world), { action: "pass" });
  const failing = await addressDecision({ method: "GET", host: "live.clearway.co", pathname: "/ABCD1234", search: "", cookies: { getAll: () => [] }, env, resolve: async () => { throw new Error("down"); } });
  assert.deepEqual(failing, { action: "pass" }, "fail open");
  const calls: Rule[] = [];
  assert.deepEqual(await decide({ host: "preview-abc.vercel.app", path: "/ABCD1234" }, world, calls), { action: "pass" }); assert.deepEqual(await decide({ host: "preview-abc.vercel.app", path: "/setup" }, world, calls), { action: "pass" }); assert.equal(calls.length, 0);
});
test("a person already in the engagement at this address is not moved", async () => {
  const room = `cw-room-${id}`, device = `cw-device-${id}`;
  for (const cookies of [[room], [room + ".0", room + ".1"], [device]]) {
    for (const path of ["/ABCD1234", "/HopeOakville", "/r/ABCD1234", "/join?code=ABCD1234", `/room/${id}`, `/room/${id}/confirm`]) assert.deepEqual(await decide({ host: "live.clearway.co", path, cookies }, world), { action: "pass" }, `${cookies} ${path}`);
  }
  assert.deepEqual(await decide({ host: "live.clearway.co", path: "/ABCD1234", cookies: [`cw-room-${other}`] }, world), to(NV + "/ABCD1234"), "a session for another engagement does not count");
  assert.deepEqual(await decide({ host: "live.clearway.co", path: "/ABCD1234", cookies: ["cw-facilitator", "cw-tv"] }, world), to(NV + "/ABCD1234"), "nor does a facilitator or TV session");
  const calls: Rule[] = []; await decide({ host: "live.clearway.co", path: `/room/${id}`, cookies: [room] }, world, calls); assert.equal(calls.length, 0, "a room page with a session costs no lookup");
  // The exception is for a room only. A facilitator page is still moved.
  assert.deepEqual(await decide({ host: "live.novetera.co", path: "/setup", cookies: [room] }, world), to(CW + "/setup"));
});
test("switching an engagement's skin moves its old links", async () => {
  const live = { codes: { ABCD1234: { id, skin: "clearway" as Skin } }, skin: { [id]: "clearway" as Skin } };
  for (const path of ["/ABCD1234", "/r/ABCD1234", `/room/${id}`]) assert.deepEqual(await decide({ host: "live.clearway.co", path }, live), { action: "pass" }, "before: the Clearway link works at Clearway");
  live.codes.ABCD1234.skin = "novetera"; live.skin[id] = "novetera";
  for (const path of ["/ABCD1234", "/r/ABCD1234", `/room/${id}`]) assert.deepEqual(await decide({ host: "live.clearway.co", path }, live), to(NV + path), "after: the old link lands at Novetera");
  assert.deepEqual(await decide({ host: "live.clearway.co", path: "/ABCD1234", cookies: [`cw-room-${id}`] }, live), { action: "pass" }, "a phone already in stays");
  live.codes.ABCD1234.skin = "clearway"; live.skin[id] = "clearway";
  assert.deepEqual(await decide({ host: "live.novetera.co", path: "/ABCD1234" }, live), to(CW + "/ABCD1234"), "and back again, nothing remembered");
});
