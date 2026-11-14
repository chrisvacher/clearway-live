import assert from "node:assert/strict";
import { test } from "node:test";
import { brandFor, roomOrigin, skinForHost, skinOf, skins } from "../../lib/brand";
import { shortRoomLink } from "../../lib/tv/policy";
import { roomQr } from "../../lib/tv/qr";
import { inviteText } from "../../lib/setup/overview";
import { invitationMessages } from "../../lib/setup/invitation";
import { setupInput } from "../../lib/setup/policy";

test("a skin is clearway or novetera, and anything unknown is clearway", () => {
  assert.deepEqual([...skins], ["clearway", "novetera"]);
  assert.equal(skinOf("novetera"), "novetera"); assert.equal(skinOf("clearway"), "clearway");
  for (const value of [undefined, null, "", "Novetera", "other", 5, {}, ["novetera"]]) assert.equal(skinOf(value), "clearway");
});

test("each skin has one brand with its own name, address and picker label", () => {
  assert.deepEqual(brandFor("clearway", {}), { skin: "clearway", name: "Clearway Live", firmName: "Clearway", origin: "https://live.clearway.co", host: "live.clearway.co", label: "Clearway" });
  assert.deepEqual(brandFor("novetera", {}), { skin: "novetera", name: "Novetera", firmName: "Novetera", origin: "https://live.novetera.co", host: "live.novetera.co", label: "Novetera" });
  assert.equal(roomOrigin("clearway", {}), "https://live.clearway.co"); assert.equal(roomOrigin("novetera", {}), "https://live.novetera.co");
  assert.equal(brandFor("other" as never, {}).skin, "clearway");
});

test("origins come from APP_ORIGIN and NOVETERA_ORIGIN, https or local http only", () => {
  const env = { APP_ORIGIN: "https://staging.clearway.example", NOVETERA_ORIGIN: "https://staging.novetera.example" };
  assert.equal(roomOrigin("clearway", env), "https://staging.clearway.example"); assert.equal(roomOrigin("novetera", env), "https://staging.novetera.example");
  assert.equal(brandFor("novetera", env).host, "staging.novetera.example");
  const local = { APP_ORIGIN: "http://localhost:3000", NOVETERA_ORIGIN: "http://127.0.0.1:3000" };
  assert.equal(roomOrigin("clearway", local), "http://localhost:3000"); assert.equal(roomOrigin("novetera", local), "http://127.0.0.1:3000");
  assert.equal(brandFor("novetera", local).host, "127.0.0.1:3000");
  // The client holds no env, so a client component gets the defaults. Each skin ignores the other's variable.
  assert.equal(roomOrigin("novetera", { APP_ORIGIN: "https://staging.clearway.example" }), "https://live.novetera.co");
  assert.equal(roomOrigin("clearway", { NOVETERA_ORIGIN: "https://staging.novetera.example" }), "https://live.clearway.co");
});

test("an invalid origin is rejected and the default address is used", () => {
  for (const bad of ["http://live.novetera.co", "http://evil.example", "https://live.novetera.co/path", "https://live.novetera.co/", "https://user:pass@live.novetera.co", "https://live.novetera.co?x=1", "ftp://live.novetera.co", "javascript:alert(1)", "live.novetera.co", "not a url", ""]) {
    assert.equal(roomOrigin("novetera", { NOVETERA_ORIGIN: bad }), "https://live.novetera.co", `novetera rejects ${bad}`);
    assert.equal(roomOrigin("clearway", { APP_ORIGIN: bad }), "https://live.clearway.co", `clearway rejects ${bad}`);
  }
});

test("an address belongs to one skin, or to neither", () => {
  assert.equal(skinForHost("live.clearway.co", {}), "clearway"); assert.equal(skinForHost("live.novetera.co", {}), "novetera");
  assert.equal(skinForHost(" LIVE.NOVETERA.CO ", {}), "novetera");
  for (const other of ["clearway.co", "novetera.co", "live.novetera.co.evil.example", "evil.example", "live.novetera.co:8080", "", "  ", null, undefined]) assert.equal(skinForHost(other, {}), null, String(other));
  const local = { APP_ORIGIN: "http://localhost:3000", NOVETERA_ORIGIN: "http://127.0.0.1:3000" };
  assert.equal(skinForHost("localhost:3000", local), "clearway"); assert.equal(skinForHost("127.0.0.1:3000", local), "novetera");
  assert.equal(skinForHost("live.clearway.co", local), null, "a configured origin replaces the default address");
  assert.equal(skinForHost("localhost:3001", local), null);
  assert.equal(skinForHost("live.novetera.co", { APP_ORIGIN: "https://live.novetera.co" }), "clearway", "Clearway wins a shared host");
});

