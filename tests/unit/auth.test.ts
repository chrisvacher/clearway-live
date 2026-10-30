import assert from "node:assert/strict";
import test from "node:test";
import { authConfig, clearwayEmail, destination, sameOrigin } from "../../lib/auth/policy";

test("facilitator domain matching rejects lookalike domains and malformed addresses", () => {
  assert.ok(clearwayEmail("Chris@Clearway.co"));
  for (const value of [undefined, "", "a@evilclearway.co", "a@clearway.co.evil", "a@clearway.co ", "a@b@clearway.co", "a b@clearway.co"]) assert.equal(clearwayEmail(value), false);
});
test("post-login destinations are a fixed set of internal routes", () => {
  assert.equal(destination("/control"), "/control");
  for (const value of [undefined, null, "//evil.example", "https://evil.example", "/control?next=evil", "/\\evil.example"]) assert.equal(destination(value), "/setup");
});
test("auth configuration fails closed and rejects privileged keys and unsafe URLs", () => {
  const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture", APP_ORIGIN: "https://live.clearway.co" };
  assert.ok(authConfig(env));
  assert.equal(authConfig({}), null);
  for (const SUPABASE_URL of ["http://evil.example", "https://user:pass@example.org", "https://example.org/path"]) assert.equal(authConfig({ ...env, SUPABASE_URL }), null);
  for (const APP_ORIGIN of ["https://live.clearway.co/path", "https://live.clearway.co/", "http://evil.example"]) assert.equal(authConfig({ ...env, APP_ORIGIN }), null);
  for (const SUPABASE_PUBLISHABLE_KEY of ["sb_secret_invalid", "bad", "x."+Buffer.from('{"role":"service_role"}').toString("base64url")+".x"]) assert.equal(authConfig({ ...env, SUPABASE_PUBLISHABLE_KEY }), null);
  assert.ok(authConfig({ ...env, SUPABASE_PUBLISHABLE_KEY: "x."+Buffer.from('{"role":"anon"}').toString("base64url")+".x" }));
});
test("mutations require an exact, configured Origin", () => {
  const origin = "https://live.clearway.co";
  assert.ok(sameOrigin(new Request(origin, { headers: { origin } }), origin));
  for (const bad of ["https://live.clearway.co.evil", "null", ""]) assert.equal(sameOrigin(new Request(origin, { headers: { origin: bad } }), origin), false);
});
