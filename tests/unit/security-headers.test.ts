import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../../next.config";

test("every page refuses to be framed by another site", async () => {
  const rules = await nextConfig.headers!();
  const all = rules.find(r => r.source === "/:path*")!;
  const get = (key: string) => all.headers.find(h => h.key === key)?.value;
  assert.equal(get("Content-Security-Policy"), "frame-ancestors 'none'");
  assert.equal(get("X-Frame-Options"), "DENY");
});
