import assert from "node:assert/strict";
import test from "node:test";
import { errorRoute, eventFromError, safeEvent } from "../../lib/operations/telemetry";

test("telemetry strips identities, bearer links, messages, foreign stacks and query strings", () => {
  const error = Object.assign(new TypeError("Private answer by Jane jane@example.org code=SECRET"), {
    stack: "TypeError: Private answer\n at https://live.clearway.co/_next/static/chunks/1234-abcd.js:10:22\n at https://evil.test/secret.js:1:2\n at https://live.clearway.co/_next/static/chunks/user.js?token=SECRET:1:2",
    digest: "12345",
  });
  const event = eventFromError(error, "error", "/room/secret-id/confirm?token=TOPSECRET#other", "https://live.clearway.co");
  assert.deepEqual(event, { kind: "error", name: "TypeError", route: "/room/:id/confirm", frames: ["/_next/static/chunks/1234-abcd.js:10:22"], digest: "12345" });
  assert.doesNotMatch(JSON.stringify(event), /Jane|jane|SECRET|evil|secret-id|answer/);
  assert.equal(errorRoute("/v/private-bearer"), "/v/:id");
  assert.equal(errorRoute("/c/private-bearer"), "/c/:id");
  assert.equal(errorRoute("/setup/90000000-0000-4000-8000-000000000011/door"), "/setup/:id/door");
});
test("server-side telemetry validation drops unknown fields and unsafe frames", () => {
  const event = safeEvent({ kind: "rejection", name: "Jane Secret", route: "/control/secret/recap", message: "sensitive", user: "private", frames: [
    "/_next/static/../../secrets.js:1:2", "/_next/static/chunks/a.js:1:2?token=secret",
    "/_next/static/chunks/a.js:1:2", "http://example.org/x.js:1:2",
  ], digest: "Bearer private" });
  assert.deepEqual(event, { kind: "rejection", name: "Error", route: "/control/:id/recap", frames: ["/_next/static/chunks/a.js:1:2"] });
  assert.equal(safeEvent({ kind: "hacked", route: "/" }), null);
  assert.equal(safeEvent({ kind: "error", route: "x".repeat(501) }), null);
});
test("unknown thrown values do not disclose their content", () => {
  assert.deepEqual(eventFromError("private text", "rejection", "/", "https://live.clearway.co"), { kind: "rejection", name: "Error", route: "/", frames: [] });
});

test("browser reporting omits cookies and referrers and fails without disrupting its caller", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalFetch = globalThis.fetch;
  let sent: RequestInit | undefined;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/v/private-token", origin: "https://live.clearway.co" } } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { querySelector: () => null } });
  try {
    globalThis.fetch = async (_url, options) => { sent = options; return new Response(null, { status: 202 }); };
    const { reportClientError } = await import("../../lib/operations/client");
    assert.equal(await reportClientError(new Error("SECRET answer"), "test"), true);
    assert.equal(sent?.credentials, "omit");
    assert.equal(sent?.referrerPolicy, "no-referrer");
    assert.doesNotMatch(String(sent?.body), /SECRET|private-token/);
    globalThis.fetch = async () => { throw new Error("Offline"); };
    assert.equal(await reportClientError(new Error("private"), "test"), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else Reflect.deleteProperty(globalThis, "document");
  }
});
