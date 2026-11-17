import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanLinkName, linkNameProblem, suggestLinkName } from "../../lib/setup/link-name";

test("a room link is checked the way the database checks it", () => {
  assert.equal(cleanLinkName(" PPC-2026 "), "ppc2026");
  assert.deepEqual(linkNameProblem("ppc"), { name: "ppc", problem: null });
  assert.deepEqual(linkNameProblem("Hope Oakville"), { name: "hopeoakville", problem: null });
  assert.ok(linkNameProblem("pc").problem, "Too short");
  assert.ok(linkNameProblem("x".repeat(25)).problem, "Too long");
  assert.ok(linkNameProblem("fb531b3d").problem, "Shaped like a generated room code");
  assert.ok(linkNameProblem("practice").problem, "A word the app uses");
  assert.ok(linkNameProblem("Setup").problem, "Reserved words ignore case");
});

test("the suggestion is the short name or the initials", () => {
  assert.equal(suggestLinkName("Sanctus Church"), "sanctuschurch");
  assert.equal(suggestLinkName("Pickering Pentecostal Church"), "ppc");
  assert.equal(suggestLinkName("Hope Oakville"), "hopeoakville");
  assert.equal(suggestLinkName("Ab"), "");
  for (const name of ["Sanctus Church", "Pickering Pentecostal Church", "Riverside Community Church of the Valley"]) {
    const suggested = suggestLinkName(name);
    if (suggested) assert.equal(linkNameProblem(suggested).problem, null, name);
  }
});
