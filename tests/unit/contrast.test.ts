import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";

const base = postcss.parse(readFileSync("design/clearway-base/colors_and_type.css", "utf8"));
const live = postcss.parse(readFileSync("design/clearway-live/live_tokens.css", "utf8"));
const novetera = postcss.parse(readFileSync("design/novetera-live/novetera_tokens.css", "utf8"));
// The skin's selectors all start with this compound (see the header of novetera_tokens.css). The skin element itself is what these
// tests resolve: its plain rules always apply, its [data-theme="light"] rules apply on the light theme.
const SKIN = '[data-skin="novetera"][data-skin="novetera"][data-skin="novetera"]';
type Skin = "clearway" | "novetera";
function tokens(theme: "light" | "dark", skin: Skin = "clearway") {
  const values = new Map<string, string>();
  for (const css of [base, live]) css.walkRules(rule => {
    if (rule.parent?.type === "root" && (rule.selector === ":root" ||
        (theme === "light" && rule.selector === '[data-theme="light"]'))) {
      rule.walkDecls(decl => { if (decl.prop.startsWith("--")) values.set(decl.prop, decl.value); });
    }
  });
  if (skin === "novetera") novetera.walkRules(rule => {
    if (rule.parent?.type !== "root") return;
    if (rule.selectors.some(sel => sel === SKIN || (theme === "light" && sel === `${SKIN}[data-theme="light"]`)))
      rule.walkDecls(decl => { if (decl.prop.startsWith("--")) values.set(decl.prop, decl.value); });
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
function contrast(a: string, b: string, values: Map<string, string>) {
  const x = luminance(rgb(a, values)), y = luminance(rgb(b, values));
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
const hex = (name: string, values: Map<string, string>) => "#" + rgb(name, values).map(c => Math.round(c * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
// Every text pairing, for each skin and each theme. Clearway runs as it always has; Novetera resolves its overrides on top.
// "Base muted text" (--fg-muted on the card) is Slate 600 for Novetera, per the spec (Slate 400 is 4.36:1 on Chalk).
for (const skin of ["clearway", "novetera"] as const) for (const theme of ["light", "dark"] as const) {
  test(`${skin} ${theme} screen text and button labels pass WCAG AA`, () => {
    const values = tokens(theme, skin);
    for (const [text, surface] of [
      ["--cwl-text", "--cwl-surface"],
      ["--cwl-text-muted", "--cwl-surface"],
      ["--cwl-text-on-card", "--cwl-surface-card"],
      ["--cwl-on-accent", "--cwl-button-primary"],
      ["--cwl-on-callout", "--cwl-callout"],
      ["--fg-muted", "--cwl-surface-card"],
    ]) {
      const ratio = contrast(text, surface, values);
      assert.ok(ratio >= 4.5, `${skin} ${theme} ${text} on ${surface}: ${ratio.toFixed(2)}:1`);
    }
    if (skin === "novetera") assert.equal(hex("--fg-muted", values), "#454B54", "base muted text is Slate 600");
  });
}

// The rest of the Novetera token map: the pairs the spec's contrast table lists, in both themes (text 4.5:1, shapes and edges 3:1).
for (const theme of ["light", "dark"] as const) {
  test(`novetera ${theme} remaining text pairs pass 4.5:1 and shapes pass 3:1`, () => {
    const values = tokens(theme, "novetera");
    for (const [text, surface] of [
      ["--cwl-on-live", "--cwl-live"], ["--cwl-text-on-panel", "--cwl-surface-panel"], ["--cwl-text-on-panel", "--cwl-surface-panel-small"],
      ["--cwl-on-ai", "--cwl-ai"], ["--cwl-on-flag", "--cwl-flag"], ["--cwl-on-lens", "--cwl-lens"], ["--cwl-on-lens", "--cwl-lens-small"],
      ["--cwl-bar-label", "--cwl-surface"], ["--cwl-word-single", "--cwl-surface"], ["--cwl-word-repeated", "--cwl-surface"], ["--cwl-presence", "--cwl-surface"],
    ]) {
      const ratio = contrast(text, surface, values);
      assert.ok(ratio >= 4.5, `${theme} ${text} on ${surface}: ${ratio.toFixed(2)}:1`);
    }
    for (const [shape, surface] of [
      ["--cwl-bar", "--cwl-bar-track"], ["--cwl-live", "--cwl-surface"], ["--cwl-callout", "--cwl-surface"], ["--cwl-bar-leader", "--cwl-surface"],
      ["--cwl-focus-ring", "--cwl-surface"], ["--cwl-border-strong", "--cwl-surface"], ["--cwl-offline", "--cwl-surface"],
      ["--cwl-mark-stroke", "--cwl-surface"], ["--cwl-mark-quiet", "--cwl-surface"], ["--cwl-mark-live", "--cwl-surface"],
    ]) {
      const ratio = contrast(shape, surface, values);
      assert.ok(ratio >= 3, `${theme} ${shape} against ${surface}: ${ratio.toFixed(2)}:1`);
    }
  });
  test(`novetera ${theme} group and item tints read with Charcoal text`, () => {
    const values = tokens(theme, "novetera");
    for (let i = 1; i <= 10; i++) {
      const group = contrast("--cwl-text-on-card", `--cwl-group-${i}`, values), item = contrast("--cwl-text-on-card", `--cwl-item-${i}`, values);
      assert.ok(group >= 9.5, `group ${i}: ${group.toFixed(2)}:1`);   // the spec: 9.7 to 10.2:1
      assert.ok(item >= 7.4, `item ${i}: ${item.toFixed(2)}:1`);      // the spec: 7.5 to 8.2:1
    }
  });
}

// The join screen has three grounds (Charcoal, Chalk, Oxblood 700) and Chris has not chosen. Each option's text, muted text, names
// and mark must read on its own ground whichever one is picked, and the code card (White with Charcoal ink) on all of them.
for (const option of ["charcoal", "chalk", "oxblood"]) {
  test(`novetera join option ${option}: text, muted text, names, mark and code read on the ground`, () => {
    const values = tokens("dark", "novetera"), at = (part: string) => `--nvl-join-${option}-${part}`;
    for (const part of ["text", "muted", "presence"]) assert.ok(contrast(at(part), at("ground"), values) >= 4.5, `${option} ${part}: ${contrast(at(part), at("ground"), values).toFixed(2)}:1`);
    assert.ok(contrast(at("mark"), at("ground"), values) >= 3, `${option} mark: ${contrast(at("mark"), at("ground"), values).toFixed(2)}:1`);
    assert.ok(contrast("--cwl-code-ink", "--cwl-code-ground", values) >= 4.5, "the room code reads");
    if (option === "chalk") assert.notEqual(values.get(at("edge")), "transparent", "the white code card carries an edge on Chalk");
  });
}
test("novetera join: the choice is one value and the holding roles follow it", () => {
  const values = tokens("dark", "novetera");
  assert.equal(values.get("--nvl-join"), "0", "Charcoal is the value now");
  for (const [role, part] of [["surface", "ground"], ["text", "text"], ["text-muted", "muted"], ["presence", "presence"], ["mark", "mark"], ["edge", "edge"]]) {
    const name = role === "surface" ? "--cwl-surface-holding" : `--cwl-${role}-holding`, value = values.get(name);
    assert.equal(value, `color-mix(in srgb, var(--nvl-join-oxblood-${part}) calc(var(--nvl-join-w-oxblood) * 100%), color-mix(in srgb, var(--nvl-join-chalk-${part}) calc(var(--nvl-join-w-chalk) * 100%), var(--nvl-join-charcoal-${part})))`, name);
  }
  assert.ok(contrast("--cwl-code-ink", "--cwl-code-ground", values) >= 4.5);
});

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
