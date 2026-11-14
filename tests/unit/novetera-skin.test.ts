import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";
import nextConfig from "../../next.config";

const live = postcss.parse(readFileSync("design/clearway-live/live_tokens.css", "utf8"));
const skinSource = readFileSync("design/novetera-live/novetera_tokens.css", "utf8");
const skin = postcss.parse(skinSource);
const SKIN = '[data-skin="novetera"][data-skin="novetera"][data-skin="novetera"]';
const roles = (css: postcss.Root) => { const set = new Set<string>(); css.walkDecls(d => { if (d.prop.startsWith("--cwl-")) set.add(d.prop); }); return set; };
const liveRoles = roles(live), skinRoles = roles(skin);

// Roles the skin deliberately leaves at Clearway's value: the type ramp (the TV binds it per room size, so it must not be declared
// again here), room size, spacing, check sizes, motion durations and easing, and the lockup heights. A role that is neither set in
// novetera_tokens.css nor listed here fails the test, so a role added to live_tokens.css later cannot fall back to Clearway unnoticed.
const UNCHANGED = `room-scale fit-scale tv-scale fs-tv-display fs-tv-headline-xl fs-tv-headline fs-tv-main fs-tv-body fs-tv-floor fs-tv-eyebrow fs-tv-upclose fs-phone-headline fs-phone-prompt fs-phone-input fs-phone-body fs-phone-button fs-phone-label fs-phone-micro room-very-small room-small room-medium room-large room-very-large tv-safe-x tv-safe-y tv-gutter tv-gap tv-card-pad tv-moment-gap private-mark-max private-mark-min phone-gutter phone-stack phone-touch phone-touch-lg shadow-tv dur-arrive dur-make-room dur-mark-fill dur-swell dur-new-hold dur-settle-color dur-bar-grow dur-bar-trade dur-cut-line dur-regroup dur-label-grow dur-count dur-phones-dim dur-spotlight-on dur-spotlight-off dur-hide dur-reduced dur-panel ease-signature ease-arrive ease-calm ease-exit delay-stagger delay-stagger-min delay-max-hold delay-regroup-step delay-label-after-drift delay-make-room-after-hide delay-swell-color spotlight-recede arrive-from dur-turn-hold dur-roll-row dur-reconnect-pulse delay-quiet reconnect-low faint tc-line tc-offset flag-width flag-gap held-dim dur-cluster-drift dur-cluster-label dur-line-replace dur-field-lock dur-remote-hand dur-map-field dur-source-light dur-tc-strike dur-signal-in delay-type-batch delay-map-step delay-tc-leave private-marks-max qa-top motion fac-band-h app-sidebar-w app-header-h app-panel-w app-gutter app-gap fs-app-page-title fs-app-section-title fs-app-body fs-app-table fs-app-label fs-app-micro check-display check-headline-xl check-headline check-main check-body check-floor wordmark-h-app wordmark-h-remote wordmark-h-phone wordmark-h-tv wordmark-h-print wordmark-h-page`.split(" ").map(r => `--cwl-${r}`);

test("the Novetera file sets every --cwl- role live_tokens.css defines, or names it as deliberately unchanged", () => {
  const missing = [...liveRoles].filter(r => !skinRoles.has(r) && !UNCHANGED.includes(r));
  assert.deepEqual(missing, [], `roles with no Novetera value: ${missing.join(", ")}`);
  assert.deepEqual(UNCHANGED.filter(r => !liveRoles.has(r)), [], "the unchanged list names a role live_tokens.css no longer defines");
  assert.deepEqual(UNCHANGED.filter(r => skinRoles.has(r)), [], "a role is both set and listed as unchanged");
  assert.equal(new Set(UNCHANGED).size, UNCHANGED.length);
});

