import assert from "node:assert/strict";
import { test } from "node:test";
import { blockedPopupLine, expiredLinkLine, newPairToken, openTvWindow, pairLinkMs, pairToken, tokenInSearch, tvLinkAddress, tvWindowFeatures, withoutToken, type WindowHost } from "../../lib/tv/pair-link";
import { roomOrigin } from "../../lib/brand";
import { digest } from "../../lib/room/policy";

test("a pairing token is 32 random bytes, 43 URL-safe characters, different each time", () => {
  const a = newPairToken(), b = newPairToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/); assert.notEqual(a, b);
  assert.equal(pairToken(a), a);
  for (const bad of [undefined, null, 5, "", "123456", a.slice(1), a + "x", a.replace(/.$/, "+"), `${a.slice(1)}/`, " " + a.slice(1)]) assert.equal(pairToken(bad), null, String(bad));
});
test("the stored hash is keyed, so the database never holds a token that opens a window", () => {
  const token = newPairToken(), one = digest("secret-a", "tv-pair-link", token);
  assert.match(one, /^[a-f0-9]{64}$/); assert.notEqual(one, token);
  assert.notEqual(one, digest("secret-b", "tv-pair-link", token), "a different server secret gives a different hash");
  assert.notEqual(one, digest("secret-a", "tv-pair", token), "the six-digit code's label cannot be used for a link");
});
test("a link lasts five minutes", () => assert.equal(pairLinkMs, 5 * 60 * 1000));
test("the window opens at the engagement's own address with the token in the query", () => {
  const token = newPairToken();
  assert.equal(tvLinkAddress("https://live.clearway.co", token), `https://live.clearway.co/tv?pair=${token}`);
  const env = { NOVETERA_ORIGIN: "http://127.0.0.1:4010" };
  assert.equal(tvLinkAddress(roomOrigin("novetera", env), token), `http://127.0.0.1:4010/tv?pair=${token}`);
  assert.equal(tvLinkAddress(roomOrigin("clearway", { APP_ORIGIN: "http://localhost:4000" }), token), `http://localhost:4000/tv?pair=${token}`);
});
test("the TV page reads the token from its address and removes it, keeping anything else", () => {
  const token = newPairToken();
  assert.equal(tokenInSearch(`?pair=${token}`), token); assert.equal(tokenInSearch("?pair=nope"), null); assert.equal(tokenInSearch(""), null);
  assert.equal(withoutToken("/tv", `?pair=${token}`), "/tv");
  assert.equal(withoutToken("/tv", `?a=1&pair=${token}`, "#x"), "/tv?a=1#x");
  assert.equal(withoutToken("/tv", ""), "/tv");
});
test("the window is 1280 by 720 and the copy follows the app's rules", () => {
  assert.match(tvWindowFeatures, /popup/); assert.match(tvWindowFeatures, /width=1280/); assert.match(tvWindowFeatures, /height=720/);
  for (const line of [expiredLinkLine, blockedPopupLine]) assert.ok(!/[–—]/.test(line));
  assert.equal(expiredLinkLine, "That link has expired. Enter this code on Screens instead.");
});
function fake(allowPopup: boolean, allowTab: boolean) {
  const calls: unknown[][] = [], popup = { location: { href: "about:blank" }, closed: false, opener: {} as unknown, close() { this.closed = true; } };
  const tab = { location: { href: "" }, opener: {} as unknown, close() {} };
  const host: WindowHost = { open: (...args) => { calls.push(args); return args[2] ? (allowPopup ? popup : null) : (allowTab ? tab : null); } };
  return { host, calls, popup, tab };
}
test("one click opens the pop-up at once, then points it at the link", async () => {
  const f = fake(true, true); let asked = false;
  const result = await openTvWindow(f.host, async () => { asked = true; assert.equal(f.calls.length, 1, "the window opened before the server was asked"); return "https://live.clearway.co/tv?pair=abc"; });
  assert.deepEqual(result, { how: "window" }); assert.ok(asked);
  assert.equal(f.calls[0][2], tvWindowFeatures); assert.equal(f.popup.location.href, "https://live.clearway.co/tv?pair=abc"); assert.equal(f.popup.opener, null);
});
test("a blocked pop-up falls back to a new tab", async () => {
  const f = fake(false, true);
  assert.deepEqual(await openTvWindow(f.host, async () => "https://x/tv?pair=abc"), { how: "tab" });
  assert.deepEqual(f.calls[1], ["https://x/tv?pair=abc", "_blank"]);
});
test("when a tab is refused too, the link is handed back", async () => {
  const f = fake(false, false);
  assert.deepEqual(await openTvWindow(f.host, async () => "https://x/tv?pair=abc"), { how: "link", url: "https://x/tv?pair=abc" });
});
test("a refused request closes the blank window and opens nothing", async () => {
  const f = fake(true, true);
  assert.deepEqual(await openTvWindow(f.host, async () => null), { how: "failed" }); assert.ok(f.popup.closed);
  const g = fake(true, true);
  assert.deepEqual(await openTvWindow(g.host, async () => { throw new Error("offline"); }), { how: "failed" }); assert.ok(g.popup.closed);
  assert.equal(f.calls.length, 1);
});
