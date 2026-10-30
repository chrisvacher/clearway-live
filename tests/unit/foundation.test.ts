import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import postcss from "postcss";
import { cn } from "../../lib/utils";

const root = process.cwd();
const read = (name: string) => readFile(join(root, name), "utf8");
async function files(folder: string): Promise<string[]> {
  const entries = await readdir(join(root, folder), { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(join(folder, entry.name)) : [join(folder, entry.name)]))).flat();
}

test("CORE's resolved package versions stay pinned, including its lint toolchain", async () => {
  const pkg = JSON.parse(await read("package.json"));
  const baseline = JSON.parse(await read("docs/core-reference.json"));
  const lock = JSON.parse(await read("package-lock.json"));
  assert.equal(pkg.engines.node, "22.x");
  for (const group of ["dependencies", "devDependencies"]) {
    for (const [name, version] of Object.entries(baseline[group])) {
      assert.equal(pkg[group][name], version, name);
      assert.equal(lock.packages[`node_modules/${name}`].version, version, name);
    }
  }
});

test("base styles load first, Live styles second, with no competing stylesheet", async () => {
  const sheet = postcss.parse(await read("app/globals.css"));
  const imports: string[] = [];
  sheet.walkAtRules("import", rule => { imports.push(rule.params); });
  assert.deepEqual(imports, [
    '"../design/clearway-base/colors_and_type.css"',
    '"../design/clearway-live/live_tokens.css"',
  ]);
  assert.match(await read("app/layout.tsx"), /import "\.\/globals\.css"/);
  assert.doesNotMatch(await read("app/globals.css"), /--(?:cw|cwl)-[\w-]+\s*:/);
});

test("all stylesheet font assets exist and are actual TrueType files", async () => {
  const source = "design/clearway-base/colors_and_type.css";
  const css = await read(source);
  const assets = [...css.matchAll(/url\(['"]([^'"]+)['"]\)/g)];
  assert.ok(assets.length > 0);
  for (const [, path] of assets) {
    const file = resolve(root, dirname(source), path);
    const bytes = await readFile(file);
    assert.equal(bytes.readUInt32BE(0), 0x00010000, path);
  }
  await access(join(root, "design/clearway-base/fonts/OFL.txt"));
});

test("app components cannot introduce literal colors, inline styles or the design preview script", async () => {
  const paths = [...await files("app"), ...await files("components"), "tailwind.config.ts"];
  for (const path of paths.filter(p => /\.(tsx?|css)$/.test(p))) {
    const text = await read(path);
    assert.doesNotMatch(text, /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/i, path);
    assert.doesNotMatch(text, /style=\{|bundle\.(?:js|css)|https:\/\/fonts\./, path);
    if (/\.tsx$/.test(path)) assert.doesNotMatch(text, /[\u2013\u2014]/, path);
  }
});

test("phone routes cannot import private control code or facilitator-only tokens", async () => {
  for (const path of [...await files("app/(room)"), ...await files("components")].filter(p => /\.tsx?$/.test(p))) {
    assert.doesNotMatch(await read(path), /cwl-fac-|@\/app\/\(facilitator\)|@\/components\/facilitator|@\/lib\/server/, path);
  }
  for (const folder of ["app/(facilitator)", "app/(room)", "app/(display)", "app/(remote)"]) {
    await access(join(root, folder));
  }
});

test("every CSS custom-property reference resolves in the supplied token sources", async () => {
  const sources = await Promise.all([
    "design/clearway-base/colors_and_type.css", "design/clearway-live/live_tokens.css",
  ].map(read));
  const tokens = new Set([...sources.join("\n").matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
  for (const path of ["app/globals.css", "tailwind.config.ts"]) {
    for (const [, token] of (await read(path)).matchAll(/var\((--[\w-]+)/g)) {
      assert.ok(tokens.has(token), `${path}: ${token}`);
    }
  }
});

test("class merging follows CORE's clsx and tailwind-merge convention", () => {
  assert.equal(cn("flex p-4", false, { hidden: true }, "p-6"), "hidden p-6");
});