test("an unchanged role never points at a role the skin overrides (a derived role resolves where it is declared)", () => {
  const stale: string[] = [];
  live.walkDecls(d => {
    if (!UNCHANGED.includes(d.prop)) return;
    for (const m of d.value.matchAll(/var\((--cwl-[\w-]+)/g)) if (skinRoles.has(m[1])) stale.push(`${d.prop} reads ${m[1]}`);
  });
  assert.deepEqual(stale, [], "declare these roles again in novetera_tokens.css");
});

test("every Novetera selector starts at [data-skin=\"novetera\"], so nothing outside such an element can change", () => {
  let rules = 0;
  skin.walkRules(rule => {
    rules++;
    for (const sel of rule.selectors) assert.ok(sel.trim().startsWith(SKIN), `selector can match outside the skin: ${sel}`);
  });
  assert.ok(rules >= 8);
  skin.walkAtRules(rule => assert.fail(`unexpected at-rule @${rule.name}: nothing here may sit outside a skin selector`));
  assert.ok(!/(^|[\s,{}])(:root|html|body|\*)\b/.test(skinSource.replace(/\/\*[\s\S]*?\*\//g, "")), "no root-level selector");
});

test("the skin outranks the Clearway nesting guards and is imported after live_tokens.css", () => {
  // live_tokens.css's most specific role-setting selector is 0,3,0 (the dark-region guard); the skin's plain selector is three attributes (0,3,0, later in the cascade)
  // and its light, dark-region and app-surface selectors are four.
  assert.equal(SKIN.match(/\[data-skin="novetera"\]/g)?.length, 3);
  const globals = readFileSync("app/globals.css", "utf8");
  assert.ok(globals.indexOf("novetera_tokens.css") > globals.indexOf("live_tokens.css") && globals.indexOf("live_tokens.css") > 0);
  assert.ok(globals.indexOf("novetera_fonts.css") > globals.indexOf("live_tokens.css"));
});

// A skin element is dark by default; a light region inside it, or the element itself on the light theme, takes the light values; a dark
// region inside a light element takes the dark values back. The three blocks must carry the same roles with the right values.
function block(selector: string) { const out = new Map<string, string>(); skin.walkRules(r => { if (r.selector === selector) r.walkDecls(d => { if (d.prop.startsWith("--")) out.set(d.prop, d.value); }); }); return out; }
test("the light and dark blocks cover every role Clearway's light theme and the skin's two themes differ on", () => {
  const light = block(`${SKIN}[data-theme="light"],\n${SKIN} [data-theme="light"]`), dark = block(`${SKIN} [data-theme="dark"]`);
  assert.ok(light.size > 30);
  assert.deepEqual([...light.keys()].sort(), [...dark.keys()].sort(), "the light and dark region blocks set the same roles");
  const root = new Map<string, string>(); skin.walkRules(r => { if (r.selector === SKIN) r.walkDecls(d => { root.set(d.prop, d.value); }); });
  for (const [prop, value] of dark) assert.equal(root.get(prop), value, `${prop}: a dark region inside a light element must match the dark default`);
  const clearwayLight = new Set<string>(); live.walkRules(r => { if (r.selector === '[data-theme="light"]') r.walkDecls(d => { clearwayLight.add(d.prop); }); });
  for (const prop of clearwayLight) assert.ok(light.has(prop), `${prop} is set by Clearway's [data-theme="light"] block, so a light region inside the skin must set it too`);
});

test("the AI icon draws flat: both gradient ends and the glint are one ink on each theme", () => {
  const light = block(`${SKIN}[data-theme="light"],\n${SKIN} [data-theme="light"]`), dark = block(`${SKIN} [data-theme="dark"]`);
  for (const theme of [light, dark]) assert.ok(theme.get("--cwl-ai-start") === theme.get("--cwl-ai-end") && theme.get("--cwl-ai-start") === theme.get("--cwl-ai-glint"));
  assert.equal(block(SKIN).get("--cwl-ai"), "var(--nvl-stone-150)", "the AI summary band is flat");
});

test("texture and glow are off, radii are 2px and 4px, type is Public Sans with a serif for quotes", () => {
  const all = block(SKIN);
  assert.equal(all.get("--cwl-texture-ink"), "transparent");
  for (const r of ["solid", "outline", "strip"]) assert.equal(all.get(`--cwl-tex-${r}`), "0");
  assert.equal(all.get("--cwl-glow"), "none");
  assert.equal(all.get("--cwl-radius-button"), "2px"); assert.equal(all.get("--cwl-radius-card"), "4px"); assert.equal(all.get("--cwl-radius-tv-card"), "4px");
  assert.equal(all.get("--cwl-shadow-phone"), "0 1px 2px rgba(31, 35, 40, 0.06)");
  assert.match(all.get("--cwl-font")!, /^'Public Sans', /); assert.match(all.get("--font-sans")!, /^'Public Sans', /);
  assert.match(all.get("--cwl-font-editorial")!, /^'Source Serif 4', Georgia, serif$/);
  assert.ok(all.has("--cwl-surface-holding"));
});

test("raw hex lives in the token file only, and the Novetera components carry no colour of their own", () => {
  for (const file of ["components/brand/novetera-mark.tsx", "components/brand/novetera-lockup.tsx", "components/brand/novetera-brand.css"]) {
    const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(text), `${file} has a raw colour`);
  }
});

test("the mark and lockup take an accessible label, default Novetera, and the mark has a live and an offline state", () => {
  const mark = readFileSync("components/brand/novetera-mark.tsx", "utf8"), lockup = readFileSync("components/brand/novetera-lockup.tsx", "utf8");
  for (const src of [mark, lockup]) { assert.match(src, /label = "Novetera"/); assert.match(src, /role: "img", "aria-label": label/); assert.match(src, /"aria-hidden": true/); }
  assert.match(mark, /live = false, offline = false/);
  const css = readFileSync("components/brand/novetera-brand.css", "utf8");
  assert.match(css, /\.nvt-mark\.is-live \.b \{ fill: var\(--cwl-mark-live/);
  assert.match(css, /\.nvt-mark\.is-offline \.a, \.nvt-mark\.is-offline \.b \{ fill: var\(--cwl-offline\)/);
  assert.match(css, /animation: cwl-reconnect-breath var\(--cwl-dur-reconnect-pulse\)/, "the breath uses the existing motion tokens");
  assert.match(css, /prefers-reduced-motion: reduce/);
});

const woff2 = ["public-sans-latin-{w}-normal", "public-sans-latin-ext-{w}-normal"].flatMap(n => [400, 500, 600, 700, 800].map(w => n.replace("{w}", String(w)))).concat(["source-serif-4-latin-400-italic", "source-serif-4-latin-ext-400-italic"]);
test("the self-hosted font files and their licences exist", () => {
  for (const name of woff2) { const file = `public/fonts/novetera/${name}.woff2`; assert.ok(existsSync(file) && statSync(file).size > 5000, file); assert.equal(readFileSync(file).subarray(0, 4).toString("latin1"), "wOF2", `${file} is a woff2 file`); }
  for (const dir of ["public/fonts/novetera", "lib/export/assets/fonts/novetera"]) for (const licence of ["PublicSans-OFL.txt", "SourceSerif4-OFL.txt"]) {
    assert.ok(existsSync(`${dir}/${licence}`), `${dir}/${licence}`);
    assert.match(readFileSync(`${dir}/${licence}`, "utf8"), /SIL OPEN FONT LICENSE Version 1\.1/);
  }
  for (const ttf of ["PublicSans-Regular", "PublicSans-Bold", "SourceSerif4-It"]) {
    const file = `lib/export/assets/fonts/novetera/${ttf}.ttf`; assert.ok(existsSync(file) && statSync(file).size > 50000, file);
    assert.deepEqual([...readFileSync(file).subarray(0, 4)], [0, 1, 0, 0], `${file} is a TrueType file`);
  }
});

test("every @font-face names a file that exists, swaps, and only the Novetera skin names the families", () => {
  const fonts = readFileSync("design/novetera-live/novetera_fonts.css", "utf8");
  const faces = [...fonts.matchAll(/@font-face \{[^}]*\}/g)].map(m => m[0]);
  assert.equal(faces.length, woff2.length);
  for (const face of faces) { assert.match(face, /font-display: swap/); const url = /url\('([^']+)'\)/.exec(face)![1]; assert.ok(existsSync(`public${url}`), url); assert.match(face, /unicode-range/); }
  for (const w of [400, 500, 600, 700, 800]) assert.ok(fonts.includes(`font-weight: ${w}; font-display`), `Public Sans ${w}`);
  assert.ok(fonts.includes("font-family: 'Source Serif 4'; font-style: italic"));
  for (const file of ["design/clearway-live/live_tokens.css", "design/clearway-base/colors_and_type.css"]) assert.ok(!/Public Sans|Source Serif/.test(readFileSync(file, "utf8")), `${file} must not name the Novetera fonts`);
});

test("next.config.ts traces the Novetera TrueType fonts into the summary and export functions", () => {
  const includes = nextConfig.outputFileTracingIncludes as Record<string, string[]>;
  for (const route of ["/api/control/*/summary", "/api/control/*/export"]) assert.ok(includes[route]?.includes("./lib/export/assets/fonts/novetera/**"), route);
  assert.ok(existsSync("app/api/control/[id]/summary/route.ts") && existsSync("app/api/control/[id]/export/route.ts"));
  assert.ok(includes["/api/control/*/report/export"], "the report export tracing is still there");
});
