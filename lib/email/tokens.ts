import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Skin } from "../brand";

const values = new Map<Skin, Map<string, string>>();
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const read = (file: string) => strip(readFileSync(join(process.cwd(), file), "utf8"));
const declarations = (body: string) => body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g);

// Clearway: the base file's :root, then the live file's :root, as it always was. Novetera: those two as the base (the type ramp, spacing and
// anything the skin leaves alone), then the Novetera file's light theme on top: every rule whose selector is the skin element itself
// (palette, type, roles), then the rules for [data-theme="light"] on the skin element. An email is read on a light page, so it takes the light values.
function load(skin: Skin) {
  const map = new Map<string, string>();
  for (const css of [read("design/clearway-base/colors_and_type.css"), read("design/clearway-live/live_tokens.css")]) {
    const root = css.match(/:root\s*\{([^}]+)\}/)?.[1] || "";
    for (const [, key, value] of declarations(root)) map.set(key, value.trim());
  }
  if (skin === "novetera") {
    const element = '[data-skin="novetera"][data-skin="novetera"][data-skin="novetera"]', light = `${element}[data-theme="light"]`;
    const rules = [...read("design/novetera-live/novetera_tokens.css").matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    for (const light_ of [false, true]) for (const [, selector, body] of rules) {
      const selectors = selector.split(",").map(s => s.trim());
      if (light_ ? !selectors.includes(light) : !selectors.includes(element)) continue;
      for (const [, key, value] of declarations(body)) map.set(key, value.trim());
    }
  }
  return map;
}
function resolve(skin: Skin, name: string, seen = new Set<string>()): string {
  if (!values.has(skin)) values.set(skin, load(skin));
  const map = values.get(skin)!;
  if (seen.has(name) || !map.has(name)) throw new Error("Email style unavailable");
  seen.add(name);
  const value = map.get(name)!;
  const reference = /^var\((--[\w-]+)/.exec(value);
  return reference ? resolve(skin, reference[1], seen) : value;
}

// Email clients need inline values rather than CSS variables or rem units.
export function emailToken(name: string, skin: Skin = "clearway"): string {
  const base = parseFloat(resolve(skin, "--cwl-fs-phone-body"));
  return resolve(skin, name).replace(/([\d.]+)rem\b/g, (_, size: string) => `${Number(size) * base}px`);
}
