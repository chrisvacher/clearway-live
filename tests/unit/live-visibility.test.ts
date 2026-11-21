import test from "node:test";
import assert from "node:assert/strict";
import { visibilityInput } from "../../lib/run-of-show/visibility-input";
const session = "12345678-1234-4234-8234-123456789012";
test("visibility accepts exactly the isolated setting, independent of step state", () => {
  assert.deepEqual(visibilityInput({ session, visibility: "private" }), { session, visibility: "private" });
  assert.deepEqual(visibilityInput({ session, visibility: "public" }), { session, visibility: "public" });
  for (const extra of ["title", "options", "state", "revision", "engagement_id"]) assert.throws(() => visibilityInput({ session, visibility: "private", [extra]: "changed" }));
  for (const input of [null, [], {session}, {session, visibility:"everyone"}, {session:"invalid", visibility:"public"}]) assert.throws(() => visibilityInput(input));
});
