import test from "node:test";
import assert from "node:assert/strict";
import { sendsWithEnter } from "../../lib/phone/keyboard";

test("laptop Enter sends typed answers only on a fine pointer", () => {
  assert.equal(sendsWithEnter("Enter", false, false, true, true, "wall"), true);
  assert.equal(sendsWithEnter("Enter", false, false, false, true, "wall"), false);
  assert.equal(sendsWithEnter("Enter", true, false, true, true, "wall"), false);
  assert.equal(sendsWithEnter("Enter", false, true, true, true, "wall"), false);
});
test("phone keeps open text newlines and the short-answer Enter shortcut", () => {
  assert.equal(sendsWithEnter("Enter", false, false, false, false, "wall"), false);
  assert.equal(sendsWithEnter("Enter", false, false, false, false, "word_cloud"), true);
});
