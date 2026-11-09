import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";

const base = postcss.parse(readFileSync("design/clearway-base/colors_and_type.css", "utf8"));
const live = postcss.parse(readFileSync("design/clearway-live/live_tokens.css", "utf8"));
function tokens(theme: "light" | "dark") {
  const values = new Map<string, string>();
  for (const css of [base, live]) css.walkRules(rule => {
    if (rule.parent?.type === "root" && (rule.selector === ":root" ||
        (theme === "light" && rule.selector === '[data-theme="light"]'))) {
      rule.walkDecls(decl => { if (decl.prop.startsWith("--")) values.set(decl.prop, decl.value); });
    }
  });
  return values;
}
function rgb(name: string, values: Map<string, string>, seen = new Set<string>()): number[] {
  assert.ok(!seen.has(name), `Circular token ${name}`);
  seen.add(name);
  const value = values.get(name);
  assert.ok(value, `Missing token ${name}`);
  const variable = /^var\((--[\w-]+)/.exec(value);
  if (variable) return rgb(variable[1], values, seen);
  assert.match(value, /^#[\da-f]{6}$/i, `Unsupported color ${name}: ${value}`);
  return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255);
}
function luminance(rgb: number[]) {
  const linear = rgb.map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}
for (const theme of ["light", "dark"] as const) {
  test(`${theme} screen text and button labels pass WCAG AA`, () => {
    const values = tokens(theme);
    for (const [text, surface] of [
      ["--cwl-text", "--cwl-surface"],
      ["--cwl-text-muted", "--cwl-surface"],
      ["--cwl-text-on-card", "--cwl-surface-card"],
      ["--cwl-on-accent", "--cwl-button-primary"],
      ["--cwl-on-callout", "--cwl-callout"],
      ["--fg-muted", "--cwl-surface-card"],
    ]) {
      const a = luminance(rgb(text, values));
      const b = luminance(rgb(surface, values));
      const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      assert.ok(ratio >= 4.5, `${text} on ${surface}: ${ratio.toFixed(2)}:1`);
    }
  });
}

// The AI lens-summary and read-back lines sit on a light card on the phone. `.surface p` paints paragraphs in the
// muted Sky token, so the card's own paragraphs must set the on-card token with at least that rule's weight (a
// class and an element), or the lines read Sky on Off-White at 1.7:1.
test("phone summary lines on the light card use the on-card text token", () => {
  const css = postcss.parse(readFileSync("components/interactions/lens-summary/lens-summary.css", "utf8"));
  let found = "";
  css.walkRules(rule => { if (/\.lsm-ph-lines p$/.test(rule.selector) && /^\.[\w-]+ \.lsm-ph-lines p$/.test(rule.selector)) rule.walkDecls("color", d => { found = d.value; }); });
  assert.equal(found, "var(--cwl-text-on-card)");
  const rb = postcss.parse(readFileSync("components/interactions/read-back/read-back.css", "utf8"));
  let rbColor = "";
  rb.walkRules(rule => { if (rule.selector === ".rbk-ph-line p") rule.walkDecls("color", d => { rbColor = d.value; }); });
  assert.equal(rbColor, "var(--cwl-text-on-card)", "read-back lines too");
  const values = tokens("dark"), a = luminance(rgb("--cwl-text-on-card", values)), b = luminance(rgb("--cwl-surface-card", values));
  assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5);
});
