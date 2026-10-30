import { readFileSync } from "node:fs";
import { join } from "node:path";

let values: Map<string, string> | undefined;
function resolve(name: string, seen = new Set<string>()): string {
  if (!values) {
    values = new Map();
    const sources = [
      readFileSync(join(process.cwd(), "design/clearway-base/colors_and_type.css"), "utf8"),
      readFileSync(join(process.cwd(), "design/clearway-live/live_tokens.css"), "utf8"),
    ];
    for (const css of sources) {
      const root = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/:root\s*\{([^}]+)\}/)?.[1] || "";
      for (const [, key, value] of root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) values.set(key, value.trim());
    }
  }
  if (seen.has(name) || !values.has(name)) throw new Error("Email style unavailable");
  seen.add(name);
  const value = values.get(name)!;
  const reference = /^var\((--[\w-]+)/.exec(value);
  return reference ? resolve(reference[1], seen) : value;
}

// Email clients need inline values rather than CSS variables or rem units.
export function emailToken(name: string): string {
  const base = parseFloat(resolve("--cwl-fs-phone-body"));
  return resolve(name).replace(/([\d.]+)rem\b/g, (_, size: string) => `${Number(size) * base}px`);
}
