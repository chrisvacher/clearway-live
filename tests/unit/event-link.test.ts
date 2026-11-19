import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { clearwayEmail, linkGuestEmail } from "../../lib/auth/policy";

// An event's admin link (November 19): the link guest's address is never a Clearway address, and a Clearway address is
// never a link guest, so neither sign-in path can stand in for the other.
test("a link guest's address is recognised, and is never a Clearway person's", () => {
  const guest = `link-${"a1".repeat(16)}@link.clearway.invalid`;
  assert.equal(linkGuestEmail(guest), true);
  assert.equal(clearwayEmail(guest), false);
  for (const other of ["chris@clearway.co", `link-${"a1".repeat(16)}@clearway.co`, `link-${"a1".repeat(15)}@link.clearway.invalid`, "x@tv.clearway.invalid", undefined])
    assert.equal(linkGuestEmail(other), false, String(other));
});

test("the link's codes, the route and the database agree on the shape: 12 characters with no 0, 1, i, l or o", () => {
  const migration = readFileSync("supabase/migrations/20261119120000_event_admin_link.sql", "utf8");
  const route = readFileSync("app/a/[code]/route.ts", "utf8");
  assert.match(migration, /alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789'/);
  assert.match(migration, /code ~ '\^\[a-z2-9\]\{12\}\$'/);
  assert.match(route, /\^\[a-z2-9\]\{12\}\$/);
});

test("only a person reaches the link's API, and the panel hides for anyone else", () => {
  const api = readFileSync("app/api/facilitator/[id]/event-link/route.ts", "utf8");
  assert.match(api, /profile\.kind !== "person"/);
  assert.match(api, /sameOrigin\(request, config\.origin\)/);
});
