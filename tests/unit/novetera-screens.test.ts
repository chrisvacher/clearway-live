import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { pageTitle, phoneTheme, screensFor } from "../../lib/brand/screens";

test("Clearway's room-facing names are what they were", () => {
  const s = screensFor("clearway");
  assert.equal(s.siteName, "Clearway Live"); assert.equal(s.titleTemplate, "%s | Clearway Live"); assert.equal(s.homeLabel, "Clearway Live home");
  assert.equal(pageTitle("clearway"), "Clearway Live"); assert.equal(pageTitle("clearway", "TV"), "TV | Clearway Live");
});
test("Novetera's names carry no Clearway and no dashes", () => {
  const s = screensFor("novetera");
  assert.equal(pageTitle("novetera", "TV"), "TV | Novetera");
  assert.deepEqual(Object.values(s.markLabel), ["Novetera, live", "Novetera, phones down", "Novetera, nothing live", "Novetera"]);
  for (const text of [s.siteName, s.titleTemplate, s.description, s.homeLabel, s.closed, ...Object.values(s.markLabel)]) { assert.ok(!/clearway/i.test(text), text); assert.ok(!/[–—]/.test(text), text); }
});
test("Novetera phones draw on Chalk and Clearway phones stay dark (one constant)", () => {
  assert.deepEqual(phoneTheme, { clearway: "dark", novetera: "light" });
});
test("The skin's screen rules are all scoped to the Novetera skin", () => {
  const css = readFileSync("components/brand/novetera-screens.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const rule of css.split("}").map(r => r.split("{")[0].trim().replace(/:is\([^)]*\)/g, ":is()")).filter(Boolean)) assert.ok(rule.split(",").every(sel => sel.trim().startsWith('[data-skin="novetera"]')), rule);
});
