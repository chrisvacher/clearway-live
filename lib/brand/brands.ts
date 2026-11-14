// One brand definition per skin. An engagement has a skin (clearway or novetera); everything the room sees and every
// address the app writes for the room follows it. Facilitator screens stay Clearway Live and stay on APP_ORIGIN.
// Safe to import from server and client code: no server-only, and env is read only through the `env` argument, which on
// the client holds nothing (NEXT_PUBLIC env is not set up), so a client component gets the default address. Pass an
// origin down from the server where a client component needs a non-default one.
export const skins = ["clearway", "novetera"] as const;
export type Skin = typeof skins[number];
export const skinOf = (value: unknown): Skin => value === "novetera" ? "novetera" : "clearway";

export type Brand = { skin: Skin; name: string; firmName: string; origin: string; host: string; label: string };
type Env = Record<string, string | undefined>;
type Definition = { name: string; firmName: string; label: string; envKey: string; fallback: string };
// Later batches add fields here (email sender, disclosure text, prompt voice, document design, mark).
const definitions: Record<Skin, Definition> = {
  clearway: { name: "Clearway Live", firmName: "Clearway", label: "Clearway", envKey: "APP_ORIGIN", fallback: "https://live.clearway.co" },
  novetera: { name: "Novetera", firmName: "Novetera", label: "Novetera", envKey: "NOVETERA_ORIGIN", fallback: "https://live.novetera.co" },
};
const processEnv = (): Env => typeof process !== "undefined" && process.env ? process.env : {};
// https, or http on localhost and 127.0.0.1 for local kits, as authConfig checks APP_ORIGIN; a bare origin only.
function validOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((url.protocol !== "https:" && !local) || url.username || url.password || url.origin !== value) return null;
    return url.origin;
  } catch { return null; }
}
const originOf = (skin: Skin, env: Env) => validOrigin(env[definitions[skin].envKey]) ?? definitions[skin].fallback;

export function brandFor(skin: Skin, env: Env = processEnv()): Brand {
  const s = skinOf(skin), d = definitions[s], origin = originOf(s, env);
  return { skin: s, name: d.name, firmName: d.firmName, origin, host: new URL(origin).host, label: d.label };
}
export const roomOrigin = (skin: Skin, env: Env = processEnv()): string => originOf(skinOf(skin), env);
// Which skin an address belongs to (a Host header or a host from a link), or null if it is neither. Clearway wins if
// both were configured to the same host.
export function skinForHost(host: string | null | undefined, env: Env = processEnv()): Skin | null {
  const given = typeof host === "string" ? host.trim().toLowerCase() : "";
  if (!given) return null;
  return skins.find(skin => brandFor(skin, env).host.toLowerCase() === given) ?? null;
}
