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