test("the room link follows the skin", () => {
  assert.equal(shortRoomLink("a1b2c3d4"), "https://live.clearway.co/A1B2C3D4");
  assert.equal(shortRoomLink("a1b2c3d4", "clearway", {}), "https://live.clearway.co/A1B2C3D4");
  assert.equal(shortRoomLink("a1b2c3d4", "novetera", {}), "https://live.novetera.co/A1B2C3D4");
  assert.equal(shortRoomLink("a1b2c3d4", "novetera", { NOVETERA_ORIGIN: "http://127.0.0.1:3000" }), "http://127.0.0.1:3000/A1B2C3D4");
  for (const skin of skins) for (const code of ["https://evil.example", "../abc", "123", "ZZZZZZZZ"]) assert.throws(() => shortRoomLink(code, skin));
});

test("the QR code carries the skin's address", () => {
  const clearway = roomQr("A1B2C3D4"), novetera = roomQr("A1B2C3D4", "novetera");
  assert.deepEqual(roomQr("A1B2C3D4", "clearway"), clearway); assert.notDeepEqual(novetera, clearway);
  assert.deepEqual(roomQr("A1B2C3D4", "novetera"), novetera);
  assert.ok(novetera.size >= 29 && novetera.path.startsWith("M4 4"));
});

test("the invite text names the skin's address", () => {
  const args = ["Riverside", "Staff AI workshop", "Fri, Nov 20", "https://live.novetera.co/riverside", "A1B2C3D4"] as const;
  assert.equal(inviteText(args[0], args[1], args[2], "https://live.clearway.co/riverside", args[4]), "Riverside: Staff AI workshop, Fri, Nov 20.\nJoin on your phone at https://live.clearway.co/riverside\nOr go to live.clearway.co and enter the room code A1B2C3D4.");
  assert.equal(inviteText(...args, brandFor("novetera", {}).host), "Riverside: Staff AI workshop, Fri, Nov 20.\nJoin on your phone at https://live.novetera.co/riverside\nOr go to live.novetera.co and enter the room code A1B2C3D4.");
});

test("emailed invites link to the skin's address", () => {
  const snapshot = { title: "Staff AI workshop", church: "Riverside", timezone: "America/Toronto", pre_call_at: null, retreat_start_date: "2026-11-20", retreat_end_date: null, consensus: "By consensus.", people: [{ id: "p1", name: "Ann", email: "ann@example.org" }] };
  for (const skin of skins) {
    const origin = roomOrigin(skin, {}), [message] = invitationMessages("room-id", snapshot, origin, [], true);
    assert.ok(message.text.includes(`${origin}/room/room-id?email=ann%40example.org`), `${skin} room link`);
    assert.ok(message.text.includes(`${origin}/how-we-use-ai`), `${skin} page link`);
    for (const other of skins.filter(s => s !== skin)) assert.ok(!message.text.includes(roomOrigin(other, {})), `${skin} invite names no ${other} address`);
  }
});

test("the Details save carries a skin only when one was sent, and only a brand", () => {
  const body = (skin?: unknown) => ({ church: { name: "Riverside", timezone: "America/Toronto" }, engagement: { title: "Staff AI workshop", type: "team_workshop", status: "setup", base_year: "", lens_names: ["a", "b", "c", "d", "e"], how_the_room_decides: "By consensus.", settings: {}, ...(skin === undefined ? {} : { skin }) } });
  assert.equal("skin" in setupInput(body()).engagement, false);
  assert.equal((setupInput(body("novetera")).engagement as { skin?: string }).skin, "novetera");
  assert.equal((setupInput(body("clearway")).engagement as { skin?: string }).skin, "clearway");
  for (const bad of ["other", "Novetera", "", 5, null]) assert.throws(() => setupInput(body(bad)), /Choose a brand/);
});
