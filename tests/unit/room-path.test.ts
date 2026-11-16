import { test } from "node:test";
import assert from "node:assert/strict";
import { roomPath, shortRoomLink } from "../../lib/tv/policy";

const env = { NEXT_PUBLIC_APP_URL: "https://live.clearway.co", NEXT_PUBLIC_NOVETERA_URL: "https://live.novetera.co" };
test("a chosen link name takes the code's place in the room link", () => {
  assert.equal(roomPath("2654dee1", "ppc"), "ppc");
  assert.equal(roomPath("2654dee1", null), "2654DEE1");
  assert.equal(roomPath("2654dee1", "Not A Name"), "2654DEE1");
  assert.match(shortRoomLink("2654DEE1", "novetera", env, "ppc"), /\/ppc$/);
  assert.match(shortRoomLink("2654DEE1", "novetera", env), /\/2654DEE1$/);
});
